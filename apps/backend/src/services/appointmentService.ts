import { randomUUID } from 'node:crypto';
import { 
  AppointmentStatus, 
  AuditAction, 
  AuditResourceType,
  RecurrenceFrequency,
  UserRole,
  type CreateAppointmentDTO, 
  type StoredAppointment, 
  type DecryptedAppointment,
  type AvailableSlot,
  type AvailableSlotsResponse,
  type PublicBookingDTO,
  type PublicBookingResponse,
  type PatientBookingDTO,
  type PatientAppointmentView,
  type TherapistPublicProfile,
  type CreateRecurrentAppointmentsResponse
} from '@terapiainfoco/shared';
import { db } from '../db/memoryDb';
import { encryptField, decryptField } from './cryptoContext';
import { AuditService } from './auditService';
import { PatientService } from './patientService';
import { config } from '../config';
import { teleconsultationRoomUrl, toDecryptedAppointment } from './teleconsultationRoom';
import { TherapistProfileRepository } from '../repositories/therapistProfileRepository';

export { teleconsultationRoomUrl, toDecryptedAppointment } from './teleconsultationRoom';

/** "-03:00" -> -180 */
function utcOffsetMinutes(offset: string): number {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

/** Antecedência máxima para iniciar a sessão (sala aberta antes do horário) */
const SESSION_EARLY_START_MS = 15 * 60 * 1000;

export class AppointmentService {
  /**
   * Agenda uma consulta validando buffers; a teleconsulta acontece na sala própria da plataforma (§3.1, §3.2)
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
    const storedAppointment: StoredAppointment = {
      id,
      therapistId,
      patientId: dto.patientId,
      scheduledStart: start,
      scheduledEnd: end,
      status: AppointmentStatus.CONFIRMADA,
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

    return toDecryptedAppointment(storedAppointment);
  }

  /**
   * Regras de transição pedidas pela equipe do consultório. Iniciar, concluir e registrar falta
   * são atos clínicos (psicólogo/supervisor) e dependem do horário: uma sessão de amanhã não
   * pode constar como concluída nas métricas nem sumir da lista do paciente.
   */
  static assertStaffTransition(
    appointmentId: string,
    newStatus: AppointmentStatus,
    role: UserRole,
    now: Date = new Date()
  ): void {
    const appointment = db.appointments.get(appointmentId);
    if (!appointment) throw new Error('Consulta não encontrada');

    const clinicalStatuses = [AppointmentStatus.EM_ANDAMENTO, AppointmentStatus.CONCLUIDA, AppointmentStatus.NAO_COMPARECEU];
    if (!clinicalStatuses.includes(newStatus)) return;

    if (role !== UserRole.PSICOLOGO_TITULAR && role !== UserRole.SUPERVISOR_CLINICO) {
      throw new Error('Apenas o psicólogo inicia, conclui ou registra falta em uma sessão.');
    }
    const start = new Date(appointment.scheduledStart).getTime();
    if (newStatus === AppointmentStatus.EM_ANDAMENTO && now.getTime() < start - SESSION_EARLY_START_MS) {
      throw new Error('A sessão só pode ser iniciada a partir de 15 minutos antes do horário marcado.');
    }
    // Concluir exige sessão em andamento ou já iniciada no horário (registro retroativo)
    if (newStatus === AppointmentStatus.CONCLUIDA && appointment.status !== AppointmentStatus.EM_ANDAMENTO && now.getTime() < start) {
      throw new Error('Só é possível concluir uma sessão em andamento ou cujo horário já começou.');
    }
    if (newStatus === AppointmentStatus.NAO_COMPARECEU && now.getTime() < start) {
      throw new Error('A falta só pode ser registrada após o horário marcado.');
    }
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

    return toDecryptedAppointment(appointment);
  }

  /**
   * Busca consultas do terapeuta
   */
  static getTherapistAppointments(therapistId: string): DecryptedAppointment[] {
    const list: DecryptedAppointment[] = [];
    for (const app of db.appointments.values()) {
      if (app.therapistId === therapistId) {
        list.push(toDecryptedAppointment(app));
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

    // Data no fuso da clínica (sem data informada, usa a data atual da clínica)
    const offset = config.clinicUtcOffset;
    const dateFormatted = targetDateStr && /^\d{4}-\d{2}-\d{2}$/.test(targetDateStr)
      ? targetDateStr
      : new Date(Date.now() + utcOffsetMinutes(offset) * 60000).toISOString().split('T')[0];

    // Horários padrão de teleatendimento: 09h às 18h (horário da clínica) com sessões de 50 minutos
    const standardHours = [9, 10, 11, 14, 15, 16, 17];
    const slots: AvailableSlot[] = [];
    const now = Date.now();

    for (const hour of standardHours) {
      // Construído com o offset explícito: independe do fuso do servidor (UTC no Railway)
      const slotStart = new Date(`${dateFormatted}T${String(hour).padStart(2, '0')}:00:00${offset}`);
      const slotEnd = new Date(slotStart.getTime() + 50 * 60000); // 50 minutos de atendimento

      let isAvailable = slotStart.getTime() > now;
      if (isAvailable) {
        try {
          this.validateScheduleConflicts(therapistId, slotStart, slotEnd, bufferMinutes);
        } catch {
          isAvailable = false;
        }
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
   * Aplica Field-Level Encryption e Blind Indexing aos dados do visitante e gera o link da sala própria
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
    const profile = await this.requireBookableTherapist(therapistId);

    // 1. Localiza paciente do mesmo consultório via Blind Index (se CPF informado) ou cria novo com FLE
    let patient = dto.patientCpf ? PatientService.findByCpf(dto.patientCpf, {
      actorId: therapistId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    }, therapistId) : null;

    if (!patient) {
      patient = PatientService.createPatient(
        therapistId,
        {
          name: dto.patientName,
          email: dto.patientEmail,
          phone: dto.patientPhone,
          cpf: dto.patientCpf,
          // O TCLE de teleconsulta não implica consentimento de transcrição (LGPD Art. 11)
          consentTranscriptionSigned: false
        },
        {
          actorId: therapistId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent
        }
      );
    }

    // 2. Agenda a consulta com verificação de buffers (sala de teleconsulta própria)
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
      therapistName: `${profile.displayName} (CRP ${profile.crp})`,
      scheduledStart: appointment.scheduledStart.toString(),
      scheduledEnd: appointment.scheduledEnd.toString(),
      roomUrl: appointment.roomUrl,
      bufferMinutes: config.defaultBufferMinutes,
      consentRecordedAt: new Date().toISOString(),
      instructions: [
        'Acesse a sala de teleconsulta pelo link com 5 minutos de antecedência, já com sua conta da plataforma.',
        'Utilize fones de ouvido para garantir o sigilo e a privacidade do seu atendimento.',
        'Certifique-se de estar em um ambiente privativo, silencioso e com boa conexão à internet.'
      ]
    };
  }

  /** Só psicólogos com perfil publicado e CRP verificado recebem agendamentos externos */
  /**
   * Novos pacientes só agendam com perfil publicado e CRP verificado. Quem já é paciente do
   * consultório continua agendando mesmo que o psicólogo saia da busca pública.
   */
  private static async requireBookableTherapist(therapistId: string, existingPatient = false) {
    const profile = await TherapistProfileRepository.findByTherapistId(therapistId);
    if (!profile || !profile.crpVerified || (!profile.published && !existingPatient)) {
      throw new Error('Psicólogo indisponível para agendamento online.');
    }
    return profile;
  }

  /**
   * Agendamento pelo paciente autenticado a partir do perfil público do psicólogo.
   * Reaproveita (ou cria) o registro do paciente no consultório escolhido, vinculado à conta.
   */
  static async bookForPatientUser(
    userId: string,
    dto: PatientBookingDTO,
    context: { ipAddress: string; userAgent?: string }
  ): Promise<PatientAppointmentView> {
    if (!dto.consentTeleconsultationSigned) {
      throw new Error(
        'É obrigatório aceitar o Termo de Consentimento Livre e Esclarecido (TCLE) para agendamento de teleconsulta (Res. CFP nº 011/2018 e LGPD Art. 11).'
      );
    }
    const user = db.users.get(userId);
    if (!user) throw new Error('Usuário não encontrado.');
    let patientId = this.linkedPatientRecords(userId).find((p) => p.therapistId === dto.therapistId)?.id;
    const profile = await this.requireBookableTherapist(dto.therapistId, !!patientId);
    const actor = { actorId: userId, ipAddress: context.ipAddress, userAgent: context.userAgent };

    if (!patientId) {
      const created = PatientService.createPatient(dto.therapistId, {
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        consentTranscriptionSigned: false
      }, actor);
      db.patients.get(created.id)!.linkedUserId = userId;
      patientId = created.id;
      if (!user.patientId) user.patientId = created.id;
    }

    const appointment = await this.createAppointment(dto.therapistId, {
      patientId,
      scheduledStart: dto.scheduledStart,
      scheduledEnd: dto.scheduledEnd
    }, actor);

    return {
      id: appointment.id,
      therapistId: dto.therapistId,
      therapistName: profile.displayName,
      scheduledStart: new Date(appointment.scheduledStart).toISOString(),
      scheduledEnd: new Date(appointment.scheduledEnd).toISOString(),
      status: appointment.status,
      roomUrl: appointment.roomUrl
    };
  }

  /** Registros de paciente vinculados à conta (um por consultório) */
  private static linkedPatientRecords(userId: string) {
    const user = db.users.get(userId);
    if (!user) return [];
    return Array.from(db.patients.values()).filter((p) => p.linkedUserId === userId || p.id === user.patientId);
  }

  /** Psicólogos que já atendem o paciente, para agendar a próxima sessão sem passar pela busca */
  static async getPatientUserTherapists(userId: string): Promise<TherapistPublicProfile[]> {
    const therapistIds = new Set(this.linkedPatientRecords(userId).map((p) => p.therapistId));
    const profiles: TherapistPublicProfile[] = [];
    for (const therapistId of therapistIds) {
      const profile = await TherapistProfileRepository.findByTherapistId(therapistId);
      if (!profile?.crpVerified) continue;
      const { published: _published, crpVerifiedAt: _verifiedAt, ...publicProfile } = profile;
      profiles.push(publicProfile);
    }
    return profiles.sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR'));
  }

  /** Consultas do paciente em todos os consultórios a que sua conta está vinculada */
  static async getPatientUserAppointments(userId: string): Promise<PatientAppointmentView[]> {
    const patientIds = new Set(this.linkedPatientRecords(userId).map((p) => p.id));
    const appointments = Array.from(db.appointments.values())
      .filter((a) => patientIds.has(a.patientId))
      .sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());

    const names = new Map<string, string>();
    for (const therapistId of new Set(appointments.map((a) => a.therapistId))) {
      const profile = await TherapistProfileRepository.findByTherapistId(therapistId);
      names.set(therapistId, profile?.displayName ?? 'Psicólogo(a)');
    }
    return appointments.map((a) => ({
      id: a.id,
      therapistId: a.therapistId,
      therapistName: names.get(a.therapistId)!,
      scheduledStart: new Date(a.scheduledStart).toISOString(),
      scheduledEnd: new Date(a.scheduledEnd).toISOString(),
      status: a.status,
      roomUrl: teleconsultationRoomUrl(a.id)
    }));
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
