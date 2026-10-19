import { getDb } from '../db';
import { persistence } from '../db/memoryDb';
import { authService } from '../services/authService';
import { UserRole, type RegisterDTO } from '@terapiainfoco/shared';

/**
 * Cria uma conta ADMIN/DPO (perfil indisponível no cadastro público).
 * Uso: ADMIN_PASSWORD='...' bun run admin:create <email> "<Nome Completo>"
 */
const [email, name] = process.argv.slice(2);
const password = process.env.ADMIN_PASSWORD;

if (!email || !name || !password) {
  console.error('Uso: ADMIN_PASSWORD=\'<senha forte>\' bun run admin:create <email> "<Nome Completo>"');
  process.exit(1);
}
if (password.length < 12) {
  console.error('A senha de administrador deve ter no mínimo 12 caracteres.');
  process.exit(1);
}

await getDb();
const dto = { email, name, password, role: UserRole.ADMIN } as RegisterDTO;
const admin = await authService.register(dto, 'cli/admin:create', { allowPrivilegedRole: true });
await persistence.detach();
console.log(`✅ Administrador criado: ${admin.email} (${admin.id}). Ative o 2FA no primeiro acesso.`);
process.exit(0);
