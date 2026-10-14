import crypto from 'crypto';
import {
  AuditAction,
  AuditResourceType,
  MediaShardStatus,
  MediaRecordingStatus,
  CryptoShreddingMethod,
  AudioCodecType,
  type MediaShardMetadata,
  type EncryptedMediaShard,
  type MediaRecordingManifest,
  type CryptoShreddingCertificate,
  type MediaStorageMetrics,
  type CreateMediaSessionDTO,
  type UploadMediaChunkDTO
} from '@terapiainfoco/shared';
import {
  calculateMerkleRoot,
  encryptMediaShard,
  reassembleAndVerifyMedia,
  executeCryptoShredding
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class MediaShardingService {
  private static instance: MediaShardingService;

  private recordings = new Map<string, MediaRecordingManifest>();
  private shardsByRecording = new Map<string, EncryptedMediaShard[]>();
  private shardStorage = new Map<string, Buffer>();
  private certificates = new Map<string, CryptoShreddingCertificate>();

  // Métricas agregadas
  private totalRecordingsCount = 0;
  private totalShardsCreatedCount = 0;
  private shreddedRecordingsCount = 0;
  private shreddedShardsCount = 0;
  private totalBytesPurgedCount = 0;
  private lastShreddedAt?: string;

  public static getInstance(): MediaShardingService {
    if (!MediaShardingService.instance) {
      MediaShardingService.instance = new MediaShardingService();
    }
    return MediaShardingService.instance;
  }

  /**
   * Inicializa uma nova gravação com sharding em repouso
   */
  public createRecording(params: {
    therapistId: string;
    dto: CreateMediaSessionDTO;
  }): MediaRecordingManifest {
    const recordingId = `rec-${crypto.randomUUID()}`;
    const manifest: MediaRecordingManifest = {
      id: recordingId,
      sessionId: params.dto.sessionId,
      patientId: params.dto.patientId,
      therapistId: params.therapistId,
      totalShards: 0,
      totalBytes: 0,
      durationSeconds: params.dto.estimatedDurationSeconds || 50,
      codec: params.dto.codec || AudioCodecType.OPUS_FULLBAND,
      merkleRoot: '',
      status: MediaRecordingStatus.RECORDING,
      createdAt: new Date().toISOString(),
      shards: []
    };

    this.recordings.set(recordingId, manifest);
    this.shardsByRecording.set(recordingId, []);
    this.totalRecordingsCount++;

    return manifest;
  }

  /**
   * Recebe um chunk de áudio, cifra com DEK efêmera exclusiva e armazena o shard
   */
  public addChunk(params: {
    recordingId: string;
    dto: UploadMediaChunkDTO;
  }): EncryptedMediaShard {
    const manifest = this.recordings.get(params.recordingId);
    if (!manifest) {
      throw new Error(`Gravação ${params.recordingId} não encontrada.`);
    }

    if (manifest.status !== MediaRecordingStatus.RECORDING) {
      throw new Error(`Não é possível adicionar chunks a uma gravação com status ${manifest.status}.`);
    }

    const audioBuffer = Buffer.from(params.dto.audioDataBase64, 'base64');
    const encryptedShard = encryptMediaShard(audioBuffer, params.dto.chunkIndex);

    // Armazena no storage de shards cifrados
    const existingShards = this.shardsByRecording.get(params.recordingId) || [];
    existingShards.push(encryptedShard);
    this.shardsByRecording.set(params.recordingId, existingShards);

    // Armazena o buffer de ciphertext em repouso
    this.shardStorage.set(
      encryptedShard.metadata.shardId,
      Buffer.from(encryptedShard.ciphertextBase64, 'base64')
    );

    // Atualiza metadados do manifesto
    manifest.shards.push(encryptedShard.metadata);
    manifest.totalShards = manifest.shards.length;
    manifest.totalBytes += audioBuffer.length;
    this.totalShardsCreatedCount++;

    return encryptedShard;
  }

  /**
   * Finaliza a gravação, calcula a Merkle Root e sela no ledger WORM
   */
  public async finalizeRecording(
    recordingId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<MediaRecordingManifest> {
    const manifest = this.recordings.get(recordingId);
    if (!manifest) {
      throw new Error(`Gravação ${recordingId} não encontrada.`);
    }

    const hashes = manifest.shards.map(s => s.sha256Hash);
    const merkleRoot = calculateMerkleRoot(hashes);

    manifest.merkleRoot = merkleRoot;
    manifest.status = MediaRecordingStatus.SHARDED_ENCRYPTED;
    manifest.finalizedAt = new Date().toISOString();

    // Selagem compulsória na trilha de auditoria WORM
    const wormRecord = AuditService.log({
      action: AuditAction.MEDIA_RECORDING_SHARDED,
      resourceType: AuditResourceType.MEDIA_RECORDING,
      resourceId: manifest.id,
      actorId: manifest.therapistId,
      ipAddress: ipAddress || '127.0.0.1',
      userAgent
    });

    manifest.wormAuditId = wormRecord.id;

    return manifest;
  }

  /**
   * Simula o pipeline de transcrição:
   * 1. Decifra os shards temporariamente em RAM (com validação Merkle)
   * 2. Registra evento de auditoria WORM de leitura para transcrição
   * 3. Se autoShred for true, expurga imediatamente o áudio bruto e emite certificado forense
   */
  public async simulateTranscriptionPipeline(
    recordingId: string,
    autoShred: boolean = true,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ recording: MediaRecordingManifest; certificate?: CryptoShreddingCertificate }> {
    const manifest = this.recordings.get(recordingId);
    if (!manifest) {
      throw new Error(`Gravação ${recordingId} não encontrada.`);
    }

    if (manifest.status === MediaRecordingStatus.SHREDDED_PURGED) {
      throw new Error(`Gravação ${recordingId} já foi expurgada via Crypto-Shredding.`);
    }

    const shards = this.shardsByRecording.get(recordingId) || [];
    manifest.status = MediaRecordingStatus.PROCESSING_TRANSCRIPTION;

    // 1. Reconstitui temporariamente apenas na memória RAM (Whisper/Speech-to-Text)
    const reassembledAudio = reassembleAndVerifyMedia(shards, manifest.merkleRoot);

    // 2. Registra auditoria WORM de decifragem transitória
    AuditService.log({
      action: AuditAction.MEDIA_DECRYPTED_FOR_TRANSCRIPTION,
      resourceType: AuditResourceType.MEDIA_RECORDING,
      resourceId: manifest.id,
      actorId: manifest.therapistId,
      ipAddress: ipAddress || '127.0.0.1',
      userAgent
    });

    // Sobrescreve o áudio remontado na memória RAM após a extração textual simulada
    reassembledAudio.fill(0);

    // 3. Se solicitado expurgamento automático pós-transcrição (CFP 011/2018)
    let certificate: CryptoShreddingCertificate | undefined;
    if (autoShred) {
      certificate = await this.executeCryptoShredding(
        recordingId,
        CryptoShreddingMethod.ZERO_FILL_AND_KEY_DESTROY,
        ipAddress,
        userAgent
      );
    }

    return {
      recording: this.recordings.get(recordingId) || manifest,
      certificate
    };
  }

  /**
   * Executa o Crypto-Shredding compulsório e emite o Laudo Forense com registro WORM
   */
  public async executeCryptoShredding(
    recordingId: string,
    method: CryptoShreddingMethod = CryptoShreddingMethod.ZERO_FILL_AND_KEY_DESTROY,
    ipAddress?: string,
    userAgent?: string
  ): Promise<CryptoShreddingCertificate> {
    const manifest = this.recordings.get(recordingId);
    if (!manifest) {
      throw new Error(`Gravação ${recordingId} não encontrada.`);
    }

    if (manifest.status === MediaRecordingStatus.SHREDDED_PURGED) {
      const existingCert = this.certificates.get(recordingId);
      if (existingCert) return existingCert;
    }

    const { certificate, updatedManifest } = executeCryptoShredding(
      manifest,
      this.shardStorage,
      method
    );

    // Atualiza instâncias em memória
    this.recordings.set(recordingId, updatedManifest);
    this.certificates.set(recordingId, certificate);

    // Atualiza métricas agregadas
    this.shreddedRecordingsCount++;
    this.shreddedShardsCount += certificate.shreddedShardsCount;
    this.totalBytesPurgedCount += certificate.totalBytesPurged;
    this.lastShreddedAt = certificate.destroyedAt;

    // Selagem compulsória no ledger imutável WORM
    AuditService.log({
      action: AuditAction.MEDIA_CRYPTO_SHREDDED,
      resourceType: AuditResourceType.MEDIA_RECORDING,
      resourceId: manifest.id,
      actorId: manifest.therapistId,
      ipAddress: ipAddress || '127.0.0.1',
      userAgent
    });

    return certificate;
  }

  public getRecording(id: string): MediaRecordingManifest | null {
    return this.recordings.get(id) || null;
  }

  public listRecordings(): MediaRecordingManifest[] {
    return Array.from(this.recordings.values()).reverse();
  }

  public getCertificate(recordingId: string): CryptoShreddingCertificate | null {
    return this.certificates.get(recordingId) || null;
  }

  public getMetrics(): MediaStorageMetrics {
    const activeEncryptedRecordings = Array.from(this.recordings.values()).filter(
      r => r.status === MediaRecordingStatus.SHARDED_ENCRYPTED || r.status === MediaRecordingStatus.RECORDING
    ).length;

    const activeShardsInStorage = this.shardStorage.size;

    return {
      totalRecordings: this.totalRecordingsCount,
      activeEncryptedRecordings,
      shreddedRecordingsCount: this.shreddedRecordingsCount,
      totalShardsCreated: this.totalShardsCreatedCount,
      activeShardsInStorage,
      shreddedShardsCount: this.shreddedShardsCount,
      totalBytesPurged: this.totalBytesPurgedCount,
      lastShreddedAt: this.lastShreddedAt
    };
  }

  /**
   * Helper para limpar estado durante testes
   */
  public resetForTesting(): void {
    this.recordings.clear();
    this.shardsByRecording.clear();
    this.shardStorage.clear();
    this.certificates.clear();
    this.totalRecordingsCount = 0;
    this.totalShardsCreatedCount = 0;
    this.shreddedRecordingsCount = 0;
    this.shreddedShardsCount = 0;
    this.totalBytesPurgedCount = 0;
    this.lastShreddedAt = undefined;
  }
}
