import {
  AuditAction,
  AuditResourceType,
  PowDifficultyTier,
  BruteForceThreatCategory,
  type PowChallenge,
  type PowDefenseOverview,
  type BruteForceIpReputation,
  type SubmitPowSolutionDTO,
  type SubmitPowSolutionResponse,
  type SimulateBruteForceAttackDTO,
  type SimulateBruteForceAttackResponse,
  type ResetIpReputationDTO,
  type ResetIpReputationResponse,
  type RequestPowChallengeResponse
} from '@terapiainfoco/shared';
import {
  generatePowChallenge,
  verifyPowSolution,
  calculateDynamicDifficulty,
  generatePowDefenseSeal,
  verifyPowDefenseSeal
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class BruteForcePowService {
  private static instance: BruteForcePowService;

  private ipReputations: Map<string, BruteForceIpReputation> = new Map();
  private totalChallengesIssued = 0;
  private totalChallengesSolved = 0;
  private automatedAttacksMitigated = 0;
  private solveTimesMs: number[] = [];
  private consumedChallenges: Set<string> = new Set();

  private constructor() {
    this.seedDemoData();
  }

  public static getInstance(): BruteForcePowService {
    if (!BruteForcePowService.instance) {
      BruteForcePowService.instance = new BruteForcePowService();
    }
    return BruteForcePowService.instance;
  }

  /**
   * Inicializa dados de reputação de IP para demonstração e testes
   */
  public seedDemoData(): void {
    this.ipReputations.clear();
    this.consumedChallenges.clear();
    this.solveTimesMs = [45, 62, 58, 120, 84, 52];
    this.totalChallengesIssued = 142;
    this.totalChallengesSolved = 138;
    this.automatedAttacksMitigated = 39;

    const now = Date.now();

    // 1. IP Seguro (Acesso normal)
    this.ipReputations.set('189.120.45.10', {
      ipAddress: '189.120.45.10',
      failedAttemptsCount: 0,
      lastAttemptAt: new Date(now - 3600000 * 2).toISOString(),
      currentDifficultyTier: PowDifficultyTier.NONE,
      isBlocked: false
    });

    // 2. IP com Atipicidade Leve
    this.ipReputations.set('177.18.230.88', {
      ipAddress: '177.18.230.88',
      failedAttemptsCount: 4,
      lastAttemptAt: new Date(now - 60000 * 15).toISOString(),
      currentDifficultyTier: PowDifficultyTier.LOW,
      isBlocked: false,
      threatCategory: BruteForceThreatCategory.DICTIONARY_ATTACK
    });

    // 3. IP em Quarentena / Botnet de Credential Stuffing
    const botSeal = generatePowDefenseSeal({
      challengeId: 'pow_chal_botnet_quarantine_01',
      clientIp: '198.51.100.99',
      difficulty: 6,
      nonce: 16729014,
      verifiedAt: new Date(now - 3600000 * 4).toISOString()
    });

    this.ipReputations.set('198.51.100.99', {
      ipAddress: '198.51.100.99',
      failedAttemptsCount: 28,
      lastAttemptAt: new Date(now - 60000 * 5).toISOString(),
      currentDifficultyTier: PowDifficultyTier.MAXIMUM,
      isBlocked: true,
      blockedUntil: new Date(now + 3600000 * 24).toISOString(),
      threatCategory: BruteForceThreatCategory.CREDENTIAL_STUFFING,
      lastProofSeal: botSeal
    });
  }

  /**
   * Obtém a visão geral do sistema de defesa contra força bruta
   */
  public getOverview(): PowDefenseOverview {
    const list = Array.from(this.ipReputations.values());
    const blockedCount = list.filter(ip => ip.isBlocked).length;

    let threatLevel: 'LOW' | 'ELEVATED' | 'CRITICAL' = 'LOW';
    if (blockedCount >= 5 || this.automatedAttacksMitigated >= 50) {
      threatLevel = 'CRITICAL';
    } else if (blockedCount >= 1 || list.some(ip => ip.currentDifficultyTier === PowDifficultyTier.HIGH)) {
      threatLevel = 'ELEVATED';
    }

    const avgSolve = this.solveTimesMs.length > 0
      ? Math.round(this.solveTimesMs.reduce((a, b) => a + b, 0) / this.solveTimesMs.length)
      : 55;

    return {
      totalChallengesIssued: this.totalChallengesIssued,
      totalChallengesSolved: this.totalChallengesSolved,
      automatedAttacksMitigated: this.automatedAttacksMitigated,
      activeIpQuarantinesCount: blockedCount,
      currentSystemThreatLevel: threatLevel,
      averageSolveTimeMs: avgSolve,
      recentIpIncidents: list.sort((a, b) => new Date(b.lastAttemptAt).getTime() - new Date(a.lastAttemptAt).getTime())
    };
  }

  /**
   * Emite um desafio PoW adaptado ao perfil de risco e histórico do IP
   */
  public requestChallenge(clientIp = '189.120.45.10'): RequestPowChallengeResponse {
    let rep = this.ipReputations.get(clientIp);
    if (!rep) {
      rep = {
        ipAddress: clientIp,
        failedAttemptsCount: 0,
        lastAttemptAt: new Date().toISOString(),
        currentDifficultyTier: PowDifficultyTier.NONE,
        isBlocked: false
      };
      this.ipReputations.set(clientIp, rep);
    }

    const isSubnetThreat = clientIp.startsWith('198.51.');
    const { difficulty, tier } = calculateDynamicDifficulty(rep.failedAttemptsCount, isSubnetThreat);

    rep.currentDifficultyTier = tier;
    this.totalChallengesIssued++;

    const challenge = generatePowChallenge({
      difficulty,
      ttlSeconds: 120,
      clientIp
    });

    if (difficulty > 0) {
      AuditService.log({
        actorId: 'POW_SENTINEL',
        resourceType: AuditResourceType.BRUTE_FORCE_DEFENSE,
        resourceId: challenge.challengeId,
        action: AuditAction.POW_CHALLENGE_ISSUED,
        ipAddress: clientIp,
        userAgent: `Difficulty: ${difficulty} (Tier: ${tier})`
      });
    }

    return {
      success: true,
      challenge,
      requiresPoW: difficulty > 0,
      difficulty
    };
  }

  /**
   * Valida a Prova de Trabalho resolvida pelo cliente
   */
  public verifySolution(
    dto: SubmitPowSolutionDTO,
    clientIp = '189.120.45.10'
  ): SubmitPowSolutionResponse {
    const { challenge, nonce, clientDurationMs } = dto;

    // 1. Prevenção de Replay Attack (cada desafio só pode ser consumido uma vez)
    if (this.consumedChallenges.has(challenge.challengeId)) {
      AuditService.log({
        actorId: 'UNAUTHORIZED_REPLAY_ATTACKER',
        resourceType: AuditResourceType.BRUTE_FORCE_DEFENSE,
        resourceId: challenge.challengeId,
        action: AuditAction.BRUTE_FORCE_BLOCKED,
        ipAddress: clientIp,
        userAgent: 'Tentativa de reuso de desafio PoW já consumido (Replay Attack)'
      });

      return {
        success: false,
        verification: {
          isValid: false,
          difficulty: challenge.difficulty,
          verifiedAt: new Date().toISOString(),
          error: 'Desafio PoW já consumido anteriormente. Ataque de repetição bloqueado.'
        },
        message: 'Tentativa de repetição (Replay Attack) interceptada pelo sentinela PoW.'
      };
    }

    const verification = verifyPowSolution(challenge, nonce, clientIp);

    let rep = this.ipReputations.get(clientIp);
    if (!rep) {
      rep = {
        ipAddress: clientIp,
        failedAttemptsCount: 0,
        lastAttemptAt: new Date().toISOString(),
        currentDifficultyTier: PowDifficultyTier.NONE,
        isBlocked: false
      };
      this.ipReputations.set(clientIp, rep);
    }

    rep.lastAttemptAt = new Date().toISOString();

    if (!verification.isValid) {
      rep.failedAttemptsCount += 1;
      const { tier } = calculateDynamicDifficulty(rep.failedAttemptsCount);
      rep.currentDifficultyTier = tier;
      if (rep.failedAttemptsCount >= 20) {
        rep.isBlocked = true;
        rep.blockedUntil = new Date(Date.now() + 3600000 * 2).toISOString();
      }

      AuditService.log({
        actorId: 'FAILED_POW_ATTACKER',
        resourceType: AuditResourceType.BRUTE_FORCE_DEFENSE,
        resourceId: challenge.challengeId,
        action: AuditAction.BRUTE_FORCE_BLOCKED,
        ipAddress: clientIp,
        userAgent: verification.error || 'Solução PoW inválida'
      });

      return {
        success: false,
        verification,
        message: `Solução PoW rejeitada: ${verification.error}`
      };
    }

    // Marca como consumido
    this.consumedChallenges.add(challenge.challengeId);
    this.totalChallengesSolved++;

    if (clientDurationMs) {
      this.solveTimesMs.push(clientDurationMs);
      if (this.solveTimesMs.length > 50) this.solveTimesMs.shift();
    }

    // Se resolveu com sucesso um desafio não trivial, atenua falhas
    if (challenge.difficulty > 0 && rep.failedAttemptsCount > 0) {
      rep.failedAttemptsCount = Math.max(0, rep.failedAttemptsCount - 2);
      const { tier } = calculateDynamicDifficulty(rep.failedAttemptsCount);
      rep.currentDifficultyTier = tier;
      if (rep.failedAttemptsCount < 10) {
        rep.isBlocked = false;
        rep.blockedUntil = undefined;
      }
    }

    // Gera selo probatório WORM de mitigação/validação
    const defenseSeal = generatePowDefenseSeal({
      challengeId: challenge.challengeId,
      clientIp,
      difficulty: challenge.difficulty,
      nonce,
      verifiedAt: verification.verifiedAt
    });

    rep.lastProofSeal = defenseSeal;

    AuditService.log({
      actorId: 'POW_SENTINEL',
      resourceType: AuditResourceType.BRUTE_FORCE_DEFENSE,
      resourceId: challenge.challengeId,
      action: AuditAction.POW_SOLUTION_VERIFIED,
      ipAddress: clientIp,
      userAgent: `Solved PoW Difficulty ${challenge.difficulty} (Nonce: ${nonce})`
    });

    return {
      success: true,
      verification,
      defenseSeal,
      message: 'Prova de Trabalho criptográfica validada com sucesso em O(1).'
    };
  }

  /**
   * Simula ataque massivo de força bruta ou credential stuffing
   */
  public simulateAttack(dto: SimulateBruteForceAttackDTO): SimulateBruteForceAttackResponse {
    const ipAddress = dto.ipAddress || '198.51.100.77';
    const attemptsCount = dto.attemptsCount || 25;
    const nowIso = new Date().toISOString();

    let rep = this.ipReputations.get(ipAddress);
    if (!rep) {
      rep = {
        ipAddress,
        failedAttemptsCount: 0,
        lastAttemptAt: nowIso,
        currentDifficultyTier: PowDifficultyTier.NONE,
        isBlocked: false,
        threatCategory: dto.threatCategory
      };
      this.ipReputations.set(ipAddress, rep);
    }

    rep.failedAttemptsCount += attemptsCount;
    rep.lastAttemptAt = nowIso;
    rep.threatCategory = dto.threatCategory;

    const { difficulty, tier } = calculateDynamicDifficulty(rep.failedAttemptsCount);
    rep.currentDifficultyTier = tier;
    rep.isBlocked = true;
    rep.blockedUntil = new Date(Date.now() + 3600000 * 24).toISOString();

    this.automatedAttacksMitigated += attemptsCount;

    const defenseSeal = generatePowDefenseSeal({
      challengeId: `pow_chal_sim_attack_${Date.now()}`,
      clientIp: ipAddress,
      difficulty,
      nonce: 1048576,
      verifiedAt: nowIso
    });

    rep.lastProofSeal = defenseSeal;

    AuditService.log({
      actorId: 'SYSTEM_BRUTE_FORCE_SENTINEL',
      resourceType: AuditResourceType.BRUTE_FORCE_DEFENSE,
      resourceId: ipAddress,
      action: AuditAction.POW_DEFENSE_TRIGGERED,
      ipAddress,
      userAgent: `Simulated ${dto.threatCategory}: ${attemptsCount} attempts contained by PoW difficulty ${difficulty} (${tier})`
    });

    AuditService.log({
      actorId: 'SYSTEM_BRUTE_FORCE_SENTINEL',
      resourceType: AuditResourceType.BRUTE_FORCE_DEFENSE,
      resourceId: ipAddress,
      action: AuditAction.BRUTE_FORCE_BLOCKED,
      ipAddress,
      userAgent: `IP placed in dynamic quarantine. PoW barrier enforced.`
    });

    return {
      success: true,
      attackSimulated: true,
      attemptsBlocked: attemptsCount,
      finalDifficultyTier: tier,
      finalDifficulty: difficulty,
      defenseSeal,
      ipReputation: rep,
      message: `Ataque ${dto.threatCategory} contido! ${attemptsCount} requisições foram freadas pela barreira de Prova de Trabalho PoW (${tier}). IP colocado em quarentena.`
    };
  }

  /**
   * Reseta a reputação de um IP desbloqueando-o administrativamente
   */
  public resetIpReputation(
    dto: ResetIpReputationDTO,
    operator = 'user-admin-001'
  ): ResetIpReputationResponse {
    const rep = this.ipReputations.get(dto.ipAddress);
    if (!rep) {
      throw new Error(`IP ${dto.ipAddress} não encontrado no registro de reputação.`);
    }

    rep.failedAttemptsCount = 0;
    rep.currentDifficultyTier = PowDifficultyTier.NONE;
    rep.isBlocked = false;
    rep.blockedUntil = undefined;
    rep.lastAttemptAt = new Date().toISOString();

    AuditService.log({
      actorId: operator,
      resourceType: AuditResourceType.BRUTE_FORCE_DEFENSE,
      resourceId: dto.ipAddress,
      action: AuditAction.IP_QUARANTINE_RESET,
      ipAddress: dto.ipAddress,
      userAgent: `Justificativa formal: ${dto.reason}`
    });

    return {
      success: true,
      ipAddress: dto.ipAddress,
      message: `Quarentena do IP ${dto.ipAddress} removida com sucesso e histórico resetado.`
    };
  }

  /**
   * Valida a fé pública pericial de um selo de defesa emitido
   */
  public verifyDefenseSeal(seal: string) {
    return verifyPowDefenseSeal(seal);
  }
}
