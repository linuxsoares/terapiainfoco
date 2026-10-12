import { randomUUID } from 'node:crypto';
import { 
  TranscriptionStatus, 
  SpeakerRole, 
  AuditAction, 
  AuditResourceType,
  type StoredSessionTranscription,
  type DecryptedSessionTranscription,
  type TranscriptUtterance,
  type UploadAudioDTO
} from '@terapiainfoco/shared';
import { db } from '../db/memoryDb';
import { encryptField, decryptField } from './cryptoContext';
import { AuditService } from './auditService';

export class TranscriptionService {
  /**
   * Processa upload de áudio da teleconsulta e realiza diarização (RFC §3.3)
   * Valida obrigatoriedade de consentimento (TCLE) prévio do paciente.
   */
  static uploadAndProcessAudio(
    dto: UploadAudioDTO,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): DecryptedSessionTranscription {
    let appointment = db.appointments.get(dto.appointmentId);
    if (!appointment && dto.appointmentId === '00000000-0000-0000-0000-000000000010') {
      db.seedDemoSession();
      appointment = db.appointments.get(dto.appointmentId);
    }
    if (!appointment) {
      throw new Error('Consulta não encontrada para vincular transcrição.');
    }


    const patient = db.patients.get(appointment.patientId);
    if (!patient || !patient.consentTranscriptionSigned) {
      throw new Error(
        'Gravação e transcrição bloqueadas: O paciente não assinou o consentimento para gravação e transcrição assistida por IA (TCLE / LGPD Art. 11).'
      );
    }

    // Se já houver transcrição para esta consulta, recupera ou atualiza
    for (const [id, existing] of db.sessionTranscriptions.entries()) {
      if (existing.appointmentId === dto.appointmentId) {
        db.sessionTranscriptions.delete(id);
      }
    }

    // Diarização com separação dos canais de fala (Terapeuta vs. Paciente) e carimbos de tempo
    const utterances: TranscriptUtterance[] = dto.customTranscript && dto.customTranscript.length > 0 
      ? dto.customTranscript 
      : this.generateDefaultDiarizedTranscript();

    const wordCount = utterances.reduce((acc, u) => acc + u.text.split(/\s+/).length, 0);
    const durationSeconds = dto.durationSeconds ?? 3120; // ~52 minutos

    const encryptedTranscript = encryptField(JSON.stringify(utterances));
    const id = randomUUID();

    const stored: StoredSessionTranscription = {
      id,
      appointmentId: dto.appointmentId,
      storagePath: `s3://terapiainfoco-transcriptions/appointments/${dto.appointmentId}/${dto.audioFileName || 'teleconsulta.enc'}`,
      encryptedStorageKey: 'kms-dek-transcription-key-v1',
      encryptedTranscript,
      rawStatus: TranscriptionStatus.COMPLETED,
      wordCount,
      durationSeconds,
      createdAt: new Date()
    };

    db.sessionTranscriptions.set(id, stored);

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.TRANSCRIPT,
      resourceId: id,
      action: AuditAction.CREATE,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return {
      id: stored.id,
      appointmentId: stored.appointmentId,
      storagePath: stored.storagePath,
      rawStatus: stored.rawStatus,
      wordCount: stored.wordCount,
      durationSeconds: stored.durationSeconds,
      utterances,
      createdAt: stored.createdAt
    };
  }

  /**
   * Recupera a transcrição e diarização de uma consulta específica decifrando os dados
   */
  static getTranscriptionByAppointment(
    appointmentId: string,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): DecryptedSessionTranscription | null {
    let stored: StoredSessionTranscription | null = null;
    for (const item of db.sessionTranscriptions.values()) {
      if (item.appointmentId === appointmentId) {
        stored = item;
        break;
      }
    }

    if (!stored) return null;

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.TRANSCRIPT,
      resourceId: stored.id,
      action: AuditAction.TRANSCRIPTION_VIEW,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    let utterances: TranscriptUtterance[] = [];
    if (stored.encryptedTranscript) {
      const json = decryptField(stored.encryptedTranscript);
      try {
        utterances = JSON.parse(json);
      } catch {
        utterances = [];
      }
    }

    return {
      id: stored.id,
      appointmentId: stored.appointmentId,
      storagePath: stored.storagePath,
      rawStatus: stored.rawStatus,
      wordCount: stored.wordCount,
      durationSeconds: stored.durationSeconds,
      utterances,
      createdAt: stored.createdAt
    };
  }

  /**
   * Diálogo clínico realista estruturado para demonstração e testes da RFC-001
   */
  private static generateDefaultDiarizedTranscript(): TranscriptUtterance[] {
    return [
      {
        speaker: SpeakerRole.TERAPEUTA,
        time: '00:00:15',
        text: 'Boa tarde, Mariana. Como você está hoje e como foi a sua semana desde a nossa última sessão?'
      },
      {
        speaker: SpeakerRole.PACIENTE,
        time: '00:00:32',
        text: 'Boa tarde, Dra. Vanessa. Tive uma semana bem desafiadora no trabalho. Tive uma reunião muito tensa com meu chefe Roberto e senti aquele aperto forte no peito, mas consegui usar a técnica de respiração diafragmática que combinamos.'
      },
      {
        speaker: SpeakerRole.TERAPEUTA,
        time: '00:01:10',
        text: 'Que excelente avanço, Mariana! E o que passou pela sua mente no momento em que você sentiu a tensão corporal?'
      },
      {
        speaker: SpeakerRole.PACIENTE,
        time: '00:01:45',
        text: 'O pensamento automático que veio foi: "Eles vão perceber que eu não dou conta e vou falhar". Mas aí eu peguei meu caderno, fiz o Registro de Pensamentos Disfuncionais (RPD) e procurei as evidências objetivas.'
      },
      {
        speaker: SpeakerRole.TERAPEUTA,
        time: '00:02:30',
        text: 'Muito bom! Essa é a essência da reestruturação cognitiva. E como foi a resposta do seu corpo após questionar o pensamento?'
      },
      {
        speaker: SpeakerRole.PACIENTE,
        time: '00:03:05',
        text: 'A ansiedade baixou bastante, passei de uma nota 9 para 4. Em relação ao sono, ainda acordei por volta das 4h da manhã algumas vezes, mas a insônia inicial diminuiu cerca de 40% com a higiene do sono.'
      },
      {
        speaker: SpeakerRole.TERAPEUTA,
        time: '00:03:55',
        text: 'Os dados mostram um progresso muito consistente na sua autoeficácia. Para a próxima semana, vamos manter o RPD e aprofundar na origem dessa crença de ter que dar conta de tudo com perfeição.'
      },
      {
        speaker: SpeakerRole.PACIENTE,
        time: '00:04:30',
        text: 'Combinado, doutora. Se precisar de algo, meu e-mail mariana.souza@email.com e meu telefone (11) 98765-4321 continuam os mesmos.'
      }
    ];
  }
}
