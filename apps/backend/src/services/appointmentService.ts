import { randomUUID } from 'node:crypto';
import { 
  AppointmentStatus, 
  AuditAction, 
  AuditResourceType,
  type CreateAppointmentDTO, 
  type StoredAppointment, 
  type DecryptedAppointment 
} from '@terapiainfoco/shared';
import { db } from '../db/memoryDb';
import { encryptField, decryptField } from './cryptoContext';
import { AuditService } from './auditService';
import { config } from '../config';

export class AppointmentService {
  /**
   * Agenda uma consulta validando buffers e gerando link do Google Meet (§3.1, §3.2)
   */
  static createAppointment(
    therapistId: string,
    dto: CreateAppointmentDTO,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): DecryptedAppointment {
    const start = new Date(dto.scheduledStart);
    const end = new Date(dto.scheduledEnd);
    const bufferMin = dto.bufferMinutes ?? config.defaultBufferMinutes;

    // Validação de conflito de horário e buffer de respiro
    this.validateScheduleConflicts(therapistId, start, end, bufferMin);

    const id = randomUUID();
    // Simula geração de sala do Google Meet com restrição de knocking (§3.2)
    const meetCode = `mt-${Math.random().toString(36).substring(2, 6)}-${Math.random().toString(36).substring(2, 6)}`;
    const rawMeetUrl = `https://meet.google.com/${meetCode}`;

    const storedAppointment: StoredAppointment = {
      id,
      therapistId,
      patientId: dto.patientId,
      scheduledStart: start,
      scheduledEnd: end,
      status: AppointmentStatus.CONFIRMADA,
      googleEventId: `gevent-${randomUUID()}`,
      meetAccessCode: meetCode,
      encryptedMeetUrl: encryptField(rawMeetUrl),
      createdAt: new Date()
    };

    db.appointments.set(id, storedAppointment);

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.APPOINTMENT,
      resourceId: id,
      action: AuditAction.CREATE,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return {
      id,
      therapistId,
      patientId: dto.patientId,
      scheduledStart: start,
      scheduledEnd: end,
      status: storedAppointment.status,
      googleEventId: storedAppointment.googleEventId,
      meetAccessCode: meetCode,
      meetUrl: rawMeetUrl,
      createdAt: storedAppointment.createdAt
    };
  }

  /**
   * Atualiza o estado da sessão conforme fluxo da RFC §3.1
   */
  static updateStatus(
    appointmentId: string,
    newStatus: AppointmentStatus,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): DecryptedAppointment {
    const appointment = db.appointments.get(appointmentId);
    if (!appointment) {
      throw new Error('Consulta não encontrada');
    }

    // Validação de política de cancelamento (mínimo 24h antes)
    if (newStatus === AppointmentStatus.CANCELADA_PELO_PACIENTE) {
      const now = new Date();
      const startTime = new Date(appointment.scheduledStart);
      const hoursDiff = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (hoursDiff < config.minCancelNoticeHours) {
        throw new Error(
          `Cancelamento bloqueado: política de antecedência mínima de ${config.minCancelNoticeHours}h violada.`
        );
      }
    }

    appointment.status = newStatus;

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.APPOINTMENT,
      resourceId: appointmentId,
      action: AuditAction.UPDATE,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return {
      id: appointment.id,
      therapistId: appointment.therapistId,
      patientId: appointment.patientId,
      scheduledStart: appointment.scheduledStart,
      scheduledEnd: appointment.scheduledEnd,
      status: appointment.status,
      googleEventId: appointment.googleEventId,
      meetAccessCode: appointment.meetAccessCode,
      meetUrl: decryptField(appointment.encryptedMeetUrl),
      createdAt: appointment.createdAt
    };
  }

  /**
   * Busca consultas do terapeuta
   */
  static getTherapistAppointments(therapistId: string): DecryptedAppointment[] {
    const list: DecryptedAppointment[] = [];
    for (const app of db.appointments.values()) {
      if (app.therapistId === therapistId) {
        list.push({
          id: app.id,
          therapistId: app.therapistId,
          patientId: app.patientId,
          scheduledStart: app.scheduledStart,
          scheduledEnd: app.scheduledEnd,
          status: app.status,
          googleEventId: app.googleEventId,
          meetAccessCode: app.meetAccessCode,
          meetUrl: decryptField(app.encryptedMeetUrl),
          createdAt: app.createdAt
        });
      }
    }
    return list;
  }

  private static validateScheduleConflicts(
    therapistId: string, 
    start: Date, 
    end: Date, 
    bufferMinutes: number
  ) {
    const bufferMs = bufferMinutes * 60 * 1000;
    const targetStartWithBuffer = start.getTime() - bufferMs;
    const targetEndWithBuffer = end.getTime() + bufferMs;

    for (const app of db.appointments.values()) {
      if (
        app.therapistId === therapistId &&
        app.status !== AppointmentStatus.CANCELADA_PELO_PACIENTE &&
        app.status !== AppointmentStatus.CANCELADA_PELO_TERAPEUTA
      ) {
        const appStart = new Date(app.scheduledStart).getTime();
        const appEnd = new Date(app.scheduledEnd).getTime();

        // Conflito considerando o buffer de respiro
        const overlaps = (targetStartWithBuffer < appEnd) && (targetEndWithBuffer > appStart);
        if (overlaps) {
          throw new Error(
            `Conflito de agenda: o horário solicitado colide com outra sessão ou com o buffer obrigatório de ${bufferMinutes} min.`
          );
        }
      }
    }
  }
}
