import { randomUUID, createHash } from 'node:crypto';
import {
  type TeleconsultationRoom,
  type StoredTeleconsultationRoom,
  type WaitingParticipant,
  type TeleconsultationCallMetrics,
  type KnockWaitingRoomResponse,
  type AdmitParticipantDTO,
  type UpdateCallQualityDTO,
  type ToggleRecordingDTO,
  type EndTeleconsultationDTO,
  type SendWebRtcSignalDTO,
  type SyncMediaHardwareDTO,
  type MediaHardwareState,
  type SafeUser,
  type TeleconsultationPollResponse,
  UserRole,
  TeleconsultationRoomStatus,
  TeleconsultationParticipantRole,
  CallQualityState,
  KnockingAction,
  AuditAction,
  AuditResourceType
} from '@terapiainfoco/shared';
import { db } from '../db/memoryDb';
import { encryptField, decryptField } from './cryptoContext';
import { AuditService } from './auditService';
import { PatientService } from './patientService';
import { TeleconsultationSignalBus } from './teleconsultationSignalBus';

/** Perfis que conduzem a sessão do lado do consultório */
const CLINICIAN_ROLES: UserRole[] = [UserRole.PSICOLOGO_TITULAR, UserRole.SUPERVISOR_CLINICO];

/** Leitura sem marcar a coleção como alterada: o polling roda a cada segundo e não muda nada */
function peekRoom(appointmentId: string): StoredTeleconsultationRoom | undefined {
  return Map.prototype.get.call(db.teleconsultationRooms, appointmentId) as StoredTeleconsultationRoom | undefined;
}

export class TeleconsultationService {
  /**
   * Calcula o score MOS (Mean Opinion Score - ITU-T G.107) e estado de qualidade
   */
  static calculateMosAndQuality(metrics: { rttMs: number; jitterMs: number; packetLoss: number }): {
    mosScore: number;
    qualityState: CallQualityState;
    ethicalNotice?: string;
  } {
    const { rttMs, jitterMs, packetLoss } = metrics;
    const effectiveLatency = rttMs + (jitterMs * 2) + 10;
    
    let R = 93.2;
    if (effectiveLatency < 160) {
      R -= (effectiveLatency / 40);
    } else {
      R -= ((effectiveLatency - 120) / 10);
    }

    // Penalidade por perda de pacotes
    R -= (packetLoss * 2.5);
    R = Math.max(0, Math.min(100, R));

    let mos = 1 + (0.035 * R) + (R * (100 - R) * (R - 60) * 0.000007);
    mos = Math.round(Math.max(1.0, Math.min(5.0, mos)) * 100) / 100;

    let qualityState = CallQualityState.GOOD;
    let ethicalNotice: string | undefined;

    if (mos >= 4.3) {
      qualityState = CallQualityState.EXCELLENT;
    } else if (mos >= 4.0) {
      qualityState = CallQualityState.GOOD;
    } else if (mos >= 3.5) {
      qualityState = CallQualityState.FAIR;
    } else {
      qualityState = CallQualityState.POOR;
      ethicalNotice = 'Atenção Ética (CFP nº 011/2018): Instabilidade crítica na conexão. Recomenda-se desativar temporariamente o vídeo para assegurar a inteligibilidade e continuidade da fala clínica.';
    }

    return { mosScore: mos, qualityState, ethicalNotice };
  }

