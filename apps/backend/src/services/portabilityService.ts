import { createHash } from 'node:crypto';
import { 
  type ExportPatientDataDTO,
  type ExportPatientDataResponse,
  type PatientPortabilityPackage,
  type RevokeConsentDTO,
  type RevokeConsentResponse,
  type TranscriptUtterance,
  AuditAction,
  AuditResourceType,
  AppointmentStatus
} from '@terapiainfoco/shared';
import { encryptPackageWithPassphrase } from '@terapiainfoco/crypto';
import { db } from '../db/memoryDb';
import { decryptField } from './cryptoContext';
import { AuditService } from './auditService';
import { PatientService } from './patientService';

export class PortabilityService {
  /**
   * Exporta o prontuário psicológico completo estruturado e interoperável (LGPD Art. 18, V)
   * Suporta exportação aberta em JSON autenticado por SHA-256 ou cifrado de ponta a ponta por senha (AES-256-GCM + PBKDF2)
   */
  static exportPatientData(params: {
    patientId: string;
    dto?: ExportPatientDataDTO;
    context: { actorId: string; ipAddress: string; userAgent?: string };
  }): ExportPatientDataResponse {
    const storedPatient = db.patients.get(params.patientId);
    if (!storedPatient) {
      throw new Error('Paciente não encontrado para exportação de dados.');
    }

    // 1. Decifra dados cadastrais do paciente
    let patientName = 'Paciente';
    let patientEmail = 'paciente@email.local';
    let patientPhone = '00000000000';
    let patientCpf: string | undefined;

    try {
      patientName = decryptField(storedPatient.encryptedName);
      patientEmail = decryptField(storedPatient.encryptedEmail);
      patientPhone = decryptField(storedPatient.encryptedPhone);
      if (storedPatient.encryptedCpf) {
        patientCpf = decryptField(storedPatient.encryptedCpf);
      }
    } catch {
      // Caso já esteja em quarentena / pseudonimizado
      patientName = '[DADOS EM QUARENTENA LGPD]';
    }

    // 2. Terapeuta titular
    const therapist = db.therapists.get(storedPatient.therapistId);
    let therapistName = 'Dr. Psicólogo Titular Responsável';
    for (const u of db.users.values()) {
      if (u.therapistId === storedPatient.therapistId) {
        therapistName = u.name;
        break;
      }
    }

    // 3. Consultas e sessões
    const patientAppointments = Array.from(db.appointments.values())
      .filter(a => a.patientId === params.patientId)
      .sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime())
      .map(a => ({
        id: a.id,
        scheduledStart: new Date(a.scheduledStart).toISOString(),
        scheduledEnd: new Date(a.scheduledEnd).toISOString(),
        status: a.status as AppointmentStatus,
        createdAt: new Date(a.createdAt).toISOString()
      }));

    // 4. Prontuários e evoluções SOAP assinados (CFP nº 001/2009)
    const patientRecords = Array.from(db.clinicalRecords.values())
      .filter(r => r.patientId === params.patientId)
      .sort((a, b) => a.sessionNumber - b.sessionNumber)
      .map(r => {
        let subjective = '';
        let objective = '';
        let assessment = '';
        let plan = '';
        try {
          if (r.encryptedSoapSubjective) subjective = decryptField(r.encryptedSoapSubjective);
          if (r.encryptedSoapObjective) objective = decryptField(r.encryptedSoapObjective);
          if (r.encryptedSoapAssessment) assessment = decryptField(r.encryptedSoapAssessment);
          if (r.encryptedSoapPlan) plan = decryptField(r.encryptedSoapPlan);
        } catch {
          // Fallback caso ocorra erro
        }

        return {
          id: r.id,
          sessionNumber: r.sessionNumber,
          appointmentId: r.appointmentId,
          isSigned: r.isSigned,
          signedAt: r.signedAt ? new Date(r.signedAt).toISOString() : null,
          signatureHash: r.signatureHash,
          soap: {
            subjective,
            objective,
            assessment,
            plan
          },
          createdAt: new Date(r.createdAt).toISOString()
        };
      });

