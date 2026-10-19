import type { Context, Next } from 'hono';
import { authService } from '../services/authService';
import { db } from '../db/memoryDb';
import { UserRole, type SafeUser } from '@terapiainfoco/shared';

declare module 'hono' {
  interface ContextVariableMap {
    user: SafeUser;
    userId: string;
  }
}

/** Equipe do consultório: acessa agenda e pacientes do próprio psicólogo */
export const PRACTICE_STAFF_ROLES: UserRole[] = [
  UserRole.PSICOLOGO_TITULAR,
  UserRole.SUPERVISOR_CLINICO,
  UserRole.RECEPCAO_SECRETARIA
];

export interface AuthMiddlewareOptions {
  optional?: boolean;
  /** @deprecated a autenticação agora é sempre obrigatória (exceto com `optional`) */
  strict?: boolean;
}

/**
 * Middleware de Autenticação JWT com extração de usuário e perfil RBAC
 */
export function authMiddleware(options: AuthMiddlewareOptions = {}) {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header('Authorization');

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      try {
        const payload = await authService.verifyAccessToken(token);
        const user = db.users.get(payload.sub);
        if (!user) {
          return c.json({ success: false, error: 'Usuário do token não localizado no sistema.' }, 401);
        }
        const safeUser = authService.toSafeUser(user);
        c.set('user', safeUser);
        c.set('userId', safeUser.id);
        return await next();
      } catch (err: any) {
        return c.json({ success: false, error: err.message || 'Token de autenticação inválido ou expirado.' }, 401);
      }
    }

    // Se opcional, continua sem anexar usuário
    if (options.optional) {
      return await next();
    }

    return c.json({ success: false, error: 'Autenticação obrigatória. Header Authorization ausente.' }, 401);
  };
}

/**
 * Middleware RBAC (Role-Based Access Control)
 * Bloqueia perfis não autorizados com status HTTP 403 Forbidden
 */
export function requireRoles(allowedRoles: UserRole[]) {
  return async (c: Context, next: Next) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ success: false, error: 'Autenticação necessária para acessar este recurso.' }, 401);
    }

    if (!allowedRoles.includes(user.role)) {
      return c.json(
        {
          success: false,
          error: `Acesso negado: Perfil ${user.role} não possui permissão para executar esta operação.`,
          requiredRoles: allowedRoles,
          currentRole: user.role
        },
        403
      );
    }

    return await next();
  };
}

/**
 * Alias flexível para requireRoles, aceitando array ou múltiplos argumentos
 */
export function requireRole(roles: UserRole[] | UserRole, ...moreRoles: UserRole[]) {
  const allowed = Array.isArray(roles) ? roles : [roles, ...moreRoles];
  return requireRoles(allowed);
}

