import { Hono } from 'hono';
import { ClinicalRecordService } from '../services/clinicalRecordService';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import {
  CLINICAL_ROLES,
  canAccessAppointment,
  canAccessClinicalRecord,
  canAccessPatient,
  requireClinicalRecordAccess
} from '../middlewares/accessPolicy';
import { UserRole } from '@terapiainfoco/shared';
import type { UpdateSoapNoteDTO, SignClinicalRecordDTO, CreateRectificationDTO } from '@terapiainfoco/shared';


import { ClinicalRecordRepository } from '../repositories/clinicalRecordRepository';
export const clinicalRecordsRoute = new Hono();

// Prontuários e evolução SOAP são estritamente restritos a psicólogos e supervisores do consultório
// (LGPD Art. 11 e CFP 001/2009); Admin/DPO não lê conteúdo clínico (RFC-001 §2.1)
clinicalRecordsRoute.use('*', authMiddleware(), requireRoles(CLINICAL_ROLES));

// Salvar rascunho de nota SOAP (Módulo 3 & 4)
clinicalRecordsRoute.post('/draft', async (c) => {

  const body = await c.req.json<UpdateSoapNoteDTO & {
    appointmentId: string;
    patientId: string;
    sessionNumber: number;
  }>();

  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');
  const user = c.get('user');

  if (!(await canAccessPatient(user, body.patientId)) || !(await canAccessAppointment(user, body.appointmentId))) {
    return c.json({ success: false, error: 'Paciente ou consulta não encontrados.' }, 404);
  }

  try {
    const record = await ClinicalRecordService.saveDraft({
      appointmentId: body.appointmentId,
      patientId: body.patientId,
      therapistId: user.therapistId!,
      sessionNumber: body.sessionNumber,
      soap: body.soap,
      privateNotes: body.privateNotes,
      context: {
        actorId: user.id,
        ipAddress: ip,
        userAgent
      }
    });

    return c.json({ success: true, record }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

// Assinar e selar evolução clínica (Human-in-the-Loop compulsório §3.3 - restrito ao Psicólogo Titular)
clinicalRecordsRoute.post('/sign', requireRoles([UserRole.PSICOLOGO_TITULAR]), async (c) => {
  const body = await c.req.json<SignClinicalRecordDTO>();
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');

  if (!(await canAccessClinicalRecord(c.get('user'), body.recordId))) {
    return c.json({ success: false, error: 'Prontuário não encontrado.' }, 404);
  }

  try {
    const record = await ClinicalRecordService.signRecord({
      recordId: body.recordId,
      confirmedHumanReview: body.confirmedHumanReview,
      context: {
        actorId: c.get('userId'),
        ipAddress: ip,
        userAgent
      }
    });

    return c.json({ success: true, record });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

// Visualizar prontuário (decifra para o terapeuta autenticado e supervisor)
clinicalRecordsRoute.get('/:id', requireClinicalRecordAccess(), async (c) => {

  const id = c.req.param('id');
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');

  const record = await ClinicalRecordService.getRecordById(id, {
    actorId: c.get('userId'),
    ipAddress: ip,
    userAgent
  });

  if (!record) {
    return c.json({ success: false, error: 'Prontuário não encontrado' }, 404);
  }

  return c.json({ success: true, record });
});

// Averbar Termo de Retificação Formal em prontuário assinado (CFP nº 001/2009 & RFC §3.4)
clinicalRecordsRoute.post('/:id/rectify', requireRoles([UserRole.PSICOLOGO_TITULAR]), requireClinicalRecordAccess(), async (c) => {
  const id = c.req.param('id');
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');
  const user = c.get('user');

  let body: CreateRectificationDTO;
  try {
    body = await c.req.json<CreateRectificationDTO>();
  } catch {
    return c.json({ success: false, error: 'Corpo da requisição inválido.' }, 400);
  }

  try {
    const rectification = await ClinicalRecordService.addRectification({
      clinicalRecordId: id,
      therapistId: user.therapistId!,
      dto: body,
      context: {
        actorId: user.id,
        ipAddress: ip,
        userAgent
      }
    });

    return c.json({ success: true, rectification }, 201);
  } catch (err: any) {
    const status = err.message.includes('não encontrado') ? 404 : 400;
    return c.json({ success: false, error: err.message }, status);
  }
});

// Consultar termos de retificação averbados para um prontuário
clinicalRecordsRoute.get('/:id/rectifications', requireClinicalRecordAccess(), async (c) => {
  const id = c.req.param('id');
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');
  const user = c.get('user');

  try {
    const rectifications = ClinicalRecordService.getRectifications(id, {
      actorId: user.id,
      ipAddress: ip,
      userAgent
    });

    return c.json({
      success: true,
      clinicalRecordId: id,
      count: rectifications.length,
      rectifications
    }, 200);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

