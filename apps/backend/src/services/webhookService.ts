import { randomUUID } from 'node:crypto';
import { 
  generateWebhookSecret, 
  signWebhookPayload 
} from '@terapiainfoco/crypto';
import type { 
  WebhookSubscription, 
  WebhookDeliveryLog, 
  WebhookEventType,
  CreateWebhookDTO,
  UpdateWebhookDTO
} from '@terapiainfoco/shared';

export class WebhookService {
  private subscriptions = new Map<string, WebhookSubscription>();
  private deliveryLogs: WebhookDeliveryLog[] = [];

  constructor() {
    this.seedDefaultWebhook();
  }

  private seedDefaultWebhook() {
    // Webhook padrão para simulações e SIEM local
    const id = 'wh-00000000-0000-0000-0000-000000000001';
    this.subscriptions.set(id, {
      id,
      url: 'https://security-siem.clinica.com.br/events',
      description: 'Canal Central de SIEM / Alertas de Incidentes LGPD Art. 48',
      events: ['SECURITY_ALERT', 'BACKUP_RESTORE', 'DATA_EXPORT_LGPD', 'AUTH_LOGIN_FAILED'],
      secret: generateWebhookSecret(),
      enabled: true,
      createdAt: new Date().toISOString(),
      lastTriggeredAt: null,
      lastDeliveryStatus: null
    });
  }

  public listSubscriptions(): WebhookSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  public getSubscription(id: string): WebhookSubscription | null {
    return this.subscriptions.get(id) || null;
  }

  public createSubscription(dto: CreateWebhookDTO): WebhookSubscription {
    const id = `wh-${randomUUID()}`;
    const secret = generateWebhookSecret();

    const subscription: WebhookSubscription = {
      id,
      url: dto.url.trim(),
      description: dto.description.trim(),
      events: dto.events,
      secret,
      enabled: true,
      createdAt: new Date().toISOString(),
      lastTriggeredAt: null,
      lastDeliveryStatus: null
    };

    this.subscriptions.set(id, subscription);
    return subscription;
  }

  public updateSubscription(id: string, dto: UpdateWebhookDTO): WebhookSubscription | null {
    const sub = this.subscriptions.get(id);
    if (!sub) return null;

    if (dto.url !== undefined) sub.url = dto.url.trim();
    if (dto.description !== undefined) sub.description = dto.description.trim();
    if (dto.events !== undefined) sub.events = dto.events;
    if (dto.enabled !== undefined) sub.enabled = dto.enabled;

    this.subscriptions.set(id, sub);
    return sub;
  }

  public deleteSubscription(id: string): boolean {
    return this.subscriptions.delete(id);
  }

  public getDeliveryLogs(webhookId?: string): WebhookDeliveryLog[] {
    if (webhookId) {
      return this.deliveryLogs.filter(log => log.webhookId === webhookId);
    }
    return [...this.deliveryLogs];
  }

  /**
   * Envia evento para todas as inscrições ativas associadas ao tipo de evento
   */
  public async notifyEvent(eventType: WebhookEventType, data: any): Promise<WebhookDeliveryLog[]> {
    const matched = Array.from(this.subscriptions.values()).filter(
      sub => sub.enabled && sub.events.includes(eventType)
    );

    const logs: WebhookDeliveryLog[] = [];

    for (const sub of matched) {
      const log = await this.dispatchToWebhook(sub, eventType, data);
      logs.push(log);
    }

    return logs;
  }

  /**
   * Envia um evento de teste simulado para uma inscrição específica
   */
  public async testSubscription(id: string): Promise<WebhookDeliveryLog> {
    const sub = this.subscriptions.get(id);
    if (!sub) {
      throw new Error(`Inscrição de webhook '${id}' não encontrada.`);
    }

    const testEvent: WebhookEventType = sub.events[0] || 'SECURITY_ALERT';
    const sampleData = {
      simulation: true,
      message: 'Disparo de teste simulado de webhook assinado HMAC-SHA256',
      clinic: 'TerapiaInFoco Clínica Psicológica',
      compliance: 'LGPD Art. 48 & CFP 001/2009',
      triggeredAt: new Date().toISOString()
    };

    return await this.dispatchToWebhook(sub, testEvent, sampleData);
  }

  /**
   * Executa a requisição HTTP com assinatura canônica HMAC-SHA256 nos cabeçalhos
   */
  private async dispatchToWebhook(
    sub: WebhookSubscription,
    eventType: WebhookEventType,
    data: any
  ): Promise<WebhookDeliveryLog> {
    const deliveryId = `del-${randomUUID()}`;
    const timestamp = new Date().toISOString();
    const startTime = Date.now();

    const payloadObj = {
      id: deliveryId,
      event: eventType,
      timestamp,
      data
    };

    const payloadJson = JSON.stringify(payloadObj);
    const signature = signWebhookPayload(payloadJson, sub.secret);

    let httpStatus: number | undefined;
    let success = false;
    let errorMessage: string | undefined;

    try {
      // Se for URL de teste/mock interna ou protocolo simulado
      if (sub.url.includes('example.com') || sub.url.includes('clinica.com.br')) {
        // Simulação com sucesso imediato sem rede externa
        httpStatus = 200;
        success = true;
      } else {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

        const response = await fetch(sub.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-TerapiaInFoco-Signature': signature.signatureHeader,
            'X-TerapiaInFoco-Event': eventType,
            'X-TerapiaInFoco-Delivery-Id': deliveryId,
            'User-Agent': 'TerapiaInFoco-Webhooks/1.0'
          },
          body: payloadJson,
          signal: controller.signal
        });

        clearTimeout(timeout);
        httpStatus = response.status;
        success = response.ok;
      }
    } catch (err: any) {
      success = false;
      errorMessage = err.message || 'Falha de conexão com o endpoint de destino';
    }

    const latencyMs = Date.now() - startTime;

    const deliveryLog: WebhookDeliveryLog = {
      id: deliveryId,
      webhookId: sub.id,
      eventType,
      deliveryUrl: sub.url,
      timestamp,
      httpStatus,
      latencyMs,
      success,
      signatureHeader: signature.signatureHeader,
      error: errorMessage
    };

    // Atualiza metadados na inscrição
    sub.lastTriggeredAt = timestamp;
    sub.lastDeliveryStatus = success ? 'SUCCESS' : 'FAILED';
    this.subscriptions.set(sub.id, sub);

    // Registra histórico (mantém últimos 100 logs)
    this.deliveryLogs.unshift(deliveryLog);
    if (this.deliveryLogs.length > 100) {
      this.deliveryLogs.pop();
    }

    return deliveryLog;
  }

  public clear(): void {
    this.subscriptions.clear();
    this.deliveryLogs = [];
    this.seedDefaultWebhook();
  }
}

export const webhookService = new WebhookService();
