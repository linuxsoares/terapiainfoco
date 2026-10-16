import { randomUUID, createHash } from 'crypto';
import { 
  type PsychometricAssessment, 
  type PsychometricAnswer,
  type SubmitPsychometricAssessmentDTO,
  type PsychometricAssessmentResultResponse,
  PsychometricScaleType,
  PsychometricSeverityLevel,
  AuditAction,
  AuditResourceType
} from '@terapiainfoco/shared';
import { db } from '../db/memoryDb';
import { AuditService } from './auditService';

export class PsychometricService {
  /**
   * Banco de questões do Patient Health Questionnaire-9 (PHQ-9 - Kroenke et al., 2001 / Versão Brasileira)
   */
  private static readonly PHQ9_QUESTIONS = [
    '1. Pouco interesse ou pouco prazer em fazer as coisas',
    '2. Sentir-se para baixo, deprimido(a) ou sem perspectiva',
    '3. Dificuldade para adormecer, continuar dormindo ou dormir demais',
    '4. Sentir-se cansado(a) ou com pouca energia',
    '5. Falta de apetite ou comendo demais',
    '6. Sentir-se mal consigo mesmo(a) — ou achar que é um fracasso ou que decepcionou sua família ou a si mesmo(a)',
    '7. Dificuldade para se concentrar nas coisas, como ler o jornal ou ver televisão',
    '8. Lentidão para se movimentar ou falar, a ponto de outras pessoas perceberem; ou o oposto: estar tão agitado(a) que você fica andando de um lado para o outro mais do que de costume',
    '9. Pensar em se ferir de alguma maneira ou que seria melhor estar morto(a)'
  ];

  /**
   * Banco de questões da Escala do Transtorno de Ansiedade Generalizada (GAD-7 - Spitzer et al., 2006 / Versão Brasileira)
   */
  private static readonly GAD7_QUESTIONS = [
    '1. Sentir-se nervoso(a), ansioso(a) ou no limite',
    '2. Não ser capaz de impedir ou de controlar as preocupações',
    '3. Preocupar-se muito com diversas coisas',
    '4. Dificuldade para relaxar',
    '5. Ficar tão inquieto(a) que é difícil permanecer sentado(a)',
    '6. Ficar facilmente irritado(a) ou chateado(a)',
    '7. Sentir medo como se algo terrível fosse acontecer'
  ];

  private static readonly SCALE_OPTIONS = [
    'Nenhuma vez (0)',
    'Vários dias (1)',
    'Mais da metade dos dias (2)',
    'Quase todos os dias (3)'
  ];

  /**
   * Retorna a especificação e as perguntas de uma escala psicométrica
   */
  static getScaleDefinition(scaleType: PsychometricScaleType) {
    const questions = scaleType === PsychometricScaleType.PHQ9 ? this.PHQ9_QUESTIONS : this.GAD7_QUESTIONS;
    return {
      scaleType,
      title: scaleType === PsychometricScaleType.PHQ9 
        ? 'PHQ-9 — Questionário de Saúde do Paciente (Rastreio de Depressão)'
        : 'GAD-7 — Escala de Transtorno de Ansiedade Generalizada',
      instruction: 'Nas últimas 2 semanas, com que frequência você foi incomodado(a) por qualquer um dos seguintes problemas?',
      options: this.SCALE_OPTIONS.map((opt, score) => ({ score, text: opt })),
      questions: questions.map((q, idx) => ({ index: idx + 1, text: q }))
    };
  }

