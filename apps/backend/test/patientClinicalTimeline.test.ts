import { describe, it, expect, beforeEach } from 'bun:test';
import { PatientService } from '../src/services/patientService';
import { AppointmentService } from '../src/services/appointmentService';
import { AnamnesisService } from '../src/services/anamnesisService';
import { db } from '../src/db/memoryDb';
import { 
  AppointmentStatus, 
  DocumentType,
  type StoredClinicalRecord,
  type StoredPsychologicalDocument
} from '@terapiainfoco/shared';
import { encryptField } from '../src/services/cryptoContext';

describe('Evolução de Produto RFC-001: Linha do Tempo Clínica Longitudinal do Paciente (§3.4)', () => {
  const therapistId = 'therapist-001';
  let patientId: string;

  beforeEach(async () => {
    // Cria paciente com consentimento assinado
    const patient = await PatientService.createPatient(therapistId, {
      name: 'Leonardo Ferreira Dias',
      email: 'leonardo.dias@email.com',
      phone: '11988776655',
      cpf: '789.012.345-66',
      consentTranscriptionSigned: true
    }, {
      actorId: therapistId,
      ipAddress: '127.0.0.1'
    });
    patientId = patient.id;
  });

  it('deve gerar linha do tempo clínica com agregações estatísticas e assiduidade precisa', async () => {
    // 1. Cria 2 consultas passadas: 1 CONCLUIDA e 1 NAO_COMPARECEU
    const past1 = new Date();
    past1.setDate(past1.getDate() - 14);
    const past1End = new Date(past1.getTime() + 50 * 60 * 1000);

    const appt1 = await AppointmentService.createAppointment(therapistId, {
      patientId,
      scheduledStart: past1.toISOString(),
      scheduledEnd: past1End.toISOString(),
      bufferMinutes: 10
    }, { actorId: therapistId, ipAddress: '127.0.0.1' });

    await AppointmentService.updateStatus(appt1.id, AppointmentStatus.CONCLUIDA, {
      actorId: therapistId,
      ipAddress: '127.0.0.1'
    });

    const past2 = new Date();
    past2.setDate(past2.getDate() - 7);
    const past2End = new Date(past2.getTime() + 50 * 60 * 1000);

    const appt2 = await AppointmentService.createAppointment(therapistId, {
      patientId,
      scheduledStart: past2.toISOString(),
      scheduledEnd: past2End.toISOString(),
      bufferMinutes: 10
    }, { actorId: therapistId, ipAddress: '127.0.0.1' });

    await AppointmentService.updateStatus(appt2.id, AppointmentStatus.NAO_COMPARECEU, {
      actorId: therapistId,
      ipAddress: '127.0.0.1'
    });

    // 2. Cria 1 consulta futura CONFIRMADA
    const future = new Date();
    future.setDate(future.getDate() + 7);
    const futureEnd = new Date(future.getTime() + 50 * 60 * 1000);

    const apptFuture = await AppointmentService.createAppointment(therapistId, {
      patientId,
      scheduledStart: future.toISOString(),
      scheduledEnd: futureEnd.toISOString(),
      bufferMinutes: 10
    }, { actorId: therapistId, ipAddress: '127.0.0.1' });

    // 3. Cadastra Anamnese
    await AnamnesisService.saveAnamnesis({
      patientId,
      therapistId,
      dto: {
        chiefComplaint: 'Ansiedade generalizada e estresse laboral',
        historyOfComplaint: 'Sintomas iniciados há 6 meses',
        biopsychosocialHistory: {
          personalDevelopment: 'Típico',
          familyDynamics: 'Pais presentes',
          socialSupportNetwork: 'Amigos próximos',
          routineSleepNutrition: 'Insônia inicial'
        },
        medicalAndPsychiatricHistory: {
          currentMedications: 'Nenhum',
          previousTreatments: 'Nenhum',
          familyPsychiatricHistory: 'Mãe com histórico depressivo',
          allergiesOrMedicalConditions: 'Nenhuma'
        },
        therapeuticGoals: 'Manejo de ansiedade e estratégias cognitivo-comportamentais',
        emergencyContact: {
          name: 'Juliana Dias',
          relationship: 'Irmã',
          phone: '11977665544'
        }
      },
      context: { actorId: therapistId, ipAddress: '127.0.0.1' }
    });

    // 4. Cadastra Registro SOAP assinado
    const soapRecord: StoredClinicalRecord = {
      id: 'soap-test-rec-01',
      appointmentId: appt1.id,
      patientId,
      therapistId,
      sessionNumber: 1,
      encryptedSoapSubjective: encryptField('Paciente relata ansiedade alta ao acordar.'),
      encryptedSoapObjective: encryptField('Contato visual mantido, fala rápida.'),
      encryptedSoapAssessment: encryptField('Hipótese diagnóstica de ansiedade situacional.'),
      encryptedSoapPlan: encryptField('Registro diário de pensamentos automáticos.'),
      isSigned: true,
      signedAt: new Date(),
      signatureHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      createdAt: new Date()
    };
    db.clinicalRecords.set(soapRecord.id, soapRecord);

    // 5. Cadastra Documento Emitido (Atestado Psicológico CFP 006/2019)
    const docRecord: StoredPsychologicalDocument = {
      id: 'doc-test-01',
      patientId,
      therapistId,
      type: DocumentType.ATESTADO,
      title: 'Atestado Psicológico de Comparecimento',
      regulationReference: 'Resolução CFP nº 006/2019',
      encryptedContent: encryptField('Atesto para os devidos fins que o paciente compareceu ao atendimento.'),
      isSigned: true,
      signedAt: new Date(),
      validationToken: 'val-token-xyz-123',
      createdAt: new Date()
    };
    db.documents.set(docRecord.id, docRecord);

    // Consulta a Linha do Tempo
    const timeline = await PatientService.getPatientTimeline(patientId, {
      actorId: therapistId,
      ipAddress: '127.0.0.1',
      userAgent: 'Jest/Bun-Test'
    });

    expect(timeline.patientId).toBe(patientId);
    expect(timeline.patientName).toBe('Leonardo Ferreira Dias');
    expect(timeline.totalSessions).toBe(3);
    expect(timeline.completedSessions).toBe(1);
    expect(timeline.missedSessions).toBe(1);
    expect(timeline.signedRecordsCount).toBe(1);
    expect(timeline.documentsCount).toBe(1);

    // Assiduidade calculada: 1 concluída / (1 concluída + 1 no-show) = 50%
    expect(timeline.attendanceRate).toBe(50);

    // Próxima consulta futura detectada
    expect(timeline.nextScheduledAppointment).toBeDefined();
    expect(timeline.nextScheduledAppointment?.id).toBe(apptFuture.id);

    // Eventos integrados na timeline
    expect(timeline.events.length).toBeGreaterThanOrEqual(6); // 3 appts + 1 soap + 1 anamnesis + 1 doc + 1 consent

    const types = timeline.events.map(e => e.type);
    expect(types).toContain('APPOINTMENT');
    expect(types).toContain('SOAP_RECORD');
    expect(types).toContain('ANAMNESIS');
    expect(types).toContain('DOCUMENT');
    expect(types).toContain('CONSENT');

    // Validação de ordenação cronológica decrescente (o primeiro é o mais recente)
    const timestamps = timeline.events.map(e => new Date(e.timestamp).getTime());
    for (let i = 0; i < timestamps.length - 1; i++) {
      expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i + 1]);
    }
  });

  it('deve lançar erro se o paciente não for encontrado', () => {
    expect(async () => {
      await PatientService.getPatientTimeline('patient-id-inexistente', {
        actorId: therapistId,
        ipAddress: '127.0.0.1'
      });
    }).toThrow('Paciente não encontrado');
  });
});
