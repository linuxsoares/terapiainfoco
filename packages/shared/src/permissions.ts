import { UserRole } from './enums';

/**
 * Módulos do painel autenticado, na ordem em que aparecem na navegação.
 */
export const APP_MODULES = [
  'portal',
  'directory',
  'dashboard',
  'agenda',
  'patients',
  'soap',
  'documents',
  'publicProfile',
  'audit',
  'crpVerification',
  'team',
  'backups',
  'observability',
  'security'
] as const;

export type AppModule = (typeof APP_MODULES)[number];

/**
 * Perfis que podem ver cada módulo (RFC-001 §4.5). Fonte única para a navegação do
 * frontend, alinhada aos papéis exigidos pelas rotas do backend.
 */
export const MODULE_ACCESS: Record<AppModule, readonly UserRole[]> = {
  // Espaço do paciente: exercícios, recibos, TCLE e cofre de portabilidade
  portal: [UserRole.PACIENTE],
  // Busca de psicólogos (também pública, sem login, na vitrine)
  directory: [UserRole.PACIENTE],
  dashboard: [UserRole.PSICOLOGO_TITULAR, UserRole.SUPERVISOR_CLINICO],
  // Agenda do consultório (o paciente vê apenas as próprias consultas, no portal)
  agenda: [UserRole.PSICOLOGO_TITULAR, UserRole.SUPERVISOR_CLINICO, UserRole.RECEPCAO_SECRETARIA],
  patients: [UserRole.PSICOLOGO_TITULAR, UserRole.SUPERVISOR_CLINICO, UserRole.RECEPCAO_SECRETARIA],
  soap: [UserRole.PSICOLOGO_TITULAR, UserRole.SUPERVISOR_CLINICO],
  documents: [UserRole.PSICOLOGO_TITULAR, UserRole.SUPERVISOR_CLINICO],
  // Perfil exibido na busca de psicólogos
  publicProfile: [UserRole.PSICOLOGO_TITULAR],
  audit: [UserRole.PSICOLOGO_TITULAR, UserRole.ADMIN],
  crpVerification: [UserRole.ADMIN],
  // Contas da equipe (Recepção/Supervisor) vinculadas a um consultório
  team: [UserRole.ADMIN],
  backups: [UserRole.ADMIN],
  // Segurança da plataforma e telemetria de infraestrutura (operação), fora do consultório
  observability: [UserRole.ADMIN],
  // Segurança pessoal (2FA, passkeys) vale para todos os perfis
  security: [
    UserRole.PSICOLOGO_TITULAR,
    UserRole.SUPERVISOR_CLINICO,
    UserRole.RECEPCAO_SECRETARIA,
    UserRole.PACIENTE,
    UserRole.ADMIN
  ]
};

export function canViewModule(role: UserRole, module: AppModule): boolean {
  return MODULE_ACCESS[module].includes(role);
}

export function visibleModules(role: UserRole): AppModule[] {
  return APP_MODULES.filter((module) => canViewModule(role, module));
}

/** Primeiro módulo visível: tela inicial do perfil */
export function defaultModule(role: UserRole): AppModule {
  return visibleModules(role)[0] ?? 'security';
}

/**
 * Ações sobre um paciente no módulo de pacientes, alinhadas aos papéis exigidos pelas rotas.
 * A recepção cadastra, busca e registra consentimento, mas não acessa conteúdo clínico.
 */
export const PATIENT_ACTION_ACCESS = {
  clinical: [UserRole.PSICOLOGO_TITULAR, UserRole.SUPERVISOR_CLINICO],
  consent: [UserRole.PSICOLOGO_TITULAR, UserRole.RECEPCAO_SECRETARIA],
  vault: [UserRole.PSICOLOGO_TITULAR, UserRole.SUPERVISOR_CLINICO],
  export: [UserRole.PSICOLOGO_TITULAR],
  revokeConsent: [UserRole.PSICOLOGO_TITULAR],
  quarantine: [UserRole.PSICOLOGO_TITULAR]
} as const satisfies Record<string, readonly UserRole[]>;

export type PatientAction = keyof typeof PATIENT_ACTION_ACCESS;

export function canPerformPatientAction(role: UserRole, action: PatientAction): boolean {
  return (PATIENT_ACTION_ACCESS[action] as readonly UserRole[]).includes(role);
}
