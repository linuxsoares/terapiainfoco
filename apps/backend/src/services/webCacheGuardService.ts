/**
 * ============================================================================
 * 63. BACKEND SERVICE: WEB CACHE POISONING & CACHE DECEPTION ENCLAVE SERVICE
 * ============================================================================
 * 
 * Enclave de gerenciamento de políticas de cache, mitigação de envenenamento e
 * engano de cache proxy/CDN, com auditoria WORM imutável compulsória.
 */

import { randomUUID } from 'node:crypto';
import {
  CacheThreatType,
  CacheThreatSeverity,
  CacheDirectiveAction,
  ResourceSensitivityLevel,
  AuditAction,
  AuditResourceType,
  type CacheKeyCanonicalComponents,
  type CacheThreatDetection,
  type CacheProofSeal,
  type CacheInspectionResult,
  type CacheGuardPolicy,
  type CacheGuardMetrics,
  type CacheSecurityIncident,
  type CacheGuardOverview,
  type InspectCacheRequestDTO,
  type SimulateCacheAttackDTO,
  type SimulateCacheAttackResponseDTO,
  type VerifyCacheSealResponseDTO
} from '@terapiainfoco/shared';
import {
  DEFAULT_CACHE_GUARD_POLICY,
  inspectHttpRequestCache,
  verifyCacheProofSeal
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class WebCacheGuardService {
  private static instance: WebCacheGuardService;

  private policy: CacheGuardPolicy = { ...DEFAULT_CACHE_GUARD_POLICY };
  private incidents: CacheSecurityIncident[] = [];
  private metrics: CacheGuardMetrics = {
    totalRequestsInspected: 0,
    poisoningAttemptsBlocked: 0,
    deceptionAttemptsBlocked: 0,
    cleanRequestsAllowed: 0,
    strictNoStoreEnforced: 0,
    activePolicy: { ...DEFAULT_CACHE_GUARD_POLICY },
    lastIncidentTimestamp: null
  };

  private readonly sampleProtectedRoutes = [
    {
      path: '/api/patients/:id/records',
      sensitivity: ResourceSensitivityLevel.CLINICAL_AUTHENTICATED,
      cacheControl: 'no-store, no-cache, must-revalidate, private, max-age=0'
    },
    {
      path: '/api/soap-notes/:id',
      sensitivity: ResourceSensitivityLevel.CLINICAL_AUTHENTICATED,
      cacheControl: 'no-store, no-cache, must-revalidate, private, max-age=0'
    },
    {
      path: '/api/consultations/ephemeral-link/:token',
      sensitivity: ResourceSensitivityLevel.TELECONSULT_EPHEMERAL,
      cacheControl: 'no-store, no-cache, must-revalidate, private, max-age=0'
    },
    {
      path: '/api/court-order-threshold/vaults',
      sensitivity: ResourceSensitivityLevel.ADMIN_GOVERNANCE,
      cacheControl: 'no-store, no-cache, must-revalidate, private, max-age=0'
    },
    {
      path: '/static/brand/logo.svg',
      sensitivity: ResourceSensitivityLevel.PUBLIC_STATIC,
      cacheControl: 'public, max-age=3600, stale-while-revalidate=86400'
    }
  ];

  private constructor() {
    this.seedInitialHistoricalMetrics();
  }

  public static getInstance(): WebCacheGuardService {
    if (!WebCacheGuardService.instance) {
      WebCacheGuardService.instance = new WebCacheGuardService();
    }
    return WebCacheGuardService.instance;
  }

  private seedInitialHistoricalMetrics(): void {
    // Inicializa com incidentes forenses controlados para fins de auditoria e telemetria inicial
    const initialIncident: CacheSecurityIncident = {
      id: randomUUID(),
      timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
      threatType: CacheThreatType.UNKEYED_HEADER_INJECTION,
      severity: CacheThreatSeverity.HIGH,
      targetUri: '/api/patients?filter=active',
      clientIp: '198.51.100.44',
      actorId: 'scanner-adversarial-probe',
      evidence: "Injeção de cabeçalho 'X-Forwarded-Host: evil-phishing-portal.com' detectada.",
      actionTaken: CacheDirectiveAction.STRIP_UNKEYED_HEADERS,
      seal: {
        version: '1.0.0',
        sealId: 'cache_guard_v1_seed_init_probe',
        timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
        resourceUri: '/api/patients?filter=active',
        canonicalCacheKeyHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        threatsCount: 1,
        directive: 'no-store, no-cache, private',
        hmacSignature: 'sig_seed_hash_init'
      }
    };

    this.incidents.push(initialIncident);
    this.metrics.totalRequestsInspected = 142;
    this.metrics.poisoningAttemptsBlocked = 1;
    this.metrics.deceptionAttemptsBlocked = 0;
    this.metrics.cleanRequestsAllowed = 141;
    this.metrics.strictNoStoreEnforced = 120;
    this.metrics.lastIncidentTimestamp = initialIncident.timestamp;
  }

  public getOverview(): CacheGuardOverview {
    return {
      metrics: {
        ...this.metrics,
        activePolicy: { ...this.policy }
      },
      policy: { ...this.policy },
      recentIncidents: [...this.incidents].slice(-20).reverse(),
      sampleProtectedRoutes: this.sampleProtectedRoutes
    };
  }

  public async inspectRequest(
    dto: InspectCacheRequestDTO,
    clientIp: string,
    actorId: string = 'system-waf-guard'
  ): Promise<CacheInspectionResult> {
    this.metrics.totalRequestsInspected++;

    const inspection = inspectHttpRequestCache(
      dto.method,
      dto.url,
      dto.headers || {},
      dto.sensitivity,
      dto.expectedContentType,
      dto.bodyPayload,
      this.policy
    );

    if (!inspection.isSafe) {
      const isDeception = inspection.threats.some(
        t => t.threatType === CacheThreatType.EXTENSION_CONFUSION_DECEPTION ||
             t.threatType === CacheThreatType.PATH_TRAVERSAL_DECEPTION
      );

      if (isDeception) {
        this.metrics.deceptionAttemptsBlocked++;
      } else {
        this.metrics.poisoningAttemptsBlocked++;
      }

      this.metrics.lastIncidentTimestamp = new Date().toISOString();

      const incident: CacheSecurityIncident = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        threatType: inspection.threats[0]?.threatType || CacheThreatType.UNKEYED_HEADER_INJECTION,
        severity: inspection.threats[0]?.severity || CacheThreatSeverity.HIGH,
        targetUri: dto.url,
        clientIp,
        actorId,
        evidence: inspection.threats.map(t => `${t.description} [${t.triggerHeaderOrParam}]`).join('; '),
        actionTaken: inspection.threats[0]?.mitigationAction || CacheDirectiveAction.FORCE_NO_STORE,
        seal: inspection.seal
      };

      this.incidents.push(incident);
      if (this.incidents.length > 50) {
        this.incidents.shift();
      }

      // Registro WORM compulsório
      AuditService.log({
        action: isDeception
          ? AuditAction.CACHE_DECEPTION_ATTEMPT_BLOCKED
          : AuditAction.CACHE_POISONING_ATTEMPT_BLOCKED,
        resourceType: AuditResourceType.CACHE_POISONING_GUARD,
        resourceId: incident.id,
        actorId: actorId,
        details: {
          threatCount: inspection.threats.length,
          threats: inspection.threats,
          targetUri: dto.url,
          clientIp,
          headersToStrip: inspection.headersToStrip,
          recommendedCacheControl: inspection.recommendedCacheControl,
          sealId: inspection.seal.sealId
        }
      });
    } else {
      this.metrics.cleanRequestsAllowed++;
      if (
        dto.sensitivity === ResourceSensitivityLevel.CLINICAL_AUTHENTICATED ||
        dto.sensitivity === ResourceSensitivityLevel.ADMIN_GOVERNANCE ||
        dto.sensitivity === ResourceSensitivityLevel.TELECONSULT_EPHEMERAL
      ) {
        this.metrics.strictNoStoreEnforced++;
      }

      // Registro na trilha WORM para geração de chave canônica de recurso protegido
      AuditService.log({
        action: AuditAction.CANONICAL_CACHE_KEY_GENERATED,
        resourceType: AuditResourceType.CACHE_POISONING_GUARD,
        resourceId: inspection.seal.sealId,
        actorId: actorId,
        details: {
          canonicalCacheKeyHash: inspection.canonicalCacheKeyHash,
          method: inspection.components.method,
          path: inspection.components.normalizedPath,
          sensitivity: dto.sensitivity,
          cacheControl: inspection.recommendedCacheControl
        }
      });
    }

    return inspection;
  }

  public async updatePolicy(
    partial: Partial<CacheGuardPolicy>,
    actorId: string = 'system-admin'
  ): Promise<CacheGuardPolicy> {
    this.policy = {
      ...this.policy,
      ...partial
    };
    this.metrics.activePolicy = { ...this.policy };

    AuditService.log({
      action: AuditAction.CACHE_GUARD_POLICY_UPDATED,
      resourceType: AuditResourceType.CACHE_POISONING_GUARD,
      resourceId: 'cache-guard-policy',
      actorId: actorId,
      details: {
        updatedFields: Object.keys(partial),
        newPolicy: this.policy
      }
    });

    return { ...this.policy };
  }

  public async simulateAttack(
    dto: SimulateCacheAttackDTO,
    clientIp: string,
    actorId: string = 'security-adversarial-tester'
  ): Promise<SimulateCacheAttackResponseDTO> {
    let method = dto.method || 'GET';
    let url = dto.targetPath || '/api/patients/123/clinical-record';
    let headers: Record<string, string> = {
      'host': 'app.terapiainfoco.com.br',
      'user-agent': 'AdversarialCachePoisoningSimulator/2.0',
      'accept': 'application/json',
      ...(dto.customHeaders || {})
    };
    let sensitivity = dto.sensitivity || ResourceSensitivityLevel.CLINICAL_AUTHENTICATED;
    let bodyPayload: string | undefined = undefined;

    switch (dto.attackType) {
      case CacheThreatType.UNKEYED_HEADER_INJECTION:
        headers['x-forwarded-host'] = 'attacker-controlled-cdn.org';
        headers['x-forwarded-proto'] = 'http';
        url = dto.targetPath || '/api/patients/overview';
        break;

      case CacheThreatType.EXTENSION_CONFUSION_DECEPTION:
        url = dto.targetPath || '/api/patients/123/soap-notes.css';
        headers['accept'] = 'text/css,*/*';
        break;

      case CacheThreatType.SPLIT_REQUEST_POISONING:
        headers['x-custom-tracking'] = 'valid-id\r\nX-Injected-Poison: critical-crlf-exploit';
        break;

      case CacheThreatType.FAT_GET_POISONING:
        method = 'GET';
        headers['content-length'] = '84';
        bodyPayload = '{"poisonParam": "cache_pollution_gadget", "redirect": "http://evil.org"}';
        break;

      case CacheThreatType.METHOD_OVERRIDE_POISONING:
        headers['x-http-method-override'] = 'DELETE';
        url = dto.targetPath || '/api/patients/456';
        break;

      case CacheThreatType.PATH_TRAVERSAL_DECEPTION:
        url = dto.targetPath || '/api/public/styles/../../patients/456/secret-anamnesis';
        break;

      case CacheThreatType.UNKEYED_PARAM_POISONING:
        const flooding = Array.from({ length: 28 }, (_, i) => `exploit_param_${i}=val_${i}`).join('&');
        url = `/api/patients?${flooding}`;
        break;
    }

    const inspection = await this.inspectRequest(
      {
        method,
        url,
        headers,
        sensitivity,
        bodyPayload
      },
      clientIp,
      actorId
    );

    const incident = this.incidents.find(i => i.seal.sealId === inspection.seal.sealId);

    return {
      success: true,
      threatDetected: !inspection.isSafe,
      incident,
      inspection,
      message: inspection.isSafe
        ? 'Nenhuma vulnerabilidade explorável detectada na requisição simulada.'
        : `Ataque '${dto.attackType}' interceptado com sucesso. Diretiva 'no-store' e neutralização aplicadas.`,
      timestamp: new Date().toISOString()
    };
  }

  public async verifySeal(
    sealToken: string,
    actorId: string = 'audit-verifier'
  ): Promise<VerifyCacheSealResponseDTO> {
    const result = verifyCacheProofSeal(sealToken);

    if (result.isValid && result.parsedSeal) {
      AuditService.log({
        action: AuditAction.CACHE_GUARD_SEAL_VERIFIED,
        resourceType: AuditResourceType.CACHE_POISONING_GUARD,
        resourceId: result.parsedSeal.sealId,
        actorId: actorId,
        details: {
          sealId: result.parsedSeal.sealId,
          resourceUri: result.parsedSeal.resourceUri,
          threatsCount: result.parsedSeal.threatsCount,
          directive: result.parsedSeal.directive,
          verifiedAt: new Date().toISOString()
        }
      });
    }

    return {
      success: true,
      isValid: result.isValid,
      seal: result.parsedSeal,
      message: result.isValid
        ? 'Selo probatório WORM de cache válido e autêntico.'
        : `Falha na validação do selo: ${result.reason || 'Selo inválido ou adulterado.'}`,
      verifiedAt: new Date().toISOString()
    };
  }
}
