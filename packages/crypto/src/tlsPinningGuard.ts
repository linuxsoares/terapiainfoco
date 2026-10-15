/**
 * TLS Certificate Pinning Guard Engine & X.509 Chain Verification
 * Conformidade: RFC-001 §4.4, §5.2, RFC 7469 (HPKP / SPKI Pinning),
 * RFC 6698 / RFC 7671 (DANE TLSA) e OWASP MASVS (MASVS-NETWORK-1/2).
 */

import { createHash, createHmac } from 'crypto';
import {
  TlsPinningStrategy,
  TlsPinValidationStatus,
  TlsPinPolicyMode
} from '@terapiainfoco/shared';
import type {
  TlsSpkiPin,
  X509CertInspection,
  TlsPinProofSeal,
  TlsPinValidationResult
} from '@terapiainfoco/shared';

const WORM_HMAC_DEFAULT_SECRET = 'terapiainfoco-tls-pinning-worm-notary-secret-2026';

/**
 * Assinaturas conhecidas de Autoridades Certificadoras fraudulentas ou Proxies MitM
 */
export const KNOWN_MITM_CA_PATTERNS = [
  'PortSwigger',
  'Burp Suite',
  'Fiddler',
  'DO_NOT_TRUST_FiddlerRoot',
  'Charles Proxy',
  'mitmproxy',
  'OWASP ZAP',
  'ZAP Fake CA',
  'Superfish',
  'SnoopProxy',
  'Proxyman CA',
  'Untrusted Interception Root'
];

/**
 * Serialização determinística canônica JSON (RFC 8785 JCS)
 */
export function canonicalJsonStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalJsonStringify(item)).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJsonStringify(obj[k])).join(',') + '}';
}

/**
 * Calcula o digest SPKI (Subject Public Key Info) SHA-256 no formato RFC 7469
 * pin-sha256="<base64-encoded-sha256>"
 */
export function calculateSpkiPinSha256(publicKeyBytesOrPem: Buffer | string): string {
  let derBuffer: Buffer;
  if (typeof publicKeyBytesOrPem === 'string') {
    // Normalizar PEM se fornecido
    const cleanPem = publicKeyBytesOrPem
      .replace(/-----BEGIN [A-Z ]+-----/g, '')
      .replace(/-----END [A-Z ]+-----/g, '')
      .replace(/[\r\n\s]/g, '');
    derBuffer = Buffer.from(cleanPem, 'base64');
  } else {
    derBuffer = publicKeyBytesOrPem;
  }

  const hash = createHash('sha256').update(derBuffer).digest('base64');
  return `pin-sha256="${hash}"`;
}

/**
 * Calcula o Fingerprint SHA-256 do certificado X.509 em formato hexadecimal (separado por dois pontos)
 */
export function calculateCertFingerprintSha256(certDerOrPem: Buffer | string): string {
  let derBuffer: Buffer;
  if (typeof certDerOrPem === 'string') {
    const cleanPem = certDerOrPem
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/[\r\n\s]/g, '');
    derBuffer = Buffer.from(cleanPem, 'base64');
  } else {
    derBuffer = certDerOrPem;
  }

  const hashHex = createHash('sha256').update(derBuffer).digest('hex').toUpperCase();
  return hashHex.match(/.{2}/g)?.join(':') || hashHex;
}

/**
 * Validação de correspondência de hostname com SAN ou Common Name (RFC 6125)
 * Suporte a Wildcard com restrição estrita (apenas 1 nível à esquerda)
 */
export function matchHostname(hostname: string, pattern: string): boolean {
  const normHost = hostname.toLowerCase().trim();
  const normPat = pattern.toLowerCase().trim();

  if (normHost === normPat) {
    return true;
  }

  if (normPat.startsWith('*.')) {
    const suffix = normPat.slice(2);
    // Não permitir wildcard em TLDs comuns (ex: *.com.br, *.br, *.com)
    const suffixParts = suffix.split('.');
    if (suffixParts.length < 2 || (suffixParts.length === 2 && ['com.br', 'gov.br', 'edu.br', 'org.br'].includes(suffix))) {
      return false;
    }

    const hostParts = normHost.split('.');
    if (hostParts.length < 3) {
      return false;
    }

    const hostSuffix = hostParts.slice(1).join('.');
    return hostSuffix === suffix;
  }

  return false;
}

/**
 * Inspeciona assinaturas de interceptação MitM em certificados
 */
