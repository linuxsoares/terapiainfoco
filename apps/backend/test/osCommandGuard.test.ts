import { describe, it, expect } from 'bun:test';
import { app } from '../src/index';
import {
  UserRole,
  CommandRiskSeverity,
  CommandThreatVector,
  CommandExecutionPolicyAction,
  ClinicalConverterJobType,
} from '@terapiainfoco/shared';
import { adminRequest } from './helpers/adminRequest';

describe('API Integration: OS Command Guard & Secure Sandboxed Converter Enclave (CWE-78 & OWASP ASVS V5.3)', () => {
  it('GET /api/os-command-guard/overview - deve retornar telemetria, política, incidentes e pipelines clínicos', async () => {
    const res = await adminRequest('/api/os-command-guard/overview');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.overview).toBeDefined();
    expect(data.overview.metrics.totalCommands).toBeGreaterThan(0);
    expect(data.overview.policy.enforceBinaryWhitelist).toBe(true);
    expect(data.overview.converterPipelines.length).toBe(5);
    expect(data.overview.recentIncidents.length).toBeGreaterThan(0);
  });

  it('POST /api/os-command-guard/inspect - deve inspecionar e aprovar comando legítimo com binário aprovado', async () => {
    const res = await adminRequest('/api/os-command-guard/inspect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'psi_dra_elena',
        'x-user-role': UserRole.PSICOLOGO_TITULAR,
      },
      body: JSON.stringify({
        executable: 'weasyprint',
        args: ['--optimize-size', 'none', '/var/app/laudo.html', '/var/app/laudo.pdf'],
        jobType: ClinicalConverterJobType.PDF_LAUDO_GENERATION,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.inspection.isValid).toBe(true);
    expect(data.inspection.riskSeverity).toBe(CommandRiskSeverity.SAFE_WHITELISTED);
    expect(data.inspection.action).toBe(CommandExecutionPolicyAction.ALLOWED_SANDBOXED);
    expect(data.inspection.proofSeal).toBeDefined();
  });

  it('POST /api/os-command-guard/inspect - deve detectar e bloquear injeção de metacaracteres de shell', async () => {
    const res = await adminRequest('/api/os-command-guard/inspect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'psi_probe_attacker',
        'x-user-role': UserRole.PSICOLOGO_TITULAR,
      },
      body: JSON.stringify({
        executable: 'weasyprint',
        args: ['/var/app/laudo.html', '; rm -rf /etc/shadow #', '/var/app/laudo.pdf'],
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.inspection.isValid).toBe(false);
    expect(data.inspection.threats.length).toBeGreaterThan(0);
  });

  it('POST /api/os-command-guard/inspect - deve bloquear binário não autorizado fora da allowlist', async () => {
    const res = await adminRequest('/api/os-command-guard/inspect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'psi_probe_attacker',
        'x-user-role': UserRole.PSICOLOGO_TITULAR,
      },
      body: JSON.stringify({
        executable: 'netcat',
        args: ['-lvnp', '4444'],
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.inspection.isValid).toBe(false);
    expect(data.inspection.threats.some((t: any) => t.vector === CommandThreatVector.UNAPPROVED_BINARY_EXECUTION)).toBe(true);
  });

  it('POST /api/os-command-guard/execute - deve executar comando seguro em enclave sandboxed com sucesso', async () => {
    const res = await adminRequest('/api/os-command-guard/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'psi_dra_elena',
        'x-user-role': UserRole.PSICOLOGO_TITULAR,
      },
      body: JSON.stringify({
        jobType: ClinicalConverterJobType.PDF_LAUDO_GENERATION,
        executable: 'weasyprint',
        args: ['--optimize-size', 'none', '/var/app/laudo.html', '/var/app/laudo.pdf'],
        documentId: 'doc_laudo_9921',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.result.status).toBe('SUCCESS');
    expect(data.result.exitCode).toBe(0);
    expect(data.result.sandboxEnforced).toBe(true);
    expect(data.seal).toBeDefined();
    expect(data.seal.isCompliant).toBe(true);
  });

  it('POST /api/os-command-guard/execute - deve retornar HTTP 400 e bloquear comando com flag proibida', async () => {
    const res = await adminRequest('/api/os-command-guard/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'psi_probe_attacker',
        'x-user-role': UserRole.PSICOLOGO_TITULAR,
      },
      body: JSON.stringify({
        jobType: ClinicalConverterJobType.CFP_CERTIFICATE_EXPORT,
        executable: 'soffice',
        args: ['--headless', '--eval="import os; os.system(\'reboot\')"'],
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.result.status).toBe('BLOCKED');
    expect(data.result.exitCode).toBe(126);
    expect(data.seal.isCompliant).toBe(false);
  });

  it('POST /api/os-command-guard/policy - deve atualizar política de segurança com sucesso', async () => {
    const res = await adminRequest('/api/os-command-guard/policy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'psi_admin',
        'x-user-role': UserRole.ADMIN,
      },
      body: JSON.stringify({
        policy: {
          executionTimeoutMs: 12000,
          maxTotalArguments: 28,
        },
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.policy.executionTimeoutMs).toBe(12000);
    expect(data.policy.maxTotalArguments).toBe(28);
  });

  it('POST /api/os-command-guard/simulate - deve simular ataque adversarial e registrar bloqueio', async () => {
    const res = await adminRequest('/api/os-command-guard/simulate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'psi_security_auditor',
        'x-user-role': UserRole.PSICOLOGO_TITULAR,
      },
      body: JSON.stringify({
        threatVector: CommandThreatVector.SHELL_METASYMBOL_INJECTION,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.threatBlocked).toBe(true);
    expect(data.incident).toBeDefined();
    expect(data.incident.blocked).toBe(true);
  });

  it('POST /api/os-command-guard/verify-seal - deve verificar autenticidade de selo probatório RFC 8785', async () => {
    // 1. Obter um selo via inspeção
    const inspectRes = await adminRequest('/api/os-command-guard/inspect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        executable: 'pandoc',
        args: ['-f', 'markdown', 'input.md', '-o', 'output.pdf'],
      }),
    });
    const inspectData = await inspectRes.json();
    const seal = inspectData.inspection.proofSeal;

    // 2. Verificar selo
    const verifyRes = await adminRequest('/api/os-command-guard/verify-seal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sealToken: seal,
      }),
    });

    expect(verifyRes.status).toBe(200);
    const verifyData = await verifyRes.json();
    expect(verifyData.success).toBe(true);
    expect(verifyData.isValid).toBe(true);
    expect(verifyData.seal.sealId).toBe(seal.sealId);
  });
});
