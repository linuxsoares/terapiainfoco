import { db } from '../db/memoryDb';
import { decryptField } from './cryptoContext';
import { 
  AppointmentStatus, 
  DocumentType, 
  AuditAction,
  type ClinicalOverviewMetrics, 
  type SecurityMetrics, 
  type PatientClinicalMetrics 
} from '@terapiainfoco/shared';

export class AnalyticsService {
  /**
   * Agrega visão clínica longitudinal do terapeuta
   */
  public static getClinicalOverview(therapistId = 'therapist-001'): ClinicalOverviewMetrics {
    // 1. Pacientes
    const patients = Array.from(db.patients.values()).filter(p => !therapistId || p.therapistId === therapistId);
    const totalPatients = patients.length;
    const quarantinedPatients = patients.filter(p => (p as any).isQuarantined === true).length;
    const activePatients = Math.max(0, totalPatients - quarantinedPatients);

    // 2. Sessões / Agenda
    const appointments = Array.from(db.appointments.values()).filter(a => !therapistId || a.therapistId === therapistId);
    const totalSessions = appointments.length;
    const completedSessions = appointments.filter(a => a.status === AppointmentStatus.CONCLUIDA || (a.status as any) === 'COMPLETED').length;
    const scheduledSessions = appointments.filter(a => a.status === AppointmentStatus.CONFIRMADA || a.status === AppointmentStatus.SOLICITADA || (a.status as any) === 'SCHEDULED' || (a.status as any) === 'CONFIRMED').length;
    const cancelledSessions = appointments.filter(a => a.status === AppointmentStatus.CANCELADA_PELO_PACIENTE || a.status === AppointmentStatus.CANCELADA_PELO_TERAPEUTA || a.status === AppointmentStatus.NAO_COMPARECEU || (a.status as any) === 'CANCELLED' || (a.status as any) === 'NO_SHOW').length;

    const attendedAndCancelled = completedSessions + cancelledSessions;
    const attendanceRate = attendedAndCancelled > 0
      ? Math.round((completedSessions / attendedAndCancelled) * 1000) / 10
      : (totalSessions > 0 ? 100 : 0);

    // Sessões por mês (últimos 6 meses ordenados)
    const monthCounts: Record<string, number> = {};
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    for (const appt of appointments) {
      const d = new Date(appt.scheduledStart);
      const key = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      monthCounts[key] = (monthCounts[key] || 0) + 1;
    }

    const sessionsByMonth = Object.entries(monthCounts).map(([month, count]) => ({
      month,
      count
    }));

    if (sessionsByMonth.length === 0) {
      const now = new Date();
      sessionsByMonth.push({
        month: `${monthNames[now.getMonth()]} ${now.getFullYear()}`,
        count: 0
      });
    }

    // Sessões recentes
    const patientNameMap = new Map<string, string>();
    for (const p of patients) {
      try {
        patientNameMap.set(p.id, decryptField(p.encryptedName));
      } catch {
        patientNameMap.set(p.id, 'Paciente Cadastrado');
      }
    }

    const recentSessions = appointments
      .slice()
      .sort((a, b) => new Date(b.scheduledStart).getTime() - new Date(a.scheduledStart).getTime())
      .slice(0, 6)
      .map(a => ({
        id: a.id,
        patientId: a.patientId,
        patientName: patientNameMap.get(a.patientId) || 'Paciente Cadastrado',
        date: new Date(a.scheduledStart).toISOString(),
        status: a.status
      }));

    // 3. Prontuários SOAP
    const clinicalRecords = Array.from(db.clinicalRecords.values()).filter(r => !therapistId || r.therapistId === therapistId);
    const totalSoapRecords = clinicalRecords.length;
    const signedSoapRecords = clinicalRecords.filter(r => r.isSigned).length;
    const humanReviewComplianceRate = totalSoapRecords > 0
      ? Math.round((signedSoapRecords / totalSoapRecords) * 1000) / 10
      : 100;

    // 4. Documentos CFP nº 006/2019
    const docs = Array.from(db.documents.values()).filter(d => !therapistId || d.therapistId === therapistId);
    const totalDocuments = docs.length;
    const signedDocuments = docs.filter(d => d.isSigned).length;
    const icpSignedDocuments = docs.filter(d => d.icpSignature !== undefined && d.icpSignature !== null).length;

    const documentsByType: Record<DocumentType, number> = {
      [DocumentType.ATESTADO]: docs.filter(d => d.type === DocumentType.ATESTADO).length,
      [DocumentType.DECLARACAO]: docs.filter(d => d.type === DocumentType.DECLARACAO).length,
      [DocumentType.RELATORIO]: docs.filter(d => d.type === DocumentType.RELATORIO).length,
      [DocumentType.LAUDO]: docs.filter(d => d.type === DocumentType.LAUDO).length
    };

    return {
      totalPatients,
      activePatients,
      quarantinedPatients,
      totalSessions,
      completedSessions,
      scheduledSessions,
      cancelledSessions,
      attendanceRate,
      totalSoapRecords,
      signedSoapRecords,
      humanReviewComplianceRate,
      totalDocuments,
      signedDocuments,
      icpSignedDocuments,
      documentsByType,
      recentSessions,
      sessionsByMonth
    };
  }

