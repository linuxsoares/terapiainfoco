import { Hono } from 'hono';
import { BackupService } from '../services/backupService';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';

export const backupsRoute = new Hono();

// Autenticação obrigatória para todas as rotas de gerenciamento de backup
backupsRoute.use('*', authMiddleware());

// 1. Visão geral, indicadores de RPO/RTO e histórico de snapshots
backupsRoute.get('/', requireRoles([UserRole.ADMIN]), async (c) => {
  const overview = BackupService.getBackupOverview();
  return c.json(overview, 200);
});

// 2. Disparar geração de novo snapshot de backup criptografado via KMS
backupsRoute.post('/', requireRoles([UserRole.ADMIN]), async (c) => {
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');
  const user = c.get('user');

  try {
    const result = await BackupService.createEncryptedBackup({
      actorId: user?.id || 'admin-user',
      ipAddress: ip,
      userAgent
    });
    return c.json(result, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// 3. Download do arquivo completo do backup cifrado (.kms-backup.json)
backupsRoute.get('/:id/download', requireRoles([UserRole.ADMIN]), async (c) => {
  const id = c.req.param('id');
  const file = BackupService.getBackupFile(id);

  if (!file) {
    return c.json({ success: false, error: 'Snapshot de backup não localizado.' }, 404);
  }

  c.header('Content-Disposition', `attachment; filename="terapiainfoco-backup-${id.slice(0, 8)}.kms-backup.json"`);
  c.header('Content-Type', 'application/json');
  return c.json(file, 200);
});

// 4. Simulação de Disaster Recovery e verificação criptográfica de integridade
backupsRoute.post('/:id/verify', requireRoles([UserRole.ADMIN]), async (c) => {
  const id = c.req.param('id');
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');
  const user = c.get('user');

  try {
    const result = await BackupService.verifyBackup(id, {
      actorId: user?.id || 'admin-user',
      ipAddress: ip,
      userAgent
    });
    return c.json(result, 200);
  } catch (err: any) {
    const status = err.message.includes('não encontrado') ? 404 : 400;
    return c.json({ success: false, error: err.message }, status);
  }
});

// 5. Restauração Emergencial do Sistema (Disaster Recovery Restore) - Restrito a Administrador
backupsRoute.post('/:id/restore', requireRoles([UserRole.ADMIN]), async (c) => {
  const id = c.req.param('id');
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');
  const user = c.get('user');

  try {
    const result = await BackupService.restoreFromBackup(id, {
      actorId: user?.id || 'admin-user',
      ipAddress: ip,
      userAgent
    });
    return c.json(result, 200);
  } catch (err: any) {
    const status = err.message.includes('não encontrado') ? 404 : 400;
    return c.json({ success: false, error: err.message }, status);
  }
});
