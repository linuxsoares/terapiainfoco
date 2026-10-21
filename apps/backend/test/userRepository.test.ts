import { describe, it, expect, beforeEach } from 'bun:test';
import { sql } from 'drizzle-orm';
import { UserRole, type User } from '@terapiainfoco/shared';
import { getDb } from '../src/db';
import { encode } from '../src/db/persistence';
import { moveUsersOutOfEntityStore } from '../src/db/sync';
import { UserRepository } from '../src/repositories/userRepository';
import { resetDb } from './helpers/db';

function account(overrides: Partial<User>): User {
  return {
    id: crypto.randomUUID(),
    email: `conta.${crypto.randomUUID().slice(0, 8)}@teste.com`,
    name: 'Conta de Teste',
    role: UserRole.RECEPCAO_SECRETARIA,
    passwordHash: 'hash',
    twoFactorEnabled: false,
    createdAt: new Date(),
    ...overrides
  };
}

describe('UserRepository (ADR-004 fase 2)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('e-mail é único sem diferenciar maiúsculas e a busca também ignora a caixa', async () => {
    const created = await UserRepository.create(account({ email: 'Unico@Teste.com' }));
    expect(created.email).toBe('unico@teste.com');
    expect((await UserRepository.findByEmail('UNICO@teste.COM'))?.id).toBe(created.id);
    await expect(UserRepository.create(account({ email: 'unico@TESTE.com' }))).rejects.toThrow();
  });

  it('save grava as alterações e preserva campos opcionais e datas', async () => {
    const user = await UserRepository.create(account({ therapistId: 'consultorio-x', socialProviders: ['GOOGLE' as any] }));
    user.twoFactorEnabled = true;
    user.twoFactorBackupCodes = ['AAAA-1111'];
    user.disabledAt = new Date('2026-10-21T12:00:00Z');
    await UserRepository.save(user);

    const reloaded = (await UserRepository.findById(user.id))!;
    expect(reloaded.twoFactorEnabled).toBe(true);
    expect(reloaded.twoFactorBackupCodes).toEqual(['AAAA-1111']);
    expect(new Date(reloaded.disabledAt!).toISOString()).toBe('2026-10-21T12:00:00.000Z');
    expect(reloaded.socialProviders).toEqual(['GOOGLE' as any]);
    expect(reloaded.crp).toBeUndefined();
  });

  it('titular do consultório é o psicólogo, nunca a recepção do mesmo therapistId', async () => {
    await UserRepository.create(account({ therapistId: 'consultorio-y', role: UserRole.RECEPCAO_SECRETARIA, createdAt: new Date('2020-01-01') }));
    const owner = await UserRepository.create(account({ therapistId: 'consultorio-y', role: UserRole.PSICOLOGO_TITULAR, name: 'Titular' }));
    expect((await UserRepository.findPracticeOwner('consultorio-y'))?.id).toBe(owner.id);
    expect((await UserRepository.idsByTherapist('consultorio-y')).size).toBe(2);
  });

  it('contas antigas do entity_store vão para a tabela e prevalecem sobre linha legada de mesmo e-mail', async () => {
    const db: any = await getDb();
    await db.execute(sql`INSERT INTO users (id, email, name, role, password_hash) VALUES ('legado-1', 'Colisao@Teste.com', 'Legado', 'ADMIN', 'x')`);
    const current = account({ id: 'atual-1', email: 'colisao@teste.com', name: 'Atual', role: UserRole.ADMIN });
    await db.execute(sql`INSERT INTO entity_store (collection, id, data) VALUES ('users', ${current.id}, ${encode(current)}::jsonb)`);

    expect(await moveUsersOutOfEntityStore(db)).toBe(1);
    expect((await UserRepository.findByEmail('colisao@teste.com'))?.id).toBe('atual-1');
    expect(await UserRepository.findById('legado-1')).toBeNull();
    const left = await db.execute(sql`SELECT count(*)::int AS n FROM entity_store WHERE collection = 'users'`);
    expect((left.rows ?? left)[0].n).toBe(0);
  });
});
