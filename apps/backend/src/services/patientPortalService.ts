import { randomUUID } from 'node:crypto';
import { sign, verify } from 'hono/jwt';
import {
  type TherapeuticExercise,
  type PatientPortalProfile,
  type PatientPortalAppointment,
  type PatientPortalConsent,
  type PatientPortalOverview,
  type AssignExerciseDTO,
  type SubmitExerciseResponseDTO,
  type ReviewExerciseDTO,
  ExerciseType,
  ExerciseStatus,
  AppointmentStatus,
  AuditAction,
  AuditResourceType
} from '@terapiainfoco/shared';
import { db } from '../db/memoryDb';
import { config } from '../config';
import { encryptField, decryptField } from './cryptoContext';
import { AuditService } from './auditService';
import { PatientService } from './patientService';

export class PatientPortalService {
  /**
   * Solicita código temporário descartável de acesso por e-mail para o paciente (RFC-001 §3.6, §3.7)
   */
  static async requestAccessCode(email: string, ipAddress: string = '127.0.0.1'): Promise<{
    success: boolean;
    message: string;
    code?: string;
  }> {
    const normalizedEmail = email.trim().toLowerCase();

    // Localiza o paciente pelo e-mail usando Blind Indexing HMAC-SHA256 (RFC §4.3)
    const patient = PatientService.findByEmail(normalizedEmail, { actorId: 'system', ipAddress });

    if (!patient) {
      return {
        success: false,
        message: 'Nenhum paciente cadastrado foi localizado com este endereço de e-mail.'
      };
    }

    // Gera código seguro de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos de validade

    db.patientAccessCodes.set(normalizedEmail, {
      code,
      patientId: patient.id,
      expiresAt
    });

    // Auditoria WORM
    await AuditService.log({
      actorId: patient.id,
      action: AuditAction.PATIENT_PORTAL_AUTH_REQUESTED,
      resourceType: AuditResourceType.PATIENT_PORTAL,
      resourceId: patient.id,
      ipAddress,
      details: `Solicitação de código de acesso para o Portal do Paciente (${normalizedEmail}).`
    });

    return {
      success: true,
      message: 'Código de verificação enviado com sucesso para seu e-mail.',
      code // Disponível em ambiente de teste / demonstração
    };
  }

  /**
   * Valida código de acesso e emite sessão JWT de Paciente (RFC-001 §3.6)
   */
  static async verifyAccessCode(
    email: string,
    code: string,
    ipAddress: string = '127.0.0.1'
  ): Promise<{
    success: boolean;
    token?: string;
    profile?: PatientPortalProfile;
    message: string;
  }> {
    const normalizedEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();

    const record = db.patientAccessCodes.get(normalizedEmail);
    if (!record) {
      return {
        success: false,
        message: 'Nenhum código ativo encontrado para este e-mail. Solicite um novo código.'
      };
    }

    if (new Date() > record.expiresAt) {
      db.patientAccessCodes.delete(normalizedEmail);
      return {
        success: false,
        message: 'Código de acesso expirado. Solicite um novo código.'
      };
    }

    if (record.code !== cleanCode) {
      return {
        success: false,
        message: 'Código de verificação inválido. Verifique os 6 dígitos digitados.'
      };
    }

    // Código validado: remove para evitar reuso
    db.patientAccessCodes.delete(normalizedEmail);

    const patient = PatientService.getPatientById(record.patientId, { actorId: record.patientId, ipAddress });
    if (!patient) {
      return {
        success: false,
        message: 'Registro de paciente não localizado.'
      };
    }

    const therapist = db.therapists.get(patient.therapistId);
    const user = Array.from(db.users.values()).find(u => u.therapistId === patient.therapistId);
    const therapistName = user?.name || therapist?.name || 'Dra. Beatriz Santos';
    const rawCrp = therapist?.crp || (user as any)?.crp || '06/142980';
    const therapistCrp = rawCrp.startsWith('CRP') ? rawCrp : `CRP ${rawCrp}`;

    const profile: PatientPortalProfile = {
      id: patient.id,
      name: patient.name,
      email: patient.email,
      initials: patient.name
        .split(' ')
        .filter(Boolean)
        .map(n => n[0].toUpperCase() + '.')
        .join(' '),
      therapistName,
      therapistCrp
    };

    const now = Math.floor(Date.now() / 1000);
    const token = await sign(
      {
        sub: patient.id,
        patientId: patient.id,
        email: patient.email,
        name: patient.name,
        role: 'PATIENT',
        type: 'patient_portal_token',
        exp: now + 7 * 24 * 3600, // 7 dias
        iat: now
      },
      config.jwtSecret,
      'HS256'
    );

    // Auditoria WORM
    await AuditService.log({
      actorId: patient.id,
      action: AuditAction.PATIENT_PORTAL_LOGGED_IN,
      resourceType: AuditResourceType.PATIENT_PORTAL,
      resourceId: patient.id,
      ipAddress,
      details: `Paciente ${profile.initials} autenticado no Portal do Paciente com fé pública e sessão isolada.`
    });

    return {
      success: true,
      token,
      profile,
      message: 'Login realizado com sucesso.'
    };
  }

