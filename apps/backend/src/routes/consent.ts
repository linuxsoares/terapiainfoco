import { Hono } from 'hono';
import { UserRole, ConsentScope } from '@terapiainfoco/shared';
import type {
  GrantGranularConsentDTO,
  RevokeGranularConsentDTO,
  EnforceConsentDTO
} from '@terapiainfoco/shared';
import { ConsentService } from '../services/consentService';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

export const consentRoutes = new Hono();

const service = ConsentService.getInstance();
const requireStaff = requireRoles([UserRole.PSICOLOGO_TITULAR, UserRole.RECEPCAO_SECRETARIA, UserRole.ADMIN]);
const requireClinicalStaff = requireRoles([UserRole.PSICOLOGO_TITULAR, UserRole.ADMIN]);

/**
 * POST /api/consent/grant
 * Registra concessão ou atualização granular de consentimento do paciente com emissão de recibo WORM
 * Acesso: PSICOLOGO_TITULAR, RECEPCAO_SECRETARIA, ADMIN
 */
consentRoutes.post(
  '/grant',
  authMiddleware({ strict: true }),
  requireStaff,
  async (c) => {
    try {
      const dto = await c.req.json<GrantGranularConsentDTO>();
      if (!dto.patientId || !Array.isArray(dto.scopes) || dto.scopes.length === 0) {
        return c.json(
          {
            success: false,
            message: 'Parâmetros inválidos: patientId e lista de scopes são obrigatórios.'
          },
          400
        );
      }

      const user = c.get('user');
      const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
      const userAgent = c.req.header('user-agent') || 'Unknown';

      const response = service.grantGranularConsent(dto, {
        actorId: user?.id || 'ANONYMOUS',
        ipAddress,
        userAgent
      });

      return c.json(response);
    } catch (err: any) {
      return c.json(
        {
          success: false,
          message: err.message || 'Falha ao registrar consentimento granular.'
        },
        500
      );
    }
  }
);

/**
 * POST /api/consent/revoke
 * Executa Smart Revocation de um escopo específico com justificativa regulatória (LGPD Art. 8º §5º)
 * Acesso: PSICOLOGO_TITULAR, RECEPCAO_SECRETARIA, ADMIN
 */
consentRoutes.post(
  '/revoke',
  authMiddleware({ strict: true }),
  requireStaff,
  async (c) => {
    try {
      const dto = await c.req.json<RevokeGranularConsentDTO>();
      if (!dto.patientId || !dto.scope || !dto.reason) {
        return c.json(
          {
            success: false,
            message: 'Parâmetros obrigatórios: patientId, scope e reason são necessários para revogação formal.'
          },
          400
        );
      }

      const user = c.get('user');
      const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
      const userAgent = c.req.header('user-agent') || 'Unknown';

      const response = service.revokeConsent(dto, {
        actorId: user?.id || 'ANONYMOUS',
        ipAddress,
        userAgent
      });

      return c.json(response);
    } catch (err: any) {
      return c.json(
        {
          success: false,
          message: err.message || 'Falha ao executar Smart Revocation.'
        },
        500
      );
    }
  }
);

/**
 * GET /api/consent/patient/:patientId
 * Retorna o prontuário de consentimento granular do paciente com histórico completo
 */
consentRoutes.get(
  '/patient/:patientId',
  authMiddleware({ strict: true }),
  async (c) => {
    const patientId = c.req.param('patientId');
    if (!patientId) {
      return c.json({ success: false, message: 'ID do paciente obrigatório.' }, 400);
    }

    const ledger = service.getPatientLedger(patientId);

    return c.json({
      success: true,
      ledger
    });
  }
);

/**
 * POST /api/consent/enforce
 * Avalia se o tratamento para o escopo pretendido é autorizado pelo titular
 */
consentRoutes.post(
  '/enforce',
  authMiddleware({ strict: true }),
  async (c) => {
    try {
      const dto = await c.req.json<EnforceConsentDTO>();
      if (!dto.patientId || !dto.requestedScope) {
        return c.json(
          {
            success: false,
            message: 'patientId e requestedScope são obrigatórios.'
          },
          400
        );
      }

      const user = c.get('user');
      const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
      const userAgent = c.req.header('user-agent') || 'Unknown';

      const result = service.enforceScope(dto.patientId, dto.requestedScope, {
        actorId: user?.id,
        ipAddress,
        userAgent
      });

      return c.json({
        success: true,
        result
      });
    } catch (err: any) {
      return c.json({ success: false, message: err.message }, 500);
    }
  }
);

/**
 * GET /api/consent/verify/:token
 * Endpoint público de verificação de autenticidade de recibo via token TCLE (Zero-Knowledge)
 */
consentRoutes.get(
  '/verify/:token',
  async (c) => {
    const token = c.req.param('token');
    if (!token) {
      return c.json({ success: false, valid: false, message: 'Token de consentimento obrigatório.' }, 400);
    }

    const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'Unknown';

    const result = service.verifyReceiptByToken(token, {
      ipAddress,
      userAgent
    });

    return c.json(result);
  }
);

/**
 * GET /api/consent/overview
 * Retorna panorama executivo de governança de consentimento (LGPD) e recibos recentes
 */
consentRoutes.get(
  '/overview',
  authMiddleware({ strict: true }),
  requireClinicalStaff,
  async (c) => {
    const patientId = c.req.query('patientId');
    const data = service.getOverview(patientId);

    return c.json({
      success: true,
      ...data
    });
  }
);
