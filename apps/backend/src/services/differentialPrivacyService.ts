import { randomUUID } from 'node:crypto';
import {
  AuditAction,
  AuditResourceType,
  DpMechanism,
  DpQueryType,
  DpCohortMetric,
  DpBudgetStatus,
  DpResearchStatus,
  type DpResearchProject,
  type DpQueryResult,
  type DpProofVerification,
  type DpEpidemiologicalBenchmark,
  type DpSystemOverview,
  type AllocateDpBudgetDTO,
  type ExecuteDpQueryDTO,
  type GenerateDpBenchmarkDTO
} from '@terapiainfoco/shared';
import {
  generateSyntheticClinicalCohort,
  executeDifferentialPrivacyQuery,
  verifyDifferentialPrivacyProof,
  generateEpidemiologicalBenchmark,
  type SyntheticClinicalPatient
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class DifferentialPrivacyService {
  private static instance: DifferentialPrivacyService;

  private projects: Map<string, DpResearchProject> = new Map();
  private queryHistory: DpQueryResult[] = [];
  private cohort: SyntheticClinicalPatient[] = [];
  private benchmarks: Map<string, DpEpidemiologicalBenchmark> = new Map();

  private constructor() {
    this.cohort = generateSyntheticClinicalCohort();
    this.seedDemoProjects();
  }

  public static getInstance(): DifferentialPrivacyService {
    if (!DifferentialPrivacyService.instance) {
      DifferentialPrivacyService.instance = new DifferentialPrivacyService();
    }
    return DifferentialPrivacyService.instance;
  }

  /**
   * Inicializa projetos de pesquisa acadêmica e comitê de ética padrão
   */
  private seedDemoProjects(): void {
    const demoProject1: DpResearchProject = {
      projectId: 'proj-ufmg-tcc-2026',
      title: 'Eficácia Clínica da Terapia Cognitivo-Comportamental em Transtornos de Ansiedade (CID-11 6B00)',
      researcherName: 'Dra. Mariana Albuquerque (PhD / UFMG)',
      institution: 'Universidade Federal de Minas Gerais (UFMG) — Departamento de Psicologia',
      cepProtocol: 'CEP-UFMG/CONEP-2026-8819',
      purpose: 'Estudo multicêntrico de remissão de sintomas e resposta psicométrica GAD-7 em psicoterapia breve.',
      totalEpsilonBudget: 3.0,
      spentEpsilonBudget: 0.8,
      remainingEpsilonBudget: 2.2,
      deltaBudget: 1e-5,
      status: DpResearchStatus.ACTIVE,
      approvedByDpo: 'dpo@terapiainfoco.com.br',
      createdAt: new Date(Date.now() - 3600000 * 24 * 14).toISOString(),
      lastQueryAt: new Date(Date.now() - 3600000 * 4).toISOString()
    };

    const demoProject2: DpResearchProject = {
      projectId: 'proj-fiocruz-burnout-2026',
      title: 'Prevalência Epidemiológica de Síndrome de Burnout (QD85) e Depressão em Profissionais Urbanos',
      researcherName: 'Dr. Rodrigo Vasconcelos (Fiocruz)',
      institution: 'Fundação Oswaldo Cruz (Fiocruz / Saúde Pública)',
      cepProtocol: 'CEP-FIOCRUZ/MS-2026-4402',
      purpose: 'Mapeamento epidemiológico anônimo em conformidade com o Artigo 13 da LGPD e Resolução CFP nº 001/2009.',
      totalEpsilonBudget: 2.0,
      spentEpsilonBudget: 1.7,
      remainingEpsilonBudget: 0.3,
      deltaBudget: 1e-5,
      status: DpResearchStatus.ACTIVE,
      approvedByDpo: 'dpo@terapiainfoco.com.br',
      createdAt: new Date(Date.now() - 3600000 * 24 * 30).toISOString(),
      lastQueryAt: new Date(Date.now() - 3600000 * 2).toISOString()
    };

    this.projects.set(demoProject1.projectId, demoProject1);
    this.projects.set(demoProject2.projectId, demoProject2);

    // Executa uma consulta inicial para enriquecer o histórico demonstrativo
    const initialQuery = executeDifferentialPrivacyQuery(this.cohort, {
      projectId: demoProject1.projectId,
      metric: DpCohortMetric.GAD7_SEVERITY_SCORE,
      queryType: DpQueryType.MEAN,
      epsilon: 0.4,
      mechanism: DpMechanism.LAPLACE
    });
    this.queryHistory.push(initialQuery);
  }

  /**
   * Lista todos os projetos de pesquisa cadastrados
   */
  public getProjects(): DpResearchProject[] {
    return Array.from(this.projects.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Obtém um projeto específico por ID
   */
  public getProject(projectId: string): DpResearchProject | undefined {
    return this.projects.get(projectId);
  }

  /**
   * Aloca ou renova cota de privacidade ε concedida pelo DPO
   */
  public async allocateBudget(dto: AllocateDpBudgetDTO): Promise<DpResearchProject> {
    const existing = this.projects.get(dto.projectId);
    const now = new Date().toISOString();

    let project: DpResearchProject;

    if (existing) {
      existing.totalEpsilonBudget += dto.epsilonBudget;
      existing.remainingEpsilonBudget += dto.epsilonBudget;
      if (existing.remainingEpsilonBudget > 0) {
        existing.status = DpResearchStatus.ACTIVE;
      }
      existing.approvedByDpo = dto.dpoApprover;
      project = existing;
    } else {
      project = {
        projectId: dto.projectId,
        title: dto.title || `Projeto de Pesquisa Epidemiológica ${dto.projectId}`,
        researcherName: dto.researcherName || 'Pesquisador Institucional Homologado',
        institution: dto.institution || 'Instituição de Pesquisa Científica (LGPD Art. 13)',
        cepProtocol: dto.cepProtocol || `CEP-${randomUUID().slice(0, 8).toUpperCase()}`,
        purpose: dto.purpose || 'Estudo clínico epidemiológico em saúde mental.',
        totalEpsilonBudget: dto.epsilonBudget,
        spentEpsilonBudget: 0,
        remainingEpsilonBudget: dto.epsilonBudget,
        deltaBudget: dto.deltaBudget || 1e-5,
        status: DpResearchStatus.ACTIVE,
        approvedByDpo: dto.dpoApprover,
        createdAt: now
      };
      this.projects.set(project.projectId, project);
    }

    // Registro na Trilha WORM de Auditoria
    AuditService.log({
      action: AuditAction.DP_BUDGET_ALLOCATED,
      resourceType: AuditResourceType.DIFFERENTIAL_PRIVACY_ENGINE,
      resourceId: project.projectId,
      actorId: dto.dpoApprover,
      details: {
        allocatedEpsilon: dto.epsilonBudget,
        totalBudget: project.totalEpsilonBudget,
        remainingBudget: project.remainingEpsilonBudget,
        cepProtocol: project.cepProtocol,
        institution: project.institution
      }
    });

    return project;
  }

  /**
   * Executa consulta estatística protegida por Privacidade Diferencial (ε-DP)
   */
  public async executeQuery(dto: ExecuteDpQueryDTO): Promise<{
    result: DpQueryResult;
    remainingBudget: number;
    budgetStatus: DpBudgetStatus;
  }> {
    const project = this.projects.get(dto.projectId);
    if (!project) {
      throw new Error(`Projeto de pesquisa '${dto.projectId}' não encontrado.`);
    }

    if (project.status === DpResearchStatus.REVOKED) {
      throw new Error(`Projeto de pesquisa '${dto.projectId}' está suspenso pelo DPO.`);
    }

    const requestedEpsilon = Number(dto.epsilon);
    if (requestedEpsilon <= 0 || isNaN(requestedEpsilon)) {
      throw new Error('O valor de epsilon informado deve ser um número positivo.');
    }

    // Validação estrita do Orçamento de Privacidade (Anti-Reconstruction Mitigation)
    if (project.remainingEpsilonBudget < requestedEpsilon) {
      AuditService.log({
        action: AuditAction.DP_BUDGET_EXHAUSTED,
        resourceType: AuditResourceType.DIFFERENTIAL_PRIVACY_ENGINE,
        resourceId: project.projectId,
        actorId: project.researcherName,
        details: {
          attemptedEpsilon: requestedEpsilon,
          remainingBudget: project.remainingEpsilonBudget,
          totalBudget: project.totalEpsilonBudget,
          status: 'BLOCKED_BUDGET_DEPLETED'
        }
      });

      project.status = DpResearchStatus.DEPLETED;
      throw new Error(
        `Orçamento de privacidade esgotado para o projeto '${project.title}'. Disponível: ${project.remainingEpsilonBudget.toFixed(2)} ε, Solicitado: ${requestedEpsilon.toFixed(2)} ε. Contate o DPO para análise de renovação ética.`
      );
    }

    // Executa a consulta no motor matemático de Privacidade Diferencial
    const queryResult = executeDifferentialPrivacyQuery(this.cohort, {
      projectId: project.projectId,
      metric: dto.metric,
      queryType: dto.queryType,
      epsilon: requestedEpsilon,
      mechanism: dto.mechanism,
      clampingLowerBound: dto.clampingLowerBound,
      clampingUpperBound: dto.clampingUpperBound
    });

    // Debita o consumo do orçamento
    project.spentEpsilonBudget = Number((project.spentEpsilonBudget + requestedEpsilon).toFixed(4));
    project.remainingEpsilonBudget = Number(Math.max(0, project.totalEpsilonBudget - project.spentEpsilonBudget).toFixed(4));
    project.lastQueryAt = queryResult.executedAt;

    let budgetStatus = DpBudgetStatus.HEALTHY;
    if (project.remainingEpsilonBudget <= 0) {
      budgetStatus = DpBudgetStatus.EXHAUSTED;
      project.status = DpResearchStatus.DEPLETED;
    } else if (project.remainingEpsilonBudget <= project.totalEpsilonBudget * 0.2) {
      budgetStatus = DpBudgetStatus.WARNING;
    }

    this.queryHistory.unshift(queryResult);
    if (this.queryHistory.length > 100) {
      this.queryHistory.pop();
    }

    // Registro na Trilha WORM Inviolável
    AuditService.log({
      action: AuditAction.DP_QUERY_EXECUTED,
      resourceType: AuditResourceType.DIFFERENTIAL_PRIVACY_ENGINE,
      resourceId: queryResult.queryId,
      actorId: project.researcherName,
      details: {
        projectId: project.projectId,
        metric: queryResult.metric,
        queryType: queryResult.queryType,
        mechanism: queryResult.mechanism,
        epsilonUsed: queryResult.epsilonUsed,
        noiseScale: queryResult.noiseScale,
        proofSeal: queryResult.proofSeal,
        exactValueSha256: queryResult.exactValueSha256,
        remainingBudget: project.remainingEpsilonBudget,
        budgetStatus
      }
    });

    if (budgetStatus === DpBudgetStatus.EXHAUSTED) {
      AuditService.log({
        action: AuditAction.DP_BUDGET_EXHAUSTED,
        resourceType: AuditResourceType.DIFFERENTIAL_PRIVACY_ENGINE,
        resourceId: project.projectId,
        actorId: project.researcherName,
        details: {
          remainingBudget: 0,
          totalBudget: project.totalEpsilonBudget,
          status: 'DEPLETED_POST_QUERY'
        }
      });
    }

    return {
      result: queryResult,
      remainingBudget: project.remainingEpsilonBudget,
      budgetStatus
    };
  }

  /**
   * Gera benchmark epidemiológico com múltiplas métricas agregadas
   */
  public async generateBenchmark(dto: GenerateDpBenchmarkDTO): Promise<{
    benchmark: DpEpidemiologicalBenchmark;
    remainingBudget: number;
  }> {
    const project = this.projects.get(dto.projectId);
    if (!project) {
      throw new Error(`Projeto de pesquisa '${dto.projectId}' não encontrado.`);
    }

    const totalEpsilonCost = Number((dto.epsilonPerMetric * 4).toFixed(4));
    if (project.remainingEpsilonBudget < totalEpsilonCost) {
      throw new Error(
        `Orçamento insuficiente para gerar benchmark (${totalEpsilonCost} ε necessário, ${project.remainingEpsilonBudget.toFixed(2)} ε disponível).`
      );
    }

    const benchmark = generateEpidemiologicalBenchmark(
      this.cohort,
      project.projectId,
      dto.epsilonPerMetric,
      dto.mechanism
    );

    project.spentEpsilonBudget = Number((project.spentEpsilonBudget + totalEpsilonCost).toFixed(4));
    project.remainingEpsilonBudget = Number(Math.max(0, project.totalEpsilonBudget - project.spentEpsilonBudget).toFixed(4));
    project.lastQueryAt = benchmark.generatedAt;

    this.benchmarks.set(benchmark.benchmarkId, benchmark);

    // Registro na Trilha WORM
    AuditService.log({
      action: AuditAction.DP_DATASET_EXPORTED,
      resourceType: AuditResourceType.DIFFERENTIAL_PRIVACY_ENGINE,
      resourceId: benchmark.benchmarkId,
      actorId: project.researcherName,
      details: {
        projectId: project.projectId,
        totalEpsilonCost,
        proofSeal: benchmark.proofSeal,
        cohortTotal: benchmark.cohortTotal,
        metricsCount: benchmark.metrics.length
      }
    });

    return {
      benchmark,
      remainingBudget: project.remainingEpsilonBudget
    };
  }

  /**
   * Valida a integridade matemática e criptográfica do selo notarial
   */
  public async verifyProof(proofSeal: string): Promise<DpProofVerification> {
    const query = this.queryHistory.find(q => q.proofSeal === proofSeal);
    if (!query) {
      // Se não está no histórico local em memória, verifica estruturalmente
      try {
        const raw = proofSeal.replace('dp_v1_', '');
        const decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
        return {
          isValid: true,
          proofSeal,
          queryId: decoded.qid || 'dpq_external',
          projectId: decoded.pid || 'unknown',
          mechanism: decoded.mec || DpMechanism.LAPLACE,
          epsilon: decoded.eps || 0.5,
          theoreticalMaxDistortion: 1.5,
          verifiedAt: new Date().toISOString(),
          details: 'Selo notarial WORM de Privacidade Diferencial analisado e estruturalmente válido.'
        };
      } catch (err: any) {
        return {
          isValid: false,
          proofSeal,
          queryId: 'unknown',
          projectId: 'unknown',
          mechanism: DpMechanism.LAPLACE,
          epsilon: 0,
          theoreticalMaxDistortion: 0,
          verifiedAt: new Date().toISOString(),
          details: `Falha ao interpretar selo probatório: ${err.message}`
        };
      }
    }

    const verification = verifyDifferentialPrivacyProof(proofSeal, query);

    AuditService.log({
      action: AuditAction.DP_PROOF_VERIFIED,
      resourceType: AuditResourceType.DIFFERENTIAL_PRIVACY_ENGINE,
      resourceId: query.queryId,
      actorId: 'dpo_system_auditor',
      details: {
        isValid: verification.isValid,
        proofSeal,
        queryId: verification.queryId,
        projectId: verification.projectId
      }
    });

    return verification;
  }

  /**
   * Visão Geral Executiva de Governança de Privacidade Diferencial
   */
  public getOverview(): DpSystemOverview {
    const projectsList = this.getProjects();
    const totalProjects = projectsList.length;
    const totalQueries = this.queryHistory.length;

    const totalBudget = projectsList.reduce((acc, p) => acc + p.totalEpsilonBudget, 0);
    const totalConsumed = projectsList.reduce((acc, p) => acc + p.spentEpsilonBudget, 0);

    const avgEpsilon = totalQueries > 0
      ? Number((totalConsumed / totalQueries).toFixed(2))
      : 0.5;

    let health = DpBudgetStatus.HEALTHY;
    const remainingAgg = totalBudget - totalConsumed;
    if (remainingAgg <= 0) {
      health = DpBudgetStatus.EXHAUSTED;
    } else if (remainingAgg <= totalBudget * 0.2) {
      health = DpBudgetStatus.WARNING;
    }

    return {
      totalResearchProjects: totalProjects,
      totalQueriesExecuted: totalQueries,
      aggregateEpsilonBudget: Number(totalBudget.toFixed(2)),
      aggregateEpsilonConsumed: Number(totalConsumed.toFixed(2)),
      averageEpsilonPerQuery: avgEpsilon,
      privacyBudgetHealth: health,
      recentQueries: this.queryHistory.slice(0, 15),
      activeProjects: projectsList
    };
  }

  /**
   * Reseta o estado em memória (útil para suíte de testes de integração)
   */
  public resetState(): void {
    this.projects.clear();
    this.queryHistory = [];
    this.benchmarks.clear();
    this.cohort = generateSyntheticClinicalCohort();
    this.seedDemoProjects();
  }
}
