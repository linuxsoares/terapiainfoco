import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';

import { PowDifficultyTier } from '@terapiainfoco/shared';

export { PowDifficultyTier };

export interface PowChallenge {
  challengeId: string;
  salt: string;
  difficulty: number;
  tier: PowDifficultyTier;
  createdAt: string;
  expiresAt: string;
  hmacSignature: string;
  clientIp?: string;
}

export interface PowVerificationResult {
  isValid: boolean;
  difficulty: number;
  computedHash?: string;
  verifiedAt: string;
  error?: string;
}

export interface PowSolutionResult {
  nonce: number;
  hash: string;
  durationMs: number;
  iterations: number;
}

export interface PowDefenseSealVerification {
  isValid: boolean;
  proofSeal: string;
  challengeId: string;
  clientIp: string;
  difficulty: number;
  verifiedAt: string;
  details: string;
}

const DEFAULT_SECRET_SALT = process.env.POW_SECRET_SALT || 'terapiainfoco_pow_defense_salt_2026_default_secret';

/**
 * Mapeia dificuldade numérica para o respectivo Tier
 */
export function getDifficultyTier(difficulty: number): PowDifficultyTier {
  if (difficulty <= 0) return PowDifficultyTier.NONE;
  if (difficulty <= 3) return PowDifficultyTier.LOW;
  if (difficulty === 4) return PowDifficultyTier.MEDIUM;
  if (difficulty === 5) return PowDifficultyTier.HIGH;
  return PowDifficultyTier.MAXIMUM;
}

/**
 * Calcula a dificuldade dinâmica do desafio PoW com base no histórico recente de falhas
 */
export function calculateDynamicDifficulty(
  failedAttemptsInWindow: number,
  isKnownAttackerSubnet = false
): { difficulty: number; tier: PowDifficultyTier; reason: string } {
  if (isKnownAttackerSubnet) {
    return {
      difficulty: 6,
      tier: PowDifficultyTier.MAXIMUM,
      reason: 'Sub-rede de alto risco identificada na Threat Intelligence: contenção máxima obrigatória.'
    };
  }

  if (failedAttemptsInWindow >= 21) {
    return {
      difficulty: 6,
      tier: PowDifficultyTier.MAXIMUM,
      reason: 'Ataque massivo de Credential Stuffing detectado (≥ 21 falhas): barreira de contenção máxima ativada.'
    };
  }

  if (failedAttemptsInWindow >= 11) {
    return {
      difficulty: 5,
      tier: PowDifficultyTier.HIGH,
      reason: 'Ataque de força bruta distribuído em curso (11-20 falhas): elevação para tier de alta latência.'
    };
  }

  if (failedAttemptsInWindow >= 6) {
    return {
      difficulty: 4,
      tier: PowDifficultyTier.MEDIUM,
      reason: 'Múltiplas falhas anômalas consecutivas (6-10 falhas): barreira moderada de Prova de Trabalho exigida.'
    };
  }

  if (failedAttemptsInWindow >= 3) {
    return {
      difficulty: 3,
      tier: PowDifficultyTier.LOW,
      reason: 'Falhas leves recorrentes (3-5 falhas): desafio PoW preventivo imperceptível para humanos.'
    };
  }

  return {
    difficulty: 0,
    tier: PowDifficultyTier.NONE,
    reason: 'Comportamento normal dentro do baseline seguro: PoW dispensado.'
  };
}

/**
 * Assina os dados do desafio com HMAC-SHA256 para prevenir adulteração do cliente (Anti-Tampering)
 */
function signChallengeData(
  challengeId: string,
  salt: string,
  difficulty: number,
  expiresAt: string,
  clientIp: string,
  secretKey: string
): string {
  const payload = `${challengeId}:${salt}:${difficulty}:${expiresAt}:${clientIp}`;
  return createHmac('sha256', secretKey).update(payload).digest('hex');
}

/**
 * Emite um novo desafio de Prova de Trabalho Criptográfica (PoW Hashcash Moderno)
 */
