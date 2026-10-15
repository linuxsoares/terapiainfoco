import { Hono } from 'hono';
import { BlindSignaturesService } from '../services/blindSignaturesService';
import type {
  GenerateBlindAuthorityKeyDTO,
  BlindMessageDTO,
  SignBlindMessageDTO,
  UnblindSignatureDTO,
  RedeemOrCastBallotDTO,
  VerifyBlindTokenDTO,
  SimulateDoubleSpendDTO,
  VerifyBlindSealDTO
} from '@terapiainfoco/shared';

export const blindSignaturesRouter = new Hono();
const blindService = BlindSignaturesService.getInstance();

/**
 * GET /api/blind-signatures/overview
 * Visão consolidada da autoridade certificadora cega, urna ética e vouchers
 */
blindSignaturesRouter.get('/overview', async (c) => {
  try {
    const overview = blindService.getOverview();
    return c.json({
      success: true,
      overview
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao obter visão geral de assinaturas cegas.'
    }, 500);
  }
});

/**
 * POST /api/blind-signatures/generate-authority-key
 * Emissão de novo par de chaves RSA para a autoridade emissora
 */
blindSignaturesRouter.post('/generate-authority-key', async (c) => {
  try {
    const body = await c.req.json<GenerateBlindAuthorityKeyDTO>();
    const operatorId = 'usr_admin_colegiado';

    const publicKey = await blindService.generateAuthorityKey(body, operatorId);

    return c.json({
      success: true,
      publicKey,
      message: `Novo par de chaves da autoridade gerado com sucesso (${publicKey.scheme}).`
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao gerar par de chaves da autoridade.'
    }, 500);
  }
});

/**
 * POST /api/blind-signatures/blind
 * Passo 1: Cegamento no Cliente (Client Blinding)
 */
blindSignaturesRouter.post('/blind', async (c) => {
  try {
    const body = await c.req.json<BlindMessageDTO>();

    if (!body.originalMessage) {
      return c.json({
        success: false,
        message: 'A mensagem original a ser mascarada é obrigatória.'
      }, 400);
    }
    if (!body.purpose) {
      return c.json({
        success: false,
        message: 'A finalidade clínica/ética do token é obrigatória.'
      }, 400);
    }

    const blindedMessage = await blindService.blindMessage(body);

    return c.json({
      success: true,
      blindedMessage,
      message: 'Mensagem mascarada e cegada com sucesso via fator aleatório coprimo r.'
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao cegar mensagem.'
    }, 500);
  }
});

/**
 * POST /api/blind-signatures/sign-blind
 * Passo 2: Assinatura Cega pela Autoridade (Authority Blind Signing)
 */
blindSignaturesRouter.post('/sign-blind', async (c) => {
  try {
    const body = await c.req.json<SignBlindMessageDTO>();

    if (!body.blindedMessageHex) {
      return c.json({
        success: false,
        message: 'O payload da mensagem cega em hexadecimal é obrigatório.'
      }, 400);
    }
    if (!body.authorityKeyId) {
      return c.json({
        success: false,
        message: 'O ID da autoridade emissora é obrigatório.'
      }, 400);
    }

    const signedResponse = await blindService.signBlindMessage(body);

    return c.json({
      success: true,
      signedResponse,
      message: 'Assinatura cega efetuada pela autoridade com sucesso sem conhecimento do teor do voto/prescrição.'
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao assinar mensagem cega.'
    }, 400);
  }
});

/**
 * POST /api/blind-signatures/unblind
 * Passo 3: Descegamento pelo Cliente (Client Unblinding)
 */
blindSignaturesRouter.post('/unblind', async (c) => {
  try {
    const body = await c.req.json<UnblindSignatureDTO>();

    if (!body.blindSignatureHex || !body.blindingFactorHex || !body.originalMessage || !body.authorityKeyId) {
      return c.json({
        success: false,
        message: 'Parâmetros insuficientes para descegamento (assinatura cega, fator r, mensagem e autoridade).'
      }, 400);
    }

    const unblindedToken = await blindService.unblindSignature(body);

    return c.json({
      success: true,
      unblindedToken,
      message: 'Assinatura descegada com sucesso. Token dotado de fé pública institucional e desvinculação absoluta.'
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao descegar assinatura.'
    }, 500);
  }
});

/**
 * POST /api/blind-signatures/redeem-or-vote
 * Passo 4: Resgate Anônimo na Urna ou Rede Farmacêutica/CAPS
 */
blindSignaturesRouter.post('/redeem-or-vote', async (c) => {
  try {
    const body = await c.req.json<RedeemOrCastBallotDTO>();

    if (!body.unblindedToken) {
      return c.json({
        success: false,
        message: 'Token descegado é obrigatório para resgate/voto.'
      }, 400);
    }

    const redemption = await blindService.redeemOrCastBallot(body);

    return c.json({
      success: true,
      redemption,
      message: redemption.message
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao processar resgate do token cego.'
    }, 400);
  }
});

/**
 * POST /api/blind-signatures/verify
 * Verificação Universal de Fé Pública e Não-Reutilização
 */
blindSignaturesRouter.post('/verify', async (c) => {
  try {
    const body = await c.req.json<VerifyBlindTokenDTO>();

    if (!body.originalMessage || !body.unblindedSignatureHex || !body.authorityKeyId || !body.purpose) {
      return c.json({
        success: false,
        message: 'Campos originais, assinatura descegada, autoridade e finalidade são obrigatórios.'
      }, 400);
    }

    const verification = await blindService.verifyBlindToken(body);

    return c.json({
      success: true,
      verification,
      message: verification.message
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao verificar assinatura cega.'
    }, 500);
  }
});

/**
 * POST /api/blind-signatures/simulate-double-spend
 * Simulação de Ataque de Duplo Voto / Resgate Repetido
 */
blindSignaturesRouter.post('/simulate-double-spend', async (c) => {
  try {
    const body = await c.req.json<SimulateDoubleSpendDTO>();

    if (!body.unblindedToken) {
      return c.json({
        success: false,
        message: 'Token para simulação de double-spend é obrigatório.'
      }, 400);
    }

    const result = await blindService.simulateDoubleSpend(body);

    return c.json({
      success: true,
      ...result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao simular duplo resgate.'
    }, 500);
  }
});

/**
 * POST /api/blind-signatures/verify-seal
 * Validação Forense do Selo Probatório WORM
 */
blindSignaturesRouter.post('/verify-seal', async (c) => {
  try {
    const body = await c.req.json<VerifyBlindSealDTO>();

    if (!body.sealToken) {
      return c.json({
        success: false,
        message: 'Token de selo probatório é obrigatório.'
      }, 400);
    }

    const verification = blindService.verifySeal(body);

    return c.json({
      success: true,
      ...verification
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao verificar selo probatório.'
    }, 500);
  }
});
