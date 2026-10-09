import { Hono } from 'hono';
import type { GenerateDocumentDTO, SignDocumentDTO } from '@terapiainfoco/shared';
import { DocumentService } from '../services/documentService';

export const documentsRoute = new Hono();

/**
 * POST /api/documents/draft
 * Gera rascunho de documento clínico (Declaração, Atestado, Relatório, Laudo)
 */
documentsRoute.post('/draft', async (c) => {
  try {
    const body = await c.req.json<GenerateDocumentDTO>();
    const therapistId = 'therapist-001';

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
        actorId: therapistId,
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
 */
documentsRoute.post('/sign', async (c) => {
  try {
    const body = await c.req.json<SignDocumentDTO>();

    if (!body.documentId) {
      return c.json({ success: false, error: 'documentId é obrigatório' }, 400);
    }

    const signedDoc = DocumentService.signDocument({
      documentId: body.documentId,
      context: {
        actorId: 'therapist-001',
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
 * Lista todos os documentos emitidos
 */
documentsRoute.get('/', async (c) => {
  try {
    const therapistId = 'therapist-001';
    const docs = DocumentService.listDocuments(therapistId, {
      actorId: therapistId,
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
 */
documentsRoute.get('/validate/:token', async (c) => {
  const token = c.req.param('token');
  const result = DocumentService.validatePublicToken(token);

  if (!result.valid) {
    return c.json({ success: false, ...result }, 404);
  }

  return c.json({ success: true, ...result }, 200);
});
