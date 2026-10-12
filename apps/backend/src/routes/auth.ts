import { Hono } from 'hono';
import { authService } from '../services/authService';
import { authMiddleware } from '../middlewares/authMiddleware';
import { authRateLimiter } from '../middlewares/rateLimiter';
import type { RegisterDTO, LoginDTO, TwoFactorVerifyDTO, RefreshTokenDTO } from '@terapiainfoco/shared';

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
