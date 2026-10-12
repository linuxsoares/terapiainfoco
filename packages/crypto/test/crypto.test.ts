import { describe, expect, it } from 'bun:test';
import {
  encryptAesGcm,
  decryptAesGcm,
  generateRandomKey,
  computeBlindIndex,
  normalizeCpf,
  normalizeEmail,
  LocalKmsProvider,
  EnvelopeEncryptionService
} from '../src';

describe('AES-256-GCM Direct Cipher', () => {
  it('deve cifrar e decifrar texto clínico corretamente', () => {
    const key = generateRandomKey(32);
    const clinicalNote = 'Paciente relatou sintomas de ansiedade no ambiente corporativo.';

    const encrypted = encryptAesGcm(clinicalNote, key);

    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.authTag).toBeDefined();
    expect(encrypted.ciphertext).not.toBe(clinicalNote);

    const decrypted = decryptAesGcm(encrypted, key);
    expect(decrypted).toBe(clinicalNote);
  });

  it('deve falhar se os dados cifrados forem adulterados (GCM Auth Tag validation)', () => {
    const key = generateRandomKey(32);
    const plaintext = 'Diagnóstico confidencial';
    const encrypted = encryptAesGcm(plaintext, key);

    // Corrompe 1 caractere do ciphertext
    const tampered = {
      ...encrypted,
      ciphertext: encrypted.ciphertext.slice(0, -4) + 'AAAA'
    };

    expect(() => decryptAesGcm(tampered, key)).toThrow();
  });
});

describe('Blind Indexing (HMAC-SHA256)', () => {
  it('deve normalizar CPF e produzir o mesmo blind index de forma determinística', () => {
    const secretSalt = 'clinica-segredo-salt-2026';
    const cpf1 = '123.456.789-00';
    const cpf2 = ' 12345678900 ';

    const norm1 = normalizeCpf(cpf1);
    const norm2 = normalizeCpf(cpf2);

    expect(norm1).toBe('12345678900');
    expect(norm2).toBe('12345678900');

    const index1 = computeBlindIndex(norm1, secretSalt);
    const index2 = computeBlindIndex(norm2, secretSalt);

    expect(index1).toBe(index2);
    expect(index1).toHaveLength(64); // SHA-256 hex string length
  });

  it('deve normalizar E-mail e gerar hash idêntico', () => {
    const secretSalt = 'salt-email-seguro';
    const email1 = 'Paciente.Teste@Email.COM ';
    const email2 = 'paciente.teste@email.com';

    const index1 = computeBlindIndex(normalizeEmail(email1), secretSalt);
    const index2 = computeBlindIndex(normalizeEmail(email2), secretSalt);

    expect(index1).toBe(index2);
  });
});

describe('Envelope Encryption (RFC-001 §4.2)', () => {
  it('deve encriptar e decriptar nota SOAP usando Envelope Encryption com KMS', async () => {
    const kms = new LocalKmsProvider();
    const envelopeService = new EnvelopeEncryptionService(kms);

    const soapSubjective = 'S: Paciente refere taquicardia e insônia.';
    const envelope = await envelopeService.encrypt(soapSubjective);

    expect(envelope.encryptedDek).toBeDefined();
    expect(envelope.payload.ciphertext).not.toBe(soapSubjective);

    const decrypted = await envelopeService.decrypt(envelope);
    expect(decrypted).toBe(soapSubjective);
  });
});

describe('Passphrase Package Encryption (LGPD Art. 18 & Opção F)', () => {
  it('deve cifrar e decifrar pacote de prontuário com passphrase', async () => {
    const { encryptPackageWithPassphrase, decryptPackageWithPassphrase } = await import('../src');
    const secretPassphrase = 'SenhaSeguraDoPaciente#2026';
    const patientJson = JSON.stringify({
      patientId: 'patient-123',
      nome: 'Mariana Silva',
      soapRecords: ['S: Ansiedade moderada', 'O: Lúcida e orientada']
    });

    const encryptedPkg = encryptPackageWithPassphrase(patientJson, secretPassphrase, 'patient-123');

    expect(encryptedPkg.encrypted).toBe(true);
    expect(encryptedPkg.algorithm).toBe('aes-256-gcm');
    expect(encryptedPkg.kdf).toBe('pbkdf2-sha512');
    expect(encryptedPkg.kdfIterations).toBe(100_000);
    expect(encryptedPkg.ciphertextBase64).toBeDefined();
    expect(encryptedPkg.ciphertextBase64).not.toBe(patientJson);

    const decrypted = decryptPackageWithPassphrase(encryptedPkg, secretPassphrase);
    expect(decrypted).toBe(patientJson);
    const parsed = JSON.parse(decrypted);
    expect(parsed.patientId).toBe('patient-123');
    expect(parsed.nome).toBe('Mariana Silva');
  });

  it('deve rejeitar decifragem com senha incorreta por falha na autenticação GCM', async () => {
    const { encryptPackageWithPassphrase, decryptPackageWithPassphrase } = await import('../src');
    const correctPassphrase = 'SenhaCorreta123!';
    const wrongPassphrase = 'SenhaIncorreta999!';
    const rawData = 'Dados confidenciais protegidos por sigilo ético CFP';

    const encryptedPkg = encryptPackageWithPassphrase(rawData, correctPassphrase, 'patient-999');

    expect(() => {
      decryptPackageWithPassphrase(encryptedPkg, wrongPassphrase);
    }).toThrow();
  });

  it('deve rejeitar passphrase com menos de 6 caracteres', async () => {
    const { encryptPackageWithPassphrase } = await import('../src');
    expect(() => {
      encryptPackageWithPassphrase('dados', '12345', 'patient-001');
    }).toThrow('no mínimo 6 caracteres');
  });
});

