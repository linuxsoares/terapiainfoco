import { describe, it, expect } from 'bun:test';
import { app } from '../src/index';
import {
  WatermarkPatternType,
  WatermarkExtractionConfidence,
  VisualWatermarkTarget,
  WatermarkEmbeddingStrength
} from '@terapiainfoco/shared';

describe('Visual Watermark & Screen Exfiltration Tracer API Integration (/api/visual-watermark)', () => {
  let createdSeedId: string;
  let testSealToken: string;

  it('GET /api/visual-watermark/overview - deve retornar visão consolidada com métricas, sementes e incidentes', async () => {
    const res = await app.request('/api/visual-watermark/overview', {
      method: 'GET'
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.overview).toBeDefined();
    expect(body.overview.metrics).toBeDefined();
    expect(body.overview.metrics.activeWatermarkedSessionsCount).toBeGreaterThanOrEqual(1);
    expect(body.overview.metrics.systemHealth).toBe('IMMUNE');
    expect(body.overview.activeSeeds.length).toBeGreaterThanOrEqual(1);
    expect(body.overview.recentIncidents.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/visual-watermark/create-seed - deve validar parâmetros obrigatórios', async () => {
    const res = await app.request('/api/visual-watermark/create-seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain('CRP do profissional e identificador do paciente são obrigatórios');
  });

  it('POST /api/visual-watermark/create-seed - deve criar nova semente de marca d\'água com sucesso', async () => {
    const res = await app.request('/api/visual-watermark/create-seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        therapistCrp: '06/998877',
        patientId: 'patient_integration_uuid_555',
        sessionId: 'room_webrtc_integration_test_session',
        target: VisualWatermarkTarget.WEBRTC_VIDEO_STREAM,
        patternType: WatermarkPatternType.QUASI_ORTHOGONAL_PN,
        strength: WatermarkEmbeddingStrength.BALANCED_RESILIENT
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.seed).toBeDefined();
    expect(body.seed.seedId).toStartWith('wm_seed_');
    expect(body.seed.therapistCrp).toBe('06/998877');
    expect(body.seed.sessionId).toBe('room_webrtc_integration_test_session');

    createdSeedId = body.seed.seedId;
  });

  it('POST /api/visual-watermark/embed - deve validar payload obrigatório', async () => {
    const res = await app.request('/api/visual-watermark/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain('Identificador da semente é obrigatório');
  });

  it('POST /api/visual-watermark/embed - deve injetar marca d\'água com métricas de PSNR/SSIM e selo WORM', async () => {
    const res = await app.request('/api/visual-watermark/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seedId: createdSeedId,
        width: 64,
        height: 64
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.result).toBeDefined();
    expect(body.result.psnrDb).toBeGreaterThan(40);
    expect(body.result.ssimScore).toBeGreaterThan(0.98);
    expect(body.result.proofSeal).toBeDefined();
    expect(body.result.proofSeal.sealToken).toStartWith('visual_wm_v1_');

    testSealToken = body.result.proofSeal.sealToken;
  });

  it('POST /api/visual-watermark/extract-leak - deve validar payload obrigatório', async () => {
    const res = await app.request('/api/visual-watermark/extract-leak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain('Dados do frame suspeito são obrigatórios');
  });

  it('POST /api/visual-watermark/extract-leak - deve realizar perícia forense em imagem suspeita', async () => {
    // Cria buffer sintético simulando frame capturado
    const sampleBytes = Buffer.from(new Uint8Array(64 * 64).fill(120)).toString('base64');

    const res = await app.request('/api/visual-watermark/extract-leak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        suspectFrameData: sampleBytes,
        target: VisualWatermarkTarget.WEBRTC_VIDEO_STREAM
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.result).toBeDefined();
    expect(body.result.extractionId).toStartWith('ext_');
    expect(body.result.confidence).toBeDefined();
    expect(body.result.proofSeal).toBeDefined();
  });

  it('POST /api/visual-watermark/simulate-screen-leak - deve simular ataque de recorte com teste de resiliência', async () => {
    const res = await app.request('/api/visual-watermark/simulate-screen-leak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seedId: createdSeedId,
        cropPercentage: 20,
        compressionQuality: 75,
        applyNoise: true
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.simulation).toBeDefined();
    expect(body.simulation.simulatedCrop).toBe(20);
    expect(body.simulation.extractionResult).toBeDefined();
    expect(body.simulation.survivedAnalysis).toBe(true);
  });

  it('POST /api/visual-watermark/update-strength - deve atualizar a intensidade operacional de marcação', async () => {
    const res = await app.request('/api/visual-watermark/update-strength', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strength: WatermarkEmbeddingStrength.AGGRESSIVE_ROBUST
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.activeStrength).toBe(WatermarkEmbeddingStrength.AGGRESSIVE_ROBUST);
  });

  it('POST /api/visual-watermark/verify-seal - deve validar autenticidade WORM de selo probatório visual', async () => {
    const res = await app.request('/api/visual-watermark/verify-seal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sealToken: testSealToken
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.isValid).toBe(true);
    expect(body.message).toContain('autêntico e íntegro');
    expect(body.seal).toBeDefined();
    expect(body.verifiedAt).toBeDefined();
  });
});
