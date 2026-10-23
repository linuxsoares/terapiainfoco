import {
  AppointmentStatus,
  AuditAction,
  AuditResourceType,
  PaymentMethod,
  SessionPaymentStatus,
  formatCpf,
  isValidCpf,
  type DecryptedAppointment,
  type FinanceSessionItem,
  type FinanceSummaryResponse,
  type RegisterSessionPaymentDTO,
  type SessionPayer,
  type StoredAppointment
} from '@terapiainfoco/shared';
import { AppointmentRepository } from '../repositories/appointmentRepository';
import { PatientRepository } from '../repositories/patientRepository';
import { decryptOrNull } from './appointmentNotificationService';
import { encryptField } from './cryptoContext';
import { AuditService } from './auditService';
import { toDecryptedAppointment } from './teleconsultationRoom';

/** Sessões que geram cobrança: realizadas ou falta sem aviso */
const BILLABLE_STATUSES = [AppointmentStatus.CONCLUIDA, AppointmentStatus.NAO_COMPARECEU];
const CANCELED_STATUSES = [AppointmentStatus.CANCELADA_PELO_PACIENTE, AppointmentStatus.CANCELADA_PELO_TERAPEUTA];
/** Teto de sanidade para o valor de uma sessão (R$ 10.000,00) */
const MAX_FEE_CENTS = 1_000_000;
const CLINIC_TIME_ZONE = 'America/Sao_Paulo';

export class SessionPaymentError extends Error {}

/** Hoje (YYYY-MM-DD) no fuso do consultório */
export function clinicToday(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: CLINIC_TIME_ZONE });
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`))
    && new Date(`${value}T12:00:00Z`).toISOString().startsWith(value);
}

function decryptPayer(appointment: StoredAppointment): SessionPayer | null {
  const raw = decryptOrNull(appointment.encryptedPayer);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionPayer;
  } catch {
    return null;
  }
}

export const SessionPaymentService = {
  /**
   * Baixa do pagamento (PAID), volta para a receber (PENDING) ou isenção (WAIVED).
   * Ao sair de PAID, data, forma e pagador são apagados.
   */
  async register(
    appointmentId: string,
    dto: RegisterSessionPaymentDTO,
    context: { actorId: string; ipAddress: string; userAgent?: string },
    now = new Date()
  ): Promise<DecryptedAppointment> {
    const appointment = await AppointmentRepository.findById(appointmentId);
    if (!appointment) throw new SessionPaymentError('Consulta não encontrada.');
    if (!Object.values(SessionPaymentStatus).includes(dto.status)) {
      throw new SessionPaymentError('Situação de pagamento inválida.');
    }

    if (dto.feeCents !== undefined) {
      if (!Number.isInteger(dto.feeCents) || dto.feeCents < 0 || dto.feeCents > MAX_FEE_CENTS) {
        throw new SessionPaymentError('Valor da sessão inválido.');
      }
      appointment.feeCents = dto.feeCents;
    }

    if (dto.status === SessionPaymentStatus.PAID) {
      if (CANCELED_STATUSES.includes(appointment.status)) {
        throw new SessionPaymentError('Sessão cancelada não pode ser marcada como paga.');
      }
      if (!appointment.feeCents) throw new SessionPaymentError('Informe o valor da sessão.');
      const paidAt = dto.paidAt ?? clinicToday(now);
      if (!isValidDate(paidAt) || paidAt > clinicToday(now)) {
        throw new SessionPaymentError('Data de pagamento inválida (não pode ser futura).');
      }
      if (!dto.method || !Object.values(PaymentMethod).includes(dto.method)) {
        throw new SessionPaymentError('Informe a forma de pagamento.');
      }
      if (dto.payer) {
        const name = dto.payer.name?.trim();
        if (!name || !isValidCpf(dto.payer.cpf ?? '')) {
          throw new SessionPaymentError('Informe nome e CPF válido de quem pagou.');
        }
        appointment.encryptedPayer = encryptField(JSON.stringify({ name, cpf: formatCpf(dto.payer.cpf) }));
      } else if (dto.payer === null) {
        appointment.encryptedPayer = undefined;
      }
      appointment.paidAt = paidAt;
      appointment.paymentMethod = dto.method;
    } else {
      appointment.paidAt = undefined;
      appointment.paymentMethod = undefined;
      appointment.encryptedPayer = undefined;
    }
    appointment.paymentStatus = dto.status;

    const saved = await AppointmentRepository.save(appointment);
    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.APPOINTMENT,
      resourceId: appointmentId,
      action: AuditAction.UPDATE,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });
    return toDecryptedAppointment(saved);
  },

  /** Contas a receber (todas) e pagamentos recebidos no mês (YYYY-MM) do consultório */
  async summary(therapistId: string, month: string): Promise<FinanceSummaryResponse> {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new SessionPaymentError('Mês inválido (use AAAA-MM).');

    const patientNames = new Map<string, string>();
    for (const patient of await PatientRepository.list({ therapistId })) {
      patientNames.set(patient.id, decryptOrNull(patient.encryptedName) ?? 'Paciente');
    }

    const toItem = (a: StoredAppointment): FinanceSessionItem => ({
      appointmentId: a.id,
      patientId: a.patientId,
      patientName: patientNames.get(a.patientId) ?? 'Paciente',
      scheduledStart: new Date(a.scheduledStart).toISOString(),
      appointmentStatus: a.status,
      feeCents: a.feeCents ?? null,
      paymentStatus: a.paymentStatus ?? SessionPaymentStatus.PENDING,
      paidAt: a.paidAt,
      paymentMethod: a.paymentMethod,
      payerName: decryptPayer(a)?.name
    });

    const appointments = await AppointmentRepository.list({ therapistId });
    const receivable = appointments
      .filter((a) => BILLABLE_STATUSES.includes(a.status) && (a.paymentStatus ?? SessionPaymentStatus.PENDING) === SessionPaymentStatus.PENDING)
      .map(toItem);
    const paid = appointments
      .filter((a) => a.paymentStatus === SessionPaymentStatus.PAID && a.paidAt?.startsWith(month))
      .map(toItem)
      .sort((x, y) => (x.paidAt ?? '').localeCompare(y.paidAt ?? ''));

    return {
      month,
      receivable,
      paid,
      totals: {
        receivableCents: receivable.reduce((sum, item) => sum + (item.feeCents ?? 0), 0),
        paidCents: paid.reduce((sum, item) => sum + (item.feeCents ?? 0), 0),
        receivableWithoutFee: receivable.filter((item) => !item.feeCents).length
      }
    };
  }
};
