import { and, asc, eq, inArray, notInArray, sql, type SQL } from 'drizzle-orm';
import { getDb, schema, type AppDb } from '../db';
import type { SocialAuthProvider, User, UserRole } from '@terapiainfoco/shared';

/**
 * Repositório SQL das contas de usuário (ADR-004 fase 2): a tabela `users` é a fonte de verdade,
 * sem cópia no cache em memória. Alterações só valem depois de `save`.
 */

type UserRow = typeof schema.users.$inferSelect;
type UserInsert = typeof schema.users.$inferInsert;

function toDate(value: Date | string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as UserRole,
    crp: row.crp ?? undefined,
    crpRegion: row.crpRegion ?? undefined,
    therapistId: row.therapistId ?? undefined,
    patientId: row.patientId ?? undefined,
    phone: row.phone ?? undefined,
    cpfMasked: row.cpfMasked ?? undefined,
    specialty: row.specialty ?? undefined,
    bio: row.bio ?? undefined,
    sessionFeeCents: row.sessionFeeCents ?? undefined,
    emergencyContactName: row.emergencyContactName ?? undefined,
    emergencyContactPhone: row.emergencyContactPhone ?? undefined,
    department: row.department ?? undefined,
    dpoCertification: row.dpoCertification ?? undefined,
    socialProviders: row.socialProviders as SocialAuthProvider[],
    avatarUrl: row.avatarUrl ?? undefined,
    passwordHash: row.passwordHash,
    passwordChangedAt: row.passwordChangedAt ?? undefined,
    mustChangePassword: row.mustChangePassword || undefined,
    twoFactorEnabled: row.twoFactorEnabled,
    twoFactorSecret: row.twoFactorSecret ?? undefined,
    twoFactorBackupCodes: row.twoFactorBackupCodes ?? undefined,
    passkeysCount: row.passkeysCount,
    disabledAt: row.disabledAt ?? undefined,
    createdAt: row.createdAt,
    lastLoginAt: row.lastLoginAt
  };
}

function toRow(user: User): UserInsert {
  return {
    id: user.id,
    email: user.email.toLowerCase().trim(),
    name: user.name,
    role: user.role,
    crp: user.crp ?? null,
    crpRegion: user.crpRegion ?? null,
    therapistId: user.therapistId ?? null,
    patientId: user.patientId ?? null,
    phone: user.phone ?? null,
    cpfMasked: user.cpfMasked ?? null,
    specialty: user.specialty ?? null,
    bio: user.bio ?? null,
    sessionFeeCents: user.sessionFeeCents ?? null,
    emergencyContactName: user.emergencyContactName ?? null,
    emergencyContactPhone: user.emergencyContactPhone ?? null,
    department: user.department ?? null,
    dpoCertification: user.dpoCertification ?? null,
    socialProviders: user.socialProviders ?? [],
    avatarUrl: user.avatarUrl ?? null,
    passwordHash: user.passwordHash,
    passwordChangedAt: toDate(user.passwordChangedAt),
    mustChangePassword: user.mustChangePassword ?? false,
    twoFactorEnabled: user.twoFactorEnabled,
    twoFactorSecret: user.twoFactorSecret ?? null,
    twoFactorBackupCodes: user.twoFactorBackupCodes ?? null,
    passkeysCount: user.passkeysCount ?? 0,
    disabledAt: toDate(user.disabledAt),
    createdAt: toDate(user.createdAt) ?? new Date(),
    lastLoginAt: toDate(user.lastLoginAt)
  };
}

export interface UserListFilter {
  therapistId?: string;
  roles?: UserRole[];
  excludeRoles?: UserRole[];
}

const emailMatches = (email: string): SQL => sql`lower(${schema.users.email}) = ${email.toLowerCase().trim()}`;

export const UserRepository = {
  async findById(id: string): Promise<User | null> {
    const db: any = await getDb();
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return row ? toUser(row) : null;
  },

  /** Busca por e-mail sem diferenciar maiúsculas (o índice único usa lower(email)) */
  async findByEmail(email: string): Promise<User | null> {
    const db: any = await getDb();
    const [row] = await db.select().from(schema.users).where(emailMatches(email));
    return row ? toUser(row) : null;
  },

  async list(filter: UserListFilter = {}): Promise<User[]> {
    const conditions: SQL[] = [];
    if (filter.therapistId) conditions.push(eq(schema.users.therapistId, filter.therapistId));
    if (filter.roles?.length) conditions.push(inArray(schema.users.role, filter.roles));
    if (filter.excludeRoles?.length) conditions.push(notInArray(schema.users.role, filter.excludeRoles));
    const db: any = await getDb();
    const rows: UserRow[] = await db.select().from(schema.users)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(schema.users.createdAt));
    return rows.map(toUser);
  },

  /** Psicólogo titular do consultório (nunca a recepção ou o supervisor do mesmo therapistId) */
  async findPracticeOwner(therapistId: string): Promise<User | null> {
    const db: any = await getDb();
    const [row] = await db.select().from(schema.users).where(and(
      eq(schema.users.therapistId, therapistId),
      eq(schema.users.role, 'PSICOLOGO_TITULAR')
    )).orderBy(asc(schema.users.createdAt)).limit(1);
    return row ? toUser(row) : null;
  },

  /** Ids das contas de um consultório (equipe e titular) */
  async idsByTherapist(therapistId: string): Promise<Set<string>> {
    const db: any = await getDb();
    const rows: { id: string }[] = await db.select({ id: schema.users.id }).from(schema.users)
      .where(eq(schema.users.therapistId, therapistId));
    return new Set(rows.map((row) => row.id));
  },

  /** Insere a conta; e-mail repetido viola o índice único e lança erro */
  async create(user: User): Promise<User> {
    const db: any = await getDb();
    const [row] = await db.insert(schema.users).values(toRow(user)).returning();
    return toUser(row);
  },

  /** Grava o estado completo da conta (padrão: carregar, alterar e salvar) */
  async save(user: User): Promise<User> {
    const { id, createdAt, ...changes } = toRow(user);
    const db: any = await getDb();
    const [row] = await db.update(schema.users).set(changes).where(eq(schema.users.id, id)).returning();
    if (!row) throw new Error(`Usuário ${id} não encontrado.`);
    return toUser(row);
  },

  /**
   * Insere ou substitui contas (importação do entity_store e restauração de backup).
   * Durante a inicialização do banco recebe a conexão, pois `getDb()` ainda não resolveu.
   */
  async upsertMany(users: User[], connection?: AppDb): Promise<void> {
    if (users.length === 0) return;
    const db: any = connection ?? await getDb();
    const rows = users.map(toRow);
    await db.insert(schema.users).values(rows).onConflictDoUpdate({
      target: schema.users.id,
      set: Object.fromEntries(
        Object.keys(rows[0]!).filter((key) => key !== 'id').map((key) => {
          const column = (schema.users as any)[key];
          return [key, sql.raw(`excluded."${column.name}"`)];
        })
      )
    });
  },

  /** Insere só as contas cujo id ainda não existe (aceita a conexão da inicialização, como `upsertMany`) */
  async insertMissing(users: User[], connection?: AppDb): Promise<void> {
    if (users.length === 0) return;
    const db: any = connection ?? await getDb();
    await db.insert(schema.users).values(users.map(toRow)).onConflictDoNothing();
  },

  async deleteAll(): Promise<void> {
    const db: any = await getDb();
    await db.delete(schema.users);
  }
};
