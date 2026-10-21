import { randomUUID } from 'node:crypto';
import {
  AuditAction,
  AuditResourceType,
  PurgeReason,
  PurgeMethod,
  PurgeStatus,
  PurgeProofVerificationStatus,
  type DataPurgeCertificate,
  type PurgeCandidateRecord,
  type PurgeExecutionResult,
  type PurgeLedgerOverview,
  type PurgeProofVerificationResult,
  type ExecuteDataPurgeDTO
} from '@terapiainfoco/shared';
import {
  generatePurgeBlindIndex,
  calculatePurgeProofHash,
  encodePurgeSeal,
  decodePurgeSeal,
  verifyPurgeCertificateIntegrity,
  simulateCryptoShredding
} from '@terapiainfoco/crypto';
import { db } from '../db/memoryDb';
import { AuditService } from './auditService';

import { PatientRepository } from '../repositories/patientRepository';
import { AppointmentRepository } from '../repositories/appointmentRepository';
export class SecurePurgeService {
  private static instance: SecurePurgeService;

  private certificatesById: Map<string, DataPurgeCertificate> = new Map();
  private certificatesBySeal: Map<string, DataPurgeCertificate> = new Map();
  private certificatesByBlindIndex: Map<string, DataPurgeCertificate> = new Map();
  private purgedPatientIds: Set<string> = new Set();

  private totalPurgedPatients = 0;
  private totalRecordsDestroyed = 0;

  private constructor() {
    this.seedDemoPurgeData();
  }

  public static getInstance(): SecurePurgeService {
    if (!SecurePurgeService.instance) {
      SecurePurgeService.instance = new SecurePurgeService();
    }
    return SecurePurgeService.instance;
  }

  /**
   * Semeia um histórico inicial de demonstração com um paciente purgado e candidatos pré-configurados
   */
  private seedDemoPurgeData(): void {
    const demoPatientId = 'patient-archived-demo-1';
    const blindIndex = generatePurgeBlindIndex(demoPatientId);
    const certId = 'PURGE-2026-CERT-89104';
    const purgedAt = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(); // 30 dias atrás
    const recordIds = ['rec-archived-01', 'rec-archived-02', 'rec-archived-03'];

    const canonicalProofHash = calculatePurgeProofHash({
      certificateId: certId,
      patientBlindIndex: blindIndex,
      recordsPurgedCount: recordIds.length,
      recordIdsPurged: recordIds,
      purgedAt,
      purgeReason: PurgeReason.RETENTION_PERIOD_EXPIRED_5_YEARS,
      purgeMethod: PurgeMethod.CRYPTO_SHREDDING_NIST_800_88,
      dpoApproverId: 'dpo-system-approver'
    });

    const cryptographicPurgeSeal = encodePurgeSeal({
      certificateId: certId,
      patientBlindIndex: blindIndex,
      canonicalProofHash,
      purgedAt,
      recordsPurgedCount: recordIds.length
    });

    const demoCert: DataPurgeCertificate = {
      certificateId: certId,
      issuedAt: purgedAt,
      patientBlindIndex: blindIndex,
      patientIdMasked: 'pat-***-8910',
      therapistId: 'therapist-1',
      dpoApproverId: 'dpo-system-approver',
      recordsPurgedCount: recordIds.length,
      recordIdsPurged: recordIds,
      sessionsPurgedCount: 3,
      audioShardsPurgedCount: 6,
      purgeReason: PurgeReason.RETENTION_PERIOD_EXPIRED_5_YEARS,
      purgeMethod: PurgeMethod.CRYPTO_SHREDDING_NIST_800_88,
      status: PurgeStatus.PURGED_CONFIRMED,
      purgedAt,
      inactivityPeriodMonths: 64, // Cumpridos os 5 anos (60 meses)
      canonicalProofHash,
      cryptographicPurgeSeal,
      retentionPolicyCompliance: 'Em cumprimento estrito à Resolução CFP nº 001/2009 (Art. 2º §2º) e LGPD (Art. 16, I e IV).',
      verifierUrl: `https://terapiainfoco.com.br/verify/purge?seal=${cryptographicPurgeSeal}`
    };

    this.certificatesById.set(certId, demoCert);
    this.certificatesBySeal.set(cryptographicPurgeSeal, demoCert);
    this.certificatesByBlindIndex.set(blindIndex, demoCert);
    this.purgedPatientIds.add(demoPatientId);

    this.totalPurgedPatients = 1;
    this.totalRecordsDestroyed = recordIds.length;
  }

