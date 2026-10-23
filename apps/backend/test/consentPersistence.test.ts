import { describe, it, expect, beforeEach } from 'bun:test';
import { ConsentScope, ConsentStatus } from '@terapiainfoco/shared';
import { db } from '../src/db/memoryDb';
import { ConsentService } from '../src/services/consentService';
import { BACKUP_COLLECTIONS } from '../src/services/backupService';
import { resetDb, seedDemoSession } from './helpers/db';

const DEMO_PATIENT_ID = '00000000-0000-0000-0000-000000000002';

describe('Ledger de consentimento persistido', () => {
  beforeEach(async () => {
    await resetDb();
    await seedDemoSession();
  });

  it('decisões ficam na coleção persistida (entity_store) e entram no backup', async () => {
    expect(BACKUP_COLLECTIONS).toContain('consentLedgers');
    const consent = ConsentService.getInstance();
    await consent.grantGranularConsent(
      { patientId: DEMO_PATIENT_ID, scopes: [{ scope: ConsentScope.ANONYMIZED_RESEARCH, granted: false, revocationReason: 'Não quero participar' }] },
      { actorId: 'teste', ipAddress: '127.0.0.1' }
    );
    const stored = db.consentLedgers.get(DEMO_PATIENT_ID)!;
    expect(stored.preferences[ConsentScope.ANONYMIZED_RESEARCH].status).toBe(ConsentStatus.REVOKED);

    // O recibo emitido é verificável publicamente pelo token
    const receipt = stored.receiptsHistory[0];
    const verification = await consent.verifyReceiptByToken(receipt.verificationToken);
    expect(verification.valid).toBe(true);
  });

  it('paciente de demonstração nasce com todas as finalidades aceitas', async () => {
    const ledger = await ConsentService.getInstance().getPatientLedger(DEMO_PATIENT_ID);
    for (const scope of Object.values(ConsentScope)) {
      expect(ledger.preferences[scope].status).toBe(ConsentStatus.GRANTED);
    }
  });
});
