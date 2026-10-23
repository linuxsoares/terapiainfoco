import { describe, it, expect, beforeEach } from 'bun:test';
import { sql } from 'drizzle-orm';
import type { StoredClinicalRecord } from '@terapiainfoco/shared';
import { getDb } from '../src/db';
import { encode } from '../src/db/persistence';
import { moveOutOfEntityStore } from '../src/db/sync';
import { ClinicalRecordRepository } from '../src/repositories/clinicalRecordRepository';
import { ClinicalRecordService } from '../src/services/clinicalRecordService';
import { decryptField, encryptField } from '../src/services/cryptoContext';
import { resetDb } from './helpers/db';

const context = { actorId: 'therapist-001', ipAddress: '127.0.0.1' };
const soap = { subjective: 'Relata insônia.', objective: 'Afeto ansioso.', assessment: 'Ansiedade situacional.', plan: 'Higiene do sono.' };

describe('ClinicalRecordRepository (ADR-004 fase 2)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('rascunho e assinatura gravam no banco com o SOAP cifrado', async () => {
    const draft = await ClinicalRecordService.saveDraft({
      appointmentId: 'consulta-1', patientId: 'paciente-1', therapistId: 'consultorio-a',
      soap, privateNotes: 'Nota privada', context
    });
    const stored = (await ClinicalRecordRepository.findById(draft.id))!;
    expect(stored.isSigned).toBe(false);
    expect(decryptField(stored.encryptedSoapSubjective!)).toBe('Relata insônia.');
    expect(decryptField(stored.encryptedPrivateNotes!)).toBe('Nota privada');

    const signed = await ClinicalRecordService.signRecord({ recordId: draft.id, confirmedHumanReview: true, context });
    const reloaded = (await ClinicalRecordRepository.findById(draft.id))!;
    expect(reloaded.isSigned).toBe(true);
    expect(reloaded.signatureHash).toBe(signed.signatureHash);
    expect(reloaded.signedAt).toBeTruthy();
  });

  it('consulta com prontuário assinado não aceita novo rascunho (CFP nº 001/2009)', async () => {
    const draft = await ClinicalRecordService.saveDraft({
      appointmentId: 'consulta-2', patientId: 'paciente-1', therapistId: 'consultorio-a', soap, context
    });
    await ClinicalRecordService.signRecord({ recordId: draft.id, confirmedHumanReview: true, context });
    await expect(ClinicalRecordService.saveDraft({
      appointmentId: 'consulta-2', patientId: 'paciente-1', therapistId: 'consultorio-a', soap, context
    })).rejects.toThrow('já assinado e imutável');
    expect(await ClinicalRecordRepository.count({ appointmentId: 'consulta-2' })).toBe(1);
  });

  it('prontuários antigos do entity_store vão para a tabela e substituem a linha legada de mesmo id', async () => {
    const db: any = await getDb();
    const base: StoredClinicalRecord = {
      id: crypto.randomUUID(), appointmentId: 'consulta-3', patientId: 'paciente-1', therapistId: 'consultorio-a',
      sessionNumber: 1, isSigned: false, createdAt: new Date(), encryptedSoapPlan: encryptField('plano legado')
    };
    await ClinicalRecordRepository.create(base);
    const current = { ...base, isSigned: true, signatureHash: 'hash-atual', encryptedSoapPlan: encryptField('plano atual') };
    await db.execute(sql`INSERT INTO entity_store (collection, id, data) VALUES ('clinicalRecords', ${current.id}, ${encode(current)}::jsonb)`);

    expect(await moveOutOfEntityStore(db, 'clinicalRecords')).toBe(1);
    const moved = (await ClinicalRecordRepository.findById(base.id))!;
    expect(moved.isSigned).toBe(true);
    expect(moved.signatureHash).toBe('hash-atual');
    expect(decryptField(moved.encryptedSoapPlan!)).toBe('plano atual');
  });
});
