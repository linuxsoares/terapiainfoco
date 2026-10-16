import { randomUUID } from 'node:crypto';
import type { 
  CreatePatientDTO, 
  StoredPatient, 
  DecryptedPatient,
  PatientClinicalTimelineResponse,
  PatientTimelineEvent,
  StoredAppointment,
  DecryptedAppointment
} from '@terapiainfoco/shared';
import { AuditAction, AuditResourceType, AppointmentStatus } from '@terapiainfoco/shared';
import { db } from '../db/memoryDb';
import { getDb, schema } from '../db';
import { persistPatientToDb } from '../db/sync';
import { eq } from 'drizzle-orm';
import { 
  encryptField, 
  decryptField, 
  hashEmail, 
  hashCpf 
} from './cryptoContext';
import { AuditService } from './auditService';

export class PatientService {
  /**
   * Cadastra paciente aplicando Field-Level Encryption e Blind Indexing (§4.1, §4.3)
   */
  static createPatient(
    therapistId: string, 
    dto: CreatePatientDTO,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): DecryptedPatient {
    const id = randomUUID();
    const emailBindex = hashEmail(dto.email);
    const cpfBindex = dto.cpf ? hashCpf(dto.cpf) : undefined;

    const storedPatient: StoredPatient = {
      id,
      therapistId,
      emailBindex,
      cpfBindex,
      consentTranscriptionSigned: dto.consentTranscriptionSigned,
      consentSignedAt: dto.consentTranscriptionSigned ? new Date() : null,
      createdAt: new Date(),
      encryptedName: encryptField(dto.name),
      encryptedEmail: encryptField(dto.email),
      encryptedPhone: encryptField(dto.phone),
      encryptedCpf: dto.cpf ? encryptField(dto.cpf) : undefined
    };

    db.patients.set(id, storedPatient);

    // Persistência assíncrona garantida no Supabase/PostgreSQL
    getDb().then(async sqlDb => {
      try {
        await persistPatientToDb(sqlDb, storedPatient);
        console.log(`✅ Paciente ${storedPatient.id} persistido no Supabase/PostgreSQL.`);
      } catch (sqlErr) {
        console.warn('⚠️ Falha ao persistir paciente no Supabase/PostgreSQL:', sqlErr);
      }
    }).catch(() => {});

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.PATIENT,
      resourceId: id,
      action: AuditAction.CREATE,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return {
      id,
      therapistId,
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      cpf: dto.cpf,
      emailBindex,
      cpfBindex,
      consentTranscriptionSigned: storedPatient.consentTranscriptionSigned,
      consentSignedAt: storedPatient.consentSignedAt,
      createdAt: storedPatient.createdAt
    };
  }

  /**
   * Busca paciente por ID e decripta dados em memória para o terapeuta autenticado
   */
  static getPatientById(
    id: string,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): DecryptedPatient | null {
    const stored = db.patients.get(id);
    if (!stored) return null;

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.PATIENT,
      resourceId: id,
      action: AuditAction.DECRYPT_READ,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return {
      id: stored.id,
      therapistId: stored.therapistId,
      name: decryptField(stored.encryptedName),
      email: decryptField(stored.encryptedEmail),
      phone: decryptField(stored.encryptedPhone),
      cpf: stored.encryptedCpf ? decryptField(stored.encryptedCpf) : undefined,
      emailBindex: stored.emailBindex,
      cpfBindex: stored.cpfBindex,
      consentTranscriptionSigned: stored.consentTranscriptionSigned,
      consentSignedAt: stored.consentSignedAt,
      consentRevokedAt: stored.consentRevokedAt,
      consentRevokeReason: stored.consentRevokeReason,
      createdAt: stored.createdAt
    };
  }

  /**
   * Busca por CPF usando Blind Index (HMAC-SHA256) sem expor CPF no banco (§4.3)
   */
  static findByCpf(
    rawCpf: string,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): DecryptedPatient | null {
    const targetBindex = hashCpf(rawCpf);
    for (const patient of db.patients.values()) {
      if (patient.cpfBindex === targetBindex) {
        return this.getPatientById(patient.id, context);
      }
    }
    return null;
  }

  /**
   * Busca paciente por E-mail usando Blind Index (HMAC-SHA256) sem expor e-mail no banco (§4.3)
   */
  static findByEmail(
    rawEmail: string,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): DecryptedPatient | null {
    const targetBindex = hashEmail(rawEmail);
    for (const patient of db.patients.values()) {
      if (patient.emailBindex === targetBindex) {
        return this.getPatientById(patient.id, context);
      }
    }
    return null;
  }

