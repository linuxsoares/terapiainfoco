import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { AntiAutomationTarpitService } from '../src/services/antiAutomationTarpitService';
import { ScraperThreatCategory, TarpitDefenseStatus } from '@terapiainfoco/shared';
import { adminRequest } from './helpers/adminRequest';

describe('Backend API — Proteção Anti-Automação, Honeypot & Tarpit (OWASP OAT-011 / OAT-020 & RFC-001 §4.4)', () => {
  beforeEach(() => {
    AntiAutomationTarpitService.getInstance().seedDemoData();
  });

  it('GET /api/anti-automation/overview — deve retornar governança executiva de anti-automação e métricas', async () => {
    const res = await adminRequest('/api/anti-automation/overview', {
      method: 'GET'
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.overview).toBeDefined();
    expect(data.overview.totalTrappedCrawlersCount).toBeGreaterThanOrEqual(84);
    expect(data.overview.totalHoneypotsTriggered).toBeGreaterThanOrEqual(217);
    expect(data.overview.bandwidthSavedKb).toBeGreaterThan(0);
    expect(Array.isArray(data.overview.recentIncidents)).toBe(true);
    expect(Array.isArray(data.overview.activeTraps)).toBe(true);
  });

  it('POST /api/anti-automation/trap/create — deve gerar armadilha Honeypot e snippet HTML invisível', async () => {
    const res = await adminRequest('/api/anti-automation/trap/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routePath: '/api/v1/patient-confidential-files-dump',
        ttlSeconds: 7200
      })
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.trap.trapId).toBeDefined();
    expect(data.trap.token.startsWith('hp_trap_')).toBe(true);
    expect(data.invisibleHtmlSnippet).toContain('display:none !important');
    expect(data.invisibleHtmlSnippet).toContain(data.trap.token);
  });

  it('GET /api/anti-automation/trap/:token — deve acionar armadilha, calcular tarpit e emitir selo WORM', async () => {
    // Cria armadilha
    const createRes = await adminRequest('/api/anti-automation/trap/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routePath: '/api/internal/test-trap',
        ttlSeconds: 3600
      })
    });
    const createData = await createRes.json();
    const token = createData.trap.token;

    // Crawler acessa a armadilha com headers de bot
    const trapRes = await adminRequest(`/api/anti-automation/trap/${token}`, {
      method: 'GET',
      headers: {
        'x-forwarded-for': '198.51.100.77',
        'user-agent': 'python-requests/2.28.1'
      }
    });

    expect(trapRes.status).toBe(200);
    const trapData = await trapRes.json();
    expect(trapData.success).toBe(true);
    expect(trapData.tarpitDelayAppliedMs).toBeGreaterThan(0);
    expect(trapData.defenseSeal.startsWith('tarpit_proof_v1_')).toBe(true);
    expect(trapData.incident.ipAddress).toBe('198.51.100.77');
    expect(trapData.incident.detectedVectors).toContain('HONEYPOT_TRAP_TRIGGERED');
  });

  it('POST /api/anti-automation/simulate-scraping — deve conter rajada de raspagem e colocar IP em quarentena', async () => {
    const res = await adminRequest('/api/anti-automation/simulate-scraping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ipAddress: '198.51.100.66',
        threatCategory: ScraperThreatCategory.DATA_SCRAPING_OAT011,
        requestsBurstCount: 20,
        simulateHoneypotHit: true
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.attackContained).toBe(true);
    expect(data.tarpitDelayMs).toBeGreaterThanOrEqual(15000);
    expect(data.incident.status).toBe(TarpitDefenseStatus.ISOLATED);
    expect(data.defenseSeal.startsWith('tarpit_proof_v1_')).toBe(true);
  });

  it('POST /api/anti-automation/release-ip — deve revogar quarentena com parecer DPO gravado no WORM', async () => {
    const res = await adminRequest('/api/anti-automation/release-ip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ipAddress: '198.51.100.81',
        reason: 'IP corporativo da clínica médica liberado após reconfiguração de crawler interno de auditoria'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.ipAddress).toBe('198.51.100.81');

    // Valida que o status do incidente no overview passou para RELEASED
    const overviewRes = await adminRequest('/api/anti-automation/overview', { method: 'GET' });
    const overviewData = await overviewRes.json();
    const incident = overviewData.overview.recentIncidents.find((i: any) => i.ipAddress === '198.51.100.81');
    expect(incident.status).toBe(TarpitDefenseStatus.RELEASED);
  });

  it('POST /api/anti-automation/verify-seal — deve atestar fé pública e integridade matemática do selo WORM', async () => {
    // Obtém selo válido da demonstração
    const overviewRes = await adminRequest('/api/anti-automation/overview', { method: 'GET' });
    const overviewData = await overviewRes.json();
    const seal = overviewData.overview.recentIncidents[0].proofSeal;

    const res = await adminRequest('/api/anti-automation/verify-seal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seal })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.verification.isValid).toBe(true);
    expect(data.verification.details).toContain('fé pública');
  });

  it('POST /api/anti-automation/release-ip — deve retornar 400 se o IP não existir', async () => {
    const res = await adminRequest('/api/anti-automation/release-ip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ipAddress: '10.255.255.255',
        reason: 'Teste inexistente'
      })
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
  });
});
