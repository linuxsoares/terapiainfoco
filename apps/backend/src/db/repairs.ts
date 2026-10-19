import { db } from './memoryDb';

/**
 * Corrige prontuários e rascunhos gravados pelo SOAP por IA antes do PR #131: campos cifrados
 * com nomes errados, sem marca de assinatura e com o id do usuário no lugar do consultório.
 * Idempotente; devolve quantos registros foram ajustados.
 */
export function repairLegacyAiSoapRecords(): number {
  // Um id só é trocado se for de usuário e não for, ele próprio, o consultório de alguém
  const practiceIds = new Set(Array.from(db.users.values()).map((u) => u.therapistId).filter(Boolean));
  const practiceOf = (id: string) => (practiceIds.has(id) ? id : db.users.get(id)?.therapistId ?? id);
  let repaired = 0;

  for (const [id, record] of db.clinicalRecords.entries()) {
    const legacy = record as any;
    if (!legacy.encryptedSubjective && practiceOf(record.therapistId) === record.therapistId) continue;
    const fixed = { ...legacy };
    if (legacy.encryptedSubjective && !legacy.encryptedSoapSubjective) {
      fixed.encryptedSoapSubjective = legacy.encryptedSubjective;
      fixed.encryptedSoapObjective = legacy.encryptedObjective;
      fixed.encryptedSoapAssessment = legacy.encryptedAssessment;
      fixed.encryptedSoapPlan = legacy.encryptedPlan;
      fixed.isSigned = true;
      fixed.signatureHash = legacy.signedHash ?? null;
      for (const key of ['encryptedSubjective', 'encryptedObjective', 'encryptedAssessment', 'encryptedPlan', 'signedHash', 'sessionDate', 'cid11Code']) {
        delete fixed[key];
      }
    }
    fixed.therapistId = practiceOf(record.therapistId);
    db.clinicalRecords.set(id, fixed);
    repaired++;
  }

  for (const [id, draft] of db.aiSoapDrafts.entries()) {
    const practice = practiceOf(draft.therapistId);
    if (practice === draft.therapistId) continue;
    db.aiSoapDrafts.set(id, { ...draft, therapistId: practice });
    repaired++;
  }
  for (const [id, session] of db.transcriptionSessions.entries()) {
    const practice = practiceOf(session.therapistId);
    if (practice === session.therapistId) continue;
    db.transcriptionSessions.set(id, { ...session, therapistId: practice });
    repaired++;
  }
  return repaired;
}
