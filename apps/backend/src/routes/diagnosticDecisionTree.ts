import { Hono } from 'hono';
import { authMiddleware } from '../middlewares/authMiddleware';
import { diagnosticDecisionTreeService } from '../services/diagnosticDecisionTreeService';
import type { SaveDiagnosticAssessmentDTO } from '@terapiainfoco/shared';

export const diagnosticDecisionTreeRouter = new Hono();

/**
 * GET /api/diagnostic-tree/definition
 * Retorna as trilhas clínicas, nós de decisão ramificados e questionários psicométricos basais
 */
diagnosticDecisionTreeRouter.get('/definition', authMiddleware(), (c) => {
  const definition = diagnosticDecisionTreeService.getDecisionTreeDefinition();
  return c.json(definition);
});

/**
 * POST /api/diagnostic-tree/assessments
 * Submete as respostas da árvore, calcula escores psicométricos basais e gera relatório com FLE
 */
diagnosticDecisionTreeRouter.post('/assessments', authMiddleware(), async (c) => {
  try {
    const user = c.get('user');
    const therapistId = user?.therapistId || user?.id || 'therapist-001';
    const body = await c.req.json<SaveDiagnosticAssessmentDTO>();

    if (!body.patientId || !body.primaryTrack || !Array.isArray(body.answers)) {
      return c.json(
        {
          success: false,
          error: 'Parâmetros obrigatórios ausentes: patientId, primaryTrack e answers são necessários'
        },
        400
      );
    }

    const response = await diagnosticDecisionTreeService.saveAssessment(body, therapistId);
    return c.json(response, 201);
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: error.message || 'Erro ao processar avaliação diagnóstica interativa'
      },
      error.message?.includes('não encontrado') ? 404 : 400
    );
  }
});

/**
 * GET /api/diagnostic-tree/patients/:patientId/assessments
 * Lista o histórico de avaliações diagnósticas realizadas para um paciente
 */
diagnosticDecisionTreeRouter.get('/patients/:patientId/assessments', authMiddleware(), (c) => {
  try {
    const { patientId } = c.req.param();
    const reports = diagnosticDecisionTreeService.listPatientAssessments(patientId);
    return c.json({
      success: true,
      reports,
      total: reports.length
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: error.message || 'Erro ao listar avaliações do paciente'
      },
      500
    );
  }
});

/**
 * GET /api/diagnostic-tree/assessments/:id
 * Busca um relatório diagnóstico específico com campos clínicos decifrados
 */
diagnosticDecisionTreeRouter.get('/assessments/:id', authMiddleware(), (c) => {
  try {
    const { id } = c.req.param();
    const report = diagnosticDecisionTreeService.getAssessmentById(id);
    if (!report) {
      return c.json(
        {
          success: false,
          error: 'Relatório de avaliação diagnóstica não encontrado'
        },
        404
      );
    }

    return c.json({
      success: true,
      report
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: error.message || 'Erro ao buscar relatório diagnóstico'
      },
      500
    );
  }
});
