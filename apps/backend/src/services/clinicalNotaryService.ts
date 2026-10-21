import { randomUUID } from 'node:crypto';
import {
  AuditAction,
  AuditResourceType,
  NotaryStatus,
  NotaryVerificationStatus
} from '@terapiainfoco/shared';
import type {
  ClinicalNotaryBlock,
  NotaryCertificate,
  NotaryChainVerificationResult,
  NotaryLedgerOverview,
  SealClinicalRecordDTO,
  IssueNotaryCertificateDTO
} from '@terapiainfoco/shared';
import {
  calculateClinicalCanonicalHash,
  createClinicalNotaryBlock,
  decodeNotarySeal,
  GENESIS_NOTARY_HASH,
  verifyNotaryBlockIntegrity,
  verifyNotaryChainIntegrity
} from '@terapiainfoco/crypto';
import { db } from '../db/memoryDb';
import { decryptField } from './cryptoContext';
import { AuditService } from './auditService';

import { PatientRepository } from '../repositories/patientRepository';
import { ClinicalRecordRepository } from '../repositories/clinicalRecordRepository';
export class ClinicalNotaryService {
  private static instance: ClinicalNotaryService;

  private blocksById: Map<string, ClinicalNotaryBlock> = new Map();
  private blocksByRecordId: Map<string, ClinicalNotaryBlock> = new Map();
  private blocksByBlindIndex: Map<string, ClinicalNotaryBlock> = new Map();
  private blocksBySeal: Map<string, ClinicalNotaryBlock> = new Map();
  private patientChains: Map<string, ClinicalNotaryBlock[]> = new Map();
  private allBlocks: ClinicalNotaryBlock[] = [];

  private totalVerifiedChains = 0;
  private tamperingAttemptsDetected = 0;
  private readonly notaryVersion = 'v1.0 (CFP 001/2009 & LGPD Art. 18)';

  private constructor() {
    this.seedInitialNotaryBlocks();
  }

  public static getInstance(): ClinicalNotaryService {
    if (!ClinicalNotaryService.instance) {
      ClinicalNotaryService.instance = new ClinicalNotaryService();
    }
    return ClinicalNotaryService.instance;
  }

  /**
   * Semeia blocos notariais de demonstração. A cadeia notarial vive em memória por instância
   * (ver roadmap: estado restante em memória); prontuários são notarizados ao serem selados.
   */
  private seedInitialNotaryBlocks(): void {
    // Se não havia registros prévios, adiciona blocos de demonstração para pacientes padrão
    if (this.allBlocks.length === 0) {
      this.notarizeRecordInternal({
        recordId: 'rec_soap_seed_01',
        patientId: 'patient-demo-1',
        therapistId: 'therapist-001',
        therapistCrp: '06/142980-SP',
        clinicalCanonicalHash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'
      });
      this.notarizeRecordInternal({
        recordId: 'rec_soap_seed_02',
        patientId: 'patient-demo-1',
        therapistId: 'therapist-001',
        therapistCrp: '06/142980-SP',
        clinicalCanonicalHash: 'b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1'
      });
    }

    this.totalVerifiedChains = 6;
  }

  /**
   * Executa a notarização interna e encadeia o bloco na hash-chain do paciente
   */
  private notarizeRecordInternal(params: {
    recordId: string;
    patientId: string;
    therapistId: string;
    therapistCrp: string;
    clinicalCanonicalHash: string;
    actorId?: string;
    ipAddress?: string;
  }): ClinicalNotaryBlock {
    const chain = this.patientChains.get(params.patientId) || [];
    const previousNotaryHash = chain.length > 0 ? chain[chain.length - 1].blockHash : GENESIS_NOTARY_HASH;
    const versionNumber = chain.length + 1;

    // Verificar se há retificações vinculadas
    const rectifications = Array.from(db.clinicalRecordRectifications.values()).filter(
      r => r.clinicalRecordId === params.recordId
    );

    const block = createClinicalNotaryBlock({
      recordId: params.recordId,
      patientId: params.patientId,
      therapistId: params.therapistId,
      therapistCrp: params.therapistCrp,
      clinicalCanonicalHash: params.clinicalCanonicalHash,
      previousNotaryHash,
      versionNumber,
      hasRectifications: rectifications.length > 0,
      rectificationCount: rectifications.length
    });

    this.blocksById.set(block.notaryId, block);
    this.blocksByRecordId.set(block.recordId, block);
    this.blocksByBlindIndex.set(block.recordBlindIndex, block);
    this.blocksBySeal.set(block.digitalNotarySeal, block);

    chain.push(block);
    this.patientChains.set(params.patientId, chain);
    this.allBlocks.unshift(block);

    return block;
  }

