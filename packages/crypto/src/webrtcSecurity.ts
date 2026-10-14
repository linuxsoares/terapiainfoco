/**
 * Motor de Segurança WebRTC & Auditoria de Canais de Telepsicologia
 * RFC-001 §3.2, §4.4, §5.2 e Resolução CFP nº 011/2018 (Sigilo e Proteção de Canais Remotos)
 */

import { createHash, randomBytes } from 'crypto';
import { WebRtcCipherSuite, WebRtcSecurityGrade, WebRtcVerificationStatus } from '@terapiainfoco/shared';

// Alfabeto fonético internacional para SAS (Short Authentication String) falado
const NATO_PHONETIC_ALPHABET = [
  'Alfa', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot',
  'Golf', 'Hotel', 'India', 'Juliett', 'Kilo', 'Lima',
  'Mike', 'November', 'Oscar', 'Papa', 'Quebec', 'Romeo',
  'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'Xray',
  'Yankee', 'Zulu'
];

const DTLS_FINGERPRINT_REGEX = /^SHA-256\s+([0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}$/;

/**
 * Normaliza o formato de um fingerprint DTLS para a especificação RFC 8122 (SHA-256 XX:XX:...)
 */
export function normalizeDtlsFingerprint(raw: string): string {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Fingerprint DTLS deve ser uma string não vazia');
  }

  let cleaned = raw.trim();
  // Se tem prefixo SHA-256 ou sha-256
  if (/^sha-?256\s*[:\s]/i.test(cleaned)) {
    cleaned = cleaned.replace(/^sha-?256\s*[:\s]*/i, '');
  }

  // Remove espaços, traços ou dois-pontos para analisar os hexadecimais puros
  const hexOnly = cleaned.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
  if (hexOnly.length !== 64) {
    throw new Error(`Fingerprint DTLS inválido: esperado 32 bytes (64 caracteres hexadecimais), recebido ${hexOnly.length}`);
  }

  // Divide em pares de 2 caracteres separados por dois-pontos
  const pairs: string[] = [];
  for (let i = 0; i < 64; i += 2) {
    pairs.push(hexOnly.slice(i, i + 2));
  }

  return `SHA-256 ${pairs.join(':')}`;
}

/**
 * Valida se um fingerprint está em formato estrito RFC 8122
 */
export function isValidDtlsFingerprint(fingerprint: string): boolean {
  if (!fingerprint || typeof fingerprint !== 'string') return false;
  return DTLS_FINGERPRINT_REGEX.test(fingerprint.trim());
}

/**
 * Gera um fingerprint DTLS sintético válido (para simulações, testes ou certificados locais)
 */
export function generateSyntheticDtlsFingerprint(seedOrNonce?: string): string {
  const hash = seedOrNonce 
    ? createHash('sha256').update(seedOrNonce).digest('hex')
    : randomBytes(32).toString('hex');
  
  return normalizeDtlsFingerprint(hash);
}

export interface WebRtcSafetyNumbersResult {
  safetyNumbers: string;       // Formato: "48291 30194 82015 67123"
  phoneticSas: string;         // Formato: "Alfa-Delta-Whiskey-Echo"
  numericBlocks: string[];     // Array de 4 blocos de 5 dígitos
  combinedFingerprintHash: string; // Hash SHA-256 de base dos dois certificados
}

/**
 * Gera o par de Safety Numbers (SAS - Short Authentication String) simétrico
 * entre o terapeuta e o paciente, protegendo contra ataques Man-in-the-Middle (MitM).
 */
export function generateWebRtcSafetyNumbers(
  fingerprintA: string,
  fingerprintB: string
): WebRtcSafetyNumbersResult {
  const normA = normalizeDtlsFingerprint(fingerprintA);
  const normB = normalizeDtlsFingerprint(fingerprintB);

  // Ordenação lexicográfica para garantir que ambos os peers obtenham exatamente o mesmo SAS
  const sorted = [normA, normB].sort();
  const salt = 'TERAPIA_IN_FOCO_WEBRTC_SAS_V1';

  const combinedBuffer = Buffer.concat([
    Buffer.from(salt, 'utf8'),
    Buffer.from(sorted[0], 'utf8'),
    Buffer.from(sorted[1], 'utf8')
  ]);

  const hashBuffer = createHash('sha256').update(combinedBuffer).digest();
  const combinedFingerprintHash = hashBuffer.toString('hex');

  // Gera 4 blocos de 5 dígitos a partir dos primeiros 16 bytes
  const numericBlocks: string[] = [];
  for (let i = 0; i < 4; i++) {
    const chunk = hashBuffer.readUInt32BE(i * 4);
    const num = (chunk % 100000).toString().padStart(5, '0');
    numericBlocks.push(num);
  }
  const safetyNumbers = numericBlocks.join(' ');

  // Gera 4 palavras fonéticas a partir dos bytes 16 a 19
  const phoneticWords: string[] = [];
  for (let i = 16; i < 20; i++) {
    const idx = hashBuffer[i] % NATO_PHONETIC_ALPHABET.length;
    phoneticWords.push(NATO_PHONETIC_ALPHABET[idx]);
  }
  const phoneticSas = phoneticWords.join('-');

  return {
    safetyNumbers,
    phoneticSas,
    numericBlocks,
    combinedFingerprintHash
  };
}

