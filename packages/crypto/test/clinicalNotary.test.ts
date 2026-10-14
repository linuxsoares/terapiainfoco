import { describe, expect, it } from 'bun:test';
import {
  calculateClinicalCanonicalHash,
  calculateNotaryBlockHash,
  createClinicalNotaryBlock,
  decodeNotarySeal,
  encodeNotarySeal,
  generateRecordBlindIndex,
  GENESIS_NOTARY_HASH,
  verifyNotaryBlockIntegrity,
  verifyNotaryChainIntegrity
} from '../src/clinicalNotary';
import { NotaryStatus, NotaryVerificationStatus } from '@terapiainfoco/shared';

describe('Cartório Notarial Digital & Auditoria Forense Zero-Knowledge (CFP nº 001/2009 & LGPD Art. 18)', () => {
  const secretKey = 'test_notary_master_key_2026';

  const sampleRecord = {
    id: 'rec_soap_001',
    patientId: 'patient_ana_123',
    therapistId: 'therapist_mariana_456',
    therapistCrp: '06/123456',
    soapContent: 'S: Paciente relata melhora do quadro ansioso. O: Tranquila, cooperativa. A: Evolução positiva. P: Alta em 3 sessões.',
    date: '2026-10-14'
  };

  it('deve gerar Blind Index determinístico e seguro para o prontuário com prefixo bidx_rec_', () => {
    const bidx1 = generateRecordBlindIndex(sampleRecord.id, sampleRecord.patientId, secretKey);
    const bidx2 = generateRecordBlindIndex(sampleRecord.id, sampleRecord.patientId, secretKey);
    expect(bidx1).toBe(bidx2);
    expect(bidx1.startsWith('bidx_rec_')).toBe(true);

    // Diferente paciente deve gerar blind index diferente
    const bidxOther = generateRecordBlindIndex(sampleRecord.id, 'patient_other_999', secretKey);
    expect(bidx1).not.toBe(bidxOther);
  });

  it('deve calcular o hash canônico da nota clínica de forma determinística e resistente a alterações', () => {
    const hash1 = calculateClinicalCanonicalHash(sampleRecord);
    const hash2 = calculateClinicalCanonicalHash({ ...sampleRecord });
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // SHA-256

    // Alteração de uma letra no conteúdo clínico altera o hash completamente
    const tampered = calculateClinicalCanonicalHash({
      ...sampleRecord,
      soapContent: sampleRecord.soapContent + '.'
    });
    expect(hash1).not.toBe(tampered);
  });

  it('deve criar um bloco notarial com selo digital público no formato notary_v1_', () => {
    const canonicalHash = calculateClinicalCanonicalHash(sampleRecord);
    const block = createClinicalNotaryBlock({
      recordId: sampleRecord.id,
      patientId: sampleRecord.patientId,
      therapistId: sampleRecord.therapistId,
      therapistCrp: sampleRecord.therapistCrp,
      clinicalCanonicalHash: canonicalHash,
      secretKey
    });

    expect(block.notaryId).toBeDefined();
    expect(block.recordBlindIndex.startsWith('bidx_rec_')).toBe(true);
    expect(block.versionNumber).toBe(1);
    expect(block.previousNotaryHash).toBe(GENESIS_NOTARY_HASH);
    expect(block.digitalNotarySeal.startsWith('notary_v1_')).toBe(true);
    expect(block.status).toBe(NotaryStatus.NOTARIZED);
  });

  it('deve codificar e decodificar o selo notarial digital com precisão', () => {
    const blockData = {
      notaryId: 'notary_abc123',
      recordBlindIndex: 'bidx_rec_xyz789',
      blockHash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      versionNumber: 1,
      notaryTimestamp: new Date().toISOString()
    };

    const token = encodeNotarySeal(blockData);
    expect(token.startsWith('notary_v1_')).toBe(true);

    const decoded = decodeNotarySeal(token);
    expect(decoded.notaryId).toBe(blockData.notaryId);
    expect(decoded.recordBlindIndex).toBe(blockData.recordBlindIndex);
    expect(decoded.blockHash).toBe(blockData.blockHash);
    expect(decoded.versionNumber).toBe(1);
  });

  it('deve rejeitar a decodificação de token notarial sem o prefixo oficial notary_v1_', () => {
    expect(() => decodeNotarySeal('invalid_prefix_token')).toThrow(
      'Token de selo notarial inválido: prefixo notary_v1_ ausente.'
    );
  });

  it('deve verificar a integridade matemática intrínseca do bloco notarial com 100% de sucesso', () => {
    const canonicalHash = calculateClinicalCanonicalHash(sampleRecord);
    const block = createClinicalNotaryBlock({
      recordId: sampleRecord.id,
      patientId: sampleRecord.patientId,
      therapistId: sampleRecord.therapistId,
      therapistCrp: sampleRecord.therapistCrp,
      clinicalCanonicalHash: canonicalHash,
      secretKey
    });

    expect(verifyNotaryBlockIntegrity(block)).toBe(true);

    // Se o blockHash for adulterado, a validação deve falhar
    const tamperedBlock = { ...block, blockHash: '0000000000000000000000000000000000000000000000000000000000000000' };
    expect(verifyNotaryBlockIntegrity(tamperedBlock)).toBe(false);
  });

  it('deve validar cadeia notarial sequencial com múltiplos blocos encadeados (Hash-Chain Notarial)', () => {
    const canonicalHash1 = calculateClinicalCanonicalHash(sampleRecord);
    const block1 = createClinicalNotaryBlock({
      recordId: 'rec_001',
      patientId: sampleRecord.patientId,
      therapistId: sampleRecord.therapistId,
      therapistCrp: sampleRecord.therapistCrp,
      clinicalCanonicalHash: canonicalHash1,
      versionNumber: 1,
      secretKey
    });

    const canonicalHash2 = calculateClinicalCanonicalHash({
      ...sampleRecord,
      id: 'rec_002',
      soapContent: 'Segunda sessão realizada com foco em reestruturação cognitiva.'
    });
    const block2 = createClinicalNotaryBlock({
      recordId: 'rec_002',
      patientId: sampleRecord.patientId,
      therapistId: sampleRecord.therapistId,
      therapistCrp: sampleRecord.therapistCrp,
      clinicalCanonicalHash: canonicalHash2,
      previousNotaryHash: block1.blockHash,
      versionNumber: 2,
      secretKey
    });

    const canonicalHash3 = calculateClinicalCanonicalHash({
      ...sampleRecord,
      id: 'rec_003',
      soapContent: 'Terceira sessão: consolidação e planejamento de alta terapêutica.'
    });
    const block3 = createClinicalNotaryBlock({
      recordId: 'rec_003',
      patientId: sampleRecord.patientId,
      therapistId: sampleRecord.therapistId,
      therapistCrp: sampleRecord.therapistCrp,
      clinicalCanonicalHash: canonicalHash3,
      previousNotaryHash: block2.blockHash,
      versionNumber: 3,
      secretKey
    });

    const chain = [block1, block2, block3];
    const result = verifyNotaryChainIntegrity(chain);

    expect(result.valid).toBe(true);
    expect(result.status).toBe(NotaryVerificationStatus.VALID_GENUINE);
    expect(result.message).toContain('100% íntegra');
  });

  it('deve detectar quebra de cadeia se um bloco intermediário for removido (CHAIN_BROKEN)', () => {
    const canonicalHash1 = calculateClinicalCanonicalHash(sampleRecord);
    const block1 = createClinicalNotaryBlock({
      recordId: 'rec_001',
      patientId: sampleRecord.patientId,
      therapistId: sampleRecord.therapistId,
      therapistCrp: sampleRecord.therapistCrp,
      clinicalCanonicalHash: canonicalHash1,
      versionNumber: 1,
      secretKey
    });

    const block2 = createClinicalNotaryBlock({
      recordId: 'rec_002',
      patientId: sampleRecord.patientId,
      therapistId: sampleRecord.therapistId,
      therapistCrp: sampleRecord.therapistCrp,
      clinicalCanonicalHash: 'hash_bloco_2',
      previousNotaryHash: block1.blockHash,
      versionNumber: 2,
      secretKey
    });

    const block3 = createClinicalNotaryBlock({
      recordId: 'rec_003',
      patientId: sampleRecord.patientId,
      therapistId: sampleRecord.therapistId,
      therapistCrp: sampleRecord.therapistCrp,
      clinicalCanonicalHash: 'hash_bloco_3',
      previousNotaryHash: block2.blockHash,
      versionNumber: 3,
      secretKey
    });

    // Removendo o bloco 2 e tentando validar [block1, block3]
    const brokenChain = [block1, block3];
    const result = verifyNotaryChainIntegrity(brokenChain);

    expect(result.valid).toBe(false);
    expect(result.status).toBe(NotaryVerificationStatus.CHAIN_BROKEN);
    expect(result.message).toContain('Quebra na cadeia notarial');
  });
});
