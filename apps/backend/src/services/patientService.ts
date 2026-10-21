import { randomUUID } from 'node:crypto';
import type { 
  CreatePatientDTO, 
  StoredPatient, 
  DecryptedPatient,
  PatientClinicalTimelineResponse,
  PatientTimelineEvent,
  StoredAppointment,
  DecryptedAppointment,
  PatientSearchItem
} from '@terapiainfoco/shared';
import { AuditAction, AuditResourceType, AppointmentStatus } from '@terapiainfoco/shared';
import { db } from '../db/memoryDb';
import { PatientRepository } from '../repositories/patientRepository';
import { teleconsultationRoomUrl, toDecryptedAppointment } from './teleconsultationRoom';
import { 
  encryptField, 
  decryptField, 
  hashEmail, 
  hashCpf 
} from './cryptoContext';
import { AuditService } from './auditService';

import { AppointmentRepository } from '../repositories/appointmentRepository';
import { ClinicalRecordRepository } from '../repositories/clinicalRecordRepository';
const QUARANTINED_NAME = '[PACIENTE EM QUARENTENA LGPD]';

/** Minúsculas e sem acentos, para a busca por nome */
function normalizeForSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export class PatientService {
  /**
   * Cadastra paciente aplicando Field-Level Encryption e Blind Indexing (§4.1, §4.3)
   */
  static async createPatient(
    therapistId: string, 
    dto: CreatePatientDTO,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): Promise<DecryptedPatient> {
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

    await PatientRepository.create(storedPatient);


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
  static async getPatientById(
    id: string,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): Promise<DecryptedPatient | null> {
    const stored = await PatientRepository.findById(id);
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
  static async findByCpf(
    rawCpf: string,
    context: { actorId: string; ipAddress: string; userAgent?: string },
    therapistId?: string
  ): Promise<DecryptedPatient | null> {
    // Com therapistId, a busca fica restrita ao consultório (a mesma pessoa pode ser paciente em vários)
    const patient = await PatientRepository.findByCpfBindex(hashCpf(rawCpf), therapistId);
    return patient ? this.getPatientById(patient.id, context) : null;
  }

  /**
   * Busca por nome ou e-mail dentro do consultório. Nome e e-mail são cifrados (FLE), então a
   * comparação é feita em memória após decifrar apenas os pacientes do próprio consultório.
   * Ignora acentos e caixa; todos os termos precisam aparecer no nome ou no e-mail.
   */
  static async searchByNameOrEmail(
    query: string,
    therapistId: string,
    context: { actorId: string; ipAddress: string; userAgent?: string },
    limit = 20
  ): Promise<PatientSearchItem[]> {
    const terms = normalizeForSearch(query).split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    const matches: PatientSearchItem[] = [];
    for (const patient of await PatientRepository.list({ therapistId })) {
      const name = decryptField(patient.encryptedName);
      if (name === QUARANTINED_NAME) continue;
      const email = decryptField(patient.encryptedEmail);
      const haystack = `${normalizeForSearch(name)} ${email.toLowerCase()}`;
      if (terms.every((term) => haystack.includes(term))) {
        matches.push({ id: patient.id, name, email });
      }
    }

    const results = matches.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).slice(0, limit);
    for (const result of results) {
      AuditService.log({
        actorId: context.actorId,
        resourceType: AuditResourceType.PATIENT,
        resourceId: result.id,
        action: AuditAction.DECRYPT_READ,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      });
    }
    return results;
  }

  /**
   * Busca paciente por E-mail usando Blind Index (HMAC-SHA256) sem expor e-mail no banco (§4.3)
   */
  static async findByEmail(
    rawEmail: string,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): Promise<DecryptedPatient | null> {
    const patient = await PatientRepository.findByEmailBindex(hashEmail(rawEmail));
    return patient ? this.getPatientById(patient.id, context) : null;
  }

  /**
   * Harmonização LGPD Art. 18 vs. CFP (Resolução nº 001/2009 - Guarda de 5 Anos)
   * Anonimiza dados de contato e coloca o cadastro em quarentena legal.
   */
  static async quarantinePatient(
    id: string,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): Promise<boolean> {
    const stored = await PatientRepository.findById(id);
    if (!stored) return false;

    // Pseudonimização dos dados de contato ativos
    stored.encryptedName = encryptField(QUARANTINED_NAME);
    stored.encryptedEmail = encryptField('quarentena@anonimizado.local');
    stored.encryptedPhone = encryptField('00000000000');
    stored.emailBindex = hashEmail(`quarentena-${id}@anonimizado.local`);
    if (stored.encryptedCpf) {
      stored.encryptedCpf = undefined;
      stored.cpfBindex = undefined;
    }
    await PatientRepository.save(stored);

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
  static async getPatientTimeline(
    patientId: string,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): Promise<PatientClinicalTimelineResponse> {
    const patient = await PatientRepository.findById(patientId);
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
    const patientAppointments = await AppointmentRepository.list({ patientIds: [patientId] });

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
          ...toDecryptedAppointment(app)
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
        actionUrl: teleconsultationRoomUrl(app.id),
        metadata: {
          appointmentId: app.id,
          roomUrl: teleconsultationRoomUrl(app.id),
          attendanceStatus: app.status,
          status: app.status
        }
      });
    }

    // 2. Registros de Prontuário & Evoluções SOAP (Módulos 3 & 4)
    for (const rec of await ClinicalRecordRepository.list({ patientIds: [patientId] })) {
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
          signatureHash: rec.signatureHash ?? undefined,
          wormHash: rec.signatureHash ?? undefined
        }
      });
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
