import { describe, expect, it, beforeEach } from 'bun:test';
import { createHash } from 'node:crypto';
import { app } from '../src';
import { db } from '../src/db/memoryDb';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { 
  AppointmentStatus, 
  AuditAction, 
  DocumentType,
  UserRole
} from '@terapiainfoco/shared';
import { decryptPackageWithPassphrase } from '@terapiainfoco/crypto';
import { resetDb } from './helpers/db';

describe('Portabilidade de Dados & Exportação Criptografada LGPD Art. 18 (Opção F)', () => {
  let therapistToken: string;
  let secretaryToken: string;

  beforeEach(async () => {
    await resetDb();
    await globalRateLimitStore.reset();

    // Login com psicólogo titular
    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'psicologo@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const loginData = await loginRes.json();
    therapistToken = loginData.accessToken;

    // Login com secretária/recepção
    const secRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'recepcao@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const secData = await secRes.json();
    secretaryToken = secData.accessToken;
  });

  it('deve exportar prontuário completo em formato JSON estruturado com Checksum SHA-256 e trilha WORM', async () => {
    // 1. Criar paciente
    const patientRes = await app.request('/api/patients', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        name: 'Beatriz Vasconcelos',
        email: 'beatriz.v@email.com',
        phone: '11988887777',
        cpf: '321.654.987-00',
        consentTranscriptionSigned: true
      })
    });
    expect(patientRes.status).toBe(201);
    const { patient } = await patientRes.json();

    // 2. Agendar consulta
    const apptRes = await app.request('/api/appointments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        patientId: patient.id,
        scheduledStart: new Date(Date.now() + 86400000).toISOString(),
        scheduledEnd: new Date(Date.now() + 86400000 + 50 * 60000).toISOString()
      })
    });
    expect(apptRes.status).toBe(201);
    const { appointment } = await apptRes.json();

    // 3. Salvar e assinar prontuário SOAP (Human-in-the-Loop)
    const draftRes = await app.request('/api/clinical-records/draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        appointmentId: appointment.id,
        patientId: patient.id,
        therapistId: 'therapist-001',
        sessionNumber: 1,
        soap: {
          subjective: 'Paciente relata início de sintomas depressivos após transição profissional.',
          objective: 'Afeto deprimido, contato visual preservado, choro episódico.',
          assessment: 'Hipótese diagnóstica de Episódio Depressivo Moderado (F32.1).',
          plan: 'Psicoeducação sobre ciclo do humor e registro de pensamentos automáticos.'
        }
      })
    });
    expect(draftRes.status).toBe(201);
    const { record } = await draftRes.json();

    const signRes = await app.request('/api/clinical-records/sign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        recordId: record.id,
        confirmedHumanReview: true
      })
    });
    expect(signRes.status).toBe(200);

    // 4. Emitir documento psicológico formal
    const docRes = await app.request('/api/documents/draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        patientId: patient.id,
        type: DocumentType.DECLARACAO,
        title: 'Declaração de Comparecimento',
        content: 'Declaro para os devidos fins que a paciente Beatriz realizou sessão psicológica.'
      })
    });
    expect(docRes.status).toBe(201);

    // 5. Requisitar exportação completa em JSON (LGPD Art. 18, V)
    const exportRes = await app.request(`/api/patients/${patient.id}/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        format: 'json',
        requestReason: 'Solicitação de portabilidade pelo titular'
      })
    });

    expect(exportRes.status).toBe(200);
    const exportData = await exportRes.json();

    expect(exportData.success).toBe(true);
    expect(exportData.format).toBe('json');
    expect(exportData.checksumSha256).toBeDefined();
    expect(exportData.checksumSha256).toHaveLength(64);

    const pkg = exportData.package;
    expect(pkg).toBeDefined();
    expect(pkg.exportVersion).toBe('1.0');
    expect(pkg.regulationBasis.lgpdArticle).toContain('Art. 18, inciso V');
    expect(pkg.regulationBasis.cfpResolution).toContain('Resolução CFP nº 001/2009');
    expect(pkg.regulationBasis.legalRetainNotice).toContain('5 (cinco) anos');

    // Validação dos dados do paciente decifrados na exportação autorizada
    expect(pkg.patient.name).toBe('Beatriz Vasconcelos');
    expect(pkg.patient.email).toBe('beatriz.v@email.com');
    expect(pkg.patient.cpf).toBe('321.654.987-00');

    // Validação dos registros clínicos e documentos
    expect(pkg.appointments.length).toBe(1);
    expect(pkg.clinicalRecords.length).toBe(1);
    expect(pkg.clinicalRecords[0].isSigned).toBe(true);
    expect(pkg.clinicalRecords[0].soap.subjective).toContain('sintomas depressivos');
    expect(pkg.psychologicalDocuments.length).toBe(1);
    expect(pkg.psychologicalDocuments[0].type).toBe(DocumentType.DECLARACAO);

    // Validação de integridade do Checksum recalculado
    const { checksumSha256, ...coreData } = pkg;
    const computedHash = createHash('sha256').update(JSON.stringify(coreData)).digest('hex');
    expect(computedHash).toBe(checksumSha256);

    // Validação da trilha de auditoria WORM
    const exportAuditLog = db.auditLogs.find(
      l => l.resourceId === patient.id && l.action === AuditAction.DATA_EXPORT
    );
    expect(exportAuditLog).toBeDefined();
  });

  it('deve exportar pacote criptografado por passphrase (AES-256-GCM + PBKDF2) e permitir decifragem íntegra', async () => {
    // 1. Criar paciente
    const patientRes = await app.request('/api/patients', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        name: 'Carlos Drummond',
        email: 'carlos.drummond@email.com',
        phone: '21999998888',
        consentTranscriptionSigned: false
      })
    });
    const { patient } = await patientRes.json();

    const userPassphrase = 'SenhaUltraSecretaPaciente#2026';

    // 2. Requisitar pacote criptografado com passphrase
    const exportRes = await app.request(`/api/patients/${patient.id}/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        format: 'encrypted_package',
        passphrase: userPassphrase
      })
    });

    expect(exportRes.status).toBe(200);
    const exportData = await exportRes.json();

    expect(exportData.success).toBe(true);
    expect(exportData.format).toBe('encrypted_package');
    expect(exportData.encryptedPackage).toBeDefined();

    const encPkg = exportData.encryptedPackage;
    expect(encPkg.encrypted).toBe(true);
    expect(encPkg.algorithm).toBe('aes-256-gcm');
    expect(encPkg.kdf).toBe('pbkdf2-sha512');
    expect(encPkg.kdfIterations).toBe(100_000);
    expect(encPkg.saltBase64).toBeDefined();
    expect(encPkg.ivBase64).toBeDefined();
    expect(encPkg.authTagBase64).toBeDefined();
    expect(encPkg.ciphertextBase64).toBeDefined();

    // 3. Teste de Decifragem do pacote com a senha correta
    const decryptedJson = decryptPackageWithPassphrase(encPkg, userPassphrase);
    expect(decryptedJson).toBeDefined();

    const unpacked = JSON.parse(decryptedJson);
    expect(unpacked.exportVersion).toBe('1.0');
    expect(unpacked.patient.name).toBe('Carlos Drummond');
    expect(unpacked.checksumSha256).toBe(exportData.checksumSha256);

    // 4. Teste de rejeição com senha incorreta
    expect(() => {
      decryptPackageWithPassphrase(encPkg, 'SenhaErrada123!');
    }).toThrow();
  });

  it('deve rejeitar exportação cifrada se a passphrase for inválida ou ausente', async () => {
    const patientRes = await app.request('/api/patients', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        name: 'Eduardo Galeano',
        email: 'eduardo@email.com',
        phone: '11977776666',
        consentTranscriptionSigned: true
      })
    });
    const { patient } = await patientRes.json();

    // Tenta exportar pacote cifrado sem fornecer senha
    const exportRes = await app.request(`/api/patients/${patient.id}/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        format: 'encrypted_package'
      })
    });

    expect(exportRes.status).toBe(400);
    const errData = await exportRes.json();
    expect(errData.error).toContain('frase secreta com no mínimo 6 caracteres');
  });

  it('deve registrar revogação formal de consentimento (LGPD Art. 18, IX) e preservar retenção de 5 anos (CFP)', async () => {
    // 1. Criar paciente com consentimento ativo
    const patientRes = await app.request('/api/patients', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        name: 'Fernanda Montenegro',
        email: 'fernanda@email.com',
        phone: '21977778888',
        consentTranscriptionSigned: true
      })
    });
    const { patient } = await patientRes.json();
    expect(patient.consentTranscriptionSigned).toBe(true);

    // 2. Revogar consentimento formalmente
    const revokeRes = await app.request(`/api/patients/${patient.id}/revoke-consent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        reason: 'Titular solicitou não ter suas sessões transcritas por IA.',
        revokeTranscriptionConsent: true
      })
    });

    expect(revokeRes.status).toBe(200);
    const revokeData = await revokeRes.json();
    expect(revokeData.success).toBe(true);
    expect(revokeData.consentTranscriptionSigned).toBe(false);
    expect(revokeData.legalRetentionNote).toContain('5 anos');
    expect(revokeData.legalRetentionNote).toContain('Resolução CFP nº 001/2009');

    // 3. Verificar estado do paciente persistido
    const checkPatientRes = await app.request(`/api/patients/${patient.id}`, {
      headers: { Authorization: `Bearer ${therapistToken}` }
    });
    const checkData = await checkPatientRes.json();
    expect(checkData.patient.consentTranscriptionSigned).toBe(false);
    expect(checkData.patient.consentRevokedAt).toBeDefined();
    expect(checkData.patient.consentRevokeReason).toBe('Titular solicitou não ter suas sessões transcritas por IA.');

    // 4. Trilha WORM de auditoria imutável
    const revokeLog = db.auditLogs.find(
      l => l.resourceId === patient.id && l.action === AuditAction.CONSENT_REVOCATION
    );
    expect(revokeLog).toBeDefined();
  });

  it('deve realizar revogação de consentimento com quarentena de dados simultânea', async () => {
    const patientRes = await app.request('/api/patients', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        name: 'Gabriel Garcia',
        email: 'gabriel@email.com',
        phone: '11966665555',
        consentTranscriptionSigned: true
      })
    });
    const { patient } = await patientRes.json();

    const revokeRes = await app.request(`/api/patients/${patient.id}/revoke-consent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        reason: 'Direito ao esquecimento e descontinuação do tratamento.',
        revokeTranscriptionConsent: true,
        requestDataQuarantine: true
      })
    });

    expect(revokeRes.status).toBe(200);
    const revokeData = await revokeRes.json();
    expect(revokeData.quarantined).toBe(true);

    // O paciente agora está em quarentena legal (dados de contato pseudonimizados)
    const checkPatientRes = await app.request(`/api/patients/${patient.id}`, {
      headers: { Authorization: `Bearer ${therapistToken}` }
    });
    const checkData = await checkPatientRes.json();
    expect(checkData.patient.name).toContain('QUARENTENA LGPD');
  });

  it('deve bloquear acesso à exportação e revogação para perfis não autorizados (RBAC)', async () => {
    const patientRes = await app.request('/api/patients', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        name: 'Helena Soares',
        email: 'helena@email.com',
        phone: '11955554444',
        consentTranscriptionSigned: true
      })
    });
    const { patient } = await patientRes.json();

    // Secretária tentando exportar prontuário clínico sensível -> 403 Forbidden
    const secExportRes = await app.request(`/api/patients/${patient.id}/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secretaryToken}`
      },
      body: JSON.stringify({ format: 'json' })
    });
    expect(secExportRes.status).toBe(403);

    // Secretária tentando revogar consentimento -> 403 Forbidden
    const secRevokeRes = await app.request(`/api/patients/${patient.id}/revoke-consent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secretaryToken}`
      },
      body: JSON.stringify({ reason: 'Tentativa não autorizada' })
    });
    expect(secRevokeRes.status).toBe(403);

    // Acesso não autenticado com header estrito -> 401 Unauthorized
    const unauthRes = await app.request(`/api/patients/${patient.id}/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Strict-Auth': 'true'
      }
    });
    expect(unauthRes.status).toBe(401);
  });
});
