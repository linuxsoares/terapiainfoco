import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { AuthService } from '../src/services/authService';
import { PatientService } from '../src/services/patientService';
import {
  DiagnosticUrgencyLevel,
  DrugInteractionSeverity,
  PsychopharmacologyCategory
} from '@terapiainfoco/shared';

describe('Prescrição & Encaminhamento Psiquiátrico com Validação Farmacológica (RFC-001 §3.5)', () => {
  let therapistToken: string;
  let mockPatientId: string;

  beforeEach(async () => {
    db.clear();

    const authService = new AuthService();
    const loginRes = await authService.login({
      email: 'psicologo@terapiainfoco.com.br',
      password: 'Senha@123456'
    });
    therapistToken = loginRes.accessToken!;

    const patient = PatientService.createPatient(
      'therapist-001',
      {
        name: 'Carlos Alberto Ferreira',
        email: 'carlos.alberto@email.com',
        cpf: '321.654.987-11',
        phone: '(11) 97654-3210',
        birthDate: '1988-11-20'
      },
      { actorId: '00000000-0000-0000-0000-000000000001', ipAddress: '127.0.0.1' }
    );
    mockPatientId = patient.id;
  });

  it('1. deve retornar o catálogo farmacológico completo com as classes padronizadas (RFC-001 §3.5)', async () => {
    const res = await app.request('/api/psychiatric-referrals/catalog', {
      headers: {
        Authorization: `Bearer ${therapistToken}`
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(15);
    expect(body.drugs.some((d: any) => d.id === 'fluoxetina' && d.category === PsychopharmacologyCategory.ANTIDEPRESSANT_SSRI)).toBe(true);
    expect(body.drugs.some((d: any) => d.id === 'litio' && d.category === PsychopharmacologyCategory.MOOD_STABILIZER)).toBe(true);
    expect(body.drugs.some((d: any) => d.id === 'clonazepam' && d.category === PsychopharmacologyCategory.ANXIOLYTIC_BENZODIAZEPINE)).toBe(true);
  });

  it('2. deve avaliar interações e retornar NONE quando não houver interações conhecidas', async () => {
    const res = await app.request('/api/psychiatric-referrals/check-interactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        drugIds: ['escitalopram']
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.interactions.length).toBe(0);
    expect(body.maxSeverity).toBe('NONE');
    expect(body.warningCount).toBe(0);
  });

  it('3. deve detectar interação CONTRAINDICADA de Síndrome Serotoninérgica entre Tranilcipromina e Fluoxetina', async () => {
    const res = await app.request('/api/psychiatric-referrals/check-interactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        drugIds: ['imao_tranilcipromina', 'fluoxetina']
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.maxSeverity).toBe(DrugInteractionSeverity.CONTRAINDICATED);
    expect(body.warningCount).toBe(1);
    expect(body.interactions[0].clinicalRisk).toContain('Síndrome Serotoninérgica');
    expect(body.interactions[0].psychologistManagementTip).toContain('Emergência médica absoluta');
  });

  it('4. deve detectar interações MAJOR entre Lítio e Sertralina, e entre Clonazepam e Zolpidem', async () => {
    const res = await app.request('/api/psychiatric-referrals/check-interactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        drugIds: ['litio', 'sertralina', 'clonazepam', 'zolpidem']
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.maxSeverity).toBe(DrugInteractionSeverity.MAJOR);
    expect(body.warningCount).toBeGreaterThanOrEqual(2);
    expect(body.interactions.some((i: any) => i.severity === DrugInteractionSeverity.MAJOR)).toBe(true);
  });

  it('5. deve emitir e persistir guia de encaminhamento psiquiátrico com integridade SHA-256 e token notarial', async () => {
    const payload = {
      patientId: mockPatientId,
      urgencyLevel: DiagnosticUrgencyLevel.MODERATE,
      reasonForReferral: 'Paciente em episódio depressivo maior moderado refratário a psicoterapia exclusiva há 12 semanas com ideação passiva de morte.',
      clinicalHypothesesCid11: ['6A71.3 - Episódio Depressivo Maior Recorrente, Moderado sem Sintomas Psicóticos'],
      currentMedications: [
        {
          drugId: 'sertralina',
          drugName: 'Cloridrato de Sertralina',
          dosage: '50mg',
          frequency: '1x ao dia pela manhã',
          patientReportedAdherence: 'FULL'
        },
        {
          drugId: 'clonazepam',
          drugName: 'Clonazepam',
          dosage: '0.5mg',
          frequency: 'SOS à noite se insônia grave',
          patientReportedAdherence: 'PARTIAL'
        }
      ],
      psychometricSummary: {
        scale: 'PHQ-9',
        score: 16,
        severity: 'Moderadamente Severo'
      },
      confidentialNotes: 'Paciente relata estresse conjugal e esgotamento ocupacional. Família ciente e com suporte estabelecido.'
    };

    const res = await app.request('/api/psychiatric-referrals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify(payload)
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.referral.id).toBeDefined();
    expect(body.referral.validationToken.startsWith('psy_ref_')).toBe(true);
    expect(body.referral.integrityChecksumSha256).toHaveLength(64);
    expect(body.referral.currentMedications.length).toBe(2);
    expect(body.validationUrl).toContain(body.referral.validationToken);
  });

  it('6. deve rejeitar requisição sem motivo clínico obrigatório ou sem hipóteses diagnósticas (CFP nº 006/2019)', async () => {
    const res = await app.request('/api/psychiatric-referrals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        patientId: mockPatientId,
        urgencyLevel: DiagnosticUrgencyLevel.ROUTINE,
        reasonForReferral: '', // Vazio
        clinicalHypothesesCid11: []
      })
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('7. deve listar encaminhamentos de um paciente e decifrar notas confidenciais com FLE', async () => {
    // Cria um primeiro encaminhamento
    await app.request('/api/psychiatric-referrals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        patientId: mockPatientId,
        urgencyLevel: DiagnosticUrgencyLevel.CRITICAL_RED_FLAG,
        reasonForReferral: 'Suspeita de ciclotimia com períodos hipomaníacos intercalados.',
        clinicalHypothesesCid11: ['6A61 - Transtorno Bipolar Tipo II'],
        currentMedications: [],
        confidentialNotes: 'Nota super confidencial do terapeuta.'
      })
    });

    const res = await app.request(`/api/psychiatric-referrals/patients/${mockPatientId}`, {
      headers: {
        Authorization: `Bearer ${therapistToken}`
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.total).toBe(1);
    expect(body.referrals[0].confidentialNotes).toBe('Nota super confidencial do terapeuta.');
  });

  it('8. deve permitir validação notarial pública via token para médico externo sem vazar notas confidenciais (Art. 9º CFP)', async () => {
    const createRes = await app.request('/api/psychiatric-referrals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        patientId: mockPatientId,
        urgencyLevel: DiagnosticUrgencyLevel.ROUTINE,
        reasonForReferral: 'Encaminhamento para avaliação de adequação psicofarmacológica.',
        clinicalHypothesesCid11: ['6A70 - Transtorno Depressivo de Episódio Único'],
        currentMedications: [
          {
            drugId: 'fluoxetina',
            drugName: 'Fluoxetina',
            dosage: '20mg',
            frequency: '1x ao dia',
            patientReportedAdherence: 'FULL'
          }
        ],
        confidentialNotes: 'Anotação interna que NÃO deve ser exposta publicamente na validação.'
      })
    });

    const createBody = await createRes.json();
    const token = createBody.referral.validationToken;

    // Acessa rota pública SEM header de autenticação
    const validateRes = await app.request(`/api/psychiatric-referrals/validate/${token}`);
    expect(validateRes.status).toBe(200);

    const validateBody = await validateRes.json();
    expect(validateBody.success).toBe(true);
    expect(validateBody.isValid).toBe(true);
    expect(validateBody.referral.validationToken).toBe(token);
    expect(validateBody.referral.reasonForReferral).toContain('avaliação de adequação');
    expect(validateBody.referral.confidentialNotes).toBeUndefined(); // Protegido pelo sigilo
  });
});
