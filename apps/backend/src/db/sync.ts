import type { AppDb } from './index';
import * as schema from './schema';
import { db, persistence } from './memoryDb';
import type { User, StoredPatient, StoredAppointment } from '@terapiainfoco/shared';
import { PatientRepository } from '../repositories/patientRepository';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { revive } from './persistence';
import { UserRepository } from '../repositories/userRepository';
import { seedDemoPatient, seedDemoUsers } from './demoUsers';
import { config } from '../config';
import { kmsProvider } from '../services/cryptoContext';
import { seedDemoTherapistProfile } from '../repositories/therapistProfileRepository';

/**
 * Carrega o cache de domínio a partir do PostgreSQL e ativa a persistência durável (ADR-004).
 *
 * Agendamentos gravados na tabela relacional legada (antes do entity_store) são importados
 * uma única vez: apenas enquanto o entity_store ainda não possui nenhum agendamento.
 * Usuários e pacientes já têm repositório SQL próprio (ADR-004 fase 2).
 */
export async function seedAndSyncDatabase(sqlDb: AppDb): Promise<void> {
  const loaded = await persistence.load(sqlDb);
  // Rotações e revogações de KEK feitas antes do restart
  const kmsState = db.kmsState.get('local');
  if (kmsState) kmsProvider.restoreState(kmsState);
  const summary = Object.entries(loaded).map(([name, count]) => `${name}=${count}`).join(', ');
  console.log(`⚡ entity_store carregado: ${summary || 'vazio'}`);

  const imported = await importLegacyRecords(sqlDb);
  if (imported.length > 0) {
    console.log(`📥 Registros legados importados para o entity_store: ${imported.join(', ')}`);
  }

  const movedUsers = await moveUsersOutOfEntityStore(sqlDb);
  if (movedUsers > 0) console.log(`📦 Contas movidas do entity_store para a tabela users: ${movedUsers}`);
  const movedPatients = await movePatientsOutOfEntityStore(sqlDb);
  if (movedPatients > 0) console.log(`📦 Pacientes movidos do entity_store para a tabela patients: ${movedPatients}`);

  await persistence.attach(sqlDb);

  if (config.demoMode) {
    await seedDemoUsers(sqlDb);
    await seedDemoPatient(sqlDb);
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

/**
 * Os pacientes passaram do entity_store para a tabela relacional `patients` (ADR-004 fase 2).
 * O entity_store era a fonte de verdade: seus registros substituem linhas legadas de mesmo id.
 */
export async function movePatientsOutOfEntityStore(sqlDb: AppDb): Promise<number> {
  const rows: { data: unknown }[] = await (sqlDb as any).select({ data: schema.entityStore.data })
    .from(schema.entityStore).where(eq(schema.entityStore.collection, 'patients'));
  if (rows.length === 0) return 0;
  const patients = rows.map((row) => revive(typeof row.data === 'string' ? JSON.parse(row.data) : row.data) as StoredPatient);
  await PatientRepository.upsertMany(patients, sqlDb);
  await (sqlDb as any).delete(schema.entityStore).where(eq(schema.entityStore.collection, 'patients'));
  return rows.length;
}

async function importLegacyRecords(sqlDb: AppDb): Promise<string[]> {
  const imported: string[] = [];

  if (!persistence.hasPersisted('appointments')) {
    const rows = await (sqlDb as any).select().from(schema.appointments);
    for (const a of rows) {
      const appointment: StoredAppointment = {
        id: a.id,
        therapistId: a.therapistId,
        patientId: a.patientId,
        scheduledStart: a.scheduledStart,
        scheduledEnd: a.scheduledEnd,
        status: a.status,
        createdAt: a.createdAt
      };
      db.appointments.set(appointment.id, appointment);
    }
    if (rows.length > 0) imported.push(`appointments=${rows.length}`);
  }

  return imported;
}
