import { describe, expect, it, beforeEach } from 'bun:test';
import { app } from '../src';
import { db } from '../src/db/memoryDb';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { AuditService } from '../src/services/auditService';
import { AuditAction, AuditResourceType } from '@terapiainfoco/shared';

describe('Auditoria Externa, Hash-Chain WORM & Relatório DPO/CFP (RFC-001 Opção H)', () => {
  let therapistToken: string;
  let adminToken: string;
  let secretaryToken: string;

  beforeEach(async () => {
    db.clear();
    globalRateLimitStore.reset();

    // 1. Login com psicóloga titular
    const loginTherapist = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'psicologo@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    therapistToken = (await loginTherapist.json()).accessToken;

    // 2. Login com administrador
    const loginAdmin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    adminToken = (await loginAdmin.json()).accessToken;

    // 3. Login com secretária/recepção
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

  it('deve encadear criptograficamente os logs em hash-chain WORM inviolável e validar integridade', async () => {
    // 1. Gera múltiplos logs na trilha
    AuditService.log({
      actorId: 'therapist-001',
      resourceType: AuditResourceType.PATIENT,
      resourceId: 'patient-001',
      action: AuditAction.CREATE,
      ipAddress: '10.0.0.1'
    });

    AuditService.log({
      actorId: 'therapist-001',
      resourceType: AuditResourceType.CLINICAL_RECORD,
      resourceId: 'record-001',
      action: AuditAction.SIGN_RECORD,
      ipAddress: '10.0.0.1'
    });

    AuditService.log({
      actorId: 'therapist-001',
      resourceType: AuditResourceType.PATIENT,
      resourceId: 'patient-001',
      action: AuditAction.DECRYPT_READ,
      ipAddress: '10.0.0.1'
    });

    // 2. Confere estrutura da cadeia no banco
    expect(db.auditLogs.length).toBeGreaterThanOrEqual(3);
    const [log1, log2, log3] = db.auditLogs.slice(-3);

    expect(log1.sequenceNumber).toBeDefined();
    expect(log2.sequenceNumber).toBe(log1.sequenceNumber! + 1);
    expect(log3.sequenceNumber).toBe(log2.sequenceNumber! + 1);

    expect(log2.previousHash).toBe(log1.hash);
    expect(log3.previousHash).toBe(log2.hash);

    // 3. Validação via endpoint /api/audit/verify-chain
    const verifyRes = await app.request('/api/audit/verify-chain', {
      headers: { Authorization: `Bearer ${therapistToken}` }
    });

    expect(verifyRes.status).toBe(200);
    const result = await verifyRes.json();

    expect(result.isValid).toBe(true);
    expect(result.totalEntries).toBeGreaterThanOrEqual(3);
    expect(result.genesisHash).toBe('0'.repeat(64));
    expect(result.latestHash).toBe(db.auditLogs[db.auditLogs.length - 1].hash);
    expect(result.message).toContain('100% íntegra');
  });

  it('deve detectar adulteração de dados em qualquer bloco da hash-chain (Tamper-Evidence)', async () => {
    // 1. Cria cadeia válida de 3 blocos
    AuditService.log({
      actorId: 'user-001',
      resourceType: AuditResourceType.SECURITY,
      resourceId: 'sec-001',
      action: AuditAction.AUTH_LOGIN,
      ipAddress: '192.168.1.1'
    });
    AuditService.log({
      actorId: 'user-001',
      resourceType: AuditResourceType.PATIENT,
      resourceId: 'patient-002',
      action: AuditAction.DECRYPT_READ,
      ipAddress: '192.168.1.1'
    });
    AuditService.log({
      actorId: 'user-001',
      resourceType: AuditResourceType.DOCUMENT,
      resourceId: 'doc-001',
      action: AuditAction.CREATE,
      ipAddress: '192.168.1.1'
    });

    // 2. Corrompe o segundo bloco alterando o IP
    const targetIndex = db.auditLogs.length - 2;
    const targetLog = db.auditLogs[targetIndex];
    (db.auditLogs as any)[targetIndex] = {
      ...targetLog,
      ipAddress: '200.200.200.200' // IP alterado maliciosamente
    };

    // 3. Verifica integridade da cadeia
    const verifyRes = await app.request('/api/audit/verify-chain', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(verifyRes.status).toBe(200);
    const result = await verifyRes.json();

    expect(result.isValid).toBe(false);
    expect(result.tamperedAtIndex).toBe(targetIndex);
    expect(result.message).toContain('Adulteração detectada');
  });

  it('deve gerar relatório formal de conformidade para DPO e CFP com Checksum SHA-256 canônico', async () => {
    // Cria eventos variados
    AuditService.log({
      actorId: 'psicologo-001',
      resourceType: AuditResourceType.CLINICAL_RECORD,
      resourceId: 'rec-001',
      action: AuditAction.DECRYPT_READ,
      ipAddress: '127.0.0.1'
    });
    AuditService.log({
      actorId: 'psicologo-001',
      resourceType: AuditResourceType.CLINICAL_RECORD,
      resourceId: 'rec-001',
      action: AuditAction.SIGN_RECORD,
      ipAddress: '127.0.0.1'
    });

    // Relatório formal da plataforma: perfil DPO/Admin (o psicólogo vê só o próprio consultório)
    const reportRes = await app.request('/api/audit/report', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(reportRes.status).toBe(200);
    const report = await reportRes.json();

    expect(report.success).toBe(true);
    expect(report.reportId).toBeDefined();
    expect(report.checksumSha256).toBeDefined();
    expect(report.checksumSha256).toHaveLength(64);

    // Bases regulatórias CFP e LGPD
    expect(report.regulationBasis.lgpdArticles).toContain('Art. 37 (Registro das operações de tratamento)');
    expect(report.regulationBasis.cfpResolutions).toContain('Resolução CFP nº 001/2009 (Guarda do prontuário psicológico por 5 anos)');

    // Contadores
    expect(report.summary.decryptReadsCount).toBeGreaterThanOrEqual(1);
    expect(report.summary.signaturesAppliedCount).toBeGreaterThanOrEqual(1);
    expect(report.chainIntegrity.isValid).toBe(true);
  });

  it('deve exportar a trilha WORM nos formatos CSV e JSON com headers de download', async () => {
    // 1. Exportação em CSV
    const csvRes = await app.request('/api/audit/export/csv', {
      headers: { Authorization: `Bearer ${therapistToken}` }
    });

    expect(csvRes.status).toBe(200);
    expect(csvRes.headers.get('Content-Type')).toContain('text/csv');
    expect(csvRes.headers.get('Content-Disposition')).toContain('terapiainfoco-auditoria-worm.csv');

    const csvText = await csvRes.text();
    expect(csvText).toContain('sequenceNumber,id,timestamp,action,resourceType');

    // 2. Exportação em JSON Assinado
    const jsonRes = await app.request('/api/audit/export/json', {
      headers: { Authorization: `Bearer ${therapistToken}` }
    });

    expect(jsonRes.status).toBe(200);
    expect(jsonRes.headers.get('Content-Type')).toContain('application/json');
    expect(jsonRes.headers.get('Content-Disposition')).toContain('terapiainfoco-relatorio-conformidade.json');

    const jsonData = await jsonRes.json();
    expect(jsonData.success).toBe(true);
    expect(jsonData.checksumSha256).toBeDefined();
  });

  it('deve restringir acesso aos relatórios e verificação da cadeia por RBAC', async () => {
    // Secretária tentando verificar integridade da cadeia -> 403 Forbidden
    const secVerifyRes = await app.request('/api/audit/verify-chain', {
      headers: { Authorization: `Bearer ${secretaryToken}` }
    });
    expect(secVerifyRes.status).toBe(403);

    // Secretária tentando exportar relatório DPO -> 403 Forbidden
    const secReportRes = await app.request('/api/audit/report', {
      headers: { Authorization: `Bearer ${secretaryToken}` }
    });
    expect(secReportRes.status).toBe(403);

    // Secretária tentando baixar CSV forense -> 403 Forbidden
    const secCsvRes = await app.request('/api/audit/export/csv', {
      headers: { Authorization: `Bearer ${secretaryToken}` }
    });
    expect(secCsvRes.status).toBe(403);

    // Acesso não autenticado com header estrito -> 401 Unauthorized
    const unauthRes = await app.request('/api/audit/verify-chain', {
      headers: { 'X-Strict-Auth': 'true' }
    });
    expect(unauthRes.status).toBe(401);
  });
});