export function generatePowChallenge(params: {
  difficulty: number;
  ttlSeconds?: number;
  clientIp?: string;
  secretKey?: string;
}): PowChallenge {
  const difficulty = Math.max(0, Math.min(params.difficulty, 8));
  const ttlSeconds = params.ttlSeconds || 120;
  const clientIp = params.clientIp || '127.0.0.1';
  const secretKey = params.secretKey || DEFAULT_SECRET_SALT;

  const challengeId = `pow_chal_${randomUUID()}`;
  const salt = randomBytes(16).toString('hex');
  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + ttlSeconds * 1000).toISOString();

  const hmacSignature = signChallengeData(challengeId, salt, difficulty, expiresAt, clientIp, secretKey);

  return {
    challengeId,
    salt,
    difficulty,
    tier: getDifficultyTier(difficulty),
    createdAt,
    expiresAt,
    hmacSignature,
    clientIp
  };
}

/**
 * Resolve o desafio PoW buscando o nonce que gera os zeros hexadecimais requeridos
 * (Executado no cliente ou em simulações de teste)
 */
export function solvePowChallenge(
  challenge: PowChallenge,
  maxIterations = 50_000_000
): PowSolutionResult {
  const startTime = Date.now();
  const prefix = '0'.repeat(challenge.difficulty);

  if (challenge.difficulty === 0) {
    return {
      nonce: 0,
      hash: createHash('sha256').update(`${challenge.salt}:${challenge.challengeId}:0`).digest('hex'),
      durationMs: 0,
      iterations: 1
    };
  }

  let nonce = 0;
  const baseInput = `${challenge.salt}:${challenge.challengeId}:`;

  while (nonce < maxIterations) {
    const hash = createHash('sha256').update(`${baseInput}${nonce}`).digest('hex');
    if (hash.startsWith(prefix)) {
      const durationMs = Math.max(1, Date.now() - startTime);
      return {
        nonce,
        hash,
        durationMs,
        iterations: nonce + 1
      };
    }
    nonce++;
  }

  throw new Error(`Limite máximo de iterações (${maxIterations}) excedido para resolver o desafio PoW.`);
}

/**
 * Validação instantânea O(1) pelo servidor da Prova de Trabalho submetida
 */
export function verifyPowSolution(
  challenge: PowChallenge,
  nonce: number,
  clientIp = '127.0.0.1',
  secretKey = DEFAULT_SECRET_SALT
): PowVerificationResult {
  const verifiedAt = new Date().toISOString();

  // 1. Validar expiração temporal
  if (Date.now() > new Date(challenge.expiresAt).getTime()) {
    return {
      isValid: false,
      difficulty: challenge.difficulty,
      verifiedAt,
      error: 'Desafio de Prova de Trabalho expirado. Solicite um novo desafio.'
    };
  }

  // 2. Validar assinatura HMAC anti-tampering do desafio
  const expectedSignature = signChallengeData(
    challenge.challengeId,
    challenge.salt,
    challenge.difficulty,
    challenge.expiresAt,
    challenge.clientIp || clientIp,
    secretKey
  );

  if (challenge.hmacSignature !== expectedSignature) {
    return {
      isValid: false,
      difficulty: challenge.difficulty,
      verifiedAt,
      error: 'Assinatura criptográfica do desafio inválida ou adulterada pelo cliente.'
    };
  }

  // Se dificuldade for 0, é aceito de imediato
  if (challenge.difficulty === 0) {
    return {
      isValid: true,
      difficulty: 0,
      computedHash: createHash('sha256').update(`${challenge.salt}:${challenge.challengeId}:${nonce}`).digest('hex'),
      verifiedAt
    };
  }

  // 3. Validar Prova de Trabalho matemática O(1)
  const computedHash = createHash('sha256')
    .update(`${challenge.salt}:${challenge.challengeId}:${nonce}`)
    .digest('hex');

  const requiredPrefix = '0'.repeat(challenge.difficulty);
  if (!computedHash.startsWith(requiredPrefix)) {
    return {
      isValid: false,
      difficulty: challenge.difficulty,
      computedHash,
      verifiedAt,
      error: `Solução PoW inválida. Hash computado '${computedHash.slice(0, 8)}...' não inicia com ${challenge.difficulty} zeros hexadecimais.`
    };
  }

  return {
    isValid: true,
    difficulty: challenge.difficulty,
    computedHash,
    verifiedAt
  };
}

