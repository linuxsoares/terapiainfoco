import { Hono } from 'hono';
import { AnalyticsService } from '../services/analyticsService';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import { CLINICAL_ROLES, requirePatientAccess } from '../middlewares/accessPolicy';

export const analyticsRoute = new Hono();

/**
 * GET /api/analytics/clinical-overview
 * Visão consolidada de KPIs clínicos do consultório/terapeuta
 */
analyticsRoute.get(
  '/clinical-overview',
  authMiddleware({ strict: true }),
  // KPIs clínicos são do consultório: Admin/DPO não lê conteúdo clínico (RFC-001 §4.5)
  requireRoles(CLINICAL_ROLES),
  async (c) => {
    try {
      const therapistId = c.get('user').therapistId;
      if (!therapistId) {
        return c.json({ success: false, error: 'Usuário sem consultório vinculado.' }, 403);
      }
      const overview = await AnalyticsService.getClinicalOverview(therapistId);
      return c.json({ success: true, ...overview }, 200);
    } catch (err: any) {
      return c.json({ success: false, error: err.message || 'Erro ao carregar métricas clínicas.' }, 500);
    }
  }
);

/**
 * GET /api/analytics/security-metrics
 * Observabilidade de segurança, integridade da trilha WORM e proteção contra ameaças
 */
analyticsRoute.get(
  '/security-metrics',
  authMiddleware({ strict: true }),
  requireRoles([UserRole.PSICOLOGO_TITULAR, UserRole.ADMIN]),
  async (c) => {
    try {
      const user = c.get('user');
      const metrics = await AnalyticsService.getSecurityMetrics(user.role === UserRole.ADMIN ? undefined : user.therapistId ?? user.id);
      return c.json({ success: true, ...metrics }, 200);
    } catch (err: any) {
      return c.json({ success: false, error: err.message || 'Erro ao carregar métricas de segurança.' }, 500);
    }
  }
);

/**
 * GET /api/analytics/patient/:patientId
 * Indicadores longitudinais e evolução terapêutica de paciente individual
 */
analyticsRoute.get(
  '/patient/:patientId',
  authMiddleware({ strict: true }),
  // A evolução traz trechos do SOAP: só perfis clínicos do próprio consultório
  requireRoles(CLINICAL_ROLES),
  requirePatientAccess('patientId'),
  async (c) => {
    try {
      const patientId = c.req.param('patientId');
      const metrics = await AnalyticsService.getPatientClinicalMetrics(patientId);
      return c.json({ success: true, ...metrics }, 200);
    } catch (err: any) {
      return c.json({ success: false, error: err.message || 'Erro ao carregar evolução do paciente.' }, 404);
    }
  }
);
