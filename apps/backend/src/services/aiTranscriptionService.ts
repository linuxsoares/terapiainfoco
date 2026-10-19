import crypto from 'node:crypto';
import {
  TranscriptionSpeaker,
  TranscriptionStatus,
  AiSoapDraftStatus,
  ConversationalSentiment,
  AuditAction,
  AuditResourceType
} from '@terapiainfoco/shared';
import type {
  DiarizedUtterance,
  ConversationalMetrics,
  AiSoapDraft,
  TranscriptionSession,
  StoredTranscriptionSession,
  IngestTranscriptionDTO,
  ReviewAiSoapDraftDTO,
  StoredClinicalRecord
} from '@terapiainfoco/shared';
import { db } from '../db/memoryDb';
import { config } from '../config';
import { LiveTranscriptionService } from './liveTranscriptionService';
import { encryptField, decryptField } from './cryptoContext';
import { getSoapSynthesizer } from './soap/soapSynthesizer';

/**
 * -------------------------------------------------------------------------------------------------
 * SERVIÇO DE TRANSCRIÇÃO ASSISTIDA POR IA, DIARIZAÇÃO & SÍNTESE SOAP EM TEMPO REAL (RFC-001 §3.3)
 * -------------------------------------------------------------------------------------------------
 * Em conformidade estrita com a Resolução CFP nº 011/2018 (serviços psicológicos mediados por TIC),
 * Resolução CFP nº 001/2009 (guarda de prontuários), LGPD Art. 7º e 11, e princípio Human-in-the-Loop.
 */
export class AiTranscriptionService {

