import { describe, it, expect } from 'bun:test';
import {
  modPow,
  extendedGcd,
  gcd,
  modInverse,
  hexToBigInt,
  bigIntToHex,
  fullDomainHash,
  generateBlindKeyPair,
  blindMessage,
  signBlindMessage,
  unblindSignature,
  createUnblindedToken,
  verifyBlindSignature,
  computeNullifier,
  issueBlindProofSeal,
  verifyBlindProofSeal,
  canonicalStringify,
  REPRESENTATIVE_ETHICAL_CASES,
  REPRESENTATIVE_CLINICAL_VOUCHERS
} from '../src/blindSignaturesCrypto';
import {
  BlindSignatureScheme,
  BlindSignaturePurpose,
  BlindSignatureStatus,
  BlindBallotDecision
} from '@terapiainfoco/shared';

describe('Chaumian Blind Signatures Crypto Engine (David Chaum 1982 / RFC 9474 & CFP 001/2009)', () => {
  // 1. Aritmética Modular de Alta Precisão
  describe('Primitivas Aritméticas Modulares (BigInt)', () => {
    it('deve computar modPow corretamente para pequenos e grandes inteiros', () => {
      // 3^4 mod 5 = 81 mod 5 = 1
      expect(modPow(3n, 4n, 5n)).toBe(1n);
      // 7^13 mod 19 = 7
      expect(modPow(7n, 13n, 19n)).toBe(7n);

      const base = 0x123456789abcdef0123456789abcdef0n;
      const exp = 65537n;
      const mod = 0xffffffffffffffffffffffffffffffffn;
      const result = modPow(base, exp, mod);
      expect(result > 0n).toBe(true);
      expect(result < mod).toBe(true);
    });

    it('deve calcular GCD e Inverso Modular via Algoritmo de Euclides Estendido', () => {
      expect(gcd(48n, 18n)).toBe(6n);
      expect(gcd(17n, 31n)).toBe(1n); // Primos entre si

      // Inverso de 3 mod 11: 3 * 4 = 12 = 1 mod 11 => 4
      const inv = modInverse(3n, 11n);
      expect(inv).toBe(4n);
      expect((3n * inv) % 11n).toBe(1n);

      // Inverso de 65537 mod (p-1)(q-1) em teste pequeno
      const p = 61n, q = 53n;
      const phi = (p - 1n) * (q - 1n); // 60 * 52 = 3120
      const e = 17n;
      const d = modInverse(e, phi);
      expect((e * d) % phi).toBe(1n);
    });

    it('deve converter corretamente entre Hex e BigInt', () => {
      const val = 12345678901234567890n;
      const hex = bigIntToHex(val);
      const restored = hexToBigInt(hex);
      expect(restored).toBe(val);
    });
  });

  // 2. Geração de Chaves RSA da Autoridade
  describe('Geração de Chaves da Autoridade Emissora', () => {
    it('deve gerar par de chaves RSA-2048 com expoente e=65537 e componentes modulares válidos', () => {
      const keyPair = generateBlindKeyPair(
        BlindSignatureScheme.RSA_BLIND_2048,
        'Tribunal de Ética do CRP-06 / Conselho Pleno',
        'AUTORIDADE_EMISSORA_COLEGIADO'
      );

      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.publicKey.scheme).toBe(BlindSignatureScheme.RSA_BLIND_2048);
      expect(keyPair.publicKey.authorityName).toContain('Tribunal de Ética do CRP-06');

      const N = hexToBigInt(keyPair.publicKey.modulusHex);
      const e = hexToBigInt(keyPair.publicKey.publicExponentHex);
      const d = hexToBigInt(keyPair.privateKey!.privateExponentHex);

      expect(e).toBe(65537n);
      expect(N > 0n).toBe(true);
      expect(d > 0n).toBe(true);
      expect(keyPair.publicKey.fingerprint).toHaveLength(64);
    });
  });

  // 3. Ciclo Completo: Cegamento, Assinatura Cega, Descegamento e Verificação
  describe('Ciclo Ponta a Ponta: Cegamento Chaumiano & Fé Pública', () => {
    const keyPair = generateBlindKeyPair(BlindSignatureScheme.RSA_BLIND_2048);
    const purpose = BlindSignaturePurpose.ETHICAL_COMMITTEE_BALLOT;
    const ballotMessage = 'VOTO_COLEGIADO:CASO_2026_089:DECISAO_FAVORAVEL_ARQUIVAMENTO';

    it('deve realizar o cegamento no cliente gerando m\' diferente do digest original h', () => {
      const blinded = blindMessage(ballotMessage, purpose, keyPair.publicKey);

      expect(blinded.blindedMessageHex).toBeDefined();
      expect(blinded.blindingFactorHex).toBeDefined();
      expect(blinded.messageDigestHex).toBeDefined();
      expect(blinded.originalMessage).toBe(ballotMessage);

      // A mensagem cega m' deve ser matematicamente diferente do hash h
      expect(blinded.blindedMessageHex).not.toBe(blinded.messageDigestHex);
    });

    it('deve assinar a mensagem cega pela autoridade sem conhecer o voto ou o fator r', () => {
      const blinded = blindMessage(ballotMessage, purpose, keyPair.publicKey);
      const signedResponse = signBlindMessage(
        blinded.blindedMessageHex,
        keyPair.privateKey!,
        keyPair.publicKey
      );

      expect(signedResponse.blindSignatureHex).toBeDefined();
      expect(signedResponse.authorityKeyId).toBe(keyPair.publicKey.keyId);
    });

    it('deve descegar no cliente obtendo uma assinatura perfeitamente válida sobre h', () => {
      const blinded = blindMessage(ballotMessage, purpose, keyPair.publicKey);
      const signedResponse = signBlindMessage(
        blinded.blindedMessageHex,
        keyPair.privateKey!,
        keyPair.publicKey
      );

      const unblindedSigHex = unblindSignature(
        signedResponse.blindSignatureHex,
        blinded.blindingFactorHex!,
        keyPair.publicKey
      );

      // Verificação matemática interna: s^e mod N === h
      const N = hexToBigInt(keyPair.publicKey.modulusHex);
      const e = hexToBigInt(keyPair.publicKey.publicExponentHex);
      const s = hexToBigInt(unblindedSigHex);
      const h = hexToBigInt(blinded.messageDigestHex);

      const sPowE = modPow(s, e, N);
      expect(sPowE).toBe(h);

      // Criação do token descegado
      const token = createUnblindedToken(
        ballotMessage,
        unblindedSigHex,
        purpose,
        keyPair.publicKey.keyId,
        keyPair.publicKey.scheme,
        keyPair.publicKey
      );

      expect(token.status).toBe(BlindSignatureStatus.UNBLINDED);
      expect(token.nullifierHash).toHaveLength(64);
    });

    it('deve atestar fé pública na verificação da assinatura descegada', () => {
      const blinded = blindMessage(ballotMessage, purpose, keyPair.publicKey);
      const signedResponse = signBlindMessage(
        blinded.blindedMessageHex,
        keyPair.privateKey!,
        keyPair.publicKey
      );
      const unblindedSigHex = unblindSignature(
        signedResponse.blindSignatureHex,
        blinded.blindingFactorHex!,
        keyPair.publicKey
      );

      const result = verifyBlindSignature(
        ballotMessage,
        unblindedSigHex,
        keyPair.publicKey,
        purpose,
        false
      );

      expect(result.valid).toBe(true);
      expect(result.mathematicalProofValid).toBe(true);
      expect(result.authorityVerified).toBe(true);
      expect(result.doubleSpendDetected).toBe(false);
      expect(result.publicFaithAttestation).toContain('FÉ PÚBLICA CONFIRMADA');
      expect(result.unlinkedClientGuaranteed).toBe(true);
      expect(result.proofSeal).toBeDefined();
    });

    it('deve rejeitar voto com mensagem adulterada (integridade matemática)', () => {
      const blinded = blindMessage(ballotMessage, purpose, keyPair.publicKey);
      const signedResponse = signBlindMessage(
        blinded.blindedMessageHex,
        keyPair.privateKey!,
        keyPair.publicKey
      );
      const unblindedSigHex = unblindSignature(
        signedResponse.blindSignatureHex,
        blinded.blindingFactorHex!,
        keyPair.publicKey
      );

      // Mensagem forjada/adulterada
      const tamperedMessage = 'VOTO_COLEGIADO:CASO_2026_089:DECISAO_FORJADA_SANCAO_MAXIMA';
      const result = verifyBlindSignature(
        tamperedMessage,
        unblindedSigHex,
        keyPair.publicKey,
        purpose,
        false
      );

      expect(result.valid).toBe(false);
      expect(result.mathematicalProofValid).toBe(false);
      expect(result.authorityVerified).toBe(false);
      expect(result.message).toContain('FALHA DE VERIFICAÇÃO');
    });

    it('deve detectar e bloquear tentativa de voto duplo / resgate duplicado (Double-Spending)', () => {
      const blinded = blindMessage(ballotMessage, purpose, keyPair.publicKey);
      const signedResponse = signBlindMessage(
        blinded.blindedMessageHex,
        keyPair.privateKey!,
        keyPair.publicKey
      );
      const unblindedSigHex = unblindSignature(
        signedResponse.blindSignatureHex,
        blinded.blindingFactorHex!,
        keyPair.publicKey
      );

      // Simula verificação de token já resgatado (isAlreadyRedeemed = true)
      const result = verifyBlindSignature(
        ballotMessage,
        unblindedSigHex,
        keyPair.publicKey,
        purpose,
        true
      );

      expect(result.valid).toBe(false);
      expect(result.doubleSpendDetected).toBe(true);
      expect(result.message).toContain('Double-Spending Blocked');
    });
  });

  // 4. Selos Probatórios WORM e Canonicalização
  describe('Selo Probatório WORM HMAC-SHA256 & RFC 8785', () => {
    it('deve gerar canonicalStringify determinística independente da ordem de chaves', () => {
      const objA = { z: 1, a: 2, m: { y: 10, x: 20 } };
      const objB = { a: 2, z: 1, m: { x: 20, y: 10 } };
      expect(canonicalStringify(objA)).toBe(canonicalStringify(objB));
    });

    it('deve emitir e verificar selo probatório com sucesso', () => {
      const payload = { testCase: 'CFP_CHAUMIAN_VERIFICATION', crp: '06/123456' };
      const seal = issueBlindProofSeal(
        'op_test_123',
        BlindSignaturePurpose.ETHICAL_COMMITTEE_BALLOT,
        BlindSignatureScheme.RSA_BLIND_2048,
        payload
      );

      expect(seal.sealToken).toContain('blind_proof_v1_');
      const valid = verifyBlindProofSeal(seal, payload);
      expect(valid).toBe(true);

      // Adulteração no payload deve invalidar o selo
      const tamperedPayload = { ...payload, testCase: 'ADULTERADO' };
      const tamperedValid = verifyBlindProofSeal(seal, tamperedPayload);
      expect(tamperedValid).toBe(false);
    });
  });

  // 5. Casos Clínicos e Prescrições Representativas
  describe('Presets Clínicos & Vouchers Psiquiátricos Desvinculados', () => {
    it('deve conter casos de bioética e deliberação do CFP devidamente definidos', () => {
      expect(REPRESENTATIVE_ETHICAL_CASES.length).toBeGreaterThanOrEqual(3);
      for (const item of REPRESENTATIVE_ETHICAL_CASES) {
        expect(item.caseNumber).toBeDefined();
        expect(item.proposedDecision).toBeDefined();
      }
    });

    it('deve processar voucher de encaminhamento psiquiátrico com assinatura cega', () => {
      const keyPair = generateBlindKeyPair(BlindSignatureScheme.RSA_BLIND_2048);
      const voucherPreset = REPRESENTATIVE_CLINICAL_VOUCHERS[0];
      const voucherText = `VOUCHER_ENCS:${voucherPreset.medicalSpecialty}:${voucherPreset.urgencyLevel}:${voucherPreset.patientClinicalAlias}`;

      const blinded = blindMessage(voucherText, BlindSignaturePurpose.PSYCHIATRIC_REFERRAL_VOUCHER, keyPair.publicKey);
      const signed = signBlindMessage(blinded.blindedMessageHex, keyPair.privateKey!, keyPair.publicKey);
      const unblindedSigHex = unblindSignature(signed.blindSignatureHex, blinded.blindingFactorHex!, keyPair.publicKey);

      const verification = verifyBlindSignature(
        voucherText,
        unblindedSigHex,
        keyPair.publicKey,
        BlindSignaturePurpose.PSYCHIATRIC_REFERRAL_VOUCHER,
        false
      );

      expect(verification.valid).toBe(true);
      expect(verification.purpose).toBe(BlindSignaturePurpose.PSYCHIATRIC_REFERRAL_VOUCHER);
    });
  });
});