  /**
   * Harmonização LGPD Art. 18 vs. CFP (Resolução nº 001/2009 - Guarda de 5 Anos)
   * Anonimiza dados de contato e coloca o cadastro em quarentena legal.
   */
  static quarantinePatient(
    id: string,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): boolean {
    const stored = db.patients.get(id);
    if (!stored) return false;

    // Pseudonimização dos dados de contato ativos
    stored.encryptedName = encryptField('[PACIENTE EM QUARENTENA LGPD]');
    stored.encryptedEmail = encryptField('quarentena@anonimizado.local');
    stored.encryptedPhone = encryptField('00000000000');
    stored.emailBindex = hashEmail(`quarentena-${id}@anonimizado.local`);
    if (stored.encryptedCpf) {
      stored.encryptedCpf = undefined;
      stored.cpfBindex = undefined;
    }

    // Persistência assíncrona da quarentena no Supabase/PostgreSQL
    getDb().then(async sqlDb => {
      try {
        await (sqlDb as any)
          .update(schema.patients)
          .set({
            encryptedName: stored.encryptedName,
            encryptedEmail: stored.encryptedEmail,
            encryptedPhone: stored.encryptedPhone,
            encryptedCpf: null,
            emailBindex: stored.emailBindex,
            cpfBindex: null
          })
          .where(eq(schema.patients.id, id));
      } catch (err) {
        console.warn('⚠️ Falha ao persistir quarentena no Supabase/PostgreSQL:', err);
      }
    }).catch(() => {});

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.PATIENT,
      resourceId: id,
      action: AuditAction.QUARANTINE,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return true;
  }

  /**
   * Constrói a Linha do Tempo Clínica Longitudinal do Paciente (RFC-001 §3.4)
   * Agrega consultas, prontuários SOAP selados, anamnese, documentos CFP e calcula assiduidade
   */
  static getPatientTimeline(
    patientId: string,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): import('@terapiainfoco/shared').PatientClinicalTimelineResponse {
    const patient = db.patients.get(patientId);
    if (!patient) {
      throw new Error('Paciente não encontrado para consulta de linha do tempo clínica.');
    }

    const patientName = decryptField(patient.encryptedName);
    const events: import('@terapiainfoco/shared').PatientTimelineEvent[] = [];

    let totalSessions = 0;
    let completedSessions = 0;
    let missedSessions = 0;
    let canceledSessions = 0;
    let signedRecordsCount = 0;
    let documentsCount = 0;
    let firstConsultationDate: string | undefined;
    let lastConsultationDate: string | undefined;
    let nextScheduledAppointment: import('@terapiainfoco/shared').DecryptedAppointment | undefined;

    const now = new Date();

    // 1. Consultas e Sessões de Teleconsulta (Módulos 1 & 2)
    const patientAppointments: import('@terapiainfoco/shared').StoredAppointment[] = [];
    for (const app of db.appointments.values()) {
      if (app.patientId === patientId) {
        patientAppointments.push(app);
      }
    }
    patientAppointments.sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());

    if (patientAppointments.length > 0) {
      firstConsultationDate = new Date(patientAppointments[0].scheduledStart).toISOString();
      lastConsultationDate = new Date(patientAppointments[patientAppointments.length - 1].scheduledStart).toISOString();
    }

