import { Hono } from 'hono';
import { HomomorphicService } from '../services/homomorphicService';
import type {
  CreateHomomorphicCohortDTO,
  DecryptCohortAggregationDTO,
  VerifyHomomorphicProofSealDTO
} from '@terapiainfoco/shared';

export const homomorphicRoutes = new Hono();
const service = HomomorphicService.getInstance();

/**
 * GET /api/homomorphic/overview
 * Visão geral das coortes, métricas de agregação e chave pública
 */
homomorphicRoutes.get('/overview', (c) => {
  const overview = service.getOverview();
  return c.json({
    success: true,
    overview
  });
});

/**
 * GET /api/homomorphic/catalog
 * Catálogo canônico de diagnósticos de saúde mental CID-11
 */
homomorphicRoutes.get('/catalog', (c) => {
  const catalog = service.getCatalog();
  return c.json({
    success: true,
    catalog
  });
});

/**
 * GET /api/homomorphic/public-key
 * Chave pública homomórfica ativa para encriptação nos nós de prontuário
 */
homomorphicRoutes.get('/public-key', (c) => {
  const publicKey = service.getActivePublicKey();
  return c.json({
    success: true,
    publicKey
  });
});

/**
 * POST /api/homomorphic/cohorts
 * Criação de uma nova coorte para agregação homomórfica de diagnósticos
 */
homomorphicRoutes.post('/cohorts', async (c) => {
  try {
    const body = await c.req.json<CreateHomomorphicCohortDTO>();
    if (!body.cohortName || body.cohortName.trim().length === 0) {
      return c.json(
        {
          success: false,
          message: 'O nome da coorte é obrigatório.'
        },
        400
      );
    }

    const cohort = await service.createCohort(body, 'dpo_clinical_researcher');
    return c.json({
      success: true,
      cohort,
      message: 'Coorte criada com sucesso sob o protocolo Paillier 512-bit.'
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        message: `Falha ao criar coorte homomórfica: ${error?.message || error}`
      },
      400
    );
  }
});

/**
 * POST /api/homomorphic/cohorts/:id/patients
 * Cifra e agrega o vetor de diagnósticos de um paciente à coorte
 */
homomorphicRoutes.post('/cohorts/:id/patients', async (c) => {
  try {
    const cohortId = c.req.param('id');
    const body = await c.req.json<{
      diagnosesCidCodes?: string[];
      encryptedVector?: any;
    }>();

    let updatedCohort;
    if (body.encryptedVector) {
      updatedCohort = await service.addPatientVector(cohortId, body.encryptedVector, 'therapist_operator');
    } else if (body.diagnosesCidCodes) {
      updatedCohort = await service.simulateAddPatient(cohortId, body.diagnosesCidCodes, 'therapist_operator');
    } else {
      return c.json(
        {
          success: false,
          message: 'Informe diagnosesCidCodes ou encryptedVector para agregação.'
        },
        400
      );
    }

    return c.json({
      success: true,
      cohort: updatedCohort,
      message: 'Diagnósticos cifrados homomorficamente e agregados com sucesso ao total da coorte.'
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        message: `Falha ao agregar paciente à coorte: ${error?.message || error}`
      },
      400
    );
  }
});

/**
 * POST /api/homomorphic/cohorts/decrypt
 * Decifragem controlada com exigência de aprovação ética (LGPD Art. 13)
 */
homomorphicRoutes.post('/cohorts/decrypt', async (c) => {
  try {
    const body = await c.req.json<DecryptCohortAggregationDTO>();
    const decryptedResult = await service.decryptCohort(body, 'dpo_ethics_reviewer');

    return c.json({
      success: true,
      decryptedResult,
      message: 'Agregação da coorte decifrada com sucesso sob chancela ética regulatória.'
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        message: `Falha na decifragem da coorte: ${error?.message || error}`
      },
      400
    );
  }
});

/**
 * POST /api/homomorphic/verify-seal
 * Verificação pericial e matemática do selo probatório WORM
 */
homomorphicRoutes.post('/verify-seal', async (c) => {
  try {
    const body = await c.req.json<VerifyHomomorphicProofSealDTO>();
    if (!body.proofSealToken) {
      return c.json(
        {
          success: false,
          message: 'Token de selo probatório não fornecido.'
        },
        400
      );
    }

    const verification = await service.verifySeal(body.proofSealToken, 'forensic_auditor');
    return c.json({
      success: true,
      ...verification
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        message: `Falha ao verificar selo probatório: ${error?.message || error}`
      },
      400
    );
  }
});
