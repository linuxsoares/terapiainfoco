import { randomUUID, createHash } from 'node:crypto';
import {
  type TeleconsultationRoom,
  type StoredTeleconsultationRoom,
  type WaitingParticipant,
  type TeleconsultationCallMetrics,
  type KnockWaitingRoomDTO,
  type KnockWaitingRoomResponse,
  type AdmitParticipantDTO,
  type UpdateCallQualityDTO,
  type ToggleRecordingDTO,
  type EndTeleconsultationDTO,
  type SendWebRtcSignalDTO,
  type SyncMediaHardwareDTO,
  type WebRtcSignalEnvelope,
  type MediaHardwareState,
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

    // Busca detalhes da consulta e paciente
    const appointment = db.appointments.get(appointmentId);
    let patientId = appointment?.patientId || '00000000-0000-0000-0000-000000000002';
    let patientName = 'Mariana Silva de Oliveira';
    let therapistId = appointment?.therapistId || 'therapist-001';
    let therapistName = 'Dra. Beatriz Santos';

    const patient = PatientService.getPatientById(patientId, context);
    if (patient) {
      patientName = patient.name;
    }

    const therapist = db.therapists.get(therapistId);
    const user = db.users.get(context.actorId);
    if (user?.name) therapistName = user.name;
    else if (therapist) therapistName = 'Dra. Vanessa Andrade';

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
   * Paciente bate à porta da sala de espera (Knocking - CFP nº 011/2018)
   */
  static knockWaitingRoom(params: {
    dto: KnockWaitingRoomDTO;
    ipAddress: string;
    userAgent?: string;
  }): KnockWaitingRoomResponse {
    const { dto, ipAddress, userAgent } = params;
    let stored = db.teleconsultationRooms.get(dto.appointmentId);
    if (!stored) {
      // Cria a sala em estado de espera
      const dummyContext = { actorId: 'system_knocker', ipAddress, userAgent };
      this.getOrCreateRoom({ appointmentId: dto.appointmentId, context: dummyContext });
      stored = db.teleconsultationRooms.get(dto.appointmentId)!;
    }

    const participantId = `part_${randomUUID()}`;
    const now = new Date().toISOString();

    const participant: WaitingParticipant = {
      participantId,
      name: dto.patientName,
      role: TeleconsultationParticipantRole.PATIENT,
      knockedAt: now,
      status: 'WAITING',
      clientFingerprint: dto.clientFingerprint || `fp_${randomUUID().substring(0, 8)}`
    };

    // Remove eventual knocking anterior duplicado
    stored.waitingParticipants = stored.waitingParticipants.filter(p => p.name !== dto.patientName);
    stored.waitingParticipants.push(participant);
    
    if (stored.status === TeleconsultationRoomStatus.IDLE) {
      stored.status = TeleconsultationRoomStatus.WAITING_ROOM;
    }
    stored.updatedAt = now;

    AuditService.log({
      actorId: participantId,
      resourceType: AuditResourceType.TELECONSULTATION_ROOM,
      resourceId: dto.appointmentId,
      action: AuditAction.TELECONSULTATION_KNOCK,
      ipAddress,
      userAgent
    });

    return {
      success: true,
      participantId,
      status: 'WAITING',
      message: 'Você está na sala de espera. O terapeuta foi notificado e já irá admitir seu atendimento.',
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
   * Registra mensagem de sinalização WebRTC P2P (SDP Offer, Answer, ICE Candidate)
   */
  static sendSignal(params: {
    dto: SendWebRtcSignalDTO;
    context: { actorId: string; ipAddress: string; userAgent?: string };
  }): { signal: WebRtcSignalEnvelope; room: TeleconsultationRoom } {
    const { dto, context } = params;
    let stored = db.teleconsultationRooms.get(dto.appointmentId);
    if (!stored) {
      this.getOrCreateRoom({ appointmentId: dto.appointmentId, context });
      stored = db.teleconsultationRooms.get(dto.appointmentId)!;
    }

    const now = new Date().toISOString();
    const signal: WebRtcSignalEnvelope = {
      id: `sig_${randomUUID().substring(0, 12)}`,
      appointmentId: dto.appointmentId,
      senderId: context.actorId,
      senderRole: dto.senderRole || TeleconsultationParticipantRole.THERAPIST,
      signalType: dto.signalType,
      sdp: dto.sdp,
      candidate: dto.candidate,
      mediaState: dto.mediaState,
      createdAt: now
    };

    if (!stored.signals) {
      stored.signals = [];
    }
    stored.signals.push(signal);
    if (stored.signals.length > 50) {
      stored.signals = stored.signals.slice(-50);
    }
    stored.updatedAt = now;

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

    return {
      signal,
      room: this.decryptStoredRoom(stored)
    };
  }

  /**
   * Lista sinais WebRTC P2P da sala
   */
  static getSignals(params: {
    appointmentId: string;
    excludeSenderId?: string;
  }): WebRtcSignalEnvelope[] {
    const stored = db.teleconsultationRooms.get(params.appointmentId);
    if (!stored || !stored.signals) return [];
    if (params.excludeSenderId) {
      return stored.signals.filter(s => s.senderId !== params.excludeSenderId);
    }
    return stored.signals;
  }

  /**
   * Decripta dados em memória para retorno seguro
   */
  private static decryptStoredRoom(stored: StoredTeleconsultationRoom): TeleconsultationRoom {
    return {
      ...stored,
      patientName: decryptField(stored.encryptedPatientName)
    };
  }
}
