import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { SessionRecoveryService } from '../src/services/sessionRecoveryService';
import {
  AuditAction,
  AuditResourceType,
  ClinicalSessionState,
  DisconnectionCause,
  SessionRecoveryGrade
} from '@terapiainfoco/shared';
import { resetDb } from './helpers/db';

describe('Clinical Session Disconnection & Automatic Reconnection API (RFC-001 §3.2 & CFP nº 011/2018)', () => {
  let therapistToken: string;
  let adminToken: string;
  let secretaryToken: string;

  beforeEach(async () => {
    await resetDb();
    await globalRateLimitStore.reset();
    SessionRecoveryService.getInstance().clearForTesting();

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

  it('deve rejeitar acesso não autenticado (401) ou com perfil sem permissão (403)', async () => {
    // 401 sem token
    const resNoAuth = await app.request('/api/teleconsultation/session-recovery/sessions');
    expect(resNoAuth.status).toBe(401);

    // 403 recepção
    const resForbidden = await app.request('/api/teleconsultation/session-recovery/sessions', {
      headers: { Authorization: `Bearer ${secretaryToken}` }
    });
    expect(resForbidden.status).toBe(403);
  });

  it('deve iniciar monitoramento de sessão clínica com emissão de Reconnection Token e snapshot inicial', async () => {
    const res = await app.request('/api/teleconsultation/session-recovery/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        sessionId: 'sess-recovery-test-01',
        appointmentId: 'apt-001',
        patientId: 'pat-999',
        gracePeriodSeconds: 600,
        initialSnapshot: {
          elapsedSeconds: 0,
          clinicalNotesDraft: 'Início da sessão de acolhimento',
          soapSubjectiveDraft: 'Paciente refere tensão muscular'
        }
      })
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.reconnectionToken).toBeDefined();
    expect(data.session.state).toBe(ClinicalSessionState.ACTIVE_CONNECTED);
    expect(data.session.encryptedSnapshot).toBeDefined();
    expect(data.session.encryptedSnapshot.snapshotDigest).toHaveLength(64);

    // Confere auditoria WORM
    const audits = db.auditLogs.filter(a => a.action === AuditAction.CLINICAL_SESSION_MONITORED);
    expect(audits.length).toBeGreaterThan(0);
    expect(audits[0].resourceId).toBe('sess-recovery-test-01');
  });

  it('deve registrar heartbeats e atualizar snapshot incremental', async () => {
    // Inicia sessão
    await app.request('/api/teleconsultation/session-recovery/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        sessionId: 'sess-recovery-test-02',
        appointmentId: 'apt-002',
        gracePeriodSeconds: 600
      })
    });

    // Envia heartbeat
    const resHeartbeat = await app.request('/api/teleconsultation/session-recovery/heartbeat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        sessionId: 'sess-recovery-test-02',
        snapshot: {
          elapsedSeconds: 120,
          clinicalNotesDraft: 'Anotações atualizadas no minuto 2'
        }
      })
    });

    expect(resHeartbeat.status).toBe(200);
    const data = await resHeartbeat.json();
    expect(data.session.heartbeatCount).toBe(2);
    expect(data.session.lastHeartbeatAt).toBeDefined();
  });

  it('deve disparar desconexão abrupta e reconectar com sucesso restaurando rascunho clínico íntegro', async () => {
    // 1. Inicia sessão com notas clínicas parciais
    const startRes = await app.request('/api/teleconsultation/session-recovery/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        sessionId: 'sess-recovery-test-03',
        appointmentId: 'apt-003',
        gracePeriodSeconds: 600,
        initialSnapshot: {
          elapsedSeconds: 450,
          clinicalNotesDraft: 'Paciente descreveu relação com trabalho e ansiedade antecipatória.',
          soapSubjectiveDraft: 'Sinto que não dou conta de tudo.'
        }
      })
    });
    const startData = await startRes.json();
    const token = startData.reconnectionToken;

    // 2. Dispara queda de conexão (ex: Wi-Fi oscilando / timeout)
    const dropRes = await app.request('/api/teleconsultation/session-recovery/disconnect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        sessionId: 'sess-recovery-test-03',
        cause: DisconnectionCause.SOCKET_DROP,
        detail: 'Conexão ICE WebRTC desconectada abruptamente'
      })
    });
    expect(dropRes.status).toBe(200);
    const dropData = await dropRes.json();
    expect(dropData.session.state).toBe(ClinicalSessionState.DISCONNECTED_PENDING_RECONNECT);
    expect(dropData.session.gracePeriodExpiresAt).toBeDefined();

    // Confere auditoria WORM de queda
    const dropAudits = db.auditLogs.filter(a => a.action === AuditAction.CLINICAL_SESSION_DISCONNECTED);
    expect(dropAudits.length).toBeGreaterThan(0);

    // 3. Executa reconexão com o token emitido
    const reconnectRes = await app.request('/api/teleconsultation/session-recovery/reconnect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        sessionId: 'sess-recovery-test-03',
        reconnectionToken: dropData.reconnectionToken || token
      })
    });

    expect(reconnectRes.status).toBe(200);
    const reconnectData = await reconnectRes.json();
    expect(reconnectData.success).toBe(true);
    expect(reconnectData.session.state).toBe(ClinicalSessionState.RECONNECTED);
    expect(reconnectData.restoredSnapshot).toBeDefined();
    expect(reconnectData.restoredSnapshot.clinicalNotesDraft).toBe('Paciente descreveu relação com trabalho e ansiedade antecipatória.');
    expect(reconnectData.restoredSnapshot.soapSubjectiveDraft).toBe('Sinto que não dou conta de tudo.');
    expect(reconnectData.recoveryGrade).toBeDefined();

    // Confere auditoria WORM de reconexão
    const recAudits = db.auditLogs.filter(a => a.action === AuditAction.CLINICAL_SESSION_RECONNECTED);
    expect(recAudits.length).toBeGreaterThan(0);
  });

  it('deve rejeitar tentativa de reconexão com token inválido ou corrompido', async () => {
    // Inicia sessão
    await app.request('/api/teleconsultation/session-recovery/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        sessionId: 'sess-recovery-test-04',
        appointmentId: 'apt-004'
      })
    });

    // Tenta reconectar com token adulterado
    const badReconnectRes = await app.request('/api/teleconsultation/session-recovery/reconnect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        sessionId: 'sess-recovery-test-04',
        reconnectionToken: 'invalid.token.payload.signature'
      })
    });

    expect(badReconnectRes.status).toBe(400);
    const data = await badReconnectRes.json();
    expect(data.success).toBe(false);
    expect(data.message).toContain('Reconexão negada');
  });

  it('deve listar sessões e fornecer agregados estatísticos no endpoint de métricas', async () => {
    // Inicia e completa sessão
    await app.request('/api/teleconsultation/session-recovery/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        sessionId: 'sess-recovery-test-05',
        appointmentId: 'apt-005'
      })
    });

    const metricsRes = await app.request('/api/teleconsultation/session-recovery/metrics', {
      headers: { Authorization: `Bearer ${therapistToken}` }
    });
    expect(metricsRes.status).toBe(200);
    const metricsData = await metricsRes.json();
    expect(metricsData.success).toBe(true);
    expect(metricsData.metrics.totalMonitoredSessions).toBeGreaterThan(0);

    const listRes = await app.request('/api/teleconsultation/session-recovery/sessions', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(listData.sessions.length).toBeGreaterThan(0);
    expect(listData.metrics).toBeDefined();
  });
});
