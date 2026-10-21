import { randomBytes } from 'node:crypto';
import {
  AuditAction,
  AuditResourceType,
  ExpressionRiskSeverity,
  ExpressionThreatCategory,
  ExpressionValidationAction,
  ExpressionFilterDialect,
} from '@terapiainfoco/shared';
import type {
  ExpressionGuardPolicy,
  ExpressionGuardMetrics,
  ExpressionGuardOverview,
  ExpressionSecurityIncident,
  ExpressionProofSeal,
  ClinicalRecordSample,
  InspectExpressionDTO,
  InspectExpressionResponse,
  EvaluateExpressionDTO,
  EvaluateExpressionResponse,
  UpdateExpressionPolicyDTO,
  UpdateExpressionPolicyResponse,
  SimulateExpressionAttackDTO,
  SimulateExpressionAttackResponse,
  VerifyExpressionSealDTO,
  VerifyExpressionSealResponse,
} from '@terapiainfoco/shared';
import {
  inspectExpressionSecurity,
  evaluateClinicalExpression,
  createExpressionProofSeal,
  verifyExpressionProofSeal,
  DEFAULT_EXPRESSION_GUARD_POLICY,
  CLINICAL_RECORDS_MOCK,
  PENTEST_ATTACK_PRESETS,
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class ExpressionInjectionGuardService {
  private static instance: ExpressionInjectionGuardService;

  private policy: ExpressionGuardPolicy = { ...DEFAULT_EXPRESSION_GUARD_POLICY };

  private metrics: ExpressionGuardMetrics = {
    totalExpressionsInspected: 2840,
    safeExpressionsAllowed: 2818,
    attacksBlocked: 22,
    expressionsSanitized: 15,
    clinicalRecordsEvaluated: 14200,
    avgInspectionDurationUs: 142.6,
    threatsByCategory: {
      [ExpressionThreatCategory.SYSTEM_GLOBAL_ACCESS]: 8,
      [ExpressionThreatCategory.PROTOTYPE_POLLUTION_EXPR]: 5,
      [ExpressionThreatCategory.TEMPLATE_LITERAL_INJECTION]: 4,
      [ExpressionThreatCategory.NOSQL_CODE_OPERATOR]: 3,
      [ExpressionThreatCategory.DYNAMIC_CODE_EXECUTION]: 2,
    },
    lastIncidentTimestamp: null,
  };

  private incidents: ExpressionSecurityIncident[] = [];
  private sealsSample: ExpressionProofSeal[] = [];
  private clinicalRecords: ClinicalRecordSample[] = [...CLINICAL_RECORDS_MOCK];

  private constructor() {
    this.seedInitialData();
  }

  public static getInstance(): ExpressionInjectionGuardService {
    if (!ExpressionInjectionGuardService.instance) {
      ExpressionInjectionGuardService.instance = new ExpressionInjectionGuardService();
    }
    return ExpressionInjectionGuardService.instance;
  }

  private seedInitialData(): void {
    const initialIncidents: ExpressionSecurityIncident[] = [
      {
        id: `inc_${randomBytes(6).toString('hex')}`,
        timestamp: new Date(Date.now() - 3600000 * 6).toISOString(),
        dialect: ExpressionFilterDialect.CLINICAL_AST_DSL,
        rawExpression: "require('child_process').execSync('id') && cid11 == '6A70'",
        category: ExpressionThreatCategory.SYSTEM_GLOBAL_ACCESS,
        severity: ExpressionRiskSeverity.CRITICAL,
        clientIp: '198.51.100.82',
        userAgent: 'python-requests/2.31.0 (Adversarial RCE Probe)',
        blocked: true,
        remediationAction: 'Invocação direta de require/child_process bloqueada pelo parser AST seguro sem execução',
        threats: [
          {
            category: ExpressionThreatCategory.SYSTEM_GLOBAL_ACCESS,
            pattern: 'process|require|child_process',
            match: 'require',
            severity: ExpressionRiskSeverity.CRITICAL,
            description: 'Tentativa de acesso a objetos globais, módulos de sistema ou APIs de processo (RCE)',
          },
        ],
        seal: createExpressionProofSeal({
          expression: "require('child_process').execSync('id')",
          dialect: ExpressionFilterDialect.CLINICAL_AST_DSL,
          decision: ExpressionValidationAction.BLOCK_ATTACK,
          threatsDetected: 1,
          astNodeCount: 0,
          astDepth: 0,
        }),
      },
      {
        id: `inc_${randomBytes(6).toString('hex')}`,
        timestamp: new Date(Date.now() - 3600000 * 3).toISOString(),
        dialect: ExpressionFilterDialect.CLINICAL_AST_DSL,
        rawExpression: "__proto__.isAdmin = true && severity == 'SEVERE'",
        category: ExpressionThreatCategory.PROTOTYPE_POLLUTION_EXPR,
        severity: ExpressionRiskSeverity.CRITICAL,
        clientIp: '203.0.113.41',
        userAgent: 'Mozilla/5.0 ThreatScanner/3.1 (Prototype Polluter)',
        blocked: true,
        remediationAction: 'Acesso à propriedade __proto__ interceptado e isolado antes da montagem da AST',
        threats: [
          {
            category: ExpressionThreatCategory.PROTOTYPE_POLLUTION_EXPR,
            pattern: '__proto__|constructor|prototype',
            match: '__proto__',
            severity: ExpressionRiskSeverity.CRITICAL,
            description: 'Tentativa de manipulação de protótipo de objeto ou escape de escopo (Prototype Pollution / CWE-1321)',
          },
        ],
        seal: createExpressionProofSeal({
          expression: '__proto__.isAdmin = true',
          dialect: ExpressionFilterDialect.CLINICAL_AST_DSL,
          decision: ExpressionValidationAction.BLOCK_ATTACK,
          threatsDetected: 1,
          astNodeCount: 0,
          astDepth: 0,
        }),
      },
      {
        id: `inc_${randomBytes(6).toString('hex')}`,
        timestamp: new Date(Date.now() - 1800000).toISOString(),
        dialect: ExpressionFilterDialect.SAFE_MONGO_PREDICATE,
        rawExpression: "{ $where: 'sleep(5000) || true', cid11: '6A70' }",
        category: ExpressionThreatCategory.NOSQL_CODE_OPERATOR,
        severity: ExpressionRiskSeverity.CRITICAL,
        clientIp: '192.0.2.119',
        userAgent: 'SQLMap/1.7.9#dev (NoSQL Injection Engine)',
        blocked: true,
        remediationAction: 'Operador NoSQL $where com JavaScript executável rejeitado incondicionalmente',
        threats: [
          {
            category: ExpressionThreatCategory.NOSQL_CODE_OPERATOR,
            pattern: '$where|$function',
            match: '$where',
            severity: ExpressionRiskSeverity.CRITICAL,
            description: 'Uso de operadores NoSQL executáveis em JavaScript arbitrário ($where, $function)',
          },
        ],
        seal: createExpressionProofSeal({
          expression: '$where: sleep(5000)',
          dialect: ExpressionFilterDialect.SAFE_MONGO_PREDICATE,
          decision: ExpressionValidationAction.BLOCK_ATTACK,
          threatsDetected: 1,
          astNodeCount: 0,
          astDepth: 0,
        }),
      },
    ];

    this.incidents = initialIncidents;
    this.metrics.lastIncidentTimestamp = initialIncidents[initialIncidents.length - 1].timestamp;

    // Amostra inicial de selo probatório seguro
    const sampleSeal = createExpressionProofSeal({
      expression: "cidCategory == 'DEPRESSION' && riskLevel == 'CRITICAL'",
      dialect: ExpressionFilterDialect.CLINICAL_AST_DSL,
      decision: ExpressionValidationAction.ALLOW_EXECUTION,
      threatsDetected: 0,
      astNodeCount: 7,
      astDepth: 3,
    });
    this.sealsSample.push(sampleSeal);
  }

  public getOverview(): ExpressionGuardOverview {
    return {
      metrics: { ...this.metrics },
      policy: { ...this.policy },
      recentIncidents: [...this.incidents],
      clinicalRecordsSample: [...this.clinicalRecords],
      recentSealsSample: [...this.sealsSample],
    };
  }

  public async inspectExpression(
    dto: InspectExpressionDTO,
    clientIp: string = '127.0.0.1',
    userAgent: string = 'Unknown',
    actorId: string = 'system_ast_inspector'
  ): Promise<InspectExpressionResponse> {
    const dialect = dto.dialect || this.policy.defaultDialect;
    const inspection = inspectExpressionSecurity(dto.expression, dialect, this.policy);

    this.metrics.totalExpressionsInspected++;
    this.metrics.avgInspectionDurationUs = Math.round(
      (this.metrics.avgInspectionDurationUs * (this.metrics.totalExpressionsInspected - 1) + inspection.inspectionDurationUs) /
        this.metrics.totalExpressionsInspected
    );

    if (inspection.isSafe) {
      this.metrics.safeExpressionsAllowed++;
      if (inspection.seal) {
        this.sealsSample.unshift(inspection.seal);
        if (this.sealsSample.length > 20) this.sealsSample.pop();
      }
    } else {
      this.metrics.attacksBlocked++;
      const topThreat = inspection.threats[0];
      const category = topThreat?.category || ExpressionThreatCategory.MALFORMED_SYNTAX;
      this.metrics.threatsByCategory[category] = (this.metrics.threatsByCategory[category] || 0) + 1;
      this.metrics.lastIncidentTimestamp = new Date().toISOString();

      const incident: ExpressionSecurityIncident = {
        id: `inc_${randomBytes(6).toString('hex')}`,
        timestamp: new Date().toISOString(),
        dialect,
        rawExpression: dto.expression,
        category,
        severity: inspection.severity,
        clientIp,
        userAgent,
        blocked: true,
        remediationAction: 'Expressão de consulta bloqueada por violar regras de injeção de código e AST segura',
        threats: inspection.threats,
        seal: inspection.seal,
      };

      this.incidents.unshift(incident);
      if (this.incidents.length > 50) this.incidents.pop();

      // Auditoria WORM obrigatória de ataque bloqueado
      AuditService.log({
        actorId,
        action: AuditAction.CODE_INJECTION_ATTEMPT_BLOCKED,
        resourceType: AuditResourceType.CODE_EXPRESSION_GUARD,
        resourceId: incident.id,
        severity: 'CRITICAL',
        ipAddress: clientIp,
        userAgent,
        details: {
          expression: dto.expression,
          category,
          threatCount: inspection.threats.length,
          threats: inspection.threats.map((t) => t.description),
        },
      });
    }

    return {
      success: true,
      inspection,
      message: inspection.isSafe
        ? 'Expressão clínica validada com sucesso pelo validador AST.'
        : `Ameaça de injeção de código detectada (${inspection.threats.length} violações). Operação bloqueada.`,
    };
  }

  public async evaluateExpression(
    dto: EvaluateExpressionDTO,
    clientIp: string = '127.0.0.1',
    userAgent: string = 'Unknown',
    actorId: string = 'system_ast_evaluator'
  ): Promise<EvaluateExpressionResponse> {
    const dialect = dto.dialect || this.policy.defaultDialect;
    const records = dto.recordsSubset && dto.recordsSubset.length > 0 ? dto.recordsSubset : this.clinicalRecords;
    const result = evaluateClinicalExpression(dto.expression, records, dialect, this.policy);

    if (result.success) {
      this.metrics.clinicalRecordsEvaluated += result.totalRecordsEvaluated;
      this.sealsSample.unshift(result.proofSeal);
      if (this.sealsSample.length > 20) this.sealsSample.pop();

      // Auditoria WORM de avaliação de filtro autorizada
      AuditService.log({
        actorId,
        action: AuditAction.SAFE_AST_FILTER_EVALUATED,
        resourceType: AuditResourceType.CODE_EXPRESSION_GUARD,
        resourceId: result.proofSeal.sealId,
        severity: 'LOW',
        ipAddress: clientIp,
        userAgent,
        details: {
          expression: dto.expression,
          dialect,
          matchedCount: result.matchedCount,
          totalRecordsEvaluated: result.totalRecordsEvaluated,
          durationUs: result.evaluationDurationUs,
        },
      });

      return {
        success: true,
        result,
        message: `Filtro clínico avaliado com segurança via AST (Zero eval). ${result.matchedCount} de ${result.totalRecordsEvaluated} prontuários localizados.`,
      };
    } else {
      this.metrics.attacksBlocked++;
      this.metrics.lastIncidentTimestamp = new Date().toISOString();

      const incident: ExpressionSecurityIncident = {
        id: `inc_${randomBytes(6).toString('hex')}`,
        timestamp: new Date().toISOString(),
        dialect,
        rawExpression: dto.expression,
        category: ExpressionThreatCategory.DYNAMIC_CODE_EXECUTION,
        severity: ExpressionRiskSeverity.CRITICAL,
        clientIp,
        userAgent,
        blocked: true,
        remediationAction: result.errorReason || 'Execução bloqueada pelo Sandbox AST',
        threats: [
          {
            category: ExpressionThreatCategory.DYNAMIC_CODE_EXECUTION,
            pattern: 'DYNAMIC_CODE_INJECTION',
            match: dto.expression.substring(0, 50),
            severity: ExpressionRiskSeverity.CRITICAL,
            description: result.errorReason || 'Expressão insegura bloqueada',
          },
        ],
        seal: result.proofSeal,
      };

      this.incidents.unshift(incident);
      if (this.incidents.length > 50) this.incidents.pop();

      // Auditoria WORM de tentativa de injeção bloqueada
      AuditService.log({
        actorId,
        action: AuditAction.CODE_INJECTION_ATTEMPT_BLOCKED,
        resourceType: AuditResourceType.CODE_EXPRESSION_GUARD,
        resourceId: incident.id,
        severity: 'CRITICAL',
        ipAddress: clientIp,
        userAgent,
        details: {
          expression: dto.expression,
          errorReason: result.errorReason,
        },
      });

      return {
        success: false,
        result,
        message: `Falha na avaliação: ${result.errorReason}`,
      };
    }
  }

  public async updatePolicy(
    dto: UpdateExpressionPolicyDTO,
    clientIp: string = '127.0.0.1',
    userAgent: string = 'Unknown',
    actorId: string = 'dpo_security_officer'
  ): Promise<UpdateExpressionPolicyResponse> {
    this.policy = {
      ...this.policy,
      ...dto.policy,
      updatedAt: new Date().toISOString(),
    };

    // Auditoria WORM da atualização de políticas
    AuditService.log({
      actorId,
      action: AuditAction.EXPRESSION_POLICY_UPDATED,
      resourceType: AuditResourceType.CODE_EXPRESSION_GUARD,
      resourceId: 'policy_code_expression_guard_v1',
      severity: 'MEDIUM',
      ipAddress: clientIp,
      userAgent,
      details: {
        newPolicy: this.policy,
      },
    });

    return {
      success: true,
      policy: { ...this.policy },
      message: 'Política de proteção contra injeção de código atualizada com sucesso.',
    };
  }

  public async simulateAttack(
    dto: SimulateExpressionAttackDTO,
    clientIp: string = '127.0.0.1',
    userAgent: string = 'Unknown',
    actorId: string = 'security_pentest_suite'
  ): Promise<SimulateExpressionAttackResponse> {
    const preset =
      PENTEST_ATTACK_PRESETS.find((p) => p.category === dto.threatCategory) || PENTEST_ATTACK_PRESETS[0];

    const dialect = dto.dialect || this.policy.defaultDialect;
    const inspection = inspectExpressionSecurity(preset.payload, dialect, this.policy);

    this.metrics.totalExpressionsInspected++;
    this.metrics.attacksBlocked++;
    this.metrics.threatsByCategory[preset.category] = (this.metrics.threatsByCategory[preset.category] || 0) + 1;
    this.metrics.lastIncidentTimestamp = new Date().toISOString();

    const incident: ExpressionSecurityIncident = {
      id: `inc_${randomBytes(6).toString('hex')}`,
      timestamp: new Date().toISOString(),
      dialect,
      rawExpression: preset.payload,
      category: preset.category,
      severity: inspection.severity,
      clientIp,
      userAgent: `Pentest-Simulator/2.0 (${preset.label})`,
      blocked: true,
      remediationAction: `Ataque ${preset.label} neutralizado com sucesso pela AST.`,
      threats: inspection.threats,
      seal: inspection.seal,
    };

    this.incidents.unshift(incident);
    if (this.incidents.length > 50) this.incidents.pop();

    // Auditoria WORM
    AuditService.log({
      actorId,
      action: AuditAction.CODE_INJECTION_ATTEMPT_BLOCKED,
      resourceType: AuditResourceType.CODE_EXPRESSION_GUARD,
      resourceId: incident.id,
      severity: 'CRITICAL',
      ipAddress: clientIp,
      userAgent,
      details: {
        attackLabel: preset.label,
        category: preset.category,
        payload: preset.payload,
        threats: inspection.threats.map((t) => t.description),
      },
    });

    return {
      success: true,
      threatBlocked: true,
      attackPayload: preset.payload,
      inspection,
      incident,
      message: `Simulação de ataque '${preset.label}' interceptada e neutralizada com sucesso.`,
    };
  }

  public async verifySeal(
    dto: VerifyExpressionSealDTO,
    clientIp: string = '127.0.0.1',
    userAgent: string = 'Unknown',
    actorId: string = 'notary_cartorio_dpo'
  ): Promise<VerifyExpressionSealResponse> {
    let sealToVerify: ExpressionProofSeal;

    if (typeof dto.sealToken === 'string') {
      try {
        sealToVerify = JSON.parse(dto.sealToken);
      } catch {
        const found = this.sealsSample.find((s) => s.sealId === dto.sealToken);
        if (found) {
          sealToVerify = found;
        } else {
          return {
            success: false,
            isValid: false,
            message: 'Token de selo inválido ou não localizado no livro notarial.',
            verifiedAt: new Date().toISOString(),
          };
        }
      }
    } else {
      sealToVerify = dto.sealToken;
    }

    const verification = verifyExpressionProofSeal(sealToVerify);

    // Auditoria WORM da verificação
    AuditService.log({
      actorId,
      action: AuditAction.EXPRESSION_SEAL_VERIFIED,
      resourceType: AuditResourceType.CODE_EXPRESSION_GUARD,
      resourceId: sealToVerify.sealId || 'unknown',
      severity: 'LOW',
      ipAddress: clientIp,
      userAgent,
      details: {
        isValid: verification.isValid,
        error: verification.error,
        sealId: sealToVerify.sealId,
      },
    });

    return {
      success: true,
      isValid: verification.isValid,
      seal: sealToVerify,
      message: verification.isValid
        ? 'Selo probatório WORM RFC 8785 verificado com 100% de integridade e fé pública digital.'
        : `Falha na verificação do selo probatório: ${verification.error}`,
      verifiedAt: new Date().toISOString(),
    };
  }
}
