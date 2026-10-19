import { describe, expect, it, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { authService } from '../src/services/authService';
import { generateTotpCode } from '@terapiainfoco/crypto';
import { UserRole } from '@terapiainfoco/shared';

describe('Auth Layer, 2FA/MFA, RBAC e Rate Limiting (Opção C - RFC-001)', () => {
  beforeEach(() => {
    db.clear();
    globalRateLimitStore.reset();
  });

  it('deve registrar novo profissional com hash seguro de senha', async () => {
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Dra. Camila Nogueira',
        email: 'camila.nogueira@terapiainfoco.com.br',
        password: 'SenhaForte@2026',
        role: UserRole.PSICOLOGO_TITULAR,
        crp: '06/987654',
        crpRegion: 'SP'
      })
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.user.email).toBe('camila.nogueira@terapiainfoco.com.br');
    expect(body.user.role).toBe(UserRole.PSICOLOGO_TITULAR);
    expect(body.user.twoFactorEnabled).toBe(false);

    // Verifica que senha em texto claro não existe no banco
    const stored = db.users.get(body.user.id);
    expect(stored?.passwordHash).toBeDefined();
    expect(stored?.passwordHash).not.toBe('SenhaForte@2026');
  });

  it('deve realizar login de credenciais válidas e emitir tokens JWT', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'psicologo@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();
    expect(body.user.name).toBe('Dra. Beatriz Santos');
    expect(body.user.role).toBe(UserRole.PSICOLOGO_TITULAR);
  });

  it('deve rejeitar login com senha incorreta e registrar falha na auditoria WORM', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'psicologo@terapiainfoco.com.br',
        password: 'SenhaErrada123'
      })
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);

    // Verifica se houve registro na trilha WORM
    const failedLog = db.auditLogs.find(l => l.action === 'AUTH_LOGIN_FAILED');
    expect(failedLog).toBeDefined();
  });

  it('deve acionar Rate Limiting (429 Too Many Requests) em tentativas repetidas de login', async () => {
    // authRateLimiter permite no máximo 5 tentativas por janela
    for (let i = 0; i < 5; i++) {
      await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'psicologo@terapiainfoco.com.br',
          password: 'SenhaErrada'
        })
      });
    }

    // A 6ª tentativa deve ser bloqueada com 429
    const blockedRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'psicologo@terapiainfoco.com.br',
        password: 'SenhaErrada'
      })
    });

    expect(blockedRes.status).toBe(429);
    expect(blockedRes.headers.get('Retry-After')).toBeDefined();
    expect(blockedRes.headers.get('X-RateLimit-Limit')).toBe('5');
    expect(blockedRes.headers.get('X-RateLimit-Remaining')).toBe('0');
  });

  it('Fluxo Completo de 2FA/MFA: ativação, desafio no login e validação por TOTP e backup code', async () => {
    // 1. Login inicial para obter token de psicólogo
    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'psicologo@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const loginData = await loginRes.json();
    const token = loginData.accessToken;

    // 2. Inicia setup de 2FA
    const setupRes = await app.request('/api/auth/2fa/setup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      }
    });
    expect(setupRes.status).toBe(200);
    const setupData = await setupRes.json();
    expect(setupData.secret).toBeDefined();
    expect(setupData.otpauthUri).toContain('otpauth://totp');
    expect(setupData.backupCodes).toHaveLength(8);

    // 3. Valida ativação com o primeiro código TOTP
    const validCode = generateTotpCode(setupData.secret);
    const verifyRes = await app.request('/api/auth/2fa/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ code: validCode })
    });
    expect(verifyRes.status).toBe(200);
    const verifyData = await verifyRes.json();
    expect(verifyData.success).toBe(true);

    // 4. Novo login deve exigir desafio MFA
    const mfaLoginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bypass-Rate-Limit': 'true'
      },
      body: JSON.stringify({
        email: 'psicologo@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    expect(mfaLoginRes.status).toBe(200);
    const mfaLoginData = await mfaLoginRes.json();
    expect(mfaLoginData.mfaRequired).toBe(true);
    expect(mfaLoginData.tempToken).toBeDefined();

    // 5. Validação com código TOTP incorreto falha
    const badMfaRes = await app.request('/api/auth/2fa/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tempToken: mfaLoginData.tempToken,
        code: '000000'
      })
    });
    expect(badMfaRes.status).toBe(401);

    // 6. Validação com código de contingência (Backup Code)
    const backupCodeToUse = setupData.backupCodes[0];
    const backupMfaRes = await app.request('/api/auth/2fa/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bypass-Rate-Limit': 'true'
      },
      body: JSON.stringify({
        tempToken: mfaLoginData.tempToken,
        code: backupCodeToUse
      })
    });
    expect(backupMfaRes.status).toBe(200);
    const finalTokens = await backupMfaRes.json();
    expect(finalTokens.accessToken).toBeDefined();
    expect(finalTokens.refreshToken).toBeDefined();
  });

  it('deve realizar renovação de sessão via refresh token com rotação de chaves', async () => {
    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'supervisor@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const { refreshToken } = await loginRes.json();

    const refreshRes = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    expect(refreshRes.status).toBe(200);
    const refreshed = await refreshRes.json();
    expect(refreshed.accessToken).toBeDefined();
    expect(refreshed.refreshToken).toBeDefined();
    expect(refreshed.refreshToken).not.toBe(refreshToken); // Token rotacionado

    // Tentar reutilizar o refresh token antigo deve ser rejeitado (Token Rotation Blacklist)
    const reuseRes = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    expect(reuseRes.status).toBe(401);
  });

  it('RBAC: Controle Estrito de Acesso por Papel (Segregação Psicólogo vs. Secretária)', async () => {
    // 1. Obtém token de Psicólogo Titular
    const psiRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'psicologo@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const psiToken = (await psiRes.json()).accessToken;

    // 2. Obtém token de Recepção / Secretária
    const secRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bypass-Rate-Limit': 'true'
      },
      body: JSON.stringify({
        email: 'recepcao@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const secToken = (await secRes.json()).accessToken;

    // A) Psicólogo Titular cria rascunho SOAP -> Permitido (201)
    const psiSoapRes = await app.request('/api/clinical-records/draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${psiToken}`
      },
      body: JSON.stringify({
        appointmentId: '00000000-0000-0000-0000-000000000010',
        patientId: '00000000-0000-0000-0000-000000000002',
        therapistId: 'therapist-001',
        sessionNumber: 1,
        soap: {
          subjective: 'Relato do paciente',
          objective: 'Exame psíquico',
          assessment: 'Hipótese diagnóstica',
          plan: 'Encaminhamento'
        }
      })
    });
    expect(psiSoapRes.status).toBe(201);

    // B) Secretária tenta acessar rascunho SOAP -> BLOQUEADO 403 Forbidden!
    const secSoapRes = await app.request('/api/clinical-records/draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secToken}`
      },
      body: JSON.stringify({
        appointmentId: '00000000-0000-0000-0000-000000000010',
        patientId: '00000000-0000-0000-0000-000000000002',
        therapistId: 'therapist-001',
        sessionNumber: 1,
        soap: { subjective: 'Teste invasivo' }
      })
    });
    expect(secSoapRes.status).toBe(403);
    const secSoapErr = await secSoapRes.json();
    expect(secSoapErr.error).toContain('RECEPCAO_SECRETARIA');

    // C) Secretária tenta acessar documentos CFP -> BLOQUEADO 403 Forbidden!
    const secDocRes = await app.request('/api/documents/draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secToken}`
      },
      body: JSON.stringify({
        patientId: '00000000-0000-0000-0000-000000000002',
        type: 'ATESTADO',
        title: 'Atestado Psicológico',
        content: 'Conteúdo restrito'
      })
    });
    expect(secDocRes.status).toBe(403);

    // D) Secretária tenta acessar trilha de auditoria -> BLOQUEADO 403 Forbidden!
    const secAuditRes = await app.request('/api/audit', {
      headers: {
        Authorization: `Bearer ${secToken}`
      }
    });
    expect(secAuditRes.status).toBe(403);

    // E) Secretária realiza agendamento na agenda -> PERMITIDO (201)
    const secApptRes = await app.request('/api/appointments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secToken}`
      },
      body: JSON.stringify({
        patientId: '00000000-0000-0000-0000-000000000002',
        therapistId: 'therapist-001',
        scheduledStart: '2026-11-01T10:00:00.000Z',
        scheduledEnd: '2026-11-01T10:50:00.000Z'
      })
    });
    expect(secApptRes.status).toBe(201);
  });

  it('Rate Limiting: proteção contra enumeração em busca por Blind Index e validação de documento', async () => {
    // 1. Proteção de Blind Index em /api/patients/search/cpf (limite de 30)
    const psicologa = db.users.get('00000000-0000-0000-0000-000000000001')!;
    const { accessToken } = await authService.issueTokens(psicologa, '127.0.0.1');
    const searchInit = { headers: { Authorization: `Bearer ${accessToken}` } };
    for (let i = 0; i < 30; i++) {
      await app.request('/api/patients/search/cpf?cpf=123.456.789-00', searchInit);
    }
    const rateLimitedSearch = await app.request('/api/patients/search/cpf?cpf=123.456.789-00', searchInit);
    expect(rateLimitedSearch.status).toBe(429);
    const searchBody = await rateLimitedSearch.json();
    expect(searchBody.error).toContain('Blind Index');

    // 2. Proteção de validação pública em /api/documents/validate/:token (limite de 20)
    for (let i = 0; i < 20; i++) {
      await app.request('/api/documents/validate/mock-test-token-123');
    }
    const rateLimitedValidation = await app.request('/api/documents/validate/mock-test-token-123');
    expect(rateLimitedValidation.status).toBe(429);
    const valBody = await rateLimitedValidation.json();
    expect(valBody.error).toContain('validações de documentos');
  });
});
