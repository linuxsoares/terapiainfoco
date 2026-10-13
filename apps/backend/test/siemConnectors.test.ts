import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { siemService } from '../src/services/siemService';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { AuditAction, AuditResourceType } from '@terapiainfoco/shared';

describe('Conectores SIEM Externos & Dispatcher Resiliente com Exponential Backoff (RFC §4.4 & §5.2)', () => {
  let adminToken: string;
  let secretaryToken: string;

  beforeEach(async () => {
    db.clear();
    siemService.clear();
    globalRateLimitStore.reset();

    const loginAdmin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const adminData = await loginAdmin.json();
    adminToken = adminData.accessToken;

    const loginSecretary = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'recepcao@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const secretaryData = await loginSecretary.json();
    secretaryToken = secretaryData.accessToken;
  });

  describe('CRUD & Gestão de Conectores SIEM', () => {
    it('deve listar os 3 conectores SIEM padrão (Datadog, Splunk e Elastic)', async () => {
      const res = await app.request('/api/siem/connectors', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.connectors.length).toBe(3);

      const providers = body.connectors.map((c: any) => c.provider);
      expect(providers).toContain('datadog');
      expect(providers).toContain('splunk');
      expect(providers).toContain('elastic');
    });

    it('deve criar um novo conector SIEM válido com HTTPS', async () => {
      const res = await app.request('/api/siem/connectors', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: 'generic',
          name: 'Coletor Syslog Corporativo HTTPS',
          endpointUrl: 'https://siem.hospital-parceiro.com.br/ingest',
          apiKey: 'sec-syslog-token-9988',
          subscribedEvents: ['SECURITY_ALERT', 'BACKUP_RESTORE']
        })
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.connector.id).toBeDefined();
      expect(body.connector.name).toBe('Coletor Syslog Corporativo HTTPS');
      expect(body.connector.circuitBreakerStatus).toBe('CLOSED');
    });

    it('deve rejeitar cadastro de conector sem HTTPS (segurança TLS 1.3 obrigatória)', async () => {
      const res = await app.request('/api/siem/connectors', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: 'generic',
          name: 'Coletor Inseguro HTTP',
          endpointUrl: 'http://inseguro.coletor.com/api',
          subscribedEvents: ['SECURITY_ALERT']
        })
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('HTTPS');
    });

    it('deve atualizar configurações de um conector existente', async () => {
      const listRes = await app.request('/api/siem/connectors', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const { connectors } = await listRes.json();
      const targetId = connectors[0].id;

      const patchRes = await app.request(`/api/siem/connectors/${targetId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Datadog SIEM Core (Ambiente Staging/Prod Atualizado)',
          enabled: false
        })
      });

      expect(patchRes.status).toBe(200);
      const patched = await patchRes.json();
      expect(patched.connector.name).toBe('Datadog SIEM Core (Ambiente Staging/Prod Atualizado)');
      expect(patched.connector.enabled).toBe(false);
    });

    it('deve remover conector SIEM e retornar 404 para ID inexistente', async () => {
      const deleteRes = await app.request('/api/siem/connectors/siem-datadog-default-01', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      expect(deleteRes.status).toBe(200);

      const checkRes = await app.request('/api/siem/connectors/siem-datadog-default-01', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      expect(checkRes.status).toBe(404);
    });
  });

  describe('Teste de Transformação & Simulação de Conectores SIEM', () => {
    it('deve testar conector Datadog com formato oficial e cabeçalho DD-API-KEY', async () => {
      const res = await app.request('/api/siem/connectors/siem-datadog-default-01/test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          eventType: 'SECURITY_ALERT'
        })
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.testResult.httpStatus).toBe(200);
      expect(body.testResult.formattedPayload.ddsource).toBe('terapiainfoco');
      expect(body.testResult.headersSent['DD-API-KEY']).toBeDefined();
    });

    it('deve testar conector Splunk com formato HEC e cabeçalho Authorization Splunk', async () => {
      const res = await app.request('/api/siem/connectors/siem-splunk-default-02/test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          eventType: 'DATA_EXPORT_LGPD'
        })
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.testResult.formattedPayload.sourcetype).toBe('_json');
      expect(body.testResult.headersSent['Authorization']).toStartWith('Splunk ');
    });
  });

  describe('Dispatcher Resiliente, Retry Exponencial e Dead-Letter Queue (DLQ)', () => {
    it('deve despachar evento para conectores inscritos com entrega com sucesso', async () => {
      const res = await app.request('/api/siem/dispatch-test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          eventType: 'SECURITY_ALERT',
          data: { alertId: 'alrt-001', severity: 'HIGH', ip: '200.100.50.25' }
        })
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.dispatchedCount).toBeGreaterThan(0);
      expect(body.items.every((i: any) => i.status === 'DELIVERED')).toBe(true);
    });

    it('deve enfileirar para retry quando o coletor falhar e calcular próximo horário via backoff', async () => {
      const res = await app.request('/api/siem/dispatch-test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          eventType: 'SECURITY_ALERT',
          data: { test: true },
          mockFailures: true,
          mockHttpStatus: 503
        })
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const retryingItems = body.items.filter((i: any) => i.status === 'RETRYING');
      expect(retryingItems.length).toBeGreaterThan(0);
      expect(retryingItems[0].currentAttempt).toBe(2);
      expect(retryingItems[0].nextRetryAt).toBeDefined();
    });

    it('deve mover item para Dead-Letter Queue (DLQ) após 5 tentativas sem sucesso e registrar WORM', async () => {
      // Cria item simulado com tentativa 5 para forçar esgotamento
      const conn = siemService.listConnectors()[0];
      const item = {
        id: 'sq-test-dlq-exhaustion',
        connectorId: conn.id,
        provider: conn.provider,
        eventType: 'SECURITY_ALERT' as const,
        payload: { incident: 'Ataque simulado' },
        status: 'RETRYING' as const,
        currentAttempt: 5, // Última tentativa
        maxAttempts: 5,
        nextRetryAt: null,
        attemptsHistory: [],
        createdAt: new Date().toISOString()
      };

      await siemService.dispatchQueueItem(item, conn, {
        mockFailures: true,
        mockHttpStatus: 504
      });

      expect(item.status).toBe('DEAD_LETTER');
      expect(item.deadLetteredAt).toBeDefined();
      expect(item.deadLetterReason).toContain('504');

      // Verifica presença na DLQ
      const dlqRes = await app.request('/api/siem/dlq', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const dlqBody = await dlqRes.json();
      expect(dlqBody.count).toBeGreaterThan(0);
      expect(dlqBody.items.some((i: any) => i.id === 'sq-test-dlq-exhaustion')).toBe(true);

      // Verifica registro na trilha WORM
      const wormAudit = db.auditLogs.find(
        l => l.action === AuditAction.SIEM_DLQ_MOVED && l.resourceId === 'sq-test-dlq-exhaustion'
      );
      expect(wormAudit).toBeDefined();
    });

    it('deve permitir reprocessar (replay) item da DLQ com sucesso', async () => {
      // 1. Gera item na DLQ
      const conn = siemService.listConnectors()[0];
      const item = {
        id: 'sq-test-dlq-replay-item',
        connectorId: conn.id,
        provider: conn.provider,
        eventType: 'BACKUP_RESTORE' as const,
        payload: { backupId: 'bk-123' },
        status: 'DEAD_LETTER' as const,
        currentAttempt: 5,
        maxAttempts: 5,
        nextRetryAt: null,
        attemptsHistory: [],
        createdAt: new Date().toISOString(),
        deadLetteredAt: new Date().toISOString(),
        deadLetterReason: 'Coletor indisponível temporariamente'
      };
      (siemService as any).queue.set(item.id, item);

      // 2. Dispara replay via API
      const replayRes = await app.request(`/api/siem/dlq/${item.id}/replay`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ mockSuccess: true })
      });

      expect(replayRes.status).toBe(200);
      const replayBody = await replayRes.json();
      expect(replayBody.success).toBe(true);
      expect(replayBody.item.status).toBe('DELIVERED');

      // Verifica registro de auditoria WORM do replay
      const replayAudit = db.auditLogs.find(
        l => l.action === AuditAction.SIEM_DLQ_REPLAY && l.resourceId === item.id
      );
      expect(replayAudit).toBeDefined();
    });

    it('deve acionar Circuit Breaker (OPEN) após 5 falhas consecutivas do conector', async () => {
      const conn = siemService.listConnectors()[0];

      // Dispara 5 falhas consecutivas para o mesmo conector
      for (let i = 1; i <= 5; i++) {
        const dummyItem = {
          id: `sq-cb-fail-${i}`,
          connectorId: conn.id,
          provider: conn.provider,
          eventType: 'AUTH_LOGIN_FAILED' as const,
          payload: { attempt: i },
          status: 'PENDING' as const,
          currentAttempt: 1,
          maxAttempts: 5,
          nextRetryAt: null,
          attemptsHistory: [],
          createdAt: new Date().toISOString()
        };
        await siemService.dispatchQueueItem(dummyItem, conn, {
          mockFailures: true,
          mockHttpStatus: 500
        });
      }

      const updatedConn = siemService.getConnector(conn.id);
      expect(updatedConn?.circuitBreakerStatus).toBe('OPEN');
      expect(updatedConn?.consecutiveFailures).toBe(5);
    });
  });

  describe('Controle de Acesso RBAC & Autenticação Estrita', () => {
    it('deve rejeitar requisições não autenticadas com HTTP 401 Unauthorized', async () => {
      const res = await app.request('/api/siem/connectors');
      expect(res.status).toBe(401);
    });

    it('deve rejeitar perfil de recepção/secretária com HTTP 403 Forbidden', async () => {
      const res = await app.request('/api/siem/connectors', {
        headers: { 'Authorization': `Bearer ${secretaryToken}` }
      });
      expect(res.status).toBe(403);
    });
  });
});
