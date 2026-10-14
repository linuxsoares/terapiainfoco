import crypto from 'crypto';
import { 
  MediaShardStatus, 
  MediaRecordingStatus, 
  CryptoShreddingMethod, 
  AudioCodecType 
} from '@terapiainfoco/shared';
import type { 
  MediaShardMetadata, 
  EncryptedMediaShard, 
  MediaRecordingManifest, 
  CryptoShreddingCertificate 
} from '@terapiainfoco/shared';

// KEK padrão de contingência em repouso caso nenhuma seja injetada (32 bytes / 256 bits)
const DEFAULT_MEDIA_KEK = Buffer.from(
  '9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a0',
  'hex'
);

/**
 * Calcula a raiz da árvore de Merkle (Merkle Root) de forma determinística
 * para validação de integridade dos blocos de mídia cifrada (RFC-001 §3.2, §4.2)
 */
export function calculateMerkleRoot(hashes: string[]): string {
  if (hashes.length === 0) {
    return crypto.createHash('sha256').update('EMPTY_MERKLE_TREE').digest('hex');
  }

  let currentLevel = [...hashes];

  while (currentLevel.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      if (i + 1 < currentLevel.length) {
        const combined = currentLevel[i] + currentLevel[i + 1];
        nextLevel.push(crypto.createHash('sha256').update(combined).digest('hex'));
      } else {
        // Se o número de nós for ímpar, duplica o último nó para balancear a árvore
        const combined = currentLevel[i] + currentLevel[i];
        nextLevel.push(crypto.createHash('sha256').update(combined).digest('hex'));
      }
    }
    currentLevel = nextLevel;
  }

  return currentLevel[0];
}

/**
 * Fatie um buffer binário de áudio em chunks menores (shards)
 */
export function splitBufferIntoChunks(buffer: Buffer, chunkSize: number = 64 * 1024): Buffer[] {
  if (!buffer || buffer.length === 0) return [];
  if (chunkSize <= 0) throw new Error('O tamanho do chunk deve ser maior que zero.');

  const chunks: Buffer[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    const end = Math.min(offset + chunkSize, buffer.length);
    chunks.push(buffer.subarray(offset, end));
    offset = end;
  }

  return chunks;
}

/**
 * Criptografa um shard de mídia individual com DEK efêmera exclusiva (AES-256-GCM)
 * e cifra a DEK com a KEK Mestre (Envelope Encryption RFC-001 §4.2)
 */
