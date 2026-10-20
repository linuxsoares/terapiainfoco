import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import type {
  InspectDependenciesDTO,
  InspectDynamicImportDTO,
  UpdateDependencyPolicyDTO,
  SimulateSupplyChainAttackDTO,
  VerifySupplyChainSealDTO,
} from '@terapiainfoco/shared';
import { SupplyChainGuardService } from '../services/supplyChainGuardService';

export const supplyChainGuardRoutes = new Hono();

// Ferramenta da plataforma (painel de Segurança): exclusiva do Admin
supplyChainGuardRoutes.use('*', authMiddleware(), requireRoles([UserRole.ADMIN]));

/**
 * GET /api/supply-chain-guard/overview
 * Retorna telemetria operacional, métricas de auditoria SLSA L3, incidentes e selos de conformidade WORM
 */
supplyChainGuardRoutes.get('/overview', async (c) => {
  try {
    const service = SupplyChainGuardService.getInstance();
    const overview = service.getOverview();
    return c.json({ success: true, overview });
  } catch (err: any) {
    return c.json(
      {
        success: false,
        message: err.message || 'Erro ao carregar telemetria do Supply Chain Guard.'
      },
      500
    );
  }
});

/**
 * POST /api/supply-chain-guard/inspect
 * Inspeciona manifesto ou lista de dependências contra Dependency Confusion, Typosquatting, CWE-912 e integridade SRI
 */
supplyChainGuardRoutes.post('/inspect', async (c) => {
  try {
    const body = await c.req.json<InspectDependenciesDTO>();
    if (!body || (!body.manifestContent && !body.dependencies && !body.lockfileContent)) {
      return c.json(
        {
          success: false,
          message: 'Manifesto, lockfile ou lista de dependências é obrigatória para inspeção.'
        },
        400
      );
    }

    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'SupplyChainAuditor/1.0';

    const service = SupplyChainGuardService.getInstance();
    const result = service.inspectDependencies(body, {
      ip: clientIp,
      userAgent
    });

    return c.json(result);
  } catch (err: any) {
    return c.json(
      {
        success: false,
        message: err.message || 'Falha ao inspecionar dependências de software.'
      },
      500
    );
  }
});

/**
 * POST /api/supply-chain-guard/inspect-import
 * Valida especificador de import dinâmico em tempo de execução contra injeção e reflexão insegura (CWE-470)
 */
supplyChainGuardRoutes.post('/inspect-import', async (c) => {
  try {
    const body = await c.req.json<InspectDynamicImportDTO>();
    if (!body || !body.specifier) {
      return c.json(
        {
          success: false,
          message: 'O especificador de import dinâmico é obrigatório.'
        },
        400
      );
    }

    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'RuntimeImportGuard/1.0';

    const service = SupplyChainGuardService.getInstance();
    const result = service.inspectDynamicImport(body, {
      ip: clientIp,
      userAgent
    });

    return c.json(result);
  } catch (err: any) {
    return c.json(
      {
        success: false,
        message: err.message || 'Falha ao validar import dinâmico.'
      },
      500
    );
  }
});

/**
 * POST /api/supply-chain-guard/policy
 * Atualiza diretrizes de governança SLSA L3 e quarentena de pacotes
 */
supplyChainGuardRoutes.post('/policy', async (c) => {
  try {
    const body = await c.req.json<UpdateDependencyPolicyDTO>();
    if (!body) {
      return c.json(
        {
          success: false,
          message: 'Configurações de política são obrigatórias.'
        },
        400
      );
    }

    const service = SupplyChainGuardService.getInstance();
    const result = service.updatePolicy(body);

    return c.json(result);
  } catch (err: any) {
    return c.json(
      {
        success: false,
        message: err.message || 'Falha ao atualizar diretrizes de governança de dependências.'
      },
      500
    );
  }
});

/**
 * POST /api/supply-chain-guard/simulate
 * Simula vetores de ataque adversariais (Dependency Confusion, Backdoors CWE-912, Typosquatting, Injeção Dinâmica)
 */
supplyChainGuardRoutes.post('/simulate', async (c) => {
  try {
    const body = await c.req.json<SimulateSupplyChainAttackDTO>();
    if (!body || !body.attackCategory) {
      return c.json(
        {
          success: false,
          message: 'A categoria do ataque para simulação é obrigatória.'
        },
        400
      );
    }

    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'SupplyChainSimulator/1.0';

    const service = SupplyChainGuardService.getInstance();
    const result = service.simulateAttack(body, {
      ip: clientIp,
      userAgent
    });

    return c.json(result);
  } catch (err: any) {
    return c.json(
      {
        success: false,
        message: err.message || 'Falha ao simular ataque adversarial de supply chain.'
      },
      500
    );
  }
});

/**
 * POST /api/supply-chain-guard/verify-seal
 * Valida a autenticidade criptográfica de um selo notarial WORM RFC 8785 (JCS)
 */
supplyChainGuardRoutes.post('/verify-seal', async (c) => {
  try {
    const body = await c.req.json<VerifySupplyChainSealDTO>();
    if (!body || !body.sealToken) {
      return c.json(
        {
          success: false,
          message: 'O token do selo é obrigatório para validação notarial.'
        },
        400
      );
    }

    const service = SupplyChainGuardService.getInstance();
    const result = service.verifySeal(body);

    return c.json(result);
  } catch (err: any) {
    return c.json(
      {
        success: false,
        message: err.message || 'Falha ao verificar selo notarial de supply chain.'
      },
      500
    );
  }
});

/**
 * GET /api/supply-chain-guard/homologated
 * Retorna lista de dependências homologadas e aprovadas para o monorepo
 */
supplyChainGuardRoutes.get('/homologated', async (c) => {
  try {
    const service = SupplyChainGuardService.getInstance();
    const packages = service.getHomologatedPackages();
    return c.json({ success: true, packages });
  } catch (err: any) {
    return c.json(
      {
        success: false,
        message: err.message || 'Falha ao listar pacotes homologados.'
      },
      500
    );
  }
});
