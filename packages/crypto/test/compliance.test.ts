import { describe, it, expect } from 'bun:test';
import { 
  verifyHashChainIntegrity, 
  simulateCryptographicTamperingTest, 
  calculateReportCanonicalHash,
  type HashChainBlock
} from '../src/compliance';
import { createHash } from 'node:crypto';

describe('Compliance & Cryptographic Audit Engine (RFC-001 Fase 4 & LGPD Art. 38/50)', () => {
  describe('verifyHashChainIntegrity', () => {
    it('deve retornar válido para cadeia vazia', () => {
      const res = verifyHashChainIntegrity([]);
      expect(res.valid).toBe(true);
      expect(res.totalBlocks).toBe(0);
    });

    it('deve validar cadeia sequencialmente íntegra com múltiplos blocos', () => {
      const genesisHash = '0000000000000000000000000000000000000000000000000000000000000000';
      const blocks: HashChainBlock[] = [];
      let currentPrev = genesisHash;

      for (let i = 0; i < 5; i++) {
        const id = `block_${i}`;
        const timestamp = new Date(Date.now() + i * 1000).toISOString();
        const action = `CLINICAL_ACTION_${i}`;
        const hash = createHash('sha256').update(`${currentPrev}|${action}|${timestamp}|${id}`).digest('hex');

        blocks.push({
          id,
          prevHash: currentPrev,
          hash,
          timestamp,
          action
        });

        currentPrev = hash;
      }

      const res = verifyHashChainIntegrity(blocks);
      expect(res.valid).toBe(true);
      expect(res.totalBlocks).toBe(5);
      expect(res.computedHeadHash).toBe(currentPrev);
    });

    it('deve detectar violação e apontar índice exato de adulteração na hash-chain', () => {
      const blocks: HashChainBlock[] = [
        {
          id: 'b1',
          prevHash: 'GENESIS_BLOCK_TERAPIA_IN_FOCO_LGPD_COMPLIANCE',
          hash: 'a'.repeat(64),
          timestamp: new Date().toISOString(),
          action: 'LOGIN'
        },
        {
          id: 'b2',
          prevHash: 'a'.repeat(64),
          hash: 'b'.repeat(64),
          timestamp: new Date().toISOString(),
          action: 'PATIENT_READ'
        },
        {
          id: 'b3',
          prevHash: 'c'.repeat(64), // Adulterado! Esperado 'b'.repeat(64)
          hash: 'd'.repeat(64),
          timestamp: new Date().toISOString(),
          action: 'SOAP_CREATE'
        }
      ];

      const res = verifyHashChainIntegrity(blocks);
      expect(res.valid).toBe(false);
      expect(res.brokenAtIndex).toBe(2);
      expect(res.error).toBeDefined();
    });
  });

  describe('simulateCryptographicTamperingTest', () => {
    it('deve confirmar detecção de adulteração via AES-GCM e determinismo do Blind Index', () => {
      const res = simulateCryptographicTamperingTest();
      expect(res.passed).toBe(true);
      expect(res.aesGcmDetectedTampering).toBe(true);
      expect(res.blindIndexDeterministic).toBe(true);
      expect(res.latencyMs).toBeGreaterThan(0);
      expect(res.details).toContain('Auth Tag GCM');
    });
  });

  describe('calculateReportCanonicalHash', () => {
    it('deve gerar hash determinístico idêntico independentemente da ordem das propriedades', () => {
      const reportA = {
        title: 'Relatório DPIA',
        score: 100,
        metadata: {
          author: 'DPO',
          version: '1.0'
        },
        tags: ['lgpd', 'cfp']
      };

      const reportB = {
        tags: ['lgpd', 'cfp'],
        metadata: {
          version: '1.0',
          author: 'DPO'
        },
        score: 100,
        title: 'Relatório DPIA'
      };

      const hashA = calculateReportCanonicalHash(reportA);
      const hashB = calculateReportCanonicalHash(reportB);

      expect(hashA).toBe(hashB);
      expect(hashA.length).toBe(64);
    });

    it('deve gerar hash diferente se o conteúdo for modificado', () => {
      const report1 = { score: 100, status: 'COMPLIANT' };
      const report2 = { score: 99, status: 'COMPLIANT' };

      expect(calculateReportCanonicalHash(report1)).not.toBe(calculateReportCanonicalHash(report2));
    });
  });
});
