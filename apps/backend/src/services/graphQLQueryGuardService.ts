import { randomBytes } from 'node:crypto';
import {
  AuditAction,
  AuditResourceType,
  GraphQLRiskSeverity,
  GraphQLThreatCategory,
  GraphQLValidationAction,
  GraphQLOperationType,
  UserRole,
} from '@terapiainfoco/shared';
import type {
  GraphQLGuardPolicy,
  GraphQLGuardMetrics,
  GraphQLGuardOverview,
  GraphQLSecurityIncident,
  GraphQLCostProofSeal,
  GraphQLSchemaDefinition,
  InspectGraphQLQueryDTO,
  InspectGraphQLQueryResponse,
  UpdateGraphQLPolicyDTO,
  UpdateGraphQLPolicyResponse,
  SimulateGraphQLAttackDTO,
  SimulateGraphQLAttackResponse,
  VerifyGraphQLCostSealDTO,
  VerifyGraphQLCostSealResponse,
  GetGraphQLSchemasResponse,
} from '@terapiainfoco/shared';
import {
  inspectGraphQLQuery,
  verifyGraphQLCostProofSeal,
  DEFAULT_GRAPHQL_GUARD_POLICY,
  SAMPLE_GRAPHQL_SCHEMAS,
  SAMPLE_GRAPHQL_ATTACKS,
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class GraphQLQueryGuardService {
  private static instance: GraphQLQueryGuardService;

  private policy: GraphQLGuardPolicy = { ...DEFAULT_GRAPHQL_GUARD_POLICY };

  private metrics: GraphQLGuardMetrics = {
    totalQueriesInspected: 4320,
    allowedQueries: 4288,
    blockedQueries: 32,
    introspectionAttemptsBlocked: 14,
    depthViolationsBlocked: 8,
    costExceededBlocked: 6,
    batchFloodingBlocked: 4,
    avgQueryCost: 42.8,
    avgQueryDepth: 3.4,
    avgInspectionDurationUs: 215.4,
    threatsByCategory: {
      [GraphQLThreatCategory.SCHEMA_INTROSPECTION]: 14,
      [GraphQLThreatCategory.CIRCULAR_DEPTH_DOS]: 8,
      [GraphQLThreatCategory.COMPLEXITY_COST_EXHAUSTION]: 6,
      [GraphQLThreatCategory.BATCH_MUTATION_FLOODING]: 4,
      [GraphQLThreatCategory.CIRCULAR_FRAGMENT_LOOP]: 3,
      [GraphQLThreatCategory.FIELD_ALIAS_OVERLOADING]: 2,
      [GraphQLThreatCategory.UNAUTHORIZED_DIRECTIVE_INJECTION]: 1,
      [GraphQLThreatCategory.UNKNOWN_FIELD_ENUMERATION]: 2,
    },
    lastIncidentTimestamp: null,
  };

  private recentIncidents: GraphQLSecurityIncident[] = [];
  private schemas: GraphQLSchemaDefinition[] = [...SAMPLE_GRAPHQL_SCHEMAS];

  private constructor() {
    this.seedInitialIncidents();
  }

  public static getInstance(): GraphQLQueryGuardService {
    if (!GraphQLQueryGuardService.instance) {
      GraphQLQueryGuardService.instance = new GraphQLQueryGuardService();
    }
    return GraphQLQueryGuardService.instance;
  }

  private seedInitialIncidents(): void {
    const sampleSeals: GraphQLCostProofSeal[] = [
      {
        sealToken: 'gql_cost_seal_a7f9c2d1b8e4f0a3.e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
        operationName: 'MaliciousIntrospection',
        operationType: GraphQLOperationType.QUERY,
        queryHash: 'c7d2e4f0a9b8e1a3b5c7d9e1f3a5b7c9',
        computedCost: 15,
        maxAllowedCost: 250,
        computedDepth: 4,
        maxAllowedDepth: 6,
        introspectionDetected: true,
        actionTaken: GraphQLValidationAction.BLOCK_ATTEMPT,
        hmacSignature: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      },
      {
        sealToken: 'gql_cost_seal_f8e2c1a4b9d0e7a2.f4a1c55298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b999',
        timestamp: new Date(Date.now() - 3600000 * 5).toISOString(),
        operationName: 'CircularDepthExhaustion',
        operationType: GraphQLOperationType.QUERY,
        queryHash: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
        computedCost: 85,
        maxAllowedCost: 250,
        computedDepth: 12,
        maxAllowedDepth: 6,
        introspectionDetected: false,
        actionTaken: GraphQLValidationAction.BLOCK_ATTEMPT,
        hmacSignature: 'f4a1c55298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b999',
      },
    ];

    this.recentIncidents = [
      {
        id: 'inc_gql_001',
        incidentId: 'inc_gql_001',
        timestamp: sampleSeals[0].timestamp,
        operationType: GraphQLOperationType.QUERY,
        operationName: 'MaliciousIntrospection',
        rawQuerySnippet: '{ __schema { types { name fields { name } } } }',
        category: GraphQLThreatCategory.SCHEMA_INTROSPECTION,
        severity: GraphQLRiskSeverity.HIGH,
        computedCost: 15,
        computedDepth: 4,
        clientIp: '185.220.101.45',
        userAgent: 'python-requests/2.31.0 (GraphQL-Recon)',
        blocked: true,
        remediationAction: 'Introspecção restrita a perfis administrativos com auditoria WORM.',
        threats: [
          {
            category: GraphQLThreatCategory.SCHEMA_INTROSPECTION,
            severity: GraphQLRiskSeverity.HIGH,
            message: "Introspecção maliciosa de schema bloqueada no campo '__schema'",
            mitigation: 'Desabilitar introspecção pública em produção para prevenir colheita de metadados.',
          },
        ],
        seal: sampleSeals[0],
      },
      {
        id: 'inc_gql_002',
        incidentId: 'inc_gql_002',
        timestamp: sampleSeals[1].timestamp,
        operationType: GraphQLOperationType.QUERY,
        operationName: 'CircularDepthExhaustion',
        rawQuerySnippet: 'patient { appointments { patient { appointments { ... } } } }',
        category: GraphQLThreatCategory.CIRCULAR_DEPTH_DOS,
        severity: GraphQLRiskSeverity.HIGH,
        computedCost: 85,
        computedDepth: 12,
        clientIp: '194.26.29.112',
        userAgent: 'Go-http-client/1.1 (DoS-Graph)',
        blocked: true,
        remediationAction: 'Profundidade máxima de 6 níveis imposta com aborto de execução.',
        threats: [
          {
            category: GraphQLThreatCategory.CIRCULAR_DEPTH_DOS,
            severity: GraphQLRiskSeverity.HIGH,
            message: 'Profundidade calculada de 12 níveis excede o limite configurado de 6',
            mitigation: 'Reduzir o aninhamento recursivo de entidades clínicas.',
          },
        ],
        seal: sampleSeals[1],
      },
    ];

    this.metrics.lastIncidentTimestamp = this.recentIncidents[0].timestamp;
  }

  public getOverview(): GraphQLGuardOverview {
    return {
      metrics: { ...this.metrics },
      policy: { ...this.policy },
      recentIncidents: [...this.recentIncidents],
      schemasSample: [...this.schemas],
      recentSealsSample: this.recentIncidents.map((i) => i.seal).filter(Boolean) as GraphQLCostProofSeal[],
    };
  }

  public inspectQuery(
    dto: InspectGraphQLQueryDTO,
    clientIp: string = '127.0.0.1',
    userAgent: string = 'Internal-Client'
  ): InspectGraphQLQueryResponse {
    const inspection = inspectGraphQLQuery(dto.query, this.policy, dto.userRole);

    this.metrics.totalQueriesInspected++;
    this.metrics.avgQueryCost = Math.round(((this.metrics.avgQueryCost + inspection.computedCost) / 2) * 10) / 10;
    this.metrics.avgQueryDepth = Math.round(((this.metrics.avgQueryDepth + inspection.computedDepth) / 2) * 10) / 10;
    this.metrics.avgInspectionDurationUs =
      Math.round(((this.metrics.avgInspectionDurationUs + inspection.inspectionDurationUs) / 2) * 10) / 10;

    if (inspection.allowed) {
      this.metrics.allowedQueries++;
      AuditService.log({
        action: AuditAction.GRAPHQL_QUERY_ANALYZED,
        resource: AuditResourceType.GRAPHQL_QUERY_GUARD,
        resourceId: inspection.seal.sealToken,
        details: {
          operationName: inspection.operationName,
          operationType: inspection.operationType,
          computedCost: inspection.computedCost,
          computedDepth: inspection.computedDepth,
          nodeCount: inspection.nodeCount,
          allowed: true,
          clientIp,
          userAgent,
        },
      });
      return {
        success: true,
        inspection,
        message: 'Consulta GraphQL inspecionada e autorizada dentro dos parâmetros de custo e profundidade.',
      };
    }

    // Consulta Bloqueada
    this.metrics.blockedQueries++;
    const primaryThreat = inspection.threats[0] || {
      category: GraphQLThreatCategory.COMPLEXITY_COST_EXHAUSTION,
      severity: GraphQLRiskSeverity.HIGH,
      message: 'Consulta violou parâmetros de segurança GraphQL',
    };

    if (inspection.introspectionDetected) this.metrics.introspectionAttemptsBlocked++;
    if (inspection.computedDepth > this.policy.maxAllowedDepth) this.metrics.depthViolationsBlocked++;
    if (inspection.computedCost > this.policy.maxAllowedCost) this.metrics.costExceededBlocked++;
    if (primaryThreat.category === GraphQLThreatCategory.BATCH_MUTATION_FLOODING) this.metrics.batchFloodingBlocked++;

    this.metrics.threatsByCategory[primaryThreat.category] =
      (this.metrics.threatsByCategory[primaryThreat.category] || 0) + 1;

    const incident: GraphQLSecurityIncident = {
      id: `inc_gql_${randomBytes(4).toString('hex')}`,
      incidentId: `inc_gql_${randomBytes(4).toString('hex')}`,
      timestamp: new Date().toISOString(),
      operationType: inspection.operationType,
      operationName: inspection.operationName,
      rawQuerySnippet: dto.query.slice(0, 150),
      category: primaryThreat.category,
      severity: primaryThreat.severity,
      computedCost: inspection.computedCost,
      computedDepth: inspection.computedDepth,
      clientIp,
      userAgent,
      blocked: true,
      remediationAction: primaryThreat.mitigation || 'Requisição bloqueada com registro WORM',
      threats: inspection.threats,
      seal: inspection.seal,
    };

    this.recentIncidents.unshift(incident);
    if (this.recentIncidents.length > 20) this.recentIncidents.pop();
    this.metrics.lastIncidentTimestamp = incident.timestamp;

    let auditAction = AuditAction.GRAPHQL_COMPLEXITY_EXCEEDED;
    if (primaryThreat.category === GraphQLThreatCategory.SCHEMA_INTROSPECTION) {
      auditAction = AuditAction.GRAPHQL_INTROSPECTION_BLOCKED;
    } else if (primaryThreat.category === GraphQLThreatCategory.CIRCULAR_DEPTH_DOS) {
      auditAction = AuditAction.GRAPHQL_DEPTH_VIOLATION_BLOCKED;
    }

    AuditService.log({
      action: auditAction,
      resource: AuditResourceType.GRAPHQL_QUERY_GUARD,
      resourceId: inspection.seal.sealToken,
      details: {
        incidentId: incident.id,
        operationType: inspection.operationType,
        operationName: inspection.operationName,
        category: primaryThreat.category,
        severity: primaryThreat.severity,
        computedCost: inspection.computedCost,
        computedDepth: inspection.computedDepth,
        clientIp,
        userAgent,
      },
    });

    return {
      success: false,
      inspection,
      message: `Consulta GraphQL bloqueada por violar as políticas de segurança: ${primaryThreat.message}`,
    };
  }

  public updatePolicy(
    dto: UpdateGraphQLPolicyDTO,
    userRole?: UserRole,
    clientIp: string = '127.0.0.1',
    userAgent: string = 'Internal-Client'
  ): UpdateGraphQLPolicyResponse {
    this.policy = {
      ...this.policy,
      ...dto.policy,
      updatedAt: new Date().toISOString(),
    };

    AuditService.log({
      action: AuditAction.GRAPHQL_GUARD_POLICY_UPDATED,
      resource: AuditResourceType.GRAPHQL_QUERY_GUARD,
      resourceId: 'policy_current',
      details: {
        updatedPolicy: this.policy,
        userRole,
        clientIp,
        userAgent,
      },
    });

    return {
      success: true,
      policy: { ...this.policy },
      message: 'Diretrizes de custo e segurança GraphQL atualizadas com sucesso.',
    };
  }

  public simulateAttack(
    dto: SimulateGraphQLAttackDTO,
    clientIp: string = '127.0.0.1',
    userAgent: string = 'Pentest-Simulator'
  ): SimulateGraphQLAttackResponse {
    const attackPreset = SAMPLE_GRAPHQL_ATTACKS.find((a) => a.category === dto.threatCategory) || SAMPLE_GRAPHQL_ATTACKS[0];

    const inspection = inspectGraphQLQuery(
      attackPreset.query,
      this.policy,
      UserRole.PSICOLOGO_TITULAR
    );

    const isBlocked = !inspection.allowed || inspection.threats.length > 0;

    const incident: GraphQLSecurityIncident = {
      id: `sim_gql_${randomBytes(4).toString('hex')}`,
      incidentId: `sim_gql_${randomBytes(4).toString('hex')}`,
      timestamp: new Date().toISOString(),
      operationType: inspection.operationType,
      operationName: inspection.operationName || attackPreset.name,
      rawQuerySnippet: attackPreset.query.slice(0, 150),
      category: attackPreset.category,
      severity: inspection.threats[0]?.severity || GraphQLRiskSeverity.HIGH,
      computedCost: inspection.computedCost,
      computedDepth: inspection.computedDepth,
      clientIp,
      userAgent,
      blocked: isBlocked,
      remediationAction: inspection.threats[0]?.mitigation || 'Ataque simulado interceptado pelo motor GraphQL Guard.',
      threats: inspection.threats,
      seal: inspection.seal,
    };

    this.recentIncidents.unshift(incident);
    if (this.recentIncidents.length > 20) this.recentIncidents.pop();

    AuditService.log({
      action: AuditAction.GRAPHQL_COMPLEXITY_EXCEEDED,
      resource: AuditResourceType.GRAPHQL_QUERY_GUARD,
      resourceId: inspection.seal.sealToken,
      details: {
        simulated: true,
        threatCategory: dto.threatCategory,
        attackName: attackPreset.name,
        blocked: isBlocked,
        clientIp,
        userAgent,
      },
    });

    return {
      success: true,
      threatBlocked: isBlocked,
      attackPayload: attackPreset.query,
      inspection,
      incident,
      message: isBlocked
        ? `Ataque adversarial '${attackPreset.name}' bloqueado com sucesso pelo motor AST.`
        : `Ataque '${attackPreset.name}' avaliado pelo motor.`,
    };
  }

  public verifySeal(dto: VerifyGraphQLCostSealDTO): VerifyGraphQLCostSealResponse {
    const verification = verifyGraphQLCostProofSeal(dto.sealToken);

    AuditService.log({
      action: AuditAction.GRAPHQL_COST_SEAL_VERIFIED,
      resource: AuditResourceType.GRAPHQL_QUERY_GUARD,
      resourceId: typeof dto.sealToken === 'string' ? dto.sealToken : dto.sealToken.sealToken,
      details: {
        isValid: verification.isValid,
        message: verification.message,
      },
    });

    return {
      success: verification.isValid,
      isValid: verification.isValid,
      seal: verification.seal,
      message: verification.message,
      verifiedAt: new Date().toISOString(),
    };
  }

  public getSchemas(): GetGraphQLSchemasResponse {
    return {
      success: true,
      schemas: [...this.schemas],
    };
  }
}
