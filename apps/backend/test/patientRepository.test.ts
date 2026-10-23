import { describe, it, expect, beforeEach } from 'bun:test';
import { sql } from 'drizzle-orm';
import { ConsentScope, ConsentStatus, type StoredPatient } from '@terapiainfoco/shared';
import { getDb } from '../src/db';
import { encode } from '../src/db/persistence';
import { moveOutOfEntityStore } from '../src/db/sync';
import { PatientRepository } from '../src/repositories/patientRepository';
import { PatientService } from '../src/services/patientService';
import { ConsentService } from '../src/services/consentService';
import { decryptField, encryptField, hashCpf } from '../src/services/cryptoContext';
import { resetDb } from './helpers/db';

const context = { actorId: 'therapist-001', ipAddress: '127.0.0.1' };

function patient(overrides: Partial<StoredPatient>): StoredPatient {
  return {
    id: crypto.randomUUID(),
    therapistId: 'therapist-001',
    emailBindex: `bindex-${crypto.randomUUID().slice(0, 8)}`,
    consentTranscriptionSigned: false,
    createdAt: new Date(),
    encryptedName: encryptField('Paciente de Teste'),
    encryptedEmail: encryptField('paciente.teste@email.com'),
    encryptedPhone: encryptField('11900000000'),
    ...overrides
  };
}

describe('PatientRepository (ADR-004 fase 2)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('save grava as alterações e preserva os campos cifrados e opcionais', async () => {
    const created = await PatientRepository.create(patient({ cpfBindex: 'cpf-x', encryptedCpf: encryptField('123.456.789-00') }));
    created.linkedUserId = 'conta-paciente-1';
    created.consentRevokedAt = new Date('2026-10-21T12:00:00Z');
    created.encryptedCpf = undefined;
    created.cpfBindex = undefined;
    await PatientRepository.save(created);

    const reloaded = (await PatientRepository.findById(created.id))!;
    expect(reloaded.linkedUserId).toBe('conta-paciente-1');
    expect(new Date(reloaded.consentRevokedAt!).toISOString()).toBe('2026-10-21T12:00:00.000Z');
    expect(reloaded.encryptedCpf).toBeUndefined();
    expect(reloaded.cpfBindex).toBeUndefined();
    expect(decryptField(reloaded.encryptedName)).toBe('Paciente de Teste');
  });

  it('busca por CPF fica restrita ao consultório quando informado', async () => {
    const cpfBindex = hashCpf('987.654.321-00');
    await PatientRepository.create(patient({ therapistId: 'consultorio-a', cpfBindex }));
    const own = await PatientRepository.create(patient({ therapistId: 'consultorio-b', cpfBindex }));

    expect((await PatientRepository.findByCpfBindex(cpfBindex, 'consultorio-b'))?.id).toBe(own.id);
    expect(await PatientRepository.findByCpfBindex(cpfBindex, 'consultorio-c')).toBeNull();
    expect((await PatientService.findByCpf('987.654.321-00', context, 'consultorio-b'))?.id).toBe(own.id);
  });

  it('registros da conta de paciente: o principal e os vinculados ao agendar pelo portal', async () => {
    const main = await PatientRepository.create(patient({ therapistId: 'consultorio-a' }));
    const linked = await PatientRepository.create(patient({ therapistId: 'consultorio-b', linkedUserId: 'conta-1' }));
    await PatientRepository.create(patient({ therapistId: 'consultorio-c', linkedUserId: 'outra-conta' }));

    const records = await PatientRepository.listForPatientAccount('conta-1', main.id);
    expect(records.map((r) => r.id).sort()).toEqual([main.id, linked.id].sort());
  });

  it('quarentena LGPD persiste a pseudonimização no banco', async () => {
    const created = await PatientRepository.create(patient({ cpfBindex: 'cpf-y', encryptedCpf: encryptField('111.222.333-44') }));
    expect(await PatientService.quarantinePatient(created.id, context)).toBe(true);

    const reloaded = (await PatientRepository.findById(created.id))!;
    expect(decryptField(reloaded.encryptedName)).toBe('[PACIENTE EM QUARENTENA LGPD]');
    expect(reloaded.cpfBindex).toBeUndefined();
  });

  it('ledger: TCLE do cadastro vale só para a transcrição; cada finalidade exige aceite próprio', async () => {
    const refused = await PatientRepository.create(patient({ consentTranscriptionSigned: false }));
    const signed = await PatientRepository.create(patient({ consentTranscriptionSigned: true, consentSignedAt: new Date() }));
    const consent = ConsentService.getInstance();

    const refusedLedger = await consent.getPatientLedger(refused.id);
    expect(refusedLedger.preferences[ConsentScope.AI_CLINICAL_SYNTHESIS].status).toBe(ConsentStatus.REFUSED);
    expect((await consent.enforceScope(refused.id, ConsentScope.AI_CLINICAL_SYNTHESIS)).permitted).toBe(false);
    // O TCLE do cadastro vale só para a transcrição; as demais finalidades exigem aceite próprio
    const signedLedger = await consent.getPatientLedger(signed.id);
    expect(signedLedger.preferences[ConsentScope.TELECONSULTATION_AUDIO_RECORDING].status).toBe(ConsentStatus.GRANTED);
    for (const scope of [ConsentScope.AI_CLINICAL_SYNTHESIS, ConsentScope.ANONYMIZED_RESEARCH, ConsentScope.INTERPROFESSIONAL_SHARING, ConsentScope.COMMUNICATION_REMINDERS]) {
      expect(signedLedger.preferences[scope].status).toBe(ConsentStatus.REFUSED);
    }
    expect(signedLedger.receiptsHistory).toHaveLength(1);
    // Paciente inexistente não tem consentimento algum
    expect((await consent.enforceScope('paciente-inexistente', ConsentScope.ANONYMIZED_RESEARCH)).permitted).toBe(false);
  });

  it('pacientes antigos do entity_store vão para a tabela e substituem a linha legada de mesmo id', async () => {
    const db: any = await getDb();
    const legacy = await PatientRepository.create(patient({ therapistId: 'consultorio-legado' }));
    const current = patient({ id: legacy.id, therapistId: 'therapist-001', linkedUserId: 'conta-atual' });
    await db.execute(sql`INSERT INTO entity_store (collection, id, data) VALUES ('patients', ${current.id}, ${encode(current)}::jsonb)`);

    expect(await moveOutOfEntityStore(db, 'patients')).toBe(1);
    const moved = (await PatientRepository.findById(legacy.id))!;
    expect(moved.therapistId).toBe('therapist-001');
    expect(moved.linkedUserId).toBe('conta-atual');
    expect(decryptField(moved.encryptedPhone)).toBe('11900000000');
    const left = await db.execute(sql`SELECT count(*)::int AS n FROM entity_store WHERE collection = 'patients'`);
    expect((left.rows ?? left)[0].n).toBe(0);
  });
});