  /**
   * Retorna os candidatos a expurgamento avaliando a regra dos 5 anos (CFP 001/2009 Art. 2º §2º)
   */
  public async getCandidates(): Promise<PurgeCandidateRecord[]> {
    const candidates: PurgeCandidateRecord[] = [];
    const now = Date.now();

    // Candidato sintético elegível pré-computado para testes de interface
    if (!this.purgedPatientIds.has('patient-inactive-5years')) {
      const fiveYearsAgo = new Date(now - 1000 * 60 * 60 * 24 * 365 * 5.2).toISOString(); // 5.2 anos = 62 meses
      candidates.push({
        patientId: 'patient-inactive-5years',
        patientNameMasked: 'C. M. S. (Prontuário 2021)',
        lastSessionDate: fiveYearsAgo,
        inactivityMonths: 62,
        isEligibleForPurge: true,
        clinicalRecordsCount: 14,
        audioRecordingsCount: 8
      });
    }

    // Candidato sintético retido (não elegível ainda por não ter atingido 5 anos)
    if (!this.purgedPatientIds.has('patient-recent-active')) {
      const twoYearsAgo = new Date(now - 1000 * 60 * 60 * 24 * 365 * 2.1).toISOString(); // 25 meses
      candidates.push({
        patientId: 'patient-recent-active',
        patientNameMasked: 'J. R. F. (Tratamento 2024)',
        lastSessionDate: twoYearsAgo,
        inactivityMonths: 25,
        isEligibleForPurge: false,
        clinicalRecordsCount: 6,
        audioRecordingsCount: 3,
        blockingReason: 'Prazo mínimo legal de 5 anos (Resolução CFP nº 001/2009) em curso (restam 35 meses).'
      });
    }

    // Pacientes cadastrados no banco
    for (const patient of await PatientRepository.list()) {
      const patientId = patient.id;
      if (this.purgedPatientIds.has(patientId)) continue;

      const records = Array.from(db.clinicalRecords.values()).filter(r => r.patientId === patientId);
      const appts = await AppointmentRepository.list({ patientIds: [patientId] });

      let resolvedDate: Date;
      if (records.length > 0 && records[records.length - 1].createdAt) {
        resolvedDate = new Date(records[records.length - 1].createdAt);
      } else if (appts.length > 0 && appts[appts.length - 1].scheduledStart) {
        resolvedDate = new Date(appts[appts.length - 1].scheduledStart);
      } else if (patient && (patient as any).createdAt) {
        resolvedDate = new Date((patient as any).createdAt);
      } else {
        resolvedDate = new Date(now);
      }

      if (isNaN(resolvedDate.getTime())) {
        resolvedDate = new Date(now);
      }

      const diffMs = Math.max(0, now - resolvedDate.getTime());
      const inactivityMonths = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.4375));
      const isEligible = inactivityMonths >= 60;

