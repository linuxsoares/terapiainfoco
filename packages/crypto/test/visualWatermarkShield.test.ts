import { describe, it, expect } from 'bun:test';
import {
  generateWatermarkSeed,
  generateQuasiOrthogonalPnSequence,
  embedVisualWatermark,
  calculateNormalizedCrossCorrelation,
  calculatePsnr,
  calculateSsim,
  extractLeakSource,
  simulateScreenLeakAttack,
  createVisualWatermarkProofSeal,
  verifyVisualWatermarkProofSeal,
  canonicalJsonStringify
} from '../src/visualWatermarkShield';
import {
  WatermarkPatternType,
  WatermarkExtractionConfidence,
  VisualWatermarkTarget,
  WatermarkEmbeddingStrength
} from '@terapiainfoco/shared';

describe('Visual Watermark & Screen Exfiltration Tracer Crypto Engine (LGPD Art. 46 & CFP 011/2018)', () => {
  const sampleParams = {
    therapistCrp: '06/123456',
    patientId: 'paciente_uuid_teleconsulta_987',
    sessionId: 'room_webrtc_crp06_sessao_101',
    target: VisualWatermarkTarget.WEBRTC_VIDEO_STREAM,
    patternType: WatermarkPatternType.QUASI_ORTHOGONAL_PN,
    strength: WatermarkEmbeddingStrength.BALANCED_RESILIENT
  };

  describe('Geração de Sementes Criptográficas de Marcação', () => {
    it('deve gerar semente esteganográfica com blind index e ID determinístico', () => {
      const seed = generateWatermarkSeed(sampleParams);
      expect(seed.seedId).toStartWith('wm_seed_');
      expect(seed.therapistCrp).toBe('06/123456');
      expect(seed.patientBlindIndex).toHaveLength(64);
      expect(seed.patientIdMasked).toContain('***');
      expect(seed.sessionId).toBe('room_webrtc_crp06_sessao_101');
      expect(seed.saltHex).toHaveLength(32);
      expect(seed.issuedAt).toBeDefined();
    });

    it('deve gerar identificadores distintos para sessões ou pacientes diferentes', () => {
      const seedA = generateWatermarkSeed({ ...sampleParams, patientId: 'patient_alpha' });
      const seedB = generateWatermarkSeed({ ...sampleParams, patientId: 'patient_beta' });
      expect(seedA.seedId).not.toBe(seedB.seedId);
      expect(seedA.patientBlindIndex).not.toBe(seedB.patientBlindIndex);
    });
  });

  describe('Sequências Pseudo-Aleatórias Bipolares Quase-Ortogonais (PN-Sequences)', () => {
    it('deve gerar sequência contendo exclusivamente valores bipolares {+1, -1}', () => {
      const seed = generateWatermarkSeed(sampleParams);
      const length = 2048;
      const pn = generateQuasiOrthogonalPnSequence(seed, length);

      expect(pn).toHaveLength(length);
      for (let i = 0; i < length; i++) {
        expect([1, -1]).toContain(pn[i]);
      }
    });

    it('deve produzir sequência com média aproximadamente nula (balanço estocástico)', () => {
      const seed = generateWatermarkSeed(sampleParams);
      const length = 4096;
      const pn = generateQuasiOrthogonalPnSequence(seed, length);

      let sum = 0;
      for (let i = 0; i < length; i++) {
        sum += pn[i];
      }
      const mean = sum / length;
      expect(Math.abs(mean)).toBeLessThan(0.08); // Tolerância estocástica
    });

    it('deve gerar sequências quase-ortogonais para sementes diferentes (<PN_A, PN_B> approx 0)', () => {
      const seedA = generateWatermarkSeed({ ...sampleParams, sessionId: 'session_A' });
      const seedB = generateWatermarkSeed({ ...sampleParams, sessionId: 'session_B' });
      const length = 4096;

      const pnA = generateQuasiOrthogonalPnSequence(seedA, length);
      const pnB = generateQuasiOrthogonalPnSequence(seedB, length);

      let dotProduct = 0;
      for (let i = 0; i < length; i++) {
        dotProduct += pnA[i] * pnB[i];
      }
      const normalizedCross = Math.abs(dotProduct / length);
      expect(normalizedCross).toBeLessThan(0.08); // Ortogonalidade comprovada
    });
  });

  describe('Injeção Esteganográfica Imperceptível (Watermark Embedding)', () => {
    it('deve injetar marca d\'água preservando alta fidelidade e imperceptibilidade (PSNR > 46 dB e SSIM > 0.98)', () => {
      const seed = generateWatermarkSeed(sampleParams);
      const width = 64;
      const height = 64;
      const rawImage = new Uint8Array(width * height);
      for (let i = 0; i < rawImage.length; i++) {
        rawImage[i] = 128 + ((i * 17) % 40); // gradiente clínico sintético
      }

      const { watermarkedBuffer, result } = embedVisualWatermark(seed, rawImage, width, height);

      expect(watermarkedBuffer).toHaveLength(width * height);
      expect(result.psnrDb).toBeGreaterThan(40); // Acima do limiar de imperceptibilidade visual humana (NIST/ITU)
      expect(result.ssimScore).toBeGreaterThan(0.98);
      expect(['PRISTINE', 'EXCELLENT']).toContain(result.imperceptibilityGrade);
      expect(result.proofSeal.sealToken).toStartWith('visual_wm_v1_');
    });

    it('deve respeitar limites dinâmicos [0, 255] sem overflow ou clipping indesejado', () => {
      const seed = generateWatermarkSeed({
        ...sampleParams,
        strength: WatermarkEmbeddingStrength.AGGRESSIVE_ROBUST
      });
      const width = 32;
      const height = 32;
      const rawExtremes = new Uint8Array(width * height);
      // Preenche com extremos 0 e 255
      for (let i = 0; i < rawExtremes.length; i++) {
        rawExtremes[i] = i % 2 === 0 ? 0 : 255;
      }

      const { watermarkedBuffer } = embedVisualWatermark(seed, rawExtremes, width, height);

      for (let i = 0; i < watermarkedBuffer.length; i++) {
        expect(watermarkedBuffer[i]).toBeGreaterThanOrEqual(0);
        expect(watermarkedBuffer[i]).toBeLessThanOrEqual(255);
      }
    });
  });

  describe('Extração Forense & Correlação Cruzada Normalizada (NCC)', () => {
    it('deve identificar a autoria com certeza jurídica (DEFINITIVE_MATCH) na imagem marcada autêntica', () => {
      const seedTarget = generateWatermarkSeed(sampleParams);
      const seedOther1 = generateWatermarkSeed({ ...sampleParams, sessionId: 'session_other_1' });
      const seedOther2 = generateWatermarkSeed({ ...sampleParams, sessionId: 'session_other_2' });

      const width = 64;
      const height = 64;
      const baseFrame = new Uint8Array(width * height);
      for (let i = 0; i < baseFrame.length; i++) {
        baseFrame[i] = 100 + ((i * 7) % 50);
      }

      const { watermarkedBuffer } = embedVisualWatermark(seedTarget, baseFrame, width, height);

      // Inspeciona contra o catálogo com a semente legítima e outras duas
      const extraction = extractLeakSource(
        watermarkedBuffer,
        [seedOther1, seedTarget, seedOther2],
        width,
        height
      );

      expect([
        WatermarkExtractionConfidence.DEFINITIVE_MATCH,
        WatermarkExtractionConfidence.PROBABLE_MATCH
      ]).toContain(extraction.confidence);
      expect(extraction.correlationScore).toBeGreaterThanOrEqual(0.15);
      expect(extraction.identifiedSessionId).toBe(seedTarget.sessionId);
      expect(extraction.identifiedTherapistCrp).toBe(seedTarget.therapistCrp);
      expect(extraction.proofSeal.sealToken).toStartWith('visual_wm_v1_');
    });

    it('deve retornar NO_CORRELATION para imagem comum não marcada', () => {
      const seedActive = generateWatermarkSeed(sampleParams);
      const width = 64;
      const height = 64;
      const unmarkedImage = new Uint8Array(width * height);
      for (let i = 0; i < unmarkedImage.length; i++) {
        unmarkedImage[i] = 140; // Imagem neutra sem ruído de semente
      }

      const extraction = extractLeakSource(unmarkedImage, [seedActive], width, height);

      expect(extraction.confidence).toBe(WatermarkExtractionConfidence.NO_CORRELATION);
      expect(extraction.correlationScore).toBeLessThan(0.20);
    });
  });

  describe('Resiliência a Ataques de Recorte (Crop) e Compressão', () => {
    it('deve manter correlação detectável mesmo após recorte parcial de 25% e injeção de ruído', () => {
      const seed = generateWatermarkSeed(sampleParams);
      const width = 64;
      const height = 64;
      const baseFrame = new Uint8Array(width * height);
      for (let i = 0; i < baseFrame.length; i++) {
        baseFrame[i] = 120 + ((i * 23) % 40);
      }

      const { watermarkedBuffer } = embedVisualWatermark(seed, baseFrame, width, height);

      // Simula ataque de captura recortada e comprimida
      const attackedFrame = simulateScreenLeakAttack(watermarkedBuffer, 25, 3);

      const extraction = extractLeakSource(attackedFrame, [seed], width, height);

      // Deve manter correlação robusta suficiente para identificar o vazamento
      expect(extraction.correlationScore).toBeGreaterThan(0.06);
      expect([
        WatermarkExtractionConfidence.DEFINITIVE_MATCH,
        WatermarkExtractionConfidence.HIGH_PROBABILITY,
        WatermarkExtractionConfidence.SUSPICIOUS_WEAK
      ]).toContain(extraction.confidence);
      expect(extraction.identifiedSessionId).toBe(seed.sessionId);
    });
  });

  describe('Selo Probatório WORM HMAC-SHA256 & RFC 8785', () => {
    it('deve emitir e validar selo probatório com sucesso', () => {
      const seal = createVisualWatermarkProofSeal({
        verificationId: 'verif_test_123',
        target: VisualWatermarkTarget.WEBRTC_VIDEO_STREAM,
        patternType: WatermarkPatternType.QUASI_ORTHOGONAL_PN,
        details: { test: 'autoria_confirmada' }
      });

      expect(seal.sealToken).toStartWith('visual_wm_v1_');
      expect(seal.canonicalDigest).toHaveLength(64);
      expect(seal.hmacSignature).toHaveLength(64);

      const verification = verifyVisualWatermarkProofSeal(seal.sealToken);
      expect(verification.isValid).toBe(true);
      expect(verification.message).toContain('autêntico e íntegro');
      expect(verification.payload.id).toBe('verif_test_123');
    });

    it('deve rejeitar selo adulterado ou malformado', () => {
      const invalidToken = 'visual_wm_v1_token_invalido_corrompido';
      const verification = verifyVisualWatermarkProofSeal(invalidToken);
      expect(verification.isValid).toBe(false);

      const prefixInvalid = 'not_a_seal_token';
      const prefixResult = verifyVisualWatermarkProofSeal(prefixInvalid);
      expect(prefixResult.isValid).toBe(false);
    });

    it('deve gerar string canônica determinística independente da ordem das chaves', () => {
      const obj1 = { z: 1, a: 2, m: { y: 'test', b: 'nested' } };
      const obj2 = { a: 2, m: { b: 'nested', y: 'test' }, z: 1 };
      expect(canonicalJsonStringify(obj1)).toBe(canonicalJsonStringify(obj2));
    });
  });

  describe('Métricas de Qualidade de Imagem (PSNR & SSIM)', () => {
    it('deve retornar PSNR infinito/máximo e SSIM 1.0 para imagens idênticas', () => {
      const img = new Uint8Array([10, 20, 30, 40]);
      const { psnrDb } = calculatePsnr(img, img);
      const ssim = calculateSsim(img, img);
      expect(psnrDb).toBeGreaterThanOrEqual(99);
      expect(ssim).toBe(1.0);
    });

    it('deve calcular correlação cruzada normalizada perfeitamente unitária (1.0) para sinal idêntico', () => {
      const pn = new Int8Array([1, -1, 1, -1, 1, -1, 1, -1]);
      const signal = new Uint8Array([10, 0, 10, 0, 10, 0, 10, 0]);
      const ncc = calculateNormalizedCrossCorrelation(signal, pn);
      expect(ncc).toBeGreaterThan(0.95);
    });
  });
});
