import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import { MediaShardingService } from '../services/mediaShardingService';
import type {
  CreateMediaSessionDTO,
  UploadMediaChunkDTO,
  ExecuteCryptoShreddingDTO,
  MediaRecordingResponse,
  MediaSessionListResponse,
  CryptoShreddingResponse,
  SimulateMediaPipelineResponse
} from '@terapiainfoco/shared';

export const mediaShardingRoute = new Hono();

// Autenticação obrigatória estrita
mediaShardingRoute.use('*', authMiddleware({ strict: true }));
const requireStaff = requireRoles([UserRole.PSICOLOGO_TITULAR, UserRole.ADMIN]);

const service = MediaShardingService.getInstance();

/**
 * 1. Inicializar nova gravação com sharding em repouso
 */
mediaShardingRoute.post('/recordings', requireStaff, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<CreateMediaSessionDTO>().catch(() => ({} as any));

  if (!body.sessionId) {
    return c.json({ success: false, message: 'O identificador sessionId é obrigatório.' }, 400);
  }

  const recording = service.createRecording({
    therapistId: user?.id || '00000000-0000-0000-0000-000000000001',
    dto: body
  });

  const response: MediaRecordingResponse = {
    success: true,
    recording,
    message: `Gravação ${recording.id} inicializada com particionamento criptográfico em repouso.`
  };

  return c.json(response, 201);
});

/**
 * 2. Upload e cifragem de chunk individual com DEK efêmera
 */
mediaShardingRoute.post('/recordings/:id/chunks', requireStaff, async (c) => {
  const recordingId = c.req.param('id');
  const body = await c.req.json<UploadMediaChunkDTO>().catch(() => ({} as any));

  if (body.chunkIndex === undefined || !body.audioDataBase64) {
    return c.json({ success: false, message: 'chunkIndex e audioDataBase64 são obrigatórios.' }, 400);
  }

  try {
    const encryptedShard = service.addChunk({
      recordingId,
      dto: body
    });

    return c.json({
      success: true,
      shard: encryptedShard.metadata,
      message: `Shard ${encryptedShard.metadata.shardIndex} cifrado com DEK efêmera exclusiva e salvo.`
    }, 201);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

/**
 * 3. Finalizar gravação, calcular Merkle Root e selar no WORM
 */
mediaShardingRoute.post('/recordings/:id/finalize', requireStaff, async (c) => {
  const recordingId = c.req.param('id');
  const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent') || 'Unknown';

  try {
    const recording = await service.finalizeRecording(recordingId, ipAddress, userAgent);
    const response: MediaRecordingResponse = {
      success: true,
      recording,
      message: `Gravação finalizada e protegida! Merkle Root: ${recording.merkleRoot.slice(0, 16)}... Selada no WORM.`
    };
    return c.json(response, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

/**
 * 4. Simular pipeline de transcrição (decifragem em RAM) e expurgamento programado
 */
mediaShardingRoute.post('/recordings/:id/simulate-pipeline', requireStaff, async (c) => {
  const recordingId = c.req.param('id');
  const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent') || 'Unknown';
  const body = await c.req.json<{ autoShred?: boolean }>().catch(() => ({ autoShred: true }));

  try {
    const result = await service.simulateTranscriptionPipeline(
      recordingId,
      body.autoShred !== false,
      ipAddress,
      userAgent
    );

    const response: SimulateMediaPipelineResponse = {
      success: true,
      recording: result.recording,
      certificate: result.certificate,
      message: result.certificate
        ? 'Pipeline de transcrição concluído com sucesso e áudio bruto expurgado via Crypto-Shredding (CFP 011/2018).'
        : 'Transcrição concluída. Shards preservados em repouso.'
    };

    return c.json(response, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

/**
 * 5. Executar Crypto-Shredding imediato sob demanda
 */
mediaShardingRoute.post('/recordings/:id/shred', requireStaff, async (c) => {
  const recordingId = c.req.param('id');
  const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent') || 'Unknown';
  const body = await c.req.json<ExecuteCryptoShreddingDTO>().catch(() => ({} as any));

  try {
    const certificate = await service.executeCryptoShredding(
      recordingId,
      body.method,
      ipAddress,
      userAgent
    );

    const response: CryptoShreddingResponse = {
      success: true,
      certificate,
      message: `Crypto-Shredding executado com sucesso! ${certificate.totalBytesPurged} bytes e ${certificate.shreddedShardsCount} shards destruídos irreversivelmente.`
    };

    return c.json(response, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

/**
 * 6. Listar gravações com sharding e métricas de armazenamento
 */
mediaShardingRoute.get('/recordings', requireStaff, (c) => {
  const recordings = service.listRecordings();
  const metrics = service.getMetrics();

  const response: MediaSessionListResponse = {
    success: true,
    recordings,
    metrics
  };

  return c.json(response, 200);
});

/**
 * 7. Obter detalhes de gravação por ID
 */
mediaShardingRoute.get('/recordings/:id', requireStaff, (c) => {
  const recordingId = c.req.param('id');
  const recording = service.getRecording(recordingId);

  if (!recording) {
    return c.json({ success: false, message: 'Gravação não encontrada.' }, 404);
  }

  return c.json({ success: true, recording }, 200);
});

/**
 * 8. Obter Certificado Forense de Crypto-Shredding
 */
mediaShardingRoute.get('/recordings/:id/certificate', requireStaff, (c) => {
  const recordingId = c.req.param('id');
  const certificate = service.getCertificate(recordingId);

  if (!certificate) {
    return c.json({ success: false, message: 'Certificado de destruição não disponível ou gravação ainda não expurgada.' }, 404);
  }

  return c.json({ success: true, certificate }, 200);
});

/**
 * 9. Métricas agregadas de armazenamento e destruição de mídia
 */
mediaShardingRoute.get('/metrics', requireStaff, (c) => {
  const metrics = service.getMetrics();
  return c.json({ success: true, metrics }, 200);
});
