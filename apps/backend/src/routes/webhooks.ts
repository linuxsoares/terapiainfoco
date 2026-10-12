import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole, AuditAction, AuditResourceType } from '@terapiainfoco/shared';
import { webhookService } from '../services/webhookService';
import { auditService } from '../services/auditService';
import type { 
  CreateWebhookDTO, 
  UpdateWebhookDTO, 
  WebhookResponse, 
  WebhookListResponse, 
  TestWebhookResponse, 
  WebhookLogsResponse 
} from '@terapiainfoco/shared';

export const webhookRoute = new Hono();

// Acesso a configuração e gestão de webhooks de segurança restrito a Administradores (LGPD Art. 48)
webhookRoute.use('*', authMiddleware({ strict: true }));
webhookRoute.use('*', requireRoles([UserRole.ADMIN]));

/**
 * 1. Listar todas as inscrições de webhooks
 */
webhookRoute.get('/', (c) => {
  const webhooks = webhookService.listSubscriptions();
  const response: WebhookListResponse = {
    success: true,
    count: webhooks.length,
    webhooks
  };
  return c.json(response, 200);
});

/**
 * 2. Criar nova inscrição de webhook com segredo HMAC-SHA256
 */
webhookRoute.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({})) as CreateWebhookDTO;

  if (!body.url || !body.events || !Array.isArray(body.events) || body.events.length === 0) {
    return c.json({ 
      success: false, 
      error: 'URL de destino e ao menos um evento associado são obrigatórios.' 
    }, 400);
  }

  // Validação básica de URL
  if (!body.url.startsWith('https://') && !body.url.startsWith('http://localhost')) {
    return c.json({ 
      success: false, 
      error: 'URLs de webhooks devem utilizar HTTPS para segurança em trânsito (exceto localhost em desenvolvimento).' 
    }, 400);
  }

  const webhook = webhookService.createSubscription(body);
  const actor = (c as any).user;
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';

  auditService.logAccess({
    actorId: actor?.id || 'admin-system',
    resourceType: AuditResourceType.SECURITY,
    resourceId: webhook.id,
    action: AuditAction.CREATE,
    ipAddress: ip,
    userAgent: `Webhook subscription created: url=${webhook.url}, events=${webhook.events.join(',')}`
  }).catch(() => {});

  const response: WebhookResponse = {
    success: true,
    webhook,
    message: 'Webhook registrado com sucesso com segredo HMAC-SHA256 gerado.'
  };

  return c.json(response, 201);
});

/**
 * 3. Obter detalhes de um webhook
 */
webhookRoute.get('/:id', (c) => {
  const id = c.req.param('id');
  const webhook = webhookService.getSubscription(id);

  if (!webhook) {
    return c.json({ success: false, error: 'Webhook não localizado.' }, 404);
  }

  return c.json({ success: true, webhook }, 200);
});

/**
 * 4. Atualizar webhook existente
 */
webhookRoute.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({})) as UpdateWebhookDTO;

  const updated = webhookService.updateSubscription(id, body);
  if (!updated) {
    return c.json({ success: false, error: 'Webhook não localizado para atualização.' }, 404);
  }

  const actor = (c as any).user;
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';

  auditService.logAccess({
    actorId: actor?.id || 'admin-system',
    resourceType: AuditResourceType.SECURITY,
    resourceId: updated.id,
    action: AuditAction.UPDATE,
    ipAddress: ip,
    userAgent: `Webhook subscription updated: id=${updated.id}`
  }).catch(() => {});

  const response: WebhookResponse = {
    success: true,
    webhook: updated,
    message: 'Webhook atualizado com sucesso.'
  };

  return c.json(response, 200);
});

/**
 * 5. Remover webhook
 */
webhookRoute.delete('/:id', (c) => {
  const id = c.req.param('id');
  const deleted = webhookService.deleteSubscription(id);

  if (!deleted) {
    return c.json({ success: false, error: 'Webhook não localizado para remoção.' }, 404);
  }

  const actor = (c as any).user;
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';

  auditService.logAccess({
    actorId: actor?.id || 'admin-system',
    resourceType: AuditResourceType.SECURITY,
    resourceId: id,
    action: AuditAction.DELETE_REQUEST,
    ipAddress: ip,
    userAgent: `Webhook subscription deleted: id=${id}`
  }).catch(() => {});

  return c.json({ success: true, message: 'Webhook removido com sucesso.' }, 200);
});

/**
 * 6. Disparar teste simulado de entrega para o webhook
 */
webhookRoute.post('/:id/test', async (c) => {
  const id = c.req.param('id');

  try {
    const deliveryLog = await webhookService.testSubscription(id);
    const response: TestWebhookResponse = {
      success: deliveryLog.success,
      message: deliveryLog.success 
        ? 'Disparo de teste efetuado e entregue com sucesso!' 
        : `Disparo de teste falhou: ${deliveryLog.error || 'Erro no receptor'}`,
      deliveryLog
    };

    return c.json(response, 200);
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Erro ao testar webhook.' }, 400);
  }
});

/**
 * 7. Obter histórico de entregas de um webhook
 */
webhookRoute.get('/:id/logs', (c) => {
  const id = c.req.param('id');
  const logs = webhookService.getDeliveryLogs(id);

  const response: WebhookLogsResponse = {
    success: true,
    count: logs.length,
    logs
  };

  return c.json(response, 200);
});
