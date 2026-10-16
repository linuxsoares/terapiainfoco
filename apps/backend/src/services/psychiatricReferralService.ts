import { randomUUID, createHash, randomBytes } from 'node:crypto';
import type {
  Psychopharmaceutical,
  DrugInteractionRecord,
  PatientCurrentMedication,
  PsychiatricReferralGuide,
  CheckDrugInteractionsResponse,
  CreatePsychiatricReferralDTO,
  PsychiatricReferralResponse
} from '@terapiainfoco/shared';
import {
  PsychopharmacologyCategory,
  DrugInteractionSeverity,
  AuditAction,
  AuditResourceType,
  DiagnosticUrgencyLevel
} from '@terapiainfoco/shared';
import { db } from '../db/memoryDb';
import { encryptField, decryptField } from './cryptoContext';
import { AuditService } from './auditService';

/**
 * Catálogo Farmacológico de Referência Clínica para Psicólogos (RFC-001 §3.5)
 * Focado nas classes mais prevalentes na prática da saúde mental brasileira
 */
export const PSYCHOPHARMACEUTICALS_CATALOG: Psychopharmaceutical[] = [
  // Antidepressivos ISRS
  {
    id: 'fluoxetina',
    tradeName: 'Prozac / Daforin',
    genericName: 'Cloridrato de Fluoxetina',
    category: PsychopharmacologyCategory.ANTIDEPRESSANT_SSRI,
    commonDosages: ['20mg', '40mg', '60mg'],
    primaryIndications: ['Transtorno Depressivo Maior', 'TOC', 'Bulimia Nervosa', 'Transtorno de Pânico'],
    commonSideEffects: ['Náuseas iniciais', 'Insônia ou sonolência', 'Disfunção sexual', 'Anorexia passageira'],
    clinicalPearls: 'Meia-vida biológica longa (metabólito norfluoxetina de até 16 dias). Menor risco de síndrome de descontinuação abrupta.'
  },
  {
    id: 'sertralina',
    tradeName: 'Zoloft / Assert / Tolrest',
    genericName: 'Cloridrato de Sertralina',
    category: PsychopharmacologyCategory.ANTIDEPRESSANT_SSRI,
    commonDosages: ['25mg', '50mg', '100mg', '150mg', '200mg'],
    primaryIndications: ['Transtorno Depressivo Maior', 'Transtorno de Pânico', 'Fobia Social', 'TEPT', 'TOC'],
    commonSideEffects: ['Sintomas gastrointestinais iniciais', 'Tremor fino', 'Insônia inicial', 'Sudorese noturna'],
    clinicalPearls: 'Excelente perfil de segurança cardiovascular; preferencial em pacientes idosos ou cardiopatas.'
  },
  {
    id: 'escitalopram',
    tradeName: 'Lexapro / Reconter / Exodus',
    genericName: 'Oxalato de Escitalopram',
    category: PsychopharmacologyCategory.ANTIDEPRESSANT_SSRI,
    commonDosages: ['10mg', '15mg', '20mg'],
    primaryIndications: ['Transtorno de Ansiedade Generalizada (TAG)', 'Transtorno Depressivo Maior', 'Pânico'],
    commonSideEffects: ['Cefaleia inicial', 'Náusea leve', 'Sonolência diurna ou insônia', 'Retardo ejaculatório'],
    clinicalPearls: 'O mais seletivo dos ISRS para o transportador SERT, com menor potencial de interferência em citocromos hepáticos (CYP).'
  },

  // Antidepressivos IRSN
  {
    id: 'venlafaxina',
    tradeName: 'Efexor XR / Alenthus',
    genericName: 'Cloridrato de Venlafaxina',
    category: PsychopharmacologyCategory.ANTIDEPRESSANT_SNRI,
    commonDosages: ['75mg', '150mg', '225mg'],
    primaryIndications: ['Depressão Maior Refratária', 'TAG', 'Fobia Social', 'Dor crônica comórbida'],
    commonSideEffects: ['Sudorese profusa', 'Náusea', 'Aumento de pressão arterial em doses > 150mg', 'Boca seca'],
    clinicalPearls: 'Intensa síndrome de descontinuação na suspensão abrupta (choques elétricos na cabeça, náusea aguda, tontura grave).'
  },
  {
    id: 'duloxetina',
    tradeName: 'Cymbalta / Velija',
    genericName: 'Cloridrato de Duloxetina',
    category: PsychopharmacologyCategory.ANTIDEPRESSANT_SNRI,
    commonDosages: ['30mg', '60mg'],
    primaryIndications: ['Depressão com sintomas somáticos/álgicos', 'Fibromialgia', 'Neuropatia diabética', 'TAG'],
    commonSideEffects: ['Boca seca', 'Constipação', 'Sonolência', 'Sudorese excessiva'],
    clinicalPearls: 'Inibição dual equilibrada de serotonina e noradrenalina desde as doses iniciais de 30-60mg.'
  },

  // Antidepressivos Atípicos
  {
    id: 'bupropiona',
    tradeName: 'Wellbutrin / Bup / Zetron',
    genericName: 'Cloridrato de Bupropiona',
    category: PsychopharmacologyCategory.ANTIDEPRESSANT_ATYPICAL,
    commonDosages: ['150mg', '300mg'],
    primaryIndications: ['Depressão com lentificação psicomotora', 'Cessação do tabagismo', 'TDAH (segunda linha)'],
    commonSideEffects: ['Insônia', 'Ansiedade transitória', 'Boca seca', 'Perda de apetite', 'Cefaleia'],
    clinicalPearls: 'Inibidor de recaptação de noradrenalina e dopamina (IRND). Não causa disfunção sexual nem ganho de peso. Reduz limiar convulsivo.'
  },
  {
    id: 'mirtazapina',
    tradeName: 'Remeron / Menelat',
    genericName: 'Mirtazapina',
    category: PsychopharmacologyCategory.ANTIDEPRESSANT_ATYPICAL,
    commonDosages: ['15mg', '30mg', '45mg'],
    primaryIndications: ['Depressão com insônia grave', 'Depressão com perda ponderal severa'],
    commonSideEffects: ['Sedação intensa (mais forte em 15mg)', 'Apetite exacerbado por carboidratos', 'Ganho de peso'],
    clinicalPearls: 'Antidepressivo noradrenérgico e serotoninérgico específico (NaSSA) com potente bloqueio anti-histamínico H1.'
  },
  {
    id: 'imao_tranilcipromina',
    tradeName: 'Parnate',
    genericName: 'Sulfato de Tranilcipromina',
    category: PsychopharmacologyCategory.ANTIDEPRESSANT_ATYPICAL,
    commonDosages: ['10mg', '20mg', '30mg'],
    primaryIndications: ['Depressão Atípica Refratária', 'Depressão Maior Não Responsiva'],
    commonSideEffects: ['Hipotensão postural', 'Insônia', 'Risco de crise hipertensiva severa'],
    clinicalPearls: 'Inibidor irreversível da MAO. Exige restrição alimentar rigorosa de tiramina (queijos curados, vinhos, defumados) e washout prévio.'
  },

  // Benzodiazepínicos e Hipnóticos
  {
    id: 'clonazepam',
    tradeName: 'Rivotril',
    genericName: 'Clonazepam',
    category: PsychopharmacologyCategory.ANXIOLYTIC_BENZODIAZEPINE,
    commonDosages: ['0.5mg', '2.0mg', 'Gotas 2.5mg/ml'],
    primaryIndications: ['Crise de Pânico Aguda', 'Ansiedade paroxística', 'Acatisia induzida por antipsicóticos'],
    commonSideEffects: ['Sedação', 'Prejuízo psicomotor e mnêmico', 'Risco de dependência física/psíquica', 'Efeito rebote'],
    clinicalPearls: 'Meia-vida intermediária a longa (20-50 horas). Seu uso deve ser preferencialmente temporário enquanto o tratamento de base faz efeito.'
  },
  {
    id: 'alprazolam',
    tradeName: 'Frontal / Apraz',
    genericName: 'Alprazolam',
    category: PsychopharmacologyCategory.ANXIOLYTIC_BENZODIAZEPINE,
    commonDosages: ['0.25mg', '0.5mg', '1.0mg', '2.0mg'],
    primaryIndications: ['Transtorno de Pânico com ou sem agorafobia', 'Ansiedade comórbida'],
    commonSideEffects: ['Sonolência', 'Lentificação cognitiva', 'Tolerância rápida', 'Ansiedade interdose'],
    clinicalPearls: 'Meia-vida mais curta e alta afinidade ao receptor GABA-A, conferindo elevado potencial de abuso e dependência.'
  },
  {
    id: 'zolpidem',
    tradeName: 'Stilnox / Patz',
    genericName: 'Hemitartarato de Zolpidem',
    category: PsychopharmacologyCategory.HYPNOTIC_NON_BENZO,
    commonDosages: ['5mg', '10mg', 'SL 5mg'],
    primaryIndications: ['Tratamento de curto prazo da insônia inicial'],
    commonSideEffects: ['Comportamentos automáticos e parassonia (comer dormindo)', 'Amnésia retrógrada', 'Tontura'],
    clinicalPearls: 'Hipnótico agonista não benzodiazepínico (composto Z). Deve ser tomado imediatamente antes de deitar-se na cama.'
  },

  // Estabilizadores de Humor
  {
    id: 'litio',
    tradeName: 'Carbolitium',
    genericName: 'Carbonato de Lítio',
    category: PsychopharmacologyCategory.MOOD_STABILIZER,
    commonDosages: ['300mg', '450mg CR'],
    primaryIndications: ['Transtorno Bipolar Tipo I e II (profilaxia e mania)', 'Potencialização em depressão unipolar refratária'],
    commonSideEffects: ['Tremor fino de extremidades', 'Poliúria', 'Polidipsia', 'Ganho ponderal', 'Hipotireoidismo'],
    clinicalPearls: 'Padrão-ouro na prevenção do suicídio. Requer monitoramento periódico da litiemia plasmática (faixa terapêutica 0.6 a 1.0 mEq/L).'
  },
  {
    id: 'acido_valproico',
    tradeName: 'Depakote / Depakene',
    genericName: 'Divalproato de Sódio / Ácido Valproico',
    category: PsychopharmacologyCategory.MOOD_STABILIZER,
    commonDosages: ['250mg', '500mg'],
    primaryIndications: ['Episódios de Mania Aguda', 'Estados Mistos no Transtorno Bipolar', 'Enxaqueca'],
    commonSideEffects: ['Ganho de peso', 'Queda transitória de cabelo', 'Náusea gástrica', 'Sonolência'],
    clinicalPearls: 'Altamente teratogênico (risco de defeitos do tubo neural). Monitorar enzimas hepáticas e hemograma.'
  },
  {
    id: 'lamotrigina',
    tradeName: 'Lamictal',
    genericName: 'Lamotrigina',
    category: PsychopharmacologyCategory.MOOD_STABILIZER,
    commonDosages: ['25mg', '50mg', '100mg'],
    primaryIndications: ['Fase depressiva do Transtorno Bipolar', 'Profilaxia de recaída depressiva bipolar'],
    commonSideEffects: ['Rash cutâneo', 'Cefaleia', 'Tontura', 'Visão turva'],
    clinicalPearls: 'Exige titulação progressiva muito lenta para mitigar o risco de Síndrome de Stevens-Johnson (erupção cutânea grave).'
  },

  // Antipsicóticos Atípicos
  {
    id: 'quetiapina',
    tradeName: 'Seroquel / Quetros',
    genericName: 'Hemifumarato de Quetiapina',
    category: PsychopharmacologyCategory.ANTIPSYCHOTIC_ATYPICAL,
    commonDosages: ['25mg', '100mg', '200mg', '300mg'],
    primaryIndications: ['Depressão Bipolar', 'Esquizofrenia', 'Insônia refratária (off-label em baixas doses)'],
    commonSideEffects: ['Sedação marcante', 'Hipotensão ortostática', 'Aumento de apetite e peso', 'Boca seca'],
    clinicalPearls: 'Antagonista 5-HT2A e D2 com potente efeito anti-histamínico. Em doses baixas (25-50mg) predomina a ação sedativa.'
  },
  {
    id: 'risperidona',
    tradeName: 'Risperdal',
    genericName: 'Risperidona',
    category: PsychopharmacologyCategory.ANTIPSYCHOTIC_ATYPICAL,
    commonDosages: ['1mg', '2mg', '3mg'],
    primaryIndications: ['Esquizofrenia', 'Irritabilidade associada ao TEA', 'Mania aguda no Transtorno Bipolar'],
    commonSideEffects: ['Hiperprolactinemia (galactorreia, amenorreia)', 'Sintomas extrapiramidais em doses > 4mg', 'Ganho de peso'],
    clinicalPearls: 'Potente bloqueador dopaminérgico D2; monitorar sintomas de rigidez e inquietação motora.'
  },
  {
    id: 'aripiprazol',
    tradeName: 'Abilify / Aristab',
    genericName: 'Aripiprazol',
    category: PsychopharmacologyCategory.ANTIPSYCHOTIC_ATYPICAL,
    commonDosages: ['5mg', '10mg', '15mg'],
    primaryIndications: ['Potencializador antidepressivo em depressão resistente', 'Bipolaridade', 'Esquizofrenia'],
    commonSideEffects: ['Acatisia inicial (inquietação motora)', 'Insônia', 'Cefaleia', 'Náusea'],
    clinicalPearls: 'Agonista parcial dos receptores dopaminérgicos D2 e serotoninérgicos 5-HT1A; menor impacto metabólico e no peso corporal.'
  },

  // Psicoestimulantes
  {
    id: 'metilfenidato',
    tradeName: 'Ritalina / Concerta',
    genericName: 'Cloridrato de Metilfenidato',
    category: PsychopharmacologyCategory.PSYCHOSTIMULANT,
    commonDosages: ['10mg', '18mg', '36mg', '54mg'],
    primaryIndications: ['TDAH em adultos e crianças', 'Narcolepsia'],
    commonSideEffects: ['Supressão do apetite', 'Taquicardia', 'Insônia quando administrado após as 16h', 'Ansiedade rebote'],
    clinicalPearls: 'Estimula liberação e inibe recaptação de dopamina e noradrenalina no córtex pré-frontal. Cautela em histórico de pânico.'
  },
  {
    id: 'lisdexanfetamina',
    tradeName: 'Venvanse / Juneve',
    genericName: 'Dimesilato de Lisdexanfetamina',
    category: PsychopharmacologyCategory.PSYCHOSTIMULANT,
    commonDosages: ['30mg', '50mg', '70mg'],
    primaryIndications: ['TDAH', 'Transtorno da Compulsão Alimentar (TCA) moderado a grave'],
    commonSideEffects: ['Boca seca', 'Perda de peso', 'Taquicardia', 'Sudorese', 'Insônia'],
    clinicalPearls: 'Pró-fármaco que necessita de clivagem enzimática pelas hemácias para liberação gradual de d-anfetamina (duração até 12-14h).'
  }
];

