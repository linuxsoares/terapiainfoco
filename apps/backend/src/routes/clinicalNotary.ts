import { Hono } from 'hono';
import { UserRole } from '@terapiainfoco/shared';
import type {
  SealClinicalRecordDTO,
  VerifyNotarySealDTO,
  IssueNotaryCertificateDTO
} from '@terapiainfoco/shared';
import { ClinicalNotaryService } from '../services/clinicalNotaryService';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

export const clinicalNotaryRoutes = new Hono();

const service = ClinicalNotaryService.getInstance();
const requireClinicalOrAdmin = requireRoles([UserRole.PSICOLOGO_TITULAR, UserRole.ADMIN]);

/**
 * POST /api/notary/seal
 * Notariza formalmente uma nota clínica com blind indexing e encadeamento WORM
 * Acesso: PSICOLOGO_TITULAR, ADMIN
 */
clinicalNotaryRoutes.post(
  '/seal',
  authMiddleware({ strict: true }),
  requireClinicalOrAdmin,
  async (c) => {
    try {
      const dto = await c.req.json<SealClinicalRecordDTO>();
      if (!dto.recordId || !dto.patientId || !dto.therapistId) {
        return c.json(
          {
            success: false,
            message: 'Parâmetros obrigatórios ausentes: recordId, patientId e therapistId.'
          },
          400
        );
      }

      const user = c.get('user');
      const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
      const userAgent = c.req.header('user-agent') || 'Unknown';

      const block = service.notarizeRecord(dto, {
        id: user?.id || 'ANONYMOUS',
        role: user?.role || 'UNKNOWN',
        ipAddress,
        userAgent
      });

      return c.json({
        success: true,
        block,
        message: 'Prontuário clínico notarizado com sucesso no cartório digital.'
      });
    } catch (err: any) {
      return c.json(
        {
          success: false,
          message: err.message || 'Falha ao notarizar prontuário clínico.'
        },
        500
      );
    }
  }
);

/**
 * POST /api/notary/verify
 * Perícia Zero-Knowledge de autenticidade notarial via selo digital ou Blind Index
 * Acesso: Aberto / Público com token de verificação
 */
clinicalNotaryRoutes.post('/verify', async (c) => {
  try {
    const dto = await c.req.json<VerifyNotarySealDTO>();
    if (!dto.sealTokenOrBlindIndex) {
      return c.json(
        {
          success: false,
          message: 'Parâmetro obrigatório ausente: sealTokenOrBlindIndex.'
        },
        400
      );
    }

    const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
    const result = service.verifySeal(dto.sealTokenOrBlindIndex, {
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
        message: err.message || 'Falha ao verificar selo notarial digital.'
      },
      500
    );
  }
});

/**
 * GET /api/notary/patient/:patientId
 * Retorna o histórico cronológico de blocos notariais de um paciente e validação da cadeia
 * Acesso: PSICOLOGO_TITULAR, ADMIN
 */
clinicalNotaryRoutes.get(
  '/patient/:patientId',
  authMiddleware({ strict: true }),
  requireClinicalOrAdmin,
  async (c) => {
    try {
      const patientId = c.req.param('patientId');
      const blocks = service.getPatientNotaryBlocks(patientId);
      const chainVerification = service.verifyPatientChain(patientId);

      return c.json({
        success: true,
        patientId,
        blocks,
        chainVerification
      });
    } catch (err: any) {
      return c.json(
        {
          success: false,
          message: err.message || 'Falha ao buscar blocos notariais do paciente.'
        },
        500
      );
    }
  }
);

/**
 * POST /api/notary/certificate
 * Emite certidão forense de autenticidade notarial com carimbo de fé pública
 * Acesso: PSICOLOGO_TITULAR, ADMIN
 */
clinicalNotaryRoutes.post(
  '/certificate',
  authMiddleware({ strict: true }),
  requireClinicalOrAdmin,
  async (c) => {
    try {
      const dto = await c.req.json<IssueNotaryCertificateDTO>();
      if (!dto.recordId || !dto.patientId) {
        return c.json(
          {
            success: false,
            message: 'Parâmetros obrigatórios ausentes: recordId e patientId.'
          },
          400
        );
      }

      const user = c.get('user');
      const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';

      const certificate = await service.issueCertificate(dto, {
        id: user?.id || 'NOTARY_CLERK',
        role: user?.role || 'PSICOLOGO_TITULAR',
        ipAddress
      });

      return c.json({
        success: true,
        certificate
      });
    } catch (err: any) {
      return c.json(
        {
          success: false,
          message: err.message || 'Falha ao emitir certidão notarial de prontuário.'
        },
        500
      );
    }
  }
);

/**
 * GET /api/notary/overview
 * Retorna visão geral do cartório digital, KPIs e histórico recente de blocos
 * Acesso: Autenticado
 */
clinicalNotaryRoutes.get(
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
          message: err.message || 'Falha ao obter dados consolidados do cartório notarial.'
        },
        500
      );
    }
  }
);
