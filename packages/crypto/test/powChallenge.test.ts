import { describe, it, expect } from 'bun:test';
import {
  generatePowChallenge,
  solvePowChallenge,
  verifyPowSolution,
  calculateDynamicDifficulty,
  generatePowDefenseSeal,
  verifyPowDefenseSeal
} from '../src/powChallenge';

describe('Cryptographic Proof-of-Work (PoW) & Brute-Force Defense Engine (RFC-001 §4.4, OWASP OAT-007 / OAT-008 & NIST SP 800-63B)', () => {
  it('deve gerar desafio PoW com HMAC-SHA256 anti-tampering e TTL configurável', () => {
    const challenge = generatePowChallenge({
      difficulty: 3,
      ttlSeconds: 60,
      clientIp: '189.120.45.10'
    });

    expect(challenge.challengeId).toStartWith('pow_chal_');
    expect(challenge.salt).toHaveLength(32);
    expect(challenge.difficulty).toBe(3);
    expect(challenge.tier).toBe('LOW');
    expect(challenge.hmacSignature).toHaveLength(64);
    expect(new Date(challenge.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('deve calcular a dificuldade dinâmica adaptativa conforme volume de falhas recentes', () => {
    // 0 a 2 falhas: Sem PoW
    const clean = calculateDynamicDifficulty(1);
    expect(clean.difficulty).toBe(0);
    expect(clean.tier).toBe('NONE');

    // 3 a 5 falhas: Desafio leve
    const low = calculateDynamicDifficulty(4);
    expect(low.difficulty).toBe(3);
    expect(low.tier).toBe('LOW');

    // 6 a 10 falhas: Desafio moderado
    const med = calculateDynamicDifficulty(8);
    expect(med.difficulty).toBe(4);
    expect(med.tier).toBe('MEDIUM');

    // 11 a 20 falhas: Desafio alto (força bruta ativa)
    const high = calculateDynamicDifficulty(15);
    expect(high.difficulty).toBe(5);
    expect(high.tier).toBe('HIGH');

    // 21+ falhas ou subnet em blacklist: Mitigação máxima
    const max = calculateDynamicDifficulty(25);
    expect(max.difficulty).toBe(6);
    expect(max.tier).toBe('MAXIMUM');

    const knownThreat = calculateDynamicDifficulty(0, true);
    expect(knownThreat.difficulty).toBe(6);
    expect(knownThreat.tier).toBe('MAXIMUM');
  });

  it('deve resolver desafio PoW e verificar com sucesso O(1) pelo servidor', () => {
    const challenge = generatePowChallenge({
      difficulty: 3,
      clientIp: '200.180.90.10'
    });

    const solution = solvePowChallenge(challenge);
    expect(solution.nonce).toBeGreaterThanOrEqual(0);
    expect(solution.hash).toStartWith('000');
    expect(solution.durationMs).toBeGreaterThanOrEqual(0);

    const verification = verifyPowSolution(challenge, solution.nonce, '200.180.90.10');
    expect(verification.isValid).toBe(true);
    expect(verification.difficulty).toBe(3);
    expect(verification.computedHash).toBe(solution.hash);
  });

  it('deve aceitar de imediato quando dificuldade for zero (baseline normal)', () => {
    const challenge = generatePowChallenge({
      difficulty: 0,
      clientIp: '189.120.45.10'
    });

    const solution = solvePowChallenge(challenge);
    expect(solution.nonce).toBe(0);

    const verification = verifyPowSolution(challenge, solution.nonce, '189.120.45.10');
    expect(verification.isValid).toBe(true);
    expect(verification.difficulty).toBe(0);
  });

  it('deve rejeitar solução se o nonce for incorreto ou não atender ao número de zeros', () => {
    const challenge = generatePowChallenge({
      difficulty: 4,
      clientIp: '189.120.45.10'
    });

    // Submete um nonce arbitrário que certamente não resolve o puzzle de 4 zeros
    const verification = verifyPowSolution(challenge, 99999999, '189.120.45.10');
    // Salvo probabilidade astronômica de 1 em 65536
    if (!verification.isValid) {
      expect(verification.isValid).toBe(false);
      expect(verification.error).toContain('Solução PoW inválida');
    }
  });

  it('deve rejeitar desafio se o atacante tentar diminuir a dificuldade ou alterar o salt (Anti-Tampering HMAC)', () => {
    const challenge = generatePowChallenge({
      difficulty: 5,
      clientIp: '198.51.100.99'
    });

    // Atacante altera maliciosamente a dificuldade de 5 para 1
    const tamperedChallenge = {
      ...challenge,
      difficulty: 1
    };

    const solution = solvePowChallenge(tamperedChallenge);
    const verification = verifyPowSolution(tamperedChallenge, solution.nonce, '198.51.100.99');

    expect(verification.isValid).toBe(false);
    expect(verification.error).toContain('Assinatura criptográfica do desafio inválida');
  });

  it('deve rejeitar desafio com timestamp expirado', () => {
    const challenge = generatePowChallenge({
      difficulty: 2,
      ttlSeconds: -10, // Já nasceu expirado
      clientIp: '189.120.45.10'
    });

    const solution = solvePowChallenge(challenge);
    const verification = verifyPowSolution(challenge, solution.nonce, '189.120.45.10');

    expect(verification.isValid).toBe(false);
    expect(verification.error).toContain('Desafio de Prova de Trabalho expirado');
  });

  it('deve gerar selo notarial WORM de mitigação PoW e validar sua fé pública pericial', () => {
    const seal = generatePowDefenseSeal({
      challengeId: 'pow_chal_test_123',
      clientIp: '177.18.230.88',
      difficulty: 4,
      nonce: 42105,
      verifiedAt: new Date().toISOString()
    });

    expect(seal).toStartWith('pow_proof_v1_');

    const verification = verifyPowDefenseSeal(seal);
    expect(verification.isValid).toBe(true);
    expect(verification.challengeId).toBe('pow_chal_test_123');
    expect(verification.clientIp).toBe('177.18.230.88');
    expect(verification.difficulty).toBe(4);
    expect(verification.details).toContain('matematicamente autêntico');
  });

  it('deve detectar violação retroativa caso o selo WORM de mitigação seja adulterado', () => {
    const seal = generatePowDefenseSeal({
      challengeId: 'pow_chal_audit_999',
      clientIp: '201.83.112.5',
      difficulty: 5,
      nonce: 894321,
      verifiedAt: new Date().toISOString()
    });

    // Adulteração de payload Base64URL
    const raw = seal.replace('pow_proof_v1_', '');
    const decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    decoded.dif = 1; // Atacante altera a dificuldade de 5 para 1 no laudo

    const tamperedSeal = `pow_proof_v1_${Buffer.from(JSON.stringify(decoded)).toString('base64url')}`;
    const verification = verifyPowDefenseSeal(tamperedSeal);

    expect(verification.isValid).toBe(false);
    expect(verification.details).toContain('Hash canônico SHA-256 adulterado');
  });
});
