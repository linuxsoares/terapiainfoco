import { randomUUID } from 'crypto';
import { 
  type TherapeuticGoal, 
  type StoredTherapeuticGoal,
  type CreateTherapeuticGoalDTO,
  type UpdateTherapeuticGoalDTO,
  GoalStatus,
  AuditAction,
  AuditResourceType
} from '@terapiainfoco/shared';
import { db } from '../db/memoryDb';
import { encryptField, decryptField } from './cryptoContext';
import { AuditService } from './auditService';

import { PatientRepository } from '../repositories/patientRepository';
export class GoalService {
  /**
   * Cria uma nova meta terapêutica SMART para o paciente (RFC-001 §3.4)
   */
  static async createGoal(
    dto: CreateTherapeuticGoalDTO,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): Promise<TherapeuticGoal> {
    const patient = await PatientRepository.findById(dto.patientId);
    if (!patient) {
      throw new Error(`Paciente ${dto.patientId} não encontrado.`);
    }

    const id = `goal-${randomUUID()}`;
    const now = new Date();

    const stored: StoredTherapeuticGoal = {
      id,
      patientId: dto.patientId,
      therapistId: patient.therapistId || context.actorId,
      title: dto.title.trim(),
      encryptedDescription: encryptField(dto.description.trim()),
      category: dto.category || 'Geral',
      targetDate: dto.targetDate,
      status: GoalStatus.NOT_STARTED,
      progressPercent: dto.initialProgressPercent !== undefined ? Math.min(100, Math.max(0, dto.initialProgressPercent)) : 0,
      measurementMetric: dto.measurementMetric,
      encryptedNotes: dto.notes ? encryptField(dto.notes.trim()) : undefined,
      sessionsLinkedCount: 0,
      createdAt: now,
      updatedAt: now
    };

    db.therapeuticGoals.set(id, stored);

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.THERAPEUTIC_GOAL,
      resourceId: id,
      action: AuditAction.THERAPEUTIC_GOAL_CREATED,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return {
      id: stored.id,
      patientId: stored.patientId,
      therapistId: stored.therapistId,
      title: stored.title,
      description: dto.description.trim(),
      category: stored.category,
      targetDate: stored.targetDate,
      status: stored.status,
      progressPercent: stored.progressPercent,
      measurementMetric: stored.measurementMetric,
      notes: dto.notes ? dto.notes.trim() : undefined,
      sessionsLinkedCount: stored.sessionsLinkedCount,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt
    };
  }

  /**
   * Obtém metas terapêuticas do paciente
   */
  static getPatientGoals(patientId: string): TherapeuticGoal[] {
    const list: TherapeuticGoal[] = [];
    for (const g of db.therapeuticGoals.values()) {
      if (g.patientId === patientId) {
        list.push({
          id: g.id,
          patientId: g.patientId,
          therapistId: g.therapistId,
          title: g.title,
          description: decryptField(g.encryptedDescription),
          category: g.category,
          targetDate: g.targetDate,
          status: g.status,
          progressPercent: g.progressPercent,
          measurementMetric: g.measurementMetric,
          notes: g.encryptedNotes ? decryptField(g.encryptedNotes) : undefined,
          sessionsLinkedCount: g.sessionsLinkedCount,
          createdAt: g.createdAt,
          updatedAt: g.updatedAt
        });
      }
    }

    return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  /**
   * Atualiza progresso, status ou anotações da meta terapêutica
   */
  static updateGoal(
    goalId: string,
    dto: UpdateTherapeuticGoalDTO,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): TherapeuticGoal {
    const goal = db.therapeuticGoals.get(goalId);
    if (!goal) {
      throw new Error(`Meta terapêutica ${goalId} não encontrada.`);
    }

    if (dto.title) goal.title = dto.title.trim();
    if (dto.description) goal.encryptedDescription = encryptField(dto.description.trim());
    if (dto.category) goal.category = dto.category;
    if (dto.targetDate !== undefined) goal.targetDate = dto.targetDate;
    if (dto.status) goal.status = dto.status;
    if (dto.progressPercent !== undefined) {
      goal.progressPercent = Math.min(100, Math.max(0, dto.progressPercent));
      if (goal.progressPercent === 100 && goal.status !== GoalStatus.ACHIEVED) {
        goal.status = GoalStatus.ACHIEVED;
      }
    }
    if (dto.measurementMetric !== undefined) goal.measurementMetric = dto.measurementMetric;
    if (dto.notes !== undefined) {
      goal.encryptedNotes = encryptField(dto.notes.trim());
    }

    goal.updatedAt = new Date();
    db.therapeuticGoals.set(goalId, goal);

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.THERAPEUTIC_GOAL,
      resourceId: goalId,
      action: AuditAction.THERAPEUTIC_GOAL_UPDATED,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return {
      id: goal.id,
      patientId: goal.patientId,
      therapistId: goal.therapistId,
      title: goal.title,
      description: decryptField(goal.encryptedDescription),
      category: goal.category,
      targetDate: goal.targetDate,
      status: goal.status,
      progressPercent: goal.progressPercent,
      measurementMetric: goal.measurementMetric,
      notes: goal.encryptedNotes ? decryptField(goal.encryptedNotes) : undefined,
      sessionsLinkedCount: goal.sessionsLinkedCount,
      createdAt: goal.createdAt,
      updatedAt: goal.updatedAt
    };
  }

  /**
   * Remove meta terapêutica
   */
  static deleteGoal(
    goalId: string,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): { success: boolean; goalId: string } {
    const goal = db.therapeuticGoals.get(goalId);
    if (!goal) {
      throw new Error(`Meta terapêutica ${goalId} não encontrada.`);
    }

    db.therapeuticGoals.delete(goalId);

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.THERAPEUTIC_GOAL,
      resourceId: goalId,
      action: AuditAction.THERAPEUTIC_GOAL_UPDATED, // Registro de remoção
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return { success: true, goalId };
  }
}
