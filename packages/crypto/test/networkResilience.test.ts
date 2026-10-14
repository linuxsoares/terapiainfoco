import { describe, it, expect } from 'bun:test';
import { 
  NetworkProfileType, 
  ClinicalIntelligibilityGrade, 
  AudioCodecType 
} from '@terapiainfoco/shared';
import { 
  NETWORK_PROFILE_PRESETS,
  assessClinicalNetworkResilience,
  calculateNetworkSimulationDigest,
  createNetworkSimulationReport
} from '../src/networkResilience';

describe('Network Resilience & Clinical Intelligibility Engine (RFC-001 §3.2, §5.1, §5.2 e CFP 011/2018)', () => {
  describe('Catálogo de Presets de Rede Clínica', () => {
    it('deve conter todos os 6 perfis padronizados com parâmetros realistas', () => {
      const profiles = Object.values(NetworkProfileType);
      expect(profiles.length).toBe(6);

      for (const p of profiles) {
        const preset = NETWORK_PROFILE_PRESETS[p];
        expect(preset).toBeDefined();
        expect(preset.name.length).toBeGreaterThan(0);
        expect(preset.description.length).toBeGreaterThan(0);
        expect(preset.defaultParams.durationSeconds).toBeGreaterThan(0);
        expect(preset.defaultParams.codec).toBeDefined();
      }
    });

    it('deve definir parâmetros de excelência para Fibra Óptica e severos para Conexão Crítica', () => {
      const fiber = NETWORK_PROFILE_PRESETS[NetworkProfileType.FIBRA_ESTAVEL].defaultParams;
      expect(fiber.jitterMs).toBeLessThanOrEqual(5);
      expect(fiber.packetLossPercent).toBeLessThan(1.0);
      expect(fiber.rttMs).toBeLessThan(35);

      const critical = NETWORK_PROFILE_PRESETS[NetworkProfileType.DEGRADED_CRITICAL].defaultParams;
      expect(critical.jitterMs).toBeGreaterThan(100);
      expect(critical.packetLossPercent).toBeGreaterThan(10.0);
      expect(critical.rttMs).toBeGreaterThan(300);
    });
  });

  describe('Cálculo de MOS e Avaliação de Inteligibilidade Clínica (ITU-T G.107)', () => {
    it('deve classificar Fibra Óptica Estável como EXCELLENT sem contingência', () => {
      const fiberParams = NETWORK_PROFILE_PRESETS[NetworkProfileType.FIBRA_ESTAVEL].defaultParams;
      const assessment = assessClinicalNetworkResilience(fiberParams);

      expect(assessment.mosScore).toBeGreaterThanOrEqual(4.0);
      expect(assessment.intelligibilityGrade).toBe(ClinicalIntelligibilityGrade.EXCELLENT);
      expect(assessment.requiresContingency).toBe(false);
      expect(assessment.speechClippingPercent).toBeLessThan(2.0);
      expect(assessment.videoQualityStatus).toBe('HD_OPTIMAL');
      expect(assessment.clinicalRecommendation).toContain('Resolução CFP nº 011/2018');
    });

    it('deve classificar Wi-Fi Oscilante como GOOD com qualidade aceitável', () => {
      const wifiParams = NETWORK_PROFILE_PRESETS[NetworkProfileType.WIFI_OSCILANTE].defaultParams;
      const assessment = assessClinicalNetworkResilience(wifiParams);

      expect(assessment.mosScore).toBeGreaterThanOrEqual(3.5);
      expect(assessment.mosScore).toBeLessThan(4.1);
      expect(assessment.intelligibilityGrade).toBe(ClinicalIntelligibilityGrade.GOOD);
      expect(assessment.requiresContingency).toBe(false);
      expect(assessment.videoQualityStatus).toBe('SD_ACCEPTABLE');
    });

    it('deve classificar 4G Congestionado como DEGRADED com recomendação de áudio puro', () => {
      const mobileParams = NETWORK_PROFILE_PRESETS[NetworkProfileType.MOBILE_4G_CONGESTED].defaultParams;
      const assessment = assessClinicalNetworkResilience(mobileParams);

      expect(assessment.mosScore).toBeGreaterThanOrEqual(2.8);
      expect(assessment.mosScore).toBeLessThan(3.5);
      expect(assessment.intelligibilityGrade).toBe(ClinicalIntelligibilityGrade.DEGRADED);
      expect(assessment.requiresContingency).toBe(false);
      expect(assessment.clinicalRecommendation).toContain('áudio puro');
    });

    it('deve classificar Conexão Degradada Crítica como CRITICAL_UNACCEPTABLE com contingência compulsória', () => {
      const criticalParams = NETWORK_PROFILE_PRESETS[NetworkProfileType.DEGRADED_CRITICAL].defaultParams;
      const assessment = assessClinicalNetworkResilience(criticalParams);

      expect(assessment.mosScore).toBeLessThan(2.8);
      expect(assessment.intelligibilityGrade).toBe(ClinicalIntelligibilityGrade.CRITICAL_UNACCEPTABLE);
      expect(assessment.requiresContingency).toBe(true);
      expect(assessment.videoQualityStatus).toBe('FROZEN_DEGRADED');
      expect(assessment.clinicalRecommendation).toContain('suspender a videoconferência');
    });

    it('deve calcular escore mínimo (MOS 1.0) e 100% de perda em Blackout Temporário', () => {
      const blackoutParams = NETWORK_PROFILE_PRESETS[NetworkProfileType.TEMPORARY_BLACKOUT].defaultParams;
      const assessment = assessClinicalNetworkResilience(blackoutParams);

      expect(assessment.mosScore).toBe(1.0);
      expect(assessment.speechClippingPercent).toBe(100.0);
      expect(assessment.intelligibilityGrade).toBe(ClinicalIntelligibilityGrade.CRITICAL_UNACCEPTABLE);
      expect(assessment.requiresContingency).toBe(true);
    });

    it('deve respeitar a opção simulateAudioOnly marcando DISABLED_AUDIO_ONLY', () => {
      const params = {
        ...NETWORK_PROFILE_PRESETS[NetworkProfileType.FIBRA_ESTAVEL].defaultParams,
        simulateAudioOnly: true
      };
      const assessment = assessClinicalNetworkResilience(params);
      expect(assessment.videoQualityStatus).toBe('DISABLED_AUDIO_ONLY');
      expect(assessment.mosScore).toBeGreaterThanOrEqual(4.0);
    });

    it('deve penalizar codecs legados com menor tolerância a perda de pacotes (G.711 vs Opus)', () => {
      const baseParams = {
        jitterMs: 40,
        packetLossPercent: 5.0,
        rttMs: 120,
        bandwidthKbps: 5000,
        durationSeconds: 30
      };

      const assessmentOpus = assessClinicalNetworkResilience({
        ...baseParams,
        codec: AudioCodecType.OPUS_FULLBAND
      });

      const assessmentG711 = assessClinicalNetworkResilience({
        ...baseParams,
        codec: AudioCodecType.G711_ALAW
      });

      expect(assessmentOpus.mosScore).toBeGreaterThan(assessmentG711.mosScore);
      expect(assessmentOpus.rFactor).toBeGreaterThan(assessmentG711.rFactor);
    });
  });

  describe('Digest Canônico SHA-256 e Emissão de Laudos de Simulação', () => {
    it('deve calcular digest determinístico para os mesmos parâmetros e timestamp', () => {
      const params = NETWORK_PROFILE_PRESETS[NetworkProfileType.WIFI_OSCILANTE].defaultParams;
      const assessment = assessClinicalNetworkResilience(params);
      const timestamp = '2026-10-14T10:00:00.000Z';

      const digest1 = calculateNetworkSimulationDigest(params, assessment, timestamp);
      const digest2 = calculateNetworkSimulationDigest(params, assessment, timestamp);

      expect(digest1).toHaveLength(64);
      expect(digest1).toBe(digest2);
    });

    it('deve alterar o digest caso qualquer parâmetro seja modificado (Tamper-Evidence)', () => {
      const params1 = NETWORK_PROFILE_PRESETS[NetworkProfileType.WIFI_OSCILANTE].defaultParams;
      const assessment1 = assessClinicalNetworkResilience(params1);
      const timestamp = '2026-10-14T10:00:00.000Z';

      const params2 = { ...params1, jitterMs: 99 };
      const assessment2 = assessClinicalNetworkResilience(params2);

      const digest1 = calculateNetworkSimulationDigest(params1, assessment1, timestamp);
      const digest2 = calculateNetworkSimulationDigest(params2, assessment2, timestamp);

      expect(digest1).not.toBe(digest2);
    });

    it('deve criar relatório estruturado com ID único, timestamp e digest probatório', () => {
      const report = createNetworkSimulationReport({
        therapistId: 'therapist-001',
        patientId: 'patient-456',
        profile: NetworkProfileType.MOBILE_4G_CONGESTED
      });

      expect(report.id).toMatch(/^netsim-[a-f0-9]{16}$/);
      expect(report.therapistId).toBe('therapist-001');
      expect(report.patientId).toBe('patient-456');
      expect(report.profile).toBe(NetworkProfileType.MOBILE_4G_CONGESTED);
      expect(report.params.jitterMs).toBe(85);
      expect(report.assessment.mosScore).toBeGreaterThanOrEqual(2.8);
      expect(report.probatoryDigest).toHaveLength(64);
    });
  });
});