export interface CipherSuiteEvaluation {
  securityGrade: WebRtcSecurityGrade;
  scorePercentage: number;
  recommendations: string[];
  isAead: boolean;
  hasPfs: boolean;
}

/**
 * Avalia o grau criptográfico da ciphersuite de mídia WebRTC / DTLS-SRTP
 */
export function evaluateCipherSuite(cipherSuite: string, dtlsVersion?: string): CipherSuiteEvaluation {
  const upper = (cipherSuite || '').toUpperCase();
  const recommendations: string[] = [];
  let scorePercentage = 100;
  let securityGrade = WebRtcSecurityGrade.OPTIMAL;
  let isAead = false;
  let hasPfs = true;

  if (upper.includes('GCM') || upper.includes('AEAD')) {
    isAead = true;
    if (upper.includes('256')) {
      securityGrade = WebRtcSecurityGrade.OPTIMAL;
      scorePercentage = 100;
      recommendations.push('Cifra AEAD AES-256-GCM em conformidade máxima com a RFC-001 e NIST.');
    } else {
      securityGrade = WebRtcSecurityGrade.ACCEPTABLE;
      scorePercentage = 85;
      recommendations.push('Cifra AEAD AES-128-GCM aceitável com proteção contra adulteração de pacotes de voz/vídeo.');
    }
  } else if (upper.includes('HMAC_SHA1') || upper.includes('AES128_CM')) {
    securityGrade = WebRtcSecurityGrade.LEGACY;
    scorePercentage = 60;
    isAead = false;
    recommendations.push('SRTP legado com HMAC-SHA1. Recomenda-se atualizar o navegador ou peer para suporte a AEAD GCM.');
  } else {
    securityGrade = WebRtcSecurityGrade.INSECURE;
    scorePercentage = 30;
    hasPfs = false;
    recommendations.push('Ciphersuite não reconhecida ou sem garantias criptográficas modernas para atendimento psicológico.');
  }

  if (dtlsVersion && !dtlsVersion.includes('1.2') && !dtlsVersion.includes('1.3')) {
    scorePercentage = Math.max(20, scorePercentage - 20);
    recommendations.push('Versão de DTLS abaixo de 1.2 detectada. Risco de vulnerabilidades de handshake.');
  }

  return {
    securityGrade,
    scorePercentage,
    recommendations,
    isAead,
    hasPfs
  };
}

/**
 * Calcula o Hash Probatório Canônico da Sessão de Teleconsulta para selagem no WORM
 */
export function calculateSessionProbataryDigest(params: {
  sessionId: string;
  appointmentId?: string;
  therapistId: string;
  patientId: string;
  startedAt: string;
  endedAt?: string;
  therapistFingerprint: string;
  patientFingerprint?: string;
  safetyNumbers: string;
  cipherSuite: string;
  verificationStatus: WebRtcVerificationStatus;
}): string {
  const canonicalPayload = JSON.stringify({
    appointmentId: params.appointmentId || null,
    cipherSuite: params.cipherSuite,
    endedAt: params.endedAt || null,
    patientFingerprint: params.patientFingerprint ? normalizeDtlsFingerprint(params.patientFingerprint) : null,
    patientId: params.patientId,
    safetyNumbers: params.safetyNumbers,
    sessionId: params.sessionId,
    startedAt: params.startedAt,
    therapistFingerprint: normalizeDtlsFingerprint(params.therapistFingerprint),
    therapistId: params.therapistId,
    verificationStatus: params.verificationStatus
  });

  return createHash('sha256').update(canonicalPayload, 'utf8').digest('hex');
}
