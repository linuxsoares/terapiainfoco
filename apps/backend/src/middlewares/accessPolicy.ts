import type { Context, MiddlewareHandler } from 'hono';
import { db } from '../db/memoryDb';
import { PatientRepository } from '../repositories/patientRepository';
import { AppointmentRepository } from '../repositories/appointmentRepository';
import { UserRole, type SafeUser } from '@terapiainfoco/shared';
import { PRACTICE_STAFF_ROLES } from './authMiddleware';

/**
 * Política de posse dos recursos clínicos.
 *
 * - Equipe do consultório (psicólogo, supervisor, recepção) acessa somente pacientes e
 *   consultas do próprio `therapistId`.
 * - Paciente acessa somente o próprio registro e as próprias consultas.
 * - Conteúdo clínico (prontuário, anamnese, linha do tempo) é restrito a CLINICAL_ROLES:
 *   Admin/DPO e recepção não leem conteúdo clínico (RFC-001 §2.1 e §4).
 *
 * Recursos de outro consultório respondem 404 para não revelar sua existência.
 */

/** Perfis com acesso a conteúdo clínico */
export const CLINICAL_ROLES: UserRole[] = [UserRole.PSICOLOGO_TITULAR, UserRole.SUPERVISOR_CLINICO];

function isPracticeStaff(user: SafeUser): boolean {
  return PRACTICE_STAFF_ROLES.includes(user.role) && !!user.therapistId;
}

export async function canAccessPatient(user: SafeUser, patientId: string): Promise<boolean> {
  const patient = await PatientRepository.findById(patientId);
  if (!patient) return false;
  // Paciente: registro principal da conta ou registros criados ao agendar pelo portal
  if (user.role === UserRole.PACIENTE) return user.patientId === patientId || patient.linkedUserId === user.id;
  return isPracticeStaff(user) && patient.therapistId === user.therapistId;
}

export async function canAccessAppointment(user: SafeUser, appointmentId: string): Promise<boolean> {
  const appointment = await AppointmentRepository.findById(appointmentId);
  if (!appointment) return false;
  if (user.role === UserRole.PACIENTE) return canAccessPatient(user, appointment.patientId);
  return isPracticeStaff(user) && appointment.therapistId === user.therapistId;
}

export function canAccessClinicalRecord(user: SafeUser, recordId: string): boolean {
  const record = db.clinicalRecords.get(recordId);
  if (!record) return false;
  return CLINICAL_ROLES.includes(user.role) && !!user.therapistId && record.therapistId === user.therapistId;
}

function notFound(c: Context, resource: string) {
  return c.json({ success: false, error: `${resource} não encontrado.` }, 404);
}

/**
 * Exige posse do paciente identificado pelo parâmetro de rota `param`.
 * `allowDpo` libera o Admin/DPO para atender direitos do titular (LGPD Art. 18) sem ler conteúdo clínico.
 */
export function requirePatientAccess(param = 'id', options: { allowDpo?: boolean } = {}): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get('user');
    const patientId = c.req.param(param) ?? '';
    const dpoAccess = options.allowDpo && user.role === UserRole.ADMIN && !!(await PatientRepository.findById(patientId));
    if (!dpoAccess && !(await canAccessPatient(user, patientId))) return notFound(c, 'Paciente');
    await next();
  };
}

/** Exige posse da consulta identificada pelo parâmetro de rota `param` */
export function requireAppointmentAccess(param = 'id'): MiddlewareHandler {
  return async (c, next) => {
    if (!(await canAccessAppointment(c.get('user'), c.req.param(param) ?? ''))) return notFound(c, 'Consulta');
    await next();
  };
}

/** Exige posse do prontuário identificado pelo parâmetro de rota `param` */
export function requireClinicalRecordAccess(param = 'id'): MiddlewareHandler {
  return async (c, next) => {
    if (!canAccessClinicalRecord(c.get('user'), c.req.param(param) ?? '')) return notFound(c, 'Prontuário');
    await next();
  };
}

/** Entidade clínica vinculada a um paciente e/ou consulta */
interface OwnedEntity {
  patientId?: string;
  appointmentId?: string;
}

export async function canAccessEntity(user: SafeUser, entity: OwnedEntity | undefined): Promise<boolean> {
  if (!entity) return false;
  if (entity.patientId) return canAccessPatient(user, entity.patientId);
  if (entity.appointmentId) return canAccessAppointment(user, entity.appointmentId);
  return false;
}

/**
 * Exige posse da entidade identificada pelo parâmetro de rota `param`,
 * resolvida por `lookup` e verificada pelo paciente ou consulta a que pertence.
 */
export function requireOwnedResource(
  lookup: (id: string) => OwnedEntity | undefined,
  label: string,
  param = 'id'
): MiddlewareHandler {
  return async (c, next) => {
    if (!(await canAccessEntity(c.get('user'), lookup(c.req.param(param) ?? '')))) return notFound(c, label);
    await next();
  };
}

/**
 * Exige posse do `patientId`/`appointmentId` informados no corpo JSON, quando presentes.
 * O Hono reaproveita o corpo já interpretado, então o handler pode lê-lo novamente.
 */
export function requireBodyOwnership(options: { allowDpo?: boolean } = {}): MiddlewareHandler {
  return async (c, next) => {
    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return await next();
    }
    const user = c.get('user');
    const dpoAccess = options.allowDpo && user.role === UserRole.ADMIN;
    // IDs vazios ficam para a validação de campos obrigatórios do handler (400)
    if (typeof body?.patientId === 'string' && body.patientId) {
      const allowed = dpoAccess
        ? !!(await PatientRepository.findById(body.patientId))
        : await canAccessPatient(user, body.patientId);
      if (!allowed) return notFound(c, 'Paciente');
    }
    if (typeof body?.appointmentId === 'string' && body.appointmentId && !(await canAccessAppointment(user, body.appointmentId))) return notFound(c, 'Consulta');
    await next();
  };
}