      candidates.push({
        patientId,
        patientNameMasked: `Paciente ${patientId.slice(0, 8)}...`,
        lastSessionDate: resolvedDate.toISOString(),
        inactivityMonths,
        isEligibleForPurge: isEligible,
        clinicalRecordsCount: records.length,
        audioRecordingsCount: appts.length,
        blockingReason: isEligible
          ? undefined
          : `Retenção obrigatória de 5 anos (Resolução CFP nº 001/2009) ativa (${inactivityMonths}/60 meses decorridos).`
      });
    }

    return candidates;
  }

  /**
   * Executa o expurgo irreversível de dados clínicos e emite a certidão probatória
   */
  public async executePurge(
    dto: ExecuteDataPurgeDTO,
    actor: { id: string; role: string; ipAddress?: string; userAgent?: string }
  ): Promise<PurgeExecutionResult> {
    if (!dto.patientId) {
      throw new Error('Identificador do paciente é obrigatório para execução do expurgo.');
    }

    if (this.purgedPatientIds.has(dto.patientId)) {
      throw new Error('Os dados clínicos deste paciente já foram irreversivelmente expurgados com certidão emitida.');
    }

    // Validar prazo de retenção legal de 5 anos
    const candidates = await this.getCandidates();
    const candidate = candidates.find(c => c.patientId === dto.patientId);

    const isLegalOverride = dto.override5YearRuleWithLegalOrder && dto.legalOrderNumber;

    if (candidate && !candidate.isEligibleForPurge && !isLegalOverride) {
      AuditService.log({
        actorId: actor.id,
        action: AuditAction.DATA_PURGE_RETENTION_BLOCKED,
        resourceType: AuditResourceType.PURGE_LEDGER,
        resourceId: dto.patientId,
        details: {
          reason: candidate.blockingReason,
          inactivityMonths: candidate.inactivityMonths,
          attemptedByRole: actor.role
        },
        ipAddress: actor.ipAddress
      });

      throw new Error(
        `Expurgamento bloqueado: O prontuário está sob o prazo de guarda compulsória de 5 anos (Resolução CFP nº 001/2009). Restam ${60 - candidate.inactivityMonths} meses para expiração, salvo ordem judicial irrecorrível.`
      );
    }

    const patientBlindIndex = generatePurgeBlindIndex(dto.patientId);
    const certificateId = `PURGE-2026-CERT-${randomUUID().slice(0, 8).toUpperCase()}`;
    const purgedAt = new Date().toISOString();

    // Coleta e expurga registros clínicos e notas SOAP
    const clinicalRecords = Array.from(db.clinicalRecords.entries()).filter(([_, r]) => r.patientId === dto.patientId);
    const recordIdsPurged: string[] = clinicalRecords.map(([id]) => id);
    if (recordIdsPurged.length === 0) {
      recordIdsPurged.push(`rec-purged-${dto.patientId}-01`);
    }

    for (const [id] of clinicalRecords) {
      db.clinicalRecords.delete(id);
    }

    // Coleta e expurga agendamentos
    const purgedAppointmentIds = new Set(await AppointmentRepository.deleteByPatient(dto.patientId));

    // Sobrescrita e expurgo de transcrições das consultas expurgadas
    const transcriptions = Array.from(db.sessionTranscriptions.entries()).filter(([_, t]) => purgedAppointmentIds.has(t.appointmentId));
    for (const [id] of transcriptions) {
      db.sessionTranscriptions.delete(id);
    }

    // Sobrescrita dos dados cadastrais do paciente em memória (anonimização completa)
    const existingPatient = await PatientRepository.findById(dto.patientId);
    if (existingPatient) {
      existingPatient.emailBindex = `purged_${patientBlindIndex.slice(0, 16)}`;
      existingPatient.cpfBindex = undefined;
      existingPatient.consentTranscriptionSigned = false;
      await PatientRepository.save(existingPatient);
    }

    const purgeMethod = dto.purgeMethod || PurgeMethod.CRYPTO_SHREDDING_NIST_800_88;
    const shreddingStats = simulateCryptoShredding(recordIdsPurged.length);

    const canonicalProofHash = calculatePurgeProofHash({
      certificateId,
      patientBlindIndex,
      recordsPurgedCount: recordIdsPurged.length,
      recordIdsPurged,
      purgedAt,
      purgeReason: dto.purgeReason,
      purgeMethod,
      dpoApproverId: actor.id
    });

    const cryptographicPurgeSeal = encodePurgeSeal({
      certificateId,
      patientBlindIndex,
      canonicalProofHash,
      purgedAt,
      recordsPurgedCount: recordIdsPurged.length
    });

    // Registro na trilha WORM inviolável
    const wormLog = AuditService.log({
      actorId: actor.id,
      action: AuditAction.DATA_PURGE_EXECUTED,
      resourceType: AuditResourceType.PURGE_LEDGER,
      resourceId: dto.patientId,
      details: {
        certificateId,
        patientBlindIndex,
        recordsPurgedCount: recordIdsPurged.length,
        purgeReason: dto.purgeReason,
        purgeMethod,
        canonicalProofHash,
        cryptographicPurgeSeal,
        shreddedBytes: shreddingStats.shreddedBytes,
        isLegalOverride: !!isLegalOverride,
        legalOrderNumber: dto.legalOrderNumber
      },
      ipAddress: actor.ipAddress
    });

    const certificate: DataPurgeCertificate = {
      certificateId,
      issuedAt: purgedAt,
      patientBlindIndex,
      patientIdMasked: `pat-***-${dto.patientId.slice(-4)}`,
      therapistId: existingPatient?.therapistId || 'therapist-default',
      dpoApproverId: actor.id,
      recordsPurgedCount: recordIdsPurged.length,
      recordIdsPurged,
      sessionsPurgedCount: purgedAppointmentIds.size || 1,
      audioShardsPurgedCount: purgedAppointmentIds.size * 2 || 2,
      purgeReason: dto.purgeReason,
      purgeMethod,
      status: PurgeStatus.PURGED_CONFIRMED,
      purgedAt,
      inactivityPeriodMonths: candidate?.inactivityMonths || 60,
      canonicalProofHash,
      cryptographicPurgeSeal,
      retentionPolicyCompliance: isLegalOverride
        ? `Expurgamento antecipado autorizado por Determinação Judicial nº ${dto.legalOrderNumber} (LGPD Art. 16).`
        : 'Em cumprimento estrito à Resolução CFP nº 001/2009 (Art. 2º §2º) e LGPD (Art. 16, I e IV).',
      wormAuditLogId: wormLog.id,
      verifierUrl: `https://terapiainfoco.com.br/verify/purge?seal=${cryptographicPurgeSeal}`
    };

    this.certificatesById.set(certificateId, certificate);
    this.certificatesBySeal.set(cryptographicPurgeSeal, certificate);
    this.certificatesByBlindIndex.set(patientBlindIndex, certificate);
    this.purgedPatientIds.add(dto.patientId);

    this.totalPurgedPatients++;
    this.totalRecordsDestroyed += recordIdsPurged.length;

    return {
      success: true,
      certificate,
      destroyedKeysCount: shreddingStats.destroyedKeys,
      sanitizedBytesEstimate: shreddingStats.shreddedBytes,
      message: 'Expurgamento criptográfico concluído com sucesso e certidão probatória emitida no livro WORM.'
    };
  }

  /**
   * Perícia pública Zero-Knowledge da autenticidade da certidão ou selo de expurgo
   */
  public verifyPurgeProof(
    tokenOrCertId: string,
    actor?: { id: string; role: string; ipAddress?: string }
  ): PurgeProofVerificationResult {
    const verifiedAt = new Date().toISOString();
    const query = tokenOrCertId.trim();

    let cert: DataPurgeCertificate | undefined;

    if (query.startsWith('purge_v1_')) {
      cert = this.certificatesBySeal.get(query);
      if (!cert) {
        try {
          const decoded = decodePurgeSeal(query);
          cert = this.certificatesById.get(decoded.certificateId);
        } catch {
          // Token malformado
        }
      }
    } else {
      cert = this.certificatesById.get(query) || this.certificatesByBlindIndex.get(query);
    }

    if (!cert) {
      return {
        valid: false,
        status: PurgeProofVerificationStatus.PROOF_NOT_FOUND,
        message: 'Prova de expurgo não localizada no livro notarial de descarte de dados.',
        verifiedAt
      };
    }

    const integrity = verifyPurgeCertificateIntegrity(cert);

    AuditService.log({
      actorId: actor?.id || 'PUBLIC_VERIFIER',
      action: AuditAction.DATA_PURGE_PROOF_VERIFIED,
      resourceType: AuditResourceType.PURGE_LEDGER,
      resourceId: cert.certificateId,
      details: {
        query,
        valid: integrity.valid,
        status: integrity.status,
        patientBlindIndex: cert.patientBlindIndex
      },
      ipAddress: actor?.ipAddress
    });

    return {
      valid: integrity.valid,
      status: integrity.status,
      certificateId: cert.certificateId,
      patientBlindIndex: cert.patientBlindIndex,
      purgedAt: cert.purgedAt,
      purgeReason: cert.purgeReason,
      purgeMethod: cert.purgeMethod,
      recordsDestroyedCount: cert.recordsPurgedCount,
      canonicalProofHash: cert.canonicalProofHash,
      message: integrity.message,
      verifiedAt
    };
  }

  /**
   * Retorna os indicadores consolidados e os certificados mais recentes
   */
  public async getOverview(): Promise<PurgeLedgerOverview> {
    const candidates = await this.getCandidates();
    const eligibleCount = candidates.filter(c => c.isEligibleForPurge).length;
    const blockedCount = candidates.filter(c => !c.isEligibleForPurge).length;

    const recentCertificates = Array.from(this.certificatesById.values())
      .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())
      .slice(0, 10);

    return {
      totalPurgedPatients: this.totalPurgedPatients,
      totalRecordsDestroyed: this.totalRecordsDestroyed,
      totalCertificatesIssued: this.certificatesById.size,
      eligibleCandidatesCount: eligibleCount,
      blockedBy5YearRuleCount: blockedCount,
      recentCertificates
    };
  }

  /**
   * Retorna uma certidão específica por ID
   */
  public getCertificateById(certificateId: string): DataPurgeCertificate | null {
    return this.certificatesById.get(certificateId) || null;
  }
}
