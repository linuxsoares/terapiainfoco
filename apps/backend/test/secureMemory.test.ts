import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { MemorySanitizationAlgorithm, HeapSprayingThreatLevel, AuditAction } from '@terapiainfoco/shared';
import { AuditService } from '../src/services/auditService';
import { adminRequest } from './helpers/adminRequest';

describe('Secure Memory & Heap Spraying Routes Integration (/api/secure-memory)', () => {
  describe('GET /api/secure-memory/overview', () => {
    it('deve retornar overview completo com métricas, blocos ativos e selos WORM', async () => {
      const res = await adminRequest('/api/secure-memory/overview');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBeTrue();
      expect(data.overview).toBeDefined();
      expect(data.overview.metrics.activeAllocatedBlocks).toBeGreaterThan(0);
      expect(data.overview.metrics.totalBytesInSecureHeap).toBeGreaterThan(0);
      expect(data.overview.activeBlocks.length).toBeGreaterThan(0);
      expect(data.overview.systemStatus).toBeDefined();
    });
  });

  describe('POST /api/secure-memory/allocate', () => {
    it('deve rejeitar requisição sem tag ou tamanho em bytes (HTTP 400)', async () => {
      const res = await adminRequest('/api/secure-memory/allocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBeFalse();
    });

    it('deve alocar bloco de memória segura com sucesso (HTTP 201) e registrar auditoria WORM', async () => {
      const payload = {
        tag: 'DEK_TELECONSULTATION_TRANSCRIPT',
        sizeBytes: 32,
        ttlMs: 30000,
        initialContentHex: 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899'
      };

      const res = await adminRequest('/api/secure-memory/allocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBeTrue();
      expect(data.block.tag).toBe(payload.tag);
      expect(data.block.byteLength).toBe(32);
      expect(data.block.id).toStartWith('sec-buf-');

      // Verifica se log WORM foi emitido
      const audits = await AuditService.getFilteredLogs({});
      const allocationLog = audits.find(a => a.action === AuditAction.SECURE_MEMORY_ALLOCATED && a.resourceId === data.block.id);
      expect(allocationLog).toBeDefined();
    });
  });

  describe('POST /api/secure-memory/zeroize', () => {
    it('deve rejeitar requisição sem blockId (HTTP 400)', async () => {
      const res = await adminRequest('/api/secure-memory/zeroize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      expect(res.status).toBe(400);
    });

    it('deve sanitizar bloco e emitir selo probatório WORM (NIST SP 800-88)', async () => {
      // 1. Aloca um bloco
      const allocRes = await adminRequest('/api/secure-memory/allocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: 'TEMP_KEY_TO_ZEROIZE', sizeBytes: 16 })
      });
      const { block } = await allocRes.json();

      // 2. Zeroiza com NIST SP 800-88
      const zeroizeRes = await adminRequest('/api/secure-memory/zeroize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blockId: block.id,
          algorithm: MemorySanitizationAlgorithm.NIST_SP_800_88_OVERWRITE
        })
      });

      expect(zeroizeRes.status).toBe(200);
      const zeroizeData = await zeroizeRes.json();
      expect(zeroizeData.success).toBeTrue();
      expect(zeroizeData.proofSeal.token).toStartWith('MEM-ZEROIZE-v1-');
      expect(zeroizeData.proofSeal.passesCompleted).toBe(4);
      expect(zeroizeData.proofSeal.blockId).toBe(block.id);

      // 3. Valida se a trilha WORM capturou a destruição
      const audits = await AuditService.getFilteredLogs({});
      const zeroizeLog = audits.find(a => a.action === AuditAction.SECURE_MEMORY_ZEROIZED && a.resourceId === block.id);
      expect(zeroizeLog).toBeDefined();
    });
  });

  describe('POST /api/secure-memory/inspect-heap-spraying', () => {
    it('deve aprovar payload clínico regular sem anomalias', async () => {
      const res = await adminRequest('/api/secure-memory/inspect-heap-spraying', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payloadHexOrText: 'Paciente relata remissão completa dos episódios depressivos e aderência ao tratamento psicoterápico.',
          sampleTag: 'EVOLUCAO_SOAP_INPUT'
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBeTrue();
      expect(data.inspection.isSprayingDetected).toBeFalse();
      expect(data.inspection.threatLevel).toBe(HeapSprayingThreatLevel.NORMAL);
      expect(data.auditLogged).toBeFalse();
    });

    it('deve interceptar NOP sleds de Heap Spraying e emitir logs de bloqueio WORM', async () => {
      // 64 bytes de NOP sled em hexadecimal: "90" repetido 64 vezes
      const nopPayload = '90'.repeat(64);

      const res = await adminRequest('/api/secure-memory/inspect-heap-spraying', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payloadHexOrText: nopPayload,
          sampleTag: 'MALICIOUS_NOP_SLED_INJECTION'
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBeTrue();
      expect(data.inspection.isSprayingDetected).toBeTrue();
      expect(data.inspection.threatLevel).toBe(HeapSprayingThreatLevel.CRITICAL_SPRAYING);
      expect(data.auditLogged).toBeTrue();

      // Confirma que foram gravados logs de detecção e bloqueio
      const audits = await AuditService.getFilteredLogs({});
      const detectedLog = audits.find(a => a.action === AuditAction.HEAP_SPRAYING_DETECTED);
      const blockedLog = audits.find(a => a.action === AuditAction.HEAP_SPRAYING_BLOCKED);
      expect(detectedLog).toBeDefined();
      expect(blockedLog).toBeDefined();
    });
  });

  describe('POST /api/secure-memory/purge-expired', () => {
    it('deve executar varredura de DEKs expiradas sem erros', async () => {
      // Aloca um bloco com TTL expirado imediatamente (1ms)
      await adminRequest('/api/secure-memory/allocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: 'INSTANT_EXPIRE_DEK', sizeBytes: 16, ttlMs: 1 })
      });

      // Aguarda 10ms para garantir expiração
      await new Promise(r => setTimeout(r, 15));

      const res = await adminRequest('/api/secure-memory/purge-expired', {
        method: 'POST'
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBeTrue();
      expect(data.purgedCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('POST /api/secure-memory/verify-seal', () => {
    it('deve verificar autenticidade de selo gerado legitimamente', async () => {
      // Aloca e zeroiza para obter selo
      const allocRes = await adminRequest('/api/secure-memory/allocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: 'KEY_FOR_SEAL_TEST', sizeBytes: 16 })
      });
      const { block } = await allocRes.json();

      const zeroizeRes = await adminRequest('/api/secure-memory/zeroize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockId: block.id })
      });
      const { proofSeal } = await zeroizeRes.json();

      // Validação do selo via rota
      const verifyRes = await adminRequest('/api/secure-memory/verify-seal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proofSealToken: proofSeal.token })
      });

      expect(verifyRes.status).toBe(200);
      const verifyData = await verifyRes.json();
      expect(verifyData.success).toBeTrue();
      expect(verifyData.isValid).toBeTrue();
      expect(verifyData.seal.token).toBe(proofSeal.token);
    });

    it('deve acusar selo não localizado para token inexistente', async () => {
      const res = await adminRequest('/api/secure-memory/verify-seal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proofSealToken: 'MEM-ZEROIZE-v1-naoexiste' })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.isValid).toBeFalse();
      expect(data.message).toContain('não localizado');
    });
  });
});
