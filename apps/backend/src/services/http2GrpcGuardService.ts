import { randomBytes } from 'node:crypto';
import {
  AuditAction,
  AuditResourceType,
  Http2RiskSeverity,
  Http2ThreatCategory,
  Http2ValidationAction,
  Http2ProtocolTarget,
  UserRole,
} from '@terapiainfoco/shared';
import type {
  Http2GuardPolicy,
  Http2GuardMetrics,
  Http2GuardOverview,
  Http2SecurityIncident,
  Http2ProofSeal,
  InspectHttp2HeadersDTO,
  InspectHttp2HeadersResponse,
  UpdateHttp2PolicyDTO,
  UpdateHttp2PolicyResponse,
  SimulateHttp2AttackDTO,
  SimulateHttp2AttackResponse,
  VerifyHttp2SealDTO,
  VerifyHttp2SealResponse,
} from '@terapiainfoco/shared';
import {
  Http2GrpcGuardEngine,
  DEFAULT_HTTP2_POLICY,
  SAMPLE_HTTP2_ATTACKS,
  SAMPLE_BENIGN_HTTP2_SUITES,
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class Http2GrpcGuardService {
  private static instance: Http2GrpcGuardService;

  private engine: Http2GrpcGuardEngine;

  private metrics: Http2GuardMetrics = {
    totalRequestsInspected: 12580,
    cleanRequestsAllowed: 12512,
    requestsSanitized: 46,
    attacksBlocked: 22,
    smugglingAttemptsBlocked: 8,
    crlfInjectionsBlocked: 7,
    grpcTamperingBlocked: 5,
    avgInspectionDurationUs: 142.3,
    threatsByCategory: {
      [Http2ThreatCategory.H2_TE_SMUGGLING]: 8,
      [Http2ThreatCategory.CRLF_HEADER_SPLIT]: 7,
      [Http2ThreatCategory.GRPC_HEADER_TAMPERING]: 5,
      [Http2ThreatCategory.PSEUDO_HEADER_INJECTION]: 4,
      [Http2ThreatCategory.AMBIGUOUS_CONTENT_LENGTH]: 3,
      [Http2ThreatCategory.CONNECTION_SPECIFIC_HEADER]: 12,
      [Http2ThreatCategory.INVALID_CHARACTER_NAME_VALUE]: 34,
    },
    lastIncidentTimestamp: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
  };

  private recentIncidents: Http2SecurityIncident[] = [];
  private recentSeals: Http2ProofSeal[] = [];

  private constructor() {
    this.engine = new Http2GrpcGuardEngine();
    this.seedInitialIncidents();
  }

  public static getInstance(): Http2GrpcGuardService {
    if (!Http2GrpcGuardService.instance) {
      Http2GrpcGuardService.instance = new Http2GrpcGuardService();
    }
    return Http2GrpcGuardService.instance;
  }

  private seedInitialIncidents(): void {
    const attack1 = SAMPLE_HTTP2_ATTACKS[Http2ThreatCategory.H2_TE_SMUGGLING];
    const res1 = this.engine.inspectHeaders(attack1.headers, attack1.protocolTarget);

    const attack2 = SAMPLE_HTTP2_ATTACKS[Http2ThreatCategory.CRLF_HEADER_SPLIT];
    const res2 = this.engine.inspectHeaders(attack2.headers, attack2.protocolTarget);

    const attack3 = SAMPLE_HTTP2_ATTACKS[Http2ThreatCategory.GRPC_HEADER_TAMPERING];
    const res3 = this.engine.inspectHeaders(attack3.headers, attack3.protocolTarget);

    this.recentIncidents = [
      {
        id: `h2-inc-${randomBytes(4).toString('hex')}`,
        incidentId: `h2-inc-${randomBytes(4).toString('hex')}`,
        timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
        protocolTarget: attack1.protocolTarget,
        clientIp: '198.51.100.44',
        userAgent: 'Go-http-client/2.0 (Smuggler Scanner)',
        category: Http2ThreatCategory.H2_TE_SMUGGLING,
        severity: Http2RiskSeverity.CRITICAL,
        threats: res1.threats,
        blocked: true,
        remediationAction: 'RST_STREAM (PROTOCOL_ERROR) emitido. Transfer-Encoding barrado.',
        rawHeadersSnippet: attack1.headers.map((h) => `${h.name}: ${h.value}`).join(' | '),
        seal: res1.seal,
      },
      {
        id: `h2-inc-${randomBytes(4).toString('hex')}`,
        incidentId: `h2-inc-${randomBytes(4).toString('hex')}`,
        timestamp: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
        protocolTarget: attack2.protocolTarget,
        clientIp: '203.0.113.89',
        userAgent: 'curl/8.4.0 (Custom Header Fuzzer)',
        category: Http2ThreatCategory.CRLF_HEADER_SPLIT,
        severity: Http2RiskSeverity.CRITICAL,
        threats: res2.threats,
        blocked: true,
        remediationAction: 'HTTP 400 Bad Request. Injeção de CRLF neutralizada.',
        rawHeadersSnippet: attack2.headers.map((h) => `${h.name}: ${h.value}`).join(' | '),
        seal: res2.seal,
      },
      {
        id: `h2-inc-${randomBytes(4).toString('hex')}`,
        incidentId: `h2-inc-${randomBytes(4).toString('hex')}`,
        timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
        protocolTarget: attack3.protocolTarget,
        clientIp: '192.0.2.112',
        userAgent: 'grpc-node/1.9.0',
        category: Http2ThreatCategory.GRPC_HEADER_TAMPERING,
        severity: Http2RiskSeverity.HIGH,
        threats: res3.threats,
        blocked: true,
        remediationAction: 'gRPC INTERNAL Status emitido. grpc-timeout malicioso descartado.',
        rawHeadersSnippet: attack3.headers.map((h) => `${h.name}: ${h.value}`).join(' | '),
        seal: res3.seal,
      },
    ];

    if (res1.seal) this.recentSeals.push(res1.seal);
    if (res2.seal) this.recentSeals.push(res2.seal);
    if (res3.seal) this.recentSeals.push(res3.seal);
  }

  public getOverview(): Http2GuardOverview {
    return {
      metrics: { ...this.metrics },
      policy: this.engine.getPolicy(),
      recentIncidents: [...this.recentIncidents],
      recentSealsSample: [...this.recentSeals],
    };
  }

  public async inspectHeaders(
    dto: InspectHttp2HeadersDTO,
    therapistId?: string
  ): Promise<InspectHttp2HeadersResponse> {
    const protocolTarget = dto.protocolTarget || Http2ProtocolTarget.HTTP2_REST;
    const clientIp = dto.clientIp || '127.0.0.1';
    const userAgent = dto.userAgent || 'TerapiaInFoco-Edge/1.0';

    const inspection = this.engine.inspectHeaders(dto.headers, protocolTarget);

    // Atualiza métricas
    this.metrics.totalRequestsInspected++;
    if (inspection.action === Http2ValidationAction.ALLOW) {
      this.metrics.cleanRequestsAllowed++;
    } else if (inspection.action === Http2ValidationAction.SANITIZE) {
      this.metrics.requestsSanitized++;
    } else {
      this.metrics.attacksBlocked++;
      this.metrics.lastIncidentTimestamp = new Date().toISOString();
    }

    inspection.threats.forEach((t) => {
      this.metrics.threatsByCategory[t.category] = (this.metrics.threatsByCategory[t.category] || 0) + 1;
      if (t.category === Http2ThreatCategory.H2_TE_SMUGGLING) this.metrics.smugglingAttemptsBlocked++;
      if (t.category === Http2ThreatCategory.CRLF_HEADER_SPLIT) this.metrics.crlfInjectionsBlocked++;
      if (t.category === Http2ThreatCategory.GRPC_HEADER_TAMPERING) this.metrics.grpcTamperingBlocked++;
    });

    if (inspection.seal) {
      this.recentSeals.unshift(inspection.seal);
      if (this.recentSeals.length > 20) this.recentSeals.pop();
    }

    let incident: Http2SecurityIncident | undefined;

    // Se houve bloqueio ou ameaça grave, registra incidente
    if (!inspection.isValid && inspection.threats.length > 0) {
      const primaryThreat = inspection.threats[0];
      incident = {
        id: `h2-inc-${randomBytes(4).toString('hex')}`,
        incidentId: `h2-inc-${randomBytes(4).toString('hex')}`,
        timestamp: new Date().toISOString(),
        protocolTarget,
        clientIp,
        userAgent,
        category: primaryThreat.category,
        severity: primaryThreat.severity,
        threats: inspection.threats,
        blocked: inspection.action === Http2ValidationAction.BLOCK_AND_ISOLATE,
        remediationAction: inspection.action === Http2ValidationAction.BLOCK_AND_ISOLATE
          ? 'Conexão interrompida com RST_STREAM / HTTP 400.'
          : 'Cabeçalhos sanitizados em conformidade com a RFC 9113.',
        rawHeadersSnippet: dto.headers.slice(0, 5).map((h) => `${h.name}: ${h.value}`).join(' | '),
        seal: inspection.seal,
      };

      this.recentIncidents.unshift(incident);
      if (this.recentIncidents.length > 50) this.recentIncidents.pop();

      // Auditoria WORM
      const auditAction = primaryThreat.category === Http2ThreatCategory.H2_TE_SMUGGLING
        ? AuditAction.HTTP2_SMUGGLING_ATTEMPT_BLOCKED || AuditAction.HTTP2_SMUGGLING_ATTEMPT_BLOCKED
        : primaryThreat.category === Http2ThreatCategory.CRLF_HEADER_SPLIT
        ? AuditAction.HTTP2_HEADER_INJECTION_DETECTED
        : primaryThreat.category === Http2ThreatCategory.GRPC_HEADER_TAMPERING
        ? AuditAction.GRPC_METADATA_TAMPERING_BLOCKED
        : AuditAction.HTTP2_FRAME_ANALYZED;

      await AuditService.log({
        actorId: therapistId || 'system-h2-guard',
        actorRole: UserRole.PSICOLOGO_TITULAR,
        action: auditAction,
        resourceType: AuditResourceType.HTTP2_GRPC_GUARD,
        resourceId: incident.id,
        details: {
          category: primaryThreat.category,
          severity: primaryThreat.severity,
          threatCount: inspection.threats.length,
          clientIp,
          action: inspection.action,
          headersHash: inspection.headersHash,
        },
      });
    }

    return {
      success: true,
      isValid: inspection.isValid,
      action: inspection.action,
      inspection,
      incident,
      message: inspection.summary,
    };
  }

  public async updatePolicy(
    dto: UpdateHttp2PolicyDTO,
    therapistId?: string
  ): Promise<UpdateHttp2PolicyResponse> {
    this.engine.updatePolicy(dto);
    const updatedPolicy = this.engine.getPolicy();

    await AuditService.log({
      actorId: therapistId || 'admin-security',
      actorRole: UserRole.ADMIN,
      action: AuditAction.HTTP2_GUARD_POLICY_UPDATED,
      resourceType: AuditResourceType.HTTP2_GRPC_GUARD,
      resourceId: 'policy-config',
      details: {
        updatedPolicy,
        timestamp: new Date().toISOString(),
      },
    });

    return {
      success: true,
      policy: updatedPolicy,
      message: 'Política de governança HTTP/2 & gRPC atualizada com sucesso.',
    };
  }

  public async simulateAttack(
    dto: SimulateHttp2AttackDTO,
    therapistId?: string
  ): Promise<SimulateHttp2AttackResponse> {
    const attackConfig = SAMPLE_HTTP2_ATTACKS[dto.threatCategory];
    if (!attackConfig) {
      throw new Error(`Categoria de ataque HTTP/2 não suportada para simulação: ${dto.threatCategory}`);
    }

    const inspectRes = await this.inspectHeaders(
      {
        headers: attackConfig.headers,
        protocolTarget: attackConfig.protocolTarget,
        clientIp: '198.51.100.99 (Simulated Attack Vector)',
        userAgent: 'TerapiaInFoco-PenTest-Simulator/1.0',
      },
      therapistId
    );

    return {
      success: true,
      threatBlocked: inspectRes.action === Http2ValidationAction.BLOCK_AND_ISOLATE,
      attackPayloadHeaders: attackConfig.headers,
      inspection: inspectRes.inspection,
      incident: inspectRes.incident,
      message: `Ataque adversarial '${attackConfig.name}' simulado. Ação aplicada: ${inspectRes.action}.`,
    };
  }

  public async verifySeal(
    dto: VerifyHttp2SealDTO,
    therapistId?: string
  ): Promise<VerifyHttp2SealResponse> {
    let sealToVerify: Http2ProofSeal;

    if (typeof dto.sealToken === 'string') {
      const trimmed = dto.sealToken.trim();
      if (trimmed.startsWith('{')) {
        sealToVerify = JSON.parse(trimmed) as Http2ProofSeal;
      } else {
        const found = this.recentSeals.find((s) => s.sealToken === trimmed);
        if (!found) {
          return {
            success: true,
            isValid: false,
            message: `Selo com token '${trimmed}' não encontrado no registro forense em memória.`,
            verifiedAt: new Date().toISOString(),
          };
        }
        sealToVerify = found;
      }
    } else {
      sealToVerify = dto.sealToken;
    }

    const verification = this.engine.verifySeal(sealToVerify);

    await AuditService.log({
      actorId: therapistId || 'auditor-notary',
      actorRole: UserRole.PSICOLOGO_TITULAR,
      action: AuditAction.HTTP2_DESYNC_SEAL_VERIFIED,
      resourceType: AuditResourceType.HTTP2_GRPC_GUARD,
      resourceId: sealToVerify.sealToken,
      details: {
        isValid: verification.isValid,
        protocolTarget: sealToVerify.protocolTarget,
        headersHash: sealToVerify.headersHash,
        verifiedAt: verification.verifiedAt,
      },
    });

    return {
      success: true,
      isValid: verification.isValid,
      seal: verification.seal,
      message: verification.message,
      verifiedAt: verification.verifiedAt,
    };
  }
}
