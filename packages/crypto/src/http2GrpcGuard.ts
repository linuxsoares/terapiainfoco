/**
 * Motor Criptográfico de Proteção contra Injeção de Cabeçalhos e Split de Requisições HTTP/2 & gRPC
 * Em conformidade com:
 * - RFC 9113 (HTTP/2 Specification - Section 8: HTTP Message Exchange)
 * - RFC 7540 (HTTP/2 Specification Legacy)
 * - RFC 7541 (HPACK: Header Compression for HTTP/2)
 * - gRPC over HTTP/2 Protocol Specification
 * - OWASP ASVS v4.0 V5.1 & V5.2 / CWE-113 (HTTP Response/Request Splitting)
 * - CWE-444 (Inconsistent Interpretation of HTTP Requests / HTTP Request Smuggling)
 * - RFC 8785 (JSON Canonicalization Scheme - JCS) para Selagem WORM Notarial
 */

import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import {
  Http2RiskSeverity,
  Http2ThreatCategory,
  Http2ValidationAction,
  Http2ProtocolTarget
} from '@terapiainfoco/shared';
import type {
  Http2HeaderPair,
  Http2Threat,
  Http2ProofSeal,
  Http2InspectionResult,
  Http2GuardPolicy
} from '@terapiainfoco/shared';

// Segredo mestre HMAC para selagem notarial RFC 8785 WORM
const HTTP2_NOTARY_HMAC_SECRET = process.env.HTTP2_NOTARY_HMAC_SECRET || 'terapiainfoco_http2_desync_worm_secret_key_2026';

/**
 * Política padrão estrita de conformidade RFC 9113
 */
export const DEFAULT_HTTP2_POLICY: Http2GuardPolicy = {
  blockTransferEncoding: true,
  enforceLowercaseHeaders: true,
  stripConnectionHeaders: true,
  validateGrpcMetadata: true,
  maxHeaderNameLength: 128,
  maxHeaderValueLength: 8192,
  maxTotalHeadersCount: 100,
  strictContentLengthValidation: true,
  allowedPseudoHeaders: [':method', ':path', ':authority', ':scheme', ':status']
};

/**
 * Cabeçalhos Connection-Specific proibidos em HTTP/2 (RFC 9113 §8.2.2)
 */
export const FORBIDDEN_HTTP2_CONNECTION_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'upgrade'
]);

/**
 * Unidades permitidas para grpc-timeout
 */
const VALID_GRPC_TIMEOUT_UNITS = new Set(['H', 'M', 'S', 'm', 'u', 'n']);

/**
 * Codificações aceitas em grpc-encoding
 */
const VALID_GRPC_ENCODINGS = new Set(['identity', 'gzip', 'deflate', 'snappy']);

/**
 * Canonicalização determinística RFC 8785 (JCS)
 */
