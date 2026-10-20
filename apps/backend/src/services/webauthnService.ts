import { randomUUID } from 'node:crypto';
import { db } from '../db/memoryDb';
import { config } from '../config';
import { authService } from './authService';
import { auditService } from './auditService';
import { 
  AuditAction, 
  AuditResourceType,
  type PasskeyRegistrationOptionsResponse,
  type PasskeyRegistrationVerifyDTO,
  type PasskeyAuthenticationOptionsResponse,
  type PasskeyAuthenticationVerifyDTO,
  type PasskeyInfoDTO,
  type PasskeyCredential,
  type LoginResponse
} from '@terapiainfoco/shared';
import { 
  generateWebAuthnChallenge,
  parseClientDataJSON,
  parseAuthenticatorData,
  parseAttestationObject,
  verifyWebAuthnAssertionSignature,
  type ParsedAuthenticatorData,
  type ParsedClientDataJSON
} from '@terapiainfoco/crypto';
import { createHash } from 'node:crypto';

export class WebAuthnService {
  private static getRpId(): string {
    // O RP ID é o domínio do painel: em produção, o mesmo de PUBLIC_APP_URL
    const defaultRp = 'localhost';
    if (!config.publicAppUrl) return defaultRp;
    try {
      const url = new URL(config.publicAppUrl);
      return url.hostname || defaultRp;
    } catch {
      return defaultRp;
    }
  }

  /** Origem esperada no clientDataJSON: o painel (PUBLIC_APP_URL) */
  private static expectedOrigin(): string {
    try {
      return new URL(config.publicAppUrl).origin;
    } catch {
      return 'http://localhost:5174';
    }
  }

  /**
   * Checagens que tornam a passkey resistente a phishing e replay: origem do site,
   * hash do RP ID no autenticador e presença do usuário (W3C WebAuthn §7.1/§7.2)
   */
  private static assertCeremonyBinding(clientData: ParsedClientDataJSON, authData: ParsedAuthenticatorData): void {
    if (clientData.origin !== this.expectedOrigin()) {
      throw new Error('Origem da cerimônia WebAuthn não corresponde ao site.');
    }
    const expectedRpIdHash = createHash('sha256').update(this.getRpId()).digest('hex');
    if (authData.rpIdHash !== expectedRpIdHash) {
      throw new Error('RP ID do autenticador não corresponde ao site.');
    }
    if (!authData.flags.userPresent) {
      throw new Error('O autenticador não confirmou a presença do usuário.');
    }
  }

