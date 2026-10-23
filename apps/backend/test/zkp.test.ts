import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { ZkpService } from '../src/services/zkpService';
import {
  AuditAction,
  AuditResourceType,
  ZkpProofType,
  ZkpVerificationStatus
} from '@terapiainfoco/shared';
import { resetDb } from './helpers/db';

describe('Zero-Knowledge Proofs for Digital Signatures & Clinical Documents (RFC-001 §3.4, §3.5 & CFP 006/2019)', () => {
  let therapistToken: string;
  let adminToken: string;
  let secretaryToken: string;

  beforeEach(async () => {
    await resetDb();
    await globalRateLimitStore.reset();
    ZkpService.getInstance().clearForTesting();

    const loginTherapist = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'psicologo@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const therapistData = await loginTherapist.json();
    therapistToken = therapistData.accessToken;

    const loginAdmin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const adminData = await loginAdmin.json();
    adminToken = adminData.accessToken;

    const loginSecretary = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'recepcao@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const secretaryData = await loginSecretary.json();
    secretaryToken = secretaryData.accessToken;
  });

  it('deve rejeitar geração de ZKP sem autenticação (401) ou com perfil RECEPÇÃO (403)', async () => {
    const resNoAuth = await app.request('/api/security/zkp/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: 'doc-1', documentTypeClaim: 'Laudo' })
    });
    expect(resNoAuth.status).toBe(401);

    const resForbidden = await app.request('/api/security/zkp/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secretaryToken}`
      },
      body: JSON.stringify({ documentId: 'doc-1', documentTypeClaim: 'Laudo' })
    });
    expect(resForbidden.status).toBe(403);
  });

  it('deve gerar prova ZKP para documento CFP com sucesso e selar no ledger WORM', async () => {
    const res = await app.request('/api/security/zkp/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        documentId: 'doc-laudo-forense-001',
        documentTypeClaim: 'Laudo Psicológico Pericial',
        proofType: ZkpProofType.FULL_FORENSIC_ZKP
      })
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.proof.proofId).toBeDefined();
    expect(data.proof.publicVerificationToken.startsWith('zkp_v1_')).toBe(true);
    expect(data.proof.schnorrProof.commitHex).toBeDefined();
    expect(data.proof.therapistCrpCommitment).toHaveLength(64);
    expect(data.proof.probatoryWormDigest).toHaveLength(64);

    // Auditoria WORM gravada
    const audits = db.auditLogs.filter(a => a.action === AuditAction.ZKP_PROOF_GENERATED);
    expect(audits.length).toBeGreaterThan(0);
    expect(audits[0].resourceId).toBe(data.proof.proofId);
  });

  it('deve validar publicamente a prova ZKP de forma anônima com 100% de integridade', async () => {
    // 1. Gera a prova
    const genRes = await app.request('/api/security/zkp/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        documentId: 'doc-atestado-002',
        documentTypeClaim: 'Atestado Psicológico CFP 006/2019'
      })
    });
    const genData = await genRes.json();
    const token = genData.proof.publicVerificationToken;

    // 2. Valida no endpoint público (sem header de autorização)
    const verifyRes = await app.request('/api/security/zkp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicVerificationToken: token })
    });

    expect(verifyRes.status).toBe(200);
    const verifyData = await verifyRes.json();
    expect(verifyData.success).toBe(true);
    expect(verifyData.result.valid).toBe(true);
    expect(verifyData.result.status).toBe(ZkpVerificationStatus.VERIFIED_VALID);
    expect(verifyData.result.documentTypeClaim).toBe('Atestado Psicológico CFP 006/2019');
    expect(verifyData.result.therapistCrpCommitment).toHaveLength(64);
    expect(verifyData.result.probatoryWormDigest).toBe(genData.proof.probatoryWormDigest);

    // Auditoria WORM gravada
    const audits = db.auditLogs.filter(a => a.action === AuditAction.ZKP_PROOF_VERIFIED);
    expect(audits.length).toBeGreaterThan(0);
  });

  it('deve rejeitar verificação de token adulterado com status 422', async () => {
    const res = await app.request('/api/security/zkp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicVerificationToken: 'zkp_v1_tampered_token_payload' })
    });

    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.result.valid).toBe(false);
  });

  it('deve listar provas geradas e prover métricas consolidadas', async () => {
    // Gera prova
    await app.request('/api/security/zkp/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        documentId: 'doc-relatorio-003',
        documentTypeClaim: 'Relatório Psicológico'
      })
    });

    // Lista provas (requer auth)
    const listRes = await app.request('/api/security/zkp/proofs', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(listData.proofs.length).toBeGreaterThan(0);
    expect(listData.metrics).toBeDefined();

    // Consulta métricas
    const metricsRes = await app.request('/api/security/zkp/metrics', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(metricsRes.status).toBe(200);
    const metricsData = await metricsRes.json();
    expect(metricsData.metrics.totalProofsGenerated).toBeGreaterThan(0);
  });
});
