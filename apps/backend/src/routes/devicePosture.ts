import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import { DevicePostureService } from '../services/devicePostureService';
import type {
  AssessDevicePostureDTO,
  QuarantineDeviceDTO,
  ReleaseDeviceQuarantineDTO,
  UpdatePosturePolicyDTO,
  VerifyDevicePostureSealDTO
} from '@terapiainfoco/shared';

export const devicePostureRouter = new Hono();

// Ferramenta da plataforma (painel de Segurança): exclusiva do Admin
devicePostureRouter.use('*', authMiddleware(), requireRoles([UserRole.ADMIN]));
const postureService = DevicePostureService.getInstance();

/**
 * GET /api/device-posture/overview
 * Visão consolidada de governança e telemetria de terminais clínicos
 */
devicePostureRouter.get('/overview', async (c) => {
  try {
    const overview = postureService.getOverview();
    return c.json({
      success: true,
      overview
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao carregar visão geral de postura de dispositivos.'
    }, 500);
  }
});

/**
 * POST /api/device-posture/assess
 * Avaliação em tempo real da postura do terminal do terapeuta
 */
devicePostureRouter.post('/assess', async (c) => {
  try {
    const body = await c.req.json<AssessDevicePostureDTO>();
    const operatorId = body.therapistId || 'usr_psicologo_titular';

    const assessment = await postureService.assessDevice(body, operatorId);

    return c.json({
      success: true,
      assessment,
      message: `Avaliação concluída com sucesso. Nível de Confiança: ${assessment.trustTier} (${assessment.trustScore}/100) — Decisão: ${assessment.decision}.`
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao executar avaliação de postura de dispositivo.'
    }, 400);
  }
});

/**
 * POST /api/device-posture/quarantine
 * Isolamento administrativo imediato de dispositivo comprometido (DPO/Admin)
 */
devicePostureRouter.post('/quarantine', async (c) => {
  try {
    const body = await c.req.json<QuarantineDeviceDTO>();
    const operatorId = 'dpo_compliance_lead';

    if (!body.deviceId || !body.reason) {
      return c.json({
        success: false,
        message: 'deviceId e reason são obrigatórios para aplicação de quarentena.'
      }, 400);
    }

    const device = await postureService.quarantineDevice(body.deviceId, body.reason, operatorId);

    return c.json({
      success: true,
      device,
      message: `Dispositivo ${device.deviceName} (${device.deviceId}) colocado em quarentena com sucesso.`
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao colocar dispositivo em quarentena.'
    }, 400);
  }
});

/**
 * POST /api/device-posture/release-quarantine
 * Liberação pericial e revogação de quarentena com parecer DPO
 */
devicePostureRouter.post('/release-quarantine', async (c) => {
  try {
    const body = await c.req.json<ReleaseDeviceQuarantineDTO>();
    const operatorId = 'dpo_compliance_lead';

    if (!body.deviceId || !body.dpoNotes) {
      return c.json({
        success: false,
        message: 'deviceId e parecer técnico dpoNotes são obrigatórios para liberação.'
      }, 400);
    }

    const device = await postureService.releaseDeviceQuarantine(body.deviceId, body.dpoNotes, operatorId);

    return c.json({
      success: true,
      device,
      message: `Quarentena do dispositivo ${device.deviceName} revogada com sucesso.`
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao liberar dispositivo de quarentena.'
    }, 400);
  }
});

/**
 * POST /api/device-posture/update-policy
 * Atualização da política de enforcement Zero Trust
 */
devicePostureRouter.post('/update-policy', async (c) => {
  try {
    const body = await c.req.json<UpdatePosturePolicyDTO>();
    const operatorId = 'admin_security';

    if (!body.policy) {
      return c.json({
        success: false,
        message: 'policy é obrigatória.'
      }, 400);
    }

    const policy = await postureService.updatePolicy(body.policy, operatorId, body.reason);

    return c.json({
      success: true,
      policy,
      message: `Política de conformidade Zero Trust atualizada para: ${policy}.`
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao atualizar política de postura.'
    }, 400);
  }
});

/**
 * POST /api/device-posture/verify-seal
 * Validação forense pública do selo WORM HMAC-SHA256
 */
devicePostureRouter.post('/verify-seal', async (c) => {
  try {
    const body = await c.req.json<VerifyDevicePostureSealDTO>();

    if (!body.sealToken) {
      return c.json({
        success: false,
        isValid: false,
        message: 'sealToken é obrigatório.'
      }, 400);
    }

    const result = await postureService.verifySeal(body.sealToken);

    return c.json({
      success: true,
      isValid: result.isValid,
      seal: result.seal,
      message: result.message,
      verifiedAt: result.verifiedAt
    });
  } catch (error: any) {
    return c.json({
      success: false,
      isValid: false,
      message: error.message || 'Erro ao validar selo probatório.'
    }, 400);
  }
});

export default devicePostureRouter;
