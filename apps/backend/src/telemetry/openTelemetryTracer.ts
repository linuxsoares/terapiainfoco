import { randomBytes } from 'node:crypto';
import type { TraceSpan, SpanKind, SpanStatus } from '@terapiainfoco/shared';

export interface SpanOptions {
  parentSpanId?: string;
  kind?: SpanKind;
  attributes?: Record<string, string | number | boolean>;
}

export class Span {
  public traceId: string;
  public spanId: string;
  public parentSpanId?: string;
  public name: string;
  public kind: SpanKind;
  public startTimeMs: number;
  public endTimeMs?: number;
  public durationMs?: number;
  public status: SpanStatus = 'OK';
  public attributes: Record<string, string | number | boolean> = {};
  public events: Array<{ name: string; timestampMs: number; attributes?: Record<string, string | number | boolean> }> = [];

  constructor(traceId: string, name: string, options: SpanOptions = {}) {
    this.traceId = traceId;
    this.spanId = OpenTelemetryTracer.generateSpanId();
    this.parentSpanId = options.parentSpanId;
    this.name = name;
    this.kind = options.kind || 'INTERNAL';
    this.startTimeMs = Date.now();
    if (options.attributes) {
      this.attributes = { ...options.attributes };
    }
  }

  public setAttribute(key: string, value: string | number | boolean): this {
    this.attributes[key] = value;
    return this;
  }

  public setAttributes(attrs: Record<string, string | number | boolean>): this {
    Object.assign(this.attributes, attrs);
    return this;
  }

  public addEvent(name: string, attributes?: Record<string, string | number | boolean>): this {
    this.events.push({
      name,
      timestampMs: Date.now(),
      attributes
    });
    return this;
  }

  public setStatus(status: SpanStatus, errorMessage?: string): this {
    this.status = status;
    if (errorMessage) {
      this.setAttribute('error.message', errorMessage);
    }
    return this;
  }

  public end(): TraceSpan {
    this.endTimeMs = Date.now();
    this.durationMs = Math.max(0, this.endTimeMs - this.startTimeMs);
    const completed = this.toJSON();
    OpenTelemetryTracer.getInstance().recordCompletedSpan(completed);
    return completed;
  }

  public toJSON(): TraceSpan {
    return {
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      name: this.name,
      kind: this.kind,
      startTimeMs: this.startTimeMs,
      endTimeMs: this.endTimeMs,
      durationMs: this.durationMs,
      status: this.status,
      attributes: { ...this.attributes },
      events: [...this.events]
    };
  }

  /**
   * Gera o cabeçalho W3C Traceparent correspondente a este span
   * Formato: 00-{traceId}-{spanId}-01
   */
  public toTraceparent(): string {
    return `00-${this.traceId}-${this.spanId}-01`;
  }
}

export class OpenTelemetryTracer {
  private static instance: OpenTelemetryTracer;
  private maxStoredSpans = 200;
  private completedSpans: TraceSpan[] = [];

  private constructor() {}

  public static getInstance(): OpenTelemetryTracer {
    if (!OpenTelemetryTracer.instance) {
      OpenTelemetryTracer.instance = new OpenTelemetryTracer();
    }
    return OpenTelemetryTracer.instance;
  }

  /**
   * Gera um W3C Trace ID de 128 bits (32 caracteres hexadecimais)
   */
  public static generateTraceId(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Gera um W3C Span ID de 64 bits (16 caracteres hexadecimais)
   */
  public static generateSpanId(): string {
    return randomBytes(8).toString('hex');
  }

  /**
   * Faz o parse de um header W3C traceparent (ex: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")
   */
  public static parseTraceparent(header?: string | null): { traceId: string; parentSpanId?: string } {
    if (!header) {
      return { traceId: OpenTelemetryTracer.generateTraceId() };
    }

    const parts = header.trim().split('-');
    if (parts.length >= 4 && parts[0] === '00' && parts[1].length === 32 && parts[2].length === 16) {
      return {
        traceId: parts[1],
        parentSpanId: parts[2]
      };
    }

    return { traceId: OpenTelemetryTracer.generateTraceId() };
  }

  /**
   * Inicia um novo Span rastreável
   */
  public startSpan(name: string, options: { traceId?: string; parentSpanId?: string; kind?: SpanKind; attributes?: Record<string, string | number | boolean> } = {}): Span {
    const traceId = options.traceId || OpenTelemetryTracer.generateTraceId();
    return new Span(traceId, name, options);
  }

  /**
   * Armazena um span concluído no buffer circular de observabilidade
   */
  public recordCompletedSpan(span: TraceSpan): void {
    this.completedSpans.unshift(span);
    if (this.completedSpans.length > this.maxStoredSpans) {
      this.completedSpans.pop();
    }
  }

  /**
   * Retorna os últimos traces para exibição no dashboard ou exportação
   */
  public getRecentSpans(limit = 50): TraceSpan[] {
    return this.completedSpans.slice(0, limit);
  }

  /**
   * Busca spans por traceId
   */
  public getSpansByTraceId(traceId: string): TraceSpan[] {
    return this.completedSpans.filter((s) => s.traceId === traceId);
  }

  public clear(): void {
    this.completedSpans = [];
  }
}

export const tracer = OpenTelemetryTracer.getInstance();