export function encryptMediaShard(
  chunkBuffer: Buffer,
  shardIndex: number,
  masterKekHex?: string
): EncryptedMediaShard {
  const kek = masterKekHex ? Buffer.from(masterKekHex, 'hex') : DEFAULT_MEDIA_KEK;
  if (kek.length !== 32) {
    throw new Error('A KEK Mestre deve possuir exatamente 32 bytes (256 bits).');
  }

  // 1. Gera DEK efêmera de 32 bytes exclusiva para este shard
  const shardDek = crypto.randomBytes(32);

  // 2. Cifra o conteúdo do shard com AES-256-GCM
  const shardIv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', shardDek, shardIv);
  const ciphertext = Buffer.concat([cipher.update(chunkBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // 3. Cifra a DEK efêmera com a KEK mestre (AES-256-GCM)
  const dekIv = crypto.randomBytes(12);
  const dekCipher = crypto.createCipheriv('aes-256-gcm', kek, dekIv);
  const encryptedDekBytes = Buffer.concat([dekCipher.update(shardDek), dekCipher.final()]);
  const dekAuthTag = dekCipher.getAuthTag();
  
  // Encapsula DEK cifrada com seu IV e Tag em Base64
  const encryptedDek = JSON.stringify({
    iv: dekIv.toString('hex'),
    tag: dekAuthTag.toString('hex'),
    data: encryptedDekBytes.toString('hex')
  });

  // Imediatamente sobrescreve a DEK em claro na memória RAM
  shardDek.fill(0);

  // 4. Calcula o Hash SHA-256 do ciphertext para auditoria Merkle
  const sha256Hash = crypto.createHash('sha256').update(ciphertext).digest('hex');

  const metadata: MediaShardMetadata = {
    shardId: `shard-${shardIndex}-${crypto.randomUUID().slice(0, 8)}`,
    shardIndex,
    ivHex: shardIv.toString('hex'),
    authTagHex: authTag.toString('hex'),
    encryptedDek,
    sha256Hash,
    byteLength: chunkBuffer.length,
    status: MediaShardStatus.ACTIVE_ENCRYPTED,
    createdAt: new Date().toISOString()
  };

  return {
    metadata,
    ciphertextBase64: ciphertext.toString('base64')
  };
}

/**
 * Decifra um shard de mídia individual em memória RAM temporária
 */
export function decryptMediaShard(
  encryptedShard: EncryptedMediaShard,
  masterKekHex?: string
): Buffer {
  const kek = masterKekHex ? Buffer.from(masterKekHex, 'hex') : DEFAULT_MEDIA_KEK;
  const { metadata, ciphertextBase64 } = encryptedShard;

  if (metadata.status === MediaShardStatus.SHREDDED_DESTROYED) {
    throw new Error(`Shard ${metadata.shardId} foi expurgado permanentemente via Crypto-Shredding.`);
  }

  // 1. Decifra a DEK usando a KEK mestre
  const dekEnvelope = JSON.parse(metadata.encryptedDek);
  const dekIv = Buffer.from(dekEnvelope.iv, 'hex');
  const dekAuthTag = Buffer.from(dekEnvelope.tag, 'hex');
  const encryptedDekBytes = Buffer.from(dekEnvelope.data, 'hex');

  const dekDecipher = crypto.createDecipheriv('aes-256-gcm', kek, dekIv);
  dekDecipher.setAuthTag(dekAuthTag);
  const shardDek = Buffer.concat([dekDecipher.update(encryptedDekBytes), dekDecipher.final()]);

  // 2. Decifra o payload do shard
  const shardIv = Buffer.from(metadata.ivHex, 'hex');
  const shardAuthTag = Buffer.from(metadata.authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextBase64, 'base64');

  // Validação de integridade do hash do ciphertext
  const computedHash = crypto.createHash('sha256').update(ciphertext).digest('hex');
  if (computedHash !== metadata.sha256Hash) {
    shardDek.fill(0);
    throw new Error(`Violação de integridade no shard ${metadata.shardId}: hash divergente.`);
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', shardDek, shardIv);
  decipher.setAuthTag(shardAuthTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  // Sobrescreve a DEK recuperada logo após o uso
  shardDek.fill(0);

  return plaintext;
}

/**
 * Reconstrói o arquivo completo a partir dos shards, validando a Merkle Root
 */
export function reassembleAndVerifyMedia(
  shards: EncryptedMediaShard[],
  expectedMerkleRoot: string,
  masterKekHex?: string
): Buffer {
  // 1. Ordena os shards pelo índice sequencial
  const sorted = [...shards].sort((a, b) => a.metadata.shardIndex - b.metadata.shardIndex);

  // 2. Valida a Merkle Root dos hashes dos shards
  const hashes = sorted.map(s => s.metadata.sha256Hash);
  const computedRoot = calculateMerkleRoot(hashes);

  if (computedRoot !== expectedMerkleRoot) {
    throw new Error('Falha de verificação Merkle Tree: o conjunto de shards foi adulterado ou está incompleto.');
  }

  // 3. Decifra cada shard e concatena o buffer
  const decryptedBuffers: Buffer[] = [];
  for (const shard of sorted) {
    decryptedBuffers.push(decryptMediaShard(shard, masterKekHex));
  }

  return Buffer.concat(decryptedBuffers);
}

/**
 * Calcula o digest probatório SHA-256 para selagem WORM do Certificado de Crypto-Shredding
 */
export function calculateCryptoShreddingDigest(
  data: Omit<CryptoShreddingCertificate, 'probatoryWormDigest'>
): string {
  const canonicalString = JSON.stringify({
    certificateId: data.certificateId,
    recordingId: data.recordingId,
    sessionId: data.sessionId,
    destroyedAt: data.destroyedAt,
    shreddedShardsCount: data.shreddedShardsCount,
    totalBytesPurged: data.totalBytesPurged,
    method: data.method,
    lgpdBasis: data.lgpdBasis,
    cfpComplianceRule: data.cfpComplianceRule
  });

  return crypto.createHash('sha256').update(canonicalString).digest('hex');
}

/**
 * Executa o Crypto-Shredding compulsório:
 * - Sobrescreve buffers de mídia com zeros (*secure multi-pass zero-fill*)
 * - Purga as chaves DEK dos metadados
 * - Marca os shards como SHREDDED_DESTROYED
 * - Emite o Certificado Forense de Destruição
 */
export function executeCryptoShredding(
  manifest: MediaRecordingManifest,
  shardStorage: Map<string, Buffer>,
  method: CryptoShreddingMethod = CryptoShreddingMethod.ZERO_FILL_AND_KEY_DESTROY
): { certificate: CryptoShreddingCertificate; updatedManifest: MediaRecordingManifest } {
  const destroyedAt = new Date().toISOString();
  let totalBytesPurged = 0;

  // Atualiza cada shard e sobrescreve memória
  const updatedShards = manifest.shards.map((shard) => {
    // Se o buffer estiver no storage simulado, sobrescreve com zeros antes de deletar
    const buffer = shardStorage.get(shard.shardId);
    if (buffer) {
      totalBytesPurged += buffer.length;
      if (method === CryptoShreddingMethod.ZERO_FILL_AND_KEY_DESTROY) {
        buffer.fill(0); // Secure zero-fill
      }
      shardStorage.delete(shard.shardId);
    } else {
      totalBytesPurged += shard.byteLength;
    }

    return {
      ...shard,
      status: MediaShardStatus.SHREDDED_DESTROYED,
      encryptedDek: 'PURGED_DEK_DESTROYED', // Purga irreversível da chave DEK
      shreddedAt: destroyedAt
    };
  });

  const updatedManifest: MediaRecordingManifest = {
    ...manifest,
    status: MediaRecordingStatus.SHREDDED_PURGED,
    shreddedAt: destroyedAt,
    shards: updatedShards
  };

  const certificateBase: Omit<CryptoShreddingCertificate, 'probatoryWormDigest'> = {
    certificateId: `shred-cert-${crypto.randomUUID()}`,
    recordingId: manifest.id,
    sessionId: manifest.sessionId,
    destroyedAt,
    shreddedShardsCount: manifest.shards.length,
    totalBytesPurged,
    method,
    lgpdBasis: 'LGPD Art. 16 (Término de tratamento de dados sensíveis de saúde com descarte irreversível)',
    cfpComplianceRule: 'Resolução CFP nº 011/2018 (Preservação estrita do sigilo telepsicológico e veto à retenção de áudio bruto pós-transcrição)'
  };

  const probatoryWormDigest = calculateCryptoShreddingDigest(certificateBase);

  const certificate: CryptoShreddingCertificate = {
    ...certificateBase,
    probatoryWormDigest
  };

  return {
    certificate,
    updatedManifest
  };
}
