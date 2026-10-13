import { Hono } from 'hono';
import { siemService } from '../services/siemService';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import type { 
  CreateSiemConnectorDTO, 
  UpdateSiemConnectorDTO, 
  TestSiemConnectorDTO 
} from '@terapiainfoco/shared';

export const siemRoute = new Hono();

// Autenticação estrita requerida e restrição exclusiva a Administrador (LGPD Art. 48 & RFC §4.4)
siemRoute.use('*', authMiddleware({ strict: true }));
const adminOnly = requireRoles([UserRole.ADMIN]);

// 1. Listar conectores SIEM configurados
siemRoute.get('/connectors', adminOnly, (c) => {
  const connectors = siemService.listConnectors();
  return c.json({ success: true, connectors });
});

// 2. Criar novo conector SIEM
siemRoute.post('/connectors', adminOnly, async (c) => {
  const body = await c.req.json<CreateSiemConnectorDTO>().catch(() => null);
  if (!body || !body.provider || !body.name || !body.endpointUrl) {
    return c.json({
      success: false,
      error: 'Parâmetros inválidos: provider, name e endpointUrl são obrigatórios.'
    }, 400);
  }

  // Validação de HTTPS para conectores SIEM em produção
  if (!body.endpointUrl.startsWith('https://') && !body.endpointUrl.includes('localhost') && !body.endpointUrl.includes('clinica.com.br')) {
    return c.json({
      success: false,
      error: 'O endpoint do coletor SIEM deve utilizar obrigatoriamente protocolo seguro HTTPS (TLS 1.3).'
    }, 400);
  }

  const connector = siemService.createConnector(body);
  return c.json({ success: true, connector }, 201);
});

// 3. Obter conector específico por ID
siemRoute.get('/connectors/:id', adminOnly, (c) => {
  const id = c.req.param('id');
  const connector = siemService.getConnector(id);
  if (!connector) {
    return c.json({ success: false, error: `Conector SIEM '${id}' não encontrado.` }, 404);
  }
  return c.json({ success: true, connector });
});

// 4. Atualizar conector SIEM
siemRoute.patch('/connectors/:id', adminOnly, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<UpdateSiemConnectorDTO>().catch(() => null);
  if (!body) {
    return c.json({ success: false, error: 'Corpo da requisição inválido.' }, 400);
  }

  const updated = siemService.updateConnector(id, body);
  if (!updated) {
    return c.json({ success: false, error: `Conector SIEM '${id}' não encontrado.` }, 404);
  }

  return c.json({ success: true, connector: updated });
});

// 5. Excluir conector SIEM
siemRoute.delete('/connectors/:id', adminOnly, (c) => {
  const id = c.req.param('id');
  const deleted = siemService.deleteConnector(id);
  if (!deleted) {
    return c.json({ success: false, error: `Conector SIEM '${id}' não encontrado.` }, 404);
  }
  return c.json({ success: true, message: 'Conector SIEM removido com sucesso.' });
});

// 6. Testar conector SIEM sob demanda com visualização do payload transformado
siemRoute.post('/connectors/:id/test', adminOnly, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<TestSiemConnectorDTO>().catch(() => ({}));

  try {
    const testResult = await siemService.testConnector(id, body);
    return c.json({
      success: testResult.success,
      testResult
    });
  } catch (err: any) {
    return c.json({
      success: false,
      error: err.message
    }, 400);
  }
});

// 7. Obter estatísticas da fila e estado do Circuit Breaker
siemRoute.get('/queue', adminOnly, (c) => {
  const stats = siemService.getQueueStats();
  return c.json(stats);
});

// 8. Obter itens na Dead-Letter Queue (DLQ)
siemRoute.get('/dlq', adminOnly, (c) => {
  const dlqItems = siemService.getDlqItems();
  return c.json({ success: true, count: dlqItems.length, items: dlqItems });
});

// 9. Re-executar item específico da Dead-Letter Queue
siemRoute.post('/dlq/:id/replay', adminOnly, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ mockSuccess?: boolean }>().catch(() => ({}));

  try {
    const item = await siemService.replayDlqItem(id, body);
    return c.json({ success: true, item });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

// 10. Reprocessar todos os itens da Dead-Letter Queue
siemRoute.post('/dlq/replay-all', adminOnly, async (c) => {
  const body = await c.req.json<{ mockSuccess?: boolean }>().catch(() => ({}));
  const result = await siemService.replayAllDlq(body);
  return c.json({
    success: true,
    ...result
  });
});

// 11. Descartar item da Dead-Letter Queue
siemRoute.delete('/dlq/:id', adminOnly, (c) => {
  const id = c.req.param('id');
  const deleted = siemService.deleteDlqItem(id);
  if (!deleted) {
    return c.json({ success: false, error: `Item DLQ '${id}' não encontrado.` }, 404);
  }
  return c.json({ success: true, message: 'Item descartado da Dead-Letter Queue.' });
});

// 12. Endpoint para disparo de teste de evento pela API (usado em verificações e testes)
siemRoute.post('/dispatch-test', adminOnly, async (c) => {
  const body = await c.req.json<{
    eventType: any;
    data: any;
    mockFailures?: boolean;
    mockHttpStatus?: number;
  }>().catch(() => null);

  if (!body || !body.eventType) {
    return c.json({ success: false, error: 'eventType é obrigatório.' }, 400);
  }

  const items = await siemService.enqueueEvent(body.eventType, body.data || {}, {
    mockFailures: body.mockFailures,
    mockHttpStatus: body.mockHttpStatus
  });

  return c.json({
    success: true,
    dispatchedCount: items.length,
    items
  });
});
