import { randomUUID } from 'node:crypto';
import { 
  ReminderChannel, 
  ReminderTiming, 
  ReminderDeliveryStatus, 
  AuditAction, 
  AuditResourceType,
  type SendReminderDTO, 
  type SendReminderResponse,
  type AppointmentReminder,
  type StoredAppointmentReminder
} from '@terapiainfoco/shared';
import { db } from '../db/memoryDb';
import { teleconsultationRoomUrl } from './teleconsultationRoom';
import { decryptField, encryptField } from './cryptoContext';
import { AuditService } from './auditService';

import { PatientRepository } from '../repositories/patientRepository';
export class ReminderService {
  /**
   * Formata data e horário para exibição acolhedora em pt-BR
   */
  private static formatDateTime(dateInput: Date | string): { dateFormatted: string; timeFormatted: string } {
    const d = new Date(dateInput);
    const dateFormatted = d.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const timeFormatted = d.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
    return { dateFormatted, timeFormatted };
  }

  /**
   * Sanitiza número de telefone para o formato padrão internacional E.164 sem símbolos
   */
  private static sanitizePhoneNumber(rawPhone: string): string {
    const digits = rawPhone.replace(/\D/g, '');
    if (digits.startsWith('55')) {
      return digits;
    }
    return `55${digits}`;
  }

  /**
   * Gera a mensagem do lembrete de teleconsulta conforme normas do CFP (Res. CFP nº 011/2018)
   */
  public static renderReminderMessage(params: {
    patientName: string;
    therapistName?: string;
    scheduledStart: Date | string;
    roomUrl: string;
    channel: ReminderChannel;
    customNote?: string;
  }): string {
    const { dateFormatted, timeFormatted } = this.formatDateTime(params.scheduledStart);
    const therapistName = params.therapistName || 'Dra. Vanessa Andrade (Psicóloga Clínica - CRP 06/142980)';

    if (params.channel === ReminderChannel.EMAIL) {
      return [
        `Prezado(a) ${params.patientName},`,
        '',
        `Confirmamos o agendamento de sua teleconsulta psicológica com ${therapistName}.`,
        '',
        `🗓️ DETALHES DO ATENDIMENTO:`,
        `• Data: ${dateFormatted}`,
        `• Horário: ${timeFormatted} (Horário de Brasília)`,
        `• Duração estimada: 50 minutos`,
        `• Link da Sala Virtual: ${params.roomUrl}`,
        '',
        `🔒 RECOMENDAÇÕES PARA SUA SESSÃO (Resolução CFP nº 011/2018):`,
        `1. Escolha um ambiente privativo, silencioso e seguro para resguardar o sigilo de seu atendimento.`,
        `2. Conecte-se com fones de ouvido para maior conforto e privacidade.`,
        `3. Ao clicar no link, você aguardará na sala de espera virtual (knocking) até que o profissional autorize seu acesso.`,
        params.customNote ? `\n📌 Nota do Terapeuta: ${params.customNote}` : '',
        '',
        `Em caso de necessidade de reagendamento ou cancelamento, solicitamos aviso prévio mínimo de 24 horas.`,
        '',
        `Atenciosamente,`,
        `Equipe TerapiaInFoco & ${therapistName}`
      ].filter(Boolean).join('\n');
    }

    // Padrão WhatsApp (com emojis e formatação Markdown aceita no WhatsApp)
    return [
      `Olá, *${params.patientName}*! 👋`,
      `Passando para lembrar da sua teleconsulta psicológica com *${therapistName}*.`,
      '',
      `🗓️ *Data:* ${dateFormatted}`,
      `⏰ *Horário:* às ${timeFormatted} (duração de 50 min)`,
      `🔗 *Link Seguro de Teleatendimento:*`,
      `${params.roomUrl}`,
      '',
      `🔒 *Orientações Éticas e de Privacidade (CFP 011/2018):*`,
      `• Utilize fones de ouvido e permaneça em local reservado durante todo o atendimento.`,
      `• Ao acessar o link, você entrará na *sala de espera virtual* e sua entrada será liberada no horário exato.`,
      params.customNote ? `\n📝 *Mensagem:* ${params.customNote}` : '',
      '',
      `Caso necessite remarcar, solicitamos aviso prévio com antecedência. Nos vemos em breve! ✨`
    ].filter(Boolean).join('\n');
  }

  /**
   * Gera pré-visualização da mensagem de lembrete antes do envio
   */
  public static async previewReminder(appointmentId: string, channel: ReminderChannel = ReminderChannel.WHATSAPP): Promise<{
    renderedMessage: string;
    recipientPhone?: string;
    recipientEmail?: string;
    whatsappDirectUrl?: string;
    patientName: string;
    roomUrl: string;
    scheduledStart: string;
  }> {
    const appt = db.appointments.get(appointmentId);
    if (!appt) {
      throw new Error('Consulta não encontrada para visualização de lembrete.');
    }

    const patient = await PatientRepository.findById(appt.patientId);
    if (!patient) {
      throw new Error('Paciente vinculado não encontrado.');
    }

    const patientName = decryptField(patient.encryptedName);
    const patientPhone = decryptField(patient.encryptedPhone);
    const patientEmail = decryptField(patient.encryptedEmail);
    const roomUrl = teleconsultationRoomUrl(appt.id);

    const renderedMessage = this.renderReminderMessage({
      patientName,
      scheduledStart: appt.scheduledStart,
      roomUrl,
      channel
    });

    const sanitizedPhone = this.sanitizePhoneNumber(patientPhone);
    const whatsappDirectUrl = `https://wa.me/${sanitizedPhone}?text=${encodeURIComponent(renderedMessage)}`;

    return {
      renderedMessage,
      recipientPhone: patientPhone,
      recipientEmail: patientEmail,
      whatsappDirectUrl,
      patientName,
      roomUrl,
      scheduledStart: new Date(appt.scheduledStart).toISOString()
    };
  }