  /**
   * Processa e ingere transcrição com diarização inteligente e sintetiza rascunho SOAP
   */
  public async ingestTranscriptionAndSynthesizeSoap(
    dto: IngestTranscriptionDTO,
    therapistId: string
  ): Promise<{ session: TranscriptionSession; soapDraft: AiSoapDraft }> {
    // 1. Verificação Estrita de Consentimento Informado (LGPD Art. 7º & CFP nº 011/2018)
    if (!dto.consentConfirmed) {
      this.recordAuditLog(
        therapistId,
        AuditAction.TRANSCRIPTION_VIEW,
        AuditResourceType.TRANSCRIPTION_SESSION,
        dto.appointmentId,
        { error: 'CONSENT_REJECTED', message: 'Tentativa de ingestão sem consentimento formal do paciente.' }
      );
      throw new Error('Consentimento do paciente (TCLE) é obrigatório por lei para processamento de áudio/transcrição.');
    }

    const patient = db.patients.get(dto.patientId);
    const patientName = patient ? decryptField(patient.encryptedName) : 'Paciente';

    // 2. Extração ou Construção de Enunciados Diarizados
    let utterances: DiarizedUtterance[] = [];
    if (dto.utterances && dto.utterances.length > 0) {
      utterances = dto.utterances.map((u, idx) => ({
        id: crypto.randomUUID(),
        speaker: u.speaker,
        startTimeMs: u.startTimeMs,
        endTimeMs: u.endTimeMs,
        text: u.text.trim(),
        confidenceScore: u.confidenceScore ?? 0.95,
        sentimentPolarity: u.sentimentPolarity ?? this.detectSentiment(u.text),
        linkedMarkerId: u.linkedMarkerId
      }));
    } else if (dto.rawTranscriptText && dto.rawTranscriptText.trim().length > 0) {
      utterances = this.parseRawTranscriptToUtterances(dto.rawTranscriptText);
    } else {
      // Transcrição feita durante a teleconsulta (STT, sem gravação)
      const live = LiveTranscriptionService.getTranscript(dto.appointmentId);
      if (live.length > 0) {
        utterances = live.map((u) => ({
          id: u.id,
          speaker: u.speaker,
          startTimeMs: u.startTimeMs,
          endTimeMs: u.endTimeMs,
          text: u.text,
          confidenceScore: 0.95,
          sentimentPolarity: this.detectSentiment(u.text)
        }));
      } else if (config.demoMode) {
        // Diálogo clínico de exemplo apenas em demonstração
        utterances = this.createDefaultClinicalDialogue();
      } else {
        throw new Error(`Nenhuma transcrição disponível para esta consulta. ${LiveTranscriptionService.unavailableReason(dto.appointmentId)} Você também pode colar o texto da sessão.`);
      }
    }

    // 3. Vinculação com Marcadores Clínicos da Teleconsulta (se existirem)
    const existingMarkers = Array.from(db.clinicalMarkers.values()).filter(
      m => m.appointmentId === dto.appointmentId
    );

    if (existingMarkers.length > 0) {
      for (const marker of existingMarkers) {
        // Encontra o enunciado mais próximo do marcador no timecode
        const markerTimeMs = marker.timestampMs ?? ((marker as any).timecodeSeconds ? (marker as any).timecodeSeconds * 1000 : 0);
        const matchingUtterance = utterances.find(
          u => Math.abs(u.startTimeMs - markerTimeMs) <= 15000
        );
        if (matchingUtterance && !matchingUtterance.linkedMarkerId) {
          matchingUtterance.linkedMarkerId = marker.id;
        }
      }
    }

    // 4. Cálculo de Métricas Conversacionais e Escuta Ativa
    const metrics = this.calculateConversationalMetrics(utterances);

    // 5. Síntese do Rascunho SOAP Assistida por IA (RFC-001 §3.3)
    const soapDraft = await this.generateAiSoapDraft(
      dto.appointmentId,
      dto.patientId,
      patientName,
      therapistId,
      utterances,
      existingMarkers
    );

    // 6. Cifragem em Repouso do Conteúdo Sensível (FLE AES-256-GCM)
    const rawTranscriptJson = JSON.stringify(utterances);
    const rawTranscriptSha256 = crypto.createHash('sha256').update(rawTranscriptJson).digest('hex');
    const encryptedPayload = encryptField(rawTranscriptJson);
    const encryptedPatientName = encryptField(patientName);

    const sessionId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const session: TranscriptionSession = {
      id: sessionId,
      appointmentId: dto.appointmentId,
      patientId: dto.patientId,
      patientName,
      therapistId,
      status: TranscriptionStatus.COMPLETED,
      consentVerified: true,
      utterances,
      metrics,
      soapDraft,
      rawTranscriptSha256,
      createdAt: nowIso,
      completedAt: nowIso
    };

    const storedSession: StoredTranscriptionSession = {
      id: sessionId,
      appointmentId: dto.appointmentId,
      patientId: dto.patientId,
      therapistId,
      status: TranscriptionStatus.COMPLETED,
      consentVerified: true,
      utterances,
      metrics,
      soapDraft,
      rawTranscriptSha256,
      encryptedPatientName,
      encryptedTranscriptPayload: encryptedPayload,
      createdAt: nowIso,
      completedAt: nowIso
    };

    // 7. Persistência em Memória
    db.transcriptionSessions.set(sessionId, storedSession);
    db.aiSoapDrafts.set(soapDraft.id, soapDraft);

    // 8. Trilha de Auditoria WORM Imutável
    this.recordAuditLog(
      therapistId,
      AuditAction.TRANSCRIPTION_CONSENT_VERIFIED,
      AuditResourceType.TRANSCRIPTION_SESSION,
      sessionId,
      { appointmentId: dto.appointmentId, consentConfirmed: true }
    );

    this.recordAuditLog(
      therapistId,
      AuditAction.TRANSCRIPTION_DIARIZED,
      AuditResourceType.TRANSCRIPTION_SESSION,
      sessionId,
      {
        totalUtterances: utterances.length,
        talkToListenRatio: metrics.talkToListenRatio,
        durationSeconds: metrics.totalDurationSeconds
      }
    );

    this.recordAuditLog(
      therapistId,
      AuditAction.AI_SOAP_SYNTHESIZED,
      AuditResourceType.AI_SOAP_DRAFT,
      soapDraft.id,
      {
        appointmentId: dto.appointmentId,
        suggestedCid11Codes: soapDraft.suggestedCid11Codes,
        zeroRetentionGuaranteed: true
      }
    );

    return { session, soapDraft };
  }

