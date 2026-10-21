import { UserRole, type User } from '@terapiainfoco/shared';
import type { AppDb } from './index';
import { UserRepository } from '../repositories/userRepository';

/** Senha das contas de demonstração (DEMO_MODE): Senha@123456 */
let demoPasswordHash: string | undefined;

/**
 * Contas fixas do consultório de demonstração (therapist-001). Só existem em DEMO_MODE.
 */
export function buildDemoUsers(): User[] {
  demoPasswordHash ??= Bun.password.hashSync('Senha@123456');
  const now = new Date();
  return [
    // 1. Psicóloga Titular (Responsável Técnica - CFP 001/2009)
    {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'psicologo@terapiainfoco.com.br',
      name: 'Dra. Beatriz Santos',
      role: UserRole.PSICOLOGO_TITULAR,
      crp: '06/142980',
      crpRegion: 'SP',
      therapistId: 'therapist-001',
      phone: '(11) 99123-4567',
      specialty: 'Terapia Cognitivo-Comportamental (TCC) & ACT',
      bio: 'Psicóloga Clínica (USP), Especialista em Transtornos de Ansiedade, Neuropsicologia e Telepsicologia Ética (CFP nº 011/2018).',
      sessionFeeCents: 25000,
      socialProviders: ['EMAIL_PASSWORD' as any, 'GOOGLE' as any, 'GOV_BR' as any],
      passwordHash: demoPasswordHash,
      twoFactorEnabled: false,
      createdAt: now
    },
    // 2. Supervisor Clínico (Acesso de Supervisão/Estágio)
    {
      id: '00000000-0000-0000-0000-000000000002',
      email: 'supervisor@terapiainfoco.com.br',
      name: 'Dr. Marcos Valente',
      role: UserRole.SUPERVISOR_CLINICO,
      therapistId: 'therapist-001',
      crp: '06/099887',
      crpRegion: 'SP',
      specialty: 'Supervisão Clínica & Psicopatologia (CID-11)',
      socialProviders: ['EMAIL_PASSWORD' as any],
      passwordHash: demoPasswordHash,
      twoFactorEnabled: false,
      createdAt: now
    },
    // 3. Recepção / Secretária (Acesso estrito à Agenda e Contato, sem prontuários)
    {
      id: '00000000-0000-0000-0000-000000000003',
      email: 'recepcao@terapiainfoco.com.br',
      name: 'Ana Secretária',
      role: UserRole.RECEPCAO_SECRETARIA,
      therapistId: 'therapist-001',
      socialProviders: ['EMAIL_PASSWORD' as any],
      passwordHash: demoPasswordHash,
      twoFactorEnabled: false,
      createdAt: now
    },
    // 4. Administrador de TI / Segurança & DPO
    {
      id: '00000000-0000-0000-0000-000000000004',
      email: 'admin@terapiainfoco.com.br',
      name: 'Administrador do Sistema',
      role: UserRole.ADMIN,
      phone: '(11) 99888-7766',
      department: 'Engenharia de Segurança, Criptografia KMS & Governança LGPD',
      dpoCertification: 'CDPO/BR • ISO/IEC 27701 & ANPD Resolução nº 15/2024',
      socialProviders: ['EMAIL_PASSWORD' as any, 'GOOGLE' as any, 'PASSKEY_FIDO2' as any],
      passwordHash: demoPasswordHash,
      twoFactorEnabled: false,
      createdAt: now
    },
    // 5. Paciente Titular (Portal do Paciente, Exercícios TCC/ACT/DBT, Recibos & Cofre .enc LGPD Art. 18)
    {
      id: '00000000-0000-0000-0000-000000000005',
      email: 'paciente@terapiainfoco.com.br',
      name: 'Mariana Silva de Oliveira',
      role: UserRole.PACIENTE,
      patientId: '00000000-0000-0000-0000-000000000002',
      therapistId: 'therapist-001',
      phone: '(11) 98765-4321',
      cpfMasked: '***.456.789-**',
      emergencyContactName: 'Carlos Oliveira (Cônjuge)',
      emergencyContactPhone: '(11) 97654-3210',
      socialProviders: ['EMAIL_PASSWORD' as any, 'GOOGLE' as any, 'APPLE' as any],
      passwordHash: demoPasswordHash,
      twoFactorEnabled: false,
      createdAt: now
    }
  ];
}

/** Cria as contas de demonstração que ainda não existem (alterações feitas nelas são preservadas) */
export async function seedDemoUsers(connection?: AppDb): Promise<void> {
  await UserRepository.insertMissing(buildDemoUsers(), connection);
}