    // 5. Documentos psicológicos oficiais emitidos (CFP nº 006/2019)
    const patientDocs = Array.from(db.documents.values())
      .filter(d => d.patientId === params.patientId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map(d => {
        let content = '';
        try {
          content = decryptField(d.encryptedContent);
        } catch {
          // Fallback
        }

        return {
          id: d.id,
          type: d.type,
          title: d.title,
          regulationReference: d.regulationReference,
          content,
          validationToken: d.validationToken,
          isSigned: d.isSigned,
          signedAt: d.signedAt ? new Date(d.signedAt).toISOString() : null,
          signaturePadesHash: d.signaturePadesHash,
          hasIcpSignature: !!d.icpSignature,
          createdAt: new Date(d.createdAt).toISOString()
        };
      });

    // 6. Transcrições de sessões
    const appointmentIds = new Set(patientAppointments.map(a => a.id));
    const patientTranscriptions = Array.from(db.sessionTranscriptions.values())
      .filter(t => appointmentIds.has(t.appointmentId))
      .map(t => {
        let utterances: TranscriptUtterance[] = [];
        if (t.encryptedTranscript) {
          try {
            const rawJson = decryptField(t.encryptedTranscript);
            utterances = JSON.parse(rawJson);
          } catch {
            utterances = [];
          }
        }

        return {
          id: t.id,
          appointmentId: t.appointmentId,
          wordCount: t.wordCount,
          durationSeconds: t.durationSeconds,
          utterancesCount: utterances.length,
          utterances,
          createdAt: new Date(t.createdAt).toISOString()
        };
      });

    // 7. Resumo da trilha de auditoria do paciente
    const patientAuditLogs = db.auditLogs.filter(l => l.resourceId === params.patientId);

    // 8. Montagem do pacote estruturado
    const packageCore: Omit<PatientPortabilityPackage, 'checksumSha256'> = {
      exportVersion: '1.0',
      exportedAt: new Date().toISOString(),
      regulationBasis: {
        lgpdArticle: 'Art. 18, inciso V - Lei nº 13.709/2018 (Portabilidade dos dados a outro fornecedor de serviço)',
        cfpResolution: 'Resolução CFP nº 001/2009 (Art. 4º - Prontuário Psicológico) e Resolução CFP nº 006/2019',
        legalRetainNotice: 'Conforme o Art. 4º da Resolução CFP nº 001/2009 e o Art. 16, inciso I da Lei Geral de Proteção de Dados (LGPD), o prontuário psicológico original é mantido sob custódia e sigilo do psicólogo titular pelo período mínimo de 5 (cinco) anos a contar da data de encerramento do acompanhamento clínico.',
        confidentialityNotice: 'Os dados disponibilizados neste prontuário possuem natureza estritamente confidencial nos termos do Art. 9º do Código de Ética Profissional do Psicólogo. O titular ou o novo profissional recebedor assume o dever legal e ético de sigilo sobre as informações recebidas.'
      },
      therapist: {
        id: therapist?.id || 'therapist-001',
        name: therapistName,
        crp: therapist?.crp || '06/142980',
        crpRegion: therapist?.crpRegion || 'SP'
      },
      patient: {
        id: storedPatient.id,
        name: patientName,
        email: patientEmail,
        phone: patientPhone,
        cpf: patientCpf,
        createdAt: new Date(storedPatient.createdAt).toISOString(),
        consentTranscriptionSigned: storedPatient.consentTranscriptionSigned,
        consentSignedAt: storedPatient.consentSignedAt ? new Date(storedPatient.consentSignedAt).toISOString() : null,
        consentRevokedAt: storedPatient.consentRevokedAt ? new Date(storedPatient.consentRevokedAt).toISOString() : null,
        consentRevokeReason: storedPatient.consentRevokeReason || null
      },
      appointments: patientAppointments,
      clinicalRecords: patientRecords,
      psychologicalDocuments: patientDocs,
      transcriptions: patientTranscriptions,
      auditTrailSummary: {
        totalAccessLogs: patientAuditLogs.length,
        exportedByActorId: params.context.actorId,
        exportTimestamp: new Date().toISOString()
      }
    };

    // 9. Cálculo de Checksum SHA-256 canônico para garantia de integridade
    const canonicalString = JSON.stringify(packageCore);
    const checksumSha256 = createHash('sha256').update(canonicalString).digest('hex');

    const fullPackage: PatientPortabilityPackage = {
      ...packageCore,
      checksumSha256
    };

    // 10. Registro compulsório na trilha WORM
    AuditService.log({
      actorId: params.context.actorId,
      resourceType: AuditResourceType.PATIENT,
      resourceId: params.patientId,
      action: AuditAction.DATA_EXPORT,
      ipAddress: params.context.ipAddress,
      userAgent: params.context.userAgent
    });

    // 11. Criptografia opcional com senha do titular/terapeuta
    const isEncryptedRequested = params.dto?.format === 'encrypted_package' || Boolean(params.dto?.passphrase);

    if (isEncryptedRequested) {
      if (!params.dto?.passphrase || params.dto.passphrase.trim().length < 6) {
        throw new Error('Para exportação em formato protegido, é obrigatório fornecer uma frase secreta com no mínimo 6 caracteres.');
      }

      const encryptedPackage = encryptPackageWithPassphrase(
        JSON.stringify(fullPackage),
        params.dto.passphrase,
        params.patientId
      );

      return {
        success: true,
        format: 'encrypted_package',
        checksumSha256,
        encryptedPackage,
        message: 'Pacote de portabilidade gerado e criptografado com sucesso via AES-256-GCM + PBKDF2.'
      };
    }

    return {
      success: true,
      format: 'json',
      checksumSha256,
      package: fullPackage,
      message: 'Prontuário completo exportado com sucesso em conformidade com o Art. 18 da LGPD e normas do CFP.'
    };
  }