  /**
   * Recupera ou inicializa a sala de teleconsulta vinculada ao agendamento
   */
  static getOrCreateRoom(params: {
    appointmentId: string;
    context: { actorId: string; ipAddress: string; userAgent?: string };
  }): TeleconsultationRoom {
    const { appointmentId, context } = params;
    const existing = db.teleconsultationRooms.get(appointmentId);
    if (existing) {
      return this.decryptStoredRoom(existing);
    }

    const appointment = db.appointments.get(appointmentId);
    if (!appointment) {
      throw new Error('Consulta não encontrada.');
    }
    const { patientId, therapistId } = appointment;
    const patientName = PatientService.getPatientById(patientId, context)?.name ?? 'Paciente';
    // Nome do psicólogo titular do consultório (a sala pode ser aberta primeiro pelo paciente)
    const therapistName = Array.from(db.users.values()).find(
      (u) => u.therapistId === therapistId && u.role === UserRole.PSICOLOGO_TITULAR
    )?.name ?? 'Psicólogo(a)';

    const initialMetrics: TeleconsultationCallMetrics = {
      rttMs: 24,
      jitterMs: 4,
      packetLossRate: 0.1,
      mosScore: 4.45,
      qualityState: CallQualityState.EXCELLENT
    };

    const roomId = randomUUID();
    const wormAuditId = `worm_${randomUUID()}`;
    const now = new Date().toISOString();

    const roomPayload = JSON.stringify({
      roomId,
      appointmentId,
      patientId,
      therapistId,
      createdAt: now
    });
    const roomHashSha256 = createHash('sha256').update(roomPayload).digest('hex');

    const stored: StoredTeleconsultationRoom = {
      id: roomId,
      appointmentId,
      patientId,
      encryptedPatientName: encryptField(patientName),
      therapistId,
      therapistName,
      status: TeleconsultationRoomStatus.IDLE,
      isRecordingActive: false,
      recordingConsentConfirmed: true,
      waitingParticipants: [],
      metrics: initialMetrics,
      peerConnectionFingerprint: `dtls_${createHash('sha256').update(roomId + now).digest('hex').substring(0, 32)}`,
      roomHashSha256,
      wormAuditId,
      createdAt: now,
      updatedAt: now
    };

    db.teleconsultationRooms.set(appointmentId, stored);
    // Sala nova começa sem sinais de negociações anteriores
    TeleconsultationSignalBus.clear(appointmentId);

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.TELECONSULTATION_ROOM,
      resourceId: appointmentId,
      action: AuditAction.TELECONSULTATION_ROOM_CREATED,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return this.decryptStoredRoom(stored);
  }

  /**
   * Paciente autenticado bate à porta da sala de espera (Knocking - CFP nº 011/2018).
   * Um participante por conta: recarregar a página mantém a admissão já concedida.
   */
  static knockWaitingRoom(params: {
    appointmentId: string;
    userId: string;
    clientFingerprint?: string;
    ipAddress: string;
    userAgent?: string;
  }): KnockWaitingRoomResponse {
    const { appointmentId, userId, ipAddress, userAgent } = params;
    const context = { actorId: userId, ipAddress, userAgent };
    this.getOrCreateRoom({ appointmentId, context });
    const stored = db.teleconsultationRooms.get(appointmentId)!;
    if (stored.status === TeleconsultationRoomStatus.COMPLETED) {
      throw new Error('Esta teleconsulta já foi encerrada.');
    }

    const now = new Date().toISOString();
    let participant = stored.waitingParticipants.find((p) => p.userId === userId);
    if (!participant) {
      participant = {
        participantId: `part_${randomUUID()}`,
        userId,
        name: decryptField(stored.encryptedPatientName),
        role: TeleconsultationParticipantRole.PATIENT,
        knockedAt: now,
        status: 'WAITING',
        clientFingerprint: params.clientFingerprint
      };
      stored.waitingParticipants.push(participant);
    } else if (participant.status === 'REJECTED') {
      participant.status = 'WAITING';
      participant.knockedAt = now;
    }

    if (stored.status === TeleconsultationRoomStatus.IDLE) {
      stored.status = TeleconsultationRoomStatus.WAITING_ROOM;
    }
    stored.updatedAt = now;

    AuditService.log({
      actorId: userId,
      resourceType: AuditResourceType.TELECONSULTATION_ROOM,
      resourceId: appointmentId,
      action: AuditAction.TELECONSULTATION_KNOCK,
      ipAddress,
      userAgent
    });

    const admitted = participant.status === 'ADMITTED';
    return {
      success: true,
      participantId: participant.participantId,
      status: admitted ? 'ADMITTED' : 'WAITING',
      message: admitted
        ? 'Você já foi admitido(a) na teleconsulta.'
        : 'Você está na sala de espera. O psicólogo foi notificado e irá admiti-lo(a) em instantes.',
      roomStatus: stored.status
    };
  }