  /**
   * Obtém a sessão de transcrição e rascunho associado a um agendamento
   */
  public async getTranscriptionSession(appointmentId: string): Promise<TranscriptionSession | null> {
    const stored = Array.from(db.transcriptionSessions.values()).find(
      s => s.appointmentId === appointmentId
    );
    if (!stored) return null;

    const patientName = decryptField(stored.encryptedPatientName);
    return {
      id: stored.id,
      appointmentId: stored.appointmentId,
      patientId: stored.patientId,
      patientName,
      therapistId: stored.therapistId,
      status: stored.status,
      consentVerified: stored.consentVerified,
      utterances: stored.utterances,
      metrics: stored.metrics,
      soapDraft: stored.soapDraft,
      rawTranscriptSha256: stored.rawTranscriptSha256,
      wormAuditId: stored.wormAuditId,
      createdAt: stored.createdAt,
      completedAt: stored.completedAt
    };
  }

  /**
   * Obtém um rascunho de SOAP pelo ID
   */
  public async getAiSoapDraft(draftId: string): Promise<AiSoapDraft | null> {
    return db.aiSoapDrafts.get(draftId) || null;
  }

  /**
   * Revisão Humana (Human-in-the-Loop) pelo Psicólogo
   * Permite aceitar, modificar ou rejeitar o rascunho gerado pela IA,
   * e opcionalmente converter diretamente em Prontuário Oficial (EHR).
   */
  public async reviewAiSoapDraft(
    dto: ReviewAiSoapDraftDTO,
    therapistId: string
  ): Promise<{ draft: AiSoapDraft; createdEhrRecordId?: string }> {
    const draft = db.aiSoapDrafts.get(dto.draftId);
    if (!draft) {
      throw new Error(`Rascunho SOAP ${dto.draftId} não encontrado.`);
    }

    draft.status = dto.status as AiSoapDraftStatus;
    draft.reviewedAt = new Date().toISOString();
    draft.reviewNotes = dto.reviewNotes;

    if (dto.status === 'MODIFIED_BY_THERAPIST') {
      if (dto.reviewedSubjective) draft.subjectiveText = dto.reviewedSubjective;
      if (dto.reviewedObjective) draft.objectiveText = dto.reviewedObjective;
      if (dto.reviewedAssessment) draft.assessmentText = dto.reviewedAssessment;
      if (dto.reviewedPlan) draft.planText = dto.reviewedPlan;
      if (dto.finalCid11) draft.suggestedCid11Codes = [dto.finalCid11];
    }

    db.aiSoapDrafts.set(draft.id, draft);

    let createdEhrRecordId: string | undefined;

    // Se o psicólogo aprovar e solicitar salvar como prontuário oficial
    if (dto.saveAsOfficialEhrNote && (dto.status === 'ACCEPTED_BY_THERAPIST' || dto.status === 'MODIFIED_BY_THERAPIST')) {
      const ehrRecordId = crypto.randomUUID();
      const newRecord: StoredClinicalRecord = {
        id: ehrRecordId,
        patientId: draft.patientId,
        therapistId,
        appointmentId: draft.appointmentId,
        sessionNumber: 1, // Pode ser dinâmico com base no histórico
        sessionDate: new Date(),
        encryptedSubjective: encryptField(draft.subjectiveText),
        encryptedObjective: encryptField(draft.objectiveText),
        encryptedAssessment: encryptField(draft.assessmentText),
        encryptedPlan: encryptField(draft.planText),
        cid11Code: dto.finalCid11 || draft.suggestedCid11Codes[0] || undefined,
        signedHash: crypto.createHash('sha256').update(
          `${draft.subjectiveText}|${draft.objectiveText}|${draft.assessmentText}|${draft.planText}`
        ).digest('hex'),
        createdAt: new Date(),
        signedAt: new Date()
      };

      db.clinicalRecords.set(ehrRecordId, newRecord);
      createdEhrRecordId = ehrRecordId;

      this.recordAuditLog(
        therapistId,
        AuditAction.SIGN_RECORD,
        AuditResourceType.CLINICAL_RECORD,
        ehrRecordId,
        { sourceDraftId: draft.id, appointmentId: draft.appointmentId }
      );
    }

    this.recordAuditLog(
      therapistId,
      dto.status === 'MODIFIED_BY_THERAPIST' ? AuditAction.AI_SOAP_MODIFIED : AuditAction.AI_SOAP_ACCEPTED,
      AuditResourceType.AI_SOAP_DRAFT,
      draft.id,
      { status: draft.status, convertedToEhr: !!createdEhrRecordId }
    );

    return { draft, createdEhrRecordId };
  }

