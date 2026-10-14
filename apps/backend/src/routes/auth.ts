import { Hono } from 'hono';
import { config } from '../config';
import { authService } from '../services/authService';
import { WebAuthnService } from '../services/webauthnService';
import { GoogleMeetService } from '../services/googleMeetService';
import { authMiddleware } from '../middlewares/authMiddleware';
import { authRateLimiter } from '../middlewares/rateLimiter';
import type { 
  RegisterDTO, 
  LoginDTO, 
  TwoFactorVerifyDTO, 
  RefreshTokenDTO,
  PasskeyRegistrationVerifyDTO,
  PasskeyAuthenticationVerifyDTO
} from '@terapiainfoco/shared';

export const authRoute = new Hono();

/**
 * POST /api/auth/register
 * Cadastro de novo profissional clínico ou membro da equipe
 */
authRoute.post('/register', async (c) => {
  try {
    const body = await c.req.json<RegisterDTO>();
    if (!body.email || !body.password || !body.name || !body.role) {
      return c.json({ success: false, error: 'Campos obrigatórios: name, email, password, role.' }, 400);
    }

    const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
    const user = await authService.register(body, ip);

    return c.json({ success: true, user }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Falha ao registrar usuário.' }, 400);
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
 * Retorna o perfil do usuário logado
 */
authRoute.get('/me', authMiddleware({ strict: true }), async (c) => {
  const user = c.get('user');
  return c.json({ success: true, user });
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

/**
 * GET /api/auth/google/authorize
 * Redireciona o psicólogo para a tela de consentimento do Google OAuth 2.0 (ou retorna URL em JSON)
 */
authRoute.get('/google/authorize', async (c) => {
  try {
    let redirectUri = c.req.query('redirect_uri');
    if (!redirectUri) {
      if (config.google.redirectUri) {
        redirectUri = config.google.redirectUri;
      } else {
        const proto = c.req.header('x-forwarded-proto') || 'https';
        const host = c.req.header('x-forwarded-host') || c.req.header('host') || 'localhost:3000';
        redirectUri = `${proto}://${host}/api/auth/google/callback`;
      }
    }
    const state = c.req.query('state');
    const format = c.req.query('format');

    const authUrl = GoogleMeetService.getAuthorizationUrl(redirectUri, state);

    if (format === 'json') {
      return c.json({ success: true, url: authUrl, redirectUri });
    }

    return c.redirect(authUrl);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

/**
 * GET /api/auth/google/callback
 * Recebe o código de autorização do Google após o consentimento do usuário
 */
authRoute.get('/google/callback', async (c) => {
  const code = c.req.query('code');
  const error = c.req.query('error');
  const errorDescription = c.req.query('error_description');

  if (error) {
    return c.html(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Erro de Conexão - Google Meet</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; text-align: center; }
          .card { background: #1e293b; padding: 2.5rem; border-radius: 1.5rem; border: 1px solid #dc2626; max-width: 440px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
          .badge { display: inline-block; background: #ef4444; color: #fff; font-size: 0.75rem; padding: 0.25rem 0.75rem; border-radius: 9999px; margin-bottom: 1rem; font-weight: 600; }
          h2 { margin: 0 0 0.5rem 0; font-size: 1.25rem; }
          p { color: #94a3b8; font-size: 0.875rem; line-height: 1.5; margin: 0.5rem 0; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">Autorização Não Concluída</div>
          <h2>Falha na Conexão Google</h2>
          <p>${error}: ${errorDescription || 'Autorização negada pelo usuário ou escopos recusados.'}</p>
        </div>
      </body>
      </html>
    `, 400);
  }

  if (!code) {
    return c.json({ success: false, error: 'Código de autorização não informado na requisição.' }, 400);
  }

  try {
    let callbackRedirectUri = config.google.redirectUri;
    if (!callbackRedirectUri) {
      const proto = c.req.header('x-forwarded-proto') || 'https';
      const host = c.req.header('x-forwarded-host') || c.req.header('host') || 'localhost:3000';
      callbackRedirectUri = `${proto}://${host}/api/auth/google/callback`;
    }

    const tokens = await GoogleMeetService.exchangeCodeForTokens(code, callbackRedirectUri);

    return c.html(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Google Meet Conectado com Sucesso</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; text-align: center; }
          .card { background: #1e293b; padding: 2.5rem; border-radius: 1.5rem; border: 1px solid #334155; max-width: 440px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
          .badge { display: inline-block; background: #10b981; color: #fff; font-size: 0.75rem; padding: 0.25rem 0.75rem; border-radius: 9999px; margin-bottom: 1rem; font-weight: 600; }
          h2 { margin: 0 0 0.5rem 0; font-size: 1.25rem; }
          p { color: #94a3b8; font-size: 0.875rem; line-height: 1.5; margin: 0.5rem 0; }
          .email { font-family: monospace; color: #38bdf8; font-weight: 600; word-break: break-all; margin: 0.75rem 0; }
          .btn { display: inline-block; margin-top: 1.5rem; padding: 0.75rem 1.5rem; background: #0ea5e9; color: #fff; text-decoration: none; border-radius: 0.75rem; font-weight: 600; font-size: 0.875rem; transition: background 0.2s; }
          .btn:hover { background: #0284c7; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">✓ Conexão Ativa</div>
          <h2>Google Meet Conectado!</h2>
          <p>Sua conta Google Workspace foi vinculada ao TerapiaInFoco para geração automática de salas de teleconsulta (Google Meet REST API v2).</p>
          ${tokens.email ? `<p class="email">${tokens.email}</p>` : ''}
          <a href="/agenda" class="btn">Retornar à Agenda</a>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'GOOGLE_MEET_AUTH_SUCCESS', email: ${JSON.stringify(tokens.email || null)} }, '*');
            setTimeout(() => window.close(), 1500);
          }
        </script>
      </body>
      </html>
    `, 200);
  } catch (err: any) {
    return c.html(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Erro de Troca de Tokens</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; text-align: center; }
          .card { background: #1e293b; padding: 2.5rem; border-radius: 1.5rem; border: 1px solid #dc2626; max-width: 440px; }
          p { color: #f87171; font-size: 0.875rem; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Falha ao Vincular Conta Google</h2>
          <p>${err.message || 'Erro inesperado durante a troca de credenciais OAuth.'}</p>
        </div>
      </body>
      </html>
    `, 500);
  }
});

/**
 * GET /api/auth/google/status
 * Status da conexão OAuth 2.0 com Google Meet
 */
authRoute.get('/google/status', (c) => {
  const diag = GoogleMeetService.getDiagnostics();
  return c.json({
    success: true,
    connected: diag.configured,
    activeProvider: diag.activeProvider,
    oauth: diag.oauth
  });
});

/**
 * POST /api/auth/google/disconnect
 * Desconecta as credenciais dinâmicas do Google Meet
 */
authRoute.post('/google/disconnect', (c) => {
  GoogleMeetService.clearTokens();
  return c.json({
    success: true,
    message: 'Credenciais Google Meet revogadas com sucesso nesta sessão.'
  });
});


