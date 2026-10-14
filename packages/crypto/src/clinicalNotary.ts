import { createHash, createHmac, randomBytes } from 'node:crypto';
import {
  NotaryStatus,
  NotaryVerificationStatus
} from '@terapiainfoco/shared';
import type {
  ClinicalNotaryBlock,
  NotaryChainVerificationResult
} from '@terapiainfoco/shared';

export const GENESIS_NOTARY_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
export const DEFAULT_NOTARY_KEY = process.env.NOTARY_SECRET_KEY || 'terapiainfoco_clinical_notary_digital_master_key_2026';
export const NOTARY_TOKEN_PREFIX = 'notary_v1_';

/**
 * Estrutura serializada do payload público do selo notarial digital
 */
export interface PublicNotarySealPayload {
  notaryId: string;
  recordBlindIndex: string;
  blockHash: string;
  versionNumber: number;
  timestamp: string;
}

/**
 * Gera um blind index HMAC-SHA256 determinístico para indexação forense da nota clínica
 * sem expor identificadores diretos ou dados de saúde sensíveis.
 */
export function generateRecordBlindIndex(
  recordId: string,
  patientId: string,
  secretKey: string = DEFAULT_NOTARY_KEY
): string {
  const raw = `record:${recordId}:patient:${patientId}`;
  const hash = createHmac('sha256', secretKey).update(raw, 'utf8').digest('hex').substring(0, 32);
  return `bidx_rec_${hash}`;
}

/**
 * Calcula o digest canônico SHA-256 de uma nota clínica/prontuário para fé pública
 */
export function calculateClinicalCanonicalHash(record: {
  id: string;
  patientId: string;
  therapistId: string;
  therapistCrp: string;
  soapContent: string;
  date: string;
  rectifications?: Array<{ id: string; sealedAt: string; hash: string }>;
}): string {
  const canonicalData = {
    id: record.id,
    patientId: record.patientId,
    therapistId: record.therapistId,
    therapistCrp: record.therapistCrp.trim(),
    soapContent: record.soapContent.trim(),
    date: record.date,
    rectifications: record.rectifications || []
  };

  const serialized = JSON.stringify(canonicalData, Object.keys(canonicalData).sort());
  return createHash('sha256').update(serialized, 'utf8').digest('hex');
}

/**
 * Calcula o hash notarial do bloco para o encadeamento forense na hash-chain do paciente
 */
