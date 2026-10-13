import { randomUUID } from 'node:crypto';
import {
  AuditAction,
  AuditResourceType,
  type HoneypotProbeRecord,
  type SecurityHardeningMetrics
} from '@terapiainfoco/shared';
import {
  evaluateSecurityHeaders,
  RECOMMENDED_SECURITY_HEADERS
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class HoneypotService {
  private static instance: HoneypotService;
  private probesHistory: HoneypotProbeRecord[] = [];
  private bannedIps: Map<string, HoneypotProbeRecord> = new Map();
  private banDurationMinutes = 60; // 1 hora de quarentena por padrão

  public static getInstance(): HoneypotService {
    if (!HoneypotService.instance) {
      HoneypotService.instance = new HoneypotService();
    }
    return HoneypotService.instance;
  }

  /**
   * Captura uma tentativa de acesso a rotas de reconhecimento/probe malicioso (Honeypot Trap)
   */
  public trapProbe(params: {
    ipAddress: string;
    path: string;
    method: string;
    userAgent: string;
    headers?: Record<string, string>;
  }): HoneypotProbeRecord {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.banDurationMinutes * 60 * 1000);

    const existingBan = this.bannedIps.get(params.ipAddress);
    if (existingBan && new Date(existingBan.banExpiresAt) > now) {
      existingBan.blockedAttemptsCount++;
      existingBan.banExpiresAt = expiresAt.toISOString();
      return existingBan;
    }

    const record: HoneypotProbeRecord = {
      id: `probe-${randomUUID()}`,
      ipAddress: params.ipAddress,
      path: params.path,
      method: params.method,
      userAgent: params.userAgent,
      headersPreview: params.headers || {},
      trappedAt: now.toISOString(),
      banExpiresAt: expiresAt.toISOString(),
      blockedAttemptsCount: 1,
      status: 'ACTIVE_BAN'
    };

    this.bannedIps.set(params.ipAddress, record);
    this.probesHistory.unshift(record);
    if (this.probesHistory.length > 200) {
      this.probesHistory.pop();
    }

    // Registra a violação na trilha WORM imutável
    AuditService.log({
      actorId: `attacker-${params.ipAddress}`,
      resourceType: AuditResourceType.HONEYPOT,
      resourceId: record.id,
      action: AuditAction.HONEYPOT_PROBE_BLOCKED,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent
    });

    return record;
  }

  /**
   * Verifica se o endereço IP está atualmente em quarentena / bloqueado
   */
  public isIpBanned(ipAddress: string): boolean {
    const ban = this.bannedIps.get(ipAddress);
    if (!ban) return false;

    const now = new Date();
    if (new Date(ban.banExpiresAt) <= now) {
      ban.status = 'EXPIRED';
      this.bannedIps.delete(ipAddress);
      return false;
    }

    return ban.status === 'ACTIVE_BAN';
  }

  /**
   * Incrementa o contador de requisições bloqueadas para um IP em quarentena
   */
  public recordBlockedAttempt(ipAddress: string): void {
    const ban = this.bannedIps.get(ipAddress);
    if (ban) {
      ban.blockedAttemptsCount++;
    }
  }

  /**
   * Desbloqueia manualmente um endereço IP da quarentena (Ação administrativa)
   */
  public unbanIp(
    ipAddress: string,
    actorId = 'admin',
    actorIp = '127.0.0.1',
    reason = 'Desbloqueio administrativo autorizado'
  ): boolean {
    const ban = this.bannedIps.get(ipAddress);
    if (!ban) return false;

    ban.status = 'PARDONED';
    this.bannedIps.delete(ipAddress);

    // Registra o desbloqueio no ledger WORM
    AuditService.log({
      actorId,
      resourceType: AuditResourceType.HONEYPOT,
      resourceId: ban.id,
      action: AuditAction.HONEYPOT_IP_UNBANNED,
      ipAddress: actorIp,
      userAgent: `TerapiaInFoco-Security-Admin: ${reason}`
    });

    return true;
  }

  /**
   * Retorna métricas consolidadas de hardening e honeypot
   */
  public getMetrics(): SecurityHardeningMetrics {
    const now = new Date();
    // Limpeza de bans expirados
    for (const [ip, ban] of this.bannedIps.entries()) {
      if (new Date(ban.banExpiresAt) <= now) {
        ban.status = 'EXPIRED';
        this.bannedIps.delete(ip);
      }
    }

    const uniqueIps = new Set(this.probesHistory.map((p) => p.ipAddress));

    // Avalia os cabeçalhos padrão do sistema
    const sampleHeaders: Record<string, string> = {};
    for (const [key, spec] of Object.entries(RECOMMENDED_SECURITY_HEADERS)) {
      sampleHeaders[key] = spec.value;
    }
    const headersEvaluation = evaluateSecurityHeaders(sampleHeaders);

    return {
      totalProbesTrapped: this.probesHistory.length,
      activeBannedIpsCount: this.bannedIps.size,
      uniqueAttackingIpsCount: uniqueIps.size,
      lastProbeAt: this.probesHistory[0]?.trappedAt,
      headersEvaluation,
      honeypotEnabled: true,
      banDurationMinutes: this.banDurationMinutes
    };
  }

  public getActiveBans(): HoneypotProbeRecord[] {
    const now = new Date();
    return Array.from(this.bannedIps.values()).filter(
      (b) => b.status === 'ACTIVE_BAN' && new Date(b.banExpiresAt) > now
    );
  }

  public getRecentProbes(limit = 50): HoneypotProbeRecord[] {
    return this.probesHistory.slice(0, limit);
  }

  public clear(): void {
    this.probesHistory = [];
    this.bannedIps.clear();
  }
}

export const honeypotService = HoneypotService.getInstance();
