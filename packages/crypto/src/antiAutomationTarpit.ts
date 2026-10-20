import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';

import { ScraperThreatCategory } from '@terapiainfoco/shared';

export { ScraperThreatCategory };

export type TarpitDefenseStatus =
  | 'ACTIVE'
  | 'ENGAGED'
  | 'TARPITTING'
  | 'ISOLATED'
  | 'RELEASED';

export interface HoneypotTrapTokenPayload {
  trapId: string;
  routePath: string;
  expiresAt: string;
  clientIp?: string;
  token: string;
  hmacSignature: string;
}

export interface TarpitDelayCalculation {
  delayMs: number;
  reason: string;
  threatCategory: ScraperThreatCategory;
  severityLevel: 'MILD' | 'ELEVATED' | 'SEVERE' | 'MAXIMUM';
}

export interface CrawlerHeuristicsResult {
  isCrawler: boolean;
  threatScore: number; // 0 a 100
  detectedVectors: string[];
  threatCategory?: ScraperThreatCategory;
}

export interface TarpitDefenseSealPayload {
  trapId: string;
  clientIp: string;
  threatCategory: ScraperThreatCategory;
  delayMs: number;
  trappedAt: string;
}

export interface TarpitSealVerification {
  isValid: boolean;
  proofSeal: string;
  trapId: string;
  clientIp: string;
  threatCategory: ScraperThreatCategory;
  delayMs: number;
  trappedAt: string;
  details: string;
}

const DEFAULT_TARPIT_SECRET =
  process.env.TARPIT_SECRET || 'terapiainfoco_tarpit_honeypot_defense_secret_key_2026';

/**
 * Assina payload canônico de armadilha Honeypot
 */
function signTrapPayload(
  trapId: string,
  routePath: string,
  expiresAt: string,
  clientIp = '',
  secret = DEFAULT_TARPIT_SECRET
): string {
  const message = `${trapId}:${routePath}:${expiresAt}:${clientIp.trim()}`;
  return createHmac('sha256', secret).update(message).digest('hex');
}

/**
 * Emite um token criptográfico de armadilha Honeypot para links invisíveis
 */
