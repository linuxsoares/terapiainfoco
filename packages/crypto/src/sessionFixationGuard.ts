/**
 * ============================================================================
 * 65. MOTOR CRIPTOGRÁFICO & GUIA DE PROTEÇÃO CONTRA FIXAÇÃO E SEQUESTRO DE SESSÃO
 * (OWASP ASVS v4.0 V3.3, CWE-384, CWE-287 & NIST SP 800-63B)
 * ============================================================================
 * 
 * Enclave de rotação criptográfica obrigatória de sessões pós-elevação de
 * privilégio, invalidação imediata de identificadores pré-autenticação e
 * dynamic binding contínuo de fingerprint de rede, User-Agent e TLS (JA4/JA3).
 */

import { randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  SessionAnomalyType,
  SessionMitigationAction,
  SessionSecurityLevel,
  type ClientContextFingerprint,
  type SessionSecurityToken,
  type SessionProofSeal,
  type SessionEvaluationAnomaly,
  type SessionEvaluationResult,
  type SessionGuardPolicy
} from '@terapiainfoco/shared';

/**
 * Chave mestra padrão para selagem probatória WORM de sessões clínicas
 */
const DEFAULT_SESSION_SEAL_SECRET = process.env.SESSION_GUARD_SECRET || 'terapiainfoco_session_guard_worm_secret_v1_2026';

/**
 * Política padrão de segurança de sessões clínicas
 */
export const DEFAULT_SESSION_GUARD_POLICY: SessionGuardPolicy = {
  enforceRotationOnElevation: true,
  bindIpSubnet: true,
  bindUserAgent: true,
  bindTlsFingerprint: true,
  allowSubnetShift: false,
  maxSessionAgeMinutes: 480, // 8 horas
  idleTimeoutMinutes: 30,
  enableWormSeal: true
};

/**
 * Serialização Canônica Determinística RFC 8785 (JCS)
 */
export function canonicalJsonStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return `[${obj.map(item => canonicalJsonStringify(item)).join(',')}]`;
  }

  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map(key => {
    return `${JSON.stringify(key)}:${canonicalJsonStringify(obj[key])}`;
  });

  return `{${pairs.join(',')}}`;
}

/**
 * Extrai o prefixo de sub-rede padrão (/24 para IPv4, /48 para IPv6)
 */
export function extractIpSubnet(ip: string): string {
  const cleanIp = ip.split(',')[0].trim();

  // IPv4
  if (cleanIp.includes('.')) {
    const parts = cleanIp.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
    }
    return `${cleanIp}/32`;
  }

  // IPv6
  if (cleanIp.includes(':')) {
    const parts = cleanIp.split(':');
    if (parts.length >= 3) {
      return `${parts[0]}:${parts[1]}:${parts[2]}::/48`;
    }
    return `${cleanIp}/128`;
  }

  return `${cleanIp}/unknown`;
}

/**
 * Gera o hash determinístico normalizado do User-Agent do cliente
 */
export function computeUserAgentCanonicalHash(userAgent: string): string {
  const normalized = userAgent.trim().toLowerCase().replace(/\s+/g, ' ');
  return createHash('sha256').update(normalized, 'utf-8').digest('hex');
}

/**
 * Constrói o objeto de fingerprint de contexto do cliente
 */
export function buildClientContextFingerprint(
  clientIp: string,
  userAgent: string,
  tlsFingerprint?: string,
  countryCode?: string
): ClientContextFingerprint {
  const subnetPrefix = extractIpSubnet(clientIp);
  const userAgentHash = computeUserAgentCanonicalHash(userAgent);

  return {
    clientIp,
    subnetPrefix,
    userAgent,
    userAgentHash,
    tlsFingerprint,
    countryCode
  };
}

/**
 * Computa o hash de integridade canônica do contexto do cliente
 */
export function computeContextHash(ctx: ClientContextFingerprint): string {
  const canonicalContext = {
    countryCode: ctx.countryCode || 'BR',
    subnetPrefix: ctx.subnetPrefix,
    tlsFingerprint: ctx.tlsFingerprint || 'NONE',
    userAgentHash: ctx.userAgentHash
  };

  return createHash('sha256').update(canonicalJsonStringify(canonicalContext)).digest('hex');
}

