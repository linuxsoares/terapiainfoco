import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { pathTraversalGuardRoutes } from '../src/routes/pathTraversalGuard';
import {
  ClinicalAttachmentCategory,
  PathRiskSeverity,
  PathThreatVector,
  PathValidationAction,
} from '@terapiainfoco/shared';

describe('Backend API Integration: Path Traversal & LFI Guard (/api/path-traversal-guard)', () => {
  const app = new Hono();
  app.route('/api/path-traversal-guard', pathTraversalGuardRoutes);

  describe('GET /api/path-traversal-guard/overview', () => {
    it('deve retornar telemetria completa, presets de anexos clínicos e métricas operacionais', async () => {
      const res = await app.request('/api/path-traversal-guard/overview');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.overview).toBeDefined();
      expect(json.overview.metrics.totalPathsEvaluated).toBeGreaterThan(0);
      expect(json.overview.attachmentPresets.length).toBe(5);
      expect(json.overview.policy.strictJailEnforcement).toBe(true);
      expect(json.overview.recentIncidents.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/path-traversal-guard/inspect', () => {
    it('deve inspecionar caminho seguro retornando conformidade e isWithinJail true', async () => {
      const res = await app.request('/api/path-traversal-guard/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'paciente_89/anamnese_admissional.pdf',
          category: ClinicalAttachmentCategory.ANAMNESIS_DOC,
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.inspection.isWithinJail).toBe(true);
      expect(json.inspection.severity).toBe(PathRiskSeverity.SAFE_CANONICAL);
      expect(json.inspection.threats.length).toBe(0);
    });

    it('deve detectar tentativa de traversal relativo (../../etc/passwd) com severidade crítica', async () => {
      const res = await app.request('/api/path-traversal-guard/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: '../../../../etc/passwd',
          category: ClinicalAttachmentCategory.ANAMNESIS_DOC,
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.inspection.isWithinJail).toBe(false);
      expect(json.inspection.severity).toBe(PathRiskSeverity.CRITICAL_PATH_TRAVERSAL);
      expect(json.inspection.recommendedAction).toBe(PathValidationAction.BLOCKED_TRAVERSAL_ATTEMPT);
    });

    it('deve retornar erro 400 se o caminho não for informado', async () => {
      const res = await app.request('/api/path-traversal-guard/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain('caminho de arquivo é obrigatório');
    });
  });

  describe('POST /api/path-traversal-guard/resolve', () => {
    it('deve resolver e emitir selo WORM para anexo legítimo', async () => {
      const res = await app.request('/api/path-traversal-guard/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: ClinicalAttachmentCategory.NEUROPSYCH_REPORT,
          proposedPath: 'laudo_avaliacao_neuropsicologica_completo.pdf',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.result.quarantined).toBe(false);
      expect(json.result.proofSeal.sealId.startsWith('path_guard_seal_v1_')).toBe(true);
    });

    it('deve bloquear tentativa de invasão e quarentenar anexo malicioso', async () => {
      const res = await app.request('/api/path-traversal-guard/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: ClinicalAttachmentCategory.ANAMNESIS_DOC,
          proposedPath: '../../../../etc/shadow',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.result.quarantined).toBe(true);
      expect(json.result.actionTaken).toBe(PathValidationAction.BLOCKED_TRAVERSAL_ATTEMPT);
    });

    it('deve retornar erro 400 se campos obrigatórios forem omitidos', async () => {
      const res = await app.request('/api/path-traversal-guard/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposedPath: 'documento.pdf' }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/path-traversal-guard/policy', () => {
    it('deve atualizar política de confinamento e filtros de extensões permitidas', async () => {
      const res = await app.request('/api/path-traversal-guard/policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policy: {
            maxPathLength: 2048,
          },
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.policy.maxPathLength).toBe(2048);
    });
  });

  describe('POST /api/path-traversal-guard/simulate', () => {
    it('deve simular ataque de Directory Traversal e neutralizar com sucesso', async () => {
      const res = await app.request('/api/path-traversal-guard/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threatVector: PathThreatVector.RELATIVE_DOT_DOT_TRAVERSAL,
          category: ClinicalAttachmentCategory.ANAMNESIS_DOC,
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.threatBlocked).toBe(true);
      expect(json.incident).toBeDefined();
    });

    it('deve simular ataque com Null Byte Termination e desarmar extensão maliciosa', async () => {
      const res = await app.request('/api/path-traversal-guard/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threatVector: PathThreatVector.NULL_BYTE_TERMINATION,
          category: ClinicalAttachmentCategory.MEDICAL_EXAM,
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.threatBlocked).toBe(true);
    });

    it('deve simular ataque com Wrapper de URI e bloquear LFI', async () => {
      const res = await app.request('/api/path-traversal-guard/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threatVector: PathThreatVector.URI_SCHEME_WRAPPER,
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.threatBlocked).toBe(true);
    });
  });

  describe('POST /api/path-traversal-guard/verify-seal', () => {
    it('deve validar com sucesso um selo probatório WORM obtido da visão geral', async () => {
      const overviewRes = await app.request('/api/path-traversal-guard/overview');
      const overviewJson = await overviewRes.json();
      const sampleSeal = overviewJson.overview.recentSealsSample[0];

      const res = await app.request('/api/path-traversal-guard/verify-seal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sealToken: sampleSeal }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.isValid).toBe(true);
    });
  });
});
