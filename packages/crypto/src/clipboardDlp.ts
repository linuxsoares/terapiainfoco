import { createHash, createHmac, randomBytes } from 'node:crypto';
import {
  DlpPolicyMode,
  DlpRiskLevel,
  SteganographyInspectionStatus
} from '@terapiainfoco/shared';
import type {
  DlpForensicPayload,
  DlpInspectionResult,
  DlpEvaluationResult
} from '@terapiainfoco/shared';
import { maskCPF, maskEmail } from './dataMasking';

/**
 * Caracteres Invisíveis Unicode (Zero-Width Steganography)
 * Utilizados para esteganografia forense de rastreamento de vazamento
 * sem alteração perceptível visual ou de layout para o operador clínico.
 */
export const ZW_ZERO = '\u200B';        // Zero-Width Space (Bit 0)
export const ZW_ONE = '\u200C';         // Zero-Width Non-Joiner (Bit 1)
export const ZW_START = '\uFEFF\u200D'; // Delimitador de início (BOM + ZWJ)
export const ZW_END = '\u200D\uFEFF';   // Delimitador de fim (ZWJ + BOM)

export const DEFAULT_DLP_SECRET = process.env.DLP_SECRET_KEY || 'terapiainfoco_dlp_forensic_steganography_secret_2026';

/**
 * Estrutura serializada compacta de marca d'água esteganográfica
 */
interface CompactWatermark {
  w: string; // Watermark ID
  o: string; // Operator ID
  p: string; // Patient ID
  t: number; // Timestamp em milissegundos
  d: string; // Prefixo SHA-256 do texto original (16 caracteres)
  s: string; // Prefixo HMAC-SHA256 (16 caracteres)
}

/**
 * Calcula o digest canônico SHA-256 do conteúdo textual
 */
export function calculateContentDigest(text: string): string {
  const clean = stripZeroWidthWatermark(text).trim();
  return createHash('sha256').update(clean, 'utf8').digest('hex');
}

/**
 * Gera a assinatura HMAC-SHA256 para comprovação de integridade e não-repúdio
 */
export function signForensicData(
  data: { watermarkId: string; operatorId: string; patientId: string; timestamp: number; contentDigest: string },
  secret: string = DEFAULT_DLP_SECRET
): string {
  const canonical = `${data.watermarkId}:${data.operatorId}:${data.patientId}:${data.timestamp}:${data.contentDigest}`;
  return createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
}

/**
 * Converte string binária para sequência de caracteres Zero-Width
 */
export function binaryToZeroWidth(binary: string): string {
  let result = '';
  for (let i = 0; i < binary.length; i++) {
    result += binary[i] === '1' ? ZW_ONE : ZW_ZERO;
  }
  return result;
}

/**
 * Converte sequência de caracteres Zero-Width de volta para string binária
 */
export function zeroWidthToBinary(zw: string): string {
  let binary = '';
  for (let i = 0; i < zw.length; i++) {
    if (zw[i] === ZW_ONE) {
      binary += '1';
    } else if (zw[i] === ZW_ZERO) {
      binary += '0';
    }
  }
  return binary;
}

/**
 * Converte texto UTF-8 em string binária de 8 bits por caractere
 */
export function stringToBinary(str: string): string {
  const buffer = Buffer.from(str, 'utf8');
  let binary = '';
  for (let i = 0; i < buffer.length; i++) {
    binary += buffer[i].toString(2).padStart(8, '0');
  }
  return binary;
}

/**
 * Converte string binária de 8 bits por caractere de volta para string UTF-8
 */
export function binaryToString(binary: string): string {
  if (binary.length % 8 !== 0) {
    throw new Error('Cadeia binária com comprimento inválido para decodificação UTF-8');
  }
  const bytes: number[] = [];
  for (let i = 0; i < binary.length; i += 8) {
    const byteStr = binary.slice(i, i + 8);
    bytes.push(parseInt(byteStr, 2));
  }
  return Buffer.from(bytes).toString('utf8');
}

/**
 * Remove qualquer marca d'água esteganográfica e caracteres zero-width do texto
 */
export function stripZeroWidthWatermark(text: string): string {
  if (!text) return '';
  return text
    .replace(new RegExp(`[${ZW_ZERO}${ZW_ONE}\u200D\uFEFF]`, 'g'), '');
}

/**
 * Detecta a presença de caracteres de largura zero no texto
 */
