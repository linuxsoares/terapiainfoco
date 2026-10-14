import crypto from 'crypto';
import { 
  NetworkProfileType, 
  ClinicalIntelligibilityGrade, 
  AudioCodecType 
} from '@terapiainfoco/shared';
import type { 
  NetworkSimulationParams, 
  ClinicalSpeechAssessment, 
  NetworkSimulationReport, 
  NetworkProfilePreset 
} from '@terapiainfoco/shared';

/**
 * Catálogo de Presets Padronizados de Simulação de Rede Clínica (RFC-001 §3.2, §5.1, §5.2 e CFP 011/2018)
 */
export const NETWORK_PROFILE_PRESETS: Record<NetworkProfileType, NetworkProfilePreset> = {
  [NetworkProfileType.FIBRA_ESTAVEL]: {
    profile: NetworkProfileType.FIBRA_ESTAVEL,
    name: 'Fibra Óptica Simétrica (Padrão Ouro)',
    description: 'Conexão estável banda larga com latência ultra-baixa e sem perda de pacotes perceptível.',
    defaultParams: {
      jitterMs: 3,
      packetLossPercent: 0.1,
      rttMs: 22,
      bandwidthKbps: 50000,
      durationSeconds: 60,
      codec: AudioCodecType.OPUS_FULLBAND,
      simulateAudioOnly: false
    },
    expectedMosRange: '4.3 - 4.5 (Excelente)'
  },
  [NetworkProfileType.WIFI_OSCILANTE]: {
    profile: NetworkProfileType.WIFI_OSCILANTE,
    name: 'Wi-Fi Doméstico com Interferência Leve',
    description: 'Variações típicas de ambiente residencial com múltiplos dispositivos disputando canal.',
    defaultParams: {
      jitterMs: 45,
      packetLossPercent: 3.5,
      rttMs: 85,
      bandwidthKbps: 12000,
      durationSeconds: 60,
      codec: AudioCodecType.OPUS_FULLBAND,
      simulateAudioOnly: false
    },
    expectedMosRange: '3.6 - 3.9 (Bom)'
  },
  [NetworkProfileType.MOBILE_4G_CONGESTED]: {
    profile: NetworkProfileType.MOBILE_4G_CONGESTED,
    name: 'Rede Móvel 4G/LTE Congestionada',
    description: 'Conexão celular com flutuação de sinal, handover de torres e latência moderada.',
    defaultParams: {
      jitterMs: 85,
      packetLossPercent: 6.5,
      rttMs: 190,
      bandwidthKbps: 2500,
      durationSeconds: 60,
      codec: AudioCodecType.OPUS_VOIP,
      simulateAudioOnly: false
    },
    expectedMosRange: '2.9 - 3.4 (Degradado)'
  },
  [NetworkProfileType.DEGRADED_CRITICAL]: {
    profile: NetworkProfileType.DEGRADED_CRITICAL,
    name: 'Conexão Degradada Crítica (Risco Clínico)',
    description: 'Degradação severa com cortes de sílabas, perda contínua de pacotes e delay de eco.',
    defaultParams: {
      jitterMs: 220,
      packetLossPercent: 16.0,
      rttMs: 480,
      bandwidthKbps: 350,
      durationSeconds: 60,
      codec: AudioCodecType.OPUS_VOIP,
      simulateAudioOnly: false
    },
    expectedMosRange: '1.5 - 2.4 (Crítico / Veto CFP)'
  },
  [NetworkProfileType.TEMPORARY_BLACKOUT]: {
    profile: NetworkProfileType.TEMPORARY_BLACKOUT,
    name: 'Blackout / Desconexão Transitória',
    description: 'Queda total de pacotes por oscilação de link ou transição de rede.',
    defaultParams: {
      jitterMs: 450,
      packetLossPercent: 100.0,
      rttMs: 1500,
      bandwidthKbps: 0,
      durationSeconds: 15,
      codec: AudioCodecType.OPUS_VOIP,
      simulateAudioOnly: false
    },
    expectedMosRange: '1.0 (Interrupção Total)'
  },
  [NetworkProfileType.CUSTOM]: {
    profile: NetworkProfileType.CUSTOM,
    name: 'Parâmetros Personalizados',
    description: 'Configuração sob medida de Jitter, Packet Loss, RTT e Codec para testes de estresse.',
    defaultParams: {
      jitterMs: 40,
      packetLossPercent: 3.0,
      rttMs: 90,
      bandwidthKbps: 5000,
      durationSeconds: 30,
      codec: AudioCodecType.OPUS_FULLBAND,
      simulateAudioOnly: false
    },
    expectedMosRange: 'Variável'
  }
};

