import { describe, it, expect } from 'bun:test';
import {
  ClinicalWebSocketChannelType,
  WebSocketFrameOpcode,
  WebSocketRiskSeverity,
  WebSocketThreatCategory,
  WebSocketValidationAction
} from '@terapiainfoco/shared';
import {
  CLINICAL_WEBSOCKET_CHANNEL_SCHEMAS,
  SAMPLE_WEBSOCKET_ATTACKS,
  WebSocketDeserializationGuardEngine
} from '../src/webSocketDeserializationGuard';

describe('WebSocketDeserializationGuard Engine (RFC 6455, OWASP ASVS V5.5 & CWE-502)', () => {
  it('1. deve aprovar frames WebSocket clínicos legítimos em todos os 5 canais homologados', () => {
    const engine = new WebSocketDeserializationGuardEngine();

    for (const schema of CLINICAL_WEBSOCKET_CHANNEL_SCHEMAS) {
      const res = engine.inspectFrame({
        channel: schema.channel,
        opcode: WebSocketFrameOpcode.TEXT,
        rawFramePayload: schema.sampleSafeFrame
      });

      expect(res.isValid).toBe(true);
      expect(res.severity).toBe(WebSocketRiskSeverity.CLEAN);
      expect(res.action).toBe(WebSocketValidationAction.ALLOW_FRAME);
      expect(res.threats).toHaveLength(0);
      expect(engine.verifySeal(res.seal)).toBe(true);
    }
  });

  it('2. deve detectar e bloquear gadget RCE node-serialize (_$$ND_FUNC$$_) com TERMINATE_CONNECTION_1008', () => {
    const engine = new WebSocketDeserializationGuardEngine();
    const sample = SAMPLE_WEBSOCKET_ATTACKS[0];

    const res = engine.inspectFrame({
      channel: sample.channel,
      opcode: sample.opcode,
      rawFramePayload: sample.rawFramePayload
    });

    expect(res.isValid).toBe(false);
    expect(res.severity).toBe(WebSocketRiskSeverity.CRITICAL);
    expect(res.action).toBe(WebSocketValidationAction.TERMINATE_CONNECTION_1008);
    expect(
      res.threats.some(
        (t) => t.category === WebSocketThreatCategory.INSECURE_DESERIALIZATION_GADGET
      )
    ).toBe(true);
  });

  it('3. deve detectar e bloquear discriminadores polimórficos ($type / @class / JdbcRowSetImpl)', () => {
    const engine = new WebSocketDeserializationGuardEngine();
    const sample = SAMPLE_WEBSOCKET_ATTACKS[1];

    const res = engine.inspectFrame({
      channel: sample.channel,
      opcode: sample.opcode,
      rawFramePayload: sample.rawFramePayload
    });

    expect(res.isValid).toBe(false);
    expect(res.severity).toBe(WebSocketRiskSeverity.CRITICAL);
    expect(res.threats.some((t) => t.cwe === 'CWE-502')).toBe(true);
  });

  it('4. deve detectar e sanitizar/bloquear Prototype Pollution (__proto__ e constructor.prototype) em frames WebSocket', () => {
    const engine = new WebSocketDeserializationGuardEngine();
    const sample = SAMPLE_WEBSOCKET_ATTACKS[2];

    const res = engine.inspectFrame({
      channel: sample.channel,
      opcode: sample.opcode,
      rawFramePayload: sample.rawFramePayload
    });

    expect(res.isValid).toBe(false);
    expect(
      res.threats.some(
        (t) => t.category === WebSocketThreatCategory.PROTOTYPE_POLLUTION_INJECTION
      )
    ).toBe(true);
    expect(res.sanitizedPayload).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(res.sanitizedPayload, '__proto__')).toBe(false);
  });

  it('5. deve bloquear contrabando de frame binário (Opcode 0x2) com stream Java ObjectInputStream (rO0AB)', () => {
    const engine = new WebSocketDeserializationGuardEngine();
    const sample = SAMPLE_WEBSOCKET_ATTACKS[3];

    const res = engine.inspectFrame({
      channel: sample.channel,
      opcode: sample.opcode,
      rawFramePayload: sample.rawFramePayload
    });

    expect(res.isValid).toBe(false);
    expect(
      res.threats.some(
        (t) => t.category === WebSocketThreatCategory.BINARY_OPCODE_SMUGGLING
      )
    ).toBe(true);
    expect(res.action).toBe(WebSocketValidationAction.TERMINATE_CONNECTION_1008);
  });

  it('6. deve bloquear JSON Depth Bomb em WebSocket (Stack Exhaustion)', () => {
    const engine = new WebSocketDeserializationGuardEngine();
    const sample = SAMPLE_WEBSOCKET_ATTACKS[4];

    const res = engine.inspectFrame({
      channel: sample.channel,
      opcode: sample.opcode,
      rawFramePayload: sample.rawFramePayload
    });

    expect(res.isValid).toBe(false);
    expect(
      res.threats.some((t) => t.category === WebSocketThreatCategory.DEEP_NESTING_DOS)
    ).toBe(true);
  });

  it('7. deve bloquear eventos fora do schema homologado do canal clínico', () => {
    const engine = new WebSocketDeserializationGuardEngine();

    const res = engine.inspectFrame({
      channel: ClinicalWebSocketChannelType.WAITING_ROOM_PRESENCE,
      opcode: WebSocketFrameOpcode.TEXT,
      rawFramePayload: JSON.stringify({
        event: 'ADMIN_EXECUTE_RAW_SQL',
        query: 'DROP TABLE patients;'
      })
    });

    expect(res.isValid).toBe(false);
    expect(
      res.threats.some(
        (t) => t.category === WebSocketThreatCategory.UNREGISTERED_CHANNEL_EVENT
      )
    ).toBe(true);
  });

  it('8. deve emitir e verificar selos notariais RFC 8785 e detectar adulterações', () => {
    const engine = new WebSocketDeserializationGuardEngine();
    const res = engine.inspectFrame({
      channel: ClinicalWebSocketChannelType.WEBRTC_SIGNALING,
      opcode: WebSocketFrameOpcode.TEXT,
      rawFramePayload: CLINICAL_WEBSOCKET_CHANNEL_SCHEMAS[0].sampleSafeFrame
    });

    expect(engine.verifySeal(res.seal)).toBe(true);
    expect(
      engine.verifySeal({
        ...res.seal,
        payloadSha256: '0'.repeat(64)
      })
    ).toBe(false);
  });
});
