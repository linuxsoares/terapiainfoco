/**
 * ============================================================================
 * 64. ROTAS REST: XML SECURITY GUARD & ENTITY EXPANSION DEFENSE
 * ============================================================================
 * 
 * Endpoints de observabilidade, escaneamento de XML clínico (HL7 CDA, FHIR, TISS),
 * mitigação de XXE e XML Bombs, simulação adversarial e verificação de selo WORM.
 */

import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import { XmlSecurityGuardService } from '../services/xmlSecurityGuardService';
import type {
  ScanXmlPayloadDTO,
  ScanXmlPayloadResponse,
  UpdateXmlPolicyDTO,
  UpdateXmlPolicyResponse,
  SimulateXmlAttackDTO,
  SimulateXmlAttackResponse,
  VerifyXmlSealDTO,
  VerifyXmlSealResponse,
  XmlGuardOverviewResponse
} from '@terapiainfoco/shared';

const router = new Hono();

// Ferramenta da plataforma (painel de Segurança): exclusiva do Admin
router.use('*', authMiddleware(), requireRoles([UserRole.ADMIN]));
const service = XmlSecurityGuardService.getInstance();

/**
 * GET /api/xml-guard/overview
 * Retorna visão geral de métricas, políticas ativas e incidentes recentes
 */
router.get('/overview', async (c) => {
  try {
    const overview = service.getOverview();
    return c.json<XmlGuardOverviewResponse>({
      success: true,
      overview
    });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

/**
 * POST /api/xml-guard/scan
 * Executa escaneamento e sanitização de payload XML clínico
 */
router.post('/scan', async (c) => {
  try {
    const body = await c.req.json<ScanXmlPayloadDTO>();
    if (!body || typeof body.xmlPayload !== 'string') {
      return c.json({ success: false, message: 'xmlPayload é obrigatório.' }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || '127.0.0.1';
    const actorId = (c.get as any)('user')?.id || 'clinical-service';

    const response = await service.scanPayload(body, clientIp, actorId);
    return c.json<ScanXmlPayloadResponse>(response);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

/**
 * PUT /api/xml-guard/policy
 * Atualiza parâmetros de configuração da política de proteção XML
 */
router.put('/policy', async (c) => {
  try {
    const body = await c.req.json<UpdateXmlPolicyDTO>();
    const actorId = (c.get as any)('user')?.id || 'admin-officer';

    const response = await service.updatePolicy(body, actorId);
    return c.json<UpdateXmlPolicyResponse>(response);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

/**
 * POST /api/xml-guard/simulate
 * Executa simulação adversarial de ataque XML (XXE, XML Bomb, XInclude, etc.)
 */
router.post('/simulate', async (c) => {
  try {
    const body = await c.req.json<SimulateXmlAttackDTO>();
    const clientIp = c.req.header('x-forwarded-for') || '127.0.0.1';
    const actorId = (c.get as any)('user')?.id || 'pentest-operator';

    const response = await service.simulateAttack(body, clientIp, actorId);
    return c.json<SimulateXmlAttackResponse>(response);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

/**
 * POST /api/xml-guard/verify-seal
 * Valida a autenticidade criptográfica de um selo probatório WORM de integridade XML
 */
router.post('/verify-seal', async (c) => {
  try {
    const body = await c.req.json<VerifyXmlSealDTO>();
    if (!body || !body.sealToken) {
      return c.json({ success: false, message: 'sealToken é obrigatório.' }, 400);
    }
    const actorId = (c.get as any)('user')?.id || 'seal-auditor';

    const response = await service.verifySeal(body, actorId);
    return c.json<VerifyXmlSealResponse>(response);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

export default router;