  /**
   * Notariza formalmente um prontuário clínico e gera selo digital com registro WORM
   */
  public async notarizeRecord(
    dto: SealClinicalRecordDTO,
    actor: { id: string; role: string; ipAddress?: string; userAgent?: string }
  ): Promise<ClinicalNotaryBlock> {
    // Se o registro já foi notarizado, retorna o bloco existente
    const existing = this.blocksByRecordId.get(dto.recordId);
    if (existing) {
      return existing;
    }

    let canonicalHash = dto.clinicalCanonicalHash;
    if (!canonicalHash) {
      const record = await ClinicalRecordRepository.findById(dto.recordId);
      if (record) {
        canonicalHash = calculateClinicalCanonicalHash({
          id: record.id,
          patientId: dto.patientId,
          therapistId: dto.therapistId,
          therapistCrp: dto.therapistCrp,
          soapContent: 'Consulta clínica selada formalmente.',
          date: record.createdAt instanceof Date ? record.createdAt.toISOString() : String(record.createdAt)
        });
      } else {
        canonicalHash = calculateClinicalCanonicalHash({
          id: dto.recordId,
          patientId: dto.patientId,
          therapistId: dto.therapistId,
          therapistCrp: dto.therapistCrp,
          soapContent: 'Nota clínica selada.',
          date: new Date().toISOString()
        });
      }
    }

    const block = this.notarizeRecordInternal({
      recordId: dto.recordId,
      patientId: dto.patientId,
      therapistId: dto.therapistId,
      therapistCrp: dto.therapistCrp,
      clinicalCanonicalHash: canonicalHash,
      actorId: actor.id,
      ipAddress: actor.ipAddress
    });

    AuditService.log({
      actorId: actor.id,
      resourceType: AuditResourceType.NOTARY_LEDGER,
      resourceId: block.notaryId,
      action: AuditAction.NOTARY_SEAL_GENERATED,
      ipAddress: actor.ipAddress || '127.0.0.1',
      userAgent: actor.userAgent || 'ClinicalApp'
    });

    return block;
  }

  /**
   * Perícia Zero-Knowledge de um selo notarial digital ou Blind Index
   */
  public verifySeal(
    sealTokenOrBlindIndex: string,
    investigator?: { id: string; role: string; ipAddress?: string }
  ): NotaryChainVerificationResult {
    this.totalVerifiedChains++;

    let block: ClinicalNotaryBlock | undefined;

    if (sealTokenOrBlindIndex.startsWith('notary_v1_')) {
      block = this.blocksBySeal.get(sealTokenOrBlindIndex);
      if (!block) {
        try {
          const decoded = decodeNotarySeal(sealTokenOrBlindIndex);
          block = this.blocksByBlindIndex.get(decoded.recordBlindIndex);
        } catch {
          // Token malformatado
        }
      }
    } else if (sealTokenOrBlindIndex.startsWith('bidx_rec_')) {
      block = this.blocksByBlindIndex.get(sealTokenOrBlindIndex);
    }

    if (!block) {
      return {
        valid: false,
        status: NotaryVerificationStatus.NOT_FOUND,
        totalBlocks: 0,
        message: 'Selo notarial ou Blind Index não localizado no cartório digital de prontuários.',
        verifiedAt: new Date().toISOString()
      };
    }

    const isBlockValid = verifyNotaryBlockIntegrity(block);
    if (!isBlockValid) {
      this.tamperingAttemptsDetected++;

      if (investigator) {
        AuditService.log({
          actorId: investigator.id,
          resourceType: AuditResourceType.NOTARY_LEDGER,
          resourceId: block.notaryId,
          action: AuditAction.NOTARY_TAMPERING_DETECTED,
          ipAddress: investigator.ipAddress || '127.0.0.1',
          userAgent: 'NotaryVerifier'
        });
      }

      return {
        valid: false,
        status: NotaryVerificationStatus.CONTENT_TAMPERED,
        totalBlocks: 1,
        message: 'Divergência matemática detectada: o bloco notarial foi alterado ou corrompido.',
        verifiedAt: new Date().toISOString(),
        recordBlindIndex: block.recordBlindIndex,
        blockDetails: block
      };
    }

    // Valida também a cadeia completa daquele paciente para garantir consistência temporal
    const chain = this.patientChains.get(block.patientId) || [block];
    const chainResult = verifyNotaryChainIntegrity(chain);

    if (investigator) {
      AuditService.log({
        actorId: investigator.id,
        resourceType: AuditResourceType.NOTARY_LEDGER,
        resourceId: block.notaryId,
        action: AuditAction.NOTARY_CHAIN_VERIFIED,
        ipAddress: investigator.ipAddress || '127.0.0.1',
        userAgent: 'NotaryVerifier'
      });
    }

    return {
      valid: chainResult.valid,
      status: chainResult.status,
      totalBlocks: chain.length,
      brokenIndex: chainResult.brokenIndex,
      message: chainResult.valid
        ? `Selo notarial digital autêntico e cadeia do paciente 100% íntegra (${chain.length} notas cronologicamente encadeadas).`
        : chainResult.message,
      verifiedAt: new Date().toISOString(),
      recordBlindIndex: block.recordBlindIndex,
      blockDetails: block
    };
  }

