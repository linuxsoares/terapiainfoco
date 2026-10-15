import { Hono } from 'hono';
import { PqcHybridService } from '../services/pqcHybridService';
import type {
  GeneratePqcKeyPairDTO,
  EncapsulatePqcRecordDTO,
  DecapsulatePqcRecordDTO,
  SignPqcDocumentDTO,
  VerifyPqcSignatureDTO,
  SimulateQuantumAttackDTO,
  VerifyPqcSealDTO
} from '@terapiainfoco/shared';

export const pqcHybridRouter = new Hono();
const pqcService = PqcHybridService.getInstance();

/**
 * GET /api/pqc-hybrid/overview
 * Visão consolidada de governança e inventário criptográfico quântico
 */
pqcHybridRouter.get('/overview', async (c) => {
  try {
    const overview = pqcService.getOverview();
    return c.json({
      success: true,
      overview
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao carregar visão geral de criptografia pós-quântica.'
    }, 500);
  }
});

/**
 * POST /api/pqc-hybrid/generate-keypair
 * Geração de novo par de chaves híbrido PQC (ML-KEM + ML-DSA)
 */
pqcHybridRouter.post('/generate-keypair', async (c) => {
  try {
    const body = await c.req.json<GeneratePqcKeyPairDTO>();
    const therapistId = 'usr_psicologo_titular';

    if (!body.alias) {
      return c.json({
        success: false,
        message: 'Alias identificador do par de chaves é obrigatório.'
      }, 400);
    }

    const keyPair = pqcService.generateKeyPair(body, therapistId);

    return c.json({
      success: true,
      keyPair,
      message: `Par de chaves híbrido pós-quântico gerado com sucesso (${keyPair.kemScheme} & ${keyPair.dsaScheme}).`
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao gerar par de chaves pós-quântico.'
    }, 400);
  }
});

/**
 * POST /api/pqc-hybrid/encapsulate
 * Cifragem de envelope e proteção de registro clínico com DEK pós-quântica
 */
pqcHybridRouter.post('/encapsulate', async (c) => {
  try {
    const body = await c.req.json<EncapsulatePqcRecordDTO>();
    const therapistId = 'usr_psicologo_titular';

    if (!body.keyId || !body.plaintextClinicalData || !body.title) {
      return c.json({
        success: false,
        message: 'keyId, title e plaintextClinicalData são obrigatórios.'
      }, 400);
    }

    const protectedRecord = pqcService.encapsulateAndProtectRecord(body, therapistId);

    return c.json({
      success: true,
      protectedRecord,
      message: `Registro clínico protegido com envelope pós-quântico híbrido e selo WORM emitido.`
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao proteger registro clínico com envelope quântico.'
    }, 400);
  }
});

/**
 * POST /api/pqc-hybrid/decapsulate
 * Decapsulamento de DEK e abertura controlada de prontuário
 */
pqcHybridRouter.post('/decapsulate', async (c) => {
  try {
    const body = await c.req.json<DecapsulatePqcRecordDTO>();
    const therapistId = 'usr_psicologo_titular';

    if (!body.recordId) {
      return c.json({
        success: false,
        message: 'recordId é obrigatório para abertura do registro.'
      }, 400);
    }

    const result = pqcService.decapsulateAndOpenRecord(body, therapistId);

    return c.json({
      success: true,
      decryptedPlaintext: result.decryptedPlaintext,
      verifiedSignature: result.verifiedSignature,
      message: result.message
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao decapsular e decifrar registro clínico pós-quântico.'
    }, 400);
  }
});

/**
 * POST /api/pqc-hybrid/sign
 * Emissão de assinatura dual híbrida (ECDSA P-256 + ML-DSA)
 */
pqcHybridRouter.post('/sign', async (c) => {
  try {
    const body = await c.req.json<SignPqcDocumentDTO>();
    const therapistId = 'usr_psicologo_titular';

    if (!body.keyId || !body.documentContent) {
      return c.json({
        success: false,
        message: 'keyId e documentContent são obrigatórios.'
      }, 400);
    }

    const signatureResult = pqcService.signDocument(body, therapistId);

    return c.json({
      success: true,
      signatureResult,
      message: 'Assinatura dual pós-quântica emitida com sucesso.'
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao assinar documento digital com chaves PQC.'
    }, 400);
  }
});

/**
 * POST /api/pqc-hybrid/verify-signature
 * Verificação forense de assinatura dual
 */
pqcHybridRouter.post('/verify-signature', async (c) => {
  try {
    const body = await c.req.json<VerifyPqcSignatureDTO>();

    if (!body.keyId || !body.documentContent || !body.classicalSignatureHex || !body.pqSignatureBase64) {
      return c.json({
        success: false,
        message: 'Todos os componentes da assinatura dual são obrigatórios.'
      }, 400);
    }

    const verification = pqcService.verifySignature(body);

    return c.json({
      success: true,
      verification,
      message: verification.message
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao verificar assinatura dual pós-quântica.'
    }, 400);
  }
});

/**
 * POST /api/pqc-hybrid/simulate-attack
 * Pentest e simulação de computação quântica (Shor / SNDL / Grover)
 */
pqcHybridRouter.post('/simulate-attack', async (c) => {
  try {
    const body = await c.req.json<SimulateQuantumAttackDTO>();
    const therapistId = 'usr_psicologo_titular';

    if (!body.recordId || !body.attackType) {
      return c.json({
        success: false,
        message: 'recordId e attackType são obrigatórios para a simulação.'
      }, 400);
    }

    const simulation = pqcService.simulateQuantumAttack(body, therapistId);

    return c.json({
      success: true,
      simulation,
      message: simulation.explanation
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao executar simulação de ataque quântico.'
    }, 400);
  }
});

/**
 * POST /api/pqc-hybrid/verify-seal
 * Validação notarial de selo WORM de criptografia quântica
 */
pqcHybridRouter.post('/verify-seal', async (c) => {
  try {
    const body = await c.req.json<VerifyPqcSealDTO>();

    if (!body.sealToken) {
      return c.json({
        success: false,
        message: 'sealToken é obrigatório.'
      }, 400);
    }

    const result = pqcService.verifyProofSeal(body);

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
      message: error.message || 'Erro ao validar selo probatório PQC.'
    }, 400);
  }
});

export default pqcHybridRouter;
