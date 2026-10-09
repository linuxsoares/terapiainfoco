import { Hono } from 'hono';
import { AppointmentService } from '../services/appointmentService';
import type { CreateAppointmentDTO, UpdateAppointmentStatusDTO } from '@terapiainfoco/shared';

export const appointmentsRoute = new Hono();

// Criar agendamento com validação de buffer e geração do Google Meet (§3.1, §3.2)
appointmentsRoute.post('/', async (c) => {
  const body = await c.req.json<CreateAppointmentDTO & { therapistId: string }>();
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');

  try {
    const appointment = AppointmentService.createAppointment(
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

// Listar consultas do terapeuta
appointmentsRoute.get('/therapist/:therapistId', async (c) => {
  const therapistId = c.req.param('therapistId');
  const appointments = AppointmentService.getTherapistAppointments(therapistId);
  return c.json({ success: true, appointments });
});
