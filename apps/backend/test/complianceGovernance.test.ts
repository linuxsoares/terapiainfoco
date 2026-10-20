import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { complianceGovernanceService } from '../src/services/complianceGovernanceService';
import { UserRole } from '@terapiainfoco/shared';
import { AuditAction, ComplianceFramework, ComplianceControlStatus } from '@terapiainfoco/shared';

describe('Governança Executiva & Compliance Package Forense (RFC-001 §4.4, §5.2)', () => {
  let adminToken: string;
  let secretaryToken: string;

  beforeEach(async () => {
    db.clear();
    globalRateLimitStore.reset();
    complianceGovernanceService.reset();

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

  it('deve retornar o panorama executivo de governança com os 4 frameworks e métricas forenses', async () => {
    const res = await app.request('/api/audit/governance/overview', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Score com dados reais: seed sem 2FA, sem backups e sem exportador OTLP não é 100%
    expect(body.globalScorePercentage).toBeLessThan(100);
    expect(body.controls).toHaveLength(17);
    const control = (id: string) => body.controls.find((c: any) => c.id === id);
    expect(control('CTRL-SOC2-02').status).toBe(ComplianceControlStatus.NON_COMPLIANT);
    expect(control('CTRL-SOC2-03').status).toBe(ComplianceControlStatus.NON_COMPLIANT);
    expect(body.frameworks).toHaveLength(4);

    const frameworkIds = body.frameworks.map((f: any) => f.framework);
    expect(frameworkIds).toContain(ComplianceFramework.LGPD);
    expect(frameworkIds).toContain(ComplianceFramework.CFP);
    expect(frameworkIds).toContain(ComplianceFramework.ICP_BRASIL);
    expect(frameworkIds).toContain(ComplianceFramework.SOC2_ISO27001);

    expect(body.forensicMetrics).toBeDefined();
    expect(body.forensicMetrics.wormChainIntegrity).toBe('INTACT');
    expect(body.forensicMetrics.activeKmsKeyVersion).toBeGreaterThanOrEqual(1);
    // Nenhum pacote fictício é emitido no boot
    expect(body.lastPackage).toBeUndefined();
  });

  it('deve gerar um novo Pacote Executivo de Conformidade com Digest Canônico SHA-256 e registrar no WORM', async () => {
    const res = await app.request('/api/audit/governance/package/generate', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        organization: 'Clínica Psicológica TerapiaInFoco Ltda.',
        dpoName: 'Dra. Beatriz Santos',
        technicalResponsibleCrp: 'CRP 06/142857-SP'
      })
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.package).toBeDefined();

    const pkg = body.package;
    expect(pkg.id).toBeDefined();
    expect(pkg.canonicalDigest).toBeDefined();
    expect(pkg.canonicalDigest).toHaveLength(64);
    expect(pkg.tamperEvidentSeal).toContain('SHA256:');
    expect(pkg.technicalResponsibleCrp).toBe('CRP 06/142857-SP');
    expect(pkg.controls).toHaveLength(17);
    expect(pkg.organization).toBe('Clínica Psicológica TerapiaInFoco Ltda.');

    // Valida registro na trilha WORM
    const wormLogs = db.auditLogs.filter(
      (l) => l.action === AuditAction.EXECUTIVE_COMPLIANCE_GENERATED
    );
    expect(wormLogs.length).toBeGreaterThanOrEqual(1);
    expect(wormLogs[0].resourceId).toBe(pkg.id);
  });

  it('deve aplicar chancela formal do DPO (DPO Sign-Off) e registrar no WORM', async () => {
    // 1. Gera o pacote
    const genRes = await app.request('/api/audit/governance/package/generate', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        dpoName: 'Dra. Beatriz Santos',
        technicalResponsibleCrp: 'CRP 06/142857-SP'
      })
    });
    const genBody = await genRes.json();
    const packageId = genBody.package.id;

    // 2. Aplica DPO Sign-Off
    const signRes = await app.request('/api/audit/governance/package/sign-off', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        packageId,
        dpoName: 'Dra. Beatriz Santos (DPO Titular)',
        statement: 'Atesto conformidade formal e pericial com LGPD, CFP, ICP-Brasil e SOC2.'
      })
    });

    expect(signRes.status).toBe(200);
    const signBody = await signRes.json();
    expect(signBody.success).toBe(true);
    expect(signBody.package.dpoSignOff).toBeDefined();
    expect(signBody.package.dpoSignOff.signedBy).toBe('Dra. Beatriz Santos (DPO Titular)');
    expect(signBody.package.dpoSignOff.signatureDigest).toHaveLength(64);
    expect(signBody.package.dpoSignOff.statement).toContain('Atesto conformidade formal');

    // Valida registro na trilha WORM
    const wormLogs = db.auditLogs.filter((l) => l.action === AuditAction.DPO_SIGNOFF_APPLIED);
    expect(wormLogs.length).toBeGreaterThanOrEqual(1);
    expect(wormLogs[0].resourceId).toBe(packageId);
  });

  it('deve validar parâmetros obrigatórios no sign-off', async () => {
    const res = await app.request('/api/audit/governance/package/sign-off', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        packageId: ''
      })
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('Parâmetros inválidos');
  });

  it('deve exportar pacote forense com integridade validada e headers adequados', async () => {
    // 1. Gera pacote
    const genRes = await app.request('/api/audit/governance/package/generate', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        dpoName: 'Dra. Beatriz Santos',
        technicalResponsibleCrp: 'CRP 06/142857-SP'
      })
    });
    const genBody = await genRes.json();
    const pkgId = genBody.package.id;

    // 2. Download
    const dlRes = await app.request(`/api/audit/governance/package/download?packageId=${pkgId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(dlRes.status).toBe(200);
    expect(dlRes.headers.get('content-type')).toContain('application/json');
    expect(dlRes.headers.get('content-disposition')).toContain(
      `attachment; filename="terapiainfoco-compliance-package-${pkgId.slice(0, 8)}.json"`
    );
    expect(dlRes.headers.get('x-compliance-integrity-valid')).toBe('true');
    expect(dlRes.headers.get('x-compliance-digest-sha256')).toBe(genBody.package.canonicalDigest);

    const exportedPkg = await dlRes.json();
    expect(exportedPkg.id).toBe(pkgId);
    expect(exportedPkg.canonicalDigest).toBe(genBody.package.canonicalDigest);

    // Valida registro no WORM
    const exportLogs = db.auditLogs.filter(
      (l) => l.action === AuditAction.COMPLIANCE_PACKAGE_EXPORT
    );
    expect(exportLogs.length).toBeGreaterThanOrEqual(1);
  });

  it('exige DPO e CRP do responsável técnico na primeira emissão e reutiliza a identificação depois', async () => {
    const post = (body: object) => app.request('/api/audit/governance/package/generate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const missing = await post({ dpoName: 'Dra. Beatriz Santos' });
    expect(missing.status).toBe(400);
    expect((await missing.json() as any).error).toContain('CRP do responsável técnico');

    expect((await post({ dpoName: 'Dra. Beatriz Santos', technicalResponsibleCrp: 'CRP 05/111-RJ' })).status).toBe(201);
    const overview = await (await app.request('/api/audit/governance/overview', {
      headers: { Authorization: `Bearer ${adminToken}` }
    })).json() as any;
    expect(overview.identity.technicalResponsibleCrp).toBe('CRP 05/111-RJ');
    expect((await post({})).status).toBe(201);
  });

  it('controle de 2FA reflete a adoção real da equipe', async () => {
    const overview = async () => (await (await app.request('/api/audit/governance/overview', {
      headers: { Authorization: `Bearer ${adminToken}` }
    })).json()) as any;

    const before = await overview();
    for (const user of db.users.values()) {
      if (user.role !== UserRole.PACIENTE) user.twoFactorEnabled = true;
    }
    const after = await overview();
    expect(after.forensicMetrics.twoFactorAdoptionRate).toBe(100);
    expect(after.controls.find((c: any) => c.id === 'CTRL-SOC2-02').status).toBe(ComplianceControlStatus.COMPLIANT);
    expect(after.globalScorePercentage).toBeGreaterThan(before.globalScorePercentage);
  });

  it('download sem pacote emitido responde 404', async () => {
    const res = await app.request('/api/audit/governance/package/download', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(res.status).toBe(404);
  });

  it('deve rejeitar acesso não autenticado com HTTP 401', async () => {
    const res = await app.request('/api/audit/governance/overview', {
      method: 'GET',
      headers: {
        'X-Strict-Auth': 'true'
      }
    });

    expect(res.status).toBe(401);
  });

  it('deve rejeitar usuário sem permissão (recepção/secretária) com HTTP 403 Forbidden', async () => {
    const res = await app.request('/api/audit/governance/overview', {
      method: 'GET',
      headers: { Authorization: `Bearer ${secretaryToken}` }
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Acesso negado');
  });
});
