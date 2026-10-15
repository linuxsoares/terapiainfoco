import { Hono } from 'hono';
import { SessionBindingService } from '../services/sessionBindingService';
import type {
  TerminateSessionDTO,
  TerminateAllOtherSessionsDTO,
  SimulateConcurrentLoginDTO,
  VerifyDpopBindingDTO
} from '@terapiainfoco/shared';

export const sessionBindingRoute = new Hono();
const sessionService = SessionBindingService.getInstance();

/**
 * GET /api/session-binding/overview
 * Visão Geral de Governança Criptográfica de Sessões e Políticas de Concorrência
 */
sessionBindingRoute.get('/overview', (c) => {
  try {
    const userId = c.req.query('userId') || 'user-therapist-001';
    const overview = sessionService.getOverview(userId);
    return c.json({ success: true, overview }, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Erro ao carregar visão geral de gestão de sessões.'
    }, 500);
  }
});

/**
 * GET /api/session-binding/sessions
 * Lista de sessões clínicas registradas para o terapeuta autenticado
 */
sessionBindingRoute.get('/sessions', (c) => {
  try {
    const userId = c.req.query('userId') || 'user-therapist-001';
    const currentSessionId = c.req.query('currentSessionId') || 'sess-active-chrome-01';
    const sessions = sessionService.listSessions(userId, currentSessionId);
    return c.json({ success: true, sessions, total: sessions.length }, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Erro ao listar sessões clínicas.'
    }, 500);
  }
});

/**
 * POST /api/session-binding/terminate
 * Revogação forçada de um dispositivo/sessão específica com emissão de selo WORM
 */
sessionBindingRoute.post('/terminate', async (c) => {
  try {
    const body = await c.req.json<TerminateSessionDTO>();
    if (!body.sessionId) {
      return c.json({
        success: false,
        message: 'O ID da sessão (sessionId) é obrigatório para revogação.'
      }, 400);
    }

    const ipAddress = c.req.header('x-forwarded-for') || '189.120.45.10';
    const operator = 'user-therapist-001';

    const result = await sessionService.terminateSession(body, operator, ipAddress);

    return c.json(result, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao encerrar a sessão informada.'
    }, 400);
  }
});

/**
 * POST /api/session-binding/terminate-others
 * Encerramento em lote de todas as outras sessões concorrentes (Kill Switch Remoto)
 */
sessionBindingRoute.post('/terminate-others', async (c) => {
  try {
    const body = await c.req.json<TerminateAllOtherSessionsDTO>();
    if (!body.currentSessionId) {
      return c.json({
        success: false,
        message: 'A sessão corrente (currentSessionId) a preservar é obrigatória.'
      }, 400);
    }

    const ipAddress = c.req.header('x-forwarded-for') || '189.120.45.10';
    const operator = 'user-therapist-001';

    const result = await sessionService.terminateAllOtherSessions(body, operator, ipAddress);

    return c.json(result, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao encerrar outras sessões.'
    }, 400);
  }
});

/**
 * POST /api/session-binding/simulate-concurrent
 * Simulação de conexão/login concorrente com aplicação de limites RFC-001 §4.4
 */
sessionBindingRoute.post('/simulate-concurrent', async (c) => {
  try {
    const body = await c.req.json<SimulateConcurrentLoginDTO>();
    if (!body.scenario) {
      return c.json({
        success: false,
        message: 'O campo scenario é obrigatório para simulação de sessão concorrente.'
      }, 400);
    }

    const ipAddress = c.req.header('x-forwarded-for') || '189.120.45.10';
    const result = await sessionService.simulateConcurrentLogin(body, ipAddress);

    const statusCode = result.success ? 200 : 401;
    return c.json(result, statusCode);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Erro ao simular sessão concorrente.'
    }, 500);
  }
});

/**
 * POST /api/session-binding/verify-dpop
 * Validação rigorosa de prova de posse DPoP (RFC 9449)
 */
sessionBindingRoute.post('/verify-dpop', async (c) => {
  try {
    const body = await c.req.json<VerifyDpopBindingDTO>();
    if (!body.dpopProof || !body.httpMethod || !body.httpUri) {
      return c.json({
        success: false,
        message: 'dpopProof, httpMethod e httpUri são parâmetros obrigatórios.'
      }, 400);
    }

    const ipAddress = c.req.header('x-forwarded-for') || '189.120.45.10';
    const result = sessionService.verifyDpopBinding(body, 'user-therapist-001', ipAddress);

    return c.json(result, result.success ? 200 : 401);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Erro interno ao validar DPoP.'
    }, 500);
  }
});

/**
 * GET /api/session-binding/verify-seal/:sessionId
 * Verificação pericial da fé pública e integridade do selo WORM emitido
 */
sessionBindingRoute.get('/verify-seal/:sessionId', (c) => {
  try {
    const sessionId = c.req.param('sessionId');
    const result = sessionService.verifyRevocationSeal(sessionId);
    return c.json({ success: true, verification: result }, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Erro ao verificar selo de revogação.'
    }, 400);
  }
});
