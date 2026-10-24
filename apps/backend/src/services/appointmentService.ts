import { randomUUID } from 'node:crypto';
import { 
  AppointmentStatus, 
  AuditAction, 
  AuditResourceType,
  RecurrenceFrequency,
  SessionPaymentStatus,
  UserRole,
  type CreateAppointmentDTO, 
  type StoredAppointment, 
  type DecryptedAppointment,
  type AvailableSlot,
  type AvailableSlotsResponse,
  type PatientBookingDTO,
  type PatientAppointmentView,
  type TherapistPublicProfile,
  type CreateRecurrentAppointmentsResponse,
  type AgendaQuery,
  type AgendaPageResponse,
  type AgendaPeriod,
  type AgendaOrder,
  AGENDA_PERIODS,
  AGENDA_STATUS_GROUPS,
  AGENDA_PAGE_SIZE
} from '@terapiainfoco/shared';
import { UserRepository } from '../repositories/userRepository';
import { encryptField, decryptField } from './cryptoContext';
import { AuditService } from './auditService';
import { PatientService } from './patientService';
import { practiceProfessional, formatCrp } from './practiceProfessional';
import { config } from '../config';
import { teleconsultationRoomUrl, toDecryptedAppointment } from './teleconsultationRoom';
import { TherapistProfileRepository } from '../repositories/therapistProfileRepository';

import { PatientRepository } from '../repositories/patientRepository';
import { AppointmentRepository } from '../repositories/appointmentRepository';
export { teleconsultationRoomUrl, toDecryptedAppointment } from './teleconsultationRoom';

