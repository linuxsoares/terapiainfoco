import { describe, it, expect } from 'bun:test';
import {
  SecureBuffer,
  calculateShannonEntropy,
  inspectHeapSpraying,
  createMemoryZeroizationProofSeal,
  verifyMemoryZeroizationProofSeal
} from '../src/secureMemoryShield';
import {
  MemorySanitizationAlgorithm,
  HeapSprayingThreatLevel,
  SecureBufferState
} from '@terapiainfoco/shared';

describe('Secure Memory Shield & Heap Spraying Prevention (NIST SP 800-88 & OWASP ASVS)', () => {
  describe('SecureBuffer — Alocação, Isolamento e Prevenção de Use-After-Free', () => {
    it('deve alocar buffer seguro com metadados corretos e estado ALLOCATED', () => {
      const buf = new SecureBuffer('DEK_SOAP_CLINICAL', 32, 10000);
      expect(buf.id).toStartWith('sec-buf-');
      expect(buf.tag).toBe('DEK_SOAP_CLINICAL');
      expect(buf.byteLength).toBe(32);
      expect(buf.state).toBe(SecureBufferState.ALLOCATED);
      expect(buf.isExpired()).toBeFalse();
    });

    it('deve rejeitar tamanhos inválidos de buffer (menor ou igual a zero ou excessivo)', () => {
      expect(() => new SecureBuffer('INVALID', 0)).toThrow();
      expect(() => new SecureBuffer('INVALID', -16)).toThrow();
      expect(() => new SecureBuffer('INVALID', 20 * 1024 * 1024)).toThrow();
    });

    it('deve escrever e ler dados sensíveis com cópia defensiva', () => {
      const buf = new SecureBuffer('SECRET_KEY', 16);
      buf.write('minha_chave_1234');
      expect(buf.state).toBe(SecureBufferState.ACTIVE);

      const readBytes = buf.read();
      expect(Buffer.from(readBytes).toString('utf-8')).toBe('minha_chave_1234');

      // Modificação externa não afeta o buffer interno
      readBytes[0] = 0xFF;
      expect(buf.readString()).toBe('minha_chave_1234');
    });

    it('deve rejeitar escrita que excede a capacidade do bloco seguro', () => {
      const buf = new SecureBuffer('SMALL_BUFFER', 8);
      expect(() => buf.write('esta_string_eh_muito_longa_para_oito_bytes')).toThrow();
    });

    it('deve aplicar sanitização multi-pass NIST SP 800-88 (4 passos) e zerar a memória', () => {
      const buf = new SecureBuffer('DEK_PATIENT_RECORDS', 64, 5000, 'dados_clinicos_estritamente_confidenciais');
      expect(buf.state).toBe(SecureBufferState.ACTIVE);

      const passes = buf.zeroize(MemorySanitizationAlgorithm.NIST_SP_800_88_OVERWRITE);
      expect(passes).toBe(4);
      expect(buf.state).toBe(SecureBufferState.ZEROIZED);
      expect(buf.zeroizedAt).toBeDefined();

      // Tentativa de leitura subsequente deve lançar erro impedindo UAF (Use-After-Free)
      expect(() => buf.read()).toThrow(/UAF Prevented/);
      expect(() => buf.write('novo_dado')).toThrow(/UAF Prevented/);
    });

    it('deve aplicar sanitização DoD 5220.22-M (3 passos) e zerar a memória', () => {
      const buf = new SecureBuffer('DOD_TEST', 32, 5000, 'segredo_dod_militar');
      const passes = buf.zeroize(MemorySanitizationAlgorithm.DOD_5220_22_M);
      expect(passes).toBe(3);
      expect(buf.state).toBe(SecureBufferState.ZEROIZED);
      expect(() => buf.read()).toThrow();
    });

    it('deve aplicar sanitização ZEROIZE_IMMEDIATE (1 passo)', () => {
      const buf = new SecureBuffer('FAST_ZERO', 16, 5000, 'rapido_123456');
      const passes = buf.zeroize(MemorySanitizationAlgorithm.ZEROIZE_IMMEDIATE);
      expect(passes).toBe(1);
      expect(buf.state).toBe(SecureBufferState.ZEROIZED);
    });

    it('deve detectar expiração de TTL corretamente', () => {
      const buf = new SecureBuffer('TEMP_DEK', 16, 100);
      expect(buf.isExpired(Date.now() - 1000)).toBeFalse();
      expect(buf.isExpired(Date.now() + 5000)).toBeTrue();
    });
  });

  describe('Cálculo de Entropia de Shannon', () => {
    it('deve calcular entropia 0.0 para buffer vazio ou de byte único', () => {
      expect(calculateShannonEntropy(new Uint8Array([]))).toBe(0.0);
      expect(calculateShannonEntropy(new Uint8Array(32).fill(0x00))).toBe(0.0);
    });

    it('deve calcular entropia intermediária para texto comum', () => {
      const text = Buffer.from('Prontuário psicológico estruturado sob sigilo do CFP.', 'utf-8');
      const entropy = calculateShannonEntropy(text);
      expect(entropy).toBeGreaterThan(3.0);
      expect(entropy).toBeLessThan(5.5);
    });

    it('deve calcular alta entropia para bytes criptográficos aleatórios', () => {
      const cryptoBytes = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        cryptoBytes[i] = i;
      }
      const entropy = calculateShannonEntropy(cryptoBytes);
      expect(entropy).toBe(8.0);
    });
  });

  describe('Inspeção e Detecção de Heap Spraying', () => {
    it('deve classificar texto clínico normal como NORMAL', () => {
      const result = inspectHeapSpraying('Sessão terapêutica realizada em 15/10/2026. Paciente relata melhora de ansiedade.');
      expect(result.isSprayingDetected).toBeFalse();
      expect(result.threatLevel).toBe(HeapSprayingThreatLevel.NORMAL);
      expect(result.detectedPatterns).toBeEmpty();
    });

    it('deve detectar NOP Sled clássico (0x90) como CRITICAL_SPRAYING', () => {
      // 64 bytes de NOP sled x86
      const nopSled = new Uint8Array(64).fill(0x90);
      const result = inspectHeapSpraying(nopSled);

      expect(result.isSprayingDetected).toBeTrue();
      expect(result.threatLevel).toBe(HeapSprayingThreatLevel.CRITICAL_SPRAYING);
      expect(result.detectedPatterns.some(p => p.includes('X86_NOP_SLED'))).toBeTrue();
      expect(result.entropyScore).toBe(0.0);
    });

    it('deve detectar Browser Heap Spray pointer (0x0C0C0C0C) como CRITICAL_SPRAYING', () => {
      const sprayBuffer = new Uint8Array(64).fill(0x0C);
      const result = inspectHeapSpraying(sprayBuffer);

      expect(result.isSprayingDetected).toBeTrue();
      expect(result.threatLevel).toBe(HeapSprayingThreatLevel.CRITICAL_SPRAYING);
      expect(result.detectedPatterns.some(p => p.includes('CLASSIC_BROWSER_SPRAY_0C'))).toBeTrue();
    });

    it('deve detectar padrões de repetição massiva de k-grams como CRITICAL_SPRAYING ou ATTACK_DETECTED', () => {
      // Repetição de 4 bytes [0xDE, 0xAD, 0xBE, 0xEF] 20 vezes
      const pattern = [0xDE, 0xAD, 0xBE, 0xEF];
      const payload = new Uint8Array(80);
      for (let i = 0; i < 20; i++) {
        payload.set(pattern, i * 4);
      }

      const result = inspectHeapSpraying(payload);
      expect(result.isSprayingDetected).toBeTrue();
      expect(result.detectedPatterns.some(p => p.includes('HIGH_REPETITION'))).toBeTrue();
    });

    it('deve detectar payloads com byte dominante extremo (>60%)', () => {
      const payload = new Uint8Array(64);
      payload.fill(0xAA); // 100% dominante
      const result = inspectHeapSpraying(payload);

      expect(result.isSprayingDetected).toBeTrue();
      expect(result.detectedPatterns.some(p => p.includes('DOMINANT_BYTE'))).toBeTrue();
    });
  });

  describe('Selo Probatório WORM de Sanitização de Memória (HMAC-SHA256)', () => {
    it('deve emitir e validar selo de zeroização com 100% de autenticidade', () => {
      const buf = new SecureBuffer('DEK_EHR_EXPORT', 32, 5000, 'chave_de_teste_sensivel');
      const passes = buf.zeroize(MemorySanitizationAlgorithm.NIST_SP_800_88_OVERWRITE);

      const seal = createMemoryZeroizationProofSeal(
        buf.toMetadata(),
        MemorySanitizationAlgorithm.NIST_SP_800_88_OVERWRITE,
        passes
      );

      expect(seal.token).toStartWith('MEM-ZEROIZE-v1-');
      expect(seal.blockId).toBe(buf.id);
      expect(seal.passesCompleted).toBe(4);
      expect(seal.canonicalDigest).toBeDefined();
      expect(seal.hmacSignature).toBeDefined();

      const verification = verifyMemoryZeroizationProofSeal(seal);
      expect(verification.isValid).toBeTrue();
      expect(verification.message).toContain('NIST SP 800-88 auditado');
    });

    it('deve rejeitar selo adulterado caso o número de passos ou dados sejam alterados', () => {
      const buf = new SecureBuffer('DEK_TAMPER', 32, 5000);
      const passes = buf.zeroize();
      const seal = createMemoryZeroizationProofSeal(buf.toMetadata(), MemorySanitizationAlgorithm.NIST_SP_800_88_OVERWRITE, passes);

      // Adulteração maliciosa do selo
      const tamperedSeal = {
        ...seal,
        passesCompleted: 10 // Adulterado
      };

      const verification = verifyMemoryZeroizationProofSeal(tamperedSeal);
      expect(verification.isValid).toBeFalse();
      expect(verification.message).toContain('Adulteração detectada');
    });

    it('deve rejeitar selo com assinatura HMAC forjada', () => {
      const buf = new SecureBuffer('DEK_FORGED', 32, 5000);
      const passes = buf.zeroize();
      const seal = createMemoryZeroizationProofSeal(buf.toMetadata(), MemorySanitizationAlgorithm.NIST_SP_800_88_OVERWRITE, passes);

      const forgedSeal = {
        ...seal,
        hmacSignature: '0000111122223333444455556666777788889999aaaabbbbccccddddeeeeffff'
      };

      const verification = verifyMemoryZeroizationProofSeal(forgedSeal);
      expect(verification.isValid).toBeFalse();
      expect(verification.message).toContain('Assinatura HMAC-SHA256 forjada');
    });
  });
});
