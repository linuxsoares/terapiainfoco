import {
  SecureBuffer,
  inspectHeapSpraying,
  createMemoryZeroizationProofSeal,
  verifyMemoryZeroizationProofSeal
} from '@terapiainfoco/crypto';
import {
  AuditAction,
  AuditResourceType,
  MemorySanitizationAlgorithm,
  SecureBufferState
} from '@terapiainfoco/shared';
import type {
  SecureMemoryBlock,
  HeapSprayingInspectionResult,
  MemoryZeroizationProofSeal,
  SecureMemoryMetrics,
  SecureMemoryOverview
} from '@terapiainfoco/shared';
import { AuditService } from './auditService';

export class SecureMemoryService {
  private static instance: SecureMemoryService;
  private activeBuffers: Map<string, SecureBuffer> = new Map();
  private recentSeals: MemoryZeroizationProofSeal[] = [];
  private metrics: SecureMemoryMetrics = {
    activeAllocatedBlocks: 0,
    totalBytesInSecureHeap: 0,
    totalZeroizedBlocks: 0,
    heapSprayingAttemptsBlocked: 0,
    autoPurgedExpiredDeks: 0,
    averageBlockLifespanMs: 0
  };

  private lifespanHistory: number[] = [];

  private constructor() {
    this.seedInitialClinicalBuffers();
  }

  public static getInstance(): SecureMemoryService {
    if (!SecureMemoryService.instance) {
      SecureMemoryService.instance = new SecureMemoryService();
    }
    return SecureMemoryService.instance;
  }

  /**
   * Inicializa buffers seguros representativos de operações clínicas e criptográficas
   */
  private seedInitialClinicalBuffers(): void {
    // 1. DEK para Prontuário SOAP Cifrado (AES-256-GCM)
    const dekSoap = new SecureBuffer('DEK_EHR_SOAP_ENCRYPT', 32, 120000, 'mock_dek_aes256_soap_payload_01');
    this.activeBuffers.set(dekSoap.id, dekSoap);

    // 2. Chave de Sessão WebRTC (DTLS-SRTP Key)
    const webrtcKey = new SecureBuffer('WEBRTC_SRTP_MEDIA_KEY', 32, 180000, 'mock_webrtc_srtp_master_key_02');
    this.activeBuffers.set(webrtcKey.id, webrtcKey);

    // 3. Chave Privada Efêmera para Assinatura ICP-Brasil
    const sigKey = new SecureBuffer('ICP_BRASIL_EPHEMERAL_KEY', 64, 300000, 'mock_icp_brasil_ec_private_key_03');
    this.activeBuffers.set(sigKey.id, sigKey);

    // 4. Segredo HMAC de 2FA TOTP
    const totpSecret = new SecureBuffer('TOTP_HMAC_MASTER_SECRET', 32, 240000, 'mock_totp_rfc6238_base32_secret');
    this.activeBuffers.set(totpSecret.id, totpSecret);

    // Cria um exemplo de bloco já sanitizado com selo para a trilha WORM
    const historicBuf = new SecureBuffer('HISTORIC_PURGED_DEK', 32, 1000, 'historic_clinical_secret');
    const passes = historicBuf.zeroize(MemorySanitizationAlgorithm.NIST_SP_800_88_OVERWRITE);
    const initialSeal = createMemoryZeroizationProofSeal(
      historicBuf.toMetadata(),
      MemorySanitizationAlgorithm.NIST_SP_800_88_OVERWRITE,
      passes
    );
    this.recentSeals.push(initialSeal);
    this.metrics.totalZeroizedBlocks = 1;

    this.recalculateMetrics();
  }

  /**
   * Recalcula métricas ativas de memória
   */
  private recalculateMetrics(): void {
    let activeCount = 0;
    let totalBytes = 0;

    for (const buf of this.activeBuffers.values()) {
      if (buf.state === SecureBufferState.ALLOCATED || buf.state === SecureBufferState.ACTIVE) {
        activeCount++;
        totalBytes += buf.byteLength;
      }
    }

    this.metrics.activeAllocatedBlocks = activeCount;
    this.metrics.totalBytesInSecureHeap = totalBytes;

    if (this.lifespanHistory.length > 0) {
      const sum = this.lifespanHistory.reduce((a, b) => a + b, 0);
      this.metrics.averageBlockLifespanMs = Math.round(sum / this.lifespanHistory.length);
    }
  }

  /**
   * Aloca um novo buffer de memória segura (NIST SP 800-88 & OWASP ASVS)
   */
  public async allocateSecureBuffer(
    tag: string,
    sizeBytes: number,
    ttlMs: number = 60000,
    initialContentHex?: string,
    userId: string = 'system',
    ip: string = '127.0.0.1'
  ): Promise<SecureMemoryBlock> {
    const initialBytes = initialContentHex ? Buffer.from(initialContentHex, 'hex') : undefined;
    const buf = new SecureBuffer(tag, sizeBytes, ttlMs, initialBytes);
    this.activeBuffers.set(buf.id, buf);

    this.recalculateMetrics();

    AuditService.log({
      actorId: userId,
      action: AuditAction.SECURE_MEMORY_ALLOCATED,
      resourceType: AuditResourceType.SECURE_MEMORY_SHIELD,
      resourceId: buf.id,
      ipAddress: ip
    });

    return buf.toMetadata();
  }