/** "-03:00" -> -180 */
function utcOffsetMinutes(offset: string): number {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

/** Minúsculas e sem acentos, para a busca por nome */
function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/** Início do dia (00:00) em Brasília; o Brasil não tem horário de verão desde 2019 */
function brasiliaDayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00-03:00`);
}

/** Intervalo [from, to) de cada período da grade, com dias contados no fuso de Brasília */
export function agendaPeriodRange(period: AgendaPeriod, now: Date): { from?: Date; to?: Date } {
  const today = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const startOfToday = brasiliaDayStart(today);
  const DAY = 86_400_000;
  switch (period) {
    case 'today':
      return { from: startOfToday, to: new Date(startOfToday.getTime() + DAY) };
    case 'next7':
      return { from: startOfToday, to: new Date(startOfToday.getTime() + 7 * DAY) };
    case 'month': {
      const [year, month] = today.split('-').map(Number);
      const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
      return { from: brasiliaDayStart(`${today.slice(0, 7)}-01`), to: brasiliaDayStart(next) };
    }
    case 'past':
      return { to: startOfToday };
    default:
      return {};
  }
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
    if (dto.feeCents !== undefined && (!Number.isInteger(dto.feeCents) || dto.feeCents < 0 || dto.feeCents > 1_000_000)) {
      throw new Error('Valor da sessão inválido.');
    }

    // Validação de conflito de horário e buffer de respiro
    await this.validateScheduleConflicts(therapistId, start, end, bufferMin);

    const id = randomUUID();
    const storedAppointment: StoredAppointment = {
      id,
      therapistId,
      patientId: dto.patientId,
      scheduledStart: start,
      scheduledEnd: end,
      status: AppointmentStatus.CONFIRMADA,
      feeCents: dto.feeCents ?? await this.practiceSessionFee(therapistId),
      paymentStatus: SessionPaymentStatus.PENDING,
      createdAt: new Date()
    };

    await AppointmentRepository.create(storedAppointment);

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

  /** "Nome (CRP ...)" do perfil público ou do titular, para a grade de horários */
  private static async slotsTherapistLabel(therapistId: string): Promise<string> {
    const profile = await TherapistProfileRepository.findByTherapistId(therapistId);
    const professional = await practiceProfessional(therapistId);
    const name = profile?.displayName || professional.name;
    const crp = formatCrp(profile?.crp || professional.crp);
    return crp ? `${name} (${crp})` : name;
  }

  /** Valor padrão da sessão: o do perfil público ou, sem perfil, o da conta do psicólogo titular */
  static async practiceSessionFee(therapistId: string): Promise<number | undefined> {
    const profile = await TherapistProfileRepository.findByTherapistId(therapistId);
    if (profile?.sessionFeeCents) return profile.sessionFeeCents;
    const [titular] = await UserRepository.list({ therapistId, roles: [UserRole.PSICOLOGO_TITULAR] });
    return titular?.sessionFeeCents ?? undefined;
  }

  /**
   * Regras de transição pedidas pela equipe do consultório. Iniciar, concluir e registrar falta
   * são atos clínicos (psicólogo/supervisor) e dependem do horário: uma sessão de amanhã não
   * pode constar como concluída nas métricas nem sumir da lista do paciente.
   */
  static async assertStaffTransition(
    appointmentId: string,
    newStatus: AppointmentStatus,
    role: UserRole,
    now: Date = new Date()
  ): Promise<void> {
    const appointment = await AppointmentRepository.findById(appointmentId);
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
  static async updateStatus(
    appointmentId: string,
    newStatus: AppointmentStatus,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): Promise<DecryptedAppointment> {
    const appointment = await AppointmentRepository.findById(appointmentId);
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
    await AppointmentRepository.save(appointment);

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
  static async getTherapistAppointments(therapistId: string): Promise<DecryptedAppointment[]> {
    // Nome decifrado só para pacientes do próprio consultório, como no dashboard clínico
    const patientNames = new Map<string, string>();
    for (const patient of await PatientRepository.list({ therapistId })) {
      try {
        patientNames.set(patient.id, decryptField(patient.encryptedName));
      } catch {
        patientNames.set(patient.id, 'Paciente Cadastrado');
      }
    }

    return (await AppointmentRepository.list({ therapistId })).map((app) => ({
      ...toDecryptedAppointment(app),
      patientName: patientNames.get(app.patientId) ?? 'Paciente Cadastrado'
    }));
  }

  /**
   * Grade de atendimento paginada: período (dias de Brasília), grupo de status, busca pelo nome
   * do paciente e ordem. A busca acontece aqui porque os nomes ficam cifrados no banco.
   */
  static async getAgendaPage(therapistId: string, query: AgendaQuery, now: Date = new Date()): Promise<AgendaPageResponse> {
    const period: AgendaPeriod = AGENDA_PERIODS.some((p) => p.key === query.period) ? query.period! : 'next7';
    const order: AgendaOrder = query.order === 'oldest' ? 'oldest' : 'newest';
    const limit = Math.min(100, Math.max(1, Math.floor(Number(query.limit) || AGENDA_PAGE_SIZE)));
    const offset = Math.max(0, Math.floor(Number(query.offset) || 0));
    const group = AGENDA_STATUS_GROUPS.find((g) => g.key === query.status);

    const patientNames = new Map<string, string>();
    for (const patient of await PatientRepository.list({ therapistId })) {
      try {
        patientNames.set(patient.id, decryptField(patient.encryptedName));
      } catch {
        patientNames.set(patient.id, 'Paciente Cadastrado');
      }
    }
    const search = normalizeSearch(query.q ?? '');
    const patientIds = search
      ? [...patientNames].filter(([, name]) => normalizeSearch(name).includes(search)).map(([id]) => id)
      : undefined;

    const { from, to } = agendaPeriodRange(period, now);
    const page = await AppointmentRepository.listPage({
      therapistId, from, to, statuses: group?.statuses, patientIds, order, limit, offset
    });

    const statusCounts = Object.fromEntries(AGENDA_STATUS_GROUPS.map((g) => [
      g.key,
      g.statuses.reduce((sum, status) => sum + (page.countsByStatus[status] ?? 0), 0)
    ]));
    return {
      appointments: page.items.map((app) => ({
        ...toDecryptedAppointment(app),
        patientName: patientNames.get(app.patientId) ?? 'Paciente Cadastrado'
      })),
      total: page.total,
      statusCounts,
      periodTotal: Object.values(page.countsByStatus).reduce((sum, n) => sum + n, 0),
      hasMore: offset + page.items.length < page.total
    };
  }

  /**
   * Consulta horários disponíveis de teleatendimento para a landing page pública
   * Respeita buffer obrigatório de 10 minutos e horários já ocupados
   */
  static async getAvailableSlots(
    therapistId: string,
    targetDateStr?: string
  ): Promise<AvailableSlotsResponse> {
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
          await this.validateScheduleConflicts(therapistId, slotStart, slotEnd, bufferMinutes);
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
      therapistName: await this.slotsTherapistLabel(therapistId),
      date: dateFormatted,
      bufferMinutes,
      slots
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
    const user = await UserRepository.findById(userId);
    if (!user) throw new Error('Usuário não encontrado.');
    let patientId = (await this.linkedPatientRecords(userId)).find((p) => p.therapistId === dto.therapistId)?.id;
    const profile = await this.requireBookableTherapist(dto.therapistId, !!patientId);
    const actor = { actorId: userId, ipAddress: context.ipAddress, userAgent: context.userAgent };

    if (!patientId) {
      const created = await PatientService.createPatient(dto.therapistId, {
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        consentTranscriptionSigned: false
      }, actor);
      const record = (await PatientRepository.findById(created.id))!;
      record.linkedUserId = userId;
      await PatientRepository.save(record);
      patientId = created.id;
      if (!user.patientId) {
        user.patientId = created.id;
        await UserRepository.save(user);
      }
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
  private static async linkedPatientRecords(userId: string) {
    const user = await UserRepository.findById(userId);
    if (!user) return [];
    return PatientRepository.listForPatientAccount(userId, user.patientId);
  }

  /** Psicólogos que já atendem o paciente, para agendar a próxima sessão sem passar pela busca */
  static async getPatientUserTherapists(userId: string): Promise<TherapistPublicProfile[]> {
    const therapistIds = new Set((await this.linkedPatientRecords(userId)).map((p) => p.therapistId));
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
    const patientIds = (await this.linkedPatientRecords(userId)).map((p) => p.id);
    const appointments = await AppointmentRepository.list({ patientIds });

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

  private static async validateScheduleConflicts(
    therapistId: string,
    start: Date,
    end: Date,
    bufferMinutes: number
  ): Promise<void> {
    // Conflito considerando o buffer de respiro
    const bufferMs = bufferMinutes * 60 * 1000;
    const conflicts = await AppointmentRepository.listActiveOverlapping(
      therapistId,
      new Date(start.getTime() - bufferMs),
      new Date(end.getTime() + bufferMs)
    );
    if (conflicts.length > 0) {
      throw new Error(
        `Conflito de agenda: o horário solicitado colide com outra sessão ou com o buffer obrigatório de ${bufferMinutes} min.`
      );
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
        await this.validateScheduleConflicts(therapistId, slotStart, slotEnd, bufferMin);
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
      
      const stored = await AppointmentRepository.findById(created.id);
      if (stored) {
        stored.seriesId = seriesId;
        stored.sequenceNumber = i + 1;
        stored.totalInSeries = count;
        stored.recurrenceFrequency = frequency;
        await AppointmentRepository.save(stored);
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
  static async cancelSeries(
    seriesId: string,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): Promise<{ canceledCount: number; seriesId: string }> {
    let canceledCount = 0;
    const now = new Date();

    for (const app of await AppointmentRepository.list({ seriesId })) {
      if (
        new Date(app.scheduledStart) > now &&
        app.status !== AppointmentStatus.CANCELADA_PELO_PACIENTE &&
        app.status !== AppointmentStatus.CANCELADA_PELO_TERAPEUTA
      ) {
        app.status = AppointmentStatus.CANCELADA_PELO_TERAPEUTA;
        await AppointmentRepository.save(app);
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
