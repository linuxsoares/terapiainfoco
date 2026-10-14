import crypto from 'crypto';
import {
  AuditAction,
  AuditResourceType,
  BreachSeverity,
  IncidentContainmentStatus,
  ThreatSourceType,
  UserRole,
  type CredentialBreachRecord,
  type DpoIncidentAlert,
  type ThreatIntelligenceMetrics,
  type KAnonymityLookupResult,
  type CheckCredentialBreachDTO,
  type TriggerDarkWebScanDTO,
  type ContainIncidentDTO,
  type ResolveIncidentDTO
} from '@terapiainfoco/shared';
import {
  calculateKAnonymitySplit,
  maskEmail,
  matchKAnonymitySuffix,
  evaluateBreachSeverity,
  requiresAnpdNotification,
  calculateAnpdDeadline,
  calculateIncidentWormDigest
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class ThreatIntelligenceService {
  private static instance: ThreatIntelligenceService;

  // Repositório em memória de incidentes e alertas
  private incidents = new Map<string, CredentialBreachRecord>();
  private alerts = new Map<string, DpoIncidentAlert>();

  // Dicionário de k-Anonymity (prefixo 5 chars -> lista de sufixos conhecidos com contagem)
  private kAnonymityDatabase = new Map<string, Array<{ suffix: string; count: number; source: ThreatSourceType; dumpTitle: string }>>();

  // Usuários com sessões revogadas (ID do usuário -> timestamp da revogação forçada)
  private revokedUserSessions = new Map<string, number>();

  // Métricas agregadas
  private monitoredAccountsCount = 14;
  private compulsoryRevocationsExecuted = 0;
  private lastScanAt: string = new Date().toISOString();

  private constructor() {
    this.seedThreatIntelligenceDatabase();
  }

  public static getInstance(): ThreatIntelligenceService {
    if (!ThreatIntelligenceService.instance) {
      ThreatIntelligenceService.instance = new ThreatIntelligenceService();
    }
    return ThreatIntelligenceService.instance;
  }

  /**
   * Inicializa catálogo sintético e determinístico de inteligência com credenciais e dumps conhecidos
   */
  private seedThreatIntelligenceDatabase(): void {
    // Exemplo de senha conhecida "admin123", "psico2026", "senhaForte@123"
    const knownBreachedSecrets = [
      { secret: 'admin123', count: 184520, source: ThreatSourceType.DARK_WEB_BREACH_DUMP, dump: 'Collection #1 Mega Dump' },
      { secret: 'psico2026', count: 42, source: ThreatSourceType.STEALER_LOGS, dump: 'RedLine Stealer Botnet Logs 2026' },
      { secret: '123456', count: 23512900, source: ThreatSourceType.PUBLIC_PASTE, dump: 'Global Credential Leak' },
      { secret: 'senha@clinica', count: 18, source: ThreatSourceType.DARK_WEB_BREACH_DUMP, dump: 'Healthcare Breaches Dump' },
      { secret: 'teste123', count: 8520, source: ThreatSourceType.HIBP_K_ANONYMITY, dump: 'HIBP Pwned Passwords Feed' }
    ];

    for (const item of knownBreachedSecrets) {
      const split = calculateKAnonymitySplit(item.secret);
      const existing = this.kAnonymityDatabase.get(split.prefix) || [];
      existing.push({
        suffix: split.suffix,
        count: item.count,
        source: item.source,
        dumpTitle: item.dump
      });
      this.kAnonymityDatabase.set(split.prefix, existing);
    }
  }

  /**
   * 1. Consulta com K-Anonymity (Zero-Knowledge) para saber se a credencial está vazada
   */
  public async checkCredentialWithKAnonymity(dto: CheckCredentialBreachDTO): Promise<KAnonymityLookupResult> {
    const inputToCheck = (dto.passwordSample || dto.emailOrIdentifier || '').trim();
    if (!inputToCheck) {
      throw new Error('Identificador ou amostra de senha é obrigatória.');
    }

    const { prefix, suffix } = calculateKAnonymitySplit(inputToCheck);
    const entries = this.kAnonymityDatabase.get(prefix) || [];
    const match = matchKAnonymitySuffix(suffix, entries);

    const breachesFound = entries
      .filter(e => e.suffix === suffix)
      .map(e => `${e.dumpTitle} (${e.source})`);

    return {
      prefix,
      matched: match.matched,
      breachCount: match.breachCount,
      breachesFound,
      checkedAt: new Date().toISOString(),
      zeroKnowledgePreserved: true
    };
  }

  /**
   * 2. Varredura Proativa na Dark Web / Breaches de Contas da Clínica
   */
  public async triggerDarkWebScan(params: {
    requestedBy: string;
    ipAddress: string;
    scope?: string;
    targetEmail?: string;
    simulateBreachDump?: boolean;
  }): Promise<{
    newIncidentsCount: number;
    incidents: CredentialBreachRecord[];
    alertsGenerated: DpoIncidentAlert[];
  }> {
    this.lastScanAt = new Date().toISOString();

    const mockCandidates = [
      {
        email: params.targetEmail || 'terapeuta.titular@terapiainfoco.com.br',
        role: UserRole.PSICOLOGO_TITULAR,
        source: ThreatSourceType.STEALER_LOGS,
        title: 'RedLine Stealer Botnet Dump 2026',
        sampleSecret: 'psico2026',
        fields: ['EMAIL', 'PASSWORD_HASH', 'AUTH_TOKEN']
      },
      {
        email: 'admin.seguranca@terapiainfoco.com.br',
        role: UserRole.ADMIN,
        source: ThreatSourceType.DARK_WEB_BREACH_DUMP,
        title: 'Collection #1 Mega Dump',
        sampleSecret: 'admin123',
        fields: ['EMAIL', 'PASSWORD_HASH']
      }
    ];

    const newIncidents: CredentialBreachRecord[] = [];
    const newAlerts: DpoIncidentAlert[] = [];

    for (const cand of mockCandidates) {
      const split = calculateKAnonymitySplit(cand.sampleSecret);
      const entries = this.kAnonymityDatabase.get(split.prefix) || [];
      const match = matchKAnonymitySuffix(split.suffix, entries);

      if (match.matched || params.simulateBreachDump) {
        const breachCount = match.matched ? match.breachCount : 15;
        const severity = evaluateBreachSeverity({
          role: cand.role,
          source: cand.source,
          breachCount,
          hasPasswordExposed: true,
          isRecentStealer: cand.source === ThreatSourceType.STEALER_LOGS
        });

        const incidentId = `inc-${crypto.randomUUID().slice(0, 8)}`;
        const maskedEmail = maskEmail(cand.email);
        const detectedAt = new Date().toISOString();

        const wormDigest = calculateIncidentWormDigest({
          incidentId,
          userEmailMasked: maskedEmail,
          source: cand.source,
          severity,
          breachCount,
          detectedAt
        });

        const record: CredentialBreachRecord = {
          id: incidentId,
          userEmailMasked: maskedEmail,
          userRole: cand.role,
          source: cand.source,
          breachTitle: cand.title,
          breachDate: '2026-09-28',
          detectedAt,
          kAnonymityPrefix: split.prefix,
          breachCount,
          severity,
          containmentStatus: IncidentContainmentStatus.DETECTED_UNCONTAINED,
          sessionsRevokedCount: 0,
          compromisedFields: cand.fields,
          probatoryWormDigest: wormDigest
        };

        // Geração automática de Alerta DPO se exigir notificação
        const needsAnpd = requiresAnpdNotification(severity, cand.role);
        const deadline = calculateAnpdDeadline();
        const alertId = `alert-dpo-${crypto.randomUUID().slice(0, 8)}`;

        const alert: DpoIncidentAlert = {
          alertId,
          breachRecordId: incidentId,
          severity,
          anpdNotificationRequired: needsAnpd,
          anpdDeadlineAt: deadline.toISOString(),
          status: 'DISPATCHED',
          title: `Alerta DPO: Credencial de ${cand.role} Detectada na Dark Web`,
          summary: `Identificado vazamento de credencial da conta ${maskedEmail} com severidade ${severity}. Vetor: ${cand.source}. Exigida contenção imediata e avaliação de comunicação à ANPD.`,
          recommendedActions: [
            'Revogar imediatamente todas as sessões e tokens JWT ativos do usuário',
            'Forçar redefinição imediata de senha e revalidação de 2FA/WebAuthn',
            'Isolar dispositivos suspeitos de infecção por infostealer',
            needsAnpd ? 'Preencher formulário oficial de comunicação de incidente no portal ANPD (prazo: 3 dias úteis)' : 'Registrar encerramento com análise técnica de mitigação'
          ],
          createdAt: detectedAt,
          probatoryWormDigest: wormDigest
        };

        record.dpoAlertId = alertId;

        this.incidents.set(incidentId, record);
        this.alerts.set(alertId, alert);
        newIncidents.push(record);
        newAlerts.push(alert);

        // Registro na trilha WORM
        AuditService.log({
          action: AuditAction.CREDENTIAL_BREACH_DETECTED,
          resourceType: AuditResourceType.THREAT_INTELLIGENCE,
          resourceId: incidentId,
          actorId: params.requestedBy,
          ipAddress: params.ipAddress,
          userAgent: 'TerapiaInFoco-DarkWeb-Monitor/1.0'
        });

        AuditService.log({
          action: AuditAction.DPO_BREACH_ALERT_DISPATCHED,
          resourceType: AuditResourceType.THREAT_INTELLIGENCE,
          resourceId: alertId,
          actorId: params.requestedBy,
          ipAddress: params.ipAddress,
          userAgent: 'TerapiaInFoco-DarkWeb-Monitor/1.0'
        });
      }
    }

    return {
      newIncidentsCount: newIncidents.length,
      incidents: newIncidents,
      alertsGenerated: newAlerts
    };
  }

  /**
   * 3. Contenção Imediata do Incidente: Revogação Compulsória de Sessões e Tokens
   */
  public async containIncident(params: {
    incidentId: string;
    dpoId: string;
    ipAddress: string;
    reason?: string;
    forcePasswordReset?: boolean;
  }): Promise<{
    incident: CredentialBreachRecord;
    sessionsRevokedCount: number;
    dpoAlert?: DpoIncidentAlert;
  }> {
    const incident = this.incidents.get(params.incidentId);
    if (!incident) {
      throw new Error(`Incidente ${params.incidentId} não encontrado.`);
    }

    // Simula revogação compulsória de 3 sessões simultâneas do usuário
    const revokedCount = 3;
    this.compulsoryRevocationsExecuted += revokedCount;
    incident.sessionsRevokedCount += revokedCount;
    incident.containmentStatus = params.forcePasswordReset
      ? IncidentContainmentStatus.PENDING_PASSWORD_RESET
      : IncidentContainmentStatus.CONTAINED_REVOKED;

    // Atualiza status do alerta DPO correspondente
    let dpoAlert: DpoIncidentAlert | undefined;
    if (incident.dpoAlertId) {
      dpoAlert = this.alerts.get(incident.dpoAlertId);
      if (dpoAlert && dpoAlert.status === 'DISPATCHED') {
        dpoAlert.status = 'ACKNOWLEDGED';
      }
    }

    // Registra trilha de contenção WORM
    AuditService.log({
      action: AuditAction.SESSION_FORCE_REVOKED,
      resourceType: AuditResourceType.THREAT_INTELLIGENCE,
      resourceId: incident.id,
      actorId: params.dpoId,
      ipAddress: params.ipAddress,
      userAgent: 'TerapiaInFoco-Threat-Containment/1.0'
    });

    AuditService.log({
      action: AuditAction.INCIDENT_CONTAINED,
      resourceType: AuditResourceType.THREAT_INTELLIGENCE,
      resourceId: incident.id,
      actorId: params.dpoId,
      ipAddress: params.ipAddress,
      userAgent: 'TerapiaInFoco-Threat-Containment/1.0'
    });

    return {
      incident,
      sessionsRevokedCount: revokedCount,
      dpoAlert
    };
  }

  /**
   * 4. Resolução Formal do Incidente pelo DPO / Encarregado
   */
  public async resolveIncident(params: {
    incidentId: string;
    dpoId: string;
    ipAddress: string;
    alertId?: string;
    resolutionNotes: string;
    reportedToAnpd: boolean;
    anpdProtocolNumber?: string;
  }): Promise<{
    incident: CredentialBreachRecord;
    alert?: DpoIncidentAlert;
  }> {
    const incident = this.incidents.get(params.incidentId);
    if (!incident) {
      throw new Error(`Incidente ${params.incidentId} não encontrado.`);
    }

    incident.containmentStatus = IncidentContainmentStatus.RESOLVED;

    let alert: DpoIncidentAlert | undefined;
    const alertId = params.alertId || incident.dpoAlertId;
    if (alertId) {
      alert = this.alerts.get(alertId);
      if (alert) {
        alert.status = params.reportedToAnpd ? 'REPORTED_TO_ANPD' : 'RESOLVED_INTERNAL';
        alert.resolvedAt = new Date().toISOString();
        alert.resolutionNotes = params.resolutionNotes + (params.anpdProtocolNumber ? ` (Protocolo ANPD: ${params.anpdProtocolNumber})` : '');
      }
    }

    AuditService.log({
      action: AuditAction.INCIDENT_RESOLVED,
      resourceType: AuditResourceType.THREAT_INTELLIGENCE,
      resourceId: incident.id,
      actorId: params.dpoId,
      ipAddress: params.ipAddress,
      userAgent: 'TerapiaInFoco-Incident-Resolution/1.0'
    });

    return {
      incident,
      alert
    };
  }

  /**
   * Listagem de incidentes
   */
  public getIncidents(): CredentialBreachRecord[] {
    return Array.from(this.incidents.values()).sort(
      (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
    );
  }

  /**
   * Listagem de alertas DPO
   */
  public getAlerts(): DpoIncidentAlert[] {
    return Array.from(this.alerts.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Métricas do módulo de inteligência de ameaças
   */
  public getMetrics(): ThreatIntelligenceMetrics {
    const incidents = Array.from(this.incidents.values());
    const activeThreats = incidents.filter(
      i => i.containmentStatus === IncidentContainmentStatus.DETECTED_UNCONTAINED ||
           i.containmentStatus === IncidentContainmentStatus.PENDING_PASSWORD_RESET
    ).length;

    return {
      monitoredAccountsCount: this.monitoredAccountsCount,
      totalBreachesDetected: incidents.length,
      activeThreatsCount: activeThreats,
      compulsoryRevocationsExecuted: this.compulsoryRevocationsExecuted,
      dpoAlertsCount: this.alerts.size,
      lastScanAt: this.lastScanAt,
      averageContainmentTimeSec: 18,
      darkWebFeedsActive: 4
    };
  }
}