export function calculateNotaryBlockHash(params: {
  recordBlindIndex: string;
  versionNumber: number;
  clinicalCanonicalHash: string;
  previousNotaryHash: string;
  notaryTimestamp: string;
}): string {
  const payload = [
    params.recordBlindIndex,
    params.versionNumber.toString(),
    params.clinicalCanonicalHash,
    params.previousNotaryHash,
    params.notaryTimestamp
  ].join('|');

  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Codifica o selo notarial em um token público Base64URL auditável com prefixo notary_v1_
 */
export function encodeNotarySeal(block: {
  notaryId: string;
  recordBlindIndex: string;
  blockHash: string;
  versionNumber: number;
  notaryTimestamp: string;
}): string {
  const payload: PublicNotarySealPayload = {
    notaryId: block.notaryId,
    recordBlindIndex: block.recordBlindIndex,
    blockHash: block.blockHash,
    versionNumber: block.versionNumber,
    timestamp: block.notaryTimestamp
  };

  const json = JSON.stringify(payload);
  const base64url = Buffer.from(json, 'utf8').toString('base64url');
  return `${NOTARY_TOKEN_PREFIX}${base64url}`;
}

/**
 * Decodifica o token público de selo notarial digital
 */
export function decodeNotarySeal(token: string): PublicNotarySealPayload {
  if (!token || !token.startsWith(NOTARY_TOKEN_PREFIX)) {
    throw new Error('Token de selo notarial inválido: prefixo notary_v1_ ausente.');
  }

  const rawBase64 = token.substring(NOTARY_TOKEN_PREFIX.length);
  const jsonStr = Buffer.from(rawBase64, 'base64url').toString('utf8');
  const parsed = JSON.parse(jsonStr) as PublicNotarySealPayload;

  if (!parsed.notaryId || !parsed.recordBlindIndex || !parsed.blockHash) {
    throw new Error('Carga útil do selo notarial incompleta ou corrompida.');
  }

  return parsed;
}

/**
 * Cria e sela um novo bloco notarial digital para uma nota clínica
 */
export function createClinicalNotaryBlock(params: {
  recordId: string;
  patientId: string;
  therapistId: string;
  therapistCrp: string;
  clinicalCanonicalHash: string;
  previousNotaryHash?: string;
  versionNumber?: number;
  hasRectifications?: boolean;
  rectificationCount?: number;
  secretKey?: string;
}): ClinicalNotaryBlock {
  const notaryId = `notary_${randomBytes(8).toString('hex')}`;
  const recordBlindIndex = generateRecordBlindIndex(params.recordId, params.patientId, params.secretKey);
  const versionNumber = params.versionNumber || 1;
  const previousNotaryHash = params.previousNotaryHash || GENESIS_NOTARY_HASH;
  const notaryTimestamp = new Date().toISOString();

  const blockHash = calculateNotaryBlockHash({
    recordBlindIndex,
    versionNumber,
    clinicalCanonicalHash: params.clinicalCanonicalHash,
    previousNotaryHash,
    notaryTimestamp
  });

  const digitalNotarySeal = encodeNotarySeal({
    notaryId,
    recordBlindIndex,
    blockHash,
    versionNumber,
    notaryTimestamp
  });

  return {
    notaryId,
    recordId: params.recordId,
    recordBlindIndex,
    patientId: params.patientId,
    versionNumber,
    clinicalCanonicalHash: params.clinicalCanonicalHash,
    previousNotaryHash,
    blockHash,
    digitalNotarySeal,
    notaryTimestamp,
    therapistId: params.therapistId,
    therapistCrp: params.therapistCrp,
    status: params.hasRectifications ? NotaryStatus.RECTIFIED : NotaryStatus.NOTARIZED,
    hasRectifications: !!params.hasRectifications,
    rectificationCount: params.rectificationCount || 0
  };
}

/**
 * Valida a integridade matemática intrínseca de um bloco notarial
 */
export function verifyNotaryBlockIntegrity(block: ClinicalNotaryBlock): boolean {
  if (!block || !block.blockHash || !block.digitalNotarySeal) return false;

  const expectedHash = calculateNotaryBlockHash({
    recordBlindIndex: block.recordBlindIndex,
    versionNumber: block.versionNumber,
    clinicalCanonicalHash: block.clinicalCanonicalHash,
    previousNotaryHash: block.previousNotaryHash,
    notaryTimestamp: block.notaryTimestamp
  });

  if (expectedHash !== block.blockHash) return false;

  try {
    const decoded = decodeNotarySeal(block.digitalNotarySeal);
    return decoded.blockHash === block.blockHash && decoded.notaryId === block.notaryId;
  } catch {
    return false;
  }
}

/**
 * Valida a integridade sequencial completa da cadeia notarial de prontuários de um paciente
 */
export function verifyNotaryChainIntegrity(chain: ClinicalNotaryBlock[]): {
  valid: boolean;
  status: NotaryVerificationStatus;
  brokenIndex?: number;
  message: string;
} {
  if (!chain || chain.length === 0) {
    return {
      valid: true,
      status: NotaryVerificationStatus.VALID_GENUINE,
      message: 'Cadeia notarial vazia: integridade preservada.'
    };
  }

  // Ordena por versionNumber crescente
  const sorted = [...chain].sort((a, b) => a.versionNumber - b.versionNumber);

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];

    // 1. Validação do bloco individual
    if (!verifyNotaryBlockIntegrity(current)) {
      return {
        valid: false,
        status: NotaryVerificationStatus.CONTENT_TAMPERED,
        brokenIndex: i,
        message: `Divergência detectada no bloco de versão ${current.versionNumber} (ID: ${current.notaryId}): hash canônico não confere.`
      };
    }

    // 2. Validação do encadeamento cronológico
    if (i === 0) {
      if (current.previousNotaryHash !== GENESIS_NOTARY_HASH) {
        return {
          valid: false,
          status: NotaryVerificationStatus.CHAIN_BROKEN,
          brokenIndex: 0,
          message: 'Bloco gênese notarial corrompido: hash anterior não corresponde ao hash gênese.'
        };
      }
    } else {
      const previous = sorted[i - 1];
      if (current.previousNotaryHash !== previous.blockHash) {
        return {
          valid: false,
          status: NotaryVerificationStatus.CHAIN_BROKEN,
          brokenIndex: i,
          message: `Quebra na cadeia notarial entre os blocos ${previous.versionNumber} e ${current.versionNumber}: previousNotaryHash divergente.`
        };
      }
    }
  }

  return {
    valid: true,
    status: NotaryVerificationStatus.VALID_GENUINE,
    message: `Cadeia notarial com ${sorted.length} bloco(s) 100% íntegra e sequencialmente verificada.`
  };
}
