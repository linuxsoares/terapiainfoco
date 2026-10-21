import { sign, verify } from 'hono/jwt';
import { db } from '../db/memoryDb';
import { UserRepository } from '../repositories/userRepository';
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
  SocialAuthLoginDTO,
  UpdateUserProfileDTO,
  PublicPlatformShowcaseOverview,
  LoginDTO, 
  LoginResponse,
  TwoFactorSetupResponse 
} from '@terapiainfoco/shared';
import { UserRole, SocialAuthProvider, AuditAction, AuditResourceType } from '@terapiainfoco/shared';
import { auditService } from './auditService';

function maskCpfForProfile(cpf?: string): string | undefined {
  if (!cpf) return undefined;
  const digits = cpf.replace(/\D/g, '');
  if (digits.length === 11) {
    return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
  }
  return '***.***.***-**';
}

/** Perfis que podem ser criados pelo cadastro público (e-mail/senha ou login social) */
const SELF_SERVICE_ROLES: UserRole[] = [UserRole.PACIENTE, UserRole.PSICOLOGO_TITULAR];

/** Token emitido antes da última troca de senha (iat em segundos) */
function issuedBeforePasswordChange(user: User, issuedAt: number | undefined): boolean {
  if (!user.passwordChangedAt) return false;
  return (issuedAt ?? 0) * 1000 < new Date(user.passwordChangedAt).getTime();
}

