import type { MiddlewareHandler } from 'hono';
import { prometheus } from './prometheusRegistry';
import { OpenTelemetryTracer, tracer } from './openTelemetryTracer';

/**
 * Middleware Global de Telemetria OpenTelemetry & Métricas Prometheus (RFC-001 §5.2)
 * Rastreia cada requisição HTTP, propaga cabeçalhos W3C traceparent e alimenta métricas RED.
 */
export const telemetryMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    // 1. Extração / Geração de W3C Trace Context
    const traceparentHeader = c.req.header('traceparent');
    const { traceId, parentSpanId } = OpenTelemetryTracer.parseTraceparent(traceparentHeader);

    const method = c.req.method;
    const path = c.req.path;
    const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'unknown';

    // 2. Início do Root Span OpenTelemetry
    const span = tracer.startSpan(`http ${method} ${path}`, {
      traceId,
      parentSpanId,
      kind: 'SERVER',
      attributes: {
        'http.method': method,
        'http.target': path,
        'http.client_ip': ip,
        'http.user_agent': userAgent
      }
    });

    c.set('traceId', traceId);
    c.set('activeSpan', span);

    // 3. Métricas Prometheus In-Flight
    prometheus.incGauge('http_requests_in_flight');

    const startPerf = performance.now();

    try {
      await next();
    } catch (err: any) {
      span.setStatus('ERROR', err.message);
      span.addEvent('exception', {
        'exception.message': err.message,
        'exception.stack': err.stack || ''
      });
      throw err;
    } finally {
      const durationMs = performance.now() - startPerf;
      const durationSeconds = durationMs / 1000;
      const status = c.res.status || 200;

      // 4. Injeção de Headers W3C e Rastreabilidade na Resposta
      c.header('x-trace-id', traceId);
      c.header('traceparent', span.toTraceparent());
      c.header('x-response-time', `${durationMs.toFixed(2)}ms`);

      span.setAttribute('http.status_code', status);

      if (status >= 400) {
        span.setStatus('ERROR', `HTTP status ${status}`);
        const errorType = status >= 500 ? 'server_error' : 'client_error';
        prometheus.incCounter('http_errors_total', {
          method,
          route: normalizeRoutePath(path),
          error_type: errorType
        });

        if (status === 401 || status === 403) {
          prometheus.incCounter('security_blocked_requests_total', {
            reason: status === 401 ? 'unauthorized' : 'forbidden'
          });
        }
      } else {
        span.setStatus('OK');
      }

      span.end();

      // 5. Atualização de Métricas Prometheus
      prometheus.decGauge('http_requests_in_flight');

      const routeLabel = normalizeRoutePath(path);
      prometheus.incCounter('http_requests_total', {
        method,
        route: routeLabel,
        status: String(status)
      });

      prometheus.observeHistogram('http_request_duration_seconds', durationSeconds, {
        method,
        route: routeLabel
      });
    }
  };
};

/**
 * Normaliza caminhos dinâmicos (ex: UUIDs) para evitar alta cardinalidade no Prometheus
 */
function normalizeRoutePath(path: string): string {
  // Substitui UUIDs por :id
  return path.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id');
}
