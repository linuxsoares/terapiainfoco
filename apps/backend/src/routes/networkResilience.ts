import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import { NetworkResilienceService } from '../services/networkResilienceService';
import type {
  NetworkSimulationPresetsResponse,
  NetworkSimulationResponse,
  NetworkResilienceHistoryResponse,
  RunNetworkSimulationDTO
} from '@terapiainfoco/shared';

export const networkResilienceRoute = new Hono();

// Autenticação obrigatória estrita
networkResilienceRoute.use('*', authMiddleware({ strict: true }));
const requireStaff = requireRoles([UserRole.PSICOLOGO_TITULAR, UserRole.ADMIN]);

const service = NetworkResilienceService.getInstance();

/**
 * 1. Presets Padronizados de Simulação de Rede Clínica
 */
networkResilienceRoute.get('/presets', requireStaff, (c) => {
  const presets = service.getPresets();
  const response: NetworkSimulationPresetsResponse = {
    success: true,
    presets
  };
  return c.json(response, 200);
});

/**
 * 2. Executar Simulação de Resiliência de Rede & Degradação sob Demanda
 */
networkResilienceRoute.post('/simulate', requireStaff, async (c) => {
  const user = c.get('user');
  const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent') || 'Unknown';
  const body = await c.req.json<RunNetworkSimulationDTO>().catch(() => ({}));

  const report = await service.runSimulation({
    therapistId: user?.id || '00000000-0000-0000-0000-000000000001',
    dto: body,
    ipAddress,
    userAgent
  });

  const response: NetworkSimulationResponse = {
    success: true,
    report,
    message: report.assessment.requiresContingency
      ? `Simulação concluída com alerta crítico: MOS ${report.assessment.mosScore}. Contingência ética necessária conforme CFP nº 011/2018.`
      : `Simulação concluída com sucesso: MOS ${report.assessment.mosScore} (${report.assessment.intelligibilityGrade}). Canal de telepsicologia aprovado.`
  };

  return c.json(response, 200);
});

/**
 * 3. Histórico de Simulações e Métricas Agregadas
 */
networkResilienceRoute.get('/history', requireStaff, (c) => {
  const limitParam = c.req.query('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 20;

  const reports = service.getHistory(limit);
  const metrics = service.getMetrics();

  const response: NetworkResilienceHistoryResponse = {
    success: true,
    reports,
    metrics
  };

  return c.json(response, 200);
});

/**
 * 4. Métricas Consolidadas de Resiliência
 */
networkResilienceRoute.get('/metrics', requireStaff, (c) => {
  const metrics = service.getMetrics();
  return c.json({
    success: true,
    metrics
  }, 200);
});
