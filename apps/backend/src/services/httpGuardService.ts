import crypto from 'crypto';
import {
  AuditAction,
  AuditResourceType,
  HppAttackCategory,
  HppDefensePolicy,
  HppSeverityLevel,
  type HttpGuardIncident,
  type HttpGuardMetrics,
  type HttpGuardOverview,
  type HttpGuardProofSeal,
  type SimulateHppAttackDTO,
  type SimulateHppAttackResponse,
  type SimulateHeaderInjectionDTO,
  type SimulateHeaderInjectionResponse,
  type VerifyHttpGuardSealDTO,
  type VerifyHttpGuardSealResponse
} from '@terapiainfoco/shared';
import {
  detectHttpParameterPollution,
  detectHeaderInjection,
  createHttpGuardProofSeal,
  verifyHttpGuardProofSeal
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class HttpGuardService {
  private static instance: HttpGuardService;

  private incidents: Map<string, HttpGuardIncident> = new Map();
  private proofSeals: Map<string, HttpGuardProofSeal> = new Map();

  private metrics: HttpGuardMetrics = {
    totalInspectedRequests: 14250,
    hppPollutionsBlocked: 48,
    crlfInjectionsNeutralized: 31,
    criticalEndpointsProtected: 9,
    validProofSealsIssued: 79,
    activeDefensePolicy: HppDefensePolicy.REJECT_REQUEST,
    lastIncidentTimestamp: undefined
  };

  private protectedEndpoints = [
    {
      path: '/api/clinical-records/sign',
      methods: ['POST'],
      strictHpp: true,
      preventCrlf: true,
      description: 'Assinatura compulsória de prontuário eletrônico imutável (CFP nº 001/2009)'
    },
    {
      path: '/api/clinical-records/draft',
      methods: ['POST', 'PUT'],
      strictHpp: true,
      preventCrlf: true,
      description: 'Evolução clínica SOAP confidencial com segregação de notas privadas (§3.4)'
    },
    {
      path: '/api/documents/sign',
      methods: ['POST'],
      strictHpp: true,
      preventCrlf: true,
      description: 'Assinatura digital qualificada de laudos e pareceres psicológicos (CFP nº 006/2019)'
    },
    {
      path: '/api/patients',
      methods: ['POST', 'GET'],
      strictHpp: true,
      preventCrlf: true,
      description: 'Cadastro e consulta por Blind Index HMAC de pacientes sensíveis (LGPD Art. 11)'
    },
    {
      path: '/api/patients/:id/quarantine',
      methods: ['POST'],
      strictHpp: true,
      preventCrlf: true,
      description: 'Quarentena criptográfica e anonimização ativa pós-atendimento'
    },
    {
      path: '/api/auth/login',
      methods: ['POST'],
      strictHpp: true,
      preventCrlf: true,
      description: 'Autenticação primária de psicólogos com proteção contra credenciais poluídas'
    },
    {
      path: '/api/auth/2fa/verify',
      methods: ['POST'],
      strictHpp: true,
      preventCrlf: true,
      description: 'Validação de segundo fator TOTP RFC 6238'
    },
    {
      path: '/api/portability/export',
      methods: ['POST'],
      strictHpp: true,
      preventCrlf: true,
      description: 'Exportação cifrada e portabilidade legal de prontuários (LGPD Art. 18)'
    },
    {
      path: '/api/tsa-notary/stamp-session',
      methods: ['POST'],
      strictHpp: true,
      preventCrlf: true,
      description: 'Carimbo do tempo notarial RFC 3161 ICP-Brasil em teleconsultas'
    }
  ];

  private constructor() {
    this.seedDemoData();
  }

  public static getInstance(): HttpGuardService {
    if (!HttpGuardService.instance) {
      HttpGuardService.instance = new HttpGuardService();
    }
    return HttpGuardService.instance;
  }

  /**
   * Sementes de incidentes já neutralizados para compor o painel histórico
   */
  private seedDemoData(): void {
    const demoIncidents: Array<Omit<HttpGuardIncident, 'proofSealToken'> & { proofSealToken?: string }> = [
      {
        id: 'inc-hpp-001',
        timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
        clientIp: '187.65.112.44',
        userAgent: 'python-requests/2.31.0 Scanner',
        targetEndpoint: '/api/clinical-records/sign',
        httpMethod: 'POST',
        category: HppAttackCategory.HTTP_PARAMETER_POLLUTION,
        severity: HppSeverityLevel.CRITICAL,
        actionTaken: HppDefensePolicy.REJECT_REQUEST,
        details: "Tentativa de poluição de parâmetro 'patientId' repetido 3 vezes (?patientId=123&patientId=456&patientId=789) para bypass de RBAC.",
        isBlocked: true
      },
      {
        id: 'inc-crlf-002',
        timestamp: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
        clientIp: '201.88.42.19',
        userAgent: 'Mozilla/5.0 (compatible; Nikto/2.5.0)',
        targetEndpoint: '/api/documents/sign',
        httpMethod: 'POST',
        category: HppAttackCategory.COOKIE_POISONING,
        severity: HppSeverityLevel.CRITICAL,
        actionTaken: HppDefensePolicy.REJECT_REQUEST,
        details: "Injeção CRLF detectada em 'Location' com tentativa de fixar cookie não-autorizado (Set-Cookie: session_hijack=...).",
        isBlocked: true
      },
      {
        id: 'inc-crlf-003',
        timestamp: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
        clientIp: '177.105.77.3',
        userAgent: 'curl/8.4.0 AttackEngine',
        targetEndpoint: '/api/portability/export',
        httpMethod: 'POST',
        category: HppAttackCategory.HTTP_RESPONSE_SPLITTING,
        severity: HppSeverityLevel.CRITICAL,
        actionTaken: HppDefensePolicy.REJECT_REQUEST,
        details: 'HTTP Response Splitting neutralizado: tentativa de quebrar cabeçalhos com sequência dupla CRLF e injeção de HTML fake.',
        isBlocked: true
      }
    ];

    for (const inc of demoIncidents) {
      const seal = createHttpGuardProofSeal({
        incidentId: inc.id,
        timestamp: inc.timestamp,
        targetEndpoint: inc.targetEndpoint,
        category: inc.category,
        details: inc.details,
        clientIp: inc.clientIp
      });

      this.proofSeals.set(seal.token, seal);
      this.incidents.set(inc.id, {
        ...inc,
        proofSealToken: seal.token
      });
      this.metrics.lastIncidentTimestamp = inc.timestamp;
    }
  }

  /**
   * Retorna visão geral consolidada e métricas operacionais
   */
  public getOverview(): HttpGuardOverview {
    const recentIncidents = Array.from(this.incidents.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 20);

    return {
      metrics: { ...this.metrics },
      recentIncidents,
      protectedEndpoints: this.protectedEndpoints
    };
  }

  /**
   * Simula um ataque de HTTP Parameter Pollution (HPP) para auditoria e testes de invasão
   */
  public simulateHppAttack(
    dto: SimulateHppAttackDTO,
    actorId: string = 'system_auditor'
  ): SimulateHppAttackResponse {
    this.metrics.totalInspectedRequests += 1;

    const inspection = detectHttpParameterPollution(dto.queryString);
    const policy = dto.defensePolicy || this.metrics.activeDefensePolicy;

    let blocked = false;
    let incident: HttpGuardIncident | undefined;

    if (inspection.isPolluted) {
      const incidentId = `inc-hpp-${crypto.randomBytes(4).toString('hex')}`;
      const timestamp = new Date().toISOString();
      const clientIp = dto.clientIp || '189.40.12.88';
      const targetEndpoint = dto.endpoint || '/api/clinical-records/sign';
      const httpMethod = dto.method || 'POST';

      const details = inspection.violations
        .map((v) => `Parâmetro '${v.parameterName}' poluído com ${v.count} valores: [${v.values.join(', ')}]`)
        .join('; ');

      const seal = createHttpGuardProofSeal({
        incidentId,
        timestamp,
        targetEndpoint,
        category: HppAttackCategory.HTTP_PARAMETER_POLLUTION,
        details,
        clientIp
      });

      blocked = policy === HppDefensePolicy.REJECT_REQUEST;

      incident = {
        id: incidentId,
        timestamp,
        clientIp,
        userAgent: 'Simulated-HPP-Pentest-Engine/2026',
        targetEndpoint,
        httpMethod,
        category: HppAttackCategory.HTTP_PARAMETER_POLLUTION,
        severity: inspection.severity,
        actionTaken: policy,
        details,
        proofSealToken: seal.token,
        isBlocked: blocked
      };

      this.incidents.set(incidentId, incident);
      this.proofSeals.set(seal.token, seal);
      this.metrics.hppPollutionsBlocked += 1;
      this.metrics.validProofSealsIssued += 1;
      this.metrics.lastIncidentTimestamp = timestamp;

      // Registro WORM
      AuditService.log({
        action: blocked ? AuditAction.HPP_POLLUTION_BLOCKED : AuditAction.HPP_POLLUTION_DETECTED,
        resourceType: AuditResourceType.HTTP_SECURITY_GUARD,
        resourceId: incidentId,
        actorId,
        ipAddress: clientIp,
        userAgent: 'TerapiaInFoco-HPP-Guard/1.0'
      });
    }

    return {
      success: true,
      blocked,
      incident,
      inspectionResult: inspection,
      message: inspection.isPolluted
        ? `Ataque HPP detectado e contido com sucesso pela política ${policy}.`
        : 'Nenhuma poluição de parâmetros foi detectada na query string analisada.'
    };
  }

  /**
   * Simula um ataque de CRLF / Injeção de Cabeçalho HTTP para auditoria e testes de invasão
   */
  public simulateHeaderInjection(
    dto: SimulateHeaderInjectionDTO,
    actorId: string = 'system_auditor'
  ): SimulateHeaderInjectionResponse {
    this.metrics.totalInspectedRequests += 1;

    const headersRecord: Record<string, string> = {
      [dto.headerName]: dto.headerValue
    };

    const inspection = detectHeaderInjection(headersRecord);
    let blocked = false;
    let incident: HttpGuardIncident | undefined;

    if (inspection.hasInjection) {
      const incidentId = `inc-crlf-${crypto.randomBytes(4).toString('hex')}`;
      const timestamp = new Date().toISOString();
      const clientIp = dto.clientIp || '189.40.12.88';
      const targetEndpoint = dto.endpoint || '/api/documents/sign';
      const httpMethod = dto.method || 'POST';

      const firstViolation = inspection.violations[0];
      const category = firstViolation.injectionType || HppAttackCategory.CRLF_HEADER_INJECTION;

      const details = `Injeção maliciosa no cabeçalho '${firstViolation.headerName}': ${firstViolation.remediation}`;

      const seal = createHttpGuardProofSeal({
        incidentId,
        timestamp,
        targetEndpoint,
        category,
        details,
        clientIp
      });

      blocked = true;

      incident = {
        id: incidentId,
        timestamp,
        clientIp,
        userAgent: 'Simulated-CRLF-Pentest-Engine/2026',
        targetEndpoint,
        httpMethod,
        category,
        severity: inspection.severity,
        actionTaken: HppDefensePolicy.REJECT_REQUEST,
        details,
        proofSealToken: seal.token,
        isBlocked: true
      };

      this.incidents.set(incidentId, incident);
      this.proofSeals.set(seal.token, seal);
      this.metrics.crlfInjectionsNeutralized += 1;
      this.metrics.validProofSealsIssued += 1;
      this.metrics.lastIncidentTimestamp = timestamp;

      // Registro WORM
      AuditService.log({
        action: AuditAction.HEADER_INJECTION_BLOCKED,
        resourceType: AuditResourceType.HTTP_SECURITY_GUARD,
        resourceId: incidentId,
        actorId,
        ipAddress: clientIp,
        userAgent: 'TerapiaInFoco-Header-Guard/1.0'
      });
    }

    return {
      success: true,
      blocked,
      incident,
      inspectionResult: inspection,
      message: inspection.hasInjection
        ? `Injeção de cabeçalho CRLF (${inspection.violations[0]?.injectionType}) detectada e neutralizada.`
        : 'Nenhuma injeção de caracteres de controle CRLF foi encontrada no cabeçalho.'
    };
  }

  /**
   * Valida a integridade matemática e fé pública de um selo probatório
   */
  public verifyProofSeal(
    dto: VerifyHttpGuardSealDTO,
    actorId: string = 'system_auditor'
  ): VerifyHttpGuardSealResponse {
    const seal = this.proofSeals.get(dto.proofSealToken);

    if (!seal) {
      return {
        success: false,
        isValid: false,
        message: 'Selo probatório não encontrado ou token inválido.',
        verifiedAt: new Date().toISOString()
      };
    }

    const incident = this.incidents.get(seal.incidentId);

    const isValid = verifyHttpGuardProofSeal(
      seal,
      incident
        ? {
            incidentId: incident.id,
            timestamp: incident.timestamp,
            targetEndpoint: incident.targetEndpoint,
            category: incident.category,
            details: incident.details,
            clientIp: incident.clientIp
          }
        : undefined
    );

    if (isValid) {
      AuditService.log({
        action: AuditAction.HTTP_GUARD_SEAL_VERIFIED,
        resourceType: AuditResourceType.HTTP_SECURITY_GUARD,
        resourceId: seal.incidentId,
        actorId,
        ipAddress: '127.0.0.1',
        userAgent: 'TerapiaInFoco-Seal-Verifier/1.0'
      });
    }

    return {
      success: true,
      isValid,
      seal,
      incident,
      message: isValid
        ? 'Selo probatório WORM autêntico, íntegro e validado com sucesso pela chave criptográfica da aplicação.'
        : 'Assinatura HMAC ou digest canônico corrompidos. O selo foi adulterado ou forjado.',
      verifiedAt: new Date().toISOString()
    };
  }

  /**
   * Retorna lista de incidentes com paginação
   */
  public getIncidents(): HttpGuardIncident[] {
    return Array.from(this.incidents.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }
}
