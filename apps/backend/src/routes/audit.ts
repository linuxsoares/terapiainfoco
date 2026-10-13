import { Hono } from 'hono';
import { AuditService } from '../services/auditService';
import { ComplianceService } from '../services/complianceService';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole, AuditAction, AuditResourceType } from '@terapiainfoco/shared';
import type { UnmaskAuditRequestDTO, UnmaskAuditResponse } from '@terapiainfoco/shared';

export const auditRoute = new Hono();

// Autenticação básica requerida em todas as rotas de auditoria
auditRoute.use('*', authMiddleware());

// 0. Registro de Revelação Auditada DDM (Dynamic Data Masking - RFC-001 Opção K & LGPD Art. 11)
auditRoute.post('/unmask', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ success: false, error: 'Autenticação necessária para revelar dados sensíveis.' }, 401);
  }

  const body = await c.req.json<UnmaskAuditRequestDTO>().catch(() => null);
  if (!body || !body.resourceType || !body.resourceId || !body.fieldName) {
    return c.json({ 
      success: false, 
      error: 'Parâmetros inválidos: resourceType, resourceId e fieldName são obrigatórios.' 
    }, 400);
  }

  // RBAC Clínico Estrito: Recepção/Secretária não pode revelar dados clínicos confidenciais (SOAP, anamnese, transcrições)
  if (
    user.role === UserRole.RECEPCAO_SECRETARIA && 
    (body.resourceType === AuditResourceType.CLINICAL_RECORD || body.resourceType === AuditResourceType.TRANSCRIPT)
  ) {
    return c.json({
      success: false,
      error: 'Acesso negado: Perfil de recepção/secretária não possui privilégio clínico para descriptografar dados de prontuário (CFP nº 001/2009).'
    }, 403);
  }

  // Registra a revelação na trilha imutável WORM (SHA-256 Hash Chain)
  const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent') || 'TerapiaInFoco-DDM-Client';

  AuditService.log({
    actorId: user.id,
    resourceType: body.resourceType,
    resourceId: body.resourceId,
    action: AuditAction.DECRYPT_READ,
    ipAddress,
    userAgent
  });

  const response: UnmaskAuditResponse = {
    success: true,
    auditedAt: new Date().toISOString(),
    action: AuditAction.DECRYPT_READ,
    resourceType: body.resourceType,
    resourceId: body.resourceId,
    fieldName: body.fieldName,
    actorId: user.id,
    autoHideSeconds: 30,
    message: `Ação de revelação do campo sensível [${body.fieldName}] auditada e encadeada na trilha WORM com sucesso.`
  };

  return c.json(response, 200);
});

// Acesso à consulta da trilha de auditoria WORM é restrito a Administradores e Psicólogos Titulares (LGPD Art. 37/38)
const adminOrTherapist = requireRoles([UserRole.ADMIN, UserRole.PSICOLOGO_TITULAR]);

// 1. Obter logs com filtros opcionais
auditRoute.get('/', adminOrTherapist, (c) => {
  const action = c.req.query('action');
  const resourceType = c.req.query('resourceType');
  const actorId = c.req.query('actorId');
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined;

  const logs = AuditService.getFilteredLogs({
    action,
    resourceType,
    actorId,
    startDate,
    endDate,
    limit
  });

  return c.json({ success: true, count: logs.length, logs });
});

// 2. Validação Criptográfica da Hash-Chain WORM (Tamper-Evident Ledger)
auditRoute.get('/verify-chain', adminOrTherapist, (c) => {
  const result = AuditService.verifyChainIntegrity();
  return c.json(result, 200);
});

// 3. Relatório Formal de Conformidade para DPO e Fiscalização do CFP
auditRoute.get('/report', adminOrTherapist, (c) => {
  const action = c.req.query('action');
  const resourceType = c.req.query('resourceType');
  const actorId = c.req.query('actorId');
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

  const report = AuditService.generateComplianceReport({
    action,
    resourceType,
    actorId,
    startDate,
    endDate
  });

  return c.json(report, 200);
});

// 4. Exportação Forense em CSV
auditRoute.get('/export/csv', adminOrTherapist, (c) => {
  const action = c.req.query('action');
  const resourceType = c.req.query('resourceType');
  const actorId = c.req.query('actorId');
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

  const csv = AuditService.exportLogsToCsv({
    action,
    resourceType,
    actorId,
    startDate,
    endDate
  });

  return c.body(csv, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="terapiainfoco-auditoria-worm.csv"'
  });
});

// 5. Exportação em JSON Assinado
auditRoute.get('/export/json', adminOrTherapist, (c) => {
  const action = c.req.query('action');
  const resourceType = c.req.query('resourceType');
  const actorId = c.req.query('actorId');
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

  const report = AuditService.generateComplianceReport({
    action,
    resourceType,
    actorId,
    startDate,
    endDate
  });

  c.header('Content-Type', 'application/json; charset=utf-8');
  c.header('Content-Disposition', 'attachment; filename="terapiainfoco-relatorio-conformidade.json"');
  return c.json(report, 200);
});

// 6. Obter logs específicos de um recurso
auditRoute.get('/resource/:id', adminOrTherapist, (c) => {
  const resourceId = c.req.param('id');
  const logs = AuditService.getLogsForResource(resourceId);
  return c.json({ success: true, count: logs.length, logs });
});

// 7. Execução de Pentest Automatizado & Emissão de RIPD / DPIA (Fase 4 do RFC-001 & LGPD Art. 38/50)
auditRoute.post('/compliance/run', adminOrTherapist, async (c) => {
  const user = c.get('user');
  const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';

  try {
    const report = await ComplianceService.generateComplianceReport(user?.id || 'admin', ipAddress);
    return c.json({
      success: true,
      message: `Auditoria de conformidade executada com sucesso. Score: ${report.overallScore}% (${report.pentestSummary.passed}/${report.pentestSummary.totalScenarios} cenários aprovados).`,
      report
    }, 200);
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Falha ao executar auditoria de conformidade.' }, 500);
  }
});

// 8. Consulta do Relatório Mais Recente de Conformidade RIPD / DPIA
auditRoute.get('/compliance/report', adminOrTherapist, async (c) => {
  try {
    const report = await ComplianceService.getLatestReport();
    return c.json({ success: true, report }, 200);
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Falha ao obter relatório de conformidade.' }, 500);
  }
});

// 9. Download do Relatório RIPD em JSON Assinado
auditRoute.get('/compliance/download-ripd', adminOrTherapist, async (c) => {
  try {
    const report = await ComplianceService.getLatestReport();
    c.header('Content-Type', 'application/json; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="terapiainfoco-ripd-dpia-${report.reportId.slice(0, 8)}.json"`);
    return c.json(report, 200);
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Falha ao exportar RIPD.' }, 500);
  }
});

