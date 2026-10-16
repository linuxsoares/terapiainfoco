import { Hono } from 'hono';
import type {
  InspectPathInputDTO,
  ResolveSafePathDTO,
  UpdatePathPolicyDTO,
  SimulatePathAttackDTO,
  VerifyPathSealDTO,
} from '@terapiainfoco/shared';
import { PathTraversalGuardService } from '../services/pathTraversalGuardService';

export const pathTraversalGuardRoutes = new Hono();

/**
 * GET /api/path-traversal-guard/overview
 * Retorna telemetria completa, presets de anexos clínicos, incidentes e selos probatórios WORM
 */
pathTraversalGuardRoutes.get('/overview', async (c) => {
  try {
    const service = PathTraversalGuardService.getInstance();
    const overview = service.getOverview();
    return c.json({ success: true, overview });
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Erro ao carregar telemetria de Path Traversal Guard.' }, 500);
  }
});

/**
 * POST /api/path-traversal-guard/inspect
 * Inspeciona léxica e heuristicamente um caminho de arquivo em busca de tentativas de Directory Traversal ou LFI
 */
pathTraversalGuardRoutes.post('/inspect', async (c) => {
  try {
    const body = await c.req.json<InspectPathInputDTO>();
    if (!body || !body.path) {
      return c.json({ success: false, message: 'O caminho de arquivo é obrigatório para inspeção.' }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'Internal Clinical Agent';

    const service = PathTraversalGuardService.getInstance();
    const result = service.inspect(body, clientIp, userAgent);

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Falha ao inspecionar caminho de arquivo.' }, 500);
  }
});

/**
 * POST /api/path-traversal-guard/resolve
 * Resolve e confina seguramente o anexo no repositório Jail Chroot homologado com emissão de selo WORM
 */
pathTraversalGuardRoutes.post('/resolve', async (c) => {
  try {
    const body = await c.req.json<ResolveSafePathDTO>();
    if (!body || !body.proposedPath || !body.category) {
      return c.json({ success: false, message: 'Caminho proposto e categoria clínica são obrigatórios.' }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'Internal Clinical Agent';

    const service = PathTraversalGuardService.getInstance();
    const result = service.resolve(body, clientIp, userAgent);

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Falha ao resolver caminho seguro em jail.' }, 500);
  }
});

/**
 * POST /api/path-traversal-guard/policy
 * Atualiza a política ativa de confinamento e filtros de extensões permitidas
 */
pathTraversalGuardRoutes.post('/policy', async (c) => {
  try {
    const body = await c.req.json<UpdatePathPolicyDTO>();
    if (!body || !body.policy) {
      return c.json({ success: false, message: 'Objeto de política é obrigatório.' }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'Internal Clinical Agent';

    const service = PathTraversalGuardService.getInstance();
    const result = service.updatePolicy(body, clientIp, userAgent);

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Erro ao atualizar política de segurança de caminhos.' }, 500);
  }
});

/**
 * POST /api/path-traversal-guard/simulate
 * Simula vetores de ataque adversariais (CWE-22, CWE-23, CWE-73) e avalia a resposta da blindagem
 */
pathTraversalGuardRoutes.post('/simulate', async (c) => {
  try {
    const body = await c.req.json<SimulatePathAttackDTO>();
    if (!body || !body.threatVector) {
      return c.json({ success: false, message: 'Vetor de ameaça é obrigatório para simulação.' }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'Adversarial Path Simulation Suite';

    const service = PathTraversalGuardService.getInstance();
    const result = service.simulateAttack(body, clientIp, userAgent);

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Falha ao executar simulação de ataque de path traversal.' }, 500);
  }
});

/**
 * POST /api/path-traversal-guard/verify-seal
 * Valida a autenticidade e integridade criptográfica de um selo probatório WORM RFC 8785
 */
pathTraversalGuardRoutes.post('/verify-seal', async (c) => {
  try {
    const body = await c.req.json<VerifyPathSealDTO>();
    if (!body || !body.sealToken) {
      return c.json({ success: false, message: 'Token ou objeto de selo probatório é obrigatório.' }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'Security Notary Validator';

    const service = PathTraversalGuardService.getInstance();
    const result = service.verifySeal(body, clientIp, userAgent);

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Falha ao validar selo probatório de caminho.' }, 500);
  }
});