  /**
   * Terapeuta admite ou rejeita participante na sala de espera (Knocking)
   */
  static admitOrRejectParticipant(params: {
    dto: AdmitParticipantDTO;
    context: { actorId: string; ipAddress: string; userAgent?: string };
  }): TeleconsultationRoom {
    const { dto, context } = params;
    const stored = db.teleconsultationRooms.get(dto.appointmentId);
    if (!stored) {
      throw new Error(`Sala de teleconsulta para agendamento ${dto.appointmentId} não encontrada.`);
    }

    const participant = stored.waitingParticipants.find(p => p.participantId === dto.participantId);
    if (!participant) {
      throw new Error(`Participante ${dto.participantId} não localizado na sala de espera.`);
    }

    const now = new Date().toISOString();
    if (dto.action === KnockingAction.ADMIT) {
      participant.status = 'ADMITTED';
      stored.status = TeleconsultationRoomStatus.IN_PROGRESS;
      if (!stored.startedAt) {
        stored.startedAt = now;
      }

      AuditService.log({
        actorId: context.actorId,
        resourceType: AuditResourceType.TELECONSULTATION_ROOM,
        resourceId: dto.appointmentId,
        action: AuditAction.TELECONSULTATION_ADMIT,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      });
    } else {
      participant.status = 'REJECTED';
      AuditService.log({
        actorId: context.actorId,
        resourceType: AuditResourceType.TELECONSULTATION_ROOM,
        resourceId: dto.appointmentId,
        action: AuditAction.TELECONSULTATION_REJECT,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      });
    }

    stored.updatedAt = now;
    return this.decryptStoredRoom(stored);
  }

  /**
   * Atualiza métricas de qualidade de áudio/vídeo em tempo real (RFC-001 §3.2)
   */
  static updateCallQuality(params: {
    dto: UpdateCallQualityDTO;
    context: { actorId: string; ipAddress: string; userAgent?: string };
  }): TeleconsultationRoom {
    const { dto, context } = params;
    const stored = db.teleconsultationRooms.get(dto.appointmentId);
    if (!stored) {
      throw new Error(`Sala de teleconsulta para agendamento ${dto.appointmentId} não encontrada.`);
    }

    const { mosScore, qualityState, ethicalNotice } = this.calculateMosAndQuality({
      rttMs: dto.rttMs,
      jitterMs: dto.jitterMs,
      packetLoss: dto.packetLoss
    });

    stored.metrics = {
      rttMs: dto.rttMs,
      jitterMs: dto.jitterMs,
      packetLossRate: dto.packetLoss,
      mosScore,
      qualityState,
      ethicalNotice
    };
    stored.updatedAt = new Date().toISOString();

    if (qualityState === CallQualityState.POOR) {
      AuditService.log({
        actorId: context.actorId,
        resourceType: AuditResourceType.TELECONSULTATION_ROOM,
        resourceId: dto.appointmentId,
        action: AuditAction.TELECONSULTATION_QUALITY_ALERT,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      });
    }

    return this.decryptStoredRoom(stored);
  }

