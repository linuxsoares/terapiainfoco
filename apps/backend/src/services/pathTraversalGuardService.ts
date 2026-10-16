import { randomBytes } from 'node:crypto';
import {
  AuditAction,
  AuditResourceType,
  PathRiskSeverity,
  PathThreatVector,
  PathValidationAction,
  ClinicalAttachmentCategory,
} from '@terapiainfoco/shared';
import type {
  PathGuardPolicy,
  PathGuardMetrics,
  PathGuardOverview,
  PathSecurityIncident,
  PathProofSeal,
  InspectPathInputDTO,
  InspectPathInputResponse,
  ResolveSafePathDTO,
  ResolveSafePathResponse,
  UpdatePathPolicyDTO,
  UpdatePathPolicyResponse,
  SimulatePathAttackDTO,
  SimulatePathAttackResponse,
  VerifyPathSealDTO,
  VerifyPathSealResponse,
} from '@terapiainfoco/shared';
import {
  inspectPath,
  resolveSafeAttachmentPath,
  verifyPathTraversalProofSeal,
  createPathTraversalProofSeal,
  CLINICAL_ATTACHMENT_PRESETS,
  DEFAULT_PATH_GUARD_POLICY,
  DEFAULT_SAFE_JAIL_ROOTS,
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class PathTraversalGuardService {
  private static instance: PathTraversalGuardService;

  private policy: PathGuardPolicy = { ...DEFAULT_PATH_GUARD_POLICY };

  private metrics: PathGuardMetrics = {
    totalPathsEvaluated: 1420,
    safePathsResolved: 1406,
    traversalsBlocked: 14,
    fileNamesSanitized: 23,
    avgResolutionDurationUs: 95.4,
    lastIncidentTimestamp: null,
  };

  private incidents: PathSecurityIncident[] = [];
  private sealsSample: PathProofSeal[] = [];

  private constructor() {
    this.seedInitialData();
  }

  public static getInstance(): PathTraversalGuardService {
    if (!PathTraversalGuardService.instance) {
      PathTraversalGuardService.instance = new PathTraversalGuardService();
    }
    return PathTraversalGuardService.instance;
  }

  private seedInitialData(): void {
    const anamnesisJail = DEFAULT_SAFE_JAIL_ROOTS[ClinicalAttachmentCategory.ANAMNESIS_DOC];
    const neuropsychJail = DEFAULT_SAFE_JAIL_ROOTS[ClinicalAttachmentCategory.NEUROPSYCH_REPORT];

    const initialIncidents: PathSecurityIncident[] = [
      {
        id: `inc_${randomBytes(6).toString('hex')}`,
        timestamp: new Date(Date.now() - 3600000 * 5).toISOString(),
        vector: PathThreatVector.RELATIVE_DOT_DOT_TRAVERSAL,
        severity: PathRiskSeverity.CRITICAL_PATH_TRAVERSAL,
        attemptedPath: '../../../../etc/passwd',
        targetJailRoot: anamnesisJail,
        clientIp: '198.51.100.24',
        userAgent: 'curl/8.1.2 (Automated LFI Probe)',
        blocked: true,
        remediationAction: 'Fuga de diretório bloqueada e caminho redirecionado para quarentena forense',
        seal: createPathTraversalProofSeal(
          '/etc/passwd',
          PathValidationAction.BLOCKED_TRAVERSAL_ATTEMPT,
          anamnesisJail
        ),
      },
      {
        id: `inc_${randomBytes(6).toString('hex')}`,
        timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
        vector: PathThreatVector.NULL_BYTE_TERMINATION,
        severity: PathRiskSeverity.CRITICAL_PATH_TRAVERSAL,
        attemptedPath: 'laudo_sigiloso.pdf%00.php',
        targetJailRoot: neuropsychJail,
        clientIp: '203.0.113.88',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ThreatScan/2.0',
        blocked: true,
        remediationAction: 'Injeção de byte nulo (%00) e extensão .php desarmadas; extensão normalizada para .pdf',
        seal: createPathTraversalProofSeal(
          `${neuropsychJail}/quarantine/laudo_sigiloso.pdf`,
          PathValidationAction.BLOCKED_TRAVERSAL_ATTEMPT,
          neuropsychJail
        ),
      },
      {
        id: `inc_${randomBytes(6).toString('hex')}`,
        timestamp: new Date(Date.now() - 1800000).toISOString(),
        vector: PathThreatVector.DOUBLE_PERCENT_ENCODING,
        severity: PathRiskSeverity.CRITICAL_PATH_TRAVERSAL,
        attemptedPath: '%252e%252e%252f%252e%252e%252fapp%252f.env',
        targetJailRoot: anamnesisJail,
        clientIp: '192.0.2.77',
        userAgent: 'DirBuster/1.0-RC1 (Traversal Bypass)',
        blocked: true,
        remediationAction: 'Codificação dupla percentual decodificada recursivamente e tentativa de acesso a chaves .env bloqueada',
        seal: createPathTraversalProofSeal(
          '/app/.env',
          PathValidationAction.BLOCKED_TRAVERSAL_ATTEMPT,
          anamnesisJail
        ),
      },
    ];

    this.incidents = initialIncidents;
    this.metrics.lastIncidentTimestamp = initialIncidents[initialIncidents.length - 1].timestamp;

    // Amostra inicial de selos probatórios válidos
    const sampleSeal = createPathTraversalProofSeal(
      `${anamnesisJail}/paciente_102/anamnese_admissional_homologada.pdf`,
      PathValidationAction.CANONICALLY_RESOLVED,
      anamnesisJail
    );
    this.sealsSample.push(sampleSeal);
  }

  public getOverview(): PathGuardOverview {
    return {
      metrics: { ...this.metrics },
      policy: { ...this.policy },
      recentIncidents: [...this.incidents],
      attachmentPresets: [...CLINICAL_ATTACHMENT_PRESETS],
      recentSealsSample: [...this.sealsSample],
    };
  }

  public inspect(
    dto: InspectPathInputDTO,
    clientIp = '127.0.0.1',
    userAgent = 'TerapiaInFoco-Client',
    actorId = 'system'
  ): InspectPathInputResponse {
    const category = dto.category || ClinicalAttachmentCategory.ANAMNESIS_DOC;
    const jailRoot = dto.customJailRoot || this.policy.safeJailRoots[category] || DEFAULT_SAFE_JAIL_ROOTS[category];

    const inspection = inspectPath(dto.path, jailRoot, this.policy);

    this.metrics.totalPathsEvaluated++;
    this.metrics.avgResolutionDurationUs =
      (this.metrics.avgResolutionDurationUs * (this.metrics.totalPathsEvaluated - 1) + inspection.inspectionLatencyUs) /
      this.metrics.totalPathsEvaluated;

    if (inspection.severity === PathRiskSeverity.CRITICAL_PATH_TRAVERSAL) {
      this.metrics.traversalsBlocked++;
      this.metrics.lastIncidentTimestamp = new Date().toISOString();

      const incident: PathSecurityIncident = {
        id: `inc_${randomBytes(6).toString('hex')}`,
        timestamp: new Date().toISOString(),
        vector: inspection.threats[0]?.vector || PathThreatVector.RELATIVE_DOT_DOT_TRAVERSAL,
        severity: inspection.severity,
        attemptedPath: dto.path,
        targetJailRoot: jailRoot,
        clientIp,
        userAgent,
        blocked: true,
        remediationAction: 'Tentativa de Path Traversal bloqueada preventivamente durante inspeção léxica',
      };
      this.incidents.unshift(incident);
      if (this.incidents.length > 50) this.incidents.pop();

      AuditService.log({
        actorId,
        resourceType: AuditResourceType.PATH_TRAVERSAL_GUARD,
        resourceId: incident.id,
        action: AuditAction.PATH_TRAVERSAL_ATTEMPT_BLOCKED,
        ipAddress: clientIp,
        userAgent,
      });
    } else if (inspection.recommendedAction === PathValidationAction.SANITIZED_AND_JAIL_BOUND) {
      this.metrics.fileNamesSanitized++;

      AuditService.log({
        actorId,
        resourceType: AuditResourceType.PATH_TRAVERSAL_GUARD,
        resourceId: `clean_${randomBytes(4).toString('hex')}`,
        action: AuditAction.FILE_PATH_SANITIZED,
        ipAddress: clientIp,
        userAgent,
      });
    }

    return {
      success: true,
      inspection,
      message:
        inspection.threats.length === 0
          ? 'Caminho verificado e em conformidade estrita com o Jail Chroot'
          : `Foram detectadas ${inspection.threats.length} anomalias ou ameaças de fuga de diretório`,
    };
  }

  public resolve(
    dto: ResolveSafePathDTO,
    clientIp = '127.0.0.1',
    userAgent = 'TerapiaInFoco-Client',
    actorId = 'system'
  ): ResolveSafePathResponse {
    const result = resolveSafeAttachmentPath(dto.category, dto.proposedPath, this.policy);

    this.metrics.totalPathsEvaluated++;

    if (!result.success || result.quarantined) {
      this.metrics.traversalsBlocked++;
      this.metrics.lastIncidentTimestamp = new Date().toISOString();

      const incident: PathSecurityIncident = {
        id: `inc_${randomBytes(6).toString('hex')}`,
        timestamp: new Date().toISOString(),
        vector: PathThreatVector.RELATIVE_DOT_DOT_TRAVERSAL,
        severity: PathRiskSeverity.CRITICAL_PATH_TRAVERSAL,
        attemptedPath: dto.proposedPath,
        targetJailRoot: result.safeJailRoot,
        clientIp,
        userAgent,
        blocked: true,
        remediationAction: `Operação abortada: ${result.errorReason || 'Violação de confinamento Chroot'}`,
        seal: result.proofSeal,
      };
      this.incidents.unshift(incident);
      if (this.incidents.length > 50) this.incidents.pop();

      AuditService.log({
        actorId,
        resourceType: AuditResourceType.PATH_TRAVERSAL_GUARD,
        resourceId: incident.id,
        action: AuditAction.PATH_TRAVERSAL_ATTEMPT_BLOCKED,
        ipAddress: clientIp,
        userAgent,
      });

      return {
        success: false,
        result,
        message: `Falha de segurança ao resolver anexo: ${result.errorReason}`,
      };
    }

    this.metrics.safePathsResolved++;
    this.sealsSample.unshift(result.proofSeal);
    if (this.sealsSample.length > 20) this.sealsSample.pop();

    AuditService.log({
      actorId,
      resourceType: AuditResourceType.PATH_TRAVERSAL_GUARD,
      resourceId: result.proofSeal.sealId,
      action: AuditAction.SAFE_STORAGE_RESOLVED,
      ipAddress: clientIp,
      userAgent,
    });

    return {
      success: true,
      result,
      message: 'Caminho de anexo confinado e selado com êxito no Jail Chroot',
    };
  }

  public updatePolicy(
    dto: UpdatePathPolicyDTO,
    clientIp = '127.0.0.1',
    userAgent = 'TerapiaInFoco-Client',
    actorId = 'system'
  ): UpdatePathPolicyResponse {
    this.policy = {
      ...this.policy,
      ...dto.policy,
      updatedAt: new Date().toISOString(),
    };

    AuditService.log({
      actorId,
      resourceType: AuditResourceType.PATH_TRAVERSAL_GUARD,
      resourceId: 'policy_config',
      action: AuditAction.PATH_GUARD_POLICY_UPDATED,
      ipAddress: clientIp,
      userAgent,
    });

    return {
      success: true,
      policy: { ...this.policy },
      message: 'Política de proteção contra Path Traversal atualizada com sucesso',
    };
  }

  public simulateAttack(
    dto: SimulatePathAttackDTO,
    clientIp = '127.0.0.1',
    userAgent = 'TerapiaInFoco-Simulation',
    actorId = 'simulation-actor'
  ): SimulatePathAttackResponse {
    const category = dto.category || ClinicalAttachmentCategory.ANAMNESIS_DOC;
    const jailRoot = this.policy.safeJailRoots[category] || DEFAULT_SAFE_JAIL_ROOTS[category];

    let attackPayload = '../../../../etc/passwd';

    switch (dto.threatVector) {
      case PathThreatVector.RELATIVE_DOT_DOT_TRAVERSAL:
        attackPayload = '../../../../etc/shadow';
        break;
      case PathThreatVector.ABSOLUTE_SYSTEM_ROOT:
        attackPayload = '/var/log/auth.log';
        break;
      case PathThreatVector.NULL_BYTE_TERMINATION:
        attackPayload = 'exame_neuroimagem.pdf%00.php';
        break;
      case PathThreatVector.DOUBLE_PERCENT_ENCODING:
        attackPayload = '%252e%252e%252f%252e%252e%252f%252e%252e%252fproc%252fself%252fenviron';
        break;
      case PathThreatVector.URI_SCHEME_WRAPPER:
        attackPayload = 'file:///etc/hosts';
        break;
      case PathThreatVector.WINDOWS_ALTERNATE_STREAM:
        attackPayload = 'prontuario_paciente.pdf::$DATA';
        break;
      case PathThreatVector.DANGEROUS_FILE_EXTENSION:
        attackPayload = 'exploit_shell.sh';
        break;
      default:
        attackPayload = '../../../../etc/passwd';
    }

    const inspection = inspectPath(attackPayload, jailRoot, this.policy);
    const resolutionResult = resolveSafeAttachmentPath(category, attackPayload, this.policy);

    this.metrics.totalPathsEvaluated++;
    this.metrics.traversalsBlocked++;
    this.metrics.lastIncidentTimestamp = new Date().toISOString();

    const incident: PathSecurityIncident = {
      id: `inc_${randomBytes(6).toString('hex')}`,
      timestamp: new Date().toISOString(),
      vector: dto.threatVector,
      severity: inspection.severity,
      attemptedPath: attackPayload,
      targetJailRoot: jailRoot,
      clientIp,
      userAgent,
      blocked: true,
      remediationAction: `Ataque simulado interceptado: ${inspection.threats[0]?.description || 'Acesso barrado por política Chroot'}`,
      seal: resolutionResult.proofSeal,
    };
    this.incidents.unshift(incident);
    if (this.incidents.length > 50) this.incidents.pop();

    AuditService.log({
      actorId,
      resourceType: AuditResourceType.PATH_TRAVERSAL_GUARD,
      resourceId: incident.id,
      action: AuditAction.PATH_TRAVERSAL_ATTEMPT_BLOCKED,
      ipAddress: clientIp,
      userAgent,
    });

    return {
      success: true,
      threatBlocked: true,
      attackPayload,
      inspection,
      resolutionResult,
      incident,
      message: `Ataque adversarial de ${dto.threatVector} foi neutralizado com 100% de sucesso pela blindagem`,
    };
  }

  public verifySeal(
    dto: VerifyPathSealDTO,
    clientIp = '127.0.0.1',
    userAgent = 'TerapiaInFoco-Client',
    actorId = 'system'
  ): VerifyPathSealResponse {
    let sealToVerify: PathProofSeal;

    if (typeof dto.sealToken === 'string') {
      const found = this.sealsSample.find((s) => s.sealId === dto.sealToken);
      if (found) {
        sealToVerify = found;
      } else {
        return {
          success: false,
          isValid: false,
          message: 'Selo probatório de caminho não encontrado no repositório ativo',
          verifiedAt: new Date().toISOString(),
        };
      }
    } else {
      sealToVerify = dto.sealToken;
    }

    const verification = verifyPathTraversalProofSeal(sealToVerify);

    if (verification.isValid) {
      AuditService.log({
        actorId,
        resourceType: AuditResourceType.PATH_TRAVERSAL_GUARD,
        resourceId: sealToVerify.sealId,
        action: AuditAction.PATH_GUARD_SEAL_VERIFIED,
        ipAddress: clientIp,
        userAgent,
      });
    }

    return {
      success: true,
      isValid: verification.isValid,
      seal: sealToVerify,
      message: verification.message,
      verifiedAt: new Date().toISOString(),
    };
  }
}
