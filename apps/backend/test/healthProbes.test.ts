import { describe, expect, it, beforeEach } from 'bun:test';
import { app } from '../src';
import { db } from '../src/db/memoryDb';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import type { ReadinessProbeResponse, LivenessProbeResponse, StartupProbeResponse } from '@terapiainfoco/shared';

describe('Health Checks, Liveness & Readiness Probes (RFC-001 §5.2 e 12-Factor App)', () => {
  let adminToken: string;
  let therapistToken: string;
  let secretaryToken: string;

  beforeEach(async () => {
    db.clear();
    await globalRateLimitStore.reset();

    // 1. Login Admin
    const loginAdmin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    adminToken = (await loginAdmin.json()).accessToken;

    // 2. Login Psicólogo Titular
    const loginTherapist = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'psicologo@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    therapistToken = (await loginTherapist.json()).accessToken;

    // 3. Login Secretária
    const loginSec = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'recepcao@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    secretaryToken = (await loginSec.json()).accessToken;
  });

  describe('Liveness Probe & Health Geral', () => {
    it('deve responder GET /health com status ok/healthy, uptime e métricas de memória do processo', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(['ok', 'healthy']).toContain(data.status);
      expect(data.livenessStatus).toBe('healthy');
      expect(data.service).toBe('terapiainfoco-backend');
      expect(data.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(data.uptimeFormatted).toBeDefined();
      expect(data.memoryRssMb).toBeGreaterThan(0);
      expect(data.database).toBeDefined();
      expect(data.compliance.cfp).toContain('001/2009');
      expect(data.compliance.lgpd).toContain('Art. 48');
    });

    it('deve responder GET /health/liveness com métricas de sistema completas (Bun/Node/RAM)', async () => {
      const res = await app.request('/health/liveness');
      expect(res.status).toBe(200);

      const data = await res.json() as LivenessProbeResponse;
      expect(data.status).toBe('healthy');
      expect(data.service).toBe('terapiainfoco-backend');
      expect(data.system.pid).toBeGreaterThan(0);
      expect(data.system.platform).toBeDefined();
      expect(data.system.memory.rssMb).toBeGreaterThan(0);
      expect(data.system.memory.heapUsedMb).toBeGreaterThan(0);
    });
  });

  describe('Readiness Probe (Multi-Dependências)', () => {
    it('deve responder GET /health/readiness inspecionando ativamente Banco, KMS, Cache, RateLimiter e WORM', async () => {
      const res = await app.request('/health/readiness');
      expect([200, 503]).toContain(res.status);

      const data = await res.json() as ReadinessProbeResponse;
      expect(data.service).toBe('terapiainfoco-backend');
      expect(data.overallLatencyMs).toBeGreaterThanOrEqual(0);
      expect(data.summary.total).toBeGreaterThanOrEqual(5);

      // 1. Checagem de Banco de Dados
      expect(data.checks['database']).toBeDefined();
      expect(data.checks['database'].category).toBe('database');
      expect(data.checks['database'].latencyMs).toBeGreaterThanOrEqual(0);

      // 2. Checagem de KMS & Envelope Encryption
      expect(data.checks['kms_envelope']).toBeDefined();
      expect(data.checks['kms_envelope'].status).toBe('healthy');

      // 3. Checagem de Cache Criptográfico em Memória
      expect(data.checks['encrypted_cache']).toBeDefined();
      expect(data.checks['encrypted_cache'].category).toBe('cache');

      // 4. Checagem de Trilha Forense WORM
      expect(data.checks['worm_audit_chain']).toBeDefined();
      expect(data.checks['worm_audit_chain'].status).toBe('healthy');

      // 5. Checagem de Webhooks
      expect(data.checks['webhooks_engine']).toBeDefined();
    });
  });

  describe('Startup Probe', () => {
    it('deve responder GET /health/startup confirmando conclusão da inicialização', async () => {
      const res = await app.request('/health/startup');
      expect([200, 503]).toContain(res.status);

      const data = await res.json() as StartupProbeResponse;
      expect(data.bootCompleted).toBe(true);
      expect(data.databaseDriver).toBeDefined();
      expect(data.bootstrapDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Painel Administrativo de Probes & RBAC (/api/system/probes)', () => {
    it('deve permitir acesso detalhado ao probe de prontidão pelo perfil Admin', async () => {
      const res = await app.request('/api/system/probes/readiness', {
        headers: {
          Authorization: `Bearer ${adminToken}`
        }
      });
      expect(res.status).toBe(200);

      const data = await res.json() as ReadinessProbeResponse;
      expect(data.summary).toBeDefined();
      expect(data.checks).toBeDefined();
    });

    it('deve bloquear acesso de psicólogo e secretária às rotas de probes de infraestrutura (403 Forbidden)', async () => {
      const resTherapist = await app.request('/api/system/probes/readiness', {
        headers: {
          Authorization: `Bearer ${therapistToken}`
        }
      });
      expect(resTherapist.status).toBe(403);

      const resSec = await app.request('/api/system/probes/readiness', {
        headers: {
          Authorization: `Bearer ${secretaryToken}`
        }
      });
      expect(resSec.status).toBe(403);
    });

    it('deve rejeitar chamadas anônimas nas rotas de probes administrativas (401 Unauthorized)', async () => {
      const res = await app.request('/api/system/probes/readiness');
      expect(res.status).toBe(401);
    });
  });
});
