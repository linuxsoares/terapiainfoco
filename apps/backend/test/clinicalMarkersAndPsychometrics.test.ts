import { describe, it, expect, beforeEach } from 'bun:test';
import { 
  ClinicalMarkerCategory, 
  ClinicalMarkerRelevance, 
  GoalStatus, 
  PsychometricScaleType, 
  PsychometricSeverityLevel,
  UserRole
} from '@terapiainfoco/shared';
import { db } from '../src/db/memoryDb';
import { ClinicalMarkerService } from '../src/services/clinicalMarkerService';
import { GoalService } from '../src/services/goalService';
import { PsychometricService } from '../src/services/psychometricService';
import { app } from '../src/index';

import { upsertPatient } from './helpers/db';
describe('Evolução de Produto RFC-001: Marcadores Clínicos, Metas SMART & Escalas Psicométricas (§3.3, §3.4)', () => {
  const mockContext = {
    actorId: 'therapist-001',
    ipAddress: '127.0.0.1',
    userAgent: 'Bun-Test-Client'
  };

  const patientId = 'pat-test-clinical-001';
  const appointmentId = 'appt-test-clinical-001';

  beforeEach(async () => {
    // Configura paciente e consulta de teste
    await upsertPatient({
      id: patientId,
      therapistId: 'therapist-001',
      encryptedName: {} as any,
      encryptedEmail: {} as any,
      encryptedPhone: {} as any,
      encryptedCpf: {} as any,
      cpfBindex: 'bindex-cpf-123',
      emailBindex: 'bindex-email-123',
      consentTranscriptionSigned: true,
      createdAt: new Date()
    });

    db.appointments.set(appointmentId, {
      id: appointmentId,
      therapistId: 'therapist-001',
      patientId,
      scheduledStart: new Date().toISOString(),
      scheduledEnd: new Date(Date.now() + 50 * 60 * 1000).toISOString(),
      status: 'CONFIRMADA' as any,
      createdAt: new Date()
    });
  });

  describe('1. Marcadores Clínicos em Tempo Real (RFC-001 §3.3)', () => {
    it('deve criar marcador com timestamp, nota cifrada e quadrante SOAP inferido', async () => {
      const marker = ClinicalMarkerService.createMarker({
        appointmentId,
        timestampMs: 145000, // 2 min e 25s
        timeFormatted: '02:25',
        category: ClinicalMarkerCategory.INSIGHT,
        relevance: ClinicalMarkerRelevance.HIGH,
        note: 'Paciente reconhece o padrão de autossabotagem em relações de trabalho.'
      }, mockContext);

      expect(marker.id).toBeDefined();
      expect(marker.appointmentId).toBe(appointmentId);
      expect(marker.category).toBe(ClinicalMarkerCategory.INSIGHT);
      expect(marker.suggestedSoapQuadrant).toBe('ASSESSMENT');
      expect(marker.timeFormatted).toBe('02:25');

      // Verifica que no banco em memória a nota está criptografada (FLE)
      const stored = db.clinicalMarkers.get(marker.id);
      expect(stored).toBeDefined();
      expect(stored?.encryptedNote).toBeDefined();
      expect(stored?.encryptedNote.ciphertext).toBeDefined();
    });

    it('deve listar marcadores ordenados cronologicamente pelo timestamp da sessão', async () => {
      ClinicalMarkerService.createMarker({
        appointmentId,
        timestampMs: 600000,
        timeFormatted: '10:00',
        category: ClinicalMarkerCategory.RESISTANCE,
        relevance: ClinicalMarkerRelevance.MEDIUM,
        note: 'Hesitação ao abordar relacionamento paterno.'
      }, mockContext);

      ClinicalMarkerService.createMarker({
        appointmentId,
        timestampMs: 120000,
        timeFormatted: '02:00',
        category: ClinicalMarkerCategory.SOMATIC_COMPLAINT,
        relevance: ClinicalMarkerRelevance.LOW,
        note: 'Relato de aperto no peito e sudorese.'
      }, mockContext);

      const markers = ClinicalMarkerService.getMarkersByAppointment(appointmentId);
      expect(markers.length).toBeGreaterThanOrEqual(2);
      expect(markers[0].timestampMs).toBeLessThanOrEqual(markers[1].timestampMs);
      expect(markers[0].timeFormatted).toBe('02:00');
    });

    it('deve exportar marcadores da sessão estruturando proposta preliminar de SOAP', async () => {
      // Limpa marcadores anteriores da consulta
      for (const [id, m] of db.clinicalMarkers.entries()) {
        if (m.appointmentId === appointmentId) db.clinicalMarkers.delete(id);
      }

      ClinicalMarkerService.createMarker({
        appointmentId,
        timestampMs: 180000,
        timeFormatted: '03:00',
        category: ClinicalMarkerCategory.SOMATIC_COMPLAINT,
        relevance: ClinicalMarkerRelevance.MEDIUM,
        note: 'Cefaleia tensional após reuniões de equipe.'
      }, mockContext);

      ClinicalMarkerService.createMarker({
        appointmentId,
        timestampMs: 900000,
        timeFormatted: '15:00',
        category: ClinicalMarkerCategory.INSIGHT,
        relevance: ClinicalMarkerRelevance.HIGH,
        note: 'Compreensão de que a autocobrança decorre de expectativas familiares.'
      }, mockContext);

      ClinicalMarkerService.createMarker({
        appointmentId,
        timestampMs: 2400000,
        timeFormatted: '40:00',
        category: ClinicalMarkerCategory.THERAPEUTIC_CONTRACT,
        relevance: ClinicalMarkerRelevance.MEDIUM,
        note: 'Registro diário de pensamentos disfuncionais (RPD) 3x na semana.'
      }, mockContext);

      const proposal = ClinicalMarkerService.exportToSoapProposal(appointmentId);
      expect(proposal.success).toBe(true);
      expect(proposal.totalMarkersCount).toBe(3);
      expect(proposal.suggestedSoap.subjective.length).toBe(1);
      expect(proposal.suggestedSoap.assessment.length).toBe(1);
      expect(proposal.suggestedSoap.plan.length).toBe(1);
      expect(proposal.suggestedSoap.subjective[0]).toContain('Cefaleia tensional');
      expect(proposal.suggestedSoap.plan[0]).toContain('Registro diário');
    });
  });

  describe('2. Metas Terapêuticas SMART (RFC-001 §3.4)', () => {
    it('deve criar e atualizar meta terapêutica com progresso percentual', async () => {
      const goal = await GoalService.createGoal({
        patientId,
        title: 'Manejo de Crises Ansiosas',
        description: 'Reduzir episódios agudos de ansiedade de 4x para no máximo 1x por semana.',
        category: 'Emocional/Comportamental',
        targetDate: '2026-12-31',
        initialProgressPercent: 20
      }, mockContext);

      expect(goal.id).toBeDefined();
      expect(goal.status).toBe(GoalStatus.NOT_STARTED);
      expect(goal.progressPercent).toBe(20);

      // Atualiza progresso para 100% (deve transicionar automaticamente para ACHIEVED)
      const updated = GoalService.updateGoal(goal.id, {
        progressPercent: 100,
        notes: 'Paciente alcançou a meta após assimilação das técnicas de regulação diafragmática.'
      }, mockContext);

      expect(updated.progressPercent).toBe(100);
      expect(updated.status).toBe(GoalStatus.ACHIEVED);
      expect(updated.notes).toContain('Paciente alcançou');

      const patientGoals = GoalService.getPatientGoals(patientId);
      expect(patientGoals.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('3. Escalas Psicométricas Padronizadas (PHQ-9 & GAD-7)', () => {
    it('deve submeter PHQ-9, calcular escore de depressão moderada e gerar recomendações', async () => {
      const result = await PsychometricService.submitAssessment({
        patientId,
        appointmentId,
        scaleType: PsychometricScaleType.PHQ9,
        answers: [
          { questionIndex: 1, score: 2 },
          { questionIndex: 2, score: 2 },
          { questionIndex: 3, score: 1 },
          { questionIndex: 4, score: 2 },
          { questionIndex: 5, score: 1 },
          { questionIndex: 6, score: 1 },
          { questionIndex: 7, score: 1 },
          { questionIndex: 8, score: 1 },
          { questionIndex: 9, score: 0 } // sem ideação
        ]
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.assessment.totalScore).toBe(11);
      expect(result.assessment.severityLevel).toBe(PsychometricSeverityLevel.MODERATE);
      expect(result.assessment.criticalAlert).toBe(false);
      expect(result.assessment.auditWormId).toBeDefined();
      expect(result.assessment.conductRecommendations.length).toBeGreaterThan(0);
    });

    it('deve disparar alerta crítico se o item 9 do PHQ-9 for positivo', async () => {
      const result = await PsychometricService.submitAssessment({
        patientId,
        scaleType: PsychometricScaleType.PHQ9,
        answers: [
          { questionIndex: 1, score: 3 },
          { questionIndex: 2, score: 3 },
          { questionIndex: 3, score: 2 },
          { questionIndex: 4, score: 2 },
          { questionIndex: 5, score: 2 },
          { questionIndex: 6, score: 2 },
          { questionIndex: 7, score: 2 },
          { questionIndex: 8, score: 2 },
          { questionIndex: 9, score: 2 } // ideação positiva!
        ]
      }, mockContext);

      expect(result.assessment.totalScore).toBe(20);
      expect(result.assessment.severityLevel).toBe(PsychometricSeverityLevel.SEVERE);
      expect(result.assessment.criticalAlert).toBe(true);
      expect(result.assessment.conductRecommendations[0]).toContain('ATENÇÃO CLÍNICA');
    });

    it('deve calcular tendência longitudinal (melhora/piora) comparando escores anteriores', async () => {
      // Primeira aplicação (Baseline): GAD-7 escore 15 (Grave)
      const first = await PsychometricService.submitAssessment({
        patientId,
        scaleType: PsychometricScaleType.GAD7,
        answers: [
          { questionIndex: 1, score: 3 },
          { questionIndex: 2, score: 2 },
          { questionIndex: 3, score: 2 },
          { questionIndex: 4, score: 2 },
          { questionIndex: 5, score: 2 },
          { questionIndex: 6, score: 2 },
          { questionIndex: 7, score: 2 }
        ]
      }, mockContext);
      expect(first.patientHistory.trend).toBe('BASELINE');

      // Segunda aplicação (após intervenção): GAD-7 escore 6 (Leve)
      const second = await PsychometricService.submitAssessment({
        patientId,
        scaleType: PsychometricScaleType.GAD7,
        answers: [
          { questionIndex: 1, score: 1 },
          { questionIndex: 2, score: 1 },
          { questionIndex: 3, score: 1 },
          { questionIndex: 4, score: 1 },
          { questionIndex: 5, score: 1 },
          { questionIndex: 6, score: 1 },
          { questionIndex: 7, score: 0 }
        ]
      }, mockContext);

      expect(second.patientHistory.trend).toBe('IMPROVED');
      expect(second.patientHistory.previousScore).toBe(15);
      expect(second.patientHistory.scoreDelta).toBe(-9);
    });
  });

  describe('4. Rotas HTTP REST Integradas', () => {
    it('GET /api/psychometrics/definition/PHQ9 deve retornar a especificação da escala', async () => {
      // 1. Obter token do terapeuta
      // IP dedicado: o rate limiter de login (5/min por IP) é compartilhado entre arquivos de teste
      const loginRes = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.42.1' },
        body: JSON.stringify({
          email: 'psicologo@terapiainfoco.com.br',
          password: 'Senha@123456'
        })
      });
      const loginData = await loginRes.json() as any;
      const token = loginData.accessToken;

      const res = await app.request('/api/psychometrics/definition/PHQ9', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.definition.questions.length).toBe(9);
      expect(json.definition.options.length).toBe(4);
    });

    it('POST /api/clinical-markers e GET /soap-proposal via HTTP REST', async () => {
      // IP dedicado: o rate limiter de login (5/min por IP) é compartilhado entre arquivos de teste
      const loginRes = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.42.1' },
        body: JSON.stringify({
          email: 'psicologo@terapiainfoco.com.br',
          password: 'Senha@123456'
        })
      });
      const loginData = await loginRes.json() as any;
      const token = loginData.accessToken;

      const createRes = await app.request('/api/clinical-markers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          appointmentId,
          timestampMs: 65000,
          category: ClinicalMarkerCategory.SOMATIC_COMPLAINT,
          note: 'Sensação de aperto torácico ao relatar conflito familiar'
        })
      });

      expect(createRes.status).toBe(201);
      const created = await createRes.json() as any;
      expect(created.success).toBe(true);
      expect(created.marker.suggestedSoapQuadrant).toBe('SUBJECTIVE');

      const soapRes = await app.request(`/api/clinical-markers/appointment/${appointmentId}/soap-proposal`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      expect(soapRes.status).toBe(200);
      const soap = await soapRes.json() as any;
      expect(soap.totalMarkersCount).toBeGreaterThan(0);
      expect(soap.suggestedSoap.subjective[0]).toContain('aperto torácico');
    });
  });
});
