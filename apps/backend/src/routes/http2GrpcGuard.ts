import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import type {
  InspectHttp2HeadersDTO,
  UpdateHttp2PolicyDTO,
  SimulateHttp2AttackDTO,
  VerifyHttp2SealDTO,
} from '@terapiainfoco/shared';
import { Http2GrpcGuardService } from '../services/http2GrpcGuardService';

export const http2GrpcGuardRoutes = new Hono();

// Ferramenta da plataforma (painel de Segurança): exclusiva do Admin
http2GrpcGuardRoutes.use('*', authMiddleware(), requireRoles([UserRole.ADMIN]));

/**
 * GET /api/http2-guard/overview
 * Retorna telemetria operacional, métricas de desincronização, incidentes e selos de conformidade RFC 9113
 */
http2GrpcGuardRoutes.get('/overview', async (c) => {
  try {
    const service = Http2GrpcGuardService.getInstance();
    const overview = service.getOverview();
    return c.json({ success: true, overview });
  } catch (err: any) {
    return c.json(
      { success: false, message: err.message || 'Erro ao carregar telemetria de HTTP/2 & gRPC Guard.' },
      500
    );
  }
});

/**
 * POST /api/http2-guard/inspect
 * Inspeciona lista de cabeçalhos contra ataques de Request Smuggling (H2.TE/H2.CL), CRLF Injection e adulteração gRPC
 */
http2GrpcGuardRoutes.post('/inspect', async (c) => {
  try {
    const body = await c.req.json<InspectHttp2HeadersDTO>();
    if (!body || !body.headers || !Array.isArray(body.headers)) {
      return c.json({ success: false, message: 'A lista de cabeçalhos é obrigatória para inspeção.' }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'HTTP2-Client';

    const service = Http2GrpcGuardService.getInstance();
    const result = await service.inspectHeaders({
      ...body,
      clientIp: body.clientIp || clientIp,
      userAgent: body.userAgent || userAgent,
    });

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Falha ao inspecionar cabeçalhos HTTP/2.' }, 500);
  }
});

/**
 * POST /api/http2-guard/policy
 * Atualiza diretrizes de conformidade estrita RFC 9113 e validação gRPC
 */
http2GrpcGuardRoutes.post('/policy', async (c) => {
  try {
    const body = await c.req.json<UpdateHttp2PolicyDTO>();
    if (!body) {
      return c.json({ success: false, message: 'As configurações de política são obrigatórias.' }, 400);
    }

    const service = Http2GrpcGuardService.getInstance();
    const result = await service.updatePolicy(body);

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Falha ao atualizar diretrizes de governança HTTP/2.' }, 500);
  }
});

/**
 * POST /api/http2-guard/simulate
 * Simula vetores de ataque adversariais (H2.TE Smuggling, CRLF Split, gRPC tampering, etc)
 */
http2GrpcGuardRoutes.post('/simulate', async (c) => {
  try {
    const body = await c.req.json<SimulateHttp2AttackDTO>();
    if (!body || !body.threatCategory) {
      return c.json({ success: false, message: 'A categoria do ataque para simulação é obrigatória.' }, 400);
    }

    const service = Http2GrpcGuardService.getInstance();
    const result = await service.simulateAttack(body);

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Falha ao simular ataque adversarial HTTP/2.' }, 500);
  }
});

/**
 * POST /api/http2-guard/verify-seal
 * Valida a autenticidade criptográfica de um selo notarial WORM RFC 8785 (JCS)
 */
http2GrpcGuardRoutes.post('/verify-seal', async (c) => {
  try {
    const body = await c.req.json<VerifyHttp2SealDTO>();
    if (!body || !body.sealToken) {
      return c.json({ success: false, message: 'O token ou payload do selo probatório é obrigatório.' }, 400);
    }

    const service = Http2GrpcGuardService.getInstance();
    const result = await service.verifySeal(body);

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Falha ao verificar selo probatório notarial.' }, 500);
  }
});