export function canonicalStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalStringify).join(',')}]`;
  }
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`).join(',')}}`;
}

/**
 * Classe principal do Analisador e Guardião HTTP/2 & gRPC
 */
export class Http2GrpcGuardEngine {
  private policy: Http2GuardPolicy;

  constructor(customPolicy?: Partial<Http2GuardPolicy>) {
    this.policy = { ...DEFAULT_HTTP2_POLICY, ...customPolicy };
  }

  public getPolicy(): Http2GuardPolicy {
    return { ...this.policy };
  }

  public updatePolicy(newPolicy: Partial<Http2GuardPolicy>): void {
    this.policy = { ...this.policy, ...newPolicy };
  }

  /**
   * Inspeciona uma lista de pares de cabeçalhos HTTP/2 ou gRPC
   */
  public inspectHeaders(
    rawHeaders: Array<{ name: string; value: string }>,
    protocolTarget: Http2ProtocolTarget = Http2ProtocolTarget.HTTP2_REST
  ): Http2InspectionResult {
    const startTime = process.hrtime.bigint();
    const threats: Http2Threat[] = [];
    const sanitizedHeaders: Http2HeaderPair[] = [];
    let hasCriticalOrHigh = false;

    // 1. Limite total de cabeçalhos
    if (rawHeaders.length > this.policy.maxTotalHeadersCount) {
      threats.push({
        id: `th-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        category: Http2ThreatCategory.INVALID_CHARACTER_NAME_VALUE,
        severity: Http2RiskSeverity.HIGH,
        description: `Quantidade de cabeçalhos (${rawHeaders.length}) excede o limite máximo configurado (${this.policy.maxTotalHeadersCount}). Potencial DoS via HPACK decompression.`,
        offendingHeader: 'TOTAL_HEADERS_COUNT',
        remediation: 'Reduzir o número total de cabeçalhos transmitidos no frame HEADERS.'
      });
      hasCriticalOrHigh = true;
    }

    let seenPseudoHeaders = true; // Pseudo-cabeçalhos devem vir antes de cabeçalhos normais
    const contentLengths: string[] = [];

    for (let i = 0; i < rawHeaders.length; i++) {
      const { name, value } = rawHeaders[i];
      let currentVal = value;
      let isSanitized = false;
      const isPseudo = name.startsWith(':');

      // 2. Ordem de Pseudo-cabeçalhos (RFC 9113 §8.3): Todos os pseudo-cabeçalhos devem preceder campos comuns
      if (isPseudo) {
        if (!seenPseudoHeaders) {
          threats.push({
            id: `th-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            category: Http2ThreatCategory.PSEUDO_HEADER_INJECTION,
            severity: Http2RiskSeverity.HIGH,
            description: `Pseudo-cabeçalho '${name}' encontrado após cabeçalhos regulares. A RFC 9113 §8.3 exige que pseudo-cabeçalhos precedam todos os campos normais.`,
            offendingHeader: name,
            remediation: 'Reposicionar todos os pseudo-cabeçalhos no início da sequência de HEADERS.'
          });
          hasCriticalOrHigh = true;
        }

        // Validação de pseudo-cabeçalhos permitidos
        if (!this.policy.allowedPseudoHeaders.includes(name.toLowerCase())) {
          threats.push({
            id: `th-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            category: Http2ThreatCategory.PSEUDO_HEADER_INJECTION,
            severity: Http2RiskSeverity.CRITICAL,
            description: `Pseudo-cabeçalho não padronizado ou não autorizado '${name}'. Injeção potencial de pseudo-campo para adulteração de roteamento interno.`,
            offendingHeader: name,
            remediation: 'Utilizar estritamente os pseudo-cabeçalhos padronizados pela RFC 9113 (:method, :path, :authority, :scheme, :status).'
          });
          hasCriticalOrHigh = true;
        }

        // Validações específicas de :path
        if (name.toLowerCase() === ':path') {
          if (!value || value.trim().length === 0) {
            threats.push({
              id: `th-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              category: Http2ThreatCategory.PSEUDO_HEADER_INJECTION,
              severity: Http2RiskSeverity.HIGH,
              description: "O pseudo-cabeçalho ':path' não pode ser vazio (RFC 9113 §8.3.1).",
              offendingHeader: name,
              remediation: 'Garantir que :path contenha ao menos a barra inicial "/" ou o caminho de destino.'
            });
            hasCriticalOrHigh = true;
          }
          if (value.includes('\0') || value.includes('%00')) {
            threats.push({
              id: `th-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              category: Http2ThreatCategory.PSEUDO_HEADER_INJECTION,
              severity: Http2RiskSeverity.CRITICAL,
              description: "Byte nulo (\\0) detectado no pseudo-cabeçalho ':path'. Tentativa de Null Byte Injection ou Bypass de WAF.",
              offendingHeader: name,
              remediation: 'Rejeitar requisições contendo caracteres nulos no caminho HTTP/2.'
            });
            hasCriticalOrHigh = true;
          }
        }
      } else {
        seenPseudoHeaders = false; // Primeiro cabeçalho regular encontrado
      }

      // 3. Validação de Caracteres em Caixa Alta no Nome (RFC 9113 §8.2.1)
      const hasUppercase = /[A-Z]/.test(name);
      if (hasUppercase) {
        if (this.policy.enforceLowercaseHeaders) {
          threats.push({
            id: `th-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            category: Http2ThreatCategory.INVALID_CHARACTER_NAME_VALUE,
            severity: Http2RiskSeverity.MEDIUM,
            description: `Nome de cabeçalho contém caracteres maiúsculos ('${name}'). A RFC 9113 §8.2.1 estipula que endpoints DEVEM tratar nomes com maiúsculas como malformados.`,
            offendingHeader: name,
            remediation: 'Normalizar nomes de cabeçalhos em minúsculas (lowercase) antes da serialização HTTP/2.'
          });
        }
      }

      // 4. Detecção de CRLF (\r\n) ou quebra de linha em nome ou valor (CWE-113 HTTP Response/Request Splitting)
      const hasCrlfInName = /[\r\n\0]/.test(name);
      const hasCrlfInValue = /[\r\n\0]/.test(value);

      if (hasCrlfInName || hasCrlfInValue) {
        threats.push({
          id: `th-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          category: Http2ThreatCategory.CRLF_HEADER_SPLIT,
          severity: Http2RiskSeverity.CRITICAL,
          description: `Sequência de controle CRLF (\\r, \\n) ou byte nulo detectada em cabeçalho '${name}'. Tentativa crítica de HTTP Header Injection / Request Splitting (CWE-113).`,
          offendingHeader: name,
          remediation: 'Sanitizar ou rejeitar imediatamente cabeçalhos com quebras de linha ou caracteres de controle.'
        });
        hasCriticalOrHigh = true;
        // Sanitiza removendo controles
        currentVal = currentVal.replace(/[\r\n\0]/g, ' ').trim();
        isSanitized = true;
      }

      // 5. Comprimento máximo de nome e valor
      if (name.length > this.policy.maxHeaderNameLength) {
        threats.push({
          id: `th-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          category: Http2ThreatCategory.INVALID_CHARACTER_NAME_VALUE,
          severity: Http2RiskSeverity.MEDIUM,
          description: `Nome de cabeçalho '${name.slice(0, 32)}...' excede tamanho máximo de ${this.policy.maxHeaderNameLength} bytes.`,
          offendingHeader: name,
          remediation: 'Reduzir o tamanho dos identificadores de cabeçalho.'
        });
      }

      if (value.length > this.policy.maxHeaderValueLength) {
        threats.push({
          id: `th-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          category: Http2ThreatCategory.INVALID_CHARACTER_NAME_VALUE,
          severity: Http2RiskSeverity.HIGH,
          description: `Valor do cabeçalho '${name}' excede o comprimento máximo de ${this.policy.maxHeaderValueLength} bytes. Potencial buffer overflow / DoS.`,
          offendingHeader: name,
          remediation: 'Limitar o tamanho dos valores transmitidos em campos de cabeçalho.'
        });
        hasCriticalOrHigh = true;
      }

      const lowerName = name.toLowerCase();

      // 6. Transfer-Encoding em HTTP/2 (RFC 9113 §8.2.2 & CWE-444 Smuggling)
      if (lowerName === 'transfer-encoding') {
        if (this.policy.blockTransferEncoding) {
          threats.push({
            id: `th-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            category: Http2ThreatCategory.H2_TE_SMUGGLING,
            severity: Http2RiskSeverity.CRITICAL,
            description: `Cabeçalho 'transfer-encoding' presente em requisição HTTP/2. A RFC 9113 §8.2.2 proíbe estritamente este cabeçalho. Risco grave de HTTP/2 to HTTP/1.1 Request Smuggling (H2.TE Desync).`,
            offendingHeader: name,
            remediation: 'Remover o cabeçalho Transfer-Encoding em conexões HTTP/2; os frames DATA controlam o framing.'
          });
          hasCriticalOrHigh = true;
        }
      }

      // 7. Cabeçalho 'TE' (RFC 9113 §8.2.2): se presente, DEVE conter apenas "trailers"
      if (lowerName === 'te') {
        const normalizedVal = value.trim().toLowerCase();
        if (normalizedVal !== 'trailers') {
          threats.push({
            id: `th-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            category: Http2ThreatCategory.H2_TE_SMUGGLING,
            severity: Http2RiskSeverity.CRITICAL,
            description: `Cabeçalho 'te' com valor não homologado '${value}'. A RFC 9113 §8.2.2 permite apenas o valor 'trailers'. Qualquer outro valor é um vetor clássico de H2.TE Smuggling.`,
            offendingHeader: name,
            remediation: "Definir 'te: trailers' ou remover o cabeçalho."
          });
          hasCriticalOrHigh = true;
        }
      }

      // 8. Cabeçalhos Hop-by-Hop / Connection-Specific (RFC 9113 §8.2.2)
      if (FORBIDDEN_HTTP2_CONNECTION_HEADERS.has(lowerName)) {
        if (this.policy.stripConnectionHeaders) {
          threats.push({
            id: `th-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            category: Http2ThreatCategory.CONNECTION_SPECIFIC_HEADER,
            severity: Http2RiskSeverity.HIGH,
            description: `Cabeçalho connection-specific proibido '${name}' detectado. A RFC 9113 veta cabeçalhos de controle de salto em HTTP/2.`,
            offendingHeader: name,
            remediation: 'Remover cabeçalhos Connection, Keep-Alive, Proxy-Connection e Upgrade ao migrar para HTTP/2.'
          });
          hasCriticalOrHigh = true;
          isSanitized = true;
        }
      }

      // 9. Content-Length múltiplo ou inválido
      if (lowerName === 'content-length') {
        contentLengths.push(value.trim());
      }

      // 10. Validações Específicas de Metadados gRPC (gRPC over HTTP/2)
      if (protocolTarget === Http2ProtocolTarget.GRPC_STREAM || lowerName.startsWith('grpc-')) {
        if (this.policy.validateGrpcMetadata) {
          if (lowerName === 'grpc-timeout') {
            // Regex oficial gRPC: Positive integer followed by timeout unit (H, M, S, m, u, n)
            const match = value.trim().match(/^(\d+)([HMSmun])$/);
            if (!match) {
              threats.push({
                id: `th-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                category: Http2ThreatCategory.GRPC_HEADER_TAMPERING,
                severity: Http2RiskSeverity.HIGH,
                description: `Metadado 'grpc-timeout' com formato inválido ('${value}'). O formato exigido pela especificação gRPC é um inteiro positivo seguido da unidade (ex: 5S, 100m, 2H).`,
                offendingHeader: name,
                remediation: 'Formatar o cabeçalho grpc-timeout com dígitos seguidos de H, M, S, m, u ou n.'
              });
              hasCriticalOrHigh = true;
            } else {
              const unit = match[2];
              if (!VALID_GRPC_TIMEOUT_UNITS.has(unit)) {
                threats.push({
                  id: `th-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  category: Http2ThreatCategory.GRPC_HEADER_TAMPERING,
                  severity: Http2RiskSeverity.MEDIUM,
                  description: `Unidade de tempo desconhecida '${unit}' no metadado grpc-timeout.`,
                  offendingHeader: name,
                  remediation: 'Utilizar unidades válidas: H, M, S, m, u, n.'
                });
              }
            }
          }

          if (lowerName === 'grpc-encoding') {
            const enc = value.trim().toLowerCase();
            if (!VALID_GRPC_ENCODINGS.has(enc)) {
              threats.push({
                id: `th-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                category: Http2ThreatCategory.GRPC_HEADER_TAMPERING,
                severity: Http2RiskSeverity.HIGH,
                description: `Codificação de compressão gRPC não homologada ('${value}'). Potencial ataque de compressão ou corrupção de payload binário.`,
                offendingHeader: name,
                remediation: 'Configurar grpc-encoding apenas com codificações seguras: identity, gzip, deflate, snappy.'
              });
              hasCriticalOrHigh = true;
            }
          }

          if (lowerName === 'grpc-status' && !isPseudo) {
            // grpc-status em cabeçalhos de requisição inicial é anômalo (pertence aos trailers de resposta)
            threats.push({
              id: `th-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              category: Http2ThreatCategory.GRPC_HEADER_TAMPERING,
              severity: Http2RiskSeverity.HIGH,
              description: `Cabeçalho 'grpc-status' injetado antecipadamente no frame inicial de HEADERS. Tentativa de falsificação de estado de finalização de RPC.`,
              offendingHeader: name,
              remediation: 'Transmitir grpc-status unicamente nos trailers de terminação do fluxo gRPC.'
            });
            hasCriticalOrHigh = true;
          }
        }
      }

      // Adiciona aos cabeçalhos sanitizados
      sanitizedHeaders.push({
        name: this.policy.enforceLowercaseHeaders ? lowerName : name,
        value: currentVal,
        isPseudo,
        isSanitized,
        originalValue: value !== currentVal ? value : undefined
      });
    }

    // Validação de múltiplos Content-Length (H2.CL Request Smuggling)
    if (contentLengths.length > 1 && this.policy.strictContentLengthValidation) {
      const allIdentical = contentLengths.every((c) => c === contentLengths[0]);
      if (!allIdentical) {
        threats.push({
          id: `th-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          category: Http2ThreatCategory.AMBIGUOUS_CONTENT_LENGTH,
          severity: Http2RiskSeverity.CRITICAL,
          description: `Múltiplos cabeçalhos 'content-length' com valores conflitantes detectados: [${contentLengths.join(', ')}]. Vetor de desincronização e Request Smuggling (CWE-444).`,
          offendingHeader: 'content-length',
          remediation: 'Enviar um único cabeçalho Content-Length estritamente correspondente ao tamanho em bytes.'
        });
        hasCriticalOrHigh = true;
      } else {
        threats.push({
          id: `th-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          category: Http2ThreatCategory.AMBIGUOUS_CONTENT_LENGTH,
          severity: Http2RiskSeverity.MEDIUM,
          description: `Cabeçalho 'content-length' duplicado na mesma requisição.`,
          offendingHeader: 'content-length',
          remediation: 'Remover instâncias redundantes do cabeçalho Content-Length.'
        });
      }
    } else if (contentLengths.length === 1) {
      const parsed = parseInt(contentLengths[0], 10);
      if (isNaN(parsed) || parsed < 0 || String(parsed) !== contentLengths[0]) {
        threats.push({
          id: `th-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          category: Http2ThreatCategory.AMBIGUOUS_CONTENT_LENGTH,
          severity: Http2RiskSeverity.CRITICAL,
          description: `Valor inválido ou negativo para 'content-length': '${contentLengths[0]}'.`,
          offendingHeader: 'content-length',
          remediation: 'O valor de content-length deve ser um número inteiro decimal não-negativo.'
        });
        hasCriticalOrHigh = true;
      }
    }

    const endTime = process.hrtime.bigint();
    const durationUs = Number(endTime - startTime) / 1000;

    // Ação recomendada
    let action: Http2ValidationAction = Http2ValidationAction.ALLOW;
    if (hasCriticalOrHigh) {
      action = Http2ValidationAction.BLOCK_AND_ISOLATE;
    } else if (threats.length > 0) {
      action = Http2ValidationAction.SANITIZE;
    }

    // Hash canônico dos cabeçalhos sanitizados RFC 8785
    const headersHash = createHash('sha256')
      .update(canonicalStringify(sanitizedHeaders))
      .digest('hex');

    // Emissão do Selo Probatório WORM RFC 8785
    const seal = this.issueSeal({
      protocolTarget,
      headersHash,
      actionTaken: action,
      threatCount: threats.length,
      sanitizedHeaderCount: sanitizedHeaders.filter((h) => h.isSanitized).length
    });

    const summary = action === Http2ValidationAction.ALLOW
      ? `Requisição ${protocolTarget} em estrita conformidade com a RFC 9113 (${rawHeaders.length} cabeçalhos verificados).`
      : action === Http2ValidationAction.SANITIZE
      ? `Requisição ${protocolTarget} permitida após sanitização de ${sanitizedHeaders.filter((h) => h.isSanitized).length} cabeçalho(s).`
      : `Bloqueio imediato (RST_STREAM / HTTP 400). ${threats.length} ameaça(s) de desincronização ou injeção detectada(s).`;

    return {
      isValid: action === Http2ValidationAction.ALLOW,
      action,
      threats,
      sanitizedHeaders,
      headersHash,
      inspectionDurationUs: Math.round(durationUs * 100) / 100,
      seal,
      summary
    };
  }

  /**
   * Emite uma certidão notarial forense WORM RFC 8785 (JCS) HMAC-SHA256
   */
  public issueSeal(params: {
    protocolTarget: Http2ProtocolTarget;
    headersHash: string;
    actionTaken: Http2ValidationAction;
    threatCount: number;
    sanitizedHeaderCount: number;
  }): Http2ProofSeal {
    const timestamp = new Date().toISOString();
    const payload = {
      protocolTarget: params.protocolTarget,
      headersHash: params.headersHash,
      actionTaken: params.actionTaken,
      threatCount: params.threatCount,
      sanitizedHeaderCount: params.sanitizedHeaderCount,
      timestamp
    };

    const canonicalData = canonicalStringify(payload);
    const hmacSignature = createHmac('sha256', HTTP2_NOTARY_HMAC_SECRET)
      .update(canonicalData)
      .digest('hex');

    const sealToken = `h2_desync_seal_${hmacSignature.slice(0, 32)}`;

    return {
      sealToken,
      timestamp,
      protocolTarget: params.protocolTarget,
      headersHash: params.headersHash,
      actionTaken: params.actionTaken,
      threatCount: params.threatCount,
      sanitizedHeaderCount: params.sanitizedHeaderCount,
      hmacSignature
    };
  }

  /**
   * Valida timing-safe um selo notarial emitido
   */
  public verifySeal(seal: Http2ProofSeal): {
    isValid: boolean;
    seal?: Http2ProofSeal;
    message: string;
    verifiedAt: string;
  } {
    const verifiedAt = new Date().toISOString();
    try {
      if (!seal || !seal.sealToken || !seal.hmacSignature) {
        return {
          isValid: false,
          message: 'Selo notarial ausente ou estruturalmente malformado.',
          verifiedAt
        };
      }

      const payload = {
        protocolTarget: seal.protocolTarget,
        headersHash: seal.headersHash,
        actionTaken: seal.actionTaken,
        threatCount: seal.threatCount,
        sanitizedHeaderCount: seal.sanitizedHeaderCount,
        timestamp: seal.timestamp
      };

      const canonicalData = canonicalStringify(payload);
      const expectedHmac = createHmac('sha256', HTTP2_NOTARY_HMAC_SECRET)
        .update(canonicalData)
        .digest('hex');

      const expectedToken = `h2_desync_seal_${expectedHmac.slice(0, 32)}`;

      const sigBufferA = Buffer.from(seal.hmacSignature, 'hex');
      const sigBufferB = Buffer.from(expectedHmac, 'hex');

      if (sigBufferA.length !== sigBufferB.length || !timingSafeEqual(sigBufferA, sigBufferB)) {
        return {
          isValid: false,
          seal,
          message: 'Falha na validação criptográfica HMAC-SHA256: o selo foi adulterado ou forjado.',
          verifiedAt
        };
      }

      if (seal.sealToken !== expectedToken) {
        return {
          isValid: false,
          seal,
          message: 'Token notarial não coincide com o digest canônico calculado.',
          verifiedAt
        };
      }

      return {
        isValid: true,
        seal,
        message: 'Certidão Notarial WORM de Inspeção HTTP/2 & gRPC autêntica e íntegra (RFC 8785).',
        verifiedAt
      };
    } catch (err: any) {
      return {
        isValid: false,
        message: `Erro interno durante a validação da certidão: ${err.message}`,
        verifiedAt
      };
    }
  }
}