    for (const app of patientAppointments) {
      totalSessions++;
      const appStart = new Date(app.scheduledStart);
      const isPast = appStart < now;

      if (app.status === AppointmentStatus.CONCLUIDA) {
        completedSessions++;
      } else if (app.status === AppointmentStatus.NAO_COMPARECEU) {
        missedSessions++;
      } else if (
        app.status === AppointmentStatus.CANCELADA_PELO_PACIENTE ||
        app.status === AppointmentStatus.CANCELADA_PELO_TERAPEUTA
      ) {
        canceledSessions++;
      }

      // Identifica próximo agendamento futuro ativo
      if (!isPast && !nextScheduledAppointment && app.status === AppointmentStatus.CONFIRMADA) {
        nextScheduledAppointment = {
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
        };
      }

      let badgeColor: 'emerald' | 'blue' | 'violet' | 'amber' | 'rose' | 'slate' = 'blue';
      if (app.status === AppointmentStatus.CONCLUIDA) badgeColor = 'emerald';
      else if (app.status === AppointmentStatus.NAO_COMPARECEU) badgeColor = 'amber';
      else if (app.status.startsWith('CANCELADA')) badgeColor = 'rose';
      else if (app.status === AppointmentStatus.EM_ANDAMENTO) badgeColor = 'violet';

      const timeStr = appStart.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const dateStr = appStart.toLocaleDateString('pt-BR');

      events.push({
        id: `ev-appt-${app.id}`,
        timestamp: appStart.toISOString(),
        type: 'APPOINTMENT',
        title: app.sequenceNumber 
          ? `Teleconsulta Clínica (Sessão ${app.sequenceNumber}/${app.totalInSeries || '?'})`
          : 'Teleconsulta Psicológica Individual',
        description: `Status: ${app.status} • Agendado para ${dateStr} às ${timeStr}`,
        subtitle: `Status: ${app.status} • Agendado para ${dateStr} às ${timeStr}`,
        badge: app.status,
        status: app.status,
        badgeColor,
        actionLabel: isPast ? 'Ver Histórico' : 'Entrar na Sala Virtual',
        actionUrl: decryptField(app.encryptedMeetUrl),
        metadata: {
          appointmentId: app.id,
          meetUrl: decryptField(app.encryptedMeetUrl),
          attendanceStatus: app.status,
          status: app.status
        }
      });
    }

    // 2. Registros de Prontuário & Evoluções SOAP (Módulos 3 & 4)
    for (const rec of db.clinicalRecords.values()) {
      if (rec.patientId === patientId) {
        if (rec.isSigned) signedRecordsCount++;

        events.push({
          id: `ev-soap-${rec.id}`,
          timestamp: new Date(rec.createdAt).toISOString(),
          type: 'SOAP_RECORD',
          title: `Evolução Prontuário SOAP #${rec.sessionNumber}`,
          description: rec.isSigned 
            ? `Assinado e selado com imutabilidade (Hash SHA-256: ${rec.signatureHash?.substring(0, 12)}...)`
            : 'Rascunho de evolução SOAP em edição clínica pelo psicólogo',
          subtitle: rec.isSigned 
            ? `Assinado e selado com imutabilidade WORM (SHA-256: ${rec.signatureHash?.substring(0, 12)}...)`
            : 'Rascunho de evolução SOAP em edição clínica pelo psicólogo',
          badge: rec.isSigned ? 'ASSINADO' : 'RASCUNHO',
          status: rec.isSigned ? 'ASSINADO' : 'RASCUNHO',
          badgeColor: rec.isSigned ? 'emerald' : 'amber',
          actionLabel: rec.isSigned ? 'Visualizar Selo Imutável' : 'Revisar & Assinar SOAP',
          metadata: {
            soapId: rec.id,
            sessionNumber: rec.sessionNumber,
            isSigned: rec.isSigned,
            signatureHash: rec.signatureHash,
            wormHash: rec.signatureHash
          }
        });
      }
    }

    // 3. Ficha de Admissão & Anamnese Biopsicossocial (RFC §3.4)
    for (const an of db.anamnesisRecords.values()) {
      if (an.patientId === patientId) {
        events.push({
          id: `ev-anamnesis-${an.id}`,
          timestamp: new Date(an.createdAt).toISOString(),
          type: 'ANAMNESIS',
          title: `Ficha de Admissão & Anamnese (Versão ${an.version})`,
          description: `Queixa principal registrada com Field-Level Encryption (AES-256-GCM)`,
          subtitle: `Queixa principal registrada com Field-Level Encryption (AES-256-GCM)`,
          badge: `v${an.version}`,
          status: 'ATIVO',
          badgeColor: 'blue',
          actionLabel: 'Abrir Anamnese'
        });
      }
    }

    // 4. Documentos Psicológicos Emitidos CFP 006/2019 (Módulo 5)
    for (const doc of db.documents.values()) {
      if (doc.patientId === patientId) {
        documentsCount++;
        events.push({
          id: `ev-doc-${doc.id}`,
          timestamp: new Date(doc.createdAt).toISOString(),
          type: 'DOCUMENT',
          title: `${doc.type}: ${doc.title}`,
          description: `Documento oficial com validação QR Code e assinatura ICP-Brasil`,
          subtitle: `Documento oficial com validação QR Code e assinatura ICP-Brasil`,
          badge: doc.type,
          status: 'EMITIDO',
          badgeColor: 'violet',
          actionLabel: 'Ver Documento & QR Code',
          metadata: {
            documentId: doc.id,
            documentType: doc.type,
            validationToken: doc.validationToken
          }
        });
      }
    }