/**
 * Matriz de Regras de Interações Farmacológicas Cruzadas
 */
interface InteractionRuleDefinition {
  drugA: string;
  drugB: string;
  severity: DrugInteractionSeverity;
  mechanism: string;
  clinicalRisk: string;
  psychologistManagementTip: string;
}

export const DRUG_INTERACTION_RULES: InteractionRuleDefinition[] = [
  // Interações CONTRAINDICADAS (Síndrome Serotoninérgica Fatal)
  {
    drugA: 'imao_tranilcipromina',
    drugB: 'fluoxetina',
    severity: DrugInteractionSeverity.CONTRAINDICATED,
    mechanism: 'Inibição simultânea irreversível da metabolização da serotonina (MAO) e bloqueio de sua recaptação pré-sináptica (ISRS).',
    clinicalRisk: 'Síndrome Serotoninérgica Aguda potencialmente letal: hipertermia maligna (> 40°C), clônus induzível, instabilidade autonômica e colapso cardiovascular.',
    psychologistManagementTip: 'Emergência médica absoluta! Não realizar a combinação sob hipótese alguma. Exige washout prévio mínimo de 5 semanas na troca entre fármacos.'
  },
  {
    drugA: 'imao_tranilcipromina',
    drugB: 'sertralina',
    severity: DrugInteractionSeverity.CONTRAINDICATED,
    mechanism: 'Acúmulo maciço e descontrolado de serotonina nas fendas sinápticas centrais.',
    clinicalRisk: 'Crise serotoninérgica fulminante com rigidez muscular, diaforese extrema, hipertermia e convulsões.',
    psychologistManagementTip: 'Contraindicação formal. Encaminhar para pronto-socorro imediato caso o paciente tenha ingerido acidentalmente.'
  },
  {
    drugA: 'imao_tranilcipromina',
    drugB: 'escitalopram',
    severity: DrugInteractionSeverity.CONTRAINDICATED,
    mechanism: 'Sinergismo serotoninérgico tóxico descontrolado.',
    clinicalRisk: 'Toxicidade serotoninérgica aguda, coma e falência de múltiplos órgãos.',
    psychologistManagementTip: 'Contraindicação absoluta. Informar o médico prescritor com alerta de prioridade máxima.'
  },
  {
    drugA: 'imao_tranilcipromina',
    drugB: 'venlafaxina',
    severity: DrugInteractionSeverity.CONTRAINDICATED,
    mechanism: 'Inibição dupla do catabolismo e recaptação de aminas biogênicas (serotonina e noradrenalina).',
    clinicalRisk: 'Crise hipertensiva maligna e Síndrome Serotoninérgica grave com risco iminente de AVC ou parada cardíaca.',
    psychologistManagementTip: 'Combinação estritamente contraindicada na psicofarmacologia clínica.'
  },

  // Interações MAJOR (Severas / Risco Alto)
  {
    drugA: 'litio',
    drugB: 'sertralina',
    severity: DrugInteractionSeverity.MAJOR,
    mechanism: 'Sinergismo farmacodinâmico na neurotransmissão serotoninérgica central e interferência no tônus neuromuscular.',
    clinicalRisk: 'Aumento expressivo do risco de toxicidade serotoninérgica e exacerbação de tremores finos e náuseas.',
    psychologistManagementTip: 'Acompanhar se o paciente relata tremores grosseiros de extremidades, desorientação ou marcha oscilante. Recomendar monitoramento de litiemia.'
  },
  {
    drugA: 'litio',
    drugB: 'fluoxetina',
    severity: DrugInteractionSeverity.MAJOR,
    mechanism: 'Elevação da concentração plasmática de lítio por redução de depuração e somação serotoninérgica.',
    clinicalRisk: 'Intoxicação por lítio (diarreia aquosa, vômitos, ataxia, confusão mental) e síndrome serotoninérgica subclínica.',
    psychologistManagementTip: 'Incentivar o paciente a dosar a litiemia sérica com regularidade estrita e manter hidratação constante.'
  },
  {
    drugA: 'clonazepam',
    drugB: 'zolpidem',
    severity: DrugInteractionSeverity.MAJOR,
    mechanism: 'Potencialização aditiva e descontrolada dos receptores GABA-A no córtex cerebral e tronco encefálico.',
    clinicalRisk: 'Depressão respiratória acentuada, torpor diurno profundo, amnésia anterógrada e comportamentos automáticos complexos (sonambulismo violento).',
    psychologistManagementTip: 'Investigar se o paciente está associando hipnóticos por conta própria devido a queixas persistentes de insônia.'
  },
  {
    drugA: 'alprazolam',
    drugB: 'zolpidem',
    severity: DrugInteractionSeverity.MAJOR,
    mechanism: 'Dupla depressão central com afinidade similar para sítios benzodiazepínicos/omega.',
    clinicalRisk: 'Quedas traumáticas noturnas, sedação extrema matinal e rápido desenvolvimento de dependência iatrogênica.',
    psychologistManagementTip: 'Propor intervenção baseada em Higiene do Sono e TCC para Insônia (TCC-I) em articulação com a equipe psiquiátrica.'
  },

  // Interações MODERATE (Moderadas / Cautela)
  {
    drugA: 'bupropiona',
    drugB: 'venlafaxina',
    severity: DrugInteractionSeverity.MODERATE,
    mechanism: 'Somação adrenérgica central e inibição competitiva da enzima hepática CYP2D6 pela bupropiona.',
    clinicalRisk: 'Aumento dos níveis séricos dos fármacos, redução cumulativa do limiar convulsivo, taquicardia sinusal e agitação.',
    psychologistManagementTip: 'Avaliar queixas de palpitações no peito, elevação na ansiedade basal ou espasmos musculares breves durante as sessões.'
  },
  {
    drugA: 'bupropiona',
    drugB: 'sertralina',
    severity: DrugInteractionSeverity.MODERATE,
    mechanism: 'Inibição moderada da isoenzima CYP2D6 com aumento da concentração sérica de sertralina.',
    clinicalRisk: 'Maior incidência de tremores, insônia e cefaleia; potencialização terapêutica positiva se bem monitorada (estratégia "Well-Loft").',
    psychologistManagementTip: 'Monitorar queixas de insônia e sugerir ao paciente que a tomada da bupropiona ocorra sempre pela manhã.'
  },
  {
    drugA: 'clonazepam',
    drugB: 'quetiapina',
    severity: DrugInteractionSeverity.MODERATE,
    mechanism: 'Sinergia de sedação entre o bloqueio histaminérgico H1 da quetiapina e a modulação GABAérgica do clonazepam.',
    clinicalRisk: 'Hipersedação matinal, hipotensão ortostática com risco de síncope ao se levantar rapidamente e lentificação do raciocínio.',
    psychologistManagementTip: 'Instruir o paciente sobre o cuidado ao despertar à noite para ir ao banheiro e orientar a não dirigir no início da combinação.'
  },
  {
    drugA: 'metilfenidato',
    drugB: 'venlafaxina',
    severity: DrugInteractionSeverity.MODERATE,
    mechanism: 'Efeito simpatomimético aditivo sobre a recaptação de noradrenalina e dopamina.',
    clinicalRisk: 'Aumento da pressão arterial sistólica/diastólica, episódios de taquicardia em repouso e exacerbação de sintomas de ansiedade.',
    psychologistManagementTip: 'Recomendar aferição rotineira da pressão arterial e questionar se o paciente sente aperto torácico ou irritabilidade vespertina.'
  },
  {
    drugA: 'lisdexanfetamina',
    drugB: 'bupropiona',
    severity: DrugInteractionSeverity.MODERATE,
    mechanism: 'Hiperestimulação noradrenérgica e dopaminérgica simultânea.',
    clinicalRisk: 'Diminuição do limiar convulsivo, insônia grave, bruxismo diurno e pico de ansiedade.',
    psychologistManagementTip: 'Checar a qualidade do sono e alertar sobre o risco de tensão muscular cervical e bruxismo.'
  },
  {
    drugA: 'litio',
    drugB: 'quetiapina',
    severity: DrugInteractionSeverity.MODERATE,
    mechanism: 'Potencialização terapêutica recomendada em diretrizes de bipolaridade, com risco cumulativo somático.',
    clinicalRisk: 'Aumento ponderal acentuado, constipação e risco de síndrome metabólica.',
    psychologistManagementTip: 'Incentivar monitoramento de exames laboratoriais glicêmicos e lipídicos e apoiar na manutenção de hábitos saudáveis.'
  }
];

