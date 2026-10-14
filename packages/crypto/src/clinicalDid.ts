import { createHmac, createHash, randomBytes } from 'crypto';
import type {
  W3CDidDocument,
  W3CVerificationMethod,
  W3CVerifiableCredential,
  W3CVerifiablePresentation,
  ClinicalCredentialSubject,
  W3CDataIntegrityProof,
  VerifiableCredentialVerificationResult
} from '@terapiainfoco/shared';
import {
  ClinicalDidMethod,
  VerifiableCredentialType,
  CredentialRevocationStatus,
  DidVerificationStatus
} from '@terapiainfoco/shared';

/**
 * Segredo mestre da autoridade emissora da federação clínica TerapiaInFoco
 */
const DID_MASTER_SECRET = process.env.DID_FEDERATION_SECRET || 'terapiainfoco-did-federation-master-signing-key-v1';

/**
 * Normaliza e canonicaliza um objeto JSON segundo as regras da RFC 8785 (JSON Canonicalization Scheme - JCS)
 */
export function canonicalizeJson(obj: any): string {
  if (obj === undefined) {
    return 'null';
  }
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalizeJson(item)).join(',') + ']';
  }
  const keys = Object.keys(obj).filter(k => obj[k] !== undefined).sort();
  const pairs = keys.map(k => `${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`);
  return '{' + pairs.join(',') + '}';
}

/**
 * Formata o DID oficial do psicólogo no ecossistema federado
 * Ex: did:terapiainfoco:crp-06-123456
 */
export function formatTherapistDid(crp: string, region = '06'): string {
  const cleanCrp = crp.replace(/\D/g, '');
  const cleanRegion = region.replace(/\D/g, '').padStart(2, '0');
  return `did:terapiainfoco:crp-${cleanRegion}-${cleanCrp}`;
}

/**
 * Gera um DID descentralizado autocontido no formato did:key
 */
export function generateEphemeralDidKey(publicKeySeed?: string): { did: string; publicKeyHex: string; privateKeyHex: string } {
  const seed = publicKeySeed ? Buffer.from(publicKeySeed, 'hex') : randomBytes(32);
  const privateKeyHex = seed.toString('hex');
  const publicKeyHex = createHash('sha256').update(seed).digest('hex');
  const multibaseKey = Buffer.from(publicKeyHex, 'hex').toString('base64url');
  const did = `did:key:z${multibaseKey}`;
  return { did, publicKeyHex, privateKeyHex };
}

/**
 * Gera o documento W3C DID Document canônico para uma identidade clínica
 */
export function generateDidDocument(did: string, publicKeyHex?: string): W3CDidDocument {
  const keyId = `${did}#key-1`;
  const pubKey = publicKeyHex || createHash('sha256').update(did + DID_MASTER_SECRET).digest('hex');

  const verificationMethod: W3CVerificationMethod = {
    id: keyId,
    type: 'JsonWebKey2020',
    controller: did,
    publicKeyMultibase: `z${Buffer.from(pubKey, 'hex').toString('base64url')}`,
    publicKeyJwk: {
      kty: 'OKP',
      crv: 'Ed25519',
      x: Buffer.from(pubKey.slice(0, 32)).toString('base64url'),
      alg: 'EdDSA',
      use: 'sig'
    }
  };

  return {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/jws-2020/v1'
    ],
    id: did,
    verificationMethod: [verificationMethod],
    authentication: [keyId],
    assertionMethod: [keyId],
    service: [
      {
        id: `${did}#clinical-hub`,
        type: 'MentalHealthInteroperabilityService',
        serviceEndpoint: 'https://terapiainfoco.com.br/api/did'
      }
    ],
    created: new Date('2026-01-01T00:00:00Z').toISOString(),
    active: true
  };
}

/**
 * Calcula o digest canônico SHA-256 de um payload de credencial (sem a prova)
 */
