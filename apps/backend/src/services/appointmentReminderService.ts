import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppointmentStatus, ReminderDeliveryStatus, UserRole, type AppointmentLinkView, type StoredAppointment } from '@terapiainfoco/shared';
import { config } from '../config';
import { AppointmentRepository } from '../repositories/appointmentRepository';
import { PatientRepository } from '../repositories/patientRepository';
import { UserRepository } from '../repositories/userRepository';
import { AppointmentService } from './appointmentService';
import { decryptOrNull, formatSessionTime } from './appointmentNotificationService';
import { teleconsultationRoomUrl } from './teleconsultationRoom';
import { sendEmailSafely } from './email/emailSender';
import { appointmentCanceledByPatientEmail, appointmentReminderEmail } from './email/templates';

/** O lembrete sai 48h antes: dá tempo de cancelar online dentro da política de 24h */
export const REMINDER_LEAD_MS = 48 * 60 * 60 * 1000;
/** Intervalo da varredura de lembretes */
const SCAN_INTERVAL_MS = 10 * 60 * 1000;

export class AppointmentLinkError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409) {
    super(message);
  }
}

/**
 * Link de confirmar/cancelar enviado no lembrete: id da consulta + validade (fim da sessão),
 * assinados com HMAC. Não exige login; só dá acesso a esta consulta e a estas duas ações.
 */
function linkSignature(appointmentId: string, expiresAt: number): string {
  return createHmac('sha256', config.jwtSecret).update(`appointment-link|${appointmentId}|${expiresAt}`).digest('base64url');
}

export function createAppointmentLinkToken(appointment: Pick<StoredAppointment, 'id' | 'scheduledEnd'>): string {
  const expiresAt = Math.floor(new Date(appointment.scheduledEnd).getTime() / 1000);
  return `${appointment.id}.${expiresAt}.${linkSignature(appointment.id, expiresAt)}`;
}

function verifyAppointmentLinkToken(token: string, now = new Date()): string | null {
  const [appointmentId, rawExpires, signature, extra] = token.split('.');
  if (!appointmentId || !rawExpires || !signature || extra !== undefined) return null;
  const expiresAt = Number(rawExpires);
  if (!Number.isInteger(expiresAt) || expiresAt * 1000 < now.getTime()) return null;
  const expected = Buffer.from(linkSignature(appointmentId, expiresAt));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return appointmentId;
}

async function therapistOf(therapistId: string) {
  return (await UserRepository.list({ therapistId, roles: [UserRole.PSICOLOGO_TITULAR] }))[0] ?? null;
}

async function sendReminder(appointment: StoredAppointment): Promise<boolean> {
  const patient = await PatientRepository.findById(appointment.patientId);
  const email = decryptOrNull(patient?.encryptedEmail);
  if (!patient || !email || !email.includes('@')) return false;
  const patientName = decryptOrNull(patient.encryptedName) ?? 'Paciente';
  const therapistName = (await therapistOf(appointment.therapistId))?.name ?? 'seu(sua) psicólogo(a)';
  const manageLink = `${config.publicAppUrl}/?consulta=${encodeURIComponent(createAppointmentLinkToken(appointment))}`;
  const content = appointmentReminderEmail(
    patientName,
    therapistName,
    formatSessionTime(appointment.scheduledStart),
    manageLink,
    teleconsultationRoomUrl(appointment.id)
  );
  return sendEmailSafely({ to: email, ...content });
}

/**
 * Envia os lembretes devidos (consultas confirmadas que começam nas próximas 48h).
 * Cada consulta é reservada no banco antes do envio; falhas ficam como FAILED, sem reenvio automático.
 */
export async function sendDueAppointmentReminders(now = new Date()): Promise<{ sent: number; failed: number }> {
  const due = await AppointmentRepository.claimDueReminders(now, REMINDER_LEAD_MS);
  let sent = 0;
  for (const appointment of due) {
    if (await sendReminder(appointment)) {
      sent++;
      continue;
    }
    appointment.reminderStatus = ReminderDeliveryStatus.FAILED;
    await AppointmentRepository.save(appointment);
  }
  return { sent, failed: due.length - sent };
}

let scanTimer: ReturnType<typeof setInterval> | null = null;

