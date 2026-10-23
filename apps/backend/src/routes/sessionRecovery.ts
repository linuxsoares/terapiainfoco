import { Hono } from 'hono';
import {
  UserRole,
  type StartSessionMonitoringDTO,
  type SessionHeartbeatDTO,
  type TriggerSessionDisconnectionDTO,
  type AttemptSessionReconnectDTO,
  type CompleteClinicalSessionDTO,
  type SessionMonitoringResponse,
  type SessionReconnectResponse,
  type SessionRecoveryListResponse
} from '@terapiainfoco/shared';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { SessionRecoveryService } from '../services/sessionRecoveryService';

export const sessionRecoveryRoute = new Hono();

// Exige autenticação estrita
sessionRecoveryRoute.use('*', authMiddleware({ strict: true }));

// Acesso concedido a psicólogos e administradores
// Ferramenta de operação da plataforma: só o Admin/DPO (RFC-001 §4.5)
const requireAdmin = requireRoles([UserRole.ADMIN]);

const service = SessionRecoveryService.getInstance();

/**
 * 1. Iniciar monitoramento de resiliência e estado da sessão clínica
 */
sessionRecoveryRoute.post('/start', requireAdmin, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json<StartSessionMonitoringDTO>();

    if (!body.sessionId || !body.appointmentId) {
      return c.json({ success: false, message: 'sessionId e appointmentId são obrigatórios.' }, 400);
    }

    const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'Unknown';

    const { session, reconnectionToken } = await service.startSession({
      therapistId: user.id,
      dto: body,
      ipAddress,
      userAgent
    });

    const response: SessionMonitoringResponse = {
      success: true,
      session,
      reconnectionToken,
      message: 'Sessão clínica iniciada com monitoramento contínuo de resiliência e token HMAC ativo.'
    };

    return c.json(response, 201);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

/**
 * 2. Enviar batimento cardíaco (Heartbeat) periódico da sessão
 */
sessionRecoveryRoute.post('/heartbeat', requireAdmin, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json<SessionHeartbeatDTO>();

    if (!body.sessionId) {
      return c.json({ success: false, message: 'sessionId é obrigatório.' }, 400);
    }

    const session = service.recordHeartbeat({
      sessionId: body.sessionId,
      therapistId: user.id,
      snapshot: body.snapshot
    });

    return c.json({ success: true, session, message: 'Heartbeat registrado com sucesso.' }, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

/**
 * 3. Notificar ou simular desconexão abrupta da teleconsulta
 */
sessionRecoveryRoute.post('/disconnect', requireAdmin, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json<TriggerSessionDisconnectionDTO>();

    if (!body.sessionId || !body.cause) {
      return c.json({ success: false, message: 'sessionId e cause são obrigatórios.' }, 400);
    }

    const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'Unknown';

    const { session, reconnectionToken } = await service.triggerDisconnection({
      sessionId: body.sessionId,
      therapistId: user.id,
      cause: body.cause,
      detail: body.detail,
      ipAddress,
      userAgent
    });

    const response: SessionMonitoringResponse = {
      success: true,
      session,
      reconnectionToken,
      message: 'Desconexão abrupta detectada. Janela ética de contingência (10 min) acionada conforme CFP 011/2018.'
    };

    return c.json(response, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

/**
 * 4. Tentar reconexão com token HMAC e restaurar snapshot
 */
sessionRecoveryRoute.post('/reconnect', requireAdmin, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json<AttemptSessionReconnectDTO>();

    if (!body.sessionId || !body.reconnectionToken) {
      return c.json({ success: false, message: 'sessionId e reconnectionToken são obrigatórios.' }, 400);
    }

    const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'Unknown';

    const { session, restoredSnapshot, recoveryGrade } = await service.attemptReconnect({
      sessionId: body.sessionId,
      therapistId: user.id,
      dto: body,
      ipAddress,
      userAgent
    });

    const response: SessionReconnectResponse = {
      success: true,
      session,
      restoredSnapshot,
      recoveryGrade,
      message: `Sessão recuperada com sucesso (${recoveryGrade})! Rascunhos clínicos restaurados sem perda.`
    };

    return c.json(response, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

/**
 * 5. Concluir a sessão normalmente
 */
sessionRecoveryRoute.post('/complete', requireAdmin, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json<CompleteClinicalSessionDTO>();

    if (!body.sessionId) {
      return c.json({ success: false, message: 'sessionId é obrigatório.' }, 400);
    }

    const session = service.completeSession({
      sessionId: body.sessionId,
      therapistId: user.id,
      finalNotes: body.finalNotes
    });

    return c.json({ success: true, session, message: 'Consulta concluída normalmente.' }, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

/**
 * 6. Listar sessões monitoradas e métricas globais
 */
sessionRecoveryRoute.get('/sessions', requireAdmin, (c) => {
  const sessions = service.listSessions();
  const metrics = service.getMetrics();

  const response: SessionRecoveryListResponse = {
    success: true,
    sessions,
    metrics
  };

  return c.json(response, 200);
});

/**
 * 7. Obter sessão específica
 */
sessionRecoveryRoute.get('/sessions/:id', requireAdmin, (c) => {
  const sessionId = c.req.param('id');
  const session = service.getSession(sessionId);

  if (!session) {
    return c.json({ success: false, message: 'Sessão não encontrada.' }, 404);
  }

  return c.json({ success: true, session }, 200);
});

/**
 * 8. Obter métricas de recuperação
 */
sessionRecoveryRoute.get('/metrics', requireAdmin, (c) => {
  const metrics = service.getMetrics();
  return c.json({ success: true, metrics }, 200);
});
