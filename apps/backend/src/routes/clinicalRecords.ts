import { Hono } from 'hono';
import { ClinicalRecordService } from '../services/clinicalRecordService';
import type { UpdateSoapNoteDTO, SignClinicalRecordDTO } from '@terapiainfoco/shared';

export const clinicalRecordsRoute = new Hono();

// Salvar rascunho de nota SOAP (Módulo 3 & 4)
clinicalRecordsRoute.post('/draft', async (c) => {
  const body = await c.req.json<UpdateSoapNoteDTO & {
    appointmentId: string;
    patientId: string;
    therapistId: string;
    sessionNumber: number;
  }>();

  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');

  try {
    const record = ClinicalRecordService.saveDraft({
      appointmentId: body.appointmentId,
      patientId: body.patientId,
      therapistId: body.therapistId || 'therapist-001',
      sessionNumber: body.sessionNumber,
      soap: body.soap,
      privateNotes: body.privateNotes,
      context: {
        actorId: body.therapistId || 'therapist-001',
        ipAddress: ip,
        userAgent
      }
    });

    return c.json({ success: true, record }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

// Assinar e selar evolução clínica (Human-in-the-Loop compulsório §3.3)
clinicalRecordsRoute.post('/sign', async (c) => {
  const body = await c.req.json<SignClinicalRecordDTO>();
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');

  try {
    const record = ClinicalRecordService.signRecord({
      recordId: body.recordId,
      confirmedHumanReview: body.confirmedHumanReview,
      context: {
        actorId: 'therapist-001',
        ipAddress: ip,
        userAgent
      }
    });

    return c.json({ success: true, record });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

// Visualizar prontuário (decifra para o terapeuta autenticado)
clinicalRecordsRoute.get('/:id', async (c) => {
  const id = c.req.param('id');
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');

  const record = ClinicalRecordService.getRecordById(id, {
    actorId: 'therapist-001',
    ipAddress: ip,
    userAgent
  });

  if (!record) {
    return c.json({ success: false, error: 'Prontuário não encontrado' }, 404);
  }

  return c.json({ success: true, record });
});
