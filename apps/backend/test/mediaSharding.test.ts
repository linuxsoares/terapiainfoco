import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { MediaShardingService } from '../src/services/mediaShardingService';
import {
  AuditAction,
  AuditResourceType,
  MediaShardStatus,
  MediaRecordingStatus,
  AudioCodecType
} from '@terapiainfoco/shared';

describe('Media Recording Sharding & Scheduled Crypto-Shredding Engine (RFC-001 §3.2, §3.3, §4.2 e CFP 011/2018)', () => {
  let therapistToken: string;
  let adminToken: string;
  let secretaryToken: string;

  beforeEach(async () => {
    db.clear();
    globalRateLimitStore.reset();
    MediaShardingService.getInstance().resetForTesting();

    const loginTherapist = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'psicologo@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const therapistData = await loginTherapist.json();
    therapistToken = therapistData.accessToken;

    const loginAdmin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const adminData = await loginAdmin.json();
    adminToken = adminData.accessToken;

    const loginSecretary = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'recepcao@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const secretaryData = await loginSecretary.json();
    secretaryToken = secretaryData.accessToken;
  });

  it('deve rejeitar acesso anônimo sem cabeçalho Authorization com HTTP 401 Unauthorized', async () => {
    const res = await app.request('/api/teleconsultation/media/recordings', {
      method: 'GET'
    });
    expect(res.status).toBe(401);
  });

  it('deve bloquear perfil de recepção/secretária com HTTP 403 Forbidden por RBAC', async () => {
    const res = await app.request('/api/teleconsultation/media/recordings', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretaryToken}`
      }
    });
    expect(res.status).toBe(403);
  });

  it('deve inicializar nova gravação com sharding em repouso com sucesso', async () => {
    const res = await app.request('/api/teleconsultation/media/recordings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        sessionId: 'sess-telepsico-101',
        patientId: 'pat-404',
        codec: AudioCodecType.OPUS_FULLBAND,
        estimatedDurationSeconds: 50
      })
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.recording.status).toBe(MediaRecordingStatus.RECORDING);
    expect(data.recording.sessionId).toBe('sess-telepsico-101');
    expect(data.recording.totalShards).toBe(0);
  });

  it('deve fazer upload de múltiplos chunks e cifrar cada um com DEK efêmera exclusiva', async () => {
    // 1. Cria gravação
    const initRes = await app.request('/api/teleconsultation/media/recordings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        sessionId: 'sess-telepsico-chunks',
        patientId: 'pat-505'
      })
    });
    const initData = await initRes.json();
    const recordingId = initData.recording.id;

    // 2. Envia Chunk 0
    const chunk0 = Buffer.from('Fala do terapeuta: Como você passou a semana?').toString('base64');
    const resChunk0 = await app.request(`/api/teleconsultation/media/recordings/${recordingId}/chunks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        chunkIndex: 0,
        audioDataBase64: chunk0
      })
    });
    expect(resChunk0.status).toBe(201);
    const data0 = await resChunk0.json();
    expect(data0.shard.shardIndex).toBe(0);
    expect(data0.shard.status).toBe(MediaShardStatus.ACTIVE_ENCRYPTED);
    expect(data0.shard.sha256Hash).toBeDefined();

    // 3. Envia Chunk 1
    const chunk1 = Buffer.from('Fala do paciente: Tive alguns episódios de ansiedade no trabalho.').toString('base64');
    const resChunk1 = await app.request(`/api/teleconsultation/media/recordings/${recordingId}/chunks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        chunkIndex: 1,
        audioDataBase64: chunk1
      })
    });
    expect(resChunk1.status).toBe(201);

    // 4. Finaliza a gravação e calcula Merkle Root
    const finalizeRes = await app.request(`/api/teleconsultation/media/recordings/${recordingId}/finalize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${therapistToken}`
      }
    });
    expect(finalizeRes.status).toBe(200);
    const finalizeData = await finalizeRes.json();
    expect(finalizeData.recording.status).toBe(MediaRecordingStatus.SHARDED_ENCRYPTED);
    expect(finalizeData.recording.merkleRoot).toBeDefined();
    expect(finalizeData.recording.totalShards).toBe(2);
    expect(finalizeData.recording.wormAuditId).toBeDefined();
  });

  it('deve simular o pipeline de transcrição com decifragem em RAM e auto-shredding emitindo certificado WORM', async () => {
    // 1. Cria e popula gravação
    const initRes = await app.request('/api/teleconsultation/media/recordings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        sessionId: 'sess-pipeline-test',
        patientId: 'pat-606'
      })
    });
    const { recording } = await initRes.json();

    const chunkData = Buffer.from('Áudio de teleconsulta para transcrição assistida por IA').toString('base64');
    await app.request(`/api/teleconsultation/media/recordings/${recording.id}/chunks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({ chunkIndex: 0, audioDataBase64: chunkData })
    });

    await app.request(`/api/teleconsultation/media/recordings/${recording.id}/finalize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${therapistToken}` }
    });

    // 2. Simula transcrição e auto-shredding
    const pipelineRes = await app.request(`/api/teleconsultation/media/recordings/${recording.id}/simulate-pipeline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({ autoShred: true })
    });

    expect(pipelineRes.status).toBe(200);
    const pipelineData = await pipelineRes.json();
    expect(pipelineData.success).toBe(true);
    expect(pipelineData.recording.status).toBe(MediaRecordingStatus.SHREDDED_PURGED);
    expect(pipelineData.certificate).toBeDefined();
    expect(pipelineData.certificate.probatoryWormDigest).toBeDefined();
    expect(pipelineData.certificate.shreddedShardsCount).toBe(1);

    // 3. Tenta obter o certificado pelo endpoint específico
    const certRes = await app.request(`/api/teleconsultation/media/recordings/${recording.id}/certificate`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${therapistToken}` }
    });
    expect(certRes.status).toBe(200);
    const certData = await certRes.json();
    expect(certData.certificate.certificateId).toBe(pipelineData.certificate.certificateId);
  });

  it('deve executar Crypto-Shredding sob demanda e atualizar métricas de armazenamento', async () => {
    // 1. Cria gravação com 2 shards
    const initRes = await app.request('/api/teleconsultation/media/recordings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ sessionId: 'sess-manual-shred' })
    });
    const { recording } = await initRes.json();

    const chunkData = Buffer.from('Bloco de áudio para teste de expurgamento manual imediato').toString('base64');
    await app.request(`/api/teleconsultation/media/recordings/${recording.id}/chunks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ chunkIndex: 0, audioDataBase64: chunkData })
    });

    await app.request(`/api/teleconsultation/media/recordings/${recording.id}/finalize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    // 2. Aciona Crypto-Shredding manual
    const shredRes = await app.request(`/api/teleconsultation/media/recordings/${recording.id}/shred`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ reason: 'Expurgamento imediato solicitado pelo paciente via LGPD Art. 16' })
    });

    expect(shredRes.status).toBe(200);
    const shredData = await shredRes.json();
    expect(shredData.success).toBe(true);
    expect(shredData.certificate.probatoryWormDigest).toBeDefined();
    expect(shredData.certificate.totalBytesPurged).toBeGreaterThan(0);

    // 3. Consulta métricas agregadas
    const metricsRes = await app.request('/api/teleconsultation/media/metrics', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(metricsRes.status).toBe(200);
    const metricsData = await metricsRes.json();
    expect(metricsData.metrics.totalRecordings).toBe(1);
    expect(metricsData.metrics.shreddedRecordingsCount).toBe(1);
    expect(metricsData.metrics.activeEncryptedRecordings).toBe(0);
    expect(metricsData.metrics.shreddedShardsCount).toBe(1);
    expect(metricsData.metrics.totalBytesPurged).toBeGreaterThan(0);
  });
});
