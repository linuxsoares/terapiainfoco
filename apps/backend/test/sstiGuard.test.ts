import { describe, it, expect } from 'bun:test';
import { app } from '../src/index';
import {
  UserRole,
  TemplateRiskSeverity,
  SstiThreatVector,
  SstiSanitizationAction,
  ClinicalDocumentTemplateType
} from '@terapiainfoco/shared';
import { adminRequest } from './helpers/adminRequest';

describe('API Integration: SSTI Guard & Sandboxed Template Engine (CWE-1336 & OWASP ASVS V5.2)', () => {
  it('GET /api/ssti-guard/overview - deve retornar telemetria, política, incidentes e presets clínicos CFP', async () => {
    const res = await adminRequest('/api/ssti-guard/overview');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.overview).toBeDefined();
    expect(data.overview.metrics.totalTemplatesEvaluated).toBeGreaterThan(0);
    expect(data.overview.policy.strictSandboxing).toBe(true);
    expect(data.overview.presets.length).toBeGreaterThanOrEqual(4);
    expect(data.overview.recentSealsSample.length).toBeGreaterThan(0);
  });

  it('POST /api/ssti-guard/inspect - deve inspecionar e aprovar template clínico legítimo', async () => {
    const res = await adminRequest('/api/ssti-guard/inspect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'psi_dra_elena',
        'x-user-role': UserRole.PSICOLOGO_TITULAR
      },
      body: JSON.stringify({
        templateContent: 'Declaração para {{pacienteNome}} em {{dataSessao}}'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.inspection.isValid).toBe(true);
    expect(data.inspection.riskSeverity).toBe(TemplateRiskSeverity.SAFE_INTERPOLATED);
    expect(data.inspection.allowedVariablesUsed).toContain('pacienteNome');
  });

  it('POST /api/ssti-guard/inspect - deve detectar e sinalizar tentativa crítica de SSTI (__proto__)', async () => {
    const res = await adminRequest('/api/ssti-guard/inspect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'psi_probe_attacker',
        'x-user-role': UserRole.PSICOLOGO_TITULAR
      },
      body: JSON.stringify({
        templateContent: 'Laudo: {{__proto__.admin = true}}'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.inspection.isValid).toBe(false);
    expect(data.inspection.riskSeverity).toBe(TemplateRiskSeverity.CRITICAL_SSTI_ATTEMPT);
    expect(data.inspection.threatVector).toBe(SstiThreatVector.PROTOTYPE_ACCESS);
  });

  it('POST /api/ssti-guard/render - deve renderizar em sandbox hermético e emitir selo probatório WORM', async () => {
    const res = await adminRequest('/api/ssti-guard/render', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'psi_dr_marcos',
        'x-user-role': UserRole.PSICOLOGO_TITULAR
      },
      body: JSON.stringify({
        templateContent: 'Atestado emitido para {{pacienteNome}} pelo terapeuta {{terapeutaNome}}.',
        contextVariables: {
          pacienteNome: 'Beatriz Almeida',
          terapeutaNome: 'Dr. Marcos Sampaio'
        }
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.result.renderedOutput).toBe('Atestado emitido para Beatriz Almeida pelo terapeuta Dr. Marcos Sampaio.');
    expect(data.result.actionTaken).toBe(SstiSanitizationAction.ALLOWED_SANDBOXED);
    expect(data.seal).toBeDefined();
    expect(data.seal.sealId).toStartWith('ssti_seal_');
    expect(data.seal.hmacSignature.length).toBe(64);
  });

  it('POST /api/ssti-guard/render - deve bloquear tentativa maliciosa e retornar HTTP 400 com selo de contenção', async () => {
    const res = await adminRequest('/api/ssti-guard/render', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'attacker_user',
        'x-user-role': UserRole.PSICOLOGO_TITULAR
      },
      body: JSON.stringify({
        templateContent: '{{process.mainModule.require("child_process").execSync("cat /etc/passwd")}}',
        contextVariables: {}
      })
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.result.actionTaken).toBe(SstiSanitizationAction.BLOCKED_VULNERABLE);
    expect(data.seal).toBeDefined();
    expect(data.seal.riskSeverity).toBe(TemplateRiskSeverity.CRITICAL_SSTI_ATTEMPT);
  });

  it('PUT /api/ssti-guard/policy - deve atualizar política sob credenciais administrativas e vetar não-autorizados', async () => {
    // 1. Tenta como PACIENTE (deve receber 403)
    const forbiddenRes = await adminRequest('/api/ssti-guard/policy', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'paciente_sem_permissao',
        'x-user-role': UserRole.PACIENTE
      },
      body: JSON.stringify({
        policy: { escapeHtmlOutput: false }
      })
    });
    expect(forbiddenRes.status).toBe(403);

    // 2. Executa como ADMIN (deve receber 200)
    const adminRes = await adminRequest('/api/ssti-guard/policy', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'admin_master',
        'x-user-role': UserRole.ADMIN
      },
      body: JSON.stringify({
        policy: {
          strictSandboxing: true,
          escapeHtmlOutput: true,
          maxTemplateLength: 45000
        }
      })
    });
    expect(adminRes.status).toBe(200);
    const data = await adminRes.json();
    expect(data.success).toBe(true);
    expect(data.policy.maxTemplateLength).toBe(45000);
  });

  it('POST /api/ssti-guard/simulate - deve executar simulação adversarial de ataque SSTI', async () => {
    const res = await adminRequest('/api/ssti-guard/simulate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'sec_officer',
        'x-user-role': UserRole.ADMIN
      },
      body: JSON.stringify({
        threatVector: SstiThreatVector.RUNTIME_GLOBALS_ACCESS,
        documentType: ClinicalDocumentTemplateType.DECLARACAO_PSICOLOGICA
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.threatBlocked).toBe(true);
    expect(data.incident).toBeDefined();
    expect(data.incident.seal).toBeDefined();
  });

  it('POST /api/ssti-guard/verify-seal - deve verificar a fé pública do selo criptográfico WORM', async () => {
    // 1. Renderiza template válido para obter selo autêntico
    const renderRes = await adminRequest('/api/ssti-guard/render', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'psi_notary',
        'x-user-role': UserRole.PSICOLOGO_TITULAR
      },
      body: JSON.stringify({
        templateContent: 'Laudo pericial com hash verificado para {{pacienteNome}}.',
        contextVariables: { pacienteNome: 'Joana Prado' }
      })
    });

    const renderData = await renderRes.json();
    const genuineSeal = renderData.seal;
    expect(genuineSeal).toBeDefined();

    // 2. Valida selo genuíno
    const verifyRes = await adminRequest('/api/ssti-guard/verify-seal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'psi_auditor',
        'x-user-role': UserRole.ADMIN
      },
      body: JSON.stringify({
        sealToken: genuineSeal
      })
    });

    expect(verifyRes.status).toBe(200);
    const verifyData = await verifyRes.json();
    expect(verifyData.success).toBe(true);
    expect(verifyData.isValid).toBe(true);

    // 3. Valida selo adulterado (digest adulterado)
    const tamperedSeal = {
      ...genuineSeal,
      templateHash: '0000000000000000000000000000000000000000000000000000000000000000'
    };

    const tamperRes = await adminRequest('/api/ssti-guard/verify-seal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'psi_auditor',
        'x-user-role': UserRole.ADMIN
      },
      body: JSON.stringify({
        sealToken: tamperedSeal
      })
    });

    const tamperData = await tamperRes.json();
    expect(tamperData.isValid).toBe(false);
  });
});