export function countZeroWidthCharacters(text: string): number {
  if (!text) return 0;
  const matches = text.match(new RegExp(`[${ZW_ZERO}${ZW_ONE}\u200D\uFEFF]`, 'g'));
  return matches ? matches.length : 0;
}

/**
 * Incorpora uma marca d'água forense esteganográfica invisível ao texto clínico
 */
export function embedSteganographicWatermark(
  text: string,
  metadata: {
    operatorId: string;
    operatorName?: string;
    patientId: string;
    patientName?: string;
    sessionOrRecordId?: string;
    watermarkId?: string;
  },
  secret: string = DEFAULT_DLP_SECRET
): {
  watermarkedText: string;
  invisibleCharsCount: number;
  payload: DlpForensicPayload;
} {
  const cleanText = stripZeroWidthWatermark(text);
  const watermarkId = metadata.watermarkId || `dlp_${randomBytes(6).toString('hex')}`;
  const timestamp = Date.now();
  const fullDigest = calculateContentDigest(cleanText);
  const digestPrefix = fullDigest.substring(0, 16);

  const fullSignature = signForensicData(
    {
      watermarkId,
      operatorId: metadata.operatorId,
      patientId: metadata.patientId,
      timestamp,
      contentDigest: digestPrefix
    },
    secret
  );
  const signaturePrefix = fullSignature.substring(0, 16);

  const compact: CompactWatermark = {
    w: watermarkId,
    o: metadata.operatorId,
    p: metadata.patientId,
    t: timestamp,
    d: digestPrefix,
    s: signaturePrefix
  };

  const serialized = JSON.stringify(compact);
  const binary = stringToBinary(serialized);
  const zeroWidthPayload = binaryToZeroWidth(binary);

  const fullWatermarkSequence = `${ZW_START}${zeroWidthPayload}${ZW_END}`;

  // Inserção esteganográfica: se houver texto, insere logo após o primeiro caractere; se vazio, no início
  let watermarkedText: string;
  if (cleanText.length > 0) {
    watermarkedText = cleanText.slice(0, 1) + fullWatermarkSequence + cleanText.slice(1);
  } else {
    watermarkedText = fullWatermarkSequence;
  }

  const payload: DlpForensicPayload = {
    watermarkId,
    operatorId: metadata.operatorId,
    operatorName: metadata.operatorName,
    patientId: metadata.patientId,
    patientName: metadata.patientName,
    timestamp,
    sessionOrRecordId: metadata.sessionOrRecordId,
    contentDigest: fullDigest,
    hmacSignature: fullSignature
  };

  return {
    watermarkedText,
    invisibleCharsCount: fullWatermarkSequence.length,
    payload
  };
}

/**
 * Inspeciona e decodifica qualquer texto suspeito de vazamento procurando a marca d'água esteganográfica
 */
