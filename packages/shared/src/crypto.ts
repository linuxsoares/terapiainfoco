/**
 * Tipos e contratos criptográficos definidos na Seção 4 da RFC-001
 * (Envelope Encryption AES-256-GCM + Blind Indexing HMAC-SHA256)
 */

export interface EncryptedPayload {
  /** Dado criptografado em formato Base64 */
  ciphertext: string;
  /** Vetor de inicialização (IV / Nonce) de 12 bytes em formato Base64 */
  iv: string;
  /** Tag de autenticação do GCM de 16 bytes em formato Base64 */
  authTag: string;
}

export interface EnvelopeEncryptedData {
  /** Payload de dados cifrado com a DEK em AES-256-GCM */
  payload: EncryptedPayload;
  /** DEK cifrada pela KEK mestre (Cloud KMS / HSM) */
  encryptedDek: string;
}

export interface BlindIndexData {
  /** Valor HMAC-SHA256 gerado a partir do dado normalizado + salt secreto */
  hash: string;
}