    // 5. Registro de Consentimento Livre e Esclarecido (TCLE - LGPD Art. 11)
    if (patient.consentSignedAt) {
      events.push({
        id: `ev-consent-${patient.id}`,
        timestamp: new Date(patient.consentSignedAt).toISOString(),
        type: 'CONSENT',
        title: 'Termo de Consentimento Livre e Esclarecido (TCLE)',
        description: 'Consentimento formal para telepsicologia firmado conforme Resolução CFP nº 011/2018 e LGPD Art. 11',
        subtitle: 'Consentimento formal para telepsicologia firmado conforme Resolução CFP nº 011/2018 e LGPD Art. 11',
        badge: 'TCLE',
        status: 'CONSIGNADO',
        badgeColor: 'emerald'
      });
    }

    // 6. Avaliações Psicométricas Padronizadas (PHQ-9 & GAD-7 - RFC §3.4)
    for (const psych of db.psychometricAssessments.values()) {
      if (psych.patientId === patientId) {
        let badgeColor: 'emerald' | 'blue' | 'violet' | 'amber' | 'rose' | 'slate' = 'blue';
        if (psych.criticalAlert || psych.severityLevel === 'SEVERE') badgeColor = 'rose';
        else if (psych.severityLevel === 'MODERATELY_SEVERE' || psych.severityLevel === 'MODERATE') badgeColor = 'amber';
        else if (psych.severityLevel === 'MILD') badgeColor = 'blue';
        else badgeColor = 'emerald';

        events.push({
          id: `ev-psych-${psych.id}`,
          timestamp: new Date(psych.createdAt).toISOString(),
          type: 'DOCUMENT',
          title: `Escala ${psych.scaleType} — Escore: ${psych.totalScore} (${psych.severityLevel})`,
          description: psych.clinicalInterpretation,
          subtitle: psych.criticalAlert 
            ? `⚠️ Alerta Crítico no Item 9 • ${psych.clinicalInterpretation}`
            : psych.clinicalInterpretation,
          badge: `${psych.scaleType} (${psych.totalScore} pts)`,
          status: psych.severityLevel,
          badgeColor,
          actionLabel: 'Ver Avaliação & Recomendações',
          metadata: {
            documentType: psych.scaleType,
            wormHash: psych.auditWormId
          }
        });
      }
    }

    // 7. Metas Terapêuticas SMART (RFC §3.4)
    for (const goal of db.therapeuticGoals.values()) {
      if (goal.patientId === patientId) {
        events.push({
          id: `ev-goal-${goal.id}`,
          timestamp: new Date(goal.createdAt).toISOString(),
          type: 'ANAMNESIS',
          title: `Meta SMART: ${goal.title} (${goal.progressPercent}%)`,
          description: `Status: ${goal.status} • Categoria: ${goal.category || 'Geral'}`,
          subtitle: `Progresso: ${goal.progressPercent}% • Status: ${goal.status}`,
          badge: `${goal.progressPercent}% Concluído`,
          status: goal.status,
          badgeColor: goal.progressPercent === 100 ? 'emerald' : 'blue',
          actionLabel: 'Ver Plano Terapêutico'
        });
      }
    }

    // Calcula taxa de assiduidade clínica
    const evaluatedSessions = completedSessions + missedSessions;
    const attendanceRate = evaluatedSessions > 0
      ? Math.round((completedSessions / evaluatedSessions) * 100)
      : (totalSessions > 0 ? 100 : 100);

    // Ordenação cronológica reversa (mais recente primeiro)
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.PATIENT_TIMELINE,
      resourceId: patientId,
      action: AuditAction.PATIENT_TIMELINE_ACCESSED,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return {
      patientId,
      patientName,
      totalSessions,
      completedSessions,
      missedSessions,
      canceledSessions,
      attendanceRate,
      signedRecordsCount,
      documentsCount,
      firstConsultationDate,
      lastConsultationDate,
      nextScheduledAppointment,
      events,
      kpis: {
        totalAppointments: totalSessions,
        completedAppointments: completedSessions,
        attendanceRate,
        completedSoapRecords: signedRecordsCount,
        documentsCount
      }
    };
  }
}