export function extractSteganographicWatermark(
  text: string,
  secret: string = DEFAULT_DLP_SECRET
): DlpInspectionResult {
  const zeroWidthCount = countZeroWidthCharacters(text);

  if (zeroWidthCount === 0) {
    return {
      status: SteganographyInspectionStatus.NO_WATERMARK,
      hasZeroWidthChars: false,
      zeroWidthCharCount: 0,
      payload: null,
      verifiedAt: new Date().toISOString(),
      riskLevel: DlpRiskLevel.LOW,
      extractedIntegrity: false,
      message: 'Nenhum padrão esteganográfico zero-width detectado no texto analisado.'
    };
  }

  const startIndex = text.indexOf(ZW_START);
  const endIndex = text.indexOf(ZW_END);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return {
      status: SteganographyInspectionStatus.INVALID_PAYLOAD,
      hasZeroWidthChars: true,
      zeroWidthCharCount: zeroWidthCount,
      payload: null,
      verifiedAt: new Date().toISOString(),
      riskLevel: DlpRiskLevel.MEDIUM,
      extractedIntegrity: false,
      message: 'Caracteres invisíveis de largura zero encontrados, mas os delimitadores de pacote estão ausentes ou corrompidos.'
    };
  }

  const enclosedContent = text.substring(startIndex + ZW_START.length, endIndex);
  const binary = zeroWidthToBinary(enclosedContent);

  if (!binary || binary.length % 8 !== 0) {
    return {
      status: SteganographyInspectionStatus.TAMPERED_WATERMARK,
      hasZeroWidthChars: true,
      zeroWidthCharCount: zeroWidthCount,
      payload: null,
      verifiedAt: new Date().toISOString(),
      riskLevel: DlpRiskLevel.HIGH,
      extractedIntegrity: false,
      message: 'Carga útil esteganográfica corrompida: desalinhamento de bytes na decodificação.'
    };
  }

  try {
    const jsonStr = binaryToString(binary);
    const compact: CompactWatermark = JSON.parse(jsonStr);

    if (!compact.w || !compact.o || !compact.p || !compact.t || !compact.d || !compact.s) {
      return {
        status: SteganographyInspectionStatus.TAMPERED_WATERMARK,
        hasZeroWidthChars: true,
        zeroWidthCharCount: zeroWidthCount,
        payload: null,
        verifiedAt: new Date().toISOString(),
        riskLevel: DlpRiskLevel.HIGH,
        extractedIntegrity: false,
        message: 'Estrutura de metadados da marca d\'água incompleta ou inválida.'
      };
    }

    // Validação criptográfica do HMAC
    const expectedFullSig = signForensicData(
      {
        watermarkId: compact.w,
        operatorId: compact.o,
        patientId: compact.p,
        timestamp: compact.t,
        contentDigest: compact.d
      },
      secret
    );

    const expectedSigPrefix = expectedFullSig.substring(0, 16);
    if (expectedSigPrefix !== compact.s) {
      return {
        status: SteganographyInspectionStatus.TAMPERED_WATERMARK,
        hasZeroWidthChars: true,
        zeroWidthCharCount: zeroWidthCount,
        payload: {
          watermarkId: compact.w,
          operatorId: compact.o,
          patientId: compact.p,
          timestamp: compact.t,
          contentDigest: compact.d,
          hmacSignature: compact.s
        },
        verifiedAt: new Date().toISOString(),
        riskLevel: DlpRiskLevel.HIGH,
        extractedIntegrity: false,
        message: 'Assinatura criptográfica HMAC incompatível: indício de adulteração ou segredo divergente.'
      };
    }

    // Verificar se o texto atual corresponde ao digest original
    const currentClean = stripZeroWidthWatermark(text);
    const currentFullDigest = calculateContentDigest(currentClean);
    const currentDigestPrefix = currentFullDigest.substring(0, 16);
    const textIntegrityMatch = currentDigestPrefix === compact.d;

    return {
      status: SteganographyInspectionStatus.GENUINE_WATERMARK,
      hasZeroWidthChars: true,
      zeroWidthCharCount: zeroWidthCount,
      payload: {
        watermarkId: compact.w,
        operatorId: compact.o,
        patientId: compact.p,
        timestamp: compact.t,
        contentDigest: textIntegrityMatch ? currentFullDigest : compact.d,
        hmacSignature: expectedFullSig
      },
      sourceNotice: `Vazamento Rastreável — Operador ID: ${compact.o} | Paciente ID: ${compact.p} | Cópia emitida em ${new Date(compact.t).toLocaleString('pt-BR')}`,
      verifiedAt: new Date().toISOString(),
      riskLevel: textIntegrityMatch ? DlpRiskLevel.HIGH : DlpRiskLevel.MEDIUM,
      extractedIntegrity: textIntegrityMatch,
      message: textIntegrityMatch
        ? 'Marca d\'água esteganográfica autêntica com texto 100% íntegro em relação à cópia de origem.'
        : 'Marca d\'água esteganográfica autêntica extraída com sucesso (o texto circundante foi parcialmente recortado ou modificado após a cópia).'
    };
  } catch (err) {
    return {
      status: SteganographyInspectionStatus.TAMPERED_WATERMARK,
      hasZeroWidthChars: true,
      zeroWidthCharCount: zeroWidthCount,
      payload: null,
      verifiedAt: new Date().toISOString(),
      riskLevel: DlpRiskLevel.HIGH,
      extractedIntegrity: false,
      message: `Falha ao processar payload esteganográfico: ${err instanceof Error ? err.message : 'Erro desconhecido'}`
    };
  }
}

/**
 * Avalia o risco de exfiltração do texto clínico com base no volume e conteúdo sensível
 */
