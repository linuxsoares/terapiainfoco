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
  SignIcpDTO,
  ClinicalOverviewMetrics,
  SecurityMetrics,
  PatientClinicalMetrics,
  ExportPatientDataDTO,
  ExportPatientDataResponse,
  RevokeConsentDTO,
  RevokeConsentResponse,
  BackupOverviewResponse,
  CreateBackupResponse,
  VerifyBackupResponse,
  RestoreBackupResponse,
  BackupSnapshotFile,
  AuditFilterParams,
  ChainIntegrityResult,
  ComplianceReportResponse,
  RateLimitStatusResponse,
  ResetRateLimitResponse,
  EncryptedCacheStatsResponse,
  RotateCacheKeyResponse,
  WebhookSubscription,
  WebhookDeliveryLog,
  CreateWebhookDTO,
  UpdateWebhookDTO,
  TestWebhookResponse,
  WebhookListResponse,
  WebhookLogsResponse,
  UnmaskAuditRequestDTO,
  UnmaskAuditResponse
} from '@terapiainfoco/shared';

const rawApiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').trim().replace(/\/+$/, '');
const API_BASE = rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`;

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

  // Portabilidade de Dados & Exportação LGPD Art. 18 (Opção F)
  async exportPatientData(patientId: string, options?: ExportPatientDataDTO): Promise<ExportPatientDataResponse> {
    const res = await request<ExportPatientDataResponse>(`/patients/${patientId}/export`, {
      method: 'POST',
      body: JSON.stringify(options || {})
    });
    return res;
  },

  async revokeConsent(patientId: string, data: RevokeConsentDTO): Promise<RevokeConsentResponse> {
    const res = await request<RevokeConsentResponse>(`/patients/${patientId}/revoke-consent`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return res;
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

  // 4. Auditoria WORM & Relatórios DPO/CFP (RFC-001 §4.4, §5.2 - Opção H)
  async getAuditLogs(filters?: AuditFilterParams): Promise<AuditLog[]> {
    const params = new URLSearchParams();
    if (filters?.action) params.append('action', filters.action);
    if (filters?.resourceType) params.append('resourceType', filters.resourceType);
    if (filters?.actorId) params.append('actorId', filters.actorId);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.limit) params.append('limit', String(filters.limit));

    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await request<{ success: boolean; logs: AuditLog[] }>(`/audit${query}`);
    return res.logs;
  },

  async verifyAuditChain(): Promise<ChainIntegrityResult> {
    const res = await request<ChainIntegrityResult>('/audit/verify-chain');
    return res;
  },

  async getComplianceReport(filters?: AuditFilterParams): Promise<ComplianceReportResponse> {
    const params = new URLSearchParams();
    if (filters?.action) params.append('action', filters.action);
    if (filters?.resourceType) params.append('resourceType', filters.resourceType);
    if (filters?.actorId) params.append('actorId', filters.actorId);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);

    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await request<ComplianceReportResponse>(`/audit/report${query}`);
    return res;
  },

  async downloadAuditCsv(filters?: AuditFilterParams): Promise<void> {
    const params = new URLSearchParams();
    if (filters?.action) params.append('action', filters.action);
    if (filters?.resourceType) params.append('resourceType', filters.resourceType);
    if (filters?.actorId) params.append('actorId', filters.actorId);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);

    const query = params.toString() ? `?${params.toString()}` : '';
    const headers: Record<string, string> = {};
    const token = authStorage.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/audit/export/csv${query}`, { method: 'GET', headers });
    if (!res.ok) throw new Error(`Erro ao exportar CSV de auditoria: HTTP ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `terapiainfoco-auditoria-worm-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  async downloadAuditJson(filters?: AuditFilterParams): Promise<void> {
    const params = new URLSearchParams();
    if (filters?.action) params.append('action', filters.action);
    if (filters?.resourceType) params.append('resourceType', filters.resourceType);
    if (filters?.actorId) params.append('actorId', filters.actorId);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);

    const query = params.toString() ? `?${params.toString()}` : '';
    const headers: Record<string, string> = {};
    const token = authStorage.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/audit/export/json${query}`, { method: 'GET', headers });
    if (!res.ok) throw new Error(`Erro ao exportar JSON de auditoria: HTTP ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `terapiainfoco-relatorio-conformidade-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
  },

  // 8. Analytics & Observabilidade (RFC-001 Opção E)
  async getClinicalOverview(therapistId = 'therapist-001'): Promise<ClinicalOverviewMetrics> {
    const res = await request<{ success: boolean } & ClinicalOverviewMetrics>(`/analytics/clinical-overview?therapistId=${therapistId}`);
    return res;
  },

  async getSecurityMetrics(): Promise<SecurityMetrics> {
    const res = await request<{ success: boolean } & SecurityMetrics>('/analytics/security-metrics');
    return res;
  },

  async getPatientClinicalMetrics(patientId: string): Promise<PatientClinicalMetrics> {
    const res = await request<{ success: boolean } & PatientClinicalMetrics>(`/analytics/patient/${patientId}`);
    return res;
  },

  // 9. Backup Criptografado & Disaster Recovery com KMS (RFC-001 Opção G)
  async getBackupOverview(): Promise<BackupOverviewResponse> {
    const res = await request<BackupOverviewResponse>('/backups');
    return res;
  },

  async createBackup(): Promise<CreateBackupResponse> {
    const res = await request<CreateBackupResponse>('/backups', {
      method: 'POST'
    });
    return res;
  },

  async verifyBackup(backupId: string): Promise<VerifyBackupResponse> {
    const res = await request<VerifyBackupResponse>(`/backups/${backupId}/verify`, {
      method: 'POST'
    });
    return res;
  },

  async restoreBackup(backupId: string): Promise<RestoreBackupResponse> {
    const res = await request<RestoreBackupResponse>(`/backups/${backupId}/restore`, {
      method: 'POST'
    });
    return res;
  },

  async downloadBackupFile(backupId: string): Promise<void> {
    const file = await request<BackupSnapshotFile>(`/backups/${backupId}/download`);
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `terapiainfoco-backup-${backupId.slice(0, 8)}.kms-backup.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  // 10. Rate Limiting Distribuído & Cache Criptográfico em Memória (RFC-001 Opção I)
  async getRateLimitStatus(): Promise<RateLimitStatusResponse> {
    const res = await request<RateLimitStatusResponse>('/system/rate-limit/status');
    return res;
  },

  async resetRateLimit(key?: string): Promise<ResetRateLimitResponse> {
    const res = await request<ResetRateLimitResponse>('/system/rate-limit/reset', {
      method: 'POST',
      body: JSON.stringify({ key })
    });
    return res;
  },

  async getEncryptedCacheStats(): Promise<EncryptedCacheStatsResponse> {
    const res = await request<EncryptedCacheStatsResponse>('/system/cache/stats');
    return res;
  },

  async rotateCacheKey(): Promise<RotateCacheKeyResponse> {
    const res = await request<RotateCacheKeyResponse>('/system/cache/rotate-key', {
      method: 'POST'
    });
    return res;
  },

  // 11. Webhooks Assinados HMAC-SHA256 & Notificações de Segurança (RFC-001 Opção J & LGPD Art. 48)
  async getWebhooks(): Promise<WebhookSubscription[]> {
    const res = await request<WebhookListResponse>('/webhooks');
    return res.webhooks;
  },

  async createWebhook(dto: CreateWebhookDTO): Promise<WebhookSubscription> {
    const res = await request<{ success: boolean; webhook: WebhookSubscription }>('/webhooks', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
    return res.webhook;
  },

  async updateWebhook(id: string, dto: UpdateWebhookDTO): Promise<WebhookSubscription> {
    const res = await request<{ success: boolean; webhook: WebhookSubscription }>(`/webhooks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto)
    });
    return res.webhook;
  },

  async deleteWebhook(id: string): Promise<void> {
    await request<{ success: boolean; message: string }>(`/webhooks/${id}`, {
      method: 'DELETE'
    });
  },

  async testWebhook(id: string): Promise<TestWebhookResponse> {
    const res = await request<TestWebhookResponse>(`/webhooks/${id}/test`, {
      method: 'POST'
    });
    return res;
  },

  async getWebhookLogs(id: string): Promise<WebhookDeliveryLog[]> {
    const res = await request<WebhookLogsResponse>(`/webhooks/${id}/logs`);
    return res.logs;
  },

  // 12. Mascaramento Dinâmico de Dados (DDM) & Trilha WORM de Revelação (RFC-001 Opção K)
  async auditUnmask(dto: UnmaskAuditRequestDTO): Promise<UnmaskAuditResponse> {
    const res = await request<UnmaskAuditResponse>('/audit/unmask', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
    return res;
  }
};