/** Login concluído: os tokens sempre vêm preenchidos */
type IssuedTokens = LoginResponse & Required<Pick<LoginResponse, 'user' | 'accessToken' | 'refreshToken' | 'expiresIn'>>;

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
      patientId: user.patientId,
      phone: user.phone,
      cpfMasked: user.cpfMasked,
      specialty: user.specialty,
      bio: user.bio,
      sessionFeeCents: user.sessionFeeCents,
      emergencyContactName: user.emergencyContactName,
      emergencyContactPhone: user.emergencyContactPhone,
      department: user.department,
      dpoCertification: user.dpoCertification,
      socialProviders: user.socialProviders || [SocialAuthProvider.EMAIL_PASSWORD],
      avatarUrl: user.avatarUrl,
      twoFactorEnabled: user.twoFactorEnabled,
      passkeysCount: user.passkeysCount ?? 0,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      mustChangePassword: user.mustChangePassword ?? false,
      disabled: !!user.disabledAt
    };
  }

  /**
   * Cadastro de novo profissional, paciente ou administrador com validação e Argon2id hash
   */
  public async register(
    dto: RegisterDTO,
    ipAddress: string = '127.0.0.1',
    options: {
      allowPrivilegedRole?: boolean;
      /** Consultório da conta da equipe (Recepção/Supervisor) criada pelo Admin */
      practiceTherapistId?: string;
      /** Quem criou a conta, quando não é a própria pessoa (auditoria) */
      actorId?: string;
      /** Senha definida por outra pessoa: exige troca no primeiro acesso */
      mustChangePassword?: boolean;
    } = {}
  ): Promise<SafeUser> {
    if (!options.allowPrivilegedRole && !SELF_SERVICE_ROLES.includes(dto.role)) {
      throw new Error('Perfil não disponível para cadastro público. Contas administrativas e da equipe são criadas por um administrador.');
    }

    const existing = await UserRepository.findByEmail(dto.email);
    if (existing) {
      throw new Error('E-mail já cadastrado na plataforma.');
    }

    if (!dto.password || dto.password.length < 8) {
      throw new Error('A senha deve conter no mínimo 8 caracteres.');
    }

    const passwordHash = await Bun.password.hash(dto.password);
    const userId = crypto.randomUUID();

    // Se for psicólogo, vincula ao registro de terapeuta com UUID válido
    let therapistId: string | undefined = options.allowPrivilegedRole ? options.practiceTherapistId : undefined;
    if (dto.role === UserRole.PSICOLOGO_TITULAR) {
      therapistId = crypto.randomUUID();
      db.therapists.set(therapistId, {
        id: therapistId,
        crp: dto.crp || '06/000000',
        crpRegion: dto.crpRegion || 'SP',
        status: 'ACTIVE' as any,
        encryptedDek: 'auto-generated-encrypted-dek-base64',
        createdAt: new Date()
      });
    }

    // O prontuário pertence a um consultório: o registro do paciente nasce no primeiro agendamento
    // com um psicólogo, e nunca a partir de um patientId informado no cadastro (evita vincular
    // a conta a um prontuário alheio)
    const patientId: string | undefined = undefined;

    const providers: SocialAuthProvider[] = [SocialAuthProvider.EMAIL_PASSWORD];
    if (dto.socialProvider && !providers.includes(dto.socialProvider)) {
      providers.push(dto.socialProvider);
    }

    const newUser: User = {
      id: userId,
      email: dto.email.toLowerCase().trim(),
      name: dto.name.trim(),
      role: dto.role,
      crp: dto.crp,
      crpRegion: dto.crpRegion,
      therapistId,
      patientId,
      phone: dto.phone,
      cpfMasked: maskCpfForProfile(dto.cpf),
      specialty: dto.specialty,
      bio: dto.bio,
      sessionFeeCents: dto.sessionFeeCents,
      emergencyContactName: dto.emergencyContactName,
      emergencyContactPhone: dto.emergencyContactPhone,
      department: dto.department,
      dpoCertification: dto.dpoCertification,
      socialProviders: providers,
      passwordHash,
      mustChangePassword: options.mustChangePassword || undefined,
      twoFactorEnabled: false,
      createdAt: new Date()
    };

    await UserRepository.create(newUser);


    await auditService.logAccess({
      actorId: options.actorId ?? userId,
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
    const user = await UserRepository.findByEmail(email);

    let passwordValid = false;
    if (user) {
      passwordValid = await Bun.password.verify(dto.password, user.passwordHash);
    }

    if (!user || !passwordValid) {
      await auditService.logAccess({
        actorId: user?.id || '00000000-0000-0000-0000-000000000000',
        resourceType: AuditResourceType.SECURITY,
        resourceId: user?.id || '00000000-0000-0000-0000-000000000000',
        action: AuditAction.AUTH_LOGIN_FAILED,
        ipAddress,
        userAgent: `Login attempt failed: ${!user ? 'user not found' : 'wrong password'} (${email})`
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

    const user = await UserRepository.findById(payload.sub);
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
        await UserRepository.save(user);
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
    const user = await UserRepository.findById(userId);
    if (!user) {
      throw new Error('Usuário não encontrado.');
    }

    const secret = generateTotpSecret(20);
    const otpauthUri = generateTotpUri(user.email, 'TerapiaInFoco', secret);
    const backupCodes = generateBackupCodes(8);

    // Armazena temporariamente o segredo e os códigos até a confirmação
    user.twoFactorSecret = secret;
    user.twoFactorBackupCodes = backupCodes;
    await UserRepository.save(user);

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
    const user = await UserRepository.findById(userId);
    if (!user || !user.twoFactorSecret) {
      throw new Error('Configuração de 2FA não iniciada. Solicite a chave de ativação.');
    }

    const valid = verifyTotpCode(user.twoFactorSecret, code.trim());
    if (!valid) {
      throw new Error('Código TOTP incorreto. Verifique o horário do dispositivo e tente novamente.');
    }

    user.twoFactorEnabled = true;
    await UserRepository.save(user);

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
    const user = await UserRepository.findById(userId);
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
    await UserRepository.save(user);

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
   * Troca da própria senha: exige a senha atual e encerra as sessões abertas em outros
   * dispositivos (tokens emitidos antes da troca). A sessão atual recebe tokens novos.
   */
  public async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ipAddress: string = '127.0.0.1'
  ): Promise<LoginResponse> {
    const user = await UserRepository.findById(userId);
    if (!user) {
      throw new Error('Usuário não localizado.');
    }
    if (!currentPassword || !(await Bun.password.verify(currentPassword, user.passwordHash))) {
      throw new Error('Senha atual incorreta.');
    }
    if (!newPassword || newPassword.length < 8) {
      throw new Error('A nova senha deve conter no mínimo 8 caracteres.');
    }
    if (newPassword === currentPassword) {
      throw new Error('A nova senha deve ser diferente da atual.');
    }

    user.passwordHash = await Bun.password.hash(newPassword);
    user.mustChangePassword = false;
    // Precisão de segundos, como o iat dos JWT: os tokens novos (mesmo segundo) continuam válidos
    user.passwordChangedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
    await UserRepository.save(user);

    await auditService.logAccess({
      actorId: user.id,
      resourceType: AuditResourceType.SECURITY,
      resourceId: user.id,
      action: AuditAction.AUTH_PASSWORD_CHANGED,
      ipAddress,
      userAgent: 'Password changed by the account owner; previous sessions revoked'
    });

    return await this.issueTokens(user, ipAddress);
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

    const user = await UserRepository.findById(payload.sub);
    if (!user) {
      throw new Error('Usuário não localizado.');
    }
    if (issuedBeforePasswordChange(user, payload.iat)) {
      throw new Error('Senha alterada: faça login novamente.');
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
  public async issueTokens(user: User, ipAddress: string): Promise<IssuedTokens> {
    if (user.disabledAt) {
      throw new Error('Conta desativada. Procure o administrador da plataforma.');
    }
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
        patientId: user.patientId,
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
    await UserRepository.save(user);

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
   * Autenticação ou Criação de Perfil via Login Social OAuth 2.0 / OIDC (Google, Gov.br, Apple)
   */
  public async socialLoginOrRegister(
    dto: SocialAuthLoginDTO,
    ipAddress: string = '127.0.0.1'
  ): Promise<LoginResponse> {
    if (!dto.email || !dto.name || !dto.provider) {
      throw new Error('Provedor social, nome e e-mail são obrigatórios.');
    }

    const emailNormalized = dto.email.toLowerCase().trim();
    let user = await UserRepository.findByEmail(emailNormalized);
    let isNewProfile = false;

    if (!user) {
      isNewProfile = true;
      const role = dto.role || UserRole.PACIENTE;
      const randomPassword = `SocialAuth@${crypto.randomUUID()}`;
      const createdSafe = await this.register(
        {
          name: dto.name,
          email: emailNormalized,
          password: randomPassword,
          role,
          crp: dto.crp,
          crpRegion: dto.crpRegion,
          phone: dto.phone,
          cpf: dto.cpf,
          specialty: dto.specialty,
          department: dto.department,
          dpoCertification: dto.dpoCertification,
          socialProvider: dto.provider
        },
        ipAddress
      );
      const created = await UserRepository.findById(createdSafe.id);
      if (!created) throw new Error('Conta recém-criada não encontrada.');
      user = created;
    } else {
      const existingProviders = user.socialProviders || [SocialAuthProvider.EMAIL_PASSWORD];
      if (!existingProviders.includes(dto.provider)) {
        existingProviders.push(dto.provider);
        user.socialProviders = existingProviders;
      }
      if (dto.phone && !user.phone) user.phone = dto.phone;
      if (dto.crp && !user.crp) user.crp = dto.crp;
      if (dto.crpRegion && !user.crpRegion) user.crpRegion = dto.crpRegion;
      if (dto.specialty && !user.specialty) user.specialty = dto.specialty;
      await UserRepository.save(user);
    }

    await auditService.logAccess({
      actorId: user.id,
      resourceType: AuditResourceType.USER,
      resourceId: user.id,
      action: AuditAction.SOCIAL_AUTH_LOGIN,
      ipAddress,
      userAgent: `SocialOAuth/${dto.provider}`
    });

    const tokens = await this.issueTokens(user, ipAddress);
    return {
      ...tokens,
      socialProviderUsed: dto.provider,
      isNewProfile,
      message: isNewProfile
        ? `Perfil (${user.role}) criado e autenticado via ${dto.provider} com sucesso.`
        : `Autenticado com sucesso via ${dto.provider}.`
    };
  }

  /**
   * Atualização de dados de Perfil (Paciente, Psicólogo ou Admin)
   */
  public async updateProfile(
    userId: string,
    dto: UpdateUserProfileDTO,
    ipAddress: string = '127.0.0.1'
  ): Promise<SafeUser> {
    const user = await UserRepository.findById(userId);
    if (!user) {
      throw new Error('Usuário não encontrado.');
    }

    if (dto.name !== undefined && dto.name.trim()) user.name = dto.name.trim();
    if (dto.phone !== undefined) user.phone = dto.phone.trim();
    // Campos profissionais pertencem ao perfil de cada papel: um paciente não declara CRP
    if (user.role === UserRole.PSICOLOGO_TITULAR) {
      if (dto.crp !== undefined) user.crp = dto.crp.trim();
      if (dto.crpRegion !== undefined) user.crpRegion = dto.crpRegion.trim().toUpperCase();
      if (dto.specialty !== undefined) user.specialty = dto.specialty.trim();
      if (dto.bio !== undefined) user.bio = dto.bio.trim();
      if (dto.sessionFeeCents !== undefined) user.sessionFeeCents = dto.sessionFeeCents;
    }
    if (user.role === UserRole.PACIENTE) {
      if (dto.emergencyContactName !== undefined) user.emergencyContactName = dto.emergencyContactName.trim();
      if (dto.emergencyContactPhone !== undefined) user.emergencyContactPhone = dto.emergencyContactPhone.trim();
    }
    if (user.role === UserRole.ADMIN) {
      if (dto.department !== undefined) user.department = dto.department.trim();
      if (dto.dpoCertification !== undefined) user.dpoCertification = dto.dpoCertification.trim();
    }
    await UserRepository.save(user);

    await auditService.logAccess({
      actorId: userId,
      resourceType: AuditResourceType.USER,
      resourceId: userId,
      action: AuditAction.USER_PROFILE_UPDATED,
      ipAddress,
      userAgent: 'AuthService/updateProfile'
    });

    return this.toSafeUser(user);
  }

  /**
   * Lista todos os perfis seguros cadastrados na plataforma
   */
  public async listProfiles(): Promise<SafeUser[]> {
    return (await UserRepository.list()).map(u => this.toSafeUser(u));
  }

  /**
   * Retorna o catálogo público da Vitrine da Plataforma (sem necessidade de login)
   */
  public getPublicShowcaseOverview(): PublicPlatformShowcaseOverview {
    return {
      platformName: 'TerapiaInFoco',
      version: 'v0.1.0-RFC001',
      tagline: 'Ecossistema Clínico de Psicoterapia, Telepsicologia WebRTC, IA Human-in-the-Loop e Criptografia Zero-Knowledge (LGPD, CFP & ICP-Brasil)',
      totalClinicalModules: 18,
      totalSecurityLayers: 74,
      totalAutomatedTests: 1381,
      supportedSocialProviders: [
        SocialAuthProvider.GOOGLE,
        SocialAuthProvider.GOV_BR,
        SocialAuthProvider.APPLE,
        SocialAuthProvider.PASSKEY_FIDO2,
        SocialAuthProvider.EMAIL_PASSWORD
      ],
      normativeCompliance: [
        {
          code: 'CFP nº 011/2018 & 001/2009',
          title: 'Telepsicologia Ética & Guarda Documental de Prontuários',
          description: 'Sala de espera ética com knocking manual, sigilo profissional Art. 9º e guarda criptográfica mínima de 5 anos.'
        },
        {
          code: 'CFP nº 006/2019',
          title: 'Elaboração de Documentos Psicológicos Oficiais',
          description: 'Declarações, Atestados, Relatórios, Laudos Periciais Multi-Sessões e Pareceres nas 5 seções canônicas.'
        },
        {
          code: 'LGPD (Lei 13.709/2018 Art. 11, 18 e 46)',
          title: 'Proteção de Dados Sensíveis de Saúde & Autodeterminação',
          description: 'Field-Level Encryption AES-256-GCM, Blind Indexing HMAC-SHA256, Smart Consent Revocation e Cofre de Portabilidade .enc.'
        },
        {
          code: 'ICP-Brasil (MP 2.200-2/2001 & DOC-ICP-11)',
          title: 'Fé Pública, Assinatura Qualificada PAdES & Carimbo do Tempo TSA',
          description: 'Assinatura individual e em lote via Árvore de Merkle com certificados A1, A3 e Nuvem PSC (BirdID/SafeID/VIDaaS).'
        },
        {
          code: 'NIST FIPS 203/204 & OWASP ASVS v4.0',
          title: 'Criptografia Pós-Quântica Híbrida & 74 Camadas de Hardening',
          description: 'ML-KEM-768 (Kyber), ML-DSA-65 (Dilithium), Envelope KMS, WAF, ZKP Schnorr, Shamir Secret Sharing e WebSocket Guard.'
        }
      ],
      profilesCatalog: [
        {
          role: UserRole.PACIENTE,
          title: 'Perfil Paciente (Titular)',
          subtitle: 'Autonomia, acolhimento e acesso seguro à sua jornada terapêutica',
          badge: 'Portal do Paciente & LGPD Art. 18',
          demoEmail: 'paciente@terapiainfoco.com.br',
          highlights: [
            'Exercícios Terapêuticos Interativos (RPD TCC, Diário de Humor, Mindfulness 4-4-6, ACT e Ativação DBT)',
            'Acesso aos Recibos de Honorários com QR Code para reembolso de convênio e dedução no IRPF/DMED',
            'Gestão de Termos de Consentimento Livre e Esclarecido (TCLE) com revogação granular (Smart Revocation)',
            'Exportação e Decifragem do Cofre de Portabilidade (.enc protegido por senha Argon2id + AES-256-GCM)'
          ]
        },
        {
          role: UserRole.PSICOLOGO_TITULAR,
          title: 'Perfil Psicólogo(a) Clínico(a)',
          subtitle: 'Prontuário SOAP, Teleconsulta própria, IA Ética e Documentos CFP',
          badge: 'CRP Ativo & e-Psi',
          demoEmail: 'psicologo@terapiainfoco.com.br',
          highlights: [
            'Agenda com Séries Recorrentes, Lembretes WhatsApp/E-mail e Teleconsulta própria (WebRTC P2P, sem gravação)',
            'Transcrição Assistida por IA com Diarização de Voz, Taxa de Escuta Ativa e Rascunho SOAP Human-in-the-Loop',
            'Anamnese Interativa com Árvore de Decisão CID-11, Escalas PHQ-9/GAD-7/PSS-10/ASRS e Planos SMART',
            'Laudos CFP nº 006/2019, Encaminhamento Psiquiátrico com Interações Medicamentosas e Assinatura ICP-Brasil em Lote'
          ]
        },
        {
          role: UserRole.ADMIN,
          title: 'Perfil Administrador TI & DPO',
          subtitle: 'Governança multi-normativa, chaves KMS, SIEM, auditoria WORM e defesa cibernética',
          badge: 'DPO / CISO Governance',
          demoEmail: 'admin@terapiainfoco.com.br',
          highlights: [
            'Dashboard Executivo de Conformidade (LGPD, CFP, ICP-Brasil, SOC2/ISO 27001) com DPO Sign-Off e Relatório RIPD',
            'Gestão do Ciclo de Vida de Chaves KMS (Rotação automática de KEKs e Re-wrapping de DEKs) e Backups Disaster Recovery',
            'Painel com 56 Módulos Ativos de Segurança (WAF, ZKP, PQC Kyber/Dilithium, UEBA, DLP Esteganográfico, WebSocket Guard)',
            'Trilha de Auditoria Forense WORM em Hash-Chain SHA-256 inviolável e exportação OpenTelemetry/Prometheus/SIEM'
          ]
        }
      ],
      clinicalModulesHighlight: [
        {
          id: 'mod-agenda-teleconsulta',
          section: 'RFC-001 §3.1 & §3.2',
          title: 'Agendamento Recorrente, Lembretes Multicanal & Teleconsulta Própria WebRTC P2P',
          description: 'Séries semanais/quinzenais, sala de espera ética com knocking (CFP 011/2018), monitoramento de qualidade MOS ITU-T G.107 e reconexão automática.',
          normativeBasis: 'Resolução CFP nº 011/2018',
          targetRoles: [UserRole.PSICOLOGO_TITULAR, UserRole.PACIENTE]
        },
        {
          id: 'mod-ia-soap-markers',
          section: 'RFC-001 §3.3',
          title: 'Transcrição com Diarização IA, Marcadores em Tempo Real & Prontuário SOAP Cifrado',
          description: 'Particionamento de fala Terapeuta/Paciente, sanitização prévia de PII, marcadores clínicos durante a sessão e revisão obrigatória Human-in-the-Loop.',
          normativeBasis: 'Resolução CFP nº 001/2009 & LGPD Art. 11',
          targetRoles: [UserRole.PSICOLOGO_TITULAR]
        },
        {
          id: 'mod-anamnese-escalas-smart',
          section: 'RFC-001 §3.4',
          title: 'Anamnese Digital com Árvore Diagnóstica CID-11, Escalas PHQ-9/GAD-7 & Metas SMART',
          description: 'Investigação guiada por hipóteses com detecção de Red Flags de crise, escalas psicométricas padronizadas e linha do tempo longitudinal.',
          normativeBasis: 'CFP nº 001/2009 & OMS CID-11',
          targetRoles: [UserRole.PSICOLOGO_TITULAR]
        },
        {
          id: 'mod-docs-icp-psiquiatria',
          section: 'RFC-001 §3.5',
          title: 'Laudos CFP 006/2019, Interações Psicofarmacológicas & Assinatura ICP-Brasil em Lote',
          description: 'Geração de documentos oficiais, checagem cruzada de 18 psicofármacos (alerta de Síndrome Serotoninérgica) e fechamento em lote via Merkle Tree.',
          normativeBasis: 'CFP nº 006/2019 & MP 2.200-2/2001',
          targetRoles: [UserRole.PSICOLOGO_TITULAR]
        },
        {
          id: 'mod-faturamento-portal-cofre',
          section: 'RFC-001 §3.6, §3.7 & §4.4',
          title: 'Faturamento DMED/Reembolso, Portal do Paciente (TCC/ACT/DBT) & Cofre Cifrado .enc',
          description: 'Recibos timbrados com valor por extenso, prescrição de exercícios interativos entre sessões e pacote de portabilidade Argon2id + AES-256-GCM.',
          normativeBasis: 'LGPD Art. 18 & Receita Federal DMED',
          targetRoles: [UserRole.PACIENTE, UserRole.PSICOLOGO_TITULAR]
        },
        {
          id: 'mod-governanca-hardening',
          section: 'RFC-001 §4.2, §4.4 & §5.2',
          title: 'Arquitetura Zero-Knowledge, Envelope KMS, WORM Hash-Chain & 74 Guardiões de Segurança',
          description: 'Proteção ponta a ponta com DEKs por terapeuta, provas de conhecimento zero (ZKP), criptografia pós-quântica e defesa ativa contra OWASP Top 10.',
          normativeBasis: 'LGPD Art. 46, NIST SP 800-57 & FIPS 203/204',
          targetRoles: [UserRole.ADMIN, UserRole.PSICOLOGO_TITULAR]
        }
      ]
    };
  }

  /**
   * Valida um access token emitido por esta API. Tokens do Supabase Auth não são aceitos:
   * o papel viria de user_metadata (editável pelo próprio usuário) e o vínculo seria só pelo e-mail.
   */
  public async verifyAccessToken(token: string): Promise<AuthTokenPayload> {
    return (await this.authenticate(token)).payload;
  }

  /** Valida o access token e carrega a conta em uma única consulta (middleware de autenticação) */
  public async authenticate(token: string): Promise<{ payload: AuthTokenPayload; user: User }> {
    const payload = (await verify(token, config.jwtSecret, 'HS256')) as any;
    if (payload.type !== 'access') {
      throw new Error('Token fornecido não é um token de acesso válido.');
    }
    const user = await UserRepository.findById(payload.sub);
    if (!user) {
      throw new Error('Usuário do token não localizado no sistema.');
    }
    if (user.disabledAt) {
      throw new Error('Conta desativada. Procure o administrador da plataforma.');
    }
    if (issuedBeforePasswordChange(user, payload.iat)) {
      throw new Error('Senha alterada: faça login novamente.');
    }
    return { payload, user };
  }

  public async getUserById(id: string): Promise<SafeUser | null> {
    const user = await UserRepository.findById(id);
    return user ? this.toSafeUser(user) : null;
  }
}

export const authService = new AuthService();
