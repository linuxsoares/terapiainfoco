import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { AuthService } from '../src/services/authService';
import { PatientService } from '../src/services/patientService';
import {
  DiagnosticTrackCategory,
  DiagnosticUrgencyLevel,
  InitialScreenerType
} from '@terapiainfoco/shared';

describe('Árvore de Decisão Diagnóstica & Escalas Psicométricas Iniciais (RFC-001 §3.4 / CFP)', () => {
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
        name: 'Mariana Silva de Oliveira',
        email: 'mariana.silva@email.com',
        cpf: '123.456.789-00',
        phone: '(11) 98765-4321',
        consentTranscriptionSigned: false
      },
      { actorId: '00000000-0000-0000-0000-000000000001', ipAddress: '127.0.0.1' }
    );
    mockPatientId = patient.id;
  });

  it('1. deve retornar a definição completa da árvore com 5 trilhas, nós e screeners psicométricos', async () => {
    const res = await app.request('/api/diagnostic-tree/definition', {
      headers: {
        Authorization: `Bearer ${therapistToken}`
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.tracks.length).toBe(5);
    expect(body.nodes['anx-01']).toBeDefined();
    expect(body.nodes['dep-01']).toBeDefined();
    expect(body.nodes['adhd-01']).toBeDefined();
    expect(body.nodes['trauma-01']).toBeDefined();
    expect(body.nodes['burnout-01']).toBeDefined();
    expect(body.screeners[InitialScreenerType.PHQ_4]).toBeDefined();
    expect(body.screeners[InitialScreenerType.PSS_10]).toBeDefined();
    expect(body.screeners[InitialScreenerType.ASRS_V1_1]).toBeDefined();
  });

  it('2. deve processar avaliação do espectro de ansiedade com triagem PHQ-4 e gerar relatório com FLE', async () => {
    const payload = {
      patientId: mockPatientId,
      primaryTrack: DiagnosticTrackCategory.ANXIETY_SPECTRUM,
      answers: [
        {
          nodeId: 'anx-01',
          selectedOptionValue: 'generalized_worry',
          notes: 'Preocupações constantes com finanças e saúde'
        },
        {
          nodeId: 'anx-02_tag',
          selectedOptionValue: 'tag_severe_somatic',
          notes: 'Apresenta cefaleia tensional diária e insônia'
        }
      ],
      psychometricAnswers: {
        screenerType: InitialScreenerType.PHQ_4,
        answers: {
          phq4_1: 3, // Nervoso/ansioso quase todos os dias
          phq4_2: 3, // Incontrolável quase todos os dias
          phq4_3: 1, // Pouco prazer vários dias
          phq4_4: 1  // Para baixo vários dias
        }
      },
      clinicalNotes: 'Quadro clínico compatível com Transtorno de Ansiedade Generalizada (TAG)',
      confidentialNotes: 'Anotação confidencial: paciente relata atritos conjugais intensos.'
    };

    const res = await app.request('/api/diagnostic-tree/assessments', {
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
    expect(body.isRedFlagAlert).toBe(false);
    expect(body.report.primaryTrack).toBe(DiagnosticTrackCategory.ANXIETY_SPECTRUM);
    expect(body.report.provisionalCid11).toContain('6B00');
    expect(body.report.urgencyLevel).toBe(DiagnosticUrgencyLevel.MODERATE);

    // Validação psicométrica
    expect(body.report.psychometricBaseline).toBeDefined();
    expect(body.report.psychometricBaseline.score).toBe(8); // 3+3+1+1
    expect(body.report.psychometricBaseline.severityLevel).toContain('Moderado');

    // Validação de criptografia FLE e Checksum
    expect(body.report.integrityChecksumSha256).toBeDefined();
    expect(body.report.integrityChecksumSha256.length).toBe(64);
    expect(body.report.encryptedSummary).toBeDefined();
    expect(body.report.encryptedSummary.ciphertext).toBeDefined();
  });

  it('3. deve detectar RED FLAG crítica (ideação suicida ativa) e acionar protocolo de crise CFP', async () => {
    const payload = {
      patientId: mockPatientId,
      primaryTrack: DiagnosticTrackCategory.DEPRESSIVE_SPECTRUM,
      answers: [
        {
          nodeId: 'dep-01',
          selectedOptionValue: 'acute_depressive_episode'
        },
        {
          nodeId: 'dep-02_severity',
          selectedOptionValue: 'active_suicidal_ideation'
        }
      ],
      psychometricAnswers: {
        screenerType: InitialScreenerType.PHQ_4,
        answers: {
          phq4_1: 2,
          phq4_2: 2,
          phq4_3: 3,
          phq4_4: 3
        }
      },
      clinicalNotes: 'Paciente com anedonia profunda e ideação suicida ativa com ideação estruturada.'
    };

    const res = await app.request('/api/diagnostic-tree/assessments', {
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
    expect(body.isRedFlagAlert).toBe(true);
    expect(body.report.urgencyLevel).toBe(DiagnosticUrgencyLevel.CRITICAL_RED_FLAG);
    expect(body.report.redFlagsIdentified.length).toBeGreaterThan(0);
    expect(body.report.redFlagsIdentified[0]).toContain('Risco iminente de suicídio');
    expect(body.clinicalActionDirectives[0]).toContain('ATENÇÃO: Red Flag crítica identificada');

    // Confere auditoria de Red Flag no WORM
    const redFlagLogs = db.auditLogs.filter(
      l => l.action === 'DIAGNOSTIC_RED_FLAG_TRIGGERED' as any
    );
    expect(redFlagLogs.length).toBe(1);
  });

  it('4. deve processar triagem de TDAH no adulto com questionário ASRS-v1.1', async () => {
    const payload = {
      patientId: mockPatientId,
      primaryTrack: DiagnosticTrackCategory.NEURODEVELOPMENTAL_ADHD,
      answers: [
        {
          nodeId: 'adhd-01',
          selectedOptionValue: 'childhood_onset_confirmed'
        },
        {
          nodeId: 'adhd-02_domains',
          selectedOptionValue: 'adhd_pervasive_impairment'
        }
      ],
      psychometricAnswers: {
        screenerType: InitialScreenerType.ASRS_V1_1,
        answers: {
          asrs_1: 3, // Frequentemente
          asrs_2: 4, // Muito frequentemente
          asrs_3: 3, // Frequentemente
          asrs_4: 2, // Às vezes
          asrs_5: 3, // Frequentemente
          asrs_6: 1  // Raramente
        }
      }
    };

    const res = await app.request('/api/diagnostic-tree/assessments', {
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
    expect(body.report.provisionalCid11).toContain('6A05');
    expect(body.report.psychometricBaseline.severityLevel).toContain('Positivo para Rastreamento de TDAH');
  });

  it('5. deve computar escala de estresse percebido PSS-10 com pontuação de itens reversos', async () => {
    const payload = {
      patientId: mockPatientId,
      primaryTrack: DiagnosticTrackCategory.SOMATIC_AND_BURNOUT,
      answers: [
        {
          nodeId: 'burnout-01',
          selectedOptionValue: 'burnout_triad_confirmed'
        },
        {
          nodeId: 'burnout-02_somatic',
          selectedOptionValue: 'burnout_incapacity'
        }
      ],
      psychometricAnswers: {
        screenerType: InitialScreenerType.PSS_10,
        answers: {
          pss10_1: 3,
          pss10_2: 3,
          pss10_3: 4,
          pss10_4: 3, // Inverso
          pss10_5: 3, // Inverso
          pss10_6: 3,
          pss10_7: 3, // Inverso
          pss10_8: 3, // Inverso
          pss10_9: 2,
          pss10_10: 3
        }
      }
    };

    const res = await app.request('/api/diagnostic-tree/assessments', {
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
    expect(body.report.provisionalCid11).toContain('QD85');
    expect(body.report.psychometricBaseline.score).toBe(30);
    expect(body.report.psychometricBaseline.severityLevel).toContain('Alto Estresse Percebido');
  });

  it('6. deve listar histórico de avaliações do paciente e permitir busca por ID com decifragem FLE', async () => {
    // 1. Cria uma avaliação inicial
    const createRes = await app.request('/api/diagnostic-tree/assessments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        patientId: mockPatientId,
        primaryTrack: DiagnosticTrackCategory.TRAUMA_AND_STRESSOR,
        answers: [
          {
            nodeId: 'trauma-01',
            selectedOptionValue: 'trauma_ptsd_symptoms'
          },
          {
            nodeId: 'trauma-02_dissociation',
            selectedOptionValue: 'ptsd_with_dissociation'
          }
        ],
        clinicalNotes: 'Sintomas pós-traumáticos com revivência e dissociação leve.',
        confidentialNotes: 'Anotações sigilosas de supervisão clínica.'
      })
    });

    expect(createRes.status).toBe(201);
    const createdBody = await createRes.json();
    const assessmentId = createdBody.report.id;

    // 2. Lista avaliações do paciente
    const listRes = await app.request(`/api/diagnostic-tree/patients/${mockPatientId}/assessments`, {
      headers: {
        Authorization: `Bearer ${therapistToken}`
      }
    });

    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.success).toBe(true);
    expect(listBody.total).toBe(1);
    expect(listBody.reports[0].clinicalHypothesisSummary).toContain('Sintomas pós-traumáticos');

    // 3. Busca por ID
    const getRes = await app.request(`/api/diagnostic-tree/assessments/${assessmentId}`, {
      headers: {
        Authorization: `Bearer ${therapistToken}`
      }
    });

    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.success).toBe(true);
    expect(getBody.report.id).toBe(assessmentId);
    expect(getBody.report.confidentialTherapistNotes).toBe('Anotações sigilosas de supervisão clínica.');
  });

  it('7. deve rejeitar requisição sem parâmetros obrigatórios com HTTP 400', async () => {
    const res = await app.request('/api/diagnostic-tree/assessments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        patientId: '', // Vazio
        answers: []
      })
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('8. deve retornar 404 para paciente inexistente ou relatório inexistente', async () => {
    const notFoundPatientRes = await app.request('/api/diagnostic-tree/assessments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        patientId: 'patient-inexistente-999',
        primaryTrack: DiagnosticTrackCategory.ANXIETY_SPECTRUM,
        answers: []
      })
    });

    expect(notFoundPatientRes.status).toBe(404);

    const notFoundReportRes = await app.request('/api/diagnostic-tree/assessments/report-inexistente', {
      headers: {
        Authorization: `Bearer ${therapistToken}`
      }
    });

    expect(notFoundReportRes.status).toBe(404);
  });
});