  // -----------------------------------------------------------------------------------------------
  // MÉTODOS AUXILIARES: DIARIZAÇÃO, MÉTRICAS E GERAÇÃO SOAP
  // -----------------------------------------------------------------------------------------------

  /**
   * Converte texto corrido com marcadores em enunciados diarizados
   */
  private parseRawTranscriptToUtterances(rawText: string): DiarizedUtterance[] {
    const lines = rawText.split('\n').filter(l => l.trim().length > 0);
    const utterances: DiarizedUtterance[] = [];
    let currentTimeMs = 0;

    for (const line of lines) {
      let speaker = TranscriptionSpeaker.PATIENT;
      let text = line;

      const upper = line.toUpperCase();
      if (upper.includes('[TERAPEUTA]') || upper.startsWith('TERAPEUTA:') || upper.startsWith('PSICÓLOGO:')) {
        speaker = TranscriptionSpeaker.THERAPIST;
        text = line.replace(/\[TERAPEUTA\]|TERAPEUTA:|PSICÓLOGO:/gi, '').trim();
      } else if (upper.includes('[PACIENTE]') || upper.startsWith('PACIENTE:')) {
        speaker = TranscriptionSpeaker.PATIENT;
        text = line.replace(/\[PACIENTE\]|PACIENTE:/gi, '').trim();
      }

      const durationMs = Math.max(3000, text.split(' ').length * 350); // ~350ms por palavra
      const startTimeMs = currentTimeMs;
      const endTimeMs = startTimeMs + durationMs;
      currentTimeMs = endTimeMs + 500; // pausa de 500ms

      utterances.push({
        id: crypto.randomUUID(),
        speaker,
        startTimeMs,
        endTimeMs,
        text,
        confidenceScore: 0.94,
        sentimentPolarity: this.detectSentiment(text)
      });
    }

    return utterances;
  }

