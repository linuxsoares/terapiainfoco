import { randomBytes, createHash, createVerify, createPublicKey, generateKeyPairSync, createSign, verify as verifyRaw } from 'node:crypto';

/**
 * Utilitários de codificação Base64URL conforme RFC 4648 §5
 */
export function bufferToBase64Url(buffer: Buffer | Uint8Array): string {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function base64UrlToBuffer(base64url: string): Buffer {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64');
}

/**
 * Decodificador CBOR mínimo (RFC 8949) para attestationObject e chaves COSE:
 * inteiros, byte/text strings, arrays, mapas e valores simples. Devolve o valor e o próximo offset.
 */
export function decodeCbor(buf: Buffer, offset = 0): { value: unknown; offset: number } {
  if (offset >= buf.length) throw new Error('CBOR truncado');
  const initial = buf[offset];
  const major = initial >> 5;
  const info = initial & 0x1f;
  let pos = offset + 1;

  const readLength = (): number => {
    if (info < 24) return info;
    if (info === 24) { if (pos + 1 > buf.length) throw new Error('CBOR truncado'); return buf[pos++]; }
    if (info === 25) { if (pos + 2 > buf.length) throw new Error('CBOR truncado'); const v = buf.readUInt16BE(pos); pos += 2; return v; }
    if (info === 26) { if (pos + 4 > buf.length) throw new Error('CBOR truncado'); const v = buf.readUInt32BE(pos); pos += 4; return v; }
    throw new Error('CBOR: tamanho não suportado');
  };

  switch (major) {
    case 0: return { value: readLength(), offset: pos };
    case 1: return { value: -1 - readLength(), offset: pos };
    case 2:
    case 3: {
      const len = readLength();
      if (pos + len > buf.length) throw new Error('CBOR truncado');
      const bytes = buf.subarray(pos, pos + len);
      return { value: major === 2 ? Buffer.from(bytes) : bytes.toString('utf-8'), offset: pos + len };
    }
    case 4: {
      const len = readLength();
      const items: unknown[] = [];
      for (let i = 0; i < len; i++) {
        const item = decodeCbor(buf, pos);
        items.push(item.value);
        pos = item.offset;
      }
      return { value: items, offset: pos };
    }
    case 5: {
      const len = readLength();
      const map = new Map<unknown, unknown>();
      for (let i = 0; i < len; i++) {
        const key = decodeCbor(buf, pos);
        const val = decodeCbor(buf, key.offset);
        map.set(key.value, val.value);
        pos = val.offset;
      }
      return { value: map, offset: pos };
    }
    case 7:
      if (info === 20) return { value: false, offset: pos };
      if (info === 21) return { value: true, offset: pos };
      if (info === 22) return { value: null, offset: pos };
      throw new Error('CBOR: valor simples não suportado');
    default:
      throw new Error('CBOR: tipo não suportado');
  }
}

/** Codificador CBOR mínimo (usado pelo simulador de autenticador) */
export function encodeCbor(value: unknown): Buffer {
  const head = (major: number, len: number): Buffer => {
    if (len < 24) return Buffer.from([(major << 5) | len]);
    if (len < 256) return Buffer.from([(major << 5) | 24, len]);
    if (len < 65536) { const b = Buffer.alloc(3); b[0] = (major << 5) | 25; b.writeUInt16BE(len, 1); return b; }
    const b = Buffer.alloc(5); b[0] = (major << 5) | 26; b.writeUInt32BE(len, 1); return b;
  };
  if (typeof value === 'number') return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2, value.length), value]);
  if (typeof value === 'string') { const b = Buffer.from(value, 'utf-8'); return Buffer.concat([head(3, b.length), b]); }
  if (Array.isArray(value)) return Buffer.concat([head(4, value.length), ...value.map(encodeCbor)]);
  if (value instanceof Map) {
    const parts: Buffer[] = [head(5, value.size)];
    for (const [k, v] of value) parts.push(encodeCbor(k), encodeCbor(v));
    return Buffer.concat(parts);
  }
  throw new Error('CBOR: tipo não suportado no codificador');
}

/**
 * Converte uma chave pública COSE (RFC 9053) em PEM SPKI: EC2 P-256 (ES256), RSA (RS256) e OKP Ed25519 (EdDSA)
 */
export function coseKeyToPem(cose: Map<unknown, unknown>): string {
  const b64 = (v: unknown) => {
    if (!Buffer.isBuffer(v)) throw new Error('Chave COSE inválida');
    return v.toString('base64url');
  };
  const kty = cose.get(1);
  let jwk: Record<string, string>;
  if (kty === 2 && cose.get(-1) === 1) jwk = { kty: 'EC', crv: 'P-256', x: b64(cose.get(-2)), y: b64(cose.get(-3)) };
  else if (kty === 3) jwk = { kty: 'RSA', n: b64(cose.get(-1)), e: b64(cose.get(-2)) };
  else if (kty === 1 && cose.get(-1) === 6) jwk = { kty: 'OKP', crv: 'Ed25519', x: b64(cose.get(-2)) };
  else throw new Error('Tipo de chave COSE não suportado');
  return createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' }) as string;
}

