import type {
  CreatePatientDTO,
  DecryptedPatient,
  CreateAppointmentDTO,
  DecryptedAppointment,
  AppointmentStatus,
  UpdateSoapNoteDTO,
  DecryptedClinicalRecord,
  AuditLog
} from '@terapiainfoco/shared';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    }
  });

  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.error || 'Erro na requisição');
  }

  return data;
}

export const api = {
  // 1. Pacientes (FLE & Blind Index)
  async createPatient(dto: CreatePatientDTO, therapistId = '00000000-0000-0000-0000-000000000001'): Promise<DecryptedPatient> {
    const res = await request<{ success: boolean; patient: DecryptedPatient }>('/patients', {
      method: 'POST',
      body: JSON.stringify({ ...dto, therapistId })
    });
    return res.patient;
  },

  async getPatient(id: string): Promise<DecryptedPatient> {
    const res = await request<{ success: boolean; patient: DecryptedPatient }>(`/patients/${id}`);
    return res.patient;
  },

  async searchPatientByCpf(cpf: string): Promise<DecryptedPatient> {
    const res = await request<{ success: boolean; patient: DecryptedPatient }>(`/patients/search/cpf?cpf=${encodeURIComponent(cpf)}`);
    return res.patient;
  },

  async quarantinePatient(id: string): Promise<string> {
    const res = await request<{ success: boolean; message: string }>(`/patients/${id}/quarantine`, {
      method: 'POST'
    });
    return res.message;
  },

  // 2. Agenda & Sessões (RFC §3.1, §3.2)
  async getAppointments(therapistId = '00000000-0000-0000-0000-000000000001'): Promise<DecryptedAppointment[]> {
    const res = await request<{ success: boolean; appointments: DecryptedAppointment[] }>(`/appointments/therapist/${therapistId}`);
    return res.appointments;
  },

  async createAppointment(dto: CreateAppointmentDTO, therapistId = '00000000-0000-0000-0000-000000000001'): Promise<DecryptedAppointment> {
    const res = await request<{ success: boolean; appointment: DecryptedAppointment }>('/appointments', {
      method: 'POST',
      body: JSON.stringify({ ...dto, therapistId })
    });
    return res.appointment;
  },

  async updateAppointmentStatus(appointmentId: string, status: AppointmentStatus): Promise<DecryptedAppointment> {
    const res = await request<{ success: boolean; appointment: DecryptedAppointment }>(`/appointments/${appointmentId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    return res.appointment;
  },

  // 3. Prontuários & SOAP (RFC §3.3, §3.4)
  async saveSoapDraft(data: UpdateSoapNoteDTO & {
    appointmentId: string;
    patientId: string;
    sessionNumber: number;
    therapistId?: string;
  }): Promise<DecryptedClinicalRecord> {
    const res = await request<{ success: boolean; record: DecryptedClinicalRecord }>('/clinical-records/draft', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return res.record;
  },

  async signClinicalRecord(recordId: string, confirmedHumanReview: boolean): Promise<DecryptedClinicalRecord> {
    const res = await request<{ success: boolean; record: DecryptedClinicalRecord }>('/clinical-records/sign', {
      method: 'POST',
      body: JSON.stringify({ recordId, confirmedHumanReview })
    });
    return res.record;
  },

  async getClinicalRecord(id: string): Promise<DecryptedClinicalRecord> {
    const res = await request<{ success: boolean; record: DecryptedClinicalRecord }>(`/clinical-records/${id}`);
    return res.record;
  },

  // 4. Auditoria WORM (RFC §4.4)
  async getAuditLogs(): Promise<AuditLog[]> {
    const res = await request<{ success: boolean; logs: AuditLog[] }>('/audit');
    return res.logs;
  }
};
