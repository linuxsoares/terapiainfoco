import type { AppDb } from './index';
import * as schema from './schema';
import { db, persistence } from './memoryDb';
import type { User, StoredPatient, StoredAppointment } from '@terapiainfoco/shared';
import { PatientRepository } from '../repositories/patientRepository';
import { AppointmentRepository } from '../repositories/appointmentRepository';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { revive } from './persistence';
import { UserRepository } from '../repositories/userRepository';
import { seedDemoAppointment, seedDemoPatient, seedDemoUsers } from './demoUsers';
import { config } from '../config';
import { kmsProvider } from '../services/cryptoContext';
import { seedDemoTherapistProfile } from '../repositories/therapistProfileRepository';

/**
 * Carrega o cache de domínio a partir do PostgreSQL e ativa a persistência durável (ADR-004).
 * Usuários, pacientes e consultas já têm repositório SQL próprio (ADR-004 fase 2): os registros
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
  const movedPatients = await movePatientsOutOfEntityStore(sqlDb);
  if (movedPatients > 0) console.log(`📦 Pacientes movidos do entity_store para a tabela patients: ${movedPatients}`);
  const movedAppointments = await moveAppointmentsOutOfEntityStore(sqlDb);
  if (movedAppointments > 0) console.log(`📦 Consultas movidas do entity_store para a tabela appointments: ${movedAppointments}`);

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

/**
 * As consultas passaram do entity_store para a tabela relacional `appointments` (ADR-004 fase 2).
 * O entity_store era a fonte de verdade: seus registros substituem linhas legadas de mesmo id.
 */
export async function moveAppointmentsOutOfEntityStore(sqlDb: AppDb): Promise<number> {
  const rows: { data: unknown }[] = await (sqlDb as any).select({ data: schema.entityStore.data })
    .from(schema.entityStore).where(eq(schema.entityStore.collection, 'appointments'));
  if (rows.length === 0) return 0;
  const appointments = rows.map((row) => revive(typeof row.data === 'string' ? JSON.parse(row.data) : row.data) as StoredAppointment);
  await AppointmentRepository.upsertMany(appointments, sqlDb);
  await (sqlDb as any).delete(schema.entityStore).where(eq(schema.entityStore.collection, 'appointments'));
  return rows.length;
}
