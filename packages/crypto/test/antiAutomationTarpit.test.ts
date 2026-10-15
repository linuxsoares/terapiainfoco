import { describe, it, expect } from 'bun:test';
import {
  generateHoneypotTrapToken,
  verifyHoneypotTrapToken,
  detectCrawlerHeuristics,
  calculateTarpitDelay,
  generateTarpitDefenseSeal,
  verifyTarpitDefenseSeal,
  tarpitSleep
} from '../src/antiAutomationTarpit';

describe('Anti-Automation, Honeypot & Cryptographic Tarpit Engine (OWASP OAT-011 / OAT-020 & RFC-001 §4.4)', () => {
  const testSecret = 'test_secret_anti_automation_tarpit_key_2026';

  describe('Geração e Validação de Tokens Honeypot', () => {
    it('deve gerar token de armadilha Honeypot com HMAC anti-tampering e metadados', () => {
      const trap = generateHoneypotTrapToken({
        routePath: '/api/internal/clinical-patients-export',
        clientIp: '198.51.100.42',
        ttlSeconds: 1800,
        secret: testSecret
      });

      expect(trap.trapId).toBeDefined();
      expect(trap.trapId.startsWith('trap_')).toBe(true);
      expect(trap.token.startsWith('hp_trap_')).toBe(true);
      expect(trap.routePath).toBe('/api/internal/clinical-patients-export');
      expect(trap.hmacSignature).toHaveLength(64);
    });

    it('deve validar com 100% de sucesso um token autêntico não expirado', () => {
      const trap = generateHoneypotTrapToken({
        routePath: '/api/v1/therapist/confidential-vault',
        clientIp: '203.0.113.19',
        ttlSeconds: 3600,
        secret: testSecret
      });

      const verification = verifyHoneypotTrapToken(trap.token, '203.0.113.19', testSecret);
      expect(verification.isValid).toBe(true);
      expect(verification.trapId).toBe(trap.trapId);
      expect(verification.routePath).toBe('/api/v1/therapist/confidential-vault');
      expect(verification.error).toBeUndefined();
    });

    it('deve rejeitar token com assinatura HMAC adulterada ou forjada', () => {
      const trap = generateHoneypotTrapToken({
        routePath: '/api/v1/fake-admin',
        clientIp: '198.51.100.5',
        secret: testSecret
      });

      // Tenta validar com secret incorreto
      const verification = verifyHoneypotTrapToken(trap.token, '198.51.100.5', 'wrong_secret_tampered');
      expect(verification.isValid).toBe(false);
      expect(verification.error).toContain('HMAC');
    });

    it('deve rejeitar token expirado (TTL ultrapassado)', () => {
      const trap = generateHoneypotTrapToken({
        routePath: '/api/v1/expired-endpoint',
        ttlSeconds: -10, // Expirado há 10 segundos
        secret: testSecret
      });

      const verification = verifyHoneypotTrapToken(trap.token, undefined, testSecret);
      expect(verification.isValid).toBe(false);
      expect(verification.error).toContain('expirado');
    });
  });

  describe('Detecção Heurística de Scrapers e Crawlers (OWASP OAT-011)', () => {
    it('deve detectar bots clássicos (Python Requests, Scrapy, HeadlessChrome)', () => {
      const headersPython = {
        'user-agent': 'python-requests/2.31.0',
        'accept': '*/*'
      };
      const resPython = detectCrawlerHeuristics(headersPython);
      expect(resPython.isCrawler).toBe(true);
      expect(resPython.threatScore).toBeGreaterThanOrEqual(75);
      expect(resPython.threatCategory).toBe('DATA_SCRAPING_OAT011');

      const headersHeadless = {
        'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36',
        'accept': 'text/html,application/xhtml+xml'
      };
      const resHeadless = detectCrawlerHeuristics(headersHeadless);
      expect(resHeadless.isCrawler).toBe(true);
      expect(resHeadless.threatCategory).toBe('HEADLESS_BOT_PROBE');
    });

    it('deve detectar requisição suspeita sem User-Agent ou sem Accept', () => {
      const emptyHeaders = {};
      const res = detectCrawlerHeuristics(emptyHeaders);
      expect(res.isCrawler).toBe(true);
      expect(res.threatScore).toBeGreaterThanOrEqual(50);
      expect(res.detectedVectors).toContain('MISSING_USER_AGENT');
    });

    it('deve atribuir pontuação segura para navegador humano legítimo', () => {
      const legitBrowserHeaders = {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        'sec-fetch-mode': 'navigate'
      };

      const res = detectCrawlerHeuristics(legitBrowserHeaders);
      expect(res.isCrawler).toBe(false);
      expect(res.threatScore).toBe(0);
      expect(res.detectedVectors).toHaveLength(0);
    });
  });

  describe('Cálculo de Atraso e Estrangulamento Tarpit', () => {
    it('deve calcular delays progressivos conforme a quantidade de reincidências', () => {
      const calc1 = calculateTarpitDelay(1, 'DATA_SCRAPING_OAT011');
      expect(calc1.severityLevel).toBe('MILD');
      expect(calc1.delayMs).toBeGreaterThanOrEqual(1500);

      const calc2 = calculateTarpitDelay(2, 'DATA_SCRAPING_OAT011');
      expect(calc2.severityLevel).toBe('ELEVATED');
      expect(calc2.delayMs).toBeGreaterThan(calc1.delayMs);

      const calc3 = calculateTarpitDelay(3, 'DATA_SCRAPING_OAT011');
      expect(calc3.severityLevel).toBe('SEVERE');
      expect(calc3.delayMs).toBeGreaterThan(calc2.delayMs);

      const calcMax = calculateTarpitDelay(5, 'HEADLESS_BOT_PROBE');
      expect(calcMax.severityLevel).toBe('MAXIMUM');
      expect(calcMax.delayMs).toBeLessThanOrEqual(45000);
    });
  });

  describe('Selo Notarial WORM de Mitigação Tarpit', () => {
    it('deve gerar selo WORM inviolável e verificar autenticidade forense', () => {
      const nowIso = new Date().toISOString();
      const seal = generateTarpitDefenseSeal({
        trapId: 'trap_forensic_01',
        clientIp: '198.51.100.99',
        threatCategory: 'DATA_SCRAPING_OAT011',
        delayMs: 18000,
        trappedAt: nowIso
      }, testSecret);

      expect(seal.startsWith('tarpit_proof_v1_')).toBe(true);

      const verification = verifyTarpitDefenseSeal(seal, testSecret);
      expect(verification.isValid).toBe(true);
      expect(verification.trapId).toBe('trap_forensic_01');
      expect(verification.clientIp).toBe('198.51.100.99');
      expect(verification.delayMs).toBe(18000);
      expect(verification.details).toContain('fé pública');
    });

    it('deve acusar quebra de integridade caso o selo WORM seja adulterado', () => {
      const nowIso = new Date().toISOString();
      const seal = generateTarpitDefenseSeal({
        trapId: 'trap_forensic_02',
        clientIp: '198.51.100.88',
        threatCategory: 'ACCOUNT_ENUMERATION_OAT020',
        delayMs: 6000,
        trappedAt: nowIso
      }, testSecret);

      // Decodifica, adultera o delay e re-empacota
      const rawB64 = seal.slice('tarpit_proof_v1_'.length);
      const obj = JSON.parse(Buffer.from(rawB64, 'base64url').toString('utf8'));
      obj.canonicalPayload.delayMs = 0; // Atacante tentando fingir que não houve delay
      const tamperedB64 = Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
      const tamperedSeal = `tarpit_proof_v1_${tamperedB64}`;

      const verification = verifyTarpitDefenseSeal(tamperedSeal, testSecret);
      expect(verification.isValid).toBe(false);
      expect(verification.details).toContain('adulterado');
    });
  });

  describe('Operação Assíncrona de Espera Tarpit', () => {
    it('deve aguardar o tempo cooperativamente sem lançar erro', async () => {
      const start = Date.now();
      await tarpitSleep(30);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(25);
    });
  });
});