/**
 * Avalia o impacto de rede na fala clínica usando o modelo ITU-T G.107 (E-Model) adaptado para telepsicologia.
 * Retorna o escore MOS (1.00 a 5.00), classificação de inteligibilidade e orientação ética CFP 011/2018.
 */
export function assessClinicalNetworkResilience(params: NetworkSimulationParams): ClinicalSpeechAssessment {
  const {
    jitterMs,
    packetLossPercent,
    rttMs,
    codec,
    simulateAudioOnly = false
  } = params;

  // 1. Cálculo do atraso efetivo unidirecional (One-Way Effective Delay):
  // d = (RTT / 2) + Jitter Buffer Delay estimado + overhead de processamento
  const effectiveDelayMs = Math.round((rttMs / 2) + (jitterMs * 2.0) + 15);

  // 2. Cálculo do R-Factor (E-Model ITU-T G.107 calibrado para WebRTC & Telemedicina):
  // R = R0 - Is - Id - Ie
  const R0 = 94.0; // Relação sinal-ruído máxima de canal digital
  const Is = 1.0;  // Degradações inerentes de quantização

  // Id (Impairment por Atraso Ponta-a-Ponta):
  // Conversações psicológicas toleram até 150ms de latência unidirecional sem quebra de naturalidade.
  let Id = 0;
  if (effectiveDelayMs > 150) {
    const excessDelay = effectiveDelayMs - 150;
    if (excessDelay <= 150) {
      Id = excessDelay * 0.04;
    } else {
      Id = 6.0 + ((excessDelay - 150) * 0.10);
    }
  }

  // Ie (Impairment por Codec e Sensibilidade a Perda de Pacotes com PLC / FEC):
  let IeCodec = 2; // Intrinsic impairment do codec
  let Kloss = 2.0; // Multiplicador de sensibilidade à perda de pacotes

  switch (codec) {
    case AudioCodecType.OPUS_FULLBAND:
      IeCodec = 2;
      Kloss = 2.2;
      break;
    case AudioCodecType.OPUS_VOIP:
      IeCodec = 5;
      Kloss = 2.8;
      break;
    case AudioCodecType.G722:
      IeCodec = 10;
      Kloss = 4.2;
      break;
    case AudioCodecType.G711_ALAW:
      IeCodec = 16; // Narrowband telefônico 8kHz
      Kloss = 6.5; // Sem suporte a FEC/PLC avançado
      break;
  }

  const effectiveLoss = Math.min(100, Math.max(0, packetLossPercent));
  let Ie = 0;
  if (effectiveLoss >= 99) {
    Ie = 90;
  } else {
    Ie = IeCodec + Math.min(80, Kloss * Math.pow(effectiveLoss, 1.15));
  }

  // R Factor consolidado (limitado entre 0 e 100)
  const rawR = R0 - Is - Id - Ie;
  const rFactor = Math.max(0, Math.min(100, Math.round(rawR * 10) / 10));

  // 3. Conversão de R-Factor para Escala MOS ITU-T (1.00 a 4.50+)
  let mosScore = 1.0;
  if (effectiveLoss >= 99 || rFactor <= 0) {
    mosScore = 1.0;
  } else if (rFactor >= 92) {
    mosScore = 4.35 + ((rFactor - 92) * 0.015);
  } else if (rFactor >= 80) {
    // Escala MOS 3.8 a 4.3
    mosScore = 3.8 + ((rFactor - 80) * 0.045);
  } else if (rFactor >= 65) {
    // Escala MOS 3.3 a 3.8
    mosScore = 3.3 + ((rFactor - 65) * 0.033);
  } else if (rFactor >= 45) {
    // Escala MOS 2.5 a 3.3
    mosScore = 2.5 + ((rFactor - 45) * 0.04);
  } else if (rFactor >= 20) {
    // Escala MOS 1.8 a 2.5
    mosScore = 1.8 + ((rFactor - 20) * 0.028);
  } else {
    mosScore = 1.0 + (rFactor * 0.04);
  }

  mosScore = Math.max(1.0, Math.min(4.5, Math.round(mosScore * 100) / 100));

  // 4. Estimativa de Speech Clipping Percent (perda de fonemas)
  const clippingEstimate = effectiveLoss >= 99
    ? 100
    : Math.min(100, Math.max(0, (effectiveLoss * 1.35) + Math.max(0, (jitterMs - 40) * 0.12)));
  const speechClippingPercent = Math.round(clippingEstimate * 10) / 10;

  // 5. Qualidade de Vídeo
  let videoQualityStatus: ClinicalSpeechAssessment['videoQualityStatus'] = 'HD_OPTIMAL';
  if (simulateAudioOnly) {
    videoQualityStatus = 'DISABLED_AUDIO_ONLY';
  } else if (effectiveLoss >= 10 || jitterMs >= 150 || rttMs >= 400) {
    videoQualityStatus = 'FROZEN_DEGRADED';
  } else if (effectiveLoss >= 3 || jitterMs >= 50 || rttMs >= 150) {
    videoQualityStatus = 'SD_ACCEPTABLE';
  } else {
    videoQualityStatus = 'HD_OPTIMAL';
  }

  // 6. Determinação da Classificação Ético-Clínica e Recomendações CFP nº 011/2018
  let intelligibilityGrade: ClinicalIntelligibilityGrade;
  let clinicalRecommendation: string;
  let requiresContingency = false;

  if (effectiveLoss >= 50 || mosScore < 2.8) {
    intelligibilityGrade = ClinicalIntelligibilityGrade.CRITICAL_UNACCEPTABLE;
    requiresContingency = true;
    clinicalRecommendation = 
      'Ato psicológico comprometido por degradação severa da rede (Resolução CFP nº 011/2018, Art. 1º e 3º). ' +
      'Risco iminente de distorção de significado terapêutico, quebra de acolhimento e perda de pistas clínicas. ' +
      'Contingência obrigatória: suspender a videoconferência e realizar transição imediata para canal telefônico seguro ou reagendamento formal.';
  } else if (mosScore < 3.5) {
    intelligibilityGrade = ClinicalIntelligibilityGrade.DEGRADED;
    requiresContingency = false;
    clinicalRecommendation = 
      'Qualidade técnica em nível de alerta para teleatendimento psicológico (Resolução CFP nº 011/2018). ' +
      'Detectados micro-cortes e perda de fluidez conversacional. ' +
      'Recomendação ética: comutar transmissão para áudio puro (desativando câmera de vídeo) para priorizar a inteligibilidade da escuta clínica.';
  } else if (mosScore < 4.0) {
    intelligibilityGrade = ClinicalIntelligibilityGrade.GOOD;
    requiresContingency = false;
    clinicalRecommendation = 
      'Qualidade de mídia adequada para atendimento psicológico. ' +
      'Comunicação clara com leve atraso imperceptível na fala, sem impacto na aliança terapêutica. Sessão autorizada sem contingência.';
  } else {
    intelligibilityGrade = ClinicalIntelligibilityGrade.EXCELLENT;
    requiresContingency = false;
    clinicalRecommendation = 
      'Canal de telepsicologia em condições ótimas. Parâmetros técnicos plenamente conformes à Resolução CFP nº 011/2018. ' +
      'Vínculo verbal e não-verbal plenamente assegurados com escuta clínica de alta fidelidade.';
  }

  return {
    mosScore,
    rFactor,
    speechClippingPercent,
    effectiveDelayMs,
    intelligibilityGrade,
    clinicalRecommendation,
    requiresContingency,
    videoQualityStatus
  };
}

