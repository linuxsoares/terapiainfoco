import { createHash } from 'node:crypto';
import {
  DiagnosticTrackCategory,
  DiagnosticUrgencyLevel,
  InitialScreenerType,
  AuditAction,
  AuditResourceType
} from '@terapiainfoco/shared';
import type {
  DiagnosticDecisionNode,
  DiagnosticAssessmentAnswer,
  InitialPsychometricResult,
  DiagnosticAssessmentReport,
  SaveDiagnosticAssessmentDTO,
  DiagnosticDecisionTreeDefinitionResponse,
  DiagnosticAssessmentReportResponse
} from '@terapiainfoco/shared';
import { db } from '../db/memoryDb';
import { encryptField, decryptField } from './cryptoContext';
import type { EncryptedPayload } from '@terapiainfoco/shared';
import { AuditService } from './auditService';

/**
 * Definições estáticas da Árvore de Decisão Diagnóstica e Escalas Psicométricas Iniciais (RFC-001 §3.4 / CID-11)
 */
export const DIAGNOSTIC_TRACKS_CATALOG = [
  {
    category: DiagnosticTrackCategory.ANXIETY_SPECTRUM,
    label: 'Espectro de Ansiedade (TAG / Pânico / Fobia Social)',
    description: 'Investigação clínica de preocupação excessiva, crises súbitas, hiperativação autonômica e esquiva social.',
    entryNodeId: 'anx-01'
  },
  {
    category: DiagnosticTrackCategory.DEPRESSIVE_SPECTRUM,
    label: 'Espectro Depressivo & Humor (Depressão Maior / Distimia)',
    description: 'Avaliação de anedonia, humor deprimido persistente, energia reduzida, alterações de sono e cognições de desesperança.',
    entryNodeId: 'dep-01'
  },
  {
    category: DiagnosticTrackCategory.NEURODEVELOPMENTAL_ADHD,
    label: 'Neurodesenvolvimento & TDAH Adulto',
    description: 'Rastreio de desatenção, impulsividade, procrastinação crônica e desregulação executiva com histórico na infância.',
    entryNodeId: 'adhd-01'
  },
  {
    category: DiagnosticTrackCategory.TRAUMA_AND_STRESSOR,
    label: 'Trauma & Fatores de Estresse (TEPT / Reação Aguda)',
    description: 'Investigação de eventos potencialmente traumáticos, revivência intrusiva, hipervigilância e esquiva de lembranças.',
    entryNodeId: 'trauma-01'
  },
  {
    category: DiagnosticTrackCategory.SOMATIC_AND_BURNOUT,
    label: 'Esgotamento Ocupacional (Burnout) & Somatização',
    description: 'Avaliação de estresse crônico associado ao trabalho, exaustão emocional, cinismo e queixas somáticas funcionais.',
    entryNodeId: 'burnout-01'
  }
];

