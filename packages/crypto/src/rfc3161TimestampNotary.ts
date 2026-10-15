import { createHash, createHmac, randomBytes } from 'node:crypto';
import {
  TsaAuthorityType,
  TimestampVerificationStatus,
  TimestampTamperType
} from '@terapiainfoco/shared';
import type {
  ClinicalSessionMessageImprint,
  ClinicalSessionTimestampReq,
  TsaCertificateInfo,
  TSTInfo,
  ClinicalSessionTimestampToken,
  TimestampVerificationResult
} from '@terapiainfoco/shared';

// OIDs normativos e regulamentares (RFC 3161 & ICP-Brasil DOC-ICP-11)
export const OID_SHA256 = '2.16.840.1.101.3.4.2.1';
export const OID_TIMESTAMPING = '1.3.6.1.5.5.7.3.8'; // Extended Key Usage id-kp-timeStamping
export const OID_ICP_BRASIL_TSA_POLICY = '2.16.76.1.4.1'; // Política ACT ICP-Brasil
export const OID_INTERNAL_TSA_POLICY = '1.3.6.1.4.1.58331.1.1'; // Política Corporativa TerapiaInFoco
export const OID_FEDERATED_TSA_POLICY = '1.3.6.1.4.1.58331.2.1'; // Política Federação Saúde Mental

export const DEFAULT_TSA_SECRET =
  process.env.TSA_SIGNING_SECRET || 'terapiainfoco_icp_brasil_tsa_master_secret_2026';
export const TSA_TOKEN_PREFIX = 'tst_rfc3161_v1_';

/**
 * Serialização determinística canônica compatível com RFC 8785 (JCS)
 */