  /**
   * Alterna estado de gravação consentida da sessão (LGPD Art. 7º & CFP nº 011/2018)
   */
  static toggleRecording(params: {
    dto: ToggleRecordingDTO;
    context: { actorId: string; ipAddress: string; userAgent?: string };
  }): TeleconsultationRoom {
    const { dto, context } = params;
    const stored = db.teleconsultationRooms.get(dto.appointmentId);
    if (!stored) {
      throw new Error(`Sala de teleconsulta para agendamento ${dto.appointmentId} não encontrada.`);
    }

    stored.isRecordingActive = dto.isRecordingActive;
    if (dto.recordingConsentConfirmed !== undefined) {
      stored.recordingConsentConfirmed = dto.recordingConsentConfirmed;
    }
    stored.updatedAt = new Date().toISOString();

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.TELECONSULTATION_ROOM,
      resourceId: dto.appointmentId,
      action: AuditAction.TELECONSULTATION_RECORDING_TOGGLED,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return this.decryptStoredRoom(stored);
  }

  /**
   * Finaliza formalmente a teleconsulta clínica e consolida duração (RFC §3.2)
   */
  static endTeleconsultation(params: {
    dto: EndTeleconsultationDTO;
    context: { actorId: string; ipAddress: string; userAgent?: string };
  }): TeleconsultationRoom {
    const { dto, context } = params;
    const stored = db.teleconsultationRooms.get(dto.appointmentId);
    if (!stored) {
      throw new Error(`Sala de teleconsulta para agendamento ${dto.appointmentId} não encontrada.`);
    }

    const now = new Date().toISOString();
    stored.status = TeleconsultationRoomStatus.COMPLETED;
    stored.endedAt = now;
    stored.isRecordingActive = false;

    if (dto.durationSeconds) {
      stored.durationSeconds = dto.durationSeconds;
    } else if (stored.startedAt) {
      const diffMs = new Date(now).getTime() - new Date(stored.startedAt).getTime();
      stored.durationSeconds = Math.max(0, Math.round(diffMs / 1000));
    } else {
      stored.durationSeconds = 3000; // 50 minutos padrão de psicoterapia
    }

    stored.updatedAt = now;
    TeleconsultationSignalBus.publish({
      appointmentId: dto.appointmentId,
      senderId: context.actorId,
      senderRole: TeleconsultationParticipantRole.THERAPIST,
      signalType: 'BYE'
    });

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.TELECONSULTATION_ROOM,
      resourceId: dto.appointmentId,
      action: AuditAction.TELECONSULTATION_ENDED,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return this.decryptStoredRoom(stored);
  }

  /**
   * Sincroniza o estado real dos dispositivos de hardware (Câmera, Microfone e Compartilhamento de Tela)
   */
  static syncMediaHardware(params: {
    dto: SyncMediaHardwareDTO;
    context: { actorId: string; ipAddress: string; userAgent?: string };
  }): TeleconsultationRoom {
    const { dto, context } = params;
    let stored = db.teleconsultationRooms.get(dto.appointmentId);
    if (!stored) {
      this.getOrCreateRoom({ appointmentId: dto.appointmentId, context });
      stored = db.teleconsultationRooms.get(dto.appointmentId)!;
    }

    const now = new Date().toISOString();
    const hardwareState: MediaHardwareState = {
      cameraActive: Boolean(dto.cameraActive),
      microphoneActive: Boolean(dto.microphoneActive),
      screenShareActive: Boolean(dto.screenShareActive),
      cameraLabel: dto.cameraLabel || 'Câmera WebRTC HD Integrada',
      microphoneLabel: dto.microphoneLabel || 'Microfone WebRTC com Cancelamento de Eco',
      resolution: dto.resolution || '1280x720',
      frameRate: dto.frameRate || 30,
      audioSampleRate: dto.audioSampleRate || 48000,
      updatedAt: now
    };

    if (dto.role === TeleconsultationParticipantRole.PATIENT) {
      stored.patientMediaState = hardwareState;
    } else {
      stored.therapistMediaState = hardwareState;
    }
    stored.updatedAt = now;

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.TELECONSULTATION_ROOM,
      resourceId: dto.appointmentId,
      action: AuditAction.TELECONSULTATION_HARDWARE_SYNC,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return this.decryptStoredRoom(stored);
  }

