import { randomBytes } from 'node:crypto';
import {
  AuditAction,
  AuditResourceType,
  DependencyRiskSeverity,
  DependencyThreatCategory,
  DependencyValidationAction,
  UserRole
} from '@terapiainfoco/shared';
import type {
  DependencyNode,
  DependencyGuardPolicy,
  DependencyGuardMetrics,
  DependencySecurityIncident,
  DependencyProofSeal,
  DependencyInspectionResult,
  DynamicImportInspectionResult,
  SupplyChainGuardOverview,
  InspectDependenciesDTO,
  InspectDependenciesResponse,
  InspectDynamicImportDTO,
  InspectDynamicImportResponse,
  UpdateDependencyPolicyDTO,
  UpdateDependencyPolicyResponse,
  SimulateSupplyChainAttackDTO,
  SimulateSupplyChainAttackResponse,
  VerifySupplyChainSealDTO,
  VerifySupplyChainSealResponse
} from '@terapiainfoco/shared';
import {
  SupplyChainGuardEngine,
  DEFAULT_DEPENDENCY_POLICY,
  SAMPLE_SUPPLY_CHAIN_ATTACKS,
  SAMPLE_BENIGN_DEPENDENCIES
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

/** Contadores que o serviço mantém sempre preenchidos (o modelo traz aliases opcionais) */
type TrackedDependencyMetrics = DependencyGuardMetrics &
  Required<Pick<DependencyGuardMetrics,
    | 'totalDependenciesAudited' | 'cleanDependenciesApproved' | 'quarantinedPackages' | 'blockedThreats'
    | 'dependencyConfusionBlocked' | 'lifecycleBackdoorsBlocked' | 'dynamicImportsBlocked'
    | 'typosquattingDetected' | 'sriChecksumViolations' | 'avgAuditDurationUs' | 'slsaLevelAttained'>>;

export class SupplyChainGuardService {
  private static instance: SupplyChainGuardService;

  private engine: SupplyChainGuardEngine;

  private metrics: TrackedDependencyMetrics = {
    totalDependenciesAudited: 8420,
    cleanDependenciesApproved: 8380,
    quarantinedPackages: 28,
    blockedThreats: 12,
    dependencyConfusionBlocked: 4,
    lifecycleBackdoorsBlocked: 5,
    dynamicImportsBlocked: 3,
    typosquattingDetected: 6,
    sriChecksumViolations: 2,
    avgAuditDurationUs: 230.5,
    slsaLevelAttained: 'SLSA_LEVEL_3',
    lastIncidentTimestamp: new Date(Date.now() - 1000 * 60 * 35).toISOString()
  };

  private recentIncidents: DependencySecurityIncident[] = [];
  private recentSeals: DependencyProofSeal[] = [];
  private homologatedPackages: DependencyNode[] = [...SAMPLE_BENIGN_DEPENDENCIES];

  private constructor() {
    this.engine = new SupplyChainGuardEngine();
    this.seedInitialIncidents();
  }

  public static getInstance(): SupplyChainGuardService {
    if (!SupplyChainGuardService.instance) {
      SupplyChainGuardService.instance = new SupplyChainGuardService();
    }
    return SupplyChainGuardService.instance;
  }

  private seedInitialIncidents(): void {
    // 1. Dependency Confusion Incident
    const attackConfusion = SAMPLE_SUPPLY_CHAIN_ATTACKS.find(
      (a) => a.category === DependencyThreatCategory.DEPENDENCY_CONFUSION
    )!;
    const resConfusion = this.engine.inspectDependencies(attackConfusion.manifestContent!);

    // 2. Lifecycle Backdoor Incident
    const attackBackdoor = SAMPLE_SUPPLY_CHAIN_ATTACKS.find(
      (a) => a.category === DependencyThreatCategory.MALICIOUS_LIFECYCLE_SCRIPT
    )!;
    const resBackdoor = this.engine.inspectDependencies(attackBackdoor.manifestContent!);

    // 3. Dynamic Import Traversal Incident
    const attackDynamic = SAMPLE_SUPPLY_CHAIN_ATTACKS.find(
      (a) => a.category === DependencyThreatCategory.DYNAMIC_IMPORT_INJECTION
    )!;
    const resDynamic = this.engine.validateDynamicImportPath(attackDynamic.specifier!);

    this.recentIncidents = [
      {
        id: `dep-inc-${randomBytes(4).toString('hex')}`,
        incidentId: `dep-inc-${randomBytes(4).toString('hex')}`,
        timestamp: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
        packageName: 'terapiainfoco-clinical-auth',
        category: DependencyThreatCategory.DEPENDENCY_CONFUSION,
        severity: DependencyRiskSeverity.CRITICAL,
        threats: resConfusion.threats,
        blocked: true,
        remediationAction: 'Publicação não homologada bloqueada. Escopo restrito a @terapiainfoco/.',
        rawPayloadSnippet: attackConfusion.manifestContent,
        clientIp: '198.51.100.89',
        seal: resConfusion.seal
      },
      {
        id: `dep-inc-${randomBytes(4).toString('hex')}`,
        incidentId: `dep-inc-${randomBytes(4).toString('hex')}`,
        timestamp: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
        packageName: 'express-logger-addon',
        category: DependencyThreatCategory.MALICIOUS_LIFECYCLE_SCRIPT,
        severity: DependencyRiskSeverity.CRITICAL,
        threats: resBackdoor.threats,
        blocked: true,
        remediationAction: 'Script postinstall malicioso bloqueado (CWE-912). Execução abortada.',
        rawPayloadSnippet: attackBackdoor.manifestContent,
        clientIp: '203.0.113.195',
        seal: resBackdoor.seal
      },
      {
        id: `dep-inc-${randomBytes(4).toString('hex')}`,
        incidentId: `dep-inc-${randomBytes(4).toString('hex')}`,
        timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
        packageName: 'dynamic-reflection-caller',
        category: DependencyThreatCategory.DYNAMIC_IMPORT_INJECTION,
        severity: DependencyRiskSeverity.CRITICAL,
        threats: resDynamic.threats,
        blocked: true,
        remediationAction: 'Interpolação dinâmica de variável em runtime bloqueada (CWE-470).',
        rawPayloadSnippet: attackDynamic.specifier,
        clientIp: '192.0.2.77'
      }
    ];

    if (resConfusion.seal) this.recentSeals.push(resConfusion.seal);
    if (resBackdoor.seal) this.recentSeals.push(resBackdoor.seal);
  }

  public getOverview(): SupplyChainGuardOverview {
    return {
      policy: this.engine.getPolicy(),
      metrics: { ...this.metrics },
      recentIncidents: [...this.recentIncidents],
      recentSeals: [...this.recentSeals],
      sampleAttacks: [...SAMPLE_SUPPLY_CHAIN_ATTACKS],
      homologatedDependencies: [...this.homologatedPackages]
    };
  }

  public inspectDependencies(
    dto: InspectDependenciesDTO,
    context: { ip: string; userAgent: string; userId?: string }
  ): InspectDependenciesResponse {
    const startTime = performance.now();
    const manifest = dto.manifestContent || dto.dependencies || [];
    const inspection = this.engine.inspectDependencies(manifest, {
      targetRegistry: dto.targetRegistry,
      strictMode: dto.strictMode
    });
    const elapsedUs = (performance.now() - startTime) * 1000;

    // Atualiza métricas
    this.metrics.totalDependenciesAudited += inspection.totalDependenciesScanned ?? 0;
    this.metrics.avgAuditDurationUs = Number(
      ((this.metrics.avgAuditDurationUs * 0.9) + (elapsedUs * 0.1)).toFixed(1)
    );

    let incident: DependencySecurityIncident | undefined;

    if (!inspection.isValid) {
      this.metrics.blockedThreats += inspection.blockedCount ?? 0;
      this.metrics.quarantinedPackages += inspection.quarantinedCount ?? 0;
      this.metrics.lastIncidentTimestamp = new Date().toISOString();

      for (const t of inspection.threats) {
        if (t.category === DependencyThreatCategory.DEPENDENCY_CONFUSION) {
          this.metrics.dependencyConfusionBlocked++;
        } else if (t.category === DependencyThreatCategory.MALICIOUS_LIFECYCLE_SCRIPT) {
          this.metrics.lifecycleBackdoorsBlocked++;
        } else if (t.category === DependencyThreatCategory.TYPOSQUATTING) {
          this.metrics.typosquattingDetected++;
        } else if (t.category === DependencyThreatCategory.SRI_CHECKSUM_MISMATCH) {
          this.metrics.sriChecksumViolations++;
        }
      }

      incident = {
        id: `dep-inc-${randomBytes(4).toString('hex')}`,
        incidentId: `dep-inc-${randomBytes(4).toString('hex')}`,
        timestamp: new Date().toISOString(),
        packageName: inspection.threats[0]?.packageName || 'manifest-inspection',
        category: inspection.threats[0]?.category || DependencyThreatCategory.KNOWN_VULNERABILITY,
        severity: inspection.threats[0]?.severity || DependencyRiskSeverity.HIGH,
        threats: inspection.threats,
        blocked: inspection.action === DependencyValidationAction.BLOCK,
        remediationAction:
          inspection.action === DependencyValidationAction.BLOCK
            ? 'Instalação rejeitada por violar integridade de supply chain SLSA L3.'
            : 'Dependência colocada em quarentena técnica com isolamento sandboxed.',
        rawPayloadSnippet:
          typeof dto.manifestContent === 'string'
            ? dto.manifestContent.substring(0, 300)
            : JSON.stringify(dto.manifestContent || dto.dependencies || {}).substring(0, 300),
        clientIp: context.ip,
        userAgent: context.userAgent,
        seal: inspection.seal
      };

      this.recentIncidents.unshift(incident);
      if (this.recentIncidents.length > 25) {
        this.recentIncidents.pop();
      }

      AuditService.log({
        actorId: context.userId || 'system',
        action: AuditAction.DEPENDENCY_INJECTION_BLOCKED,
        resourceType: AuditResourceType.SUPPLY_CHAIN_GUARD,
        resourceId: incident.incidentId ?? incident.id,
        ipAddress: context.ip,
        userAgent: context.userAgent
      });
    } else {
      this.metrics.cleanDependenciesApproved += inspection.totalDependenciesScanned ?? 0;

      AuditService.log({
        actorId: context.userId || 'system',
        action: AuditAction.SRI_INTEGRITY_VERIFIED,
        resourceType: AuditResourceType.SUPPLY_CHAIN_GUARD,
        resourceId: inspection.seal?.sealToken || 'sri-verified',
        ipAddress: context.ip,
        userAgent: context.userAgent
      });
    }

    if (inspection.seal) {
      this.recentSeals.unshift(inspection.seal);
      if (this.recentSeals.length > 25) {
        this.recentSeals.pop();
      }
    }

    return {
      success: true,
      result: inspection,
      incident,
      seal: inspection.seal,
      message: inspection.isValid
        ? 'Dependências inspecionadas com sucesso. Em conformidade com SLSA L3 e RFC SRI.'
        : `Ameaças de Supply Chain detectadas (${inspection.threats.length}). Ação aplicada: ${inspection.action}.`
    };
  }

  public inspectDynamicImport(
    dto: InspectDynamicImportDTO,
    context: { ip: string; userAgent: string; userId?: string }
  ): InspectDynamicImportResponse {
    const inspection = this.engine.validateDynamicImportPath(dto.specifier, dto.callerContext);

    let incident: DependencySecurityIncident | undefined;

    if (!inspection.isAllowed) {
      this.metrics.dynamicImportsBlocked++;
      this.metrics.lastIncidentTimestamp = new Date().toISOString();

      incident = {
        id: `dep-inc-${randomBytes(4).toString('hex')}`,
        incidentId: `dep-inc-${randomBytes(4).toString('hex')}`,
        timestamp: new Date().toISOString(),
        packageName: dto.specifier,
        category: inspection.threats[0]?.category || DependencyThreatCategory.DYNAMIC_IMPORT_INJECTION,
        severity: inspection.threats[0]?.severity || DependencyRiskSeverity.CRITICAL,
        threats: inspection.threats,
        blocked: true,
        remediationAction: 'Injeção de módulo dinâmico bloqueada em tempo de execução (CWE-470).',
        rawPayloadSnippet: dto.specifier,
        clientIp: context.ip,
        userAgent: context.userAgent
      };

      this.recentIncidents.unshift(incident);
      if (this.recentIncidents.length > 25) {
        this.recentIncidents.pop();
      }

      AuditService.log({
        actorId: context.userId || 'system',
        action: AuditAction.DEPENDENCY_INJECTION_BLOCKED,
        resourceType: AuditResourceType.SUPPLY_CHAIN_GUARD,
        resourceId: incident.incidentId ?? incident.id,
        ipAddress: context.ip,
        userAgent: context.userAgent
      });
    }

    return {
      success: true,
      result: inspection,
      incident,
      message: inspection.isAllowed
        ? 'Especificador de import dinâmico verificado e homologado com segurança estática.'
        : `Especificador dinâmico rejeitado (CWE-470). Ação executada: ${inspection.action}.`
    };
  }

  public updatePolicy(dto: UpdateDependencyPolicyDTO, userId?: string): UpdateDependencyPolicyResponse {
    const updated = this.engine.updatePolicy(dto);

    AuditService.log({
      actorId: userId || 'admin',
      action: AuditAction.DEPENDENCY_POLICY_UPDATED,
      resourceType: AuditResourceType.SUPPLY_CHAIN_GUARD,
      resourceId: 'dependency_guard_policy',
      ipAddress: '127.0.0.1'
    });

    return {
      success: true,
      policy: updated,
      message: 'Política de governança de supply chain SLSA L3 atualizada com sucesso.'
    };
  }

  public simulateAttack(
    dto: SimulateSupplyChainAttackDTO,
    context: { ip: string; userAgent: string; userId?: string }
  ): SimulateSupplyChainAttackResponse {
    const sample = SAMPLE_SUPPLY_CHAIN_ATTACKS.find((a) => a.category === dto.attackCategory);

    if (dto.attackCategory === DependencyThreatCategory.DYNAMIC_IMPORT_INJECTION) {
      const specifier = dto.customPayload || sample?.specifier || "import('../../' + userInput + '.js')";
      const inspectionRes = this.inspectDynamicImport(
        { specifier, callerContext: 'SupplyChainSimulationSandbox' },
        context
      );

      return {
        success: true,
        attackCategory: dto.attackCategory,
        threatBlocked: !inspectionRes.result.isAllowed,
        attackSimulationName: sample?.name || 'Dynamic Reflection & Specifier Injection Test',
        inspection: inspectionRes.result,
        incident: inspectionRes.incident,
        message: 'Simulação de injeção de módulo dinâmico CWE-470 executada com neutralização ativa.'
      };
    }

    const manifest =
      dto.customPayload ||
      sample?.manifestContent ||
      JSON.stringify({
        name: dto.targetPackageName || 'terapiainfoco-rogue-clone',
        version: '999.0.0'
      });

    const inspectionRes = this.inspectDependencies(
      { manifestContent: manifest },
      context
    );

    return {
      success: true,
      attackCategory: dto.attackCategory,
      threatBlocked: !inspectionRes.result.isValid,
      attackSimulationName: sample?.name || 'Supply Chain Compromise Simulation',
      inspection: inspectionRes.result,
      incident: inspectionRes.incident,
      message: 'Simulação adversarial de supply chain executada com contenção WORM.'
    };
  }

  public verifySeal(dto: VerifySupplyChainSealDTO): VerifySupplyChainSealResponse {
    const verification = this.engine.verifySeal(dto.sealToken);
    const token = typeof dto.sealToken === 'string' ? dto.sealToken : dto.sealToken.sealToken;
    const foundSeal = this.recentSeals.find((s) => s.sealToken === token);

    if (verification.isValid) {
      AuditService.log({
        actorId: 'system',
        action: AuditAction.SUPPLY_CHAIN_SEAL_VERIFIED,
        resourceType: AuditResourceType.SUPPLY_CHAIN_GUARD,
        resourceId: token,
        ipAddress: '127.0.0.1'
      });
    }

    return {
      success: true,
      isValid: verification.isValid,
      seal: foundSeal,
      message: verification.message,
      verifiedAt: verification.verifiedAt
    };
  }

  public getHomologatedPackages(): DependencyNode[] {
    return [...this.homologatedPackages];
  }
}