  /**
   * 1. Gera opções de desafio para registro de uma nova Passkey biométrica
   */
  public static async getRegistrationOptions(userId: string): Promise<PasskeyRegistrationOptionsResponse> {
    const user = db.users.get(userId);
    if (!user) {
      throw new Error('Usuário não encontrado para registro de Passkey.');
    }

    const challenge = generateWebAuthnChallenge();
    const expiresAt = Date.now() + 120 * 1000; // 2 minutos

    // Salva desafio ativo na sessão do banco
    db.webauthnChallenges.set(challenge, {
      challenge,
      userId,
      userEmail: user.email,
      type: 'registration',
      expiresAt
    });

    const rpId = this.getRpId();

    // Obtém credenciais já cadastradas do usuário para exclusão
    const existingPasskeys = Array.from(db.passkeys.values())
      .filter(p => p.userId === userId)
      .map(p => ({
        id: p.credentialId,
        type: 'public-key' as const,
        transports: p.transports || ['internal', 'hybrid']
      }));

    return {
      success: true,
      challenge,
      rp: {
        name: 'TerapiaInFoco Clínica Psicológica',
        id: rpId
      },
      user: {
        id: user.id,
        name: user.email,
        displayName: user.name
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },  // ES256 (ECDSA P-256 / SHA-256)
        { type: 'public-key', alg: -257 }, // RS256 (RSA PKCS#1 v1.5 / SHA-256)
        { type: 'public-key', alg: -8 }   // EdDSA (Ed25519)
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform', // TouchID, FaceID, Windows Hello
        userVerification: 'preferred',
        residentKey: 'preferred',
        requireResidentKey: false
      },
      timeout: 60000,
      attestation: 'none',
      excludeCredentials: existingPasskeys
    };
  }

  /**
   * 2. Verifica e conclui o registro da Passkey biométrica
   */
  public static async verifyRegistration(
    userId: string,
    dto: PasskeyRegistrationVerifyDTO,
    ipAddress = '127.0.0.1',
    userAgent = 'unknown'
  ): Promise<PasskeyInfoDTO> {
    const user = db.users.get(userId);
    if (!user) {
      throw new Error('Usuário não localizado.');
    }

    if (!dto.clientDataJSON || !dto.credentialId) {
      throw new Error('clientDataJSON e credentialId são obrigatórios.');
    }

    // Decodifica e valida clientDataJSON
    const clientData = parseClientDataJSON(dto.clientDataJSON);
    if (clientData.type !== 'webauthn.create') {
      throw new Error('Tipo inválido de clientDataJSON para registro.');
    }

    // Valida desafio registrado
    const session = db.webauthnChallenges.get(clientData.challenge);
    if (!session || session.type !== 'registration' || session.userId !== userId) {
      throw new Error('Desafio WebAuthn inválido ou não encontrado.');
    }

    if (Date.now() > session.expiresAt) {
      db.webauthnChallenges.delete(clientData.challenge);
      throw new Error('O desafio de registro expirou. Inicie novamente.');
    }

    // Remove desafio consumido (One-Time Token)
    db.webauthnChallenges.delete(clientData.challenge);

    // A chave pública vem do authenticatorData (dentro do attestationObject enviado pelo navegador);
    // nunca de um campo informado pelo cliente nem de um valor de reserva
    let authData: ParsedAuthenticatorData;
    try {
      const rawAuthData = dto.attestationObject
        ? parseAttestationObject(dto.attestationObject).authData
        : dto.authenticatorData;
      if (!rawAuthData) throw new Error('sem authenticatorData');
      authData = parseAuthenticatorData(rawAuthData);
    } catch {
      throw new Error('Resposta do autenticador inválida: não foi possível ler a chave pública da passkey.');
    }
    this.assertCeremonyBinding(clientData, authData);
    if (!authData.flags.attestedDataIncluded || !authData.credentialPublicKeyPem) {
      throw new Error('O autenticador não enviou a chave pública da passkey.');
    }
    if (authData.credentialId !== dto.credentialId) {
      throw new Error('credentialId não corresponde ao autenticador.');
    }

    const publicKeyPem = authData.credentialPublicKeyPem;
    const counter = authData.signCount;
    const deviceType: 'singleDevice' | 'multiDevice' = authData.flags.backupEligible ? 'multiDevice' : 'singleDevice';
    const backedUp = authData.flags.backupState;
    const aaguid = authData.aaguid;

    const passkeyId = randomUUID();
    const newPasskey: PasskeyCredential = {
      id: passkeyId,
      userId: user.id,
      credentialId: dto.credentialId,
      publicKeyPem,
      counter,
      deviceType,
      backedUp,
      friendlyName: dto.friendlyName?.trim() || 'Passkey Biométrica (TouchID/FaceID)',
      aaguid,
      transports: ['internal', 'hybrid'],
      createdAt: new Date(),
      lastUsedAt: null
    };

    db.passkeys.set(newPasskey.id, newPasskey);
    user.passkeysCount = (user.passkeysCount || 0) + 1;

    // Registra auditoria WORM imutável
    await auditService.logAccess({
      actorId: user.id,
      resourceType: AuditResourceType.SECURITY,
      resourceId: newPasskey.id,
      action: AuditAction.PASSKEY_REGISTER,
      ipAddress,
      userAgent: `Passkey WebAuthn registrada: ${newPasskey.friendlyName} (${newPasskey.deviceType})`
    });

    return {
      id: newPasskey.id,
      credentialId: newPasskey.credentialId,
      friendlyName: newPasskey.friendlyName,
      deviceType: newPasskey.deviceType,
      backedUp: newPasskey.backedUp,
      counter: newPasskey.counter,
      createdAt: newPasskey.createdAt,
      lastUsedAt: newPasskey.lastUsedAt
    };
  }

  /**
   * 3. Gera opções de autenticação (Assertion Challenge) para login com Passkey
   */
  public static async getAuthenticationOptions(email?: string): Promise<PasskeyAuthenticationOptionsResponse> {
    const challenge = generateWebAuthnChallenge();
    const expiresAt = Date.now() + 120 * 1000; // 2 minutos

    let allowCredentials: Array<{ id: string; type: 'public-key'; transports?: string[] }> | undefined;
    let userId: string | undefined;

    if (email) {
      const user = Array.from(db.users.values()).find(
        u => u.email.toLowerCase() === email.toLowerCase().trim()
      );
      if (user) {
        userId = user.id;
        const userPasskeys = Array.from(db.passkeys.values()).filter(p => p.userId === user.id);
        if (userPasskeys.length > 0) {
          allowCredentials = userPasskeys.map(p => ({
            id: p.credentialId,
            type: 'public-key' as const,
            transports: p.transports || ['internal', 'hybrid']
          }));
        }
      }
    }

    db.webauthnChallenges.set(challenge, {
      challenge,
      userId,
      userEmail: email,
      type: 'authentication',
      expiresAt
    });

    return {
      success: true,
      challenge,
      timeout: 60000,
      rpId: this.getRpId(),
      userVerification: 'preferred',
      allowCredentials
    };
  }

  /**
   * 4. Valida a assinatura de asserção e autentica o usuário (Passwordless / FIDO2)
   */
  public static async verifyAuthentication(
    dto: PasskeyAuthenticationVerifyDTO,
    ipAddress = '127.0.0.1',
    userAgent = 'unknown'
  ): Promise<LoginResponse> {
    if (!dto.credentialId || !dto.clientDataJSON || !dto.signature || !dto.authenticatorData) {
      throw new Error('credentialId, clientDataJSON, authenticatorData e signature são obrigatórios.');
    }

    // 1. Busca a Passkey registrada pela credentialId
    const passkey = Array.from(db.passkeys.values()).find(
      p => p.credentialId === dto.credentialId
    );
    if (!passkey) {
      throw new Error('Credencial Passkey não encontrada ou revogada.');
    }

    // 2. Valida clientDataJSON
    const clientData = parseClientDataJSON(dto.clientDataJSON);
    if (clientData.type !== 'webauthn.get') {
      throw new Error('Tipo incorreto de clientDataJSON para autenticação.');
    }

    // 3. Valida desafio ativo
    const session = db.webauthnChallenges.get(clientData.challenge);
    if (!session || session.type !== 'authentication') {
      throw new Error('Desafio WebAuthn inválido ou expirado.');
    }

    if (Date.now() > session.expiresAt) {
      db.webauthnChallenges.delete(clientData.challenge);
      throw new Error('O desafio de autenticação expirou.');
    }

    // Consome o desafio (One-Time Token)
    db.webauthnChallenges.delete(clientData.challenge);

    // 4. Origem, RP ID e presença do usuário
    let authData: ParsedAuthenticatorData;
    try {
      authData = parseAuthenticatorData(dto.authenticatorData);
    } catch {
      throw new Error('authenticatorData inválido.');
    }
    this.assertCeremonyBinding(clientData, authData);

    // Desafio emitido para um e-mail só vale para as passkeys dessa conta
    if (session.userId && session.userId !== passkey.userId) {
      throw new Error('Credencial Passkey não pertence à conta do desafio.');
    }

    // 5. Assinatura sempre verificada; passkeys antigas sem chave pública real precisam ser recadastradas
    if (!passkey.publicKeyPem.includes('BEGIN PUBLIC KEY')) {
      throw new Error('Esta passkey foi cadastrada sem chave pública verificável. Remova-a e cadastre novamente em Segurança.');
    }
    const isSignatureValid = verifyWebAuthnAssertionSignature({
      publicKeyPem: passkey.publicKeyPem,
      authenticatorData: dto.authenticatorData,
      clientDataJSON: dto.clientDataJSON,
      signature: dto.signature
    });
    if (!isSignatureValid) {
      throw new Error('Assinatura biométrica Passkey inválida.');
    }

    // 6. Contador anti-clonagem: se o autenticador usa contador, ele só pode crescer
    if (authData.signCount > 0 || passkey.counter > 0) {
      if (authData.signCount <= passkey.counter) {
        throw new Error('Alerta de segurança: possível clone de credencial detectado (signCount inválido).');
      }
    }
    passkey.counter = authData.signCount;

    passkey.lastUsedAt = new Date();

    // 7. Localiza o usuário associado e emite tokens JWT
    const user = db.users.get(passkey.userId);
    if (!user) {
      throw new Error('Usuário associado à Passkey não encontrado.');
    }

    // Registra auditoria WORM imutável
    await auditService.logAccess({
      actorId: user.id,
      resourceType: AuditResourceType.SECURITY,
      resourceId: passkey.id,
      action: AuditAction.AUTH_LOGIN,
      ipAddress,
      userAgent: `Login biométrico WebAuthn / Passkey (${passkey.friendlyName}) - ${userAgent}`
    });

    return await authService.issueTokens(user, ipAddress);
  }

  /**
   * 5. Lista todas as Passkeys cadastradas de um usuário
   */
  public static listPasskeys(userId: string): PasskeyInfoDTO[] {
    return Array.from(db.passkeys.values())
      .filter(p => p.userId === userId)
      .map(p => ({
        id: p.id,
        credentialId: p.credentialId,
        friendlyName: p.friendlyName,
        deviceType: p.deviceType,
        backedUp: p.backedUp,
        counter: p.counter,
        createdAt: p.createdAt,
        lastUsedAt: p.lastUsedAt
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * 6. Remove/revoga uma Passkey
   */
  public static async deletePasskey(
    userId: string, 
    passkeyId: string, 
    ipAddress = '127.0.0.1'
  ): Promise<{ success: boolean; message: string }> {
    const passkey = db.passkeys.get(passkeyId);
    if (!passkey || passkey.userId !== userId) {
      throw new Error('Passkey não encontrada ou você não tem permissão para revogá-la.');
    }

    db.passkeys.delete(passkeyId);

    const user = db.users.get(userId);
    if (user && user.passkeysCount && user.passkeysCount > 0) {
      user.passkeysCount -= 1;
    }

    await auditService.logAccess({
      actorId: userId,
      resourceType: AuditResourceType.SECURITY,
      resourceId: passkeyId,
      action: AuditAction.PASSKEY_REVOKE,
      ipAddress,
      userAgent: `Passkey revogada: ${passkey.friendlyName}`
    });

    return {
      success: true,
      message: 'Passkey biométrica revogada com sucesso.'
    };
  }
}