export function analyzeDlpRisk(text: string, context?: string): DlpRiskLevel {
  const clean = stripZeroWidthWatermark(text);
  const length = clean.length;

  const sensitiveKeywords = [
    'soap', 'subjetivo', 'objetivo', 'avaliação', 'plano',
    'diagnóstico', 'hipótese', 'anamnese', 'psicopatologia',
    'cid-10', 'cid-11', 'dsm-5', 'conduta', 'queixa principal',
    'sigilo profissional', 'prescrição', 'evolução clínica'
  ];

  const lower = clean.toLowerCase();
  const keywordMatches = sensitiveKeywords.filter(kw => lower.includes(kw));

  // Risco Crítico: Cópia em massa (> 2500 caracteres) com múltiplos termos clínicos
  if (length > 2500 && keywordMatches.length >= 2) {
    return DlpRiskLevel.CRITICAL;
  }

  // Risco Alto: Texto clínico substancial (> 800 caracteres) ou anamnese/SOAP explícito
  if (length > 800 || keywordMatches.length >= 2 || context === 'SOAP_NOTES' || context === 'ANAMNESE') {
    return DlpRiskLevel.HIGH;
  }

  // Risco Médio: Mais de 200 caracteres ou contexto de prontuário
  if (length > 200 || keywordMatches.length === 1 || context === 'PATIENT_PROFILE') {
    return DlpRiskLevel.MEDIUM;
  }

  return DlpRiskLevel.LOW;
}

/**
 * Aplica mascaramento básico de dados sensíveis para proteção na cópia
 */
export function maskSensitiveDataForClipboard(text: string): string {
  let masked = text;

  // Mascarar CPFs no formato XXX.XXX.XXX-XX ou 11 dígitos
  masked = masked.replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, match => maskCPF(match));
  masked = masked.replace(/\b\d{11}\b/g, match => maskCPF(match));

  // Mascarar E-mails
  masked = masked.replace(/[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}/g, match => maskEmail(match));

  return masked;
}

/**
 * Motor de avaliação e enforcement de política de Clipboard DLP
 */
export function evaluateClipboardPolicyEngine(options: {
  text: string;
  operatorId: string;
  operatorName?: string;
  patientId: string;
  patientName?: string;
  context?: string;
  policyMode?: DlpPolicyMode;
  maxBulkLength?: number;
  secret?: string;
}): DlpEvaluationResult {
  const policy = options.policyMode || DlpPolicyMode.WATERMARK_ONLY;
  const maxLimit = options.maxBulkLength || 3500;
  const clean = stripZeroWidthWatermark(options.text);
  const risk = analyzeDlpRisk(clean, options.context);

  // 1. Política de Bloqueio de Exfiltração em Massa
  if (policy === DlpPolicyMode.BLOCK_EXFILTRATION) {
    if (clean.length > maxLimit || risk === DlpRiskLevel.CRITICAL) {
      return {
        allowed: false,
        action: DlpPolicyMode.BLOCK_EXFILTRATION,
        riskLevel: risk,
        transformedText: '',
        watermarkId: `dlp_blocked_${randomBytes(4).toString('hex')}`,
        invisibleCharsCount: 0,
        requiresJustification: true,
        rejectionReason: `Cópia em massa bloqueada pela política DLP (LGPD Art. 46 / CFP nº 001/2009). Texto de ${clean.length} caracteres excede o limiar seguro de transferência.`
      };
    }
  }

  // 2. Preparar texto a ser transformado
  let workingText = clean;
  if (policy === DlpPolicyMode.MASK_SENSITIVE) {
    workingText = maskSensitiveDataForClipboard(workingText);
  }

  let disclaimer = '';
  if (policy === DlpPolicyMode.WATERMARK_AND_NOTICE) {
    disclaimer = `\n\n[CONFIDENCIAL — SIGILO PROFISSIONAL CFP nº 001/2009 | LGPD Art. 46 | Rastreabilidade Forense: Op. ${options.operatorName || options.operatorId} | ${new Date().toLocaleDateString('pt-BR')}]`;
    workingText += disclaimer;
  }

  // 3. Embutir marca d'água esteganográfica zero-width
  const { watermarkedText, invisibleCharsCount, payload } = embedSteganographicWatermark(
    workingText,
    {
      operatorId: options.operatorId,
      operatorName: options.operatorName,
      patientId: options.patientId,
      patientName: options.patientName,
      sessionOrRecordId: options.context
    },
    options.secret
  );

  return {
    allowed: true,
    action: policy,
    riskLevel: risk,
    transformedText: watermarkedText,
    watermarkId: payload.watermarkId,
    invisibleCharsCount,
    disclaimerText: disclaimer ? disclaimer.trim() : undefined,
    requiresJustification: risk === DlpRiskLevel.CRITICAL
  };
}
