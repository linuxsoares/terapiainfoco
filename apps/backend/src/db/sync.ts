import type { AppDb } from './index';
import * as schema from './schema';
import { db } from './memoryDb';
import { encryptField, hashEmail, hashCpf } from '../services/cryptoContext';
import { UserRole } from '@terapiainfoco/shared';
import type { User, StoredPatient, StoredAppointment } from '@terapiainfoco/shared';
import { config } from '../config';

/**
 * Garante registros padrão no banco de dados e sincroniza registros existentes para a memória RAM
 */
export async function seedAndSyncDatabase(sqlDb: AppDb): Promise<void> {
  // 1. Garante Terapeuta padrão
  try {
    await (sqlDb as any)
      .insert(schema.therapists)
      .values({
        id: '00000000-0000-0000-0000-000000000001',
        crp: '06/142980',
        crpRegion: 'SP',
        status: 'ACTIVE',
        encryptedDek: 'mock-encrypted-dek-base64'
      })
      .onConflictDoNothing();
  } catch (err: any) {
    console.warn('⚠️ Nota ao inserir terapeuta padrão:', err?.message || err);
  }

  // 2. Garante Usuários padrão (Psicóloga e Admin)
  try {
    const defaultPasswordHash = Bun.password.hashSync('Senha@123456');
    await (sqlDb as any)
      .insert(schema.users)
      .values([
        {
          id: '00000000-0000-0000-0000-000000000001',
          email: 'psicologo@terapiainfoco.com.br',
          name: 'Dra. Beatriz Santos',
          role: UserRole.PSICOLOGO_TITULAR,
          crp: '06/142980',
          crpRegion: 'SP',
          therapistId: '00000000-0000-0000-0000-000000000001',
          passwordHash: defaultPasswordHash,
          twoFactorEnabled: false
        },
        {
          id: '00000000-0000-0000-0000-000000000004',
          email: 'admin@terapiainfoco.com.br',
          name: 'Administrador do Sistema',
          role: UserRole.ADMIN,
          passwordHash: defaultPasswordHash,
          twoFactorEnabled: false
        }
      ])
      .onConflictDoNothing();
  } catch (err: any) {
    console.warn('⚠️ Nota ao inserir usuários padrão:', err?.message || err);
  }

  // 3. Garante Paciente demo (Mariana Silva)
  try {
    const demoPatientId = '00000000-0000-0000-0000-000000000002';
    await (sqlDb as any)
      .insert(schema.patients)
      .values({
        id: demoPatientId,
        therapistId: '00000000-0000-0000-0000-000000000001',
        encryptedName: encryptField('Mariana Silva de Oliveira'),
        encryptedEmail: encryptField('mariana.silva@email.com'),
        encryptedPhone: encryptField('(11) 98765-4321'),
        encryptedCpf: encryptField('123.456.789-00'),
        emailBindex: hashEmail('mariana.silva@email.com'),
        cpfBindex: hashCpf('123.456.789-00'),
        consentTranscriptionSigned: true,
        consentSignedAt: new Date()
      })
      .onConflictDoNothing();
  } catch (err: any) {
    console.warn('⚠️ Nota ao inserir paciente demo:', err?.message || err);
  }

  // 4. Carrega registros do SQL para o cache em memória
  try {
    const userRows = await (sqlDb as any).select().from(schema.users);
    for (const u of userRows) {
      db.users.set(u.id, {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role as any,
        crp: u.crp || undefined,
        crpRegion: u.crpRegion || undefined,
        therapistId: u.therapistId || undefined,
        passwordHash: u.passwordHash,
        twoFactorEnabled: u.twoFactorEnabled,
        twoFactorSecret: u.twoFactorSecret || undefined,
        twoFactorBackupCodes: u.twoFactorBackupCodes || undefined,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt || undefined
      });
    }

    const patientRows = await (sqlDb as any).select().from(schema.patients);
    for (const p of patientRows) {
      db.patients.set(p.id, {
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
      });
    }

    console.log(`⚡ Supabase/PostgreSQL sincronizado com memória: ${userRows.length} usuários e ${patientRows.length} pacientes carregados.`);
  } catch (err: any) {
    console.warn('⚠️ Nota ao sincronizar registros do banco para a memória:', err?.message || err);
  }
}

/**
 * Persiste um paciente no PostgreSQL / Supabase
 */
