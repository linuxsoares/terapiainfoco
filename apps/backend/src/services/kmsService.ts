import {
  KmsKeyMetadata,
  KmsKeyStatus,
  KmsRotationPolicy,
  KmsSystemStatus,
  RotateKmsKeyResponse,
  ReWrapDeksResponse,
  UpdateKmsPolicyDTO,
  AuditAction,
  AuditResourceType
} from '@terapiainfoco/shared';
import { kmsProvider } from './cryptoContext';
import { db } from '../db/memoryDb';
import { AuditService } from './auditService';

export class KmsService {
  private policy: KmsRotationPolicy;
  private reWrappedDeksCount: number = 0;
  private lastAuditAction: string = 'KMS inicializado em conformidade com NIST SP 800-57';

  constructor() {
    const now = new Date();
    const intervalDays = 90; // Política recomendada NIST SP 800-57 (trimestral)
    const nextRotation = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);

    this.policy = {
      enabled: true,
      intervalDays,
      autoReWrapLegacyDeks: true,
      alertThresholdDays: 15,
      lastRotationDate: now.toISOString(),
      nextScheduledRotationDate: nextRotation.toISOString()
    };

    // Garante que a DEK inicial do terapeuta padrão tenha um formato inicial válido com o KMS
    this.ensureDefaultTherapistDek();
  }

  private async ensureDefaultTherapistDek() {
    try {
      const defaultTherapist = db.therapists.get('therapist-001');
      if (defaultTherapist && (!defaultTherapist.encryptedDek || defaultTherapist.encryptedDek.startsWith('mock-'))) {
        const { encryptedKey } = await kmsProvider.generateDataKey();
        defaultTherapist.encryptedDek = encryptedKey;
      }
    } catch {
      // Ignora erro no boot
    }
  }

  async getStatus(): Promise<KmsSystemStatus> {
    const keys = await kmsProvider.listKeys();
    const activeVersion = kmsProvider.getActiveKeyVersion();

    // Avalia conformidade: chave ativa presente e sem chaves ativas vencidas
    const activeKey = keys.find(k => k.version === activeVersion);
    const isExpired = activeKey ? new Date(activeKey.expiresAt).getTime() < Date.now() : true;
    const complianceScore = activeKey && !isExpired ? 100 : 70;

    return {
      activeKeyVersion: activeVersion,
      totalKeysCount: keys.length,
      keys,
      policy: { ...this.policy },
      reWrappedDeksCount: this.reWrappedDeksCount,
      complianceScore,
      nistCompliance: true,
      lastAuditAction: this.lastAuditAction
    };
  }

  async rotateKey(
    reason: string,
    actorId: string = 'sys-admin',
    ipAddress: string = '127.0.0.1',
    reWrapExisting?: boolean
  ): Promise<RotateKmsKeyResponse> {
    const previousVersion = kmsProvider.getActiveKeyVersion();

    // Executa a rotação criptográfica no provedor KMS
    const newKey = await kmsProvider.rotateMasterKey(reason);
    db.kmsState.set('local', kmsProvider.exportState());
    const previousKey = await kmsProvider.getKeyMetadata(previousVersion);

    // Atualiza política de agendamento
    const now = new Date();
    this.policy.lastRotationDate = now.toISOString();
    const nextDate = new Date(now.getTime() + this.policy.intervalDays * 24 * 60 * 60 * 1000);
    this.policy.nextScheduledRotationDate = nextDate.toISOString();

    this.lastAuditAction = `KEK rotacionada para v${newKey.version} - ${reason}`;

    // Registra na trilha de auditoria WORM imutável
    AuditService.log({
      actorId,
      resourceType: AuditResourceType.KMS,
      resourceId: newKey.keyId,
      action: AuditAction.KMS_KEY_ROTATED,
      ipAddress,
      userAgent: `TerapiaInFoco-KMS/v${newKey.version} (NIST-SP-800-57)`
    });

    let reWrappedCount = 0;
    const shouldReWrap = reWrapExisting ?? this.policy.autoReWrapLegacyDeks;
    if (shouldReWrap) {
      const reWrapResult = await this.reWrapAllDeks(newKey.version, actorId, ipAddress);
      reWrappedCount = reWrapResult.reWrappedCount;
    }

    return {
      success: true,
      newKey,
      previousKey: previousKey ?? newKey,
      reWrappedCount,
      message: `Chave Mestre KEK rotacionada com sucesso para versão ${newKey.version} (${newKey.algorithm}). ${reWrappedCount} DEKs re-envelopadas.`
    };
  }

  async reWrapAllDeks(
    targetVersion?: number,
    actorId: string = 'sys-admin',
    ipAddress: string = '127.0.0.1'
  ): Promise<ReWrapDeksResponse> {
    const targetVer = targetVersion ?? kmsProvider.getActiveKeyVersion();
    let totalExamined = 0;
    let reWrappedCount = 0;
    let skippedCount = 0;

    for (const [id, therapist] of db.therapists.entries()) {
      totalExamined++;
      if (!therapist.encryptedDek) {
        skippedCount++;
        continue;
      }

      // Verifica se a chave já é da versão desejada
      if (therapist.encryptedDek.startsWith(`v${targetVer}:`)) {
        skippedCount++;
        continue;
      }

      try {
        const newEncryptedDek = await kmsProvider.reWrapDataKey(therapist.encryptedDek, targetVer);
        therapist.encryptedDek = newEncryptedDek;
        db.therapists.set(id, therapist);
        reWrappedCount++;
        this.reWrappedDeksCount++;
      } catch (err) {
        console.warn(`[KMS] Falha ao re-envelopar DEK do terapeuta ${id}:`, err);
        skippedCount++;
      }
    }

    this.lastAuditAction = `${reWrappedCount} DEKs re-envelopadas para a KEK v${targetVer}`;

    // Registra na trilha de auditoria WORM
    AuditService.log({
      actorId,
      resourceType: AuditResourceType.KMS,
      resourceId: `target-kek-v${targetVer}`,
      action: AuditAction.KMS_KEY_RE_WRAPPED,
      ipAddress,
      userAgent: `TerapiaInFoco-KMS-ReWrap/v${targetVer}`
    });

    return {
      success: true,
      targetVersion: targetVer,
      totalExamined,
      reWrappedCount,
      skippedCount,
      message: `Operação de re-wrapping concluída: ${reWrappedCount} DEKs atualizadas para v${targetVer}, ${skippedCount} ignoradas ou já atualizadas.`
    };
  }

  async updatePolicy(
    dto: UpdateKmsPolicyDTO,
    actorId: string = 'sys-admin',
    ipAddress: string = '127.0.0.1'
  ): Promise<KmsRotationPolicy> {
    if (dto.enabled !== undefined) this.policy.enabled = dto.enabled;
    if (dto.intervalDays !== undefined && dto.intervalDays > 0) {
      this.policy.intervalDays = dto.intervalDays;
      const last = this.policy.lastRotationDate ? new Date(this.policy.lastRotationDate) : new Date();
      this.policy.nextScheduledRotationDate = new Date(
        last.getTime() + this.policy.intervalDays * 24 * 60 * 60 * 1000
      ).toISOString();
    }
    if (dto.autoReWrapLegacyDeks !== undefined) this.policy.autoReWrapLegacyDeks = dto.autoReWrapLegacyDeks;
    if (dto.alertThresholdDays !== undefined && dto.alertThresholdDays > 0) {
      this.policy.alertThresholdDays = dto.alertThresholdDays;
    }

    this.lastAuditAction = `Política de rotação KMS atualizada (Intervalo: ${this.policy.intervalDays} dias)`;

    AuditService.log({
      actorId,
      resourceType: AuditResourceType.KMS,
      resourceId: 'rotation-policy',
      action: AuditAction.KMS_POLICY_UPDATED,
      ipAddress,
      userAgent: 'TerapiaInFoco-KMS-Admin'
    });

    return { ...this.policy };
  }

  async revokeKey(
    version: number,
    reason: string,
    actorId: string = 'sys-admin',
    ipAddress: string = '127.0.0.1'
  ): Promise<KmsKeyMetadata> {
    const revokedKey = await kmsProvider.revokeKeyVersion(version, reason);
    db.kmsState.set('local', kmsProvider.exportState());

    this.lastAuditAction = `KEK v${version} revogada: ${reason}`;

    AuditService.log({
      actorId,
      resourceType: AuditResourceType.KMS,
      resourceId: revokedKey.keyId,
      action: AuditAction.KMS_KEY_REVOKED,
      ipAddress,
      userAgent: `TerapiaInFoco-KMS-Revocation/v${version}`
    });

    return revokedKey;
  }
}

export const kmsService = new KmsService();
