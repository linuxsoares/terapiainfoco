import { describe, it, expect, beforeAll } from 'bun:test';
import { app } from '../src/index';
import { UserRole } from '@terapiainfoco/shared';
import { authService } from '../src/services/authService';
import { db } from '../src/db/memoryDb';
import { SEED_ADMIN_ID } from './helpers/adminRequest';

const SEED_THERAPIST_ID = '00000000-0000-0000-0000-000000000001';

describe('Threat Intelligence & Dark Web Credential Breach Monitor API (RFC-001 §4.4, LGPD Art. 46/48)', () => {
  let adminToken: string;
  let psychologistToken: string;

  // Tokens emitidos direto: o login por HTTP dependia do rate limit de autenticação compartilhado entre arquivos
  beforeAll(async () => {
    psychologistToken = (await authService.issueTokens(db.users.get(SEED_THERAPIST_ID)!, '127.0.0.1')).accessToken;
    adminToken = (await authService.issueTokens(db.users.get(SEED_ADMIN_ID)!, '127.0.0.1')).accessToken;
  });

  it('POST /api/security/threat-intelligence/check deve consultar k-Anonymity e detectar vazamento sem vazar a senha', async () => {
    const res = await app.request('/api/security/threat-intelligence/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${psychologistToken}`
      },
      body: JSON.stringify({
        passwordSample: 'admin123'
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.result.matched).toBe(true);
    expect(body.result.breachCount).toBeGreaterThan(0);
    expect(body.result.zeroKnowledgePreserved).toBe(true);
  });

  it('POST /api/security/threat-intelligence/check deve retornar seguro para credencial não vazada', async () => {
    const res = await app.request('/api/security/threat-intelligence/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${psychologistToken}`
      },
      body: JSON.stringify({
        passwordSample: 'X9#zK9$vL2!mP8@wQ4_2026_Inviolavel'
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.result.matched).toBe(false);
    expect(body.result.breachCount).toBe(0);
  });

  it('POST /api/security/threat-intelligence/scan deve executar varredura na Dark Web e gerar alertas DPO', async () => {
    const res = await app.request('/api/security/threat-intelligence/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        scope: 'ALL_STAFF',
        simulateBreachDump: true
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.newIncidentsCount).toBeGreaterThan(0);
    expect(body.incidents.length).toBeGreaterThan(0);
    expect(body.alertsGenerated.length).toBeGreaterThan(0);

    const firstIncident = body.incidents[0];
    expect(firstIncident.probatoryWormDigest).toHaveLength(64);
    expect(firstIncident.userEmailMasked).toContain('***');
  });

  it('POST /api/security/threat-intelligence/contain deve revogar sessões compulsoriamente e conter incidente', async () => {
    // Primeiro dispara o scan para ter um incidente garantido
    const scanRes = await app.request('/api/security/threat-intelligence/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ simulateBreachDump: true })
    });
    const scanBody = await scanRes.json();
    const targetIncident = scanBody.incidents[0];

    const containRes = await app.request('/api/security/threat-intelligence/contain', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        incidentId: targetIncident.id,
        reason: 'Revogação preventiva compulsória de credencial detectada em botnet dump',
        forcePasswordReset: true
      })
    });

    expect(containRes.status).toBe(200);
    const containBody = await containRes.json();
    expect(containBody.success).toBe(true);
    expect(containBody.sessionsRevokedCount).toBeGreaterThan(0);
    expect(containBody.incident.containmentStatus).toBe('PENDING_PASSWORD_RESET');
  });

  it('POST /api/security/threat-intelligence/resolve deve permitir ao DPO documentar e encerrar o incidente', async () => {
    // Obtém incidente recente
    const overviewRes = await app.request('/api/security/threat-intelligence/overview', {
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    });
    const overviewBody = await overviewRes.json();
    const targetIncident = overviewBody.incidents[0];

    const resolveRes = await app.request('/api/security/threat-intelligence/resolve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        incidentId: targetIncident.id,
        resolutionNotes: 'Credencial redefinida com sucesso pelo titular; 2FA com Passkey ativado; sem indício de exfiltração de prontuário.',
        reportedToAnpd: true,
        anpdProtocolNumber: 'ANPD-2026-INC-89412'
      })
    });

    expect(resolveRes.status).toBe(200);
    const resolveBody = await resolveRes.json();
    expect(resolveBody.success).toBe(true);
    expect(resolveBody.incident.containmentStatus).toBe('RESOLVED');
  });

  it('GET /api/security/threat-intelligence/overview deve retornar lista de incidentes, alertas e métricas consolidadas', async () => {
    const res = await app.request('/api/security/threat-intelligence/overview', {
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.incidents)).toBe(true);
    expect(Array.isArray(body.alerts)).toBe(true);
    expect(body.metrics.monitoredAccountsCount).toBeGreaterThan(0);
    expect(body.metrics.darkWebFeedsActive).toBe(4);
  });
});
