import { randomUUID } from 'node:crypto';
import {
  AuditAction,
  AuditResourceType,
  WafAttackType,
  WafMode,
  type WafIncidentRecord,
  type WafInspectionResult,
  type WafMetrics
} from '@terapiainfoco/shared';
import { inspectPayload } from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class WafService {
  private static instance: WafService;

  private mode: WafMode = WafMode.ACTIVE_BLOCK;
  private blockThreshold: number = 70;
  private incidents: WafIncidentRecord[] = [];
  private totalInspections: number = 0;
  private totalAttacksBlocked: number = 0;
  private totalSqliAttempts: number = 0;
  private totalXssAttempts: number = 0;
  private totalTraversalAttempts: number = 0;
  private totalCommandInjectionAttempts: number = 0;
  private lastAttackAt?: string;

  public static getInstance(): WafService {
    if (!WafService.instance) {
      WafService.instance = new WafService();
    }
    return WafService.instance;
  }

  /**
   * Inspeciona payload com as configurações ativas do WAF
   */
  public inspect(input: any): WafInspectionResult {
    this.totalInspections++;
    return inspectPayload(input, { blockThreshold: this.blockThreshold });
  }

  /**
   * Registra um incidente de ataque bloqueado ou sinalizado
   */
  public recordIncident(params: {
    ipAddress: string;
    userAgent: string;
    method: string;
    path: string;
    inspection: WafInspectionResult;
    rawPayloadSnippet?: string;
  }): WafIncidentRecord {
    const now = new Date().toISOString();
    const primaryRule = params.inspection.matchedRules[0];
    const attackType = primaryRule ? primaryRule.category : WafAttackType.SUSPICIOUS_PAYLOAD;

    const incident: WafIncidentRecord = {
      id: `waf-${randomUUID()}`,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      method: params.method,
      path: params.path,
      threatScore: params.inspection.threatScore,
      attackType,
      matchedRulesCount: params.inspection.matchedRules.length,
      primaryRuleId: primaryRule ? primaryRule.ruleId : 'WAF-GENERIC',
      payloadSnippet: (params.rawPayloadSnippet || primaryRule?.detectedPattern || '').slice(0, 200),
      blockedAt: now,
      status: this.mode === WafMode.ACTIVE_BLOCK ? 'BLOCKED' : 'FLAGGED'
    };

    this.incidents.unshift(incident);
    if (this.incidents.length > 200) {
      this.incidents.pop();
    }

    if (this.mode === WafMode.ACTIVE_BLOCK) {
      this.totalAttacksBlocked++;
    }
    this.lastAttackAt = now;

    // Atualiza contadores específicos por vetor
    if (attackType === WafAttackType.SQL_INJECTION) this.totalSqliAttempts++;
    else if (attackType === WafAttackType.CROSS_SITE_SCRIPTING) this.totalXssAttempts++;
    else if (attackType === WafAttackType.PATH_TRAVERSAL) this.totalTraversalAttempts++;
    else if (attackType === WafAttackType.COMMAND_INJECTION) this.totalCommandInjectionAttempts++;

    // Grava na trilha imutável WORM
    AuditService.log({
      actorId: `attacker-${params.ipAddress}`,
      resourceType: AuditResourceType.WAF,
      resourceId: incident.id,
      action: AuditAction.WAF_ATTACK_BLOCKED,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent
    });

    return incident;
  }

  /**
   * Atualiza o modo de operação e limiar de bloqueio
   */
  public updateSettings(params: {
    mode: WafMode;
    blockThreshold?: number;
    updatedBy: string;
    ipAddress?: string;
    userAgent?: string;
  }): { mode: WafMode; blockThreshold: number } {
    this.mode = params.mode;
    if (typeof params.blockThreshold === 'number') {
      this.blockThreshold = Math.max(10, Math.min(100, params.blockThreshold));
    }

    AuditService.log({
      actorId: params.updatedBy,
      resourceType: AuditResourceType.WAF,
      resourceId: `waf-config-${Date.now()}`,
      action: AuditAction.WAF_RULE_UPDATED,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent
    });

    return { mode: this.mode, blockThreshold: this.blockThreshold };
  }

  /**
   * Retorna panorama de métricas do WAF
   */
  public getMetrics(): WafMetrics {
    return {
      totalAttacksBlocked: this.totalAttacksBlocked,
      totalInspections: this.totalInspections,
      totalSqliAttempts: this.totalSqliAttempts,
      totalXssAttempts: this.totalXssAttempts,
      totalTraversalAttempts: this.totalTraversalAttempts,
      totalCommandInjectionAttempts: this.totalCommandInjectionAttempts,
      lastAttackAt: this.lastAttackAt,
      mode: this.mode,
      blockThreshold: this.blockThreshold
    };
  }

  /**
   * Retorna os incidentes mais recentes
   */
  public getRecentIncidents(limit = 50): WafIncidentRecord[] {
    return this.incidents.slice(0, limit);
  }

  public getMode(): WafMode {
    return this.mode;
  }

  public getBlockThreshold(): number {
    return this.blockThreshold;
  }

  /**
   * Limpa o estado para testes
   */
  public resetForTesting(): void {
    this.mode = WafMode.ACTIVE_BLOCK;
    this.blockThreshold = 70;
    this.incidents = [];
    this.totalInspections = 0;
    this.totalAttacksBlocked = 0;
    this.totalSqliAttempts = 0;
    this.totalXssAttempts = 0;
    this.totalTraversalAttempts = 0;
    this.totalCommandInjectionAttempts = 0;
    this.lastAttackAt = undefined;
  }
}

export const wafService = WafService.getInstance();
