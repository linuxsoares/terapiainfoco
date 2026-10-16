import type {
  CreatePatientDTO,
  DecryptedPatient,
  CreateAppointmentDTO,
  CreateRecurrentAppointmentsResponse,
  DecryptedAppointment,
  AppointmentStatus,
  SendReminderDTO,
  SendReminderResponse,
  ReminderChannel,
  PatientClinicalTimelineResponse,
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
  PatientConsentLedger,
  EvaluateClipboardDlpDTO,
  InspectClipboardDlpDTO,
  EvaluateClipboardDlpResponse,
  InspectClipboardDlpResponse,
  DlpOverviewResponse,
  DlpPolicyMode,
  ClinicalNotaryBlock,
  NotaryChainVerificationResult,
  SealClinicalRecordDTO,
  VerifyNotarySealDTO,
  IssueNotaryCertificateDTO,
  SealClinicalRecordResponse,
  VerifyNotaryResponse,
  NotaryOverviewResponse,
  NotaryCertificateResponse,
  ExecuteDataPurgeDTO,
  VerifyPurgeProofDTO,
  PurgeCandidatesResponse,
  ExecutePurgeResponse,
  PurgeOverviewResponse,
  VerifyPurgeProofResponse,
  PurgeCertificateResponse,
  ResolveDidResponse,
  IssueVerifiableCredentialDTO,
  IssueVerifiableCredentialResponse,
  VerifyVerifiableCredentialDTO,
  VerifyVerifiableCredentialResponse,
  RevokeVerifiableCredentialDTO,
  RevokeVerifiableCredentialResponse,
  DidFederationOverviewResponse,
  PatientVerifiableCredentialsResponse,
  EvaluateAccessRiskDTO,
  EvaluateAccessRiskResponse,
  SimulateAccessPatternDTO,
  SimulateAccessPatternResponse,
  ApplyUebaContainmentDTO,
  ApplyUebaContainmentResponse,
  UebaOverviewResponse,
  UebaIncidentsResponse,
  GetUserUebaProfileResponse,
  ExecuteDpQueryDTO,
  ExecuteDpQueryResponse,
  AllocateDpBudgetDTO,
  AllocateDpBudgetResponse,
  VerifyDpProofDTO,
  VerifyDpProofResponse,
  GenerateDpBenchmarkDTO,
  GenerateDpBenchmarkResponse,
  DpOverviewResponse,
  DpProjectsResponse,
  TerminateSessionDTO,
  TerminateSessionResponse,
  TerminateAllOtherSessionsDTO,
  TerminateAllOtherSessionsResponse,
  SimulateConcurrentLoginDTO,
  SimulateConcurrentLoginResponse,
  VerifyDpopBindingDTO,
  VerifyDpopBindingResponse,
  SessionOverviewResponse,
  ActiveSessionsListResponse,
  SessionRevocationProof,
  RequestPowChallengeDTO,
  RequestPowChallengeResponse,
  SubmitPowSolutionDTO,
  SubmitPowSolutionResponse,
  SimulateBruteForceAttackDTO,
  SimulateBruteForceAttackResponse,
  ResetIpReputationDTO,
  ResetIpReputationResponse,
  PowDefenseOverviewResponse,
  CreateHoneypotTrapDTO,
  CreateHoneypotTrapResponse,
  TriggerHoneypotTrapResponse,
  SimulateScrapingAttackDTO,
  SimulateScrapingAttackResponse,
  ReleaseTarpitQuarantineDTO,
  ReleaseTarpitQuarantineResponse,
  TarpitMetricsOverviewResponse,
  TarpitDefenseProof,
  CreateSessionTimestampDTO,
  CreateSessionTimestampResponse,
  VerifySessionTimestampDTO,
  VerifySessionTimestampResponse,
  SimulateTimestampTamperDTO,
  SimulateTimestampTamperResponse,
  TimestampNotaryOverviewResponse,
  ClinicalSessionTimestampToken,
  SimulateHppAttackDTO,
  SimulateHppAttackResponse,
  SimulateHeaderInjectionDTO,
  SimulateHeaderInjectionResponse,
  VerifyHttpGuardSealDTO,
  VerifyHttpGuardSealResponse,
  HttpGuardOverviewResponse,
  HttpGuardIncident,
  CreateHomomorphicCohortDTO,
  DecryptCohortAggregationDTO,
  VerifyHomomorphicProofSealDTO,
  HomomorphicOverviewResponse,
  HomomorphicCohortResponse,
  HomomorphicDecryptResponse,
  HomomorphicVerifyProofResponse,
  Cid11Item,
  PaillierPublicKey,
  SimulateSsrfDTO,
  SimulateSsrfResponse,
  ValidateWebhookUrlDTO,
  ValidateWebhookUrlResponse,
  VerifySsrfSealDTO,
  VerifySsrfSealResponse,
  SsrfOverviewResponse,
  SsrfIncident,
  EvaluateRateLimitDTO,
  EvaluateRateLimitResponse,
  ConfigureRateLimitRuleDTO,
  ResetClientBucketDTO,
  VerifyRateLimitSealDTO,
  VerifyRateLimitSealResponse,
  AdvancedRateLimitOverviewResponse,
  RateLimitRuleConfig,
  AllocateSecureBufferDTO,
  AllocateSecureBufferResponse,
  ZeroizeSecureBufferDTO,
  ZeroizeSecureBufferResponse,
  InspectHeapSprayingDTO,
  InspectHeapSprayingResponse,
  PurgeExpiredDeksResponse,
  VerifyZeroizationSealDTO,
  VerifyZeroizationSealResponse,
  SecureMemoryOverviewResponse,
  ValidateTlsPinDTO,
  ValidateTlsPinResponse,
  RegisterTlsPinDTO,
  RegisterTlsPinResponse,
  RotateTlsCaDTO,
  RotateTlsCaResponse,
  QuarantineCompromisedCaDTO,
  QuarantineCompromisedCaResponse,
  VerifyTlsPinSealDTO,
  VerifyTlsPinSealResponse,
  TlsPinningOverviewResponse,
  AssessDevicePostureDTO,
  AssessDevicePostureResponse,
  QuarantineDeviceDTO,
  QuarantineDeviceResponse,
  ReleaseDeviceQuarantineDTO,
  ReleaseDeviceQuarantineResponse,
  UpdatePosturePolicyDTO,
  UpdatePosturePolicyResponse,
  VerifyDevicePostureSealDTO,
  VerifyDevicePostureSealResponse,
  DevicePostureOverviewResponse,
  GeneratePqcKeyPairDTO,
  GeneratePqcKeyPairResponse,
  EncapsulatePqcRecordDTO,
  EncapsulatePqcRecordResponse,
  DecapsulatePqcRecordDTO,
  DecapsulatePqcRecordResponse,
  SignPqcDocumentDTO,
  SignPqcDocumentResponse,
  VerifyPqcSignatureDTO,
  VerifyPqcSignatureResponse,
  SimulateQuantumAttackDTO,
  SimulateQuantumAttackResponse,
  VerifyPqcSealDTO,
  VerifyPqcSealResponse,
  PqcOverviewResponse,
  GenerateBlindAuthorityKeyDTO,
  GenerateBlindAuthorityKeyResponse,
  BlindMessageDTO,
  BlindMessageResponse,
  SignBlindMessageDTO,
  SignBlindMessageResponse,
  UnblindSignatureDTO,
  UnblindSignatureResponse,
  RedeemOrCastBallotDTO,
  RedeemOrCastBallotResponse,
  VerifyBlindTokenDTO,
  VerifyBlindTokenResponse,
  SimulateDoubleSpendDTO,
  SimulateDoubleSpendResponse,
  VerifyBlindSealDTO,
  VerifyBlindSealResponse,
  BlindSignaturesOverviewResponse,
  InspectSideChannelDTO,
  InspectSideChannelResponse,
  RunWelchTestDTO,
  RunWelchTestResponse,
  CalibrateJitterDTO,
  CalibrateJitterResponse,
  UpdateSideChannelPolicyDTO,
  UpdateSideChannelPolicyResponse,
  SimulateTimingAttackDTO,
  SimulateTimingAttackResponse,
  VerifySideChannelSealDTO,
  VerifySideChannelSealResponse,
  SideChannelOverviewResponse,
  VerifyNonceDTO,
  VerifyNonceResponse,
  GetSlidingWindowStatusDTO,
  GetSlidingWindowStatusResponse,
  RotateBloomFilterResponse,
  UpdateReplayPolicyDTO,
  UpdateReplayPolicyResponse,
  SimulateReplayAttackDTO,
  SimulateReplayAttackResponse,
  VerifyAntiReplaySealDTO,
  VerifyAntiReplaySealResponse,
  AntiReplayOverviewResponse,
  CreateWatermarkSeedDTO,
  CreateWatermarkSeedResponse,
  EmbedVisualWatermarkDTO,
  EmbedVisualWatermarkResponse,
  ExtractLeakSourceDTO,
  ExtractLeakSourceResponse,
  SimulateScreenLeakDTO,
  SimulateScreenLeakResponse,
  UpdateWatermarkStrengthDTO,
  UpdateWatermarkStrengthResponse,
  VerifyVisualWatermarkSealDTO,
  VerifyVisualWatermarkSealResponse,
  VisualWatermarkOverviewResponse,
  IssueEphemeralTokenDTO,
  IssueEphemeralTokenResponse,
  ConsumeEphemeralTokenDTO,
  ConsumeEphemeralTokenResponse,
  RevokeEphemeralTokenDTO,
  RevokeEphemeralTokenResponse,
  SimulateTokenIntrusionDTO,
  SimulateTokenIntrusionResponse,
  UpdateEphemeralPolicyDTO,
  UpdateEphemeralPolicyResponse,
  VerifyEphemeralTokenSealDTO,
  VerifyEphemeralTokenSealResponse,
  EphemeralTokenOverviewResponse,
  CreateCourtOrderVaultDTO,
  CreateCourtOrderVaultResponse,
  SubmitCustodianShareDTO,
  SubmitCustodianShareResponse,
  ReconstructAndDecryptDTO,
  ReconstructAndDecryptResponse,
  SimulateThresholdAttackDTO,
  SimulateThresholdAttackResponse,
  VerifyThresholdSealDTO,
  VerifyThresholdSealResponse,
  ThresholdVaultOverviewResponse,
  ScanObjectPayloadDTO,
  ScanObjectPayloadResponse,
  UpdatePollutionPolicyDTO,
  UpdatePollutionPolicyResponse,
  SimulatePollutionAttackDTO,
  SimulatePollutionAttackResponse,
  VerifyPollutionSealDTO,
  VerifyPollutionSealResponse,
  PollutionGuardOverviewResponse,
  InspectCacheRequestDTO,
  InspectCacheResponseDTO,
  UpdateCachePolicyDTO,
  UpdateCachePolicyResponseDTO,
  SimulateCacheAttackDTO,
  SimulateCacheAttackResponseDTO,
  VerifyCacheSealDTO,
  VerifyCacheSealResponseDTO,
  CacheGuardOverviewResponse,
  ScanXmlPayloadDTO,
  ScanXmlPayloadResponse,
  SimulateXmlAttackDTO,
  SimulateXmlAttackResponse,
  UpdateXmlPolicyDTO,
  UpdateXmlPolicyResponse,
  VerifyXmlSealDTO,
  VerifyXmlSealResponse,
  XmlGuardOverviewResponse,
  EvaluateSessionDTO,
  EvaluateSessionResponse,
  RotateSessionDTO,
  RotateSessionResponse,
  UpdateSessionGuardPolicyDTO,
  UpdateSessionGuardPolicyResponse,
  SimulateSessionAttackDTO,
  SimulateSessionAttackResponse,
  VerifySessionSealDTO,
  VerifySessionSealResponse,
  SessionGuardOverviewResponse,
  AnalyzeRegexDTO,
  AnalyzeRegexResponse,
  ExecuteSafeRegexDTO,
  ExecuteSafeRegexResponse,
  UpdateRedosPolicyDTO,
  UpdateRedosPolicyResponse,
  SimulateRedosAttackDTO,
  SimulateRedosAttackResponse,
  VerifyRedosSealDTO,
  VerifyRedosSealResponse,
  InspectTemplateDTO,
  InspectTemplateResponse,
  RenderSandboxedTemplateDTO,
  RenderSandboxedTemplateResponse,
  UpdateSstiPolicyDTO,
  UpdateSstiPolicyResponse,
  SimulateSstiAttackDTO,
  SimulateSstiAttackResponse,
  VerifySstiSealDTO,
  VerifySstiSealResponse,
  SstiGuardOverviewResponse,
  RedosGuardOverviewResponse,
  InspectCommandInputDTO,
  InspectCommandInputResponse,
  ExecuteSandboxedCommandDTO,
  ExecuteSandboxedCommandResponse,
  UpdateCommandPolicyDTO,
  UpdateCommandPolicyResponse,
  SimulateCommandAttackDTO,
  SimulateCommandAttackResponse,
  VerifyCommandSealDTO,
  VerifyCommandSealResponse,
  CommandGuardOverviewResponse,
  InspectPathInputDTO,
  InspectPathInputResponse,
  ResolveSafePathDTO,
  ResolveSafePathResponse,
  UpdatePathPolicyDTO,
  UpdatePathPolicyResponse,
  SimulatePathAttackDTO,
  SimulatePathAttackResponse,
  VerifyPathSealDTO,
  VerifyPathSealResponse,
  PathGuardOverviewResponse,
  InspectExpressionDTO,
  InspectExpressionResponse,
  EvaluateExpressionDTO,
  EvaluateExpressionResponse,
  UpdateExpressionPolicyDTO,
  UpdateExpressionPolicyResponse,
  SimulateExpressionAttackDTO,
  SimulateExpressionAttackResponse,
  VerifyExpressionSealDTO,
  VerifyExpressionSealResponse,
  ExpressionGuardOverviewResponse,
  InspectGraphQLQueryDTO,
  InspectGraphQLQueryResponse,
  UpdateGraphQLPolicyDTO,
  UpdateGraphQLPolicyResponse,
  SimulateGraphQLAttackDTO,
  SimulateGraphQLAttackResponse,
  VerifyGraphQLCostSealDTO,
  VerifyGraphQLCostSealResponse,
  GraphQLGuardOverviewResponse,
  GetGraphQLSchemasResponse,
  InspectHttp2HeadersDTO,
  InspectHttp2HeadersResponse,
  UpdateHttp2PolicyDTO,
  UpdateHttp2PolicyResponse,
  SimulateHttp2AttackDTO,
  SimulateHttp2AttackResponse,
  VerifyHttp2SealDTO,
  VerifyHttp2SealResponse,
  Http2GuardOverviewResponse,
  InspectDependenciesDTO,
  InspectDependenciesResponse,
  InspectDynamicImportDTO,
  InspectDynamicImportResponse,
  UpdateDependencyPolicyDTO,
  UpdateDependencyPolicyResponse,
  SimulateSupplyChainAttackDTO,
  SimulateSupplyChainAttackResponse,
  VerifySupplyChainSealDTO,
  VerifySupplyChainSealResponse,
  SupplyChainOverviewResponse,
  DependencyNode
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

  // Linha do Tempo Clínica Longitudinal do Paciente (RFC §3.4)
  async getPatientTimeline(patientId: string): Promise<PatientClinicalTimelineResponse> {
    const res = await request<{ success: boolean; timeline: PatientClinicalTimelineResponse }>(`/patients/${patientId}/timeline`);
    return res.timeline;
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

  // Agendamento Recorrente & Séries Clínicas (RFC §3.1)
  async createRecurrentAppointments(dto: CreateAppointmentDTO, therapistId = '00000000-0000-0000-0000-000000000001'): Promise<CreateRecurrentAppointmentsResponse> {
    return await request<CreateRecurrentAppointmentsResponse>('/appointments/recurrent', {
      method: 'POST',
      body: JSON.stringify({ ...dto, therapistId })
    });
  },

  async cancelAppointmentSeries(seriesId: string): Promise<{ success: boolean; canceledCount: number; seriesId: string }> {
    return await request<{ success: boolean; canceledCount: number; seriesId: string }>(`/appointments/series/${seriesId}`, {
      method: 'DELETE'
    });
  },

  // Notificações & Lembretes Multicanal (WhatsApp/Email - RFC §3.1)
  async sendAppointmentReminder(dto: SendReminderDTO): Promise<SendReminderResponse> {
    return await request<SendReminderResponse>(`/appointments/${dto.appointmentId}/reminders`, {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async previewAppointmentReminder(appointmentId: string, channel: ReminderChannel = 'WHATSAPP' as any, timing?: string): Promise<{
    message: string;
    channel: string;
    whatsappDirectUrl?: string;
    preview: {
      renderedMessage: string;
      recipientPhone?: string;
      recipientEmail?: string;
      whatsappDirectUrl?: string;
      patientName: string;
      meetUrl: string;
      scheduledStart: string;
    };
  }> {
    const timingQuery = timing ? `&timing=${timing}` : '';
    const res = await request<{ success: boolean; preview: any }>(`/appointments/${appointmentId}/reminders/preview?channel=${channel}${timingQuery}`);
    return {
      message: res.preview?.renderedMessage || '',
      channel: String(channel),
      whatsappDirectUrl: res.preview?.whatsappDirectUrl,
      preview: res.preview
    };
  },

  async getAppointmentReminders(appointmentId: string): Promise<any[]> {
    const res = await request<{ success: boolean; reminders: any[] }>(`/appointments/${appointmentId}/reminders`);
    return res.reminders;
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
  },

  async evaluateClipboardDlp(dto: EvaluateClipboardDlpDTO): Promise<EvaluateClipboardDlpResponse> {
    return await request<EvaluateClipboardDlpResponse>('/dlp/evaluate', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async inspectClipboardDlp(dto: InspectClipboardDlpDTO): Promise<InspectClipboardDlpResponse> {
    return await request<InspectClipboardDlpResponse>('/dlp/inspect', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async getDlpOverview(): Promise<DlpOverviewResponse> {
    return await request<DlpOverviewResponse>('/dlp/overview');
  },

  async updateDlpPolicy(policyMode: DlpPolicyMode): Promise<{ success: boolean; activePolicy: DlpPolicyMode; message: string }> {
    return await request<{ success: boolean; activePolicy: DlpPolicyMode; message: string }>('/dlp/policy', {
      method: 'PUT',
      body: JSON.stringify({ policyMode })
    });
  },

  async sealClinicalRecord(dto: SealClinicalRecordDTO): Promise<SealClinicalRecordResponse> {
    return await request<SealClinicalRecordResponse>('/notary/seal', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyNotarySeal(dto: VerifyNotarySealDTO): Promise<VerifyNotaryResponse> {
    return await request<VerifyNotaryResponse>('/notary/verify', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async getPatientNotaryBlocks(patientId: string): Promise<{ success: boolean; patientId: string; blocks: ClinicalNotaryBlock[]; chainVerification: NotaryChainVerificationResult }> {
    return await request<{ success: boolean; patientId: string; blocks: ClinicalNotaryBlock[]; chainVerification: NotaryChainVerificationResult }>(`/notary/patient/${patientId}`);
  },

  async issueNotaryCertificate(dto: IssueNotaryCertificateDTO): Promise<NotaryCertificateResponse> {
    return await request<NotaryCertificateResponse>('/notary/certificate', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async getNotaryOverview(): Promise<NotaryOverviewResponse> {
    return await request<NotaryOverviewResponse>('/notary/overview');
  },

  async getPurgeCandidates(): Promise<PurgeCandidatesResponse> {
    return await request<PurgeCandidatesResponse>('/purge/candidates');
  },

  async executeDataPurge(dto: ExecuteDataPurgeDTO): Promise<ExecutePurgeResponse> {
    return await request<ExecutePurgeResponse>('/purge/execute', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyPurgeProof(dto: VerifyPurgeProofDTO): Promise<VerifyPurgeProofResponse> {
    return await request<VerifyPurgeProofResponse>('/purge/verify', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async getPurgeOverview(): Promise<PurgeOverviewResponse> {
    return await request<PurgeOverviewResponse>('/purge/overview');
  },

  async getPurgeCertificate(certificateId: string): Promise<PurgeCertificateResponse> {
    return await request<PurgeCertificateResponse>(`/purge/certificate/${certificateId}`);
  },

  // 26. Federação de Identidades Descentralizadas (DID) & Credenciais Verificáveis (RFC-001 §3.5)
  async resolveDid(did: string): Promise<ResolveDidResponse> {
    return await request<ResolveDidResponse>(`/did/resolve/${encodeURIComponent(did)}`);
  },

  async issueVerifiableCredential(dto: IssueVerifiableCredentialDTO): Promise<IssueVerifiableCredentialResponse> {
    return await request<IssueVerifiableCredentialResponse>('/did/credentials/issue', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyVerifiableCredential(dto: VerifyVerifiableCredentialDTO): Promise<VerifyVerifiableCredentialResponse> {
    return await request<VerifyVerifiableCredentialResponse>('/did/credentials/verify', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async revokeVerifiableCredential(dto: RevokeVerifiableCredentialDTO): Promise<RevokeVerifiableCredentialResponse> {
    return await request<RevokeVerifiableCredentialResponse>('/did/credentials/revoke', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async getDidFederationOverview(): Promise<DidFederationOverviewResponse> {
    return await request<DidFederationOverviewResponse>('/did/overview');
  },

  async getPatientVerifiableCredentials(patientId: string): Promise<PatientVerifiableCredentialsResponse> {
    return await request<PatientVerifiableCredentialsResponse>(`/did/credentials/patient/${encodeURIComponent(patientId)}`);
  },

  async getUebaOverview(): Promise<UebaOverviewResponse> {
    return await request<UebaOverviewResponse>('/ueba/overview');
  },

  async evaluateUebaAccess(dto: EvaluateAccessRiskDTO): Promise<EvaluateAccessRiskResponse> {
    return await request<EvaluateAccessRiskResponse>('/ueba/evaluate', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async simulateUebaPattern(dto: SimulateAccessPatternDTO): Promise<SimulateAccessPatternResponse> {
    return await request<SimulateAccessPatternResponse>('/ueba/simulate', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async applyUebaContainment(dto: ApplyUebaContainmentDTO): Promise<ApplyUebaContainmentResponse> {
    return await request<ApplyUebaContainmentResponse>('/ueba/contain', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async getUebaIncidents(): Promise<UebaIncidentsResponse> {
    return await request<UebaIncidentsResponse>('/ueba/incidents');
  },

  async getUserUebaProfile(userId: string): Promise<GetUserUebaProfileResponse> {
    return await request<GetUserUebaProfileResponse>(`/ueba/profile/${encodeURIComponent(userId)}`);
  },

  // 32. Protocolo de Privacidade Diferencial (ε-DP) & Benchmarks Epidemiológicos (LGPD Art. 13 & CFP nº 001/2009)
  async getDpOverview(): Promise<DpOverviewResponse> {
    return await request<DpOverviewResponse>('/differential-privacy/overview');
  },

  async getDpProjects(): Promise<DpProjectsResponse> {
    return await request<DpProjectsResponse>('/differential-privacy/projects');
  },

  async executeDpQuery(dto: ExecuteDpQueryDTO): Promise<ExecuteDpQueryResponse> {
    return await request<ExecuteDpQueryResponse>('/differential-privacy/query', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async generateDpBenchmark(dto: GenerateDpBenchmarkDTO): Promise<GenerateDpBenchmarkResponse> {
    return await request<GenerateDpBenchmarkResponse>('/differential-privacy/benchmark', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyDpProof(dto: VerifyDpProofDTO): Promise<VerifyDpProofResponse> {
    return await request<VerifyDpProofResponse>('/differential-privacy/verify-proof', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async allocateDpBudget(dto: AllocateDpBudgetDTO): Promise<AllocateDpBudgetResponse> {
    return await request<AllocateDpBudgetResponse>('/differential-privacy/allocate-budget', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  // 33. Gestão Segura de Sessões Clínicas com Revogação Forçada de Dispositivos Concorrentes & DPoP Token Binding (RFC-001 §4.4)
  async getSessionOverview(userId?: string): Promise<SessionOverviewResponse> {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    return await request<SessionOverviewResponse>(`/session-binding/overview${query}`);
  },

  async getActiveSessions(userId?: string, currentSessionId?: string): Promise<ActiveSessionsListResponse> {
    const params = new URLSearchParams();
    if (userId) params.set('userId', userId);
    if (currentSessionId) params.set('currentSessionId', currentSessionId);
    const query = params.toString() ? `?${params.toString()}` : '';
    return await request<ActiveSessionsListResponse>(`/session-binding/sessions${query}`);
  },

  async terminateSession(dto: TerminateSessionDTO): Promise<TerminateSessionResponse> {
    return await request<TerminateSessionResponse>('/session-binding/terminate', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async terminateAllOtherSessions(dto: TerminateAllOtherSessionsDTO): Promise<TerminateAllOtherSessionsResponse> {
    return await request<TerminateAllOtherSessionsResponse>('/session-binding/terminate-others', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async simulateConcurrentLogin(dto: SimulateConcurrentLoginDTO): Promise<SimulateConcurrentLoginResponse> {
    return await request<SimulateConcurrentLoginResponse>('/session-binding/simulate-concurrent', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyDpopBinding(dto: VerifyDpopBindingDTO): Promise<VerifyDpopBindingResponse> {
    return await request<VerifyDpopBindingResponse>('/session-binding/verify-dpop', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifySessionSeal(sessionId: string): Promise<{ success: boolean; verification: SessionRevocationProof }> {
    return await request<{ success: boolean; verification: SessionRevocationProof }>(`/session-binding/verify-seal/${encodeURIComponent(sessionId)}`);
  },

  // 34. Defesa Ativa contra Força Bruta & PoW Criptográfico (RFC-001 §4.4, OWASP OAT-007 / OAT-008)
  async getPowOverview(): Promise<PowDefenseOverviewResponse> {
    return await request<PowDefenseOverviewResponse>('/brute-force-pow/overview');
  },

  async requestPowChallenge(dto?: RequestPowChallengeDTO): Promise<RequestPowChallengeResponse> {
    return await request<RequestPowChallengeResponse>('/brute-force-pow/challenge', {
      method: 'POST',
      body: JSON.stringify(dto || {})
    });
  },

  async submitPowSolution(dto: SubmitPowSolutionDTO): Promise<SubmitPowSolutionResponse> {
    return await request<SubmitPowSolutionResponse>('/brute-force-pow/verify', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async simulateBruteForceAttack(dto: SimulateBruteForceAttackDTO): Promise<SimulateBruteForceAttackResponse> {
    return await request<SimulateBruteForceAttackResponse>('/brute-force-pow/simulate-attack', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async resetIpReputation(dto: ResetIpReputationDTO): Promise<ResetIpReputationResponse> {
    return await request<ResetIpReputationResponse>('/brute-force-pow/reset-ip', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyPowSeal(seal: string): Promise<{ success: boolean; verification: any }> {
    return await request<{ success: boolean; verification: any }>('/brute-force-pow/verify-seal', {
      method: 'POST',
      body: JSON.stringify({ seal })
    });
  },

  // 35. Proteção Anti-Automação, Honeypot Dinâmico & Tarpit Criptográfico (OWASP OAT-011 / OAT-020 & RFC-001 §4.4)
  async getTarpitOverview(): Promise<TarpitMetricsOverviewResponse> {
    return await request<TarpitMetricsOverviewResponse>('/anti-automation/overview');
  },

  async createHoneypotTrap(dto: CreateHoneypotTrapDTO): Promise<CreateHoneypotTrapResponse> {
    return await request<CreateHoneypotTrapResponse>('/anti-automation/trap/create', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async triggerHoneypotTrap(token: string): Promise<TriggerHoneypotTrapResponse> {
    return await request<TriggerHoneypotTrapResponse>(`/anti-automation/trap/${encodeURIComponent(token)}`);
  },

  async simulateScrapingAttack(dto: SimulateScrapingAttackDTO): Promise<SimulateScrapingAttackResponse> {
    return await request<SimulateScrapingAttackResponse>('/anti-automation/simulate-scraping', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async releaseTarpitQuarantine(dto: ReleaseTarpitQuarantineDTO): Promise<ReleaseTarpitQuarantineResponse> {
    return await request<ReleaseTarpitQuarantineResponse>('/anti-automation/release-ip', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyTarpitSeal(seal: string): Promise<{ success: boolean; verification: TarpitDefenseProof }> {
    return await request<{ success: boolean; verification: TarpitDefenseProof }>('/anti-automation/verify-seal', {
      method: 'POST',
      body: JSON.stringify({ seal })
    });
  },

  // 36. Certificação Notarial de Sessão Clínica em Tempo Real — RFC 3161 & ICP-Brasil TSA (DOC-ICP-11 / CFP 001/2009)
  async getTimestampNotaryOverview(): Promise<TimestampNotaryOverviewResponse> {
    return await request<TimestampNotaryOverviewResponse>('/tsa-notary/overview');
  },

  async createSessionTimestamp(dto: CreateSessionTimestampDTO): Promise<CreateSessionTimestampResponse> {
    return await request<CreateSessionTimestampResponse>('/tsa-notary/stamp-session', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifySessionTimestamp(dto: VerifySessionTimestampDTO): Promise<VerifySessionTimestampResponse> {
    return await request<VerifySessionTimestampResponse>('/tsa-notary/verify-token', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async simulateTimestampTampering(dto: SimulateTimestampTamperDTO): Promise<SimulateTimestampTamperResponse> {
    return await request<SimulateTimestampTamperResponse>('/tsa-notary/simulate-tampering', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async getSessionTimestampToken(sessionId: string): Promise<{ success: boolean; token: ClinicalSessionTimestampToken }> {
    return await request<{ success: boolean; token: ClinicalSessionTimestampToken }>(`/tsa-notary/session/${encodeURIComponent(sessionId)}/token`);
  },

  async getTsaInfo(): Promise<{ success: boolean; tsaCertificate: any; activePolicyOid: string; supportedOids: any[] }> {
    return await request<{ success: boolean; tsaCertificate: any; activePolicyOid: string; supportedOids: any[] }>('/tsa-notary/tsa-info');
  },

  // 37. Blindagem contra Parameter Pollution (HPP) & Injeção de Cabeçalhos (CRLF) — OWASP Top 10 API Security
  async getHttpGuardOverview(): Promise<HttpGuardOverviewResponse> {
    return await request<HttpGuardOverviewResponse>('/http-guard/overview');
  },

  async simulateHppAttack(dto: SimulateHppAttackDTO): Promise<SimulateHppAttackResponse> {
    return await request<SimulateHppAttackResponse>('/http-guard/simulate-hpp', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async simulateHeaderInjection(dto: SimulateHeaderInjectionDTO): Promise<SimulateHeaderInjectionResponse> {
    return await request<SimulateHeaderInjectionResponse>('/http-guard/simulate-header-injection', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyHttpGuardSeal(dto: VerifyHttpGuardSealDTO): Promise<VerifyHttpGuardSealResponse> {
    return await request<VerifyHttpGuardSealResponse>('/http-guard/verify-seal', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async getHttpGuardIncidents(): Promise<{ success: boolean; incidents: HttpGuardIncident[] }> {
    return await request<{ success: boolean; incidents: HttpGuardIncident[] }>('/http-guard/incidents');
  },

  // 38. Cifragem Homomórfica Parcial (PHE - Paillier Cryptosystem) & Agregação CID-11 (LGPD Art. 13 & CFP 001/2009)
  async getHomomorphicOverview(): Promise<HomomorphicOverviewResponse> {
    return await request<HomomorphicOverviewResponse>('/homomorphic/overview');
  },

  async getHomomorphicCatalog(): Promise<{ success: boolean; catalog: Cid11Item[] }> {
    return await request<{ success: boolean; catalog: Cid11Item[] }>('/homomorphic/catalog');
  },

  async getHomomorphicPublicKey(): Promise<{ success: boolean; publicKey: PaillierPublicKey }> {
    return await request<{ success: boolean; publicKey: PaillierPublicKey }>('/homomorphic/public-key');
  },

  async createHomomorphicCohort(dto: CreateHomomorphicCohortDTO): Promise<HomomorphicCohortResponse> {
    return await request<HomomorphicCohortResponse>('/homomorphic/cohorts', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async addPatientToHomomorphicCohort(
    cohortId: string,
    data: { diagnosesCidCodes?: string[]; encryptedVector?: any }
  ): Promise<HomomorphicCohortResponse> {
    return await request<HomomorphicCohortResponse>(`/homomorphic/cohorts/${encodeURIComponent(cohortId)}/patients`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async decryptHomomorphicCohort(dto: DecryptCohortAggregationDTO): Promise<HomomorphicDecryptResponse> {
    return await request<HomomorphicDecryptResponse>('/homomorphic/cohorts/decrypt', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyHomomorphicSeal(dto: VerifyHomomorphicProofSealDTO): Promise<HomomorphicVerifyProofResponse> {
    return await request<HomomorphicVerifyProofResponse>('/homomorphic/verify-seal', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  // 39. Proteção Avançada contra SSRF e DNS Rebinding em Webhooks (OWASP API8:2023 & ASVS v4.0)
  async getSsrfOverview(): Promise<SsrfOverviewResponse> {
    return await request<SsrfOverviewResponse>('/ssrf-guard/overview');
  },

  async simulateSsrf(dto: SimulateSsrfDTO): Promise<SimulateSsrfResponse> {
    return await request<SimulateSsrfResponse>('/ssrf-guard/simulate-ssrf', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async validateWebhookUrl(dto: ValidateWebhookUrlDTO): Promise<ValidateWebhookUrlResponse> {
    return await request<ValidateWebhookUrlResponse>('/ssrf-guard/validate-url', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifySsrfSeal(dto: VerifySsrfSealDTO): Promise<VerifySsrfSealResponse> {
    return await request<VerifySsrfSealResponse>('/ssrf-guard/verify-seal', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async getSsrfIncidents(): Promise<{ success: boolean; incidents: SsrfIncident[] }> {
    return await request<{ success: boolean; incidents: SsrfIncident[] }>('/ssrf-guard/incidents');
  },

  // 40. Rate Limiting Avançado (Token Bucket + Sliding Window Log - OWASP API4:2023)
  async getAdvancedRateLimitOverview(): Promise<AdvancedRateLimitOverviewResponse> {
    return await request<AdvancedRateLimitOverviewResponse>('/advanced-rate-limiter/overview');
  },

  async evaluateRateLimit(dto: EvaluateRateLimitDTO): Promise<EvaluateRateLimitResponse> {
    return await request<EvaluateRateLimitResponse>('/advanced-rate-limiter/evaluate', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async configureRateLimitRule(dto: ConfigureRateLimitRuleDTO): Promise<{ success: boolean; rule: RateLimitRuleConfig; message: string }> {
    return await request<{ success: boolean; rule: RateLimitRuleConfig; message: string }>('/advanced-rate-limiter/rules/configure', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async resetRateLimitClient(dto: ResetClientBucketDTO): Promise<{ success: boolean; message: string }> {
    return await request<{ success: boolean; message: string }>('/advanced-rate-limiter/clients/reset', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyRateLimitSeal(dto: VerifyRateLimitSealDTO): Promise<VerifyRateLimitSealResponse> {
    return await request<VerifyRateLimitSealResponse>('/advanced-rate-limiter/verify-seal', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async getRateLimitRules(): Promise<{ success: boolean; rules: RateLimitRuleConfig[] }> {
    return await request<{ success: boolean; rules: RateLimitRuleConfig[] }>('/advanced-rate-limiter/rules');
  },

  // 41. Blindagem de Memória & Prevenção de Heap Spraying (NIST SP 800-88 & OWASP ASVS)
  async getSecureMemoryOverview(): Promise<SecureMemoryOverviewResponse> {
    return await request<SecureMemoryOverviewResponse>('/secure-memory/overview');
  },

  async allocateSecureBuffer(dto: AllocateSecureBufferDTO): Promise<AllocateSecureBufferResponse> {
    return await request<AllocateSecureBufferResponse>('/secure-memory/allocate', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async zeroizeSecureBuffer(dto: ZeroizeSecureBufferDTO): Promise<ZeroizeSecureBufferResponse> {
    return await request<ZeroizeSecureBufferResponse>('/secure-memory/zeroize', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async inspectHeapSpraying(dto: InspectHeapSprayingDTO): Promise<InspectHeapSprayingResponse> {
    return await request<InspectHeapSprayingResponse>('/secure-memory/inspect-heap-spraying', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async purgeExpiredDeks(): Promise<PurgeExpiredDeksResponse> {
    return await request<PurgeExpiredDeksResponse>('/secure-memory/purge-expired', {
      method: 'POST'
    });
  },

  async verifyZeroizationSeal(dto: VerifyZeroizationSealDTO): Promise<VerifyZeroizationSealResponse> {
    return await request<VerifyZeroizationSealResponse>('/secure-memory/verify-seal', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  // 42. TLS Certificate Pinning & Rotação de CAs (RFC-001 §4.4, §5.2 e OWASP MASVS)
  async getTlsPinningOverview(): Promise<TlsPinningOverviewResponse> {
    return await request<TlsPinningOverviewResponse>('/tls-pinning/overview');
  },

  async validateTlsPin(dto: ValidateTlsPinDTO): Promise<ValidateTlsPinResponse> {
    return await request<ValidateTlsPinResponse>('/tls-pinning/validate', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async registerTlsPin(dto: RegisterTlsPinDTO): Promise<RegisterTlsPinResponse> {
    return await request<RegisterTlsPinResponse>('/tls-pinning/register-pin', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async rotateTlsCa(dto: RotateTlsCaDTO): Promise<RotateTlsCaResponse> {
    return await request<RotateTlsCaResponse>('/tls-pinning/rotate-ca', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async quarantineTlsCa(dto: QuarantineCompromisedCaDTO): Promise<QuarantineCompromisedCaResponse> {
    return await request<QuarantineCompromisedCaResponse>('/tls-pinning/quarantine-ca', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyTlsPinSeal(dto: VerifyTlsPinSealDTO): Promise<VerifyTlsPinSealResponse> {
    return await request<VerifyTlsPinSealResponse>('/tls-pinning/verify-seal', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  // 43. Avaliação Contínua de Postura de Dispositivo Zero Trust (NIST SP 800-207 & OWASP MASVS)
  async getDevicePostureOverview(): Promise<DevicePostureOverviewResponse> {
    return await request<DevicePostureOverviewResponse>('/device-posture/overview');
  },

  async assessDevicePosture(dto: AssessDevicePostureDTO): Promise<AssessDevicePostureResponse> {
    return await request<AssessDevicePostureResponse>('/device-posture/assess', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async quarantineDevice(dto: QuarantineDeviceDTO): Promise<QuarantineDeviceResponse> {
    return await request<QuarantineDeviceResponse>('/device-posture/quarantine', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async releaseDeviceQuarantine(dto: ReleaseDeviceQuarantineDTO): Promise<ReleaseDeviceQuarantineResponse> {
    return await request<ReleaseDeviceQuarantineResponse>('/device-posture/release-quarantine', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async updateDevicePosturePolicy(dto: UpdatePosturePolicyDTO): Promise<UpdatePosturePolicyResponse> {
    return await request<UpdatePosturePolicyResponse>('/device-posture/update-policy', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyDevicePostureSeal(dto: VerifyDevicePostureSealDTO): Promise<VerifyDevicePostureSealResponse> {
    return await request<VerifyDevicePostureSealResponse>('/device-posture/verify-seal', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  // 44. Criptografia Pós-Quântica Híbrida (NIST FIPS 203 ML-KEM & FIPS 204 ML-DSA)
  async getPqcOverview(): Promise<PqcOverviewResponse> {
    return await request<PqcOverviewResponse>('/pqc-hybrid/overview');
  },

  async generatePqcKeyPair(dto: GeneratePqcKeyPairDTO): Promise<GeneratePqcKeyPairResponse> {
    return await request<GeneratePqcKeyPairResponse>('/pqc-hybrid/generate-keypair', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async encapsulatePqcRecord(dto: EncapsulatePqcRecordDTO): Promise<EncapsulatePqcRecordResponse> {
    return await request<EncapsulatePqcRecordResponse>('/pqc-hybrid/encapsulate', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async decapsulatePqcRecord(dto: DecapsulatePqcRecordDTO): Promise<DecapsulatePqcRecordResponse> {
    return await request<DecapsulatePqcRecordResponse>('/pqc-hybrid/decapsulate', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async signPqcDocument(dto: SignPqcDocumentDTO): Promise<SignPqcDocumentResponse> {
    return await request<SignPqcDocumentResponse>('/pqc-hybrid/sign', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyPqcSignature(dto: VerifyPqcSignatureDTO): Promise<VerifyPqcSignatureResponse> {
    return await request<VerifyPqcSignatureResponse>('/pqc-hybrid/verify-signature', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async simulateQuantumAttack(dto: SimulateQuantumAttackDTO): Promise<SimulateQuantumAttackResponse> {
    return await request<SimulateQuantumAttackResponse>('/pqc-hybrid/simulate-attack', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyPqcSeal(dto: VerifyPqcSealDTO): Promise<VerifyPqcSealResponse> {
    return await request<VerifyPqcSealResponse>('/pqc-hybrid/verify-seal', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  // 45. Protocolo Chaumiano de Assinaturas Cegas (Blind Signatures / RFC 9474 & CFP 001/2009)
  async getBlindSignaturesOverview(): Promise<BlindSignaturesOverviewResponse> {
    return await request<BlindSignaturesOverviewResponse>('/blind-signatures/overview');
  },

  async generateBlindAuthorityKey(dto: GenerateBlindAuthorityKeyDTO): Promise<GenerateBlindAuthorityKeyResponse> {
    return await request<GenerateBlindAuthorityKeyResponse>('/blind-signatures/generate-authority-key', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async blindMessage(dto: BlindMessageDTO): Promise<BlindMessageResponse> {
    return await request<BlindMessageResponse>('/blind-signatures/blind', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async signBlindMessage(dto: SignBlindMessageDTO): Promise<SignBlindMessageResponse> {
    return await request<SignBlindMessageResponse>('/blind-signatures/sign-blind', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async unblindSignature(dto: UnblindSignatureDTO): Promise<UnblindSignatureResponse> {
    return await request<UnblindSignatureResponse>('/blind-signatures/unblind', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async redeemOrCastBallot(dto: RedeemOrCastBallotDTO): Promise<RedeemOrCastBallotResponse> {
    return await request<RedeemOrCastBallotResponse>('/blind-signatures/redeem-or-vote', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyBlindToken(dto: VerifyBlindTokenDTO): Promise<VerifyBlindTokenResponse> {
    return await request<VerifyBlindTokenResponse>('/blind-signatures/verify', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async simulateDoubleSpend(dto: SimulateDoubleSpendDTO): Promise<SimulateDoubleSpendResponse> {
    return await request<SimulateDoubleSpendResponse>('/blind-signatures/simulate-double-spend', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyBlindSeal(dto: VerifyBlindSealDTO): Promise<VerifyBlindSealResponse> {
    return await request<VerifyBlindSealResponse>('/blind-signatures/verify-seal', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  // 40. Proteção contra Side-Channel e Timing Attacks (NIST SP 800-38D, RFC-001 §4.2, §4.4)
  async getSideChannelOverview(): Promise<SideChannelOverviewResponse> {
    return await request<SideChannelOverviewResponse>('/side-channel/overview');
  },

  async inspectSideChannelOperation(dto: InspectSideChannelDTO): Promise<InspectSideChannelResponse> {
    return await request<InspectSideChannelResponse>('/side-channel/inspect-operation', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async runSideChannelWelchTest(dto: RunWelchTestDTO): Promise<RunWelchTestResponse> {
    return await request<RunWelchTestResponse>('/side-channel/run-welch-test', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async calibrateSideChannelJitter(dto: CalibrateJitterDTO): Promise<CalibrateJitterResponse> {
    return await request<CalibrateJitterResponse>('/side-channel/calibrate-jitter', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async updateSideChannelPolicy(dto: UpdateSideChannelPolicyDTO): Promise<UpdateSideChannelPolicyResponse> {
    return await request<UpdateSideChannelPolicyResponse>('/side-channel/update-policy', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async simulateSideChannelTimingAttack(dto: SimulateTimingAttackDTO): Promise<SimulateTimingAttackResponse> {
    return await request<SimulateTimingAttackResponse>('/side-channel/simulate-timing-attack', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifySideChannelSeal(dto: VerifySideChannelSealDTO): Promise<VerifySideChannelSealResponse> {
    return await request<VerifySideChannelSealResponse>('/side-channel/verify-seal', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  // 41. Proteção contra Ataques de Replay & Reutilização de Nonce (RFC 8446, RFC 9147 DTLS 1.3 & OWASP API Security)
  async getAntiReplayOverview(): Promise<AntiReplayOverviewResponse> {
    return await request<AntiReplayOverviewResponse>('/anti-replay/overview');
  },

  async verifyNonce(dto: VerifyNonceDTO): Promise<VerifyNonceResponse> {
    return await request<VerifyNonceResponse>('/anti-replay/verify-nonce', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async getSlidingWindowStatus(dto: GetSlidingWindowStatusDTO): Promise<GetSlidingWindowStatusResponse> {
    return await request<GetSlidingWindowStatusResponse>('/anti-replay/sliding-window-status', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async rotateBloomFilter(): Promise<RotateBloomFilterResponse> {
    return await request<RotateBloomFilterResponse>('/anti-replay/rotate-bloom-filter', {
      method: 'POST'
    });
  },

  async updateReplayPolicy(dto: UpdateReplayPolicyDTO): Promise<UpdateReplayPolicyResponse> {
    return await request<UpdateReplayPolicyResponse>('/anti-replay/update-policy', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async simulateReplayAttack(dto: SimulateReplayAttackDTO): Promise<SimulateReplayAttackResponse> {
    return await request<SimulateReplayAttackResponse>('/anti-replay/simulate-replay-attack', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyAntiReplaySeal(dto: VerifyAntiReplaySealDTO): Promise<VerifyAntiReplaySealResponse> {
    return await request<VerifyAntiReplaySealResponse>('/anti-replay/verify-seal', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  // 42. Marcação D'água Esteganográfica Visual & Rastreamento Anti-Exfiltração de Tela (LGPD Art. 46 / CFP 011/2018)
  async getVisualWatermarkOverview(): Promise<VisualWatermarkOverviewResponse> {
    return await request<VisualWatermarkOverviewResponse>('/visual-watermark/overview');
  },

  async createWatermarkSeed(dto: CreateWatermarkSeedDTO): Promise<CreateWatermarkSeedResponse> {
    return await request<CreateWatermarkSeedResponse>('/visual-watermark/create-seed', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async embedVisualWatermark(dto: EmbedVisualWatermarkDTO): Promise<EmbedVisualWatermarkResponse> {
    return await request<EmbedVisualWatermarkResponse>('/visual-watermark/embed', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async extractLeakSource(dto: ExtractLeakSourceDTO): Promise<ExtractLeakSourceResponse> {
    return await request<ExtractLeakSourceResponse>('/visual-watermark/extract-leak', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async simulateScreenLeak(dto: SimulateScreenLeakDTO): Promise<SimulateScreenLeakResponse> {
    return await request<SimulateScreenLeakResponse>('/visual-watermark/simulate-screen-leak', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async updateWatermarkStrength(dto: UpdateWatermarkStrengthDTO): Promise<UpdateWatermarkStrengthResponse> {
    return await request<UpdateWatermarkStrengthResponse>('/visual-watermark/update-strength', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyVisualWatermarkSeal(dto: VerifyVisualWatermarkSealDTO): Promise<VerifyVisualWatermarkSealResponse> {
    return await request<VerifyVisualWatermarkSealResponse>('/visual-watermark/verify-seal', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  // 43. Tokens Efêmeros de Teleconsulta e Auto-Revogação (RFC 7519, RFC 7009 & LGPD Art. 46)
  async getEphemeralTokensOverview(): Promise<EphemeralTokenOverviewResponse> {
    return await request<EphemeralTokenOverviewResponse>('/ephemeral-tokens/overview');
  },

  async issueEphemeralToken(dto: IssueEphemeralTokenDTO): Promise<IssueEphemeralTokenResponse> {
    return await request<IssueEphemeralTokenResponse>('/ephemeral-tokens/issue', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async consumeEphemeralToken(dto: ConsumeEphemeralTokenDTO): Promise<ConsumeEphemeralTokenResponse> {
    return await request<ConsumeEphemeralTokenResponse>('/ephemeral-tokens/consume', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async revokeEphemeralToken(dto: RevokeEphemeralTokenDTO): Promise<RevokeEphemeralTokenResponse> {
    return await request<RevokeEphemeralTokenResponse>('/ephemeral-tokens/revoke', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async simulateTokenIntrusion(dto: SimulateTokenIntrusionDTO): Promise<SimulateTokenIntrusionResponse> {
    return await request<SimulateTokenIntrusionResponse>('/ephemeral-tokens/simulate-intrusion', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async updateEphemeralPolicy(dto: UpdateEphemeralPolicyDTO): Promise<UpdateEphemeralPolicyResponse> {
    return await request<UpdateEphemeralPolicyResponse>('/ephemeral-tokens/update-policy', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyEphemeralTokenSeal(dto: VerifyEphemeralTokenSealDTO): Promise<VerifyEphemeralTokenSealResponse> {
    return await request<VerifyEphemeralTokenSealResponse>('/ephemeral-tokens/verify-seal', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  // 44. Liberação Colegiada de Prontuários Sob Ordem Judicial com Threshold Cryptography (CFP nº 001/2009 & LGPD Art. 11)
  async getCourtOrderThresholdOverview(): Promise<ThresholdVaultOverviewResponse> {
    return await request<ThresholdVaultOverviewResponse>('/court-order-threshold/overview');
  },

  async createCourtOrderVault(dto: CreateCourtOrderVaultDTO): Promise<CreateCourtOrderVaultResponse> {
    return await request<CreateCourtOrderVaultResponse>('/court-order-threshold/create-vault', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async submitCustodianShare(dto: SubmitCustodianShareDTO): Promise<SubmitCustodianShareResponse> {
    return await request<SubmitCustodianShareResponse>('/court-order-threshold/submit-share', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async reconstructAndDecrypt(dto: ReconstructAndDecryptDTO): Promise<ReconstructAndDecryptResponse> {
    return await request<ReconstructAndDecryptResponse>('/court-order-threshold/reconstruct-decrypt', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async simulateThresholdAttack(dto: SimulateThresholdAttackDTO): Promise<SimulateThresholdAttackResponse> {
    return await request<SimulateThresholdAttackResponse>('/court-order-threshold/simulate-attack', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyThresholdSeal(dto: VerifyThresholdSealDTO): Promise<VerifyThresholdSealResponse> {
    return await request<VerifyThresholdSealResponse>('/court-order-threshold/verify-seal', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  // 45. Blindagem contra Prototype Pollution & Desserialização Insegura (OWASP ASVS V5.5 & CWE-1321)
  async getPrototypePollutionOverview(): Promise<PollutionGuardOverviewResponse> {
    return await request<PollutionGuardOverviewResponse>('/prototype-pollution/overview');
  },

  async scanObjectPayload(dto: ScanObjectPayloadDTO): Promise<ScanObjectPayloadResponse> {
    return await request<ScanObjectPayloadResponse>('/prototype-pollution/scan-payload', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async updatePollutionPolicy(dto: UpdatePollutionPolicyDTO): Promise<UpdatePollutionPolicyResponse> {
    return await request<UpdatePollutionPolicyResponse>('/prototype-pollution/update-policy', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async simulatePollutionAttack(dto: SimulatePollutionAttackDTO): Promise<SimulatePollutionAttackResponse> {
    return await request<SimulatePollutionAttackResponse>('/prototype-pollution/simulate-attack', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyPollutionSeal(dto: VerifyPollutionSealDTO): Promise<VerifyPollutionSealResponse> {
    return await request<VerifyPollutionSealResponse>('/prototype-pollution/verify-seal', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  // 63. Proteção contra Web Cache Poisoning & Cache Deception (RFC 7234, RFC 9111 & OWASP ASVS v4.0)
  async getCacheGuardOverview(): Promise<CacheGuardOverviewResponse> {
    return await request<CacheGuardOverviewResponse>('/cache-guard/overview');
  },

  async inspectCacheRequest(dto: InspectCacheRequestDTO): Promise<InspectCacheResponseDTO> {
    return await request<InspectCacheResponseDTO>('/cache-guard/inspect', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async updateCachePolicy(dto: UpdateCachePolicyDTO): Promise<UpdateCachePolicyResponseDTO> {
    return await request<UpdateCachePolicyResponseDTO>('/cache-guard/policy', {
      method: 'PUT',
      body: JSON.stringify(dto)
    });
  },

  async simulateCacheAttack(dto: SimulateCacheAttackDTO): Promise<SimulateCacheAttackResponseDTO> {
    return await request<SimulateCacheAttackResponseDTO>('/cache-guard/simulate', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyCacheSeal(dto: VerifyCacheSealDTO): Promise<VerifyCacheSealResponseDTO> {
    return await request<VerifyCacheSealResponseDTO>('/cache-guard/verify-seal', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  // 64. Detecção e Prevenção Ativa de Ataques XXE & XML Bombs (CWE-611, CWE-776 & HL7/FHIR XML)
  async getXmlGuardOverview(): Promise<XmlGuardOverviewResponse> {
    return await request<XmlGuardOverviewResponse>('/xml-guard/overview');
  },

  async scanXmlPayload(dto: ScanXmlPayloadDTO): Promise<ScanXmlPayloadResponse> {
    return await request<ScanXmlPayloadResponse>('/xml-guard/scan', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async updateXmlPolicy(dto: UpdateXmlPolicyDTO): Promise<UpdateXmlPolicyResponse> {
    return await request<UpdateXmlPolicyResponse>('/xml-guard/policy', {
      method: 'PUT',
      body: JSON.stringify(dto)
    });
  },

  async simulateXmlAttack(dto: SimulateXmlAttackDTO): Promise<SimulateXmlAttackResponse> {
    return await request<SimulateXmlAttackResponse>('/xml-guard/simulate', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyXmlSeal(dto: VerifyXmlSealDTO): Promise<VerifyXmlSealResponse> {
    return await request<VerifyXmlSealResponse>('/xml-guard/verify-seal', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  // 65. Proteção contra Fixação e Sequestro de Sessão (OWASP ASVS V3.3 & NIST SP 800-63B)
  async getSessionGuardOverview(): Promise<SessionGuardOverviewResponse> {
    return await request<SessionGuardOverviewResponse>('/session-guard/overview');
  },

  async evaluateSessionContext(dto: EvaluateSessionDTO): Promise<EvaluateSessionResponse> {
    return await request<EvaluateSessionResponse>('/session-guard/evaluate', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async rotateSession(dto: RotateSessionDTO): Promise<RotateSessionResponse> {
    return await request<RotateSessionResponse>('/session-guard/rotate', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async updateSessionGuardPolicy(dto: UpdateSessionGuardPolicyDTO): Promise<UpdateSessionGuardPolicyResponse> {
    return await request<UpdateSessionGuardPolicyResponse>('/session-guard/policy', {
      method: 'PUT',
      body: JSON.stringify(dto)
    });
  },

  async simulateSessionAttack(dto: SimulateSessionAttackDTO): Promise<SimulateSessionAttackResponse> {
    return await request<SimulateSessionAttackResponse>('/session-guard/simulate', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifySessionGuardSeal(dto: VerifySessionSealDTO): Promise<VerifySessionSealResponse> {
    return await request<VerifySessionSealResponse>('/session-guard/verify-seal', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  // 66. RE-DOS GUARD & SAFE REGEX ENGINE (OWASP ASVS V5.5 & CWE-1333)
  async getRedosGuardOverview(): Promise<RedosGuardOverviewResponse> {
    return await request<RedosGuardOverviewResponse>('/redos-guard/overview');
  },

  async analyzeRegex(dto: AnalyzeRegexDTO): Promise<AnalyzeRegexResponse> {
    return await request<AnalyzeRegexResponse>('/redos-guard/analyze', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async executeSafeRegex(dto: ExecuteSafeRegexDTO): Promise<ExecuteSafeRegexResponse> {
    return await request<ExecuteSafeRegexResponse>('/redos-guard/execute', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async updateRedosPolicy(dto: UpdateRedosPolicyDTO): Promise<UpdateRedosPolicyResponse> {
    return await request<UpdateRedosPolicyResponse>('/redos-guard/policy', {
      method: 'PUT',
      body: JSON.stringify(dto)
    });
  },

  async simulateRedosAttack(dto: SimulateRedosAttackDTO): Promise<SimulateRedosAttackResponse> {
    return await request<SimulateRedosAttackResponse>('/redos-guard/simulate', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyRedosSeal(dto: VerifyRedosSealDTO): Promise<VerifyRedosSealResponse> {
    return await request<VerifyRedosSealResponse>('/redos-guard/verify-seal', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  // 67. Blindagem contra Injeção de Templates no Servidor (SSTI) em Laudos Multiformato (OWASP ASVS V5.2 & CFP 006/2019)
  async getSstiGuardOverview(): Promise<SstiGuardOverviewResponse> {
    return await request<SstiGuardOverviewResponse>('/ssti-guard/overview');
  },

  async inspectTemplate(dto: InspectTemplateDTO): Promise<InspectTemplateResponse> {
    return await request<InspectTemplateResponse>('/ssti-guard/inspect', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async renderSandboxedTemplate(dto: RenderSandboxedTemplateDTO): Promise<RenderSandboxedTemplateResponse> {
    return await request<RenderSandboxedTemplateResponse>('/ssti-guard/render', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async updateSstiPolicy(dto: UpdateSstiPolicyDTO): Promise<UpdateSstiPolicyResponse> {
    return await request<UpdateSstiPolicyResponse>('/ssti-guard/policy', {
      method: 'PUT',
      body: JSON.stringify(dto)
    });
  },

  async simulateSstiAttack(dto: SimulateSstiAttackDTO): Promise<SimulateSstiAttackResponse> {
    return await request<SimulateSstiAttackResponse>('/ssti-guard/simulate', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifySstiSeal(dto: VerifySstiSealDTO): Promise<VerifySstiSealResponse> {
    return await request<VerifySstiSealResponse>('/ssti-guard/verify-seal', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  // 68. Blindagem contra Injeção de Comandos de SO em Conversores de PDF e Laudos (OWASP ASVS V5.3, CWE-78 & CWE-88)
  async getOsCommandOverview(): Promise<CommandGuardOverviewResponse> {
    return await request<CommandGuardOverviewResponse>('/os-command-guard/overview');
  },

  async inspectOsCommand(dto: InspectCommandInputDTO): Promise<InspectCommandInputResponse> {
    return await request<InspectCommandInputResponse>('/os-command-guard/inspect', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async executeSandboxedCommand(dto: ExecuteSandboxedCommandDTO): Promise<ExecuteSandboxedCommandResponse> {
    return await request<ExecuteSandboxedCommandResponse>('/os-command-guard/execute', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async updateOsCommandPolicy(dto: UpdateCommandPolicyDTO): Promise<UpdateCommandPolicyResponse> {
    return await request<UpdateCommandPolicyResponse>('/os-command-guard/policy', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async simulateOsCommandAttack(dto: SimulateCommandAttackDTO): Promise<SimulateCommandAttackResponse> {
    return await request<SimulateCommandAttackResponse>('/os-command-guard/simulate', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyOsCommandSeal(dto: VerifyCommandSealDTO): Promise<VerifyCommandSealResponse> {
    return await request<VerifyCommandSealResponse>('/os-command-guard/verify-seal', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  // 69. Sanitização e Validação Estrita de Caminhos & Prevenção de Path Traversal / LFI (OWASP ASVS V5.5 & CWE-22/CWE-23)
  async getPathGuardOverview(): Promise<PathGuardOverviewResponse> {
    return await request<PathGuardOverviewResponse>('/path-traversal-guard/overview');
  },

  async inspectPath(dto: InspectPathInputDTO): Promise<InspectPathInputResponse> {
    return await request<InspectPathInputResponse>('/path-traversal-guard/inspect', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async resolveSafePath(dto: ResolveSafePathDTO): Promise<ResolveSafePathResponse> {
    return await request<ResolveSafePathResponse>('/path-traversal-guard/resolve', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async updatePathPolicy(dto: UpdatePathPolicyDTO): Promise<UpdatePathPolicyResponse> {
    return await request<UpdatePathPolicyResponse>('/path-traversal-guard/policy', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async simulatePathAttack(dto: SimulatePathAttackDTO): Promise<SimulatePathAttackResponse> {
    return await request<SimulatePathAttackResponse>('/path-traversal-guard/simulate', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyPathSeal(dto: VerifyPathSealDTO): Promise<VerifyPathSealResponse> {
    return await request<VerifyPathSealResponse>('/path-traversal-guard/verify-seal', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  // 70. Detecção e Prevenção Ativa de Injeção de Código em Expressões e Consultas (CWE-94, CWE-95 & ASVS V5.2)
  async getExpressionGuardOverview(): Promise<ExpressionGuardOverviewResponse> {
    return await request<ExpressionGuardOverviewResponse>('/expression-guard/overview');
  },

  async inspectExpression(dto: InspectExpressionDTO): Promise<InspectExpressionResponse> {
    return await request<InspectExpressionResponse>('/expression-guard/inspect', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async evaluateExpression(dto: EvaluateExpressionDTO): Promise<EvaluateExpressionResponse> {
    return await request<EvaluateExpressionResponse>('/expression-guard/evaluate', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async updateExpressionPolicy(dto: UpdateExpressionPolicyDTO): Promise<UpdateExpressionPolicyResponse> {
    return await request<UpdateExpressionPolicyResponse>('/expression-guard/policy', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async simulateExpressionAttack(dto: SimulateExpressionAttackDTO): Promise<SimulateExpressionAttackResponse> {
    return await request<SimulateExpressionAttackResponse>('/expression-guard/simulate', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyExpressionSeal(dto: VerifyExpressionSealDTO): Promise<VerifyExpressionSealResponse> {
    return await request<VerifyExpressionSealResponse>('/expression-guard/verify-seal', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  // 45. Proteção Avançada contra Injeção de Consultas GraphQL, Introspecção & Query Cost Limiting (OWASP ASVS v4.0 V5.1)
  async getGraphQLGuardOverview(): Promise<GraphQLGuardOverviewResponse> {
    return await request<GraphQLGuardOverviewResponse>('/graphql-guard/overview');
  },

  async inspectGraphQLQuery(dto: InspectGraphQLQueryDTO): Promise<InspectGraphQLQueryResponse> {
    return await request<InspectGraphQLQueryResponse>('/graphql-guard/inspect', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async updateGraphQLPolicy(dto: UpdateGraphQLPolicyDTO): Promise<UpdateGraphQLPolicyResponse> {
    return await request<UpdateGraphQLPolicyResponse>('/graphql-guard/policy', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async simulateGraphQLAttack(dto: SimulateGraphQLAttackDTO): Promise<SimulateGraphQLAttackResponse> {
    return await request<SimulateGraphQLAttackResponse>('/graphql-guard/simulate', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyGraphQLCostSeal(dto: VerifyGraphQLCostSealDTO): Promise<VerifyGraphQLCostSealResponse> {
    return await request<VerifyGraphQLCostSealResponse>('/graphql-guard/verify-seal', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async getGraphQLSchemas(): Promise<GetGraphQLSchemasResponse> {
    return await request<GetGraphQLSchemasResponse>('/graphql-guard/schemas');
  },

  // 46. Proteção contra Injeção de Cabeçalhos e Split HTTP/2 & gRPC (CWE-113, CWE-444 & RFC 9113)
  async getHttp2GuardOverview(): Promise<Http2GuardOverviewResponse> {
    return await request<Http2GuardOverviewResponse>('/http2-guard/overview');
  },

  async inspectHttp2Headers(dto: InspectHttp2HeadersDTO): Promise<InspectHttp2HeadersResponse> {
    return await request<InspectHttp2HeadersResponse>('/http2-guard/inspect', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async updateHttp2Policy(dto: UpdateHttp2PolicyDTO): Promise<UpdateHttp2PolicyResponse> {
    return await request<UpdateHttp2PolicyResponse>('/http2-guard/policy', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async simulateHttp2Attack(dto: SimulateHttp2AttackDTO): Promise<SimulateHttp2AttackResponse> {
    return await request<SimulateHttp2AttackResponse>('/http2-guard/simulate', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifyHttp2Seal(dto: VerifyHttp2SealDTO): Promise<VerifyHttp2SealResponse> {
    return await request<VerifyHttp2SealResponse>('/http2-guard/verify-seal', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  // 73. Supply Chain Guard & Dynamic Dependency Shield (SLSA L3, CWE-470, CWE-912)
  async getSupplyChainOverview(): Promise<SupplyChainOverviewResponse> {
    return await request<SupplyChainOverviewResponse>('/supply-chain-guard/overview');
  },

  async inspectDependencies(dto: InspectDependenciesDTO): Promise<InspectDependenciesResponse> {
    return await request<InspectDependenciesResponse>('/supply-chain-guard/inspect', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async inspectDynamicImport(dto: InspectDynamicImportDTO): Promise<InspectDynamicImportResponse> {
    return await request<InspectDynamicImportResponse>('/supply-chain-guard/inspect-import', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async updateSupplyChainPolicy(dto: UpdateDependencyPolicyDTO): Promise<UpdateDependencyPolicyResponse> {
    return await request<UpdateDependencyPolicyResponse>('/supply-chain-guard/policy', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async simulateSupplyChainAttack(dto: SimulateSupplyChainAttackDTO): Promise<SimulateSupplyChainAttackResponse> {
    return await request<SimulateSupplyChainAttackResponse>('/supply-chain-guard/simulate', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async verifySupplyChainSeal(dto: VerifySupplyChainSealDTO): Promise<VerifySupplyChainSealResponse> {
    return await request<VerifySupplyChainSealResponse>('/supply-chain-guard/verify-seal', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
  },

  async getHomologatedDependencies(): Promise<{ success: boolean; packages: DependencyNode[] }> {
    return await request<{ success: boolean; packages: DependencyNode[] }>('/supply-chain-guard/homologated');
  }
};









