import { randomUUID } from 'node:crypto';
import {
  AuditAction,
  AuditResourceType,
  UebaRiskLevel,
  UebaAnomalyType,
  UebaContainmentAction,
  UebaContainmentStatus,
  type UebaAccessEvent,
  type UebaUserProfileBaseline,
  type UebaRiskAssessment,
  type UebaAnomalyIncident,
  type UebaSystemOverview,
  type EvaluateAccessRiskDTO,
  type EvaluateAccessRiskResponse,
  type SimulateAccessPatternDTO,
  type SimulateAccessPatternResponse,
  type ApplyUebaContainmentDTO,
  type ApplyUebaContainmentResponse
} from '@terapiainfoco/shared';
import {
  evaluateAccessRisk,
  calculateBaselineStats,
  generateUebaIncidentProof,
  verifyUebaIncidentProof
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class UebaService {
  private static instance: UebaService;

  private userBaselines: Map<string, UebaUserProfileBaseline> = new Map();
  private userRecentEvents: Map<string, UebaAccessEvent[]> = new Map();
  private incidents: Map<string, UebaAnomalyIncident> = new Map();
  private activeContainments: Map<string, { action: UebaContainmentAction; appliedAt: string; reason: string }> = new Map();

  private totalEvaluatedEvents = 0;
  private totalAnomaliesDetected = 0;
  private criticalIncidentsBlocked = 0;

  private constructor() {
    this.seedDemoUebaData();
  }

  public static getInstance(): UebaService {
    if (!UebaService.instance) {
      UebaService.instance = new UebaService();
    }
    return UebaService.instance;
  }

  /**
   * Inicializa dados de demonstração com um perfil padrão e incidentes controlados
   */
  private seedDemoUebaData(): void {
    const demoUserId = 'usr-therapist-1';
    const demoCrp = '06/123456';

    const defaultBaseline: UebaUserProfileBaseline = {
      userId: demoUserId,
      therapistCrp: demoCrp,
      usualHoursStart: 8,
      usualHoursEnd: 19,
      usualDaysOfWeek: [1, 2, 3, 4, 5],
      avgEventsPerHour: 5,
      stdDevEventsPerHour: 1.2,
      maxEventsPerMinuteLimit: 12,
      usualIpPrefixes: ['189.40.', '177.18.'],
      usualCountries: ['BR'],
      totalLearnedEvents: 142,
      lastUpdatedAt: new Date(Date.now() - 3600000 * 24 * 3).toISOString(),
      modelConfidenceScore: 94
    };

    this.userBaselines.set(demoUserId, defaultBaseline);

    // Incidente Demo 1: Raspagem Noturna Contida
    const triggerEvent1: UebaAccessEvent = {
      eventId: 'evt-demo-seed-1',
      userId: demoUserId,
      therapistCrp: demoCrp,
      userRole: 'PSICOLOGO_TITULAR',
      patientId: 'patient-demo-uuid-1',
      resourceType: 'CLINICAL_RECORD',
      actionType: 'BULK_READ',
      ipAddress: '185.220.101.5',
      userAgent: 'python-requests/2.31.0',
      locationCountry: 'NL',
      timestamp: new Date(Date.now() - 3600000 * 5).toISOString(),
      hourOfDay: 2,
      dayOfWeek: 2,
      recordsAccessedCount: 22
    };

    const incident1Id = 'INC-UEBA-2026-0891';
    const proof1 = generateUebaIncidentProof({
      incidentId: incident1Id,
      userId: demoUserId,
      riskScore: 92,
      riskLevel: UebaRiskLevel.CRITICAL_EXFILTRATION,
      timestamp: triggerEvent1.timestamp,
      anomalies: [
        UebaAnomalyType.OFF_HOURS_ACCESS,
        UebaAnomalyType.BULK_RECORD_SCRAPING,
        UebaAnomalyType.UNUSUAL_GEO_IP_JUMP
      ],
      triggerEvent: triggerEvent1
    });

    const incident1: UebaAnomalyIncident = {
      incidentId: incident1Id,
      userId: demoUserId,
      therapistCrp: demoCrp,
      timestamp: triggerEvent1.timestamp,
      riskScore: 92,
      riskLevel: UebaRiskLevel.CRITICAL_EXFILTRATION,
      anomalies: [
        UebaAnomalyType.OFF_HOURS_ACCESS,
        UebaAnomalyType.BULK_RECORD_SCRAPING,
        UebaAnomalyType.UNUSUAL_GEO_IP_JUMP
      ],
      anomalyDetails: [
        {
          type: UebaAnomalyType.OFF_HOURS_ACCESS,
          description: 'Acesso registrado às 02:00h da madrugada, fora do expediente.',
          severityScore: 35
        },
        {
          type: UebaAnomalyType.BULK_RECORD_SCRAPING,
          description: 'Consulta massiva de 22 prontuários em lote (script automatizado detectado).',
          severityScore: 50
        },
        {
          type: UebaAnomalyType.UNUSUAL_GEO_IP_JUMP,
          description: 'Conexão via proxy/nó de saída estrangeiro (NL).',
          severityScore: 40
        }
      ],
      triggerEvent: triggerEvent1,
      containmentAction: UebaContainmentAction.SUSPEND_SESSION,
      containmentStatus: UebaContainmentStatus.ACKNOWLEDGED,
      proofSeal: proof1.proofSeal,
      notes: 'Sessão encerrada preventivamente pelo motor UEBA; DPO revisou e confirmou teste de integridade.'
    };

    this.incidents.set(incident1Id, incident1);

    // Incidente Demo 2: Suspeita de Enumeração de Blind Index
    const triggerEvent2: UebaAccessEvent = {
      eventId: 'evt-demo-seed-2',
      userId: demoUserId,
      therapistCrp: demoCrp,
      userRole: 'PSICOLOGO_TITULAR',
      resourceType: 'BLIND_INDEX_SEARCH',
      actionType: 'SEARCH',
      ipAddress: '189.40.12.99',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      locationCountry: 'BR',
      timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
      hourOfDay: 14,
      dayOfWeek: 3,
      recordsAccessedCount: 1
    };

    const incident2Id = 'INC-UEBA-2026-0892';
    const proof2 = generateUebaIncidentProof({
      incidentId: incident2Id,
      userId: demoUserId,
      riskScore: 68,
      riskLevel: UebaRiskLevel.ANOMALOUS,
      timestamp: triggerEvent2.timestamp,
      anomalies: [UebaAnomalyType.BLIND_INDEX_ENUMERATION],
      triggerEvent: triggerEvent2
    });

    const incident2: UebaAnomalyIncident = {
      incidentId: incident2Id,
      userId: demoUserId,
      therapistCrp: demoCrp,
      timestamp: triggerEvent2.timestamp,
      riskScore: 68,
      riskLevel: UebaRiskLevel.ANOMALOUS,
      anomalies: [UebaAnomalyType.BLIND_INDEX_ENUMERATION],
      anomalyDetails: [
        {
          type: UebaAnomalyType.BLIND_INDEX_ENUMERATION,
          description: 'Múltiplas pesquisas cegas de CPF consecutivas na base de pacientes.',
          severityScore: 45
        }
      ],
      triggerEvent: triggerEvent2,
      containmentAction: UebaContainmentAction.FLAG_WORM_AUDIT,
      containmentStatus: UebaContainmentStatus.RELEASED,
      proofSeal: proof2.proofSeal,
      notes: 'Terapeuta informou busca por homônimos de admissão com autorização.'
    };

    this.incidents.set(incident2Id, incident2);

    this.totalEvaluatedEvents = 18;
    this.totalAnomaliesDetected = 4;
    this.criticalIncidentsBlocked = 1;
  }

  /**
   * Obtém o baseline de um usuário ou inicializa um baseline padrão
   */
  public getBaseline(userId: string, therapistCrp?: string): UebaUserProfileBaseline {
    let baseline = this.userBaselines.get(userId);
    if (!baseline) {
      baseline = {
        userId,
        therapistCrp,
        usualHoursStart: 8,
        usualHoursEnd: 19,
        usualDaysOfWeek: [1, 2, 3, 4, 5],
        avgEventsPerHour: 4,
        stdDevEventsPerHour: 1.0,
        maxEventsPerMinuteLimit: 10,
        usualIpPrefixes: ['189.40.', '177.18.'],
        usualCountries: ['BR'],
        totalLearnedEvents: 10,
        lastUpdatedAt: new Date().toISOString(),
        modelConfidenceScore: 75
      };
      this.userBaselines.set(userId, baseline);
    }
    return baseline;
  }

  /**
   * Avalia um evento de acesso em tempo real, detecta anomalias e aplica contenção se crítico
   */
  public async evaluateAccess(
    dto: EvaluateAccessRiskDTO,
    reqContext?: { ip?: string; userAgent?: string }
  ): Promise<EvaluateAccessRiskResponse> {
    const timestamp = dto.timestamp || new Date().toISOString();
    const dateObj = new Date(timestamp);
    const hourOfDay = dateObj.getHours();
    const dayOfWeek = dateObj.getDay();

    const baseline = this.getBaseline(dto.userId, dto.therapistCrp);

    const event: UebaAccessEvent = {
      eventId: `evt-${randomUUID()}`,
      userId: dto.userId,
      therapistCrp: dto.therapistCrp || baseline.therapistCrp,
      userRole: dto.userRole || 'PSICOLOGO_TITULAR',
      patientId: dto.patientId,
      patientBlindIndex: dto.patientBlindIndex,
      resourceType: dto.resourceType,
      actionType: dto.actionType,
      ipAddress: dto.ipAddress || reqContext?.ip || '189.40.10.15',
      userAgent: dto.userAgent || reqContext?.userAgent || 'TerapiaInFoco Web Client',
      locationCountry: dto.locationCountry || 'BR',
      timestamp,
      hourOfDay,
      dayOfWeek,
      recordsAccessedCount: dto.recordsAccessedCount ?? 1
    };

    // Atualiza sliding window de eventos do usuário (mantendo os últimos 15 min)
    let recentEvents = this.userRecentEvents.get(dto.userId) || [];
    const windowCutoff = Date.now() - 15 * 60 * 1000;
    recentEvents = recentEvents.filter(e => new Date(e.timestamp).getTime() >= windowCutoff);
    recentEvents.push(event);
    this.userRecentEvents.set(dto.userId, recentEvents);

    this.totalEvaluatedEvents++;

    // Executa avaliação algorítmica
    const assessment = evaluateAccessRisk(event, baseline, recentEvents);

    let incidentCreated = false;
    let incident: UebaAnomalyIncident | undefined;
    let containmentApplied = false;

    // Se o score atingir nível anômalo (>= 60), cria incidente formal
    if (assessment.riskScore >= 60 || assessment.detectedAnomalies.length > 0) {
      this.totalAnomaliesDetected += assessment.detectedAnomalies.length;

      const incidentId = `INC-UEBA-2026-${randomUUID().substring(0, 8).toUpperCase()}`;
      const anomalies = assessment.detectedAnomalies.map(a => a.type);

      const proof = generateUebaIncidentProof({
        incidentId,
        userId: event.userId,
        riskScore: assessment.riskScore,
        riskLevel: assessment.riskLevel,
        timestamp: event.timestamp,
        anomalies,
        triggerEvent: event
      });

      // Aplica contenção se for crítico
      let containmentStatus = UebaContainmentStatus.RELEASED;
      if (
        assessment.recommendedAction === UebaContainmentAction.SUSPEND_SESSION ||
        assessment.recommendedAction === UebaContainmentAction.STEP_UP_2FA_CHALLENGE
      ) {
        containmentApplied = true;
        containmentStatus = UebaContainmentStatus.ACTIVE_CONTAINMENT;
        this.activeContainments.set(event.userId, {
          action: assessment.recommendedAction,
          appliedAt: event.timestamp,
          reason: `Disparo automático do motor UEBA: Score ${assessment.riskScore} (${assessment.riskLevel})`
        });
        this.criticalIncidentsBlocked++;
      }

      // Registra na trilha de auditoria WORM
      const auditLog = await AuditService.log({
        userId: event.userId,
        action: AuditAction.UEBA_ANOMALY_DETECTED,
        resourceType: AuditResourceType.UEBA_SECURITY_ENGINE,
        resourceId: incidentId,
        details: {
          riskScore: assessment.riskScore,
          riskLevel: assessment.riskLevel,
          anomalies,
          proofSeal: proof.proofSeal,
          recommendedAction: assessment.recommendedAction,
          containmentApplied,
          ipAddress: event.ipAddress
        }
      });

      incident = {
        incidentId,
        userId: event.userId,
        therapistCrp: event.therapistCrp,
        timestamp: event.timestamp,
        riskScore: assessment.riskScore,
        riskLevel: assessment.riskLevel,
        anomalies,
        anomalyDetails: assessment.detectedAnomalies.map(a => ({
          type: a.type,
          description: a.description,
          severityScore: a.severityScore
        })),
        triggerEvent: event,
        containmentAction: assessment.recommendedAction,
        containmentStatus,
        proofSeal: proof.proofSeal,
        wormAuditLogId: auditLog.id,
        notes: `Anomalia identificada com score ${assessment.riskScore}. Ação: ${assessment.recommendedAction}`
      };

      this.incidents.set(incidentId, incident);
      incidentCreated = true;
    }

    return {
      success: true,
      assessment,
      incidentCreated,
      incident,
      containmentApplied,
      message: incidentCreated
        ? `Alerta UEBA emitido: Score ${assessment.riskScore} (${assessment.riskLevel}).`
        : `Acesso clínico avaliado com sucesso. Score de risco: ${assessment.riskScore} (${assessment.riskLevel}).`
    };
  }

  /**
   * Simula cenários realistas de acesso para validação e testes
   */
  public async simulatePattern(dto: SimulateAccessPatternDTO): Promise<SimulateAccessPatternResponse> {
    const userId = dto.userId || 'usr-therapist-1';
    const therapistCrp = dto.therapistCrp || '06/123456';
    const patientId = dto.patientId || 'patient-demo-uuid-1';

    let eventDto: EvaluateAccessRiskDTO;

    switch (dto.scenario) {
      case 'NORMAL_ROUTINE':
        eventDto = {
          userId,
          therapistCrp,
          resourceType: 'CLINICAL_RECORD',
          actionType: 'READ',
          patientId,
          ipAddress: '189.40.12.33',
          locationCountry: 'BR',
          timestamp: '2026-10-14T14:30:00.000Z',
          recordsAccessedCount: 1
        };
        break;

      case 'BULK_SCRAPING':
        eventDto = {
          userId,
          therapistCrp,
          resourceType: 'CLINICAL_RECORD',
          actionType: 'BULK_READ',
          patientId,
          ipAddress: '189.40.12.33',
          locationCountry: 'BR',
          timestamp: '2026-10-14T15:10:00.000Z',
          recordsAccessedCount: 28
        };
        break;

      case 'OFF_HOURS_MIDNIGHT':
        eventDto = {
          userId,
          therapistCrp,
          resourceType: 'SOAP_NOTE',
          actionType: 'READ',
          patientId,
          ipAddress: '189.40.12.33',
          locationCountry: 'BR',
          timestamp: '2026-10-14T03:35:00.000Z',
          recordsAccessedCount: 1
        };
        break;

      case 'IMPOSSIBLE_GEO_JUMP':
        eventDto = {
          userId,
          therapistCrp,
          resourceType: 'CLINICAL_RECORD',
          actionType: 'READ',
          patientId,
          ipAddress: '95.173.136.2',
          locationCountry: 'RU',
          timestamp: new Date().toISOString(),
          recordsAccessedCount: 1
        };
        break;

      case 'BLIND_INDEX_DICTIONARY':
        eventDto = {
          userId,
          therapistCrp,
          resourceType: 'BLIND_INDEX_SEARCH',
          actionType: 'SEARCH',
          ipAddress: '189.40.12.33',
          locationCountry: 'BR',
          timestamp: new Date().toISOString(),
          recordsAccessedCount: 1
        };
        break;

      case 'UNLINKED_PATIENT_ACCESS':
      default:
        eventDto = {
          userId,
          therapistCrp,
          resourceType: 'CLINICAL_RECORD',
          actionType: 'READ',
          patientId: 'patient-unlinked-cross-org-99',
          ipAddress: '189.40.12.33',
          locationCountry: 'BR',
          timestamp: new Date().toISOString(),
          recordsAccessedCount: 1
        };
        break;
    }

    const evaluation = await this.evaluateAccess(eventDto);

    return {
      success: true,
      scenario: dto.scenario,
      simulatedEvent: {
        eventId: `sim-${randomUUID()}`,
        userId: eventDto.userId,
        therapistCrp: eventDto.therapistCrp,
        userRole: 'PSICOLOGO_TITULAR',
        patientId: eventDto.patientId,
        resourceType: eventDto.resourceType,
        actionType: eventDto.actionType,
        ipAddress: eventDto.ipAddress!,
        userAgent: 'Simulated Security Tester',
        locationCountry: eventDto.locationCountry,
        timestamp: eventDto.timestamp!,
        hourOfDay: new Date(eventDto.timestamp!).getHours(),
        dayOfWeek: new Date(eventDto.timestamp!).getDay(),
        recordsAccessedCount: eventDto.recordsAccessedCount ?? 1
      },
      assessment: evaluation.assessment,
      incident: evaluation.incident,
      message: `Simulação [${dto.scenario}] processada com score ${evaluation.assessment.riskScore} (${evaluation.assessment.riskLevel}).`
    };
  }

  /**
   * Aplica ou libera contenção administrativa com registro na trilha WORM
   */
  public async applyContainment(
    dto: ApplyUebaContainmentDTO,
    operatorId: string
  ): Promise<ApplyUebaContainmentResponse> {
    const appliedAt = new Date().toISOString();

    let status = UebaContainmentStatus.ACTIVE_CONTAINMENT;
    if (dto.action === UebaContainmentAction.NONE) {
      status = UebaContainmentStatus.RELEASED;
      this.activeContainments.delete(dto.userId);
    } else {
      this.activeContainments.set(dto.userId, {
        action: dto.action,
        appliedAt,
        reason: dto.reason
      });
    }

    if (dto.incidentId && this.incidents.has(dto.incidentId)) {
      const inc = this.incidents.get(dto.incidentId)!;
      inc.containmentStatus = status;
      inc.containmentAction = dto.action;
      if (status === UebaContainmentStatus.RELEASED) {
        inc.releasedAt = appliedAt;
        inc.releasedBy = operatorId;
      }
      this.incidents.set(dto.incidentId, inc);
    }

    await AuditService.log({
      userId: operatorId,
      action: dto.action === UebaContainmentAction.NONE
        ? AuditAction.UEBA_CONTAINMENT_RELEASED
        : AuditAction.UEBA_CONTAINMENT_TRIGGERED,
      resourceType: AuditResourceType.UEBA_SECURITY_ENGINE,
      resourceId: dto.incidentId || dto.userId,
      details: {
        targetUserId: dto.userId,
        action: dto.action,
        status,
        reason: dto.reason,
        adminNotes: dto.adminNotes
      }
    });

    return {
      success: true,
      userId: dto.userId,
      action: dto.action,
      status,
      appliedAt,
      message: dto.action === UebaContainmentAction.NONE
        ? 'Contenção liberada com sucesso e selada na trilha WORM.'
        : `Contenção ${dto.action} aplicada imediatamente à conta ${dto.userId}.`
    };
  }

  /**
   * Visão Geral Executiva de Governança Comportamental UEBA
   */
  public getOverview(): UebaSystemOverview {
    const allIncidents = Array.from(this.incidents.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const riskDistribution = {
      normal: 0,
      suspicious: 0,
      anomalous: 0,
      highRisk: 0,
      critical: 0
    };

    let totalScore = 0;
    for (const inc of allIncidents) {
      totalScore += inc.riskScore;
      if (inc.riskLevel === UebaRiskLevel.NORMAL) riskDistribution.normal++;
      else if (inc.riskLevel === UebaRiskLevel.SUSPICIOUS) riskDistribution.suspicious++;
      else if (inc.riskLevel === UebaRiskLevel.ANOMALOUS) riskDistribution.anomalous++;
      else if (inc.riskLevel === UebaRiskLevel.HIGH_RISK) riskDistribution.highRisk++;
      else if (inc.riskLevel === UebaRiskLevel.CRITICAL_EXFILTRATION) riskDistribution.critical++;
    }

    const avgRiskScore = allIncidents.length > 0 ? Math.round(totalScore / allIncidents.length) : 18;

    return {
      avgRiskScore,
      totalEvaluatedEvents: this.totalEvaluatedEvents,
      totalAnomaliesDetected: this.totalAnomaliesDetected,
      criticalIncidentsBlocked: this.criticalIncidentsBlocked,
      activeContainedSessionsCount: this.activeContainments.size,
      activeBaselinesCount: this.userBaselines.size,
      riskDistribution,
      recentIncidents: allIncidents.slice(0, 10)
    };
  }

  /**
   * Lista incidentes registrados
   */
  public getIncidents(): UebaAnomalyIncident[] {
    return Array.from(this.incidents.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * Retorna perfil e status de contenção de um usuário
   */
  public getUserProfile(userId: string) {
    const baseline = this.getBaseline(userId);
    const containment = this.activeContainments.get(userId);
    return {
      baseline,
      contained: Boolean(containment),
      activeContainmentAction: containment?.action
    };
  }
}
