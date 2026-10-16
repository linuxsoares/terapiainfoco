import { describe, expect, it } from 'bun:test';
import {
  inspectPath,
  sanitizeSafeFileName,
  resolveSafeAttachmentPath,
  createPathTraversalProofSeal,
  verifyPathTraversalProofSeal,
  DEFAULT_PATH_GUARD_POLICY,
  DEFAULT_SAFE_JAIL_ROOTS,
  CLINICAL_ATTACHMENT_PRESETS,
} from '../src/pathTraversalGuard';
import {
  PathRiskSeverity,
  PathThreatVector,
  PathValidationAction,
  ClinicalAttachmentCategory,
} from '@terapiainfoco/shared';

describe('Path Traversal & LFI Guard (OWASP ASVS V5.5 & CWE-22/CWE-23/CWE-73)', () => {
  const anamnesisJail = DEFAULT_SAFE_JAIL_ROOTS[ClinicalAttachmentCategory.ANAMNESIS_DOC];

  describe('Inspeção Heurística e Confinamento de Caminhos (inspectPath)', () => {
    it('deve classificar caminho canônico e seguro dentro da jail como SAFE_CANONICAL', () => {
      const result = inspectPath('paciente_42/ficha_anamnese.pdf', anamnesisJail);

      expect(result.severity).toBe(PathRiskSeverity.SAFE_CANONICAL);
      expect(result.isWithinJail).toBe(true);
      expect(result.threats.length).toBe(0);
      expect(result.allowedExtension).toBe(true);
      expect(result.fileExtension).toBe('.pdf');
      expect(result.recommendedAction).toBe(PathValidationAction.CANONICALLY_RESOLVED);
      expect(result.resolvedAbsolutePath).toBe(`${anamnesisJail}/paciente_42/ficha_anamnese.pdf`);
    });

    it('deve detectar tentativa clássica de Directory Traversal relativo (../) como CRITICAL_PATH_TRAVERSAL', () => {
      const result = inspectPath('../../etc/passwd', anamnesisJail);

      expect(result.severity).toBe(PathRiskSeverity.CRITICAL_PATH_TRAVERSAL);
      expect(result.isWithinJail).toBe(false);
      expect(result.threats.some((t) => t.vector === PathThreatVector.RELATIVE_DOT_DOT_TRAVERSAL)).toBe(true);
      expect(result.threats.some((t) => t.vector === PathThreatVector.ABSOLUTE_SYSTEM_ROOT)).toBe(true);
      expect(result.recommendedAction).toBe(PathValidationAction.BLOCKED_TRAVERSAL_ATTEMPT);
    });

    it('deve detectar backslash traversal de estilo Windows (..\\..\\Windows)', () => {
      const result = inspectPath('..\\..\\Windows\\System32\\cmd.exe', anamnesisJail);

      expect(result.severity).toBe(PathRiskSeverity.CRITICAL_PATH_TRAVERSAL);
      expect(result.isWithinJail).toBe(false);
      expect(result.threats.some((t) => t.vector === PathThreatVector.RELATIVE_DOT_DOT_TRAVERSAL)).toBe(true);
      expect(result.threats.some((t) => t.vector === PathThreatVector.DANGEROUS_FILE_EXTENSION)).toBe(true);
      expect(result.recommendedAction).toBe(PathValidationAction.BLOCKED_TRAVERSAL_ATTEMPT);
    });

    it('deve detectar caminhos absolutos para arquivos sensíveis do sistema (/etc/shadow, /proc/self/environ)', () => {
      const result = inspectPath('/etc/shadow', anamnesisJail);

      expect(result.severity).toBe(PathRiskSeverity.CRITICAL_PATH_TRAVERSAL);
      expect(result.threats.some((t) => t.vector === PathThreatVector.ABSOLUTE_SYSTEM_ROOT)).toBe(true);
      expect(result.isWithinJail).toBe(false);
    });

    it('deve detectar injeção de byte nulo (%00 e \\0) para truncamento de extensão', () => {
      const result = inspectPath('prontuario_confidencial.pdf%00.php', anamnesisJail);

      expect(result.severity).toBe(PathRiskSeverity.CRITICAL_PATH_TRAVERSAL);
      expect(result.threats.some((t) => t.vector === PathThreatVector.NULL_BYTE_TERMINATION)).toBe(true);
      expect(result.threats.some((t) => t.vector === PathThreatVector.DANGEROUS_FILE_EXTENSION)).toBe(true);
    });

    it('deve desarmar e acusar evasão por codificação percentual dupla (%252e%252e%252f)', () => {
      const result = inspectPath('%252e%252e%252f%252e%252e%252fetc%252fpasswd', anamnesisJail);

      expect(result.severity).toBe(PathRiskSeverity.CRITICAL_PATH_TRAVERSAL);
      expect(result.threats.some((t) => t.vector === PathThreatVector.DOUBLE_PERCENT_ENCODING)).toBe(true);
      expect(result.threats.some((t) => t.vector === PathThreatVector.RELATIVE_DOT_DOT_TRAVERSAL)).toBe(true);
    });

    it('deve detectar esquemas de URI perigosos e wrappers LFI (file://, php://, data://)', () => {
      const result = inspectPath('file:///etc/hosts', anamnesisJail);

      expect(result.severity).toBe(PathRiskSeverity.CRITICAL_PATH_TRAVERSAL);
      expect(result.threats.some((t) => t.vector === PathThreatVector.URI_SCHEME_WRAPPER)).toBe(true);
    });

    it('deve detectar injeção de Alternate Data Streams no NTFS do Windows (::$DATA)', () => {
      const result = inspectPath('relatorio_clinico.pdf::$DATA', anamnesisJail);

      expect(result.severity).toBe(PathRiskSeverity.CRITICAL_PATH_TRAVERSAL);
      expect(result.threats.some((t) => t.vector === PathThreatVector.WINDOWS_ALTERNATE_STREAM)).toBe(true);
    });

    it('deve detectar extensões maliciosas e executáveis (.sh, .exe, .js, .py)', () => {
      const result = inspectPath('exploit_payload.sh', anamnesisJail);

      expect(result.severity).toBe(PathRiskSeverity.CRITICAL_PATH_TRAVERSAL);
      expect(result.threats.some((t) => t.vector === PathThreatVector.DANGEROUS_FILE_EXTENSION)).toBe(true);
      expect(result.allowedExtension).toBe(false);
    });
  });

  describe('Sanitização Segura de Nomes de Arquivo (sanitizeSafeFileName)', () => {
    it('deve sanitizar caracteres perigosos, espaços e gerar sufixo único com extensão preservada', () => {
      const safe = sanitizeSafeFileName('Laudo & Teste neuropsicológico (v1) !?.pdf');

      expect(safe.endsWith('.pdf')).toBe(true);
      expect(safe).not.toContain('&');
      expect(safe).not.toContain('(');
      expect(safe).not.toContain(' ');
      expect(safe).toContain('Laudo_Teste_neuropsicologico_v1');
    });

    it('deve forçar extensão .pdf segura caso receba arquivo com extensão maliciosa .php ou .exe', () => {
      const safe = sanitizeSafeFileName('web_shell.php');

      expect(safe.endsWith('.pdf')).toBe(true);
      expect(safe).not.toContain('.php');
    });
  });

  describe('Resolução Segura de Armazenamento em Jail (resolveSafeAttachmentPath)', () => {
    it('deve resolver caminho seguro com confinamento na jail correta e gerar selo WORM', () => {
      const resolution = resolveSafeAttachmentPath(
        ClinicalAttachmentCategory.NEUROPSYCH_REPORT,
        'bateria_neuropsicologica_wisc.pdf'
      );

      expect(resolution.success).toBe(true);
      expect(resolution.quarantined).toBe(false);
      expect(resolution.canonicalStoragePath.startsWith(DEFAULT_SAFE_JAIL_ROOTS[ClinicalAttachmentCategory.NEUROPSYCH_REPORT])).toBe(true);
      expect(resolution.proofSeal.sealId.startsWith('path_guard_seal_v1_')).toBe(true);
      expect(resolution.proofSeal.action).toBe(PathValidationAction.CANONICALLY_RESOLVED);
    });

    it('deve bloquear tentativa crítica de Path Traversal e colocar em quarentena segura', () => {
      const resolution = resolveSafeAttachmentPath(
        ClinicalAttachmentCategory.ANAMNESIS_DOC,
        '../../../../etc/passwd'
      );

      expect(resolution.success).toBe(false);
      expect(resolution.quarantined).toBe(true);
      expect(resolution.actionTaken).toBe(PathValidationAction.BLOCKED_TRAVERSAL_ATTEMPT);
      expect(resolution.canonicalStoragePath).toContain('/quarantine/');
      expect(resolution.errorReason).toBeDefined();
    });
  });

  describe('Selo Probatório Notarial WORM RFC 8785 (createPathTraversalProofSeal / verifyPathTraversalProofSeal)', () => {
    it('deve emitir e validar com 100% de integridade um selo probatório genuíno', () => {
      const seal = createPathTraversalProofSeal(
        '/var/terapiainfoco/storage/attachments/anamnesis/doc_123.pdf',
        PathValidationAction.CANONICALLY_RESOLVED,
        anamnesisJail
      );

      const verification = verifyPathTraversalProofSeal(seal);
      expect(verification.isValid).toBe(true);
      expect(verification.message).toContain('100% de integridade');
    });

    it('deve rejeitar selo adulterado ou com assinatura forjada', () => {
      const seal = createPathTraversalProofSeal(
        '/var/terapiainfoco/storage/attachments/anamnesis/doc_123.pdf',
        PathValidationAction.CANONICALLY_RESOLVED,
        anamnesisJail
      );

      const tamperedSeal = {
        ...seal,
        canonicalPath: '/etc/passwd', // Adulteração do caminho protegido
      };

      const verification = verifyPathTraversalProofSeal(tamperedSeal);
      expect(verification.isValid).toBe(false);
      expect(verification.message).toContain('inválida ou foi forjada');
    });
  });

  describe('Presets Clínicos Homologados', () => {
    it('deve fornecer presets para todas as 5 categorias clínicas de anexos', () => {
      expect(CLINICAL_ATTACHMENT_PRESETS.length).toBe(5);
      const categories = CLINICAL_ATTACHMENT_PRESETS.map((p) => p.category);
      expect(categories).toContain(ClinicalAttachmentCategory.ANAMNESIS_DOC);
      expect(categories).toContain(ClinicalAttachmentCategory.NEUROPSYCH_REPORT);
      expect(categories).toContain(ClinicalAttachmentCategory.MEDICAL_EXAM);
      expect(categories).toContain(ClinicalAttachmentCategory.COURT_ORDER_CFP);
      expect(categories).toContain(ClinicalAttachmentCategory.CLINICAL_SUMMARY);
    });
  });
});
