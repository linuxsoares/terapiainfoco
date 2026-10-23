import { Hono } from 'hono';
import {
  UserRole,
  type CheckCredentialBreachDTO,
  type TriggerDarkWebScanDTO,
  type ContainIncidentDTO,
  type ResolveIncidentDTO,
  type CredentialBreachCheckResponse,
  type ThreatScanResponse,
  type ThreatIntelligenceOverviewResponse,
  type ContainIncidentResponse,
  type ResolveIncidentResponse
} from '@terapiainfoco/shared';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { ThreatIntelligenceService } from '../services/threatIntelligenceService';

export const threatIntelligenceRoute = new Hono();

const service = ThreatIntelligenceService.getInstance();
// Ferramenta de operação da plataforma: só o Admin/DPO (RFC-001 §4.5)
const requireAdmin = requireRoles([UserRole.ADMIN]);

/**
 * 1. Consulta com K-Anonymity (Zero-Knowledge) para Credenciais ou Senhas
 */
threatIntelligenceRoute.post('/check', authMiddleware({ strict: true }), async (c) => {
  try {
    const body = await c.req.json<CheckCredentialBreachDTO>();
    const result = await service.checkCredentialWithKAnonymity(body);

    const response: CredentialBreachCheckResponse = {
      success: true,
      result,
      message: result.matched
        ? `Atenção: Credencial identificada em ${result.breachCount} vazamentos conhecidos na Dark Web!`
        : 'Nenhum vazamento detectado para este prefixo k-Anonymity. Credencial segura.'
    };

    return c.json(response, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

/**
 * 2. Disparar Varredura Proativa de Credenciais Institucionais na Dark Web
 */
threatIntelligenceRoute.post('/scan', authMiddleware({ strict: true }), requireAdmin, async (c) => {
  try {
    const user = c.get('user');
    const body: Partial<TriggerDarkWebScanDTO> = await c.req.json<TriggerDarkWebScanDTO>().catch(() => ({}));

    const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';

    const scanResult = await service.triggerDarkWebScan({
      requestedBy: user.id,
      ipAddress,
      scope: body.scope,
      targetEmail: body.targetEmail,
      simulateBreachDump: body.simulateBreachDump ?? true
    });

    const response: ThreatScanResponse = {
      success: true,
      newIncidentsCount: scanResult.newIncidentsCount,
      incidents: scanResult.incidents,
      alertsGenerated: scanResult.alertsGenerated,
      message: `Varredura de Dark Web concluída: ${scanResult.newIncidentsCount} incidente(s) identificado(s) e selados na trilha WORM.`
    };

    return c.json(response, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

/**
 * 3. Contenção Imediata de Incidente (Revogação de Sessões e Alerta DPO)
 */
threatIntelligenceRoute.post('/contain', authMiddleware({ strict: true }), requireAdmin, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json<ContainIncidentDTO>();

    if (!body.incidentId) {
      return c.json({ success: false, message: 'incidentId é obrigatório.' }, 400);
    }

    const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';

    const containResult = await service.containIncident({
      incidentId: body.incidentId,
      dpoId: user.id,
      ipAddress,
      reason: body.reason,
      forcePasswordReset: body.forcePasswordReset ?? true
    });

    const response: ContainIncidentResponse = {
      success: true,
      incident: containResult.incident,
      sessionsRevokedCount: containResult.sessionsRevokedCount,
      dpoAlert: containResult.dpoAlert,
      message: `Contenção executada com sucesso! ${containResult.sessionsRevokedCount} sessão(ões) revogada(s) compulsoriamente e DPO acionado.`
    };

    return c.json(response, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

/**
 * 4. Resolução Formal de Incidente pelo DPO / Encarregado
 */
threatIntelligenceRoute.post('/resolve', authMiddleware({ strict: true }), requireAdmin, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json<ResolveIncidentDTO>();

    if (!body.incidentId || !body.resolutionNotes) {
      return c.json({ success: false, message: 'incidentId e resolutionNotes são obrigatórios.' }, 400);
    }

    const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';

    const resolveResult = await service.resolveIncident({
      incidentId: body.incidentId,
      dpoId: user.id,
      ipAddress,
      alertId: body.alertId,
      resolutionNotes: body.resolutionNotes,
      reportedToAnpd: body.reportedToAnpd ?? false,
      anpdProtocolNumber: body.anpdProtocolNumber
    });

    const response: ResolveIncidentResponse = {
      success: true,
      incident: resolveResult.incident,
      alert: resolveResult.alert,
      message: 'Incidente de vazamento documentado e resolvido com sucesso pelo DPO na trilha WORM.'
    };

    return c.json(response, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

/**
 * 5. Painel Consolidado de Incidentes, Alertas DPO e Métricas
 */
threatIntelligenceRoute.get('/overview', authMiddleware({ strict: true }), requireAdmin, async (c) => {
  const incidents = service.getIncidents();
  const alerts = service.getAlerts();
  const metrics = service.getMetrics();

  const response: ThreatIntelligenceOverviewResponse = {
    success: true,
    incidents,
    alerts,
    metrics
  };

  return c.json(response, 200);
});