export async function persistPatientToDb(sqlDb: AppDb, patient: StoredPatient): Promise<void> {
  const validTherapistId = (patient.therapistId && !patient.therapistId.startsWith('therapist-'))
    ? patient.therapistId
    : '00000000-0000-0000-0000-000000000001';

  await (sqlDb as any)
    .insert(schema.patients)
    .values({
      id: patient.id,
      therapistId: validTherapistId,
      encryptedName: patient.encryptedName,
      encryptedEmail: patient.encryptedEmail,
      encryptedPhone: patient.encryptedPhone,
      encryptedCpf: patient.encryptedCpf,
      emailBindex: patient.emailBindex,
      cpfBindex: patient.cpfBindex,
      consentTranscriptionSigned: patient.consentTranscriptionSigned,
      consentSignedAt: patient.consentSignedAt,
      consentRevokedAt: patient.consentRevokedAt,
      consentRevokeReason: patient.consentRevokeReason,
      createdAt: patient.createdAt
    })
    .onConflictDoNothing();
}

/**
 * Persiste um usuário no PostgreSQL / Supabase e opcionalmente no Supabase Auth
 */
export async function persistUserToDb(sqlDb: AppDb, user: User, rawPassword?: string): Promise<void> {
  let therapistUuid = user.therapistId;
  if (therapistUuid && therapistUuid.startsWith('therapist-')) {
    therapistUuid = '00000000-0000-0000-0000-000000000001';
  }

  if (user.role === UserRole.PSICOLOGO_TITULAR && user.crp) {
    const tId = therapistUuid || crypto.randomUUID();
    therapistUuid = tId;
    await (sqlDb as any)
      .insert(schema.therapists)
      .values({
        id: tId,
        crp: user.crp,
        crpRegion: user.crpRegion || 'SP',
        status: 'ACTIVE',
        encryptedDek: 'mock-encrypted-dek-base64'
      })
      .onConflictDoNothing();
  }

  await (sqlDb as any)
    .insert(schema.users)
    .values({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      crp: user.crp,
      crpRegion: user.crpRegion,
      therapistId: therapistUuid,
      passwordHash: user.passwordHash,
      twoFactorEnabled: user.twoFactorEnabled,
      twoFactorSecret: user.twoFactorSecret,
      twoFactorBackupCodes: user.twoFactorBackupCodes,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt
    })
    .onConflictDoNothing();

  // Sincronização opcional com Supabase Auth Admin (/auth/v1/admin/users)
  if (config.supabase.url && config.supabase.secretKey && rawPassword) {
    try {
      const res = await fetch(`${config.supabase.url.replace(/\/+$/, '')}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': config.supabase.secretKey,
          'Authorization': `Bearer ${config.supabase.secretKey}`
        },
        body: JSON.stringify({
          id: user.id,
          email: user.email,
          password: rawPassword,
          email_confirm: true,
          user_metadata: {
            name: user.name,
            role: user.role,
            crp: user.crp,
            crpRegion: user.crpRegion
          }
        })
      });
      if (res.ok) {
        console.log(`✅ Usuário ${user.email} sincronizado no Supabase Auth.`);
      } else {
        const txt = await res.text();
        console.warn(`⚠️ Supabase Auth Admin API (${res.status}):`, txt);
      }
    } catch (err: any) {
      console.warn('⚠️ Falha ao criar usuário no Supabase Auth Admin:', err?.message || err);
    }
  }
}

/**
 * Persiste um agendamento no PostgreSQL / Supabase
 */
export async function persistAppointmentToDb(sqlDb: AppDb, appt: StoredAppointment): Promise<void> {
  const validTherapistId = (appt.therapistId && !appt.therapistId.startsWith('therapist-'))
    ? appt.therapistId
    : '00000000-0000-0000-0000-000000000001';

  await (sqlDb as any)
    .insert(schema.appointments)
    .values({
      id: appt.id,
      therapistId: validTherapistId,
      patientId: appt.patientId,
      scheduledStart: appt.scheduledStart,
      scheduledEnd: appt.scheduledEnd,
      status: appt.status,
      googleEventId: appt.googleEventId,
      encryptedMeetUrl: appt.encryptedMeetUrl,
      meetAccessCode: appt.meetAccessCode,
      createdAt: appt.createdAt
    })
    .onConflictDoNothing();
}
