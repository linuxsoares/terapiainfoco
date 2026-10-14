import { describe, expect, it } from 'bun:test';
import {
  modExp,
  randomBigInt,
  createSchnorrZkpProof,
  verifySchnorrZkpProof,
  createTherapistCrpCommitment,
  calculateZkpDigest,
  encodeZkpToken,
  decodeZkpToken,
  ZKP_PARAMS
} from '../src/zkpProof';
import { ZkpProofType } from '@terapiainfoco/shared';

describe('Zero-Knowledge Proofs Engine (Schnorr NIZK / Fiat-Shamir - RFC-001 §3.4, §3.5 & CFP 006/2019)', () => {
  const secretKey = 'private-signing-key-for-dr-gilmar-crp-06-12345';
  const context = 'DOC_TYPE=LAUDO|ISSUED_AT=2026-10-14T10:00:00Z|CRP_COMMITMENT=hash123';

  it('deve calcular exponenciação modular com precisão matemática', () => {
    // 2^10 mod 1000 = 1024 mod 1000 = 24
    expect(modExp(2n, 10n, 1000n)).toBe(24n);
    // 3^5 mod 7 = 243 mod 7 = 5
    expect(modExp(3n, 5n, 7n)).toBe(5n);
  });

  it('deve gerar e verificar prova Schnorr ZKP legítima com 100% de sucesso sem expor o segredo', () => {
    const proof = createSchnorrZkpProof({
      secretValue: secretKey,
      contextMetadata: context
    });

    expect(proof.commitHex).toBeDefined();
    expect(proof.challengeHex).toBeDefined();
    expect(proof.responseHex).toBeDefined();
    expect(proof.publicKeyCommitmentHex).toBeDefined();

    const verification = verifySchnorrZkpProof({
      proof,
      contextMetadata: context
    });

    expect(verification.valid).toBe(true);
    expect(verification.reason).toBeUndefined();
  });

  it('deve rejeitar prova se a resposta Schnorr for adulterada (Anti-Forgery)', () => {
    const proof = createSchnorrZkpProof({
      secretValue: secretKey,
      contextMetadata: context
    });

    const tamperedProof = {
      ...proof,
      responseHex: (BigInt('0x' + proof.responseHex) + 1n).toString(16)
    };

    const verification = verifySchnorrZkpProof({
      proof: tamperedProof,
      contextMetadata: context
    });

    expect(verification.valid).toBe(false);
    expect(verification.reason).toContain('Equação de Schnorr violada');
  });

  it('deve rejeitar prova se o contexto de validação (ex: tipo de documento) for alterado', () => {
    const proof = createSchnorrZkpProof({
      secretValue: secretKey,
      contextMetadata: context
    });

    const verification = verifySchnorrZkpProof({
      proof,
      contextMetadata: 'DOC_TYPE=ATESTADO_ALTERADO|ISSUED_AT=2026-10-14T10:00:00Z'
    });

    expect(verification.valid).toBe(false);
    expect(verification.reason).toContain('Desafio Fiat-Shamir inválido');
  });

  it('deve gerar compromisso cego determinístico para o CRP do profissional', () => {
    const commitment1 = createTherapistCrpCommitment('CRP-06/98765', 'salt-secreto-fixo');
    const commitment2 = createTherapistCrpCommitment('crp-06/98765', 'salt-secreto-fixo');

    expect(commitment1).toBe(commitment2);
    expect(commitment1).toHaveLength(64);
  });

  it('deve gerar digest probatório canônico SHA-256 WORM', () => {
    const digest = calculateZkpDigest({
      proofId: 'proof-zkp-001',
      documentId: 'doc-cfp-999',
      crpCommitment: 'comm-123',
      documentType: 'LAUDO_PSICOLOGICO',
      challengeHex: 'beef',
      commitHex: 'feed'
    });

    expect(digest).toBeDefined();
    expect(digest).toHaveLength(64);
  });

  it('deve codificar e decodificar token público Zero-Knowledge com prefixo zkp_v1_', () => {
    const proof = createSchnorrZkpProof({
      secretValue: secretKey,
      contextMetadata: context
    });

    const fullProof = {
      proofId: 'proof-zkp-1234',
      documentId: 'doc-relatorio-555',
      proofType: ZkpProofType.FULL_FORENSIC_ZKP,
      therapistId: 'therapist-01',
      therapistCrpCommitment: 'crp-comm-abc',
      documentTypeClaim: 'Relatório Psicológico',
      documentIssuedAt: '2026-10-14T10:00:00Z',
      schnorrProof: proof,
      publicVerificationToken: '',
      probatoryWormDigest: 'digest-worm-777',
      createdAt: '2026-10-14T10:00:00Z',
      expiresAt: '2027-10-14T10:00:00Z'
    };

    const token = encodeZkpToken(fullProof);
    expect(token.startsWith('zkp_v1_')).toBe(true);

    const decoded = decodeZkpToken(token);
    expect(decoded.proofId).toBe(fullProof.proofId);
    expect(decoded.schnorrProof.commitHex).toBe(proof.commitHex);
    expect(decoded.documentTypeClaim).toBe(fullProof.documentTypeClaim);
  });

  it('deve falhar a decodificação de token sem o prefixo zkp_v1_', () => {
    expect(() => decodeZkpToken('invalid_prefix_token')).toThrow('Prefixo de token ZKP inválido');
  });
});
