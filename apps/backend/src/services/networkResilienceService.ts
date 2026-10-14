import {
  AuditAction,
  AuditResourceType,
  ClinicalIntelligibilityGrade,
  type NetworkProfilePreset,
  type NetworkResilienceMetrics,
  type NetworkSimulationReport,
  type RunNetworkSimulationDTO
} from '@terapiainfoco/shared';
import { 
  NETWORK_PROFILE_PRESETS,
  createNetworkSimulationReport 
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class NetworkResilienceService {
  private static instance: NetworkResilienceService;

  private history: NetworkSimulationReport[] = [];
  private totalSimulations: number = 0;
  private sumMosScore: number = 0;
  private degradedSimulationsCount: number = 0;
  private criticalSimulationsCount: number = 0;
  private contingencyRecommendedCount: number = 0;
  private lastSimulationAt?: string;

  public static getInstance(): NetworkResilienceService {
    if (!NetworkResilienceService.instance) {
      NetworkResilienceService.instance = new NetworkResilienceService();
    }
    return NetworkResilienceService.instance;
  }

  /**
   * Retorna os presets pré-definidos de rede clínica
   */
  public getPresets(): NetworkProfilePreset[] {
    return Object.values(NETWORK_PROFILE_PRESETS);
  }

  /**
   * Executa a simulação de resiliência e degradação de rede com registro probatório no WORM
   */
  public async runSimulation(params: {
    therapistId: string;
    dto: RunNetworkSimulationDTO;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<NetworkSimulationReport> {
    const report = createNetworkSimulationReport({
      therapistId: params.therapistId,
      patientId: params.dto.patientId,
      profile: params.dto.profile,
      params: params.dto.params
    });

    // 1. Atualização das métricas estatísticas agregadas
    this.totalSimulations++;
    this.sumMosScore += report.assessment.mosScore;
    this.lastSimulationAt = report.timestamp;

    if (report.assessment.intelligibilityGrade === ClinicalIntelligibilityGrade.DEGRADED) {
      this.degradedSimulationsCount++;
    } else if (report.assessment.intelligibilityGrade === ClinicalIntelligibilityGrade.CRITICAL_UNACCEPTABLE) {
      this.criticalSimulationsCount++;
    }

    if (report.assessment.requiresContingency) {
      this.contingencyRecommendedCount++;
    }

    // 2. Registro no ledger imutável WORM
    if (report.assessment.requiresContingency) {
      AuditService.log({
        actorId: params.therapistId,
        resourceType: AuditResourceType.NETWORK_RESILIENCE,
        resourceId: report.id,
        action: AuditAction.CLINICAL_CONTINGENCY_TRIGGERED,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent
      });
    }

    AuditService.log({
      actorId: params.therapistId,
      resourceType: AuditResourceType.NETWORK_RESILIENCE,
      resourceId: report.id,
      action: AuditAction.NETWORK_RESILIENCE_SIMULATED,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent
    });

    report.wormAuditId = `worm-${report.probatoryDigest.slice(0, 16)}`;

    // 3. Armazena no buffer circular em memória (últimos 100 relatórios)
    this.history.unshift(report);
    if (this.history.length > 100) {
      this.history.pop();
    }

    return report;
  }

  /**
   * Retorna o histórico de laudos forenses de simulação
   */
  public getHistory(limit = 20): NetworkSimulationReport[] {
    return this.history.slice(0, limit);
  }

  /**
   * Retorna os KPIs agregados de resiliência e qualidade da teleconsulta
   */
  public getMetrics(): NetworkResilienceMetrics {
    const avgMosScore = this.totalSimulations > 0
      ? Math.round((this.sumMosScore / this.totalSimulations) * 100) / 100
      : 4.5;

    return {
      totalSimulations: this.totalSimulations,
      avgMosScore,
      degradedSimulationsCount: this.degradedSimulationsCount,
      criticalSimulationsCount: this.criticalSimulationsCount,
      contingencyRecommendedCount: this.contingencyRecommendedCount,
      lastSimulationAt: this.lastSimulationAt
    };
  }

  /**
   * Método auxiliar para zerar estados em testes
   */
  public resetForTesting(): void {
    this.history = [];
    this.totalSimulations = 0;
    this.sumMosScore = 0;
    this.degradedSimulationsCount = 0;
    this.criticalSimulationsCount = 0;
    this.contingencyRecommendedCount = 0;
    this.lastSimulationAt = undefined;
  }
}
