import { Hono } from 'hono';
import { ClinicalDidService } from '../services/clinicalDidService';
import type {
  IssueVerifiableCredentialDTO,
  VerifyVerifiableCredentialDTO,
  RevokeVerifiableCredentialDTO
} from '@terapiainfoco/shared';

const didRouter = new Hono();
const didService = ClinicalDidService.getInstance();

/**
 * GET /api/did/resolve/:did
 * Resolução descentralizada de DID Document (W3C DID v1.0)
 */
didRouter.get('/resolve/:did', async (c) => {
  try {
    const did = c.req.param('did');
    if (!did) {
      return c.json({ success: false, message: 'Parâmetro DID é obrigatório.' }, 400);
    }

    const didDocument = await didService.resolveDid(did);
    if (!didDocument) {
      return c.json({ success: false, message: `DID ${did} não encontrado ou não suportado.` }, 404);
    }

    return c.json({
      success: true,
      didDocument
    });
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Erro ao resolver DID.' }, 500);
  }
});

/**
 * POST /api/did/credentials/issue
 * Emissão de Verifiable Credential assinada digitalmente com blind index do paciente
 */
didRouter.post('/credentials/issue', async (c) => {
  try {
    const body = await c.req.json<IssueVerifiableCredentialDTO>();

    if (!body.credentialType || !body.patientId || !body.therapistCrp) {
      return c.json({
        success: false,
        message: 'Campos obrigatórios ausentes: credentialType, patientId, therapistCrp.'
      }, 400);
    }

    const result = await didService.issueCredential(body);

    return c.json({
      success: true,
      credential: result.credential,
      jwtToken: result.jwtToken,
      message: `Credencial ${result.credential.id} emitida com sucesso e selada na trilha WORM!`
    }, 201);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Erro ao emitir credencial verificável.' }, 500);
  }
});

/**
 * POST /api/did/credentials/verify
 * Verificação descentralizada de credencial ou apresentação W3C
 */
didRouter.post('/credentials/verify', async (c) => {
  try {
    const body = await c.req.json<VerifyVerifiableCredentialDTO>();

    if (!body.credentialOrPresentationPayload) {
      return c.json({
        success: false,
        message: 'Payload da credencial ou apresentação é obrigatório.'
      }, 400);
    }

    const result = await didService.verifyCredential(
      body.credentialOrPresentationPayload,
      body.expectedNonce
    );

    return c.json({
      success: true,
      result
    });
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Erro ao verificar credencial.' }, 500);
  }
});

/**
 * POST /api/did/credentials/revoke
 * Revogação solene de credencial verificável com registro na trilha WORM
 */
didRouter.post('/credentials/revoke', async (c) => {
  try {
    const body = await c.req.json<RevokeVerifiableCredentialDTO>();

    if (!body.credentialId || !body.revocationReason) {
      return c.json({
        success: false,
        message: 'Campos obrigatórios ausentes: credentialId, revocationReason.'
      }, 400);
    }

    const result = await didService.revokeCredential(body);

    return c.json({
      success: true,
      credentialId: result.credentialId,
      revokedAt: result.revokedAt,
      message: result.message
    });
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Erro ao revogar credencial.' }, 500);
  }
});

/**
 * GET /api/did/overview
 * Panorama executivo da federação de identidades clínicas descentralizadas
 */
didRouter.get('/overview', (c) => {
  try {
    const overview = didService.getOverview();
    return c.json({
      success: true,
      overview
    });
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Erro ao buscar dados da federação.' }, 500);
  }
});

/**
 * GET /api/did/credentials/patient/:patientId
 * Busca credenciais emitidas para determinado paciente
 */
didRouter.get('/credentials/patient/:patientId', (c) => {
  try {
    const patientId = c.req.param('patientId');
    const credentials = didService.getCredentialsByPatient(patientId);

    return c.json({
      success: true,
      patientId,
      credentials,
      count: credentials.length
    });
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Erro ao buscar credenciais do paciente.' }, 500);
  }
});

export { didRouter };
