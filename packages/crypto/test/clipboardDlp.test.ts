import { describe, expect, it } from 'bun:test';
import {
  binaryToString,
  binaryToZeroWidth,
  calculateContentDigest,
  countZeroWidthCharacters,
  embedSteganographicWatermark,
  evaluateClipboardPolicyEngine,
  extractSteganographicWatermark,
  maskSensitiveDataForClipboard,
  stringToBinary,
  stripZeroWidthWatermark,
  zeroWidthToBinary,
  analyzeDlpRisk,
  ZW_ZERO,
  ZW_ONE,
  ZW_END
} from '../src/clipboardDlp';
import { DlpPolicyMode, DlpRiskLevel, SteganographyInspectionStatus } from '@terapiainfoco/shared';

describe('Data Loss Prevention (DLP) & Zero-Width Steganography Engine (LGPD Art. 46 / CFP nº 001/2009)', () => {
  const secretKey = 'test_secret_dlp_forensic_key_2026';

  const sampleClinicalNote = `
S (Subjetivo): Paciente relata crises recorrentes de ansiedade e insônia nas últimas três semanas.
O (Objetivo): Lúcida, orientada no tempo e espaço, afeto reativo com humor ansioso.
A (Avaliação): Hipótese diagnóstica de Transtorno de Ansiedade Generalizada (F41.1).
P (Plano): Técnicas de respiração diafragmática e agendamento de retorno em 7 dias.
  `.trim();

  it('deve codificar e decodificar binário UTF-8 e Zero-Width de forma perfeitamente reversível', () => {
    const originalText = 'Psi-2026';
    const binary = stringToBinary(originalText);
    expect(binary.length).toBe(originalText.length * 8);

    const decodedText = binaryToString(binary);
    expect(decodedText).toBe(originalText);

    const zw = binaryToZeroWidth(binary);
    expect(countZeroWidthCharacters(zw)).toBe(binary.length);

    const recoveredBinary = zeroWidthToBinary(zw);
    expect(recoveredBinary).toBe(binary);
    expect(binaryToString(recoveredBinary)).toBe(originalText);
  });

  it('deve embutir marca d\'água esteganográfica sem corromper o texto visível legível', () => {
    const result = embedSteganographicWatermark(
      sampleClinicalNote,
      {
        operatorId: 'psi_mariana_123',
        operatorName: 'Dra. Mariana Silva',
        patientId: 'pat_joao_456',
        patientName: 'João da Silva',
        sessionOrRecordId: 'rec_soap_789'
      },
      secretKey
    );

    expect(result.watermarkedText).toBeDefined();
    expect(result.invisibleCharsCount).toBeGreaterThan(50);
    expect(result.payload.operatorId).toBe('psi_mariana_123');
    expect(result.payload.patientId).toBe('pat_joao_456');

    // Ao remover os caracteres invisíveis, o texto deve ser 100% idêntico ao original
    const cleaned = stripZeroWidthWatermark(result.watermarkedText);
    expect(cleaned).toBe(sampleClinicalNote);
  });

  it('deve extrair e validar com 100% de sucesso uma marca d\'água autêntica (GENUINE_WATERMARK)', () => {
    const { watermarkedText } = embedSteganographicWatermark(
      sampleClinicalNote,
      {
        operatorId: 'psi_carlos_999',
        operatorName: 'Dr. Carlos Pereira',
        patientId: 'pat_ana_888',
        patientName: 'Ana Souza'
      },
      secretKey
    );

    const inspection = extractSteganographicWatermark(watermarkedText, secretKey);

    expect(inspection.status).toBe(SteganographyInspectionStatus.GENUINE_WATERMARK);
    expect(inspection.hasZeroWidthChars).toBe(true);
    expect(inspection.extractedIntegrity).toBe(true);
    expect(inspection.payload).not.toBeNull();
    expect(inspection.payload?.operatorId).toBe('psi_carlos_999');
    expect(inspection.payload?.patientId).toBe('pat_ana_888');
    expect(inspection.sourceNotice).toContain('psi_carlos_999');
    expect(inspection.sourceNotice).toContain('pat_ana_888');
  });

  it('deve detectar marca d\'água mesmo se o texto for parcialmente recortado em vazamento externo', () => {
    const { watermarkedText } = embedSteganographicWatermark(
      sampleClinicalNote,
      {
        operatorId: 'psi_vazador_007',
        patientId: 'pat_sigiloso_111'
      },
      secretKey
    );

    // Simular que o vazador copiou/colou apenas a primeira frase visível contendo a marca d'água
    const markerEnd = watermarkedText.indexOf(ZW_END) + ZW_END.length;
    const leakedFragment = watermarkedText.substring(0, markerEnd + 30);
    const inspection = extractSteganographicWatermark(leakedFragment, secretKey);

    expect(inspection.status).toBe(SteganographyInspectionStatus.GENUINE_WATERMARK);
    expect(inspection.payload?.operatorId).toBe('psi_vazador_007');
    expect(inspection.payload?.patientId).toBe('pat_sigiloso_111');
    // Como o texto visível circundante foi recortado, extractedIntegrity é false, mas a autoria do vazamento é comprovada
    expect(inspection.extractedIntegrity).toBe(false);
  });

  it('deve acusar TAMPERED_WATERMARK se o segredo for inválido ou se a assinatura for forjada', () => {
    const { watermarkedText } = embedSteganographicWatermark(
      sampleClinicalNote,
      {
        operatorId: 'psi_123',
        patientId: 'pat_456'
      },
      secretKey
    );

    // Tentar inspecionar com segredo errado
    const inspectionWrongSecret = extractSteganographicWatermark(watermarkedText, 'wrong_secret_attacker');
    expect(inspectionWrongSecret.status).toBe(SteganographyInspectionStatus.TAMPERED_WATERMARK);
    expect(inspectionWrongSecret.message).toContain('Assinatura criptográfica HMAC incompatível');
  });

  it('deve retornar NO_WATERMARK para textos comuns sem caracteres zero-width', () => {
    const regularText = 'Texto normal sem qualquer marca d\'água ou caractere invisível.';
    const inspection = extractSteganographicWatermark(regularText, secretKey);

    expect(inspection.status).toBe(SteganographyInspectionStatus.NO_WATERMARK);
    expect(inspection.hasZeroWidthChars).toBe(false);
    expect(inspection.zeroWidthCharCount).toBe(0);
    expect(inspection.payload).toBeNull();
  });

  it('deve retornar INVALID_PAYLOAD para texto com caracteres invisíveis soltos sem delimitador', () => {
    const corruptedText = `Texto comum com lixo ${ZW_ZERO}${ZW_ONE}${ZW_ZERO} no meio`;
    const inspection = extractSteganographicWatermark(corruptedText, secretKey);

    expect(inspection.status).toBe(SteganographyInspectionStatus.INVALID_PAYLOAD);
    expect(inspection.hasZeroWidthChars).toBe(true);
    expect(inspection.payload).toBeNull();
  });

  it('deve avaliar o nível de risco de exfiltração corretamente (LOW, MEDIUM, HIGH, CRITICAL)', () => {
    expect(analyzeDlpRisk('Olá, bom dia!')).toBe(DlpRiskLevel.LOW);
    expect(analyzeDlpRisk('Paciente compareceu à consulta para reagendamento.', 'PATIENT_PROFILE')).toBe(DlpRiskLevel.MEDIUM);
    expect(analyzeDlpRisk(sampleClinicalNote, 'SOAP_NOTES')).toBe(DlpRiskLevel.HIGH);

    const hugeClinicalText = `${sampleClinicalNote} `.repeat(15);
    expect(analyzeDlpRisk(hugeClinicalText)).toBe(DlpRiskLevel.CRITICAL);
  });

  it('deve mascarar CPFs e e-mails sensíveis na função maskSensitiveDataForClipboard', () => {
    const raw = 'O paciente João (CPF: 123.456.789-00, e-mail: joao.silva@provedor.com.br) compareceu à sessão.';
    const masked = maskSensitiveDataForClipboard(raw);

    expect(masked).not.toContain('123.456.789-00');
    expect(masked).toContain('123.***.***-00');
    expect(masked).not.toContain('joao.silva@provedor.com.br');
  });

  it('deve aplicar a política BLOCK_EXFILTRATION impedindo cópias massivas de prontuários', () => {
    const hugeClinicalText = `${sampleClinicalNote} `.repeat(20);

    const evalResult = evaluateClipboardPolicyEngine({
      text: hugeClinicalText,
      operatorId: 'psi_123',
      patientId: 'pat_456',
      policyMode: DlpPolicyMode.BLOCK_EXFILTRATION,
      maxBulkLength: 1000,
      secret: secretKey
    });

    expect(evalResult.allowed).toBe(false);
    expect(evalResult.action).toBe(DlpPolicyMode.BLOCK_EXFILTRATION);
    expect(evalResult.rejectionReason).toContain('bloqueada pela política DLP');
    expect(evalResult.transformedText).toBe('');
  });

  it('deve aplicar a política WATERMARK_AND_NOTICE injetando disclaimer e marca esteganográfica', () => {
    const evalResult = evaluateClipboardPolicyEngine({
      text: sampleClinicalNote,
      operatorId: 'psi_lucas',
      operatorName: 'Dr. Lucas Ribeiro',
      patientId: 'pat_paula',
      policyMode: DlpPolicyMode.WATERMARK_AND_NOTICE,
      secret: secretKey
    });

    expect(evalResult.allowed).toBe(true);
    expect(evalResult.disclaimerText).toBeDefined();
    expect(evalResult.disclaimerText).toContain('CONFIDENCIAL — SIGILO PROFISSIONAL');
    expect(evalResult.transformedText).toContain('Dr. Lucas Ribeiro');

    // Inspecionar o texto transformado
    const inspection = extractSteganographicWatermark(evalResult.transformedText, secretKey);
    expect(inspection.status).toBe(SteganographyInspectionStatus.GENUINE_WATERMARK);
    expect(inspection.payload?.operatorId).toBe('psi_lucas');
  });
});
