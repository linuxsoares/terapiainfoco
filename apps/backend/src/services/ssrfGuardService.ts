import crypto from 'crypto';
import {
  AuditAction,
  AuditResourceType,
  SsrfAttackCategory,
  SsrfDefensePolicy,
  SsrfSeverityLevel,
  WebhookConnectorType,
  type SsrfInspectionResult,
  type WebhookConnectorConfig,
  type SsrfIncident,
  type SsrfProofSeal,
  type SsrfMetrics,
  type SsrfOverview,
  type SimulateSsrfDTO,
  type ValidateWebhookUrlDTO,
  type VerifySsrfSealDTO
} from '@terapiainfoco/shared';
import {
  inspectSsrfUrl,
  createSsrfProofSeal,
  verifySsrfProofSeal
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class SsrfGuardService {
  private static instance: SsrfGuardService;

  private incidents: Map<string, SsrfIncident> = new Map();
  private proofSeals: Map<string, SsrfProofSeal> = new Map();

  private metrics: SsrfMetrics = {
    totalUrlsInspected: 8420,
    totalAttacksBlocked: 42,
    dnsRebindingAttemptsPrevented: 19,
    cloudMetadataProbesBlocked: 14,
    privateSubnetProbesBlocked: 9,
    activeConnectorsProtected: 5,
    activeDefensePolicy: SsrfDefensePolicy.STRICT_BLOCK
  };

  private connectors: WebhookConnectorConfig[] = [
    {
      id: 'CONN-EHR-01',
      name: 'EHR Telessaúde SUS & RNDS Connector',
      connectorType: WebhookConnectorType.EHR_HEALTH_CONNECTOR,
      targetUrl: 'https://ehr.telessaude.sus.gov.br/api/v1/webhook',
      pinnedIp: '189.28.128.99',
      strictHttpsOnly: true,
      allowedPorts: [443],
      defensePolicy: SsrfDefensePolicy.STRICT_BLOCK,
      status: 'ACTIVE',
      totalInvocations: 3410,
      blockedAttempts: 0,
      lastValidatedAt: new Date(Date.now() - 3600000).toISOString()
    },
    {
      id: 'CONN-TSA-01',
      name: 'ICP-Brasil Carimbo do Tempo (TSA Notary Gateway)',
      connectorType: WebhookConnectorType.TSA_TIMESTAMP_AUTHORITY,
      targetUrl: 'https://webhook.notary-icp.gov.br/api/tsa-notification',
      pinnedIp: '161.148.164.31',
      strictHttpsOnly: true,
      allowedPorts: [443],
      defensePolicy: SsrfDefensePolicy.STRICT_BLOCK,
      status: 'ACTIVE',
      totalInvocations: 1920,
      blockedAttempts: 0,
      lastValidatedAt: new Date(Date.now() - 7200000).toISOString()
    },
    {
      id: 'CONN-PAY-01',
      name: 'Gateway de Faturamento Clínico & Pagamento',
      connectorType: WebhookConnectorType.PAYMENT_GATEWAY_WEBHOOK,
      targetUrl: 'https://api.terapiainfoco.com.br/webhook/billing',
      pinnedIp: '200.189.112.5',
      strictHttpsOnly: true,
      allowedPorts: [443],
      defensePolicy: SsrfDefensePolicy.STRICT_BLOCK,
      status: 'ACTIVE',
      totalInvocations: 2150,
      blockedAttempts: 0,
      lastValidatedAt: new Date(Date.now() - 10800000).toISOString()
    },
    {
      id: 'CONN-SIEM-01',
      name: 'Forwarder SIEM Hospitalar & Telemetria WORM',
      connectorType: WebhookConnectorType.SECURITY_SIEM_FORWARDER,
      targetUrl: 'https://siem.hospitalar.care/v1/events',
      pinnedIp: '177.105.42.18',
      strictHttpsOnly: true,
      allowedPorts: [443],
      defensePolicy: SsrfDefensePolicy.STRICT_BLOCK,
      status: 'ACTIVE',
      totalInvocations: 940,
      blockedAttempts: 0,
      lastValidatedAt: new Date(Date.now() - 14400000).toISOString()
    },
    {
      id: 'CONN-MEET-01',
      name: 'Telemedicina WebRTC Signal Relay Webhook',
      connectorType: WebhookConnectorType.TELEMEDICINE_NOTIFICATION,
      targetUrl: 'https://api.terapiainfoco.com.br/telemedicina/rooms/events',
      pinnedIp: '200.189.112.5',
      strictHttpsOnly: true,
      allowedPorts: [443],
      defensePolicy: SsrfDefensePolicy.STRICT_BLOCK,
      status: 'ACTIVE',
      totalInvocations: 1840,
      blockedAttempts: 0,
      lastValidatedAt: new Date(Date.now() - 18000000).toISOString()
    }
  ];

  private constructor() {
    this.seedInitialIncidents();
  }

  public static getInstance(): SsrfGuardService {
    if (!SsrfGuardService.instance) {
      SsrfGuardService.instance = new SsrfGuardService();
    }
    return SsrfGuardService.instance;
  }

  private seedInitialIncidents(): void {
    const baselineThreats = [
      {
        url: 'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
        categories: [SsrfAttackCategory.CLOUD_METADATA_EXFILTRATION],
        severity: SsrfSeverityLevel.CRITICAL,
        details: 'Tentativa de extração de credenciais IAM da instância de nuvem interceptada na camada de saída'
      },
      {
        url: 'http://2130706433:6379/keys',
        categories: [SsrfAttackCategory.OBFUSCATED_IP_ENCODING, SsrfAttackCategory.INTERNAL_LOOPBACK_PROBING, SsrfAttackCategory.PORT_SCANNING_PROBING],
        severity: SsrfSeverityLevel.CRITICAL,
        details: 'Varredura interna de cache Redis via IP decimal ofuscado (2130706433 -> 127.0.0.1)'
      },
      {
        url: 'https://rebinding-poc.attacker.io/webhook',
        categories: [SsrfAttackCategory.DNS_REBINDING_MANIPULATION],
        severity: SsrfSeverityLevel.CRITICAL,
        details: 'Manipulação de DNS Rebinding com oscilação entre IP público e loopback local'
      }
    ];

    baselineThreats.forEach((threat, index) => {
      const incidentId = `INC-SSRF-${String(index + 1).padStart(3, '0')}`;
      const inspection = inspectSsrfUrl({ url: threat.url });
      const seal = createSsrfProofSeal(inspection, incidentId);
      this.proofSeals.set(seal.token, seal);

      const incident: SsrfIncident = {
        id: incidentId,
        timestamp: new Date(Date.now() - (index + 1) * 3600000 * 4).toISOString(),
        sourceIp: `187.65.112.${10 + index}`,
        targetUrl: threat.url,
        detectedCategories: threat.categories,
        severity: threat.severity,
        defensePolicy: SsrfDefensePolicy.STRICT_BLOCK,
        blocked: true,
        dnsRebindingAttempt: threat.categories.includes(SsrfAttackCategory.DNS_REBINDING_MANIPULATION),
        resolvedIp: inspection.resolvedIps[0] || '127.0.0.1',
        proofSealDigest: seal.canonicalDigest,
        details: threat.details
      };
      this.incidents.set(incident.id, incident);
    });
  }

  public getOverview(): SsrfOverview {
    const recentIncidents = Array.from(this.incidents.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10);

    const recentAudits = recentIncidents.map(inc => ({
      id: inc.id,
      action: inc.blocked ? 'SSRF_ATTACK_BLOCKED' : 'SSRF_ATTACK_DETECTED',
      timestamp: inc.timestamp,
      details: `${inc.details} [Alvo: ${inc.targetUrl}]`
    }));

    return {
      metrics: { ...this.metrics },
      connectors: [...this.connectors],
      recentIncidents,
      recentAudits
    };
  }

  public simulateSsrf(
    dto: SimulateSsrfDTO,
    reqMeta?: { ip: string; userAgent: string; therapistId?: string }
  ): {
    success: boolean;
    inspection: SsrfInspectionResult;
    incident?: SsrfIncident;
    proofSeal?: SsrfProofSeal;
    message: string;
  } {
    const policy = dto.defensePolicy || this.metrics.activeDefensePolicy;

    // Busca IP fixado se houver conector correspondente
    let pinnedIp: string | undefined;
    if (dto.connectorType) {
      const conn = this.connectors.find(c => c.connectorType === dto.connectorType);
      if (conn) pinnedIp = conn.pinnedIp;
    }

    const inspection = inspectSsrfUrl({
      url: dto.url,
      defensePolicy: policy,
      pinnedIp,
      forcedResolvedIp: dto.forcedResolvedIp,
      simulateDnsRebinding: dto.simulateDnsRebinding
    });

    this.metrics.totalUrlsInspected++;

    let incident: SsrfIncident | undefined;
    let seal: SsrfProofSeal | undefined;

    if (!inspection.isSafe || inspection.detectedThreats.length > 0) {
      this.metrics.totalAttacksBlocked++;
      if (inspection.dnsRebindingRisk || inspection.detectedThreats.includes(SsrfAttackCategory.DNS_REBINDING_MANIPULATION)) {
        this.metrics.dnsRebindingAttemptsPrevented++;
      }
      if (inspection.detectedThreats.includes(SsrfAttackCategory.CLOUD_METADATA_EXFILTRATION)) {
        this.metrics.cloudMetadataProbesBlocked = (this.metrics as any).cloudMetadataProbecsBlocked || 0;
        this.metrics.cloudMetadataProbesBlocked++;
      }
      if (inspection.detectedThreats.includes(SsrfAttackCategory.PRIVATE_SUBNET_RECONNAISSANCE)) {
        this.metrics.privateSubnetProbesBlocked++;
      }

      const incidentId = `INC-SSRF-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      seal = createSsrfProofSeal(inspection, incidentId);
      this.proofSeals.set(seal.token, seal);

      incident = {
        id: incidentId,
        timestamp: inspection.timestamp,
        sourceIp: reqMeta?.ip || '127.0.0.1',
        targetUrl: inspection.targetUrl,
        detectedCategories: inspection.detectedThreats,
        severity: inspection.severity,
        defensePolicy: inspection.actionTaken,
        blocked: inspection.actionTaken !== SsrfDefensePolicy.DRY_RUN_AUDIT,
        dnsRebindingAttempt: inspection.dnsRebindingRisk,
        resolvedIp: inspection.resolvedIps[0],
        proofSealDigest: seal.canonicalDigest,
        details: inspection.reason
      };

      this.incidents.set(incident.id, incident);

      AuditService.log({
        action: inspection.actionTaken === SsrfDefensePolicy.DRY_RUN_AUDIT
          ? AuditAction.SSRF_ATTACK_DETECTED
          : AuditAction.SSRF_ATTACK_BLOCKED,
        resourceType: AuditResourceType.SSRF_PROTECTION_GUARD,
        resourceId: incidentId,
        actorId: reqMeta?.therapistId,
        ipAddress: reqMeta?.ip || '127.0.0.1',
        userAgent: reqMeta?.userAgent || 'SSRF-Simulation-Agent',
        details: { message: `Ataque SSRF neutralizado: [Ameaças: ${inspection.detectedThreats.join(', ')}] [Severidade: ${inspection.severity}] [Alvo: ${dto.url}] [Digest: ${seal.canonicalDigest.substring(0, 16)}]` }
      });
    } else {
      seal = createSsrfProofSeal(inspection);
      this.proofSeals.set(seal.token, seal);

      AuditService.log({
        action: AuditAction.EXTERNAL_WEBHOOK_VALIDATED,
        resourceType: AuditResourceType.SSRF_PROTECTION_GUARD,
        resourceId: seal.token,
        actorId: reqMeta?.therapistId,
        ipAddress: reqMeta?.ip || '127.0.0.1',
        userAgent: reqMeta?.userAgent || 'SSRF-Inspection-Agent',
        details: { message: `Webhook validado com sucesso e liberado para conexão de saída: [Alvo: ${dto.url}] [IP Resolvido: ${inspection.resolvedIps.join(', ')}]` }
      });
    }

    return {
      success: true,
      inspection,
      incident,
      proofSeal: seal,
      message: inspection.isSafe
        ? 'URL validada com sucesso e autorizada para comunicação externa'
        : `Ataque SSRF bloqueado com sucesso (${inspection.reason})`
    };
  }

  public validateWebhookUrl(
    dto: ValidateWebhookUrlDTO,
    reqMeta?: { ip: string; userAgent: string; therapistId?: string }
  ): {
    success: boolean;
    inspection: SsrfInspectionResult;
    proofSeal?: SsrfProofSeal;
    message: string;
  } {
    let pinnedIp: string | undefined;
    if (dto.connectorId) {
      const conn = this.connectors.find(c => c.id === dto.connectorId);
      if (conn) {
        pinnedIp = conn.pinnedIp;
        conn.totalInvocations++;
        conn.lastValidatedAt = new Date().toISOString();
      }
    }

    const inspection = inspectSsrfUrl({
      url: dto.url,
      defensePolicy: dto.policy || this.metrics.activeDefensePolicy,
      pinnedIp
    });

    this.metrics.totalUrlsInspected++;
    const seal = createSsrfProofSeal(inspection);
    this.proofSeals.set(seal.token, seal);

    if (!inspection.isSafe) {
      this.metrics.totalAttacksBlocked++;
      if (dto.connectorId) {
        const conn = this.connectors.find(c => c.id === dto.connectorId);
        if (conn) conn.blockedAttempts++;
      }

      AuditService.log({
        action: AuditAction.SSRF_ATTACK_BLOCKED,
        resourceType: AuditResourceType.SSRF_PROTECTION_GUARD,
        resourceId: seal.token,
        actorId: reqMeta?.therapistId,
        ipAddress: reqMeta?.ip || '127.0.0.1',
        userAgent: reqMeta?.userAgent || 'Webhook-Validator',
        details: { message: `Conexão de Webhook rejeitada por política SSRF: [Alvo: ${dto.url}] [Motivo: ${inspection.reason}]` }
      });
    } else {
      AuditService.log({
        action: AuditAction.EXTERNAL_WEBHOOK_VALIDATED,
        resourceType: AuditResourceType.SSRF_PROTECTION_GUARD,
        resourceId: seal.token,
        actorId: reqMeta?.therapistId,
        ipAddress: reqMeta?.ip || '127.0.0.1',
        userAgent: reqMeta?.userAgent || 'Webhook-Validator',
        details: { message: `Webhook homologado e autorizado: [Alvo: ${dto.url}] [Host: ${inspection.parsedHost}]` }
      });
    }

    return {
      success: inspection.isSafe,
      inspection,
      proofSeal: seal,
      message: inspection.isSafe
        ? 'Webhook URL validada e aprovada contra SSRF/DNS Rebinding'
        : `Webhook URL violou políticas de segurança SSRF: ${inspection.reason}`
    };
  }

  public verifyProofSeal(dto: VerifySsrfSealDTO): {
    success: boolean;
    isValid: boolean;
    seal?: SsrfProofSeal;
    message: string;
    verifiedAt: string;
  } {
    const seal = this.proofSeals.get(dto.proofSealToken);
    const verifiedAt = new Date().toISOString();

    if (!seal) {
      return {
        success: false,
        isValid: false,
        message: 'Selo probatório SSRF não encontrado no registro local',
        verifiedAt
      };
    }

    const verification = verifySsrfProofSeal(seal);

    AuditService.log({
      actorId: 'system',
      action: AuditAction.SSRF_SEAL_VERIFIED,
      resourceType: AuditResourceType.SSRF_PROTECTION_GUARD,
      resourceId: seal.token,
      ipAddress: '127.0.0.1',
      userAgent: 'SSRF-Seal-Verifier',
      details: { message: `Verificação criptográfica de selo probatório SSRF: [Válido: ${verification.isValid}] [Alvo: ${seal.urlChecked}]` }
    });

    return {
      success: true,
      isValid: verification.isValid,
      seal,
      message: verification.isValid
        ? 'Selo probatório SSRF autêntico, íntegro e assinado com HMAC-SHA256'
        : `Falha na verificação do selo probatório: ${verification.reason}`,
      verifiedAt
    };
  }

  public getIncidents(): SsrfIncident[] {
    return Array.from(this.incidents.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }
}