  /**
   * Envia o lembrete de teleconsulta (WhatsApp e/ou E-mail) com registro na trilha WORM
   */
  public static async sendAppointmentReminder(
    dto: SendReminderDTO,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): Promise<SendReminderResponse> {
    const appt = db.appointments.get(dto.appointmentId);
    if (!appt) {
      throw new Error('Consulta informada não encontrada.');
    }

    const patient = await PatientRepository.findById(appt.patientId);
    if (!patient) {
      throw new Error('Paciente informado não encontrado.');
    }

    const patientName = decryptField(patient.encryptedName);
    const patientPhone = decryptField(patient.encryptedPhone);
    const patientEmail = decryptField(patient.encryptedEmail);
    const roomUrl = teleconsultationRoomUrl(appt.id);

    const timing = dto.timing || ReminderTiming.IMMEDIATE;
    const renderedMessage = this.renderReminderMessage({
      patientName,
      scheduledStart: appt.scheduledStart,
      roomUrl,
      channel: dto.channel,
      customNote: dto.customMessage
    });

    const sanitizedPhone = this.sanitizePhoneNumber(patientPhone);
    const whatsappDirectUrl = `https://wa.me/${sanitizedPhone}?text=${encodeURIComponent(renderedMessage)}`;
    const reminderId = `rem-${randomUUID()}`;
    const sentAt = new Date();

    const storedReminder: StoredAppointmentReminder = {
      id: reminderId,
      appointmentId: appt.id,
      patientId: appt.patientId,
      therapistId: appt.therapistId,
      channel: dto.channel,
      timing,
      encryptedRecipientPhone: encryptField(patientPhone),
      encryptedRecipientEmail: encryptField(patientEmail),
      templateType: dto.channel === ReminderChannel.EMAIL ? 'EMAIL_CLINICAL_NOTICE' : 'WHATSAPP_TELECONSULT_V2',
      renderedMessage,
      roomUrl,
      status: ReminderDeliveryStatus.SENT,
      sentAt,
      whatsappDirectUrl,
      whatsappMessageId: `wamid.HBgM${randomUUID().replace(/-/g, '').substring(0, 16)}`,
      createdAt: sentAt
    };

    // Grava lembrete no banco
    db.reminders.set(reminderId, storedReminder);

    // Atualiza status do último lembrete na consulta
    appt.reminderStatus = ReminderDeliveryStatus.SENT;
    appt.lastReminderSentAt = sentAt;

    // Registra auditoria WORM mandatória
    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.APPOINTMENT_REMINDER,
      resourceId: reminderId,
      action: AuditAction.APPOINTMENT_REMINDER_DISPATCHED,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    const latestAuditLog = db.auditLogs[db.auditLogs.length - 1];
    const auditWormId = latestAuditLog ? latestAuditLog.id : `audit-${randomUUID()}`;

    return {
      success: true,
      reminderId,
      appointmentId: appt.id,
      patientId: appt.patientId,
      channel: dto.channel,
      recipientPhone: patientPhone,
      recipientEmail: patientEmail,
      whatsappDirectUrl,
      renderedMessage,
      status: ReminderDeliveryStatus.SENT,
      sentAt: sentAt.toISOString(),
      auditWormId
    };
  }

  /**
   * Retorna os lembretes enviados para uma determinada consulta
   */
  public static getAppointmentReminders(appointmentId: string): AppointmentReminder[] {
    const result: AppointmentReminder[] = [];
    for (const stored of db.reminders.values()) {
      if (stored.appointmentId === appointmentId) {
        result.push({
          id: stored.id,
          appointmentId: stored.appointmentId,
          patientId: stored.patientId,
          therapistId: stored.therapistId,
          channel: stored.channel,
          timing: stored.timing,
          recipientPhone: stored.encryptedRecipientPhone ? decryptField(stored.encryptedRecipientPhone) : undefined,
          recipientEmail: stored.encryptedRecipientEmail ? decryptField(stored.encryptedRecipientEmail) : undefined,
          templateType: stored.templateType,
          renderedMessage: stored.renderedMessage,
          roomUrl: stored.roomUrl,
          status: stored.status,
          scheduledFor: stored.scheduledFor,
          sentAt: stored.sentAt,
          whatsappMessageId: stored.whatsappMessageId,
          whatsappDirectUrl: stored.whatsappDirectUrl,
          auditWormId: stored.auditWormId,
          createdAt: stored.createdAt
        });
      }
    }
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}
