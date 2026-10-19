import type { AppDb } from './index';
import * as schema from './schema';
import { db, persistence } from './memoryDb';
import type { User, StoredPatient, StoredAppointment } from '@terapiainfoco/shared';
import { config } from '../config';
import { seedDemoTherapistProfile } from '../repositories/therapistProfileRepository';

/**
 * Carrega o cache de domínio a partir do PostgreSQL e ativa a persistência durável (ADR-004).
 *
 * Usuários, pacientes e agendamentos gravados nas tabelas relacionais legadas (antes do
 * entity_store) são importados uma única vez: apenas enquanto o entity_store ainda não
 * possui nenhum registro da coleção correspondente.
 */
export async function seedAndSyncDatabase(sqlDb: AppDb): Promise<void> {
  const loaded = await persistence.load(sqlDb);
  const summary = Object.entries(loaded).map(([name, count]) => `${name}=${count}`).join(', ');
  console.log(`⚡ entity_store carregado: ${summary || 'vazio'}`);

  const imported = await importLegacyRecords(sqlDb);
  if (imported.length > 0) {
    console.log(`📥 Registros legados importados para o entity_store: ${imported.join(', ')}`);
  }

  await persistence.attach(sqlDb);

  if (config.demoMode) {
    await seedDemoTherapistProfile(sqlDb);
  }
}

async function importLegacyRecords(sqlDb: AppDb): Promise<string[]> {
  const imported: string[] = [];

  if (!persistence.hasPersisted('users')) {
    const rows = await (sqlDb as any).select().from(schema.users);
    for (const u of rows) {
      const user: User = {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        crp: u.crp || undefined,
        crpRegion: u.crpRegion || undefined,
        therapistId: u.therapistId || undefined,
        passwordHash: u.passwordHash,
        twoFactorEnabled: u.twoFactorEnabled,
        twoFactorSecret: u.twoFactorSecret || undefined,
        twoFactorBackupCodes: u.twoFactorBackupCodes || undefined,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt || undefined
      };
      db.users.set(user.id, user);
    }
    if (rows.length > 0) imported.push(`users=${rows.length}`);
  }

  if (!persistence.hasPersisted('patients')) {
    const rows = await (sqlDb as any).select().from(schema.patients);
    for (const p of rows) {
      const patient: StoredPatient = {
        id: p.id,
        therapistId: p.therapistId,
        emailBindex: p.emailBindex,
        cpfBindex: p.cpfBindex || undefined,
        consentTranscriptionSigned: p.consentTranscriptionSigned,
        consentSignedAt: p.consentSignedAt,
        consentRevokedAt: p.consentRevokedAt || undefined,
        consentRevokeReason: p.consentRevokeReason || undefined,
        createdAt: p.createdAt,
        encryptedName: p.encryptedName,
        encryptedEmail: p.encryptedEmail,
        encryptedPhone: p.encryptedPhone,
        encryptedCpf: p.encryptedCpf || undefined
      };
      db.patients.set(patient.id, patient);
    }
    if (rows.length > 0) imported.push(`patients=${rows.length}`);
  }

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
        googleEventId: a.googleEventId || undefined,
        encryptedMeetUrl: a.encryptedMeetUrl,
        meetAccessCode: a.meetAccessCode || undefined,
        createdAt: a.createdAt
      };
      db.appointments.set(appointment.id, appointment);
    }
    if (rows.length > 0) imported.push(`appointments=${rows.length}`);
  }

  return imported;
}
