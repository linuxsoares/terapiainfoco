import { describe, it, expect } from 'bun:test';
import crypto from 'crypto';
import { 
  MediaShardStatus, 
  MediaRecordingStatus, 
  CryptoShreddingMethod, 
  AudioCodecType 
} from '@terapiainfoco/shared';
import type { MediaRecordingManifest } from '@terapiainfoco/shared';
import {
  calculateMerkleRoot,
  splitBufferIntoChunks,
  encryptMediaShard,
  decryptMediaShard,
  reassembleAndVerifyMedia,
  calculateCryptoShreddingDigest,
  executeCryptoShredding
} from '../src/mediaSharding';

describe('Media Sharding & Crypto-Shredding Engine (RFC-001 §3.2, §3.3, §4.2)', () => {
  const sampleAudioText = 'Paciente relata melhora expressiva nos sintomas de ansiedade e sono reparador.';
  const sampleAudioBuffer = Buffer.from(sampleAudioText, 'utf-8');

  describe('calculateMerkleRoot', () => {
    it('deve retornar hash default para árvore vazia', () => {
      const root = calculateMerkleRoot([]);
      expect(root).toBeDefined();
      expect(root.length).toBe(64);
    });

    it('deve retornar o próprio hash quando houver apenas um elemento', () => {
      const hash = crypto.createHash('sha256').update('shard-0').digest('hex');
      const root = calculateMerkleRoot([hash]);
      expect(root).toBe(hash);
    });

    it('deve calcular Merkle Root balanceada para número par e ímpar de nós', () => {
      const h1 = crypto.createHash('sha256').update('shard-1').digest('hex');
      const h2 = crypto.createHash('sha256').update('shard-2').digest('hex');
      const h3 = crypto.createHash('sha256').update('shard-3').digest('hex');

      const rootOdd = calculateMerkleRoot([h1, h2, h3]);
      const rootEven = calculateMerkleRoot([h1, h2]);

      expect(rootOdd).toBeDefined();
      expect(rootEven).toBeDefined();
      expect(rootOdd).not.toBe(rootEven);
    });
  });

  describe('splitBufferIntoChunks', () => {
    it('deve fatiar buffer em chunks com o tamanho especificado', () => {
      const buffer = Buffer.alloc(150, 0x42);
      const chunks = splitBufferIntoChunks(buffer, 50);

      expect(chunks.length).toBe(3);
      expect(chunks[0].length).toBe(50);
      expect(chunks[1].length).toBe(50);
      expect(chunks[2].length).toBe(50);
    });

    it('deve lidar com tamanho residual no último chunk', () => {
      const buffer = Buffer.alloc(130, 0x42);
      const chunks = splitBufferIntoChunks(buffer, 50);

      expect(chunks.length).toBe(3);
      expect(chunks[0].length).toBe(50);
      expect(chunks[1].length).toBe(50);
      expect(chunks[2].length).toBe(30);
    });

    it('deve retornar array vazio para buffer vazio', () => {
      expect(splitBufferIntoChunks(Buffer.alloc(0), 50)).toEqual([]);
    });
  });

  describe('encryptMediaShard & decryptMediaShard', () => {
    it('deve criptografar e decifrar um shard individual com integridade íntegra', () => {
      const chunk = Buffer.from('Áudio confidencial da sessão de psicoterapia', 'utf-8');
      const encrypted = encryptMediaShard(chunk, 0);

      expect(encrypted.metadata.shardIndex).toBe(0);
      expect(encrypted.metadata.status).toBe(MediaShardStatus.ACTIVE_ENCRYPTED);
      expect(encrypted.metadata.sha256Hash).toBeDefined();
      expect(encrypted.ciphertextBase64).toBeDefined();

      const decrypted = decryptMediaShard(encrypted);
      expect(decrypted.toString('utf-8')).toBe(chunk.toString('utf-8'));
    });

    it('deve falhar a decifragem se uma KEK incorreta for fornecida', () => {
      const chunk = Buffer.from('Chunk secreto', 'utf-8');
      const encrypted = encryptMediaShard(chunk, 0);

      const wrongKek = crypto.randomBytes(32).toString('hex');
      expect(() => {
        decryptMediaShard(encrypted, wrongKek);
      }).toThrow();
    });

    it('deve detectar adulteração no ciphertext (Tamper-Evidence via AuthTag e SHA-256)', () => {
      const chunk = Buffer.from('Áudio original', 'utf-8');
      const encrypted = encryptMediaShard(chunk, 0);

      // Adultera o payload em base64
      const tamperedCiphertext = Buffer.from(encrypted.ciphertextBase64, 'base64');
      tamperedCiphertext[0] ^= 0xff; // Inverte bits
      const tamperedShard = {
        ...encrypted,
        ciphertextBase64: tamperedCiphertext.toString('base64')
      };

      expect(() => {
        decryptMediaShard(tamperedShard);
      }).toThrow(/Violação de integridade/);
    });
  });

  describe('reassembleAndVerifyMedia', () => {
    it('deve fatiar, cifrar múltiplos shards, verificar Merkle Root e remontar perfeitamente', () => {
      const largePayload = Buffer.from('Chunk1-Inicio '.repeat(10) + 'Chunk2-Meio '.repeat(10) + 'Chunk3-Fim '.repeat(10));
      const chunks = splitBufferIntoChunks(largePayload, 64);
      expect(chunks.length).toBeGreaterThan(1);

      const encryptedShards = chunks.map((c, idx) => encryptMediaShard(c, idx));
      const hashes = encryptedShards.map(s => s.metadata.sha256Hash);
      const merkleRoot = calculateMerkleRoot(hashes);

      const reassembled = reassembleAndVerifyMedia(encryptedShards, merkleRoot);
      expect(reassembled.toString('utf-8')).toBe(largePayload.toString('utf-8'));
    });

    it('deve rejeitar remontagem se a Merkle Root for incompatível', () => {
      const chunks = splitBufferIntoChunks(sampleAudioBuffer, 20);
      const encryptedShards = chunks.map((c, idx) => encryptMediaShard(c, idx));
      const fakeRoot = crypto.randomBytes(32).toString('hex');

      expect(() => {
        reassembleAndVerifyMedia(encryptedShards, fakeRoot);
      }).toThrow(/Falha de verificação Merkle Tree/);
    });
  });

  describe('executeCryptoShredding', () => {
    it('deve destruir buffers em memória com zero-fill, purgar DEKs e emitir certificado forense', () => {
      const chunks = splitBufferIntoChunks(sampleAudioBuffer, 30);
      const encryptedShards = chunks.map((c, idx) => encryptMediaShard(c, idx));
      const merkleRoot = calculateMerkleRoot(encryptedShards.map(s => s.metadata.sha256Hash));

      // Simula storage em memória
      const shardStorage = new Map<string, Buffer>();
      for (const shard of encryptedShards) {
        shardStorage.set(shard.metadata.shardId, Buffer.from(shard.ciphertextBase64, 'base64'));
      }

      const manifest: MediaRecordingManifest = {
        id: 'rec-test-123',
        sessionId: 'sess-teleconsulta-456',
        patientId: 'pat-789',
        therapistId: 'ther-001',
        totalShards: encryptedShards.length,
        totalBytes: sampleAudioBuffer.length,
        durationSeconds: 50,
        codec: AudioCodecType.OPUS_FULLBAND,
        merkleRoot,
        status: MediaRecordingStatus.SHARDED_ENCRYPTED,
        createdAt: new Date().toISOString(),
        shards: encryptedShards.map(s => s.metadata)
      };

      const { certificate, updatedManifest } = executeCryptoShredding(manifest, shardStorage);

      expect(updatedManifest.status).toBe(MediaRecordingStatus.SHREDDED_PURGED);
      expect(updatedManifest.shreddedAt).toBeDefined();
      expect(certificate.probatoryWormDigest).toBeDefined();
      expect(certificate.totalBytesPurged).toBeGreaterThan(0);
      expect(certificate.shreddedShardsCount).toBe(encryptedShards.length);

      // Garante que o storage foi limpo
      expect(shardStorage.size).toBe(0);

      // Garante que os shards foram marcados como destruídos e com DEK purgada
      for (const shard of updatedManifest.shards) {
        expect(shard.status).toBe(MediaShardStatus.SHREDDED_DESTROYED);
        expect(shard.encryptedDek).toBe('PURGED_DEK_DESTROYED');
      }

      // Tentativa de decifrar um shard destruído deve falhar imediatamente
      const destroyedShard = {
        metadata: updatedManifest.shards[0],
        ciphertextBase64: encryptedShards[0].ciphertextBase64
      };
      expect(() => {
        decryptMediaShard(destroyedShard);
      }).toThrow(/expurgado permanentemente/);
    });

    it('deve calcular digest probatório do certificado de forma determinística', () => {
      const baseData = {
        certificateId: 'cert-1',
        recordingId: 'rec-1',
        sessionId: 'sess-1',
        destroyedAt: '2026-10-14T10:00:00.000Z',
        shreddedShardsCount: 5,
        totalBytesPurged: 1024,
        method: CryptoShreddingMethod.ZERO_FILL_AND_KEY_DESTROY,
        lgpdBasis: 'LGPD Art. 16',
        cfpComplianceRule: 'CFP 011/2018'
      };

      const digest1 = calculateCryptoShreddingDigest(baseData);
      const digest2 = calculateCryptoShreddingDigest(baseData);
      expect(digest1).toBe(digest2);

      const tampered = { ...baseData, totalBytesPurged: 1025 };
      expect(calculateCryptoShreddingDigest(tampered)).not.toBe(digest1);
    });
  });
});
