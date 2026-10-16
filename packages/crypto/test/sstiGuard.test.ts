import { describe, it, expect } from 'bun:test';
import {
  inspectTemplate,
  renderSandboxedTemplate,
  createSstiProofSeal,
  verifySstiProofSeal,
  CLINICAL_TEMPLATE_PRESETS,
  FORBIDDEN_SSTI_PATTERNS
} from '../src/sstiGuard';
import {
  TemplateRiskSeverity,
  SstiThreatVector,
  SstiSanitizationAction,
  ClinicalDocumentTemplateType
} from '@terapiainfoco/shared';

describe('SSTI Guard & Sandboxed Template Engine (CWE-1336 & OWASP ASVS V5.2)', () => {
  describe('Inspeção Estática Léxica de Templates', () => {
    it('deve aprovar templates clínicos legítimos com severidade SAFE_INTERPOLATED', () => {
      const template = 'Declaro para os devidos fins que o(a) paciente {{pacienteNome}} esteve presente em consulta psicológica no dia {{dataSessao}}.';
      const inspection = inspectTemplate(template);

      expect(inspection.riskSeverity).toBe(TemplateRiskSeverity.SAFE_INTERPOLATED);
      expect(inspection.threatVector).toBe(SstiThreatVector.NONE);
      expect(inspection.isValid).toBe(true);
      expect(inspection.allowedVariablesUsed).toContain('pacienteNome');
      expect(inspection.allowedVariablesUsed).toContain('dataSessao');
      expect(inspection.detectedThreats.length).toBe(0);
    });

    it('deve aprovar templates estáticos sem variáveis com SAFE_STATIC', () => {
      const template = 'Texto estático sem substituições dinâmicas.';
      const inspection = inspectTemplate(template);

      expect(inspection.riskSeverity).toBe(TemplateRiskSeverity.SAFE_STATIC);
      expect(inspection.threatVector).toBe(SstiThreatVector.NONE);
      expect(inspection.isValid).toBe(true);
    });

    it('deve detectar e bloquear tentativa de Prototype Pollution (__proto__)', () => {
      const evilTemplate = 'Relatório Psicológico: {{__proto__.polluted = "malicious"}}';
      const inspection = inspectTemplate(evilTemplate);

      expect(inspection.riskSeverity).toBe(TemplateRiskSeverity.CRITICAL_SSTI_ATTEMPT);
      expect(inspection.threatVector).toBe(SstiThreatVector.PROTOTYPE_ACCESS);
      expect(inspection.isValid).toBe(false);
      expect(inspection.detectedThreats.some(t => t.includes('__proto__'))).toBe(true);
    });

    it('deve detectar e bloquear Constructor Chaining / Injeção de Código', () => {
      const evilTemplate = 'Atestado: {{constructor.constructor("return process.env")()}}';
      const inspection = inspectTemplate(evilTemplate);

      expect(inspection.riskSeverity).toBe(TemplateRiskSeverity.CRITICAL_SSTI_ATTEMPT);
      expect(inspection.threatVector).toBe(SstiThreatVector.PROTOTYPE_ACCESS);
      expect(inspection.isValid).toBe(false);
      expect(inspection.detectedThreats.some(t => t.includes('constructor'))).toBe(true);
    });

    it('deve detectar e bloquear tentativas de acessar objetos globais de sistema (process / child_process)', () => {
      const evilTemplate = 'Laudo: {{process.mainModule.require("child_process").execSync("id")}}';
      const inspection = inspectTemplate(evilTemplate);

      expect(inspection.riskSeverity).toBe(TemplateRiskSeverity.CRITICAL_SSTI_ATTEMPT);
      expect(inspection.threatVector).toBe(SstiThreatVector.RUNTIME_GLOBALS_ACCESS);
      expect(inspection.isValid).toBe(false);
      expect(inspection.detectedThreats.some(t => t.includes('process'))).toBe(true);
    });

    it('deve detectar e bloquear Dynamic Require e Eval', () => {
      const evilTemplate = '{{require("fs").readFileSync("/etc/passwd")}}';
      const inspection = inspectTemplate(evilTemplate);

      expect(inspection.riskSeverity).toBe(TemplateRiskSeverity.CRITICAL_SSTI_ATTEMPT);
      expect(inspection.threatVector).toBe(SstiThreatVector.RUNTIME_GLOBALS_ACCESS);
      expect(inspection.isValid).toBe(false);
      expect(inspection.detectedThreats.some(t => t.includes('require'))).toBe(true);
    });

    it('deve sanitizar tags maliciosas quando presentes no template', () => {
      const mixedTemplate = 'Consulta com {{pacienteNome}}. {{constructor.toString()}}';
      const inspection = inspectTemplate(mixedTemplate);

      expect(inspection.sanitizedTemplate).not.toContain('constructor');
      expect(inspection.sanitizedTemplate).toContain('{{pacienteNome}}');
      expect(inspection.sanitizedTemplate).toContain('[SSTI_PROTECTED_BLOCK]');
    });
  });

  describe('Renderização em Sandbox Hermético Isolado', () => {
    it('deve interpolar dados clínicos com sucesso sem prototype leak', () => {
      const template = 'Paciente: {{pacienteNome}}, CRP: {{terapeutaCrp}}, Data: {{dataSessao}}';
      const context = {
        pacienteNome: 'Maria Silva Oliveira',
        terapeutaCrp: '06/123456',
        dataSessao: '16/10/2026'
      };

      const result = renderSandboxedTemplate({
        templateContent: template,
        contextVariables: context
      });

      expect(result.renderedOutput).toBe('Paciente: Maria Silva Oliveira, CRP: 06/123456, Data: 16/10/2026');
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.variablesInterpolated).toBe(3);
      expect(result.wasSanitized).toBe(false);
      expect(result.actionTaken).toBe(SstiSanitizationAction.ALLOWED_SANDBOXED);
    });

    it('deve escapar caracteres HTML e prevenir injeção XSS downstream no documento', () => {
      const template = 'Laudo do Paciente {{pacienteNome}}: {{observacoes}}';
      const context = {
        pacienteNome: '<script>alert("xss")</script>',
        observacoes: 'Paciente relata melhora & bem-estar com "meditação".'
      };

      const result = renderSandboxedTemplate({
        templateContent: template,
        contextVariables: context,
        escapeHtml: true
      });

      expect(result.renderedOutput).not.toContain('<script>');
      expect(result.renderedOutput).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(result.renderedOutput).toContain('&amp; bem-estar com &quot;meditação&quot;.');
    });

    it('deve rejeitar renderização e bloquear quando detectar vetor crítico de SSTI', () => {
      const template = 'Documento: {{global.process.exit(1)}}';
      const context = { dummy: 'test' };

      const result = renderSandboxedTemplate({
        templateContent: template,
        contextVariables: context,
        strictSandboxing: true
      });

      expect(result.actionTaken).toBe(SstiSanitizationAction.BLOCKED_VULNERABLE);
      expect(result.renderedOutput).toContain('RENDERIZAÇÃO CANCELADA');
    });

    it('deve rejeitar templates que excedam o tamanho máximo permitido', () => {
      const hugeTemplate = 'A'.repeat(15000);
      const result = renderSandboxedTemplate({
        templateContent: hugeTemplate,
        contextVariables: {},
        maxTemplateLength: 5000
      });

      expect(result.actionTaken).toBe(SstiSanitizationAction.BLOCKED_VULNERABLE);
      expect(result.renderedOutput).toBe('');
    });
  });

  describe('Presets Oficiais da Resolução CFP nº 006/2019', () => {
    it('deve conter todos os templates oficiais válidos e sem vulnerabilidades', () => {
      expect(CLINICAL_TEMPLATE_PRESETS.length).toBeGreaterThanOrEqual(4);

      for (const preset of CLINICAL_TEMPLATE_PRESETS) {
        const inspection = inspectTemplate(preset.rawTemplate);
        expect(inspection.isValid).toBe(true);
        expect(inspection.riskSeverity).not.toBe(TemplateRiskSeverity.CRITICAL_SSTI_ATTEMPT);

        const render = renderSandboxedTemplate({
          templateContent: preset.rawTemplate,
          contextVariables: preset.defaultVariables
        });

        expect(render.actionTaken).toBe(SstiSanitizationAction.ALLOWED_SANDBOXED);
        expect(render.renderedOutput.length).toBeGreaterThan(20);
        expect(render.renderedOutput).not.toContain('{{');
      }
    });

    it('deve incluir o modelo de Declaração Psicológica conforme CFP 006/2019', () => {
      const declaracao = CLINICAL_TEMPLATE_PRESETS.find(
        (p) => p.type === ClinicalDocumentTemplateType.DECLARACAO_PSICOLOGICA
      );
      expect(declaracao).toBeDefined();
      expect(declaracao?.defaultVariables.pacienteNome).toBeDefined();
      expect(declaracao?.defaultVariables.terapeutaCrp).toBeDefined();
    });
  });

  describe('Selos Notariais WORM RFC 8785 de Validação de Template', () => {
    it('deve gerar selo criptográfico assinado com HMAC-SHA256 e digest canônico', () => {
      const template = 'Atestado Psicológico para {{pacienteNome}} emitido por {{terapeutaNome}}.';
      const context = { pacienteNome: 'Carlos', terapeutaNome: 'Dra. Alice' };
      const inspection = inspectTemplate(template);
      const renderResult = renderSandboxedTemplate({
        templateContent: template,
        contextVariables: context
      });
      const secret = 'test-secret-salt-32-bytes-minimum-security!';

      const seal = createSstiProofSeal({
        template,
        context,
        output: renderResult.renderedOutput,
        inspection,
        renderResult,
        secret
      });

      expect(seal.sealId).toBeDefined();
      expect(seal.templateHash).toBeDefined();
      expect(seal.hmacSignature.length).toBe(64);
      expect(seal.riskSeverity).toBe(TemplateRiskSeverity.SAFE_INTERPOLATED);

      const isValid = verifySstiProofSeal(seal, secret);
      expect(isValid).toBe(true);
    });

    it('deve detectar adulteração no selo criptográfico ou payload modificado', () => {
      const template = 'Relatório sigiloso de {{pacienteNome}}';
      const context = { pacienteNome: 'Ana' };
      const inspection = inspectTemplate(template);
      const renderResult = renderSandboxedTemplate({
        templateContent: template,
        contextVariables: context
      });
      const secret = 'valid-key-for-test-tampering-cases-123';

      const seal = createSstiProofSeal({
        template,
        context,
        output: renderResult.renderedOutput,
        inspection,
        renderResult,
        secret
      });

      // Simular adulteração
      const tamperedSeal = {
        ...seal,
        templateHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      };

      const isValid = verifySstiProofSeal(tamperedSeal, secret);
      expect(isValid).toBe(false);
    });
  });
});
