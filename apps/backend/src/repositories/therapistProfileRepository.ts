import { and, asc, desc, eq, lte, sql, type SQL } from 'drizzle-orm';
import { getDb, schema, type AppDb } from '../db';
import {
  THERAPEUTIC_APPROACHES,
  CLINICAL_SPECIALTIES,
  type TherapistOwnProfile,
  type TherapistPublicProfile,
  type TherapistSearchParams,
  type UpdateTherapistProfileDTO
} from '@terapiainfoco/shared';

/**
 * Repositório SQL dos perfis públicos de psicólogos (ADR-004 fase 2): consultas
 * diretas no PostgreSQL, com índice full-text sobre o texto normalizado.
 */

type ProfileRow = typeof schema.therapistProfiles.$inferSelect;

const MAX_PAGE_SIZE = 50;

/** Minúsculas e sem acentos: base comum para indexação e consulta */
export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function buildSearchText(row: Pick<ProfileRow, 'displayName' | 'headline' | 'bio' | 'approaches' | 'specialties' | 'languages' | 'crp' | 'crpRegion'>): string {
  return normalizeText([
    row.displayName,
    row.headline ?? '',
    row.bio ?? '',
    ...row.approaches,
    ...row.specialties,
    ...row.languages,
    row.crp,
    row.crpRegion
  ].join(' '));
}

/** Converte o texto livre em consulta por prefixo: "ansied tcc" -> "ansied:* & tcc:*" */
export function toPrefixTsQuery(query: string): string | null {
  const tokens = normalizeText(query).split(/[^a-z0-9]+/).filter((token) => token.length >= 2).slice(0, 8);
  return tokens.length > 0 ? tokens.map((token) => `${token}:*`).join(' & ') : null;
}

