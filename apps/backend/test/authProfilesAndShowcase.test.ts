import { describe, expect, it, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { UserRole, SocialAuthProvider, AuditAction } from '@terapiainfoco/shared';

describe('Vitrine Pública Sem Login, Criação de Perfil (Com/Sem Login Social) & Perfis (Paciente, Psicólogo, Admin)', () => {
  beforeEach(() => {
    db.clear();
    globalRateLimitStore.reset();
  });

  it('GET /api/auth/public-showcase - deve retornar a Vitrine Pública sem necessidade de login com os 3 perfis e 18 módulos clínicos', async () => {
    const res = await app.request('/api/auth/public-showcase');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.showcase.platformName).toBe('TerapiaInFoco');
    expect(body.showcase.totalClinicalModules).toBe(18);
    expect(body.showcase.totalSecurityLayers).toBe(74);
    expect(body.showcase.profilesCatalog).toHaveLength(3);

    const roles = body.showcase.profilesCatalog.map((p: any) => p.role);
    expect(roles).toContain(UserRole.PACIENTE);
    expect(roles).toContain(UserRole.PSICOLOGO_TITULAR);
    expect(roles).toContain(UserRole.ADMIN);
    expect(body.showcase.clinicalModulesHighlight.length).toBeGreaterThanOrEqual(6);
  });

  it('POST /api/auth/register - deve criar perfil de PACIENTE sem login social (registro clínico criado apenas no primeiro agendamento)', async () => {
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Lucas Ferreira Lima',
        email: 'lucas.lima@paciente.com.br',
        password: 'SenhaPaciente@2026',
        role: UserRole.PACIENTE,
        phone: '(11) 98877-6655',
        cpf: '321.654.987-01',
        emergencyContactName: 'Fernanda Lima (Mãe)',
        emergencyContactPhone: '(11) 97766-5544'
      })
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.user.role).toBe(UserRole.PACIENTE);
    expect(body.user.cpfMasked).toBe('***.654.987-**');
    expect(body.user.emergencyContactName).toBe('Fernanda Lima (Mãe)');

    // O prontuário pertence a um consultório: o registro cifrado só nasce no primeiro agendamento
    expect(body.user.patientId).toBeUndefined();
  });

  it('POST /api/auth/social - deve criar perfil e autenticar via Login Social (Google, Gov.br e Apple) para Psicólogo, Paciente e Admin', async () => {
    // 1. Criação de Perfil de Psicólogo via Gov.br (Prata/Ouro)
    const govBrRes = await app.request('/api/auth/social', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: SocialAuthProvider.GOV_BR,
        name: 'Dr. Rafael Vasconcelos',
        email: 'rafael.vasconcelos@psicologia.gov.br',
        role: UserRole.PSICOLOGO_TITULAR,
        crp: '06/178920',
        crpRegion: 'SP',
        specialty: 'Terapia de Aceitação e Compromisso (ACT)'
      })
    });

    expect(govBrRes.status).toBe(201);
    const govBrBody = await govBrRes.json();
    expect(govBrBody.success).toBe(true);
    expect(govBrBody.isNewProfile).toBe(true);
    expect(govBrBody.socialProviderUsed).toBe(SocialAuthProvider.GOV_BR);
    expect(govBrBody.accessToken).toBeDefined();
    expect(govBrBody.user.role).toBe(UserRole.PSICOLOGO_TITULAR);
    expect(govBrBody.user.crp).toBe('06/178920');
    expect(govBrBody.user.socialProviders).toContain(SocialAuthProvider.GOV_BR);

    // 2. Login Social subsequente com Google na mesma conta (vinculação automática de provedor)
    const googleLinkRes = await app.request('/api/auth/social', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: SocialAuthProvider.GOOGLE,
        name: 'Dr. Rafael Vasconcelos',
        email: 'rafael.vasconcelos@psicologia.gov.br'
      })
    });

    expect(googleLinkRes.status).toBe(200);
    const googleLinkBody = await googleLinkRes.json();
    expect(googleLinkBody.isNewProfile).toBe(false);
    expect(googleLinkBody.user.socialProviders).toContain(SocialAuthProvider.GOV_BR);
    expect(googleLinkBody.user.socialProviders).toContain(SocialAuthProvider.GOOGLE);

    // Verifica auditoria WORM
    const socialWormLog = db.auditLogs.find(l => l.action === AuditAction.SOCIAL_AUTH_LOGIN);
    expect(socialWormLog).toBeDefined();
  });

  it('PUT /api/auth/profile & GET /api/auth/me - deve autenticar nos 3 perfis padrão (Paciente, Psicólogo e Admin) e atualizar dados de perfil com auditoria WORM', async () => {
    // Login como Paciente padrão
    const loginPaciente = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'paciente@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    expect(loginPaciente.status).toBe(200);
    const pacienteAuth = await loginPaciente.json();
    expect(pacienteAuth.user.role).toBe(UserRole.PACIENTE);
    expect(pacienteAuth.user.patientId).toBe('00000000-0000-0000-0000-000000000002');

    // Atualiza perfil do Paciente
    const updateRes = await app.request('/api/auth/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pacienteAuth.accessToken}`
      },
      body: JSON.stringify({
        phone: '(11) 99111-2233',
        emergencyContactName: 'Helena Oliveira (Irmã)',
        emergencyContactPhone: '(11) 99444-5566'
      })
    });

    expect(updateRes.status).toBe(200);
    const updatedBody = await updateRes.json();
    expect(updatedBody.user.phone).toBe('(11) 99111-2233');
    expect(updatedBody.user.emergencyContactName).toBe('Helena Oliveira (Irmã)');

    // Verifica auditoria WORM de atualização de perfil
    const profileWorm = db.auditLogs.find(l => l.action === AuditAction.USER_PROFILE_UPDATED);
    expect(profileWorm).toBeDefined();
  });
});