  /**
   * Sanitiza e destrói um bloco de memória segura de forma determinística
   */
  public async zeroizeSecureBuffer(
    blockId: string,
    algorithm: MemorySanitizationAlgorithm = MemorySanitizationAlgorithm.NIST_SP_800_88_OVERWRITE,
    userId: string = 'system',
    ip: string = '127.0.0.1'
  ): Promise<MemoryZeroizationProofSeal> {
    const buf = this.activeBuffers.get(blockId);
    if (!buf) {
      throw new Error(`Bloco de memória segura não encontrado: ${blockId}`);
    }

    const passes = buf.zeroize(algorithm);
    const lifespan = Date.now() - new Date(buf.allocatedAt).getTime();
    this.lifespanHistory.push(lifespan);

    const seal = createMemoryZeroizationProofSeal(buf.toMetadata(), algorithm, passes);
    this.recentSeals.unshift(seal);
    if (this.recentSeals.length > 50) {
      this.recentSeals.pop();
    }

    this.metrics.totalZeroizedBlocks++;
    this.recalculateMetrics();

    AuditService.log({
      actorId: userId,
      action: AuditAction.SECURE_MEMORY_ZEROIZED,
      resourceType: AuditResourceType.SECURE_MEMORY_SHIELD,
      resourceId: buf.id,
      ipAddress: ip
    });

    return seal;
  }

  /**
   * Inspeciona payload contra ataques de Heap Spraying e NOP sleds
   */
  public async inspectPayloadHeapSpraying(
    payload: string,
    sampleTag: string = 'CLINICAL_PAYLOAD_INPUT',
    userId: string = 'system',
    ip: string = '127.0.0.1'
  ): Promise<{ inspection: HeapSprayingInspectionResult; auditLogged: boolean }> {
    const inspection = inspectHeapSpraying(payload);
    let auditLogged = false;

    if (inspection.isSprayingDetected) {
      this.metrics.heapSprayingAttemptsBlocked++;

      AuditService.log({
        actorId: userId,
        action: AuditAction.HEAP_SPRAYING_DETECTED,
        resourceType: AuditResourceType.SECURE_MEMORY_SHIELD,
        resourceId: `spray-sample-${Date.now().toString(36)}`,
        ipAddress: ip
      });

      AuditService.log({
        actorId: userId,
        action: AuditAction.HEAP_SPRAYING_BLOCKED,
        resourceType: AuditResourceType.SECURE_MEMORY_SHIELD,
        resourceId: `spray-block-${Date.now().toString(36)}`,
        ipAddress: ip
      });

      auditLogged = true;
    }

    return { inspection, auditLogged };
  }

  /**
   * Expurgamento automático de DEKs cujo tempo de vida (TTL) expirou
   */
  public async purgeExpiredDeks(userId: string = 'system', ip: string = '127.0.0.1'): Promise<{ purgedCount: number; purgedBlockIds: string[] }> {
    const now = Date.now();
    const purgedBlockIds: string[] = [];

    for (const [id, buf] of this.activeBuffers.entries()) {
      if (buf.state !== SecureBufferState.ZEROIZED && buf.isExpired(now)) {
        const passes = buf.zeroize(MemorySanitizationAlgorithm.NIST_SP_800_88_OVERWRITE);
        const seal = createMemoryZeroizationProofSeal(buf.toMetadata(), MemorySanitizationAlgorithm.NIST_SP_800_88_OVERWRITE, passes);
        this.recentSeals.unshift(seal);

        purgedBlockIds.push(id);
        this.metrics.autoPurgedExpiredDeks++;
        this.metrics.totalZeroizedBlocks++;

        AuditService.log({
          actorId: userId,
          action: AuditAction.DEK_EXPIRATION_PURGED,
          resourceType: AuditResourceType.SECURE_MEMORY_SHIELD,
          resourceId: id,
          ipAddress: ip
        });
      }
    }

    this.recalculateMetrics();

    return {
      purgedCount: purgedBlockIds.length,
      purgedBlockIds
    };
  }

  /**
   * Verificação notarial independente de selo de sanitização de memória
   */
  public async verifyZeroizationSeal(
    proofSealToken: string,
    userId: string = 'system',
    ip: string = '127.0.0.1'
  ): Promise<{ isValid: boolean; seal?: MemoryZeroizationProofSeal; message: string; verifiedAt: string }> {
    const seal = this.recentSeals.find(s => s.token === proofSealToken);

    if (!seal) {
      return {
        isValid: false,
        message: `Selo probatório de sanitização não localizado no cartório WORM: ${proofSealToken}`,
        verifiedAt: new Date().toISOString()
      };
    }

    const verification = verifyMemoryZeroizationProofSeal(seal);

    AuditService.log({
      actorId: userId,
      action: AuditAction.MEMORY_ZEROIZATION_SEAL_VERIFIED,
      resourceType: AuditResourceType.SECURE_MEMORY_SHIELD,
      resourceId: seal.token,
      ipAddress: ip
    });

    return {
      isValid: verification.isValid,
      seal,
      message: verification.message,
      verifiedAt: verification.verifiedAt
    };
  }

  /**
   * Visão Geral da Blindagem de Memória & Prevenção de Heap Spraying
   */
  public getOverview(): SecureMemoryOverview {
    this.recalculateMetrics();

    const activeBlocks: SecureMemoryBlock[] = [];
    for (const buf of this.activeBuffers.values()) {
      activeBlocks.push(buf.toMetadata());
    }

    let systemStatus: 'SHIELDED' | 'WARNING' | 'ALERT' = 'SHIELDED';
    if (this.metrics.heapSprayingAttemptsBlocked > 10) {
      systemStatus = 'ALERT';
    } else if (this.metrics.heapSprayingAttemptsBlocked > 0) {
      systemStatus = 'WARNING';
    }

    return {
      metrics: { ...this.metrics },
      activeBlocks,
      recentZeroizationSeals: [...this.recentSeals],
      systemStatus
    };
  }
}

export const secureMemoryService = SecureMemoryService.getInstance();
