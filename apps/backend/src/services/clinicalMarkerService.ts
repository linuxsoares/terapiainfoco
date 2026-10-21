import { randomUUID } from 'crypto';
import { 
  type ClinicalSessionMarker, 
  type StoredClinicalSessionMarker,
  type CreateClinicalMarkerDTO,
  type UpdateClinicalMarkerDTO,
  type ExportMarkersToSoapProposalResponse,
  ClinicalMarkerCategory,
  ClinicalMarkerRelevance,
  AuditAction,
  AuditResourceType
} from '@terapiainfoco/shared';
import { db } from '../db/memoryDb';
import { encryptField, decryptField } from './cryptoContext';
import { AuditService } from './auditService';

import { AppointmentRepository } from '../repositories/appointmentRepository';
export class ClinicalMarkerService {
  /**
   * Sugere quadrante SOAP padrão conforme a categoria clínica do marcador (RFC-001 §3.3)
   */
  private static inferSoapQuadrant(category: ClinicalMarkerCategory): 'SUBJECTIVE' | 'OBJECTIVE' | 'ASSESSMENT' | 'PLAN' {
    switch (category) {
      case ClinicalMarkerCategory.SOMATIC_COMPLAINT:
        return 'SUBJECTIVE';
      case ClinicalMarkerCategory.AFFECT_SHIFT:
        return 'OBJECTIVE';
      case ClinicalMarkerCategory.INSIGHT:
      case ClinicalMarkerCategory.CRISIS_ALERT:
      case ClinicalMarkerCategory.CORE_BELIEF:
      case ClinicalMarkerCategory.RESISTANCE:
        return 'ASSESSMENT';
      case ClinicalMarkerCategory.THERAPEUTIC_CONTRACT:
      default:
        return 'PLAN';
    }
  }

  /**
   * Cria um novo marcador clínico na sessão (RFC-001 §3.3)
   */
  static async createMarker(
    dto: CreateClinicalMarkerDTO,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): Promise<ClinicalSessionMarker> {
    const appointment = await AppointmentRepository.findById(dto.appointmentId);
    if (!appointment) {
      throw new Error(`Consulta ${dto.appointmentId} não encontrada para vincular marcador.`);
    }

    const id = `marker-${randomUUID()}`;
    const suggestedSoapQuadrant = dto.suggestedSoapQuadrant || this.inferSoapQuadrant(dto.category);

    const stored: StoredClinicalSessionMarker = {
      id,
      appointmentId: dto.appointmentId,
      patientId: appointment.patientId,
      therapistId: appointment.therapistId,
      timestampMs: dto.timestampMs,
      timeFormatted: dto.timeFormatted || this.formatMs(dto.timestampMs),
      category: dto.category,
      relevance: dto.relevance || ClinicalMarkerRelevance.MEDIUM,
      encryptedNote: encryptField(dto.note.trim()),
      utteranceIndex: dto.utteranceIndex,
      suggestedSoapQuadrant,
      createdAt: new Date()
    };

    db.clinicalMarkers.set(id, stored);

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.CLINICAL_MARKER,
      resourceId: id,
      action: AuditAction.CLINICAL_MARKER_CREATED,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return {
      id: stored.id,
      appointmentId: stored.appointmentId,
      patientId: stored.patientId,
      therapistId: stored.therapistId,
      timestampMs: stored.timestampMs,
      timeFormatted: stored.timeFormatted,
      category: stored.category,
      relevance: stored.relevance,
      note: dto.note.trim(),
      utteranceIndex: stored.utteranceIndex,
      suggestedSoapQuadrant: stored.suggestedSoapQuadrant,
      createdAt: stored.createdAt
    };
  }

