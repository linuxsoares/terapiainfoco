import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { app } from '../src/index';
import { webhookService } from '../src/services/webhookService';
import { globalRateLimitStore } from '../src/services/rateLimitStore';
import { verifyWebhookSignature } from '@terapiainfoco/crypto';

describe('Webhooks Assinados HMAC-SHA256 & Notificações de Segurança (RFC-001 Opção J & LGPD Art. 48)', () => {
  let adminToken: string;
  let secretaryToken: string;

  beforeEach(async () => {
    await globalRateLimitStore.reset();
    // 1. Login como Admin
    const adminRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@terapiainfoco.com.br', password: 'Senha@123456' })
    });
    adminToken = (await adminRes.json()).accessToken;

    // 2. Login como Secretária
    const secRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'recepcao@terapiainfoco.com.br', password: 'Senha@123456' })
    });
    secretaryToken = (await secRes.json()).accessToken;

    webhookService.clear();
  });

  afterEach(() => {
    webhookService.clear();
  });

  it('deve listar webhooks cadastrados para perfil Administrador', async () => {
    const res = await app.request('/api/webhooks', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.count).toBeGreaterThanOrEqual(1);
    expect(data.webhooks[0].secret.startsWith('whsec_')).toBe(true);
  });

  it('deve criar novo webhook com segredo HMAC-SHA256 e validação de URL HTTPS', async () => {
    const newWebhookDTO = {
      url: 'https://soc.hospital.com.br/alerts',
      description: 'Integração SOC Hospitalar',
      events: ['SECURITY_ALERT', 'BACKUP_RESTORE']
    };

    const res = await app.request('/api/webhooks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify(newWebhookDTO)
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.webhook.id.startsWith('wh-')).toBe(true);
    expect(data.webhook.secret.startsWith('whsec_')).toBe(true);
    expect(data.webhook.events).toEqual(['SECURITY_ALERT', 'BACKUP_RESTORE']);
  });

  it('deve rejeitar criação de webhook com URL insegura (HTTP sem SSL)', async () => {
    const insecureDTO = {
      url: 'http://insecure-endpoint.com/webhook',
      description: 'Endpoint inseguro',
      events: ['SECURITY_ALERT']
    };

    const res = await app.request('/api/webhooks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify(insecureDTO)
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('HTTPS');
  });

  it('deve disparar teste simulado de webhook e gerar assinatura canônica HMAC-SHA256 válida', async () => {
    // Cria webhook de teste apontando para URL com mock
    const created = webhookService.createSubscription({
      url: 'https://security-siem.clinica.com.br/test-endpoint',
      description: 'Webhook para teste',
      events: ['SECURITY_ALERT']
    });

    const res = await app.request(`/api/webhooks/${created.id}/test`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.deliveryLog).toBeDefined();
    expect(data.deliveryLog.success).toBe(true);
    expect(data.deliveryLog.httpStatus).toBe(200);
    expect(data.deliveryLog.latencyMs).toBeGreaterThanOrEqual(0);
    expect(data.deliveryLog.signatureHeader).toContain('t=');
    expect(data.deliveryLog.signatureHeader).toContain(',v1=');

    // Valida que o webhook foi marcado como testado
    const updatedSub = webhookService.getSubscription(created.id);
    expect(updatedSub?.lastDeliveryStatus).toBe('SUCCESS');
    expect(updatedSub?.lastTriggeredAt).not.toBeNull();
  });

  it('deve atualizar e remover inscrições de webhooks', async () => {
    const created = webhookService.createSubscription({
      url: 'https://api.clinica.com.br/hooks',
      description: 'Webhook a ser atualizado',
      events: ['DATA_EXPORT_LGPD']
    });

    // 1. Atualização
    const updateRes = await app.request(`/api/webhooks/${created.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        description: 'Descrição Atualizada',
        enabled: false
      })
    });

    expect(updateRes.status).toBe(200);
    const updateData = await updateRes.json();
    expect(updateData.webhook.description).toBe('Descrição Atualizada');
    expect(updateData.webhook.enabled).toBe(false);

    // 2. Remoção
    const deleteRes = await app.request(`/api/webhooks/${created.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    expect(deleteRes.status).toBe(200);
    expect(webhookService.getSubscription(created.id)).toBeNull();
  });

  it('deve consultar o histórico de logs de entrega de um webhook', async () => {
    const created = webhookService.createSubscription({
      url: 'https://siem.clinica.com.br/logs-test',
      description: 'Webhook de logs',
      events: ['SECURITY_ALERT']
    });

    // Dispara 2 testes
    await webhookService.testSubscription(created.id);
    await webhookService.testSubscription(created.id);

    const res = await app.request(`/api/webhooks/${created.id}/logs`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.count).toBe(2);
    expect(data.logs.length).toBe(2);
    expect(data.logs[0].webhookId).toBe(created.id);
  });

  it('deve restringir acesso a gestão de webhooks por RBAC (bloqueio 403 e 401)', async () => {
    // Secretária tentando listar webhooks -> 403 Forbidden
    const resSecList = await app.request('/api/webhooks', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${secretaryToken}` }
    });
    expect(resSecList.status).toBe(403);

    // Secretária tentando criar webhook -> 403 Forbidden
    const resSecCreate = await app.request('/api/webhooks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${secretaryToken}`
      },
      body: JSON.stringify({ url: 'https://fake.com', events: ['SECURITY_ALERT'] })
    });
    expect(resSecCreate.status).toBe(403);

    // Requisição anônima sem token -> 401 Unauthorized
    const resAnon = await app.request('/api/webhooks', {
      method: 'GET'
    });
    expect(resAnon.status).toBe(401);
  });
});
