import { describe, it, expect } from 'bun:test';
import { app } from '../src/index';
import {
  GraphQLThreatCategory,
  GraphQLValidationAction,
  UserRole,
} from '@terapiainfoco/shared';
import { adminRequest } from './helpers/adminRequest';

describe('Backend API Integration - GraphQL Query Guard (OWASP ASVS v4.0 V5.1)', () => {
  describe('GET /api/graphql-guard/overview', () => {
    it('deve retornar telemetria completa, métricas, políticas e incidentes', async () => {
      const res = await adminRequest('/api/graphql-guard/overview');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.overview).toBeDefined();
      expect(data.overview.metrics.totalQueriesInspected).toBeGreaterThan(0);
      expect(data.overview.policy.maxAllowedCost).toBeGreaterThan(0);
      expect(data.overview.recentIncidents.length).toBeGreaterThan(0);
      expect(data.overview.schemasSample.length).toBe(3);
    });
  });

  describe('POST /api/graphql-guard/inspect', () => {
    it('deve autorizar e emitir selo WORM para consulta médica legítima e rasa', async () => {
      const res = await adminRequest('/api/graphql-guard/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: '{ patient(id: "pat_01") { id nameMasked clinicalRecords(limit: 5) { sessionDate cid11 } } }',
          operationName: 'PatientConsultation',
          userRole: UserRole.PSICOLOGO_TITULAR,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.inspection.allowed).toBe(true);
      expect(data.inspection.computedCost).toBeLessThanOrEqual(250);
      expect(data.inspection.seal.sealToken).toMatch(/^gql_cost_seal_/);
    });

    it('deve retornar 400 se o campo query não for informado', async () => {
      const res = await adminRequest('/api/graphql-guard/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.message).toContain('obrigatória');
    });

    it('deve bloquear tentativa de introspecção maliciosa (__schema) para usuário comum', async () => {
      const res = await adminRequest('/api/graphql-guard/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'query Recon { __schema { types { name } } }',
          userRole: UserRole.PSICOLOGO_TITULAR,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.inspection.allowed).toBe(false);
      expect(data.inspection.introspectionDetected).toBe(true);
      expect(data.inspection.threats.some((t: any) => t.category === GraphQLThreatCategory.SCHEMA_INTROSPECTION)).toBe(true);
    });

    it('deve bloquear tentativa de ataque DoS por profundidade excessiva (Circular Depth)', async () => {
      const deepQuery = `
        query DeepDoS {
          a { b { c { d { e { f { g { h { i { j { id } } } } } } } } } }
        }
      `;
      const res = await adminRequest('/api/graphql-guard/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: deepQuery,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.inspection.allowed).toBe(false);
      expect(data.inspection.computedDepth).toBeGreaterThan(6);
      expect(data.inspection.threats.some((t: any) => t.category === GraphQLThreatCategory.CIRCULAR_DEPTH_DOS)).toBe(true);
    });

    it('deve bloquear ataque de bomba de custo computacional (Query Cost Bomb)', async () => {
      const costBombQuery = `
        query Bomb {
          patients(limit: 50) {
            clinicalRecords(limit: 50) {
              id
              notes
            }
          }
          appointments(limit: 50) {
            id
          }
        }
      `;
      const res = await adminRequest('/api/graphql-guard/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: costBombQuery,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.inspection.allowed).toBe(false);
      expect(data.inspection.threats.some((t: any) => t.category === GraphQLThreatCategory.COMPLEXITY_COST_EXHAUSTION)).toBe(true);
    });

    it('deve bloquear mutações em lote (Batch Mutation Flooding)', async () => {
      const batchQuery = `
        mutation Flood {
          m1: sign(id: "1") { id }
          m2: sign(id: "2") { id }
          m3: sign(id: "3") { id }
          m4: sign(id: "4") { id }
          m5: sign(id: "5") { id }
        }
      `;
      const res = await adminRequest('/api/graphql-guard/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: batchQuery,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.inspection.threats.some((t: any) => t.category === GraphQLThreatCategory.BATCH_MUTATION_FLOODING)).toBe(true);
    });
  });

  describe('POST /api/graphql-guard/policy', () => {
    it('deve atualizar diretrizes de custo e profundidade da política ativa', async () => {
      const res = await adminRequest('/api/graphql-guard/policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policy: {
            maxAllowedCost: 350,
            maxAllowedDepth: 8,
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.policy.maxAllowedCost).toBe(350);
      expect(data.policy.maxAllowedDepth).toBe(8);
    });

    it('deve retornar 400 se o corpo da política não for fornecido', async () => {
      const res = await adminRequest('/api/graphql-guard/policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
    });
  });

  describe('POST /api/graphql-guard/simulate', () => {
    it('deve simular ataque de introspecção adversarial e retornar bloqueio com certidão', async () => {
      const res = await adminRequest('/api/graphql-guard/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threatCategory: GraphQLThreatCategory.SCHEMA_INTROSPECTION,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.threatBlocked).toBe(true);
      expect(data.incident).toBeDefined();
      expect(data.inspection.seal).toBeDefined();
    });

    it('deve retornar 400 se a categoria da ameaça não for fornecida', async () => {
      const res = await adminRequest('/api/graphql-guard/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/graphql-guard/verify-seal', () => {
    it('deve verificar autenticidade de selo emitido na inspeção', async () => {
      // 1. Gera selo através de inspeção legítima
      const inspectRes = await adminRequest('/api/graphql-guard/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: '{ patient(id: "pat_valid") { id } }',
        }),
      });
      const inspectData = await inspectRes.json();
      const seal = inspectData.inspection.seal;

      // 2. Valida o selo via endpoint
      const verifyRes = await adminRequest('/api/graphql-guard/verify-seal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sealToken: seal,
        }),
      });

      expect(verifyRes.status).toBe(200);
      const verifyData = await verifyRes.json();
      expect(verifyData.success).toBe(true);
      expect(verifyData.isValid).toBe(true);
    });

    it('deve retornar 400 se o sealToken não for enviado', async () => {
      const res = await adminRequest('/api/graphql-guard/verify-seal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/graphql-guard/schemas', () => {
    it('deve listar os 3 schemas homologados da plataforma', async () => {
      const res = await adminRequest('/api/graphql-guard/schemas');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.schemas.length).toBe(3);
      expect(data.schemas.some((s: any) => s.id === 'clinical-records-schema')).toBe(true);
    });
  });
});
