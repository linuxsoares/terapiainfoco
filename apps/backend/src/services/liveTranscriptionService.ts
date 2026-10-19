import { randomUUID } from 'node:crypto';
import {
  AuditAction,
  AuditResourceType,
  TeleconsultationParticipantRole,
  TeleconsultationRoomStatus,
  TranscriptionSpeaker,
  ConsentScope,
  type LiveTranscriptChunkDTO,
  type LiveTranscriptStatusResponse,
  type LiveTranscriptUtterance,
  type SafeUser,
  type StoredLiveTranscript
} from '@terapiainfoco/shared';
import { db } from '../db/memoryDb';
import { encryptField, decryptField } from './cryptoContext';
import { AuditService } from './auditService';
import { TeleconsultationService } from './teleconsultationService';
import { getSttProvider } from './stt/sttProvider';
import { ConsentService } from './consentService';

/** Trechos de ~10 s de Opus ficam bem abaixo disso; o limite barra abusos */
const MAX_CHUNK_BYTES = 2 * 1024 * 1024;

export class LiveTranscriptionError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 503) {
    super(message);
  }
}

/**
 * Transcrição da teleconsulta durante a sessão (RFC-001 §3.3, ADR-005).
 * Cada participante envia trechos do próprio microfone; o áudio é transcrito pelo provedor de
 * STT e zerado da memória em seguida. Só o texto, cifrado, é persistido.
 */
export class LiveTranscriptionService {
  /** Transcrição disponível: consentimento vigente do paciente e provedor configurado */
  static status(appointmentId: string): LiveTranscriptStatusResponse {
    const appointment = db.appointments.get(appointmentId);
    const patient = appointment ? db.patients.get(appointment.patientId) : undefined;
    if (!patient?.consentTranscriptionSigned || patient.consentRevokedAt) {
      return { success: true, enabled: false, reason: 'NO_CONSENT' };
    }
    if (!getSttProvider()) return { success: true, enabled: false, reason: 'STT_DISABLED' };
    return { success: true, enabled: true };
  }

  /**
   * O paciente titular autoriza (ou recusa) a transcrição pela própria sala (LGPD Art. 11, I).
   * Registra recibo no livro de consentimentos e sincroniza o cadastro.
   */
  static setPatientConsent(
    appointmentId: string,
    user: SafeUser,
    granted: boolean,
    context: { ipAddress: string; userAgent?: string }
  ): LiveTranscriptStatusResponse {
    const appointment = db.appointments.get(appointmentId);
    if (!appointment) throw new LiveTranscriptionError('Consulta não encontrada.', 400);
    ConsentService.getInstance().grantGranularConsent(
      {
        patientId: appointment.patientId,
        scopes: [{
          scope: ConsentScope.TELECONSULTATION_AUDIO_RECORDING,
          granted,
          revocationReason: granted ? undefined : 'Titular recusou a transcrição na sala de teleconsulta'
        }],
        notes: 'Decisão registrada pelo próprio titular na sala de teleconsulta'
      },
      { actorId: user.id, ...context }
    );
    return this.status(appointmentId);
  }

  /** Motivo, em linguagem clara, de não haver transcrição para a consulta */
  static unavailableReason(appointmentId: string): string {
    const status = this.status(appointmentId);
    if (status.reason === 'NO_CONSENT') {
      return 'O paciente não autorizou a transcrição desta sessão (pedido exibido na sala) ou revogou o consentimento.';
    }
    if (status.reason === 'STT_DISABLED') {
      return 'A transcrição não está configurada neste ambiente (OPENAI_API_KEY ausente).';
    }
    return 'Nenhuma fala foi transcrita nesta sessão. Verifique se o indicador "Transcrevendo" apareceu na sala e se houve erro do provedor de transcrição.';
  }

  static async transcribeChunk(
    dto: LiveTranscriptChunkDTO,
    user: SafeUser,
    context: { ipAddress: string; userAgent?: string }
  ): Promise<LiveTranscriptUtterance | null> {
    const role = TeleconsultationService.participantRoleFor(dto.appointmentId, user);
    if (!role) throw new LiveTranscriptionError('Só participantes admitidos na sessão enviam áudio para transcrição.', 403);
    const room = db.teleconsultationRooms.get(dto.appointmentId);
    if (room?.status !== TeleconsultationRoomStatus.IN_PROGRESS || !room.startedAt) {
      throw new LiveTranscriptionError('A transcrição só ocorre durante a sessão em andamento.', 403);
    }
    const status = this.status(dto.appointmentId);
    if (!status.enabled) {
      throw status.reason === 'NO_CONSENT'
        ? new LiveTranscriptionError('Paciente sem consentimento vigente para transcrição.', 403)
        : new LiveTranscriptionError('Transcrição não configurada neste ambiente.', 503);
    }
    if (!dto.audioBase64 || !dto.mimeType?.startsWith('audio/')) {
      throw new LiveTranscriptionError('Trecho de áudio inválido.', 400);
    }

    const audio = Buffer.from(dto.audioBase64, 'base64');
    if (audio.byteLength === 0 || audio.byteLength > MAX_CHUNK_BYTES) {
      throw new LiveTranscriptionError('Trecho de áudio vazio ou maior que o permitido.', 400);
    }

    let text: string;
    try {
      text = (await getSttProvider()!.transcribe(audio, dto.mimeType)).trim();
    } finally {
      // Descarte do áudio: nada além do texto sobrevive à requisição
      audio.fill(0);
    }
    if (!text) return null;

    const endTimeMs = Math.max(0, Date.now() - new Date(room.startedAt).getTime());
    const utterance: LiveTranscriptUtterance = {
      id: randomUUID(),
      speaker: role === TeleconsultationParticipantRole.PATIENT ? TranscriptionSpeaker.PATIENT : TranscriptionSpeaker.THERAPIST,
      startTimeMs: Math.max(0, endTimeMs - Math.max(0, Math.round(dto.durationMs || 0))),
      endTimeMs,
      text,
      createdAt: new Date().toISOString()
    };

    const transcript: StoredLiveTranscript = db.liveTranscripts.get(dto.appointmentId) ?? {
      id: dto.appointmentId,
      appointmentId: dto.appointmentId,
      therapistId: room.therapistId,
      patientId: room.patientId,
      utterances: [],
      updatedAt: utterance.createdAt
    };
    const { text: plain, ...meta } = utterance;
    transcript.utterances.push({ ...meta, encryptedText: encryptField(plain) });
    transcript.updatedAt = utterance.createdAt;
    db.liveTranscripts.set(dto.appointmentId, transcript);

    AuditService.log({
      actorId: user.id,
      resourceType: AuditResourceType.TRANSCRIPTION_SESSION,
      resourceId: dto.appointmentId,
      action: AuditAction.TRANSCRIPTION_INGESTED,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });
    return utterance;
  }

  /** Falas decifradas em ordem cronológica (uso clínico) */
  static getTranscript(appointmentId: string): LiveTranscriptUtterance[] {
    const transcript = db.liveTranscripts.get(appointmentId);
    if (!transcript) return [];
    return transcript.utterances
      .map(({ encryptedText, ...meta }) => ({ ...meta, text: decryptField(encryptedText) }))
      .sort((a, b) => a.startTimeMs - b.startTimeMs);
  }
}
