import { randomBytes } from 'node:crypto';
import {
  AuditAction,
  AuditResourceType,
  UserRole,
  type AdminLead,
  type StoredLead
} from '@terapiainfoco/shared';
import { db } from '../db/memoryDb';
import { decryptField } from './cryptoContext';
import { authService } from './authService';
import { AuditService } from './auditService';

/** Erro de triagem do Admin (vira 400 na rota) */
export class LeadInputError extends Error {}

const UF_PATTERN = /^[A-Z]{2}$/;

export function toAdminLead(lead: StoredLead): AdminLead {
  return {
    id: lead.id,
    name: lead.name,
    email: decryptField(lead.encryptedEmail),
    whatsapp: lead.encryptedWhatsapp ? decryptField(lead.encryptedWhatsapp) : undefined,
    crp: lead.crp,
    practiceType: lead.practiceType,
    createdAt: lead.createdAt,
    status: lead.status ?? 'PENDING',
    handledAt: lead.handledAt
  };
}

function pendingLead(leadId: string): StoredLead {
  const lead = db.leads.get(leadId);
  if (!lead) throw new LeadInputError('Pedido não encontrado.');
  if ((lead.status ?? 'PENDING') !== 'PENDING') throw new LeadInputError('Este pedido já foi analisado.');
  return lead;
}

export const LeadService = {
  list(): AdminLead[] {
    return Array.from(db.leads.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(toAdminLead);
  },

  /**
   * Cria a conta de psicólogo titular com os dados do pedido. A senha inicial é mostrada uma vez
   * ao Admin e a troca é exigida no primeiro acesso; o CRP segue para a Verificação de CRP.
   */
  async approve(
    leadId: string,
    crpRegion: string,
    context: { actorId: string; ipAddress: string }
  ): Promise<{ lead: AdminLead; temporaryPassword: string }> {
    const lead = pendingLead(leadId);
    const region = crpRegion?.trim().toUpperCase();
    if (!UF_PATTERN.test(region ?? '')) throw new LeadInputError('Informe a UF do CRP (ex.: SP).');

    const temporaryPassword = randomBytes(12).toString('base64url');
    let created;
    try {
      created = await authService.register(
        {
          name: lead.name,
          email: decryptField(lead.encryptedEmail),
          password: temporaryPassword,
          role: UserRole.PSICOLOGO_TITULAR,
          crp: lead.crp,
          crpRegion: region,
          phone: lead.encryptedWhatsapp ? decryptField(lead.encryptedWhatsapp) : undefined
        },
        context.ipAddress,
        { actorId: context.actorId, mustChangePassword: true }
      );
    } catch (err: any) {
      throw new LeadInputError(err.message || 'Não foi possível criar a conta.');
    }

    lead.status = 'APPROVED';
    lead.handledAt = new Date().toISOString();
    lead.userId = created.id;
    db.leads.set(lead.id, lead);
    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.USER,
      resourceId: created.id,
      action: AuditAction.LEAD_APPROVED,
      ipAddress: context.ipAddress,
      details: { leadId: lead.id }
    });
    return { lead: toAdminLead(lead), temporaryPassword };
  },

  reject(leadId: string, context: { actorId: string; ipAddress: string }): AdminLead {
    const lead = pendingLead(leadId);
    lead.status = 'REJECTED';
    lead.handledAt = new Date().toISOString();
    db.leads.set(lead.id, lead);
    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.USER,
      resourceId: lead.id,
      action: AuditAction.LEAD_REJECTED,
      ipAddress: context.ipAddress
    });
    return toAdminLead(lead);
  }
};
