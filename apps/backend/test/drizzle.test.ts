import { describe, expect, it } from 'bun:test';
import { getDb, schema } from '../src/db';
import { eq } from 'drizzle-orm';
import { computeBlindIndex, encryptAesGcm, generateRandomKey } from '@terapiainfoco/crypto';

describe('PostgreSQL Drizzle ORM Schema (RFC-001 §5.2)', () => {
  it('deve inserir e consultar terapeuta com DEK encriptada', async () => {
    const db = await getDb();
    const [therapist] = await (db as any)
      .insert(schema.therapists)
      .values({
        crp: '06/999888',
        crpRegion: 'SP',
        status: 'ACTIVE',
        encryptedDek: 'mock-dek-kms-kek-encrypted'
      })
      .returning();

    expect(therapist.id).toBeDefined();
    expect(therapist.crp).toBe('06/999888');

    const [found] = await (db as any)
      .select()
      .from(schema.therapists)
      .where(eq(schema.therapists.id, therapist.id));

    expect(found.crp).toBe('06/999888');
  });

  it('deve inserir paciente com FLE e consultar por Blind Index (HMAC-SHA256)', async () => {
    const db = await getDb();
    const key = generateRandomKey(32);
    const secretSalt = 'clinica-salt-teste';

    // Cria terapeuta pai
    const [therapist] = await (db as any)
      .insert(schema.therapists)
      .values({
        crp: `06/${Math.floor(Math.random() * 900000 + 100000)}`,
        crpRegion: 'SP',
        encryptedDek: 'mock-dek'
      })
      .returning();

    const rawCpf = '12345678900';
    const cpfBindex = computeBlindIndex(rawCpf, secretSalt);
    const emailBindex = computeBlindIndex('paciente@teste.com', secretSalt);

    const [patient] = await (db as any)
      .insert(schema.patients)
      .values({
        therapistId: therapist.id,
        encryptedName: encryptAesGcm('Paciente Silva', key),
        encryptedEmail: encryptAesGcm('paciente@teste.com', key),
        encryptedPhone: encryptAesGcm('11988887777', key),
        encryptedCpf: encryptAesGcm(rawCpf, key),
        emailBindex,
        cpfBindex,
        consentTranscriptionSigned: true
      })
      .returning();

    expect(patient.id).toBeDefined();

    // Busca exata pelo Blind Index do CPF sem expor o CPF em texto claro
    const [queryResult] = await (db as any)
      .select()
      .from(schema.patients)
      .where(eq(schema.patients.cpfBindex, cpfBindex));

    expect(queryResult).toBeDefined();
    expect(queryResult.id).toBe(patient.id);
    expect(queryResult.encryptedName.ciphertext).toBeDefined();
  });

  it('deve gravar trilha de auditoria WORM imutável', async () => {
    const db = await getDb();
    const [audit] = await (db as any)
      .insert(schema.auditLogs)
      .values({
        actorId: '00000000-0000-0000-0000-000000000001',
        resourceType: 'PATIENT',
        resourceId: '00000000-0000-0000-0000-000000000002',
        action: 'DECRYPT_READ',
        ipAddress: '192.168.1.100',
        userAgent: 'Antigravity/2.0'
      })
      .returning();

    expect(audit.id).toBeDefined();
    expect(audit.action).toBe('DECRYPT_READ');
  });
});