/**
 * Catálogo de Pentest Adversarial com Vetores de Ataque HTTP/2 & gRPC
 */
export const SAMPLE_HTTP2_ATTACKS: Record<Http2ThreatCategory, {
  name: string;
  category: Http2ThreatCategory;
  description: string;
  protocolTarget: Http2ProtocolTarget;
  headers: Array<{ name: string; value: string }>;
}> = {
  [Http2ThreatCategory.H2_TE_SMUGGLING]: {
    name: 'HTTP/2 to HTTP/1.1 Transfer-Encoding Smuggling (H2.TE Desync)',
    category: Http2ThreatCategory.H2_TE_SMUGGLING,
    description: 'Injeção de Transfer-Encoding: chunked em requisição HTTP/2 para desincronizar o parser HTTP/1.1 do proxy reverso.',
    protocolTarget: Http2ProtocolTarget.HTTP2_REST,
    headers: [
      { name: ':method', value: 'POST' },
      { name: ':path', value: '/api/clinical-records' },
      { name: ':authority', value: 'api.terapiainfoco.com.br' },
      { name: ':scheme', value: 'https' },
      { name: 'transfer-encoding', value: 'chunked' },
      { name: 'content-type', value: 'application/json' }
    ]
  },
  [Http2ThreatCategory.PSEUDO_HEADER_INJECTION]: {
    name: 'Injeção de Pseudo-Cabeçalho Arbitrário & Desordem de Framing',
    category: Http2ThreatCategory.PSEUDO_HEADER_INJECTION,
    description: 'Tentativa de forjar o pseudo-cabeçalho privilegiado :x-admin-role e desrespeito à precedência de pseudo-campos.',
    protocolTarget: Http2ProtocolTarget.HTTP2_REST,
    headers: [
      { name: ':method', value: 'GET' },
      { name: 'host', value: 'api.terapiainfoco.com.br' },
      { name: ':x-admin-role', value: 'superuser' },
      { name: ':path', value: '/api/patients' }
    ]
  },
  [Http2ThreatCategory.CRLF_HEADER_SPLIT]: {
    name: 'CRLF Injection & HTTP Response/Request Splitting (CWE-113)',
    category: Http2ThreatCategory.CRLF_HEADER_SPLIT,
    description: 'Injeção de quebra de linha \\r\\n em cabeçalho Authorization para forjar cabeçalhos adicionais e desmembrar o fluxo.',
    protocolTarget: Http2ProtocolTarget.HTTP2_REST,
    headers: [
      { name: ':method', value: 'GET' },
      { name: ':path', value: '/api/patients/search' },
      { name: ':authority', value: 'api.terapiainfoco.com.br' },
      { name: ':scheme', value: 'https' },
      { name: 'authorization', value: "Bearer eyJhbG...\r\nX-Forwarded-For: 127.0.0.1\r\nX-Admin: true" }
    ]
  },
  [Http2ThreatCategory.GRPC_HEADER_TAMPERING]: {
    name: 'Adulteração Maliciosa de Metadados gRPC (grpc-timeout / grpc-status)',
    category: Http2ThreatCategory.GRPC_HEADER_TAMPERING,
    description: 'Injeção de formato corrompido em grpc-timeout e antecipação indevida de grpc-status no frame HEADERS inicial.',
    protocolTarget: Http2ProtocolTarget.GRPC_STREAM,
    headers: [
      { name: ':method', value: 'POST' },
      { name: ':path', value: '/terapiainfoco.ClinicalTelemetry/StreamMetrics' },
      { name: ':authority', value: 'grpc.terapiainfoco.com.br' },
      { name: ':scheme', value: 'https' },
      { name: 'content-type', value: 'application/grpc' },
      { name: 'te', value: 'trailers' },
      { name: 'grpc-timeout', value: '9999999999999X' },
      { name: 'grpc-status', value: '0' }
    ]
  },
  [Http2ThreatCategory.AMBIGUOUS_CONTENT_LENGTH]: {
    name: 'Desincronização por Content-Length Múltiplo e Conflitante (H2.CL)',
    category: Http2ThreatCategory.AMBIGUOUS_CONTENT_LENGTH,
    description: 'Envio de múltiplos cabeçalhos Content-Length divergentes para forçar leitura antecipada ou atrasada no backend.',
    protocolTarget: Http2ProtocolTarget.HTTP2_REST,
    headers: [
      { name: ':method', value: 'POST' },
      { name: ':path', value: '/api/appointments' },
      { name: ':authority', value: 'api.terapiainfoco.com.br' },
      { name: ':scheme', value: 'https' },
      { name: 'content-length', value: '45' },
      { name: 'content-length', value: '120' },
      { name: 'content-type', value: 'application/json' }
    ]
  },
  [Http2ThreatCategory.CONNECTION_SPECIFIC_HEADER]: {
    name: 'Injeção de Cabeçalhos Hop-by-Hop Proibidos na RFC 9113',
    category: Http2ThreatCategory.CONNECTION_SPECIFIC_HEADER,
    description: 'Uso de cabeçalhos específicos de conexão HTTP/1.1 (Connection, Upgrade, Keep-Alive) proibidos em multiplexação HTTP/2.',
    protocolTarget: Http2ProtocolTarget.HTTP2_REST,
    headers: [
      { name: ':method', value: 'GET' },
      { name: ':path', value: '/api/patients/123/records' },
      { name: ':authority', value: 'api.terapiainfoco.com.br' },
      { name: ':scheme', value: 'https' },
      { name: 'connection', value: 'keep-alive, upgrade' },
      { name: 'upgrade', value: 'websocket' }
    ]
  },
  [Http2ThreatCategory.INVALID_CHARACTER_NAME_VALUE]: {
    name: 'Nome de Cabeçalho em Maiúsculas (Violação Estrita RFC 9113 §8.2.1)',
    category: Http2ThreatCategory.INVALID_CHARACTER_NAME_VALUE,
    description: 'Envio de cabeçalhos não-normalizados contendo caracteres maiúsculos ou caracteres não-ASCII.',
    protocolTarget: Http2ProtocolTarget.HTTP2_REST,
    headers: [
      { name: ':method', value: 'GET' },
      { name: ':path', value: '/api/dashboard' },
      { name: ':authority', value: 'api.terapiainfoco.com.br' },
      { name: ':scheme', value: 'https' },
      { name: 'X-Therapist-Crp', value: 'CRP-06/123456' },
      { name: 'Authorization-Token', value: 'Bearer demo-token-123' }
    ]
  }
};

