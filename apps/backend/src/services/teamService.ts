import { randomBytes } from 'node:crypto';
import {
  AuditAction,
  AuditResourceType,
  UserRole,
  type AdminPractice,
  type AdminStaffMember,
  type CreateStaffMemberDTO,
  type User
} from '@terapiainfoco/shared';
import { UserRepository } from '../repositories/userRepository';
import { authService } from './authService';
import { AuditService } from './auditService';

/** Perfis da equipe que o Admin cria vinculados a um consultório */
export const TEAM_ROLES: readonly UserRole[] = [UserRole.RECEPCAO_SECRETARIA, UserRole.SUPERVISOR_CLINICO];

/** Erro de entrada do Admin (vira 400 na rota) */
export class TeamInputError extends Error {}

function newTemporaryPassword(): string {
  return randomBytes(12).toString('base64url');
}

/** Conta da equipe que o Admin pode gerenciar (nunca psicólogos, pacientes ou administradores) */
async function teamMember(userId: string): Promise<User> {
  const user = await UserRepository.findById(userId);
  if (!user || !TEAM_ROLES.includes(user.role)) {
    throw new TeamInputError('Conta da equipe não encontrada.');
  }
  return user;
}

function auditTeamChange(user: User, action: AuditAction, context: { actorId: string; ipAddress: string }) {
  AuditService.log({
    actorId: context.actorId,
    resourceType: AuditResourceType.USER,
    resourceId: user.id,
    action,
    ipAddress: context.ipAddress
  });
}

async function practiceOwners(): Promise<Map<string, User>> {
  const owners = new Map<string, User>();
  for (const user of await UserRepository.list({ roles: [UserRole.PSICOLOGO_TITULAR] })) {
    if (user.therapistId) owners.set(user.therapistId, user);
  }
  return owners;
}

function toStaffMember(user: User, owners: Map<string, User>): AdminStaffMember {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    therapistId: user.therapistId,
    practiceName: user.therapistId ? owners.get(user.therapistId)?.name : undefined,
    twoFactorEnabled: user.twoFactorEnabled,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt ?? null,
    disabled: !!user.disabledAt,
    mustChangePassword: user.mustChangePassword ?? false
  };
}

export const TeamService = {
  async listPractices(): Promise<AdminPractice[]> {
    return Array.from((await practiceOwners()).values())
      .map((u) => ({ therapistId: u.therapistId!, name: u.name, email: u.email, crp: u.crp }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  },

  /** Contas que não são de paciente (equipe dos consultórios e administradores) */
  async listStaff(): Promise<AdminStaffMember[]> {
    const owners = await practiceOwners();
    return (await UserRepository.list({ excludeRoles: [UserRole.PACIENTE] }))
      .map((u) => toStaffMember(u, owners))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  },

  async createStaffMember(
    dto: CreateStaffMemberDTO,
    context: { actorId: string; ipAddress: string }
  ): Promise<{ member: AdminStaffMember; temporaryPassword: string }> {
    const name = dto.name?.trim();
    const email = dto.email?.trim();
    if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new TeamInputError('Informe nome e e-mail válidos.');
    }
    if (!TEAM_ROLES.includes(dto.role)) {
      throw new TeamInputError('Perfil inválido: o Admin cria contas de Recepção ou Supervisor.');
    }
    const owners = await practiceOwners();
    if (!dto.therapistId || !owners.has(dto.therapistId)) {
      throw new TeamInputError('Consultório não encontrado.');
    }

    // Senha inicial aleatória, mostrada uma vez ao Admin; a troca é exigida no primeiro acesso
    const temporaryPassword = newTemporaryPassword();
    let created;
    try {
      created = await authService.register(
        { name, email, password: temporaryPassword, role: dto.role },
        context.ipAddress,
        { allowPrivilegedRole: true, practiceTherapistId: dto.therapistId, actorId: context.actorId, mustChangePassword: true }
      );
    } catch (err: any) {
      throw new TeamInputError(err.message || 'Não foi possível criar a conta.');
    }
    const member = await UserRepository.findById(created.id);
    if (!member) throw new Error('Conta recém-criada não encontrada.');
    return { member: toStaffMember(member, owners), temporaryPassword };
  },

  /** Desativa (ou reativa) a conta: sem login e com os tokens já emitidos rejeitados */
  async setDisabled(userId: string, disabled: boolean, context: { actorId: string; ipAddress: string }): Promise<AdminStaffMember> {
    const user = await teamMember(userId);
    user.disabledAt = disabled ? new Date().toISOString() : undefined;
    await UserRepository.save(user);
    auditTeamChange(user, disabled ? AuditAction.USER_DISABLED : AuditAction.USER_ENABLED, context);
    return toStaffMember(user, await practiceOwners());
  },

  /** Nova senha inicial: encerra as sessões abertas e exige troca no próximo acesso */
  async resetPassword(
    userId: string,
    context: { actorId: string; ipAddress: string }
  ): Promise<{ member: AdminStaffMember; temporaryPassword: string }> {
    const user = await teamMember(userId);
    const temporaryPassword = newTemporaryPassword();
    user.passwordHash = await Bun.password.hash(temporaryPassword);
    user.passwordChangedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
    user.mustChangePassword = true;
    await UserRepository.save(user);
    auditTeamChange(user, AuditAction.USER_PASSWORD_RESET, context);
    return { member: toStaffMember(user, await practiceOwners()), temporaryPassword };
  }
};
