import { Hono, type Context } from 'hono';
import { AppointmentService } from '../services/appointmentService';
import { AuditService } from '../services/auditService';
import { publicBookingRateLimiter, validationRateLimiter } from '../middlewares/rateLimiter';
import {
  AppointmentLinkError,
  cancelAppointmentByLink,
  confirmAppointmentByLink,
  getAppointmentLinkView
} from '../services/appointmentReminderService';
import { authMiddleware, requireRoles, PRACTICE_STAFF_ROLES } from '../middlewares/authMiddleware';
import { canAccessPatient, requireAppointmentAccess } from '../middlewares/accessPolicy';
import { 
  AuditAction, 
  AuditResourceType,
  type CreateAppointmentDTO, 
  type UpdateAppointmentStatusDTO,
  type PatientBookingDTO,
  type AppointmentLinkView,
  type RegisterSessionPaymentDTO,
  FINANCE_ROLES,
  UserRole
} from '@terapiainfoco/shared';

export const appointmentsRoute = new Hono();

// Consultar grade de horários disponíveis (público / landing page)
appointmentsRoute.get('/available-slots', async (c) => {
  const therapistId = c.req.query('therapistId') || 'therapist-001';
  const date = c.req.query('date');

  try {
    const slotsResponse = await AppointmentService.getAvailableSlots(therapistId, date);
    return c.json({ success: true, ...slotsResponse });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

// Paciente autenticado agenda com um psicólogo da busca pública e acompanha suas consultas
appointmentsRoute.post('/patient/book', publicBookingRateLimiter, authMiddleware(), requireRoles([UserRole.PACIENTE]), async (c) => {
  let body: PatientBookingDTO;
  try {
    body = await c.req.json<PatientBookingDTO>();
  } catch {
    return c.json({ success: false, error: 'Corpo da requisição inválido.' }, 400);
  }
  try {
    const appointment = await AppointmentService.bookForPatientUser(c.get('userId'), body, {
      ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
      userAgent: c.req.header('user-agent')
    });
    await notifyAppointmentsScheduled([appointment.id]);
    return c.json({ success: true, appointment }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

appointmentsRoute.get('/patient/mine', authMiddleware(), requireRoles([UserRole.PACIENTE]), async (c) => {
  const appointments = await AppointmentService.getPatientUserAppointments(c.get('userId'));
  return c.json({ success: true, appointments });
});

// Psicólogos que já atendem o paciente (atalho para agendar a próxima sessão)
appointmentsRoute.get('/patient/therapists', authMiddleware(), requireRoles([UserRole.PACIENTE]), async (c) => {
  const therapists = await AppointmentService.getPatientUserTherapists(c.get('userId'));
  return c.json({ success: true, therapists });
});

// Link do lembrete por e-mail: o paciente vê a sessão e confirma presença ou cancela, sem login.
// Tudo por POST com o token no corpo: não vai para o log de URLs, e leitores de e-mail que
// pré-carregam links não cancelam sessões.
async function respondToLink(c: Context, action: (token: string) => Promise<AppointmentLinkView>) {
  const body = await c.req.json<{ token?: unknown }>().catch(() => ({} as { token?: unknown }));
  if (typeof body.token !== 'string' || !body.token) {
    return c.json({ success: false, error: 'Link inválido ou expirado.' }, 404);
  }
  try {
    return c.json({ success: true, appointment: await action(body.token) });
  } catch (err: any) {
    if (err instanceof AppointmentLinkError) return c.json({ success: false, error: err.message }, err.status);
    return c.json({ success: false, error: err.message }, 400);
  }
}

appointmentsRoute.post('/link', validationRateLimiter, (c) => respondToLink(c, (token) => getAppointmentLinkView(token)));

appointmentsRoute.post('/link/confirm', validationRateLimiter, (c) => respondToLink(c, (token) => confirmAppointmentByLink(token)));

appointmentsRoute.post('/link/cancel', validationRateLimiter, (c) =>
  respondToLink(c, (token) => cancelAppointmentByLink(token, {
    ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
    userAgent: c.req.header('user-agent')
  })));

// Demais rotas da agenda exigem sessão autenticada da equipe do consultório.
// Registrado após as rotas públicas acima: o Hono executa na ordem de registro.
appointmentsRoute.use('*', authMiddleware(), requireRoles(PRACTICE_STAFF_ROLES), async (c, next) => {
  // A agenda é sempre a do consultório do usuário autenticado
  if (!c.get('user').therapistId) {
    return c.json({ success: false, error: 'Usuário sem consultório vinculado.' }, 403);
  }
  await next();
});

// Criar agendamento com validação de buffer; a sessão ocorre na sala de teleconsulta própria (§3.1, §3.2)
appointmentsRoute.post('/', async (c) => {
  const body = await c.req.json<CreateAppointmentDTO>();
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');
  if (!(await canAccessPatient(c.get('user'), body.patientId))) {
    return c.json({ success: false, error: 'Paciente não encontrado.' }, 404);
  }

  try {
    const appointment = await AppointmentService.createAppointment(
      c.get('user').therapistId!,
      body,
      { actorId: c.get('userId'), ipAddress: ip, userAgent }
    );
    await notifyAppointmentsScheduled([appointment.id]);
    return c.json({ success: true, appointment }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

// Pagamento da sessão: baixa, volta para a receber ou isenção (psicólogo titular e recepção)
appointmentsRoute.patch('/:id/payment', requireRoles(FINANCE_ROLES), requireAppointmentAccess(), async (c) => {
  const body = await c.req.json<RegisterSessionPaymentDTO>().catch(() => null);
  if (!body) return c.json({ success: false, error: 'Corpo da requisição inválido.' }, 400);
  try {
    const appointment = await SessionPaymentService.register(c.req.param('id'), body, {
      actorId: c.get('userId'),
      ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
      userAgent: c.req.header('user-agent')
    });
    return c.json({ success: true, appointment });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

// Marca que o recibo da sessão foi lançado no Receita Saúde (controle do psicólogo)
appointmentsRoute.patch('/:id/receita-saude', requireRoles(FINANCE_ROLES), requireAppointmentAccess(), async (c) => {
  const body = await c.req.json<{ issued?: unknown }>().catch(() => null);
  if (!body || typeof body.issued !== 'boolean') return c.json({ success: false, error: 'Informe issued (true/false).' }, 400);
  try {
    const appointment = await SessionPaymentService.markReceitaSaude(c.req.param('id'), body.issued, {
      actorId: c.get('userId'),
      ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
      userAgent: c.req.header('user-agent')
    });
    return c.json({ success: true, appointment });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

// Atualizar status da sessão (SOLICITADA -> CONFIRMADA -> EM_ANDAMENTO -> CONCLUIDA)
appointmentsRoute.patch('/:id/status', requireAppointmentAccess(), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<UpdateAppointmentStatusDTO>();
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');

  try {
    await AppointmentService.assertStaffTransition(id, body.status, c.get('user').role);
    const updated = await AppointmentService.updateStatus(id, body.status, {
      actorId: c.get('userId'),
      ipAddress: ip,
      userAgent
    });
    return c.json({ success: true, appointment: updated });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

import { ReminderService } from '../services/reminderService';
import { SessionPaymentService } from '../services/sessionPaymentService';
import { ReminderChannel } from '@terapiainfoco/shared';

import { notifyAppointmentsScheduled } from '../services/appointmentNotificationService';
import { AppointmentRepository } from '../repositories/appointmentRepository';
// Listar consultas do consultório do usuário autenticado
appointmentsRoute.get('/mine', async (c) => {
  const appointments = await AppointmentService.getTherapistAppointments(c.get('user').therapistId!);
  return c.json({ success: true, appointments });
});

// Listar consultas do terapeuta
appointmentsRoute.get('/therapist/:therapistId', async (c) => {
  const therapistId = c.req.param('therapistId');
  if (therapistId !== c.get('user').therapistId) {
    return c.json({ success: false, error: 'Acesso negado: agenda de outro profissional.' }, 403);
  }
  const appointments = await AppointmentService.getTherapistAppointments(therapistId);
  return c.json({ success: true, appointments });
});

// Criar agendamento recorrente em série (§3.1)
appointmentsRoute.post('/recurrent', async (c) => {
  const body = await c.req.json<CreateAppointmentDTO>();
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');
  if (!(await canAccessPatient(c.get('user'), body.patientId))) {
    return c.json({ success: false, error: 'Paciente não encontrado.' }, 404);
  }

  try {
    const result = await AppointmentService.createRecurrentAppointments(
      c.get('user').therapistId!,
      body,
      { actorId: c.get('userId'), ipAddress: ip, userAgent }
    );
    await notifyAppointmentsScheduled(result.createdAppointments.map((a) => a.id));
    return c.json(result, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

// Cancelar série recorrente inteira (§3.1)
appointmentsRoute.delete('/series/:seriesId', async (c) => {
  const seriesId = c.req.param('seriesId');
  const therapistId = c.get('user').therapistId;
  const ownsSeries = !!therapistId && (await AppointmentRepository.list({ seriesId, therapistId })).length > 0;
  if (!ownsSeries) {
    return c.json({ success: false, error: 'Série não encontrada.' }, 404);
  }
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');

  try {
    const result = await AppointmentService.cancelSeries(seriesId, {
      actorId: c.get('userId'),
      ipAddress: ip,
      userAgent
    });
    return c.json({ success: true, ...result });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

// Disparar lembrete de teleconsulta (WhatsApp e/ou E-mail) (§3.1)
appointmentsRoute.post('/:id/reminders', requireAppointmentAccess(), async (c) => {
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
      actorId: c.get('userId'),
      ipAddress: ip,
      userAgent
    });
    return c.json(result, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

// Pré-visualização do texto e link do lembrete de consulta (§3.1)
appointmentsRoute.get('/:id/reminders/preview', requireAppointmentAccess(), async (c) => {
  const appointmentId = c.req.param('id');
  const channel = (c.req.query('channel') as ReminderChannel) || ReminderChannel.WHATSAPP;

  try {
    const preview = await ReminderService.previewReminder(appointmentId, channel);
    return c.json({ success: true, preview });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

// Listar histórico de lembretes enviados para a consulta (§3.1)
appointmentsRoute.get('/:id/reminders', requireAppointmentAccess(), async (c) => {
  const appointmentId = c.req.param('id');
  try {
    const reminders = ReminderService.getAppointmentReminders(appointmentId);
    return c.json({ success: true, reminders });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});