/**
 * Gera um novo identificador de sessão criptograficamente seguro (256 bits de entropia)
 */
export function generateCryptographicSessionId(): string {
  return `sess_sec_${randomBytes(32).toString('hex')}`;
}

/**
 * Emite Selo Probatório Notarial WORM RFC 8785 de Auditoria de Sessão
 */
export function createSessionProofSeal(
  sessionIdHash: string,
  contextHash: string,
  anomalyCount: number,
  mitigationAction: SessionMitigationAction,
  secretKey: string = DEFAULT_SESSION_SEAL_SECRET
): SessionProofSeal {
  const timestamp = new Date().toISOString();

  const sealPayload = {
    version: '1.0.0' as const,
    sessionIdHash,
    contextHash,
    anomalyCount,
    mitigationAction,
    timestamp
  };

  const canonicalString = canonicalJsonStringify(sealPayload);
  const hmacSignature = createHmac('sha256', secretKey).update(canonicalString).digest('base64url');
  const sealId = `session_guard_v1_${hmacSignature.substring(0, 32)}`;

  return {
    version: '1.0.0',
    sealId,
    timestamp,
    sessionIdHash,
    contextHash,
    anomalyCount,
    mitigationAction,
    hmacSignature
  };
}

/**
 * Valida um Selo Probatório WORM RFC 8785 de Sessão
 */
export function verifySessionProofSeal(
  seal: SessionProofSeal | string,
  secretKey: string = DEFAULT_SESSION_SEAL_SECRET
): { isValid: boolean; parsedSeal?: SessionProofSeal; reason?: string } {
  try {
    let parsed: SessionProofSeal;

    if (typeof seal === 'string') {
      try {
        const decoded = Buffer.from(seal, 'base64url').toString('utf-8');
        parsed = JSON.parse(decoded);
      } catch {
        parsed = JSON.parse(seal);
      }
    } else {
      parsed = seal;
    }

    if (!parsed || parsed.version !== '1.0.0' || !parsed.hmacSignature || !parsed.sealId) {
      return { isValid: false, reason: 'Formato do selo de segurança de sessão inválido.' };
    }

    const verificationPayload = {
      version: parsed.version,
      sessionIdHash: parsed.sessionIdHash,
      contextHash: parsed.contextHash,
      anomalyCount: parsed.anomalyCount,
      mitigationAction: parsed.mitigationAction,
      timestamp: parsed.timestamp
    };

    const canonicalString = canonicalJsonStringify(verificationPayload);
    const expectedSignature = createHmac('sha256', secretKey).update(canonicalString).digest('base64url');

    const expectedBuf = Buffer.from(expectedSignature, 'utf-8');
    const actualBuf = Buffer.from(parsed.hmacSignature, 'utf-8');

    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
      return { isValid: false, reason: 'Assinatura HMAC do selo de sessão corrompida ou chave inválida.' };
    }

    return { isValid: true, parsedSeal: parsed };
  } catch (err: any) {
    return { isValid: false, reason: `Falha na verificação criptográfica: ${err.message}` };
  }
}

/**
 * Avalia continuamente o contexto da sessão contra sequestro e fixação (OWASP ASVS V3.3)
 */
