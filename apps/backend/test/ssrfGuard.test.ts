import { describe, it, expect } from 'bun:test';
import { app } from '../src/index';
import {
  SsrfAttackCategory,
  SsrfDefensePolicy,
  SsrfSeverityLevel,
  type SsrfOverviewResponse,
  type SimulateSsrfResponse,
  type ValidateWebhookUrlResponse,
  type VerifySsrfSealResponse
} from '@terapiainfoco/shared';
import { adminRequest } from './helpers/adminRequest';

describe('SSRF & DNS Rebinding Protection Guard API (OWASP API8:2023 & ASVS v4.0)', () => {
  it('GET /api/ssrf-guard/overview deve retornar métricas, conectores e catálogo de proteção', async () => {
    const res = await adminRequest('/api/ssrf-guard/overview');
    expect(res.status).toBe(200);

    const data = await res.json() as SsrfOverviewResponse;
    expect(data.success).toBe(true);
    expect(data.overview.metrics.totalUrlsInspected).toBeGreaterThan(0);
    expect(data.overview.metrics.totalAttacksBlocked).toBeGreaterThan(0);
    expect(data.overview.connectors.length).toBeGreaterThanOrEqual(4);
    expect(data.overview.recentIncidents.length).toBeGreaterThanOrEqual(1);

    const ehrConn = data.overview.connectors.find(c => c.id === 'CONN-EHR-01');
    expect(ehrConn).toBeDefined();
    expect(ehrConn?.pinnedIp).toBe('189.28.128.99');
  });

  describe('POST /api/ssrf-guard/simulate-ssrf', () => {
    it('deve aprovar webhook legítimo público com emissão de selo probatório', async () => {
      const res = await adminRequest('/api/ssrf-guard/simulate-ssrf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://webhook.notary-icp.gov.br/api/tsa-notification'
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json() as SimulateSsrfResponse;
      expect(data.success).toBe(true);
      expect(data.inspection.isSafe).toBe(true);
      expect(data.inspection.detectedThreats.length).toBe(0);
      expect(data.proofSeal).toBeDefined();
      expect(data.proofSeal?.token).toMatch(/^SSRF-SEAL-v1-/);
    });

    it('deve bloquear tentativa de extração de Cloud Metadata (169.254.169.254) e registrar incidente', async () => {
      const res = await adminRequest('/api/ssrf-guard/simulate-ssrf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'http://169.254.169.254/latest/meta-data/security-credentials/'
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json() as SimulateSsrfResponse;
      expect(data.success).toBe(true);
      expect(data.inspection.isSafe).toBe(false);
      expect(data.inspection.detectedThreats).toContain(SsrfAttackCategory.CLOUD_METADATA_EXFILTRATION);
      expect(data.incident).toBeDefined();
      expect(data.incident?.blocked).toBe(true);
      expect(data.incident?.severity).toBe(SsrfSeverityLevel.CRITICAL);
    });

    it('deve decodificar e bloquear ataque com IP decimal ofuscado (2130706433 -> 127.0.0.1)', async () => {
      const res = await adminRequest('/api/ssrf-guard/simulate-ssrf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'http://2130706433/admin-console'
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json() as SimulateSsrfResponse;
      expect(data.inspection.isSafe).toBe(false);
      expect(data.inspection.detectedThreats).toContain(SsrfAttackCategory.OBFUSCATED_IP_ENCODING);
      expect(data.inspection.detectedThreats).toContain(SsrfAttackCategory.INTERNAL_LOOPBACK_PROBING);
    });

    it('deve interceptar simulação de DNS Rebinding e bloquear requisição', async () => {
      const res = await adminRequest('/api/ssrf-guard/simulate-ssrf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://rebinding-poc.attacker.io/webhook',
          simulateDnsRebinding: true
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json() as SimulateSsrfResponse;
      expect(data.inspection.isSafe).toBe(false);
      expect(data.inspection.dnsRebindingRisk).toBe(true);
      expect(data.inspection.detectedThreats).toContain(SsrfAttackCategory.DNS_REBINDING_MANIPULATION);
    });

    it('deve retornar 400 se a URL não for enviada', async () => {
      const res = await adminRequest('/api/ssrf-guard/simulate-ssrf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/ssrf-guard/validate-url', () => {
    it('deve validar e aprovar URL de webhook segura com código HTTP 200', async () => {
      const res = await adminRequest('/api/ssrf-guard/validate-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://api.terapiainfoco.com.br/webhook/billing',
          connectorId: 'CONN-PAY-01'
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json() as ValidateWebhookUrlResponse;
      expect(data.success).toBe(true);
      expect(data.inspection.isSafe).toBe(true);
      expect(data.proofSeal).toBeDefined();
    });

    it('deve rejeitar com HTTP 403 Forbidden se a URL for privada ou apontar para loopback', async () => {
      const res = await adminRequest('/api/ssrf-guard/validate-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'http://192.168.1.100/admin'
        })
      });

      expect(res.status).toBe(403);
      const data = await res.json() as ValidateWebhookUrlResponse;
      expect(data.success).toBe(false);
      expect(data.inspection.isSafe).toBe(false);
      expect(data.inspection.detectedThreats).toContain(SsrfAttackCategory.PRIVATE_SUBNET_RECONNAISSANCE);
    });
  });

  describe('POST /api/ssrf-guard/verify-seal', () => {
    it('deve verificar com sucesso um selo probatório emitido', async () => {
      // 1. Simula requisição para emitir selo
      const simRes = await adminRequest('/api/ssrf-guard/simulate-ssrf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://api.terapiainfoco.com.br/health-events'
        })
      });
      const simData = await simRes.json() as SimulateSsrfResponse;
      const token = simData.proofSeal!.token;

      // 2. Valida o selo
      const verifyRes = await adminRequest('/api/ssrf-guard/verify-seal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proofSealToken: token })
      });

      expect(verifyRes.status).toBe(200);
      const verifyData = await verifyRes.json() as VerifySsrfSealResponse;
      expect(verifyData.success).toBe(true);
      expect(verifyData.isValid).toBe(true);
      expect(verifyData.seal?.token).toBe(token);
    });

    it('deve retornar 422 para token de selo inexistente', async () => {
      const res = await adminRequest('/api/ssrf-guard/verify-seal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proofSealToken: 'SSRF-SEAL-v1-invalid-nonexistent' })
      });
      expect(res.status).toBe(422);
      const data = await res.json() as VerifySsrfSealResponse;
      expect(data.isValid).toBe(false);
    });
  });

  describe('GET /api/ssrf-guard/incidents', () => {
    it('deve retornar o feed ordenado de incidentes SSRF interceptados', async () => {
      const res = await adminRequest('/api/ssrf-guard/incidents');
      expect(res.status).toBe(200);

      const data = await res.json() as { success: boolean; incidents: any[] };
      expect(data.success).toBe(true);
      expect(Array.isArray(data.incidents)).toBe(true);
      expect(data.incidents.length).toBeGreaterThanOrEqual(1);
    });
  });
});