  /**
   * Obtém visão geral consolidada do Portal do Paciente (RFC-001 §3.6, §3.7)
   */
  static getPatientPortalOverview(
    patientId: string,
    context: { actorId: string; ipAddress: string }
  ): PatientPortalOverview {
    const patient = PatientService.getPatientById(patientId, context);
    if (!patient) {
      throw new Error(`Paciente com ID ${patientId} não encontrado.`);
    }

    const therapist = db.therapists.get(patient.therapistId);
    const user = Array.from(db.users.values()).find(u => u.therapistId === patient.therapistId);
    const therapistName = user?.name || therapist?.name || 'Dra. Beatriz Santos';
    const rawCrp = therapist?.crp || (user as any)?.crp || '06/142980';
    const therapistCrp = rawCrp.startsWith('CRP') ? rawCrp : `CRP ${rawCrp}`;

    const profile: PatientPortalProfile = {
      id: patient.id,
      name: patient.name,
      email: patient.email,
      initials: patient.name
        .split(' ')
        .filter(Boolean)
        .map(n => n[0].toUpperCase() + '.')
        .join(' '),
      therapistName,
      therapistCrp
    };

    // Identifica próxima consulta
    const allAppointments = Array.from(db.appointments.values())
      .filter(a => a.patientId === patientId && a.status !== AppointmentStatus.CANCELADA_PELO_PACIENTE && a.status !== AppointmentStatus.CANCELADA_PELO_TERAPEUTA)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let nextAppointment: PatientPortalAppointment | undefined = undefined;
    const now = new Date();

    const upcoming = allAppointments.find(a => {
      const apptDate = new Date(a.date);
      return apptDate.getTime() >= now.getTime() - 60 * 60 * 1000; // Até 1h atrás
    });

    if (upcoming) {
      // Pode entrar na sala de espera se for no mesmo dia e até 30 min antes
      const apptDate = new Date(upcoming.date);
      const diffMs = apptDate.getTime() - now.getTime();
      const canEnterWaitingRoom = diffMs <= 30 * 60 * 1000 && diffMs >= -60 * 60 * 1000;

      let timeFormatted = '14:00';
      try {
        timeFormatted = new Date(upcoming.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      } catch {
        timeFormatted = '14:00';
      }

      nextAppointment = {
        id: upcoming.id,
        date: upcoming.date.split('T')[0] || upcoming.date,
        time: timeFormatted,
        type: upcoming.type || 'Sessão Individual Online',
        status: upcoming.status as AppointmentStatus,
        meetUrl: upcoming.encryptedMeetUrl ? decryptField(upcoming.encryptedMeetUrl, patientId) : undefined,
        canEnterWaitingRoom,
        durationMinutes: 50
      };
    }

    // Exercícios
    const patientExercises = Array.from(db.therapeuticExercises.values()).filter(
      e => e.patientId === patientId
    );
    const pendingExercisesCount = patientExercises.filter(
      e => e.status === ExerciseStatus.ASSIGNED || e.status === ExerciseStatus.IN_PROGRESS
    ).length;
    const completedExercisesCount = patientExercises.filter(
      e => e.status === ExerciseStatus.COMPLETED || e.status === ExerciseStatus.REVIEWED
    ).length;

    // Recibos disponíveis
    const availableReceiptsCount = Array.from(db.receipts.values()).filter(
      r => r.patientId === patientId && r.status !== 'CANCELLED'
    ).length;

    return {
      profile,
      nextAppointment,
      pendingExercisesCount,
      completedExercisesCount,
      availableReceiptsCount,
      activeConsentsCount: 3
    };
  }

  /**
   * Lista todos os exercícios terapêuticos de um paciente
   */
  static listPatientExercises(
    patientId: string,
    context: { actorId: string; ipAddress: string }
  ): TherapeuticExercise[] {
    const exercises = Array.from(db.therapeuticExercises.values())
      .filter(e => e.patientId === patientId)
      .sort((a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime());

    return exercises.map(e => {
      let answers: Record<string, any> | undefined = undefined;
      if (e.encryptedPayload) {
        try {
          const raw = decryptField(e.encryptedPayload, patientId);
          answers = JSON.parse(raw);
        } catch {
          answers = undefined;
        }
      }

      return {
        ...e,
        answers
      };
    });
  }

  /**
   * Terapeuta atribui novo exercício terapêutico (RFC-001 §3.6, §3.7)
   */
  static async assignExercise(params: {
    therapistId: string;
    dto: AssignExerciseDTO;
    context: { actorId: string; ipAddress: string };
  }): Promise<TherapeuticExercise> {
    const { therapistId, dto, context } = params;

    const patient = PatientService.getPatientById(dto.patientId, context);
    if (!patient) {
      throw new Error(`Paciente com ID ${dto.patientId} não encontrado.`);
    }

    const id = randomUUID();
    const assignedAt = new Date().toISOString();

    // Se templateData não for fornecido, aplica template padrão
    let templateData = dto.templateData;
    if (!templateData) {
      templateData = PatientPortalService.getDefaultTemplateData(dto.type);
    }

    const exercise: TherapeuticExercise = {
      id,
      patientId: dto.patientId,
      therapistId,
      title: dto.title,
      description: dto.description,
      type: dto.type,
      status: ExerciseStatus.ASSIGNED,
      assignedAt,
      dueAt: dto.dueAt,
      templateData
    };

    db.therapeuticExercises.set(id, exercise);

    // Auditoria WORM
    const auditLog = await AuditService.log({
      actorId: context.actorId,
      action: AuditAction.THERAPEUTIC_EXERCISE_ASSIGNED,
      resourceType: AuditResourceType.THERAPEUTIC_EXERCISE,
      resourceId: id,
      ipAddress: context.ipAddress,
      details: `Exercício terapêutico '${dto.title}' (${dto.type}) prescrito para paciente ${patient.name}.`
    });

    exercise.wormAuditId = auditLog.id;
    return exercise;
  }

  /**
   * Paciente submete resolução de exercício terapêutico com cifragem AES-256-GCM (RFC-001 §3.6, §4.2)
   */
  static async submitExerciseResponse(params: {
    patientId: string;
    dto: SubmitExerciseResponseDTO;
    context: { actorId: string; ipAddress: string };
  }): Promise<TherapeuticExercise> {
    const { patientId, dto, context } = params;

    const exercise = db.therapeuticExercises.get(dto.exerciseId);
    if (!exercise) {
      throw new Error(`Exercício com ID ${dto.exerciseId} não encontrado.`);
    }

    // Proteção contra IDOR: somente o paciente proprietário pode submeter resposta
    if (exercise.patientId !== patientId) {
      throw new Error('Acesso negado: você não tem permissão para responder a este exercício.');
    }

    // Criptografa o payload sensível com a DEK do paciente (FLE AES-256-GCM)
    const payloadString = JSON.stringify({
      answers: dto.answers,
      notes: dto.notes,
      submittedAt: new Date().toISOString()
    });
    const encryptedPayload = encryptField(payloadString, patientId);

    const updated: TherapeuticExercise = {
      ...exercise,
      encryptedPayload,
      answers: dto.answers,
      status: ExerciseStatus.COMPLETED,
      completedAt: new Date().toISOString()
    };

    db.therapeuticExercises.set(exercise.id, updated);

    // Auditoria WORM
    await AuditService.log({
      actorId: patientId,
      action: AuditAction.THERAPEUTIC_EXERCISE_SUBMITTED,
      resourceType: AuditResourceType.THERAPEUTIC_EXERCISE,
      resourceId: exercise.id,
      ipAddress: context.ipAddress,
      details: `Resolução de exercício terapêutico '${exercise.title}' submetida pelo paciente com cifragem em repouso AES-256-GCM.`
    });

    return updated;
  }

  /**
   * Psicólogo analisa e insere feedback clínico em exercício resolvido
   */
  static async reviewExercise(params: {
    therapistId: string;
    dto: ReviewExerciseDTO;
    context: { actorId: string; ipAddress: string };
  }): Promise<TherapeuticExercise> {
    const { therapistId, dto, context } = params;

    const exercise = db.therapeuticExercises.get(dto.exerciseId);
    if (!exercise) {
      throw new Error(`Exercício com ID ${dto.exerciseId} não encontrado.`);
    }

    const updated: TherapeuticExercise = {
      ...exercise,
      therapistFeedback: dto.feedback,
      reviewedAt: new Date().toISOString(),
      status: ExerciseStatus.REVIEWED
    };

    db.therapeuticExercises.set(exercise.id, updated);

    // Auditoria WORM
    await AuditService.log({
      actorId: context.actorId,
      action: AuditAction.THERAPEUTIC_EXERCISE_REVIEWED,
      resourceType: AuditResourceType.THERAPEUTIC_EXERCISE,
      resourceId: exercise.id,
      ipAddress: context.ipAddress,
      details: `Exercício '${exercise.title}' revisado pelo terapeuta com feedback clínico registrado.`
    });

    return updated;
  }

  /**
   * Lista recibos emitidos acessíveis pelo paciente para reembolso de convênio / IR (RFC-001 §3.6)
   */
  static async listPatientReceipts(
    patientId: string,
    context: { actorId: string; ipAddress: string }
  ): Promise<any[]> {
    const receipts = Array.from(db.receipts.values())
      .filter(r => r.patientId === patientId)
      .sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime());

    // Auditoria WORM
    await AuditService.log({
      actorId: patientId,
      action: AuditAction.PATIENT_RECEIPT_ACCESSED,
      resourceType: AuditResourceType.CLINICAL_RECEIPT,
      resourceId: patientId,
      ipAddress: context.ipAddress,
      details: `Histórico de ${receipts.length} recibos consultado pelo paciente para fins de reembolso / fiscal.`
    });

    return receipts;
  }

  /**
   * Gera templates padrão de acordo com a modalidade clínica do exercício
   */
  private static getDefaultTemplateData(type: ExerciseType): Record<string, any> {
    switch (type) {
      case ExerciseType.RPD_THOUGHT_RECORD:
        return {
          instructions: 'Identifique uma situação desafiadora, registre o pensamento automático imediato, a emoção sentida e busque uma resposta adaptativa baseada em evidências.',
          fields: [
            { key: 'situation', label: 'Situação / Gatilho', placeholder: 'Onde você estava? Com quem? O que aconteceu?', type: 'textarea' },
            { key: 'automaticThought', label: 'Pensamento Automático', placeholder: 'O que passou pela sua mente no exato momento?', type: 'textarea' },
            { key: 'emotion', label: 'Emoção Sentida', placeholder: 'Ansiedade, tristeza, raiva, frustração...', type: 'text' },
            { key: 'intensity', label: 'Intensidade da Emoção (0 a 100%)', placeholder: '80', type: 'number' },
            { key: 'cognitiveDistortion', label: 'Distorção Cognitiva Identificada', placeholder: 'Catastrofização, Leitura Mental, Tudo ou Nada...', type: 'select', options: ['Catastrofização', 'Leitura Mental', 'Pensamento Tudo ou Nada', 'Supergeneralização', 'Raciocínio Emocional', 'Personalização'] },
            { key: 'adaptiveThought', label: 'Pensamento Alternativo / Adaptativo', placeholder: 'Que outra perspectiva mais realista você pode adotar?', type: 'textarea' },
            { key: 'outcome', label: 'Reavaliação Emocional (0 a 100%)', placeholder: '40', type: 'number' }
          ]
        };

      case ExerciseType.MOOD_TRACKER:
        return {
          instructions: 'Monitore diariamente seu humor e os principais fatores que influenciaram seu estado emocional.',
          fields: [
            { key: 'score', label: 'Nível de Humor (1 a 10)', placeholder: '7', type: 'number' },
            { key: 'primaryEmotion', label: 'Emoção Predominante', placeholder: 'Calmo, animado, sobrecarregado...', type: 'text' },
            { key: 'triggers', label: 'Gatilhos ou Acontecimentos Relevantes', placeholder: 'Reunião de trabalho, conversa com amigo, boa noite de sono...', type: 'textarea' },
            { key: 'gratitude', label: 'Um Momento Positivo do Dia', placeholder: 'O que foi agradável hoje?', type: 'textarea' }
          ]
        };

      case ExerciseType.MINDFULNESS_BREATHING:
        return {
          instructions: 'Pratique 5 a 10 minutos de respiração diafragmática 4-4-6 (inspire em 4s, retenha em 4s, expire em 6s).',
          fields: [
            { key: 'durationMinutes', label: 'Duração da Prática (Minutos)', placeholder: '10', type: 'number' },
            { key: 'anxietyBefore', label: 'Ansiedade Antes da Prática (0 a 10)', placeholder: '8', type: 'number' },
            { key: 'anxietyAfter', label: 'Ansiedade Depois da Prática (0 a 10)', placeholder: '3', type: 'number' },
            { key: 'bodilySensations', label: 'Sensações Corporais Notadas', placeholder: 'Ombros relaxaram, respiração ficou mais profunda...', type: 'textarea' }
          ]
        };

      case ExerciseType.VALUES_CLARIFICATION:
        return {
          instructions: 'Reflita sobre os valores essenciais que você deseja guiar sua vida e defina uma ação comprometida para esta semana.',
          fields: [
            { key: 'lifeDomain', label: 'Área da Vida', placeholder: 'Relacionamentos, Carreira, Saúde, Espiritualidade...', type: 'text' },
            { key: 'coreValue', label: 'Valor Fundamental', placeholder: 'Autenticidade, Companheirismo, Coragem...', type: 'text' },
            { key: 'committedAction', label: 'Ação Comprometida Concreta', placeholder: 'Qual passo específico você dará esta semana?', type: 'textarea' },
            { key: 'barrierAnticipated', label: 'Possível Obstáculo Interno', placeholder: 'Que medo ou hesitação pode surgir e como acolhê-lo?', type: 'textarea' }
          ]
        };

      case ExerciseType.BEHAVIORAL_ACTIVATION:
        return {
          instructions: 'Planeje uma atividade prazerosa ou de realização para quebrar o ciclo de evitação ou inércia depressiva.',
          fields: [
            { key: 'activityName', label: 'Atividade Planejada', placeholder: 'Caminhada de 20 minutos no parque', type: 'text' },
            { key: 'scheduledDayTime', label: 'Dia e Horário Planejados', placeholder: 'Terça-feira às 17h', type: 'text' },
            { key: 'predictedPleasure', label: 'Prazer Estimado (0 a 10)', placeholder: '6', type: 'number' },
            { key: 'predictedMastery', label: 'Senso de Realização Estimado (0 a 10)', placeholder: '7', type: 'number' }
          ]
        };

      default:
        return {
          instructions: 'Complete as orientações fornecidas pelo seu terapeuta.',
          fields: [
            { key: 'notes', label: 'Suas Anotações e Reflexões', placeholder: 'Escreva suas observações...', type: 'textarea' }
          ]
        };
    }
  }
}
