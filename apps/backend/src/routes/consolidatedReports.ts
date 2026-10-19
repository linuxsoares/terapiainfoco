import { Hono } from 'hono';
import {
  UserRole,
  type GenerateConsolidatedReportDTO,
  type SignConsolidatedReportDTO
} from '@terapiainfoco/shared';
import { ConsolidatedReportService } from '../services/consolidatedReportService';
import { authMiddleware, requireRole } from '../middlewares/authMiddleware';
import { CLINICAL_ROLES, canAccessEntity, requireBodyOwnership, requireOwnedResource, requirePatientAccess } from '../middlewares/accessPolicy';
import { db } from '../db/memoryDb';

export const consolidatedReportsRouter = new Hono();

consolidatedReportsRouter.use('*', authMiddleware(), requireRole(CLINICAL_ROLES), requireBodyOwnership());

/**
 * POST /api/reports/consolidated/generate
 * Gera Laudo Pericial Multi-Sessões ou Relatório Psicológico Consolidado (CFP nº 006/2019)
 */
consolidatedReportsRouter.post('/generate', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json<GenerateConsolidatedReportDTO>();

    if (!body.patientId || !body.solicitante || !body.finalidade || !body.descricaoDemanda) {
      return c.json({
        success: false,
        error: 'Campos obrigatórios: patientId, solicitante, finalidade e descricaoDemanda'
      }, 400);
    }

    const therapistId = user.therapistId!;
    const report = ConsolidatedReportService.generateReport({
      therapistId,
      dto: body,
      context: {
        actorId: user.id,
        ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
        userAgent: c.req.header('user-agent')
      }
    });

    return c.json({ success: true, report, message: 'Laudo/Relatório Consolidado gerado com sucesso.' }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

/**
 * POST /api/reports/consolidated/sign
 * Assina digitalmente o relatório com carimbo ICP-Brasil e validação do CRP
 */
consolidatedReportsRouter.post('/sign', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json<SignConsolidatedReportDTO>();

    if (!body.reportId) {
      return c.json({ success: false, error: 'reportId é obrigatório' }, 400);
    }
    if (!canAccessEntity(c.get('user'), db.consolidatedReports.get(body.reportId))) {
      return c.json({ success: false, error: 'Laudo não encontrado.' }, 404);
    }

    const therapistId = user.therapistId!;
    const report = ConsolidatedReportService.signReport({
      reportId: body.reportId,
      therapistId,
      signatureToken: body.signatureToken,
      context: {
        actorId: user.id,
        ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
        userAgent: c.req.header('user-agent')
      }
    });

    return c.json({ success: true, report, message: 'Documento assinado digitalmente com sucesso.' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

/**
 * GET /api/reports/consolidated/:reportId
 * Obtém os detalhes decriptografados do relatório
 */
consolidatedReportsRouter.get('/:reportId', requireOwnedResource((id) => db.consolidatedReports.get(id), 'Laudo', 'reportId'), async (c) => {
  try {
    const user = c.get('user');
    const reportId = c.req.param('reportId');

    const report = ConsolidatedReportService.getById(reportId, {
      actorId: user.id,
      ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
      userAgent: c.req.header('user-agent')
    });

    if (!report) {
      return c.json({ success: false, error: 'Relatório não encontrado' }, 404);
    }

    return c.json({ success: true, report });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

/**
 * GET /api/reports/consolidated/patient/:patientId
 * Lista relatórios consolidados de um paciente
 */
consolidatedReportsRouter.get('/patient/:patientId', requirePatientAccess('patientId'), async (c) => {
  try {
    const user = c.get('user');
    const patientId = c.req.param('patientId');

    const reports = ConsolidatedReportService.listByPatient(patientId, {
      actorId: user.id,
      ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
      userAgent: c.req.header('user-agent')
    });

    return c.json({ success: true, reports, total: reports.length });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});