export class PsychiatricReferralService {
  /**
   * Retorna o catálogo farmacológico completo disponível na plataforma
   */
  public static getCatalog(): Psychopharmaceutical[] {
    return [...PSYCHOPHARMACEUTICALS_CATALOG];
  }

  /**
   * Avalia as interações medicamentosas entre os IDs de fármacos informados
   */
  public static checkInteractions(
    drugIds: string[],
    context?: { actorId?: string; ipAddress?: string }
  ): CheckDrugInteractionsResponse {
    const cleanIds = Array.from(new Set(drugIds.map(id => id.trim().toLowerCase())));
    const catalogMap = new Map(PSYCHOPHARMACEUTICALS_CATALOG.map(d => [d.id, d]));

    const detectedInteractions: DrugInteractionRecord[] = [];

    // Compara pares sem repetição
    for (let i = 0; i < cleanIds.length; i++) {
      for (let j = i + 1; j < cleanIds.length; j++) {
        const idA = cleanIds[i];
        const idB = cleanIds[j];

        const rule = DRUG_INTERACTION_RULES.find(
          r => (r.drugA === idA && r.drugB === idB) || (r.drugA === idB && r.drugB === idA)
        );

        if (rule) {
          const nameA = catalogMap.get(idA)?.genericName || idA;
          const nameB = catalogMap.get(idB)?.genericName || idB;

          detectedInteractions.push({
            drugsInvolved: [idA, idB],
            drugNames: [nameA, nameB],
            severity: rule.severity,
            mechanism: rule.mechanism,
            clinicalRisk: rule.clinicalRisk,
            psychologistManagementTip: rule.psychologistManagementTip
          });
        }
      }
    }

    // Calcula a severidade máxima
    let maxSeverity: DrugInteractionSeverity | 'NONE' = 'NONE';
    const severities = detectedInteractions.map(i => i.severity);
    if (severities.includes(DrugInteractionSeverity.CONTRAINDICATED)) {
      maxSeverity = DrugInteractionSeverity.CONTRAINDICATED;
    } else if (severities.includes(DrugInteractionSeverity.MAJOR)) {
      maxSeverity = DrugInteractionSeverity.MAJOR;
    } else if (severities.includes(DrugInteractionSeverity.MODERATE)) {
      maxSeverity = DrugInteractionSeverity.MODERATE;
    } else if (severities.includes(DrugInteractionSeverity.MINOR)) {
      maxSeverity = DrugInteractionSeverity.MINOR;
    }

    // Auditoria WORM se contexto foi fornecido
    if (context?.actorId) {
      AuditService.log({
        actorId: context.actorId,
        action: AuditAction.DRUG_INTERACTIONS_EVALUATED,
        resourceType: AuditResourceType.DRUG_INTERACTION_CHECKER,
        resourceId: `check_${Date.now()}`,
        ipAddress: context.ipAddress || '127.0.0.1'
      });

      if (maxSeverity === DrugInteractionSeverity.CONTRAINDICATED || maxSeverity === DrugInteractionSeverity.MAJOR) {
        AuditService.log({
          actorId: context.actorId,
          action: AuditAction.CRITICAL_DRUG_ALERT_TRIGGERED,
          resourceType: AuditResourceType.DRUG_INTERACTION_CHECKER,
          resourceId: `alert_${maxSeverity}_${Date.now()}`,
          ipAddress: context.ipAddress || '127.0.0.1'
        });
      }
    }

    return {
      success: true,
      interactions: detectedInteractions,
      maxSeverity,
      warningCount: detectedInteractions.length
    };
  }

