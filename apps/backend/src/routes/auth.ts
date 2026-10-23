import { Hono } from 'hono';
import { config } from '../config';
import { authService } from '../services/authService';
import { WebAuthnService } from '../services/webauthnService';
import { authMiddleware, requireRole } from '../middlewares/authMiddleware';
import { authRateLimiter } from '../middlewares/rateLimiter';
import { UserRole } from '@terapiainfoco/shared';
import type { 
  RegisterDTO, 
  SocialAuthLoginDTO,
  UpdateUserProfileDTO,
  LoginDTO, 
  TwoFactorVerifyDTO, 
  RefreshTokenDTO,
  PasskeyRegistrationVerifyDTO,
  PasskeyAuthenticationVerifyDTO
} from '@terapiainfoco/shared';

export const authRoute = new Hono();

/**
 * GET /api/auth/public-config
 * Configuração pública do ambiente: o frontend só exibe atalhos de contas demo em DEMO_MODE
 */
authRoute.get('/public-config', (c) => {
  return c.json({ success: true, demoMode: config.demoMode });
});

/**
 * GET /api/auth/public-showcase
 * Vitrine pública da plataforma (sem necessidade de login)
 */
authRoute.get('/public-showcase', (c) => {
  const showcase = authService.getPublicShowcaseOverview();
  return c.json({ success: true, showcase }, 200);
});

/**
 * POST /api/auth/register
 * Cadastro de novo profissional clínico, paciente ou membro da equipe (com ou sem Login Social)
 */
authRoute.post('/register', async (c) => {
  try {
    const body = await c.req.json<RegisterDTO>();
    if (!body.email || !body.password || !body.name || !body.role) {
      return c.json({ success: false, error: 'Campos obrigatórios: name, email, password, role.' }, 400);
    }

    const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
    const user = await authService.register(body, ip);
    await authService.sendEmailVerification(user.id);

    return c.json({ success: true, user }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Falha ao registrar usuário.' }, 400);
  }
});

/**
 * POST /api/auth/social
 * Autenticação ou Criação de Perfil via Login Social OAuth 2.0 / OIDC (Google, Gov.br, Apple)
 *
 * O token do provedor ainda não é verificado: o e-mail informado bastaria para entrar na conta
 * de qualquer usuário. Por isso o fluxo só existe em DEMO_MODE, até a verificação OIDC real.
 */
authRoute.post('/social', async (c) => {
  if (!config.demoMode) {
    return c.json({ success: false, error: 'Login social indisponível. Entre com e-mail e senha.' }, 404);
  }
  try {
    const body = await c.req.json<SocialAuthLoginDTO>();
    if (!body.provider || !body.email || !body.name) {
      return c.json({ success: false, error: 'Campos obrigatórios: provider, name, email.' }, 400);
    }

    const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
    const response = await authService.socialLoginOrRegister(body, ip);
    return c.json(response, response.isNewProfile ? 201 : 200);
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Falha na autenticação social.' }, 400);
  }
});

/**
 * POST /api/auth/login
 * Autenticação de credenciais com proteção contra força bruta (Rate Limiting)
 */
authRoute.post('/login', authRateLimiter, async (c) => {
  try {
    const body = await c.req.json<LoginDTO>();
    if (!body.email || !body.password) {
      return c.json({ success: false, error: 'E-mail e senha são obrigatórios.' }, 400);
    }

    const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
    const response = await authService.login(body, ip);

    return c.json(response, 200);
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Falha na autenticação.' }, 401);
  }
});

/**
 * POST /api/auth/2fa/validate
 * Validação de código TOTP ou código de backup durante o login
 */
authRoute.post('/2fa/validate', authRateLimiter, async (c) => {
  try {
    const body = await c.req.json<TwoFactorVerifyDTO>();
    if (!body.code || !body.tempToken) {
      return c.json({ success: false, error: 'Código de 6 dígitos e token temporário são obrigatórios.' }, 400);
    }

    const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
    const response = await authService.validateLogin2FA(body.tempToken, body.code, ip);

    return c.json(response, 200);
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Falha na validação do 2FA.' }, 401);
  }
});

/**
 * POST /api/auth/refresh
 * Rotação e renovação de token de acesso via refresh token
 */
authRoute.post('/refresh', async (c) => {
  try {
    const body = await c.req.json<RefreshTokenDTO>();
    if (!body.refreshToken) {
      return c.json({ success: false, error: 'Refresh token é obrigatório.' }, 400);
    }

    const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
    const response = await authService.refreshToken(body.refreshToken, ip);

    return c.json(response, 200);
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Falha ao renovar token.' }, 401);
  }
});

/**
 * POST /api/auth/logout
 * Encerramento de sessão e revogação de tokens
 */
authRoute.post('/logout', authMiddleware({ optional: true }), async (c) => {
  try {
    const body = await c.req.json<RefreshTokenDTO>().catch(() => ({ refreshToken: '' }));
    const user = c.get('user');
    const ip = c.req.header('x-forwarded-for') || '127.0.0.1';

    const response = await authService.logout(body?.refreshToken, user?.id, ip);
    return c.json(response, 200);
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Falha ao realizar logout.' }, 400);
  }
});

/**
 * GET /api/auth/me
 * Retorna o perfil completo do usuário logado (Paciente, Psicólogo ou Admin)
 */
authRoute.get('/me', authMiddleware({ strict: true }), async (c) => {
  const user = c.get('user');
  const fullProfile = (await authService.getUserById(user.id)) || user;
  return c.json({ success: true, user: fullProfile });
});

/**
 * PUT /api/auth/profile
 * Atualiza informações do perfil do usuário autenticado (Paciente, Psicólogo ou Admin)
 */
authRoute.put('/profile', authMiddleware({ strict: true }), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json<UpdateUserProfileDTO>();
    const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
    const updated = await authService.updateProfile(user.id, body, ip);
    return c.json({ success: true, user: updated, message: 'Perfil atualizado com sucesso.' }, 200);
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Falha ao atualizar perfil.' }, 400);
  }
});

