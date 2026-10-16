import { Hono } from 'hono';
import type {
  InspectWebSocketFrameDTO,
  SimulateWebSocketAttackDTO,
  UpdateWebSocketGuardPolicyDTO,
  VerifyWebSocketSealDTO
} from '@terapiainfoco/shared';
import { WebSocketGuardService } from '../services/webSocketGuardService';

export const webSocketGuardRoutes = new Hono();

webSocketGuardRoutes.get('/overview', (c) => {
  const service = WebSocketGuardService.getInstance();
  return c.json({
    success: true,
    overview: service.getOverview()
  });
});

webSocketGuardRoutes.get('/channels', (c) => {
  const service = WebSocketGuardService.getInstance();
  return c.json({
    success: true,
    channels: service.getChannelSchemas()
  });
});

webSocketGuardRoutes.post('/inspect', async (c) => {
  try {
    const body = await c.req.json<InspectWebSocketFrameDTO>();
    if (!body || typeof body.rawFramePayload !== 'string') {
      return c.json(
        {
          success: false,
          message: 'O parâmetro rawFramePayload é obrigatório para inspeção do frame WebSocket.'
        },
        400
      );
    }

    const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'WebSocketInspector/1.0';
    const service = WebSocketGuardService.getInstance();

    const res = service.inspectFrame(body, { ip, userAgent });
    return c.json(res, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

webSocketGuardRoutes.post('/policy', async (c) => {
  try {
    const body = await c.req.json<UpdateWebSocketGuardPolicyDTO>();
    const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
    const userAgent = c.req.header('user-agent');
    const service = WebSocketGuardService.getInstance();

    const res = service.updatePolicy(body || { policy: {} }, { ip, userAgent });
    return c.json(res, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

webSocketGuardRoutes.post('/simulate', async (c) => {
  try {
    const body = await c.req.json<SimulateWebSocketAttackDTO>();
    const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'WebSocketPentest/1.0';
    const service = WebSocketGuardService.getInstance();

    const res = service.simulateAttack(body || {}, { ip, userAgent });
    return c.json(res, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

webSocketGuardRoutes.post('/verify-seal', async (c) => {
  try {
    const body = await c.req.json<VerifyWebSocketSealDTO>();
    if (!body?.sealId && !body?.seal) {
      return c.json(
        {
          success: false,
          message: 'O identificador sealId ou objeto seal é obrigatório.'
        },
        400
      );
    }

    const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
    const userAgent = c.req.header('user-agent');
    const service = WebSocketGuardService.getInstance();

    const res = service.verifySeal(body, { ip, userAgent });
    return c.json(res, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});
