import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import {
  UebaRiskLevel,
  UebaAnomalyType,
  UebaContainmentAction,
  UebaContainmentStatus,
  type UebaAccessEvent,
  type UebaUserProfileBaseline,
  type UebaRiskAssessment,
  type UebaAnomalyIncident
} from '@terapiainfoco/shared';

const DEFAULT_UEBA_SALT = process.env.UEBA_PROOF_SALT || 'terapiainfoco-ueba-behavioral-intelligence-salt-2026';

/**
 * Função utilitária para canonicalizar objetos determinísticamente conforme RFC 8785 (JCS),
 * descartando propriedades undefined.
 */
function canonicalizeJson(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalizeJson(item)).join(',') + ']';
  }
  const keys = Object.keys(obj)
    .filter(k => obj[k] !== undefined)
    .sort();
  const entries = keys.map(k => `${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`);
  return '{' + entries.join(',') + '}';
}

/**
 * Avalia o risco preditivo de um evento de acesso clínico contra o perfil comportamental
 * e os eventos recentes (janela deslizante), detectando anomalias e exfiltração interna.
 */
export function evaluateAccessRisk(
  event: UebaAccessEvent,
  baseline: UebaUserProfileBaseline,
  recentEvents: UebaAccessEvent[] = []
): UebaRiskAssessment {
  const detectedAnomalies: Array<{
    type: UebaAnomalyType;
    description: string;
    severityScore: number;
    evidence: Record<string, any>;
  }> = [];

  // 1. Anomalia de Horário / Dia da Semana (OFF_HOURS_ACCESS)
  const isOffHours = event.hourOfDay < baseline.usualHoursStart || event.hourOfDay >= baseline.usualHoursEnd;
  const isOffDay = baseline.usualDaysOfWeek.length > 0 && !baseline.usualDaysOfWeek.includes(event.dayOfWeek);

  if (isOffHours) {
    const isExtremeMidnight = event.hourOfDay >= 0 && event.hourOfDay <= 5;
    const severity = isExtremeMidnight ? 35 : 25;
    detectedAnomalies.push({
      type: UebaAnomalyType.OFF_HOURS_ACCESS,
      description: `Acesso registrado às ${String(event.hourOfDay).padStart(2, '0')}:00h, fora da grade habitual (${baseline.usualHoursStart}:00h às ${baseline.usualHoursEnd}:00h).`,
      severityScore: severity,
      evidence: {
        hourOfDay: event.hourOfDay,
        usualHoursStart: baseline.usualHoursStart,
        usualHoursEnd: baseline.usualHoursEnd,
        isMidnight: isExtremeMidnight
      }
    });
  } else if (isOffDay) {
    detectedAnomalies.push({
      type: UebaAnomalyType.OFF_HOURS_ACCESS,
      description: `Acesso em dia não habitual de atendimento clínico (dia da semana ${event.dayOfWeek}).`,
      severityScore: 20,
      evidence: {
        dayOfWeek: event.dayOfWeek,
        usualDaysOfWeek: baseline.usualDaysOfWeek
      }
    });
  }

  // 2. Anomalia de Raspagem Massiva (BULK_RECORD_SCRAPING)
  const isSingleEventBulk = event.recordsAccessedCount >= 10 || event.actionType === 'BULK_READ';
  const recentWindowEvents = recentEvents.filter(e => {
    const diffMs = Math.abs(new Date(event.timestamp).getTime() - new Date(e.timestamp).getTime());
    return diffMs <= 10 * 60 * 1000; // janela deslizante dos últimos 10 minutos
  });

  const totalRecentRecords = recentWindowEvents.reduce((acc, curr) => acc + curr.recordsAccessedCount, 0) + event.recordsAccessedCount;
  const distinctPatients = new Set(
    [...recentWindowEvents.map(e => e.patientId || e.patientBlindIndex), event.patientId || event.patientBlindIndex]
      .filter(Boolean)
  ).size;

  if (isSingleEventBulk || totalRecentRecords > 15 || distinctPatients >= 6) {
    const bulkSeverity = totalRecentRecords > 30 || distinctPatients >= 10 ? 50 : 40;
    detectedAnomalies.push({
      type: UebaAnomalyType.BULK_RECORD_SCRAPING,
      description: `Padrão de raspagem massiva detectado: ${totalRecentRecords} prontuários consultados em 5 minutos (${distinctPatients} pacientes distintos).`,
      severityScore: bulkSeverity,
      evidence: {
        totalRecentRecords,
        distinctPatientsCount: distinctPatients,
        limitPerMinute: baseline.maxEventsPerMinuteLimit
      }
    });
  }

  // 3. Anomalia de Varredura de Notas SOAP (SOAP_MASS_READ)
  if (event.resourceType === 'SOAP_NOTE') {
    const recentSoapReads = recentWindowEvents.filter(e => e.resourceType === 'SOAP_NOTE').length + 1;
    if (recentSoapReads >= 5) {
      detectedAnomalies.push({
        type: UebaAnomalyType.SOAP_MASS_READ,
        description: `Varredura sequencial de notas clínicas confidenciais SOAP (${recentSoapReads} notas em janela curta).`,
        severityScore: 35,
        evidence: {
          recentSoapReadsCount: recentSoapReads
        }
      });
    }
  }

  // 4. Anomalia de Geolocalização / Salto de Rede (UNUSUAL_GEO_IP_JUMP)
  if (event.locationCountry && baseline.usualCountries.length > 0 && !baseline.usualCountries.includes(event.locationCountry)) {
    detectedAnomalies.push({
      type: UebaAnomalyType.UNUSUAL_GEO_IP_JUMP,
      description: `Acesso originado de país atípico (${event.locationCountry}), divergente do perfil baseline (${baseline.usualCountries.join(', ')}).`,
      severityScore: 40,
      evidence: {
        incomingCountry: event.locationCountry,
        usualCountries: baseline.usualCountries,
        ipAddress: event.ipAddress
      }
    });
  } else if (
    baseline.usualIpPrefixes.length > 0 &&
    !baseline.usualIpPrefixes.some(prefix => event.ipAddress.startsWith(prefix)) &&
    !event.ipAddress.startsWith('127.') &&
    !event.ipAddress.startsWith('192.168.') &&
    !event.ipAddress.startsWith('10.')
  ) {
    detectedAnomalies.push({
      type: UebaAnomalyType.UNUSUAL_GEO_IP_JUMP,
      description: `Acesso a partir de rede com prefixo IP não habitual (${event.ipAddress}).`,
      severityScore: 20,
      evidence: {
        ipAddress: event.ipAddress,
        usualPrefixes: baseline.usualIpPrefixes
      }
    });
  }

  // 5. Anomalia de Enumeração de Blind Index (BLIND_INDEX_ENUMERATION)
  if (event.resourceType === 'BLIND_INDEX_SEARCH' || event.actionType === 'SEARCH') {
    const recentSearches = recentWindowEvents.filter(e => e.resourceType === 'BLIND_INDEX_SEARCH' || e.actionType === 'SEARCH').length + 1;
    if (recentSearches >= 6) {
      detectedAnomalies.push({
        type: UebaAnomalyType.BLIND_INDEX_ENUMERATION,
        description: `Enumeração acelerada de Blind Indexes (${recentSearches} buscas consecutivas em 5 minutos).`,
        severityScore: 45,
        evidence: {
          recentSearchesCount: recentSearches
        }
      });
    }
  }

  // 6. Sessões Concorrentes Imediatas em Dispositivos Distintos (RAPID_CONCURRENT_SESSIONS)
  const concurrentDistinctAgents = new Set(
    [...recentWindowEvents.map(e => `${e.ipAddress}_${e.userAgent}`), `${event.ipAddress}_${event.userAgent}`]
  ).size;

  if (concurrentDistinctAgents >= 3) {
    detectedAnomalies.push({
      type: UebaAnomalyType.RAPID_CONCURRENT_SESSIONS,
      description: `Sessões ativas em ${concurrentDistinctAgents} combinações distintas de IP/Navegador simultaneamente.`,
      severityScore: 30,
      evidence: {
        concurrentDistinctAgents
      }
    });
  }

  // Cálculo da Pontuação Consolidada
  let rawScore = 0;
  if (detectedAnomalies.length === 0) {
    // Linha de base normal com variação leve
    rawScore = Math.min(20, Math.round(baseline.avgEventsPerHour / 2));
  } else {
    // Soma ponderada das anomalias
    const sumSeverities = detectedAnomalies.reduce((sum, a) => sum + a.severityScore, 0);
    // Bônus de correlação para múltiplas anomalias simultâneas (ataques combinados)
    const correlationMultiplier = detectedAnomalies.length > 1 ? 1.25 : 1.0;
    rawScore = Math.round(sumSeverities * correlationMultiplier);
  }

  const finalScore = Math.min(100, Math.max(0, rawScore));

  // Mapeamento de Severidade & Ação de Contenção Recomendada
  let riskLevel: UebaRiskLevel;
  let recommendedAction: UebaContainmentAction;

  if (finalScore >= 90) {
    riskLevel = UebaRiskLevel.CRITICAL_EXFILTRATION;
    recommendedAction = UebaContainmentAction.SUSPEND_SESSION;
  } else if (finalScore >= 75) {
    riskLevel = UebaRiskLevel.HIGH_RISK;
    recommendedAction = UebaContainmentAction.STEP_UP_2FA_CHALLENGE;
  } else if (finalScore >= 60) {
    riskLevel = UebaRiskLevel.ANOMALOUS;
    recommendedAction = UebaContainmentAction.FLAG_WORM_AUDIT;
  } else if (finalScore >= 30) {
    riskLevel = UebaRiskLevel.SUSPICIOUS;
    recommendedAction = UebaContainmentAction.NONE;
  } else {
    riskLevel = UebaRiskLevel.NORMAL;
    recommendedAction = UebaContainmentAction.NONE;
  }

  const evaluatedAt = new Date().toISOString();

  // Cálculo do Digest Canônico SHA-256 (RFC 8785)
  const assessmentPayload = {
    detectedAnomalies: detectedAnomalies.map(a => ({
      description: a.description,
      severityScore: a.severityScore,
      type: a.type
    })),
    evaluatedAt,
    recommendedAction,
    riskLevel,
    riskScore: finalScore,
    userId: event.userId
  };

  const canonicalHash = createHash('sha256')
    .update(canonicalizeJson(assessmentPayload))
    .digest('hex');

  return {
    riskScore: finalScore,
    riskLevel,
    detectedAnomalies,
    recommendedAction,
    evaluatedAt,
    canonicalHash
  };
}

