import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { expressionInjectionGuardRoutes } from '../src/routes/expressionInjectionGuard';
import {
  ExpressionRiskSeverity,
  ExpressionThreatCategory,
  ExpressionValidationAction,
  ExpressionFilterDialect,
} from '@terapiainfoco/shared';

describe('Backend API Integration: Code/Expression Injection Guard (/api/expression-guard)', () => {
  const app = new Hono();
  app.route('/api/expression-guard', expressionInjectionGuardRoutes);

  describe('GET /api/expression-guard/overview', () => {
    it('deve retornar telemetria completa, métricas, incidentes, amostras de prontuários e selos probatórios', async () => {
      const res = await app.request('/api/expression-guard/overview');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.overview).toBeDefined();
      expect(json.overview.metrics.totalExpressionsInspected).toBeGreaterThan(0);
      expect(json.overview.clinicalRecordsSample.length).toBeGreaterThan(0);
      expect(json.overview.policy.strictAstEnforcement).toBe(true);
      expect(json.overview.recentIncidents.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/expression-guard/inspect', () => {
    it('deve inspecionar expressão clínica segura e retornar AST válida', async () => {
      const res = await app.request('/api/expression-guard/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expression: "cidCategory == 'DEPRESSION' && (riskLevel == 'CRITICAL' || riskLevel == 'HIGH')",
          dialect: ExpressionFilterDialect.CLINICAL_AST_DSL,
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.inspection.isSafe).toBe(true);
      expect(json.inspection.action).toBe(ExpressionValidationAction.ALLOW_EXECUTION);
      expect(json.inspection.severity).toBe(ExpressionRiskSeverity.CLEAN);
      expect(json.inspection.astRoot).toBeDefined();
      expect(json.inspection.seal).toBeDefined();
    });

    it('deve detectar e bloquear ataque de execução de código dinâmico (require / child_process)', async () => {
      const res = await app.request('/api/expression-guard/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expression: "require('child_process').execSync('id') && cid11 == '6A70'",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.inspection.isSafe).toBe(false);
      expect(json.inspection.action).toBe(ExpressionValidationAction.BLOCK_ATTACK);
      expect(json.inspection.severity).toBe(ExpressionRiskSeverity.CRITICAL);
      expect(json.inspection.threats.some((t: any) => t.category === ExpressionThreatCategory.SYSTEM_GLOBAL_ACCESS)).toBe(true);
    });

    it('deve retornar 400 se a expressão não for informada', async () => {
      const res = await app.request('/api/expression-guard/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain('expressão clínica é obrigatória');
    });
  });

  describe('POST /api/expression-guard/evaluate', () => {
    it('deve avaliar filtro de busca clínica contra prontuários com segurança (Zero eval)', async () => {
      const res = await app.request('/api/expression-guard/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expression: "cid11 == '6A70'",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.result.success).toBe(true);
      expect(json.result.matchedCount).toBe(2);
      expect(json.result.matchedRecords.map((r: any) => r.id)).toEqual(['rec_001', 'rec_006']);
      expect(json.result.proofSeal).toBeDefined();
    });

    it('deve recusar avaliação de expressão maliciosa com RCE e retornar erro seguro', async () => {
      const res = await app.request('/api/expression-guard/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expression: "eval('process.exit()') == 1",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.result.success).toBe(false);
      expect(json.result.matchedCount).toBe(0);
      expect(json.message).toContain('Falha na avaliação');
    });
  });

  describe('POST /api/expression-guard/policy', () => {
    it('deve atualizar dinamicamente a política de governança de expressões', async () => {
      const res = await app.request('/api/expression-guard/policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policy: {
            maxAstDepth: 8,
            maxAstNodes: 80,
          },
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.policy.maxAstDepth).toBe(8);
      expect(json.policy.maxAstNodes).toBe(80);
    });

    it('deve retornar 400 se o payload da política não for enviado', async () => {
      const res = await app.request('/api/expression-guard/policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
    });
  });

  describe('POST /api/expression-guard/simulate', () => {
    it('deve simular pentest de Prototype Pollution e registrar incidente mitigado', async () => {
      const res = await app.request('/api/expression-guard/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threatCategory: ExpressionThreatCategory.PROTOTYPE_POLLUTION_EXPR,
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.threatBlocked).toBe(true);
      expect(json.incident).toBeDefined();
      expect(json.incident.category).toBe(ExpressionThreatCategory.PROTOTYPE_POLLUTION_EXPR);
      expect(json.incident.blocked).toBe(true);
    });

    it('deve retornar 400 se a categoria de ameaça não for informada', async () => {
      const res = await app.request('/api/expression-guard/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
    });
  });

  describe('POST /api/expression-guard/verify-seal', () => {
    it('deve validar um selo probatório WORM RFC 8785 legítimo', async () => {
      // 1. Obter visão geral para pegar um selo gerado
      const overviewRes = await app.request('/api/expression-guard/overview');
      const overviewJson = await overviewRes.json();
      const sampleSeal = overviewJson.overview.recentSealsSample[0];

      expect(sampleSeal).toBeDefined();

      // 2. Validar no endpoint de verificação
      const res = await app.request('/api/expression-guard/verify-seal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sealToken: sampleSeal,
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.isValid).toBe(true);
      expect(json.message).toContain('verificado com 100% de integridade');
    });

    it('deve acusar erro ao submeter token malformado ou inexistente', async () => {
      const res = await app.request('/api/expression-guard/verify-seal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sealToken: 'invalid_nonexistent_seal_token',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.isValid).toBe(false);
    });
  });
});
