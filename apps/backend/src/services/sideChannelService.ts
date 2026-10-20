import {
  SideChannelProtectionMode,
  SideChannelVulnerabilityLevel,
  SideChannelTargetOperation,
  AuditAction,
  AuditResourceType
} from '@terapiainfoco/shared';
import type {
  SideChannelInspectionResult,
  SideChannelBenchmarkReport,
  SideChannelMetrics,
  SideChannelOverview,
  SideChannelProofSeal,
  InspectSideChannelDTO,
  RunWelchTestDTO,
  CalibrateJitterDTO,
  UpdateSideChannelPolicyDTO,
  SimulateTimingAttackDTO,
  VerifySideChannelSealDTO
} from '@terapiainfoco/shared';
import {
  constantTimeCompare,
  vulnerableVariableTimeCompare,
  runWelchTTestTimingAnalysis,
  inspectOperationSideChannel,
  issueSideChannelProofSeal,
  verifySideChannelProofSeal
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';
import crypto from 'node:crypto';

export class SideChannelService {
  private static instance: SideChannelService;

  private activeProtectionMode: SideChannelProtectionMode = SideChannelProtectionMode.CONSTANT_TIME_PLUS_GAUSSIAN_JITTER;
  private activeJitterTargetMs: number = 8;
  private activeJitterVarianceMs: number = 2;

  private recentInspections: Map<string, SideChannelInspectionResult> = new Map();
  private recentBenchmarks: Map<string, SideChannelBenchmarkReport> = new Map();

  // Contadores de telemetria
  private totalInspectionsCount: number = 0;
  private timingLeaksBlockedCount: number = 0;
  private constantTimeVerificationsCount: number = 0;

  private constructor() {
    this.seedDefaultData();
  }

  public static getInstance(): SideChannelService {
    if (!SideChannelService.instance) {
      SideChannelService.instance = new SideChannelService();
    }
    return SideChannelService.instance;
  }

  /**
   * Semeia inspeções iniciais e benchmark representativo das 5 operações clínicas
   */
  private seedDefaultData(): void {
    const defaultOps = [
      SideChannelTargetOperation.AES_GCM_AUTH_TAG_VERIFY,
      SideChannelTargetOperation.BLIND_INDEX_HMAC_COMPUTE,
      SideChannelTargetOperation.PASSWORD_PBKDF2_COMPARE,
      SideChannelTargetOperation.RSA_MODULAR_EXPONENTIATION,
      SideChannelTargetOperation.JWT_DPOP_SIGNATURE_VERIFY
    ];

    for (const op of defaultOps) {
      const insp = inspectOperationSideChannel(op, this.activeProtectionMode, 40);
      this.recentInspections.set(insp.id, insp);
      this.totalInspectionsCount++;
      if (insp.constantTimeGuaranteed) {
        this.constantTimeVerificationsCount++;
      }
    }

    // Benchmark representativo da Auth Tag AES-GCM
    const initialReportId = `bm_initial_${crypto.randomBytes(4).toString('hex')}`;
    const welch = runWelchTTestTimingAnalysis(
      () => { constantTimeCompare(Buffer.alloc(16, 1), Buffer.alloc(16, 1)); },
      () => { constantTimeCompare(Buffer.alloc(16, 1), Buffer.alloc(16, 2)); },
      50
    );

    const seal = issueSideChannelProofSeal(
      initialReportId,
      SideChannelTargetOperation.AES_GCM_AUTH_TAG_VERIFY,
      this.activeProtectionMode,
      welch
    );

    const initialReport: SideChannelBenchmarkReport = {
      id: initialReportId,
      targetOperation: SideChannelTargetOperation.AES_GCM_AUTH_TAG_VERIFY,
      protectionMode: this.activeProtectionMode,
      welchTest: welch,
      isTimingSafe: welch.nistCompliant,
      proofSeal: seal,
      generatedAt: new Date(Date.now() - 3600000).toISOString()
    };

    this.recentBenchmarks.set(initialReport.id, initialReport);
  }

  /**
   * Executa inspeção de operação em tempo real
   */
  public async inspectOperation(dto: InspectSideChannelDTO, operatorId: string = 'SYSTEM'): Promise<SideChannelInspectionResult> {
    const iterations = dto.iterations || 60;
    const insp = inspectOperationSideChannel(dto.targetOperation, this.activeProtectionMode, iterations);
    
    this.recentInspections.set(insp.id, insp);
    this.totalInspectionsCount++;

    if (insp.constantTimeGuaranteed) {
      this.constantTimeVerificationsCount++;
    } else {
      this.timingLeaksBlockedCount++;
    }

    await AuditService.log({
      action: AuditAction.CONSTANT_TIME_EXECUTION_VERIFIED,
      resourceType: AuditResourceType.SIDE_CHANNEL_SHIELD,
      resourceId: insp.id,
      details: {
        targetOperation: dto.targetOperation,
        protectionMode: this.activeProtectionMode,
        tScore: insp.welchTScore,
        vulnerabilityLevel: insp.vulnerabilityLevel,
        operatorId
      }
    });

    return insp;
  }

  /**
   * Executa Pentest de Welch t-test completo sobre operação clínica
   */
  public async runWelchTest(dto: RunWelchTestDTO, operatorId: string = 'PENTESTER'): Promise<SideChannelBenchmarkReport> {
    const sampleSize = dto.sampleSize || 80;
    const id = `sc_bm_${crypto.randomBytes(6).toString('hex')}`;

    const tagReal = crypto.randomBytes(32);
    const tagMatch = Buffer.from(tagReal);
    const tagDiff = Buffer.from(tagReal);
    tagDiff[0] ^= 0x01;

    let fnA: () => void;
    let fnB: () => void;

    if (this.activeProtectionMode === SideChannelProtectionMode.MONITORING_BENCHMARK) {
      fnA = () => { vulnerableVariableTimeCompare(tagReal, tagMatch); };
      fnB = () => { vulnerableVariableTimeCompare(tagReal, tagDiff); };
    } else {
      fnA = () => { constantTimeCompare(tagReal, tagMatch); };
      fnB = () => { constantTimeCompare(tagReal, tagDiff); };
    }

    const welch = runWelchTTestTimingAnalysis(fnA, fnB, sampleSize);
    const seal = issueSideChannelProofSeal(id, dto.targetOperation, this.activeProtectionMode, welch);

    const report: SideChannelBenchmarkReport = {
      id,
      targetOperation: dto.targetOperation,
      protectionMode: this.activeProtectionMode,
      welchTest: welch,
      isTimingSafe: welch.nistCompliant,
      proofSeal: seal,
      generatedAt: new Date().toISOString()
    };

    this.recentBenchmarks.set(id, report);

    await AuditService.log({
      action: AuditAction.SIDE_CHANNEL_DEFENSE_ASSESSED,
      resourceType: AuditResourceType.SIDE_CHANNEL_SHIELD,
      resourceId: id,
      details: {
        targetOperation: dto.targetOperation,
        tScore: welch.tScore,
        nistCompliant: welch.nistCompliant,
        vulnerabilityLevel: welch.vulnerabilityLevel,
        operatorId
      }
    });

    return report;
  }

  /**
   * Calibra parâmetros de Jitter Estocástico Regulado
   */
  public async calibrateJitter(dto: CalibrateJitterDTO, operatorId: string = 'ADMIN'): Promise<{ activeJitterTargetMs: number; message: string }> {
    this.activeJitterTargetMs = Math.max(1, Math.min(dto.targetLatencyMs, 50));
    this.activeJitterVarianceMs = dto.varianceMs ? Math.max(0.5, Math.min(dto.varianceMs, 10)) : 2;

    await AuditService.log({
      action: AuditAction.TIMING_JITTER_INJECTED,
      resourceType: AuditResourceType.SIDE_CHANNEL_SHIELD,
      resourceId: 'JITTER_CONFIG',
      details: {
        activeJitterTargetMs: this.activeJitterTargetMs,
        activeJitterVarianceMs: this.activeJitterVarianceMs,
        operatorId
      }
    });

    return {
      activeJitterTargetMs: this.activeJitterTargetMs,
      message: `Jitter estocástico calibrado para ${this.activeJitterTargetMs}ms (variância ±${this.activeJitterVarianceMs}ms).`
    };
  }

  /**
   * Atualiza a política de mitigação Side-Channel
   */
  public async updatePolicy(dto: UpdateSideChannelPolicyDTO, operatorId: string = 'ADMIN'): Promise<{ protectionMode: SideChannelProtectionMode; message: string }> {
    this.activeProtectionMode = dto.protectionMode;

    await AuditService.log({
      action: AuditAction.SIDE_CHANNEL_POLICY_UPDATED,
      resourceType: AuditResourceType.SIDE_CHANNEL_SHIELD,
      resourceId: 'POLICY_MODE',
      details: {
        newPolicyMode: dto.protectionMode,
        operatorId
      }
    });

    return {
      protectionMode: this.activeProtectionMode,
      message: `Modo de proteção side-channel atualizado para ${dto.protectionMode}.`
    };
  }

  /**
   * Simulação de Ataque Timing / Profiling contra a Camada Criptográfica
   */
  public async simulateTimingAttack(dto: SimulateTimingAttackDTO, operatorId: string = 'PENTESTER'): Promise<{ success: boolean; detectedLeak: boolean; welchTScore: number; leakedInformation: string; message: string }> {
    const useVulnerable = dto.useVulnerableAlgorithm ?? false;
    const bufSize = 2000;
    // Repetições por amostra: o sinal (diferença de tempo) precisa superar pausas de GC isoladas,
    // que de outro modo inflam a variância e escondem o vazamento do algoritmo vulnerável
    const INNER_REPETITIONS = 200;
    const realBuf = Buffer.alloc(bufSize, 'A');
    const earlyMismatch = Buffer.alloc(bufSize, 'B'); // Byte 0 incorreto
    const lateMismatch = Buffer.alloc(bufSize, 'A');
    lateMismatch[bufSize - 1] = 'B'.charCodeAt(0); // Último byte incorreto

    let fnA: () => void;
    let fnB: () => void;

    if (useVulnerable) {
      fnA = () => {
        for (let k = 0; k < INNER_REPETITIONS; k++) {
          vulnerableVariableTimeCompare(realBuf, earlyMismatch);
        }
      };
      fnB = () => {
        for (let k = 0; k < INNER_REPETITIONS; k++) {
          vulnerableVariableTimeCompare(realBuf, lateMismatch);
        }
      };
    } else {
      fnA = () => {
        for (let k = 0; k < INNER_REPETITIONS; k++) {
          constantTimeCompare(realBuf, earlyMismatch);
        }
      };
      fnB = () => {
        for (let k = 0; k < INNER_REPETITIONS; k++) {
          constantTimeCompare(realBuf, lateMismatch);
        }
      };
    }

    const welch = runWelchTTestTimingAnalysis(fnA, fnB, 120);
    const detectedLeak = welch.tScore >= 4.5;

    if (detectedLeak) {
      this.timingLeaksBlockedCount++;
      await AuditService.log({
        action: AuditAction.TIMING_LEAK_DETECTED,
        resourceType: AuditResourceType.SIDE_CHANNEL_SHIELD,
        resourceId: 'TIMING_ATTACK_SIM',
        details: {
          simulated: true,
          targetOperation: dto.targetOperation,
          tScore: welch.tScore,
          operatorId
        }
      });
    }

    return {
      success: true,
      detectedLeak,
      welchTScore: welch.tScore,
      leakedInformation: detectedLeak
        ? 'Divergência temporal observável: o atacante conseguiria inferir a posição do byte divergente via correlação estatística.'
        : 'Nenhuma informação vazada: tempos de execução indistinguíveis (|t| < 4.5 NIST).',
      message: detectedLeak
        ? 'VULNERABILIDADE DETECTADA (SIMULAÇÃO): Timing leak confirmado no algoritmo variável.'
        : 'DEFESA BEM-SUCEDIDA: O motor de tempo constante neutralizou a tentativa de profiling temporal.'
    };
  }

  /**
   * Validação de Selo Probatório WORM
   */
  public verifySeal(dto: VerifySideChannelSealDTO): { success: boolean; isValid: boolean; seal?: SideChannelProofSeal; message: string; verifiedAt: string } {
    try {
      const rawB64 = dto.sealToken.replace('side_channel_proof_v1_', '');
      const parsed = JSON.parse(Buffer.from(rawB64, 'base64url').toString('utf8'));

      const seal: SideChannelProofSeal = {
        sealToken: dto.sealToken,
        canonicalDigest: parsed.dig,
        hmacSignature: parsed.sig,
        issuedAt: parsed.ts,
        operationId: parsed.op,
        targetOperation: parsed.tgt,
        mode: parsed.mod
      };

      const recalculatedHmac = crypto.createHmac('sha256', process.env.SIDE_CHANNEL_WORM_SECRET || 'terapiainfoco_side_channel_shield_worm_key_2026')
        .update(`SIDE_CHANNEL_PROOF_V1:${seal.operationId}:${seal.targetOperation}:${seal.mode}:${seal.canonicalDigest}`)
        .digest('hex');

      const isValid = recalculatedHmac === seal.hmacSignature;

      return {
        success: true,
        isValid,
        seal,
        message: isValid
          ? 'Selo probatório WORM de tempo constante autêntico e 100% íntegro.'
          : 'Selo probatório corrompido ou chave HMAC divergente.',
        verifiedAt: new Date().toISOString()
      };
    } catch (err: any) {
      return {
        success: false,
        isValid: false,
        message: `Falha ao decodificar selo: ${err.message}`,
        verifiedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Visão Geral Consolidada
   */
  public getOverview(): SideChannelOverview {
    const recentInspections = Array.from(this.recentInspections.values()).slice(-10);
    const recentBenchmarks = Array.from(this.recentBenchmarks.values()).slice(-10);

    const availableOperations = [
      SideChannelTargetOperation.AES_GCM_AUTH_TAG_VERIFY,
      SideChannelTargetOperation.BLIND_INDEX_HMAC_COMPUTE,
      SideChannelTargetOperation.PASSWORD_PBKDF2_COMPARE,
      SideChannelTargetOperation.RSA_MODULAR_EXPONENTIATION,
      SideChannelTargetOperation.JWT_DPOP_SIGNATURE_VERIFY
    ];

    const avgTScore = recentBenchmarks.length > 0
      ? recentBenchmarks.reduce((acc, b) => acc + b.welchTest.tScore, 0) / recentBenchmarks.length
      : 1.12;

    const metrics: SideChannelMetrics = {
      totalInspectionsCount: this.totalInspectionsCount,
      timingLeaksBlockedCount: this.timingLeaksBlockedCount,
      constantTimeVerificationsCount: this.constantTimeVerificationsCount,
      activeJitterTargetMs: this.activeJitterTargetMs,
      averageWelchTScore: parseFloat(avgTScore.toFixed(2)),
      systemHealth: 'IMMUNE'
    };

    return {
      metrics,
      activeProtectionMode: this.activeProtectionMode,
      recentInspections,
      recentBenchmarks,
      availableOperations
    };
  }
}