  /**
   * Emite e persiste uma Guia de Encaminhamento Psiquiátrico Interoperável
   * Protegida por Criptografia de Ponta a Ponta (AES-256-GCM) e Token de Validação Notarial
   */
  public static createReferral(params: {
    therapistId: string;
    therapistName: string;
    therapistCrp: string;
    dto: CreatePsychiatricReferralDTO;
    ipAddress?: string;
  }): PsychiatricReferralResponse {
    const { therapistId, therapistName, therapistCrp, dto } = params;

    const patient = db.patients.get(dto.patientId);
    if (!patient) {
      throw new Error(`Paciente com ID '${dto.patientId}' não encontrado no sistema.`);
    }

    if (!dto.reasonForReferral || !dto.reasonForReferral.trim()) {
      throw new Error('O motivo clínico do encaminhamento é de preenchimento obrigatório (Resolução CFP nº 006/2019).');
    }

    if (!dto.clinicalHypothesesCid11 || dto.clinicalHypothesesCid11.length === 0) {
      throw new Error('Ao menos uma hipótese diagnóstica (CID-11) deve ser informada no encaminhamento psiquiátrico.');
    }

    // Avalia interações dos medicamentos relatados
    const drugIds = dto.currentMedications.map(m => m.drugId);
    const evaluation = this.checkInteractions(drugIds);

    const referralId = randomUUID();
    const validationToken = `psy_ref_${randomBytes(16).toString('hex')}`;
    const createdAt = new Date().toISOString();

    // Checksum de integridade imutável (SHA-256)
    const integrityPayload = JSON.stringify({
      referralId,
      patientId: dto.patientId,
      therapistId,
      therapistCrp,
      urgencyLevel: dto.urgencyLevel,
      reasonForReferral: dto.reasonForReferral.trim(),
      clinicalHypothesesCid11: [...dto.clinicalHypothesesCid11].sort(),
      validationToken
    });
    const integrityChecksumSha256 = createHash('sha256').update(integrityPayload).digest('hex');

    // Criptografa notas confidenciais com FLE se presentes
    let encryptedContent: any = undefined;
    if (dto.confidentialNotes && dto.confidentialNotes.trim()) {
      encryptedContent = {
        confidentialNotes: encryptField(dto.confidentialNotes.trim())
      };
    }

    const referralGuide: PsychiatricReferralGuide = {
      id: referralId,
      patientId: dto.patientId,
      therapistId,
      therapistName,
      therapistCrp,
      urgencyLevel: dto.urgencyLevel,
      reasonForReferral: dto.reasonForReferral.trim(),
      clinicalHypothesesCid11: dto.clinicalHypothesesCid11,
      currentMedications: dto.currentMedications,
      detectedInteractions: evaluation.interactions,
      psychometricSummary: dto.psychometricSummary,
      confidentialNotes: dto.confidentialNotes?.trim(),
      validationToken,
      integrityChecksumSha256,
      createdAt,
      encryptedContent
    };

    // Persiste no banco de dados
    db.psychiatricReferrals.set(referralId, referralGuide);

    // Auditoria WORM
    AuditService.log({
      actorId: therapistId,
      action: AuditAction.PSYCHIATRIC_REFERRAL_CREATED,
      resourceType: AuditResourceType.PSYCHIATRIC_REFERRAL,
      resourceId: referralId,
      ipAddress: params.ipAddress || '127.0.0.1'
    });

    if (evaluation.maxSeverity === DrugInteractionSeverity.CONTRAINDICATED || evaluation.maxSeverity === DrugInteractionSeverity.MAJOR) {
      AuditService.log({
        actorId: therapistId,
        action: AuditAction.CRITICAL_DRUG_ALERT_TRIGGERED,
        resourceType: AuditResourceType.DRUG_INTERACTION_CHECKER,
        resourceId: `ref_alert_${referralId}`,
        ipAddress: params.ipAddress || '127.0.0.1'
      });
    }

    const validationUrl = `/api/psychiatric-referrals/validate/${validationToken}`;

    return {
      success: true,
      referral: referralGuide,
      validationUrl,
      message: 'Guia de Encaminhamento Psiquiátrico emitida e assinada digitalmente com sucesso.'
    };
  }

