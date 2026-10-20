import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import { DifferentialPrivacyService } from '../services/differentialPrivacyService';
import type {
  ExecuteDpQueryDTO,
  AllocateDpBudgetDTO,
  GenerateDpBenchmarkDTO,
  VerifyDpProofDTO
} from '@terapiainfoco/shared';

const dpRouter = new Hono();

// Ferramenta da plataforma (painel de Segurança): exclusiva do Admin
dpRouter.use('*', authMiddleware(), requireRoles([UserRole.ADMIN]));
const dpService = DifferentialPrivacyService.getInstance();

/**
 * GET /api/differential-privacy/overview
 * Visão Geral Executiva de Governança de Privacidade Diferencial e Cotas de Pesquisa
 */
dpRouter.get('/overview', (c) => {
  try {
    const overview = dpService.getOverview();
    return c.json({ success: true, overview }, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Erro ao carregar visão geral de DP.' }, 500);
  }
});

/**
 * GET /api/differential-privacy/projects
 * Lista de projetos de pesquisa homologados pelo CEP e DPO com cotas vigentes
 */
dpRouter.get('/projects', (c) => {
  try {
    const projects = dpService.getProjects();
    return c.json({ success: true, projects, total: projects.length }, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Erro ao listar projetos de pesquisa.' }, 500);
  }
});

/**
 * POST /api/differential-privacy/query
 * Executa agregação estatística clínica com adição de ruído criptográfico (ε-DP)
 */
dpRouter.post('/query', async (c) => {
  try {
    const body = await c.req.json<ExecuteDpQueryDTO>();

    if (!body.projectId || !body.metric || !body.queryType || body.epsilon === undefined) {
      return c.json({
        success: false,
        message: 'Campos obrigatórios ausentes: projectId, metric, queryType, epsilon.'
      }, 400);
    }

    const { result, remainingBudget, budgetStatus } = await dpService.executeQuery(body);

    return c.json({
      success: true,
      result,
      remainingBudget,
      budgetStatus,
      message: 'Consulta epidemiológica anonimizada com sucesso via Privacidade Diferencial.'
    }, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Erro ao executar consulta DP.' }, 400);
  }
});

/**
 * POST /api/differential-privacy/benchmark
 * Gera benchmark comparativo de saúde mental com múltiplas dimensões e selo probatório
 */
dpRouter.post('/benchmark', async (c) => {
  try {
    const body = await c.req.json<GenerateDpBenchmarkDTO>();

    if (!body.projectId || !body.epsilonPerMetric) {
      return c.json({
        success: false,
        message: 'Campos obrigatórios ausentes: projectId, epsilonPerMetric.'
      }, 400);
    }

    const { benchmark, remainingBudget } = await dpService.generateBenchmark(body);

    return c.json({
      success: true,
      benchmark,
      remainingBudget,
      message: 'Benchmark epidemiológico consolidado com sucesso com garantia ε-DP.'
    }, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Erro ao gerar benchmark.' }, 400);
  }
});

/**
 * POST /api/differential-privacy/verify-proof
 * Validação pericial matemática do selo notarial WORM de Privacidade Diferencial
 */
dpRouter.post('/verify-proof', async (c) => {
  try {
    const body = await c.req.json<VerifyDpProofDTO>();

    if (!body.proofSeal) {
      return c.json({
        success: false,
        message: 'Selo probatório (proofSeal) é obrigatório.'
      }, 400);
    }

    const verification = await dpService.verifyProof(body.proofSeal);

    return c.json({
      success: true,
      verification,
      message: verification.isValid ? 'Selo de Privacidade Diferencial válido e autêntico.' : 'Violação ou adulteração de selo detectada.'
    }, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Erro ao verificar selo probatório.' }, 500);
  }
});

/**
 * POST /api/differential-privacy/allocate-budget
 * Concessão ou renovação de cota de privacidade ε pelo DPO
 */
dpRouter.post('/allocate-budget', async (c) => {
  try {
    const body = await c.req.json<AllocateDpBudgetDTO>();

    if (!body.projectId || body.epsilonBudget === undefined || !body.dpoApprover) {
      return c.json({
        success: false,
        message: 'Campos obrigatórios ausentes: projectId, epsilonBudget, dpoApprover.'
      }, 400);
    }

    const project = await dpService.allocateBudget(body);

    return c.json({
      success: true,
      project,
      message: `Cota de ${body.epsilonBudget} ε alocada com sucesso para o projeto '${project.title}'.`
    }, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Erro ao alocar orçamento de privacidade.' }, 500);
  }
});

export { dpRouter };
