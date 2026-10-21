import { describe, it, expect, beforeEach } from 'bun:test';
import { 
  ClinicalReportPurpose,
  ReferralUrgency,
  ReferralStatus,
  GoalStatus,
  PsychometricScaleType,
  PsychometricSeverityLevel,
  UserRole
} from '@terapiainfoco/shared';
import { db } from '../src/db/memoryDb';
import { encryptField } from '../src/services/cryptoContext';
import { ConsolidatedReportService } from '../src/services/consolidatedReportService';
import { ClinicalReferralService } from '../src/services/clinicalReferralService';
import { app } from '../src/index';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { resetDb, upsertPatient, upsertAppointment } from './helpers/db';

describe('Evolução de Produto RFC-001: Laudo Pericial Consolidado (CFP nº 006/2019) & Encaminhamento Multidisciplinar (§3.5)', () => {
  const mockContext = {
    actorId: 'therapist-001',
    ipAddress: '127.0.0.1',
    userAgent: 'Bun-Test-Suite'
  };

  const patientId = 'pat-consolidated-001';
  const therapistId = 'therapist-001';

  beforeEach(async () => {
    await resetDb();

    // Cria paciente com dados criptografados
    await upsertPatient({
      id: patientId,
      therapistId,
      encryptedName: encryptField('Maria Clara das Dores'),
      encryptedEmail: encryptField('maria.clara@exemplo.com'),
      encryptedPhone: encryptField('(11) 98765-4321'),
      encryptedCpf: encryptField('123.456.789-00'),
      cpfBindex: 'bindex-cpf-maria',
      emailBindex: 'bindex-email-maria',
      consentTranscriptionSigned: true,
      consentSignedAt: new Date(),
      createdAt: new Date('2026-01-10T10:00:00Z')
    });

    // Cria consultas passadas do paciente
    await upsertAppointment({
      id: 'appt-01',
      therapistId,
      patientId,
      scheduledStart: '2026-02-01T14:00:00Z',
      scheduledEnd: '2026-02-01T14:50:00Z',
      status: 'COMPLETED' as any,
      createdAt: new Date('2026-02-01')
    });

    await upsertAppointment({
      id: 'appt-02',
      therapistId,
      patientId,
      scheduledStart: '2026-02-08T14:00:00Z',
      scheduledEnd: '2026-02-08T14:50:00Z',
      status: 'COMPLETED' as any,
      createdAt: new Date('2026-02-08')
    });

    // Cria avaliações psicométricas
    db.psychometricAssessments.set('psy-phq9-01', {
      id: 'psy-phq9-01',
      patientId,
      therapistId,
      scaleType: PsychometricScaleType.PHQ9,
      totalScore: 16,
      severityLevel: PsychometricSeverityLevel.MODERATELY_SEVERE,
      clinicalInterpretation: 'Sintomatologia depressiva moderadamente grave.',
      answers: [],
      criticalAlert: false,
      conductRecommendations: ['Avaliação psiquiátrica sugerida'],
      createdAt: new Date('2026-02-01T14:45:00Z')
    });

    db.psychometricAssessments.set('psy-gad7-01', {
      id: 'psy-gad7-01',
      patientId,
      therapistId,
      scaleType: PsychometricScaleType.GAD7,
      totalScore: 13,
      severityLevel: PsychometricSeverityLevel.MODERATE,
      clinicalInterpretation: 'Sintomas de ansiedade moderada.',
      answers: [],
      criticalAlert: false,
      conductRecommendations: ['Técnicas de regulação emocional'],
      createdAt: new Date('2026-02-08T14:45:00Z')
    });

    // Cria metas SMART
    db.therapeuticGoals.set('goal-01', {
      id: 'goal-01',
      patientId,
      therapistId,
      title: 'Higiene do sono e redução de despertares noturnos',
      encryptedDescription: encryptField('Estabelecer rotina de descompressão noturna às 22h sem telas.'),
      status: GoalStatus.IN_PROGRESS,
      progressPercent: 70,
      createdAt: new Date('2026-02-01'),
      updatedAt: new Date('2026-02-08')
    });
  });

  describe('1. Laudo Pericial Multi-Sessões & Relatório Consolidado (CFP nº 006/2019)', () => {
    it('deve gerar relatório consolidado estruturado rigorosamente nas 5 seções do CFP nº 006/2019', async () => {
      const report = await ConsolidatedReportService.generateReport({
        therapistId,
        dto: {
          patientId,
          finalidade: ClinicalReportPurpose.JUDICIAL_EXPERT,
          solicitante: 'Juízo da 3ª Vara de Família da Comarca de São Paulo',
          descricaoDemanda: 'Perícia psicológica solicitada para avaliação de capacidade laboral e estabilidade emocional no contexto de processo de tutela.',
          dataInicio: '2026-02-01',
          dataFim: '2026-02-15',
          includePsychometrics: true,
          includeGoals: true,
          includeTimelineSessions: true,
          hipoteseDiagnostica: 'CID-11: 6A70 Transtorno Depressivo Recorrente em Remissão Parcial',
          parecerFinal: 'A pericianda apresenta preservação da capacidade reflexiva e cognitiva, demandando suporte psicológico e acompanhamento médico periódico.'
        },
        context: mockContext
      });

      // Validações Seção I: Identificação
      expect(report.identificacao.pacienteNome).toBe('Maria Clara das Dores');
      expect(report.identificacao.solicitante).toContain('3ª Vara de Família');
      expect(report.identificacao.finalidade).toBe(ClinicalReportPurpose.JUDICIAL_EXPERT);
      expect(report.identificacao.autorCrp).toContain('CRP');

      // Validações Seção II: Demanda
      expect(report.descricaoDemanda).toContain('Perícia psicológica solicitada');

      // Validações Seção III: Procedimento
      expect(report.procedimento.numeroSessoes).toBe(2);
      expect(report.procedimento.periodoInicial).toBe('2026-02-01');
      expect(report.procedimento.periodoFinal).toBe('2026-02-15');
      expect(report.procedimento.recursosUtilizados.length).toBeGreaterThanOrEqual(3);
      expect(report.procedimento.escalasAplicadas?.length).toBe(2);
      expect(report.procedimento.sessoesResumo?.length).toBe(2);

      // Validações Seção IV: Análise
      expect(report.analise.evolucaoClinica).toContain('PHQ9');
      expect(report.analise.analisePsicologica).toContain('Conselho Federal de Psicologia');
      expect(report.analise.metasAlcancadas?.length).toBe(1);
      expect(report.analise.metasAlcancadas?.[0].meta).toBe('Higiene do sono e redução de despertares noturnos');

      // Validações Seção V: Conclusão
      expect(report.conclusao.parecerFinal).toContain('preservação da capacidade reflexiva');
      expect(report.conclusao.hipoteseDiagnostica).toContain('CID-11: 6A70');
      expect(report.conclusao.encaminhamentosSugeridos?.length).toBeGreaterThan(0);

      // Validações de Integridade Criptográfica & WORM
      expect(report.documentHashSha256).toBeDefined();
      expect(report.documentHashSha256.length).toBe(64); // SHA-256 hex string
      expect(report.wormAuditId).toContain('worm_');
      expect(report.status).toBe('DRAFT');

      // Validação de decriptação no banco
      const stored = db.consolidatedReports.get(report.id);
      expect(stored).toBeDefined();
      expect(stored?.encryptedDescricaoDemanda.ciphertext).toBeDefined();
      expect(stored?.encryptedAnalise.ciphertext).toBeDefined();
    });

    it('deve assinar digitalmente o relatório com credencial ICP-Brasil e carimbo de tempo', async () => {
      const report = await ConsolidatedReportService.generateReport({
        therapistId,
        dto: {
          patientId,
          finalidade: ClinicalReportPurpose.CLINICAL_EVOLUTION,
          solicitante: 'Paciente',
          descricaoDemanda: 'Síntese de evolução clínica solicitada para fins de acompanhamento pessoal.'
        },
        context: mockContext
      });

      expect(report.status).toBe('DRAFT');

      const signed = ConsolidatedReportService.signReport({
        reportId: report.id,
        therapistId,
        context: mockContext
      });

      expect(signed.status).toBe('SIGNED');
      expect(signed.signedByCrp).toBeDefined();
      expect(signed.signedAt).toBeDefined();
      expect(signed.signatureIcpBrasilToken).toContain('icp_br_');
    });

    it('deve listar relatórios por paciente e buscar por ID com decriptação', async () => {
      const r1 = await ConsolidatedReportService.generateReport({
        therapistId,
        dto: {
          patientId,
          finalidade: ClinicalReportPurpose.PSYCHIATRIC_REFERRAL,
          solicitante: 'Dr. Roberto Psiquiatra',
          descricaoDemanda: 'Encaminhamento para avaliação de farmacoterapia adjuvante.'
        },
        context: mockContext
      });

      const list = ConsolidatedReportService.listByPatient(patientId, mockContext);
      expect(list.length).toBe(1);
      expect(list[0].id).toBe(r1.id);
      expect(list[0].descricaoDemanda).toBe(r1.descricaoDemanda);

      const single = ConsolidatedReportService.getById(r1.id, mockContext);
      expect(single).not.toBeNull();
      expect(single?.identificacao.pacienteNome).toBe('Maria Clara das Dores');
    });
  });

  describe('2. Encaminhamento Multidisciplinar Interoperável & Contra-Referência (RFC-001 §3.5)', () => {
    it('deve emitir guia de encaminhamento psiquiátrico com nível de urgência, token de validação e resumo psicométrico', async () => {
      const referral = await ClinicalReferralService.createReferral({
        therapistId,
        dto: {
          patientId,
          recipientProfessional: 'Dr. Roberto Mendes CRM/SP 123456',
          recipientSpecialty: 'Psiquiatria Clínica',
          recipientInstitution: 'Ambulatório Médico Integrado',
          urgency: ReferralUrgency.PRIORITY,
          clinicalSummary: 'Paciente em acompanhamento semanal apresentando quadro compatível com episódio depressivo moderado com flutuações anedônicas e insônia inicial.',
          reasonForReferral: 'Avaliação clínica para eventual introdução de psicofármacos e acompanhamento integrado em contra-referência.',
          diagnosticHypothesis: 'CID-11: 6A70 Transtorno Depressivo',
          currentMedicationReported: 'Nenhum psicofármaco no momento; uso ocasional de fitoterápicos.',
          includeLatestPsychometric: true
        },
        context: mockContext
      });

      expect(referral.id).toBeDefined();
      expect(referral.patientName).toBe('Maria Clara das Dores');
      expect(referral.urgency).toBe(ReferralUrgency.PRIORITY);
      expect(referral.status).toBe(ReferralStatus.ISSUED);
      expect(referral.validationToken).toContain('ref_');
      expect(referral.validationUrl).toContain('/verify/referral/');
      expect(referral.wormAuditId).toContain('worm_');
      expect(referral.psychometricSummary).toBeDefined();
      expect(referral.psychometricSummary?.scaleType).toBe(PsychometricScaleType.GAD7);

      // Verifica criptografia no banco
      const stored = db.clinicalReferrals.get(referral.id);
      expect(stored).toBeDefined();
      expect(stored?.encryptedClinicalSummary.ciphertext).toBeDefined();
    });

    it('deve validar guia de encaminhamento em endpoint público sem expor dados desnecessários (LGPD Art. 11 e CFP Art. 9º)', async () => {
      const referral = await ClinicalReferralService.createReferral({
        therapistId,
        dto: {
          patientId,
          recipientProfessional: 'Dra. Carolina Silva CRM/SP 654321',
          recipientSpecialty: 'Neurologia',
          urgency: ReferralUrgency.ROUTINE,
          clinicalSummary: 'Avaliação neurológica devido a queixas persistentes de cefaleia tensional e sonolência diurna.',
          reasonForReferral: 'Investigação de distúrbios neurológicos primários.'
        },
        context: mockContext
      });

      const validation = ClinicalReferralService.validatePublicReferral(referral.validationToken);

      expect(validation.success).toBe(true);
      expect(validation.valid).toBe(true);
      expect(validation.referral).toBeDefined();
      // O nome completo NÃO deve ser exposto publicamente, apenas as iniciais para resguardo do paciente
      expect(validation.referral?.patientInitials).toBe('M. C. D. D.');
      expect(validation.referral?.recipientProfessional).toBe('Dra. Carolina Silva CRM/SP 654321');
      expect(validation.referral?.urgency).toBe(ReferralUrgency.ROUTINE);
      expect(validation.referral?.status).toBe(ReferralStatus.ISSUED);
      expect(validation.referral?.wormAuditId).toBe(referral.wormAuditId);

      // Token inexistente
      const invalid = ClinicalReferralService.validatePublicReferral('ref_token_fantasma_inexistente');
      expect(invalid.valid).toBe(false);
      expect(invalid.success).toBe(false);
    });

    it('deve registrar contra-referência médica com sucesso', async () => {
      const referral = await ClinicalReferralService.createReferral({
        therapistId,
        dto: {
          patientId,
          recipientProfessional: 'Dr. Psiquiatra de Plantão',
          recipientSpecialty: 'Psiquiatria de Urgência',
          urgency: ReferralUrgency.EMERGENCY,
          clinicalSummary: 'Encaminhamento prioritário devido a exacerbação aguda de sintomas ansiosos.',
          reasonForReferral: 'Manejo psicofarmacológico imediato.'
        },
        context: mockContext
      });

      const updated = ClinicalReferralService.registerCounterReferral({
        dto: {
          referralId: referral.id,
          counterReferredBy: 'Dr. Psiquiatra de Plantão CRM 123456',
          counterReferenceNotes: 'Avaliado em consulta. Iniciado Escitalopram 10mg/dia com retorno previsto em 30 dias. Recomendada manutenção da psicoterapia semanal.'
        },
        context: mockContext
      });

      expect(updated.status).toBe(ReferralStatus.COUNTER_REFERRED);
      expect(updated.counterReferredBy).toBe('Dr. Psiquiatra de Plantão CRM 123456');
      expect(updated.counterReferenceNotes).toContain('Iniciado Escitalopram 10mg/dia');
      expect(updated.counterReferredAt).toBeDefined();
    });
  });

  describe('3. Integração REST HTTP (Rotas /api/reports/consolidated e /api/referrals)', () => {
    let authToken: string;

    beforeEach(async () => {

      // Rate limit de login (5/min por IP) é compartilhado entre arquivos de teste

      await globalRateLimitStore.reset();
      const loginRes = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'psicologo@terapiainfoco.com.br',
          password: 'Senha@123456'
        })
      });
      const loginData = await loginRes.json() as any;
      authToken = loginData.accessToken;
    });

    it('POST /api/reports/consolidated/generate e /sign via HTTP', async () => {
      const genRes = await app.request('/api/reports/consolidated/generate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientId,
          finalidade: ClinicalReportPurpose.OCCUPATIONAL,
          solicitante: 'Empresa Contratante S.A.',
          descricaoDemanda: 'Avaliação de aptidão psicológica e resiliência ocupacional.',
          hipoteseDiagnostica: 'CID-11: QA00 Ausência de psicopatologia incapacitante'
        })
      });

      expect(genRes.status).toBe(201);
      const genJson = await genRes.json() as any;
      expect(genJson.success).toBe(true);
      expect(genJson.report.status).toBe('DRAFT');
      expect(genJson.report.documentHashSha256).toBeDefined();

      const reportId = genJson.report.id;

      // Assinatura digital
      const signRes = await app.request('/api/reports/consolidated/sign', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reportId
        })
      });

      expect(signRes.status).toBe(200);
      const signJson = await signRes.json() as any;
      expect(signJson.success).toBe(true);
      expect(signJson.report.status).toBe('SIGNED');
      expect(signJson.report.signedByCrp).toBeDefined();

      // Busca por ID
      const getRes = await app.request(`/api/reports/consolidated/${reportId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      expect(getRes.status).toBe(200);
      const getJson = await getRes.json() as any;
      expect(getJson.report.descricaoDemanda).toContain('Avaliação de aptidão');
    });

    it('Fluxo Completo de Encaminhamento via HTTP: POST /api/referrals -> GET público /validate/:token -> POST /counter-reference', async () => {
      // 1. Emissão de encaminhamento
      const refRes = await app.request('/api/referrals', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientId,
          recipientProfessional: 'Dr. Fernando Médico de Família',
          recipientSpecialty: 'Medicina de Família e Comunidade',
          urgency: ReferralUrgency.PRIORITY,
          clinicalSummary: 'Paciente relata histórico de episódios recorrentes de pânico e taquicardia situacional.',
          reasonForReferral: 'Descarte de patologias cardiovasculares e suporte farmacoterápico.',
          diagnosticHypothesis: 'CID-11: 6B01 Transtorno de Pânico'
        })
      });

      expect(refRes.status).toBe(201);
      const refJson = await refRes.json() as any;
      expect(refJson.success).toBe(true);
      const referral = refJson.referral;
      expect(referral.validationToken).toBeDefined();

      // 2. Validação PÚBLICA (sem Authorization header!)
      const valRes = await app.request(`/api/referrals/validate/${referral.validationToken}`);
      expect(valRes.status).toBe(200);
      const valJson = await valRes.json() as any;
      expect(valJson.valid).toBe(true);
      expect(valJson.referral.patientInitials).toBe('M. C. D. D.');
      expect(valJson.referral.status).toBe(ReferralStatus.ISSUED);

      // 3. Registro de contra-referência
      const counterRes = await app.request('/api/referrals/counter-reference', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          referralId: referral.id,
          counterReferredBy: 'Dr. Fernando Médico de Família CRM 778899',
          counterReferenceNotes: 'ECG e holter normais. Indicada manutenção do acompanhamento psicoterápico focado em dessensibilização sistemática.'
        })
      });

      expect(counterRes.status).toBe(200);
      const counterJson = await counterRes.json() as any;
      expect(counterJson.success).toBe(true);
      expect(counterJson.referral.status).toBe(ReferralStatus.COUNTER_REFERRED);
    });
  });
});
