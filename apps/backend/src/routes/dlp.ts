import { Hono } from 'hono';
import { UserRole, DlpPolicyMode } from '@terapiainfoco/shared';
import type {
  EvaluateClipboardDlpDTO,
  InspectClipboardDlpDTO,
  UpdateDlpPolicyDTO
} from '@terapiainfoco/shared';
import { DlpService } from '../services/dlpService';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

export const dlpRoutes = new Hono();

const service = DlpService.getInstance();
const requireStaff = requireRoles([UserRole.PSICOLOGO_TITULAR, UserRole.RECEPCAO_SECRETARIA, UserRole.ADMIN]);
const requireClinicalOrAdmin = requireRoles([UserRole.PSICOLOGO_TITULAR, UserRole.ADMIN]);
const requireAdmin = requireRoles([UserRole.ADMIN]);

/**
 * POST /api/dlp/evaluate
 * Avalia tentativa de cópia de prontuário, aplicando esteganografia zero-width e políticas de DLP
 * Acesso: PSICOLOGO_TITULAR, RECEPCAO_SECRETARIA, ADMIN
 */
dlpRoutes.post(
  '/evaluate',
  authMiddleware({ strict: true }),
  requireStaff,
  async (c) => {
    try {
      const dto = await c.req.json<EvaluateClipboardDlpDTO>();
      if (!dto.text || !dto.patientId) {
        return c.json(
          {
            success: false,
            message: 'Parâmetros inválidos: text e patientId são obrigatórios para a avaliação de DLP.'
          },
          400
        );
      }

      const user = c.get('user');
      const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
      const userAgent = c.req.header('user-agent') || 'Unknown';

      const result = await service.evaluateCopyAttempt(dto, {
        id: user?.id || 'ANONYMOUS',
        name: user?.name,
        role: user?.role || 'UNKNOWN',
        ipAddress,
        userAgent
      });

      return c.json({
        success: true,
        result
      });
    } catch (err: any) {
      return c.json(
        {
          success: false,
          message: err.message || 'Falha ao avaliar política de DLP para a área de transferência.'
        },
        500
      );
    }
  }
);

/**
 * POST /api/dlp/inspect
 * Perícia forense de texto suspeito: decodifica marca d'água esteganográfica e comprova procedência
 * Acesso: PSICOLOGO_TITULAR, ADMIN
 */
dlpRoutes.post(
  '/inspect',
  authMiddleware({ strict: true }),
  requireClinicalOrAdmin,
  async (c) => {
    try {
      const dto = await c.req.json<InspectClipboardDlpDTO>();
      if (!dto.suspiciousText) {
        return c.json(
          {
            success: false,
            message: 'Parâmetro obrigatório ausente: suspiciousText.'
          },
          400
        );
      }

      const user = c.get('user');
      const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';

      const result = service.inspectText(dto, {
        id: user?.id || 'FORENSIC_OFFICER',
        name: user?.name,
        role: user?.role || 'ADMIN',
        ipAddress
      });

      return c.json({
        success: true,
        result
      });
    } catch (err: any) {
      return c.json(
        {
          success: false,
          message: err.message || 'Falha ao realizar inspeção esteganográfica do texto.'
        },
        500
      );
    }
  }
);

/**
 * GET /api/dlp/overview
 * Retorna visão geral de DLP, KPIs regulatórios e eventos recentes
 * Acesso: Todos os usuários autenticados
 */
dlpRoutes.get(
  '/overview',
  authMiddleware({ strict: true }),
  async (c) => {
    try {
      const overview = service.getOverview();
      return c.json({
        success: true,
        overview
      });
    } catch (err: any) {
      return c.json(
        {
          success: false,
          message: err.message || 'Falha ao obter dados consolidados de DLP.'
        },
        500
      );
    }
  }
);

/**
 * PUT /api/dlp/policy
 * Atualiza o modo da política global de DLP (ex: WATERMARK_ONLY, BLOCK_EXFILTRATION, MASK_SENSITIVE)
 * Acesso: Exclusivo ADMIN
 */
dlpRoutes.put(
  '/policy',
  authMiddleware({ strict: true }),
  requireAdmin,
  async (c) => {
    try {
      const dto = await c.req.json<UpdateDlpPolicyDTO>();
      if (!dto.policyMode || !Object.values(DlpPolicyMode).includes(dto.policyMode)) {
        return c.json(
          {
            success: false,
            message: 'Modo de política DLP inválido ou não suportado.'
          },
          400
        );
      }

      const user = c.get('user');
      const activePolicy = service.updatePolicy(dto.policyMode, {
        id: user?.id || 'ADMIN_CONSOLE',
        role: user?.role || UserRole.ADMIN
      });

      return c.json({
        success: true,
        activePolicy,
        message: `Política de DLP atualizada para ${activePolicy} com sucesso.`
      });
    } catch (err: any) {
      return c.json(
        {
          success: false,
          message: err.message || 'Falha ao atualizar política de DLP.'
        },
        500
      );
    }
  }
);
