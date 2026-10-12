import { randomUUID } from 'node:crypto';
import { 
  AppointmentStatus, 
  AuditAction, 
  AuditResourceType,
  type CreateAppointmentDTO, 
  type StoredAppointment, 
  type DecryptedAppointment,
  type AvailableSlot,
  type AvailableSlotsResponse,
  type PublicBookingDTO,
  type PublicBookingResponse
} from '@terapiainfoco/shared';
import { db } from '../db/memoryDb';
import { encryptField, decryptField } from './cryptoContext';
import { AuditService } from './auditService';
import { PatientService } from './patientService';
import { config } from '../config';


/**
 * Gera um código válido e estritamente formatado do Google Meet: xxx-yyyy-zzz (3-4-3 letras minúsculas)
 * Exemplo: abc-defg-hij
 */
export function generateGoogleMeetCode(): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const getChunk = (len: number) => {
    let chunk = '';
    for (let i = 0; i < len; i++) {
      chunk += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    return chunk;
  };
  return `${getChunk(3)}-${getChunk(4)}-${getChunk(3)}`;
}

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
    
    // Gera código estritamente no formato Google Meet: xxx-yyyy-zzz (3-4-3 letras minúsculas)
    let meetCode: string;
    let rawMeetUrl: string;

    if (dto.meetUrl?.trim()) {
      let customUrl = dto.meetUrl.trim();
      if (!customUrl.startsWith('http')) {
        customUrl = `https://meet.google.com/${customUrl}`;
      }
      const match = customUrl.match(/meet\.google\.com\/([a-z0-9-]+)/i);
      meetCode = match ? match[1].toLowerCase() : 'custom';
      rawMeetUrl = customUrl;
    } else {
      meetCode = generateGoogleMeetCode();
      rawMeetUrl = `https://meet.google.com/${meetCode}`;
    }

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

  /**
   * Consulta horários disponíveis de teleatendimento para a landing page pública
   * Respeita buffer obrigatório de 10 minutos e horários já ocupados
   */
  static getAvailableSlots(
    therapistId: string,
    targetDateStr?: string
  ): AvailableSlotsResponse {
    const bufferMinutes = config.defaultBufferMinutes;

    // Se não informou data, assume a data atual ou amanhã
    const baseDate = targetDateStr ? new Date(`${targetDateStr}T00:00:00`) : new Date();
    const dateFormatted = baseDate.toISOString().split('T')[0];

    // Horários padrão de teleatendimento: 09h às 18h com sessões de 50 minutos
    const standardHours = [9, 10, 11, 14, 15, 16, 17];
    const slots: AvailableSlot[] = [];

    for (const hour of standardHours) {
      const slotStart = new Date(baseDate);
      slotStart.setHours(hour, 0, 0, 0);
      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(50); // 50 minutos de atendimento

      let isAvailable = true;
      try {
        this.validateScheduleConflicts(therapistId, slotStart, slotEnd, bufferMinutes);
      } catch {
        isAvailable = false;
      }

      slots.push({
        start: slotStart.toISOString(),
        end: slotEnd.toISOString(),
        formattedTime: `${String(hour).padStart(2, '0')}:00 - ${String(hour).padStart(2, '0')}:50`,
        available: isAvailable
      });
    }

    return {
      therapistId,
      therapistName: 'Dra. Vanessa Andrade (CRP 06/142980)',
      date: dateFormatted,
      bufferMinutes,
      slots
    };
  }

  /**
   * Agendamento público de teleconsulta diretamente pela landing page
   * Aplica Field-Level Encryption e Blind Indexing aos dados do visitante e gera link Meet
   */
  static bookPublicAppointment(
    dto: PublicBookingDTO,
    context: { ipAddress: string; userAgent?: string }
  ): PublicBookingResponse {
    if (!dto.consentTeleconsultationSigned) {
      throw new Error(
        'É obrigatório aceitar o Termo de Consentimento Livre e Esclarecido (TCLE) para agendamento de teleconsulta (Res. CFP nº 011/2018 e LGPD Art. 11).'
      );
    }

    const therapistId = dto.therapistId || 'therapist-001';

    // 1. Localiza paciente existente via Blind Index (se CPF informado) ou cria novo com FLE
    let patient = dto.patientCpf ? PatientService.findByCpf(dto.patientCpf, {
      actorId: therapistId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    }) : null;

    if (!patient) {
      patient = PatientService.createPatient(
        therapistId,
        {
          name: dto.patientName,
          email: dto.patientEmail,
          phone: dto.patientPhone,
          cpf: dto.patientCpf,
          consentTranscriptionSigned: true
        },
        {
          actorId: therapistId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent
        }
      );
    }

    // 2. Agenda a consulta com verificação de buffers e sala do Google Meet
    const appointment = this.createAppointment(
      therapistId,
      {
        patientId: patient.id,
        scheduledStart: dto.scheduledStart,
        scheduledEnd: dto.scheduledEnd
      },
      {
        actorId: therapistId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      }
    );

    return {
      appointmentId: appointment.id,
      patientName: patient.name,
      therapistName: 'Dra. Vanessa Andrade (CRP 06/142980)',
      scheduledStart: appointment.scheduledStart.toString(),
      scheduledEnd: appointment.scheduledEnd.toString(),
      meetUrl: appointment.meetUrl,
      meetAccessCode: appointment.meetAccessCode,
      bufferMinutes: config.defaultBufferMinutes,
      consentRecordedAt: new Date().toISOString(),
      instructions: [
        'Acesse o link do Google Meet com 5 minutos de antecedência.',
        'Utilize fones de ouvido para garantir o sigilo e a privacidade do seu atendimento.',
        'Certifique-se de estar em um ambiente privativo, silencioso e com boa conexão à internet.'
      ]
    };
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
