import { describe, expect, it } from 'bun:test';
import {
  generateReconnectionToken,
  verifyReconnectionToken,
  encryptSessionSnapshot,
  decryptSessionSnapshot,
  calculateSessionEventDigest,
  evaluateRecoveryGrade
} from '../src/sessionRecovery';
import type { SessionStateSnapshot } from '@terapiainfoco/shared';

describe('Clinical Session Disconnection & Secure Recovery Engine (RFC-001 §3.2 & CFP nº 011/2018)', () => {
  const secret = 'super-secret-hmac-key-for-clinical-session-recovery-testing';
  const sessionId = 'sess-psi-2026-10-14-xyz';
  const therapistId = 'therapist-psi-001';

  const mockSnapshot: SessionStateSnapshot = {
    elapsedSeconds: 1420,
    clinicalNotesDraft: 'Paciente relatou redução significativa nos episódios de ansiedade noturna.',
    soapSubjectiveDraft: 'Sinto-me mais seguro com a rotina de mindfulness.',
    micMuted: false,
    camMuted: false,
    activeParticipants: ['psi-001', 'patient-889'],
    lastHeartbeatAt: new Date().toISOString(),
    sequenceNumber: 42
  };

  it('deve gerar reconnection token HMAC com payload e expiração válidos', () => {
    const generated = generateReconnectionToken({
      sessionId,
      therapistId,
      secret,
      ttlSeconds: 600
    });

    expect(generated.token).toBeDefined();
    expect(generated.token.split('.').length).toBe(2);
    expect(generated.tokenHash).toHaveLength(64);
    expect(new Date(generated.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('deve verificar token legítimo com sucesso dentro da janela de tolerância', () => {
    const generated = generateReconnectionToken({
      sessionId,
      therapistId,
      secret,
      ttlSeconds: 300
    });

    const result = verifyReconnectionToken(generated.token, secret, sessionId);
    expect(result.valid).toBe(true);
    expect(result.payload?.sessionId).toBe(sessionId);
    expect(result.payload?.therapistId).toBe(therapistId);
  });

  it('deve rejeitar token com assinatura adulterada (Tamper-Evidence)', () => {
    const generated = generateReconnectionToken({
      sessionId,
      therapistId,
      secret,
      ttlSeconds: 300
    });

    const [payload, sig] = generated.token.split('.');
    const tamperedSig = sig.slice(0, -2) + (sig.slice(-2) === 'aa' ? 'bb' : 'aa');
    const tamperedToken = `${payload}.${tamperedSig}`;

    const result = verifyReconnectionToken(tamperedToken, secret, sessionId);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Assinatura criptográfica');
  });

  it('deve rejeitar token apresentado para outra sessão (Session Hijacking protection)', () => {
    const generated = generateReconnectionToken({
      sessionId: 'sess-psi-ORIGINAL',
      therapistId,
      secret,
      ttlSeconds: 300
    });

    const result = verifyReconnectionToken(generated.token, secret, 'sess-psi-ATTACKER');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Token pertence a outra sessão');
  });

  it('deve rejeitar token expirado além da janela de contingência', () => {
    const generated = generateReconnectionToken({
      sessionId,
      therapistId,
      secret,
      ttlSeconds: -10 // Já expirado
    });

    const result = verifyReconnectionToken(generated.token, secret, sessionId);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('expirada');
  });

  it('deve cifrar e decifrar SessionStateSnapshot com AES-256-GCM sem corrupção', () => {
    const key = 'clinical-snapshot-encryption-key-aes-256';
    const encrypted = encryptSessionSnapshot(mockSnapshot, key);

    expect(encrypted.ciphertextBase64).toBeDefined();
    expect(encrypted.ivHex).toHaveLength(24); // 12 bytes = 24 hex
    expect(encrypted.authTagHex).toHaveLength(32); // 16 bytes = 32 hex
    expect(encrypted.snapshotDigest).toHaveLength(64);

    const decrypted = decryptSessionSnapshot(encrypted, key);
    expect(decrypted.clinicalNotesDraft).toBe(mockSnapshot.clinicalNotesDraft);
    expect(decrypted.soapSubjectiveDraft).toBe(mockSnapshot.soapSubjectiveDraft);
    expect(decrypted.elapsedSeconds).toBe(mockSnapshot.elapsedSeconds);
    expect(decrypted.sequenceNumber).toBe(mockSnapshot.sequenceNumber);
  });

  it('deve falhar a decifragem do snapshot se a authTag for violada', () => {
    const key = 'clinical-snapshot-encryption-key-aes-256';
    const encrypted = encryptSessionSnapshot(mockSnapshot, key);

    const tampered = {
      ...encrypted,
      authTagHex: '00'.repeat(16)
    };

    expect(() => decryptSessionSnapshot(tampered, key)).toThrow();
  });

  it('deve gerar digest probatório canônico SHA-256 da sessão', () => {
    const digest1 = calculateSessionEventDigest({
      sessionId,
      eventType: 'DISCONNECTED',
      timestamp: '2026-10-14T10:00:00.000Z',
      therapistId,
      sequenceNumber: 15,
      snapshotDigest: 'abc123'
    });

    const digest2 = calculateSessionEventDigest({
      sessionId,
      eventType: 'DISCONNECTED',
      timestamp: '2026-10-14T10:00:00.000Z',
      therapistId,
      sequenceNumber: 15,
      snapshotDigest: 'abc123'
    });

    expect(digest1).toBe(digest2);
    expect(digest1).toHaveLength(64);
  });

  it('deve avaliar a qualidade da recuperação temporal (SEAMLESS, RECOVERED, EXPIRED_CONTINGENCY)', () => {
    expect(evaluateRecoveryGrade(5, 600)).toBe('SEAMLESS');
    expect(evaluateRecoveryGrade(15, 600)).toBe('SEAMLESS');
    expect(evaluateRecoveryGrade(16, 600)).toBe('RECOVERED');
    expect(evaluateRecoveryGrade(300, 600)).toBe('RECOVERED');
    expect(evaluateRecoveryGrade(601, 600)).toBe('EXPIRED_CONTINGENCY');
  });
});
