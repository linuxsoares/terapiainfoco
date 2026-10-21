import type { StoredAppointment, StoredPatient, User } from '@terapiainfoco/shared';
import { db } from '../../src/db/memoryDb';
import { seedDemoAppointment, seedDemoPatient, seedDemoUsers } from '../../src/db/demoUsers';
import { UserRepository } from '../../src/repositories/userRepository';
import { PatientRepository } from '../../src/repositories/patientRepository';
import { AppointmentRepository } from '../../src/repositories/appointmentRepository';

/**
 * Estado inicial de cada teste: cache em memória limpo e tabelas SQL dos domínios
 * já promovidos (ADR-004 fase 2) de volta às contas de demonstração, sem pacientes nem consultas.
 */
export async function resetDb(): Promise<void> {
  db.clear();
  await AppointmentRepository.deleteAll();
  await PatientRepository.deleteAll();
  await UserRepository.deleteAll();
  await seedDemoUsers();
}

/** Consultório de demonstração: terapeuta (cache em memória), paciente e consulta (tabelas SQL) */
export async function seedDemoSession(): Promise<void> {
  db.seedDefaultTherapist();
  await seedDemoPatient();
  await seedDemoAppointment();
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

/** Consulta existente (falha o teste se não existir) */
export async function requireAppointment(id: string): Promise<StoredAppointment> {
  const appointment = await AppointmentRepository.findById(id);
  if (!appointment) throw new Error(`Consulta ${id} não encontrada no banco de teste.`);
  return appointment;
}

/** Grava uma consulta direto no banco, substituindo a de mesmo id (dados prontos de teste) */
export async function upsertAppointment(appointment: StoredAppointment): Promise<StoredAppointment> {
  await AppointmentRepository.upsertMany([appointment]);
  return requireAppointment(appointment.id);
}

/** Altera uma consulta no banco (carregar, alterar e salvar) */
export async function updateAppointment(id: string, changes: Partial<StoredAppointment>): Promise<StoredAppointment> {
  return AppointmentRepository.save({ ...(await requireAppointment(id)), ...changes });
}