/**
 * Gera um digest probatório canônico SHA-256 da simulação de rede para auditoria forense.
 */
export function calculateNetworkSimulationDigest(params: NetworkSimulationParams, assessment: ClinicalSpeechAssessment, timestamp: string): string {
  const canonicalString = JSON.stringify({
    timestamp,
    jitterMs: params.jitterMs,
    packetLossPercent: params.packetLossPercent,
    rttMs: params.rttMs,
    bandwidthKbps: params.bandwidthKbps,
    codec: params.codec,
    mosScore: assessment.mosScore,
    rFactor: assessment.rFactor,
    intelligibilityGrade: assessment.intelligibilityGrade,
    requiresContingency: assessment.requiresContingency
  });

  return crypto.createHash('sha256').update(canonicalString, 'utf8').digest('hex');
}

/**
 * Constrói um laudo completo de simulação de rede com selagem SHA-256.
 */
export function createNetworkSimulationReport(options: {
  therapistId: string;
  patientId?: string;
  profile?: NetworkProfileType;
  params?: Partial<NetworkSimulationParams>;
}): NetworkSimulationReport {
  const profile = options.profile || NetworkProfileType.CUSTOM;
  const defaultParams = NETWORK_PROFILE_PRESETS[profile]?.defaultParams || NETWORK_PROFILE_PRESETS[NetworkProfileType.CUSTOM].defaultParams;

  const mergedParams: NetworkSimulationParams = {
    ...defaultParams,
    ...(options.params || {})
  };

  const assessment = assessClinicalNetworkResilience(mergedParams);
  const id = `netsim-${crypto.randomBytes(8).toString('hex')}`;
  const timestamp = new Date().toISOString();
  const probatoryDigest = calculateNetworkSimulationDigest(mergedParams, assessment, timestamp);

  return {
    id,
    timestamp,
    patientId: options.patientId,
    therapistId: options.therapistId,
    profile,
    params: mergedParams,
    assessment,
    probatoryDigest
  };
}
