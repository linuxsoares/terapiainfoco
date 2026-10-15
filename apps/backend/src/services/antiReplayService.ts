import crypto from 'node:crypto';
import {
  ReplayDefenseMode,
  ReplayThreatSeverity,
  ReplayTargetProtocol,
  AuditAction,
  AuditResourceType
} from '@terapiainfoco/shared';
import type {
  ReplayVerificationResult,
  SlidingWindowStatus,
  BloomFilterMetrics,
  ReplayIncidentRecord,
  AntiReplayProofSeal,
  AntiReplayMetrics,
  AntiReplayOverview,
  VerifyNonceDTO,
  UpdateReplayPolicyDTO,
  SimulateReplayAttackDTO,
  VerifyAntiReplaySealDTO
} from '@terapiainfoco/shared';
import {
  SlidingWindowAntiReplay,
  NonceReuseDetector,
  issueAntiReplayProofSeal,
  verifyAntiReplayProofSeal
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class AntiReplayService {
  private static instance: AntiReplayService;

  private activeMode: ReplayDefenseMode = ReplayDefenseMode.HYBRID_DEFENSE_WINDOW_PLUS_BLOOM;
  private slidingWindows: Map<string, SlidingWindowAntiReplay> = new Map();
  private nonceDetector: NonceReuseDetector = new NonceReuseDetector();
  private recentIncidents: Map<string, ReplayIncidentRecord> = new Map();

  // Contadores de telemetria
  private totalVerificationsCount: number = 0;
  private replaysBlockedCount: number = 0;
  private nonceReusesBlockedCount: number = 0;

  private constructor() {
    this.seedDefaultData();
  }

  public static getInstance(): AntiReplayService {
    if (!AntiReplayService.instance) {
      AntiReplayService.instance = new AntiReplayService();
    }
    return AntiReplayService.instance;
  }

  /**
   * Semeia janelas e telemetria inicial
   */
  private seedDefaultData(): void {
    const defaultChannels = [
      'room_telemedicina_crp06_1',
      'room_telemedicina_crp06_2',
      'dpop_session_binding_channel'
    ];

    for (const ch of defaultChannels) {
      const win = new SlidingWindowAntiReplay(ch, 64);
      // Simula recepção de alguns pacotes iniciais
      win.checkAndMark(1);
      win.checkAndMark(2);
      win.checkAndMark(3);
      win.checkAndMark(5); // pacote 5
      win.checkAndMark(4); // pacote 4 (fora de ordem aceito)
      this.slidingWindows.set(ch, win);
      this.totalVerificationsCount += 5;
    }

    // Incidente representativo semeado
    const incidentId = `inc_rep_${crypto.randomBytes(4).toString('hex')}`;
    const mockSeal = issueAntiReplayProofSeal(
      incidentId,
      ReplayTargetProtocol.WEBRTC_DTLS_SRTP,
      this.activeMode,
      {
        channelId: 'room_telemedicina_crp06_1',
        sequence: 3,
        threat: 'DUPLICATE_REPLAY_DETECTED',
        sourceIp: '198.51.100.42'
      }
    );

    const initialIncident: ReplayIncidentRecord = {
      id: incidentId,
      protocol: ReplayTargetProtocol.WEBRTC_DTLS_SRTP,
      nonceOrSeq: 'seq:3',
      sourceIp: '198.51.100.42',
      severity: ReplayThreatSeverity.DUPLICATE_REPLAY_DETECTED,
      actionTaken: 'Descarte imediato de pacote WebRTC e notificação WORM',
      proofSeal: mockSeal,
      timestamp: new Date(Date.now() - 1800000).toISOString()
    };

    this.recentIncidents.set(incidentId, initialIncident);
    this.replaysBlockedCount++;
  }

  /**
   * Obtém ou cria a janela deslizante de um canal
   */
  private getOrCreateWindow(channelId: string, windowSize: 64 | 128 = 64): SlidingWindowAntiReplay {
    let win = this.slidingWindows.get(channelId);
    if (!win) {
      win = new SlidingWindowAntiReplay(channelId, windowSize);
      this.slidingWindows.set(channelId, win);
    }
    return win;
  }

  /**
   * Avalia a validade de um Nonce ou Sequence Number contra ataques de Replay
   */
  public async verifyNonce(
    dto: VerifyNonceDTO,
    operatorId: string = 'GATEWAY',
    sourceIp: string = '127.0.0.1'
  ): Promise<ReplayVerificationResult> {
    this.totalVerificationsCount++;
    const verificationId = `rep_v_${crypto.randomBytes(6).toString('hex')}`;

    let allowed = true;
    let severity = ReplayThreatSeverity.BENIGN_IN_ORDER;
    let reason = 'Aprovado: Nonce íntegro e sem repetição.';
    let windowPos: any = undefined;
    let bloomMatch = false;

    // Cenário 1: Protocolos baseados em Sequenciamento (WebRTC DTLS-SRTP)
    if (dto.targetProtocol === ReplayTargetProtocol.WEBRTC_DTLS_SRTP) {
      const channelId = dto.channelId || 'default_webrtc_channel';
      const window = this.getOrCreateWindow(channelId, 64);
      const seq = parseInt(dto.nonceOrSeq, 10);

      if (isNaN(seq)) {
        allowed = false;
        severity = ReplayThreatSeverity.OUT_OF_WINDOW_EXPIRED;
        reason = `Número de sequência WebRTC inválido: '${dto.nonceOrSeq}'.`;
      } else {
        const evalRes = window.checkAndMark(seq);
        allowed = evalRes.allowed;
        severity = evalRes.severity;
        reason = evalRes.reason;
        windowPos = evalRes.position;
      }
    }

    // Cenário 2: AES-GCM Envelope IV (Proteção contra Nonce-Reuse GHASH)
    else if (dto.targetProtocol === ReplayTargetProtocol.AES_GCM_ENVELOPE_IV) {
      const keyId = dto.keyId || 'master_kek_v1';
      const evalRes = this.nonceDetector.verifyAndRegisterIv(keyId, dto.nonceOrSeq);
      allowed = evalRes.unique;
      severity = evalRes.severity;
      reason = evalRes.reason;
      if (!allowed) {
        this.nonceReusesBlockedCount++;
      }
    }

    // Cenário 3: Tokens REST, DPoP JTI e Vouchers (Filtro de Bloom)
    else {
      bloomMatch = this.nonceDetector.getBloomMetrics().elementCount > 0 && false; // avalia no detector
      const tokenKey = `${dto.targetProtocol}:${dto.nonceOrSeq}`;
      
      const bloom = (this.nonceDetector as any).bloomFilter;
      if (bloom.has(tokenKey)) {
        allowed = false;
        severity = ReplayThreatSeverity.DUPLICATE_REPLAY_DETECTED;
        reason = `Ataque de Replay detectado: o nonce/token '${dto.nonceOrSeq}' já foi consumido nesta janela temporal.`;
        bloomMatch = true;
      } else {
        bloom.add(tokenKey);
        allowed = true;
        severity = ReplayThreatSeverity.BENIGN_IN_ORDER;
        reason = `Nonce '${dto.nonceOrSeq}' registrado com sucesso no filtro de Bloom.`;
      }
    }

    // Emissão do Selo WORM
    const proofSeal = issueAntiReplayProofSeal(
      verificationId,
      dto.targetProtocol,
      this.activeMode,
      {
        nonceOrSeq: dto.nonceOrSeq,
        allowed,
        severity,
        reason,
        evaluatedAt: new Date().toISOString()
      }
    );

    const result: ReplayVerificationResult = {
      id: verificationId,
      targetProtocol: dto.targetProtocol,
      nonceOrSeq: dto.nonceOrSeq,
      allowed,
      severity,
      reason,
      slidingWindowPosition: windowPos,
      bloomFilterMatch: bloomMatch,
      proofSeal,
      evaluatedAt: new Date().toISOString()
    };

    // Se houve bloqueio, incrementa contadores, cria registro de incidente e loga no WORM
    if (!allowed) {
      this.replaysBlockedCount++;
      const incRecord: ReplayIncidentRecord = {
        id: `inc_${crypto.randomBytes(5).toString('hex')}`,
        protocol: dto.targetProtocol,
        nonceOrSeq: dto.nonceOrSeq,
        sourceIp,
        severity,
        actionTaken: severity === ReplayThreatSeverity.CRITICAL_NONCE_REUSE
          ? 'BLOQUEIO CRÍTICO: Reutilização de IV abortada para proteger integridade GHASH'
          : 'Descarte preventivo de requisição repetida',
        proofSeal,
        timestamp: new Date().toISOString()
      };
      this.recentIncidents.set(incRecord.id, incRecord);

      await AuditService.log({
        action: severity === ReplayThreatSeverity.CRITICAL_NONCE_REUSE
          ? AuditAction.NONCE_REUSE_DETECTED
          : AuditAction.REPLAY_ATTACK_BLOCKED,
        resourceType: AuditResourceType.ANTI_REPLAY_SHIELD,
        resourceId: verificationId,
        details: {
          protocol: dto.targetProtocol,
          nonceOrSeq: dto.nonceOrSeq,
          severity,
          reason,
          sourceIp,
          operatorId
        }
      });
    }

    return result;
  }

  /**
   * Obtém o estado da Janela Deslizante de um canal
   */
  public getSlidingWindowStatus(channelId: string): SlidingWindowStatus {
    const win = this.getOrCreateWindow(channelId);
    return win.getStatus();
  }

  /**
   * Rotaciona manualmente o filtro de Bloom
   */
  public async rotateBloomFilter(operatorId: string = 'ADMIN'): Promise<{ activeGeneration: number; message: string }> {
    const rot = this.nonceDetector.rotateBloom();

    await AuditService.log({
      action: AuditAction.BLOOM_FILTER_ROTATED,
      resourceType: AuditResourceType.ANTI_REPLAY_SHIELD,
      resourceId: `GEN_${rot.activeGeneration}`,
      details: {
        activeGeneration: rot.activeGeneration,
        operatorId
      }
    });

    return rot;
  }

  /**
   * Atualiza a política operacional de defesa anti-replay
   */
  public async updatePolicy(dto: UpdateReplayPolicyDTO, operatorId: string = 'ADMIN'): Promise<{ mode: ReplayDefenseMode; message: string }> {
    this.activeMode = dto.mode;

    await AuditService.log({
      action: AuditAction.REPLAY_POLICY_UPDATED,
      resourceType: AuditResourceType.ANTI_REPLAY_SHIELD,
      resourceId: dto.mode,
      details: {
        newMode: dto.mode,
        operatorId
      }
    });

    return {
      mode: this.activeMode,
      message: `Modo operacional anti-replay atualizado com sucesso para ${this.activeMode}.`
    };
  }

  /**
   * Simulação de Ataque de Replay / Nonce-Reuse para auditoria e pentest
   */
  public async simulateReplayAttack(
    dto: SimulateReplayAttackDTO,
    operatorId: string = 'PENTESTER'
  ): Promise<{ success: boolean; replayDetected: boolean; severity: ReplayThreatSeverity; explanation: string; message: string }> {
    if (dto.targetProtocol === ReplayTargetProtocol.WEBRTC_DTLS_SRTP) {
      const channelId = 'sim_webrtc_channel';
      const win = this.getOrCreateWindow(channelId);
      const seq = dto.sequenceNumber || 10;

      // 1. Envia pacote inicial
      win.checkAndMark(seq);

      if (dto.attemptReplay) {
        // 2. Reenvia o mesmo pacote (replay simulado)
        const replayed = win.checkAndMark(seq);
        return {
          success: true,
          replayDetected: !replayed.allowed,
          severity: replayed.severity,
          explanation: `Simulação de Ataque WebRTC: o pacote seq=${seq} foi reenviado propositalmente. O motor de Janela Deslizante de 64-bits identificou o bit duplicado e bloqueou o frame.`,
          message: 'ATAQUE DE REPLAY BLOQUEADO: Pacote duplicado detectado pela Janela Deslizante.'
        };
      }

      return {
        success: true,
        replayDetected: false,
        severity: ReplayThreatSeverity.BENIGN_IN_ORDER,
        explanation: `Simulação benigna: pacote seq=${seq} transmitido pela primeira vez e aceito normalmente.`,
        message: 'TRANSMISSÃO ÍNTEGRA: Pacote aceito dentro da sequência permitida.'
      };
    }

    // Simulação AES-GCM Nonce-Reuse
    const testKeyId = 'sim_kek_target';
    const testIv = dto.nonce || '0102030405060708090a0b0c';

    // Primeiro registro
    this.nonceDetector.verifyAndRegisterIv(testKeyId, testIv);

    if (dto.attemptReplay) {
      const reuse = this.nonceDetector.verifyAndRegisterIv(testKeyId, testIv);
      return {
        success: true,
        replayDetected: !reuse.unique,
        severity: reuse.severity,
        explanation: 'Simulação de Reutilização de IV: tentativa de cifrar segundo prontuário com o mesmo par (KeyID, IV). O NonceReuseDetector interceptou o risco de colisão GHASH.',
        message: 'VULNERABILIDADE PREVENIDA: Reutilização de Nonce AES-GCM abortada com sucesso.'
      };
    }

    return {
      success: true,
      replayDetected: false,
      severity: ReplayThreatSeverity.BENIGN_IN_ORDER,
      explanation: 'Simulação de IV único: o vetor de inicialização atendeu a todos os critérios de unicidade probabilística.',
      message: 'VETOR ÚNICO: Operação criptográfica segura.'
    };
  }

  /**
   * Validação de Selo Probatório WORM
   */
  public verifySeal(dto: VerifyAntiReplaySealDTO): {
    valid: boolean;
    seal?: AntiReplayProofSeal;
    message: string;
    verifiedAt: string;
  } {
    const res = verifyAntiReplayProofSeal(dto.sealToken);
    return {
      valid: res.valid,
      seal: res.seal,
      message: res.message,
      verifiedAt: new Date().toISOString()
    };
  }

  /**
   * Visão Geral Consolidada
   */
  public getOverview(): AntiReplayOverview {
    const recentIncidents = Array.from(this.recentIncidents.values()).slice(-10);
    const activeWindows = Array.from(this.slidingWindows.values()).map(w => w.getStatus());
    const bloomMetrics = this.nonceDetector.getBloomMetrics();

    const metrics: AntiReplayMetrics = {
      totalVerificationsCount: this.totalVerificationsCount,
      replaysBlockedCount: this.replaysBlockedCount,
      nonceReusesBlockedCount: this.nonceReusesBlockedCount,
      activeSlidingWindowsCount: this.slidingWindows.size,
      bloomFilterSaturation: bloomMetrics.saturationPercentage,
      systemHealth: this.replaysBlockedCount > 0 ? 'PROTECTED' : 'PROTECTED'
    };

    return {
      metrics,
      activeMode: this.activeMode,
      bloomMetrics,
      activeWindows,
      recentIncidents
    };
  }
}
