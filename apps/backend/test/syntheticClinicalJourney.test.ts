import { describe, expect, it, beforeEach } from 'bun:test';
import { app } from '../src';
import { db } from '../src/db/memoryDb';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { SyntheticService } from '../src/services/syntheticService';
import { AuditService } from '../src/services/auditService';
import type { 
  SyntheticJourneyResult, 
  SyntheticHistoryResponse, 
  ResilienceCheckResult 
} from '@terapiainfoco/shared';

describe('Monitoramento Sintético, Testes E2E & Validação da Jornada Clínica (RFC-001 Opção M)', () => {
  let adminToken: string;
  let therapistToken: string;
  let secretaryToken: string;

  beforeEach(async () => {
    db.clear();
    globalRateLimitStore.reset();

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

  describe('SyntheticService Unit & Domain Probes', () => {
    it('deve executar a jornada clínica sintética completa com 8 passos validados e 100% de sucesso', async () => {
      const result: SyntheticJourneyResult = await SyntheticService.runProbe({
        scenario: 'full_clinical_journey'
      });

      expect(result).toBeDefined();
      expect(result.executionId).toMatch(/^syn-/);
      expect(result.status).toBe('passed');
      expect(result.scenario).toBe('full_clinical_journey');
      expect(result.totalDurationMs).toBeGreaterThan(0);
      expect(result.summary.total).toBe(8);
      expect(result.summary.passed).toBe(8);
      expect(result.summary.failed).toBe(0);

      // 1. Passo: Agendamento com buffer 10m
      const stepBooking = result.steps.find(s => s.id === 'step_booking');
      expect(stepBooking).toBeDefined();
      expect(stepBooking?.status).toBe('passed');
      expect(stepBooking?.details?.roomUrl).toContain('?sala=');
      expect(stepBooking?.details?.bufferMinutes).toBe(10);

      // 2. Passo: 2FA TOTP RFC 6238
      const stepAuth = result.steps.find(s => s.id === 'step_auth_2fa');
      expect(stepAuth).toBeDefined();
      expect(stepAuth?.status).toBe('passed');
      expect(stepAuth?.details?.totpValid).toBe(true);

      // 3. Passo: Webhook HMAC-SHA256
      const stepWebhook = result.steps.find(s => s.id === 'step_webhook_hmac');
      expect(stepWebhook).toBeDefined();
      expect(stepWebhook?.status).toBe('passed');
      expect(stepWebhook?.details?.replayProtectionVerified).toBe(true);

      // 4. Passo: Transcrição & SOAP IA com sanitização LGPD Art. 11
      const stepSoap = result.steps.find(s => s.id === 'step_ai_transcription_soap');
      expect(stepSoap).toBeDefined();
      expect(stepSoap?.status).toBe('passed');
      expect(stepSoap?.details?.humanReviewRequired).toBe(true);
      expect(stepSoap?.details?.quadrantsGenerated).toEqual(['S', 'O', 'A', 'P']);

      // 5. Passo: Mascaramento Dinâmico (DDM) & Trilha WORM
      const stepDdm = result.steps.find(s => s.id === 'step_ddm_unmask');
      expect(stepDdm).toBeDefined();
      expect(stepDdm?.status).toBe('passed');
      expect(stepDdm?.details?.wormLogged).toBe(true);
      expect(stepDdm?.details?.maskedCpf).toContain('***');

      // 6. Passo: Documento CFP 006/2019 & Assinatura ICP-Brasil
      const stepDoc = result.steps.find(s => s.id === 'step_cfp_document_icp');
      expect(stepDoc).toBeDefined();
      expect(stepDoc?.status).toBe('passed');
      expect(stepDoc?.details?.zeroKnowledgeValid).toBe(true);
      expect(stepDoc?.details?.icpIssuer).toContain('ICP-Brasil');

      // 7. Passo: Integridade da Hash-Chain WORM
      const stepWorm = result.steps.find(s => s.id === 'step_worm_integrity');
      expect(stepWorm).toBeDefined();
      expect(stepWorm?.status).toBe('passed');
      expect(stepWorm?.details?.chainValid).toBe(true);

      // 8. Passo: Resiliência PGlite WASM
      const stepResilience = result.steps.find(s => s.id === 'step_resilience_failover');
      expect(stepResilience).toBeDefined();
      expect(stepResilience?.status).toBe('passed');
      expect(stepResilience?.details?.pgliteOperational).toBe(true);
      expect(stepResilience?.details?.schemaTableCount).toBe(7);
    });

    it('deve executar o cenário restrito de resiliência e failover PGlite (resilience_only)', async () => {
      const result = await SyntheticService.runProbe({
        scenario: 'resilience_only'
      });

      expect(result.status).toBe('passed');
      expect(result.steps.length).toBe(1);
      expect(result.steps[0].id).toBe('step_resilience_failover');
      expect(result.resilience?.pgliteOperational).toBe(true);
      expect(result.resilience?.wasmEngineReady).toBe(true);
      expect(result.resilience?.failoverLatencyMs).toBeGreaterThan(0);
    });

    it('deve verificar resiliência de contingência com PGlite embutido diretamente via checkResilience()', async () => {
      const res: ResilienceCheckResult = await SyntheticService.checkResilience();

      expect(res.pgliteOperational).toBe(true);
      expect(res.wasmEngineReady).toBe(true);
      expect(res.schemaTableCount).toBe(7);
      expect(res.failoverLatencyMs).toBeGreaterThan(0);
      expect(res.message).toContain('PGlite WASM 100% operacional');
    });

    it('deve armazenar no histórico as últimas execuções de sondas sintéticas', async () => {
      await SyntheticService.runProbe({ scenario: 'full_clinical_journey' });
      await SyntheticService.runProbe({ scenario: 'resilience_only' });

      const history = SyntheticService.getHistory();
      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history[0].scenario).toBe('resilience_only');
      expect(history[1].scenario).toBe('full_clinical_journey');

      const last = SyntheticService.getLastExecution();
      expect(last?.executionId).toBe(history[0].executionId);
    });
  });

  describe('Endpoints REST de Monitoramento Sintético (/api/system/synthetic)', () => {
    it('deve permitir que perfil ADMIN execute probe sintético via POST /api/system/synthetic/run', async () => {
      const res = await app.request('/api/system/synthetic/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ scenario: 'full_clinical_journey' })
      });

      expect(res.status).toBe(200);
      const data: SyntheticJourneyResult = await res.json();
      expect(data.executionId).toMatch(/^syn-/);
      expect(data.status).toBe('passed');
      expect(data.summary.passed).toBe(8);
      expect(data.steps.length).toBe(8);
    });

    it('deve permitir consulta de histórico de execuções via GET /api/system/synthetic/history por ADMIN', async () => {
      // Dispara um probe antes
      await app.request('/api/system/synthetic/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ scenario: 'full_clinical_journey' })
      });

      const res = await app.request('/api/system/synthetic/history', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });

      expect(res.status).toBe(200);
      const data: SyntheticHistoryResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.count).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(data.executions)).toBe(true);
    });

    it('deve permitir consulta de resiliência e contingência via GET /api/system/synthetic/resilience por ADMIN', async () => {
      const res = await app.request('/api/system/synthetic/resilience', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });

      expect(res.status).toBe(200);
      const data: ResilienceCheckResult = await res.json();
      expect(data.pgliteOperational).toBe(true);
      expect(data.wasmEngineReady).toBe(true);
      expect(data.schemaTableCount).toBe(7);
      expect(data.failoverLatencyMs).toBeGreaterThan(0);
    });

    it('deve bloquear com HTTP 403 Forbidden perfis não autorizados (Psicólogo ou Secretária)', async () => {
      // Tentativa de execução sintética com perfil de Psicólogo Titular
      const resTherapist = await app.request('/api/system/synthetic/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${therapistToken}`
        },
        body: JSON.stringify({ scenario: 'full_clinical_journey' })
      });
      expect(resTherapist.status).toBe(403);

      // Tentativa de execução sintética com perfil de Recepção/Secretária
      const resSec = await app.request('/api/system/synthetic/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${secretaryToken}`
        },
        body: JSON.stringify({ scenario: 'full_clinical_journey' })
      });
      expect(resSec.status).toBe(403);

      // Tentativa de consulta de histórico por Secretária
      const resHistory = await app.request('/api/system/synthetic/history', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${secretaryToken}`
        }
      });
      expect(resHistory.status).toBe(403);
    });

    it('deve rejeitar com HTTP 401 Unauthorized requisições sem token de autorização', async () => {
      const resRun = await app.request('/api/system/synthetic/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: 'full_clinical_journey' })
      });
      expect(resRun.status).toBe(401);

      const resHistory = await app.request('/api/system/synthetic/history');
      expect(resHistory.status).toBe(401);

      const resResilience = await app.request('/api/system/synthetic/resilience');
      expect(resResilience.status).toBe(401);
    });

    it('deve preservar a integridade estrita da Hash-Chain WORM após a execução de testes sintéticos', async () => {
      await app.request('/api/system/synthetic/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ scenario: 'full_clinical_journey' })
      });

      const integrity = AuditService.verifyChainIntegrity();
      expect(integrity.isValid).toBe(true);
      expect(integrity.totalEntries).toBeGreaterThan(0);
    });
  });
});
