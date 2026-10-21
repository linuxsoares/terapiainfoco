import { describe, it, expect, beforeEach } from 'bun:test';
import { AppointmentService } from '../src/services/appointmentService';
import { ReminderService } from '../src/services/reminderService';
import { PatientService } from '../src/services/patientService';
import { db } from '../src/db/memoryDb';
import { 
  AppointmentStatus, 
  RecurrenceFrequency, 
  ReminderChannel, 
  ReminderDeliveryStatus,
  type CreateAppointmentDTO 
} from '@terapiainfoco/shared';

describe('Evolução de Produto RFC-001: Agendamento Recorrente & Lembretes Multicanal (§3.1)', () => {
  const therapistId = 'therapist-001';
  let patientId: string;

  beforeEach(async () => {
    // Reset e seed de paciente de teste
    const patient = await PatientService.createPatient(therapistId, {
      name: 'Camila Rodrigues Alves',
      email: 'camila.rodrigues@email.com',
      phone: '11999887766',
      cpf: '456.789.012-33',
      consentTranscriptionSigned: true
    }, {
      actorId: therapistId,
      ipAddress: '127.0.0.1'
    });
    patientId = patient.id;
  });

  describe('1. Agendamentos Recorrentes & Séries Clínicas', () => {
    it('deve criar uma série semanal de 4 teleconsultas com datas consecutivas de 7 em 7 dias', async () => {
      // Começando numa segunda-feira às 14:00 daqui a 30 dias
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 30);
      startDate.setHours(14, 0, 0, 0);
      const endDate = new Date(startDate.getTime() + 50 * 60 * 1000); // 50 minutos

      const dto: CreateAppointmentDTO = {
        patientId,
        scheduledStart: startDate.toISOString(),
        scheduledEnd: endDate.toISOString(),
        bufferMinutes: 10,
        recurrence: {
          frequency: RecurrenceFrequency.WEEKLY,
          count: 4
        }
      };

      const result = await AppointmentService.createRecurrentAppointments(therapistId, dto, {
        actorId: therapistId,
        ipAddress: '127.0.0.1'
      });

      expect(result.success).toBe(true);
      expect(result.requestedCount).toBe(4);
      expect(result.createdAppointments.length).toBe(4);
      expect(result.seriesId).toBeDefined();
      expect(result.seriesId.startsWith('series_')).toBe(true);
      expect(result.frequency).toBe(RecurrenceFrequency.WEEKLY);

      // Validação das sequências e espaçamento
      for (let i = 0; i < result.createdAppointments.length; i++) {
        const appt = result.createdAppointments[i];
        expect(appt.seriesId).toBe(result.seriesId);
        expect(appt.sequenceNumber).toBe(i + 1);
        expect(appt.totalInSeries).toBe(4);
        expect(appt.recurrenceFrequency).toBe(RecurrenceFrequency.WEEKLY);
        expect(appt.status).toBe(AppointmentStatus.CONFIRMADA);
        expect(appt.roomUrl).toContain(`sala=${appt.id}`);

        if (i > 0) {
          const prevAppt = result.createdAppointments[i - 1];
          const diffDays = Math.round(
            (new Date(appt.scheduledStart).getTime() - new Date(prevAppt.scheduledStart).getTime()) / (1000 * 60 * 60 * 24)
          );
          expect(diffDays).toBe(7); // Exatos 7 dias de intervalo semanal
        }
      }
    });

    it('deve suportar série quinzenal (BIWEEKLY) com espaçamento de 14 dias', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 60);
      startDate.setHours(10, 0, 0, 0);
      const endDate = new Date(startDate.getTime() + 50 * 60 * 1000);

      const dto: CreateAppointmentDTO = {
        patientId,
        scheduledStart: startDate.toISOString(),
        scheduledEnd: endDate.toISOString(),
        bufferMinutes: 10,
        recurrence: {
          frequency: RecurrenceFrequency.BIWEEKLY,
          count: 3
        }
      };

      const result = await AppointmentService.createRecurrentAppointments(therapistId, dto, {
        actorId: therapistId,
        ipAddress: '127.0.0.1'
      });

      expect(result.success).toBe(true);
      expect(result.createdAppointments.length).toBe(3);

      const diffDays1 = Math.round(
        (new Date(result.createdAppointments[1].scheduledStart).getTime() - new Date(result.createdAppointments[0].scheduledStart).getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(diffDays1).toBe(14);
    });

    it('deve cancelar em lote todas as consultas futuras de uma série', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 10);
      startDate.setHours(16, 0, 0, 0);
      const endDate = new Date(startDate.getTime() + 50 * 60 * 1000);

      const dto: CreateAppointmentDTO = {
        patientId,
        scheduledStart: startDate.toISOString(),
        scheduledEnd: endDate.toISOString(),
        bufferMinutes: 10,
        recurrence: {
          frequency: RecurrenceFrequency.WEEKLY,
          count: 3
        }
      };

      const series = await AppointmentService.createRecurrentAppointments(therapistId, dto, {
        actorId: therapistId,
        ipAddress: '127.0.0.1'
      });

      const cancelResult = AppointmentService.cancelSeries(series.seriesId, {
        actorId: therapistId,
        ipAddress: '127.0.0.1'
      });

      expect(cancelResult.canceledCount).toBe(3);

      // Verifica status de cada consulta
      for (const app of series.createdAppointments) {
        const stored = db.appointments.get(app.id);
        expect(stored?.status).toBe(AppointmentStatus.CANCELADA_PELO_TERAPEUTA);
      }
    });
  });

  describe('2. Notificações & Lembretes Multicanal (WhatsApp/Email)', () => {
    let appointmentId: string;
    let offsetDays = 120;

    beforeEach(async () => {
      offsetDays += 2;
      const start = new Date();
      start.setDate(start.getDate() + offsetDays);
      start.setHours(15, 0, 0, 0);
      const end = new Date(start.getTime() + 50 * 60 * 1000);

      const appt = await AppointmentService.createAppointment(therapistId, {
        patientId,
        scheduledStart: start.toISOString(),
        scheduledEnd: end.toISOString(),
        bufferMinutes: 10
      }, {
        actorId: therapistId,
        ipAddress: '127.0.0.1'
      });
      appointmentId = appt.id;
    });

    it('deve gerar prévia da mensagem de WhatsApp contendo link da sala e orientações éticas do CFP', async () => {
      const preview = await ReminderService.previewReminder(appointmentId, ReminderChannel.WHATSAPP);

      expect(preview.patientName).toBe('Camila Rodrigues Alves');
      expect(preview.recipientPhone).toBe('11999887766');
      expect(preview.renderedMessage).toContain('Camila Rodrigues Alves');
      expect(preview.renderedMessage).toContain('teleconsulta psicológica');
      expect(preview.renderedMessage).toContain('?sala=');
      expect(preview.renderedMessage).not.toContain('meet.google.com');
      expect(preview.renderedMessage).toContain('CFP 011/2018');
      expect(preview.whatsappDirectUrl).toBeDefined();
      expect(preview.whatsappDirectUrl).toContain('wa.me/5511999887766');
    });

    it('deve gerar prévia do e-mail com estrutura formal e recomendações de sigilo', async () => {
      const preview = await ReminderService.previewReminder(appointmentId, ReminderChannel.EMAIL);

      expect(preview.renderedMessage).toContain('Prezado(a) Camila Rodrigues Alves');
      expect(preview.renderedMessage).toContain('DETALHES DO ATENDIMENTO');
      expect(preview.renderedMessage).toContain('sala de espera virtual (knocking)');
    });

    it('deve disparar lembrete com sucesso, atualizar a consulta e gravar trilha WORM', async () => {
      const res = await ReminderService.sendAppointmentReminder({
        appointmentId,
        channel: ReminderChannel.WHATSAPP,
        customMessage: 'Por favor, teste seu microfone com antecedência.'
      }, {
        actorId: therapistId,
        ipAddress: '127.0.0.1',
        userAgent: 'Jest/Bun-Test'
      });

      expect(res.success).toBe(true);
      expect(res.reminderId).toBeDefined();
      expect(res.status).toBe(ReminderDeliveryStatus.SENT);
      expect(res.renderedMessage).toContain('Por favor, teste seu microfone com antecedência.');
      expect(res.auditWormId).toBeDefined();

      // Consulta deve ter status atualizado
      const appt = db.appointments.get(appointmentId);
      expect(appt?.reminderStatus).toBe(ReminderDeliveryStatus.SENT);
      expect(appt?.lastReminderSentAt).toBeDefined();

      // Histórico de lembretes deve conter o envio
      const reminders = ReminderService.getAppointmentReminders(appointmentId);
      expect(reminders.length).toBeGreaterThanOrEqual(1);
      expect(reminders[0].id).toBe(res.reminderId);
      expect(reminders[0].channel).toBe(ReminderChannel.WHATSAPP);
    });

    it('deve falhar se a consulta informada não existir', async () => {
      expect(
        ReminderService.sendAppointmentReminder({
          appointmentId: 'non-existing-appointment-id',
          channel: ReminderChannel.WHATSAPP
        }, {
          actorId: therapistId,
          ipAddress: '127.0.0.1'
        })
      ).rejects.toThrow('Consulta informada não encontrada');
    });
  });
});