/** Extrai o authenticatorData do attestationObject (CBOR { fmt, attStmt, authData }) */
export function parseAttestationObject(attestationObjectBase64: string): { fmt: string; authData: Buffer } {
  const { value } = decodeCbor(base64UrlToBuffer(attestationObjectBase64));
  if (!(value instanceof Map)) throw new Error('attestationObject inválido');
  const authData = value.get('authData');
  if (!Buffer.isBuffer(authData)) throw new Error('attestationObject sem authData');
  return { fmt: String(value.get('fmt') ?? ''), authData };
}

/**
 * Gera desafio criptográfico de 32 bytes (256 bits) para prevenção de replay
 */
export function generateWebAuthnChallenge(): string {
  return bufferToBase64Url(randomBytes(32));
}

/**
 * Estrutura parsed do clientDataJSON do navegador
 */
export interface ParsedClientDataJSON {
  type: string;
  challenge: string;
  origin: string;
  crossOrigin?: boolean;
}

export function parseClientDataJSON(clientDataJSONBase64: string): ParsedClientDataJSON {
  const jsonString = base64UrlToBuffer(clientDataJSONBase64).toString('utf-8');
  return JSON.parse(jsonString) as ParsedClientDataJSON;
}

/**
 * Flags e metadados extraídos do authenticatorData binário
 */
export interface ParsedAuthenticatorData {
  rpIdHash: string; // hex
  flags: {
    userPresent: boolean;        // UP - bit 0
    userVerified: boolean;       // UV - bit 2 (TouchID/FaceID biometria)
    backupEligible: boolean;     // BE - bit 3
    backupState: boolean;        // BS - bit 4
    attestedDataIncluded: boolean; // AT - bit 6
    extensionDataIncluded: boolean; // ED - bit 7
  };
  signCount: number;
  aaguid?: string;
  credentialId?: string; // base64url
  /** Chave pública da credencial (COSE convertida para PEM SPKI) */
  credentialPublicKeyPem?: string;
}

/**
 * Decodifica o buffer binário authenticatorData conforme W3C WebAuthn Level 3
 */
export function parseAuthenticatorData(authDataBufferOrBase64: Buffer | string): ParsedAuthenticatorData {
  const buf = typeof authDataBufferOrBase64 === 'string'
    ? base64UrlToBuffer(authDataBufferOrBase64)
    : authDataBufferOrBase64;

  if (buf.length < 37) {
    throw new Error('authenticatorData inválido: tamanho menor que 37 bytes');
  }

  const rpIdHash = buf.subarray(0, 32).toString('hex');
  const flagsByte = buf[32];
  const signCount = buf.readUInt32BE(33);

  const flags = {
    userPresent: (flagsByte & 0x01) !== 0,
    userVerified: (flagsByte & 0x04) !== 0,
    backupEligible: (flagsByte & 0x08) !== 0,
    backupState: (flagsByte & 0x10) !== 0,
    attestedDataIncluded: (flagsByte & 0x40) !== 0,
    extensionDataIncluded: (flagsByte & 0x80) !== 0
  };

  const result: ParsedAuthenticatorData = {
    rpIdHash,
    flags,
    signCount
  };

  // Se flag AT está ativa, extrai Attested Credential Data
  if (flags.attestedDataIncluded && buf.length >= 55) {
    const aaguid = buf.subarray(37, 53).toString('hex');
    const credIdLen = buf.readUInt16BE(53);
    const credIdEnd = 55 + credIdLen;

    if (buf.length >= credIdEnd) {
      const credId = buf.subarray(55, credIdEnd);
      result.aaguid = aaguid;
      result.credentialId = bufferToBase64Url(credId);

      // Após o credentialId vem a chave pública em COSE (mapa CBOR); extensões podem seguir
      if (buf.length > credIdEnd) {
        const { value } = decodeCbor(buf, credIdEnd);
        if (!(value instanceof Map)) throw new Error('authenticatorData: chave COSE inválida');
        result.credentialPublicKeyPem = coseKeyToPem(value);
      }
    }
  }

  return result;
}

/**
 * Valida a assinatura de asserção (login) do WebAuthn
 * Assinatura é calculada sobre authenticatorData || SHA-256(clientDataJSON)
 */
