import { describe, it, expect } from 'bun:test';
import {
  evaluateGovernanceControls,
  buildExecutiveCompliancePackage,
  verifyCompliancePackageIntegrity,
  applyDpoSignOffToPackage,
  STANDARD_GOVERNANCE_CONTROLS
} from '../src/governance';
import { ComplianceFramework, ComplianceControlStatus } from '@terapiainfoco/shared';
import type { ForensicMetricsSnapshot } from '@terapiainfoco/shared';

describe('Executive Compliance Governance & Multi-Normative Audit Engine (RFC-001 §4.4, §5.2)', () => {
  const mockForensicMetrics: ForensicMetricsSnapshot = {
    totalWormBlocks: 142,
    wormChainIntegrity: 'INTACT',
    activeKmsKeyVersion: 2,
    dataBackupsCount: 15,
    resilienceFallbackPassed: true,
    twoFactorAdoptionRate: 100,
    passkeysCount: 3,
    rateLimitingStoreType: 'memory_fallback',
    otlpExporterActive: true
  };

  it('deve conter catálogo de controles padrão cobrindo os 4 pilares regulatórios', () => {
    expect(STANDARD_GOVERNANCE_CONTROLS.length).toBeGreaterThanOrEqual(16);

    const frameworks = new Set(STANDARD_GOVERNANCE_CONTROLS.map((c) => c.framework));
    expect(frameworks.has(ComplianceFramework.LGPD)).toBe(true);
    expect(frameworks.has(ComplianceFramework.CFP)).toBe(true);
    expect(frameworks.has(ComplianceFramework.ICP_BRASIL)).toBe(true);
    expect(frameworks.has(ComplianceFramework.SOC2_ISO27001)).toBe(true);
  });

  it('deve avaliar todos os controles e retornar 100% de conformidade para métricas íntegras', () => {
    const result = evaluateGovernanceControls(mockForensicMetrics);

    expect(result.globalScore).toBe(100);
    expect(result.status).toBe(ComplianceControlStatus.COMPLIANT);
    expect(result.frameworks.length).toBe(4);

    for (const fw of result.frameworks) {
      expect(fw.scorePercentage).toBe(100);
      expect(fw.status).toBe(ComplianceControlStatus.COMPLIANT);
    }
  });

  it('deve detectar divergência de auditoria WORM e penalizar pontuação do framework', () => {
    const degradedMetrics: ForensicMetricsSnapshot = {
      ...mockForensicMetrics,
      wormChainIntegrity: 'COMPROMISED'
    };

    const result = evaluateGovernanceControls(degradedMetrics);

    const lgpdFw = result.frameworks.find((f) => f.framework === ComplianceFramework.LGPD);
    expect(lgpdFw).toBeDefined();
    expect(lgpdFw?.scorePercentage).toBeLessThan(100);

    const wormCtrl = result.controls.find((c) => c.id === 'CTRL-LGPD-04');
    expect(wormCtrl?.status).toBe(ComplianceControlStatus.NON_COMPLIANT);
  });

  it('deve construir pacote executivo com digest canônico SHA-256 e selo probatório', () => {
    const pkg = buildExecutiveCompliancePackage({
      organization: 'TerapiaInFoco Clínica Digital',
      dpoName: 'Dra. Ana Silva (DPO)',
      technicalResponsibleCrp: 'CRP 06/98765-SP',
      forensicMetrics: mockForensicMetrics
    });

    expect(pkg.id).toStartWith('compliance-pkg-');
    expect(pkg.globalScorePercentage).toBe(100);
    expect(pkg.canonicalDigest).toBeDefined();
    expect(pkg.canonicalDigest.length).toBe(64);
    expect(pkg.tamperEvidentSeal).toStartWith('GOV-SEAL-SHA256:');

    // Validação da integridade pós-emissão
    const verification = verifyCompliancePackageIntegrity(pkg);
    expect(verification.valid).toBe(true);
    expect(verification.match).toBe(true);
  });

  it('deve acusar quebra de integridade caso o pacote gerado seja adulterado retroativamente', () => {
    const pkg = buildExecutiveCompliancePackage({
      forensicMetrics: mockForensicMetrics
    });

    // Simula adulteração maliciosa do score ou status pós-emissão
    const tamperedPkg = {
      ...pkg,
      globalScorePercentage: 99
    };

    const verification = verifyCompliancePackageIntegrity(tamperedPkg);
    expect(verification.valid).toBe(false);
    expect(verification.match).toBe(false);
  });

  it('deve aplicar a chancela formal do DPO vinculada ao digest do pacote', () => {
    const pkg = buildExecutiveCompliancePackage({
      forensicMetrics: mockForensicMetrics
    });

    const signedPkg = applyDpoSignOffToPackage(
      pkg,
      'Dr. Roberto DPO',
      'CRP 06/112233',
      'Auditoria de conformidade multi-normativa aprovada sem ressalvas.'
    );

    expect(signedPkg.dpoSignOff).toBeDefined();
    expect(signedPkg.dpoSignOff?.signedBy).toBe('Dr. Roberto DPO');
    expect(signedPkg.dpoSignOff?.signatureDigest.length).toBe(64);

    // O digest base do pacote original permanece íntegro
    const verification = verifyCompliancePackageIntegrity(signedPkg);
    expect(verification.valid).toBe(true);
  });
});