  /**
   * Avalia escore e gravidade para o PHQ-9
   */
  private static evaluatePhq9(totalScore: number): { severity: PsychometricSeverityLevel; interpretation: string; recommendations: string[] } {
    if (totalScore <= 4) {
      return {
        severity: PsychometricSeverityLevel.MINIMAL,
        interpretation: 'Sintomatologia depressiva mínima ou ausente (Escore 0-4).',
        recommendations: ['Manutenção de psicoeducação preventiva e monitoramento rotineiro.']
      };
    } else if (totalScore <= 9) {
      return {
        severity: PsychometricSeverityLevel.MILD,
        interpretation: 'Sintomatologia depressiva leve (Escore 5-9).',
        recommendations: [
          'Suporte psicológico focado em resolução de problemas e ativação comportamental.',
          'Reavaliação em consultas subsequentes para acompanhar curso clínico.'
        ]
      };
    } else if (totalScore <= 14) {
      return {
        severity: PsychometricSeverityLevel.MODERATE,
        interpretation: 'Sintomatologia depressiva moderada (Escore 10-14).',
        recommendations: [
          'Intervenção psicoterapêutica estruturada (TCC, Interpessoal ou Psicanalítica).',
          'Considerar discussão multidisciplinar e encaminhamento para avaliação médica/psiquiátrica.'
        ]
      };
    } else if (totalScore <= 19) {
      return {
        severity: PsychometricSeverityLevel.MODERATELY_SEVERE,
        interpretation: 'Sintomatologia depressiva moderadamente grave (Escore 15-19).',
        recommendations: [
          'Plano de cuidado intensivo com psicoterapia frequente.',
          'Encaminhamento formal para avaliação psiquiátrica (tratamento farmacológico coadjuvante).',
          'Ativação da rede de apoio sociofamiliar.'
        ]
      };
    } else {
      return {
        severity: PsychometricSeverityLevel.SEVERE,
        interpretation: 'Sintomatologia depressiva grave (Escore 20-27).',
        recommendations: [
          'Intervenção clínica prioritária e estruturação imediata de plano de segurança.',
          'Encaminhamento psiquiátrico urgente com alinhamento multiprofissional.',
          'Suporte e monitoramento estreito entre sessões (Res. CFP nº 011/2018).'
        ]
      };
    }
  }

  /**
   * Avalia escore e gravidade para o GAD-7
   */
  private static evaluateGad7(totalScore: number): { severity: PsychometricSeverityLevel; interpretation: string; recommendations: string[] } {
    if (totalScore <= 4) {
      return {
        severity: PsychometricSeverityLevel.MINIMAL,
        interpretation: 'Sintomatologia ansiosa mínima ou ausente (Escore 0-4).',
        recommendations: ['Práticas de higiene do sono e regulação de estressores cotidianos.']
      };
    } else if (totalScore <= 9) {
      return {
        severity: PsychometricSeverityLevel.MILD,
        interpretation: 'Sintomatologia ansiosa leve (Escore 5-9).',
        recommendations: [
          'Técnicas de respiração diafragmática, relaxamento muscular progressivo e psicoeducação.',
          'Acompanhamento do impacto das preocupações na rotina diária.'
        ]
      };
    } else if (totalScore <= 14) {
      return {
        severity: PsychometricSeverityLevel.MODERATE,
        interpretation: 'Sintomatologia ansiosa moderada (Escore 10-14).',
        recommendations: [
          'Reestruturação cognitiva de distorções ansiogênicas e treino de tolerância à incerteza.',
          'Monitoramento de sintomas físicos e investigação de comorbidades.'
        ]
      };
    } else {
      return {
        severity: PsychometricSeverityLevel.SEVERE,
        interpretation: 'Sintomatologia ansiosa grave (Escore 15-21).',
        recommendations: [
          'Intervenção terapêutica intensiva para manejo de ansiedade aguda e ataques de pânico.',
          'Encaminhamento para avaliação médica/psiquiátrica especializada.',
          'Elaboração de estratégias imediatas de ancoragem e autorregulação emocional.'
        ]
      };
    }
  }

