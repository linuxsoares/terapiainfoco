import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import { tlsPinningService } from '../services/tlsPinningService';
import type {
  ValidateTlsPinDTO,
  RegisterTlsPinDTO,
  RotateTlsCaDTO,
  QuarantineCompromisedCaDTO,
  VerifyTlsPinSealDTO
} from '@terapiainfoco/shared';

export const tlsPinningRouter = new Hono();

// Ferramenta da plataforma (painel de Segurança): exclusiva do Admin
tlsPinningRouter.use('*', authMiddleware(), requireRoles([UserRole.ADMIN]));

/**
 * GET /api/tls-pinning/overview
 * Visão Geral de Métricas, Pins Ativos, CAs Quarentenadas e Validações Recentes
 */
tlsPinningRouter.get('/overview', (c) => {
  try {
    const overview = tlsPinningService.getOverview();
    return c.json({
      success: true,
      overview
    });
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao obter overview de TLS Pinning.'
    }, 500);
  }
});

/**
 * POST /api/tls-pinning/validate
 * Valida a conexão TLS de um domínio clínico contra os Pins SPKI cadastrados
 */
tlsPinningRouter.post('/validate', async (c) => {
  try {
    const body = await c.req.json<ValidateTlsPinDTO>();
    if (!body.hostname) {
      return c.json({
        success: false,
        message: 'O campo hostname é obrigatório para validação de TLS Pinning.'
      }, 400);
    }

    const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
    const result = await tlsPinningService.validateTlsConnection(body, 'dpo-network-guard', ip);

    return c.json({
      success: true,
      result,
      message: result.recommendation
    });
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao validar apresentação de TLS Pinning.'
    }, 500);
  }
});

/**
 * POST /api/tls-pinning/register-pin
 * Cadastra um novo Pin SPKI (Primary ou Backup de rotação)
 */
tlsPinningRouter.post('/register-pin', async (c) => {
  try {
    const body = await c.req.json<RegisterTlsPinDTO>();
    if (!body.hostname || !body.spkiSha256 || !body.caIssuer) {
      return c.json({
        success: false,
        message: 'Hostname, spkiSha256 e caIssuer são obrigatórios.'
      }, 400);
    }

    const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
    const pin = await tlsPinningService.registerPin(body, 'dpo-ca-admin', ip);

    return c.json({
      success: true,
      pin,
      message: `Pin SPKI para '${pin.hostname}' cadastrado com sucesso (${pin.type}).`
    }, 201);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao cadastrar Pin SPKI.'
    }, 500);
  }
});

/**
 * POST /api/tls-pinning/rotate-ca
 * Promove um Backup Pin para Primary Pin (Rotação Suave de CA)
 */
tlsPinningRouter.post('/rotate-ca', async (c) => {
  try {
    const body = await c.req.json<RotateTlsCaDTO>();
    if (!body.hostname || !body.newPrimaryPinId) {
      return c.json({
        success: false,
        message: 'Hostname e newPrimaryPinId são obrigatórios.'
      }, 400);
    }

    const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
    const rotation = await tlsPinningService.rotateCa(body, 'dpo-security-admin', ip);

    return c.json({
      success: true,
      promotedPin: rotation.promotedPin,
      demotedPin: rotation.demotedPin,
      rotatedAt: rotation.rotatedAt,
      message: `Rotação de CA executada com sucesso para '${rotation.promotedPin.hostname}'. Pin '${rotation.promotedPin.pinId}' promovido a PRIMARY.`
    });
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao executar rotação de CA.'
    }, 500);
  }
});

/**
 * POST /api/tls-pinning/quarantine-ca
 * Coloca uma CA em quarentena de segurança e revoga pins associados
 */
tlsPinningRouter.post('/quarantine-ca', async (c) => {
  try {
    const body = await c.req.json<QuarantineCompromisedCaDTO>();
    if (!body.caCommonNameOrIdentifier) {
      return c.json({
        success: false,
        message: 'Identificador ou Common Name da CA é obrigatório.'
      }, 400);
    }

    const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
    const result = await tlsPinningService.quarantineCa(body, 'dpo-threat-intel', ip);

    return c.json({
      success: true,
      quarantinedCa: result.quarantinedCa,
      revokedPinsCount: result.revokedPinsCount,
      quarantinedAt: result.quarantinedAt,
      message: `Autoridade Certificadora '${result.quarantinedCa}' colocada em quarentena compulsória. ${result.revokedPinsCount} pins suspensos.`
    });
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao quarentenar Autoridade Certificadora.'
    }, 500);
  }
});

/**
 * POST /api/tls-pinning/verify-seal
 * Valida a integridade matemática do Selo Notarial WORM de TLS Pinning
 */
tlsPinningRouter.post('/verify-seal', (c) => {
  try {
    const body = c.req.header('content-type')?.includes('application/json')
      ? (c.req.raw as any).body
      : null;
    return c.req.json<VerifyTlsPinSealDTO>().then(data => {
      if (!data.sealToken) {
        return c.json({
          success: false,
          isValid: false,
          message: 'Token de selo probatório (sealToken) é obrigatório.'
        }, 400);
      }

      const verified = tlsPinningService.verifySeal(data.sealToken);
      return c.json({
        success: verified.isValid,
        isValid: verified.isValid,
        seal: verified.seal,
        message: verified.message,
        verifiedAt: verified.verifiedAt
      });
    });
  } catch (err: any) {
    return c.json({
      success: false,
      isValid: false,
      message: err.message || 'Falha ao verificar selo probatório WORM.'
    }, 500);
  }
});