  /**
   * Sinal WebRTC (SDP / ICE / JOIN / BYE) da parte autenticada. Remetente e papel vêm da
   * sessão; o paciente só sinaliza depois de admitido pelo psicólogo.
   */
  static sendSignal(params: {
    dto: SendWebRtcSignalDTO;
    user: SafeUser;
    context: { actorId: string; ipAddress: string; userAgent?: string };
  }): { seq: number } {
    const { dto, user, context } = params;
    const stored = peekRoom(dto.appointmentId);
    if (!stored || stored.status === TeleconsultationRoomStatus.COMPLETED) {
      throw new Error('A sala de teleconsulta não está ativa.');
    }
    const role = this.participantRole(stored, user);
    if (!role) {
      throw new Error('Aguarde a admissão pelo psicólogo para entrar na chamada.');
    }

    const signal = TeleconsultationSignalBus.publish({
      appointmentId: dto.appointmentId,
      senderId: user.id,
      senderRole: role,
      signalType: dto.signalType,
      sessionId: dto.sessionId,
      sdp: dto.sdp,
      candidate: dto.candidate,
      mediaState: dto.mediaState
    });

    if (dto.signalType === 'OFFER' || dto.signalType === 'ANSWER') {
      AuditService.log({
        actorId: context.actorId,
        resourceType: AuditResourceType.TELECONSULTATION_ROOM,
        resourceId: dto.appointmentId,
        action: AuditAction.TELECONSULTATION_WEBRTC_SIGNAL,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      });
    }
    return { seq: signal.seq };
  }

  /**
   * Polling da sala: sinais da outra parte desde o cursor e situação da sala de espera
   * (fila para o psicólogo; status próprio para o paciente).
   */
  static poll(params: { appointmentId: string; user: SafeUser; cursor?: string }): TeleconsultationPollResponse {
    const { appointmentId, user } = params;
    const stored = peekRoom(appointmentId);
    if (!stored) {
      return { success: true, signals: [], cursor: params.cursor ?? '', roomStatus: TeleconsultationRoomStatus.IDLE, myStatus: null };
    }
    const role = this.participantRole(stored, user);
    const { signals, cursor } = role
      ? TeleconsultationSignalBus.since(appointmentId, params.cursor, user.id)
      : { signals: [], cursor: params.cursor ?? '' };

    if (user.role === UserRole.PACIENTE) {
      const mine = stored.waitingParticipants.find((p) => p.userId === user.id);
      return { success: true, signals, cursor, roomStatus: stored.status, myStatus: mine?.status ?? null };
    }
    return {
      success: true,
      signals,
      cursor,
      roomStatus: stored.status,
      waitingParticipants: stored.waitingParticipants.map(({ participantId, name, knockedAt, status }) => ({ participantId, name, knockedAt, status }))
    };
  }

  /** Papel na chamada: psicólogo/supervisor do consultório ou paciente já admitido */
  private static participantRole(stored: StoredTeleconsultationRoom, user: SafeUser): TeleconsultationParticipantRole | null {
    if (CLINICIAN_ROLES.includes(user.role) && user.therapistId === stored.therapistId) {
      return user.role === UserRole.SUPERVISOR_CLINICO ? TeleconsultationParticipantRole.SUPERVISOR : TeleconsultationParticipantRole.THERAPIST;
    }
    const admitted = stored.waitingParticipants.some((p) => p.userId === user.id && p.status === 'ADMITTED');
    return user.role === UserRole.PACIENTE && admitted ? TeleconsultationParticipantRole.PATIENT : null;
  }

  /**
   * Decripta dados em memória para retorno seguro
   */
  private static decryptStoredRoom(stored: StoredTeleconsultationRoom): TeleconsultationRoom {
    const { signals: _legacySignals, encryptedPatientName, ...room } = stored as StoredTeleconsultationRoom & { signals?: unknown };
    return {
      ...room,
      patientName: decryptField(encryptedPatientName)
    };
  }
}
