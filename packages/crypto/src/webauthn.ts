import { randomBytes, createHash, createVerify, generateKeyPairSync, createSign } from 'node:crypto';

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
  credentialPublicKeySpki?: string; // SPKI PEM
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

      // O restante do buffer após credentialId contém a chave pública (COSE Key)
      if (buf.length > credIdEnd) {
        const rawKeyBytes = buf.subarray(credIdEnd);
        result.credentialPublicKeySpki = bufferToBase64Url(rawKeyBytes);
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

    const verifier = createVerify('SHA256');
    verifier.update(signedData);
    return verifier.verify(params.publicKeyPem, sigBuf);
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
    Buffer.from(publicKeyPem) // Armazenamento simplificado da chave pública SPKI
  ]);

  const authenticatorData = bufferToBase64Url(authDataHeader);

  return {
    credentialId,
    publicKeyPem,
    privateKey,
    clientDataJSON,
    authenticatorData
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
