import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { WebRtcSecurityService } from '../src/services/webrtcSecurityService';
import {
  AuditAction,
  AuditResourceType,
  WebRtcCipherSuite,
  WebRtcSecurityGrade,
  WebRtcVerificationStatus
} from '@terapiainfoco/shared';

describe('WebRTC Security & DTLS Fingerprint Audit (RFC-001 §3.2, §4.4, §5.2 e CFP 011/2018)', () => {
  let therapistToken: string;
  let adminToken: string;
  let secretaryToken: string;

  const validTherapistFp = 'SHA-256 AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00';
  const validPatientFp = 'SHA-256 11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF';

  beforeEach(async () => {
    db.clear();
    globalRateLimitStore.reset();
    WebRtcSecurityService.getInstance().resetForTesting();

    const loginTherapist = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'psicologo@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const therapistData = await loginTherapist.json();
    therapistToken = therapistData.accessToken;

    const loginAdmin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const adminData = await loginAdmin.json();
    adminToken = adminData.accessToken;

    const loginSecretary = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'recepcao@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const secretaryData = await loginSecretary.json();
    secretaryToken = secretaryData.accessToken;
  });

  it('deve permitir que psicólogo inicie a auditoria de sessão WebRTC com fingerprint DTLS', async () => {
    const res = await app.request('/api/teleconsultation/webrtc/session/initiate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        patientId: 'patient-456',
        therapistFingerprint: validTherapistFp,
        cipherSuite: WebRtcCipherSuite.SRTP_AEAD_AES_256_GCM,
        dtlsVersion: 'DTLS 1.3'
      })
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.session.sessionId).toStartWith('wrtc-');
    expect(body.session.verificationStatus).toBe(WebRtcVerificationStatus.UNVERIFIED);
    expect(body.session.securityGrade).toBe(WebRtcSecurityGrade.OPTIMAL);
    expect(body.session.therapistFingerprint.fingerprint).toBe(validTherapistFp);
    expect(body.session.probataryDigest).toBeDefined();

    // Verifica que foi registrado no ledger WORM
    const wormLogs = db.auditLogs.filter(
      l => l.action === AuditAction.WEBRTC_SESSION_INITIATED && l.resourceType === AuditResourceType.WEBRTC_SESSION
    );
    expect(wormLogs.length).toBeGreaterThan(0);
  });

  it('deve bloquear papéis não autorizados (ex: RECEPCIONISTA) de iniciar ou auditar sessão WebRTC', async () => {
    const res = await app.request('/api/teleconsultation/webrtc/session/initiate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secretaryToken}`
      },
      body: JSON.stringify({
        patientId: 'patient-456',
        therapistFingerprint: validTherapistFp
      })
    });

    expect(res.status).toBe(403);
  });

  it('deve validar o fingerprint DTLS do paciente e gerar Safety Numbers simétricos com selo WORM', async () => {
    // 1. Iniciar sessão
    const initRes = await app.request('/api/teleconsultation/webrtc/session/initiate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        patientId: 'patient-456',
        therapistFingerprint: validTherapistFp
      })
    });
    const initBody = await initRes.json();
    const sessionId = initBody.session.sessionId;

    // 2. Validar fingerprint do paciente
    const verifyRes = await app.request('/api/teleconsultation/webrtc/session/verify-fingerprint', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        sessionId,
        patientFingerprint: validPatientFp,
        manuallyConfirmedByUser: true
      })
    });

    expect(verifyRes.status).toBe(200);
    const verifyBody = await verifyRes.json();
    expect(verifyBody.success).toBe(true);
    expect(verifyBody.match).toBe(true);
    expect(verifyBody.verificationStatus).toBe(WebRtcVerificationStatus.VERIFIED_MATCH);
    expect(verifyBody.safetyNumbers).toMatch(/^\d{5}\s\d{5}\s\d{5}\s\d{5}$/);
    expect(verifyBody.probataryDigest).toHaveLength(64);

    // Verifica que foi registrado no ledger WORM com ação WEBRTC_FINGERPRINT_VERIFIED
    const wormLogs = db.auditLogs.filter(
      l => l.action === AuditAction.WEBRTC_FINGERPRINT_VERIFIED
    );
    expect(wormLogs.length).toBeGreaterThan(0);
  });

  it('deve coletar métricas de telemetria da sessão (jitter, perdas e bytes cifrados)', async () => {
    const initRes = await app.request('/api/teleconsultation/webrtc/session/initiate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        patientId: 'patient-456',
        therapistFingerprint: validTherapistFp
      })
    });
    const { session } = await initRes.json();

    const metricsRes = await app.request('/api/teleconsultation/webrtc/session/metrics', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        sessionId: session.sessionId,
        jitterMs: 14.5,
        packetLoss: 0.2,
        rttMs: 38,
        bytesSent: 154200,
        bytesReceived: 182300
      })
    });

    expect(metricsRes.status).toBe(200);
    const metricsBody = await metricsRes.json();
    expect(metricsBody.success).toBe(true);
    expect(metricsBody.averageJitterMs).toBe(14.5);
    expect(metricsBody.packetLossPercent).toBe(0.2);
    expect(metricsBody.totalBytesEncrypted).toBe(336500);
  });

  it('deve encerrar a sessão WebRTC, gerar o laudo probatório final e registrar no ledger WORM', async () => {
    const initRes = await app.request('/api/teleconsultation/webrtc/session/initiate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        patientId: 'patient-456',
        therapistFingerprint: validTherapistFp
      })
    });
    const { session } = await initRes.json();

    const termRes = await app.request('/api/teleconsultation/webrtc/session/terminate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        sessionId: session.sessionId,
        finalNotes: 'Atendimento clínico concluído sem interferências de áudio/vídeo e canal íntegro.'
      })
    });

    expect(termRes.status).toBe(200);
    const termBody = await termRes.json();
    expect(termBody.success).toBe(true);
    expect(termBody.session.endedAt).toBeDefined();
    expect(termBody.session.tamperEvidentSeal).toStartWith('SEAL-WEBRTC-FINAL-');

    const wormLogs = db.auditLogs.filter(
      l => l.action === AuditAction.WEBRTC_SESSION_TERMINATED
    );
    expect(wormLogs.length).toBeGreaterThan(0);
  });

  it('deve listar sessões auditadas e consultar detalhes por ID', async () => {
    await app.request('/api/teleconsultation/webrtc/session/initiate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        patientId: 'patient-789',
        therapistFingerprint: validTherapistFp
      })
    });

    const listRes = await app.request('/api/teleconsultation/webrtc/sessions', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.success).toBe(true);
    expect(listBody.count).toBeGreaterThanOrEqual(1);

    const targetSessionId = listBody.sessions[0].sessionId;
    const detailRes = await app.request(`/api/teleconsultation/webrtc/session/${targetSessionId}`, {
      headers: { Authorization: `Bearer ${therapistToken}` }
    });
    expect(detailRes.status).toBe(200);
    const detailBody = await detailRes.json();
    expect(detailBody.session.sessionId).toBe(targetSessionId);
  });
});
