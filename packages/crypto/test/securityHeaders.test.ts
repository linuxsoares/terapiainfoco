import { describe, it, expect } from 'bun:test';
import {
  RECOMMENDED_SECURITY_HEADERS,
  isHoneypotProbePath,
  evaluateSecurityHeaders
} from '../src/securityHeaders';

describe('HTTP Security Hardening & Honeypot Engine (RFC-001 §4.4, §5.2)', () => {
  it('deve conter especificações dos 9 cabeçalhos de segurança recomendados pela OWASP', () => {
    const keys = Object.keys(RECOMMENDED_SECURITY_HEADERS);
    expect(keys).toHaveLength(9);
    expect(keys).toContain('content-security-policy');
    expect(keys).toContain('strict-transport-security');
    expect(keys).toContain('x-content-type-options');
    expect(keys).toContain('x-frame-options');
    expect(keys).toContain('x-xss-protection');
    expect(keys).toContain('referrer-policy');
    expect(keys).toContain('permissions-policy');
    expect(keys).toContain('cross-origin-opener-policy');
    expect(keys).toContain('cross-origin-resource-policy');
  });

  it('deve detectar probes automatizados de ataque (Honeypot Traps)', () => {
    expect(isHoneypotProbePath('/.env')).toBe(true);
    expect(isHoneypotProbePath('/.env.production')).toBe(true);
    expect(isHoneypotProbePath('/.git/config')).toBe(true);
    expect(isHoneypotProbePath('/wp-admin/index.php')).toBe(true);
    expect(isHoneypotProbePath('/wp-login.php')).toBe(true);
    expect(isHoneypotProbePath('/phpmyadmin/')).toBe(true);
    expect(isHoneypotProbePath('/actuator/health')).toBe(true);
    expect(isHoneypotProbePath('/shell')).toBe(true);
    expect(isHoneypotProbePath('/cgi-bin/test.cgi')).toBe(true);

    // Rotas legítimas do sistema
    expect(isHoneypotProbePath('/api/appointments')).toBe(false);
    expect(isHoneypotProbePath('/api/auth/login')).toBe(false);
    expect(isHoneypotProbePath('/api/patients/123')).toBe(false);
    expect(isHoneypotProbePath('/health')).toBe(false);
  });

  it('deve avaliar cabeçalhos com Score 100% e Grau A+ quando todas as diretrizes estiverem ativas', () => {
    const sampleHeaders: Record<string, string> = {};
    for (const [key, spec] of Object.entries(RECOMMENDED_SECURITY_HEADERS)) {
      sampleHeaders[key] = spec.value;
    }

    const evaluation = evaluateSecurityHeaders(sampleHeaders);
    expect(evaluation.scorePercentage).toBe(100);
    expect(evaluation.grade).toBe('A+');
    expect(evaluation.totalPassed).toBe(9);
    expect(evaluation.totalChecks).toBe(9);
    expect(evaluation.checks.every((c) => c.status === 'PASS')).toBe(true);
  });

  it('deve penalizar e acusar falhas quando cabeçalhos críticos estiverem ausentes', () => {
    // Apenas HSTS e X-Content-Type-Options presentes
    const partialHeaders = {
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'X-Content-Type-Options': 'nosniff'
    };

    const evaluation = evaluateSecurityHeaders(partialHeaders);
    expect(evaluation.scorePercentage).toBeLessThan(50);
    expect(evaluation.grade).toBe('F');
    expect(evaluation.totalPassed).toBe(2);

    const cspCheck = evaluation.checks.find((c) => c.header === 'content-security-policy');
    expect(cspCheck?.present).toBe(false);
    expect(cspCheck?.status).toBe('FAIL');
  });

  it('deve suportar instâncias de Headers com case-insensitivity nativo', () => {
    const h = new Headers();
    for (const [key, spec] of Object.entries(RECOMMENDED_SECURITY_HEADERS)) {
      h.set(key.toUpperCase(), spec.value);
    }

    const evaluation = evaluateSecurityHeaders(h);
    expect(evaluation.scorePercentage).toBe(100);
    expect(evaluation.grade).toBe('A+');
  });
});
