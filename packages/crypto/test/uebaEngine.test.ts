import { describe, it, expect } from 'bun:test';
import {
  evaluateAccessRisk,
  calculateBaselineStats,
  generateUebaIncidentProof,
  verifyUebaIncidentProof
} from '../src/uebaEngine';
import {
  UebaRiskLevel,
  UebaAnomalyType,
  UebaContainmentAction,
  UebaContainmentStatus,
  type UebaAccessEvent,
  type UebaUserProfileBaseline,
  type UebaAnomalyIncident
} from '@terapiainfoco/shared';

describe('UEBA Engine — Análise Comportamental Preditiva e Detecção de Acesso Anômalo (RFC-001 §4.4 & LGPD Art. 46)', () => {
  const mockBaseline: UebaUserProfileBaseline = {
    userId: 'therapist-uuid-1',
    therapistCrp: '06/123456',
    usualHoursStart: 8,
    usualHoursEnd: 19,
    usualDaysOfWeek: [1, 2, 3, 4, 5], // Seg a Sex
    avgEventsPerHour: 4,
    stdDevEventsPerHour: 1.2,
    maxEventsPerMinuteLimit: 10,
    usualIpPrefixes: ['189.40.', '177.18.'],
    usualCountries: ['BR'],
    totalLearnedEvents: 150,
    lastUpdatedAt: '2026-10-14T10:00:00.000Z',
    modelConfidenceScore: 92
  };

  const createEvent = (overrides: Partial<UebaAccessEvent> = {}): UebaAccessEvent => ({
    eventId: `evt-${Math.random().toString(36).substring(7)}`,
    userId: 'therapist-uuid-1',
    therapistCrp: '06/123456',
    userRole: 'PSICOLOGO_TITULAR',
    patientId: 'patient-demo-1',
    patientBlindIndex: 'pbi-sha256-abc-123',
    resourceType: 'CLINICAL_RECORD',
    actionType: 'READ',
    ipAddress: '189.40.12.45',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    locationCountry: 'BR',
    timestamp: '2026-10-14T14:30:00.000Z',
    hourOfDay: 14,
    dayOfWeek: 3, // Quarta-feira
    recordsAccessedCount: 1,
    ...overrides
  });

  it('deve classificar acesso rotineiro e habitual como NORMAL com baixo score de risco', () => {
    const event = createEvent();
    const assessment = evaluateAccessRisk(event, mockBaseline, []);

    expect(assessment.riskScore).toBeLessThan(30);
    expect(assessment.riskLevel).toBe(UebaRiskLevel.NORMAL);
    expect(assessment.detectedAnomalies.length).toBe(0);
    expect(assessment.recommendedAction).toBe(UebaContainmentAction.NONE);
    expect(assessment.canonicalHash).toBeDefined();
    expect(assessment.canonicalHash.length).toBe(64);
  });

  it('deve detectar anomalia de acesso fora de horário (OFF_HOURS_ACCESS) na madrugada', () => {
    const event = createEvent({
      hourOfDay: 3, // 03:00 da madrugada
      timestamp: '2026-10-14T03:15:00.000Z'
    });

    const assessment = evaluateAccessRisk(event, mockBaseline, []);

    expect(assessment.detectedAnomalies.some(a => a.type === UebaAnomalyType.OFF_HOURS_ACCESS)).toBe(true);
    expect(assessment.riskScore).toBeGreaterThanOrEqual(30);
    expect(assessment.riskLevel).not.toBe(UebaRiskLevel.NORMAL);
  });

  it('deve detectar padrão de raspagem massiva (BULK_RECORD_SCRAPING) em evento único e janela recente', () => {
    // 1. Evento único massivo
    const bulkEvent = createEvent({
      recordsAccessedCount: 15,
      actionType: 'BULK_READ'
    });

    const singleAssessment = evaluateAccessRisk(bulkEvent, mockBaseline, []);
    expect(singleAssessment.detectedAnomalies.some(a => a.type === UebaAnomalyType.BULK_RECORD_SCRAPING)).toBe(true);
    expect(singleAssessment.riskScore).toBeGreaterThanOrEqual(40);

    // 2. Janela recente com múltiplos pacientes
    const recentEvents = [
      createEvent({ patientId: 'p1', timestamp: '2026-10-14T14:26:00.000Z' }),
      createEvent({ patientId: 'p2', timestamp: '2026-10-14T14:27:00.000Z' }),
      createEvent({ patientId: 'p3', timestamp: '2026-10-14T14:28:00.000Z' }),
      createEvent({ patientId: 'p4', timestamp: '2026-10-14T14:28:30.000Z' }),
      createEvent({ patientId: 'p5', timestamp: '2026-10-14T14:29:00.000Z' }),
      createEvent({ patientId: 'p6', timestamp: '2026-10-14T14:29:30.000Z' }),
      createEvent({ patientId: 'p7', timestamp: '2026-10-14T14:29:45.000Z' })
    ];

    const currentEvent = createEvent({ patientId: 'p8', timestamp: '2026-10-14T14:30:00.000Z' });
    const windowAssessment = evaluateAccessRisk(currentEvent, mockBaseline, recentEvents);

    expect(windowAssessment.detectedAnomalies.some(a => a.type === UebaAnomalyType.BULK_RECORD_SCRAPING)).toBe(true);
  });

  it('deve detectar varredura consecutiva de notas confidenciais SOAP (SOAP_MASS_READ)', () => {
    const recentSoaps = Array.from({ length: 5 }, (_, i) =>
      createEvent({
        resourceType: 'SOAP_NOTE',
        timestamp: `2026-10-14T14:2${5 + i}:00.000Z`
      })
    );

    const currentSoapEvent = createEvent({
      resourceType: 'SOAP_NOTE',
      timestamp: '2026-10-14T14:29:30.000Z'
    });

    const assessment = evaluateAccessRisk(currentSoapEvent, mockBaseline, recentSoaps);
    expect(assessment.detectedAnomalies.some(a => a.type === UebaAnomalyType.SOAP_MASS_READ)).toBe(true);
  });

  it('deve detectar salto geográfico atípico (UNUSUAL_GEO_IP_JUMP)', () => {
    const foreignEvent = createEvent({
      locationCountry: 'NL', // Holanda / VPN não habitual
      ipAddress: '185.220.101.5' // Nó Tor ou Proxy externo
    });

    const assessment = evaluateAccessRisk(foreignEvent, mockBaseline, []);
    expect(assessment.detectedAnomalies.some(a => a.type === UebaAnomalyType.UNUSUAL_GEO_IP_JUMP)).toBe(true);
  });

  it('deve detectar enumeração acelerada de Blind Index (BLIND_INDEX_ENUMERATION)', () => {
    const searches = Array.from({ length: 6 }, (_, i) =>
      createEvent({
        resourceType: 'BLIND_INDEX_SEARCH',
        actionType: 'SEARCH',
        timestamp: `2026-10-14T14:2${4 + i}:00.000Z`
      })
    );

    const currentSearch = createEvent({
      resourceType: 'BLIND_INDEX_SEARCH',
      actionType: 'SEARCH',
      timestamp: '2026-10-14T14:29:30.000Z'
    });

    const assessment = evaluateAccessRisk(currentSearch, mockBaseline, searches);
    expect(assessment.detectedAnomalies.some(a => a.type === UebaAnomalyType.BLIND_INDEX_ENUMERATION)).toBe(true);
  });

  it('deve elevar para CRITICAL_EXFILTRATION e recomendar SUSPEND_SESSION em ataque correlacionado de exfiltração', () => {
    // Madrugada + Raspagem em massa + Origem Internacional
    const attackEvent = createEvent({
      hourOfDay: 2, // Madrugada 02:00
      timestamp: '2026-10-14T02:30:00.000Z',
      recordsAccessedCount: 25,
      actionType: 'BULK_READ',
      locationCountry: 'RU',
      ipAddress: '95.173.136.2'
    });

    const assessment = evaluateAccessRisk(attackEvent, mockBaseline, []);

    expect(assessment.riskScore).toBeGreaterThanOrEqual(90);
    expect(assessment.riskLevel).toBe(UebaRiskLevel.CRITICAL_EXFILTRATION);
    expect(assessment.recommendedAction).toBe(UebaContainmentAction.SUSPEND_SESSION);
    expect(assessment.detectedAnomalies.length).toBeGreaterThanOrEqual(3);
  });

  it('deve calcular estatísticas de baseline comportamental corretamente a partir de eventos históricos', () => {
    const historicalEvents: UebaAccessEvent[] = [
      createEvent({ hourOfDay: 9, dayOfWeek: 1, ipAddress: '189.40.1.1', locationCountry: 'BR' }),
      createEvent({ hourOfDay: 11, dayOfWeek: 2, ipAddress: '189.40.1.2', locationCountry: 'BR' }),
      createEvent({ hourOfDay: 14, dayOfWeek: 3, ipAddress: '177.18.5.1', locationCountry: 'BR' }),
      createEvent({ hourOfDay: 17, dayOfWeek: 4, ipAddress: '189.40.2.1', locationCountry: 'BR' }),
      createEvent({ hourOfDay: 18, dayOfWeek: 5, ipAddress: '177.18.5.2', locationCountry: 'BR' })
    ];

    const baseline = calculateBaselineStats('therapist-uuid-1', historicalEvents, '06/123456');

    expect(baseline.userId).toBe('therapist-uuid-1');
    expect(baseline.therapistCrp).toBe('06/123456');
    expect(baseline.usualHoursStart).toBe(9);
    expect(baseline.usualHoursEnd).toBe(19);
    expect(baseline.usualDaysOfWeek).toEqual([1, 2, 3, 4, 5]);
    expect(baseline.usualCountries).toEqual(['BR']);
    expect(baseline.totalLearnedEvents).toBe(5);
  });

  it('deve gerar selo probatório do incidente e verificar sua autenticidade matemática', () => {
    const triggerEvent = createEvent({
      hourOfDay: 2,
      recordsAccessedCount: 20
    });

    const incidentData = {
      incidentId: 'inc-ueba-2026-test-1',
      userId: 'therapist-uuid-1',
      riskScore: 95,
      riskLevel: UebaRiskLevel.CRITICAL_EXFILTRATION,
      timestamp: '2026-10-14T17:00:00.000Z',
      anomalies: [UebaAnomalyType.OFF_HOURS_ACCESS, UebaAnomalyType.BULK_RECORD_SCRAPING],
      triggerEvent
    };

    const { canonicalHash, proofSeal } = generateUebaIncidentProof(incidentData);

    expect(proofSeal).toBeDefined();
    expect(proofSeal.startsWith('ueba_v1_')).toBe(true);
    expect(canonicalHash.length).toBe(64);

    const fullIncident: UebaAnomalyIncident = {
      ...incidentData,
      therapistCrp: '06/123456',
      anomalyDetails: [
        { type: UebaAnomalyType.OFF_HOURS_ACCESS, description: 'Horário atípico', severityScore: 35 },
        { type: UebaAnomalyType.BULK_RECORD_SCRAPING, description: 'Raspagem em massa', severityScore: 50 }
      ],
      containmentAction: UebaContainmentAction.SUSPEND_SESSION,
      containmentStatus: UebaContainmentStatus.ACTIVE_CONTAINMENT,
      proofSeal
    };

    const verification = verifyUebaIncidentProof(fullIncident);
    expect(verification.valid).toBe(true);
    expect(verification.tamperingDetected).toBe(false);
  });

  it('deve acusar violação de integridade caso o incidente tenha seus dados adulterados retroativamente', () => {
    const triggerEvent = createEvent();
    const incidentData = {
      incidentId: 'inc-tamper-test',
      userId: 'therapist-uuid-1',
      riskScore: 85,
      riskLevel: UebaRiskLevel.HIGH_RISK,
      timestamp: '2026-10-14T17:00:00.000Z',
      anomalies: [UebaAnomalyType.OFF_HOURS_ACCESS],
      triggerEvent
    };

    const { proofSeal } = generateUebaIncidentProof(incidentData);

    // Incidente adulterado (ex: atacante tenta diminuir o score de risco retroativamente)
    const tamperedIncident: UebaAnomalyIncident = {
      ...incidentData,
      riskScore: 20, // adulterado de 85 para 20
      riskLevel: UebaRiskLevel.NORMAL,
      anomalyDetails: [],
      containmentAction: UebaContainmentAction.NONE,
      containmentStatus: UebaContainmentStatus.RELEASED,
      proofSeal
    };

    const verification = verifyUebaIncidentProof(tamperedIncident);
    expect(verification.valid).toBe(false);
    expect(verification.tamperingDetected).toBe(true);
  });
});
