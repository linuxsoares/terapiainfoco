import { describe, it, expect } from 'bun:test';
import { app } from '../src/index';
import {
  ReplayDefenseMode,
  ReplayThreatSeverity,
  ReplayTargetProtocol
} from '@terapiainfoco/shared';

describe('Anti-Replay & Nonce-Reuse Shield API Integration (/api/anti-replay)', () => {
  it('GET /api/anti-replay/overview - deve retornar visão consolidada com métricas, janelas e filtro de Bloom', async () => {
    const res = await app.request('/api/anti-replay/overview', {
      method: 'GET'
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.overview).toBeDefined();
    expect(body.overview.metrics).toBeDefined();
    expect(body.overview.metrics.totalVerificationsCount).toBeGreaterThanOrEqual(5);
    expect(body.overview.metrics.systemHealth).toBe('PROTECTED');
    expect(body.overview.bloomMetrics).toBeDefined();
    expect(body.overview.activeWindows.length).toBeGreaterThanOrEqual(1);
    expect(body.overview.recentIncidents.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/anti-replay/verify-nonce - deve validar payload obrigatório', async () => {
    const res = await app.request('/api/anti-replay/verify-nonce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain('O protocolo alvo e o nonce/sequência são obrigatórios');
  });

  it('POST /api/anti-replay/verify-nonce - deve aceitar pacote WebRTC sequencial válido com selo WORM', async () => {
    const res = await app.request('/api/anti-replay/verify-nonce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetProtocol: ReplayTargetProtocol.WEBRTC_DTLS_SRTP,
        nonceOrSeq: '10',
        channelId: 'room_integration_test_channel'
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.result.allowed).toBe(true);
    expect(body.result.severity).toBe(ReplayThreatSeverity.BENIGN_IN_ORDER);
    expect(body.result.proofSeal).toBeDefined();
    expect(body.result.proofSeal.sealToken).toContain('anti_replay_proof_v1_');
  });

  it('POST /api/anti-replay/verify-nonce - deve bloquear replay quando o mesmo número de sequência for reenviado', async () => {
    const channelId = 'room_replay_attack_channel';

    // 1. Envia pacote 25
    await app.request('/api/anti-replay/verify-nonce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetProtocol: ReplayTargetProtocol.WEBRTC_DTLS_SRTP,
        nonceOrSeq: '25',
        channelId
      })
    });

    // 2. Reenvia pacote 25 (Ataque de Replay)
    const replayRes = await app.request('/api/anti-replay/verify-nonce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetProtocol: ReplayTargetProtocol.WEBRTC_DTLS_SRTP,
        nonceOrSeq: '25',
        channelId
      })
    });

    expect(replayRes.status).toBe(200);
    const replayBody = await replayRes.json();
    expect(replayBody.success).toBe(true);
    expect(replayBody.result.allowed).toBe(false);
    expect(replayBody.result.severity).toBe(ReplayThreatSeverity.DUPLICATE_REPLAY_DETECTED);
    expect(replayBody.result.reason).toContain('Ataque de Replay detectado');
  });

  it('POST /api/anti-replay/verify-nonce - deve detectar e bloquear reutilização de IV AES-GCM (CRITICAL_NONCE_REUSE)', async () => {
    const keyId = 'master_kek_integration_test';
    const ivHex = '00112233445566778899aabb';

    // 1. Primeiro uso do IV: aceito
    const firstRes = await app.request('/api/anti-replay/verify-nonce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetProtocol: ReplayTargetProtocol.AES_GCM_ENVELOPE_IV,
        nonceOrSeq: ivHex,
        keyId
      })
    });
    const firstBody = await firstRes.json();
    expect(firstBody.result.allowed).toBe(true);

    // 2. Segundo uso do mesmo IV para a mesma chave: Violação de integridade GHASH!
    const secondRes = await app.request('/api/anti-replay/verify-nonce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetProtocol: ReplayTargetProtocol.AES_GCM_ENVELOPE_IV,
        nonceOrSeq: ivHex,
        keyId
      })
    });
    const secondBody = await secondRes.json();
    expect(secondBody.result.allowed).toBe(false);
    expect(secondBody.result.severity).toBe(ReplayThreatSeverity.CRITICAL_NONCE_REUSE);
    expect(secondBody.result.reason).toContain('VIOLAÇÃO CRÍTICA NIST SP 800-38D');
  });

  it('POST /api/anti-replay/sliding-window-status - deve retornar estado e bitmap da janela do canal', async () => {
    const res = await app.request('/api/anti-replay/sliding-window-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId: 'room_telemedicina_crp06_1'
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.window).toBeDefined();
    expect(body.window.channelId).toBe('room_telemedicina_crp06_1');
    expect(body.window.windowSize).toBe(64);
    expect(body.window.bitmapHex).toBeDefined();
  });

  it('POST /api/anti-replay/rotate-bloom-filter - deve rotacionar geração do filtro de Bloom', async () => {
    const res = await app.request('/api/anti-replay/rotate-bloom-filter', {
      method: 'POST'
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.activeGeneration).toBeGreaterThanOrEqual(2);
    expect(body.message).toContain('Filtro de Bloom rotacionado');
  });

  it('POST /api/anti-replay/update-policy - deve atualizar o modo operacional de mitigação', async () => {
    const res = await app.request('/api/anti-replay/update-policy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: ReplayDefenseMode.STRICT_SLIDING_WINDOW
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.mode).toBe(ReplayDefenseMode.STRICT_SLIDING_WINDOW);
  });

  it('POST /api/anti-replay/simulate-replay-attack - deve simular bloqueio de replay WebRTC com precisão', async () => {
    const res = await app.request('/api/anti-replay/simulate-replay-attack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetProtocol: ReplayTargetProtocol.WEBRTC_DTLS_SRTP,
        sequenceNumber: 88,
        attemptReplay: true
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.replayDetected).toBe(true);
    expect(body.severity).toBe(ReplayThreatSeverity.DUPLICATE_REPLAY_DETECTED);
    expect(body.message).toContain('ATAQUE DE REPLAY BLOQUEADO');
  });

  it('POST /api/anti-replay/verify-seal - deve verificar a integridade WORM do selo anti-replay', async () => {
    // 1. Gera uma verificação para obter um selo válido
    const verifRes = await app.request('/api/anti-replay/verify-nonce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetProtocol: ReplayTargetProtocol.DPOP_HTTP_TOKEN,
        nonceOrSeq: 'unique_dpop_nonce_test_seal_123'
      })
    });
    const verifBody = await verifRes.json();
    const seal = verifBody.result.proofSeal;

    // 2. Valida o selo gerado
    const checkRes = await app.request('/api/anti-replay/verify-seal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sealToken: seal.sealToken })
    });

    expect(checkRes.status).toBe(200);
    const checkBody = await checkRes.json();
    expect(checkBody.success).toBe(true);
    expect(checkBody.valid).toBe(true);
    expect(checkBody.seal).toBeDefined();

    // 3. Testa selo adulterado
    const invalidRes = await app.request('/api/anti-replay/verify-seal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sealToken: 'anti_replay_proof_v1_token_adulterado_falso' })
    });

    expect(invalidRes.status).toBe(200);
    const invalidBody = await invalidRes.json();
    expect(invalidBody.success).toBe(false);
    expect(invalidBody.valid).toBe(false);
  });
});
