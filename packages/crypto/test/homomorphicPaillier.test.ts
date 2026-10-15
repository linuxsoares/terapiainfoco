import { describe, it, expect } from 'bun:test';
import {
  generatePaillierKeyPair,
  paillierEncrypt,
  paillierDecrypt,
  paillierAdd,
  paillierAddMultiple,
  paillierMultiplyScalar,
  paillierAddConstant,
  generateZkProofBit,
  verifyZkProofBit,
  encryptPatientCidCohortVector,
  aggregateCohortHomomorphic,
  decryptCohortAggregation,
  createHomomorphicProofSeal,
  verifyHomomorphicProofSeal,
  CID11_MENTAL_HEALTH_CATALOG,
  gcd,
  lcm,
  modInverse,
  modExp
} from '../src/homomorphicPaillier';

describe('Protocolo de Cifragem Homomórfica Parcial (PHE - Paillier Cryptosystem)', () => {
  const keyPair = generatePaillierKeyPair();
  const { publicKey, privateKey } = keyPair;

  describe('Fundamentos Aritméticos e Teoria dos Números', () => {
    it('deve calcular GCD corretamente com algoritmo de Euclides', () => {
      expect(gcd(54n, 24n)).toBe(6n);
      expect(gcd(101n, 103n)).toBe(1n); // Dois primos
      expect(gcd(0n, 42n)).toBe(42n);
    });

    it('deve calcular LCM corretamente', () => {
      expect(lcm(12n, 18n)).toBe(36n);
      expect(lcm(7n, 13n)).toBe(91n);
    });

    it('deve calcular inverso multiplicativo modular e satisfazer (a * inv) mod m == 1', () => {
      const a = 17n;
      const m = 3120n;
      const inv = modInverse(a, m);
      expect((a * inv) % m).toBe(1n);
    });

    it('deve executar exponenciação modular rápida de forma determinística', () => {
      expect(modExp(2n, 10n, 1000n)).toBe(24n); // 1024 mod 1000 = 24
      expect(modExp(3n, 0n, 7n)).toBe(1n);
    });
  });

  describe('Cifragem e Decifragem Homomórfica Univalorada', () => {
    it('deve cifrar e decifrar com precisão zero (m = 0)', () => {
      const encrypted = paillierEncrypt(0n, publicKey);
      expect(encrypted.ciphertext).toBeDefined();
      const decrypted = paillierDecrypt(encrypted.ciphertext, privateKey, publicKey);
      expect(decrypted).toBe(0n);
    });

    it('deve cifrar e decifrar com precisão valor unitário booleano (m = 1)', () => {
      const encrypted = paillierEncrypt(1n, publicKey);
      const decrypted = paillierDecrypt(encrypted.ciphertext, privateKey, publicKey);
      expect(decrypted).toBe(1n);
    });

    it('deve cifrar e decifrar número arbitrário positivo (m = 1337)', () => {
      const encrypted = paillierEncrypt(1337n, publicKey);
      const decrypted = paillierDecrypt(encrypted.ciphertext, privateKey, publicKey);
      expect(decrypted).toBe(1337n);
    });

    it('deve produzir textos cifrados distintos para a mesma mensagem graças ao randomizer r', () => {
      const encA = paillierEncrypt(5n, publicKey);
      const encB = paillierEncrypt(5n, publicKey);
      expect(encA.ciphertext).not.toBe(encB.ciphertext);
      expect(paillierDecrypt(encA.ciphertext, privateKey, publicKey)).toBe(5n);
      expect(paillierDecrypt(encB.ciphertext, privateKey, publicKey)).toBe(5n);
    });
  });

  describe('Propriedades Homomórficas Aditivas e Escalares', () => {
    it('deve realizar Adição Homomórfica: D(c1 * c2 mod n^2) = m1 + m2', () => {
      const m1 = 15n;
      const m2 = 27n;
      const c1 = paillierEncrypt(m1, publicKey).ciphertext;
      const c2 = paillierEncrypt(m2, publicKey).ciphertext;

      const cSum = paillierAdd(c1, c2, publicKey);
      const decryptedSum = paillierDecrypt(cSum, privateKey, publicKey);

      expect(decryptedSum).toBe(m1 + m2); // 42n
    });

    it('deve somar múltiplos textos cifrados em lote via paillierAddMultiple', () => {
      const numbers = [1n, 2n, 3n, 4n, 5n, 10n];
      const ciphertexts = numbers.map(n => paillierEncrypt(n, publicKey).ciphertext);

      const cSum = paillierAddMultiple(ciphertexts, publicKey);
      const decryptedSum = paillierDecrypt(cSum, privateKey, publicKey);

      const expectedTotal = numbers.reduce((acc, v) => acc + v, 0n);
      expect(decryptedSum).toBe(expectedTotal); // 25n
    });

    it('deve multiplicar texto cifrado por escalar: D(c^k mod n^2) = k * m', () => {
      const m = 7n;
      const k = 6n;
      const c = paillierEncrypt(m, publicKey).ciphertext;

      const cMult = paillierMultiplyScalar(c, k, publicKey);
      const decryptedMult = paillierDecrypt(cMult, privateKey, publicKey);

      expect(decryptedMult).toBe(42n);
    });

    it('deve adicionar uma constante a texto cifrado: D(c * g^k mod n^2) = m + k', () => {
      const m = 20n;
      const k = 22n;
      const c = paillierEncrypt(m, publicKey).ciphertext;

      const cAddConst = paillierAddConstant(c, k, publicKey);
      const decrypted = paillierDecrypt(cAddConst, privateKey, publicKey);

      expect(decrypted).toBe(42n);
    });
  });

  describe('Zero-Knowledge Range Proof para Domínio {0, 1}', () => {
    it('deve gerar e verificar com sucesso prova ZK para bit 0 e bit 1', () => {
      const c0 = paillierEncrypt(0n, publicKey).ciphertext;
      const proof0 = generateZkProofBit(0, c0, publicKey);
      expect(verifyZkProofBit(c0, proof0, publicKey)).toBe(true);

      const c1 = paillierEncrypt(1n, publicKey).ciphertext;
      const proof1 = generateZkProofBit(1, c1, publicKey);
      expect(verifyZkProofBit(c1, proof1, publicKey)).toBe(true);
    });

    it('deve rejeitar prova ZK se o ciphertext for adulterado ou o bit for forjado', () => {
      const c1 = paillierEncrypt(1n, publicKey).ciphertext;
      const proof1 = generateZkProofBit(1, c1, publicKey);

      // Adulteração do ciphertext
      const fakeCiphertext = c1 + '123';
      expect(verifyZkProofBit(fakeCiphertext, proof1, publicKey)).toBe(false);

      // Tentativa de passar bit incompatível
      const fakeProof = proof1.replace('_1_', '_0_');
      expect(verifyZkProofBit(c1, fakeProof, publicKey)).toBe(false);
    });
  });

  describe('Aplicação Clínica: Vetores de Prontuários CID-11 e Agregação de Coorte', () => {
    it('deve cobrir catálogo de saúde mental com 9 códigos canônicos da OMS', () => {
      expect(CID11_MENTAL_HEALTH_CATALOG.length).toBe(9);
      expect(CID11_MENTAL_HEALTH_CATALOG.some(c => c.code === '6A70')).toBe(true);
      expect(CID11_MENTAL_HEALTH_CATALOG.some(c => c.code === '6B00')).toBe(true);
      expect(CID11_MENTAL_HEALTH_CATALOG.some(c => c.code === 'MB40')).toBe(true);
    });

    it('deve cifrar vetor de diagnósticos do paciente com provas ZK para todos os CIDs', () => {
      const vector = encryptPatientCidCohortVector({
        patientBlindIndex: 'p_blind_idx_abc123',
        activeCidCodes: ['6A70', '6B00'], // Depressão e Ansiedade
        publicKey
      });

      expect(vector.patientBlindIndex).toBe('p_blind_idx_abc123');
      expect(Object.keys(vector.encryptedValues).length).toBe(CID11_MENTAL_HEALTH_CATALOG.length);
      expect(Object.keys(vector.proofOfZeroOrOne).length).toBe(CID11_MENTAL_HEALTH_CATALOG.length);

      // Validação das provas ZK geradas
      for (const item of CID11_MENTAL_HEALTH_CATALOG) {
        const c = vector.encryptedValues[item.code];
        const proof = vector.proofOfZeroOrOne[item.code];
        expect(verifyZkProofBit(c, proof, publicKey)).toBe(true);
      }
    });

    it('deve agregar coorte clínica sem jamais decifrar registros individuais e decifrar totais consolidados com autorização ética', () => {
      // 3 Pacientes com diagnósticos distintos
      const p1 = encryptPatientCidCohortVector({
        patientBlindIndex: 'patient_alpha',
        activeCidCodes: ['6A70', '6B00'], // Depressão (6A70), TAG (6B00)
        publicKey
      });

      const p2 = encryptPatientCidCohortVector({
        patientBlindIndex: 'patient_beta',
        activeCidCodes: ['6A70', '6B40'], // Depressão (6A70), TEPT (6B40)
        publicKey
      });

      const p3 = encryptPatientCidCohortVector({
        patientBlindIndex: 'patient_gamma',
        activeCidCodes: ['6B00', 'MB40'], // TAG (6B00), Burnout (MB40)
        publicKey
      });

      // Agregação Homomórfica no Servidor (Cálculo 100% cego)
      const aggregatedCiphertexts = aggregateCohortHomomorphic({
        patientVectors: [p1, p2, p3],
        publicKey
      });

      expect(aggregatedCiphertexts['6A70']).toBeDefined();
      expect(aggregatedCiphertexts['6B00']).toBeDefined();

      // Decifragem Autorizada pelo Comitê de Ética
      const { results } = decryptCohortAggregation({
        aggregatedCiphertexts,
        totalPatients: 3,
        privateKey,
        publicKey,
        authorizedBy: 'DPO_ETHICS_COMMITTEE_DR_SILVA',
        ethicsApprovalCode: 'CEP_CONEP_2026_BR_982'
      });

      // Validação dos totais esperados:
      // 6A70 (Depressão): 2 casos (66.67%)
      const dep = results.find(r => r.code === '6A70');
      expect(dep?.count).toBe(2);
      expect(dep?.prevalencePercentage).toBe(66.67);

      // 6B00 (TAG): 2 casos (66.67%)
      const ans = results.find(r => r.code === '6B00');
      expect(ans?.count).toBe(2);
      expect(ans?.prevalencePercentage).toBe(66.67);

      // 6B40 (TEPT): 1 caso (33.33%)
      const tept = results.find(r => r.code === '6B40');
      expect(tept?.count).toBe(1);
      expect(tept?.prevalencePercentage).toBe(33.33);

      // MB40 (Burnout): 1 caso (33.33%)
      const burnout = results.find(r => r.code === 'MB40');
      expect(burnout?.count).toBe(1);
      expect(burnout?.prevalencePercentage).toBe(33.33);

      // 6A20 (Esquizofrenia): 0 casos (0.00%)
      const sch = results.find(r => r.code === '6A20');
      expect(sch?.count).toBe(0);
      expect(sch?.prevalencePercentage).toBe(0);
    });
  });

  describe('Selo Probatório Criptográfico WORM de Agregação', () => {
    it('deve emitir e verificar selo probatório com digest SHA-256 e assinatura HMAC', () => {
      const dummyCiphertexts: Record<string, string> = {
        '6A70': '12345678901234567890',
        '6B00': '98765432109876543210'
      };

      const seal = createHomomorphicProofSeal({
        cohortId: 'cohort_sp_clinics_q4',
        aggregatedCiphertexts: dummyCiphertexts,
        totalRecords: 150,
        publicKey
      });

      expect(seal.token).toMatch(/^phe_seal_v1_cohort_sp_clinics_q4_/);
      expect(seal.canonicalDigest).toHaveLength(64);
      expect(seal.hmacSignature).toHaveLength(64);

      const isValid = verifyHomomorphicProofSeal({
        seal,
        aggregatedCiphertexts: dummyCiphertexts,
        publicKey
      });
      expect(isValid).toBe(true);
    });

    it('deve detectar violação caso qualquer texto cifrado seja adulterado', () => {
      const dummyCiphertexts: Record<string, string> = {
        '6A70': '12345678901234567890',
        '6B00': '98765432109876543210'
      };

      const seal = createHomomorphicProofSeal({
        cohortId: 'cohort_sp_clinics_q4',
        aggregatedCiphertexts: dummyCiphertexts,
        totalRecords: 150,
        publicKey
      });

      // Adulteração de dados
      const tamperedCiphertexts = {
        ...dummyCiphertexts,
        '6A70': '99999999999999999999'
      };

      const isValid = verifyHomomorphicProofSeal({
        seal,
        aggregatedCiphertexts: tamperedCiphertexts,
        publicKey
      });
      expect(isValid).toBe(false);
    });
  });
});
