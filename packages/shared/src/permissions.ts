import { UserRole } from './enums';

/**
 * Módulos do painel autenticado, na ordem em que aparecem na navegação.
 */
export const APP_MODULES = [
  'portal',
  'dashboard',
  'agenda',
  'patients',
  'soap',
  'documents',
  'audit',
  'backups',
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
  dashboard: [UserRole.PSICOLOGO_TITULAR, UserRole.SUPERVISOR_CLINICO],
  // Agenda do consultório (o paciente vê apenas as próprias consultas, no portal)
  agenda: [UserRole.PSICOLOGO_TITULAR, UserRole.SUPERVISOR_CLINICO, UserRole.RECEPCAO_SECRETARIA],
  patients: [UserRole.PSICOLOGO_TITULAR, UserRole.SUPERVISOR_CLINICO, UserRole.RECEPCAO_SECRETARIA],
  soap: [UserRole.PSICOLOGO_TITULAR, UserRole.SUPERVISOR_CLINICO],
  documents: [UserRole.PSICOLOGO_TITULAR, UserRole.SUPERVISOR_CLINICO],
  audit: [UserRole.PSICOLOGO_TITULAR, UserRole.ADMIN],
  backups: [UserRole.ADMIN],
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