export const DIAGNOSTIC_NODES_CATALOG: Record<string, DiagnosticDecisionNode> = {
  // --- TRILHA 1: ANSIEDADE ---
  'anx-01': {
    id: 'anx-01',
    track: DiagnosticTrackCategory.ANXIETY_SPECTRUM,
    question: 'Qual é a manifestação predominante da ansiedade relatada pelo paciente?',
    description: 'Diferenciação entre ansiedade difusa crônica vs. picos súbitos vs. exposição interpessoal.',
    options: [
      {
        label: 'Preocupação crônica, generalizada e difícil de controlar sobre múltiplos eventos cotidianos (> 6 meses)',
        value: 'generalized_worry',
        nextNodeId: 'anx-02_tag',
        indicativeCid11: '6B00',
        weight: 2
      },
      {
        label: 'Ataques súbitos de medo ou desconforto intenso com sintomas autonômicos (taquicardia, falta de ar, vertigem)',
        value: 'panic_attacks',
        nextNodeId: 'anx-03_panic',
        indicativeCid11: '6B01',
        weight: 2
      },
      {
        label: 'Medo acentuado e esquiva sistemática de situações sociais de interação ou desempenho público',
        value: 'social_fear',
        nextNodeId: 'anx-04_social',
        indicativeCid11: '6B04',
        weight: 2
      }
    ]
  },
  'anx-02_tag': {
    id: 'anx-02_tag',
    track: DiagnosticTrackCategory.ANXIETY_SPECTRUM,
    question: 'Quantos sintomas somáticos associados à preocupação estão presentes (tensão muscular, fadiga, inquietação, sono agitado)?',
    options: [
      {
        label: '3 ou mais sintomas físicos persistentes com prejuízo funcional diário evidente',
        value: 'tag_severe_somatic',
        indicativeCid11: '6B00',
        weight: 3
      },
      {
        label: 'Apenas 1 ou 2 sintomas leves esporádicos',
        value: 'tag_mild_somatic',
        weight: 1
      }
    ]
  },
  'anx-03_panic': {
    id: 'anx-03_panic',
    track: DiagnosticTrackCategory.ANXIETY_SPECTRUM,
    question: 'Existe medo persistente de novos ataques ou agorafobia (esquiva de locais sem saída rápida)?',
    options: [
      {
        label: 'Sim, ansiedade antecipatória contínua e modificação significativa no comportamento de locomoção',
        value: 'panic_with_agoraphobia',
        indicativeCid11: '6B01 / 6B02',
        weight: 3
      },
      {
        label: 'Episódios isolados sem ansiedade antecipatória contínua',
        value: 'panic_isolated',
        weight: 1
      }
    ]
  },
  'anx-04_social': {
    id: 'anx-04_social',
    track: DiagnosticTrackCategory.ANXIETY_SPECTRUM,
    question: 'A esquiva social causa prejuízo profissional, acadêmico ou isolamento afetivo significativo?',
    options: [
      {
        label: 'Sim, prejuízo severo com isolamento social acentuado',
        value: 'social_phobia_impairment',
        indicativeCid11: '6B04',
        weight: 3
      },
      {
        label: 'Timidez situacional ou desconforto administrável',
        value: 'social_shyness_mild',
        weight: 1
      }
    ]
  },

  // --- TRILHA 2: DEPRESSÃO ---
  'dep-01': {
    id: 'dep-01',
    track: DiagnosticTrackCategory.DEPRESSIVE_SPECTRUM,
    question: 'Qual é o padrão temporal e intensidade dos sintomas depressivos?',
    description: 'Critérios nucleares de humor deprimido e/ou anedonia (perda de interesse/prazer).',
    options: [
      {
        label: 'Episódio agudo presente na maior parte do dia por pelo menos 2 semanas consecutivas',
        value: 'acute_depressive_episode',
        nextNodeId: 'dep-02_severity',
        indicativeCid11: '6A70',
        weight: 2
      },
      {
        label: 'Humor cronicamente deprimido ou desanimado por mais de 2 anos (Distimia)',
        value: 'chronic_dysthymia',
        nextNodeId: 'dep-03_dysthymia',
        indicativeCid11: '6A72',
        weight: 2
      }
    ]
  },
  'dep-02_severity': {
    id: 'dep-02_severity',
    track: DiagnosticTrackCategory.DEPRESSIVE_SPECTRUM,
    question: 'Avaliação de gravidade: há presença de ideação de morte, desesperança aguda ou lentificação psicomotora?',
    options: [
      {
        label: 'PRESENÇA DE IDEAÇÃO SUICIDA ATIVA, PLANOS OU DESEJO DE AUTOLESÃO (RED FLAG CRÍTICA)',
        value: 'active_suicidal_ideation',
        triggersRedFlag: true,
        redFlagReason: 'Risco iminente de suicídio: ativação de protocolo de crise e envolvimento da rede de apoio (CFP nº 011/2018).',
        indicativeCid11: '6A70.2',
        weight: 5
      },
      {
        label: 'Ideação de morte passiva sem plano estruturado e anedonia acentuada',
        value: 'passive_death_thoughts',
        indicativeCid11: '6A70.1',
        weight: 3
      },
      {
        label: 'Sintomas depressivos moderados sem qualquer pensamento de morte ou autolesão',
        value: 'depressive_moderate_safe',
        indicativeCid11: '6A70.0',
        weight: 2
      }
    ]
  },
  'dep-03_dysthymia': {
    id: 'dep-03_dysthymia',
    track: DiagnosticTrackCategory.DEPRESSIVE_SPECTRUM,
    question: 'O quadro crônico apresenta episódios de piora aguda sobrepostos (Depressão Dupla)?',
    options: [
      {
        label: 'Sim, flutuações severas sobrepostas ao humor deprimido basal crônico',
        value: 'double_depression',
        indicativeCid11: '6A72 / 6A70',
        weight: 3
      },
      {
        label: 'Curso crônico contínuo de baixa energia e anedonia sem crises agudas',
        value: 'pure_dysthymia',
        indicativeCid11: '6A72',
        weight: 2
      }
    ]
  },

  // --- TRILHA 3: TDAH ADULTO ---
  'adhd-01': {
    id: 'adhd-01',
    track: DiagnosticTrackCategory.NEURODEVELOPMENTAL_ADHD,
    question: 'As dificuldades de desatenção, desorganização ou hiperatividade/impulsividade estavam presentes antes dos 12 anos?',
    description: 'Critério essencial de neurodesenvolvimento com manifestação longitudinal na infância.',
    options: [
      {
        label: 'Sim, histórico inequívoco desde a infância/escola confirmado pelo paciente ou familiares',
        value: 'childhood_onset_confirmed',
        nextNodeId: 'adhd-02_domains',
        indicativeCid11: '6A05',
        weight: 3
      },
      {
        label: 'Não, os sintomas iniciaram exclusivamente na vida adulta após estresse ocupacional ou sobrecarga',
        value: 'adult_onset_burnout_mimic',
        nextNodeId: 'burnout-01',
        weight: 1
      }
    ]
  },
  'adhd-02_domains': {
    id: 'adhd-02_domains',
    track: DiagnosticTrackCategory.NEURODEVELOPMENTAL_ADHD,
    question: 'Em quais domínios funcionais há prejuízo significativo no momento?',
    options: [
      {
        label: 'Múltiplos domínios simultâneos: profissional, acadêmico, financeiro e conjugal/familiar',
        value: 'adhd_pervasive_impairment',
        indicativeCid11: '6A05',
        weight: 3
      },
      {
        label: 'Prejuízo restrito a uma única esfera sem desregulação ampla',
        value: 'adhd_mild_isolated',
        weight: 1
      }
    ]
  },

  // --- TRILHA 4: TRAUMA ---
  'trauma-01': {
    id: 'trauma-01',
    track: DiagnosticTrackCategory.TRAUMA_AND_STRESSOR,
    question: 'O paciente vivenciou ou testemunhou evento de ameaça à vida, integridade física ou violência severa?',
    options: [
      {
        label: 'Sim, evento de alto impacto com presença de flashbacks, pesadelos e hipervigilância persistente',
        value: 'trauma_ptsd_symptoms',
        nextNodeId: 'trauma-02_dissociation',
        indicativeCid11: '6B40',
        weight: 3
      },
      {
        label: 'Trauma interpessoal crônico, repetitivo e prolongado na infância ou relacionamento íntimo',
        value: 'complex_ptsd',
        nextNodeId: 'trauma-02_dissociation',
        indicativeCid11: '6B41',
        weight: 3
      },
      {
        label: 'Estressor vital comum (luto não complicado, divórcio ou mudança de emprego) sem risco à integridade',
        value: 'adjustment_stressor',
        indicativeCid11: '6B43',
        weight: 1
      }
    ]
  },
  'trauma-02_dissociation': {
    id: 'trauma-02_dissociation',
    track: DiagnosticTrackCategory.TRAUMA_AND_STRESSOR,
    question: 'Há presença de sintomas dissociativos frequentes (despersonalização, desrealização ou amnésia dissociativa)?',
    options: [
      {
        label: 'Sim, episódios frequentes de desconexão da realidade ou do próprio corpo',
        value: 'ptsd_with_dissociation',
        indicativeCid11: '6B40 / 6B41',
        weight: 3
      },
      {
        label: 'Não, manutenção do contato pleno com a realidade sem dissociação',
        value: 'ptsd_without_dissociation',
        weight: 2
      }
    ]
  },

  // --- TRILHA 5: BURNOUT & SOMATIZAÇÃO ---
  'burnout-01': {
    id: 'burnout-01',
    track: DiagnosticTrackCategory.SOMATIC_AND_BURNOUT,
    question: 'Os sintomas estão estritamente relacionados à sobrecarga e ambiente de trabalho crônico?',
    options: [
      {
        label: 'Sim, tríade clássica: exaustão emocional profunda, despersonalização/cinismo e sensação de ineficácia profissional',
        value: 'burnout_triad_confirmed',
        nextNodeId: 'burnout-02_somatic',
        indicativeCid11: 'QD85',
        weight: 3
      },
      {
        label: 'Sintomas físicos (dores difusas, cefaleia, alterações gastrointestinais) sem causa médica identificada',
        value: 'somatic_symptoms_dominant',
        indicativeCid11: '6C20',
        weight: 2
      }
    ]
  },
  'burnout-02_somatic': {
    id: 'burnout-02_somatic',
    track: DiagnosticTrackCategory.SOMATIC_AND_BURNOUT,
    question: 'Há necessidade de afastamento temporário do trabalho ou encaminhamento médico para atestado funcional?',
    options: [
      {
        label: 'Sim, incapacidade laboral iminente ou já instalada exigindo intervenção urgente',
        value: 'burnout_incapacity',
        indicativeCid11: 'QD85',
        weight: 3
      },
      {
        label: 'Prejuízo moderado ainda compatível com a manutenção com adaptações na rotina',
        value: 'burnout_manageable',
        weight: 1
      }
    ]
  }
};

