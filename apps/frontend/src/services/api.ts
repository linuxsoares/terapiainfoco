import type {
  CreatePatientDTO,
  DecryptedPatient,
  CreateAppointmentDTO,
  DecryptedAppointment,
  AppointmentStatus,
  UpdateSoapNoteDTO,
  DecryptedClinicalRecord,
  GenerateDocumentDTO,
  DecryptedPsychologicalDocument,
  ValidateDocumentResponse,
  AuditLog,
  UploadAudioDTO,
  DecryptedSessionTranscription,
  GenerateSoapProposalDTO,
  GenerateSoapProposalResponse,
  SanitizeTranscriptionDTO,
  SafeUser,
  LoginResponse,
  TwoFactorSetupResponse,
  PrepareIcpSignatureResponse,
  SignIcpDTO
} from '@terapiainfoco/shared';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

let authToken: string | null = typeof window !== 'undefined' ? localStorage.getItem('terapiainfoco_access_token') : null;
let refreshToken: string | null = typeof window !== 'undefined' ? localStorage.getItem('terapiainfoco_refresh_token') : null;

export const authStorage = {
  getToken: () => authToken,
  setToken: (token: string | null) => {
    authToken = token;
    if (token) localStorage.setItem('terapiainfoco_access_token', token);
    else localStorage.removeItem('terapiainfoco_access_token');
  },
  getRefreshToken: () => refreshToken,
  setRefreshToken: (token: string | null) => {
    refreshToken = token;
    if (token) localStorage.setItem('terapiainfoco_refresh_token', token);
    else localStorage.removeItem('terapiainfoco_refresh_token');
  },
  clear: () => {
    authToken = null;
    refreshToken = null;
    localStorage.removeItem('terapiainfoco_access_token');
    localStorage.removeItem('terapiainfoco_refresh_token');
    localStorage.removeItem('terapiainfoco_user');
  }
};

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>)
  };

  const token = authStorage.getToken();
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
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
  },

  // 5. Documentos Psicológicos (Módulo 5 - CFP nº 006/2019)
  async createDocumentDraft(dto: GenerateDocumentDTO): Promise<DecryptedPsychologicalDocument> {
    const res = await request<{ success: boolean; document: DecryptedPsychologicalDocument }>('/documents/draft', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
    return res.document;
  },

  async signDocument(documentId: string): Promise<DecryptedPsychologicalDocument> {
    const res = await request<{ success: boolean; document: DecryptedPsychologicalDocument }>('/documents/sign', {
      method: 'POST',
      body: JSON.stringify({ documentId })
    });
    return res.document;
  },

  async getDocuments(): Promise<DecryptedPsychologicalDocument[]> {
    const res = await request<{ success: boolean; documents: DecryptedPsychologicalDocument[] }>('/documents');
    return res.documents;
  },

  async getDocumentById(id: string): Promise<DecryptedPsychologicalDocument> {
    const res = await request<{ success: boolean; document: DecryptedPsychologicalDocument }>(`/documents/${id}`);
    return res.document;
  },

  async downloadDocumentPdf(documentId: string): Promise<Blob> {
    const headers: Record<string, string> = {};
    const token = authStorage.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${API_BASE}/documents/${documentId}/pdf`, {
      method: 'GET',
      headers
    });
    if (!res.ok) {
      throw new Error(`Erro ao baixar PDF oficial: HTTP ${res.status}`);
    }
    return await res.blob();
  },

  async prepareIcpSignature(documentId: string): Promise<PrepareIcpSignatureResponse> {
    const res = await request<{ success: boolean } & PrepareIcpSignatureResponse>(`/documents/${documentId}/prepare-icp-signature`, {
      method: 'POST'
    });
    return res;
  },

  async signWithIcp(documentId: string, dto: SignIcpDTO): Promise<DecryptedPsychologicalDocument> {
    const res = await request<{ success: boolean; document: DecryptedPsychologicalDocument }>(`/documents/${documentId}/sign-icp`, {
      method: 'POST',
      body: JSON.stringify(dto)
    });
    return res.document;
  },

  async validateDocumentToken(token: string): Promise<ValidateDocumentResponse> {
    const res = await request<ValidateDocumentResponse>(`/documents/validate/${token}`);
    return res;
  },

  // 6. Transcrição, Diarização & IA SOAP (RFC §3.3)
  async uploadAudio(dto: UploadAudioDTO): Promise<DecryptedSessionTranscription> {
    const res = await request<{ success: boolean; transcription: DecryptedSessionTranscription }>('/transcriptions/upload', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
    return res.transcription;
  },

  async getTranscription(appointmentId: string): Promise<DecryptedSessionTranscription> {
    const res = await request<{ success: boolean; transcription: DecryptedSessionTranscription }>(`/transcriptions/appointment/${appointmentId}`);
    return res.transcription;
  },

  async sanitizeTranscription(dto: SanitizeTranscriptionDTO): Promise<any> {
    const res = await request<any>('/transcriptions/sanitize', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
    return res;
  },

  async generateSoapProposal(dto: GenerateSoapProposalDTO): Promise<GenerateSoapProposalResponse & { sanitizedUtterances?: any[] }> {
    const res = await request<{ success: boolean; proposal: GenerateSoapProposalResponse & { sanitizedUtterances?: any[] } }>('/transcriptions/generate-soap', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
    return res.proposal;
  },

  // 7. Autenticação Segura, RBAC & 2FA/MFA (Opção C)
  async login(email: string, password: string): Promise<LoginResponse> {
    const res = await request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (res.accessToken) {
      authStorage.setToken(res.accessToken);
    }
    if (res.refreshToken) {
      authStorage.setRefreshToken(res.refreshToken);
    }
    return res;
  },

  async validateLogin2FA(tempToken: string, code: string): Promise<LoginResponse> {
    const res = await request<LoginResponse>('/auth/2fa/validate', {
      method: 'POST',
      body: JSON.stringify({ tempToken, code })
    });
    if (res.accessToken) {
      authStorage.setToken(res.accessToken);
    }
    if (res.refreshToken) {
      authStorage.setRefreshToken(res.refreshToken);
    }
    return res;
  },

  async setup2FA(): Promise<TwoFactorSetupResponse> {
    const res = await request<TwoFactorSetupResponse & { success: boolean }>('/auth/2fa/setup', {
      method: 'POST'
    });
    return res;
  },

  async verify2FA(code: string): Promise<{ success: boolean; message: string; backupCodes?: string[] }> {
    const res = await request<{ success: boolean; message: string; backupCodes?: string[] }>('/auth/2fa/verify', {
      method: 'POST',
      body: JSON.stringify({ code })
    });
    return res;
  },

  async disable2FA(password: string): Promise<{ success: boolean; message: string }> {
    const res = await request<{ success: boolean; message: string }>('/auth/2fa/disable', {
      method: 'POST',
      body: JSON.stringify({ password })
    });
    return res;
  },

  async getMe(): Promise<SafeUser> {
    const res = await request<{ success: boolean; user: SafeUser }>('/auth/me');
    return res.user;
  },

  async logout(): Promise<void> {
    try {
      const currentRefreshToken = authStorage.getRefreshToken();
      await request('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: currentRefreshToken })
      });
    } finally {
      authStorage.clear();
    }
  }
};