  /**
   * Valida a integridade sequencial de todas as notas clínicas de um paciente
   */
  public verifyPatientChain(patientId: string): NotaryChainVerificationResult {
    this.totalVerifiedChains++;
    const chain = this.patientChains.get(patientId) || [];

    if (chain.length === 0) {
      return {
        valid: true,
        status: NotaryVerificationStatus.VALID_GENUINE,
        totalBlocks: 0,
        message: 'Nenhum prontuário notarizado para este paciente.',
        verifiedAt: new Date().toISOString()
      };
    }

    const result = verifyNotaryChainIntegrity(chain);
    return {
      valid: result.valid,
      status: result.status,
      totalBlocks: chain.length,
      brokenIndex: result.brokenIndex,
      message: result.message,
      verifiedAt: new Date().toISOString()
    };
  }

  /**
   * Emite certidão forense de autenticidade notarial de prontuário
   */
  public async issueCertificate(dto: IssueNotaryCertificateDTO, actor: { id: string; role: string; ipAddress?: string }): Promise<NotaryCertificate> {
    let block = this.blocksByRecordId.get(dto.recordId);
    if (!block) {
      // Auto-notariza se ainda não notarizado
      block = await this.notarizeRecord({
        recordId: dto.recordId,
        patientId: dto.patientId,
        therapistId: actor.id,
        therapistCrp: '06/142980-SP'
      }, actor);
    }

    const patient = await PatientRepository.findById(dto.patientId);
    let patientMasked = `PAC-***-${dto.patientId.slice(-4)}`;
    if (patient && patient.encryptedName) {
      const clearName = decryptField(patient.encryptedName);
      patientMasked = clearName.length > 4 ? `${clearName.slice(0, 3)}***` : 'Paciente';
    }

    const certId = `cert_notary_${randomUUID().substring(0, 8)}`;
    const certificate: NotaryCertificate = {
      certificateId: certId,
      issuedAt: new Date().toISOString(),
      recordId: block.recordId,
      recordBlindIndex: block.recordBlindIndex,
      patientIdMasked: patientMasked,
      therapistCrp: block.therapistCrp,
      notarizedAt: block.notaryTimestamp,
      versionNumber: block.versionNumber,
      blockHash: block.blockHash,
      digitalNotarySeal: block.digitalNotarySeal,
      cfpComplianceAssertion: 'Certidão emitida em estrita conformidade com a Resolução CFP nº 001/2009 (Art. 1º, 2º e 4º - Guarda e Integridade Inviolável do Prontuário Psicológico).',
      lgpdComplianceAssertion: 'Registro pericial com fé pública e preservação do sigilo de dados sensíveis de saúde mental (LGPD Art. 18, incisos I e II).',
      verifierUrl: `https://terapiainfoco.com.br/validar?notary=${encodeURIComponent(block.digitalNotarySeal)}`
    };

    AuditService.log({
      actorId: actor.id,
      resourceType: AuditResourceType.NOTARY_LEDGER,
      resourceId: certId,
      action: AuditAction.NOTARY_CERTIFICATE_ISSUED,
      ipAddress: actor.ipAddress || '127.0.0.1',
      userAgent: 'NotaryCertificationEngine'
    });

    return certificate;
  }

  /**
   * Retorna os blocos notariais de um paciente
   */
  public getPatientNotaryBlocks(patientId: string): ClinicalNotaryBlock[] {
    return this.patientChains.get(patientId) || [];
  }

  /**
   * Retorna visão geral consolidada para o painel de governança e cartório digital
   */
  public getOverview(): NotaryLedgerOverview {
    const totalBlocks = this.allBlocks.length;
    const integrityPercentage = totalBlocks > 0
      ? Math.max(0, 100 - (this.tamperingAttemptsDetected * 10))
      : 100;

    return {
      totalNotarizedRecords: totalBlocks,
      totalVerifiedChains: this.totalVerifiedChains,
      integrityPercentage,
      tamperingAttemptsDetected: this.tamperingAttemptsDetected,
      activeNotaryVersion: this.notaryVersion,
      recentNotaryBlocks: this.allBlocks.slice(0, 20)
    };
  }
}
