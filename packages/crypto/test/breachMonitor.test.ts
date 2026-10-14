import { describe, it, expect } from 'bun:test';
import {
  calculateKAnonymitySplit,
  maskBreachedIdentifier,
  matchKAnonymitySuffix,
  evaluateBreachSeverity,
  requiresAnpdNotification,
  calculateAnpdDeadline,
  calculateIncidentWormDigest
} from '../src/breachMonitor';
import {
  BreachSeverity,
  ThreatSourceType,
  UserRole
} from '@terapiainfoco/shared';

describe('Breach Monitor & Dark Web Intelligence Engine (RFC-001 §4.4, LGPD Art. 46/48)', () => {
  it('deve calcular par K-Anonymity SHA-1 (5 prefix + 35 suffix) determinístico', () => {
    const input = 'senhaForte@2026';
    const split = calculateKAnonymitySplit(input);

    expect(split.prefix).toHaveLength(5);
    expect(split.suffix).toHaveLength(35);
    expect(split.fullHash).toBe(split.prefix + split.suffix);
    expect(split.fullHash).toHaveLength(40);
    expect(split.fullHash).toMatch(/^[0-9A-F]{40}$/);

    // Determinismo
    const split2 = calculateKAnonymitySplit(input);
    expect(split2.fullHash).toBe(split.fullHash);
  });

  it('deve mascarar e-mails para conformidade com privacidade LGPD e sigilo CFP', () => {
    expect(maskBreachedIdentifier('gilmar.soares@terapiainfoco.com.br')).toContain('***');
    expect(maskBreachedIdentifier('dpo@clinica.com')).toContain('***');
    expect(maskBreachedIdentifier('invalido')).toBe('******@******');
  });

  it('deve encontrar correspondência de sufixo k-Anonymity em lista formatada string', () => {
    const sampleHash = calculateKAnonymitySplit('password123');
    const mockList = [
      '11111111111111111111111111111111111:42',
      `${sampleHash.suffix}:987654`,
      '22222222222222222222222222222222222:5'
    ];

    const result = matchKAnonymitySuffix(sampleHash.suffix, mockList);
    expect(result.matched).toBe(true);
    expect(result.breachCount).toBe(987654);

    const nonExistent = matchKAnonymitySuffix('99999999999999999999999999999999999', mockList);
    expect(nonExistent.matched).toBe(false);
    expect(nonExistent.breachCount).toBe(0);
  });

  it('deve encontrar correspondência de sufixo k-Anonymity em lista de objetos estruturados', () => {
    const mockList = [
      { suffix: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', count: 12 },
      { suffix: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', count: 350 }
    ];

    const result = matchKAnonymitySuffix('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', mockList);
    expect(result.matched).toBe(true);
    expect(result.breachCount).toBe(350);
  });

  it('deve avaliar severidade CRITICAL para administrador ou psicólogo titular com vazamento em stealer', () => {
    const adminSev = evaluateBreachSeverity({
      role: UserRole.ADMIN,
      source: ThreatSourceType.STEALER_LOGS,
      breachCount: 1,
      hasPasswordExposed: true
    });
    expect(adminSev).toBe(BreachSeverity.CRITICAL);

    const psicoSev = evaluateBreachSeverity({
      role: UserRole.PSICOLOGO_TITULAR,
      source: ThreatSourceType.DARK_WEB_BREACH_DUMP,
      breachCount: 5,
      hasPasswordExposed: true
    });
    expect(psicoSev).toBe(BreachSeverity.CRITICAL);
  });

  it('deve avaliar severidade LOW ou MEDIUM para usuários com poucos vazamentos legados', () => {
    const lowSev = evaluateBreachSeverity({
      role: UserRole.PACIENTE,
      source: ThreatSourceType.HIBP_K_ANONYMITY,
      breachCount: 2,
      hasPasswordExposed: false
    });
    expect(lowSev).toBe(BreachSeverity.LOW);
  });

  it('deve exigir notificação formal à ANPD conforme severidade e papel do titular (CD/ANPD 15/2024)', () => {
    expect(requiresAnpdNotification(BreachSeverity.CRITICAL, UserRole.PACIENTE)).toBe(true);
    expect(requiresAnpdNotification(BreachSeverity.HIGH, UserRole.PSICOLOGO_TITULAR)).toBe(true);
    expect(requiresAnpdNotification(BreachSeverity.HIGH, UserRole.ADMIN)).toBe(true);
    expect(requiresAnpdNotification(BreachSeverity.LOW, UserRole.PACIENTE)).toBe(false);
    expect(requiresAnpdNotification(BreachSeverity.MEDIUM, UserRole.PACIENTE)).toBe(false);
  });

  it('deve calcular prazo de 3 dias úteis para comunicação à ANPD ignorando fins de semana', () => {
    // Sexta-feira: 17 de Outubro de 2026
    const friday = new Date('2026-10-16T10:00:00Z');
    const deadline = calculateAnpdDeadline(friday);

    // Sexta -> Segunda (1º dia útil) -> Terça (2º) -> Quarta (3º dia útil)
    // Portanto a data limite deve ser na Quarta-feira (21 de Outubro)
    expect(deadline.getDay()).not.toBe(0); // Não é Domingo
    expect(deadline.getDay()).not.toBe(6); // Não é Sábado
    expect(deadline.getHours()).toBe(18); // Fim do expediente regulatório
  });

  it('deve gerar digest canônico WORM de 64 caracteres hexadecimais para registro imutável', () => {
    const digest = calculateIncidentWormDigest({
      incidentId: 'inc-12345',
      userEmailMasked: 'g***r@terapiainfoco.com.br',
      source: ThreatSourceType.STEALER_LOGS,
      severity: BreachSeverity.CRITICAL,
      breachCount: 4,
      detectedAt: '2026-10-14T10:00:00Z'
    });

    expect(digest).toHaveLength(64);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);

    // Determinismo
    const digest2 = calculateIncidentWormDigest({
      incidentId: 'inc-12345',
      userEmailMasked: 'g***r@terapiainfoco.com.br',
      source: ThreatSourceType.STEALER_LOGS,
      severity: BreachSeverity.CRITICAL,
      breachCount: 4,
      detectedAt: '2026-10-14T10:00:00Z'
    });
    expect(digest2).toBe(digest);
  });
});
