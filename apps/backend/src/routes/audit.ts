import { Hono } from 'hono';
import { AuditService } from '../services/auditService';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';

export const auditRoute = new Hono();

// Acesso à trilha de auditoria WORM é restrito a Administradores e Psicólogos Titulares (LGPD Art. 37/38)
auditRoute.use('*', authMiddleware());
auditRoute.use('*', requireRoles([UserRole.ADMIN, UserRole.PSICOLOGO_TITULAR]));

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
