import { Hono } from 'hono';
import { UserRole } from '@terapiainfoco/shared';
import type {
  ExecuteDataPurgeDTO,
  VerifyPurgeProofDTO
} from '@terapiainfoco/shared';
import { SecurePurgeService } from '../services/securePurgeService';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

export const securePurgeRoutes = new Hono();

const service = SecurePurgeService.getInstance();
const requireClinicalOrAdmin = requireRoles([UserRole.PSICOLOGO_TITULAR, UserRole.ADMIN]);

/**
 * GET /api/purge/candidates
 * Retorna os candidatos a expurgo avaliando o prazo de guarda legal de 5 anos (CFP nº 001/2009)
 * Acesso: PSICOLOGO_TITULAR, ADMIN
 */
securePurgeRoutes.get(
  '/candidates',
  authMiddleware({ strict: true }),
  requireClinicalOrAdmin,
  async (c) => {
    try {
      const candidates = service.getCandidates();
      return c.json({
        success: true,
        count: candidates.length,
        candidates
      });
    } catch (err: any) {
      return c.json(
        {
          success: false,
          message: err.message || 'Falha ao buscar candidatos a expurgo.'
        },
        500
      );
    }
  }
);

/**
 * POST /api/purge/execute
 * Executa o expurgamento criptográfico irreversível (NIST SP 800-88) e emite a certidão probatória
 * Acesso: PSICOLOGO_TITULAR, ADMIN
 */
securePurgeRoutes.post(
  '/execute',
  authMiddleware({ strict: true }),
  requireClinicalOrAdmin,
  async (c) => {
    try {
      const dto = await c.req.json<ExecuteDataPurgeDTO>();
      if (!dto.patientId || !dto.purgeReason) {
        return c.json(
          {
            success: false,
            message: 'Parâmetros obrigatórios ausentes: patientId e purgeReason.'
          },
          400
        );
      }

      const user = c.get('user');
      const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
      const userAgent = c.req.header('user-agent') || 'Unknown';

      const result = service.executePurge(dto, {
        id: user?.id || 'DPO_OPERATOR',
        role: user?.role || 'PSICOLOGO_TITULAR',
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
          message: err.message || 'Falha ao executar expurgamento de dados.'
        },
        err.message?.includes('bloqueado') ? 403 : 500
      );
    }
  }
);

/**
 * POST /api/purge/verify
 * Perícia pública Zero-Knowledge da prova criptográfica de destruição (NIST SP 800-88 & LGPD Art. 16)
 * Acesso: Aberto / Público
 */
securePurgeRoutes.post('/verify', async (c) => {
  try {
    const dto = await c.req.json<VerifyPurgeProofDTO>();
    if (!dto.purgeSealOrCertificateId) {
      return c.json(
        {
          success: false,
          message: 'Parâmetro obrigatório ausente: purgeSealOrCertificateId.'
        },
        400
      );
    }

    const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
    const result = service.verifyPurgeProof(dto.purgeSealOrCertificateId, {
      id: 'PUBLIC_VERIFIER',
      role: 'ANONYMOUS',
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
        message: err.message || 'Falha ao verificar prova de expurgo.'
      },
      500
    );
  }
});

/**
 * GET /api/purge/overview
 * Retorna os indicadores consolidados de expurgo e histórico recente de certidões
 * Acesso: PSICOLOGO_TITULAR, ADMIN
 */
securePurgeRoutes.get(
  '/overview',
  authMiddleware({ strict: true }),
  requireClinicalOrAdmin,
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
          message: err.message || 'Falha ao carregar visão geral de expurgo.'
        },
        500
      );
    }
  }
);

/**
 * GET /api/purge/certificate/:certificateId
 * Retorna uma certidão específica de expurgo pelo ID
 * Acesso: PSICOLOGO_TITULAR, ADMIN
 */
securePurgeRoutes.get(
  '/certificate/:certificateId',
  authMiddleware({ strict: true }),
  requireClinicalOrAdmin,
  async (c) => {
    try {
      const certificateId = c.req.param('certificateId');
      const certificate = service.getCertificateById(certificateId);

      if (!certificate) {
        return c.json(
          {
            success: false,
            message: 'Certidão de expurgo não localizada.'
          },
          404
        );
      }

      return c.json({
        success: true,
        certificate
      });
    } catch (err: any) {
      return c.json(
        {
          success: false,
          message: err.message || 'Falha ao buscar certidão de expurgo.'
        },
        500
      );
    }
  }
);
