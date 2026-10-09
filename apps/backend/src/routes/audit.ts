import { Hono } from 'hono';
import { AuditService } from '../services/auditService';

export const auditRoute = new Hono();

// Obter todos os logs de auditoria imutáveis (WORM)
auditRoute.get('/', (c) => {
  const logs = AuditService.getAllLogs();
  return c.json({ success: true, count: logs.length, logs });
});

// Obter logs específicos de um recurso
auditRoute.get('/resource/:id', (c) => {
  const resourceId = c.req.param('id');
  const logs = AuditService.getLogsForResource(resourceId);
  return c.json({ success: true, logs });
});
