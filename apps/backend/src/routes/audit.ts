import { Hono } from 'hono';
import { AuditService } from '../services/auditService';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';

export const auditRoute = new Hono();

// Acesso à trilha de auditoria WORM é restrito a Administradores e Psicólogos Titulares (LGPD Art. 37/38)
auditRoute.use('*', authMiddleware());
auditRoute.use('*', requireRoles([UserRole.ADMIN, UserRole.PSICOLOGO_TITULAR]));

// 1. Obter logs com filtros opcionais
auditRoute.get('/', (c) => {
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
auditRoute.get('/verify-chain', (c) => {
  const result = AuditService.verifyChainIntegrity();
  return c.json(result, 200);
});

// 3. Relatório Formal de Conformidade para DPO e Fiscalização do CFP
auditRoute.get('/report', (c) => {
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
auditRoute.get('/export/csv', (c) => {
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
auditRoute.get('/export/json', (c) => {
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
auditRoute.get('/resource/:id', (c) => {
  const resourceId = c.req.param('id');
  const logs = AuditService.getLogsForResource(resourceId);
  return c.json({ success: true, count: logs.length, logs });
});