/**
 * Gera Selo Notarial Probatório WORM de Mitigação de Ataque por PoW
 * Formato: pow_proof_v1_<base64url>
 */
export function generatePowDefenseSeal(params: {
  challengeId: string;
  clientIp: string;
  difficulty: number;
  nonce: number;
  verifiedAt: string;
  secretKey?: string;
}): string {
  const secretKey = params.secretKey || DEFAULT_SECRET_SALT;

  const canonicalObj = {
    cid: params.challengeId,
    dif: params.difficulty,
    ip: params.clientIp,
    non: params.nonce,
    iat: params.verifiedAt
  };

  const canonicalString = JSON.stringify(canonicalObj, Object.keys(canonicalObj).sort());
  const canonicalHash = createHash('sha256').update(canonicalString).digest('hex');

  const signature = createHmac('sha256', secretKey)
    .update(`pow_defense:${params.challengeId}:${canonicalHash}`)
    .digest('hex');

  const payload = {
    v: 1,
    cid: params.challengeId,
    ip: params.clientIp,
    dif: params.difficulty,
    non: params.nonce,
    cnh: canonicalHash,
    sig: signature,
    iat: params.verifiedAt
  };

  const base64Url = Buffer.from(JSON.stringify(payload))
    .toString('base64url');

  return `pow_proof_v1_${base64Url}`;
}

/**
 * Verificação Pericial da Fé Pública e Integridade do Selo Notarial de Defesa PoW
 */
export function verifyPowDefenseSeal(
  proofSeal: string,
  secretKey = DEFAULT_SECRET_SALT
): PowDefenseSealVerification {
  if (!proofSeal || !proofSeal.startsWith('pow_proof_v1_')) {
    return {
      isValid: false,
      proofSeal: proofSeal || '',
      challengeId: '',
      clientIp: '',
      difficulty: 0,
      verifiedAt: '',
      details: 'Selo probatório de defesa PoW ausente ou em formato inválido.'
    };
  }

  try {
    const raw = proofSeal.replace('pow_proof_v1_', '');
    const decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));

    if (decoded.v !== 1 || !decoded.cid || !decoded.sig || !decoded.cnh) {
      return {
        isValid: false,
        proofSeal,
        challengeId: decoded.cid || '',
        clientIp: decoded.ip || '',
        difficulty: decoded.dif || 0,
        verifiedAt: decoded.iat || '',
        details: 'Estrutura interna do selo corrompida ou versão incompatível.'
      };
    }

    const canonicalObj = {
      cid: decoded.cid,
      dif: decoded.dif,
      ip: decoded.ip,
      non: decoded.non,
      iat: decoded.iat
    };

    const canonicalString = JSON.stringify(canonicalObj, Object.keys(canonicalObj).sort());
    const expectedHash = createHash('sha256').update(canonicalString).digest('hex');

    if (decoded.cnh !== expectedHash) {
      return {
        isValid: false,
        proofSeal,
        challengeId: decoded.cid,
        clientIp: decoded.ip,
        difficulty: decoded.dif,
        verifiedAt: decoded.iat,
        details: 'Hash canônico SHA-256 adulterado. Conteúdo modificado retroativamente (Anti-Tampering violado).'
      };
    }

    const expectedSig = createHmac('sha256', secretKey)
      .update(`pow_defense:${decoded.cid}:${expectedHash}`)
      .digest('hex');

    if (decoded.sig !== expectedSig) {
      return {
        isValid: false,
        proofSeal,
        challengeId: decoded.cid,
        clientIp: decoded.ip,
        difficulty: decoded.dif,
        verifiedAt: decoded.iat,
        details: 'Assinatura digital HMAC do selo forjada ou chave de validação divergente.'
      };
    }

    return {
      isValid: true,
      proofSeal,
      challengeId: decoded.cid,
      clientIp: decoded.ip,
      difficulty: decoded.dif,
      verifiedAt: decoded.iat,
      details: 'Selo probatório de mitigação PoW matematicamente autêntico e registrado na trilha WORM.'
    };
  } catch (err: any) {
    return {
      isValid: false,
      proofSeal,
      challengeId: '',
      clientIp: '',
      difficulty: 0,
      verifiedAt: '',
      details: `Falha na decodificação do selo probatório: ${err.message}`
    };
  }
}
