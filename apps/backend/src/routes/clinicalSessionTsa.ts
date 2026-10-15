import { Hono } from 'hono';
import { ClinicalSessionTsaService } from '../services/clinicalSessionTsaService';
import type {
  CreateSessionTimestampDTO,
  VerifySessionTimestampDTO,
  SimulateTimestampTamperDTO
} from '@terapiainfoco/shared';

export const clinicalSessionTsaRoutes = new Hono();

const tsaService = ClinicalSessionTsaService.getInstance();

/**
 * GET /api/tsa-notary/overview
 * Retorna visão geral de governança e certificação notarial RFC 3161 ICP-Brasil
 */
clinicalSessionTsaRoutes.get('/overview', (c) => {
  const overview = tsaService.getOverview();
  return c.json({
    success: true,
    overview
  });
});

/**
 * POST /api/tsa-notary/stamp-session
 * Emite um carimbo do tempo oficial para uma sessão clínica finalizada
 */
clinicalSessionTsaRoutes.post('/stamp-session', async (c) => {
  try {
    const body = await c.req.json<CreateSessionTimestampDTO>();
    if (!body.sessionId || !body.patientId || !body.therapistId || !body.therapistCrp) {
      return c.json(
        {
          success: false,
          error: 'sessionId, patientId, therapistId e therapistCrp são obrigatórios'
        },
        400
      );
    }

    const token = await tsaService.issueSessionTimestamp(
      body,
      c.req.header('x-user-id') || 'authenticated_therapist'
    );

    return c.json({
      success: true,
      token,
      message: 'Sessão clínica carimbada com sucesso sob regulamentação RFC 3161 / ICP-Brasil'
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: error?.message || 'Falha ao emitir carimbo do tempo da sessão clínica'
      },
      500
    );
  }
});

/**
 * POST /api/tsa-notary/verify-token
 * Executa verificação pericial forense da integridade de um token de carimbo do tempo
 */
clinicalSessionTsaRoutes.post('/verify-token', async (c) => {
  try {
    const body = await c.req.json<VerifySessionTimestampDTO>();
    const result = await tsaService.verifyToken(
      body,
      c.req.header('x-user-id') || 'clinical_notary_verifier'
    );

    return c.json({
      success: true,
      result
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: error?.message || 'Erro durante verificação pericial do carimbo do tempo'
      },
      500
    );
  }
});

/**
 * POST /api/tsa-notary/simulate-tampering
 * Executa teste de auditoria forense simulando tentativa de fraude / adulteração
 */
clinicalSessionTsaRoutes.post('/simulate-tampering', async (c) => {
  try {
    const body = await c.req.json<SimulateTimestampTamperDTO>();
    if (!body.tokenId || !body.tamperType) {
      return c.json(
        {
          success: false,
          error: 'tokenId e tamperType são obrigatórios'
        },
        400
      );
    }

    const result = await tsaService.simulateTampering(
      body,
      c.req.header('x-user-id') || 'forensic_pentester'
    );

    return c.json(result);
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: error?.message || 'Erro ao simular adulteração no carimbo do tempo'
      },
      500
    );
  }
});

/**
 * GET /api/tsa-notary/session/:sessionId/token
 * Consulta o carimbo do tempo emitido para uma sessão clínica específica
 */
clinicalSessionTsaRoutes.get('/session/:sessionId/token', (c) => {
  const sessionId = c.req.param('sessionId');
  const token = tsaService.getTokenBySessionId(sessionId);

  if (!token) {
    return c.json(
      {
        success: false,
        error: `Nenhum carimbo do tempo encontrado para a sessão ${sessionId}`
      },
      404
    );
  }

  return c.json({
    success: true,
    token
  });
});

/**
 * GET /api/tsa-notary/tsa-info
 * Retorna credenciais da Autoridade de Carimbo do Tempo (ACT ICP-Brasil) e OIDs suportados
 */
clinicalSessionTsaRoutes.get('/tsa-info', (c) => {
  const info = tsaService.getTsaInfo();
  return c.json({
    success: true,
    ...info
  });
});