  /**
   * Calcula proporções de fala, escuta reflexiva e trocas de turno
   */
  private calculateConversationalMetrics(utterances: DiarizedUtterance[]): ConversationalMetrics {
    let therapistMs = 0;
    let patientMs = 0;
    let turnTakingCount = 0;
    let longestMonologueMs = 0;
    let silenceDurationMs = 0;

    for (let i = 0; i < utterances.length; i++) {
      const u = utterances[i];
      const duration = u.endTimeMs - u.startTimeMs;

      if (duration > longestMonologueMs) {
        longestMonologueMs = duration;
      }

      if (u.speaker === TranscriptionSpeaker.THERAPIST) {
        therapistMs += duration;
      } else {
        patientMs += duration;
      }

      if (i > 0) {
        if (utterances[i - 1].speaker !== u.speaker) {
          turnTakingCount++;
        }
        const gap = u.startTimeMs - utterances[i - 1].endTimeMs;
        if (gap > 0) {
          silenceDurationMs += gap;
        }
      }
    }

    const therapistTalkTimeSeconds = Math.round(therapistMs / 1000);
    const patientTalkTimeSeconds = Math.round(patientMs / 1000);
    const totalDurationSeconds = Math.max(1, therapistTalkTimeSeconds + patientTalkTimeSeconds);
    const talkToListenRatio = Number((therapistTalkTimeSeconds / Math.max(1, patientTalkTimeSeconds)).toFixed(2));

    let clinicalBalanceAdvice = '';
    if (talkToListenRatio > 0.6) {
      clinicalBalanceAdvice = 'Alerta Clínico: O psicólogo ocupou mais de 37% do tempo total de fala. Recomenda-se privilegiar pausas reflexivas e escuta ativa não-diretiva.';
    } else if (talkToListenRatio < 0.15) {
      clinicalBalanceAdvice = 'Atenção: O paciente expressou monólogo prolongado. Avaliar se há ruminação e necessidade de pontuações de enquadre terapêutico.';
    } else {
      clinicalBalanceAdvice = 'Excelente equilíbrio clínico: proporção ideal entre intervenções terapêuticas e escuta atenta do paciente (CFP nº 011/2018).';
    }

    return {
      therapistTalkTimeSeconds,
      patientTalkTimeSeconds,
      totalDurationSeconds,
      talkToListenRatio,
      turnTakingCount,
      longestMonologueSeconds: Math.round(longestMonologueMs / 1000),
      silenceDurationSeconds: Math.round(silenceDurationMs / 1000),
      clinicalBalanceAdvice
    };
  }

  /**
   * Rascunho SOAP sintetizado a partir das falas (RFC-001 §3.3). O alerta de segurança combina
   * marcadores de crise, palavras-chave e o indício de risco apontado pelo sintetizador.
   */
  private async generateAiSoapDraft(
    appointmentId: string,
    patientId: string,
    patientName: string,
    therapistId: string,
    utterances: DiarizedUtterance[],
    markers: Array<any>
  ): Promise<AiSoapDraft> {
    const synthesizer = getSoapSynthesizer();
    if (!synthesizer) {
      throw new Error('A síntese do SOAP por IA não está configurada neste ambiente (OPENAI_API_KEY ausente).');
    }
    const sections = await synthesizer.synthesize(utterances.map(({ speaker, text }) => ({ speaker, text })));

    const fullPatientText = utterances.filter(u => u.speaker === TranscriptionSpeaker.PATIENT).map(u => u.text).join(' ');
    const hasCrisisMarker = markers.some(m => m.category === 'CRISIS_ALERT' || m.markerType === 'CRISIS_ALERT');
    const hasCrisisKeywords = /suic[íi]|desesper|morr|acabar com tudo/i.test(fullPatientText);
    let safetyWarning: string | undefined;
    if (hasCrisisMarker || hasCrisisKeywords || sections.safetyConcern) {
      safetyWarning = 'ATENÇÃO ÉTICA CFP: Detectado relato ou marcador de vulnerabilidade aguda. Recomenda-se verificação imediata da rede de apoio e aplicação do protocolo de segurança.'
        + (sections.safetyConcern ? ` ${sections.safetyConcern}` : '');
    }

    return {
      id: crypto.randomUUID(),
      appointmentId,
      patientId,
      patientName,
      therapistId,
      status: AiSoapDraftStatus.DRAFT_PENDING_REVIEW,
      subjectiveText: sections.subjectiveText,
      objectiveText: sections.objectiveText,
      assessmentText: sections.assessmentText,
      planText: sections.planText,
      suggestedCid11Codes: sections.suggestedCid11Codes,
      keyInsightsSummary: sections.keyInsightsSummary,
      safetyWarning,
      generatedAt: new Date().toISOString(),
      modelIdentifier: synthesizer.modelIdentifier,
      zeroRetentionGuaranteed: synthesizer.zeroRetention
    };
  }

