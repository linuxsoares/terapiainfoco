import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import {
  ClinicalWebSocketChannelType,
  WebSocketFrameOpcode,
  WebSocketRiskSeverity,
  WebSocketThreatCategory,
  WebSocketValidationAction
} from '@terapiainfoco/shared';
import { adminRequest } from './helpers/adminRequest';
import { resetDb } from './helpers/db';

describe('Proteção contra Injeção de Objetos e Desserialização Não Segura em WebSocket (RFC 6455 & CWE-502)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('1. GET /api/websocket-guard/overview deve retornar métricas, política ativa, incidentes e canais homologados', async () => {
    const res = await adminRequest('/api/websocket-guard/overview');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.overview.metrics.totalFramesInspected).toBeGreaterThan(0);
    expect(body.overview.channelSchemas).toHaveLength(5);
    expect(body.overview.adversarialSamples.length).toBeGreaterThanOrEqual(6);
  });

  it('2. POST /api/websocket-guard/inspect deve permitir frame clínico legítimo de sinalização WebRTC', async () => {
    const res = await adminRequest('/api/websocket-guard/inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: ClinicalWebSocketChannelType.WEBRTC_SIGNALING,
        opcode: WebSocketFrameOpcode.TEXT,
        rawFramePayload: JSON.stringify({
          event: 'WEBRTC_SDP_OFFER',
          roomId: 'room-01',
          sdp: 'v=0\r\no=- 4611731400430051336 2 IN IP4 127.0.0.1'
        })
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.result.isValid).toBe(true);
    expect(body.result.severity).toBe(WebSocketRiskSeverity.CLEAN);
    expect(body.result.action).toBe(WebSocketValidationAction.ALLOW_FRAME);
    expect(body.seal.sealId.startsWith('ws_guard_seal_')).toBe(true);
  });

  it('3. POST /api/websocket-guard/inspect deve bloquear gadget de desserialização CWE-502 e emitir incidente WORM', async () => {
    const res = await adminRequest('/api/websocket-guard/inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: ClinicalWebSocketChannelType.LIVE_TRANSCRIPTION_STREAM,
        opcode: WebSocketFrameOpcode.TEXT,
        rawFramePayload: JSON.stringify({
          event: 'UTTERANCE_FINAL',
          $type: 'System.Windows.Data.ObjectDataProvider, PresentationFramework',
          cmd: '_$$ND_FUNC$$_function(){process.exit(1)}()'
        })
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.result.isValid).toBe(false);
    expect(body.result.severity).toBe(WebSocketRiskSeverity.CRITICAL);
    expect(body.result.action).toBe(WebSocketValidationAction.TERMINATE_CONNECTION_1008);
    expect(body.incident).toBeDefined();
  });

  it('4. POST /api/websocket-guard/simulate deve executar simulação adversarial e neutralizar o ataque', async () => {
    const res = await adminRequest('/api/websocket-guard/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attackCategory: WebSocketThreatCategory.PROTOTYPE_POLLUTION_INJECTION
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.result.isValid).toBe(false);
    expect(body.incident).toBeDefined();
  });

  it('5. POST /api/websocket-guard/policy e /verify-seal devem atualizar política e validar selo notarial RFC 8785', async () => {
    const polRes = await adminRequest('/api/websocket-guard/policy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        policy: { maxJsonNestingDepth: 6 }
      })
    });
    expect(polRes.status).toBe(200);
    const polBody = await polRes.json();
    expect(polBody.policy.maxJsonNestingDepth).toBe(6);

    const inspectRes = await adminRequest('/api/websocket-guard/inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: ClinicalWebSocketChannelType.TELEMETRY_HEARTBEAT,
        opcode: WebSocketFrameOpcode.TEXT,
        rawFramePayload: JSON.stringify({ event: 'SESSION_HEARTBEAT', rttMs: 22 })
      })
    });
    const { seal } = await inspectRes.json();

    const verifyRes = await adminRequest('/api/websocket-guard/verify-seal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sealId: seal.sealId, seal })
    });
    expect(verifyRes.status).toBe(200);
    const verifyBody = await verifyRes.json();
    expect(verifyBody.isValid).toBe(true);
  });
});
