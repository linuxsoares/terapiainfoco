import { describe, expect, it, beforeEach } from 'bun:test';
import { app } from '../src';
import { db } from '../src/db/memoryDb';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { backupStore } from '../src/services/backupService';
import { AuditAction, DocumentType } from '@terapiainfoco/shared';

describe('Backup Criptografado & Disaster Recovery com KMS (RFC-001 Opção G)', () => {
  let therapistToken: string;
  let adminToken: string;
  let secretaryToken: string;

  beforeEach(async () => {
    db.clear();
    backupStore.clear();
    globalRateLimitStore.reset();

    // 1. Login com psicóloga titular
    const loginTherapist = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'psicologo@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    therapistToken = (await loginTherapist.json()).accessToken;

    // 2. Login com administrador
    const loginAdmin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    adminToken = (await loginAdmin.json()).accessToken;

    // 3. Login com secretária/recepção
    const loginSec = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'recepcao@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    secretaryToken = (await loginSec.json()).accessToken;
  });

  it('deve gerar snapshot de backup cifrado via Envelope Encryption (KMS) com Checksum SHA-256 e trilha WORM', async () => {
    // Cadastrar paciente para compor o banco
    await app.request('/api/patients', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        name: 'Clara Nunes',
        email: 'clara.nunes@email.com',
        phone: '11988889999',
        cpf: '111.222.333-44',
        consentTranscriptionSigned: true
      })
    });

    // Disparar geração de backup criptografado
    const backupRes = await app.request('/api/backups', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    });

    expect(backupRes.status).toBe(201);
    const data = await backupRes.json();

    expect(data.success).toBe(true);
    expect(data.backup).toBeDefined();
    expect(data.backup.id).toBeDefined();
    expect(data.backup.checksumSha256).toBeDefined();
    expect(data.backup.checksumSha256).toHaveLength(64);
    expect(data.backup.sizeBytes).toBeGreaterThan(0);
    expect(data.backup.status).toBe('COMPLETED');
    expect(data.backup.entitiesCount.patients).toBeGreaterThanOrEqual(1);
    expect(data.backup.entitiesCount.totalEntities).toBeGreaterThan(0);

    // Validação da trilha de auditoria WORM
    const wormLog = db.auditLogs.find(
      l => l.resourceId === data.backup.id && l.action === AuditAction.BACKUP_CREATE
    );
    expect(wormLog).toBeDefined();
  });

  it('deve permitir download do arquivo de backup criptografado (.kms-backup.json)', async () => {
    // 1. Gera backup
    const backupRes = await app.request('/api/backups', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const { backup } = await backupRes.json();

    // 2. Download do arquivo
    const downloadRes = await app.request(`/api/backups/${backup.id}/download`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get('Content-Type')).toContain('application/json');
    expect(downloadRes.headers.get('Content-Disposition')).toContain('attachment');

    const fileContent = await downloadRes.json();
    expect(fileContent.backupMetadata.id).toBe(backup.id);
    expect(fileContent.envelope.encryptedDek).toBeDefined();
    expect(fileContent.envelope.payload.ciphertext).toBeDefined();
    expect(fileContent.envelope.payload.iv).toBeDefined();
    expect(fileContent.envelope.payload.authTag).toBeDefined();
  });

  it('deve executar simulação de Disaster Recovery e validação de integridade criptográfica pelo KMS', async () => {
    // 1. Gera backup
    const backupRes = await app.request('/api/backups', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const { backup } = await backupRes.json();

    // 2. Executa verificação do snapshot
    const verifyRes = await app.request(`/api/backups/${backup.id}/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(verifyRes.status).toBe(200);
    const verifyData = await verifyRes.json();

    expect(verifyData.success).toBe(true);
    expect(verifyData.integrityOk).toBe(true);
    expect(verifyData.verifiedAt).toBeDefined();
    expect(verifyData.verificationTimeMs).toBeGreaterThanOrEqual(0);
    expect(verifyData.entitiesVerified.totalEntities).toBeGreaterThan(0);

    // 3. Consulta histórico e valida status VERIFIED
    const overviewRes = await app.request('/api/backups', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const overview = await overviewRes.json();
    const updated = overview.backups.find((b: any) => b.id === backup.id);
    expect(updated.status).toBe('VERIFIED');
    expect(updated.verifiedAt).toBeDefined();
    expect(updated.verificationDetails.gcmAuthTagValid).toBe(true);

    // Trilha WORM
    const verifyLog = db.auditLogs.find(
      l => l.resourceId === backup.id && l.action === AuditAction.BACKUP_VERIFY
    );
    expect(verifyLog).toBeDefined();
  });

  it('deve restaurar o estado do banco de dados em emergência (Disaster Recovery Restore) por perfil Admin', async () => {
    // 1. Cria paciente de referência
    const patientRes = await app.request('/api/patients', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        name: 'Joana Darc de Orleans',
        email: 'joana.darc@email.com',
        phone: '11977778888',
        cpf: '999.888.777-66',
        consentTranscriptionSigned: true
      })
    });
    const { patient } = await patientRes.json();

    // 2. Gera backup contendo Joana D'Arc
    const backupRes = await app.request('/api/backups', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const { backup } = await backupRes.json();

    // 3. Simula corrupção/desastre apagando a coleção de pacientes
    db.patients.clear();
    expect(db.patients.size).toBe(0);

    // 4. Executa restauração emergencial pelo Admin
    const restoreRes = await app.request(`/api/backups/${backup.id}/restore`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(restoreRes.status).toBe(200);
    const restoreData = await restoreRes.json();
    expect(restoreData.success).toBe(true);
    expect(restoreData.entitiesRestored.patients).toBeGreaterThanOrEqual(1);

    // 5. Confere se os dados de Joana D'Arc foram 100% restabelecidos
    expect(db.patients.size).toBeGreaterThanOrEqual(1);
    const restoredPatient = db.patients.get(patient.id);
    expect(restoredPatient).toBeDefined();

    // Trilha WORM
    const restoreLog = db.auditLogs.find(
      l => l.resourceId === backup.id && l.action === AuditAction.BACKUP_RESTORE
    );
    expect(restoreLog).toBeDefined();
  });

  it('deve fornecer indicadores de RPO e RTO no overview de backups', async () => {
    // Gera 1 backup e verifica
    const backupRes = await app.request('/api/backups', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const { backup } = await backupRes.json();
    await app.request(`/api/backups/${backup.id}/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    const overviewRes = await app.request('/api/backups', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(overviewRes.status).toBe(200);
    const overview = await overviewRes.json();

    expect(overview.success).toBe(true);
    expect(overview.totalBackups).toBeGreaterThanOrEqual(1);
    expect(overview.lastBackupAt).toBeDefined();
    expect(overview.lastVerifiedAt).toBeDefined();
    expect(overview.isRpoCompliant).toBe(true);
    expect(overview.rpoHours).toBeLessThanOrEqual(24);
    expect(overview.rtoEstimateMs).toBeGreaterThan(0);
  });

  it('deve aplicar controle estrito de acesso baseado em função (RBAC)', async () => {
    // 1. Gera backup com Admin
    const backupRes = await app.request('/api/backups', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const { backup } = await backupRes.json();

    // Secretária tentando listar backups -> 403 Forbidden
    const secListRes = await app.request('/api/backups', {
      headers: { Authorization: `Bearer ${secretaryToken}` }
    });
    expect(secListRes.status).toBe(403);

    // Secretária tentando criar backup -> 403 Forbidden
    const secCreateRes = await app.request('/api/backups', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretaryToken}` }
    });
    expect(secCreateRes.status).toBe(403);

    // Backups contêm dados de todos os consultórios: psicólogo não lista nem cria -> 403 Forbidden
    const therapistListRes = await app.request('/api/backups', {
      headers: { Authorization: `Bearer ${therapistToken}` }
    });
    expect(therapistListRes.status).toBe(403);
    const therapistCreateRes = await app.request('/api/backups', {
      method: 'POST',
      headers: { Authorization: `Bearer ${therapistToken}` }
    });
    expect(therapistCreateRes.status).toBe(403);

    // Psicólogo Titular tentando executar Restore emergencial (apenas Admin) -> 403 Forbidden
    const therapistRestoreRes = await app.request(`/api/backups/${backup.id}/restore`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${therapistToken}` }
    });
    expect(therapistRestoreRes.status).toBe(403);

    // Acesso não autenticado com header estrito -> 401 Unauthorized
    const unauthRes = await app.request('/api/backups', {
      headers: { 'X-Strict-Auth': 'true' }
    });
    expect(unauthRes.status).toBe(401);
  });
});
