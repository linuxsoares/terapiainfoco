import { config } from '../config';
import type { DecryptedAppointment, StoredAppointment } from '@terapiainfoco/shared';

/** Link da sala de teleconsulta própria; o acesso exige login e posse da consulta */
export function teleconsultationRoomUrl(appointmentId: string): string {
  return `${config.publicAppUrl}/?sala=${encodeURIComponent(appointmentId)}`;
}

/**
 * Visão da consulta para a API. Campos listados explicitamente: registros antigos do
 * entity_store podem carregar campos legados (ex.: link cifrado do Google Meet).
 */
export function toDecryptedAppointment(app: StoredAppointment): DecryptedAppointment {
  return {
    id: app.id,
    therapistId: app.therapistId,
    patientId: app.patientId,
    scheduledStart: app.scheduledStart,
    scheduledEnd: app.scheduledEnd,
    status: app.status,
    seriesId: app.seriesId,
    sequenceNumber: app.sequenceNumber,
    totalInSeries: app.totalInSeries,
    recurrenceFrequency: app.recurrenceFrequency,
    reminderStatus: app.reminderStatus,
    lastReminderSentAt: app.lastReminderSentAt,
    patientConfirmedAt: app.patientConfirmedAt,
    feeCents: app.feeCents,
    paymentStatus: app.paymentStatus,
    paidAt: app.paidAt,
    paymentMethod: app.paymentMethod,
    receitaSaudeIssuedAt: app.receitaSaudeIssuedAt,
    createdAt: app.createdAt,
    roomUrl: teleconsultationRoomUrl(app.id)
  };
}
