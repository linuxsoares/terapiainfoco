import type { AppDb } from './index';
import * as schema from './schema';
import { db, persistence } from './memoryDb';
import type { User, StoredPatient, StoredAppointment, StoredClinicalRecord } from '@terapiainfoco/shared';
import { PatientRepository } from '../repositories/patientRepository';
import { AppointmentRepository } from '../repositories/appointmentRepository';
import { ClinicalRecordRepository } from '../repositories/clinicalRecordRepository';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { revive } from './persistence';
import { UserRepository } from '../repositories/userRepository';
import { seedDemoAppointment, seedDemoPatient, seedDemoUsers } from './demoUsers';
import { config } from '../config';
import { kmsProvider } from '../services/cryptoContext';
import { seedDemoTherapistProfile } from '../repositories/therapistProfileRepository';

/**
 * Domínios promovidos a repositórios SQL (ADR-004 fase 2) cujos registros antigos ainda podem
 * estar no entity_store. O entity_store era a fonte de verdade: seus registros substituem
 * linhas legadas de mesmo id. (Contas têm regra própria de e-mail: `moveUsersOutOfEntityStore`.)
 */
const PROMOTED_COLLECTIONS = {
  patients: { table: 'patients', upsert: (rows: unknown[], c: AppDb) => PatientRepository.upsertMany(rows as StoredPatient[], c) },
  appointments: { table: 'appointments', upsert: (rows: unknown[], c: AppDb) => AppointmentRepository.upsertMany(rows as StoredAppointment[], c) },
  clinicalRecords: { table: 'clinical_records', upsert: (rows: unknown[], c: AppDb) => ClinicalRecordRepository.upsertMany(rows as StoredClinicalRecord[], c) }
} as const;

export type PromotedCollection = keyof typeof PROMOTED_COLLECTIONS;

/** Move uma coleção promovida do entity_store para a tabela relacional e devolve quantos registros moveu */
export async function moveOutOfEntityStore(sqlDb: AppDb, collection: PromotedCollection): Promise<number> {
  const rows: { data: unknown }[] = await (sqlDb as any).select({ data: schema.entityStore.data })
    .from(schema.entityStore).where(eq(schema.entityStore.collection, collection));
  if (rows.length === 0) return 0;
  const entities = rows.map((row) => revive(typeof row.data === 'string' ? JSON.parse(row.data) : row.data));
  await PROMOTED_COLLECTIONS[collection].upsert(entities, sqlDb);
  await (sqlDb as any).delete(schema.entityStore).where(eq(schema.entityStore.collection, collection));
  return rows.length;
}

/**
 * Carrega o cache de domínio a partir do PostgreSQL e ativa a persistência durável (ADR-004).
 * Usuários, pacientes, consultas e prontuários já têm repositório SQL próprio (ADR-004 fase 2): os registros
 * que bancos antigos ainda guardam no entity_store são movidos uma vez para as tabelas.
 */
export async function seedAndSyncDatabase(sqlDb: AppDb): Promise<void> {
  const loaded = await persistence.load(sqlDb);
  // Rotações e revogações de KEK feitas antes do restart
  const kmsState = db.kmsState.get('local');
  if (kmsState) kmsProvider.restoreState(kmsState);
  const summary = Object.entries(loaded).map(([name, count]) => `${name}=${count}`).join(', ');
  console.log(`⚡ entity_store carregado: ${summary || 'vazio'}`);

  const movedUsers = await moveUsersOutOfEntityStore(sqlDb);
  if (movedUsers > 0) console.log(`📦 Contas movidas do entity_store para a tabela users: ${movedUsers}`);
  for (const [collection, { table }] of Object.entries(PROMOTED_COLLECTIONS)) {
    const moved = await moveOutOfEntityStore(sqlDb, collection as PromotedCollection);
    if (moved > 0) console.log(`📦 Registros movidos do entity_store para a tabela ${table}: ${moved}`);
  }

  await persistence.attach(sqlDb);

  if (config.demoMode) {
    await seedDemoUsers(sqlDb);
    await seedDemoPatient(sqlDb);
    await seedDemoAppointment(sqlDb);
    await seedDemoTherapistProfile(sqlDb);
  }
}

/**
 * As contas passaram do entity_store para a tabela relacional `users` (ADR-004 fase 2).
 * Bancos criados antes disso têm as contas no entity_store: elas são gravadas na tabela
 * (prevalecendo sobre linhas legadas de mesmo id) e removidas do entity_store.
 */
export async function moveUsersOutOfEntityStore(sqlDb: AppDb): Promise<number> {
  const rows: { data: unknown }[] = await (sqlDb as any).select({ data: schema.entityStore.data })
    .from(schema.entityStore).where(eq(schema.entityStore.collection, 'users'));
  if (rows.length === 0) return 0;
  const users = rows.map((row) => revive(typeof row.data === 'string' ? JSON.parse(row.data) : row.data) as User);
  // Linha legada com o mesmo e-mail e outro id violaria o índice único: o entity_store prevalece
  const ids = users.map((u) => u.id);
  const emails = users.map((u) => u.email.toLowerCase().trim());
  await (sqlDb as any).delete(schema.users).where(and(
    inArray(sql`lower(${schema.users.email})`, emails),
    notInArray(schema.users.id, ids)
  ));
  await UserRepository.upsertMany(users, sqlDb);
  await (sqlDb as any).delete(schema.entityStore).where(eq(schema.entityStore.collection, 'users'));
  return rows.length;
}
