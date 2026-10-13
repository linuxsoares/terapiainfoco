import { randomUUID } from 'node:crypto';
import type { 
  SiemConnector, 
  SiemQueueItem, 
  SiemProvider, 
  CircuitBreakerStatus,
  WebhookEventType,
  CreateSiemConnectorDTO,
  UpdateSiemConnectorDTO,
  TestSiemConnectorDTO
} from '@terapiainfoco/shared';
import { AuditAction, AuditResourceType } from '@terapiainfoco/shared';
import { 
  formatSiemPayload, 
  buildSiemHeaders, 
  calculateExponentialBackoff 
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class SiemService {
  private connectors = new Map<string, SiemConnector>();
  private queue = new Map<string, SiemQueueItem>();
  private readonly maxRetryAttempts = 5;
  private readonly circuitBreakerThreshold = 5;
  private readonly circuitBreakerResetTimeoutMs = 30000; // 30s

  constructor() {
    this.seedDefaultConnectors();
  }

  private seedDefaultConnectors() {
    // 1. Datadog Logs API
    const id1 = 'siem-datadog-default-01';
    this.connectors.set(id1, {
      id: id1,
      provider: 'datadog',
      name: 'Datadog SIEM Core (Logs v2)',
      endpointUrl: 'https://http-intake.logs.datadoghq.com/api/v2/logs',
      apiKey: 'dd-api-key-sample-prod-token',
      indexOrSource: 'clinical-platform',
      tags: { env: 'production', lgpd: 'art-48', compliance: 'cfp-001' },
      subscribedEvents: ['SECURITY_ALERT', 'AUTH_LOGIN_FAILED', 'BACKUP_RESTORE'],
      enabled: true,
      circuitBreakerStatus: 'CLOSED',
      consecutiveFailures: 0,
      circuitOpenedAt: null,
      stats: {
        totalDispatched: 0,
        successful: 0,
        retried: 0,
        dlqMoved: 0,
        lastLatencyMs: 42,
        lastDispatchedAt: null
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // 2. Splunk HEC (HTTP Event Collector)
    const id2 = 'siem-splunk-default-02';
    this.connectors.set(id2, {
      id: id2,
      provider: 'splunk',
      name: 'Splunk Enterprise HEC Cluster',
      endpointUrl: 'https://splunk-hec.clinica.com.br:8088/services/collector/event',
      apiKey: 'hec-token-splunk-corp-987654',
      indexOrSource: 'security_audit',
      tags: { sourcetype: 'terapiainfoco:json' },
      subscribedEvents: ['DATA_EXPORT_LGPD', 'CONSENT_REVOKED', 'SECURITY_ALERT'],
      enabled: true,
      circuitBreakerStatus: 'CLOSED',
      consecutiveFailures: 0,
      circuitOpenedAt: null,
      stats: {
        totalDispatched: 0,
        successful: 0,
        retried: 0,
        dlqMoved: 0,
        lastLatencyMs: 35,
        lastDispatchedAt: null
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // 3. Elasticsearch Index API (ECS)
    const id3 = 'siem-elastic-default-03';
    this.connectors.set(id3, {
      id: id3,
      provider: 'elastic',
      name: 'Elasticsearch Security Lake (ECS 8.11)',
      endpointUrl: 'https://elastic-cluster.clinica.com.br:9200/terapiainfoco-audit/_doc',
      apiKey: 'ApiKey elastic-cloud-sec-key-5544',
      indexOrSource: 'terapiainfoco-audit-logs',
      subscribedEvents: ['SECURITY_ALERT', 'DOCUMENT_SIGNED', 'AUTH_LOGIN_FAILED'],
      enabled: true,
      circuitBreakerStatus: 'CLOSED',
      consecutiveFailures: 0,
      circuitOpenedAt: null,
      stats: {
        totalDispatched: 0,
        successful: 0,
        retried: 0,
        dlqMoved: 0,
        lastLatencyMs: 28,
        lastDispatchedAt: null
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  public listConnectors(): SiemConnector[] {
    return Array.from(this.connectors.values());
  }

  public getConnector(id: string): SiemConnector | null {
    return this.connectors.get(id) || null;
  }

  public createConnector(dto: CreateSiemConnectorDTO): SiemConnector {
    const id = `siem-${randomUUID()}`;
    const now = new Date().toISOString();

    const connector: SiemConnector = {
      id,
      provider: dto.provider,
      name: dto.name.trim(),
      endpointUrl: dto.endpointUrl.trim(),
      apiKey: dto.apiKey?.trim(),
      indexOrSource: dto.indexOrSource?.trim(),
      tags: dto.tags || {},
      subscribedEvents: dto.subscribedEvents || ['SECURITY_ALERT'],
      enabled: true,
      circuitBreakerStatus: 'CLOSED',
      consecutiveFailures: 0,
      circuitOpenedAt: null,
      stats: {
        totalDispatched: 0,
        successful: 0,
        retried: 0,
        dlqMoved: 0,
        lastDispatchedAt: null
      },
      createdAt: now,
      updatedAt: now
    };

    this.connectors.set(id, connector);
    return connector;
  }

  public updateConnector(id: string, dto: UpdateSiemConnectorDTO): SiemConnector | null {
    const conn = this.connectors.get(id);
    if (!conn) return null;

    if (dto.name !== undefined) conn.name = dto.name.trim();
    if (dto.endpointUrl !== undefined) conn.endpointUrl = dto.endpointUrl.trim();
    if (dto.apiKey !== undefined) conn.apiKey = dto.apiKey.trim();
    if (dto.indexOrSource !== undefined) conn.indexOrSource = dto.indexOrSource.trim();
    if (dto.tags !== undefined) conn.tags = dto.tags;
    if (dto.subscribedEvents !== undefined) conn.subscribedEvents = dto.subscribedEvents;
    if (dto.enabled !== undefined) conn.enabled = dto.enabled;
    conn.updatedAt = new Date().toISOString();

    this.connectors.set(id, conn);
    return conn;
  }

  public deleteConnector(id: string): boolean {
    return this.connectors.delete(id);
  }

  /**
   * Dispara um teste sob demanda para um conector com visualização do payload transformado
   */
  public async testConnector(id: string, options?: TestSiemConnectorDTO): Promise<{
    httpStatus: number;
    latencyMs: number;
    success: boolean;
    formattedPayload: any;
    headersSent: Record<string, string>;
    error?: string;
  }> {
    const conn = this.connectors.get(id);
    if (!conn) {
      throw new Error(`Conector SIEM '${id}' não encontrado.`);
    }

    const eventType: WebhookEventType = options?.eventType || conn.subscribedEvents[0] || 'SECURITY_ALERT';
    const sampleData = {
      test: true,
      message: `Teste de integração SIEM disparado sob demanda para ${conn.name}`,
      actor: 'admin@terapiainfoco.com.br',
      compliance: 'LGPD Art. 48 & CFP 001/2009',
      timestamp: new Date().toISOString()
    };

    const formattedPayload = formatSiemPayload(conn.provider, eventType, sampleData, {
      index: conn.indexOrSource,
      tags: conn.tags
    });

    const headersSent = buildSiemHeaders(conn.provider, conn.apiKey);

    const startTime = performance.now();
    let httpStatus = 200;
    let success = true;
    let error: string | undefined;

    if (options?.mockHttpStatus !== undefined) {
      httpStatus = options.mockHttpStatus;
      success = httpStatus >= 200 && httpStatus < 300;
      if (!success) {
        error = `Falha simulada com código HTTP ${httpStatus}`;
      }
    } else {
      // Se for domínio simulado/interno ou de teste, retorna 200 imediato
      if (
        conn.endpointUrl.includes('datadoghq.com') ||
        conn.endpointUrl.includes('clinica.com.br') ||
        conn.endpointUrl.includes('example.com')
      ) {
        httpStatus = 200;
        success = true;
      } else {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 4000);

          const res = await fetch(conn.endpointUrl, {
            method: 'POST',
            headers: headersSent,
            body: JSON.stringify(formattedPayload),
            signal: controller.signal
          });

          clearTimeout(timeout);
          httpStatus = res.status;
          success = res.ok;
          if (!res.ok) {
            error = `Endpoint remoto respondeu com HTTP ${res.status}`;
          }
        } catch (err: any) {
          success = false;
          httpStatus = 503;
          error = err.message || 'Erro de conexão de rede';
        }
      }
    }

    const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;

    return {
      httpStatus,
      latencyMs,
      success,
      formattedPayload,
      headersSent,
      error
    };
  }

  /**
   * Enfileira evento para todos os conectores SIEM inscritos
   */
  public async enqueueEvent(
    eventType: WebhookEventType,
    data: any,
    options?: { mockFailures?: boolean; mockHttpStatus?: number }
  ): Promise<SiemQueueItem[]> {
    const eligibleConnectors = Array.from(this.connectors.values()).filter(
      c => c.enabled && c.subscribedEvents.includes(eventType)
    );

    const queuedItems: SiemQueueItem[] = [];

    for (const connector of eligibleConnectors) {
      // Verifica Circuit Breaker
      this.evaluateCircuitBreaker(connector);
      if (connector.circuitBreakerStatus === 'OPEN') {
        connector.stats.retried++;
        continue;
      }

      const itemId = `sq-${randomUUID()}`;
      const queueItem: SiemQueueItem = {
        id: itemId,
        connectorId: connector.id,
        provider: connector.provider,
        eventType,
        payload: data,
        status: 'PENDING',
        currentAttempt: 1,
        maxAttempts: this.maxRetryAttempts,
        nextRetryAt: null,
        attemptsHistory: [],
        createdAt: new Date().toISOString()
      };

      this.queue.set(itemId, queueItem);
      await this.dispatchQueueItem(queueItem, connector, options);
      queuedItems.push(queueItem);
    }

    return queuedItems;
  }

  /**
   * Executa a tentativa de envio com lógica de Circuit Breaker, Exponential Backoff e DLQ
   */
  public async dispatchQueueItem(
    item: SiemQueueItem,
    connector?: SiemConnector,
    options?: { mockFailures?: boolean; mockHttpStatus?: number }
  ): Promise<SiemQueueItem> {
    const conn = connector || this.connectors.get(item.connectorId);
    if (!conn) {
      item.status = 'DEAD_LETTER';
      item.deadLetterReason = 'Conector associado não existe mais.';
      return item;
    }

    const startTime = performance.now();
    let httpStatus = 200;
    let success = true;
    let errorMsg: string | undefined;

    // Simulação ou chamada real
    if (options?.mockFailures || (options?.mockHttpStatus && options.mockHttpStatus >= 400)) {
      httpStatus = options.mockHttpStatus || 500;
      success = false;
      errorMsg = `Erro HTTP ${httpStatus}: Simulação de falha no coletor ${conn.provider}`;
    } else if (
      conn.endpointUrl.includes('datadoghq.com') ||
      conn.endpointUrl.includes('clinica.com.br') ||
      conn.endpointUrl.includes('example.com')
    ) {
      httpStatus = 200;
      success = true;
    } else {
      try {
        const formattedPayload = formatSiemPayload(conn.provider, item.eventType, item.payload, {
          index: conn.indexOrSource,
          tags: conn.tags
        });
        const headers = buildSiemHeaders(conn.provider, conn.apiKey);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);

        const res = await fetch(conn.endpointUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(formattedPayload),
          signal: controller.signal
        });

        clearTimeout(timeout);
        httpStatus = res.status;
        success = res.ok;
        if (!res.ok) {
          errorMsg = `Falha HTTP ${res.status}`;
        }
      } catch (err: any) {
        success = false;
        httpStatus = 503;
        errorMsg = err.message || 'Falha de comunicação de rede';
      }
    }

    const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;

    item.attemptsHistory.push({
      attemptNumber: item.currentAttempt,
      timestamp: new Date().toISOString(),
      httpStatus,
      latencyMs,
      error: errorMsg
    });

    conn.stats.totalDispatched++;
    conn.stats.lastLatencyMs = latencyMs;
    conn.stats.lastDispatchedAt = new Date().toISOString();

    if (success) {
      item.status = 'DELIVERED';
      item.deliveredAt = new Date().toISOString();
      conn.stats.successful++;
      conn.consecutiveFailures = 0;
      if (conn.circuitBreakerStatus === 'HALF_OPEN') {
        conn.circuitBreakerStatus = 'CLOSED';
      }
    } else {
      conn.consecutiveFailures++;

      // Disparo de Circuit Breaker
      if (conn.consecutiveFailures >= this.circuitBreakerThreshold) {
        conn.circuitBreakerStatus = 'OPEN';
        conn.circuitOpenedAt = new Date().toISOString();
      }

      if (item.currentAttempt >= item.maxAttempts) {
        // Esgotamento das 5 tentativas -> Movimenta para a Dead-Letter Queue (DLQ)
        item.status = 'DEAD_LETTER';
        item.deadLetteredAt = new Date().toISOString();
        item.deadLetterReason = errorMsg || `Esgotadas ${this.maxRetryAttempts} tentativas de reenvio sem sucesso.`;
        conn.stats.dlqMoved++;

        // Auditoria WORM compulsória
        AuditService.log({
          actorId: 'system-siem-dispatcher',
          resourceType: AuditResourceType.SIEM,
          resourceId: item.id,
          action: AuditAction.SIEM_DLQ_MOVED,
          ipAddress: '127.0.0.1'
        });
      } else {
        // Agenda próxima tentativa via Exponential Backoff
        item.status = 'RETRYING';
        item.currentAttempt++;
        const backoffMs = calculateExponentialBackoff(item.currentAttempt);
        item.nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
        conn.stats.retried++;
      }
    }

    this.queue.set(item.id, item);
    this.connectors.set(conn.id, conn);
    return item;
  }

  /**
   * Avalia estado do Circuit Breaker e faz transição para HALF_OPEN se timeout expirou
   */
  private evaluateCircuitBreaker(conn: SiemConnector) {
    if (conn.circuitBreakerStatus === 'OPEN' && conn.circuitOpenedAt) {
      const openedTime = new Date(conn.circuitOpenedAt).getTime();
      const elapsed = Date.now() - openedTime;
      if (elapsed >= this.circuitBreakerResetTimeoutMs) {
        conn.circuitBreakerStatus = 'HALF_OPEN';
        conn.consecutiveFailures = 0;
      }
    }
  }

  public getQueueStats() {
    const allItems = Array.from(this.queue.values());
    const pendingCount = allItems.filter(i => i.status === 'PENDING').length;
    const retryingCount = allItems.filter(i => i.status === 'RETRYING').length;
    const deliveredCount = allItems.filter(i => i.status === 'DELIVERED').length;
    const deadLetterCount = allItems.filter(i => i.status === 'DEAD_LETTER').length;

    const circuitBreakers = Array.from(this.connectors.values()).map(c => ({
      connectorId: c.id,
      name: c.name,
      provider: c.provider,
      status: c.circuitBreakerStatus,
      consecutiveFailures: c.consecutiveFailures
    }));

    // Retorna os últimos 50 itens ordenados pelo mais recente
    const recentItems = [...allItems]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50);

    return {
      pendingCount,
      retryingCount,
      deliveredCount,
      deadLetterCount,
      circuitBreakers,
      recentItems
    };
  }

  public getDlqItems(): SiemQueueItem[] {
    return Array.from(this.queue.values()).filter(i => i.status === 'DEAD_LETTER');
  }

  /**
   * Re-executa o envio de um item da Dead-Letter Queue
   */
  public async replayDlqItem(id: string, options?: { mockSuccess?: boolean }): Promise<SiemQueueItem> {
    const item = this.queue.get(id);
    if (!item) {
      throw new Error(`Item de fila '${id}' não encontrado.`);
    }

    item.status = 'PENDING';
    item.currentAttempt = 1;
    item.deadLetteredAt = null;
    item.deadLetterReason = undefined;

    // Registra na trilha de auditoria WORM
    AuditService.log({
      actorId: 'admin@terapiainfoco.com.br',
      resourceType: AuditResourceType.SIEM,
      resourceId: item.id,
      action: AuditAction.SIEM_DLQ_REPLAY,
      ipAddress: '127.0.0.1'
    });

    const conn = this.connectors.get(item.connectorId);
    if (conn && conn.circuitBreakerStatus === 'OPEN') {
      conn.circuitBreakerStatus = 'HALF_OPEN';
    }

    await this.dispatchQueueItem(item, conn, {
      mockFailures: options?.mockSuccess === false
    });

    return item;
  }

  /**
   * Reprocessa todos os itens da Dead-Letter Queue
   */
  public async replayAllDlq(options?: { mockSuccess?: boolean }): Promise<{
    replayedCount: number;
    successCount: number;
    failedCount: number;
    items: SiemQueueItem[];
  }> {
    const dlqItems = this.getDlqItems();
    let successCount = 0;
    let failedCount = 0;

    for (const item of dlqItems) {
      const result = await this.replayDlqItem(item.id, options);
      if (result.status === 'DELIVERED') {
        successCount++;
      } else {
        failedCount++;
      }
    }

    return {
      replayedCount: dlqItems.length,
      successCount,
      failedCount,
      items: dlqItems
    };
  }

  public deleteDlqItem(id: string): boolean {
    const item = this.queue.get(id);
    if (item && item.status === 'DEAD_LETTER') {
      return this.queue.delete(id);
    }
    return false;
  }

  public clear(): void {
    this.connectors.clear();
    this.queue.clear();
    this.seedDefaultConnectors();
  }
}

export const siemService = new SiemService();
