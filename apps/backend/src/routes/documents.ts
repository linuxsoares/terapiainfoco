import { Hono } from 'hono';
import type { GenerateDocumentDTO, SignDocumentDTO, SignIcpDTO } from '@terapiainfoco/shared';
import { DocumentService } from '../services/documentService';
import { PdfGeneratorService } from '../services/pdfGeneratorService';
import { IcpBrasilService } from '../services/icpBrasilService';
import { PatientService } from '../services/patientService';
import { validationRateLimiter } from '../middlewares/rateLimiter';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { CLINICAL_ROLES, canAccessEntity, requireBodyOwnership, requireOwnedResource } from '../middlewares/accessPolicy';
import { db } from '../db/memoryDb';
import { UserRole } from '@terapiainfoco/shared';

export const documentsRoute = new Hono();


/**
 * POST /api/documents/draft
 * Gera rascunho de documento clínico (Declaração, Atestado, Relatório, Laudo)
 * Restrito a Psicólogo Titular ou Administrador
 */
documentsRoute.post('/draft', authMiddleware(), requireRoles([UserRole.PSICOLOGO_TITULAR]), requireBodyOwnership(), async (c) => {

  try {
    const body = await c.req.json<GenerateDocumentDTO>();
    const therapistId = c.get('user').therapistId!;

    if (!body.patientId || !body.type || !body.title || !body.content) {
      return c.json({ error: 'Campos obrigatórios ausentes (patientId, type, title, content)' }, 400);
    }

    const doc = DocumentService.generateDraft({
      patientId: body.patientId,
      therapistId,
      type: body.type,
      title: body.title,
      content: body.content,
      context: {
        actorId: c.get('userId'),
        ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
        userAgent: c.req.header('user-agent')
      }
    });

    return c.json({ success: true, document: doc, ...doc }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

/**
 * POST /api/documents/sign
 * Assina digitalmente o documento e gera hash SHA-256 / PAdES imutável
 * Restrito ao Psicólogo Titular ou Administrador
 */
documentsRoute.post('/sign', authMiddleware(), requireRoles([UserRole.PSICOLOGO_TITULAR]), async (c) => {
  try {
    const body = await c.req.json<SignDocumentDTO>();

    if (!body.documentId) {
      return c.json({ success: false, error: 'documentId é obrigatório' }, 400);
    }
    if (!canAccessEntity(c.get('user'), db.documents.get(body.documentId))) {
      return c.json({ success: false, error: 'Documento não encontrado.' }, 404);
    }

    const signedDoc = DocumentService.signDocument({
      documentId: body.documentId,
      context: {
        actorId: c.get('userId'),
        ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
        userAgent: c.req.header('user-agent')
      }
    });

    return c.json({ success: true, document: signedDoc, ...signedDoc }, 200);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

/**
 * GET /api/documents
 * Lista todos os documentos emitidos (restrito a equipe clínica)
 */
documentsRoute.get('/', authMiddleware(), requireRoles(CLINICAL_ROLES), async (c) => {
  try {
    const therapistId = c.get('user').therapistId!;
    const docs = DocumentService.listDocuments(therapistId, {
      actorId: c.get('userId'),
      ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
      userAgent: c.req.header('user-agent')
    });

    return c.json({ success: true, documents: docs }, 200);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

/**
 * GET /api/documents/validate/:token
 * Endpoint público de verificação de autenticidade (QR Code)
 * Protegido com Rate Limiting contra ataques de força bruta / enumeração de tokens
 */
documentsRoute.get('/validate/:token', validationRateLimiter, async (c) => {
  const token = c.req.param('token');
  const result = DocumentService.validatePublicToken(token);

  if (!result.valid) {
    return c.json({ success: false, ...result }, 404);
  }

  return c.json({ success: true, ...result }, 200);
});

/**
 * GET /api/documents/:id
 * Retorna documento clínico decifrado específico
 */
documentsRoute.get('/:id', authMiddleware(), requireRoles(CLINICAL_ROLES), requireOwnedResource((id) => db.documents.get(id), 'Documento'), async (c) => {
  const id = c.req.param('id');
  const doc = DocumentService.getDocumentById(id);
  if (!doc) {
    return c.json({ success: false, error: 'Documento não encontrado.' }, 404);
  }
  return c.json({ success: true, document: doc });
});

/**
 * GET /api/documents/:id/pdf
 * Gera e realiza streaming do arquivo PDF timbrado oficial A4 com QR Code e PAdES
 */
documentsRoute.get('/:id/pdf', authMiddleware(), requireRoles(CLINICAL_ROLES), requireOwnedResource((id) => db.documents.get(id), 'Documento'), async (c) => {
  try {
    const id = c.req.param('id');
    const doc = DocumentService.getDocumentById(id);
    if (!doc) {
      return c.json({ success: false, error: 'Documento não encontrado.' }, 404);
    }

    const patient = PatientService.getPatientById(doc.patientId, {
      actorId: c.get('userId'),
      ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1'
    });

    const pdfBytes = await PdfGeneratorService.generateDocumentPdf({
      document: doc,
      patient
    });

    return new Response(new Uint8Array(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="documento-cfp-${doc.id.slice(0, 8)}.pdf"`,
        'Content-Length': pdfBytes.length.toString(),
        'Cache-Control': 'no-cache'
      }
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Falha ao gerar PDF.' }, 500);
  }
});

/**
 * POST /api/documents/:id/prepare-icp-signature
 * Prepara o documento e gera o digest SHA-256 para assinatura com token/nuvem ICP-Brasil
 */
documentsRoute.post('/:id/prepare-icp-signature', authMiddleware(), requireRoles([UserRole.PSICOLOGO_TITULAR]), requireOwnedResource((id) => db.documents.get(id), 'Documento'), async (c) => {
  try {
    const id = c.req.param('id');
    const response = await IcpBrasilService.prepareSignature(id);
    return c.json({ success: true, ...response }, 200);
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Falha ao preparar assinatura ICP-Brasil.' }, 400);
  }
});

/**
 * POST /api/documents/:id/sign-icp
 * Registra a assinatura qualificada com certificado digital ICP-Brasil e carimbo do tempo
 */
documentsRoute.post('/:id/sign-icp', authMiddleware(), requireRoles([UserRole.PSICOLOGO_TITULAR]), requireOwnedResource((id) => db.documents.get(id), 'Documento'), async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<SignIcpDTO>();

    if (!body.certificate || !body.signatureBase64) {
      return c.json({ success: false, error: 'certificate e signatureBase64 são obrigatórios.' }, 400);
    }

    const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
    const signedDoc = await IcpBrasilService.signWithIcp(id, body, {
      actorId: c.get('userId'),
      ipAddress: ip,
      userAgent: c.req.header('user-agent')
    });

    return c.json({ success: true, document: signedDoc }, 200);
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Falha ao assinar com ICP-Brasil.' }, 400);
  }
});


