import { and, eq, isNull } from 'drizzle-orm';
import { getDb, schema } from '../db';

export type AuthTokenPurpose = 'PASSWORD_RESET' | 'EMAIL_VERIFICATION';

export interface StoredAuthToken {
  id: string;
  userId: string;
  purpose: AuthTokenPurpose;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

type AuthTokenRow = typeof schema.authTokens.$inferSelect;

function toToken(row: AuthTokenRow): StoredAuthToken {
  return {
    id: row.id,
    userId: row.userId,
    purpose: row.purpose as AuthTokenPurpose,
    tokenHash: row.tokenHash,
    expiresAt: new Date(row.expiresAt),
    usedAt: row.usedAt ? new Date(row.usedAt) : null,
    createdAt: new Date(row.createdAt)
  };
}

/** Tokens de uso único enviados por e-mail (só o hash é persistido) */
export const AuthTokenRepository = {
  async create(token: StoredAuthToken): Promise<void> {
    const db: any = await getDb();
    await db.insert(schema.authTokens).values(token);
  },

  async findByHash(tokenHash: string): Promise<StoredAuthToken | null> {
    const db: any = await getDb();
    const [row] = await db.select().from(schema.authTokens).where(eq(schema.authTokens.tokenHash, tokenHash));
    return row ? toToken(row) : null;
  },

  /** Marca como usado; devolve false se outro pedido já o consumiu (corrida) */
  async markUsed(id: string): Promise<boolean> {
    const db: any = await getDb();
    const rows = await db.update(schema.authTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(schema.authTokens.id, id), isNull(schema.authTokens.usedAt)))
      .returning({ id: schema.authTokens.id });
    return rows.length > 0;
  },

  /** Invalida os tokens pendentes do usuário para a finalidade (ex.: novo pedido de recuperação) */
  async invalidatePending(userId: string, purpose: AuthTokenPurpose): Promise<void> {
    const db: any = await getDb();
    await db.update(schema.authTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(schema.authTokens.userId, userId), eq(schema.authTokens.purpose, purpose), isNull(schema.authTokens.usedAt)));
  },

  async deleteAll(): Promise<void> {
    const db: any = await getDb();
    await db.delete(schema.authTokens);
  }
};
