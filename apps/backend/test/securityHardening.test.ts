import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { honeypotService } from '../src/services/honeypotService';
import { AuditAction, AuditResourceType } from '@terapiainfoco/shared';

describe('HTTP Security Hardening, CSP/HSTS & Honeypot Anti-Probe (RFC-001 §4.4, §5.2)', () => {
  let adminToken: string;
  let secretaryToken: string;

  beforeEach(async () => {
    db.clear();
    await globalRateLimitStore.reset();
    honeypotService.clear();

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

  it('deve injetar todos os 9 cabeçalhos de segurança recomendados pela OWASP em qualquer resposta HTTP', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);

    // 1. Content-Security-Policy
    const csp = res.headers.get('content-security-policy');
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");

    // 2. Strict-Transport-Security (HSTS)
    const hsts = res.headers.get('strict-transport-security');
    expect(hsts).toBeDefined();
    expect(hsts).toContain('max-age=31536000');
    expect(hsts).toContain('includeSubDomains');

    // 3. X-Content-Type-Options
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');

    // 4. X-Frame-Options
    expect(res.headers.get('x-frame-options')).toBe('DENY');

    // 5. X-XSS-Protection
    expect(res.headers.get('x-xss-protection')).toBe('0');

    // 6. Referrer-Policy
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');

    // 7. Permissions-Policy
    const perm = res.headers.get('permissions-policy');
    expect(perm).toContain('camera=(self)');
    expect(perm).toContain('microphone=(self)');

    // 8. Cross-Origin-Opener-Policy
    expect(res.headers.get('cross-origin-opener-policy')).toBe('same-origin');

    // 9. Cross-Origin-Resource-Policy
    expect(res.headers.get('cross-origin-resource-policy')).toBe('same-origin');
  });

  it('deve interceptar rota de probe malicioso com Honeypot (HTTP 418) e registrar no WORM', async () => {
    const attackerIp = '198.51.100.42';
    const res = await app.request('/.env', {
      method: 'GET',
      headers: {
        'x-forwarded-for': attackerIp,
        'user-agent': 'Nikto/2.1.6 Vulnerability Scanner'
      }
    });

    expect(res.status).toBe(418);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('HONEYPOT_TRAPPED');
    expect(body.error).toContain('Alerta de Segurança');
    expect(body.probeId).toBeDefined();

    // Valida que foi registrado na trilha WORM
    const wormLogs = db.auditLogs.filter(
      (l) => l.action === AuditAction.HONEYPOT_PROBE_BLOCKED && l.resourceType === AuditResourceType.HONEYPOT
    );
    expect(wormLogs.length).toBeGreaterThanOrEqual(1);
    expect(wormLogs[0].ipAddress).toBe(attackerIp);
  });

  it('deve aplicar quarentena e bloquear requisições subsequentes do IP invasor com HTTP 403', async () => {
    const attackerIp = '203.0.113.88';

    // 1. Invasor dispara o Honeypot
    await app.request('/wp-admin/setup.php', {
      method: 'GET',
      headers: { 'x-forwarded-for': attackerIp }
    });

    // 2. Invasor tenta acessar rota legítima normal
    const legitRes = await app.request('/health', {
      method: 'GET',
      headers: { 'x-forwarded-for': attackerIp }
    });

    expect(legitRes.status).toBe(403);
    const body = await legitRes.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('IP_QUARANTINED');
    expect(body.error).toContain('quarentena');
  });

  it('deve permitir que o administrador remova o IP da quarentena (Unban) e auditar no WORM', async () => {
    const attackerIp = '192.0.2.77';

    // 1. IP cai no Honeypot
    await app.request('/.git/config', {
      method: 'GET',
      headers: { 'x-forwarded-for': attackerIp }
    });
    expect(honeypotService.isIpBanned(attackerIp)).toBe(true);

    // 2. Admin solicita unban via API
    const unbanRes = await app.request('/api/security/hardening/honeypot/unban', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ipAddress: attackerIp,
        reason: 'Falso positivo verificado pelo SOC'
      })
    });

    expect(unbanRes.status).toBe(200);
    const unbanBody = await unbanRes.json();
    expect(unbanBody.success).toBe(true);
    expect(unbanBody.ipAddress).toBe(attackerIp);

    // 3. IP liberado agora consegue acessar normalmente
    expect(honeypotService.isIpBanned(attackerIp)).toBe(false);
    const legitRes = await app.request('/health', {
      method: 'GET',
      headers: { 'x-forwarded-for': attackerIp }
    });
    expect(legitRes.status).toBe(200);

    // 4. Valida registro do unban no WORM
    const unbanLogs = db.auditLogs.filter((l) => l.action === AuditAction.HONEYPOT_IP_UNBANNED);
    expect(unbanLogs.length).toBeGreaterThanOrEqual(1);
  });

  it('deve consultar o panorama de hardening em GET /api/security/hardening/overview', async () => {
    // Registra um probe de teste
    honeypotService.trapProbe({
      ipAddress: '10.0.0.50',
      path: '/actuator/env',
      method: 'GET',
      userAgent: 'Test-Scanner'
    });

    const res = await app.request('/api/security/hardening/overview', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.metrics).toBeDefined();
    expect(body.metrics.totalProbesTrapped).toBeGreaterThanOrEqual(1);
    expect(body.metrics.headersEvaluation.scorePercentage).toBe(100);
    expect(body.metrics.headersEvaluation.grade).toBe('A+');
    expect(body.activeBannedIps.length).toBeGreaterThanOrEqual(1);
    expect(body.recentProbes.length).toBeGreaterThanOrEqual(1);
  });

  it('deve verificar e avaliar cabeçalhos em GET /api/security/hardening/headers/verify', async () => {
    const res = await app.request('/api/security/hardening/headers/verify', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.evaluation.scorePercentage).toBe(100);
    expect(body.evaluation.checks).toHaveLength(9);
  });

  it('deve aplicar RBAC estrito e rejeitar usuário não-admin com HTTP 403 Forbidden', async () => {
    const res = await app.request('/api/security/hardening/overview', {
      method: 'GET',
      headers: { Authorization: `Bearer ${secretaryToken}` }
    });

    expect(res.status).toBe(403);
  });
});
