import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import { AntiAutomationTarpitService } from '../services/antiAutomationTarpitService';
import type {
  CreateHoneypotTrapDTO,
  SimulateScrapingAttackDTO,
  ReleaseTarpitQuarantineDTO,
  VerifyTarpitSealDTO
} from '@terapiainfoco/shared';

export const antiAutomationTarpitRoute = new Hono();

// Ferramenta da plataforma (painel de Segurança): exclusiva do Admin
antiAutomationTarpitRoute.use('*', authMiddleware(), requireRoles([UserRole.ADMIN]));
const tarpitService = AntiAutomationTarpitService.getInstance();

/**
 * GET /api/anti-automation/overview
 * Visão Geral Executiva de Governança Anti-Automação & Métricas de Tarpit
 */
antiAutomationTarpitRoute.get('/overview', (c) => {
  try {
    const overview = tarpitService.getOverview();
    return c.json({ success: true, overview }, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Erro ao carregar visão geral de Anti-Automação.'
    }, 500);
  }
});

/**
 * POST /api/anti-automation/trap/create
 * Criação dinâmica de armadilha Honeypot invisível
 */
antiAutomationTarpitRoute.post('/trap/create', async (c) => {
  try {
    const body = await c.req.json<CreateHoneypotTrapDTO>();
    if (!body?.routePath) {
      return c.json({ success: false, message: 'O caminho routePath é obrigatório.' }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for') || body.clientIp || '189.120.45.10';
    const result = tarpitService.createTrap({ ...body, clientIp });
    return c.json(result, 201);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao criar armadilha Honeypot.'
    }, 500);
  }
});

/**
 * GET /api/anti-automation/trap/:token
 * Endpoint da armadilha Honeypot: prende crawler no Tarpit assíncrono
 */
antiAutomationTarpitRoute.get('/trap/:token', async (c) => {
  try {
    const token = c.req.param('token');
    const clientIp = c.req.header('x-forwarded-for') || '198.51.100.99';
    
    // Coleta headers para análise heurística
    const headers: Record<string, string | undefined> = {
      'user-agent': c.req.header('user-agent'),
      'accept': c.req.header('accept'),
      'sec-ch-ua': c.req.header('sec-ch-ua'),
      'sec-fetch-mode': c.req.header('sec-fetch-mode')
    };

    const result = await tarpitService.handleTrapTrigger(token, clientIp, headers);
    return c.json(result, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao processar armadilha honeypot.'
    }, 500);
  }
});

/**
 * POST /api/anti-automation/simulate-scraping
 * Simulação controlada de rajada de raspagem massiva ou enumeração de contas
 */
antiAutomationTarpitRoute.post('/simulate-scraping', async (c) => {
  try {
    const body = await c.req.json<SimulateScrapingAttackDTO>();
    if (!body?.threatCategory) {
      return c.json({ success: false, message: 'threatCategory é obrigatório.' }, 400);
    }

    const clientIp = body.ipAddress || c.req.header('x-forwarded-for') || '198.51.100.95';
    const result = await tarpitService.simulateScrapingAttack({ ...body, ipAddress: clientIp });
    return c.json(result, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao simular ataque de scraping.'
    }, 500);
  }
});

/**
 * POST /api/anti-automation/release-ip
 * Desbloqueio e revogação de quarentena de IP com parecer auditado pelo DPO
 */
antiAutomationTarpitRoute.post('/release-ip', async (c) => {
  try {
    const body = await c.req.json<ReleaseTarpitQuarantineDTO>();
    if (!body?.ipAddress) {
      return c.json({ success: false, message: 'ipAddress é obrigatório.' }, 400);
    }

    const result = tarpitService.releaseIpQuarantine(body);
    return c.json(result, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao liberar quarentena do IP.'
    }, 400);
  }
});

/**
 * POST /api/anti-automation/verify-seal
 * Validação pericial pública da fé pública e integridade do selo WORM de Tarpit
 */
antiAutomationTarpitRoute.post('/verify-seal', async (c) => {
  try {
    const body = await c.req.json<VerifyTarpitSealDTO>();
    if (!body?.seal) {
      return c.json({ success: false, message: 'O selo seal é obrigatório.' }, 400);
    }

    const verification = tarpitService.verifySeal(body.seal);
    return c.json({ success: true, verification }, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao verificar selo probatório de Tarpit.'
    }, 500);
  }
});
