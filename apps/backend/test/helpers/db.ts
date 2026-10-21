import type { User } from '@terapiainfoco/shared';
import { db } from '../../src/db/memoryDb';
import { seedDemoUsers } from '../../src/db/demoUsers';
import { UserRepository } from '../../src/repositories/userRepository';

/**
 * Estado inicial de cada teste: cache em memória limpo e tabelas SQL dos domínios
 * já promovidos (ADR-004 fase 2) de volta às contas de demonstração.
 */
export async function resetDb(): Promise<void> {
  db.clear();
  await UserRepository.deleteAll();
  await seedDemoUsers();
}

/** Conta existente (falha o teste se não existir) */
export async function requireUser(id: string): Promise<User> {
  const user = await UserRepository.findById(id);
  if (!user) throw new Error(`Usuário ${id} não encontrado no banco de teste.`);
  return user;
}

export function listUsers(): Promise<User[]> {
  return UserRepository.list();
}
