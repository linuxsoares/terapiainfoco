import { describe, it, expect, beforeEach, beforeAll } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { AuditService } from '../src/services/auditService';
import {
  IcpCertificateType,
  IcpSignatureStandard,
  BatchClosingStatus,
  AuditAction
} from '@terapiainfoco/shared';
import { encryptField } from '../src/services/cryptoContext';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { resetDb } from './helpers/db';

describe('Módulo de Assinatura Avançada ICP-Brasil em Lote & Fechamento de Ciclos (RFC-001 §3.4, §3.5)', () => {
  let token: string;
  const therapistId = 'therapist-001';
  const patientId = '00000000-0000-0000-0000-000000000001';

  beforeAll(async () => {

    // Rate limit de login (5/min por IP) é compartilhado entre arquivos de teste

    await globalRateLimitStore.reset();
    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'psicologo@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const loginData = await loginRes.json() as any;
    token = loginData.accessToken;
  });

  beforeEach(async () => {
    await resetDb();

    // Cria duas evoluções de prontuário pendentes para teste
    const recordId1 = '00000000-0000-0000-0000-000000000091';
    db.clinicalRecords.set(recordId1, {
      id: recordId1,
      patientId,
      therapistId,
      appointmentId: '00000000-0000-0000-0000-000000000010',
      sessionNumber: 1,
      encryptedSoapSubjective: encryptField('Paciente relata ansiedade moderada.'),
      encryptedSoapObjective: encryptField('Contato visual preservado.'),
      encryptedSoapAssessment: encryptField('Quadro adaptativo favorável.'),
      encryptedSoapPlan: encryptField('Treino de respiração.'),
      isSigned: false,
      createdAt: new Date(),
      signedAt: new Date()
    });

    const recordId2 = '00000000-0000-0000-0000-000000000092';
    db.clinicalRecords.set(recordId2, {
      id: recordId2,
      patientId,
      therapistId,
      appointmentId: '00000000-0000-0000-0000-000000000010',
      sessionNumber: 2,
      encryptedSoapSubjective: encryptField('Paciente relata melhora no sono.'),
      encryptedSoapObjective: encryptField('Afeto estável.'),
      encryptedSoapAssessment: encryptField('Progresso terapêutico evidente.'),
      encryptedSoapPlan: encryptField('Manutenção das estratégias.'),
      isSigned: false,
      createdAt: new Date(),
      signedAt: new Date()
    });
  });

  it('deve listar itens clínicos pendentes de assinatura do terapeuta via GET /api/icp-batch/pending-items', async () => {
    const res = await app.request('/api/icp-batch/pending-items', {
      headers: { Authorization: `Bearer ${token}` }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.items.length).toBeGreaterThanOrEqual(2);
    expect(body.items[0].type).toBe('SOAP_RECORD');
    expect(body.items[0].patientNameMasked).toBeDefined();
    expect(body.items[0].itemCanonicalSha256).toBeDefined();
  });

  it('deve preparar manifesto preliminar e calcular Merkle Root determinística via POST /api/icp-batch/prepare', async () => {
    const res = await app.request('/api/icp-batch/prepare', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        recordIds: ['00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000092']
      })
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    const manifest = body.manifest;
    expect(manifest.status).toBe(BatchClosingStatus.DRAFT_MANIFEST);
    expect(manifest.merkleRootHash).toBeDefined();
    expect(manifest.merkleRootHash.length).toBe(64);
    expect(manifest.items.length).toBe(2);
  });

  it('deve rejeitar assinatura se a senha/PIN do certificado for inválida ou omitida', async () => {
    const res = await app.request('/api/icp-batch/sign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        recordIds: ['00000000-0000-0000-0000-000000000091'],
        certificateType: IcpCertificateType.A1_FILE,
        certificatePinOrSecret: '12' // muito curto
      })
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain('senha/PIN');
  });

  it('deve assinar lote com Certificado A1/A3 emitindo assinatura PAdES e carimbo do tempo TSA ICP-Brasil', async () => {
    const res = await app.request('/api/icp-batch/sign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        recordIds: ['00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000092'],
        certificateType: IcpCertificateType.A1_FILE,
        certificatePinOrSecret: 'Senha@Cert123'
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.sealedRecordsCount).toBe(2);

    const manifest = body.manifest;
    expect(manifest.status).toBe(BatchClosingStatus.SIGNED_SEALED);
    expect(manifest.padesSignatureBase64).toBeDefined();
    expect(manifest.tsaTimestampToken).toBeDefined();
    expect(manifest.publicValidationToken).toContain('icp_batch_v1_');
    expect(manifest.certificateIssuer).toContain('ICP-Brasil');

    // Valida trava de imutabilidade nos registros do prontuário
    const rec1 = db.clinicalRecords.get('00000000-0000-0000-0000-000000000091') as any;
    expect(rec1.batchClosingManifestId).toBe(manifest.id);
    expect(rec1.lockedByBatchSignature).toBe(true);
  });

  it('deve permitir validação notarial pública por token atestando fé pública da Merkle Root', async () => {
    // 1. Assina o lote
    const signRes = await app.request('/api/icp-batch/sign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        recordIds: ['00000000-0000-0000-0000-000000000091'],
        certificateType: IcpCertificateType.A1_FILE,
        certificatePinOrSecret: 'CertPin@456'
      })
    });
    const signBody = await signRes.json();
    const publicToken = signBody.manifest.publicValidationToken;

    // 2. Validação pública (sem autenticação)
    const verifyRes = await app.request('/api/icp-batch/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicValidationToken: publicToken
      })
    });

    expect(verifyRes.status).toBe(200);
    const verifyBody = await verifyRes.json();
    expect(verifyBody.success).toBe(true);
    expect(verifyBody.valid).toBe(true);
    expect(verifyBody.manifest.merkleRootHash).toBe(signBody.manifest.merkleRootHash);
    expect(verifyBody.details).toContain('ICP-Brasil');
  });

  it('deve rejeitar validação de token malformado ou inexistente', async () => {
    const res = await app.request('/api/icp-batch/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicValidationToken: 'icp_batch_v1_token_falso_ou_inexistente'
      })
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.valid).toBe(false);
  });

  it('deve listar manifestos assinados via GET /api/icp-batch/manifests', async () => {
    // Assina um lote
    await app.request('/api/icp-batch/sign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        recordIds: ['00000000-0000-0000-0000-000000000091'],
        certificateType: IcpCertificateType.A3_HARDWARE_TOKEN,
        certificatePinOrSecret: 'PinA3@123'
      })
    });

    const res = await app.request('/api/icp-batch/manifests', {
      headers: { Authorization: `Bearer ${token}` }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.manifests.length).toBeGreaterThan(0);
    expect(body.manifests[0].signatureStandard).toBe(IcpSignatureStandard.PADES_T);
  });

  it('deve registrar eventos na trilha de auditoria WORM imutável', async () => {
    await app.request('/api/icp-batch/sign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        recordIds: ['00000000-0000-0000-0000-000000000091'],
        certificateType: IcpCertificateType.A1_FILE,
        certificatePinOrSecret: 'AuditPin@999'
      })
    });

    const auditLogs = db.auditLogs.filter(
      l => l.action === AuditAction.ICP_BATCH_SIGNED
    );
    expect(auditLogs.length).toBeGreaterThan(0);
    expect(JSON.stringify(auditLogs[0].details)).toContain('2.16.76.1.4.1');
    // O registro entra na hash-chain: a trilha continua íntegra
    expect(AuditService.verifyChainIntegrity().isValid).toBe(true);
  });
});
