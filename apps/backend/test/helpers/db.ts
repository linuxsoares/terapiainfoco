import type { StoredPatient, User } from '@terapiainfoco/shared';
import { db } from '../../src/db/memoryDb';
import { seedDemoPatient, seedDemoUsers } from '../../src/db/demoUsers';
import { UserRepository } from '../../src/repositories/userRepository';
import { PatientRepository } from '../../src/repositories/patientRepository';

/**
 * Estado inicial de cada teste: cache em memória limpo e tabelas SQL dos domínios
 * já promovidos (ADR-004 fase 2) de volta às contas de demonstração, sem pacientes.
 */
export async function resetDb(): Promise<void> {
  db.clear();
  await PatientRepository.deleteAll();
  await UserRepository.deleteAll();
  await seedDemoUsers();
}

/** Consultório de demonstração: paciente (tabela `patients`) e consulta (cache em memória) */
export async function seedDemoSession(): Promise<void> {
  await seedDemoPatient();
  db.seedDemoSession();
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

/** Paciente existente (falha o teste se não existir) */
export async function requirePatient(id: string): Promise<StoredPatient> {
  const patient = await PatientRepository.findById(id);
  if (!patient) throw new Error(`Paciente ${id} não encontrado no banco de teste.`);
  return patient;
}

/** Grava um paciente direto no banco, substituindo o de mesmo id (dados prontos de teste) */
export async function upsertPatient(patient: StoredPatient): Promise<StoredPatient> {
  await PatientRepository.upsertMany([patient]);
  return requirePatient(patient.id);
}

/** Altera um paciente no banco (carregar, alterar e salvar) */
export async function updatePatient(id: string, changes: Partial<StoredPatient>): Promise<StoredPatient> {
  return PatientRepository.save({ ...(await requirePatient(id)), ...changes });
}
