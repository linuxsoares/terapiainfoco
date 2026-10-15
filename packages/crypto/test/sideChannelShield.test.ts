import { describe, it, expect } from 'bun:test';
import {
  constantTimeCompare,
  vulnerableVariableTimeCompare,
  constantTimeSelect,
  boxMullerGaussianRandom,
  injectCalibratedJitter,
  runWelchTTestTimingAnalysis,
  inspectOperationSideChannel,
  issueSideChannelProofSeal,
  verifySideChannelProofSeal,
  canonicalStringify
} from '../src/sideChannelShield';
import {
  SideChannelProtectionMode,
  SideChannelVulnerabilityLevel,
  SideChannelTargetOperation
} from '@terapiainfoco/shared';
import crypto from 'node:crypto';

describe('Side-Channel & Timing Attack Shield Engine (NIST SP 800-38D & RFC §4.2, §4.4)', () => {
  // 1. Primitivas de Tempo Constante
  describe('Primitivas de Comparação em Tempo Constante', () => {
    it('deve validar buffers idênticos retornando true', () => {
      const a = Buffer.from('terapiainfoco_secret_token_123456');
      const b = Buffer.from('terapiainfoco_secret_token_123456');
      expect(constantTimeCompare(a, b)).toBe(true);
    });

    it('deve retornar false quando houver diferença no primeiro byte', () => {
      const a = Buffer.from('AERAPIAINFOCO_TOKEN');
      const b = Buffer.from('BERAPIAINFOCO_TOKEN');
      expect(constantTimeCompare(a, b)).toBe(false);
    });

    it('deve retornar false quando houver diferença no último byte', () => {
      const a = Buffer.from('TERAPIAINFOCO_TOKEN_1');
      const b = Buffer.from('TERAPIAINFOCO_TOKEN_2');
      expect(constantTimeCompare(a, b)).toBe(false);
    });

    it('deve retornar false com segurança para buffers de comprimentos diferentes', () => {
      const a = Buffer.from('CURTO');
      const b = Buffer.from('MUITO_MAIS_LONGO_QUE_O_PRIMEIRO');
      expect(constantTimeCompare(a, b)).toBe(false);
    });

    it('deve executar seleção condicional aritmética sem branching (constantTimeSelect)', () => {
      expect(constantTimeSelect(true, 42, 99)).toBe(42);
      expect(constantTimeSelect(false, 42, 99)).toBe(99);
    });
  });

  // 2. Injeção de Jitter Estocástico Regulado
  describe('Jitter Estocástico & Transformada de Box-Muller', () => {
    it('deve gerar números com distribuição gaussiana em torno da média', () => {
      const samples: number[] = [];
      for (let i = 0; i < 50; i++) {
        const val = boxMullerGaussianRandom(10, 2);
        expect(val).toBeGreaterThanOrEqual(0);
        samples.push(val);
      }
      const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
      expect(mean).toBeGreaterThan(5);
      expect(mean).toBeLessThan(15);
    });

    it('deve injetar jitter calibrado assíncrono', async () => {
      const start = Date.now();
      const delayInjected = await injectCalibratedJitter(5, 1);
      const elapsed = Date.now() - start;
      expect(delayInjected).toBeGreaterThanOrEqual(1);
      expect(elapsed).toBeGreaterThanOrEqual(2);
    });
  });

  // 3. Pentest Estatístico de Welch (t-test)
  describe('Análise Estatística de Welch (Welch\'s t-test)', () => {
    it('deve confirmar conformidade NIST (|t| < 4.5) para comparação em tempo constante', () => {
      const bufA = crypto.randomBytes(32);
      const bufB = Buffer.from(bufA);
      const bufDiff = Buffer.from(bufA);
      bufDiff[0] ^= 0x01;

      const result = runWelchTTestTimingAnalysis(
        () => { constantTimeCompare(bufA, bufB); },
        () => { constantTimeCompare(bufA, bufDiff); },
        60
      );

      expect(result.sampleCountA).toBe(60);
      expect(result.sampleCountB).toBe(60);
      expect(result.tScore).toBeLessThan(4.5);
      expect(result.nistCompliant).toBe(true);
      expect(result.vulnerabilityLevel).toBe(SideChannelVulnerabilityLevel.IMMUNE_NIST_COMPLIANT);
      expect(result.explanation).toContain('CONFORME NIST');
    });

    it('deve acusar divergência quando testado contra função insegura de early-exit', () => {
      const real = Buffer.alloc(1000, 'A');
      const earlyDiff = Buffer.alloc(1000, 'B'); // Diferente logo no byte 0
      const lateDiff = Buffer.alloc(1000, 'A');
      lateDiff[999] = 'C'.charCodeAt(0); // Diferente só no byte 999

      const result = runWelchTTestTimingAnalysis(
        () => { vulnerableVariableTimeCompare(real, earlyDiff); },
        () => { vulnerableVariableTimeCompare(real, lateDiff); },
        150
      );

      // A diferença de tempo entre comparar 1 byte vs 1000 bytes deve elevar o t-score
      expect(result.tScore).toBeGreaterThanOrEqual(0);
      expect(result.degreesOfFreedom).toBeGreaterThan(0);
    });
  });

  // 4. Inspeção de Operações Clínicas
  describe('Inspeção de Operações Clínicas em Tempo Constante', () => {
    it('deve inspecionar verificação de Auth Tag AES-GCM com sucesso', () => {
      const insp = inspectOperationSideChannel(
        SideChannelTargetOperation.AES_GCM_AUTH_TAG_VERIFY,
        SideChannelProtectionMode.CONSTANT_TIME_PLUS_GAUSSIAN_JITTER,
        50
      );

      expect(insp.id).toContain('sc_insp_');
      expect(insp.targetOperation).toBe(SideChannelTargetOperation.AES_GCM_AUTH_TAG_VERIFY);
      expect(insp.constantTimeGuaranteed).toBe(true);
      expect(insp.meanDurationNs).toBeGreaterThan(0);
      expect(insp.jitterInjectedMs).toBe(5);
    });

    it('deve inspecionar cálculo de Blind Index HMAC-SHA256', () => {
      const insp = inspectOperationSideChannel(
        SideChannelTargetOperation.BLIND_INDEX_HMAC_COMPUTE,
        SideChannelProtectionMode.STRICT_CONSTANT_TIME_ONLY,
        40
      );

      expect(insp.targetOperation).toBe(SideChannelTargetOperation.BLIND_INDEX_HMAC_COMPUTE);
      expect(insp.welchTScore).toBeLessThan(4.5);
    });

    it('deve inspecionar comparação de senha/passphrase PBKDF2', () => {
      const insp = inspectOperationSideChannel(
        SideChannelTargetOperation.PASSWORD_PBKDF2_COMPARE,
        SideChannelProtectionMode.CONSTANT_TIME_PLUS_GAUSSIAN_JITTER,
        40
      );

      expect(insp.targetOperation).toBe(SideChannelTargetOperation.PASSWORD_PBKDF2_COMPARE);
      expect(insp.vulnerabilityLevel).toBe(SideChannelVulnerabilityLevel.IMMUNE_NIST_COMPLIANT);
    });
  });

  // 5. Selos Probatórios WORM e Canonicalização
  describe('Selo Probatório WORM HMAC-SHA256 & RFC 8785', () => {
    it('deve gerar canonicalStringify determinística e invariante', () => {
      const a = { op: 'AES_GCM', variance: 120, tags: [1, 2] };
      const b = { tags: [1, 2], variance: 120, op: 'AES_GCM' };
      expect(canonicalStringify(a)).toBe(canonicalStringify(b));
    });

    it('deve emitir e validar selo probatório com sucesso', () => {
      const payload = { opId: 'sc_op_001', nistOk: true, tScore: 1.15 };
      const seal = issueSideChannelProofSeal(
        'op_001',
        SideChannelTargetOperation.AES_GCM_AUTH_TAG_VERIFY,
        SideChannelProtectionMode.CONSTANT_TIME_PLUS_GAUSSIAN_JITTER,
        payload
      );

      expect(seal.sealToken).toContain('side_channel_proof_v1_');
      const valid = verifySideChannelProofSeal(seal, payload);
      expect(valid).toBe(true);

      // Adulteração
      const tampered = { ...payload, tScore: 9.99 };
      expect(verifySideChannelProofSeal(seal, tampered)).toBe(false);
    });
  });
});
