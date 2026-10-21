import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { wafService } from '../src/services/wafService';
import {
  AuditAction,
  AuditResourceType,
  WafAttackType,
  WafMode
} from '@terapiainfoco/shared';
import { resetDb } from './helpers/db';

describe('Web Application Firewall (WAF) Integration & Heuristic Attack Detection (RFC-001 §4.4, §5.2)', () => {
  let therapistToken: string;
  let adminToken: string;
  let secretaryToken: string;

  beforeEach(async () => {
    await resetDb();
    await globalRateLimitStore.reset();
    wafService.resetForTesting();

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

  it('deve permitir requisições com dados legítimos sem interceptação', async () => {
    const res = await app.request('/api/patients', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        name: 'Maria Clara da Silva',
        email: 'maria.clara@gmail.com',
        phone: '11987654321',
        birthDate: '1990-05-15',
        cpf: '123.456.789-00'
      })
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('deve bloquear tentativa de SQL Injection em payload POST com HTTP 403 e gravar no ledger WORM', async () => {
    const res = await app.request('/api/patients', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        name: "Maria' UNION SELECT username, password FROM users--",
        email: 'maria.attack@gmail.com',
        phone: '11987654321',
        birthDate: '1990-05-15',
        cpf: '123.456.789-00'
      })
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('WAF_ATTACK_DETECTED');
    expect(body.attackType).toBe(WafAttackType.SQL_INJECTION);
    expect(body.threatScore).toBeGreaterThanOrEqual(95);
    expect(body.incidentId).toBeDefined();

    // Valida que o incidente foi gravado na trilha de auditoria WORM imutável
    const wormLogs = db.auditLogs.filter(
      l => l.action === AuditAction.WAF_ATTACK_BLOCKED && l.resourceType === AuditResourceType.WAF
    );
    expect(wormLogs.length).toBeGreaterThan(0);
    expect(wormLogs[0].resourceId).toBe(body.incidentId);
  });

  it('deve bloquear tentativa de XSS em Query String com HTTP 403', async () => {
    const res = await app.request('/api/patients?search=<script>alert(1)</script>', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${therapistToken}`
      }
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('WAF_ATTACK_DETECTED');
    expect(body.attackType).toBe(WafAttackType.CROSS_SITE_SCRIPTING);
    expect(body.threatScore).toBeGreaterThanOrEqual(95);
  });

  it('deve bloquear tentativa de Path Traversal em payload POST', async () => {
    const res = await app.request('/api/documents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        patientId: 'pat-1',
        template: '../../../../etc/passwd',
        title: 'Relatório Psicológico'
      })
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('WAF_ATTACK_DETECTED');
    expect(body.attackType).toBe(WafAttackType.PATH_TRAVERSAL);
  });

  it('deve permitir inspecionar payload arbitrário via POST /api/security/waf/inspect', async () => {
    const res = await app.request('/api/security/waf/inspect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        payload: {
          testField: "<img src=x onerror=alert('xss') />"
        }
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.blocked).toBe(true);
    expect(body.threatScore).toBeGreaterThanOrEqual(85);
    expect(body.inspection.matchedRules.length).toBeGreaterThan(0);
  });

  it('deve permitir que ADMIN altere modo para MONITOR_ONLY e registre no WORM', async () => {
    // 1. Atualizar modo para MONITOR_ONLY
    const modeRes = await app.request('/api/security/waf/mode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        mode: WafMode.MONITOR_ONLY,
        blockThreshold: 80
      })
    });

    expect(modeRes.status).toBe(200);
    const modeBody = await modeRes.json();
    expect(modeBody.mode).toBe(WafMode.MONITOR_ONLY);
    expect(modeBody.blockThreshold).toBe(80);

    // Valida auditoria WORM da alteração de regra
    const wormLogs = db.auditLogs.filter(l => l.action === AuditAction.WAF_RULE_UPDATED);
    expect(wormLogs.length).toBeGreaterThan(0);

    // 2. Em modo MONITOR_ONLY, requisições com ataque devem ser sinalizadas mas NÃO bloqueadas com 403
    const attackRes = await app.request('/api/patients', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        name: "Maria' OR '1'='1",
        email: 'maria.test@gmail.com',
        phone: '11987654321',
        birthDate: '1990-05-15',
        cpf: '123.456.789-00'
      })
    });

    // Como é MONITOR_ONLY, não retorna 403 do WAF (criação prossegue para 201)
    expect(attackRes.status).toBe(201);

    // E o incidente foi registrado com status FLAGGED
    const overviewRes = await app.request('/api/security/waf/overview', {
      headers: { Authorization: `Bearer ${therapistToken}` }
    });
    const overview = await overviewRes.json();
    expect(overview.recentIncidents[0].status).toBe('FLAGGED');
  });

  it('deve bloquear recepcionista de acessar rotas de configuração do WAF (403 RBAC)', async () => {
    const res = await app.request('/api/security/waf/mode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secretaryToken}`
      },
      body: JSON.stringify({
        mode: WafMode.DISABLED
      })
    });

    expect(res.status).toBe(403);
  });
});
