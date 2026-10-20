import {
  AuditAction,
  AuditResourceType,
  UserRole,
  type ExecutiveCompliancePackage,
  type ForensicMetricsSnapshot,
  type GenerateCompliancePackageDTO,
  type ApplyDpoSignOffDTO,
  type ExecutiveComplianceOverviewResponse
} from '@terapiainfoco/shared';
import {
  buildExecutiveCompliancePackage,
  evaluateGovernanceControls,
  applyDpoSignOffToPackage,
  verifyCompliancePackageIntegrity,
  verifyHashChainIntegrity
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';
import { kmsService } from './kmsService';
import { backupStore } from './backupService';
import { globalRateLimitStore } from '../middlewares/rateLimiter';
import { otlpBatchExporter } from '../telemetry/otlpBatchExporter';
import { db } from '../db/memoryDb';
import { config } from '../config';

/** Erro de entrada do Admin (vira 400 na rota) */
export class ComplianceInputError extends Error {}

export class ComplianceGovernanceService {
  private static instance: ComplianceGovernanceService;
  private packagesHistory: ExecutiveCompliancePackage[] = [];

  public static getInstance(): ComplianceGovernanceService {
    if (!ComplianceGovernanceService.instance) {
      ComplianceGovernanceService.instance = new ComplianceGovernanceService();
    }
    return ComplianceGovernanceService.instance;
  }

  /**
   * Coleta evidências e métricas forenses em tempo real de todos os módulos do monorepo
   */
  public collectForensicMetrics(): ForensicMetricsSnapshot {
    // 1. Integridade da Trilha WORM
    const wormVerification = AuditService.verifyChainIntegrity();
    const wormChainIntegrity = wormVerification.isValid ? 'INTACT' : 'COMPROMISED';

    // 2. Chave Mestre KMS ativa
    const kmsStatus = kmsService.getStatus();
    const activeKmsKeyVersion = kmsStatus.activeKeyVersion || 1;

    // 3. Snapshots de backup
    const backups = backupStore.list();
    const dataBackupsCount = backups.length;

    // 4. Rate Limiting
    const storeStatus = globalRateLimitStore.getStatus();

    // 5. Autenticação Forte: 2FA medido em quem acessa dados clínicos ou administra (pacientes têm 2FA opcional)
    const usersList = Array.from(db.users.values());
    const staff = usersList.filter((u) => u.role !== UserRole.PACIENTE);
    const staffWith2fa = staff.filter((u) => u.twoFactorEnabled).length;
    const totalPasskeys = usersList.reduce((acc, u) => acc + (u.passkeysCount || 0), 0);
    const twoFactorAdoptionRate = staff.length > 0 ? Math.round((staffWith2fa / staff.length) * 100) : 0;

    // 6. OTLP Exporter
    const otlpConfig = otlpBatchExporter.getConfig();

    return {
      totalWormBlocks: db.auditLogs.length,
      wormChainIntegrity,
      activeKmsKeyVersion,
      dataBackupsCount,
      // Snapshots ainda vivem só na memória do BackupService (sem object storage)
      backupsOffsite: false,
      twoFactorAdoptionRate,
      passkeysCount: totalPasskeys,
      rateLimitingStoreType: storeStatus.storeType,
      otlpExporterActive: otlpConfig.enabled
    };
  }

  /**
   * Retorna visão executiva consolidada de governança e conformidade
   */
  public getGovernanceOverview(): ExecutiveComplianceOverviewResponse {
    const forensicMetrics = this.collectForensicMetrics();
    const evaluation = evaluateGovernanceControls(forensicMetrics);
    const lastPackage = this.packagesHistory[0];

    return {
      success: true,
      globalScorePercentage: evaluation.globalScore,
      status: evaluation.status,
      frameworks: evaluation.frameworks,
      forensicMetrics,
      controls: evaluation.controls,
      identity: this.currentIdentity(),
      lastPackage
    };
  }

  /** Identificação do último pacote emitido ou, na falta dele, a configurada no ambiente */
  private currentIdentity(): { organization: string; dpoName: string; technicalResponsibleCrp: string } {
    const last = this.packagesHistory[0];
    return {
      organization: last?.organization || config.compliance.organization,
      dpoName: last?.dpoName || config.compliance.dpoName,
      technicalResponsibleCrp: last?.technicalResponsibleCrp || config.compliance.technicalResponsibleCrp
    };
  }

  /**
   * Gera um novo Pacote Executivo de Conformidade assinado canonicamente
   */
  public generateExecutivePackage(
    dto: GenerateCompliancePackageDTO,
    actorId = 'admin',
    ip = '127.0.0.1'
  ): ExecutiveCompliancePackage {
    const identity = this.currentIdentity();
    const organization = dto.organization?.trim() || identity.organization;
    const dpoName = dto.dpoName?.trim() || identity.dpoName;
    const technicalResponsibleCrp = dto.technicalResponsibleCrp?.trim() || identity.technicalResponsibleCrp;
    // O pacote atesta pessoas reais: sem valores presumidos para DPO e responsável técnico
    if (!dpoName || !technicalResponsibleCrp) {
      throw new ComplianceInputError('Informe o nome do DPO e o CRP do responsável técnico para emitir o pacote.');
    }

    const pkg = buildExecutiveCompliancePackage({
      organization,
      dpoName,
      technicalResponsibleCrp,
      forensicMetrics: this.collectForensicMetrics()
    });

    this.packagesHistory.unshift(pkg);
    if (this.packagesHistory.length > 20) {
      this.packagesHistory.pop();
    }

    // Registra emissão na trilha WORM
    AuditService.log({
      action: AuditAction.EXECUTIVE_COMPLIANCE_GENERATED,
      resourceType: AuditResourceType.COMPLIANCE,
      resourceId: pkg.id,
      details: {
        canonicalDigest: pkg.canonicalDigest,
        tamperEvidentSeal: pkg.tamperEvidentSeal,
        globalScore: pkg.globalScorePercentage,
        totalControls: pkg.controls.length
      },
      actorId,
      ipAddress: ip
    });

    return pkg;
  }

  /**
   * Aplica a chancela formal do DPO (DPO Sign-Off) vinculada ao digest do pacote
   */
  public applyDpoSignOff(
    dto: ApplyDpoSignOffDTO,
    actorId = 'admin',
    ip = '127.0.0.1'
  ): ExecutiveCompliancePackage {
    const pkgIndex = this.packagesHistory.findIndex((p) => p.id === dto.packageId);
    if (pkgIndex === -1) {
      throw new Error(`Pacote de conformidade ${dto.packageId} não encontrado.`);
    }

    const currentPkg = this.packagesHistory[pkgIndex];
    const signedPkg = applyDpoSignOffToPackage(
      currentPkg,
      dto.dpoName,
      currentPkg.technicalResponsibleCrp,
      dto.statement
    );

    this.packagesHistory[pkgIndex] = signedPkg;

    // Registra chancela formal do DPO no WORM
    AuditService.log({
      action: AuditAction.DPO_SIGNOFF_APPLIED,
      resourceType: AuditResourceType.COMPLIANCE,
      resourceId: signedPkg.id,
      details: {
        signedBy: dto.dpoName,
        signatureDigest: signedPkg.dpoSignOff?.signatureDigest,
        canonicalDigest: signedPkg.canonicalDigest
      },
      actorId,
      ipAddress: ip
    });

    return signedPkg;
  }

  /**
   * Exporta o pacote em JSON estruturado com verificação pericial de integridade
   */
  public exportPackage(
    packageId?: string,
    actorId = 'admin',
    ip = '127.0.0.1'
  ): { package: ExecutiveCompliancePackage; integrityValid: boolean } {
    let pkg = packageId
      ? this.packagesHistory.find((p) => p.id === packageId)
      : this.packagesHistory[0];

    if (!pkg) {
      throw new ComplianceInputError('Nenhum pacote de conformidade emitido ainda.');
    }

    const verification = verifyCompliancePackageIntegrity(pkg);

    // Registra evento de exportação pericial no WORM
    AuditService.log({
      action: AuditAction.COMPLIANCE_PACKAGE_EXPORT,
      resourceType: AuditResourceType.COMPLIANCE,
      resourceId: pkg.id,
      details: {
        canonicalDigest: pkg.canonicalDigest,
        integrityValid: verification.valid
      },
      actorId,
      ipAddress: ip
    });

    return {
      package: pkg,
      integrityValid: verification.valid
    };
  }

  public getPackageById(id: string): ExecutiveCompliancePackage | undefined {
    return this.packagesHistory.find((p) => p.id === id);
  }

  public listPackages(): ExecutiveCompliancePackage[] {
    return [...this.packagesHistory];
  }

  /** Esvazia o histórico de pacotes (isolamento entre testes) */
  public reset(): void {
    this.packagesHistory = [];
  }
}

export const complianceGovernanceService = ComplianceGovernanceService.getInstance();