/**
 * Amostras de Suítes Benignas Homologadas de Cabeçalhos
 */
export const SAMPLE_BENIGN_HTTP2_SUITES = [
  {
    id: 'rest-teleconsultation-endpoint',
    name: 'Chamada REST de Prontuário Clínico (HTTP/2)',
    protocolTarget: Http2ProtocolTarget.HTTP2_REST,
    headers: [
      { name: ':method', value: 'POST' },
      { name: ':path', value: '/api/clinical-records/draft' },
      { name: ':authority', value: 'api.terapiainfoco.com.br' },
      { name: ':scheme', value: 'https' },
      { name: 'content-type', value: 'application/json' },
      { name: 'content-length', value: '142' },
      { name: 'user-agent', value: 'TerapiaInFoco-Clinico/2.4.0 (macOS; WebKit)' },
      { name: 'authorization', value: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-z' }
    ]
  },
  {
    id: 'grpc-telemetry-endpoint',
    name: 'Fluxo gRPC de Telemetria e Sinais Biopsicossociais',
    protocolTarget: Http2ProtocolTarget.GRPC_STREAM,
    headers: [
      { name: ':method', value: 'POST' },
      { name: ':path', value: '/terapiainfoco.ClinicalTelemetry/RecordVitals' },
      { name: ':authority', value: 'grpc.terapiainfoco.com.br' },
      { name: ':scheme', value: 'https' },
      { name: 'content-type', value: 'application/grpc' },
      { name: 'te', value: 'trailers' },
      { name: 'grpc-timeout', value: '10S' },
      { name: 'grpc-encoding', value: 'gzip' }
    ]
  },
  {
    id: 'webrtc-signaling-endpoint',
    name: 'Sinalização WebRTC de Teleconsulta Criptografada',
    protocolTarget: Http2ProtocolTarget.HTTP2_WEBRTC_SIGNAL,
    headers: [
      { name: ':method', value: 'PUT' },
      { name: ':path', value: '/api/teleconsultation/signal' },
      { name: ':authority', value: 'rtc.terapiainfoco.com.br' },
      { name: ':scheme', value: 'https' },
      { name: 'content-type', value: 'application/json' },
      { name: 'x-session-id', value: 'sess-clinic-2026-992' }
    ]
  }
];
