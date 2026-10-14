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
  UnmaskAuditResponse,
  ReadinessProbeResponse,
  LivenessProbeResponse,
  StartupProbeResponse,
  SyntheticJourneyResult,
  SyntheticHistoryResponse,
  ResilienceCheckResult,
  RunSyntheticProbeRequestDTO,
  DecryptedAnamnesisRecord,
  SaveAnamnesisDTO,
  CreateRectificationDTO,
  ClinicalRecordRectification,
  TelemetryOverview,
  TraceSpan,
  TelemetryOverviewResponse,
  TracesListResponse,
  RawMetricsResponse,
  PasskeyRegistrationOptionsResponse,
  PasskeyRegistrationVerifyDTO,
  PasskeyAuthenticationOptionsResponse,
  PasskeyAuthenticationVerifyDTO,
  PasskeyInfoDTO,
  PasskeyListResponse,
  DPIAReport,
  CompliancePentestResponse,
  DPIAReportResponse,
  SiemConnector,
  SiemQueueItem,
  CreateSiemConnectorDTO,
  UpdateSiemConnectorDTO,
  TestSiemConnectorDTO,
  SiemConnectorResponse,
  SiemQueueResponse,
  SiemDlqReplayResponse,
  KmsSystemStatus,
  KmsKeyMetadata,
  RotateKmsKeyDTO,
  RotateKmsKeyResponse,
  ReWrapDeksDTO,
  ReWrapDeksResponse,
  UpdateKmsPolicyDTO,
  UpdateKmsPolicyResponse,
  RevokeKmsKeyDTO,
  StressTestReport,
  RunStressTestDTO,
  StressTestResponse,
  StressHistoryResponse,
  StressSlosResponse,
  OtlpExporterConfig,
  OtlpExporterStats,
  OtlpBatchExportResult,
  UpdateOtlpConfigDTO,
  TestOtlpExportDTO,
  OtlpStatusResponse,
  OtlpExportResponse,
  GenerateCompliancePackageDTO,
  ApplyDpoSignOffDTO,
  ExecutiveComplianceOverviewResponse,
  ExecutiveCompliancePackageResponse,
  SecurityHardeningOverviewResponse,
  UnbanIpRequestDTO,
  UnbanIpResponse,
  VerifySecurityHeadersResponse,
  MeetAccessType,
  GoogleMeetStatusResponse,
  GoogleMeetTestResponse,
  InitiateWebRtcAuditSessionDTO,
  InitiateWebRtcAuditSessionResponse,
  VerifyWebRtcFingerprintDTO,
  VerifyWebRtcFingerprintResponse,
  RecordWebRtcMetricsDTO,
  RecordWebRtcMetricsResponse,
  TerminateWebRtcSessionDTO,
  TerminateWebRtcSessionResponse,
  WebRtcSessionListResponse,
  WebRtcSessionAuditRecord,
  WafOverviewResponse,
  InspectPayloadDTO,
  InspectPayloadResponse,
  UpdateWafModeDTO,
  UpdateWafModeResponse,
  NetworkSimulationPresetsResponse,
  RunNetworkSimulationDTO,
  NetworkSimulationResponse,
  NetworkResilienceHistoryResponse,
  NetworkResilienceMetrics,
  CreateMediaSessionDTO,
  UploadMediaChunkDTO,
  ExecuteCryptoShreddingDTO,
  MediaRecordingResponse,
  MediaSessionListResponse,
  CryptoShreddingResponse,
  SimulateMediaPipelineResponse,
  MediaStorageMetrics,
  StartSessionMonitoringDTO,
  SessionHeartbeatDTO,
  TriggerSessionDisconnectionDTO,
  AttemptSessionReconnectDTO,
  CompleteClinicalSessionDTO,
  SessionMonitoringResponse,
  SessionReconnectResponse,
  SessionRecoveryListResponse,
  SessionRecoveryMetrics,
  ClinicalSessionRecoverySession,
  GenerateZkpProofDTO,
  VerifyZkpProofDTO,
  ZkpProofResponse,
  ZkpVerificationResponse,
  ZkpProofListResponse,
  ZkpSystemMetrics,
  CheckCredentialBreachDTO,
  TriggerDarkWebScanDTO,
  ContainIncidentDTO,
  ResolveIncidentDTO,
  CredentialBreachCheckResponse,
  ThreatScanResponse,
  ThreatIntelligenceOverviewResponse,
  ContainIncidentResponse,
  ResolveIncidentResponse,
  GrantGranularConsentDTO,
  RevokeGranularConsentDTO,
  EnforceConsentDTO,
  GranularConsentResponse,
  ConsentReceiptResponse,
  EnforceConsentResponse,
  ConsentLedgerOverviewResponse,
  PatientConsentLedger
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

  async endMeetConference(appointmentId: string): Promise<{ success: boolean; conferenceEnded: boolean; message: string }> {
    return await request<{ success: boolean; conferenceEnded: boolean; message: string }>(`/appointments/${appointmentId}/end-meet`, {
      method: 'POST'
    });
  },

  async getGoogleMeetStatus(): Promise<{ success: boolean } & GoogleMeetStatusResponse> {
    return await request<{ success: boolean } & GoogleMeetStatusResponse>('/system/google-meet/status');
  },

  async testGoogleMeet(accessType?: MeetAccessType): Promise<GoogleMeetTestResponse> {
    return await request<GoogleMeetTestResponse>('/system/google-meet/test', {
      method: 'POST',
      body: JSON.stringify({ accessType })
    });
  },

  async getGoogleOAuthUrl(): Promise<{ success: boolean; url: string }> {
    return await request<{ success: boolean; url: string }>('/auth/google/authorize?format=json');
  },

  async disconnectGoogleMeet(): Promise<{ success: boolean; message: string }> {
    return await request<{ success: boolean; message: string }>('/auth/google/disconnect', {
      method: 'POST'
    });
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
  },

  // 13. Health Checks, Liveness & Readiness Probes (RFC-001 Opção L & §5.2)
  async getReadinessProbe(): Promise<ReadinessProbeResponse> {
    const res = await request<ReadinessProbeResponse>('/system/probes/readiness');
    return res;
  },

  async getLivenessProbe(): Promise<LivenessProbeResponse> {
    const res = await request<LivenessProbeResponse>('/system/probes/liveness');
    return res;
  },

  async getStartupProbe(): Promise<StartupProbeResponse> {
    const res = await request<StartupProbeResponse>('/system/probes/startup');
    return res;
  },

  // 14. Monitoramento Sintético & Jornada Clínica Ponta-a-Ponta (RFC-001 Opção M)
  async runSyntheticProbe(dto?: RunSyntheticProbeRequestDTO): Promise<SyntheticJourneyResult> {
    const res = await request<SyntheticJourneyResult>('/system/synthetic/run', {
      method: 'POST',
      body: JSON.stringify(dto || {})
    });
    return res;
  },

  async getSyntheticHistory(): Promise<SyntheticHistoryResponse> {
    const res = await request<SyntheticHistoryResponse>('/system/synthetic/history');
    return res;
  },

  async getResilienceStatus(): Promise<ResilienceCheckResult> {
    const res = await request<ResilienceCheckResult>('/system/synthetic/resilience');
    return res;
  },

  // 15. Ficha de Admissão & Anamnese Biopsicossocial (RFC §3.4 e CFP 001/2009)
  async getAnamnesis(patientId: string): Promise<DecryptedAnamnesisRecord | null> {
    try {
      const res = await request<{ success: boolean; anamnesis: DecryptedAnamnesisRecord }>(`/patients/${patientId}/anamnesis`);
      return res.anamnesis;
    } catch {
      return null;
    }
  },

  async saveAnamnesis(patientId: string, dto: SaveAnamnesisDTO): Promise<DecryptedAnamnesisRecord> {
    const res = await request<{ success: boolean; anamnesis: DecryptedAnamnesisRecord }>(`/patients/${patientId}/anamnesis`, {
      method: 'POST',
      body: JSON.stringify(dto)
    });
    return res.anamnesis;
  },

  // 16. Termo de Retificação Formal de Prontuário (CFP nº 001/2009 & RFC §3.4)
  async rectifyClinicalRecord(recordId: string, dto: CreateRectificationDTO): Promise<ClinicalRecordRectification> {
    const res = await request<{ success: boolean; rectification: ClinicalRecordRectification }>(`/clinical-records/${recordId}/rectify`, {
      method: 'POST',
      body: JSON.stringify(dto)
    });
    return res.rectification;
  },

  async getRecordRectifications(recordId: string): Promise<ClinicalRecordRectification[]> {
    try {
      const res = await request<{ success: boolean; rectifications: ClinicalRecordRectification[] }>(`/clinical-records/${recordId}/rectifications`);
      return res.rectifications || [];
    } catch {
      return [];
    }
  },

  // 17. Telemetria OpenTelemetry & Métricas RED / Prometheus (RFC-001 §5.2 - Opção N)
  async getTelemetryOverview(): Promise<TelemetryOverview> {
    const res = await request<TelemetryOverviewResponse>('/system/telemetry/overview');
    return res.telemetry;
  },

  async getTelemetryTraces(limit = 30): Promise<TraceSpan[]> {
    const res = await request<TracesListResponse>(`/system/telemetry/traces?limit=${limit}`);
    return res.traces || [];
  },

  async getRawPrometheusMetrics(): Promise<string> {
    const res = await request<RawMetricsResponse>('/system/telemetry/metrics-raw');
    return res.metrics;
  },

  async getOtlpStatus(): Promise<{ success: boolean; config: OtlpExporterConfig; stats: OtlpExporterStats }> {
    return await request<OtlpStatusResponse>('/system/telemetry/otlp/status');
  },

  async updateOtlpConfig(data: UpdateOtlpConfigDTO): Promise<{ success: boolean; config: OtlpExporterConfig; message: string }> {
    return await request<{ success: boolean; config: OtlpExporterConfig; message: string }>('/system/telemetry/otlp/config', {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async flushOtlp(): Promise<{ success: boolean; result: OtlpBatchExportResult; stats: OtlpExporterStats }> {
    return await request<OtlpExportResponse>('/system/telemetry/otlp/flush', {
      method: 'POST'
    });
  },

  async testOtlpConnection(data?: TestOtlpExportDTO): Promise<{ success: boolean; result: OtlpBatchExportResult }> {
    return await request<{ success: boolean; result: OtlpBatchExportResult }>('/system/telemetry/otlp/test', {
      method: 'POST',
      body: JSON.stringify(data || {})
    });
  },

  // 18. Autenticação Biométrica WebAuthn / Passkeys (Opção O - RFC-001)
  async getPasskeyRegistrationOptions(): Promise<PasskeyRegistrationOptionsResponse> {
    return await request<PasskeyRegistrationOptionsResponse>('/auth/passkeys/register/options', {
      method: 'POST'
    });
  },

  async verifyPasskeyRegistration(dto: PasskeyRegistrationVerifyDTO): Promise<PasskeyInfoDTO> {
    const res = await request<{ success: boolean; passkey: PasskeyInfoDTO }>('/auth/passkeys/register/verify', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
    return res.passkey;
  },

  async getPasskeyAuthOptions(email?: string): Promise<PasskeyAuthenticationOptionsResponse> {
    return await request<PasskeyAuthenticationOptionsResponse>('/auth/passkeys/auth/options', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  },

  async verifyPasskeyAuth(dto: PasskeyAuthenticationVerifyDTO): Promise<LoginResponse> {
    const res = await request<LoginResponse>('/auth/passkeys/auth/verify', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
    if (res.accessToken) {
      authStorage.setToken(res.accessToken);
    }
    if (res.refreshToken) {
      authStorage.setRefreshToken(res.refreshToken);
    }
    return res;
  },

  async listPasskeys(): Promise<PasskeyInfoDTO[]> {
    const res = await request<PasskeyListResponse>('/auth/passkeys');
    return res.passkeys || [];
  },

  async deletePasskey(id: string): Promise<{ success: boolean; message: string }> {
    return await request<{ success: boolean; message: string }>(`/auth/passkeys/${id}`, {
      method: 'DELETE'
    });
  },

  isWebAuthnSupported(): boolean {
    return typeof window !== 'undefined' && !!window.PublicKeyCredential;
  },

  async registerPasskeyWithBrowser(friendlyName: string): Promise<PasskeyInfoDTO> {
    const options = await this.getPasskeyRegistrationOptions();

    // Se o navegador suporta WebAuthn nativo com credenciais de chave pública
    if (typeof window !== 'undefined' && window.PublicKeyCredential && navigator.credentials?.create) {
      try {
        const toBuffer = (b64: string): ArrayBuffer => {
          let str = b64.replace(/-/g, '+').replace(/_/g, '/');
          while (str.length % 4 !== 0) str += '=';
          const bin = atob(str);
          const buf = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
          return buf.buffer;
        };

        const toBase64Url = (buf: ArrayBuffer): string => {
          const bytes = new Uint8Array(buf);
          let bin = '';
          for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
          return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        };

        const credential = await navigator.credentials.create({
          publicKey: {
            challenge: toBuffer(options.challenge),
            rp: options.rp,
            user: {
              ...options.user,
              id: new TextEncoder().encode(options.user.id)
            },
            pubKeyCredParams: options.pubKeyCredParams as any,
            authenticatorSelection: options.authenticatorSelection as any,
            timeout: options.timeout,
            attestation: options.attestation as any
          }
        }) as PublicKeyCredential | null;

        if (credential) {
          const rawResponse = credential.response as AuthenticatorAttestationResponse;
          const dto: PasskeyRegistrationVerifyDTO = {
            friendlyName: friendlyName.trim() || 'Biometria (TouchID/FaceID)',
            credentialId: toBase64Url(credential.rawId),
            clientDataJSON: toBase64Url(rawResponse.clientDataJSON),
            attestationObject: toBase64Url(rawResponse.attestationObject)
          };
          return await this.verifyPasskeyRegistration(dto);
        }
      } catch (err: any) {
        if (err.name === 'NotAllowedError') {
          throw new Error('Operação de biometria cancelada pelo usuário ou não permitida no dispositivo.');
        }
        console.warn('Falha no autenticador nativo, usando modo simulado:', err);
      }
    }

    // Modo Simulado de Compatibilidade (para ambientes sem hardware FIDO2 ou headless)
    const simulatedCredId = 'simulated_' + Math.random().toString(36).substring(2, 12);
    const clientData = {
      type: 'webauthn.create',
      challenge: options.challenge,
      origin: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5174'
    };
    const clientDataJSON = btoa(JSON.stringify(clientData)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    return await this.verifyPasskeyRegistration({
      friendlyName: friendlyName.trim() || 'Simulador Biométrico (TouchID)',
      credentialId: simulatedCredId,
      clientDataJSON
    });
  },

  async authenticatePasskeyWithBrowser(email?: string): Promise<LoginResponse> {
    const options = await this.getPasskeyAuthOptions(email);

    if (typeof window !== 'undefined' && window.PublicKeyCredential && navigator.credentials?.get) {
      try {
        const toBuffer = (b64: string): ArrayBuffer => {
          let str = b64.replace(/-/g, '+').replace(/_/g, '/');
          while (str.length % 4 !== 0) str += '=';
          const bin = atob(str);
          const buf = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
          return buf.buffer;
        };

        const toBase64Url = (buf: ArrayBuffer): string => {
          const bytes = new Uint8Array(buf);
          let bin = '';
          for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
          return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        };

        const assertion = await navigator.credentials.get({
          publicKey: {
            challenge: toBuffer(options.challenge),
            rpId: options.rpId,
            userVerification: options.userVerification as any,
            timeout: options.timeout,
            allowCredentials: options.allowCredentials?.map(c => ({
              id: toBuffer(c.id),
              type: c.type
            })) as any
          }
        }) as PublicKeyCredential | null;

        if (assertion) {
          const rawResponse = assertion.response as AuthenticatorAssertionResponse;
          const dto: PasskeyAuthenticationVerifyDTO = {
            credentialId: toBase64Url(assertion.rawId),
            clientDataJSON: toBase64Url(rawResponse.clientDataJSON),
            authenticatorData: toBase64Url(rawResponse.authenticatorData),
            signature: toBase64Url(rawResponse.signature)
          };
          return await this.verifyPasskeyAuth(dto);
        }
      } catch (err: any) {
        if (err.name === 'NotAllowedError') {
          throw new Error('Operação biométrica cancelada pelo usuário.');
        }
        console.warn('Falha no autenticador nativo, usando modo simulado:', err);
      }
    }

    // Modo Simulado
    const credId = options.allowCredentials?.[0]?.id || 'simulated_fallback_key';
    const clientData = {
      type: 'webauthn.get',
      challenge: options.challenge,
      origin: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5174'
    };
    const clientDataJSON = btoa(JSON.stringify(clientData)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const dummyAuthData = btoa('dummy_authenticator_data_37_bytes_pad_len____').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const dummySig = btoa('dummy_signature_bytes_mock_____________').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    return await this.verifyPasskeyAuth({
      credentialId: credId,
      clientDataJSON,
      authenticatorData: dummyAuthData,
      signature: dummySig
    });
  },

  // 17. Auditoria Contínua, Pentest Automatizado & Relatório RIPD/DPIA (Fase 4 do RFC-001 & LGPD Art. 38/50)
  async runCompliancePentest(): Promise<CompliancePentestResponse> {
    return await request<CompliancePentestResponse>('/audit/compliance/run', {
      method: 'POST'
    });
  },

  async getLatestDPIAReport(): Promise<DPIAReport> {
    const res = await request<DPIAReportResponse>('/audit/compliance/report');
    return res.report;
  },

  async downloadDPIAReport(): Promise<void> {
    const token = authStorage.getToken();
    const res = await fetch(`${API_BASE}/audit/compliance/download-ripd`, {
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    });
    if (!res.ok) throw new Error('Falha ao baixar relatório RIPD');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `terapiainfoco-ripd-dpia-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  // 18. Conectores SIEM Externos (Datadog, Splunk, Elastic) & Retry Resiliente (RFC §4.4 & §5.2)
  async getSiemConnectors(): Promise<SiemConnector[]> {
    const res = await request<SiemConnectorResponse>('/siem/connectors');
    return res.connectors || [];
  },

  async createSiemConnector(dto: CreateSiemConnectorDTO): Promise<SiemConnector> {
    const res = await request<SiemConnectorResponse>('/siem/connectors', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
    if (!res.connector) throw new Error(res.message || 'Falha ao criar conector SIEM');
    return res.connector;
  },

  async updateSiemConnector(id: string, dto: UpdateSiemConnectorDTO): Promise<SiemConnector> {
    const res = await request<SiemConnectorResponse>(`/siem/connectors/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto)
    });
    if (!res.connector) throw new Error(res.message || 'Falha ao atualizar conector SIEM');
    return res.connector;
  },

  async deleteSiemConnector(id: string): Promise<void> {
    await request<{ success: boolean; message: string }>(`/siem/connectors/${id}`, {
      method: 'DELETE'
    });
  },

  async testSiemConnector(id: string, dto?: TestSiemConnectorDTO): Promise<NonNullable<SiemConnectorResponse['testResult']>> {
    const res = await request<SiemConnectorResponse>(`/siem/connectors/${id}/test`, {
      method: 'POST',
      body: JSON.stringify(dto || {})
    });
    if (!res.testResult) throw new Error(res.message || 'Falha ao testar conector SIEM');
    return res.testResult;
  },

  async getSiemQueue(): Promise<SiemQueueResponse> {
    return await request<SiemQueueResponse>('/siem/queue');
  },

  async getSiemDlq(): Promise<SiemQueueItem[]> {
    const res = await request<{ success: boolean; count: number; items: SiemQueueItem[] }>('/siem/dlq');
    return res.items || [];
  },

  async replaySiemDlqItem(id: string): Promise<SiemQueueItem> {
    const res = await request<{ success: boolean; item: SiemQueueItem }>(`/siem/dlq/${id}/replay`, {
      method: 'POST'
    });
    return res.item;
  },

  async replayAllSiemDlq(): Promise<SiemDlqReplayResponse> {
    return await request<SiemDlqReplayResponse>('/siem/dlq/replay-all', {
      method: 'POST'
    });
  },

  async deleteSiemDlqItem(id: string): Promise<void> {
    await request<{ success: boolean; message: string }>(`/siem/dlq/${id}`, {
      method: 'DELETE'
    });
  },

  // 17. Gestão de Chaves KMS & Rotação Contínua (NIST SP 800-57 & RFC §4.2)
  async getKmsStatus(): Promise<KmsSystemStatus> {
    const res = await request<{ success: boolean; status: KmsSystemStatus }>('/kms/status');
    return res.status;
  },

  async rotateKmsKey(dto: RotateKmsKeyDTO): Promise<RotateKmsKeyResponse> {
    return await request<RotateKmsKeyResponse>('/kms/rotate', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async reWrapKmsDeks(dto?: ReWrapDeksDTO): Promise<ReWrapDeksResponse> {
    return await request<ReWrapDeksResponse>('/kms/re-wrap', {
      method: 'POST',
      body: JSON.stringify(dto || {})
    });
  },

  async updateKmsPolicy(dto: UpdateKmsPolicyDTO): Promise<UpdateKmsPolicyResponse> {
    return await request<UpdateKmsPolicyResponse>('/kms/policy', {
      method: 'PUT',
      body: JSON.stringify(dto)
    });
  },

  async revokeKmsKey(version: number, dto: RevokeKmsKeyDTO): Promise<{ success: boolean; key: KmsKeyMetadata; message: string }> {
    return await request<{ success: boolean; key: KmsKeyMetadata; message: string }>(`/kms/revoke/${version}`, {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  // 18. Homologação sob Carga, Stress Concorrente & Avaliação de SLOs RED (RFC §5.1, §5.2)
  async runStressTest(dto?: RunStressTestDTO): Promise<StressTestReport> {
    const res = await request<StressTestResponse>('/system/stress/run', {
      method: 'POST',
      body: JSON.stringify(dto || {})
    });
    return res.report;
  },

  async getStressHistory(): Promise<StressTestReport[]> {
    const res = await request<StressHistoryResponse>('/system/stress/history');
    return res.reports || [];
  },

  async getStressSlos(): Promise<Array<{ id: string; name: string; targetDescription: string; thresholdMs?: number; maxErrorRate?: number; unit: string }>> {
    const res = await request<StressSlosResponse>('/system/stress/slos');
    return res.slos || [];
  },

  // 19. Governança Executiva & Compliance Package Forense Multi-Normativo (RFC-001 §4.4, §5.2)
  async getGovernanceOverview(): Promise<ExecutiveComplianceOverviewResponse> {
    return await request<ExecutiveComplianceOverviewResponse>('/audit/governance/overview');
  },

  async generateCompliancePackage(dto?: GenerateCompliancePackageDTO): Promise<ExecutiveCompliancePackageResponse> {
    return await request<ExecutiveCompliancePackageResponse>('/audit/governance/package/generate', {
      method: 'POST',
      body: JSON.stringify(dto || {})
    });
  },

  async applyDpoSignOff(dto: ApplyDpoSignOffDTO): Promise<ExecutiveCompliancePackageResponse> {
    return await request<ExecutiveCompliancePackageResponse>('/audit/governance/package/sign-off', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async downloadCompliancePackage(packageId?: string): Promise<void> {
    const token = authStorage.getToken();
    const query = packageId ? `?packageId=${encodeURIComponent(packageId)}` : '';
    const res = await fetch(`${API_BASE}/audit/governance/package/download${query}`, {
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    });
    if (!res.ok) throw new Error('Falha ao baixar Pacote Executivo de Conformidade');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `terapiainfoco-compliance-package-${packageId ? packageId.slice(0, 8) : new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  // 20. Hardening de Segurança HTTP (CSP, HSTS) & Honeypot Anti-Probe (RFC-001 §4.4, §5.2)
  async getSecurityHardeningOverview(): Promise<SecurityHardeningOverviewResponse> {
    return await request<SecurityHardeningOverviewResponse>('/security/hardening/overview');
  },

  async unbanIpAddress(dto: UnbanIpRequestDTO): Promise<UnbanIpResponse> {
    return await request<UnbanIpResponse>('/security/hardening/honeypot/unban', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifySecurityHeaders(): Promise<VerifySecurityHeadersResponse> {
    return await request<VerifySecurityHeadersResponse>('/security/hardening/headers/verify');
  },

  // 21. Auditoria de Sessão WebRTC & Fingerprint de Segurança (RFC-001 §3.2, §4.4, §5.2 e CFP 011/2018)
  async initiateWebRtcSession(dto: InitiateWebRtcAuditSessionDTO): Promise<InitiateWebRtcAuditSessionResponse> {
    return await request<InitiateWebRtcAuditSessionResponse>('/teleconsultation/webrtc/session/initiate', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyWebRtcFingerprint(dto: VerifyWebRtcFingerprintDTO): Promise<VerifyWebRtcFingerprintResponse> {
    return await request<VerifyWebRtcFingerprintResponse>('/teleconsultation/webrtc/session/verify-fingerprint', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async recordWebRtcMetrics(dto: RecordWebRtcMetricsDTO): Promise<RecordWebRtcMetricsResponse> {
    return await request<RecordWebRtcMetricsResponse>('/teleconsultation/webrtc/session/metrics', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async terminateWebRtcSession(dto: TerminateWebRtcSessionDTO): Promise<TerminateWebRtcSessionResponse> {
    return await request<TerminateWebRtcSessionResponse>('/teleconsultation/webrtc/session/terminate', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async getWebRtcSessions(): Promise<WebRtcSessionListResponse> {
    return await request<WebRtcSessionListResponse>('/teleconsultation/webrtc/sessions');
  },

  async getWebRtcSession(sessionId: string): Promise<{ success: boolean; session: WebRtcSessionAuditRecord }> {
    return await request<{ success: boolean; session: WebRtcSessionAuditRecord }>(`/teleconsultation/webrtc/session/${sessionId}`);
  },

  // 22. WAF em Camada de Aplicação (SQLi, XSS, Path Traversal & Heurística Clínica - RFC-001 §4.4, §5.2)
  async getWafOverview(): Promise<WafOverviewResponse> {
    return await request<WafOverviewResponse>('/security/waf/overview');
  },

  async inspectWafPayload(dto: InspectPayloadDTO): Promise<InspectPayloadResponse> {
    return await request<InspectPayloadResponse>('/security/waf/inspect', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async updateWafMode(dto: UpdateWafModeDTO): Promise<UpdateWafModeResponse> {
    return await request<UpdateWafModeResponse>('/security/waf/mode', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  // 23. Simulação de Resiliência de Redes & Inteligibilidade da Fala Clínica (RFC-001 §3.2, §5.1, §5.2 e CFP 011/2018)
  async getNetworkResiliencePresets(): Promise<NetworkSimulationPresetsResponse> {
    return await request<NetworkSimulationPresetsResponse>('/teleconsultation/network-resilience/presets');
  },

  async runNetworkSimulation(dto: RunNetworkSimulationDTO): Promise<NetworkSimulationResponse> {
    return await request<NetworkSimulationResponse>('/teleconsultation/network-resilience/simulate', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async getNetworkResilienceHistory(limit = 20): Promise<NetworkResilienceHistoryResponse> {
    return await request<NetworkResilienceHistoryResponse>(`/teleconsultation/network-resilience/history?limit=${limit}`);
  },

  async getNetworkResilienceMetrics(): Promise<{ success: boolean; metrics: NetworkResilienceMetrics }> {
    return await request<{ success: boolean; metrics: NetworkResilienceMetrics }>('/teleconsultation/network-resilience/metrics');
  },

  // 24. Gravação com Sharding Criptográfico & Destruição Programada / Crypto-Shredding (RFC-001 §3.2, §3.3, §4.2 e CFP 011/2018)
  async createMediaRecording(dto: CreateMediaSessionDTO): Promise<MediaRecordingResponse> {
    return await request<MediaRecordingResponse>('/teleconsultation/media/recordings', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async uploadMediaChunk(recordingId: string, dto: UploadMediaChunkDTO): Promise<{ success: boolean; shard: any; message: string }> {
    return await request<{ success: boolean; shard: any; message: string }>(`/teleconsultation/media/recordings/${recordingId}/chunks`, {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async finalizeMediaRecording(recordingId: string): Promise<MediaRecordingResponse> {
    return await request<MediaRecordingResponse>(`/teleconsultation/media/recordings/${recordingId}/finalize`, {
      method: 'POST'
    });
  },

  async simulateMediaPipeline(recordingId: string, autoShred = true): Promise<SimulateMediaPipelineResponse> {
    return await request<SimulateMediaPipelineResponse>(`/teleconsultation/media/recordings/${recordingId}/simulate-pipeline`, {
      method: 'POST',
      body: JSON.stringify({ autoShred })
    });
  },

  async executeCryptoShredding(recordingId: string, dto?: ExecuteCryptoShreddingDTO): Promise<CryptoShreddingResponse> {
    return await request<CryptoShreddingResponse>(`/teleconsultation/media/recordings/${recordingId}/shred`, {
      method: 'POST',
      body: JSON.stringify(dto || {})
    });
  },

  async getMediaRecordings(): Promise<MediaSessionListResponse> {
    return await request<MediaSessionListResponse>('/teleconsultation/media/recordings');
  },

  async getMediaRecordingCertificate(recordingId: string): Promise<CryptoShreddingResponse> {
    return await request<CryptoShreddingResponse>(`/teleconsultation/media/recordings/${recordingId}/certificate`);
  },

  async getMediaStorageMetrics(): Promise<{ success: boolean; metrics: MediaStorageMetrics }> {
    return await request<{ success: boolean; metrics: MediaStorageMetrics }>('/teleconsultation/media/metrics');
  },

  async startClinicalSessionMonitoring(dto: StartSessionMonitoringDTO): Promise<SessionMonitoringResponse> {
    return await request<SessionMonitoringResponse>('/teleconsultation/session-recovery/start', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async sendSessionHeartbeat(dto: SessionHeartbeatDTO): Promise<{ success: boolean; session: ClinicalSessionRecoverySession }> {
    return await request<{ success: boolean; session: ClinicalSessionRecoverySession }>('/teleconsultation/session-recovery/heartbeat', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async triggerSessionDisconnection(dto: TriggerSessionDisconnectionDTO): Promise<SessionMonitoringResponse> {
    return await request<SessionMonitoringResponse>('/teleconsultation/session-recovery/disconnect', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async attemptSessionReconnect(dto: AttemptSessionReconnectDTO): Promise<SessionReconnectResponse> {
    return await request<SessionReconnectResponse>('/teleconsultation/session-recovery/reconnect', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async completeClinicalSession(dto: CompleteClinicalSessionDTO): Promise<{ success: boolean; session: ClinicalSessionRecoverySession; message: string }> {
    return await request<{ success: boolean; session: ClinicalSessionRecoverySession; message: string }>('/teleconsultation/session-recovery/complete', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async getClinicalSessionsRecoveryList(): Promise<SessionRecoveryListResponse> {
    return await request<SessionRecoveryListResponse>('/teleconsultation/session-recovery/sessions');
  },

  async getSessionRecoveryMetrics(): Promise<{ success: boolean; metrics: SessionRecoveryMetrics }> {
    return await request<{ success: boolean; metrics: SessionRecoveryMetrics }>('/teleconsultation/session-recovery/metrics');
  },

  async generateZkpProof(dto: GenerateZkpProofDTO): Promise<ZkpProofResponse> {
    return await request<ZkpProofResponse>('/security/zkp/generate', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyZkpProof(dto: VerifyZkpProofDTO): Promise<ZkpVerificationResponse> {
    return await request<ZkpVerificationResponse>('/security/zkp/verify', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async getZkpProofs(): Promise<ZkpProofListResponse> {
    return await request<ZkpProofListResponse>('/security/zkp/proofs');
  },

  async getZkpMetrics(): Promise<{ success: boolean; metrics: ZkpSystemMetrics }> {
    return await request<{ success: boolean; metrics: ZkpSystemMetrics }>('/security/zkp/metrics');
  },

  // 22. Monitor de Vazamentos na Dark Web & Contenção de Incidentes (RFC-001 §4.4, LGPD Art. 46/48)
  async checkCredentialBreach(dto: CheckCredentialBreachDTO): Promise<CredentialBreachCheckResponse> {
    return await request<CredentialBreachCheckResponse>('/security/threat-intelligence/check', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async triggerDarkWebScan(dto?: TriggerDarkWebScanDTO): Promise<ThreatScanResponse> {
    return await request<ThreatScanResponse>('/security/threat-intelligence/scan', {
      method: 'POST',
      body: JSON.stringify(dto || {})
    });
  },

  async containIncident(dto: ContainIncidentDTO): Promise<ContainIncidentResponse> {
    return await request<ContainIncidentResponse>('/security/threat-intelligence/contain', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async resolveIncident(dto: ResolveIncidentDTO): Promise<ResolveIncidentResponse> {
    return await request<ResolveIncidentResponse>('/security/threat-intelligence/resolve', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async getThreatIntelligenceOverview(): Promise<ThreatIntelligenceOverviewResponse> {
    return await request<ThreatIntelligenceOverviewResponse>('/security/threat-intelligence/overview');
  },

  async getPatientConsentLedger(patientId: string): Promise<{ success: boolean; ledger: PatientConsentLedger }> {
    return await request<{ success: boolean; ledger: PatientConsentLedger }>(`/consent/patient/${patientId}`);
  },

  async grantGranularConsent(dto: GrantGranularConsentDTO): Promise<GranularConsentResponse> {
    return await request<GranularConsentResponse>('/consent/grant', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async revokeGranularConsent(dto: RevokeGranularConsentDTO): Promise<GranularConsentResponse> {
    return await request<GranularConsentResponse>('/consent/revoke', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async enforceConsent(dto: EnforceConsentDTO): Promise<EnforceConsentResponse> {
    return await request<EnforceConsentResponse>('/consent/enforce', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyConsentToken(token: string): Promise<ConsentReceiptResponse> {
    return await request<ConsentReceiptResponse>(`/consent/verify/${encodeURIComponent(token)}`);
  },

  async getConsentOverview(patientId?: string): Promise<ConsentLedgerOverviewResponse> {
    const url = patientId ? `/consent/overview?patientId=${encodeURIComponent(patientId)}` : '/consent/overview';
    return await request<ConsentLedgerOverviewResponse>(url);
  }
};






