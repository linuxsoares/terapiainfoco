import { randomUUID } from 'node:crypto';
import {
  AuditAction,
  AuditResourceType,
  DlpPolicyMode,
  DlpRiskLevel,
  SteganographyInspectionStatus
} from '@terapiainfoco/shared';
import type {
  DlpAuditOverview,
  DlpEvaluationResult,
  DlpEventLog,
  DlpInspectionResult,
  EvaluateClipboardDlpDTO,
  InspectClipboardDlpDTO
} from '@terapiainfoco/shared';
import {
  evaluateClipboardPolicyEngine,
  extractSteganographicWatermark
} from '@terapiainfoco/crypto';
import { decryptField } from './cryptoContext';
import { AuditService } from './auditService';

import { PatientRepository } from '../repositories/patientRepository';
export class DlpService {
  private static instance: DlpService;

  private activePolicy: DlpPolicyMode = DlpPolicyMode.WATERMARK_ONLY;
  private totalCopiesMonitored = 0;
  private watermarksEmbedded = 0;
  private bulkExfiltrationsBlocked = 0;
  private forensicInspectionsPerformed = 0;
  private eventHistory: DlpEventLog[] = [];

  private constructor() {
    this.seedInitialDlpEvents();
  }

  public static getInstance(): DlpService {
    if (!DlpService.instance) {
      DlpService.instance = new DlpService();
    }
    return DlpService.instance;
  }

  /**
   * Inicializa dados de exemplo para demonstração e métricas
   */
  private seedInitialDlpEvents(): void {
    const now = Date.now();
    this.eventHistory = [
      {
        id: 'dlp_evt_001',
        timestamp: new Date(now - 1000 * 60 * 120).toISOString(),
        operatorId: 'psi_mariana',
        operatorName: 'Dra. Mariana Silva (CRP 06/123456)',
        patientId: 'patient-demo-1',
        action: DlpPolicyMode.WATERMARK_ONLY,
        riskLevel: DlpRiskLevel.HIGH,
        status: 'EMBEDDED_SUCCESS',
        charactersCopied: 840,
        invisibleCharsCount: 688,
        watermarkId: 'dlp_seed_a1b2c3d4',
        sourceContext: 'SOAP_NOTES'
      },
      {
        id: 'dlp_evt_002',
        timestamp: new Date(now - 1000 * 60 * 45).toISOString(),
        operatorId: 'rec_secretaria',
        operatorName: 'Carla Recepção',
        patientId: 'patient-demo-2',
        action: DlpPolicyMode.WATERMARK_ONLY,
        riskLevel: DlpRiskLevel.MEDIUM,
        status: 'EMBEDDED_SUCCESS',
        charactersCopied: 195,
        invisibleCharsCount: 688,
        watermarkId: 'dlp_seed_e5f6g7h8',
        sourceContext: 'PATIENT_PROFILE'
      }
    ];

    this.totalCopiesMonitored = 14;
    this.watermarksEmbedded = 13;
    this.bulkExfiltrationsBlocked = 1;
    this.forensicInspectionsPerformed = 3;
  }