/**
 * Calcula estatísticas de baseline comportamental a partir de um histórico de eventos.
 */
export function calculateBaselineStats(
  userId: string,
  events: UebaAccessEvent[],
  therapistCrp?: string
): UebaUserProfileBaseline {
  if (events.length === 0) {
    return {
      userId,
      therapistCrp,
      usualHoursStart: 8,
      usualHoursEnd: 20,
      usualDaysOfWeek: [1, 2, 3, 4, 5],
      avgEventsPerHour: 4,
      stdDevEventsPerHour: 1.5,
      maxEventsPerMinuteLimit: 12,
      usualIpPrefixes: ['189.40.', '177.18.'],
      usualCountries: ['BR'],
      totalLearnedEvents: 0,
      lastUpdatedAt: new Date().toISOString(),
      modelConfidenceScore: 50
    };
  }

  // Horários de acesso observados
  const hours = events.map(e => e.hourOfDay).sort((a, b) => a - b);
  const minHour = Math.max(6, Math.min(...hours));
  const maxHour = Math.min(22, Math.max(...hours) + 1);

  // Dias da semana observados
  const days = Array.from(new Set(events.map(e => e.dayOfWeek))).sort();

  // Países observados
  const countries = Array.from(new Set(events.map(e => e.locationCountry).filter(Boolean))) as string[];
  const finalCountries = countries.length > 0 ? countries : ['BR'];

  // Prefixos de IP (/16 aproximado)
  const ipPrefixes = Array.from(new Set(
    events.map(e => {
      const parts = e.ipAddress.split('.');
      return parts.length >= 2 ? `${parts[0]}.${parts[1]}.` : e.ipAddress;
    })
  )).filter(p => !p.startsWith('127.') && !p.startsWith('::1'));

  const avgEventsPerHour = Math.max(1, Math.round(events.length / 24));
  const stdDevEventsPerHour = Math.max(0.5, Number((avgEventsPerHour * 0.35).toFixed(2)));

  return {
    userId,
    therapistCrp,
    usualHoursStart: minHour,
    usualHoursEnd: maxHour,
    usualDaysOfWeek: days.length > 0 ? days : [1, 2, 3, 4, 5],
    avgEventsPerHour,
    stdDevEventsPerHour,
    maxEventsPerMinuteLimit: Math.max(10, avgEventsPerHour * 3),
    usualIpPrefixes: ipPrefixes.length > 0 ? ipPrefixes : ['189.40.'],
    usualCountries: finalCountries,
    totalLearnedEvents: events.length,
    lastUpdatedAt: new Date().toISOString(),
    modelConfidenceScore: Math.min(98, 60 + Math.min(38, events.length * 2))
  };
}

