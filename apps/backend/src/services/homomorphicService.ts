import {
  AuditAction,
  AuditResourceType,
  Cid11Category,
  HomomorphicCohortStatus,
  HomomorphicSecurityLevel,
  type Cid11Item,
  type PaillierPublicKey,
  type PaillierPrivateKey,
  type PaillierKeyPair,
  type PatientEncryptedCidVector,
  type HomomorphicCohortAggregation,
  type HomomorphicDecryptedResult,
  type HomomorphicProofSeal,
  type HomomorphicMetrics,
  type HomomorphicOverview,
  type CreateHomomorphicCohortDTO,
  type DecryptCohortAggregationDTO
} from '@terapiainfoco/shared';
import {
  generatePaillierKeyPair,
  CID11_MENTAL_HEALTH_CATALOG,
  encryptPatientCidCohortVector,
  aggregateCohortHomomorphic,
  decryptCohortAggregation,
  createHomomorphicProofSeal,
  verifyHomomorphicProofSeal,
  verifyZkProofBit,
  paillierAdd
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class HomomorphicService {
  private static instance: HomomorphicService;

  private keyPair: PaillierKeyPair;
  private cohorts: Map<string, HomomorphicCohortAggregation> = new Map();
  private cohortVectors: Map<string, PatientEncryptedCidVector[]> = new Map();
  private proofSeals: Map<string, HomomorphicProofSeal> = new Map();
  private recentAudits: Array<{ id: string; action: string; timestamp: string; details: string }> = [];

  private metrics: HomomorphicMetrics = {
    totalCohorts: 0,
    totalPatientsHomomorphicallyProtected: 0,
    totalCiphertextOperations: 0,
    zeroDecryptionsWithoutAuth: 100,
    activeSecurityLevel: HomomorphicSecurityLevel.STANDARD_512_BIT,
    proofSealsVerified: 12
  };

  private constructor() {
    this.keyPair = generatePaillierKeyPair({
      securityLevel: HomomorphicSecurityLevel.STANDARD_512_BIT,
      keyId: 'phe_key_sp_clinic_central_v1'
    });
    this.seedInitialDemoData();
  }

  public static getInstance(): HomomorphicService {
    if (!HomomorphicService.instance) {
      HomomorphicService.instance = new HomomorphicService();
    }
    return HomomorphicService.instance;
  }

  /**
   * Inicializa dados de demonstração da clínica psicológica
   */
  private seedInitialDemoData(): void {
    const pubKey = this.keyPair.publicKey;

    // Coorte 1: Telepsicologia Sudeste (Ansiedade e Depressão)
    const cohort1Id = 'cohort_telepsico_sp_2026';
    const vectorsCohort1: PatientEncryptedCidVector[] = [];

    // Gerar 3 pacientes com perfis clínicos reais
    vectorsCohort1.push(
      encryptPatientCidCohortVector({
        patientBlindIndex: 'pt_blind_bf3a9e102',
        activeCidCodes: ['6A70', '6B00'], // Depressão e Ansiedade
        publicKey: pubKey
      }),
      encryptPatientCidCohortVector({
        patientBlindIndex: 'pt_blind_ec89d4411',
        activeCidCodes: ['6A70', '6B40'], // Depressão e TEPT
        publicKey: pubKey
      }),
      encryptPatientCidCohortVector({
        patientBlindIndex: 'pt_blind_71f40a993',
        activeCidCodes: ['6B00', 'MB40'], // Ansiedade e Burnout
        publicKey: pubKey
      })
    );

    const aggregated1 = aggregateCohortHomomorphic({
      patientVectors: vectorsCohort1,
      publicKey: pubKey
    });

    const seal1 = createHomomorphicProofSeal({
      cohortId: cohort1Id,
      aggregatedCiphertexts: aggregated1,
      totalRecords: vectorsCohort1.length,
      publicKey: pubKey
    });

    this.proofSeals.set(seal1.token, seal1);
    this.cohortVectors.set(cohort1Id, vectorsCohort1);

    this.cohorts.set(cohort1Id, {
      cohortId: cohort1Id,
      cohortName: 'Estudo Epidemiológico de Ansiedade e Depressão em Telepsicologia (Sudeste)',
      totalPatients: vectorsCohort1.length,
      aggregatedCiphertexts: aggregated1,
      status: HomomorphicCohortStatus.AGGREGATED_BLINDED,
      publicKeyId: pubKey.keyId,
      createdAt: '2026-09-15T10:00:00.000Z',
      aggregatedAt: '2026-09-15T10:05:00.000Z',
      proofSealToken: seal1.token
    });

    // Coorte 2: Burnout Tech Q3 (Coleta Ativa)
    const cohort2Id = 'cohort_burnout_tech_q3';
    const vectorsCohort2: PatientEncryptedCidVector[] = [
      encryptPatientCidCohortVector({
        patientBlindIndex: 'pt_blind_a144e5901',
        activeCidCodes: ['MB40', '6B20'], // Burnout e TOC
        publicKey: pubKey
      })
    ];

    const aggregated2 = aggregateCohortHomomorphic({
      patientVectors: vectorsCohort2,
      publicKey: pubKey
    });

    const seal2 = createHomomorphicProofSeal({
      cohortId: cohort2Id,
      aggregatedCiphertexts: aggregated2,
      totalRecords: vectorsCohort2.length,
      publicKey: pubKey
    });

    this.proofSeals.set(seal2.token, seal2);
    this.cohortVectors.set(cohort2Id, vectorsCohort2);

    this.cohorts.set(cohort2Id, {
      cohortId: cohort2Id,
      cohortName: 'Levantamento Longitudinal de Burnout e Esgotamento em Trabalhadores Remotos',
      totalPatients: vectorsCohort2.length,
      aggregatedCiphertexts: aggregated2,
      status: HomomorphicCohortStatus.COLLECTING,
      publicKeyId: pubKey.keyId,
      createdAt: '2026-10-01T08:30:00.000Z',
      aggregatedAt: '2026-10-01T08:35:00.000Z',
      proofSealToken: seal2.token
    });

    this.metrics.totalCohorts = 2;
    this.metrics.totalPatientsHomomorphicallyProtected = vectorsCohort1.length + vectorsCohort2.length;
    this.metrics.totalCiphertextOperations = (vectorsCohort1.length + vectorsCohort2.length) * CID11_MENTAL_HEALTH_CATALOG.length;
  }

  /**
   * Visão geral do módulo com métricas, coortes e catálogo
   */
  public getOverview(): HomomorphicOverview {
    return {
      metrics: { ...this.metrics },
      cohorts: Array.from(this.cohorts.values()),
      activePublicKey: { ...this.keyPair.publicKey },
      availableCidCatalog: CID11_MENTAL_HEALTH_CATALOG,
      recentAudits: [...this.recentAudits]
    };
  }

  public getCatalog(): Cid11Item[] {
    return CID11_MENTAL_HEALTH_CATALOG;
  }

  public getActivePublicKey(): PaillierPublicKey {
    return { ...this.keyPair.publicKey };
  }

  public getActivePrivateKey(): PaillierPrivateKey {
    return { ...this.keyPair.privateKey };
  }

  /**
   * Criação de uma nova coorte clínica
   */
  public async createCohort(
    dto: CreateHomomorphicCohortDTO,
    actorId = 'SYSTEM_DPO'
  ): Promise<HomomorphicCohortAggregation> {
    const cohortId = `cohort_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const pubKey = this.keyPair.publicKey;

    const emptyVectors: PatientEncryptedCidVector[] = [];
    const aggregated = aggregateCohortHomomorphic({
      patientVectors: emptyVectors,
      publicKey: pubKey
    });

    const seal = createHomomorphicProofSeal({
      cohortId,
      aggregatedCiphertexts: aggregated,
      totalRecords: 0,
      publicKey: pubKey
    });

    const newCohort: HomomorphicCohortAggregation = {
      cohortId,
      cohortName: dto.cohortName,
      totalPatients: 0,
      aggregatedCiphertexts: aggregated,
      status: HomomorphicCohortStatus.COLLECTING,
      publicKeyId: pubKey.keyId,
      createdAt: new Date().toISOString(),
      proofSealToken: seal.token
    };

    this.cohorts.set(cohortId, newCohort);
    this.cohortVectors.set(cohortId, emptyVectors);
    this.proofSeals.set(seal.token, seal);

    this.metrics.totalCohorts = this.cohorts.size;

    this.recordAudit({
      action: AuditAction.HOMOMORPHIC_COHORT_ENCRYPTED,
      details: `Nova coorte epidemiológica '${dto.cohortName}' criada com chave pública Paillier 512-bit.`
    });

    await AuditService.log({
      action: AuditAction.HOMOMORPHIC_COHORT_ENCRYPTED,
      resourceType: AuditResourceType.HOMOMORPHIC_ENCRYPTION_ENGINE,
      resourceId: cohortId,
      userId: actorId,
      details: {
        cohortName: dto.cohortName,
        publicKeyId: pubKey.keyId,
        sealToken: seal.token
      }
    });

    return newCohort;
  }

  /**
   * Adiciona e agrega o vetor cifrado de um paciente à coorte
   */
  public async addPatientVector(
    cohortId: string,
    vector: PatientEncryptedCidVector,
    actorId = 'SYSTEM_THERAPIST'
  ): Promise<HomomorphicCohortAggregation> {
    const cohort = this.cohorts.get(cohortId);
    if (!cohort) {
      throw new Error(`Coorte não encontrada: ${cohortId}`);
    }

    const pubKey = this.keyPair.publicKey;

    // Validação estrita das provas ZK para cada CID do vetor
    for (const item of CID11_MENTAL_HEALTH_CATALOG) {
      const c = vector.encryptedValues[item.code];
      const proof = vector.proofOfZeroOrOne[item.code];
      if (!c || !proof || !verifyZkProofBit(c, proof, pubKey)) {
        throw new Error(`Violação de prova ZK para o CID ${item.code}. Injeção maliciosa rejeitada.`);
      }
    }

    // Adição homomórfica dos valores cifrados aos acumuladores da coorte
    const updatedAggregated: Record<string, string> = {};
    for (const item of CID11_MENTAL_HEALTH_CATALOG) {
      const existingCipher = cohort.aggregatedCiphertexts[item.code];
      const newPatientCipher = vector.encryptedValues[item.code];

      if (existingCipher) {
        updatedAggregated[item.code] = paillierAdd(existingCipher, newPatientCipher, pubKey);
      } else {
        updatedAggregated[item.code] = newPatientCipher;
      }
    }

    const vectorsList = this.cohortVectors.get(cohortId) || [];
    vectorsList.push(vector);
    this.cohortVectors.set(cohortId, vectorsList);

    const newTotal = vectorsList.length;

    // Novo selo probatório com o digest atualizado
    const newSeal = createHomomorphicProofSeal({
      cohortId,
      aggregatedCiphertexts: updatedAggregated,
      totalRecords: newTotal,
      publicKey: pubKey
    });

    this.proofSeals.set(newSeal.token, newSeal);

    cohort.totalPatients = newTotal;
    cohort.aggregatedCiphertexts = updatedAggregated;
    cohort.aggregatedAt = new Date().toISOString();
    cohort.proofSealToken = newSeal.token;
    cohort.status = HomomorphicCohortStatus.AGGREGATED_BLINDED;

    this.metrics.totalPatientsHomomorphicallyProtected += 1;
    this.metrics.totalCiphertextOperations += CID11_MENTAL_HEALTH_CATALOG.length;

    this.recordAudit({
      action: AuditAction.HOMOMORPHIC_AGGREGATION_COMPUTED,
      details: `Vetor do paciente ${vector.patientBlindIndex} adicionado e somado homomorficamente à coorte ${cohortId}.`
    });

    await AuditService.log({
      action: AuditAction.HOMOMORPHIC_AGGREGATION_COMPUTED,
      resourceType: AuditResourceType.HOMOMORPHIC_ENCRYPTION_ENGINE,
      resourceId: cohortId,
      userId: actorId,
      details: {
        patientBlindIndex: vector.patientBlindIndex,
        totalPatients: newTotal,
        sealToken: newSeal.token
      }
    });

    return cohort;
  }

  /**
   * Simulação rápida de adição de paciente a partir de seleção de CIDs
   */
  public async simulateAddPatient(
    cohortId: string,
    diagnosesCidCodes: string[],
    actorId = 'SYSTEM_THERAPIST'
  ): Promise<HomomorphicCohortAggregation> {
    const blindIndex = `pt_blind_${Math.random().toString(36).substring(2, 10)}`;
    const vector = encryptPatientCidCohortVector({
      patientBlindIndex: blindIndex,
      activeCidCodes: diagnosesCidCodes,
      publicKey: this.keyPair.publicKey
    });

    return this.addPatientVector(cohortId, vector, actorId);
  }

  /**
   * Decifragem autorizada com validação ética do CEP/CONEP/DPO
   */
  public async decryptCohort(
    dto: DecryptCohortAggregationDTO,
    actorId = 'SYSTEM_DPO'
  ): Promise<HomomorphicDecryptedResult> {
    const cohort = this.cohorts.get(dto.cohortId);
    if (!cohort) {
      throw new Error(`Coorte não encontrada: ${dto.cohortId}`);
    }

    if (!dto.ethicsApprovalCode || dto.ethicsApprovalCode.trim().length < 5) {
      throw new Error('Código de aprovação ética do CEP/CONEP é obrigatório para decifragem epidemiológica (LGPD Art. 13).');
    }

    const pubKey = this.keyPair.publicKey;
    const privKey = this.keyPair.privateKey;

    // Validação da chave privada informada
    if (dto.privateKeyLambda !== privKey.lambda || dto.privateKeyMu !== privKey.mu) {
      throw new Error('Chave privada de decifragem homomórfica inválida ou não autorizada para esta coorte.');
    }

    const { results } = decryptCohortAggregation({
      aggregatedCiphertexts: cohort.aggregatedCiphertexts,
      totalPatients: cohort.totalPatients,
      privateKey: privKey,
      publicKey: pubKey,
      authorizedBy: dto.authorizedBy,
      ethicsApprovalCode: dto.ethicsApprovalCode
    });

    cohort.status = HomomorphicCohortStatus.DECRYPTED_AUTHORIZED;
    cohort.decryptedAt = new Date().toISOString();

    const decryptedResult: HomomorphicDecryptedResult = {
      cohortId: dto.cohortId,
      totalPatients: cohort.totalPatients,
      results,
      decryptedAt: cohort.decryptedAt,
      authorizedBy: dto.authorizedBy,
      ethicsApprovalCode: dto.ethicsApprovalCode
    };

    this.recordAudit({
      action: AuditAction.HOMOMORPHIC_RESULT_DECRYPTED,
      details: `Coorte ${dto.cohortId} decifrada com autorização ética '${dto.ethicsApprovalCode}' por '${dto.authorizedBy}'.`
    });

    await AuditService.log({
      action: AuditAction.HOMOMORPHIC_RESULT_DECRYPTED,
      resourceType: AuditResourceType.HOMOMORPHIC_ENCRYPTION_ENGINE,
      resourceId: dto.cohortId,
      userId: actorId,
      details: {
        ethicsApprovalCode: dto.ethicsApprovalCode,
        authorizedBy: dto.authorizedBy,
        totalPatients: cohort.totalPatients
      }
    });

    return decryptedResult;
  }

  /**
   * Verificação pericial do selo probatório WORM
   */
  public async verifySeal(
    proofSealToken: string,
    actorId = 'SYSTEM_AUDITOR'
  ): Promise<{
    isValid: boolean;
    seal?: HomomorphicProofSeal;
    cohort?: HomomorphicCohortAggregation;
    message: string;
    verifiedAt: string;
  }> {
    const seal = this.proofSeals.get(proofSealToken);
    if (!seal) {
      return {
        isValid: false,
        message: 'Selo probatório não encontrado na base de registro notarial.',
        verifiedAt: new Date().toISOString()
      };
    }

    const cohort = this.cohorts.get(seal.cohortId);
    if (!cohort) {
      return {
        isValid: false,
        seal,
        message: 'Coorte associada ao selo não encontrada.',
        verifiedAt: new Date().toISOString()
      };
    }

    const isValid = verifyHomomorphicProofSeal({
      seal,
      aggregatedCiphertexts: cohort.aggregatedCiphertexts,
      publicKey: this.keyPair.publicKey
    });

    if (isValid) {
      this.metrics.proofSealsVerified += 1;
    }

    this.recordAudit({
      action: AuditAction.HOMOMORPHIC_PROOF_VERIFIED,
      details: `Selo probatório ${proofSealToken} verificado: ${isValid ? 'VÁLIDO' : 'ADULTERADO'}.`
    });

    await AuditService.log({
      action: AuditAction.HOMOMORPHIC_PROOF_VERIFIED,
      resourceType: AuditResourceType.HOMOMORPHIC_ENCRYPTION_ENGINE,
      resourceId: seal.cohortId,
      userId: actorId,
      details: {
        sealToken: proofSealToken,
        isValid
      }
    });

    return {
      isValid,
      seal,
      cohort,
      message: isValid
        ? 'Selo probatório 100% autêntico e matematicamente íntegro (HMAC-SHA256 validado).'
        : 'Assinatura inválida ou textos cifrados adulterados após a emissão do selo.',
      verifiedAt: new Date().toISOString()
    };
  }

  private recordAudit(params: { action: string; details: string }): void {
    this.recentAudits.unshift({
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      action: params.action,
      timestamp: new Date().toISOString(),
      details: params.details
    });

    if (this.recentAudits.length > 30) {
      this.recentAudits.pop();
    }
  }
}
