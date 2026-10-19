import { Hono } from 'hono';
import {
  type IngestTranscriptionDTO,
  type ReviewAiSoapDraftDTO,
} from '@terapiainfoco/shared';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { CLINICAL_ROLES, canAccessEntity, requireAppointmentAccess, requireBodyOwnership, requireOwnedResource } from '../middlewares/accessPolicy';
import { db } from '../db/memoryDb';
import { aiTranscriptionService } from '../services/aiTranscriptionService';

export const aiTranscriptionRouter = new Hono();

// Todos os endpoints de transcrição e IA SOAP requerem autenticação estrita
aiTranscriptionRouter.use('*', authMiddleware(), requireRoles(CLINICAL_ROLES), requireBodyOwnership());

/**
 * POST /api/transcription/ingest
 * Ingestão de áudio/texto transcrito com verificação de TCLE, diarização e síntese SOAP
 */
aiTranscriptionRouter.post('/ingest', async (c) => {
  try {
    const user = c.get('user');
    const dto = await c.req.json<IngestTranscriptionDTO>();

    if (!dto.appointmentId || !dto.patientId) {
      return c.json({
        success: false,
        message: 'appointmentId e patientId são obrigatórios.'
      }, 400);
    }

    if (dto.consentConfirmed !== true) {
      return c.json({
        success: false,
        message: 'Consentimento do paciente (TCLE) é obrigatório por lei para processamento de áudio/transcrição (CFP nº 011/2018 & LGPD Art. 7º).'
      }, 403);
    }

    // Rascunhos e prontuários pertencem ao consultório; a auditoria registra o usuário
    const result = await aiTranscriptionService.ingestTranscriptionAndSynthesizeSoap(
      dto,
      user.therapistId ?? user.id,
      user.id
    );

    return c.json({
      success: true,
      session: result.session,
      soapDraft: result.soapDraft,
      message: 'Transcrição diarizada e rascunho SOAP sintetizado com sucesso (RFC-001 §3.3).'
    }, 201);
  } catch (error: any) {
    const isConsentError = error.message?.includes('Consentimento');
    return c.json({
      success: false,
      message: error.message || 'Erro ao processar transcrição assistida por IA.'
    }, isConsentError ? 403 : 500);
  }
});

/**
 * GET /api/transcription/session/:appointmentId
 * Recupera sessão de transcrição e métricas de escuta ativa
 */
aiTranscriptionRouter.get('/session/:appointmentId', requireAppointmentAccess('appointmentId'), async (c) => {
  try {
    const appointmentId = c.req.param('appointmentId');
    const session = await aiTranscriptionService.getTranscriptionSession(appointmentId);

    if (!session) {
      return c.json({
        success: false,
        message: `Nenhuma sessão de transcrição encontrada para o agendamento ${appointmentId}.`
      }, 404);
    }

    return c.json({
      success: true,
      session,
      soapDraft: session.soapDraft
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao buscar sessão de transcrição.'
    }, 500);
  }
});

/**
 * GET /api/transcription/draft/:draftId
 * Obtém rascunho SOAP para conferência humana
 */
aiTranscriptionRouter.get('/draft/:draftId', requireOwnedResource((id) => db.aiSoapDrafts.get(id), 'Rascunho SOAP', 'draftId'), async (c) => {
  try {
    const draftId = c.req.param('draftId');
    const draft = await aiTranscriptionService.getAiSoapDraft(draftId);

    if (!draft) {
      return c.json({
        success: false,
        message: `Rascunho SOAP ${draftId} não encontrado.`
      }, 404);
    }

    return c.json({
      success: true,
      draft
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao buscar rascunho SOAP.'
    }, 500);
  }
});

/**
 * POST /api/transcription/draft/review
 * Revisão do rascunho SOAP pelo terapeuta e conversão opcional em prontuário oficial
 */
aiTranscriptionRouter.post('/draft/review', async (c) => {
  try {
    const user = c.get('user');
    const dto = await c.req.json<ReviewAiSoapDraftDTO>();

    if (!dto.draftId || !dto.status) {
      return c.json({
        success: false,
        message: 'draftId e status são obrigatórios.'
      }, 400);
    }
    if (!canAccessEntity(user, db.aiSoapDrafts.get(dto.draftId))) {
      return c.json({ success: false, message: 'Rascunho SOAP não encontrado.' }, 404);
    }

    const result = await aiTranscriptionService.reviewAiSoapDraft(dto, user.therapistId ?? user.id, {
      actorId: user.id,
      ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
      userAgent: c.req.header('user-agent')
    });

    return c.json({
      success: true,
      draft: result.draft,
      createdEhrRecordId: result.createdEhrRecordId,
      message: result.createdEhrRecordId
        ? 'Rascunho SOAP revisado e selado como Prontuário Oficial do Paciente (EHR).'
        : 'Rascunho SOAP revisado com sucesso.'
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao processar revisão do rascunho SOAP.'
    }, 500);
  }
});
