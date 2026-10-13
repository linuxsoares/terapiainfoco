import { describe, it, expect } from 'bun:test';
import { LocalKmsProvider } from '../src/kms';
import { EnvelopeEncryptionService } from '../src/envelope';
import { KmsKeyStatus } from '@terapiainfoco/shared';

describe('Ciclo de Vida de Chaves KMS & Rotação Contínua (NIST SP 800-57 & RFC-001 §4.2)', () => {
  it('deve inicializar com KEK versão 1 ativa e metadados válidos', async () => {
    const kms = new LocalKmsProvider();
    expect(kms.getActiveKeyVersion()).toBe(1);

    const meta = await kms.getKeyMetadata();
    expect(meta).toBeDefined();
    expect(meta?.version).toBe(1);
    expect(meta?.status).toBe(KmsKeyStatus.ACTIVE);
    expect(meta?.algorithm).toBe('AES-256-GCM');
    expect(meta?.encryptedDeksCount).toBe(0);
    expect(meta?.rotatedAt).toBeNull();
  });

  it('deve gerar DEK com identificador de versão v1 e permitir decifragem íntegra', async () => {
    const kms = new LocalKmsProvider();
    const { plaintextKey, encryptedKey } = await kms.generateDataKey();

    expect(encryptedKey.startsWith('v1:')).toBe(true);
    expect(plaintextKey.length).toBe(32);

    const decryptedKey = await kms.decryptDataKey(encryptedKey);
    expect(decryptedKey).toEqual(plaintextKey);

    const meta = await kms.getKeyMetadata(1);
    expect(meta?.encryptedDeksCount).toBe(1);
  });

  it('deve garantir 100% de compatibilidade reversa com DEKs legadas sem prefixo de versão', async () => {
    const kms = new LocalKmsProvider();
    const { plaintextKey, encryptedKey } = await kms.generateDataKey();

    // Remove o prefixo "v1:" simulando uma chave gerada em versões anteriores do sistema
    const legacyRawBase64 = encryptedKey.replace(/^v\d+:/, '');
    expect(legacyRawBase64.includes(':')).toBe(false);

    const decryptedKey = await kms.decryptDataKey(legacyRawBase64);
    expect(decryptedKey).toEqual(plaintextKey);
  });

  it('deve rotacionar Master Key KEK para versão 2 mantendo versionamento e ciclo de vida', async () => {
    const kms = new LocalKmsProvider();

    // Gera DEK na v1
    const dekV1 = await kms.generateDataKey();
    expect(dekV1.encryptedKey.startsWith('v1:')).toBe(true);

    // Rotaciona para v2
    const newKeyMeta = await kms.rotateMasterKey('Auditoria anual NIST SP 800-57');
    expect(newKeyMeta.version).toBe(2);
    expect(newKeyMeta.status).toBe(KmsKeyStatus.ACTIVE);
    expect(kms.getActiveKeyVersion()).toBe(2);

    // Metadado da v1 agora é ROTATED
    const oldKeyMeta = await kms.getKeyMetadata(1);
    expect(oldKeyMeta?.status).toBe(KmsKeyStatus.ROTATED);
    expect(oldKeyMeta?.rotatedAt).toBeDefined();
    expect(oldKeyMeta?.rotationReason).toBe('Auditoria anual NIST SP 800-57');

    // Novas DEKs são geradas na v2
    const dekV2 = await kms.generateDataKey();
    expect(dekV2.encryptedKey.startsWith('v2:')).toBe(true);

    // Ambas as DEKs continuam sendo decifradas de forma transparente pelo KMS
    const decV1 = await kms.decryptDataKey(dekV1.encryptedKey);
    const decV2 = await kms.decryptDataKey(dekV2.encryptedKey);

    expect(decV1).toEqual(dekV1.plaintextKey);
    expect(decV2).toEqual(dekV2.plaintextKey);
  });

  it('deve executar re-wrapping de DEK migrando da v1 para a v2 sem expor dados', async () => {
    const kms = new LocalKmsProvider();
    const { plaintextKey, encryptedKey: oldEncryptedKey } = await kms.generateDataKey();
    expect(oldEncryptedKey.startsWith('v1:')).toBe(true);

    // Rotação de KEK
    await kms.rotateMasterKey('Rotação de segurança preventiva');
    expect(kms.getActiveKeyVersion()).toBe(2);

    // Re-wrap da DEK legada
    const reWrappedKey = await kms.reWrapDataKey(oldEncryptedKey);
    expect(reWrappedKey.startsWith('v2:')).toBe(true);
    expect(reWrappedKey).not.toBe(oldEncryptedKey);

    // A nova chave na v2 decifra exatamente para a DEK original
    const decryptedKey = await kms.decryptDataKey(reWrappedKey);
    expect(decryptedKey).toEqual(plaintextKey);
  });

  it('deve executar reWrapEnvelope preservando o payload de dados clínicos intacto', async () => {
    const kms = new LocalKmsProvider();
    const envelopeService = new EnvelopeEncryptionService(kms);

    const clinicalNote = 'Paciente relatou sintomas de ansiedade generalizada sob estresse ocupacional.';
    const originalEnvelope = await envelopeService.encrypt(clinicalNote);

    expect(originalEnvelope.encryptedDek.startsWith('v1:')).toBe(true);

    // Rotaciona KEK para v2
    await kms.rotateMasterKey('Auto-rotation agendada');

    // Re-envelopa a DEK
    const reWrappedEnvelope = await envelopeService.reWrapEnvelope(originalEnvelope);

    // O payload cifrado é IDÊNTICO (nenhum re-processamento do texto clínico foi necessário!)
    expect(reWrappedEnvelope.payload).toEqual(originalEnvelope.payload);
    // Mas a DEK foi promovida para a v2
    expect(reWrappedEnvelope.encryptedDek.startsWith('v2:')).toBe(true);

    // A decifragem da nota continua perfeita
    const decryptedNote = await envelopeService.decrypt(reWrappedEnvelope);
    expect(decryptedNote).toBe(clinicalNote);
  });

  it('deve listar histórico completo de chaves e permitir revogação de chaves legadas', async () => {
    const kms = new LocalKmsProvider();
    await kms.rotateMasterKey('Rotação 1');
    await kms.rotateMasterKey('Rotação 2');

    const keys = await kms.listKeys();
    expect(keys.length).toBe(3);
    expect(keys[0].version).toBe(3);
    expect(keys[0].status).toBe(KmsKeyStatus.ACTIVE);
    expect(keys[1].version).toBe(2);
    expect(keys[1].status).toBe(KmsKeyStatus.ROTATED);
    expect(keys[2].version).toBe(1);
    expect(keys[2].status).toBe(KmsKeyStatus.ROTATED);

    // Tentar revogar a versão ativa atual deve ser barrado
    expect(kms.revokeKeyVersion(3, 'Tentativa indevida')).rejects.toThrow(
      'Não é permitido revogar a versão ativa da KEK'
    );

    // Revoga a versão legada 1
    const revokedMeta = await kms.revokeKeyVersion(1, 'Comprometimento teórico de chave antiga');
    expect(revokedMeta.status).toBe(KmsKeyStatus.REVOKED);
    expect(revokedMeta.revokedAt).toBeDefined();

    // Tentar decifrar DEK da versão 1 revogada agora falha por política de segurança
    const fakeV1Key = 'v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    expect(kms.decryptDataKey(fakeV1Key)).rejects.toThrow('Acesso negado: KEK versão 1 está REVOKED');
  });
});
