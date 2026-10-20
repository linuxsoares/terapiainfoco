import { app } from '../../src/index';
import { db } from '../../src/db/memoryDb';
import { authService } from '../../src/services/authService';

/** Conta Admin do seed (`admin@terapiainfoco.com.br`) */
export const SEED_ADMIN_ID = '00000000-0000-0000-0000-000000000004';

/**
 * `app.request` autenticado como Admin, para as ferramentas da plataforma
 * (painel de Segurança) que exigem esse perfil.
 */
export async function adminRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const admin = db.users.get(SEED_ADMIN_ID);
  if (!admin) throw new Error('Admin do seed ausente no memoryDb');
  const { accessToken } = await authService.issueTokens(admin, '127.0.0.1');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  return app.request(path, { ...init, headers });
}