  /**
   * Obtém marcadores de uma consulta, decifrando as notas clínicas
   */
  static getMarkersByAppointment(appointmentId: string): ClinicalSessionMarker[] {
    const list: ClinicalSessionMarker[] = [];
    for (const m of db.clinicalMarkers.values()) {
      if (m.appointmentId === appointmentId) {
        list.push({
          id: m.id,
          appointmentId: m.appointmentId,
          patientId: m.patientId,
          therapistId: m.therapistId,
          timestampMs: m.timestampMs,
          timeFormatted: m.timeFormatted,
          category: m.category,
          relevance: m.relevance,
          note: decryptField(m.encryptedNote),
          utteranceIndex: m.utteranceIndex,
          suggestedSoapQuadrant: m.suggestedSoapQuadrant,
          createdAt: m.createdAt
        });
      }
    }

    // Ordenação cronológica pelo offset da sessão
    return list.sort((a, b) => a.timestampMs - b.timestampMs);
  }

  /**
   * Atualiza categoria, relevância ou anotação do marcador
   */
  static updateMarker(
    markerId: string,
    dto: UpdateClinicalMarkerDTO,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): ClinicalSessionMarker {
    const marker = db.clinicalMarkers.get(markerId);
    if (!marker) {
      throw new Error(`Marcador clínico ${markerId} não encontrado.`);
    }

    if (dto.category) marker.category = dto.category;
    if (dto.relevance) marker.relevance = dto.relevance;
    if (dto.suggestedSoapQuadrant) marker.suggestedSoapQuadrant = dto.suggestedSoapQuadrant;
    if (dto.note !== undefined) {
      marker.encryptedNote = encryptField(dto.note.trim());
    }

    db.clinicalMarkers.set(markerId, marker);

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.CLINICAL_MARKER,
      resourceId: markerId,
      action: AuditAction.CLINICAL_MARKER_CREATED, // Atualização registrada
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return {
      id: marker.id,
      appointmentId: marker.appointmentId,
      patientId: marker.patientId,
      therapistId: marker.therapistId,
      timestampMs: marker.timestampMs,
      timeFormatted: marker.timeFormatted,
      category: marker.category,
      relevance: marker.relevance,
      note: decryptField(marker.encryptedNote),
      utteranceIndex: marker.utteranceIndex,
      suggestedSoapQuadrant: marker.suggestedSoapQuadrant,
      createdAt: marker.createdAt
    };
  }

  /**
   * Remove marcador clínico
   */
  static deleteMarker(
    markerId: string,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): { success: boolean; markerId: string } {
    const marker = db.clinicalMarkers.get(markerId);
    if (!marker) {
      throw new Error(`Marcador clínico ${markerId} não encontrado.`);
    }

    db.clinicalMarkers.delete(markerId);

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.CLINICAL_MARKER,
      resourceId: markerId,
      action: AuditAction.CLINICAL_MARKER_DELETED,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return { success: true, markerId };
  }

  /**
   * Consolida marcadores da sessão estruturando uma proposta preliminar de SOAP (RFC-001 §3.3)
   */
  static exportToSoapProposal(appointmentId: string): ExportMarkersToSoapProposalResponse {
    const markers = this.getMarkersByAppointment(appointmentId);

    const proposal = {
      subjective: [] as string[],
      objective: [] as string[],
      assessment: [] as string[],
      plan: [] as string[]
    };

    for (const m of markers) {
      const line = `[${m.timeFormatted}] [${m.category}]: ${m.note}`;
      const quadrant = m.suggestedSoapQuadrant || this.inferSoapQuadrant(m.category);

      switch (quadrant) {
        case 'SUBJECTIVE':
          proposal.subjective.push(line);
          break;
        case 'OBJECTIVE':
          proposal.objective.push(line);
          break;
        case 'ASSESSMENT':
          proposal.assessment.push(line);
          break;
        case 'PLAN':
          proposal.plan.push(line);
          break;
      }
    }

    return {
      success: true,
      appointmentId,
      totalMarkersCount: markers.length,
      suggestedSoap: proposal
    };
  }

  private static formatMs(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
}