/**
 * GET /api/auth/profiles
 * Lista perfis cadastrados na plataforma (contém e-mails e telefones: apenas Admin/DPO)
 */
authRoute.get('/profiles', authMiddleware(), requireRole(UserRole.ADMIN), async (c) => {
  const profiles = await authService.listProfiles();
  return c.json({ success: true, profiles }, 200);
});

/**
 * POST /api/auth/password
 * Troca da própria senha (exige a atual); devolve tokens novos e encerra as demais sessões
 */
authRoute.post('/password', authRateLimiter, authMiddleware({ strict: true }), async (c) => {
  const body = await c.req.json<{ currentPassword?: string; newPassword?: string }>().catch(() => null);
  if (!body?.currentPassword || !body?.newPassword) {
    return c.json({ success: false, error: 'Informe a senha atual e a nova senha.' }, 400);
  }
  try {
    const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
    const tokens = await authService.changePassword(c.get('user').id, body.currentPassword, body.newPassword, ip);
    return c.json(tokens, 200);
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Não foi possível alterar a senha.' }, 400);
  }
});

/**
 * POST /api/auth/password/forgot
 * Envia o link de redefinição. A resposta é sempre a mesma, exista ou não a conta.
 */
authRoute.post('/password/forgot', authRateLimiter, async (c) => {
  const body = await c.req.json<{ email?: string }>().catch(() => null);
  if (!body?.email) {
    return c.json({ success: false, error: 'Informe o e-mail da conta.' }, 400);
  }
  await authService.requestPasswordReset(body.email, c.req.header('x-forwarded-for') || '127.0.0.1');
  return c.json({ success: true, message: 'Se houver uma conta com este e-mail, enviamos um link para redefinir a senha.' }, 202);
});

/**
 * POST /api/auth/password/reset
 * Define a nova senha com o token do e-mail (uso único) e encerra as sessões abertas
 */
authRoute.post('/password/reset', authRateLimiter, async (c) => {
  const body = await c.req.json<{ token?: string; newPassword?: string }>().catch(() => null);
  if (!body?.token || !body?.newPassword) {
    return c.json({ success: false, error: 'Informe o token e a nova senha.' }, 400);
  }
  try {
    await authService.resetPassword(body.token, body.newPassword, c.req.header('x-forwarded-for') || '127.0.0.1');
    return c.json({ success: true, message: 'Senha redefinida. Entre com a nova senha.' }, 200);
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Não foi possível redefinir a senha.' }, 400);
  }
});

/**
 * POST /api/auth/email/verify
 * Confirma o e-mail com o token do link enviado no cadastro
 */
authRoute.post('/email/verify', authRateLimiter, async (c) => {
  const body = await c.req.json<{ token?: string }>().catch(() => null);
  if (!body?.token) {
    return c.json({ success: false, error: 'Informe o token de confirmação.' }, 400);
  }
  try {
    const user = await authService.verifyEmail(body.token, c.req.header('x-forwarded-for') || '127.0.0.1');
    return c.json({ success: true, user, message: 'E-mail confirmado.' }, 200);
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Não foi possível confirmar o e-mail.' }, 400);
  }
});

/**
 * POST /api/auth/email/resend
 * Reenvia o link de confirmação para o e-mail da conta logada
 */
authRoute.post('/email/resend', authRateLimiter, authMiddleware({ strict: true }), async (c) => {
  await authService.sendEmailVerification(c.get('user').id);
  return c.json({ success: true, message: 'Se o e-mail ainda não foi confirmado, enviamos um novo link.' }, 202);
});

