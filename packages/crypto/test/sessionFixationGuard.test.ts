/**
 * ============================================================================
 * TESTES UNITÁRIOS: MOTOR DE PROTEÇÃO CONTRA FIXAÇÃO E SEQUESTRO DE SESSÃO
 * (OWASP ASVS v4.0 V3.3, CWE-384, CWE-287 & NIST SP 800-63B)
 * ============================================================================
 */

import { describe, it, expect } from 'bun:test';
import {
  extractIpSubnet,
  computeUserAgentCanonicalHash,
  buildClientContextFingerprint,
  computeContextHash,
  generateCryptographicSessionId,
  evaluateSessionContext,
  createSessionProofSeal,
  verifySessionProofSeal,
  DEFAULT_SESSION_GUARD_POLICY
} from '../src/sessionFixationGuard';
import {
  SessionAnomalyType,
  SessionMitigationAction,
  SessionSecurityLevel,
  type SessionSecurityToken
} from '@terapiainfoco/shared';

describe('Session Fixation & Hijacking Guard Engine (OWASP ASVS V3.3 & NIST SP 800-63B)', () => {
  describe('Primitivas de Fingerprint de Contexto e Sub-Rede', () => {
    it('deve extrair a sub-rede /24 corretamente para endereços IPv4', () => {
      expect(extractIpSubnet('192.168.1.55')).toBe('192.168.1.0/24');
      expect(extractIpSubnet('10.200.4.199')).toBe('10.200.4.0/24');
      expect(extractIpSubnet('127.0.0.1')).toBe('127.0.0.0/24');
    });

    it('deve extrair a sub-rede /48 corretamente para endereços IPv6', () => {
      expect(extractIpSubnet('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe('2001:0db8:85a3::/48');
    });

    it('deve calcular hash determinístico e insensível a espaços múltiplos do User-Agent', () => {
      const ua1 = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
      const ua2 = 'Mozilla/5.0   (Macintosh; Intel Mac OS X 10_15_7)  AppleWebKit/537.36';
      expect(computeUserAgentCanonicalHash(ua1)).toBe(computeUserAgentCanonicalHash(ua2));
    });

    it('deve gerar session IDs criptograficamente seguros e únicos com prefixo sess_sec_', () => {
      const id1 = generateCryptographicSessionId();
      const id2 = generateCryptographicSessionId();
      expect(id1).toStartWith('sess_sec_');
      expect(id2).toStartWith('sess_sec_');
      expect(id1).not.toBe(id2);
      expect(id1.length).toBeGreaterThanOrEqual(64);
    });
  });

  describe('Avaliação de Sessão e Prevenção de Session Fixation (CWE-384)', () => {
    const baseContext = buildClientContextFingerprint(
      '198.51.100.22',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
      't13d1516h2_8daaf6152771_b186095e22b6',
      'BR'
    );

    const baseSession: SessionSecurityToken = {
      sessionId: generateCryptographicSessionId(),
      userId: 'usr_psi_01',
      userRole: 'PSICOLOGO_TITULAR',
      createdAt: new Date().toISOString(),
      lastRotatedAt: new Date().toISOString(),
      securityLevel: SessionSecurityLevel.STRICT_CLINICAL,
      contextHash: computeContextHash(baseContext),
      isActive: true
    };

    it('deve aprovar requisição clínica com contexto 100% idêntico', () => {
      const evaluation = evaluateSessionContext(
        baseSession,
        baseContext,
        baseContext,
        DEFAULT_SESSION_GUARD_POLICY,
        false
      );

      expect(evaluation.isAllowed).toBe(true);
      expect(evaluation.anomalies.length).toBe(0);
      expect(evaluation.action).toBe(SessionMitigationAction.ALLOW_WITH_TELEMETRY);
      expect(evaluation.requiresRotation).toBe(false);
      expect(evaluation.seal.sealId).toStartWith('session_guard_v1_');
    });

    it('deve forçar rotação criptográfica em elevação de privilégio (prevenção ativa de Session Fixation)', () => {
      const evaluation = evaluateSessionContext(
        baseSession,
        baseContext,
        baseContext,
        DEFAULT_SESSION_GUARD_POLICY,
        true // isPrivilegeElevation: login ou transição de papel
      );

      expect(evaluation.isAllowed).toBe(true);
      expect(evaluation.requiresRotation).toBe(true);
      expect(evaluation.newSessionId).toBeDefined();
      expect(evaluation.newSessionId).not.toBe(baseSession.sessionId);
      expect(evaluation.action).toBe(SessionMitigationAction.ALLOW_WITH_ROTATION);
    });
  });

  describe('Detecção de Sequestro de Sessão (Session Hijacking CWE-287)', () => {
    const originalContext = buildClientContextFingerprint(
      '203.0.113.10',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
      't13d1516h2_8daaf6152771_b186095e22b6',
      'BR'
    );

    const session: SessionSecurityToken = {
      sessionId: generateCryptographicSessionId(),
      userId: 'usr_psi_02',
      userRole: 'PSICOLOGO_TITULAR',
      createdAt: new Date().toISOString(),
      lastRotatedAt: new Date().toISOString(),
      securityLevel: SessionSecurityLevel.TELEMEDICINE_ENCLAVE,
      contextHash: computeContextHash(originalContext),
      isActive: true
    };

    it('deve revogar imediatamente sessão se houver mutação drástica de User-Agent (token roubado)', () => {
      const hijackedContext = buildClientContextFingerprint(
        '203.0.113.10', // mesmo IP
        'Python-requests/2.31.0 Scanner Bot', // User-Agent divergente
        't13d1516h2_8daaf6152771_b186095e22b6',
        'BR'
      );

      const evaluation = evaluateSessionContext(
        session,
        originalContext,
        hijackedContext,
        DEFAULT_SESSION_GUARD_POLICY
      );

      expect(evaluation.isAllowed).toBe(false);
      expect(evaluation.action).toBe(SessionMitigationAction.IMMEDIATE_REVOCATION);
      expect(evaluation.anomalies.some(a => a.type === SessionAnomalyType.USER_AGENT_MUTATION)).toBe(true);
    });

    it('deve exigir re-autenticação limpa se a sub-rede IP divergir sem tolerância', () => {
      const foreignContext = buildClientContextFingerprint(
        '198.51.100.99', // Sub-rede totalmente diferente
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
        't13d1516h2_8daaf6152771_b186095e22b6',
        'BR'
      );

      const evaluation = evaluateSessionContext(
        session,
        originalContext,
        foreignContext,
        { ...DEFAULT_SESSION_GUARD_POLICY, allowSubnetShift: false }
      );

      expect(evaluation.isAllowed).toBe(false);
      expect(evaluation.action).toBe(SessionMitigationAction.FORCE_REAUTHENTICATION);
      expect(evaluation.anomalies.some(a => a.type === SessionAnomalyType.IP_SUBNET_MISMATCH)).toBe(true);
    });

    it('deve emitir step-up challenge se allowSubnetShift for verdadeiro para o mesmo User-Agent', () => {
      const roamingContext = buildClientContextFingerprint(
        '198.51.100.99', // Roaming 4G/5G
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
        't13d1516h2_8daaf6152771_b186095e22b6',
        'BR'
      );

      const evaluation = evaluateSessionContext(
        session,
        originalContext,
        roamingContext,
        { ...DEFAULT_SESSION_GUARD_POLICY, allowSubnetShift: true }
      );

      expect(evaluation.isAllowed).toBe(true);
      expect(evaluation.action).toBe(SessionMitigationAction.STEP_UP_CHALLENGE);
    });

    it('deve revogar imediatamente se detectar salto geográfico impossível (país diferente)', () => {
      const impossibleTravelContext = buildClientContextFingerprint(
        '185.220.101.5',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
        't13d1516h2_8daaf6152771_b186095e22b6',
        'RU' // País diferente de BR
      );

      const evaluation = evaluateSessionContext(
        session,
        originalContext,
        impossibleTravelContext,
        DEFAULT_SESSION_GUARD_POLICY
      );

      expect(evaluation.isAllowed).toBe(false);
      expect(evaluation.action).toBe(SessionMitigationAction.IMMEDIATE_REVOCATION);
      expect(evaluation.anomalies.some(a => a.type === SessionAnomalyType.GEOGRAPHIC_IMPOSSIBLE_TRAVEL)).toBe(true);
    });

    it('deve detectar divergência no TLS Client Fingerprint (JA4/JA3)', () => {
      const tlsTamperedContext = buildClientContextFingerprint(
        '203.0.113.10',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
        't13d_different_tls_cipher_stack',
        'BR'
      );

      const evaluation = evaluateSessionContext(
        session,
        originalContext,
        tlsTamperedContext,
        DEFAULT_SESSION_GUARD_POLICY
      );

      expect(evaluation.isAllowed).toBe(false);
      expect(evaluation.anomalies.some(a => a.type === SessionAnomalyType.TLS_FINGERPRINT_MISMATCH)).toBe(true);
    });
  });

  describe('Selo Probatório Notarial WORM RFC 8785', () => {
    it('deve emitir e validar com sucesso selo de integridade da sessão', () => {
      const seal = createSessionProofSeal(
        'hash_sess_123',
        'hash_ctx_456',
        0,
        SessionMitigationAction.ALLOW_WITH_TELEMETRY
      );

      expect(seal.sealId).toStartWith('session_guard_v1_');
      const verification = verifySessionProofSeal(seal);
      expect(verification.isValid).toBe(true);
      expect(verification.parsedSeal?.sessionIdHash).toBe('hash_sess_123');
    });

    it('deve rejeitar selo adulterado ou com assinatura HMAC corrompida', () => {
      const seal = createSessionProofSeal(
        'hash_sess_123',
        'hash_ctx_456',
        0,
        SessionMitigationAction.ALLOW_WITH_TELEMETRY
      );

      const tampered = { ...seal, anomalyCount: 99 };
      const verification = verifySessionProofSeal(tampered);
      expect(verification.isValid).toBe(false);
      expect(verification.reason).toContain('Assinatura HMAC');
    });
  });
});