  /**
   * Métricas de Segurança, Observabilidade & Trilha WORM
   */
  public static getSecurityMetrics(): SecurityMetrics {
    const logs = db.auditLogs;
    const totalAuditLogs = logs.length;

    // Verificação de Integridade WORM: todos os registros devem ser Object.isFrozen
    const wormIntegrityStatus = logs.every(log => Object.isFrozen(log)) ? 'INTACT' : 'COMPROMISED';

    let totalDecryptReads = 0;
    let totalSignatures = 0;
    let failedLoginsCount = 0;
    let rateLimitBlocksCount = 0;

    const auditEventsByAction: Record<string, number> = {};

    for (const log of logs) {
      auditEventsByAction[log.action] = (auditEventsByAction[log.action] || 0) + 1;

      if (log.action === AuditAction.DECRYPT_READ) totalDecryptReads++;
      if (log.action === AuditAction.SIGN_RECORD) totalSignatures++;
      if (log.action === AuditAction.LOGIN_FAILED) failedLoginsCount++;
      if (log.action === AuditAction.RATE_LIMIT_EXCEEDED) rateLimitBlocksCount++;
    }

    // Adoção de 2FA
    const users = Array.from(db.users.values());
    const usersWith2Fa = users.filter(u => u.twoFactorEnabled).length;
    const twoFactorAdoptionRate = users.length > 0
      ? Math.round((usersWith2Fa / users.length) * 1000) / 10
      : 0;

    // Alertas de segurança recentes
    const recentSecurityAlerts = logs
      .filter(l => 
        l.action === AuditAction.RATE_LIMIT_EXCEEDED ||
        l.action === AuditAction.LOGIN_FAILED ||
        l.action === AuditAction.QUARANTINE_RECORD ||
        l.action === AuditAction.SIGN_RECORD ||
        l.action === AuditAction.DECRYPT_READ
      )
      .slice()
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10)
      .map(l => {
        let severity: 'INFO' | 'WARN' | 'ALERT' = 'INFO';
        let detail = `Ação executada: ${l.action} no recurso ${l.resourceType}`;

        if (l.action === AuditAction.LOGIN_FAILED) {
          severity = 'ALERT';
          detail = `Falha de autenticação detectada para ${l.actorId}`;
        } else if (l.action === AuditAction.RATE_LIMIT_EXCEEDED) {
          severity = 'WARN';
          detail = `Limite de requisições excedido bloqueado por Rate Limiting`;
        } else if (l.action === AuditAction.QUARANTINE_RECORD) {
          severity = 'WARN';
          detail = `Dados do paciente colocados em quarentena criptográfica LGPD`;
        } else if (l.action === AuditAction.SIGN_RECORD) {
          detail = `Assinatura digital e selo de imutabilidade aplicados com sucesso`;
        } else if (l.action === AuditAction.DECRYPT_READ) {
          detail = `Leitura com decifragem em repouso FLE autorizada via chave DEK`;
        }

        return {
          id: l.id,
          timestamp: new Date(l.timestamp).toISOString(),
          action: l.action,
          actorId: l.actorId,
          ipAddress: l.ipAddress,
          detail,
          severity
        };
      });