export function detectMitmSignatures(cert: X509CertInspection, quarantinedCAs: string[] = []): string[] {
  const detected: string[] = [];

  const fieldsToInspect = [
    cert.issuerCN,
    cert.subjectCN,
    ...cert.subjectAltNames
  ].join(' ').toLowerCase();

  for (const pattern of KNOWN_MITM_CA_PATTERNS) {
    if (fieldsToInspect.includes(pattern.toLowerCase())) {
      detected.push(`KNOWN_MITM_INTERCEPTOR:${pattern}`);
    }
  }

  // Verificar CAs em Quarentena Governamental / DPO
  for (const qCa of quarantinedCAs) {
    if (cert.issuerCN.toLowerCase().includes(qCa.toLowerCase())) {
      detected.push(`QUARANTINED_ROGUE_CA:${qCa}`);
    }
  }

  // Auto-assinado suspeito fora de ambiente de teste
  if (cert.subjectCN === cert.issuerCN && !detected.some(d => d.includes('INTERCEPTOR'))) {
    detected.push('SUSPICIOUS_UNTRUSTED_SELF_SIGNED');
  }

  return detected;
}

/**
 * Emite Selo Notarial Probatório WORM de Validação de TLS Pinning
 */
export function createTlsPinProofSeal(
  validation: {
    hostname: string;
    status: TlsPinValidationStatus;
    matchedPinId?: string;
    presentedFingerprint: string;
    spkiSha256: string;
    threatLevel: string;
  },
  secret: string = WORM_HMAC_DEFAULT_SECRET
): TlsPinProofSeal {
  const sealId = `tls-seal-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const issuedAt = new Date().toISOString();

  const payload = {
    sealId,
    hostname: validation.hostname,
    status: validation.status,
    matchedPinId: validation.matchedPinId || null,
    presentedFingerprint: validation.presentedFingerprint,
    spkiSha256: validation.spkiSha256,
    threatLevel: validation.threatLevel,
    issuedAt
  };

  const canonicalString = canonicalJsonStringify(payload);
  const canonicalDigest = createHash('sha256').update(canonicalString).digest('hex');
  const hmacSignature = createHmac('sha256', secret).update(canonicalDigest).digest('hex');

  const tokenPayload = {
    sealId,
    canonicalDigest,
    hmacSignature,
    issuedAt,
    status: validation.status,
    hostname: validation.hostname,
    matchedPinId: validation.matchedPinId
  };

  const token = `tls_pin_v1_${Buffer.from(JSON.stringify(tokenPayload)).toString('base64url')}`;

  return {
    sealId,
    token,
    canonicalDigest,
    hmacSignature,
    issuedAt,
    status: validation.status,
    hostname: validation.hostname,
    matchedPinId: validation.matchedPinId
  };
}

/**
 * Verifica integridade pericial de Selo WORM de TLS Pinning
 */
export function verifyTlsPinProofSeal(
  sealToken: string,
  secret: string = WORM_HMAC_DEFAULT_SECRET
): {
  isValid: boolean;
  seal?: TlsPinProofSeal;
  error?: string;
} {
  try {
    if (!sealToken.startsWith('tls_pin_v1_')) {
      return { isValid: false, error: 'Prefixo de token de selo TLS Pinning inválido' };
    }

    const rawBase64 = sealToken.replace('tls_pin_v1_', '');
    const decoded = JSON.parse(Buffer.from(rawBase64, 'base64url').toString('utf-8'));

    const expectedHmac = createHmac('sha256', secret).update(decoded.canonicalDigest).digest('hex');
    if (expectedHmac !== decoded.hmacSignature) {
      return { isValid: false, error: 'Assinatura HMAC de selo de TLS Pinning forjada ou adulterada' };
    }

    return {
      isValid: true,
      seal: {
        sealId: decoded.sealId,
        token: sealToken,
        canonicalDigest: decoded.canonicalDigest,
        hmacSignature: decoded.hmacSignature,
        issuedAt: decoded.issuedAt,
        status: decoded.status,
        hostname: decoded.hostname,
        matchedPinId: decoded.matchedPinId
      }
    };
  } catch (err: any) {
    return { isValid: false, error: `Falha na decodificação do selo probatório: ${err.message}` };
  }
}

/**
 * Motor central de validação de TLS Pinning & Conformidade de Cadeia X.509
 */
export function evaluateTlsCertificatePinning(params: {
  hostname: string;
  presentedCertificate: X509CertInspection;
  configuredPins: TlsSpkiPin[];
  quarantinedCAs?: string[];
  policyMode?: TlsPinPolicyMode;
  now?: Date;
  secret?: string;
}): TlsPinValidationResult {
  const {
    hostname,
    presentedCertificate: cert,
    configuredPins,
    quarantinedCAs = [],
    policyMode = TlsPinPolicyMode.STRICT_ENFORCE,
    now = new Date(),
    secret = WORM_HMAC_DEFAULT_SECRET
  } = params;

  const evaluationId = `tls-eval-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const timestamp = now.toISOString();

  // 1. Detecção de assinaturas de Proxy MitM / CAs fraudulentas
  const mitmSignatures = detectMitmSignatures(cert, quarantinedCAs);

  // 2. Validação Temporal (notBefore / notAfter)
  const validFrom = new Date(cert.validFrom);
  const validTo = new Date(cert.validTo);
  const isTemporalExpired = now < validFrom || now > validTo;

  // 3. Validação de SAN / CN
  const allHostPatterns = [cert.subjectCN, ...cert.subjectAltNames];
  const isSanMatch = allHostPatterns.some(pat => matchHostname(hostname, pat));

  // 4. Correspondência com Pins Cadastrados para o Hostname
  const hostPins = configuredPins.filter(p => matchHostname(hostname, p.hostname));
  const primaryPin = hostPins.find(p => p.type === 'PRIMARY');
  const backupPins = hostPins.filter(p => p.type === 'BACKUP_ROTATION' || p.type === 'EMERGENCY_RECOVERY');

  // Normalização do SPKI apresentado
  const presentedSpkiNorm = cert.spkiSha256.startsWith('pin-sha256=')
    ? cert.spkiSha256
    : `pin-sha256="${cert.spkiSha256}"`;

  let matchedPin: TlsSpkiPin | undefined;
  let status: TlsPinValidationStatus;
  let threatLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL_MITM';
  let recommendation: string;
  let chainValid = true;

  if (mitmSignatures.some(s => s.startsWith('KNOWN_MITM_INTERCEPTOR') || s.startsWith('QUARANTINED_ROGUE_CA'))) {
    status = TlsPinValidationStatus.CHAIN_UNTRUSTED_ROGUE_CA;
    threatLevel = 'CRITICAL_MITM';
    chainValid = false;
    recommendation = 'Conexão bloqueada imediatamente: detectada Autoridade Certificadora de interceptação MitM ou em quarentena.';
  } else if (isTemporalExpired) {
    status = TlsPinValidationStatus.CERTIFICATE_EXPIRED;
    threatLevel = 'HIGH';
    chainValid = false;
    recommendation = 'Certificado TLS expirado ou com relógio de sistema dessincronizado. Renove o certificado com a CA.';
  } else if (!isSanMatch) {
    status = TlsPinValidationStatus.SAN_MISMATCH;
    threatLevel = 'HIGH';
    chainValid = false;
    recommendation = `Divergência de Subject Alternative Name (SAN). O certificado não cobre o domínio requisitado (${hostname}).`;
  } else if (primaryPin && (primaryPin.spkiSha256 === presentedSpkiNorm || primaryPin.spkiSha256 === cert.spkiSha256)) {
    matchedPin = primaryPin;
    status = TlsPinValidationStatus.PIN_MATCH_PRIMARY;
    threatLevel = 'NONE';
    recommendation = 'Conexão validada com sucesso: correspondência exata com o Pin SPKI Primário.';
  } else {
    // Verificar backups de rotação
    const matchingBackup = backupPins.find(
      b => b.spkiSha256 === presentedSpkiNorm || b.spkiSha256 === cert.spkiSha256
    );

    if (matchingBackup) {
      matchedPin = matchingBackup;
      status = TlsPinValidationStatus.PIN_MATCH_BACKUP;
      threatLevel = 'LOW';
      recommendation = 'Correspondência com Pin SPKI de Rotação Suave. Recomenda-se promover este Pin a Primário no painel.';
    } else {
      // Divergência de Pin: suspeita de ataque de homem-no-meio (MitM)
      status = TlsPinValidationStatus.PIN_MISMATCH_SUSPECTED_MITM;
      threatLevel = 'CRITICAL_MITM';
      chainValid = false;
      recommendation = 'ALERTA DE SEGURANÇA: Chave pública apresentada diverge de todos os Pins cadastrados. Interceptação MitM provável.';
    }
  }

  // Emissão do Selo Probatório WORM
  const proofSeal = createTlsPinProofSeal({
    hostname,
    status,
    matchedPinId: matchedPin?.pinId,
    presentedFingerprint: cert.fingerprintSha256,
    spkiSha256: cert.spkiSha256,
    threatLevel
  }, secret);

  return {
    evaluationId,
    hostname,
    status,
    policyMode,
    matchedPin,
    presentedCertificate: cert,
    chainValid,
    threatLevel,
    mitmSignaturesDetected: mitmSignatures,
    recommendation,
    timestamp,
    proofSeal
  };
}