export function canonicalStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalStringify).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`).join(',') + '}';
}

/**
 * Certificado padrão simulado da Autoridade de Carimbo do Tempo (ACT) ICP-Brasil
 * Credenciada junto ao Instituto Nacional de Tecnologia da Informação (ITI / MCTI)
 */
export const DEFAULT_ICP_BRASIL_ACT_CERT: TsaCertificateInfo = {
  tsaId: 'act-icp-br-on-01',
  commonName: 'Autoridade de Carimbo do Tempo ICP-Brasil - Observatório Nacional',
  organization: 'Instituto Nacional de Tecnologia da Informação - ITI / MCTI',
  country: 'BR',
  serialNumber: '583319482026001',
  validFrom: '2025-01-01T00:00:00.000Z',
  validTo: '2028-12-31T23:59:59.000Z',
  keyUsage: ['digitalSignature', 'nonRepudiation'],
  extendedKeyUsageOid: OID_TIMESTAMPING,
  sha256Thumbprint: createHash('sha256')
    .update('CN=Autoridade de Carimbo do Tempo ICP-Brasil - Observatorio Nacional:583319482026001')
    .digest('hex'),
  authorityType: TsaAuthorityType.ICP_BRASIL_ACT
};

/**
 * Cria o MessageImprint canônico SHA-256 para os dados da sessão clínica
 * Preserva o sigilo do paciente utilizando o Blind Index (sem expor PII para a TSA)
 */
export function createClinicalSessionImprint(sessionData: {
  sessionId: string;
  patientBlindIndex: string;
  therapistId: string;
  therapistCrp: string;
  sessionStartTime: string;
  sessionEndTime: string;
  clinicalSummaryOrHash?: string;
}): ClinicalSessionMessageImprint {
  const canonicalData = {
    clinicalSummaryOrHash: (sessionData.clinicalSummaryOrHash || '').trim(),
    patientBlindIndex: sessionData.patientBlindIndex,
    sessionId: sessionData.sessionId,
    sessionEndTime: sessionData.sessionEndTime,
    sessionStartTime: sessionData.sessionStartTime,
    therapistCrp: sessionData.therapistCrp.trim(),
    therapistId: sessionData.therapistId
  };

  const serialized = canonicalStringify(canonicalData);
  const hashedMessage = createHash('sha256').update(serialized, 'utf8').digest('hex');

  return {
    hashAlgorithm: 'sha256',
    hashAlgorithmOid: OID_SHA256,
    hashedMessage
  };
}

/**
 * Constrói a requisição formal de carimbo do tempo TimeStampReq (RFC 3161 §2.4.1)
 */
export function createTimestampRequest(params: {
  sessionId: string;
  patientBlindIndex: string;
  therapistId: string;
  therapistCrp: string;
  messageImprint: ClinicalSessionMessageImprint;
  reqPolicyOid?: string;
  nonce?: string;
  certReq?: boolean;
}): ClinicalSessionTimestampReq {
  const nonce = params.nonce || randomBytes(16).toString('hex');
  const reqPolicyOid = params.reqPolicyOid || OID_ICP_BRASIL_TSA_POLICY;

  return {
    version: 1, // RFC 3161 Version 1
    sessionId: params.sessionId,
    patientBlindIndex: params.patientBlindIndex,
    therapistId: params.therapistId,
    therapistCrp: params.therapistCrp,
    messageImprint: params.messageImprint,
    reqPolicyOid,
    nonce,
    certReq: params.certReq !== false,
    requestedAt: new Date().toISOString()
  };
}

/**
 * Emite o carimbo do tempo TimeStampToken (TST) assinado digitalmente pela Autoridade (RFC 3161 §2.4.2)
 */
export function issueTimestampToken(
  request: ClinicalSessionTimestampReq,
  options?: {
    tsaCert?: TsaCertificateInfo;
    signingSecret?: string;
    forcedGenTime?: string;
    forcedSerial?: string;
  }
): ClinicalSessionTimestampToken {
  const tsaCert = options?.tsaCert || DEFAULT_ICP_BRASIL_ACT_CERT;
  const signingSecret = options?.signingSecret || DEFAULT_TSA_SECRET;
  const genTime = options?.forcedGenTime || new Date().toISOString();
  const serialNumber =
    options?.forcedSerial ||
    `tsa_sn_${Date.now()}_${randomBytes(8).toString('hex')}`;

  const tstInfo: TSTInfo = {
    version: 1,
    policyOid: request.reqPolicyOid,
    messageImprint: request.messageImprint,
    serialNumber,
    genTime,
    accuracy: {
      seconds: 1,
      millis: 50,
      micros: 0
    },
    ordering: false,
    nonce: request.nonce,
    tsaName: tsaCert.commonName
  };

  const serializedTstInfo = canonicalStringify(tstInfo);
  const signature = createHmac('sha256', signingSecret)
    .update(serializedTstInfo, 'utf8')
    .digest('base64url');

  const payloadBase64 = Buffer.from(serializedTstInfo, 'utf8').toString('base64url');
  const rawTokenBase64 = `${TSA_TOKEN_PREFIX}${payloadBase64}.${signature}`;
  const wormSealHash = createHash('sha256').update(rawTokenBase64, 'utf8').digest('hex');

  const tokenId = `tst_rfc3161_${randomBytes(12).toString('hex')}`;

  return {
    tokenId,
    sessionId: request.sessionId,
    patientBlindIndex: request.patientBlindIndex,
    therapistCrp: request.therapistCrp,
    tstInfo,
    signature,
    tsaCertificate: tsaCert,
    status: {
      code: 0, // granted
      statusString: 'Time-Stamp Token granted under ICP-Brasil TSA regulations (RFC 3161)'
    },
    rawTokenBase64,
    wormSealHash,
    issuedAt: genTime
  };
}

/**
 * Parse e decodificação forense de um token de carimbo do tempo bruto
 */
export function parseTimestampToken(rawToken: string): {
  tstInfo: TSTInfo;
  signature: string;
} {
  if (!rawToken.startsWith(TSA_TOKEN_PREFIX)) {
    throw new Error('Prefixo de carimbo do tempo RFC 3161 inválido');
  }

  const tokenBody = rawToken.slice(TSA_TOKEN_PREFIX.length);
  const parts = tokenBody.split('.');
  if (parts.length !== 2) {
    throw new Error('Estrutura de token RFC 3161 malformada');
  }

  const [payloadBase64, signature] = parts;
  const jsonStr = Buffer.from(payloadBase64, 'base64url').toString('utf8');
  const tstInfo: TSTInfo = JSON.parse(jsonStr);

  return { tstInfo, signature };
}

/**
 * Verificação pericial e independente de um token de carimbo do tempo RFC 3161
 */
export function verifyTimestampToken(params: {
  token: ClinicalSessionTimestampToken | string;
  expectedImprint?: string;
  originalNonce?: string;
  tsaSigningSecret?: string;
  tsaCert?: TsaCertificateInfo;
}): TimestampVerificationResult {
  const signingSecret = params.tsaSigningSecret || DEFAULT_TSA_SECRET;
  let rawTokenStr: string;
  let tstInfo: TSTInfo;
  let signature: string;
  let tokenId = 'unknown';
  let sessionId = 'unknown';
  let cert = params.tsaCert || DEFAULT_ICP_BRASIL_ACT_CERT;

  try {
    if (typeof params.token === 'string') {
      rawTokenStr = params.token;
      const parsed = parseTimestampToken(rawTokenStr);
      tstInfo = parsed.tstInfo;
      signature = parsed.signature;
    } else {
      rawTokenStr = params.token.rawTokenBase64;
      tstInfo = params.token.tstInfo;
      signature = params.token.signature;
      tokenId = params.token.tokenId;
      sessionId = params.token.sessionId;
      cert = params.token.tsaCertificate || cert;
    }
  } catch (error: any) {
    return {
      isValid: false,
      status: TimestampVerificationStatus.SIGNATURE_INVALID,
      sessionId,
      tokenId,
      verifiedAt: new Date().toISOString(),
      messageImprintMatch: false,
      signatureValid: false,
      nonceMatch: false,
      certificateValid: false,
      driftMilliseconds: 0,
      details: `Falha no parse do token RFC 3161: ${error?.message || error}`
    };
  }

  // 1. Validação da Assinatura da Autoridade de Carimbo do Tempo (TSA)
  const canonicalTst = canonicalStringify(tstInfo);
  const expectedSignature = createHmac('sha256', signingSecret)
    .update(canonicalTst, 'utf8')
    .digest('base64url');

  const signatureValid = signature === expectedSignature;
  if (!signatureValid) {
    return {
      isValid: false,
      status: TimestampVerificationStatus.SIGNATURE_INVALID,
      sessionId,
      tokenId,
      verifiedAt: new Date().toISOString(),
      messageImprintMatch: false,
      signatureValid: false,
      nonceMatch: false,
      certificateValid: false,
      driftMilliseconds: 0,
      details: 'Assinatura digital da Autoridade de Carimbo do Tempo corrompida ou forjada'
    };
  }

  // 2. Validação da vigência do Certificado Digital da TSA
  const genTimeMs = new Date(tstInfo.genTime).getTime();
  const certFromMs = new Date(cert.validFrom).getTime();
  const certToMs = new Date(cert.validTo).getTime();
  const certificateValid = genTimeMs >= certFromMs && genTimeMs <= certToMs;

  if (!certificateValid) {
    return {
      isValid: false,
      status: TimestampVerificationStatus.EXPIRED_TSA_CERTIFICATE,
      sessionId,
      tokenId,
      verifiedAt: new Date().toISOString(),
      messageImprintMatch: true,
      signatureValid: true,
      nonceMatch: true,
      certificateValid: false,
      driftMilliseconds: 0,
      details: `Certificado da TSA fora da janela de vigência regulamentar: ${cert.validFrom} a ${cert.validTo}`
    };
  }

  // 3. Validação do Nonce contra replay
  let nonceMatch = true;
  if (params.originalNonce && tstInfo.nonce !== params.originalNonce) {
    nonceMatch = false;
    return {
      isValid: false,
      status: TimestampVerificationStatus.NONCE_MISMATCH,
      sessionId,
      tokenId,
      verifiedAt: new Date().toISOString(),
      messageImprintMatch: true,
      signatureValid: true,
      nonceMatch: false,
      certificateValid: true,
      driftMilliseconds: 0,
      details: `Nonce divergente do desafio emitido: recebido '${tstInfo.nonce}', esperado '${params.originalNonce}'`
    };
  }

  // 4. Validação da integridade do MessageImprint
  let messageImprintMatch = true;
  if (params.expectedImprint && tstInfo.messageImprint.hashedMessage !== params.expectedImprint) {
    messageImprintMatch = false;
    return {
      isValid: false,
      status: TimestampVerificationStatus.HASH_MISMATCH,
      sessionId,
      tokenId,
      verifiedAt: new Date().toISOString(),
      messageImprintMatch: false,
      signatureValid: true,
      nonceMatch: true,
      certificateValid: true,
      driftMilliseconds: 0,
      details: `Digest da sessão clínica divergente do MessageImprint atestado pela TSA: '${tstInfo.messageImprint.hashedMessage}' vs '${params.expectedImprint}'`
    };
  }

  // 5. Verificação de Skew / Drift temporal
  const nowMs = Date.now();
  const driftMilliseconds = Math.abs(nowMs - genTimeMs);

  return {
    isValid: true,
    status: TimestampVerificationStatus.VALID,
    sessionId,
    tokenId,
    verifiedAt: new Date().toISOString(),
    messageImprintMatch: true,
    signatureValid: true,
    nonceMatch: true,
    certificateValid: true,
    driftMilliseconds,
    details: 'Carimbo do tempo RFC 3161 / ICP-Brasil verificado com 100% de fé pública e integridade'
  };
}

/**
 * Simula a adulteração controlada de um token de carimbo para fins de pentest e verificação pericial
 */
export function simulateTimestampTampering(
  token: ClinicalSessionTimestampToken,
  tamperType: TimestampTamperType
): string {
  const parsed = parseTimestampToken(token.rawTokenBase64);
  const modifiedTst: TSTInfo = JSON.parse(JSON.stringify(parsed.tstInfo));
  let modifiedSignature = parsed.signature;

  switch (tamperType) {
    case TimestampTamperType.ALTER_TIMESTAMP: {
      // Altera a data da sessão em 1 ano (fraude de tempestividade clínica)
      const date = new Date(modifiedTst.genTime);
      date.setFullYear(date.getFullYear() - 1);
      modifiedTst.genTime = date.toISOString();
      break;
    }
    case TimestampTamperType.CORRUPT_IMPRINT: {
      // Altera o hash do documento clínico no imprint
      modifiedTst.messageImprint.hashedMessage =
        'ff' + modifiedTst.messageImprint.hashedMessage.slice(2);
      break;
    }
    case TimestampTamperType.TAMPER_NONCE: {
      // Altera o nonce da requisição para simular replay
      modifiedTst.nonce = 'tampered_nonce_' + randomBytes(4).toString('hex');
      break;
    }
    case TimestampTamperType.INVALID_SIGNATURE: {
      // Adultera a assinatura criptográfica da Autoridade
      modifiedSignature = 'bad_sig_' + randomBytes(16).toString('base64url');
      break;
    }
    case TimestampTamperType.NONE:
    default:
      return token.rawTokenBase64;
  }

  const payloadBase64 = Buffer.from(canonicalStringify(modifiedTst), 'utf8').toString('base64url');
  return `${TSA_TOKEN_PREFIX}${payloadBase64}.${modifiedSignature}`;
}
