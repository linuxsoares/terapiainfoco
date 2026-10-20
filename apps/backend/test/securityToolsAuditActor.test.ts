import { describe, it, expect } from 'bun:test';
import { AuditService } from '../src/services/auditService';
import { AuditAction, VerifiableCredentialType } from '@terapiainfoco/shared';
import { adminRequest, SEED_ADMIN_ID } from './helpers/adminRequest';

async function postAsAdmin(path: string, body: unknown) {
  return adminRequest(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function lastActorOf(action: AuditAction): string | undefined {
  return AuditService.getAllLogs().filter((log) => log.action === action).at(-1)?.actorId;
}

describe('Auditoria das ferramentas de segurança grava o usuário real', () => {
  it('tokens efêmeros: emissão e revogação em nome do Admin', async () => {
    const issued = await postAsAdmin('/api/ephemeral-tokens/issue', {
      patientId: 'paciente_ator_real',
      therapistCrp: 'CRP-06/112233',
      roomId: 'room_ator_real'
    });
    expect(issued.status).toBe(200);
    expect(lastActorOf(AuditAction.EPHEMERAL_TOKEN_ISSUED)).toBe(SEED_ADMIN_ID);

    const { token } = await issued.json() as any;
    await postAsAdmin('/api/ephemeral-tokens/revoke', { tokenId: token.tokenId });
    expect(lastActorOf(AuditAction.EPHEMERAL_TOKEN_REVOKED)).toBe(SEED_ADMIN_ID);
  });

  it('GraphQL Guard: atualização de política em nome do Admin', async () => {
    const res = await postAsAdmin('/api/graphql-guard/policy', { policy: { maxAllowedDepth: 8 } });
    expect(res.status).toBe(200);
    expect(lastActorOf(AuditAction.GRAPHQL_GUARD_POLICY_UPDATED)).toBe(SEED_ADMIN_ID);
  });

  it('DID: emissão de credencial em nome de quem chamou, não do therapistId informado', async () => {
    const res = await postAsAdmin('/api/did/credentials/issue', {
      credentialType: VerifiableCredentialType.CLINICAL_REFERRAL_CREDENTIAL,
      patientId: 'patient-ator-real',
      therapistId: 'therapist-informado-no-corpo',
      therapistCrp: '06/551177', // CRP inédito: força a resolução (e auditoria) do DID
      therapistName: 'Dra. Gabriela Nunes',
      clinicalSpecialty: 'Neuropsicologia',
      referralReason: 'Encaminhamento',
      targetSpecialistType: 'NEUROLOGISTA',
      expirationMonths: 12
    });
    expect(res.status).toBe(201);
    expect(lastActorOf(AuditAction.VERIFIABLE_CREDENTIAL_ISSUED)).toBe(SEED_ADMIN_ID);
    expect(lastActorOf(AuditAction.DID_DOCUMENT_RESOLVED)).toBe(SEED_ADMIN_ID);
  });
});