function slugBase(name: string): string {
  return normalizeText(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'psicologo';
}

function toPublic(row: ProfileRow): TherapistPublicProfile {
  return {
    therapistId: row.therapistId,
    slug: row.slug,
    displayName: row.displayName,
    crp: row.crp,
    crpRegion: row.crpRegion,
    crpVerified: row.crpVerified,
    headline: row.headline,
    bio: row.bio,
    approaches: row.approaches,
    specialties: row.specialties,
    languages: row.languages,
    sessionFeeCents: row.sessionFeeCents,
    sessionDurationMinutes: row.sessionDurationMinutes
  };
}

function toOwn(row: ProfileRow): TherapistOwnProfile {
  return {
    ...toPublic(row),
    published: row.published,
    crpVerifiedAt: row.crpVerifiedAt ? row.crpVerifiedAt.toISOString() : null
  };
}

function validateCatalog(values: string[] | undefined, catalog: readonly string[], label: string, max: number): string[] | undefined {
  if (values === undefined) return undefined;
  const unique = [...new Set(values)];
  const invalid = unique.filter((value) => !catalog.includes(value));
  if (invalid.length > 0) throw new Error(`${label} inválida(s): ${invalid.join(', ')}`);
  if (unique.length > max) throw new Error(`Selecione no máximo ${max} itens em ${label}.`);
  return unique;
}

/** Validação e saneamento dos campos editáveis pelo psicólogo */
function sanitizeUpdate(dto: UpdateTherapistProfileDTO): Partial<ProfileRow> {
  const update: Partial<ProfileRow> = {};
  if (dto.displayName !== undefined) {
    const name = dto.displayName.trim();
    if (name.length < 3 || name.length > 160) throw new Error('Nome de exibição deve ter entre 3 e 160 caracteres.');
    update.displayName = name;
  }
  if (dto.headline !== undefined) {
    const headline = dto.headline?.trim() || null;
    if (headline && headline.length > 200) throw new Error('Título deve ter no máximo 200 caracteres.');
    update.headline = headline;
  }
  if (dto.bio !== undefined) {
    const bio = dto.bio?.trim() || null;
    if (bio && bio.length > 2000) throw new Error('Apresentação deve ter no máximo 2000 caracteres.');
    update.bio = bio;
  }
  const approaches = validateCatalog(dto.approaches, THERAPEUTIC_APPROACHES, 'Abordagem', 5);
  if (approaches) update.approaches = approaches;
  const specialties = validateCatalog(dto.specialties, CLINICAL_SPECIALTIES, 'Especialidade', 10);
  if (specialties) update.specialties = specialties;
  if (dto.languages !== undefined) {
    update.languages = [...new Set(dto.languages.map((l) => l.trim()).filter(Boolean))].slice(0, 5);
  }
  if (dto.sessionFeeCents !== undefined) {
    const fee = dto.sessionFeeCents;
    if (fee !== null && (!Number.isInteger(fee) || fee < 0 || fee > 1_000_000)) {
      throw new Error('Valor da sessão inválido.');
    }
    update.sessionFeeCents = fee;
  }
  if (dto.sessionDurationMinutes !== undefined) {
    const minutes = dto.sessionDurationMinutes;
    if (!Number.isInteger(minutes) || minutes < 20 || minutes > 180) throw new Error('Duração da sessão deve ficar entre 20 e 180 minutos.');
    update.sessionDurationMinutes = minutes;
  }
  if (dto.published !== undefined) update.published = !!dto.published;
  return update;
}

export const TherapistProfileRepository = {
  async findByTherapistId(therapistId: string): Promise<TherapistOwnProfile | null> {
    const db: any = await getDb();
    const [row] = await db.select().from(schema.therapistProfiles).where(eq(schema.therapistProfiles.therapistId, therapistId));
    return row ? toOwn(row) : null;
  },

  /** Perfil público: apenas publicado e com CRP verificado */
  async findPublicBySlug(slug: string): Promise<TherapistPublicProfile | null> {
    const db: any = await getDb();
    const [row] = await db.select().from(schema.therapistProfiles).where(and(
      eq(schema.therapistProfiles.slug, slug),
      eq(schema.therapistProfiles.published, true),
      eq(schema.therapistProfiles.crpVerified, true)
    ));
    return row ? toPublic(row) : null;
  },

  /**
   * Cria o perfil a partir dos dados da conta (se ainda não existir) e aplica a edição.
   * Perfis novos nascem não publicados e com CRP pendente de verificação.
   */
  async upsertOwnProfile(
    owner: { therapistId: string; userId: string; name: string; crp?: string; crpRegion?: string },
    dto: UpdateTherapistProfileDTO
  ): Promise<TherapistOwnProfile> {
    const update = sanitizeUpdate(dto);
    const db: any = await getDb();

    return await db.transaction(async (tx: any) => {
      let [row]: ProfileRow[] = await tx.select().from(schema.therapistProfiles)
        .where(eq(schema.therapistProfiles.therapistId, owner.therapistId));

      if (!row) {
        if (!owner.crp) throw new Error('Informe seu CRP no perfil da conta antes de criar o perfil público.');
        const base = slugBase(owner.name);
        const [taken] = await tx.select({ slug: schema.therapistProfiles.slug }).from(schema.therapistProfiles)
          .where(eq(schema.therapistProfiles.slug, base));
        const slug = taken ? `${base}-${owner.crp.replace(/\D/g, '') || owner.therapistId.slice(0, 8)}` : base;
        [row] = await tx.insert(schema.therapistProfiles).values({
          therapistId: owner.therapistId,
          userId: owner.userId,
          slug,
          displayName: owner.name,
          crp: owner.crp,
          crpRegion: owner.crpRegion || 'SP'
        }).returning();
      }

      const merged = { ...row, ...update };
      const [saved] = await tx.update(schema.therapistProfiles)
        .set({ ...update, searchText: buildSearchText(merged), updatedAt: new Date() })
        .where(eq(schema.therapistProfiles.therapistId, owner.therapistId))
        .returning();
      return toOwn(saved);
    });
  },

  async search(params: TherapistSearchParams): Promise<{ results: TherapistPublicProfile[]; total: number; page: number; pageSize: number }> {
    const pageSize = Math.min(Math.max(Math.trunc(params.pageSize ?? 12), 1), MAX_PAGE_SIZE);
    const page = Math.max(Math.trunc(params.page ?? 1), 1);
    const table = schema.therapistProfiles;

    const filters: SQL[] = [eq(table.published, true), eq(table.crpVerified, true)];
    const tsQuery = params.q ? toPrefixTsQuery(params.q) : null;
    if (tsQuery) filters.push(sql`${table.searchVector} @@ to_tsquery('simple', ${tsQuery})`);
    if (params.approach) filters.push(sql`${params.approach} = ANY(${table.approaches})`);
    if (params.specialty) filters.push(sql`${params.specialty} = ANY(${table.specialties})`);
    if (params.maxFeeCents !== undefined && Number.isFinite(params.maxFeeCents)) {
      filters.push(lte(table.sessionFeeCents, Math.trunc(params.maxFeeCents)));
    }
    const where = and(...filters);

    const db: any = await getDb();
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(table).where(where);
    const order = tsQuery
      ? [desc(sql`ts_rank(${table.searchVector}, to_tsquery('simple', ${tsQuery}))`), asc(table.displayName)]
      : [asc(table.displayName)];
    const rows: ProfileRow[] = await db.select().from(table).where(where)
      .orderBy(...order)
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { results: rows.map(toPublic), total: count, page, pageSize };
  },

  /**
   * Fila de verificação: perfis que pediram publicação e ainda não têm CRP verificado.
   * Reprovados saem da fila (são despublicados) até o psicólogo publicar novamente.
   */
  async listPendingVerification(): Promise<TherapistOwnProfile[]> {
    const db: any = await getDb();
    const rows: ProfileRow[] = await db.select().from(schema.therapistProfiles)
      .where(and(eq(schema.therapistProfiles.crpVerified, false), eq(schema.therapistProfiles.published, true)))
      .orderBy(asc(schema.therapistProfiles.createdAt));
    return rows.map(toOwn);
  },

  async setCrpVerification(therapistId: string, approved: boolean, adminId: string): Promise<TherapistOwnProfile | null> {
    const db: any = await getDb();
    const [row] = await db.update(schema.therapistProfiles)
      .set({
        crpVerified: approved,
        crpVerifiedAt: approved ? new Date() : null,
        crpVerifiedBy: approved ? adminId : null,
        // Reprovação retira o perfil da busca até nova verificação
        ...(approved ? {} : { published: false }),
        updatedAt: new Date()
      })
      .where(eq(schema.therapistProfiles.therapistId, therapistId))
      .returning();
    return row ? toOwn(row) : null;
  }
};

/**
 * Perfil público verificado da psicóloga demo (DEMO_MODE). Recebe a conexão explicitamente
 * porque roda durante a inicialização do banco, antes de getDb() resolver.
 */
export async function seedDemoTherapistProfile(db: AppDb): Promise<void> {
  const profile = {
    displayName: 'Dra. Beatriz Santos',
    headline: 'Psicóloga clínica (USP) — ansiedade, pânico e burnout',
    bio: 'Atendimento online com Terapia Cognitivo-Comportamental e ACT, com foco em transtornos de ansiedade e saúde mental no trabalho.',
    approaches: ['Terapia Cognitivo-Comportamental (TCC)', 'Terapia de Aceitação e Compromisso (ACT)'],
    specialties: ['Ansiedade', 'Pânico', 'Burnout', 'Depressão'],
    languages: ['Português', 'Inglês'],
    crp: '06/142980',
    crpRegion: 'SP'
  };
  await (db as any).insert(schema.therapistProfiles).values({
    therapistId: 'therapist-001',
    userId: '00000000-0000-0000-0000-000000000001',
    slug: 'beatriz-santos',
    ...profile,
    sessionFeeCents: 25000,
    published: true,
    crpVerified: true,
    crpVerifiedAt: new Date(),
    searchText: buildSearchText(profile)
  }).onConflictDoNothing();
}
