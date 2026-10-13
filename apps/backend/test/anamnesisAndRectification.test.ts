import { describe, expect, it, beforeEach } from 'bun:test';
import { app } from '../src';
import { db } from '../src/db/memoryDb';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { 
  AuditAction, 
  AuditResourceType,
  SaveAnamnesisDTO,
  CreateRectificationDTO
} from '@terapiainfoco/shared';

describe('Ficha de Anamnese Biopsicossocial & Termo de Retificação de Prontuário (RFC §3.4 & CFP nº 001/2009)', () => {
  let therapistToken: string;
  let secretaryToken: string;
  let patientId: string;
  let appointmentId: string;

  beforeEach(async () => {
    db.clear();
    globalRateLimitStore.reset();

    // 1. Login Psicólogo Titular
    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'psicologo@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const loginData = await loginRes.json();
    therapistToken = loginData.accessToken;

    // 2. Login Recepção / Secretária
    const secRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'recepcao@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const secData = await secRes.json();
    secretaryToken = secData.accessToken;

    // 3. Cadastrar paciente base
    const patRes = await app.request('/api/patients', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        name: 'Juliana Mendes Cavalcante',
        email: 'juliana.mendes@email.com',
        phone: '11977778888',
        cpf: '456.789.012-34',
        consentTranscriptionSigned: true
      })
    });
    const patData = await patRes.json();
    patientId = patData.patient.id;

    // 4. Cadastrar agendamento base
    const start1 = new Date(Date.now() + 24 * 3600 * 1000);
    const end1 = new Date(start1.getTime() + 50 * 60 * 1000);
    const apptRes = await app.request('/api/appointments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        patientId,
        scheduledStart: start1.toISOString(),
        scheduledEnd: end1.toISOString(),
        bufferMinutes: 10
      })
    });
    const apptData = await apptRes.json();
    appointmentId = apptData.appointment.id;
  });

  describe('1. Ficha de Admissão & Anamnese Biopsicossocial (RFC §3.4 e CFP nº 001/2009 e 004/2020)', () => {
    const anamnesisPayload: SaveAnamnesisDTO = {
      chiefComplaint: 'Ansiedade com crises de pânico e prejuízo laboral.',
      historyOfComplaint: 'Sintomas iniciados há 6 meses após promoção na empresa, com piora progressiva e taquicardia em reuniões.',
      biopsychosocialHistory: {
        personalDevelopment: 'Desenvolvimento típico na infância, perfil exigente e perfeccionista desde a adolescência.',
        familyDynamics: 'Pais casados, dinâmica familiar protetora; bom relacionamento conjugal.',
        socialSupportNetwork: 'Rede de amigos próxima e frequenta grupo esportivo.',
        routineSleepNutrition: 'Sono fragmentado de 5 horas por noite, apetite preservado.'
      },
      medicalAndPsychiatricHistory: {
        currentMedications: 'Sem psicotrópicos no momento.',
        previousTreatments: 'Psicoterapia na faculdade por 1 ano.',
        familyPsychiatricHistory: 'Tia materna com transtorno bipolar.',
        allergiesOrMedicalConditions: 'Sem alergias medicamentosas conhecidas.'
      },
      therapeuticGoals: '1. Manejo da ansiedade e regulação fisiológica.\n2. Reestruturação cognitiva de perfeccionismo.',
      emergencyContact: {
        name: 'Marcos Cavalcante',
        relationship: 'Cônjuge',
        phone: '11977778899'
      }
    };

    it('deve salvar nova ficha de anamnese com Field-Level Encryption e auditoria WORM', async () => {
      const res = await app.request(`/api/patients/${patientId}/anamnesis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${therapistToken}`
        },
        body: JSON.stringify(anamnesisPayload)
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.anamnesis.patientId).toBe(patientId);
      expect(data.anamnesis.version).toBe(1);
      expect(data.anamnesis.chiefComplaint).toBe(anamnesisPayload.chiefComplaint);
      expect(data.anamnesis.biopsychosocialHistory.familyDynamics).toBe('Pais casados, dinâmica familiar protetora; bom relacionamento conjugal.');
      expect(data.anamnesis.emergencyContact?.name).toBe('Marcos Cavalcante');

      // Verifica auditoria WORM
      const audit = db.auditLogs.find(l => 
        l.resourceType === AuditResourceType.CLINICAL_RECORD && 
        l.action === AuditAction.CREATE &&
        l.userAgent?.includes('Anamnese')
      );
      expect(audit).toBeDefined();
    });

    it('deve incrementar versão (v1 -> v2) em atualização subsequente', async () => {
      // Cria v1
      await app.request(`/api/patients/${patientId}/anamnesis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${therapistToken}`
        },
        body: JSON.stringify(anamnesisPayload)
      });

      // Atualiza para v2
      const updatedPayload: SaveAnamnesisDTO = {
        ...anamnesisPayload,
        chiefComplaint: 'Ansiedade em remissão parcial; foco agora em limites interpessoais no trabalho.',
        therapeuticGoals: '1. Consolidar técnicas de autorregulação.\n2. Assertividade e comunicação não-violenta.'
      };

      const resUpdate = await app.request(`/api/patients/${patientId}/anamnesis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${therapistToken}`
        },
        body: JSON.stringify(updatedPayload)
      });

      expect(resUpdate.status).toBe(200);
      const dataUpdate = await resUpdate.json();
      expect(dataUpdate.anamnesis.version).toBe(2);
      expect(dataUpdate.anamnesis.chiefComplaint).toBe(updatedPayload.chiefComplaint);

      // Leitura via GET decifrada
      const getRes = await app.request(`/api/patients/${patientId}/anamnesis`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${therapistToken}`
        }
      });
      expect(getRes.status).toBe(200);
      const getData = await getRes.json();
      expect(getData.anamnesis.version).toBe(2);
      expect(getData.anamnesis.therapeuticGoals).toBe(updatedPayload.therapeuticGoals);
    });

    it('deve rejeitar cadastro de anamnese se a queixa principal for omitida', async () => {
      const invalidPayload = {
        ...anamnesisPayload,
        chiefComplaint: ''
      };

      const res = await app.request(`/api/patients/${patientId}/anamnesis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${therapistToken}`
        },
        body: JSON.stringify(invalidPayload)
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('queixa principal');
    });

    it('deve aplicar segregação estrita (RBAC) e proibir acesso de secretária/recepção (HTTP 403)', async () => {
      // POST por secretária deve falhar com 403
      const postRes = await app.request(`/api/patients/${patientId}/anamnesis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secretaryToken}`
        },
        body: JSON.stringify(anamnesisPayload)
      });
      expect(postRes.status).toBe(403);

      // GET por secretária deve falhar com 403
      const getRes = await app.request(`/api/patients/${patientId}/anamnesis`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${secretaryToken}`
        }
      });
      expect(getRes.status).toBe(403);
    });

    it('deve retornar 404 se a anamnese ainda não tiver sido preenchida', async () => {
      const res = await app.request(`/api/patients/${patientId}/anamnesis`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${therapistToken}`
        }
      });
      expect(res.status).toBe(404);
    });
  });

  describe('2. Termo de Retificação Formal para Prontuários Selados (RFC §3.4 e Resolução CFP nº 001/2009)', () => {
    let draftRecordId: string;

    beforeEach(async () => {
      // Criar rascunho de prontuário SOAP
      const draftRes = await app.request('/api/clinical-records/draft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${therapistToken}`
        },
        body: JSON.stringify({
          appointmentId,
          patientId,
          sessionNumber: 1,
          soap: {
            subjective: 'Paciente comparece pontualmente relatando crises de ansiedade na última semana.',
            objective: 'Apresenta-se orientada, afeto eutímico com momentos de ansiedade situacional.',
            assessment: 'Quadro compatível com F41.1 (Ansiedade Generalizada) sob evolução.',
            plan: 'Treino de respiração diafragmática e agenda de autocuidado.'
          },
          privateNotes: 'Observação confidencial do psicólogo.'
        })
      });
      const draftData = await draftRes.json();
      draftRecordId = draftData.record.id;
    });

    it('deve rejeitar averbação de retificação se o prontuário ainda for rascunho (não assinado)', async () => {
      const rectifyPayload: CreateRectificationDTO = {
        rectifiedQuadrant: 'SUBJECTIVE',
        reason: 'Correção de data relatada pelo paciente',
        rectifiedContent: 'Paciente esclareceu que a crise ocorreu há duas semanas, não na última semana.',
        confirmedEthicsReview: true
      };

      const res = await app.request(`/api/clinical-records/${draftRecordId}/rectify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${therapistToken}`
        },
        body: JSON.stringify(rectifyPayload)
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('já selados e assinados');
    });

    it('deve rejeitar retificação se a confirmação de revisão ética for omitida', async () => {
      // Assinar o prontuário primeiro
      await app.request('/api/clinical-records/sign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${therapistToken}`
        },
        body: JSON.stringify({
          recordId: draftRecordId,
          confirmedHumanReview: true
        })
      });

      const unconfirmedPayload: CreateRectificationDTO = {
        rectifiedQuadrant: 'PLAN',
        reason: 'Ajuste de meta terapêutica',
        rectifiedContent: 'Adicionada indicação de avaliação com neurologista.',
        confirmedEthicsReview: false
      };

      const res = await app.request(`/api/clinical-records/${draftRecordId}/rectify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${therapistToken}`
        },
        body: JSON.stringify(unconfirmedPayload)
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('confirmação explícita de responsabilidade ética');
    });

    it('deve averbar com sucesso termo de retificação em prontuário assinado mantendo integridade original', async () => {
      // 1. Assinar prontuário
      const signRes = await app.request('/api/clinical-records/sign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${therapistToken}`
        },
        body: JSON.stringify({
          recordId: draftRecordId,
          confirmedHumanReview: true
        })
      });
      const signData = await signRes.json();
      const originalSignatureHash = signData.record.signatureHash;
      expect(originalSignatureHash).toBeDefined();

      // 2. Averbar retificação formal (CFP nº 001/2009)
      const rectifyPayload: CreateRectificationDTO = {
        rectifiedQuadrant: 'SUBJECTIVE',
        reason: 'Esclarecimento complementar registrado pelo paciente após término da sessão',
        rectifiedContent: 'Termo Aditivo (Subjetivo): Paciente pontuou que o gatilho da crise envolveu conflito interpessoal corporativo.',
        confirmedEthicsReview: true
      };

      const rectifyRes = await app.request(`/api/clinical-records/${draftRecordId}/rectify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${therapistToken}`
        },
        body: JSON.stringify(rectifyPayload)
      });

      expect(rectifyRes.status).toBe(201);
      const rectifyData = await rectifyRes.json();
      expect(rectifyData.success).toBe(true);
      expect(rectifyData.rectification.clinicalRecordId).toBe(draftRecordId);
      expect(rectifyData.rectification.rectifiedQuadrant).toBe('SUBJECTIVE');
      expect(rectifyData.rectification.signatureHash).toBeDefined();
      expect(rectifyData.rectification.signatureHash.length).toBe(64); // SHA-256

      // 3. Garantir que o prontuário original permanece inalterado e imutável
      const getRecordRes = await app.request(`/api/clinical-records/${draftRecordId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${therapistToken}`
        }
      });
      const getRecordData = await getRecordRes.json();
      expect(getRecordData.record.isSigned).toBe(true);
      expect(getRecordData.record.signatureHash).toBe(originalSignatureHash);
      expect(getRecordData.record.soap.subjective).toBe('Paciente comparece pontualmente relatando crises de ansiedade na última semana.');

      // 4. Listar termos de retificação averbados
      const listRes = await app.request(`/api/clinical-records/${draftRecordId}/rectifications`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${therapistToken}`
        }
      });
      expect(listRes.status).toBe(200);
      const listData = await listRes.json();
      expect(listData.count).toBe(1);
      expect(listData.rectifications[0].reason).toBe(rectifyPayload.reason);
      expect(listData.rectifications[0].rectifiedContent).toBe(rectifyPayload.rectifiedContent);

      // 5. Verificar auditoria WORM
      const audit = db.auditLogs.find(l =>
        l.resourceType === AuditResourceType.CLINICAL_RECORD &&
        l.action === AuditAction.UPDATE &&
        l.userAgent?.includes('Termo de Retificação')
      );
      expect(audit).toBeDefined();
    });

    it('deve aplicar controle RBAC e impedir recepção/secretária de averbar ou listar termos (HTTP 403)', async () => {
      // Assinar primeiro
      await app.request('/api/clinical-records/sign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${therapistToken}`
        },
        body: JSON.stringify({
          recordId: draftRecordId,
          confirmedHumanReview: true
        })
      });

      // Tentativa de POST por secretária
      const postSecRes = await app.request(`/api/clinical-records/${draftRecordId}/rectify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secretaryToken}`
        },
        body: JSON.stringify({
          rectifiedQuadrant: 'GENERAL',
          reason: 'Tentativa não autorizada',
          rectifiedContent: 'Texto',
          confirmedEthicsReview: true
        })
      });
      expect(postSecRes.status).toBe(403);

      // Tentativa de GET por secretária
      const getSecRes = await app.request(`/api/clinical-records/${draftRecordId}/rectifications`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${secretaryToken}`
        }
      });
      expect(getSecRes.status).toBe(403);
    });
  });
});
