import { Hono } from 'hono';
import { EphemeralTokenService } from '../services/ephemeralTokenService';
import type {
  IssueEphemeralTokenDTO,
  ConsumeEphemeralTokenDTO,
  RevokeEphemeralTokenDTO,
  SimulateTokenIntrusionDTO,
  UpdateEphemeralPolicyDTO,
  VerifyEphemeralTokenSealDTO
} from '@terapiainfoco/shared';

export const ephemeralTokenRouter = new Hono();
const service = EphemeralTokenService.getInstance();

/**
 * GET /api/ephemeral-tokens/overview
 * Retorna visão consolidada com métricas, tokens ativos e logs de acesso
 */
ephemeralTokenRouter.get('/overview', async (c) => {
  try {
    const overview = await service.getOverview();
    return c.json({
      success: true,
      overview
    }, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao obter telemetria de tokens efêmeros'
    }, 500);
  }
});

/**
 * POST /api/ephemeral-tokens/issue
 * Emite uma nova credencial temporária / token efêmero com Magic Link e QR Code
 */
ephemeralTokenRouter.post('/issue', async (c) => {
  try {
    const body = await c.req.json<IssueEphemeralTokenDTO>();
    if (!body.patientId || !body.therapistCrp || !body.roomId) {
      return c.json({
        success: false,
        message: 'Parâmetros obrigatórios ausentes: patientId, therapistCrp e roomId.'
      }, 400);
    }

    const response = await service.issueToken(body);
    return c.json(response, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao emitir credencial efêmera'
    }, 400);
  }
});

/**
 * POST /api/ephemeral-tokens/consume
 * Valida e consome o token efêmero no ingresso à teleconsulta
 */
ephemeralTokenRouter.post('/consume', async (c) => {
  try {
    const body = await c.req.json<ConsumeEphemeralTokenDTO>();
    if (!body.tokenString || !body.roomId) {
      return c.json({
        success: false,
        message: 'Parâmetros obrigatórios ausentes: tokenString e roomId.'
      }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for') || c.req.header('remote-addr') || '189.40.122.15';
    const userAgent = c.req.header('user-agent') || 'TerapiaInFoco WebRTC Client';

    const response = await service.consumeToken({
      ...body,
      clientIp,
      userAgent
    });

    return c.json(response, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao processar consumo de token efêmero'
    }, 400);
  }
});

/**
 * POST /api/ephemeral-tokens/revoke
 * Revoga deliberadamente um token ativo (RFC 7009)
 */
ephemeralTokenRouter.post('/revoke', async (c) => {
  try {
    const body = await c.req.json<RevokeEphemeralTokenDTO>();
    if (!body.tokenId) {
      return c.json({
        success: false,
        message: 'Parâmetro obrigatório ausente: tokenId.'
      }, 400);
    }

    const response = await service.revokeToken(body);
    return c.json(response, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao revogar token efêmero'
    }, 400);
  }
});

/**
 * POST /api/ephemeral-tokens/simulate-intrusion
 * Simula cenários adversariais (expirado, reuso, revogado, sala incorreta)
 */
ephemeralTokenRouter.post('/simulate-intrusion', async (c) => {
  try {
    const body = await c.req.json<SimulateTokenIntrusionDTO>();
    if (!body.scenario) {
      return c.json({
        success: false,
        message: 'Cenário obrigatório: EXPIRED_TOKEN, REUSED_CONSUMED_TOKEN, REVOKED_TOKEN, TAMPERED_SIGNATURE ou WRONG_ROOM.'
      }, 400);
    }

    const response = await service.simulateIntrusion(body);
    return c.json(response, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha na simulação de intrusão'
    }, 400);
  }
});

/**
 * POST /api/ephemeral-tokens/update-policy
 * Atualiza TTL padrão e flags de concorrência do enclave
 */
ephemeralTokenRouter.post('/update-policy', async (c) => {
  try {
    const body = await c.req.json<UpdateEphemeralPolicyDTO>();
    const response = await service.updatePolicy(body);
    return c.json(response, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao atualizar políticas do enclave'
    }, 400);
  }
});

/**
 * POST /api/ephemeral-tokens/verify-seal
 * Valida a autenticidade de um selo probatório WORM de credencial efêmera
 */
ephemeralTokenRouter.post('/verify-seal', async (c) => {
  try {
    const body = await c.req.json<VerifyEphemeralTokenSealDTO>();
    if (!body.sealToken) {
      return c.json({
        success: false,
        message: 'Parâmetro obrigatório ausente: sealToken.'
      }, 400);
    }

    const response = await service.verifyProofSeal(body.sealToken);
    return c.json(response, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao validar selo probatório'
    }, 400);
  }
});
