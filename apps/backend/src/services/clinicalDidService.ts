import { randomUUID } from 'node:crypto';
import {
  AuditAction,
  AuditResourceType,
  ClinicalDidMethod,
  VerifiableCredentialType,
  CredentialRevocationStatus,
  DidVerificationStatus,
  type W3CDidDocument,
  type W3CVerifiableCredential,
  type W3CVerifiablePresentation,
  type IssueVerifiableCredentialDTO,
  type RevokeVerifiableCredentialDTO,
  type DidFederationOverview,
  type VerifiableCredentialVerificationResult
} from '@terapiainfoco/shared';
import {
  formatTherapistDid,
  generateEphemeralDidKey,
  generateDidDocument,
  signVerifiableCredential,
  decodeCredentialJwt,
  verifyVerifiableCredentialProof,
  verifyVerifiablePresentation,
  computeBlindIndex
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';
import { db } from '../db/memoryDb';

export class ClinicalDidService {
  private static instance: ClinicalDidService;

  private didDocuments: Map<string, W3CDidDocument> = new Map();
  private credentialsById: Map<string, W3CVerifiableCredential> = new Map();
  private credentialsByJwt: Map<string, W3CVerifiableCredential> = new Map();
  private credentialsByPatient: Map<string, string[]> = new Map();
  private revokedCredentialIds: Set<string> = new Set();

  private totalVerifiedCount = 0;

  private constructor() {
    this.seedDemoFederationData();
  }

  public static getInstance(): ClinicalDidService {
    if (!ClinicalDidService.instance) {
      ClinicalDidService.instance = new ClinicalDidService();
    }
    return ClinicalDidService.instance;
  }

  /**
   * Semeia dados iniciais para a federação de identidades e credenciais verificáveis
   */
  private seedDemoFederationData(): void {
    // 1. DID do Terapeuta Titular Padrão
    const defaultCrp = '123456';
    const defaultRegion = '06';
    const therapistDid = formatTherapistDid(defaultCrp, defaultRegion);
    const didDoc = generateDidDocument(therapistDid);
    this.didDocuments.set(therapistDid, didDoc);

    // 2. DID de Terapeuta Convidado / Psiquiatra Parceiro
    const psychiatristDid = 'did:terapiainfoco:crp-06-987654';
    this.didDocuments.set(psychiatristDid, generateDidDocument(psychiatristDid));

    // 3. Credencial Inicial 1: Habilitação Profissional e-Psi
    const licenseCred = signVerifiableCredential({
      id: 'urn:uuid:cred-license-2026-001',
      type: ['VerifiableCredential', VerifiableCredentialType.PSYCHOLOGIST_LICENSE_CREDENTIAL],
      issuer: 'did:terapiainfoco:governance:cfp-authority',
      issuanceDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString(), // 60 dias atrás
      expirationDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 300).toISOString(),
      credentialSubject: {
        id: therapistDid,
        therapistCrp: '06/123456',
        therapistName: 'Dra. Helena Martins',
        clinicalSpecialty: 'Psicologia Clínica & TCC',
        cfpResolutionCompliance: 'Resolução CFP nº 011/2018 (Cadastro e-Psi Habilitado)',
        additionalClaims: {
          ePsiRegistration: 'EPSI-2026-SP-9912',
          nationalRegister: 'CFP-BR-44129',
          activeLicense: true
        }
      }
    });

    this.credentialsById.set(licenseCred.id, licenseCred);
    if (licenseCred.jwtRepresentation) {
      this.credentialsByJwt.set(licenseCred.jwtRepresentation, licenseCred);
    }

    // 4. Credencial Inicial 2: Guia de Encaminhamento Clínico Verificável
    const demoPatientId = 'patient-demo-uuid-1';
    const patientBlindIndex = computeBlindIndex(demoPatientId, 'PATIENT_BLIND_INDEX_SALT');
    const referralCred = signVerifiableCredential({
      id: 'urn:uuid:cred-referral-2026-042',
      type: ['VerifiableCredential', VerifiableCredentialType.CLINICAL_REFERRAL_CREDENTIAL],
      issuer: therapistDid,
      issuanceDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(), // 10 dias atrás
      expirationDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 50).toISOString(),
      credentialSubject: {
        id: `urn:terapiainfoco:blind:${patientBlindIndex}`,
        therapistCrp: '06/123456',
        therapistName: 'Dra. Helena Martins',
        patientBlindIndex,
        patientNameMasked: 'L. M. S.',
        targetSpecialistType: 'PSIQUIATRA',
        referralReason: 'Encaminhamento para avaliação de suporte psicofarmacológico associado à psicoterapia',
        cidOrCid11Category: 'F32.1 - Episódio depressivo moderado',
        cfpResolutionCompliance: 'Resolução CFP nº 006/2019 Art. 4º'
      }
    });

    this.credentialsById.set(referralCred.id, referralCred);
    if (referralCred.jwtRepresentation) {
      this.credentialsByJwt.set(referralCred.jwtRepresentation, referralCred);
    }
    this.credentialsByPatient.set(demoPatientId, [referralCred.id]);
  }

  /**
   * Resolve um DID para seu respectivo DID Document
   */
  public async resolveDid(did: string): Promise<W3CDidDocument | null> {
    if (!did || typeof did !== 'string') return null;

    // Se já estiver no registro interno
    if (this.didDocuments.has(did)) {
      return this.didDocuments.get(did)!;
    }

    // Se for um did:terapiainfoco dinâmico
    if (did.startsWith('did:terapiainfoco:')) {
      const doc = generateDidDocument(did);
      this.didDocuments.set(did, doc);

      await AuditService.log({
        action: AuditAction.DID_DOCUMENT_RESOLVED,
        resourceType: AuditResourceType.CLINICAL_FEDERATION_DID,
        resourceId: did,
        actorId: 'system',
        details: { method: ClinicalDidMethod.DID_TERAPIAINFOCO, did }
      });

      return doc;
    }

    // Se for um did:key
    if (did.startsWith('did:key:')) {
      const doc = generateDidDocument(did);
      this.didDocuments.set(did, doc);

      await AuditService.log({
        action: AuditAction.DID_DOCUMENT_RESOLVED,
        resourceType: AuditResourceType.CLINICAL_FEDERATION_DID,
        resourceId: did,
        actorId: 'system',
        details: { method: ClinicalDidMethod.DID_KEY, did }
      });

      return doc;
    }

    return null;
  }

  /**
   * Emite uma Verifiable Credential assinada digitalmente
   */
  public async issueCredential(dto: IssueVerifiableCredentialDTO): Promise<{ credential: W3CVerifiableCredential; jwtToken: string }> {
    const therapistDid = formatTherapistDid(dto.therapistCrp);
    await this.resolveDid(therapistDid);

    // Pseudonimiza o paciente para garantir Zero-Knowledge
    const patientBlindIndex = computeBlindIndex(dto.patientId, 'PATIENT_BLIND_INDEX_SALT');
    
    // Obtém o nome mascarado do paciente se cadastrado
    const patientRecord = db.patients.get(dto.patientId);
    const patientNameMasked = patientRecord 
      ? `Paciente [${dto.patientId.slice(0, 4)}••••${dto.patientId.slice(-4)}]` 
      : 'Paciente Pseudonimizado';

    const credentialId = `urn:uuid:${randomUUID()}`;
    const issuanceDate = new Date().toISOString();
    const expirationMonths = dto.expirationMonths ?? 6;
    const expirationDate = new Date(Date.now() + expirationMonths * 30 * 86400000).toISOString();

    const subjectId = dto.subjectId || `urn:terapiainfoco:blind:${patientBlindIndex}`;

    const credential = signVerifiableCredential({
      id: credentialId,
      type: ['VerifiableCredential', dto.credentialType],
      issuer: therapistDid,
      issuanceDate,
      expirationDate,
      credentialSubject: {
        id: subjectId,
        therapistCrp: dto.therapistCrp,
        therapistName: dto.therapistName,
        patientBlindIndex,
        patientNameMasked,
        clinicalSpecialty: dto.clinicalSpecialty || 'Psicologia Clínica',
        ...(dto.referralReason ? { referralReason: dto.referralReason } : {}),
        ...(dto.targetSpecialistType ? { targetSpecialistType: dto.targetSpecialistType } : {}),
        ...(dto.cidOrCid11Category ? { cidOrCid11Category: dto.cidOrCid11Category } : {}),
        cfpResolutionCompliance: 'Resolução CFP nº 006/2019 e LGPD Art. 11/18',
        ...(dto.additionalClaims ? { additionalClaims: dto.additionalClaims } : {})
      },
      credentialStatus: {
        id: `https://terapiainfoco.com.br/api/did/credentials/${credentialId}/status`,
        type: 'StatusList2021',
        status: CredentialRevocationStatus.ACTIVE
      }
    });

    // Salva no registro
    this.credentialsById.set(credentialId, credential);
    if (credential.jwtRepresentation) {
      this.credentialsByJwt.set(credential.jwtRepresentation, credential);
    }

    const patientCreds = this.credentialsByPatient.get(dto.patientId) || [];
    patientCreds.push(credentialId);
    this.credentialsByPatient.set(dto.patientId, patientCreds);

    // Registro na trilha WORM imutável
    await AuditService.log({
      action: AuditAction.VERIFIABLE_CREDENTIAL_ISSUED,
      resourceType: AuditResourceType.CLINICAL_FEDERATION_DID,
      resourceId: credentialId,
      actorId: dto.therapistId,
      details: {
        credentialType: dto.credentialType,
        issuerDid: therapistDid,
        subjectId,
        canonicalHash: credential.proof.canonicalHash,
        expirationDate
      }
    });

    return {
      credential,
      jwtToken: credential.jwtRepresentation || ''
    };
  }

  /**
   * Verifica uma credencial verificável ou apresentação W3C
   */
  public async verifyCredential(payload: string, expectedNonce?: string): Promise<VerifiableCredentialVerificationResult> {
    this.totalVerifiedCount++;
    const trimmed = payload.trim();

    // 1. Caso o payload seja um ID já emitido
    if (this.credentialsById.has(trimmed)) {
      const stored = this.credentialsById.get(trimmed)!;
      return verifyVerifiableCredentialProof(stored, undefined, (id) => this.revokedCredentialIds.has(id));
    }

    // 2. Caso seja um JWT
    if (trimmed.startsWith('eyJ') && trimmed.includes('.')) {
      try {
        const decodedVc = decodeCredentialJwt(trimmed);
        const result = verifyVerifiableCredentialProof(
          decodedVc,
          undefined,
          (id) => this.revokedCredentialIds.has(id)
        );

        await AuditService.log({
          action: AuditAction.VERIFIABLE_CREDENTIAL_VERIFIED,
          resourceType: AuditResourceType.CLINICAL_FEDERATION_DID,
          resourceId: decodedVc.id,
          actorId: 'verifier-public',
          details: { valid: result.valid, status: result.status, issuerDid: result.issuerDid }
        });

        return result;
      } catch (err: any) {
        return {
          valid: false,
          status: DidVerificationStatus.SIGNATURE_INVALID,
          tamperingDetected: true,
          revocationStatus: CredentialRevocationStatus.ACTIVE,
          message: `Falha ao decodificar token JWT: ${err.message}`,
          verifiedAt: new Date().toISOString()
        };
      }
    }

    // 3. Caso seja JSON serializado
    try {
      const parsed = JSON.parse(trimmed);

      // Se for uma Apresentação Verificável (VP)
      if (Array.isArray(parsed.type) && parsed.type.includes('VerifiablePresentation')) {
        const vp = parsed as W3CVerifiablePresentation;
        const vpResult = verifyVerifiablePresentation(vp, expectedNonce);
        const firstCredResult = vpResult.credentialsResults[0] || {
          valid: false,
          status: DidVerificationStatus.SIGNATURE_INVALID,
          tamperingDetected: true,
          revocationStatus: CredentialRevocationStatus.ACTIVE,
          message: vpResult.message,
          verifiedAt: new Date().toISOString()
        };

        return {
          ...firstCredResult,
          valid: vpResult.valid,
          message: vpResult.message
        };
      }

      // Se for uma Credencial Verificável (VC)
      if (parsed.proof && parsed.credentialSubject) {
        const vc = parsed as W3CVerifiableCredential;
        return verifyVerifiableCredentialProof(vc, undefined, (id) => this.revokedCredentialIds.has(id));
      }
    } catch {
      // Formato não reconhecido
    }

    return {
      valid: false,
      status: DidVerificationStatus.SIGNATURE_INVALID,
      tamperingDetected: true,
      revocationStatus: CredentialRevocationStatus.ACTIVE,
      message: 'Payload inválido: formato de credencial W3C ou JWT não reconhecido.',
      verifiedAt: new Date().toISOString()
    };
  }

  /**
   * Revoga uma credencial verificável formalmente com registro na trilha WORM
   */
  public async revokeCredential(dto: RevokeVerifiableCredentialDTO): Promise<{ success: boolean; credentialId: string; revokedAt: string; message: string }> {
    const cred = this.credentialsById.get(dto.credentialId);
    if (!cred) {
      throw new Error(`Credencial ${dto.credentialId} não encontrada no repositório federado.`);
    }

    this.revokedCredentialIds.add(dto.credentialId);
    if (cred.credentialStatus) {
      cred.credentialStatus.status = CredentialRevocationStatus.REVOKED;
    }

    const revokedAt = new Date().toISOString();

    await AuditService.log({
      action: AuditAction.VERIFIABLE_CREDENTIAL_REVOKED,
      resourceType: AuditResourceType.CLINICAL_FEDERATION_DID,
      resourceId: dto.credentialId,
      actorId: cred.issuer,
      details: {
        reason: dto.revocationReason,
        revokedAt,
        issuerDid: cred.issuer
      }
    });

    return {
      success: true,
      credentialId: dto.credentialId,
      revokedAt,
      message: `Credencial ${dto.credentialId} revogada formalmente com registro na trilha WORM.`
    };
  }

  /**
   * Retorna o panorama executivo da federação de identidades clínicas descentralizadas
   */
  public getOverview(): DidFederationOverview {
    const allCreds = Array.from(this.credentialsById.values());
    const activeCredentialsCount = allCreds.filter(c => !this.revokedCredentialIds.has(c.id)).length;
    const revokedCredentialsCount = this.revokedCredentialIds.size;

    return {
      totalFederatedTherapists: this.didDocuments.size,
      totalIssuedCredentials: allCreds.length,
      totalVerifiedCredentials: this.totalVerifiedCount,
      activeCredentialsCount,
      revokedCredentialsCount,
      supportedDidMethods: [
        ClinicalDidMethod.DID_TERAPIAINFOCO,
        ClinicalDidMethod.DID_KEY,
        ClinicalDidMethod.DID_ION
      ],
      recentCredentials: allCreds.slice(-10).reverse()
    };
  }

  /**
   * Busca credenciais verificáveis emitidas para um paciente específico
   */
  public getCredentialsByPatient(patientId: string): W3CVerifiableCredential[] {
    const ids = this.credentialsByPatient.get(patientId) || [];
    return ids
      .map(id => this.credentialsById.get(id))
      .filter((c): c is W3CVerifiableCredential => c !== undefined);
  }
}