  /**
   * Submete e pontua uma avaliação psicométrica (RFC-001 §3.4)
   */
  static submitAssessment(
    dto: SubmitPsychometricAssessmentDTO,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): PsychometricAssessmentResultResponse {
    const patient = db.patients.get(dto.patientId);
    if (!patient) {
      throw new Error(`Paciente ${dto.patientId} não encontrado.`);
    }

    const scaleDef = this.getScaleDefinition(dto.scaleType);
    let totalScore = 0;
    let criticalAlert = false;

    const answers: PsychometricAnswer[] = [];

    for (const q of scaleDef.questions) {
      const found = dto.answers.find(a => a.questionIndex === q.index);
      const score = found ? Math.min(3, Math.max(0, found.score)) : 0;
      totalScore += score;

      // Item 9 do PHQ-9: Alerta de risco para ideação / autolesão
      if (dto.scaleType === PsychometricScaleType.PHQ9 && q.index === 9 && score > 0) {
        criticalAlert = true;
      }

      answers.push({
        questionIndex: q.index,
        questionText: q.text,
        score,
        optionText: this.SCALE_OPTIONS[score] || 'Não respondido'
      });
    }

    const evaluation = dto.scaleType === PsychometricScaleType.PHQ9
      ? this.evaluatePhq9(totalScore)
      : this.evaluateGad7(totalScore);

    // Se o item 9 acusar ideação, reforça a recomendação no início
    if (criticalAlert) {
      evaluation.recommendations.unshift(
        '⚠️ ATENÇÃO CLÍNICA: Item 9 positivo para pensamentos de morte/autolesão. Proceda à avaliação detalhada de intencionalidade suicida e plano de segurança conforme Código de Ética Profissional do Psicólogo.'
      );
    }

    const id = `psych-${randomUUID()}`;
    const now = new Date();

    // Selo probatório criptográfico WORM
    const auditWormId = createHash('sha256')
      .update(`${id}:${dto.patientId}:${dto.scaleType}:${totalScore}:${now.toISOString()}`)
      .digest('hex');

    const assessment: PsychometricAssessment = {
      id,
      patientId: dto.patientId,
      therapistId: patient.therapistId || context.actorId,
      appointmentId: dto.appointmentId,
      scaleType: dto.scaleType,
      totalScore,
      severityLevel: evaluation.severity,
      clinicalInterpretation: evaluation.interpretation,
      answers,
      criticalAlert,
      conductRecommendations: evaluation.recommendations,
      auditWormId,
      createdAt: now
    };

    // Busca escore anterior da mesma escala para calcular tendência longitudinal
    const previousAssessments = this.getPatientAssessments(dto.patientId, dto.scaleType);
    const lastAssessment = previousAssessments[0]; // mais recente antes de salvar a nova

    let trend: 'IMPROVED' | 'STABLE' | 'WORSENED' | 'BASELINE' = 'BASELINE';
    let previousScore: number | undefined;
    let scoreDelta: number | undefined;

    if (lastAssessment) {
      previousScore = lastAssessment.totalScore;
      scoreDelta = totalScore - previousScore;
      if (scoreDelta < -1) {
        trend = 'IMPROVED'; // Queda nos sintomas
      } else if (scoreDelta > 1) {
        trend = 'WORSENED'; // Aumento nos sintomas
      } else {
        trend = 'STABLE';
      }
    }

    db.psychometricAssessments.set(id, assessment);

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.PSYCHOMETRIC_ASSESSMENT,
      resourceId: id,
      action: AuditAction.PSYCHOMETRIC_ASSESSMENT_SUBMITTED,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return {
      success: true,
      assessment,
      patientHistory: {
        previousScore,
        scoreDelta,
        trend
      }
    };
  }

  /**
   * Obtém histórico de avaliações do paciente ordenadas cronologicamente
   */
  static getPatientAssessments(patientId: string, scaleType?: PsychometricScaleType): PsychometricAssessment[] {
    const list: PsychometricAssessment[] = [];
    for (const a of db.psychometricAssessments.values()) {
      if (a.patientId === patientId) {
        if (!scaleType || a.scaleType === scaleType) {
          list.push(a);
        }
      }
    }

    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}
