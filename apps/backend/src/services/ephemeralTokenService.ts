import QRCode from 'qrcode';
import {
  AuditAction,
  AuditResourceType,
  EphemeralTokenStatus,
  EphemeralTokenTarget,
  RevocationReason,
  EphemeralTokenVerificationVerdict
} from '@terapiainfoco/shared';
import type {
  EphemeralAccessToken,
  EphemeralTokenProofSeal,
  EphemeralTokenConsumptionRecord,
  EphemeralTokenMetrics,
  EphemeralTokenOverview,
  IssueEphemeralTokenDTO,
  IssueEphemeralTokenResponse,
  ConsumeEphemeralTokenDTO,
  ConsumeEphemeralTokenResponse,
  RevokeEphemeralTokenDTO,
  RevokeEphemeralTokenResponse,
  SimulateTokenIntrusionDTO,
  SimulateTokenIntrusionResponse,
  UpdateEphemeralPolicyDTO,
  UpdateEphemeralPolicyResponse,
  VerifyEphemeralTokenSealDTO,
  VerifyEphemeralTokenSealResponse
} from '@terapiainfoco/shared';
import {
  issueEphemeralAccessToken,
  verifyEphemeralAccessToken,
  createEphemeralProofSeal,
  verifyEphemeralProofSeal
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class EphemeralTokenService {
  private static instance: EphemeralTokenService;

  private tokens: Map<string, EphemeralAccessToken> = new Map();
  private tokenStringToId: Map<string, string> = new Map();
  private consumptionLogs: EphemeralTokenConsumptionRecord[] = [];

  private defaultTtlMinutes: number = 60;
  private allowConcurrentAccess: boolean = false;

  private totalTokensIssued: number = 0;
  private unauthorizedIntrusionsBlocked: number = 0;

  private constructor() {
    this.seedDefaultTokens();
  }

  public static getInstance(): EphemeralTokenService {
    if (!EphemeralTokenService.instance) {
      EphemeralTokenService.instance = new EphemeralTokenService();
    }
    return EphemeralTokenService.instance;
  }

  /**
   * Semeia tokens e salas ativas para demonstração inicial
   */
  private seedDefaultTokens(): void {
    const demoItems: IssueEphemeralTokenDTO[] = [
      {
        patientId: 'paciente_carolina_santos_101',
        therapistCrp: 'CRP-06/112233',
        roomId: 'room_telepsi_sala_01',
        target: EphemeralTokenTarget.TELECONSULTATION_ROOM,
        ttlMinutes: 60,
        validInAdvanceMinutes: 10,
        singleUse: true
      },
      {
        patientId: 'paciente_felipe_martins_202',
        therapistCrp: 'CRP-06/112233',
        roomId: 'room_telepsi_sala_02',
        target: EphemeralTokenTarget.TELECONSULTATION_ROOM,
        ttlMinutes: 45,
        validInAdvanceMinutes: 15,
        singleUse: true
      },
      {
        patientId: 'paciente_larissa_moraes_303',
        therapistCrp: 'CRP-06/445566',
        roomId: 'room_telepsi_sala_03',
        target: EphemeralTokenTarget.PRESCRIPTION_PICKUP_LINK,
        ttlMinutes: 120,
        validInAdvanceMinutes: 0,
        singleUse: true
      }
    ];

    for (const item of demoItems) {
      const { token, tokenString } = issueEphemeralAccessToken(item);
      this.tokens.set(token.tokenId, token);
      this.tokenStringToId.set(tokenString, token.tokenId);
      this.totalTokensIssued++;
    }
  }

  /**
   * Obtém a visão consolidada de tokens efêmeros e métricas
   */
  public async getOverview(): Promise<EphemeralTokenOverview> {
    const now = Math.floor(Date.now() / 1000);
    let activePending = 0;
    let consumed = 0;
    let revoked = 0;
    let expired = 0;

    const tokenList: EphemeralAccessToken[] = [];

    for (const token of this.tokens.values()) {
      const expEpoch = Math.floor(new Date(token.expiresAt).getTime() / 1000);
      const remainingSeconds = Math.max(0, expEpoch - now);

      // Atualiza status se expirou
      if (remainingSeconds === 0 && token.status === EphemeralTokenStatus.ACTIVE_PENDING) {
        token.status = EphemeralTokenStatus.EXPIRED;
      }

      token.ttlSecondsRemaining = remainingSeconds;
      tokenList.push(token);

      switch (token.status) {
        case EphemeralTokenStatus.ACTIVE_PENDING:
          activePending++;
          break;
        case EphemeralTokenStatus.CONSUMED_IN_SESSION:
          consumed++;
          break;
        case EphemeralTokenStatus.REVOKED_BY_THERAPIST:
        case EphemeralTokenStatus.REVOKED_SECURITY_BREACH:
          revoked++;
          break;
        case EphemeralTokenStatus.EXPIRED:
          expired++;
          break;
      }
    }

    const metrics: EphemeralTokenMetrics = {
      totalTokensIssued: this.totalTokensIssued,
      activePendingTokens: activePending,
      consumedTokens: consumed,
      revokedTokens: revoked,
      expiredTokens: expired,
      unauthorizedIntrusionsBlocked: this.unauthorizedIntrusionsBlocked,
      averageTokenTtlMinutes: this.defaultTtlMinutes,
      systemHealth: this.unauthorizedIntrusionsBlocked > 10 ? 'ALERT' : this.unauthorizedIntrusionsBlocked > 0 ? 'WARNING' : 'PROTECTED'
    };

    return {
      metrics,
      activeTokens: tokenList.sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime()),
      recentAccessLogs: [...this.consumptionLogs].reverse().slice(0, 20),
      defaultTtlMinutes: this.defaultTtlMinutes,
      allowConcurrentAccess: this.allowConcurrentAccess
    };
  }

  /**
   * Emite um novo token efêmero para paciente
   */
  public async issueToken(dto: IssueEphemeralTokenDTO, actorId: string): Promise<IssueEphemeralTokenResponse> {
    if (!dto.patientId || !dto.therapistCrp || !dto.roomId) {
      throw new Error('Parâmetros obrigatórios ausentes: patientId, therapistCrp e roomId.');
    }

    const ttlMinutes = dto.ttlMinutes ?? this.defaultTtlMinutes;
    const { token, tokenString, magicLink } = issueEphemeralAccessToken({
      ...dto,
      ttlMinutes
    });

    let qrCodeDataUri: string | undefined;
    try {
      qrCodeDataUri = await QRCode.toDataURL(magicLink, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 256
      });
    } catch (err) {
      // Ignora falha de renderização de QR se ocorrer
    }

    this.tokens.set(token.tokenId, token);
    this.tokenStringToId.set(tokenString, token.tokenId);
    this.totalTokensIssued++;

    // Auditoria WORM
    AuditService.log({
      actorId,
      action: AuditAction.EPHEMERAL_TOKEN_ISSUED,
      resourceType: AuditResourceType.EPHEMERAL_TOKEN_SHIELD,
      resourceId: token.tokenId,
      details: {
        tokenId: token.tokenId,
        patientBlindIndex: token.patientBlindIndex,
        therapistCrp: token.therapistCrp,
        roomId: token.roomId,
        target: token.target,
        singleUse: token.singleUse,
        ttlMinutes,
        expiresAt: token.expiresAt
      }
    });

    return {
      success: true,
      token,
      magicLink,
      qrCodeDataUri,
      message: `Credencial efêmera emitida com sucesso para a sala ${dto.roomId} (Válida por ${ttlMinutes} minutos).`
    };
  }

  /**
   * Consome um token efêmero no ingresso à teleconsulta
   */
  public async consumeToken(dto: ConsumeEphemeralTokenDTO, actorId: string): Promise<ConsumeEphemeralTokenResponse> {
    if (!dto.tokenString || !dto.roomId) {
      throw new Error('Parâmetros obrigatórios ausentes: tokenString e roomId.');
    }

    const verification = verifyEphemeralAccessToken(dto.tokenString, dto.roomId);
    const tokenId = this.tokenStringToId.get(dto.tokenString) || (verification.payload ? verification.payload.jti : 'unknown');
    const existingToken = this.tokens.get(tokenId);

    const clientIp = dto.clientIp || '189.40.122.15';
    const userAgent = dto.userAgent || 'Mozilla/5.0 (TerapiaInFoco WebRTC Client)';

    let finalVerdict = verification.verdict;
    let denialReason: string | undefined;
    let granted = false;

    if (!verification.isValid) {
      finalVerdict = verification.verdict;
      denialReason = verification.message;
      this.unauthorizedIntrusionsBlocked++;
    } else if (existingToken) {
      // Verifica se o token já foi consumido e é de uso único
      if (existingToken.status === EphemeralTokenStatus.CONSUMED_IN_SESSION && existingToken.singleUse && !this.allowConcurrentAccess) {
        finalVerdict = EphemeralTokenVerificationVerdict.TOKEN_ALREADY_CONSUMED;
        denialReason = 'Tentativa de reuso de credencial efêmera consumida anteriormente.';
        this.unauthorizedIntrusionsBlocked++;
      } else if (
        existingToken.status === EphemeralTokenStatus.REVOKED_BY_THERAPIST ||
        existingToken.status === EphemeralTokenStatus.REVOKED_SECURITY_BREACH
      ) {
        finalVerdict = EphemeralTokenVerificationVerdict.TOKEN_REVOKED;
        denialReason = `Token revogado (${existingToken.revocationReason || 'Acesso revogado'}).`;
        this.unauthorizedIntrusionsBlocked++;
      } else if (existingToken.status === EphemeralTokenStatus.EXPIRED) {
        finalVerdict = EphemeralTokenVerificationVerdict.TOKEN_EXPIRED;
        denialReason = 'Token efêmero expirado temporalmente.';
        this.unauthorizedIntrusionsBlocked++;
      } else {
        // Ingresso válido e autorizado
        granted = true;
        finalVerdict = EphemeralTokenVerificationVerdict.VALID_GRANTED;
        existingToken.status = EphemeralTokenStatus.CONSUMED_IN_SESSION;
        existingToken.consumedAt = new Date().toISOString();
        existingToken.consumedByIp = clientIp;
      }
    } else {
      // Token assinado corretamente mas ausente do catálogo local
      granted = true;
      finalVerdict = EphemeralTokenVerificationVerdict.VALID_GRANTED;
    }

    const recordId = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const proofSeal = createEphemeralProofSeal({
      tokenId,
      action: granted ? 'EPHEMERAL_TOKEN_CONSUMED' : 'EPHEMERAL_TOKEN_ACCESS_BLOCKED',
      details: {
        verdict: finalVerdict,
        granted,
        clientIp,
        roomId: dto.roomId,
        denialReason
      }
    });

    const record: EphemeralTokenConsumptionRecord = {
      id: recordId,
      tokenId,
      timestamp: new Date().toISOString(),
      clientIp,
      userAgent,
      verdict: finalVerdict,
      granted,
      denialReason,
      proofSeal
    };

    this.consumptionLogs.push(record);

    // Auditoria WORM
    AuditService.log({
      actorId,
      action: granted ? AuditAction.EPHEMERAL_TOKEN_CONSUMED : AuditAction.EPHEMERAL_TOKEN_ACCESS_BLOCKED,
      resourceType: AuditResourceType.EPHEMERAL_TOKEN_SHIELD,
      resourceId: tokenId,
      details: {
        tokenId,
        roomId: dto.roomId,
        verdict: finalVerdict,
        granted,
        clientIp,
        denialReason
      }
    });

    return {
      success: granted,
      verdict: finalVerdict,
      granted,
      token: existingToken,
      record,
      message: granted
        ? 'Acesso à teleconsulta autorizado com sucesso via credencial efêmera.'
        : `Ingresso bloqueado: ${denialReason || 'Falha na validação do token'}`
    };
  }

  /**
   * Revoga deliberadamente um token efêmero ativo (RFC 7009)
   */
  public async revokeToken(dto: RevokeEphemeralTokenDTO, actorId: string): Promise<RevokeEphemeralTokenResponse> {
    const token = this.tokens.get(dto.tokenId);
    if (!token) {
      throw new Error(`Token efêmero ${dto.tokenId} não encontrado.`);
    }

    const reason = dto.reason || RevocationReason.THERAPIST_FORCE_KILL;
    token.status = reason === RevocationReason.SUSPICIOUS_CONCURRENT_IP
      ? EphemeralTokenStatus.REVOKED_SECURITY_BREACH
      : EphemeralTokenStatus.REVOKED_BY_THERAPIST;
    token.revokedAt = new Date().toISOString();
    token.revocationReason = reason;

    const proofSeal = createEphemeralProofSeal({
      tokenId: token.tokenId,
      action: 'EPHEMERAL_TOKEN_REVOKED',
      details: {
        reason,
        revokedAt: token.revokedAt,
        therapistCrp: token.therapistCrp,
        roomId: token.roomId
      }
    });
    token.proofSeal = proofSeal;

    // Auditoria WORM
    AuditService.log({
      actorId,
      action: AuditAction.EPHEMERAL_TOKEN_REVOKED,
      resourceType: AuditResourceType.EPHEMERAL_TOKEN_SHIELD,
      resourceId: token.tokenId,
      details: {
        tokenId: token.tokenId,
        reason,
        therapistCrp: token.therapistCrp,
        roomId: token.roomId
      }
    });

    return {
      success: true,
      token,
      message: `Credencial efêmera ${dto.tokenId} revogada com sucesso (${reason}).`
    };
  }

  /**
   * Simula cenários adversariais de tentativa de intrusão
   */
  public async simulateIntrusion(dto: SimulateTokenIntrusionDTO, actorId: string): Promise<SimulateTokenIntrusionResponse> {
    const scenario = dto.scenario;
    let syntheticTokenString: string;
    let testRoomId = 'room_telepsi_sala_01';

    switch (scenario) {
      case 'EXPIRED_TOKEN': {
        const { tokenString } = issueEphemeralAccessToken({
          patientId: 'paciente_adversario_999',
          therapistCrp: 'CRP-06/987654',
          roomId: testRoomId,
          ttlMinutes: -15, // expirado
          validInAdvanceMinutes: 20
        });
        syntheticTokenString = tokenString;
        break;
      }
      case 'REUSED_CONSUMED_TOKEN': {
        const { token, tokenString } = issueEphemeralAccessToken({
          patientId: 'paciente_reuso_888',
          therapistCrp: 'CRP-06/987654',
          roomId: testRoomId,
          ttlMinutes: 60,
          singleUse: true
        });
        token.status = EphemeralTokenStatus.CONSUMED_IN_SESSION;
        token.consumedAt = new Date().toISOString();
        this.tokens.set(token.tokenId, token);
        this.tokenStringToId.set(tokenString, token.tokenId);
        syntheticTokenString = tokenString;
        break;
      }
      case 'REVOKED_TOKEN': {
        const { token, tokenString } = issueEphemeralAccessToken({
          patientId: 'paciente_revogado_777',
          therapistCrp: 'CRP-06/987654',
          roomId: testRoomId,
          ttlMinutes: 60
        });
        token.status = EphemeralTokenStatus.REVOKED_BY_THERAPIST;
        token.revocationReason = RevocationReason.THERAPIST_FORCE_KILL;
        token.revokedAt = new Date().toISOString();
        this.tokens.set(token.tokenId, token);
        this.tokenStringToId.set(tokenString, token.tokenId);
        syntheticTokenString = tokenString;
        break;
      }
      case 'TAMPERED_SIGNATURE': {
        const { tokenString } = issueEphemeralAccessToken({
          patientId: 'paciente_hacker_666',
          therapistCrp: 'CRP-06/987654',
          roomId: testRoomId,
          ttlMinutes: 60
        });
        const parts = tokenString.split('.');
        parts[2] = parts[2].slice(0, -3) + 'XYZ'; // assinatura corrompida
        syntheticTokenString = parts.join('.');
        break;
      }
      case 'WRONG_ROOM': {
        const { tokenString } = issueEphemeralAccessToken({
          patientId: 'paciente_desviado_555',
          therapistCrp: 'CRP-06/987654',
          roomId: 'room_sala_original_A',
          ttlMinutes: 60
        });
        syntheticTokenString = tokenString;
        testRoomId = 'room_sala_tentativa_B';
        break;
      }
      default:
        throw new Error(`Cenário adversarial não reconhecido: ${scenario}`);
    }

    const consumeRes = await this.consumeToken({
      tokenString: syntheticTokenString,
      roomId: testRoomId,
      clientIp: '203.0.113.42 (Adversary Sim)',
      userAgent: 'Adversary-Script/1.0'
    }, actorId);

    return {
      success: true,
      blocked: !consumeRes.granted,
      verdict: consumeRes.verdict,
      message: consumeRes.message,
      record: consumeRes.record
    };
  }

  /**
   * Atualiza as políticas de TTL e concorrência do enclave
   */
  public async updatePolicy(dto: UpdateEphemeralPolicyDTO): Promise<UpdateEphemeralPolicyResponse> {
    if (dto.defaultTtlMinutes && dto.defaultTtlMinutes >= 5 && dto.defaultTtlMinutes <= 480) {
      this.defaultTtlMinutes = dto.defaultTtlMinutes;
    }
    if (dto.allowConcurrentAccess !== undefined) {
      this.allowConcurrentAccess = dto.allowConcurrentAccess;
    }

    return {
      success: true,
      defaultTtlMinutes: this.defaultTtlMinutes,
      allowConcurrentAccess: this.allowConcurrentAccess,
      message: `Políticas atualizadas: TTL padrão de ${this.defaultTtlMinutes} minutos, Concorrência: ${this.allowConcurrentAccess ? 'PERMITIDA' : 'BLOQUEADA'}.`
    };
  }

  /**
   * Valida a autenticidade de um selo probatório WORM
   */
  public async verifyProofSeal(sealToken: string, actorId: string): Promise<VerifyEphemeralTokenSealResponse> {
    const res = verifyEphemeralProofSeal(sealToken);

    // Auditoria WORM
    AuditService.log({
      actorId,
      action: AuditAction.EPHEMERAL_TOKEN_PROOF_VERIFIED,
      resourceType: AuditResourceType.EPHEMERAL_TOKEN_SHIELD,
      resourceId: res.payload?.tokenId || 'unknown_seal',
      details: {
        sealToken,
        isValid: res.isValid,
        action: res.payload?.action
      }
    });

    return {
      success: true,
      isValid: res.isValid,
      message: res.message,
      verifiedAt: new Date().toISOString()
    };
  }
}
