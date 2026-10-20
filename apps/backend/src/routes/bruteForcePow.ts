import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import { BruteForcePowService } from '../services/bruteForcePowService';
import type {
  RequestPowChallengeDTO,
  SubmitPowSolutionDTO,
  SimulateBruteForceAttackDTO,
  ResetIpReputationDTO
} from '@terapiainfoco/shared';

export const bruteForcePowRoute = new Hono();

// Ferramenta da plataforma (painel de Segurança): exclusiva do Admin
bruteForcePowRoute.use('*', authMiddleware(), requireRoles([UserRole.ADMIN]));
const powService = BruteForcePowService.getInstance();

/**
 * GET /api/brute-force-pow/overview
 * Visão Geral Executiva de Mitigação de Força Bruta & Desafios PoW
 */
bruteForcePowRoute.get('/overview', (c) => {
  try {
    const overview = powService.getOverview();
    return c.json({ success: true, overview }, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Erro ao carregar visão geral de defesa PoW.'
    }, 500);
  }
});

/**
 * POST /api/brute-force-pow/challenge
 * Emissão de Desafio de Prova de Trabalho Criptográfica com Dificuldade Dinâmica
 */
bruteForcePowRoute.post('/challenge', async (c) => {
  try {
    let clientIp = c.req.header('x-forwarded-for') || '189.120.45.10';
    try {
      const body = await c.req.json<RequestPowChallengeDTO>();
      if (body?.clientIp) {
        clientIp = body.clientIp;
      }
    } catch {
      // Body vazio é aceitável, usa IP do header
    }

    const result = powService.requestChallenge(clientIp);
    return c.json(result, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao emitir desafio PoW.'
    }, 500);
  }
});

/**
 * POST /api/brute-force-pow/verify
 * Validação de Solução de Prova de Trabalho Submetida pelo Cliente
 */
bruteForcePowRoute.post('/verify', async (c) => {
  try {
    const body = await c.req.json<SubmitPowSolutionDTO>();
    if (!body.challenge || body.nonce === undefined) {
      return c.json({
        success: false,
        message: 'challenge e nonce são campos obrigatórios.'
      }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for') || body.challenge.clientIp || '189.120.45.10';
    const result = powService.verifySolution(body, clientIp);

    const statusCode = result.success ? 200 : 401;
    return c.json(result, statusCode);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Erro interno ao validar solução PoW.'
    }, 500);
  }
});

/**
 * POST /api/brute-force-pow/simulate-attack
 * Simulação de rajada de Credential Stuffing / Força Bruta para validação de contenção
 */
bruteForcePowRoute.post('/simulate-attack', async (c) => {
  try {
    const body = await c.req.json<SimulateBruteForceAttackDTO>();
    if (!body.threatCategory) {
      return c.json({
        success: false,
        message: 'O campo threatCategory é obrigatório para a simulação.'
      }, 400);
    }

    const result = powService.simulateAttack(body);
    return c.json(result, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao simular ataque de força bruta.'
    }, 500);
  }
});

/**
 * POST /api/brute-force-pow/reset-ip
 * Desbloqueio e Reset de Quarentena de IP com Justificativa Forense WORM
 */
bruteForcePowRoute.post('/reset-ip', async (c) => {
  try {
    const body = await c.req.json<ResetIpReputationDTO>();
    if (!body.ipAddress || !body.reason) {
      return c.json({
        success: false,
        message: 'ipAddress e reason são campos obrigatórios para o desbloqueio.'
      }, 400);
    }

    const result = powService.resetIpReputation(body, 'user-admin-001');
    return c.json(result, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao resetar reputação do IP.'
    }, 400);
  }
});

/**
 * POST /api/brute-force-pow/verify-seal
 * Validação Pericial da Fé Pública do Selo WORM de Defesa
 */
bruteForcePowRoute.post('/verify-seal', async (c) => {
  try {
    const body = await c.req.json<{ seal: string }>();
    if (!body.seal) {
      return c.json({
        success: false,
        message: 'O parâmetro seal é obrigatório.'
      }, 400);
    }

    const verification = powService.verifyDefenseSeal(body.seal);
    return c.json({ success: verification.isValid, verification }, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Erro ao validar selo de defesa PoW.'
    }, 500);
  }
});