export function generateHoneypotTrapToken(params: {
  routePath: string;
  clientIp?: string;
  ttlSeconds?: number;
  secret?: string;
}): HoneypotTrapTokenPayload {
  const trapId = `trap_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const ttl = params.ttlSeconds ?? 3600; // 1 hora de validade padrão
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  const secret = params.secret ?? DEFAULT_TARPIT_SECRET;
  const clientIp = params.clientIp ? params.clientIp.trim() : '';

  const hmacSignature = signTrapPayload(trapId, params.routePath, expiresAt, clientIp, secret);
  const rawToken = `${trapId}.${Buffer.from(params.routePath).toString('base64url')}.${Buffer.from(expiresAt).toString('base64url')}.${hmacSignature}`;
  const token = `hp_trap_${Buffer.from(rawToken).toString('base64url')}`;

  return {
    trapId,
    routePath: params.routePath,
    expiresAt,
    clientIp: clientIp || undefined,
    token,
    hmacSignature
  };
}

/**
 * Valida se um token de Honeypot recebido é autêntico e não foi forjado
 */
export function verifyHoneypotTrapToken(
  token: string,
  expectedClientIp?: string,
  secret = DEFAULT_TARPIT_SECRET
): {
  isValid: boolean;
  trapId?: string;
  routePath?: string;
  expiresAt?: string;
  error?: string;
} {
  if (!token || typeof token !== 'string' || !token.startsWith('hp_trap_')) {
    return { isValid: false, error: 'Token de honeypot inválido ou malformado.' };
  }

  try {
    const rawB64 = token.slice('hp_trap_'.length);
    const decoded = Buffer.from(rawB64, 'base64url').toString('utf8');
    const parts = decoded.split('.');

    if (parts.length !== 4) {
      return { isValid: false, error: 'Estrutura do token de honeypot corrompida.' };
    }

    const [trapId, routePathB64, expiresAtB64, signature] = parts;
    const routePath = Buffer.from(routePathB64, 'base64url').toString('utf8');
    const expiresAt = Buffer.from(expiresAtB64, 'base64url').toString('utf8');

    // Valida expiração
    const expTime = new Date(expiresAt).getTime();
    if (isNaN(expTime) || Date.now() > expTime) {
      return { isValid: false, trapId, error: 'Token de armadilha honeypot expirado.' };
    }

    // Valida assinatura anti-tampering
    const expectedClient = expectedClientIp ? expectedClientIp.trim() : '';
    const computedSignatureWithIp = signTrapPayload(trapId, routePath, expiresAt, expectedClient, secret);
    const computedSignatureWithoutIp = signTrapPayload(trapId, routePath, expiresAt, '', secret);

    const matches = signature === computedSignatureWithIp || signature === computedSignatureWithoutIp;
    if (!matches) {
      return { isValid: false, trapId, error: 'Assinatura HMAC do token honeypot adulterada.' };
    }

    return {
      isValid: true,
      trapId,
      routePath,
      expiresAt
    };
  } catch (err: any) {
    return { isValid: false, error: `Falha na decodificação do token: ${err.message}` };
  }
}

/**
 * Avalia cabeçalhos HTTP buscando assinaturas heurísticas de crawlers e bots (OWASP OAT-011)
 */
export function detectCrawlerHeuristics(headers: Record<string, string | undefined>): CrawlerHeuristicsResult {
  const detectedVectors: string[] = [];
  let threatScore = 0;

  // Normaliza cabeçalhos em minúsculo
  const normHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v !== undefined) {
      normHeaders[k.toLowerCase()] = v;
    }
  }

  const userAgent = (normHeaders['user-agent'] || '').trim();
  const accept = (normHeaders['accept'] || '').trim();
  const secChUa = normHeaders['sec-ch-ua'];
  const secFetchMode = normHeaders['sec-fetch-mode'];

  // 1. Ausência de User-Agent
  if (!userAgent) {
    threatScore += 60;
    detectedVectors.push('MISSING_USER_AGENT');
  } else if (userAgent.length < 12) {
    threatScore += 40;
    detectedVectors.push('ANOMALOUS_SHORT_USER_AGENT');
  }

  // 2. Blacklist de ferramentas de automação e scrapers comuns
  const botSignatures = [
    'curl',
    'python',
    'requests',
    'urllib',
    'scrapy',
    'beautifulsoup',
    'wget',
    'httpclient',
    'aiohttp',
    'axios',
    'go-http-client',
    'headlesschrome',
    'phantomjs',
    'puppeteer',
    'playwright',
    'selenium',
    'bot',
    'crawler',
    'spider',
    'postmanruntime',
    'insomnia'
  ];

  const lowerUa = userAgent.toLowerCase();
  for (const sig of botSignatures) {
    if (lowerUa.includes(sig)) {
      threatScore += 75;
      detectedVectors.push(`BOT_SIGNATURE_${sig.toUpperCase()}`);
      break;
    }
  }

  // 3. Ausência de cabeçalho Accept
  if (!accept) {
    threatScore += 30;
    detectedVectors.push('MISSING_ACCEPT_HEADER');
  } else if (accept === '*/*') {
    threatScore += 15;
    detectedVectors.push('GENERIC_WILDCARD_ACCEPT');
  }

  // 4. Inconsistência de Sec-CH-UA em navegadores modernos
  if (lowerUa.includes('chrome') || lowerUa.includes('safari') || lowerUa.includes('edge')) {
    if (!secChUa && !secFetchMode && !lowerUa.includes('mobile')) {
      threatScore += 35;
      detectedVectors.push('HEADLESS_MISSING_SEC_CH_UA');
    }
  }

  // Cap no score entre 0 e 100
  threatScore = Math.min(100, threatScore);
  const isCrawler = threatScore >= 50;

  let threatCategory: ScraperThreatCategory | undefined;
  if (threatScore >= 75) {
    threatCategory = detectedVectors.some(v => v.includes('HEADLESS') || v.includes('SELENIUM') || v.includes('PUPPETEER'))
      ? ScraperThreatCategory.HEADLESS_BOT_PROBE
      : ScraperThreatCategory.DATA_SCRAPING_OAT011;
  } else if (threatScore >= 50) {
    threatCategory = ScraperThreatCategory.ACCOUNT_ENUMERATION_OAT020;
  }

  return {
    isCrawler,
    threatScore,
    detectedVectors,
    threatCategory
  };
}

/**
 * Calcula dinamicamente o atraso de Tarpit (tempo de retenção assíncrona da conexão)
 */
export function calculateTarpitDelay(
  violationsCount: number,
  threatCategory: ScraperThreatCategory = ScraperThreatCategory.DATA_SCRAPING_OAT011
): TarpitDelayCalculation {
  let baseDelayMs = 1500;
  let severityLevel: 'MILD' | 'ELEVATED' | 'SEVERE' | 'MAXIMUM' = 'MILD';
  let reason = 'Atrito inicial: pequeno retardo preventivo para desestimular crawling automatizado.';

  if (violationsCount <= 1) {
    baseDelayMs = 2000;
    severityLevel = 'MILD';
    reason = 'Primeira incidência em armadilha ou heurística: retenção branda (2.000ms).';
  } else if (violationsCount === 2) {
    baseDelayMs = 6000;
    severityLevel = 'ELEVATED';
    reason = 'Reincidência confirmada: retenção elevada de conexão (6.000ms) para estrangulamento de scraper.';
  } else if (violationsCount === 3) {
    baseDelayMs = 15000;
    severityLevel = 'SEVERE';
    reason = 'Ataque contínuo de raspagem: tarpit severo (15.000ms) exaurindo sockets do atacante.';
  } else {
    baseDelayMs = 30000;
    severityLevel = 'MAXIMUM';
    reason = 'Crawler massivo e hostil: tarpit máximo de 30.000ms com isolamento preventivo da sub-rede.';
  }

  // Multiplicador específico por categoria de risco
  if (threatCategory === ScraperThreatCategory.DATA_SCRAPING_OAT011 || threatCategory === ScraperThreatCategory.RESOURCE_EXHAUSTION_OAT015) {
    baseDelayMs = Math.round(baseDelayMs * 1.2);
  } else if (threatCategory === ScraperThreatCategory.HEADLESS_BOT_PROBE) {
    baseDelayMs = Math.round(baseDelayMs * 1.3);
  }

  // Teto seguro de 45.000ms para evitar timeout rígido de proxies intermediários
  const delayMs = Math.min(45000, baseDelayMs);

  return {
    delayMs,
    reason,
    threatCategory,
    severityLevel
  };
}

/**
 * Gera um selo notarial WORM inviolável atestando a contenção por Tarpit
 */
export function generateTarpitDefenseSeal(
  payload: TarpitDefenseSealPayload,
  secret = DEFAULT_TARPIT_SECRET
): string {
  // Ordenação determinística estrita (RFC 8785 JSON Canonicalization Scheme)
  const canonicalObj = {
    clientIp: payload.clientIp.trim(),
    delayMs: payload.delayMs,
    threatCategory: payload.threatCategory,
    trapId: payload.trapId,
    trappedAt: payload.trappedAt
  };

  const canonicalJson = JSON.stringify(canonicalObj);
  const canonicalHash = createHash('sha256').update(canonicalJson).digest('hex');
  const signature = createHmac('sha256', secret).update(canonicalHash).digest('hex');

  const container = {
    canonicalPayload: canonicalObj,
    canonicalHash,
    signature,
    version: 'tarpit_v1'
  };

  const b64 = Buffer.from(JSON.stringify(container), 'utf8').toString('base64url');
  return `tarpit_proof_v1_${b64}`;
}

/**
 * Verifica pericialmente a autenticidade e fé pública do selo WORM de Tarpit
 */
export function verifyTarpitDefenseSeal(
  seal: string,
  secret = DEFAULT_TARPIT_SECRET
): TarpitSealVerification {
  if (!seal || typeof seal !== 'string' || !seal.startsWith('tarpit_proof_v1_')) {
    return {
      isValid: false,
      proofSeal: seal,
      trapId: '',
      clientIp: '',
      threatCategory: ScraperThreatCategory.DATA_SCRAPING_OAT011,
      delayMs: 0,
      trappedAt: '',
      details: 'Formato inválido de selo notarial WORM de Tarpit.'
    };
  }

  try {
    const rawB64 = seal.slice('tarpit_proof_v1_'.length);
    const parsed = JSON.parse(Buffer.from(rawB64, 'base64url').toString('utf8'));

    const { canonicalPayload, canonicalHash, signature } = parsed;
    if (!canonicalPayload || !canonicalHash || !signature) {
      return {
        isValid: false,
        proofSeal: seal,
        trapId: '',
        clientIp: '',
        threatCategory: ScraperThreatCategory.DATA_SCRAPING_OAT011,
        delayMs: 0,
        trappedAt: '',
        details: 'Estrutura interna do selo corrompida.'
      };
    }

    // Recalcula digest canônico
    const expectedCanonicalJson = JSON.stringify(canonicalPayload);
    const expectedCanonicalHash = createHash('sha256').update(expectedCanonicalJson).digest('hex');

    if (expectedCanonicalHash !== canonicalHash) {
      return {
        isValid: false,
        proofSeal: seal,
        trapId: canonicalPayload.trapId,
        clientIp: canonicalPayload.clientIp,
        threatCategory: canonicalPayload.threatCategory,
        delayMs: canonicalPayload.delayMs,
        trappedAt: canonicalPayload.trappedAt,
        details: 'Violação de integridade: o hash canônico do payload foi adulterado.'
      };
    }

    // Verifica assinatura HMAC
    const expectedSignature = createHmac('sha256', secret).update(canonicalHash).digest('hex');
    if (expectedSignature !== signature) {
      return {
        isValid: false,
        proofSeal: seal,
        trapId: canonicalPayload.trapId,
        clientIp: canonicalPayload.clientIp,
        threatCategory: canonicalPayload.threatCategory,
        delayMs: canonicalPayload.delayMs,
        trappedAt: canonicalPayload.trappedAt,
        details: 'Violação de autenticidade: assinatura digital HMAC do selo forjada ou inválida.'
      };
    }

    return {
      isValid: true,
      proofSeal: seal,
      trapId: canonicalPayload.trapId,
      clientIp: canonicalPayload.clientIp,
      threatCategory: canonicalPayload.threatCategory,
      delayMs: canonicalPayload.delayMs,
      trappedAt: canonicalPayload.trappedAt,
      details: 'Selo WORM de defesa Tarpit íntegro, autêntico e verificado com fé pública.'
    };
  } catch (err: any) {
    return {
      isValid: false,
      proofSeal: seal,
      trapId: '',
      clientIp: '',
      threatCategory: ScraperThreatCategory.DATA_SCRAPING_OAT011,
      delayMs: 0,
      trappedAt: '',
      details: `Falha na verificação forense do selo: ${err.message}`
    };
  }
}

/**
 * Função de espera assíncrona cooperativa (sleep) sem bloqueio da event loop do Node/Bun
 */
export function tarpitSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
}