  /**
   * Registra revogação formal de consentimento (LGPD Art. 18, IX)
   * Preserva a salvaguarda de guarda por 5 anos (Resolução CFP nº 001/2009 Art. 4º)
   */
  static revokeConsent(params: {
    patientId: string;
    dto: RevokeConsentDTO;
    context: { actorId: string; ipAddress: string; userAgent?: string };
  }): RevokeConsentResponse {
    const stored = db.patients.get(params.patientId);
    if (!stored) {
      throw new Error('Paciente não encontrado para revogação de consentimento.');
    }

    if (!params.dto.reason || params.dto.reason.trim().length < 5) {
      throw new Error('A justificativa da revogação de consentimento é obrigatória (mínimo de 5 caracteres).');
    }

    const now = new Date();
    stored.consentTranscriptionSigned = false;
    stored.consentRevokedAt = now;
    stored.consentRevokeReason = params.dto.reason.trim();

    let isQuarantined = false;
    if (params.dto.requestDataQuarantine) {
      isQuarantined = PatientService.quarantinePatient(params.patientId, params.context);
    }

    // Registro formal na trilha de auditoria WORM
    AuditService.log({
      actorId: params.context.actorId,
      resourceType: AuditResourceType.PATIENT,
      resourceId: params.patientId,
      action: AuditAction.CONSENT_REVOCATION,
      ipAddress: params.context.ipAddress,
      userAgent: params.context.userAgent
    });

    return {
      success: true,
      patientId: params.patientId,
      revokedAt: now.toISOString(),
      consentTranscriptionSigned: false,
      quarantined: isQuarantined,
      legalRetentionNote: 'Consentimento revogado com sucesso. Conforme o Art. 4º da Resolução CFP nº 001/2009 e o Art. 16, inciso I da LGPD, os registros clínicos e evoluções de atendimentos realizados permanecem armazenados sob sigilo pelo período legal obrigatório de 5 anos.',
      message: 'Revogação de consentimento registrada formalmente com carimbo de tempo na trilha de auditoria imutável.'
    };
  }
}
