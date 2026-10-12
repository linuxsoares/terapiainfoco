import { Hono } from 'hono';
import { TranscriptionService } from '../services/transcriptionService';
import { AiSoapService } from '../services/aiSoapService';
import { sanitizePii } from '@terapiainfoco/crypto';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import type { 
  UploadAudioDTO, 
  GenerateSoapProposalDTO,
  SanitizeTranscriptionDTO 
} from '@terapiainfoco/shared';

export const transcriptionsRoute = new Hono();

// Transcrições contêm dados de saúde e PII sensível (LGPD Art. 11 e CFP 011/2018)
transcriptionsRoute.use('*', authMiddleware());
transcriptionsRoute.use('*', requireRoles([UserRole.PSICOLOGO_TITULAR, UserRole.SUPERVISOR_CLINICO, UserRole.ADMIN]));


// Upload e diarização de áudio da consulta (RFC §3.3)
transcriptionsRoute.post('/upload', async (c) => {
  const body = await c.req.json<UploadAudioDTO>();
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');

  try {
    const result = TranscriptionService.uploadAndProcessAudio(body, {
      actorId: 'therapist-001',
      ipAddress: ip,
      userAgent
    });

    return c.json({ success: true, transcription: result }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

// Buscar transcrição e diarização vinculada à consulta
transcriptionsRoute.get('/appointment/:appointmentId', async (c) => {
  const appointmentId = c.req.param('appointmentId');
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');

  const result = TranscriptionService.getTranscriptionByAppointment(appointmentId, {
    actorId: 'therapist-001',
    ipAddress: ip,
    userAgent
  });

  if (!result) {
    return c.json({ success: false, error: 'Transcrição não encontrada para esta consulta' }, 404);
  }

  return c.json({ success: true, transcription: result });
});

// Sanitização de PII Pré-LLM isolada (LGPD Art. 11)
transcriptionsRoute.post('/sanitize', async (c) => {
  const body = await c.req.json<SanitizeTranscriptionDTO>();

  try {
    if (body.text) {
      const sanitized = sanitizePii(body.text, {
        patientName: body.patientName,
        therapistName: body.therapistName
      });
      return c.json({ success: true, result: sanitized });
    }

    if (body.utterances && body.utterances.length > 0) {
      let totalCount = 0;
      const sanitizedUtterances = body.utterances.map(u => {
        const res = sanitizePii(u.text, {
          patientName: body.patientName,
          therapistName: body.therapistName
        });
        totalCount += res.replacedCount;
        return {
          speaker: u.speaker,
          time: u.time,
          text: res.sanitizedText
        };
      });

      return c.json({
        success: true,
        sanitizedUtterances,
        replacedCount: totalCount
      });
    }

    return c.json({ success: false, error: 'Forneça text ou utterances para sanitizar' }, 400);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

// Geração assistida de SOAP com IA sob dados sanitizados (RFC §3.3)
transcriptionsRoute.post('/generate-soap', async (c) => {
  const body = await c.req.json<GenerateSoapProposalDTO>();
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');

  try {
    const proposal = AiSoapService.generateSoapProposal({
      appointmentId: body.appointmentId,
      transcriptionId: body.transcriptionId,
      utterances: body.utterances,
      context: {
        actorId: 'therapist-001',
        ipAddress: ip,
        userAgent
      }
    });

    return c.json({ success: true, proposal });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});
