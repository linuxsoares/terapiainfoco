import { Hono } from 'hono';
import { AppointmentService } from '../services/appointmentService';
import { GoogleMeetService } from '../services/googleMeetService';
import { db } from '../db/memoryDb';
import { AuditService } from '../services/auditService';
import { publicBookingRateLimiter } from '../middlewares/rateLimiter';
import { 
  AuditAction, 
  AuditResourceType,
  type CreateAppointmentDTO, 
  type UpdateAppointmentStatusDTO,
  type PublicBookingDTO
} from '@terapiainfoco/shared';

export const appointmentsRoute = new Hono();

// Consultar grade de horários disponíveis (público / landing page)
appointmentsRoute.get('/available-slots', async (c) => {
  const therapistId = c.req.query('therapistId') || 'therapist-001';
  const date = c.req.query('date');

  try {
    const slotsResponse = AppointmentService.getAvailableSlots(therapistId, date);
    return c.json({ success: true, ...slotsResponse });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

// Agendamento público de teleconsulta diretamente pela landing page (com proteção anti-spam)
appointmentsRoute.post('/public/book', publicBookingRateLimiter, async (c) => {
  const body = await c.req.json<PublicBookingDTO>();
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');

  try {
    const booking = await AppointmentService.bookPublicAppointment(body, {
      ipAddress: ip,
      userAgent
    });
    return c.json({ success: true, booking }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

// Criar agendamento com validação de buffer e geração do Google Meet (§3.1, §3.2)
appointmentsRoute.post('/', async (c) => {
  const body = await c.req.json<CreateAppointmentDTO & { therapistId: string }>();
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');

  try {
    const appointment = await AppointmentService.createAppointment(
      body.therapistId || 'therapist-001',
      body,
      { actorId: body.therapistId || 'therapist-001', ipAddress: ip, userAgent }
    );
    return c.json({ success: true, appointment }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

// Atualizar status da sessão (SOLICITADA -> CONFIRMADA -> EM_ANDAMENTO -> CONCLUIDA)
appointmentsRoute.patch('/:id/status', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<UpdateAppointmentStatusDTO>();
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');

  try {
    const updated = AppointmentService.updateStatus(id, body.status, {
      actorId: 'therapist-001',
      ipAddress: ip,
      userAgent
    });
    return c.json({ success: true, appointment: updated });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

// Encerrar chamada no Google Meet REST API v2 (:endActiveConference)
appointmentsRoute.post('/:id/end-meet', async (c) => {
  const id = c.req.param('id');
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');

  const appt = db.appointments.get(id);
  if (!appt) {
    return c.json({ success: false, error: 'Consulta não encontrada' }, 404);
  }

  let ended = false;
  if (appt.meetSpaceName) {
    ended = await GoogleMeetService.endActiveConference(appt.meetSpaceName);
  }

  AuditService.log({
    actorId: 'therapist-001',
    resourceType: AuditResourceType.MEET,
    resourceId: appt.meetSpaceName || id,
    action: AuditAction.MEET_CONFERENCE_ENDED,
    ipAddress: ip,
    userAgent
  });

  return c.json({
    success: true,
    conferenceEnded: ended,
    appointmentId: id,
    spaceName: appt.meetSpaceName || null,
    message: ended 
      ? 'Conferência ativa encerrada no Google Meet com sucesso.' 
      : 'Conferência finalizada localmente (sem chamada remota ativa).'
  });
});

import { ReminderService } from '../services/reminderService';
import { ReminderChannel } from '@terapiainfoco/shared';

// Listar consultas do terapeuta
appointmentsRoute.get('/therapist/:therapistId', async (c) => {
  const therapistId = c.req.param('therapistId');
  const appointments = AppointmentService.getTherapistAppointments(therapistId);
  return c.json({ success: true, appointments });
});

// Criar agendamento recorrente em série (§3.1)
appointmentsRoute.post('/recurrent', async (c) => {
  const body = await c.req.json<CreateAppointmentDTO & { therapistId: string }>();
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');

  try {
    const result = await AppointmentService.createRecurrentAppointments(
      body.therapistId || 'therapist-001',
      body,
      { actorId: body.therapistId || 'therapist-001', ipAddress: ip, userAgent }
    );
    return c.json(result, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

// Cancelar série recorrente inteira (§3.1)
appointmentsRoute.delete('/series/:seriesId', async (c) => {
  const seriesId = c.req.param('seriesId');
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');

  try {
    const result = AppointmentService.cancelSeries(seriesId, {
      actorId: 'therapist-001',
      ipAddress: ip,
      userAgent
    });
    return c.json({ success: true, ...result });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

// Disparar lembrete de teleconsulta (WhatsApp e/ou E-mail) (§3.1)
appointmentsRoute.post('/:id/reminders', async (c) => {
  const appointmentId = c.req.param('id');
  const body = await c.req.json<{ channel?: ReminderChannel; customMessage?: string }>();
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');

  try {
    const result = await ReminderService.sendAppointmentReminder({
      appointmentId,
      channel: body.channel || ReminderChannel.WHATSAPP,
      customMessage: body.customMessage
    }, {
      actorId: 'therapist-001',
      ipAddress: ip,
      userAgent
    });
    return c.json(result, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

// Pré-visualização do texto e link do lembrete de consulta (§3.1)
appointmentsRoute.get('/:id/reminders/preview', async (c) => {
  const appointmentId = c.req.param('id');
  const channel = (c.req.query('channel') as ReminderChannel) || ReminderChannel.WHATSAPP;

  try {
    const preview = ReminderService.previewReminder(appointmentId, channel);
    return c.json({ success: true, preview });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

// Listar histórico de lembretes enviados para a consulta (§3.1)
appointmentsRoute.get('/:id/reminders', async (c) => {
  const appointmentId = c.req.param('id');
  try {
    const reminders = ReminderService.getAppointmentReminders(appointmentId);
    return c.json({ success: true, reminders });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});


