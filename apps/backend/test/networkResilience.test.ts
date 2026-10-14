import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { NetworkResilienceService } from '../src/services/networkResilienceService';
import {
  AuditAction,
  AuditResourceType,
  NetworkProfileType,
  ClinicalIntelligibilityGrade,
  AudioCodecType
} from '@terapiainfoco/shared';

describe('Network Resilience Simulation & Clinical Intelligibility Assessment (RFC-001 §3.2, §5.1, §5.2 e CFP 011/2018)', () => {
  let therapistToken: string;
  let adminToken: string;
  let secretaryToken: string;

  beforeEach(async () => {
    db.clear();
    globalRateLimitStore.reset();
    NetworkResilienceService.getInstance().resetForTesting();

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

  it('deve listar todos os presets padronizados de simulação de rede', async () => {
    const res = await app.request('/api/teleconsultation/network-resilience/presets', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${therapistToken}`
      }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.presets.length).toBe(6);
    expect(data.presets.some((p: any) => p.profile === NetworkProfileType.FIBRA_ESTAVEL)).toBe(true);
    expect(data.presets.some((p: any) => p.profile === NetworkProfileType.DEGRADED_CRITICAL)).toBe(true);
  });

  it('deve bloquear acesso aos presets para perfis não autorizados (RBAC) ou sem token', async () => {
    // 1. Sem token -> 401
    const unauthRes = await app.request('/api/teleconsultation/network-resilience/presets', {
      method: 'GET'
    });
    expect(unauthRes.status).toBe(401);

    // 2. Secretária -> 403
    const forbiddenRes = await app.request('/api/teleconsultation/network-resilience/presets', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${secretaryToken}`
      }
    });
    expect(forbiddenRes.status).toBe(403);
  });

  it('deve executar simulação de rede estável (Fibra) com escore excelente e selar no WORM', async () => {
    const res = await app.request('/api/teleconsultation/network-resilience/simulate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${therapistToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        profile: NetworkProfileType.FIBRA_ESTAVEL,
        patientId: 'patient-test-001'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.report.assessment.mosScore).toBeGreaterThanOrEqual(4.0);
    expect(data.report.assessment.intelligibilityGrade).toBe(ClinicalIntelligibilityGrade.EXCELLENT);
    expect(data.report.assessment.requiresContingency).toBe(false);
    expect(data.report.probatoryDigest).toHaveLength(64);
    expect(data.report.wormAuditId).toBeDefined();

    // Verifica se gravou na trilha de auditoria WORM
    const auditRes = await app.request('/api/audit', {
      headers: { 'Authorization': `Bearer ${therapistToken}` }
    });
    const auditData = await auditRes.json();
    const networkLog = auditData.logs.find(
      (l: any) => l.action === AuditAction.NETWORK_RESILIENCE_SIMULATED && l.resourceId === data.report.id
    );
    expect(networkLog).toBeDefined();
    expect(networkLog.resourceType).toBe(AuditResourceType.NETWORK_RESILIENCE);
  });

  it('deve executar simulação degradada crítica, recomendar contingência ética CFP e gravar duplo selo WORM', async () => {
    const res = await app.request('/api/teleconsultation/network-resilience/simulate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${therapistToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        profile: NetworkProfileType.DEGRADED_CRITICAL,
        patientId: 'patient-test-002'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.report.assessment.mosScore).toBeLessThan(2.8);
    expect(data.report.assessment.intelligibilityGrade).toBe(ClinicalIntelligibilityGrade.CRITICAL_UNACCEPTABLE);
    expect(data.report.assessment.requiresContingency).toBe(true);
    expect(data.report.assessment.clinicalRecommendation).toContain('suspender a videoconferência');

    // Verifica que gravou tanto NETWORK_RESILIENCE_SIMULATED quanto CLINICAL_CONTINGENCY_TRIGGERED no WORM
    const auditRes = await app.request('/api/audit', {
      headers: { 'Authorization': `Bearer ${therapistToken}` }
    });
    const auditData = await auditRes.json();
    const contingencyLog = auditData.logs.find(
      (l: any) => l.action === AuditAction.CLINICAL_CONTINGENCY_TRIGGERED && l.resourceId === data.report.id
    );
    expect(contingencyLog).toBeDefined();
    expect(contingencyLog.resourceType).toBe(AuditResourceType.NETWORK_RESILIENCE);
  });

  it('deve executar simulação com parâmetros customizados (CUSTOM)', async () => {
    const res = await app.request('/api/teleconsultation/network-resilience/simulate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        profile: NetworkProfileType.CUSTOM,
        params: {
          jitterMs: 15,
          packetLossPercent: 1.0,
          rttMs: 50,
          bandwidthKbps: 15000,
          durationSeconds: 30,
          codec: AudioCodecType.OPUS_FULLBAND,
          simulateAudioOnly: true
        }
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.report.params.simulateAudioOnly).toBe(true);
    expect(data.report.assessment.videoQualityStatus).toBe('DISABLED_AUDIO_ONLY');
  });

  it('deve consultar o histórico de simulações e métricas consolidadas', async () => {
    // Executa duas simulações
    await app.request('/api/teleconsultation/network-resilience/simulate', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${therapistToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: NetworkProfileType.FIBRA_ESTAVEL })
    });
    await app.request('/api/teleconsultation/network-resilience/simulate', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${therapistToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: NetworkProfileType.MOBILE_4G_CONGESTED })
    });

    // Consulta histórico
    const historyRes = await app.request('/api/teleconsultation/network-resilience/history?limit=10', {
      headers: { 'Authorization': `Bearer ${therapistToken}` }
    });
    expect(historyRes.status).toBe(200);
    const historyData = await historyRes.json();
    expect(historyData.success).toBe(true);
    expect(historyData.reports.length).toBe(2);
    expect(historyData.metrics.totalSimulations).toBe(2);
    expect(historyData.metrics.avgMosScore).toBeGreaterThan(0);

    // Consulta métricas isoladas
    const metricsRes = await app.request('/api/teleconsultation/network-resilience/metrics', {
      headers: { 'Authorization': `Bearer ${therapistToken}` }
    });
    expect(metricsRes.status).toBe(200);
    const metricsData = await metricsRes.json();
    expect(metricsData.success).toBe(true);
    expect(metricsData.metrics.totalSimulations).toBe(2);
  });
});