/** Varredura periódica no processo do backend (não roda nos testes) */
export function startAppointmentReminderScheduler(): void {
  if (scanTimer) return;
  const scan = () => {
    sendDueAppointmentReminders()
      .then(({ sent, failed }) => {
        if (sent || failed) console.log(`✉️  Lembretes de consulta: ${sent} enviado(s), ${failed} sem envio.`);
      })
      .catch((err: any) => console.warn(`⚠️ Varredura de lembretes falhou: ${err.message}`));
  };
  scanTimer = setInterval(scan, SCAN_INTERVAL_MS);
  scanTimer.unref?.();
  setTimeout(scan, 30_000).unref?.();
}

async function loadFromLink(token: string, now: Date): Promise<StoredAppointment> {
  const appointmentId = verifyAppointmentLinkToken(token, now);
  const appointment = appointmentId ? await AppointmentRepository.findById(appointmentId) : null;
  if (!appointment) throw new AppointmentLinkError('Link inválido ou expirado.', 404);
  return appointment;
}

function cancelDeadline(appointment: StoredAppointment): Date {
  return new Date(new Date(appointment.scheduledStart).getTime() - config.minCancelNoticeHours * 60 * 60 * 1000);
}

function toView(appointment: StoredAppointment, therapistName: string, now: Date): AppointmentLinkView {
  const upcoming = appointment.status === AppointmentStatus.CONFIRMADA && new Date(appointment.scheduledStart) > now;
  const deadline = cancelDeadline(appointment);
  return {
    therapistName,
    scheduledStart: new Date(appointment.scheduledStart).toISOString(),
    scheduledEnd: new Date(appointment.scheduledEnd).toISOString(),
    status: appointment.status,
    patientConfirmed: !!appointment.patientConfirmedAt,
    canConfirm: upcoming && !appointment.patientConfirmedAt,
    canCancel: upcoming && now < deadline,
    cancelDeadline: deadline.toISOString()
  };
}

export async function getAppointmentLinkView(token: string, now = new Date()): Promise<AppointmentLinkView> {
  const appointment = await loadFromLink(token, now);
  const therapistName = (await therapistOf(appointment.therapistId))?.name ?? 'seu(sua) psicólogo(a)';
  return toView(appointment, therapistName, now);
}

export async function confirmAppointmentByLink(token: string, now = new Date()): Promise<AppointmentLinkView> {
  const appointment = await loadFromLink(token, now);
  const therapistName = (await therapistOf(appointment.therapistId))?.name ?? 'seu(sua) psicólogo(a)';
  if (appointment.patientConfirmedAt) return toView(appointment, therapistName, now);
  if (!toView(appointment, therapistName, now).canConfirm) {
    throw new AppointmentLinkError('Esta sessão não pode mais ser confirmada.', 409);
  }
  appointment.patientConfirmedAt = now;
  return toView(await AppointmentRepository.save(appointment), therapistName, now);
}

export async function cancelAppointmentByLink(
  token: string,
  context: { ipAddress: string; userAgent?: string },
  now = new Date()
): Promise<AppointmentLinkView> {
  const appointment = await loadFromLink(token, now);
  const therapist = await therapistOf(appointment.therapistId);
  const therapistName = therapist?.name ?? 'seu(sua) psicólogo(a)';
  if (!toView(appointment, therapistName, now).canCancel) {
    throw new AppointmentLinkError(
      `O cancelamento online vale até ${config.minCancelNoticeHours} horas antes da sessão. Fale com seu psicólogo.`,
      409
    );
  }

  const patient = await PatientRepository.findById(appointment.patientId);
  await AppointmentService.updateStatus(appointment.id, AppointmentStatus.CANCELADA_PELO_PACIENTE, {
    actorId: patient?.linkedUserId ?? `paciente-link:${appointment.patientId}`,
    ...context
  });

  if (therapist?.email) {
    const patientName = decryptOrNull(patient?.encryptedName) ?? 'O paciente';
    await sendEmailSafely({
      to: therapist.email,
      ...appointmentCanceledByPatientEmail(therapistName, patientName, formatSessionTime(appointment.scheduledStart))
    });
  }
  return toView({ ...appointment, status: AppointmentStatus.CANCELADA_PELO_PACIENTE }, therapistName, now);
}