/**
 * Gera o selo notarial probatório do incidente de segurança UEBA
 * Formato: ueba_v1_<base64url>
 */
export function generateUebaIncidentProof(
  incident: {
    incidentId: string;
    userId: string;
    riskScore: number;
    riskLevel: UebaRiskLevel;
    timestamp: string;
    anomalies: UebaAnomalyType[];
    triggerEvent: UebaAccessEvent;
  },
  salt: string = DEFAULT_UEBA_SALT
): { canonicalHash: string; proofSeal: string } {
  const canonicalObject = {
    anomalies: [...incident.anomalies].sort(),
    eventId: incident.triggerEvent.eventId,
    incidentId: incident.incidentId,
    ipAddress: incident.triggerEvent.ipAddress,
    resourceType: incident.triggerEvent.resourceType,
    riskLevel: incident.riskLevel,
    riskScore: incident.riskScore,
    timestamp: incident.timestamp,
    userId: incident.userId
  };

  const canonicalJson = canonicalizeJson(canonicalObject);
  const canonicalHash = createHash('sha256').update(canonicalJson).digest('hex');

  const signature = createHmac('sha256', salt)
    .update(`ueba_incident:${incident.incidentId}:${canonicalHash}`)
    .digest('hex');

  const payload = {
    v: 1,
    iid: incident.incidentId,
    uid: incident.userId,
    scr: incident.riskScore,
    lvl: incident.riskLevel,
    cnh: canonicalHash,
    sig: signature,
    ts: incident.timestamp
  };

  const base64Url = Buffer.from(JSON.stringify(payload))
    .toString('base64url');

  return {
    canonicalHash,
    proofSeal: `ueba_v1_${base64Url}`
  };
}