export function verifyWebAuthnAssertionSignature(params: {
  publicKeyPem: string;
  authenticatorData: Buffer | string;
  clientDataJSON: Buffer | string;
  signature: Buffer | string;
}): boolean {
  try {
    const authDataBuf = typeof params.authenticatorData === 'string'
      ? base64UrlToBuffer(params.authenticatorData)
      : params.authenticatorData;

    const clientDataBuf = typeof params.clientDataJSON === 'string'
      ? base64UrlToBuffer(params.clientDataJSON)
      : params.clientDataJSON;

    const sigBuf = typeof params.signature === 'string'
      ? base64UrlToBuffer(params.signature)
      : params.signature;

    const clientDataHash = createHash('sha256').update(clientDataBuf).digest();
    const signedData = Buffer.concat([authDataBuf, clientDataHash]);

    const key = createPublicKey(params.publicKeyPem);
    // EdDSA assina a mensagem inteira (sem hash prévio); ES256/RS256 usam SHA-256
    if (key.asymmetricKeyType === 'ed25519') return verifyRaw(null, signedData, key, sigBuf);
    const verifier = createVerify('SHA256');
    verifier.update(signedData);
    return verifier.verify(key, sigBuf);
  } catch (err) {
    return false;
  }
}

/**
 * Construtor de credencial simulada WebAuthn / Passkey para testes e ambientes headless
 */
export function createSimulatedWebAuthnKeyPair(rpId: string, challenge: string, origin: string) {
  const { publicKey, privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'P-256'
  });

  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
  // Chave pública em COSE EC2 (kty 2, alg ES256, crv P-256), como num autenticador real
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const coseKey = encodeCbor(new Map<unknown, unknown>([
    [1, 2],
    [3, -7],
    [-1, 1],
    [-2, Buffer.from(jwk.x, 'base64url')],
    [-3, Buffer.from(jwk.y, 'base64url')]
  ]));
  const credentialIdBuf = randomBytes(32);
  const credentialId = bufferToBase64Url(credentialIdBuf);

  // Monta clientDataJSON de registro
  const clientData = {
    type: 'webauthn.create',
    challenge,
    origin,
    crossOrigin: false
  };
  const clientDataJSON = bufferToBase64Url(Buffer.from(JSON.stringify(clientData)));

  // Monta authenticatorData binário com flags UP e UV (biometria)
  const rpIdHash = createHash('sha256').update(rpId).digest();
  const flags = 0x01 | 0x04 | 0x40; // UP + UV + AT
  const signCountBuf = Buffer.alloc(4);
  signCountBuf.writeUInt32BE(0);

  const aaguid = Buffer.alloc(16, 0x42);
  const credIdLen = Buffer.alloc(2);
  credIdLen.writeUInt16BE(credentialIdBuf.length);

  const authDataHeader = Buffer.concat([
    rpIdHash,
    Buffer.from([flags]),
    signCountBuf,
    aaguid,
    credIdLen,
    credentialIdBuf,
    coseKey
  ]);

  const authenticatorData = bufferToBase64Url(authDataHeader);
  const attestationObject = bufferToBase64Url(encodeCbor(new Map<unknown, unknown>([
    ['fmt', 'none'],
    ['attStmt', new Map()],
    ['authData', authDataHeader]
  ])));

  return {
    credentialId,
    publicKeyPem,
    privateKey,
    clientDataJSON,
    authenticatorData,
    attestationObject
  };
}

/**
 * Construtor de assinatura de asserção (login) simulada
 */
export function createSimulatedWebAuthnAssertion(params: {
  rpId: string;
  challenge: string;
  origin: string;
  privateKey: any;
  signCount?: number;
}) {
  const clientData = {
    type: 'webauthn.get',
    challenge: params.challenge,
    origin: params.origin,
    crossOrigin: false
  };
  const clientDataJSONBuf = Buffer.from(JSON.stringify(clientData));
  const clientDataJSON = bufferToBase64Url(clientDataJSONBuf);

  const rpIdHash = createHash('sha256').update(params.rpId).digest();
  const flags = 0x01 | 0x04; // UP + UV (User Present + User Verified / Biometria)
  const signCountBuf = Buffer.alloc(4);
  signCountBuf.writeUInt32BE(params.signCount ?? 1);

  const authDataBuf = Buffer.concat([
    rpIdHash,
    Buffer.from([flags]),
    signCountBuf
  ]);
  const authenticatorData = bufferToBase64Url(authDataBuf);

  // Calcula assinatura ECDSA P-256 com SHA-256
  const clientDataHash = createHash('sha256').update(clientDataJSONBuf).digest();
  const signedPayload = Buffer.concat([authDataBuf, clientDataHash]);

  const signer = createSign('SHA256');
  signer.update(signedPayload);
  const signatureBuf = signer.sign(params.privateKey);
  const signature = bufferToBase64Url(signatureBuf);

  return {
    clientDataJSON,
    authenticatorData,
    signature
  };
}