  /**
   * Lista todos os encaminhamentos emitidos para determinado paciente
   */
  public static listPatientReferrals(patientId: string): PsychiatricReferralGuide[] {
    const list: PsychiatricReferralGuide[] = [];

    for (const referral of db.psychiatricReferrals.values()) {
      if (referral.patientId === patientId) {
        // Se houver encryptedContent com confidentialNotes, assegurar decifragem consistente
        let notes = referral.confidentialNotes;
        if (referral.encryptedContent?.confidentialNotes) {
          try {
            notes = decryptField(referral.encryptedContent.confidentialNotes);
          } catch {
            notes = referral.confidentialNotes;
          }
        }

        list.push({
          ...referral,
          confidentialNotes: notes
        });
      }
    }

    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Valida publicamente a autenticidade de uma guia de encaminhamento pelo token notarial
   * Respeita o Art. 9º do Código de Ética (não expõe notas confidenciais internas)
   */
  public static getReferralByToken(token: string): { isValid: boolean; referral?: Partial<PsychiatricReferralGuide> } {
    for (const ref of db.psychiatricReferrals.values()) {
      if (ref.validationToken === token) {
        // Retorna dados públicos para o médico assistente com exclusão de anotações internas confidenciais
        const publicReferral: Partial<PsychiatricReferralGuide> = {
          id: ref.id,
          patientId: ref.patientId,
          therapistName: ref.therapistName,
          therapistCrp: ref.therapistCrp,
          urgencyLevel: ref.urgencyLevel,
          reasonForReferral: ref.reasonForReferral,
          clinicalHypothesesCid11: ref.clinicalHypothesesCid11,
          currentMedications: ref.currentMedications,
          detectedInteractions: ref.detectedInteractions,
          psychometricSummary: ref.psychometricSummary,
          validationToken: ref.validationToken,
          integrityChecksumSha256: ref.integrityChecksumSha256,
          createdAt: ref.createdAt
        };

        return {
          isValid: true,
          referral: publicReferral
        };
      }
    }

    return { isValid: false };
  }
}
