import crypto from 'node:crypto';
import {
  AuditAction,
  AuditResourceType,
  WatermarkPatternType,
  WatermarkExtractionConfidence,
  VisualWatermarkTarget,
  WatermarkEmbeddingStrength
} from '@terapiainfoco/shared';
import type {
  VisualWatermarkSeed,
  VisualWatermarkProofSeal,
  WatermarkEmbeddingResult,
  LeakExtractionResult,
  VisualWatermarkIncident,
  VisualWatermarkMetrics,
  VisualWatermarkOverview,
  CreateWatermarkSeedDTO,
  EmbedVisualWatermarkDTO,
  ExtractLeakSourceDTO,
  SimulateScreenLeakDTO,
  UpdateWatermarkStrengthDTO,
  VerifyVisualWatermarkSealDTO
} from '@terapiainfoco/shared';
import {
  generateWatermarkSeed,
  embedVisualWatermark,
  extractLeakSource,
  simulateScreenLeakAttack,
  verifyVisualWatermarkProofSeal,
  createVisualWatermarkProofSeal
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class VisualWatermarkService {
  private static instance: VisualWatermarkService;

  private activeStrength: WatermarkEmbeddingStrength = WatermarkEmbeddingStrength.BALANCED_RESILIENT;
  private activeSeeds: Map<string, VisualWatermarkSeed> = new Map();
  private recentIncidents: Map<string, VisualWatermarkIncident> = new Map();

  // Métricas agregadas
  private framesWatermarkedCount: number = 0;
  private leakInvestigationsCount: number = 0;
  private leaksPositivelyIdentifiedCount: number = 0;
  private totalPsnrSum: number = 0;
  private totalSsimSum: number = 0;

  private constructor() {
    this.seedDefaultData();
  }

  public static getInstance(): VisualWatermarkService {
    if (!VisualWatermarkService.instance) {
      VisualWatermarkService.instance = new VisualWatermarkService();
    }
    return VisualWatermarkService.instance;
  }

  /**
   * Semeia sessões ativas para demonstração inicial
   */
  private seedDefaultData(): void {
    const demoSessions = [
      {
        crp: '06/987654',
        patientId: 'paciente_ana_clara_101',
        sessionId: 'room_telepsi_sala_01',
        target: VisualWatermarkTarget.WEBRTC_VIDEO_STREAM,
        pattern: WatermarkPatternType.QUASI_ORTHOGONAL_PN
      },
      {
        crp: '06/987654',
        patientId: 'paciente_roberto_souza_202',
        sessionId: 'room_telepsi_sala_02',
        target: VisualWatermarkTarget.CLINICAL_PRONTUARY_PRINT,
        pattern: WatermarkPatternType.QUASI_ORTHOGONAL_PN
      },
      {
        crp: '06/112233',
        patientId: 'paciente_mariana_lima_303',
        sessionId: 'room_telepsi_sala_03',
        target: VisualWatermarkTarget.PRESCRIPTION_PDF_CANVAS,
        pattern: WatermarkPatternType.QUASI_ORTHOGONAL_PN
      }
    ];

    for (const demo of demoSessions) {
      const seed = generateWatermarkSeed({
        therapistCrp: demo.crp,
        patientId: demo.patientId,
        sessionId: demo.sessionId,
        target: demo.target,
        patternType: demo.pattern,
        strength: this.activeStrength
      });
      this.activeSeeds.set(seed.seedId, seed);

      // Simula frame marcado
      const width = 64;
      const height = 64;
      const frame = new Uint8Array(width * height);
      for (let i = 0; i < frame.length; i++) {
        frame[i] = 120 + ((i * 19) % 35);
      }
      const { result } = embedVisualWatermark(seed, frame, width, height);
      this.framesWatermarkedCount += 12;
      this.totalPsnrSum += result.psnrDb;
      this.totalSsimSum += result.ssimScore;
    }

    // Incidente de demonstração arquivado na trilha forense
    const seedDemo = Array.from(this.activeSeeds.values())[0];
    const demoSeal = createVisualWatermarkProofSeal({
      verificationId: 'inc_demo_leak_001',
      target: seedDemo.target,
      patternType: seedDemo.patternType,
      details: {
        sessionId: seedDemo.sessionId,
        therapistCrp: seedDemo.therapistCrp,
        correlation: 0.285
      }
    });

    this.recentIncidents.set('inc_demo_leak_001', {
      id: 'inc_demo_leak_001',
      sourceSuspect: 'Captura externa não autorizada em dispositivo secundário',
      target: VisualWatermarkTarget.WEBRTC_VIDEO_STREAM,
      correlationScore: 0.285,
      confidence: WatermarkExtractionConfidence.DEFINITIVE_MATCH,
      identifiedTherapistCrp: seedDemo.therapistCrp,
      identifiedPatientMasked: seedDemo.patientIdMasked,
      proofSeal: demoSeal,
      timestamp: new Date(Date.now() - 3600000).toISOString()
    });
    this.leakInvestigationsCount = 1;
    this.leaksPositivelyIdentifiedCount = 1;
  }

  /**
   * Obtém a visão geral e métricas operacionais
   */
  public getOverview(): VisualWatermarkOverview {
    const activeSeedsList = Array.from(this.activeSeeds.values());
    const incidentsList = Array.from(this.recentIncidents.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const averagePsnrDb = this.framesWatermarkedCount > 0
      ? Math.round((this.totalPsnrSum / Math.max(1, this.activeSeeds.size)) * 100) / 100
      : 48.5;

    const averageSsimScore = this.framesWatermarkedCount > 0
      ? Math.round((this.totalSsimSum / Math.max(1, this.activeSeeds.size)) * 10000) / 10000
      : 0.992;

    const metrics: VisualWatermarkMetrics = {
      activeWatermarkedSessionsCount: this.activeSeeds.size,
      framesWatermarkedCount: this.framesWatermarkedCount,
      leakInvestigationsCount: this.leakInvestigationsCount,
      leaksPositivelyIdentifiedCount: this.leaksPositivelyIdentifiedCount,
      averagePsnrDb,
      averageSsimScore,
      systemHealth: 'IMMUNE'
    };

    return {
      metrics,
      activeSeeds: activeSeedsList,
      recentIncidents: incidentsList,
      activeStrength: this.activeStrength
    };
  }

  /**
   * Cria nova semente de marca d'água vinculada a uma teleconsulta
   */
  public async createSeed(dto: CreateWatermarkSeedDTO, userId: string = 'system_enclave'): Promise<VisualWatermarkSeed> {
    const seed = generateWatermarkSeed({
      therapistCrp: dto.therapistCrp,
      patientId: dto.patientId,
      sessionId: dto.sessionId,
      target: dto.target,
      patternType: dto.patternType,
      strength: dto.strength || this.activeStrength
    });

    this.activeSeeds.set(seed.seedId, seed);

    await AuditService.log({
      action: AuditAction.VISUAL_WATERMARK_EMBEDDED,
      resourceType: AuditResourceType.VISUAL_WATERMARK_SHIELD,
      resourceId: seed.seedId,
      actorId: userId,
      details: {
        sessionId: seed.sessionId,
        therapistCrp: seed.therapistCrp,
        target: seed.target,
        patternType: seed.patternType
      }
    });

    return seed;
  }

  /**
   * Injeta a marca d'água em um quadro de vídeo ou tela clínica
   */
  public async embedWatermark(
    dto: EmbedVisualWatermarkDTO,
    userId: string = 'system_enclave'
  ): Promise<WatermarkEmbeddingResult> {
    const seed = this.activeSeeds.get(dto.seedId);
    if (!seed) {
      throw new Error(`Semente de marca d'água '${dto.seedId}' não encontrada ou expirada.`);
    }

    const width = dto.width || 64;
    const height = dto.height || 64;
    const pixelCount = width * height;

    let inputBuffer: Uint8Array;
    if (dto.frameData) {
      inputBuffer = Buffer.from(dto.frameData, 'base64');
    } else {
      inputBuffer = new Uint8Array(pixelCount);
      for (let i = 0; i < pixelCount; i++) {
        inputBuffer[i] = 120 + ((i * 17) % 40);
      }
    }

    const { result } = embedVisualWatermark(seed, inputBuffer, width, height);
    this.framesWatermarkedCount++;
    this.totalPsnrSum += result.psnrDb;
    this.totalSsimSum += result.ssimScore;

    await AuditService.log({
      action: AuditAction.VISUAL_WATERMARK_EMBEDDED,
      resourceType: AuditResourceType.VISUAL_WATERMARK_SHIELD,
      resourceId: result.embeddingId,
      actorId: userId,
      details: {
        seedId: seed.seedId,
        psnrDb: result.psnrDb,
        ssimScore: result.ssimScore,
        sealToken: result.proofSeal.sealToken
      }
    });

    return result;
  }

  /**
   * Executa perícia forense de extração de vazamento
   */
  public async extractLeak(
    dto: ExtractLeakSourceDTO,
    userId: string = 'system_enclave'
  ): Promise<LeakExtractionResult> {
    this.leakInvestigationsCount++;

    const width = 64;
    const height = 64;
    let suspectBuffer: Uint8Array;

    if (dto.suspectFrameData) {
      try {
        suspectBuffer = Buffer.from(dto.suspectFrameData, 'base64');
      } catch {
        suspectBuffer = Buffer.from(dto.suspectFrameData, 'utf-8');
      }
    } else {
      suspectBuffer = new Uint8Array(width * height).fill(128);
    }

    const seedsPool = Array.from(this.activeSeeds.values());
    const result = extractLeakSource(suspectBuffer, seedsPool, width, height);

    if (result.confidence === WatermarkExtractionConfidence.DEFINITIVE_MATCH ||
        result.confidence === WatermarkExtractionConfidence.HIGH_PROBABILITY) {
      this.leaksPositivelyIdentifiedCount++;

      const incident: VisualWatermarkIncident = {
        id: `inc_${crypto.randomBytes(8).toString('hex')}`,
        sourceSuspect: 'Exfiltração de tela identificada por correlação esteganográfica NCC',
        target: dto.target || VisualWatermarkTarget.WEBRTC_VIDEO_STREAM,
        correlationScore: result.correlationScore,
        confidence: result.confidence,
        identifiedTherapistCrp: result.identifiedTherapistCrp || 'N/A',
        identifiedPatientMasked: result.identifiedPatientMasked || 'N/A',
        proofSeal: result.proofSeal,
        timestamp: new Date().toISOString()
      };
      this.recentIncidents.set(incident.id, incident);

      await AuditService.log({
        action: AuditAction.LEAK_SOURCE_IDENTIFIED,
        resourceType: AuditResourceType.VISUAL_WATERMARK_SHIELD,
        resourceId: incident.id,
        actorId: userId,
        details: {
          correlationScore: result.correlationScore,
          confidence: result.confidence,
          identifiedSessionId: result.identifiedSessionId,
          identifiedTherapistCrp: result.identifiedTherapistCrp
        }
      });
    } else {
      await AuditService.log({
        action: AuditAction.LEAK_EXTRACTION_ATTEMPTED,
        resourceType: AuditResourceType.VISUAL_WATERMARK_SHIELD,
        resourceId: result.extractionId,
        actorId: userId,
        details: {
          correlationScore: result.correlationScore,
          confidence: result.confidence
        }
      });
    }

    return result;
  }

  /**
   * Simula ataque de captura recortada com perda de alta frequência
   */
  public async simulateScreenLeak(
    dto: SimulateScreenLeakDTO,
    userId: string = 'system_enclave'
  ): Promise<{
    simulatedCrop: number;
    simulatedQuality: number;
    extractionResult: LeakExtractionResult;
    survivedAnalysis: boolean;
  }> {
    const seed = this.activeSeeds.get(dto.seedId);
    if (!seed) {
      throw new Error(`Semente de marca d'água '${dto.seedId}' não encontrada.`);
    }

    const width = 64;
    const height = 64;
    const pixelCount = width * height;
    const baseFrame = new Uint8Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      baseFrame[i] = 120 + ((i * 23) % 40);
    }

    const { watermarkedBuffer } = embedVisualWatermark(seed, baseFrame, width, height);

    const crop = dto.cropPercentage ?? 25;
    const quality = dto.compressionQuality ?? 70;
    const noiseIntensity = dto.applyNoise ? 4 : 2;

    const attackedBuffer = simulateScreenLeakAttack(watermarkedBuffer, crop, noiseIntensity);
    const extractionResult = extractLeakSource(attackedBuffer, Array.from(this.activeSeeds.values()), width, height);

    const survivedAnalysis = extractionResult.confidence !== WatermarkExtractionConfidence.NO_CORRELATION;

    await AuditService.log({
      action: AuditAction.LEAK_EXTRACTION_ATTEMPTED,
      resourceType: AuditResourceType.VISUAL_WATERMARK_SHIELD,
      resourceId: seed.seedId,
      actorId: userId,
      details: {
        crop,
        quality,
        survivedAnalysis,
        correlationScore: extractionResult.correlationScore,
        confidence: extractionResult.confidence
      }
    });

    return {
      simulatedCrop: crop,
      simulatedQuality: quality,
      extractionResult,
      survivedAnalysis
    };
  }

  /**
   * Atualiza a força operacional de injeção
   */
  public async updateStrength(
    dto: UpdateWatermarkStrengthDTO,
    userId: string = 'system_enclave'
  ): Promise<WatermarkEmbeddingStrength> {
    this.activeStrength = dto.strength;

    await AuditService.log({
      action: AuditAction.WATERMARK_POLICY_UPDATED,
      resourceType: AuditResourceType.VISUAL_WATERMARK_SHIELD,
      resourceId: 'global_policy',
      actorId: userId,
      details: { activeStrength: this.activeStrength }
    });

    return this.activeStrength;
  }

  /**
   * Valida selo probatório WORM
   */
  public verifySeal(dto: VerifyVisualWatermarkSealDTO): {
    isValid: boolean;
    message: string;
    seal?: VisualWatermarkProofSeal;
    verifiedAt: string;
  } {
    const res = verifyVisualWatermarkProofSeal(dto.sealToken);
    return {
      isValid: res.isValid,
      message: res.message,
      seal: res.isValid ? {
        sealToken: dto.sealToken,
        canonicalDigest: res.payload?.dig || '',
        hmacSignature: res.payload?.sig || '',
        issuedAt: res.payload?.iat || new Date().toISOString(),
        verificationId: res.payload?.id || '',
        target: VisualWatermarkTarget.WEBRTC_VIDEO_STREAM,
        patternType: WatermarkPatternType.QUASI_ORTHOGONAL_PN
      } : undefined,
      verifiedAt: new Date().toISOString()
    };
  }
}
