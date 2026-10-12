import { sign, verify } from 'hono/jwt';
import { db } from '../db/memoryDb';
import { config } from '../config';
import { 
  generateTotpSecret, 
  generateTotpCode, 
  verifyTotpCode, 
  generateTotpUri, 
  generateBackupCodes 
} from '@terapiainfoco/crypto';
import type { 
  User, 
  SafeUser, 
  AuthTokenPayload, 
  RegisterDTO, 
  LoginDTO, 
  LoginResponse,
  TwoFactorSetupResponse 
} from '@terapiainfoco/shared';
import { UserRole, AuditAction, AuditResourceType } from '@terapiainfoco/shared';
import { auditService } from './auditService';

export class AuthService {
  /**
   * Remove campos sensíveis como hash de senha e segredo 2FA
   */
  public toSafeUser(user: User): SafeUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      crp: user.crp,
      crpRegion: user.crpRegion,
      therapistId: user.therapistId,
      twoFactorEnabled: user.twoFactorEnabled,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt
    };
  }

  /**
   * Cadastro de novo profissional com validação e Argon2id hash
   */
  public async register(dto: RegisterDTO, ipAddress: string = '127.0.0.1'): Promise<SafeUser> {
    const existing = Array.from(db.users.values()).find(
      u => u.email.toLowerCase() === dto.email.toLowerCase().trim()
    );
    if (existing) {
      throw new Error('E-mail já cadastrado na plataforma.');
    }

    if (!dto.password || dto.password.length < 8) {
      throw new Error('A senha deve conter no mínimo 8 caracteres.');
    }

    const passwordHash = await Bun.password.hash(dto.password);
    const userId = crypto.randomUUID();

    // Se for psicólogo, vincula ao registro de terapeuta
    let therapistId: string | undefined;
    if (dto.role === UserRole.PSICOLOGO_TITULAR && dto.crp) {
      therapistId = `therapist-${userId.slice(0, 8)}`;
      db.therapists.set(therapistId, {
        id: therapistId,
        crp: dto.crp,
        crpRegion: dto.crpRegion || 'SP',
        status: 'ACTIVE' as any,
        encryptedDek: 'auto-generated-encrypted-dek-base64',
        createdAt: new Date()
      });
    }

    const newUser: User = {
      id: userId,
      email: dto.email.toLowerCase().trim(),
      name: dto.name.trim(),
      role: dto.role,
      crp: dto.crp,
      crpRegion: dto.crpRegion,
      therapistId,
      passwordHash,
      twoFactorEnabled: false,
      createdAt: new Date()
    };

    db.users.set(userId, newUser);

    await auditService.logAccess({
      actorId: userId,
      resourceType: AuditResourceType.USER,
      resourceId: userId,
      action: AuditAction.CREATE,
      ipAddress,
      userAgent: 'AuthService/register'
    });

    return this.toSafeUser(newUser);
  }

  /**
   * Autenticação de credenciais com suporte a 2FA/MFA e proteção contra brute force
   */
  public async login(dto: LoginDTO, ipAddress: string = '127.0.0.1'): Promise<LoginResponse> {
    const email = dto.email.toLowerCase().trim();
    const user = Array.from(db.users.values()).find(u => u.email.toLowerCase() === email);

    if (!user) {
      await auditService.logAccess({
        actorId: '00000000-0000-0000-0000-000000000000',
        resourceType: AuditResourceType.SECURITY,
        resourceId: '00000000-0000-0000-0000-000000000000',
        action: AuditAction.AUTH_LOGIN_FAILED,
        ipAddress,
        userAgent: `Login attempt failed: user not found (${email})`
      });
      throw new Error('Credenciais inválidas. Verifique seu e-mail e senha.');
    }

    const passwordValid = await Bun.password.verify(dto.password, user.passwordHash);
    if (!passwordValid) {
      await auditService.logAccess({
        actorId: user.id,
        resourceType: AuditResourceType.SECURITY,
        resourceId: user.id,
        action: AuditAction.AUTH_LOGIN_FAILED,
        ipAddress,
        userAgent: 'Login attempt failed: wrong password'
      });
      throw new Error('Credenciais inválidas. Verifique seu e-mail e senha.');
    }

    // Se 2FA estiver ativado, retorna desafio MFA com token temporário (5 minutos)
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      const now = Math.floor(Date.now() / 1000);
      const tempToken = await sign(
        {
          sub: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          therapistId: user.therapistId,
          crp: user.crp,
          type: 'mfa_temp',
          exp: now + 300,
          iat: now
        },
        config.jwtSecret
      );

      return {
        success: true,
        mfaRequired: true,
        tempToken,
        message: 'Código de autenticação de dois fatores (2FA) obrigatório.'
      };
    }

    // Emissão dos tokens de acesso e refresh
    return await this.issueTokens(user, ipAddress);
  }

  /**
   * Validação de código 2FA durante o fluxo de login
   */
  public async validateLogin2FA(
    tempToken: string,
    code: string,
    ipAddress: string = '127.0.0.1'
  ): Promise<LoginResponse> {
    let payload: AuthTokenPayload;
    try {
      payload = (await verify(tempToken, config.jwtSecret, 'HS256')) as any;
    } catch {
      throw new Error('Sessão temporária expirada ou inválida. Por favor, faça login novamente.');
    }


    if (payload.type !== 'mfa_temp') {
      throw new Error('Token inválido para desafio de 2FA.');
    }

    const user = db.users.get(payload.sub);
    if (!user || !user.twoFactorSecret) {
      throw new Error('Configuração de 2FA não encontrada para este usuário.');
    }

    const cleanCode = code.trim();
    let verified = verifyTotpCode(user.twoFactorSecret, cleanCode);

    // Se o código TOTP falhou, verifica se é um código de backup válido
    if (!verified && user.twoFactorBackupCodes && user.twoFactorBackupCodes.length > 0) {
      const formattedCode = cleanCode.toUpperCase();
      const backupIndex = user.twoFactorBackupCodes.indexOf(formattedCode);
      if (backupIndex !== -1) {
        verified = true;
        // Consome o código de backup usado
        user.twoFactorBackupCodes.splice(backupIndex, 1);
      }
    }

    if (!verified) {
      await auditService.logAccess({
        actorId: user.id,
        resourceType: AuditResourceType.SECURITY,
        resourceId: user.id,
        action: AuditAction.AUTH_LOGIN_FAILED,
        ipAddress,
        userAgent: '2FA verification code rejected'
      });
      throw new Error('Código de autenticação 2FA inválido ou expirado.');
    }

    await auditService.logAccess({
      actorId: user.id,
      resourceType: AuditResourceType.SECURITY,
      resourceId: user.id,
      action: AuditAction.AUTH_2FA_VERIFY,
      ipAddress,
      userAgent: '2FA code verified successfully on login'
    });

    return await this.issueTokens(user, ipAddress);
  }

  /**
   * Configuração inicial de 2FA (gera segredo, URI do app e backup codes)
   */
  public async setup2FA(userId: string): Promise<TwoFactorSetupResponse> {
    const user = db.users.get(userId);
    if (!user) {
      throw new Error('Usuário não encontrado.');
    }

    const secret = generateTotpSecret(20);
    const otpauthUri = generateTotpUri(user.email, 'TerapiaInFoco', secret);
    const backupCodes = generateBackupCodes(8);

    // Armazena temporariamente o segredo e os códigos até a confirmação
    user.twoFactorSecret = secret;
    user.twoFactorBackupCodes = backupCodes;

    await auditService.logAccess({
      actorId: userId,
      resourceType: AuditResourceType.SECURITY,
      resourceId: userId,
      action: AuditAction.AUTH_2FA_SETUP,
      ipAddress: '127.0.0.1',
      userAgent: '2FA setup requested'
    });

    return {
      secret,
      otpauthUri,
      backupCodes
    };
  }

  /**
   * Confirma ativação do 2FA após validar o primeiro código gerado no app
   */
  public async verify2FA(
    userId: string,
    code: string,
    ipAddress: string = '127.0.0.1'
  ): Promise<{ success: boolean; message: string; backupCodes?: string[] }> {
    const user = db.users.get(userId);
    if (!user || !user.twoFactorSecret) {
      throw new Error('Configuração de 2FA não iniciada. Solicite a chave de ativação.');
    }

    const valid = verifyTotpCode(user.twoFactorSecret, code.trim());
    if (!valid) {
      throw new Error('Código TOTP incorreto. Verifique o horário do dispositivo e tente novamente.');
    }

    user.twoFactorEnabled = true;

    await auditService.logAccess({
      actorId: userId,
      resourceType: AuditResourceType.SECURITY,
      resourceId: userId,
      action: AuditAction.AUTH_2FA_VERIFY,
      ipAddress,
      userAgent: '2FA successfully activated'
    });

    return {
      success: true,
      message: 'Autenticação de dois fatores (2FA) ativada com sucesso!',
      backupCodes: user.twoFactorBackupCodes
    };
  }

  /**
   * Desativa o 2FA mediante confirmação de senha
   */
  public async disable2FA(
    userId: string,
    password: string,
    ipAddress: string = '127.0.0.1'
  ): Promise<{ success: boolean; message: string }> {
    const user = db.users.get(userId);
    if (!user) {
      throw new Error('Usuário não encontrado.');
    }

    const passwordValid = await Bun.password.verify(password, user.passwordHash);
    if (!passwordValid) {
      throw new Error('Senha incorreta. Não foi possível desativar o 2FA.');
    }

    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    user.twoFactorBackupCodes = undefined;

    await auditService.logAccess({
      actorId: userId,
      resourceType: AuditResourceType.SECURITY,
      resourceId: userId,
      action: AuditAction.AUTH_2FA_DISABLE,
      ipAddress,
      userAgent: '2FA disabled by user'
    });

    return {
      success: true,
      message: 'Autenticação de dois fatores (2FA) desativada.'
    };
  }

  /**
   * Renovação de Access Token via Refresh Token com rotação de tokens
   */
  public async refreshToken(refreshToken: string, ipAddress: string = '127.0.0.1') {
    if (db.revokedTokens.has(refreshToken)) {
      throw new Error('Este refresh token foi revogado. Por favor, faça login novamente.');
    }

    let payload: AuthTokenPayload;
    try {
      payload = (await verify(refreshToken, config.jwtSecret, 'HS256')) as any;
    } catch {
      throw new Error('Refresh token inválido ou expirado.');
    }


    if (payload.type !== 'refresh') {
      throw new Error('Token fornecido não é do tipo refresh.');
    }

    const user = db.users.get(payload.sub);
    if (!user) {
      throw new Error('Usuário não localizado.');
    }

    // Revoga o refresh token anterior (Token Rotation)
    db.revokedTokens.add(refreshToken);

    await auditService.logAccess({
      actorId: user.id,
      resourceType: AuditResourceType.SECURITY,
      resourceId: user.id,
      action: AuditAction.AUTH_TOKEN_REFRESH,
      ipAddress,
      userAgent: 'Access token refreshed with token rotation'
    });

    return await this.issueTokens(user, ipAddress);
  }

  /**
   * Invalidação de sessão / Logout
   */
  public async logout(
    refreshToken?: string,
    userId?: string,
    ipAddress: string = '127.0.0.1'
  ): Promise<{ success: boolean; message: string }> {
    if (refreshToken) {
      db.revokedTokens.add(refreshToken);
    }

    if (userId) {
      await auditService.logAccess({
        actorId: userId,
        resourceType: AuditResourceType.SECURITY,
        resourceId: userId,
        action: AuditAction.AUTH_LOGOUT,
        ipAddress,
        userAgent: 'User logged out'
      });
    }

    return {
      success: true,
      message: 'Sessão encerrada com sucesso.'
    };
  }

  /**
   * Emissão padronizada de par Access + Refresh tokens
   */
  private async issueTokens(user: User, ipAddress: string): Promise<LoginResponse> {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 3600; // 1 hora
    const refreshExpiresIn = 7 * 86400; // 7 dias

    const accessToken = await sign(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        therapistId: user.therapistId,
        crp: user.crp,
        type: 'access',
        exp: now + expiresIn,
        iat: now
      },
      config.jwtSecret
    );

    const refreshToken = await sign(
      {
        sub: user.id,
        jti: crypto.randomUUID(),
        type: 'refresh',
        exp: now + refreshExpiresIn,
        iat: now
      },
      config.jwtSecret
    );


    user.lastLoginAt = new Date();

    await auditService.logAccess({
      actorId: user.id,
      resourceType: AuditResourceType.SECURITY,
      resourceId: user.id,
      action: AuditAction.AUTH_LOGIN,
      ipAddress,
      userAgent: 'Access tokens issued'
    });

    return {
      success: true,
      user: this.toSafeUser(user),
      accessToken,
      refreshToken,
      expiresIn
    };
  }

  /**
   * Valida um access token e retorna os metadados do usuário
   */
  public async verifyAccessToken(token: string): Promise<AuthTokenPayload> {
    const payload = (await verify(token, config.jwtSecret, 'HS256')) as any;
    if (payload.type !== 'access') {
      throw new Error('Token fornecido não é um token de acesso válido.');
    }
    return payload;
  }


  public getUserById(id: string): SafeUser | null {
    const user = db.users.get(id);
    return user ? this.toSafeUser(user) : null;
  }
}

export const authService = new AuthService();
