import { pbkdf2Sync, randomBytes } from 'node:crypto';
import type { EncryptedExportPackage } from '@terapiainfoco/shared';
import { encryptAesGcm, decryptAesGcm } from './cipher';

const KDF_ITERATIONS = 100_000;
const KEY_LEN_BYTES = 32; // 256 bits
const SALT_LEN_BYTES = 16; // 128 bits

/**
 * Criptografa o pacote de portabilidade com senha definida pelo usuário ou terapeuta.
 * Utiliza derivação PBKDF2-HMAC-SHA512 (100.000 iterações) e cifra autenticada AES-256-GCM.
 */
export function encryptPackageWithPassphrase(
  plaintext: string,
  passphrase: string,
  patientId: string
): EncryptedExportPackage {
  if (!passphrase || passphrase.trim().length < 6) {
    throw new Error('A frase secreta de exportação deve conter no mínimo 6 caracteres.');
  }

  const salt = randomBytes(SALT_LEN_BYTES);
  const derivedKey = pbkdf2Sync(passphrase, salt, KDF_ITERATIONS, KEY_LEN_BYTES, 'sha512');

  const encrypted = encryptAesGcm(plaintext, derivedKey);

  return {
    encrypted: true,
    algorithm: 'aes-256-gcm',
    kdf: 'pbkdf2-sha512',
    kdfIterations: KDF_ITERATIONS,
    saltBase64: salt.toString('base64'),
    ivBase64: encrypted.iv,
    authTagBase64: encrypted.authTag,
    ciphertextBase64: encrypted.ciphertext,
    exportedAt: new Date().toISOString(),
    patientId,
    disclaimer: 'Pacote protegido por criptografia de ponta a ponta (AES-256-GCM + PBKDF2). Para decifrar, é obrigatório utilizar a senha cadastrada na geração.'
  };
}

/**
 * Decripta e valida a autenticidade do pacote de portabilidade protegido por senha.
 * Lança erro caso a senha esteja incorreta ou os dados tenham sido adulterados.
 */
export function decryptPackageWithPassphrase(
  pkg: EncryptedExportPackage,
  passphrase: string
): string {
  if (!passphrase) {
    throw new Error('Frase secreta obrigatória para decifrar pacote.');
  }

  const salt = Buffer.from(pkg.saltBase64, 'base64');
  const derivedKey = pbkdf2Sync(passphrase, salt, pkg.kdfIterations, KEY_LEN_BYTES, 'sha512');

  return decryptAesGcm(
    {
      ciphertext: pkg.ciphertextBase64,
      iv: pkg.ivBase64,
      authTag: pkg.authTagBase64
    },
    derivedKey
  );
}
