import { createHash } from 'node:crypto';
import {
  ConsentScope,
  ConsentStatus,
  ConsentLegalBasis
} from '@terapiainfoco/shared';
import type {
  ConsentReceipt,
  PatientConsentScopePreference,
  ConsentValidationResult
} from '@terapiainfoco/shared';

export interface ConsentReceiptPayload {
  receiptId?: string;
  patientId: string;
  scope: ConsentScope;
  action: 'GRANT' | 'REVOKE';
  status: ConsentStatus;
  termVersion: string;
  legalBasis: ConsentLegalBasis;
  timestamp: string;
  revocationReason?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Calcula o hash SHA-256 canônico determinístico do recibo de consentimento (WORM).
 * Vincula inalteravelmente a manifestação do titular à finalidade e à base legal.
 */
export function calculateConsentReceiptHash(payload: ConsentReceiptPayload): string {
  const canonicalString = [
    `patientId:${payload.patientId.trim()}`,
    `scope:${payload.scope}`,
    `action:${payload.action}`,
    `status:${payload.status}`,
    `termVersion:${payload.termVersion.trim()}`,
    `legalBasis:${payload.legalBasis}`,
    `timestamp:${new Date(payload.timestamp).toISOString()}`,
    `revocationReason:${payload.revocationReason ? payload.revocationReason.trim() : 'NONE'}`,
    `ipAddress:${payload.ipAddress ? payload.ipAddress.trim() : 'UNKNOWN'}`,
    `userAgent:${payload.userAgent ? payload.userAgent.trim() : 'UNKNOWN'}`
  ].join('|');

  return createHash('sha256').update(canonicalString, 'utf8').digest('hex');
}

/**
 * Codifica o comprovante de consentimento em um token público com prefixo `tcle_v1_`.
 */
export function encodeConsentToken(receipt: {
  receiptId: string;
  patientId: string;
  scope: ConsentScope;
  action: 'GRANT' | 'REVOKE';
  receiptHash: string;
  timestamp: string;
}): string {
  const payload = {
    rid: receipt.receiptId,
    pid: receipt.patientId,
    scp: receipt.scope,
    act: receipt.action,
    hsh: receipt.receiptHash,
    ts: receipt.timestamp
  };

  const jsonStr = JSON.stringify(payload);
  const base64Url = Buffer.from(jsonStr, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `tcle_v1_${base64Url}`;
}

/**
 * Decodifica o token `tcle_v1_` extraindo os metadados do recibo de consentimento.
 */
export function decodeConsentToken(token: string): {
  receiptId: string;
  patientId: string;
  scope: ConsentScope;
  action: 'GRANT' | 'REVOKE';
  receiptHash: string;
  timestamp: string;
} {
  if (!token || !token.startsWith('tcle_v1_')) {
    throw new Error('Token de consentimento inválido: prefixo tcle_v1_ obrigatório');
  }

  const base64Url = token.slice('tcle_v1_'.length);
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');

  const jsonStr = Buffer.from(padded, 'base64').toString('utf8');
  const parsed = JSON.parse(jsonStr);

  return {
    receiptId: parsed.rid,
    patientId: parsed.pid,
    scope: parsed.scp,
    action: parsed.act,
    receiptHash: parsed.hsh,
    timestamp: parsed.ts
  };
}

/**
 * Valida a integridade matemática do recibo de consentimento contra o hash canônico recalculado.
 */
export function verifyConsentReceiptIntegrity(receipt: ConsentReceipt): boolean {
  if (!receipt || !receipt.receiptHash) return false;

  const expectedHash = calculateConsentReceiptHash({
    patientId: receipt.patientId,
    scope: receipt.scope,
    action: receipt.action,
    status: receipt.status,
    termVersion: receipt.termVersion,
    legalBasis: receipt.legalBasis,
    timestamp: receipt.timestamp,
    revocationReason: receipt.revocationReason,
    ipAddress: receipt.ipAddress,
    userAgent: receipt.userAgent
  });

  return expectedHash.toLowerCase() === receipt.receiptHash.toLowerCase();
}

/**
 * Avalia em tempo real se o processamento clínico pretendido é permitido pelo consentimento ativo.
 * Implementa o bloqueio ativo e tempestivo exigido pelo Art. 8º §5º da LGPD (Smart Revocation).
 */
export function evaluateProcessingPermission(
  preference: PatientConsentScopePreference | undefined,
  requestedScope: ConsentScope
): ConsentValidationResult {
  const evaluatedAt = new Date().toISOString();

  if (!preference) {
    return {
      permitted: false,
      scope: requestedScope,
      status: ConsentStatus.REFUSED,
      reason: `Tratamento bloqueado: Consentimento não configurado para o escopo ${formatConsentScopeLabel(requestedScope)} (LGPD Art. 7º, I).`,
      evaluatedAt
    };
  }

  if (preference.status === ConsentStatus.REVOKED) {
    const reasonDetail = preference.revocationReason ? ` Motivo: "${preference.revocationReason}".` : '';
    return {
      permitted: false,
      scope: requestedScope,
      status: ConsentStatus.REVOKED,
      reason: `Tratamento bloqueado: Consentimento para ${formatConsentScopeLabel(requestedScope)} revogado pelo titular em ${new Date(preference.revokedAt || preference.grantedAt || evaluatedAt).toLocaleDateString('pt-BR')} (LGPD Art. 8º, §5º e Art. 18, VI).${reasonDetail}`,
      evaluatedAt,
      termVersion: preference.termVersion,
      receiptHash: preference.receiptHash
    };
  }

  if (preference.status === ConsentStatus.REFUSED) {
    return {
      permitted: false,
      scope: requestedScope,
      status: ConsentStatus.REFUSED,
      reason: `Tratamento bloqueado: Consentimento recusado expressamente pelo paciente para ${formatConsentScopeLabel(requestedScope)} (LGPD Art. 11, I).`,
      evaluatedAt,
      termVersion: preference.termVersion,
      receiptHash: preference.receiptHash
    };
  }

  if (preference.status === ConsentStatus.EXPIRED) {
    return {
      permitted: false,
      scope: requestedScope,
      status: ConsentStatus.EXPIRED,
      reason: `Tratamento bloqueado: Consentimento para ${formatConsentScopeLabel(requestedScope)} expirado por decurso de prazo legal ou ciclo terapêutico.`,
      evaluatedAt,
      termVersion: preference.termVersion,
      receiptHash: preference.receiptHash
    };
  }

  return {
    permitted: true,
    scope: requestedScope,
    status: ConsentStatus.GRANTED,
    reason: `Tratamento autorizado: Consentimento ativo e válido sob a versão ${preference.termVersion} (Base Legal: ${preference.legalBasis}).`,
    evaluatedAt,
    termVersion: preference.termVersion,
    receiptHash: preference.receiptHash
  };
}

/**
 * Retorna o rótulo legível e fundamentação técnica de cada escopo determinado.
 */
export function formatConsentScopeLabel(scope: ConsentScope): string {
  switch (scope) {
    case ConsentScope.TELECONSULTATION_AUDIO_RECORDING:
      return 'Gravação Audiovisual para Teleconsulta (Res. CFP 011/2018)';
    case ConsentScope.AI_CLINICAL_SYNTHESIS:
      return 'Síntese Clínica & SOAP com IA com Sanitização Prévia (LGPD Art. 11)';
    case ConsentScope.ANONYMIZED_RESEARCH:
      return 'Pesquisa Científica & Dados Agregados Anonimizados (LGPD Art. 7º, IV)';
    case ConsentScope.INTERPROFESSIONAL_SHARING:
      return 'Compartilhamento com Equipe Multiprofissional (Res. CFP 006/2019)';
    case ConsentScope.COMMUNICATION_REMINDERS:
      return 'Lembretes de Consultas & Comunicações Operacionais';
    default:
      return scope;
  }
}

/**
 * Retorna a base legal normativa padrão para o escopo fornecido.
 */
export function getDefaultLegalBasisForScope(scope: ConsentScope): ConsentLegalBasis {
  switch (scope) {
    case ConsentScope.TELECONSULTATION_AUDIO_RECORDING:
      return ConsentLegalBasis.CFP_011_2018_TELEPSY;
    case ConsentScope.AI_CLINICAL_SYNTHESIS:
      return ConsentLegalBasis.LGPD_ART_11_I_SENSITIVE;
    case ConsentScope.ANONYMIZED_RESEARCH:
      return ConsentLegalBasis.LGPD_ART_7_I_CONSENT;
    case ConsentScope.INTERPROFESSIONAL_SHARING:
      return ConsentLegalBasis.CFP_006_2019_INTERPROFESSIONAL;
    case ConsentScope.COMMUNICATION_REMINDERS:
      return ConsentLegalBasis.LGPD_ART_7_I_CONSENT;
    default:
      return ConsentLegalBasis.LGPD_ART_7_I_CONSENT;
  }
}