/**
 * Validação pericial matemática do selo probatório do incidente UEBA.
 */
export function verifyUebaIncidentProof(
  incident: UebaAnomalyIncident,
  salt: string = DEFAULT_UEBA_SALT
): {
  valid: boolean;
  message: string;
  tamperingDetected: boolean;
} {
  if (!incident.proofSeal || !incident.proofSeal.startsWith('ueba_v1_')) {
    return {
      valid: false,
      message: 'Selo probatório de incidente ausente ou formato inválido.',
      tamperingDetected: true
    };
  }

  try {
    const rawBase64 = incident.proofSeal.replace('ueba_v1_', '');
    const decoded = JSON.parse(Buffer.from(rawBase64, 'base64url').toString('utf8'));

    if (decoded.v !== 1 || decoded.iid !== incident.incidentId || decoded.uid !== incident.userId) {
      return {
        valid: false,
        message: 'Metadados do selo não correspondem ao incidente inspecionado.',
        tamperingDetected: true
      };
    }

    // Recalcular Hash Canônico
    const canonicalObject = {
      anomalies: [...incident.anomalies].sort(),
      eventId: incident.triggerEvent.eventId,
      incidentId: incident.incidentId,
      ipAddress: incident.triggerEvent.ipAddress,
      resourceType: incident.triggerEvent.resourceType,
      riskLevel: incident.riskLevel,
      riskScore: incident.riskScore,
      timestamp: incident.timestamp,
      userId: incident.userId
    };

    const recomputedHash = createHash('sha256').update(canonicalizeJson(canonicalObject)).digest('hex');

    if (recomputedHash !== decoded.cnh) {
      return {
        valid: false,
        message: 'Digest canônico SHA-256 adulterado (violação de integridade anti-tampering).',
        tamperingDetected: true
      };
    }

    // Validar Assinatura HMAC
    const expectedSig = createHmac('sha256', salt)
      .update(`ueba_incident:${incident.incidentId}:${recomputedHash}`)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedSig, 'hex');
    const actualBuf = Buffer.from(decoded.sig, 'hex');

    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
      return {
        valid: false,
        message: 'Assinatura criptográfica do selo forjada ou chave de verificação inválida.',
        tamperingDetected: true
      };
    }

    return {
      valid: true,
      message: 'Selo de incidente UEBA autêntico e pericialmente íntegro.',
      tamperingDetected: false
    };
  } catch (err: any) {
    return {
      valid: false,
      message: `Erro na decodificação do selo probatório: ${err.message}`,
      tamperingDetected: true
    };
  }
}
