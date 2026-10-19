import { Hono } from 'hono';
import { AnalyticsService } from '../services/analyticsService';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import { requirePatientAccess } from '../middlewares/accessPolicy';

export const analyticsRoute = new Hono();

/**
 * GET /api/analytics/clinical-overview
 * Visão consolidada de KPIs clínicos do consultório/terapeuta
 */
analyticsRoute.get(
  '/clinical-overview',
  authMiddleware({ strict: true }),
  requireRoles([UserRole.PSICOLOGO_TITULAR, UserRole.SUPERVISOR_CLINICO, UserRole.ADMIN]),
  async (c) => {
    try {
      // Psicólogo e supervisor veem só o próprio consultório; o admin pode filtrar (ou ver o agregado)
      const user = c.get('user');
      const therapistId = user.role === UserRole.ADMIN ? c.req.query('therapistId') || undefined : user.therapistId;
      if (!therapistId && user.role !== UserRole.ADMIN) {
        return c.json({ success: false, error: 'Usuário sem consultório vinculado.' }, 403);
      }
      const overview = AnalyticsService.getClinicalOverview(therapistId);
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
      const metrics = AnalyticsService.getSecurityMetrics(user.role === UserRole.ADMIN ? undefined : user.therapistId ?? user.id);
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
  requireRoles([UserRole.PSICOLOGO_TITULAR, UserRole.SUPERVISOR_CLINICO, UserRole.ADMIN]),
  requirePatientAccess('patientId', { allowDpo: true }),
  async (c) => {
    try {
      const patientId = c.req.param('patientId');
      const metrics = AnalyticsService.getPatientClinicalMetrics(patientId);
      return c.json({ success: true, ...metrics }, 200);
    } catch (err: any) {
      return c.json({ success: false, error: err.message || 'Erro ao carregar evolução do paciente.' }, 404);
    }
  }
);