  /**
   * Avalia a cópia para a área de transferência aplicando políticas de DLP e esteganografia
   */
  public async evaluateCopyAttempt(
    dto: EvaluateClipboardDlpDTO,
    actor: { id: string; name?: string; role: string; ipAddress?: string; userAgent?: string }
  ): Promise<DlpEvaluationResult> {
    this.totalCopiesMonitored++;

    // Localizar nome do paciente se disponível
    let patientName = dto.patientName;
    if (!patientName && dto.patientId) {
      const patient = await PatientRepository.findById(dto.patientId);
      if (patient && patient.encryptedName) {
        patientName = decryptField(patient.encryptedName);
      }
    }

    const operatorId = dto.operatorId || actor.id;
    const operatorName = dto.operatorName || actor.name || `Operador ${actor.role}`;
    const policyToUse = dto.policyMode || this.activePolicy;

    const evalResult = evaluateClipboardPolicyEngine({
      text: dto.text,
      operatorId,
      operatorName,
      patientId: dto.patientId,
      patientName,
      context: dto.sourceContext,
      policyMode: policyToUse
    });

    const eventId = `dlp_evt_${randomUUID().substring(0, 8)}`;
    const eventLog: DlpEventLog = {
      id: eventId,
      timestamp: new Date().toISOString(),
      operatorId,
      operatorName,
      patientId: dto.patientId,
      action: evalResult.action,
      riskLevel: evalResult.riskLevel,
      status: evalResult.allowed ? 'EMBEDDED_SUCCESS' : 'BLOCKED_BY_POLICY',
      charactersCopied: dto.text.length,
      invisibleCharsCount: evalResult.invisibleCharsCount,
      watermarkId: evalResult.watermarkId,
      sourceContext: dto.sourceContext || 'GENERAL'
    };

    this.eventHistory.unshift(eventLog);
    if (this.eventHistory.length > 50) {
      this.eventHistory.pop();
    }

    if (evalResult.allowed) {
      this.watermarksEmbedded++;
      AuditService.log({
        actorId: actor.id,
        resourceType: AuditResourceType.CLIPBOARD_DLP,
        resourceId: evalResult.watermarkId,
        action: AuditAction.CLIPBOARD_WATERMARK_EMBEDDED,
        ipAddress: actor.ipAddress || '127.0.0.1',
        userAgent: actor.userAgent || 'App'
      });
    } else {
      this.bulkExfiltrationsBlocked++;
      AuditService.log({
        actorId: actor.id,
        resourceType: AuditResourceType.CLIPBOARD_DLP,
        resourceId: evalResult.watermarkId,
        action: AuditAction.CLIPBOARD_EXFILTRATION_BLOCKED,
        ipAddress: actor.ipAddress || '127.0.0.1',
        userAgent: actor.userAgent || 'App'
      });
    }

    return evalResult;
  }

  /**
   * Inspeciona um texto suspeito de vazamento procurando a marca d'água esteganográfica
   */
  public inspectText(
    dto: InspectClipboardDlpDTO,
    investigator: { id: string; name?: string; role: string; ipAddress?: string }
  ): DlpInspectionResult {
    this.forensicInspectionsPerformed++;

    const result = extractSteganographicWatermark(dto.suspiciousText);

    AuditService.log({
      actorId: investigator.id,
      resourceType: AuditResourceType.CLIPBOARD_DLP,
      resourceId: result.payload?.watermarkId || 'INSPECTION_NO_WATERMARK',
      action: AuditAction.CLIPBOARD_WATERMARK_INSPECTED,
      ipAddress: investigator.ipAddress || '127.0.0.1',
      userAgent: 'ForensicTool'
    });

    return result;
  }

  /**
   * Atualiza a política global de DLP
   */
  public updatePolicy(newPolicy: DlpPolicyMode, admin: { id: string; role: string }): DlpPolicyMode {
    const oldPolicy = this.activePolicy;
    this.activePolicy = newPolicy;

    AuditService.log({
      actorId: admin.id,
      resourceType: AuditResourceType.CLIPBOARD_DLP,
      resourceId: `policy_${newPolicy}`,
      action: AuditAction.CLIPBOARD_POLICY_VIOLATION,
      ipAddress: '127.0.0.1',
      userAgent: 'AdminConsole'
    });

    return this.activePolicy;
  }

  /**
   * Retorna visão geral e KPIs para o painel de governança
   */
  public getOverview(): DlpAuditOverview {
    return {
      totalCopiesMonitored: this.totalCopiesMonitored,
      watermarksEmbedded: this.watermarksEmbedded,
      bulkExfiltrationsBlocked: this.bulkExfiltrationsBlocked,
      forensicInspectionsPerformed: this.forensicInspectionsPerformed,
      activePolicy: this.activePolicy,
      recentEvents: this.eventHistory.slice(0, 20)
    };
  }
}
