import crypto from 'node:crypto';

/**
 * Alfabeto Base32 padrão RFC 4648
 */
const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Decodifica uma string Base32 para Buffer
 */
export function base32Decode(str: string): Buffer {
  const clean = str.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = B32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) {
      throw new Error(`Caractere Base32 inválido: ${clean[i]}`);
    }
    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Codifica um Buffer para string Base32 (sem padding)
 */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;

    while (bits >= 5) {
      output += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += B32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Gera um segredo aleatório em formato Base32 (padrão 20 bytes = 160 bits para SHA-1)
 */
export function generateTotpSecret(byteLength: number = 20): string {
  const randomBytes = crypto.randomBytes(byteLength);
  return base32Encode(randomBytes);
}

/**
 * Gera um código TOTP de 6 dígitos para o instante atual (ou timestamp fornecido)
 * Conforme RFC 6238 e RFC 4226 (HOTP)
 */
export function generateTotpCode(
  secretBase32: string,
  timeSec: number = Math.floor(Date.now() / 1000),
  stepSeconds: number = 30,
  digits: number = 6,
  algorithm: string = 'sha1'
): string {
  const counter = Math.floor(timeSec / stepSeconds);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter), 0);

  const key = base32Decode(secretBase32);
  const hmac = crypto.createHmac(algorithm, key).update(counterBuf).digest();

  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = (binary % Math.pow(10, digits)).toString().padStart(digits, '0');
  return otp;
}

/**
 * Valida um código TOTP permitindo janela de tolerância de drift de relógio
 * window = 1 verifica [-30s, 0s, +30s]
 */
export function verifyTotpCode(
  secretBase32: string,
  code: string,
  window: number = 1,
  stepSeconds: number = 30,
  timeSec: number = Math.floor(Date.now() / 1000)
): boolean {
  if (!code || code.trim().length !== 6) {
    return false;
  }

  const cleanCode = code.trim();

  for (let stepOffset = -window; stepOffset <= window; stepOffset++) {
    const checkTime = timeSec + stepOffset * stepSeconds;
    const generated = generateTotpCode(secretBase32, checkTime, stepSeconds, 6);
    if (crypto.timingSafeEqual(Buffer.from(generated), Buffer.from(cleanCode))) {
      return true;
    }
  }

  return false;
}

/**
 * Gera o URI padrão otpauth:// para compatibilidade com Google Authenticator, Authy, etc.
 */
export function generateTotpUri(
  account: string,
  issuer: string = 'TerapiaInFoco',
  secretBase32: string
): string {
  const encIssuer = encodeURIComponent(issuer);
  const encAccount = encodeURIComponent(account);
  return `otpauth://totp/${encIssuer}:${encAccount}?secret=${secretBase32}&issuer=${encIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Gera uma lista de códigos de contingência/backup de uso único
 */
export function generateBackupCodes(count: number = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
  }
  return codes;
}