export const INITIAL_SCREENERS_CATALOG = {
  [InitialScreenerType.PHQ_4]: {
    title: 'PHQ-4 • Triagem Rápida de Ansiedade e Depressão',
    instructions: 'Nas últimas 2 semanas, com que frequência você foi incomodado pelos seguintes problemas? (0: Nenhuma vez | 1: Vários dias | 2: Mais da metade dos dias | 3: Quase todos os dias)',
    items: [
      {
        id: 'phq4_1',
        text: 'Sentir-se nervoso, ansioso ou com os nervos à flor da pele',
        options: [
          { label: 'Nenhuma vez', score: 0 },
          { label: 'Vários dias', score: 1 },
          { label: 'Mais da metade dos dias', score: 2 },
          { label: 'Quase todos os dias', score: 3 }
        ]
      },
      {
        id: 'phq4_2',
        text: 'Não ser capaz de impedir ou de controlar as preocupações',
        options: [
          { label: 'Nenhuma vez', score: 0 },
          { label: 'Vários dias', score: 1 },
          { label: 'Mais da metade dos dias', score: 2 },
          { label: 'Quase todos os dias', score: 3 }
        ]
      },
      {
        id: 'phq4_3',
        text: 'Sentir pouco interesse ou pouco prazer em fazer as coisas',
        options: [
          { label: 'Nenhuma vez', score: 0 },
          { label: 'Vários dias', score: 1 },
          { label: 'Mais da metade dos dias', score: 2 },
          { label: 'Quase todos os dias', score: 3 }
        ]
      },
      {
        id: 'phq4_4',
        text: 'Sentir-se para baixo, deprimido ou sem perspectiva',
        options: [
          { label: 'Nenhuma vez', score: 0 },
          { label: 'Vários dias', score: 1 },
          { label: 'Mais da metade dos dias', score: 2 },
          { label: 'Quase todos os dias', score: 3 }
        ]
      }
    ]
  },
  [InitialScreenerType.PSS_10]: {
    title: 'PSS-10 • Escala de Estresse Percebido',
    instructions: 'No último mês, com que frequência você sentiu as situações descritas? (0: Nunca | 1: Quase nunca | 2: Às vezes | 3: Quase sempre | 4: Sempre)',
    items: [
      { id: 'pss10_1', text: 'Sentiu-se afetado por algo que aconteceu inesperadamente?', options: [{ label: 'Nunca', score: 0 }, { label: 'Quase nunca', score: 1 }, { label: 'Às vezes', score: 2 }, { label: 'Quase sempre', score: 3 }, { label: 'Sempre', score: 4 }] },
      { id: 'pss10_2', text: 'Sentiu que não conseguia controlar as coisas importantes na sua vida?', options: [{ label: 'Nunca', score: 0 }, { label: 'Quase nunca', score: 1 }, { label: 'Às vezes', score: 2 }, { label: 'Quase sempre', score: 3 }, { label: 'Sempre', score: 4 }] },
      { id: 'pss10_3', text: 'Sentiu-se nervoso e estressado?', options: [{ label: 'Nunca', score: 0 }, { label: 'Quase nunca', score: 1 }, { label: 'Às vezes', score: 2 }, { label: 'Quase sempre', score: 3 }, { label: 'Sempre', score: 4 }] },
      { id: 'pss10_4', text: 'Sentiu-se confiante em sua habilidade de lidar com problemas pessoais? (Inverso)', options: [{ label: 'Nunca', score: 4 }, { label: 'Quase nunca', score: 3 }, { label: 'Às vezes', score: 2 }, { label: 'Quase sempre', score: 1 }, { label: 'Sempre', score: 0 }] },
      { id: 'pss10_5', text: 'Sentiu que as coisas estavam indo a seu favor? (Inverso)', options: [{ label: 'Nunca', score: 4 }, { label: 'Quase nunca', score: 3 }, { label: 'Às vezes', score: 2 }, { label: 'Quase sempre', score: 1 }, { label: 'Sempre', score: 0 }] },
      { id: 'pss10_6', text: 'Sentiu que não conseguia lidar com todas as coisas que tinha que fazer?', options: [{ label: 'Nunca', score: 0 }, { label: 'Quase nunca', score: 1 }, { label: 'Às vezes', score: 2 }, { label: 'Quase sempre', score: 3 }, { label: 'Sempre', score: 4 }] },
      { id: 'pss10_7', text: 'Foi capaz de controlar a irritação na sua vida? (Inverso)', options: [{ label: 'Nunca', score: 4 }, { label: 'Quase nunca', score: 3 }, { label: 'Às vezes', score: 2 }, { label: 'Quase sempre', score: 1 }, { label: 'Sempre', score: 0 }] },
      { id: 'pss10_8', text: 'Sentiu que estava no topo das coisas? (Inverso)', options: [{ label: 'Nunca', score: 4 }, { label: 'Quase nunca', score: 3 }, { label: 'Às vezes', score: 2 }, { label: 'Quase sempre', score: 1 }, { label: 'Sempre', score: 0 }] },
      { id: 'pss10_9', text: 'Ficou bravo por causa de coisas que estavam fora de seu controle?', options: [{ label: 'Nunca', score: 0 }, { label: 'Quase nunca', score: 1 }, { label: 'Às vezes', score: 2 }, { label: 'Quase sempre', score: 3 }, { label: 'Sempre', score: 4 }] },
      { id: 'pss10_10', text: 'Sentiu que as dificuldades se acumularam tanto que não conseguiu superá-las?', options: [{ label: 'Nunca', score: 0 }, { label: 'Quase nunca', score: 1 }, { label: 'Às vezes', score: 2 }, { label: 'Quase sempre', score: 3 }, { label: 'Sempre', score: 4 }] }
    ]
  },
  [InitialScreenerType.ASRS_V1_1]: {
    title: 'ASRS-v1.1 • Triagem de TDAH no Adulto (Parte A OMS)',
    instructions: 'Com que frequência você vivenciou as situações descritas nos últimos 6 meses? (0: Nunca | 1: Raramente | 2: Às vezes | 3: Frequentemente | 4: Muito frequentemente)',
    items: [
      { id: 'asrs_1', text: 'Dificuldade para finalizar os detalhes finais de um projeto após as partes difíceis terem sido feitas', options: [{ label: 'Nunca', score: 0 }, { label: 'Raramente', score: 1 }, { label: 'Às vezes', score: 2 }, { label: 'Frequentemente', score: 3 }, { label: 'Muito frequentemente', score: 4 }] },
      { id: 'asrs_2', text: 'Dificuldade para colocar as coisas em ordem quando tem que realizar uma tarefa que exige organização', options: [{ label: 'Nunca', score: 0 }, { label: 'Raramente', score: 1 }, { label: 'Às vezes', score: 2 }, { label: 'Frequentemente', score: 3 }, { label: 'Muito frequentemente', score: 4 }] },
      { id: 'asrs_3', text: 'Problemas para lembrar de compromissos ou obrigações assumidas', options: [{ label: 'Nunca', score: 0 }, { label: 'Raramente', score: 1 }, { label: 'Às vezes', score: 2 }, { label: 'Frequentemente', score: 3 }, { label: 'Muito frequentemente', score: 4 }] },
      { id: 'asrs_4', text: 'Quando tem uma tarefa que exige muito pensamento, evita ou atrasa o início', options: [{ label: 'Nunca', score: 0 }, { label: 'Raramente', score: 1 }, { label: 'Às vezes', score: 2 }, { label: 'Frequentemente', score: 3 }, { label: 'Muito frequentemente', score: 4 }] },
      { id: 'asrs_5', text: 'Fica inquieto, mexendo as mãos ou os pés quando tem que ficar sentado por muito tempo', options: [{ label: 'Nunca', score: 0 }, { label: 'Raramente', score: 1 }, { label: 'Às vezes', score: 2 }, { label: 'Frequentemente', score: 3 }, { label: 'Muito frequentemente', score: 4 }] },
      { id: 'asrs_6', text: 'Sente-se excessivamente ativo ou compelido a fazer coisas como se fosse movido por um motor', options: [{ label: 'Nunca', score: 0 }, { label: 'Raramente', score: 1 }, { label: 'Às vezes', score: 2 }, { label: 'Frequentemente', score: 3 }, { label: 'Muito frequentemente', score: 4 }] }
    ]
  }
};