/**
 * POST /api/auth/2fa/setup
 * Gera segredo e URI otpauth para ativação no Google Authenticator
 */
authRoute.post('/2fa/setup', authMiddleware({ strict: true }), async (c) => {
  try {
    const user = c.get('user');
    const setupData = await authService.setup2FA(user.id);
    return c.json({ success: true, ...setupData });
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Falha ao iniciar configuração de 2FA.' }, 400);
  }
});

/**
 * POST /api/auth/2fa/verify
 * Confirma ativação do 2FA após validar código gerado pelo aplicativo
 */
authRoute.post('/2fa/verify', authMiddleware({ strict: true }), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json<{ code: string }>();
    if (!body.code) {
      return c.json({ success: false, error: 'Código de 6 dígitos é obrigatório.' }, 400);
    }

    const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
    const result = await authService.verify2FA(user.id, body.code, ip);
    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Falha ao verificar 2FA.' }, 400);
  }
});

/**
 * POST /api/auth/2fa/disable
 * Desativa o 2FA mediante confirmação de senha
 */
authRoute.post('/2fa/disable', authMiddleware({ strict: true }), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json<{ password: string }>();
    if (!body.password) {
      return c.json({ success: false, error: 'Senha atual é obrigatória para desativar 2FA.' }, 400);
    }

    const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
    const result = await authService.disable2FA(user.id, body.password, ip);
    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Falha ao desativar 2FA.' }, 400);
  }
});

/**
 * --------------------------------------------------------------------------
 * WEBAUTHN / PASSKEYS & BIOMETRIA FIDO2 (Opção O - RFC-001)
 * --------------------------------------------------------------------------
 */

/**
 * POST /api/auth/passkeys/register/options
 * Inicia registro de nova Passkey gerando desafio WebAuthn
 */
authRoute.post('/passkeys/register/options', authMiddleware({ strict: true }), async (c) => {
  try {
    const user = c.get('user');
    const options = await WebAuthnService.getRegistrationOptions(user.id);
    return c.json(options, 200);
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Falha ao gerar desafio de Passkey.' }, 400);
  }
});

/**
 * POST /api/auth/passkeys/register/verify
 * Conclui registro da Passkey validando clientDataJSON e authenticatorData
 */
authRoute.post('/passkeys/register/verify', authMiddleware({ strict: true }), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json<PasskeyRegistrationVerifyDTO>();
    const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'unknown';

    const result = await WebAuthnService.verifyRegistration(user.id, body, ip, userAgent);
    return c.json({ success: true, passkey: result }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Falha ao registrar Passkey.' }, 400);
  }
});

/**
 * POST /api/auth/passkeys/auth/options
 * Inicia desafio de login Passwordless / FIDO2
 */
authRoute.post('/passkeys/auth/options', authRateLimiter, async (c) => {
  try {
    const body = await c.req.json<{ email?: string }>().catch(() => ({ email: undefined }));
    const options = await WebAuthnService.getAuthenticationOptions(body?.email);
    return c.json(options, 200);
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Falha ao gerar desafio de autenticação.' }, 400);
  }
});

/**
 * POST /api/auth/passkeys/auth/verify
 * Valida assinatura da Passkey e autentica o usuário emitindo tokens JWT
 */
authRoute.post('/passkeys/auth/verify', authRateLimiter, async (c) => {
  try {
    const body = await c.req.json<PasskeyAuthenticationVerifyDTO>();
    const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'unknown';

    const result = await WebAuthnService.verifyAuthentication(body, ip, userAgent);
    return c.json(result, 200);
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Falha ao autenticar com Passkey.' }, 401);
  }
});

/**
 * GET /api/auth/passkeys
 * Lista todas as Passkeys cadastradas pelo usuário logado
 */
authRoute.get('/passkeys', authMiddleware({ strict: true }), async (c) => {
  try {
    const user = c.get('user');
    const passkeys = WebAuthnService.listPasskeys(user.id);
    return c.json({ success: true, passkeys }, 200);
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Falha ao listar Passkeys.' }, 400);
  }
});

/**
 * DELETE /api/auth/passkeys/:id
 * Revoga uma Passkey existente
 */
authRoute.delete('/passkeys/:id', authMiddleware({ strict: true }), async (c) => {
  try {
    const user = c.get('user');
    const passkeyId = c.req.param('id');
    const ip = c.req.header('x-forwarded-for') || '127.0.0.1';

    const result = await WebAuthnService.deletePasskey(user.id, passkeyId, ip);
    return c.json(result, 200);
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Falha ao revogar Passkey.' }, 400);
  }
});