export function calculateCredentialDigest(vcWithoutProof: any): string {
  const canonical = canonicalizeJson(vcWithoutProof);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Assina uma credencial verificável gerando a prova W3C Data Integrity Proof
 */
export function signVerifiableCredential(
  draft: {
    id: string;
    type: string[];
    issuer: string;
    issuanceDate: string;
    expirationDate?: string;
    credentialSubject: ClinicalCredentialSubject;
    credentialStatus?: { id: string; type: string; status: CredentialRevocationStatus };
  },
  signingKeyHex?: string
): W3CVerifiableCredential {
  const vcContext = [
    'https://www.w3.org/ns/credentials/v2',
    'https://terapiainfoco.com.br/credentials/v1'
  ];

  const vcWithoutProof = {
    '@context': vcContext,
    id: draft.id,
    type: draft.type,
    issuer: draft.issuer,
    issuanceDate: draft.issuanceDate,
    ...(draft.expirationDate ? { expirationDate: draft.expirationDate } : {}),
    credentialSubject: draft.credentialSubject,
    ...(draft.credentialStatus ? { credentialStatus: draft.credentialStatus } : {})
  };

  const canonicalHash = calculateCredentialDigest(vcWithoutProof);
  const secret = signingKeyHex || createHmac('sha256', DID_MASTER_SECRET).update(draft.issuer).digest('hex');
  const signature = createHmac('sha256', secret).update(canonicalHash).digest('base64url');

  const proof: W3CDataIntegrityProof = {
    type: 'DataIntegrityProof',
    created: draft.issuanceDate,
    verificationMethod: `${draft.issuer}#key-1`,
    proofPurpose: 'assertionMethod',
    proofValue: signature,
    canonicalHash
  };

  const fullCredential: W3CVerifiableCredential = {
    ...vcWithoutProof,
    proof
  };

  fullCredential.jwtRepresentation = encodeCredentialJwt(fullCredential, secret);
  return fullCredential;
}

/**
 * Serializa uma Verifiable Credential no formato W3C VC-JWT (RFC 7519)
 */
export function encodeCredentialJwt(vc: W3CVerifiableCredential, signingSecret?: string): string {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };
  const payload = {
    iss: vc.issuer,
    sub: vc.credentialSubject.id,
    jti: vc.id,
    nbf: Math.floor(new Date(vc.issuanceDate).getTime() / 1000),
    ...(vc.expirationDate ? { exp: Math.floor(new Date(vc.expirationDate).getTime() / 1000) } : {}),
    vc: {
      '@context': vc['@context'],
      id: vc.id,
      type: vc.type,
      issuer: vc.issuer,
      issuanceDate: vc.issuanceDate,
      ...(vc.expirationDate ? { expirationDate: vc.expirationDate } : {}),
      credentialSubject: vc.credentialSubject,
      ...(vc.credentialStatus ? { credentialStatus: vc.credentialStatus } : {}),
      proof: vc.proof
    }
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const content = `${encodedHeader}.${encodedPayload}`;

  const secret = signingSecret || createHmac('sha256', DID_MASTER_SECRET).update(vc.issuer).digest('hex');
  const signature = createHmac('sha256', secret).update(content).digest('base64url');

  return `${content}.${signature}`;
}

/**
 * Desempacota uma Verifiable Credential a partir de seu token JWT
 */
export function decodeCredentialJwt(jwt: string): W3CVerifiableCredential {
  const parts = jwt.split('.');
  if (parts.length !== 3) {
    throw new Error('Formato JWT de credencial inválido: esperado 3 segmentos');
  }
  const payloadRaw = Buffer.from(parts[1], 'base64url').toString('utf8');
  const payload = JSON.parse(payloadRaw);
  if (!payload.vc) {
    throw new Error('Payload JWT não contém campo de credencial verificável (vc)');
  }
  const vc = payload.vc as W3CVerifiableCredential;
  vc.jwtRepresentation = jwt;
  return vc;
}

/**
 * Valida a assinatura matemática e a integridade de uma Verifiable Credential
 */
export function verifyVerifiableCredentialProof(
  vc: W3CVerifiableCredential,
  signingKeyHex?: string,
  revocationChecker?: (credentialId: string) => boolean
): VerifiableCredentialVerificationResult {
  const verifiedAt = new Date().toISOString();

  // 1. Checa status de revogação antes de tudo
  const isRevokedByStatus = vc.credentialStatus?.status === CredentialRevocationStatus.REVOKED;
  const isRevokedByCallback = revocationChecker ? revocationChecker(vc.id) : false;

  if (isRevokedByStatus || isRevokedByCallback) {
    return {
      valid: false,
      status: DidVerificationStatus.CREDENTIAL_REVOKED,
      credentialId: vc.id,
      issuerDid: vc.issuer,
      subjectDid: vc.credentialSubject?.id,
      credentialType: vc.type,
      issuedAt: vc.issuanceDate,
      expiresAt: vc.expirationDate,
      tamperingDetected: false,
      revocationStatus: CredentialRevocationStatus.REVOKED,
      message: 'Credencial clínica formalmente revogada na trilha notarial WORM.',
      verifiedAt
    };
  }

  // 2. Extrai proof e reconstrói documento original
  const { proof, jwtRepresentation, ...vcWithoutProof } = vc;
  if (!proof || !proof.proofValue || !proof.canonicalHash) {
    return {
      valid: false,
      status: DidVerificationStatus.SIGNATURE_INVALID,
      credentialId: vc.id,
      issuerDid: vc.issuer,
      subjectDid: vc.credentialSubject?.id,
      credentialType: vc.type,
      issuedAt: vc.issuanceDate,
      expiresAt: vc.expirationDate,
      tamperingDetected: true,
      revocationStatus: CredentialRevocationStatus.ACTIVE,
      message: 'Credencial rejeitada: assinatura criptográfica ausente ou corrompida.',
      verifiedAt
    };
  }

  // 3. Recalcula o hash canônico JCS
  const expectedCanonicalHash = calculateCredentialDigest(vcWithoutProof);
  if (expectedCanonicalHash !== proof.canonicalHash) {
    return {
      valid: false,
      status: DidVerificationStatus.SIGNATURE_INVALID,
      credentialId: vc.id,
      issuerDid: vc.issuer,
      subjectDid: vc.credentialSubject?.id,
      credentialType: vc.type,
      issuedAt: vc.issuanceDate,
      expiresAt: vc.expirationDate,
      tamperingDetected: true,
      revocationStatus: CredentialRevocationStatus.ACTIVE,
      message: 'Violação de integridade: o hash canônico não coincide com o conteúdo (adulteração detectada).',
      verifiedAt
    };
  }

  // 3. Valida a assinatura matemática
  const secret = signingKeyHex || createHmac('sha256', DID_MASTER_SECRET).update(vc.issuer).digest('hex');
  const expectedSignature = createHmac('sha256', secret).update(proof.canonicalHash).digest('base64url');

  if (proof.proofValue !== expectedSignature) {
    return {
      valid: false,
      status: DidVerificationStatus.SIGNATURE_INVALID,
      credentialId: vc.id,
      issuerDid: vc.issuer,
      subjectDid: vc.credentialSubject?.id,
      credentialType: vc.type,
      issuedAt: vc.issuanceDate,
      expiresAt: vc.expirationDate,
      tamperingDetected: true,
      revocationStatus: CredentialRevocationStatus.ACTIVE,
      message: 'Assinatura criptográfica forjada ou chave de emissor inválida.',
      verifiedAt
    };
  }

  // 4. Checa validade temporal
  if (vc.expirationDate) {
    const expiresAtMs = new Date(vc.expirationDate).getTime();
    if (Date.now() > expiresAtMs) {
      return {
        valid: false,
        status: DidVerificationStatus.CREDENTIAL_EXPIRED,
        credentialId: vc.id,
        issuerDid: vc.issuer,
        subjectDid: vc.credentialSubject?.id,
        credentialType: vc.type,
        issuedAt: vc.issuanceDate,
        expiresAt: vc.expirationDate,
        tamperingDetected: false,
        revocationStatus: CredentialRevocationStatus.EXPIRED,
        message: 'Credencial clínica expirada: prazo de validade ultrapassado.',
        verifiedAt
      };
    }
  }

  return {
    valid: true,
    status: DidVerificationStatus.VALID_VERIFIED,
    credentialId: vc.id,
    issuerDid: vc.issuer,
    subjectDid: vc.credentialSubject?.id,
    credentialType: vc.type,
    issuedAt: vc.issuanceDate,
    expiresAt: vc.expirationDate,
    tamperingDetected: false,
    revocationStatus: CredentialRevocationStatus.ACTIVE,
    message: 'Credencial verificável autêntica, íntegra e com fé pública digital confirmada.',
    verifiedAt
  };
}

/**
 * Cria uma Apresentação Verificável (W3C Verifiable Presentation)
 */
export function createVerifiablePresentation(
  credentials: W3CVerifiableCredential[],
  holderDid: string,
  holderSecret?: string,
  nonce?: string
): W3CVerifiablePresentation {
  const vpWithoutProof = {
    '@context': [
      'https://www.w3.org/ns/credentials/v2'
    ],
    id: `urn:uuid:${randomBytes(16).toString('hex')}`,
    type: ['VerifiablePresentation'],
    verifiableCredential: credentials,
    holder: holderDid
  };

  const canonicalHash = calculateCredentialDigest(vpWithoutProof);
  const secret = holderSecret || createHmac('sha256', DID_MASTER_SECRET).update(holderDid).digest('hex');
  const payloadToSign = nonce ? `${canonicalHash}:${nonce}` : canonicalHash;
  const signature = createHmac('sha256', secret).update(payloadToSign).digest('base64url');

  const proof: W3CDataIntegrityProof = {
    type: 'DataIntegrityProof',
    created: new Date().toISOString(),
    verificationMethod: `${holderDid}#key-1`,
    proofPurpose: 'authentication',
    proofValue: signature,
    canonicalHash
  };

  return {
    ...vpWithoutProof,
    proof
  };
}

/**
 * Valida a autenticidade de uma Apresentação Verificável e todas as suas credenciais
 */
export function verifyVerifiablePresentation(
  vp: W3CVerifiablePresentation,
  expectedNonce?: string,
  signingKeyHex?: string
): { valid: boolean; credentialsResults: VerifiableCredentialVerificationResult[]; message: string } {
  const { proof, ...vpWithoutProof } = vp;
  if (!proof || !proof.proofValue) {
    return {
      valid: false,
      credentialsResults: [],
      message: 'Apresentação Verificável rejeitada: assinatura do titular ausente.'
    };
  }

  const expectedHash = calculateCredentialDigest(vpWithoutProof);
  if (expectedHash !== proof.canonicalHash) {
    return {
      valid: false,
      credentialsResults: [],
      message: 'Apresentação Verificável violada: digest canônico divergente.'
    };
  }

  const secret = signingKeyHex || createHmac('sha256', DID_MASTER_SECRET).update(vp.holder).digest('hex');
  const payloadToSign = expectedNonce ? `${expectedHash}:${expectedNonce}` : expectedHash;
  const expectedSig = createHmac('sha256', secret).update(payloadToSign).digest('base64url');

  if (proof.proofValue !== expectedSig) {
    return {
      valid: false,
      credentialsResults: [],
      message: 'Assinatura da Apresentação Verificável inválida para o titular indicado.'
    };
  }

  const credentialsResults = (vp.verifiableCredential || []).map(vc => verifyVerifiableCredentialProof(vc));
  const allCredsValid = credentialsResults.every(r => r.valid);

  return {
    valid: allCredsValid,
    credentialsResults,
    message: allCredsValid
      ? 'Apresentação Verificável e todas as credenciais vinculadas foram validadas com sucesso.'
      : 'Apresentação válida, porém uma ou mais credenciais apresentaram irregularidades ou revogação.'
  };
}
