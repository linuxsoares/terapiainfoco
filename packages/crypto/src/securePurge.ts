import { createHmac, createHash } from 'node:crypto';
import {
  PurgeReason,
  PurgeMethod,
  PurgeStatus,
  PurgeProofVerificationStatus,
  type DataPurgeCertificate,
  type PurgeProofVerificationResult
} from '@terapiainfoco/shared';

const DEFAULT_PURGE_SALT = process.env.PURGE_BLIND_INDEX_SALT || 'terapiainfoco-secure-data-purge-hmac-salt-2026';

/**
 * Gera um Blind Index HMAC-SHA256 determinístico para o paciente purgado,
 * garantindo a anonimização irreversível na certidão pública e no ledger WORM.
 */
export function generatePurgeBlindIndex(patientId: string, salt: string = DEFAULT_PURGE_SALT): string {
  const normalized = patientId.trim().toLowerCase();
  return createHmac('sha256', salt)
    .update(`purge_subject:${normalized}`)
    .digest('hex');
}

/**
 * Calcula o digest canônico SHA-256 invariante do ato de expurgo e destruição de dados,
 * ordenando deterministamente as chaves das evidências coletadas.
 */
export function calculatePurgeProofHash(params: {
  certificateId: string;
  patientBlindIndex: string;
  recordsPurgedCount: number;
  recordIdsPurged: string[];
  purgedAt: string;
  purgeReason: PurgeReason;
  purgeMethod: PurgeMethod;
  dpoApproverId: string;
}): string {
  const canonicalObject = {
    certificateId: params.certificateId,
    dpoApproverId: params.dpoApproverId,
    patientBlindIndex: params.patientBlindIndex,
    purgeMethod: params.purgeMethod,
    purgeReason: params.purgeReason,
    purgedAt: params.purgedAt,
    recordIdsPurged: [...params.recordIdsPurged].sort(),
    recordsPurgedCount: params.recordsPurgedCount
  };

  const canonicalJson = JSON.stringify(canonicalObject, Object.keys(canonicalObject).sort());
  return createHash('sha256').update(canonicalJson).digest('hex');
}

export interface PurgeSealPayload {
  v: number;
  cid: string;
  pbi: string;
  cph: string;
  pat: string;
  rpc: number;
}

/**
 * Codifica o selo notarial de expurgo criptográfico em token público Base64URL
 * Formato: purge_v1_<base64url>
 */
export function encodePurgeSeal(payload: {
  certificateId: string;
  patientBlindIndex: string;
  canonicalProofHash: string;
  purgedAt: string;
  recordsPurgedCount: number;
}): string {
  const rawPayload: PurgeSealPayload = {
    v: 1,
    cid: payload.certificateId,
    pbi: payload.patientBlindIndex,
    cph: payload.canonicalProofHash,
    pat: payload.purgedAt,
    rpc: payload.recordsPurgedCount
  };

  const jsonStr = JSON.stringify(rawPayload);
  const base64Url = Buffer.from(jsonStr, 'utf-8').toString('base64url');
  return `purge_v1_${base64Url}`;
}

/**
 * Decodifica e valida sintaticamente o token público de expurgo criptográfico.
 */
export function decodePurgeSeal(token: string): {
  certificateId: string;
  patientBlindIndex: string;
  canonicalProofHash: string;
  purgedAt: string;
  recordsPurgedCount: number;
} {
  if (!token || typeof token !== 'string' || !token.startsWith('purge_v1_')) {
    throw new Error('Token de prova de expurgo inválido: formato deve iniciar com purge_v1_');
  }

  const base64Url = token.slice('purge_v1_'.length);
  const jsonStr = Buffer.from(base64Url, 'base64url').toString('utf-8');
  const parsed = JSON.parse(jsonStr) as PurgeSealPayload;

  if (parsed.v !== 1 || !parsed.cid || !parsed.pbi || !parsed.cph || !parsed.pat) {
    throw new Error('Token de expurgo corrompido ou versão incompatível.');
  }

  return {
    certificateId: parsed.cid,
    patientBlindIndex: parsed.pbi,
    canonicalProofHash: parsed.cph,
    purgedAt: parsed.pat,
    recordsPurgedCount: parsed.rpc
  };
}

/**
 * Validação matemática intrínseca da prova probatória de expurgo criptográfico
 */
export function verifyPurgeCertificateIntegrity(
  certificate: DataPurgeCertificate
): {
  valid: boolean;
  calculatedProofHash: string;
  status: PurgeProofVerificationStatus;
  message: string;
} {
  try {
    const calculatedProofHash = calculatePurgeProofHash({
      certificateId: certificate.certificateId,
      patientBlindIndex: certificate.patientBlindIndex,
      recordsPurgedCount: certificate.recordsPurgedCount,
      recordIdsPurged: certificate.recordIdsPurged,
      purgedAt: certificate.purgedAt,
      purgeReason: certificate.purgeReason,
      purgeMethod: certificate.purgeMethod,
      dpoApproverId: certificate.dpoApproverId
    });

    if (calculatedProofHash !== certificate.canonicalProofHash) {
      return {
        valid: false,
        calculatedProofHash,
        status: PurgeProofVerificationStatus.PROOF_TAMPERED,
        message: 'Adulteração detectada: o hash canônico das evidências de descarte não confere com o certificado.'
      };
    }

    const decoded = decodePurgeSeal(certificate.cryptographicPurgeSeal);
    if (
      decoded.certificateId !== certificate.certificateId ||
      decoded.patientBlindIndex !== certificate.patientBlindIndex ||
      decoded.canonicalProofHash !== calculatedProofHash
    ) {
      return {
        valid: false,
        calculatedProofHash,
        status: PurgeProofVerificationStatus.PROOF_TAMPERED,
        message: 'Selo criptográfico público de expurgo diverge dos dados probatórios da certidão.'
      };
    }

    return {
      valid: true,
      calculatedProofHash,
      status: PurgeProofVerificationStatus.PROOF_VALID_AUTHENTIC,
      message: 'Certidão e prova de destruição matemática validadas com sucesso (NIST SP 800-88 & LGPD Art. 16).'
    };
  } catch (err: any) {
    return {
      valid: false,
      calculatedProofHash: '',
      status: PurgeProofVerificationStatus.PROOF_TAMPERED,
      message: `Falha na verificação matemática da prova: ${err.message}`
    };
  }
}

/**
 * Simula a destruição segura de chaves de criptografia e sanitização de blocos
 * conforme as diretrizes do NIST SP 800-88 Rev. 1 (Media Sanitization Guidelines).
 */
export function simulateCryptoShredding(recordPayloadsCount: number): {
  destroyedKeys: number;
  shreddedBytes: number;
  sanitizationStandard: string;
} {
  const avgRecordSizeBytes = 4096; // 4KB por evolução SOAP cifrada + metadados
  return {
    destroyedKeys: Math.max(1, recordPayloadsCount),
    shreddedBytes: recordPayloadsCount * avgRecordSizeBytes,
    sanitizationStandard: 'NIST SP 800-88 Rev. 1 (Cryptographic Erase - CE)'
  };
}
