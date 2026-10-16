import { describe, it, expect } from 'bun:test';
import { 
  gfAdd, 
  gfSub, 
  gfMul, 
  gfDiv, 
  evaluatePolynomial, 
  interpolateLagrangeAtZero,
  splitSecretBytes,
  reconstructSecretBytes,
  sealClinicalRecord,
  unsealClinicalRecord,
  computeShareChecksum,
  validateShareIntegrity,
  createThresholdProofSeal,
  verifyThresholdProofSeal
} from '../src/shamirSecretSharingEngine';
import { AuditAction, CustodianRole } from '@terapiainfoco/shared';

describe('Shamir Secret Sharing & Threshold Cryptography Engine (CFP nº 001/2009 & LGPD Art. 11)', () => {
  const masterKey = 'test_threshold_worm_hmac_master_key_secret_2026';

  describe('Aritmética de Corpo Finito GF(256)', () => {
    it('deve realizar adição e subtração idênticas via XOR em GF(256)', () => {
      expect(gfAdd(5, 5)).toBe(0);
      expect(gfSub(5, 5)).toBe(0);
      expect(gfAdd(10, 3)).toBe(9); // 10 ^ 3 = 9
      expect(gfSub(9, 3)).toBe(10);
    });

    it('deve cumprir as propriedades de multiplicação e divisão em GF(256)', () => {
      expect(gfMul(0, 42)).toBe(0);
      expect(gfMul(42, 0)).toBe(0);
      expect(gfMul(1, 42)).toBe(42);
      expect(gfMul(42, 1)).toBe(42);

      // Inversão: a / b * b = a
      const a = 137;
      const b = 53;
      const quotient = gfDiv(a, b);
      const reconstructed = gfMul(quotient, b);
      expect(reconstructed).toBe(a);
    });

    it('deve lançar erro em caso de divisão por zero em GF(256)', () => {
      expect(() => gfDiv(42, 0)).toThrow('Divisão por zero em GF(256)');
    });

    it('deve avaliar polinômio de grau 2 e interpolar Lagrange em x=0 com precisão exata', () => {
      // P(x) = 42 + 15*x + 7*x^2
      const poly = new Uint8Array([42, 15, 7]);
      const x1 = 1, y1 = evaluatePolynomial(poly, x1);
      const x2 = 2, y2 = evaluatePolynomial(poly, x2);
      const x3 = 3, y3 = evaluatePolynomial(poly, x3);

      const recoveredP0 = interpolateLagrangeAtZero([
        { x: x1, y: y1 },
        { x: x2, y: y2 },
        { x: x3, y: y3 }
      ]);

      expect(recoveredP0).toBe(42);
    });
  });

  describe('Divisão e Reconstrução de Bytes com Shamir (t-of-n)', () => {
    it('deve dividir uma chave AES de 32 bytes em 5 cotas e reconstruir com quaisquer 3 cotas', () => {
      const originalKey = new Uint8Array([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
        17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32
      ]);

      const threshold = 3;
      const totalShares = 5;

      const shares = splitSecretBytes(originalKey, threshold, totalShares);
      expect(shares).toHaveLength(5);
      shares.forEach((s, idx) => {
        expect(s.shareIndex).toBe(idx + 1);
        expect(s.data).toHaveLength(32);
        // Cada cota individual deve ser diferente da chave original
        expect(s.data).not.toEqual(originalKey);
      });

      // Teste Subconjunto 1: Cotas 1, 2, 3
      const recovered1 = reconstructSecretBytes([shares[0], shares[1], shares[2]], threshold);
      expect(recovered1).toEqual(originalKey);

      // Teste Subconjunto 2: Cotas 2, 4, 5
      const recovered2 = reconstructSecretBytes([shares[1], shares[3], shares[4]], threshold);
      expect(recovered2).toEqual(originalKey);

      // Teste Subconjunto 3: Cotas 1, 3, 5
      const recovered3 = reconstructSecretBytes([shares[0], shares[2], shares[4]], threshold);
      expect(recovered3).toEqual(originalKey);
    });

    it('deve falhar se o número de cotas for inferior ao threshold (segurança teórica de informação)', () => {
      const secret = new Uint8Array([100, 200, 50, 75]);
      const threshold = 3;
      const shares = splitSecretBytes(secret, threshold, 4);

      // Apenas 2 cotas fornecidas
      expect(() => reconstructSecretBytes([shares[0], shares[1]], threshold)).toThrow(
        'Quorum insuficiente: 2 cotas recebidas, threshold é 3'
      );
    });

    it('deve rejeitar cotas com índices duplicados', () => {
      const secret = new Uint8Array([1, 2, 3]);
      const shares = splitSecretBytes(secret, 2, 3);

      expect(() => reconstructSecretBytes([shares[0], shares[0]], 2)).toThrow(
        'Cota duplicada detectada: índice 1'
      );
    });

    it('deve validar limites de threshold e total de cotas', () => {
      const secret = new Uint8Array([42]);
      expect(() => splitSecretBytes(secret, 1, 3)).toThrow('Threshold mínimo deve ser 2');
      expect(() => splitSecretBytes(secret, 4, 3)).toThrow('não pode ser inferior ao threshold');
      expect(() => splitSecretBytes(secret, 2, 255)).toThrow('excede a capacidade do corpo finito');
      expect(() => splitSecretBytes(new Uint8Array([]), 2, 3)).toThrow('não pode ser vazio');
    });
  });

  describe('Cifragem e Decifragem Completa de Prontuário Clínico (AES-256-GCM + SSS)', () => {
    const recordContent = 'PACIENTE: Mariana Vasconcelos. NOTA SOAP CONFIDENCIAL: Relato de ideação sob estresse agudo, histórico familiar preservado sob segredo de justiça CNJ 0005432-11.2026.8.26.0100.';
    const custodians = [
      { role: CustodianRole.LEAD_PSYCHOLOGIST, name: 'Dra. Daniela Silva - CRP 06/12345' },
      { role: CustodianRole.DPO_OFFICER, name: 'Carlos Mendes - Encarregado LGPD' },
      { role: CustodianRole.ETHICS_COMMITTEE_CHAIR, name: 'Dra. Beatriz Santos - Comissão Ética CRP' },
      { role: CustodianRole.LEGAL_COUNSEL, name: 'Dr. Roberto Prado - Assessor Jurídico' },
      { role: CustodianRole.JUDICIAL_OFFICER, name: 'Oficial João Ferreira - Tribunal de Justiça' }
    ];

    it('deve selar o prontuário e permitir decifragem colegiada apenas com quorum >= 3', () => {
      const sealed = sealClinicalRecord(recordContent, 3, 5, custodians);

      expect(sealed.cipheredRecordPayload).toBeDefined();
      expect(sealed.ivHex).toHaveLength(24); // 12 bytes = 24 hex
      expect(sealed.authTagHex).toHaveLength(32); // 16 bytes = 32 hex
      expect(sealed.generatedShares).toHaveLength(5);
      expect(sealed.generatedShares[0].custodianRole).toBe(CustodianRole.LEAD_PSYCHOLOGIST);

      // Validação de integridade das cotas
      sealed.generatedShares.forEach((s) => {
        expect(validateShareIntegrity(s)).toBe(true);
      });

      // Decifragem com Quorum de 3 Custodiantes: Psicólogo, DPO e Juízo
      const quorumShares = [
        sealed.generatedShares[0],
        sealed.generatedShares[1],
        sealed.generatedShares[4]
      ];

      const unsealed = unsealClinicalRecord(
        sealed.cipheredRecordPayload,
        sealed.ivHex,
        sealed.authTagHex,
        quorumShares,
        3
      );

      expect(unsealed.decryptedText).toBe(recordContent);
      expect(unsealed.recoveredKeyHex).toHaveLength(64); // 32 bytes = 64 hex
    });

    it('deve rejeitar decifragem se uma das cotas estiver corrompida ou falsificada', () => {
      const sealed = sealClinicalRecord(recordContent, 3, 5, custodians);

      const corruptedShare = {
        ...sealed.generatedShares[0],
        shareData: sealed.generatedShares[0].shareData.replace('a', 'b') // Altera 1 char
      };

      const quorumWithCorrupted = [
        corruptedShare,
        sealed.generatedShares[1],
        sealed.generatedShares[2]
      ];

      expect(() => {
        unsealClinicalRecord(
          sealed.cipheredRecordPayload,
          sealed.ivHex,
          sealed.authTagHex,
          quorumWithCorrupted,
          3
        );
      }).toThrow('possui checksum corrompido ou foi adulterada');
    });
  });

  describe('Selo Probatório WORM RFC 8785 (JSON Canonicalization Scheme)', () => {
    it('deve gerar selo probatório inviolável e validar autenticidade com sucesso', () => {
      const seal = createThresholdProofSeal(
        'vault_cnj_987654',
        AuditAction.QUORUM_RECONSTRUCTION_SUCCESS,
        {
          custodians: [CustodianRole.LEAD_PSYCHOLOGIST, CustodianRole.DPO_OFFICER, CustodianRole.ETHICS_COMMITTEE_CHAIR],
          threshold: 3,
          legalCaseNumber: '0005432-11.2026.8.26.0100'
        },
        masterKey
      );

      expect(seal.sealToken).toMatch(/^threshold_v1_/);
      expect(seal.canonicalDigest).toHaveLength(64);
      expect(seal.action).toBe(AuditAction.QUORUM_RECONSTRUCTION_SUCCESS);

      const verification = verifyThresholdProofSeal(seal.sealToken, masterKey);
      expect(verification.isValid).toBe(true);
      expect(verification.payload.vaultId).toBe('vault_cnj_987654');
    });

    it('deve rejeitar selo probatório com assinatura inválida ou adulterada', () => {
      const seal = createThresholdProofSeal(
        'vault_cnj_987654',
        AuditAction.COURT_ORDER_RECORD_DECRYPTED,
        { case: '123' },
        masterKey
      );

      const verification = verifyThresholdProofSeal(seal.sealToken, 'wrong_master_key_999');
      expect(verification.isValid).toBe(false);
      expect(verification.message).toContain('Assinatura do selo probatório adulterada ou forjada');
    });
  });
});