export function evaluateSessionContext(
  sessionToken: SessionSecurityToken,
  expectedContext: ClientContextFingerprint,
  currentContext: ClientContextFingerprint,
  policy: SessionGuardPolicy = DEFAULT_SESSION_GUARD_POLICY,
  isPrivilegeElevation: boolean = false
): SessionEvaluationResult {
  const anomalies: SessionEvaluationAnomaly[] = [];
  const sessionIdHash = createHash('sha256').update(sessionToken.sessionId).digest('hex');
  const currentContextHash = computeContextHash(currentContext);

  // 1. Verificação de Elevação de Privilégio (Rotação Obrigatória para Prevenção de Fixação)
  let requiresRotation = false;
  let newSessionId: string | undefined;

  if (isPrivilegeElevation && policy.enforceRotationOnElevation) {
    requiresRotation = true;
    newSessionId = generateCryptographicSessionId();
  }

  // 2. Verificação de Mutação de User-Agent (Vetor Primário de Hijacking CWE-287)
  if (policy.bindUserAgent && expectedContext.userAgentHash !== currentContext.userAgentHash) {
    anomalies.push({
      type: SessionAnomalyType.USER_AGENT_MUTATION,
      description: 'Mutação drástica de User-Agent/Device Fingerprint identificada para o mesmo identificador de sessão.',
      severity: 'CRITICAL',
      evidence: `User-Agent esperado: ${expectedContext.userAgent} [${expectedContext.userAgentHash.substring(0, 8)}] | Atual: ${currentContext.userAgent} [${currentContext.userAgentHash.substring(0, 8)}]`
    });
  }

  // 3. Verificação de Vinculação de Sub-rede IP (Dynamic Subnet Binding)
  if (policy.bindIpSubnet && expectedContext.subnetPrefix !== currentContext.subnetPrefix) {
    if (policy.allowSubnetShift && expectedContext.userAgentHash === currentContext.userAgentHash) {
      anomalies.push({
        type: SessionAnomalyType.IP_SUBNET_MISMATCH,
        description: 'Variação de sub-rede de rede detectada (roaming móvel permitido sob desafio step-up).',
        severity: 'MEDIUM',
        evidence: `Sub-rede esperada: ${expectedContext.subnetPrefix} | Atual: ${currentContext.subnetPrefix}`
      });
    } else {
      anomalies.push({
        type: SessionAnomalyType.IP_SUBNET_MISMATCH,
        description: 'Requisição originada fora da sub-rede de rede vinculada à sessão clínica legítima.',
        severity: 'HIGH',
        evidence: `Sub-rede esperada: ${expectedContext.subnetPrefix} | Atual: ${currentContext.subnetPrefix} (${currentContext.clientIp})`
      });
    }
  }

  // 4. Verificação de TLS JA4/JA3 Fingerprint
  if (
    policy.bindTlsFingerprint &&
    expectedContext.tlsFingerprint &&
    currentContext.tlsFingerprint &&
    expectedContext.tlsFingerprint !== currentContext.tlsFingerprint
  ) {
    anomalies.push({
      type: SessionAnomalyType.TLS_FINGERPRINT_MISMATCH,
      description: 'Divergência crítica no TLS Client Fingerprint (JA4/JA3) da conexão com o enclave.',
      severity: 'HIGH',
      evidence: `TLS Fingerprint esperado: ${expectedContext.tlsFingerprint} | Atual: ${currentContext.tlsFingerprint}`
    });
  }

  // 5. Verificação de Salto Geográfico / Viagem Impossível
  if (
    expectedContext.countryCode &&
    currentContext.countryCode &&
    expectedContext.countryCode !== currentContext.countryCode
  ) {
    anomalies.push({
      type: SessionAnomalyType.GEOGRAPHIC_IMPOSSIBLE_TRAVEL,
      description: 'Salto geográfico impossível detectado para o mesmo token de sessão ativo.',
      severity: 'CRITICAL',
      evidence: `País de origem inicial: ${expectedContext.countryCode} | País da requisição atual: ${currentContext.countryCode}`
    });
  }

  // 6. Determinação da Ação de Mitigação Automatizada
  let isAllowed = true;
  let action = SessionMitigationAction.ALLOW_WITH_TELEMETRY;

  if (anomalies.some(a => a.severity === 'CRITICAL')) {
    isAllowed = false;
    action = SessionMitigationAction.IMMEDIATE_REVOCATION;
  } else if (anomalies.some(a => a.severity === 'HIGH')) {
    isAllowed = false;
    action = SessionMitigationAction.FORCE_REAUTHENTICATION;
  } else if (anomalies.some(a => a.severity === 'MEDIUM')) {
    action = SessionMitigationAction.STEP_UP_CHALLENGE;
  } else if (requiresRotation) {
    action = SessionMitigationAction.ALLOW_WITH_ROTATION;
  }

  // 7. Emissão do Selo Probatório WORM RFC 8785
  const seal = createSessionProofSeal(
    sessionIdHash,
    currentContextHash,
    anomalies.length,
    action
  );

  return {
    isAllowed,
    sessionId: sessionToken.sessionId,
    action,
    anomalies,
    requiresRotation,
    newSessionId,
    contextFingerprint: currentContext,
    seal
  };
}
