import { randomUUID } from 'node:crypto';
import { 
  AppointmentStatus, 
  AuditAction, 
  AuditResourceType,
  MeetProvider,
  MeetAccessType,
  RecurrenceFrequency,
  type CreateAppointmentDTO, 
  type StoredAppointment, 
  type DecryptedAppointment,
  type AvailableSlot,
  type AvailableSlotsResponse,
  type PublicBookingDTO,
  type PublicBookingResponse,
  type CreateRecurrentAppointmentsResponse
} from '@terapiainfoco/shared';
import { db } from '../db/memoryDb';
import { encryptField, decryptField } from './cryptoContext';
import { AuditService } from './auditService';
import { PatientService } from './patientService';
import { GoogleMeetService, generateGoogleMeetCode } from './googleMeetService';
import { config } from '../config';

export { generateGoogleMeetCode };

export class AppointmentService {
  /**
   * Agenda uma consulta validando buffers e orquestrando emissão da sala do Google Meet (§3.1, §3.2)
   * Integra com Google Meet REST API v2 (spaces.create) com política de knocking (CFP 011/2018)
   */
  static async createAppointment(
    therapistId: string,
    dto: CreateAppointmentDTO,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): Promise<DecryptedAppointment> {
    const start = new Date(dto.scheduledStart);
    const end = new Date(dto.scheduledEnd);
    const bufferMin = dto.bufferMinutes ?? config.defaultBufferMinutes;

    // Validação de conflito de horário e buffer de respiro
    this.validateScheduleConflicts(therapistId, start, end, bufferMin);

    const id = randomUUID();
    
    // Orquestra emissão do Google Meet via Google Meet REST API v2 com fallback resiliente
    const meetResult = await GoogleMeetService.createMeetingSpace({
      summary: `Teleconsulta — Dra. Vanessa Andrade (CRP 06/142980)`,
      startTime: start,
      endTime: end,
      accessType: dto.accessType,
      customUrl: dto.meetUrl
    });

    const storedAppointment: StoredAppointment = {
      id,
      therapistId,
      patientId: dto.patientId,
      scheduledStart: start,
      scheduledEnd: end,
      status: AppointmentStatus.CONFIRMADA,
      googleEventId: meetResult.googleEventId || `gevent-${randomUUID()}`,
      meetAccessCode: meetResult.accessCode,
      meetSpaceName: meetResult.spaceName,
      meetProvider: meetResult.provider,
      meetAccessType: meetResult.accessType,
      encryptedMeetUrl: encryptField(meetResult.meetUrl),
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

    if (meetResult.provider === MeetProvider.GOOGLE_MEET_V2) {
      AuditService.log({
        actorId: context.actorId,
        resourceType: AuditResourceType.MEET,
        resourceId: meetResult.spaceName || id,
        action: AuditAction.MEET_SPACE_CREATED,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      });
    }

    return {
      id,
      therapistId,
      patientId: dto.patientId,
      scheduledStart: start,
      scheduledEnd: end,
      status: storedAppointment.status,
      googleEventId: storedAppointment.googleEventId,
      meetAccessCode: meetResult.accessCode,
      meetSpaceName: meetResult.spaceName,
      meetProvider: meetResult.provider,
      meetAccessType: meetResult.accessType,
      meetUrl: meetResult.meetUrl,
      seriesId: storedAppointment.seriesId,
      sequenceNumber: storedAppointment.sequenceNumber,
      totalInSeries: storedAppointment.totalInSeries,
      recurrenceFrequency: storedAppointment.recurrenceFrequency,
      reminderStatus: storedAppointment.reminderStatus,
      lastReminderSentAt: storedAppointment.lastReminderSentAt,
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
      meetSpaceName: appointment.meetSpaceName,
      meetProvider: appointment.meetProvider,
      meetAccessType: appointment.meetAccessType,
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
          meetSpaceName: app.meetSpaceName,
          meetProvider: app.meetProvider,
          meetAccessType: app.meetAccessType,
          meetUrl: decryptField(app.encryptedMeetUrl),
          seriesId: app.seriesId,
          sequenceNumber: app.sequenceNumber,
          totalInSeries: app.totalInSeries,
          recurrenceFrequency: app.recurrenceFrequency,
          reminderStatus: app.reminderStatus,
          lastReminderSentAt: app.lastReminderSentAt,
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
  static async bookPublicAppointment(
    dto: PublicBookingDTO,
    context: { ipAddress: string; userAgent?: string }
  ): Promise<PublicBookingResponse> {
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
    const appointment = await this.createAppointment(
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

  /**
   * Agenda uma série de sessões recorrentes (semanal, quinzenal ou mensal) conforme RFC-001 §3.1
   */
  static async createRecurrentAppointments(
    therapistId: string,
    dto: CreateAppointmentDTO,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): Promise<CreateRecurrentAppointmentsResponse> {
    const recurrence = dto.recurrence;
    if (!recurrence || recurrence.count < 1) {
      const single = await this.createAppointment(therapistId, dto, context);
      return {
        success: true,
        seriesId: `single-${single.id}`,
        frequency: RecurrenceFrequency.WEEKLY,
        requestedCount: 1,
        createdAppointments: [single]
      };
    }

    const count = Math.min(Math.max(recurrence.count, 2), 24); // Entre 2 e 24 sessões
    const frequency = recurrence.frequency || RecurrenceFrequency.WEEKLY;
    const seriesId = `series_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const bufferMin = dto.bufferMinutes ?? config.defaultBufferMinutes;

    const baseStart = new Date(dto.scheduledStart);
    const durationMs = new Date(dto.scheduledEnd).getTime() - baseStart.getTime();

    const createdList: DecryptedAppointment[] = [];
    const conflictSlots: { scheduledStart: string; scheduledEnd: string; reason: string }[] = [];

    for (let i = 0; i < count; i++) {
      let slotStart: Date;
      if (frequency === RecurrenceFrequency.MONTHLY) {
        slotStart = new Date(baseStart);
        slotStart.setMonth(baseStart.getMonth() + i);
      } else if (frequency === RecurrenceFrequency.BIWEEKLY) {
        slotStart = new Date(baseStart.getTime() + (i * 14 * 24 * 60 * 60 * 1000));
      } else {
        // WEEKLY
        slotStart = new Date(baseStart.getTime() + (i * 7 * 24 * 60 * 60 * 1000));
      }

      const slotEnd = new Date(slotStart.getTime() + durationMs);

      // Checa conflito
      try {
        this.validateScheduleConflicts(therapistId, slotStart, slotEnd, bufferMin);
      } catch (conflictErr: any) {
        conflictSlots.push({
          scheduledStart: slotStart.toISOString(),
          scheduledEnd: slotEnd.toISOString(),
          reason: conflictErr.message
        });
        continue;
      }

      const apptDto: CreateAppointmentDTO = {
        ...dto,
        scheduledStart: slotStart.toISOString(),
        scheduledEnd: slotEnd.toISOString()
      };

      const created = await this.createAppointment(therapistId, apptDto, context);
      
      const stored = db.appointments.get(created.id);
      if (stored) {
        stored.seriesId = seriesId;
        stored.sequenceNumber = i + 1;
        stored.totalInSeries = count;
        stored.recurrenceFrequency = frequency;
      }
      created.seriesId = seriesId;
      created.sequenceNumber = i + 1;
      created.totalInSeries = count;
      created.recurrenceFrequency = frequency;

      createdList.push(created);
    }

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.APPOINTMENT,
      resourceId: seriesId,
      action: AuditAction.APPOINTMENT_RECURRENCE_SERIES_CREATED,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return {
      success: createdList.length > 0,
      seriesId,
      frequency,
      requestedCount: count,
      createdAppointments: createdList,
      conflictSlots: conflictSlots.length > 0 ? conflictSlots : undefined
    };
  }

  /**
   * Cancela em lote todas as sessões futuras de uma série recorrente (RFC-001 §3.1)
   */
  static cancelSeries(
    seriesId: string,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): { canceledCount: number; seriesId: string } {
    let canceledCount = 0;
    const now = new Date();

    for (const app of db.appointments.values()) {
      if (
        app.seriesId === seriesId &&
        new Date(app.scheduledStart) > now &&
        app.status !== AppointmentStatus.CANCELADA_PELO_PACIENTE &&
        app.status !== AppointmentStatus.CANCELADA_PELO_TERAPEUTA
      ) {
        app.status = AppointmentStatus.CANCELADA_PELO_TERAPEUTA;
        canceledCount++;
      }
    }

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.APPOINTMENT,
      resourceId: seriesId,
      action: AuditAction.UPDATE,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return { canceledCount, seriesId };
  }
}
