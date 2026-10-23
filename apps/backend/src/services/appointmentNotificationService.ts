import { UserRole } from '@terapiainfoco/shared';
import { AppointmentRepository } from '../repositories/appointmentRepository';
import { PatientRepository } from '../repositories/patientRepository';
import { UserRepository } from '../repositories/userRepository';
import { decryptField } from './cryptoContext';
import { teleconsultationRoomUrl } from './teleconsultationRoom';
import { sendEmailSafely } from './email/emailSender';
import { appointmentScheduledEmail } from './email/templates';

const CLINIC_TIME_ZONE = 'America/Sao_Paulo';

export function formatSessionTime(date: Date | string): string {
  const text = new Date(date).toLocaleString('pt-BR', {
    timeZone: CLINIC_TIME_ZONE,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  return `${text} (horário de Brasília)`;
}

export function decryptOrNull(payload: Parameters<typeof decryptField>[0] | undefined): string | null {
  if (!payload) return null;
  try {
    return decryptField(payload).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Avisa o paciente por e-mail das consultas recém-agendadas (uma ou uma série, num único e-mail).
 * Sem e-mail cadastrado ou sem provedor, nada é enviado; o agendamento nunca falha por isso.
 */
export async function notifyAppointmentsScheduled(appointmentIds: string[]): Promise<boolean> {
  const appointments = (await Promise.all(appointmentIds.map((id) => AppointmentRepository.findById(id))))
    .filter((a): a is NonNullable<typeof a> => !!a)
    .sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());
  if (appointments.length === 0) return false;

  const patient = await PatientRepository.findById(appointments[0].patientId);
  const email = decryptOrNull(patient?.encryptedEmail);
  if (!patient || !email || !email.includes('@')) return false;
  const patientName = decryptOrNull(patient.encryptedName) ?? 'Paciente';

  const therapistId = appointments[0].therapistId;
  const therapist = (await UserRepository.list({ therapistId, roles: [UserRole.PSICOLOGO_TITULAR] }))[0];
  const therapistName = therapist?.name ?? 'seu(sua) psicólogo(a)';

  const content = appointmentScheduledEmail(
    patientName,
    therapistName,
    appointments.map((a) => ({ when: formatSessionTime(a.scheduledStart), roomLink: teleconsultationRoomUrl(a.id) }))
  );
  return sendEmailSafely({ to: email, ...content });
}