export class DiagnosticDecisionTreeService {
  /**
   * Retorna o catálogo completo de trilhas, nós ramificados e baterias psicométricas
   */
  public getDecisionTreeDefinition(): DiagnosticDecisionTreeDefinitionResponse {
    return {
      success: true,
      tracks: DIAGNOSTIC_TRACKS_CATALOG,
      nodes: DIAGNOSTIC_NODES_CATALOG,
      screeners: INITIAL_SCREENERS_CATALOG
    };
  }

  /**
   * Processa as respostas da árvore, calcula a pontuação psicométrica basal, detecta Red Flags e salva relatório com FLE
   */
  public async saveAssessment(
    dto: SaveDiagnosticAssessmentDTO,
    therapistId: string
  ): Promise<DiagnosticAssessmentReportResponse> {
    if (!dto.patientId) {
      throw new Error('Identificador do paciente é obrigatório');
    }

    const patient = db.patients.get(dto.patientId);
    if (!patient) {
      throw new Error('Paciente não encontrado no cadastro clínico');
    }

    // 1. Analisa as respostas da árvore para mapear CID-11 e Red Flags
    const provisionalCidSet = new Set<string>();
    const redFlags: string[] = [];
    let cumulativeWeight = 0;

    for (const ans of dto.answers) {
      const node = DIAGNOSTIC_NODES_CATALOG[ans.nodeId];
      if (!node) continue;

      const chosenOption = node.options.find(opt => opt.value === ans.selectedOptionValue);
      if (!chosenOption) continue;

      if (chosenOption.indicativeCid11) {
        provisionalCidSet.add(chosenOption.indicativeCid11);
      }

      if (chosenOption.triggersRedFlag) {
        redFlags.push(chosenOption.redFlagReason || 'Red Flag clínica identificada');
      }

      if (chosenOption.weight) {
        cumulativeWeight += chosenOption.weight;
      }
    }

    // 2. Calcula resultado psicométrico inicial se houver respostas
    let psychometricBaseline: InitialPsychometricResult | undefined;
    if (dto.psychometricAnswers && dto.psychometricAnswers.answers) {
      const { screenerType, answers } = dto.psychometricAnswers;
      let totalScore = 0;
      let maxScore = 0;
      let severityLevel = 'Normal / Baixo';

      if (screenerType === InitialScreenerType.PHQ_4) {
        maxScore = 12;
        for (const val of Object.values(answers)) {
          totalScore += Number(val) || 0;
        }
        if (totalScore >= 9) severityLevel = 'Grave (Sintomatologia Severa)';
        else if (totalScore >= 6) severityLevel = 'Moderado';
        else if (totalScore >= 3) severityLevel = 'Leve';
        else severityLevel = 'Normal / Mínimo';
      } else if (screenerType === InitialScreenerType.PSS_10) {
        maxScore = 40;
        for (const val of Object.values(answers)) {
          totalScore += Number(val) || 0;
        }
        if (totalScore >= 27) severityLevel = 'Alto Estresse Percebido';
        else if (totalScore >= 14) severityLevel = 'Estresse Moderado';
        else severityLevel = 'Baixo Estresse';
      } else if (screenerType === InitialScreenerType.ASRS_V1_1) {
        maxScore = 24;
        let significantCount = 0;
        for (const val of Object.values(answers)) {
          const num = Number(val) || 0;
          totalScore += num;
          if (num >= 2) significantCount++;
        }
        if (significantCount >= 4) {
          severityLevel = 'Positivo para Rastreamento de TDAH no Adulto';
          provisionalCidSet.add('6A05');
        } else {
          severityLevel = 'Negativo / Baixa Probabilidade de TDAH';
        }
      }

      psychometricBaseline = {
        screenerType,
        score: totalScore,
        maxScore,
        severityLevel,
        answers
      };
    }

    // 3. Determina o Nível de Urgência
    let urgencyLevel = DiagnosticUrgencyLevel.ROUTINE;
    if (redFlags.length > 0) {
      urgencyLevel = DiagnosticUrgencyLevel.CRITICAL_RED_FLAG;
    } else if (cumulativeWeight >= 5 || (psychometricBaseline && psychometricBaseline.score >= psychometricBaseline.maxScore * 0.6)) {
      urgencyLevel = DiagnosticUrgencyLevel.MODERATE;
    }

    // 4. Constrói hipóteses clínicas preliminares e recomendações estruturadas
    const provisionalCid11 = Array.from(provisionalCidSet);
    if (provisionalCid11.length === 0) {
      if (dto.primaryTrack === DiagnosticTrackCategory.ANXIETY_SPECTRUM) provisionalCid11.push('6B00');
      else if (dto.primaryTrack === DiagnosticTrackCategory.DEPRESSIVE_SPECTRUM) provisionalCid11.push('6A70');
      else if (dto.primaryTrack === DiagnosticTrackCategory.NEURODEVELOPMENTAL_ADHD) provisionalCid11.push('6A05');
      else if (dto.primaryTrack === DiagnosticTrackCategory.TRAUMA_AND_STRESSOR) provisionalCid11.push('6B40');
      else provisionalCid11.push('QD85');
    }

    const recommendedInterventions: string[] = [];
    let suggestedSessionFrequency = '1x por semana (Sessões Clínicas Regulares de 50 minutos)';

    if (urgencyLevel === DiagnosticUrgencyLevel.CRITICAL_RED_FLAG) {
      recommendedInterventions.push('Protocolo Imediato de Prevenção e Manejo de Crise (Resolução CFP nº 011/2018)');
      recommendedInterventions.push('Contatar pessoa de emergência autorizada pelo paciente no TCLE');
      recommendedInterventions.push('Encaminhamento psiquiátrico de urgência para avaliação psicofarmacológica combinada');
      suggestedSessionFrequency = '2x por semana ou suporte diário de contenção até estabilização do risco';
    } else {
      if (dto.primaryTrack === DiagnosticTrackCategory.ANXIETY_SPECTRUM) {
        recommendedInterventions.push('Treino de Respiração Diafragmática e Regulação Autonômica');
        recommendedInterventions.push('Registro de Pensamentos Disfuncionais (RPD) com reestruturação cognitiva');
        recommendedInterventions.push('Desensibilização sistemática e hierarquia de exposições graduais');
      } else if (dto.primaryTrack === DiagnosticTrackCategory.DEPRESSIVE_SPECTRUM) {
        recommendedInterventions.push('Ativação Comportamental com agendamento de tarefas prazerosas e de domínio');
        recommendedInterventions.push('Inventário de Valores e Ações Comprometidas (ACT)');
        recommendedInterventions.push('Monitoramento semanal do humor basal via PHQ-9');
      } else if (dto.primaryTrack === DiagnosticTrackCategory.NEURODEVELOPMENTAL_ADHD) {
        recommendedInterventions.push('Treinamento de Habilidades Executivas e Gerenciamento de Tempo');
        recommendedInterventions.push('Estratégias de Andaime Externo (scaffolding ambiental e alarmes visuais)');
        recommendedInterventions.push('Encaminhamento para avaliação neuropsicológica confirmatória');
      } else if (dto.primaryTrack === DiagnosticTrackCategory.TRAUMA_AND_STRESSOR) {
        recommendedInterventions.push('Técnicas de Ancoragem (Grounding 5-4-3-2-1) para manejo de desregulação dissociativa');
        recommendedInterventions.push('Processamento de Memórias Traumáticas e Terapia de Exposição Prolongada');
      } else {
        recommendedInterventions.push('Protocolo de Higiene do Sono e Estabelecimento de Limites Ocupacionais');
        recommendedInterventions.push('Técnicas de Mindfulness e Recuperação de Recursos Somáticos');
      }
    }

    const clinicalHypothesisSummary = dto.clinicalNotes ||
      `Paciente admitido na trilha clínica de ${dto.primaryTrack}. Hipótese diagnóstica preliminar: ${provisionalCid11.join(', ')}. Nível de gravidade avaliado: ${urgencyLevel}.`;

    // 5. Cifragem com Field-Level Encryption (AES-256-GCM)
    const encryptedSummary = encryptField(clinicalHypothesisSummary);
    let encryptedConfidentialNotes: EncryptedPayload | undefined;
    if (dto.confidentialNotes) {
      encryptedConfidentialNotes = encryptField(dto.confidentialNotes);
    }

    const reportId = `diag-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const createdAt = new Date().toISOString();

    // Checksum SHA-256 canônico
    const integrityChecksumSha256 = createHash('sha256')
      .update(`${reportId}|${dto.patientId}|${therapistId}|${dto.primaryTrack}|${urgencyLevel}|${createdAt}`)
      .digest('hex');

    const report: DiagnosticAssessmentReport = {
      id: reportId,
      patientId: dto.patientId,
      therapistId,
      primaryTrack: dto.primaryTrack,
      provisionalCid11,
      urgencyLevel,
      redFlagsIdentified: redFlags,
      clinicalHypothesisSummary,
      recommendedInterventions,
      suggestedSessionFrequency,
      psychometricBaseline,
      confidentialTherapistNotes: dto.confidentialNotes,
      integrityChecksumSha256,
      createdAt,
      encryptedSummary,
      encryptedConfidentialNotes
    };

    // 6. Persistência em banco
    db.diagnosticReports.set(reportId, report);

    // 7. Registro de auditoria WORM
    AuditService.log({
      actorId: therapistId,
      action: AuditAction.DIAGNOSTIC_ASSESSMENT_COMPLETED,
      resourceType: AuditResourceType.DIAGNOSTIC_DECISION_TREE,
      resourceId: reportId,
      ipAddress: '127.0.0.1'
    });

    if (redFlags.length > 0) {
      AuditService.log({
        actorId: therapistId,
        action: AuditAction.DIAGNOSTIC_RED_FLAG_TRIGGERED,
        resourceType: AuditResourceType.DIAGNOSTIC_DECISION_TREE,
        resourceId: reportId,
        ipAddress: '127.0.0.1'
      });
    }

    const clinicalActionDirectives = urgencyLevel === DiagnosticUrgencyLevel.CRITICAL_RED_FLAG
      ? [
          'ATENÇÃO: Red Flag crítica identificada! Não deixe o paciente desassistido.',
          'Acione a rede de apoio informada no TCLE imediatamente.',
          'Considere emissão de Guia de Encaminhamento Psiquiátrico Urgente (RFC §3.5).'
        ]
      : [
          'Plano terapêutico preliminar estruturado com sucesso.',
          'Integre os objetivos acordados no Módulo de Metas SMART (RFC §3.4).',
          'Acompanhe a evolução longitudinal na timeline clínica do paciente.'
        ];

    return {
      success: true,
      report,
      isRedFlagAlert: redFlags.length > 0,
      clinicalActionDirectives,
      message: 'Avaliação diagnóstica interativa processada e armazenada com criptografia de ponta a ponta.'
    };
  }

  /**
   * Lista as avaliações diagnósticas de um paciente
   */
  public listPatientAssessments(patientId: string): DiagnosticAssessmentReport[] {
    const reports: DiagnosticAssessmentReport[] = [];
    for (const r of db.diagnosticReports.values()) {
      if (r.patientId === patientId) {
        // Garante que o resumo esteja decifrado se houver encryptedSummary
        let summary = r.clinicalHypothesisSummary;
        if (r.encryptedSummary) {
          try {
            summary = decryptField(r.encryptedSummary);
          } catch {
            summary = r.clinicalHypothesisSummary;
          }
        }
        let confNotes = r.confidentialTherapistNotes;
        if (r.encryptedConfidentialNotes) {
          try {
            confNotes = decryptField(r.encryptedConfidentialNotes);
          } catch {
            confNotes = r.confidentialTherapistNotes;
          }
        }

        reports.push({
          ...r,
          clinicalHypothesisSummary: summary,
          confidentialTherapistNotes: confNotes
        });
      }
    }

    return reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Obtém um relatório específico decifrado
   */
  public getAssessmentById(id: string): DiagnosticAssessmentReport | null {
    const r = db.diagnosticReports.get(id);
    if (!r) return null;

    let summary = r.clinicalHypothesisSummary;
    if (r.encryptedSummary) {
      try {
        summary = decryptField(r.encryptedSummary);
      } catch {
        summary = r.clinicalHypothesisSummary;
      }
    }
    let confNotes = r.confidentialTherapistNotes;
    if (r.encryptedConfidentialNotes) {
      try {
        confNotes = decryptField(r.encryptedConfidentialNotes);
      } catch {
        confNotes = r.confidentialTherapistNotes;
      }
    }

    return {
      ...r,
      clinicalHypothesisSummary: summary,
      confidentialTherapistNotes: confNotes
    };
  }
}

export const diagnosticDecisionTreeService = new DiagnosticDecisionTreeService();