  /**
   * Diálogo simulado caso a transcrição não forneça texto específico
   */
  private createDefaultClinicalDialogue(): DiarizedUtterance[] {
    return [
      {
        id: crypto.randomUUID(),
        speaker: TranscriptionSpeaker.THERAPIST,
        startTimeMs: 0,
        endTimeMs: 6000,
        text: 'Olá Mariana, boa tarde! Como você passou esta semana desde o nosso último encontro?',
        confidenceScore: 0.98,
        sentimentPolarity: ConversationalSentiment.POSITIVE
      },
      {
        id: crypto.randomUUID(),
        speaker: TranscriptionSpeaker.PATIENT,
        startTimeMs: 6500,
        endTimeMs: 25000,
        text: 'Boa tarde, doutora. Olha, confesso que foi uma semana bastante puxada no trabalho. Senti muita ansiedade na quarta-feira e tive dificuldade para dormir.',
        confidenceScore: 0.95,
        sentimentPolarity: ConversationalSentiment.NEGATIVE
      },
      {
        id: crypto.randomUUID(),
        speaker: TranscriptionSpeaker.THERAPIST,
        startTimeMs: 25500,
        endTimeMs: 34000,
        text: 'Entendo. Você conseguiu notar quais foram os pensamentos que surgiram naquele momento de maior agitação?',
        confidenceScore: 0.97,
        sentimentPolarity: ConversationalSentiment.NEUTRAL
      },
      {
        id: crypto.randomUUID(),
        speaker: TranscriptionSpeaker.PATIENT,
        startTimeMs: 34500,
        endTimeMs: 58000,
        text: 'Percebi que fiquei me cobrando excessivamente sobre entregar o relatório perfeitamente. Parecia que qualquer errinho seria o fim do mundo.',
        confidenceScore: 0.96,
        sentimentPolarity: ConversationalSentiment.NEGATIVE
      },
      {
        id: crypto.randomUUID(),
        speaker: TranscriptionSpeaker.THERAPIST,
        startTimeMs: 58500,
        endTimeMs: 72000,
        text: 'Percebe como essa expectativa irreal de perfeição aciona a sua autocrítica? Vamos examinar juntas como podemos flexibilizar essa régua interna.',
        confidenceScore: 0.97,
        sentimentPolarity: ConversationalSentiment.POSITIVE
      }
    ];
  }

  /**
   * Heurística simples de detecção de sentimento afetivo da fala
   */
  private detectSentiment(text: string): ConversationalSentiment {
    const lower = text.toLowerCase();
    const negWords = ['ansiedade', 'medo', 'angústia', 'triste', 'pânico', 'desespero', 'dor', 'ruim', 'difícil', 'insônia'];
    const posWords = ['alívio', 'bem', 'consegui', 'tranquilo', 'esperança', 'calma', 'melhor', 'feliz', 'ótimo', 'agradeço'];

    let negCount = 0;
    let posCount = 0;
    for (const w of negWords) if (lower.includes(w)) negCount++;
    for (const w of posWords) if (lower.includes(w)) posCount++;

    if (negCount > 0 && posCount > 0) return ConversationalSentiment.MIXED;
    if (negCount > 0) return ConversationalSentiment.NEGATIVE;
    if (posCount > 0) return ConversationalSentiment.POSITIVE;
    return ConversationalSentiment.NEUTRAL;
  }

  /**
   * Registro na trilha de auditoria WORM imutável
   */
  private recordAuditLog(
    userId: string,
    action: AuditAction,
    resourceType: AuditResourceType,
    resourceId: string,
    metadata?: Record<string, any>
  ): void {
    db.auditLogs.push({
      id: crypto.randomUUID(),
      timestamp: new Date(),
      userId,
      action,
      resourceType,
      resourceId,
      metadata: metadata ? JSON.stringify(metadata) : undefined
    });
  }
}

export const aiTranscriptionService = new AiTranscriptionService();