    return {
      totalAuditLogs,
      wormIntegrityStatus,
      totalDecryptReads,
      totalSignatures,
      failedLoginsCount,
      rateLimitBlocksCount,
      twoFactorAdoptionRate,
      auditEventsByAction,
      recentSecurityAlerts
    };
  }

  /**
   * Métricas e Linha do Tempo Longitudinal de um Paciente Específico
   */
  public static getPatientClinicalMetrics(patientId: string): PatientClinicalMetrics {
    const patient = db.patients.get(patientId);
    if (!patient) {
      throw new Error('Paciente não localizado no sistema.');
    }

    let patientName = 'Paciente Cadastrado';
    try {
      patientName = decryptField(patient.encryptedName);
    } catch {
      // Ignora erro de decrypt
    }

    // Sessões do paciente
    const appts = Array.from(db.appointments.values())
      .filter(a => a.patientId === patientId)
      .sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());

    const totalAppointments = appts.length;
    const completedAppointments = appts.filter(a => a.status === AppointmentStatus.CONCLUIDA || (a.status as any) === 'COMPLETED').length;
    const cancelled = appts.filter(a => a.status === AppointmentStatus.CANCELADA_PELO_PACIENTE || a.status === AppointmentStatus.CANCELADA_PELO_TERAPEUTA || a.status === AppointmentStatus.NAO_COMPARECEU || (a.status as any) === 'CANCELLED' || (a.status as any) === 'NO_SHOW').length;
    const attendedAndCancelled = completedAppointments + cancelled;
    const attendanceRate = attendedAndCancelled > 0
      ? Math.round((completedAppointments / attendedAndCancelled) * 1000) / 10
      : (totalAppointments > 0 ? 100 : 0);

    const firstSessionDate = appts.length > 0 ? new Date(appts[0].scheduledStart).toISOString() : null;
    const lastSessionDate = appts.length > 0 ? new Date(appts[appts.length - 1].scheduledStart).toISOString() : null;

    // Prontuários SOAP do paciente
    const records = Array.from(db.clinicalRecords.values()).filter(r => r.patientId === patientId);
    const recordsByAppt = new Map<string, typeof records[0]>();
    for (const r of records) {
      recordsByAppt.set(r.appointmentId, r);
    }

    const evolutionTimeline = appts.map((appt, idx) => {
      const record = recordsByAppt.get(appt.id);
      let soapSubjectiveSummary: string | undefined;
      let soapAssessmentSummary: string | undefined;

      if (record) {
        if (record.encryptedSoapSubjective) {
          try {
            const rawSubj = decryptField(record.encryptedSoapSubjective);
            soapSubjectiveSummary = rawSubj.slice(0, 120) + (rawSubj.length > 120 ? '...' : '');
          } catch {
            soapSubjectiveSummary = 'Relato clínico confidencial criptografado';
          }
        }
        if (record.encryptedSoapAssessment) {
          try {
            const rawAssess = decryptField(record.encryptedSoapAssessment);
            soapAssessmentSummary = rawAssess.slice(0, 120) + (rawAssess.length > 120 ? '...' : '');
          } catch {
            soapAssessmentSummary = 'Hipótese diagnóstica confidencial criptografada';
          }
        }
      }

      return {
        sessionId: appt.id,
        sessionNumber: idx + 1,
        date: new Date(appt.scheduledStart).toISOString(),
        status: appt.status,
        hasSoap: !!record,
        isSigned: !!record?.isSigned,
        signedAt: record?.signedAt ? new Date(record.signedAt).toISOString() : null,
        soapSubjectiveSummary,
        soapAssessmentSummary
      };
    });

    return {
      patientId,
      patientName,
      firstSessionDate,
      lastSessionDate,
      totalAppointments,
      completedAppointments,
      attendanceRate,
      totalSoapNotes: records.length,
      evolutionTimeline
    };
  }
}
