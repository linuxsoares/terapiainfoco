import { AppointmentStatus, DocumentType, UserRole, MeetProvider, MeetAccessType } from './enums';
import type { SoapNote, TranscriptUtterance, SafeUser, IcpCertificateInfo, IcpSignatureData } from './models';
import type { EnvelopeEncryptedData } from './crypto';




export interface CreatePatientDTO {
  name: string;
  email: string;
  phone: string;
  cpf?: string;
  consentTranscriptionSigned: boolean;
}

export interface CreateAppointmentDTO {
  patientId: string;
  scheduledStart: string; // ISO string
  scheduledEnd: string;   // ISO string
  bufferMinutes?: number;
  meetUrl?: string;
  accessType?: MeetAccessType;
}

export interface UpdateAppointmentStatusDTO {
  status: AppointmentStatus;
  reason?: string;
}

export interface UpdateSoapNoteDTO {
  soap: SoapNote;
  privateNotes?: string;
}

export interface SignClinicalRecordDTO {
  recordId: string;
  /** Confirmação explícita de revisão humana (Human-in-the-Loop) */
  confirmedHumanReview: boolean;
}

export interface GenerateDocumentDTO {
  patientId: string;
  type: DocumentType;
  title: string;
  content: string;
}

export interface SignDocumentDTO {
  documentId: string;
}

export interface ValidateDocumentResponse {
  valid: boolean;
  document?: {
    id: string;
    type: DocumentType;
    title: string;
    therapistName: string;
    therapistCrp: string;
    patientInitials: string;
    issuedAt: string;
    signaturePadesHash: string;
    regulationReference: string;
    icpSignature?: IcpSignatureData;
  };
  message?: string;
}

export interface UploadAudioDTO {
  appointmentId: string;
  audioFileName?: string;
  durationSeconds?: number;
  rawAudioBase64?: string;
  customTranscript?: TranscriptUtterance[];
}

export interface SanitizeTranscriptionDTO {
  transcriptionId?: string;
  text?: string;
  utterances?: TranscriptUtterance[];
  patientName?: string;
  therapistName?: string;
}

export interface SanitizeTranscriptionResponse {
  sanitizedText?: string;
  sanitizedUtterances?: TranscriptUtterance[];
  replacedCount: number;
  entitiesDetected: Array<{ type: string; placeholder: string; count: number }>;
}

export interface GenerateSoapProposalDTO {
  appointmentId: string;
  transcriptionId?: string;
  utterances?: TranscriptUtterance[];
}

export interface GenerateSoapProposalResponse {
  soap: SoapNote;
  privateNotesSuggestion?: string;
  sanitizationSummary: {
    totalEntitiesSanitized: number;
    entitiesDetected: Array<{ type: string; placeholder: string; count: number }>;
  };
  humanReviewRequired: boolean;
  disclaimer: string;
}

export interface AvailableSlot {
  start: string; // ISO
  end: string;   // ISO
  formattedTime: string; // "14:00 - 14:50"
  available: boolean;
}

export interface AvailableSlotsResponse {
  therapistId: string;
  therapistName: string;
  date: string;
  bufferMinutes: number;
  slots: AvailableSlot[];
}

export interface PublicBookingDTO {
  therapistId?: string;
  patientName: string;
  patientEmail: string;
  patientPhone: string;
  patientCpf?: string;
  scheduledStart: string; // ISO
  scheduledEnd: string;   // ISO
  consentTeleconsultationSigned: boolean;
}

export interface PublicBookingResponse {
  appointmentId: string;
  patientName: string;
  therapistName: string;
  scheduledStart: string;
  scheduledEnd: string;
  meetUrl: string;
  meetAccessCode?: string;
  bufferMinutes: number;
  consentRecordedAt: string;
  instructions: string[];
}

/**
 * DTOs de Autenticação, Sessão e 2FA/MFA (Opção C)
 */
export interface RegisterDTO {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  crp?: string;
  crpRegion?: string;
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  mfaRequired?: boolean;
  tempToken?: string;
  user?: SafeUser;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  message?: string;
}

export interface TwoFactorSetupResponse {
  secret: string;
  otpauthUri: string;
  backupCodes: string[];
}

export interface TwoFactorVerifyDTO {
  code: string;
  tempToken?: string; // Obrigatório no fluxo de login após mfaRequired
}

export interface RefreshTokenDTO {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * DTOs de Assinatura Qualificada ICP-Brasil (PAdES / MP 2.200-2/2001)
 */
export interface PrepareIcpSignatureResponse {
  documentId: string;
  title: string;
  sha256Digest: string;
  pdfHash: string;
  validationToken: string;
  validationUrl: string;
}

export interface SignIcpDTO {
  certificate: IcpCertificateInfo;
  signatureBase64: string;
  timestampToken?: string;
}

/**
 * 8. ANALYTICS, OBSERVABILIDADE & DASHBOARD CLÍNICO (RFC-001 Opção E)
 */
export interface ClinicalOverviewMetrics {
  totalPatients: number;
  activePatients: number;
  quarantinedPatients: number;
  totalSessions: number;
  completedSessions: number;
  scheduledSessions: number;
  cancelledSessions: number;
  attendanceRate: number; // Porcentagem de comparecimento (0 a 100)
  totalSoapRecords: number;
  signedSoapRecords: number;
  humanReviewComplianceRate: number; // Porcentagem de prontuários com Human-in-the-Loop concluído
  totalDocuments: number;
  signedDocuments: number;
  icpSignedDocuments: number;
  documentsByType: Record<DocumentType, number>;
  recentSessions: Array<{
    id: string;
    patientId: string;
    patientName: string;
    date: string;
    status: AppointmentStatus;
  }>;
  sessionsByMonth: Array<{
    month: string;
    count: number;
  }>;
}

export interface SecurityMetrics {
  totalAuditLogs: number;
  wormIntegrityStatus: 'INTACT' | 'COMPROMISED';
  totalDecryptReads: number;
  totalSignatures: number;
  failedLoginsCount: number;
  rateLimitBlocksCount: number;
  twoFactorAdoptionRate: number; // Porcentagem de contas com 2FA ativa
  auditEventsByAction: Record<string, number>;
  recentSecurityAlerts: Array<{
    id: string;
    timestamp: string;
    action: string;
    actorId: string;
    ipAddress: string;
    detail: string;
    severity: 'INFO' | 'WARN' | 'ALERT';
  }>;
}

export interface PatientClinicalMetrics {
  patientId: string;
  patientName: string;
  firstSessionDate: string | null;
  lastSessionDate: string | null;
  totalAppointments: number;
  completedAppointments: number;
  attendanceRate: number;
  totalSoapNotes: number;
  evolutionTimeline: Array<{
    sessionId: string;
    sessionNumber: number;
    date: string;
    status: AppointmentStatus;
    hasSoap: boolean;
    isSigned: boolean;
    signedAt?: string | null;
    soapSubjectiveSummary?: string;
    soapAssessmentSummary?: string;
  }>;
}

/**
 * 9. PORTABILIDADE DE DADOS & EXPORTAÇÃO CRIPTOGRAFADA (LGPD Art. 18 & CFP nº 001/2009 - Opção F)
 */
export interface ExportPatientDataDTO {
  /** Frase secreta opcional para cifragem simétrica do pacote via AES-256-GCM + PBKDF2 */
  passphrase?: string;
  /** Formato de saída: 'json' estruturado legível por máquina ou 'encrypted_package' */
  format?: 'json' | 'encrypted_package';
  /** Motivo ou protocolo da solicitação do titular */
  requestReason?: string;
}

export interface PatientPortabilityPackage {
  exportVersion: '1.0';
  exportedAt: string;
  regulationBasis: {
    lgpdArticle: string;
    cfpResolution: string;
    legalRetainNotice: string;
    confidentialityNotice: string;
  };
  therapist: {
    id: string;
    name: string;
    crp: string;
    crpRegion: string;
  };
  patient: {
    id: string;
    name: string;
    email: string;
    phone: string;
    cpf?: string;
    createdAt: string;
    consentTranscriptionSigned: boolean;
    consentSignedAt?: string | null;
    consentRevokedAt?: string | null;
    consentRevokeReason?: string | null;
  };
  appointments: Array<{
    id: string;
    scheduledStart: string;
    scheduledEnd: string;
    status: AppointmentStatus;
    meetUrl?: string;
    meetAccessCode?: string;
    createdAt: string;
  }>;
  clinicalRecords: Array<{
    id: string;
    sessionNumber: number;
    appointmentId: string;
    isSigned: boolean;
    signedAt?: string | null;
    signatureHash?: string | null;
    soap: SoapNote;
    createdAt: string;
  }>;
  psychologicalDocuments: Array<{
    id: string;
    type: DocumentType;
    title: string;
    regulationReference: string;
    content: string;
    validationToken: string;
    isSigned: boolean;
    signedAt?: string | null;
    signaturePadesHash?: string | null;
    hasIcpSignature: boolean;
    createdAt: string;
  }>;
  transcriptions: Array<{
    id: string;
    appointmentId: string;
    wordCount?: number;
    durationSeconds?: number;
    utterancesCount: number;
    utterances: TranscriptUtterance[];
    createdAt: string;
  }>;
  auditTrailSummary: {
    totalAccessLogs: number;
    exportedByActorId: string;
    exportTimestamp: string;
  };
  checksumSha256: string;
}

export interface EncryptedExportPackage {
  encrypted: true;
  algorithm: 'aes-256-gcm';
  kdf: 'pbkdf2-sha512';
  kdfIterations: number;
  saltBase64: string;
  ivBase64: string;
  authTagBase64: string;
  ciphertextBase64: string;
  exportedAt: string;
  patientId: string;
  disclaimer: string;
}

export interface ExportPatientDataResponse {
  success: boolean;
  format: 'json' | 'encrypted_package';
  checksumSha256: string;
  package?: PatientPortabilityPackage;
  encryptedPackage?: EncryptedExportPackage;
  message: string;
}

export interface RevokeConsentDTO {
  reason: string;
  revokeTranscriptionConsent: boolean;
  requestDataQuarantine?: boolean;
}

export interface RevokeConsentResponse {
  success: boolean;
  patientId: string;
  revokedAt: string;
  consentTranscriptionSigned: boolean;
  quarantined: boolean;
  legalRetentionNote: string;
  message: string;
}

/**
 * 10. BACKUP CRIPTOGRAFADO & DISASTER RECOVERY COM KMS (RFC-001 §4.2, §4.4 - Opção G)
 */
export interface BackupEntitiesSummary {
  therapists: number;
  patients: number;
  appointments: number;
  clinicalRecords: number;
  documents: number;
  sessionTranscriptions: number;
  users: number;
  auditLogs: number;
  totalEntities: number;
}

export interface BackupSnapshotMetadata {
  id: string;
  createdAt: string;
  databaseVersion: string;
  sizeBytes: number;
  checksumSha256: string;
  entitiesCount: BackupEntitiesSummary;
  status: 'COMPLETED' | 'VERIFIED' | 'FAILED';
  verifiedAt?: string | null;
  verificationDetails?: {
    verificationTimeMs: number;
    totalRecordsVerified: number;
    gcmAuthTagValid: boolean;
    sha256ChecksumValid: boolean;
  } | null;
}

export interface BackupSnapshotFile {
  backupMetadata: BackupSnapshotMetadata;
  envelope: EnvelopeEncryptedData;
}

export interface BackupOverviewResponse {
  success: boolean;
  lastBackupAt: string | null;
  lastVerifiedAt: string | null;
  totalBackups: number;
  rpoHours: number;
  rtoEstimateMs: number;
  isRpoCompliant: boolean;
  backups: BackupSnapshotMetadata[];
}

export interface CreateBackupResponse {
  success: boolean;
  backup: BackupSnapshotMetadata;
  message: string;
}

export interface VerifyBackupResponse {
  success: boolean;
  backupId: string;
  verifiedAt: string;
  integrityOk: boolean;
  verificationTimeMs: number;
  entitiesVerified: BackupEntitiesSummary;
  message: string;
}

export interface RestoreBackupResponse {
  success: boolean;
  backupId: string;
  restoredAt: string;
  entitiesRestored: BackupEntitiesSummary;
  message: string;
}

/**
 * 11. AUDITORIA EXTERNA, HASH-CHAIN & RELATÓRIO DE CONFORMIDADE PARA DPO/CFP (Opção H - RFC-001 §4.4)
 */
export interface AuditFilterParams {
  startDate?: string;
  endDate?: string;
  resourceType?: string;
  action?: string;
  actorId?: string;
  limit?: number;
}

export interface ChainIntegrityResult {
  isValid: boolean;
  totalEntries: number;
  genesisHash: string;
  latestHash: string;
  tamperedAtIndex?: number | null;
  tamperedLogId?: string | null;
  message: string;
  verifiedAt: string;
}

export interface ComplianceReportResponse {
  success: boolean;
  reportId: string;
  generatedAt: string;
  regulationBasis: {
    lgpdArticles: string[];
    cfpResolutions: string[];
    statement: string;
  };
  controller: {
    clinicName: string;
    dpoEmail: string;
    technicalResponsibleCrp: string;
  };
  chainIntegrity: ChainIntegrityResult;
  summary: {
    totalEvents: number;
    decryptReadsCount: number;
    signaturesAppliedCount: number;
    quarantineActionsCount: number;
    backupActionsCount: number;
    securityAlertsCount: number;
    eventsByAction: Record<string, number>;
    eventsByResourceType: Record<string, number>;
  };
  filteredPeriod: {
    startDate: string | null;
    endDate: string | null;
  };
  logs: import('./models').AuditLog[];
  checksumSha256: string;
}

/**
 * 12. RATE LIMITING DISTRIBUÍDO & CACHE CRIPTOGRÁFICO EM MEMÓRIA (Opção I - RFC-001)
 */
export interface RateLimitPresetInfo {
  max: number;
  windowSeconds: number;
  description: string;
}

export interface RateLimitStatusResponse {
  success: boolean;
  storeType: 'redis' | 'memory';
  redisConnected: boolean;
  redisHost?: string;
  totalTrackedKeys: number;
  presets: {
    auth: RateLimitPresetInfo;
    search: RateLimitPresetInfo;
    validation: RateLimitPresetInfo;
    booking: RateLimitPresetInfo;
  };
  activeBlocksCount: number;
}

export interface ResetRateLimitDTO {
  key?: string;
}

export interface ResetRateLimitResponse {
  success: boolean;
  message: string;
  targetKey: string;
}

export interface EncryptedCacheStatsResponse {
  success: boolean;
  totalKeys: number;
  hits: number;
  misses: number;
  hitRatio: number;
  encryptionAlgorithm: 'aes-256-gcm';
  keyRotationAgeSeconds: number;
  itemsInMemoryEncrypted: number;
  memorySizeBytesEstimate: number;
}

export interface RotateCacheKeyResponse {
  success: boolean;
  message: string;
  rotatedAt: string;
}

/**
 * 13. WEBHOOKS ASSINADOS HMAC-SHA256 & NOTIFICAÇÕES DE SEGURANÇA (Opção J - RFC-001)
 */
export interface CreateWebhookDTO {
  url: string;
  description: string;
  events: import('./models').WebhookEventType[];
}

export interface UpdateWebhookDTO {
  url?: string;
  description?: string;
  events?: import('./models').WebhookEventType[];
  enabled?: boolean;
}

export interface WebhookResponse {
  success: boolean;
  webhook: import('./models').WebhookSubscription;
  message?: string;
}

export interface WebhookListResponse {
  success: boolean;
  count: number;
  webhooks: import('./models').WebhookSubscription[];
}

export interface TestWebhookResponse {
  success: boolean;
  message: string;
  deliveryLog: import('./models').WebhookDeliveryLog;
}

export interface WebhookLogsResponse {
  success: boolean;
  count: number;
  logs: import('./models').WebhookDeliveryLog[];
}

/**
 * 14. MASCARAMENTO DINÂMICO DE DADOS (DDM) & MODO ANTI-SHOULDER SURFING (Opção K - RFC-001)
 */
export interface UnmaskAuditRequestDTO {
  resourceType: import('./enums').AuditResourceType;
  resourceId: string;
  fieldName: string;
  reason?: string;
}

export interface UnmaskAuditResponse {
  success: boolean;
  auditedAt: string;
  action: import('./enums').AuditAction;
  resourceType: import('./enums').AuditResourceType;
  resourceId: string;
  fieldName: string;
  actorId: string;
  autoHideSeconds: number;
  message: string;
}

export interface MaskedPatientViewDTO {
  id: string;
  name: string;
  emailMasked: string;
  phoneMasked: string;
  cpfMasked: string;
  isFullyMasked: boolean;
}

/**
 * 15. HEALTH CHECKS, LIVENESS & READINESS PROBES (Opção L - RFC-001 §5.2)
 */
export type ProbeHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface SystemResourceMetrics {
  uptimeSeconds: number;
  uptimeFormatted: string;
  pid: number;
  nodeVersion: string;
  bunVersion?: string;
  platform: string;
  arch: string;
  memory: {
    rssBytes: number;
    rssMb: number;
    heapUsedBytes: number;
    heapUsedMb: number;
    heapTotalMb: number;
  };
}

export interface DependencyCheckResult {
  name: string;
  category: 'database' | 'security' | 'cache' | 'storage' | 'compliance';
  status: ProbeHealthStatus;
  latencyMs: number;
  message?: string;
  details?: Record<string, any>;
}

export interface LivenessProbeResponse {
  status: ProbeHealthStatus;
  service: string;
  version: string;
  timestamp: string;
  system: SystemResourceMetrics;
}

export interface ReadinessProbeResponse {
  status: ProbeHealthStatus;
  service: string;
  version: string;
  timestamp: string;
  overallLatencyMs: number;
  checks: Record<string, DependencyCheckResult>;
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
  };
}

export interface StartupProbeResponse {
  status: ProbeHealthStatus;
  bootCompleted: boolean;
  migrationsApplied: boolean;
  bootstrapDurationMs: number;
  databaseDriver: string;
  timestamp: string;
}

/**
 * 16. MONITORAMENTO SINTÉTICO & TESTES E2E DA JORNADA CLÍNICA (Opção M - RFC-001)
 */
export type SyntheticStepStatus = 'passed' | 'failed' | 'skipped';
export type SyntheticOverallStatus = 'passed' | 'failed' | 'partial';

export interface SyntheticTestStep {
  id: string;
  name: string;
  description: string;
  status: SyntheticStepStatus;
  durationMs: number;
  details?: Record<string, any>;
  error?: string;
}

export interface ResilienceCheckResult {
  pgliteOperational: boolean;
  wasmEngineReady: boolean;
  failoverLatencyMs: number;
  schemaTableCount: number;
  message: string;
}

export interface SyntheticJourneyResult {
  executionId: string;
  status: SyntheticOverallStatus;
  startedAt: string;
  completedAt: string;
  totalDurationMs: number;
  trigger: 'manual' | 'scheduled' | 'health_probe';
  scenario: string;
  steps: SyntheticTestStep[];
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
  resilience?: ResilienceCheckResult;
}

export interface RunSyntheticProbeRequestDTO {
  scenario?: 'full_clinical_journey' | 'quick_smoke' | 'resilience_only';
  includeResilienceCheck?: boolean;
}

export interface SyntheticHistoryResponse {
  success: boolean;
  count: number;
  executions: SyntheticJourneyResult[];
}

/**
 * 17. ANAMNESE BIOPSICOSSOCIAL & TERMO DE RETIFICAÇÃO DE PRONTUÁRIO (RFC §3.4)
 */
export interface SaveAnamnesisDTO {
  chiefComplaint: string;
  historyOfComplaint: string;
  biopsychosocialHistory: import('./models').BiopsychosocialHistory;
  medicalAndPsychiatricHistory: import('./models').MedicalAndPsychiatricHistory;
  therapeuticGoals: string;
  emergencyContact?: import('./models').EmergencyContact;
}

export interface AnamnesisResponse {
  success: boolean;
  anamnesis: import('./models').DecryptedAnamnesisRecord;
  message?: string;
}

export interface CreateRectificationDTO {
  rectifiedQuadrant: import('./models').RectifiedQuadrant;
  reason: string;
  rectifiedContent: string;
  /** Confirmação explícita de revisão humana sob fé pública e ética profissional (CFP 001/2009) */
  confirmedEthicsReview: boolean;
}

export interface RectificationResponse {
  success: boolean;
  rectification: import('./models').ClinicalRecordRectification;
  message?: string;
}

export interface ListRectificationsResponse {
  success: boolean;
  clinicalRecordId: string;
  count: number;
  rectifications: import('./models').ClinicalRecordRectification[];
}

/**
 * 18. DTOs DE MÉTRICAS OPENTELEMETRY & PROMETHEUS (Opção N)
 */
export interface TelemetryOverviewResponse {
  success: boolean;
  telemetry: import('./models').TelemetryOverview;
}

export interface TracesListResponse {
  success: boolean;
  count: number;
  traces: import('./models').TraceSpan[];
}

export interface RawMetricsResponse {
  format: 'prometheus_text' | 'json';
  metrics: string;
}

/**
 * 19. DTOs DE WEBAUTHN / PASSKEYS & BIOMETRIA FIDO2 (Opção O - RFC-001)
 */
export interface PasskeyRegistrationOptionsResponse {
  success: boolean;
  challenge: string;
  rp: {
    name: string;
    id: string;
  };
  user: {
    id: string;
    name: string;
    displayName: string;
  };
  pubKeyCredParams: Array<{
    type: 'public-key';
    alg: number;
  }>;
  authenticatorSelection: {
    authenticatorAttachment?: 'platform' | 'cross-platform';
    userVerification: 'preferred' | 'required' | 'discouraged';
    residentKey: 'preferred' | 'required' | 'discouraged';
    requireResidentKey?: boolean;
  };
  timeout: number;
  attestation: 'none' | 'direct' | 'indirect';
  excludeCredentials?: Array<{
    id: string;
    type: 'public-key';
    transports?: string[];
  }>;
}

export interface PasskeyRegistrationVerifyDTO {
  friendlyName: string;
  clientDataJSON: string;
  attestationObject?: string;
  authenticatorData?: string;
  credentialId: string;
  publicKeyPem?: string; // Para registro simulado/headless
}

export interface PasskeyAuthenticationOptionsResponse {
  success: boolean;
  challenge: string;
  timeout: number;
  rpId: string;
  userVerification: 'preferred' | 'required' | 'discouraged';
  allowCredentials?: Array<{
    id: string;
    type: 'public-key';
    transports?: string[];
  }>;
}

export interface PasskeyAuthenticationVerifyDTO {
  credentialId: string;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
  userHandle?: string;
}

export interface PasskeyInfoDTO {
  id: string;
  credentialId: string;
  friendlyName: string;
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
  counter: number;
  createdAt: Date | string;
  lastUsedAt?: Date | string | null;
}

export interface PasskeyListResponse {
  success: boolean;
  passkeys: PasskeyInfoDTO[];
}

/**
 * DTOs de Auditoria Contínua, Pentest & Relatório RIPD/DPIA (Fase 4 do RFC-001)
 */
export interface RunCompliancePentestDTO {
  includeHistoricalWormAudit?: boolean;
}

export interface CompliancePentestResponse {
  success: boolean;
  message: string;
  report: import('./models').DPIAReport;
}

export interface DPIAReportResponse {
  success: boolean;
  report: import('./models').DPIAReport;
}

/**
 * DTOs de Conectores SIEM Externos & Retry Resiliente (RFC §4.4 & §5.2)
 */
export interface CreateSiemConnectorDTO {
  provider: import('./models').SiemProvider;
  name: string;
  endpointUrl: string;
  apiKey?: string;
  indexOrSource?: string;
  tags?: Record<string, string>;
  subscribedEvents: import('./models').WebhookEventType[];
}

export interface UpdateSiemConnectorDTO {
  name?: string;
  endpointUrl?: string;
  apiKey?: string;
  indexOrSource?: string;
  tags?: Record<string, string>;
  subscribedEvents?: import('./models').WebhookEventType[];
  enabled?: boolean;
}

export interface TestSiemConnectorDTO {
  eventType?: import('./models').WebhookEventType;
  mockHttpStatus?: number;
}

export interface SiemConnectorResponse {
  success: boolean;
  connector?: import('./models').SiemConnector;
  connectors?: import('./models').SiemConnector[];
  message?: string;
  testResult?: {
    httpStatus: number;
    latencyMs: number;
    success: boolean;
    formattedPayload: any;
    headersSent: Record<string, string>;
    error?: string;
  };
}

export interface SiemQueueResponse {
  pendingCount: number;
  retryingCount: number;
  deliveredCount: number;
  deadLetterCount: number;
  circuitBreakers: Array<{
    connectorId: string;
    name: string;
    provider: import('./models').SiemProvider;
    status: import('./models').CircuitBreakerStatus;
    consecutiveFailures: number;
  }>;
  recentItems: import('./models').SiemQueueItem[];
}

export interface SiemDlqReplayResponse {
  success: boolean;
  replayedCount: number;
  successCount: number;
  failedCount: number;
  items: import('./models').SiemQueueItem[];
  message?: string;
}

/**
 * 18. GESTÃO DE CHAVES KMS & ROTAÇÃO CONTÍNUA (NIST SP 800-57 & RFC §4.2)
 */
export interface RotateKmsKeyDTO {
  reason: string;
  reWrapExisting?: boolean;
}

export interface ReWrapDeksDTO {
  targetKeyVersion?: number;
}

export interface UpdateKmsPolicyDTO {
  enabled?: boolean;
  intervalDays?: number;
  autoReWrapLegacyDeks?: boolean;
  alertThresholdDays?: number;
}

export interface RevokeKmsKeyDTO {
  reason: string;
}

export interface KmsStatusResponse {
  success: boolean;
  status: import('./models').KmsSystemStatus;
  message?: string;
}

export interface RotateKmsKeyResponse {
  success: boolean;
  newKey: import('./models').KmsKeyMetadata;
  previousKey: import('./models').KmsKeyMetadata;
  reWrappedCount: number;
  message: string;
}

export interface ReWrapDeksResponse {
  success: boolean;
  targetVersion: number;
  totalExamined: number;
  reWrappedCount: number;
  skippedCount: number;
  message: string;
}

export interface UpdateKmsPolicyResponse {
  success: boolean;
  policy: import('./models').KmsRotationPolicy;
  message: string;
}

/**
 * 19. TESTES DE CARGA, STRESS CONCORRENTE & SLOS RED (RFC §5.1, §5.2)
 */
export interface RunStressTestDTO {
  scenario?: import('./enums').StressScenario;
  totalRequests?: number;
  concurrency?: number;
}

export interface StressTestResponse {
  success: boolean;
  report: import('./models').StressTestReport;
  message: string;
}

export interface StressHistoryResponse {
  success: boolean;
  reports: import('./models').StressTestReport[];
}

export interface StressSlosResponse {
  success: boolean;
  slos: Array<{
    id: string;
    name: string;
    targetDescription: string;
    thresholdMs?: number;
    maxErrorRate?: number;
    unit: string;
  }>;
}

/**
 * 20. EXPORTAÇÃO AUTOMÁTICA OTLP & TELEMETRIA REMOTA (RFC §5.2 - Opção N)
 */
export interface UpdateOtlpConfigDTO {
  enabled?: boolean;
  provider?: import('./enums').OtlpExporterProvider;
  endpoint?: string;
  apiKey?: string;
  batchSize?: number;
  flushIntervalSeconds?: number;
  customHeaders?: Record<string, string>;
  exportTraces?: boolean;
  exportMetrics?: boolean;
  serviceName?: string;
  environment?: string;
}

export interface TestOtlpExportDTO {
  provider?: import('./enums').OtlpExporterProvider;
  endpoint?: string;
  apiKey?: string;
  customHeaders?: Record<string, string>;
}

export interface OtlpStatusResponse {
  success: boolean;
  config: import('./models').OtlpExporterConfig;
  stats: import('./models').OtlpExporterStats;
}

export interface OtlpExportResponse {
  success: boolean;
  result: import('./models').OtlpBatchExportResult;
  stats: import('./models').OtlpExporterStats;
}

/**
 * 21. GOVERNANÇA EXECUTIVA, AUDITORIA & COMPLIANCE MULTI-NORMATIVO (RFC-001 §4.4, §5.2)
 */
export interface GenerateCompliancePackageDTO {
  dpoName?: string;
  technicalResponsibleCrp?: string;
  organization?: string;
}

export interface ApplyDpoSignOffDTO {
  packageId: string;
  dpoName: string;
  statement?: string;
}

export interface ExecutiveComplianceOverviewResponse {
  success: boolean;
  globalScorePercentage: number;
  status: import('./enums').ComplianceControlStatus;
  frameworks: import('./models').ComplianceFrameworkEvaluation[];
  forensicMetrics: import('./models').ForensicMetricsSnapshot;
  lastPackage?: import('./models').ExecutiveCompliancePackage;
}

export interface ExecutiveCompliancePackageResponse {
  success: boolean;
  package: import('./models').ExecutiveCompliancePackage;
  message: string;
}

/**
 * 22. HARDENING HTTP & HONEYPOT ANTI-PROBE (RFC-001 §4.4, §5.2)
 */
export interface SecurityHardeningOverviewResponse {
  success: boolean;
  metrics: import('./models').SecurityHardeningMetrics;
  activeBannedIps: import('./models').HoneypotProbeRecord[];
  recentProbes: import('./models').HoneypotProbeRecord[];
}

export interface UnbanIpRequestDTO {
  ipAddress: string;
  reason?: string;
}

export interface UnbanIpResponse {
  success: boolean;
  ipAddress: string;
  message: string;
  unbannedAt: string;
}

export interface VerifySecurityHeadersResponse {
  success: boolean;
  evaluation: import('./models').SecurityHeadersEvaluationResult;
}

/**
 * Diagnóstico & Status da Integração Google Meet REST API v2
 */
export interface GoogleMeetStatusResponse {
  configured: boolean;
  activeProvider: MeetProvider;
  defaultAccessType: MeetAccessType;
  scopes: string[];
  features: {
    spacesV2: boolean;
    calendarV3: boolean;
    knockingWaitingRoom: boolean;
    endConference: boolean;
    oauthFlow: boolean;
  };
  oauth?: {
    hasClientId: boolean;
    hasClientSecret: boolean;
    hasRefreshToken: boolean;
    connectedEmail?: string;
  };
}

/**
 * Resposta de Teste de Emissão de Sala no Google Meet
 */
export interface GoogleMeetTestResponse {
  success: boolean;
  provider: MeetProvider;
  spaceName?: string;
  meetingCode: string;
  meetingUri: string;
  accessType: MeetAccessType;
  latencyMs: number;
  message?: string;
}

/**
 * 23. AUDITORIA DE SESSÃO WEBRTC & FINGERPRINT DE SEGURANÇA (RFC-001 §3.2, §4.4, §5.2 e CFP 011/2018)
 */
export interface InitiateWebRtcAuditSessionDTO {
  appointmentId?: string;
  patientId: string;
  therapistFingerprint: string;
  certificateAlgorithm?: string;
  cipherSuite?: string;
  dtlsVersion?: string;
}

export interface InitiateWebRtcAuditSessionResponse {
  success: boolean;
  session: import('./models').WebRtcSessionAuditRecord;
  message: string;
}

export interface VerifyWebRtcFingerprintDTO {
  sessionId: string;
  patientFingerprint: string;
  certificateAlgorithm?: string;
  manuallyConfirmedByUser?: boolean;
}

export interface VerifyWebRtcFingerprintResponse {
  success: boolean;
  sessionId: string;
  verificationStatus: import('./enums').WebRtcVerificationStatus;
  safetyNumbers: string;
  match: boolean;
  securityGrade: import('./enums').WebRtcSecurityGrade;
  probataryDigest: string;
  message: string;
}

export interface RecordWebRtcMetricsDTO {
  sessionId: string;
  jitterMs: number;
  packetLoss: number;
  rttMs: number;
  bytesSent: number;
  bytesReceived: number;
  cipherSuite?: string;
}

export interface RecordWebRtcMetricsResponse {
  success: boolean;
  sessionId: string;
  averageJitterMs: number;
  packetLossPercent: number;
  totalBytesEncrypted: number;
  message: string;
}

export interface TerminateWebRtcSessionDTO {
  sessionId: string;
  finalNotes?: string;
}

export interface TerminateWebRtcSessionResponse {
  success: boolean;
  session: import('./models').WebRtcSessionAuditRecord;
  probataryDigest: string;
  message: string;
}

export interface WebRtcSessionListResponse {
  success: boolean;
  count: number;
  sessions: import('./models').WebRtcSessionAuditRecord[];
}

/**
 * 24. WAF EM CAMADA DE APLICAÇÃO & INSPEÇÃO HEURÍSTICA DE PAYLOADS (RFC-001 §4.4, §5.2)
 */
export interface WafOverviewResponse {
  success: boolean;
  metrics: import('./models').WafMetrics;
  recentIncidents: import('./models').WafIncidentRecord[];
}

export interface InspectPayloadDTO {
  payload: string | Record<string, any>;
  context?: string;
}

export interface InspectPayloadResponse {
  success: boolean;
  inspection: import('./models').WafInspectionResult;
  threatScore: number;
  blocked: boolean;
  message: string;
}

export interface UpdateWafModeDTO {
  mode: import('./enums').WafMode;
  blockThreshold?: number;
}

export interface UpdateWafModeResponse {
  success: boolean;
  mode: import('./enums').WafMode;
  blockThreshold: number;
  message: string;
}

/**
 * 25. SIMULAÇÃO DE RESILIÊNCIA DE REDE & INTELIGIBILIDADE CLÍNICA (RFC-001 §3.2, §5.1, §5.2 e CFP 011/2018)
 */
export interface RunNetworkSimulationDTO {
  profile?: import('./enums').NetworkProfileType;
  params?: Partial<import('./models').NetworkSimulationParams>;
  patientId?: string;
  notes?: string;
}

export interface NetworkSimulationResponse {
  success: boolean;
  report: import('./models').NetworkSimulationReport;
  message: string;
}

export interface NetworkResilienceHistoryResponse {
  success: boolean;
  reports: import('./models').NetworkSimulationReport[];
  metrics: import('./models').NetworkResilienceMetrics;
}

export interface NetworkSimulationPresetsResponse {
  success: boolean;
  presets: import('./models').NetworkProfilePreset[];
}

/**
 * 26. GRAVAÇÃO EM REPOUSO COM SHARDING & DESTRUIÇÃO PROGRAMADA (CRYPTO-SHREDDING) (RFC-001 §3.2, §3.3, §4.2, CFP 011/2018)
 */
export interface CreateMediaSessionDTO {
  sessionId: string;
  patientId?: string;
  codec?: import('./enums').AudioCodecType;
  estimatedDurationSeconds?: number;
}

export interface UploadMediaChunkDTO {
  chunkIndex: number;
  audioDataBase64: string; // Payload bruto do chunk de áudio em base64
  isLastChunk?: boolean;
}

export interface FinalizeMediaRecordingDTO {
  recordingId: string;
}

export interface ExecuteCryptoShreddingDTO {
  recordingId?: string;
  reason?: string;
  method?: import('./enums').CryptoShreddingMethod;
}

export interface MediaRecordingResponse {
  success: boolean;
  recording: import('./models').MediaRecordingManifest;
  message: string;
}

export interface MediaSessionListResponse {
  success: boolean;
  recordings: import('./models').MediaRecordingManifest[];
  metrics: import('./models').MediaStorageMetrics;
}

export interface CryptoShreddingResponse {
  success: boolean;
  certificate: import('./models').CryptoShreddingCertificate;
  message: string;
}

export interface SimulateMediaPipelineResponse {
  success: boolean;
  recording: import('./models').MediaRecordingManifest;
  certificate?: import('./models').CryptoShreddingCertificate;
  message: string;
}

/**
 * DTOs de Recuperação de Sessão Clínica e Resiliência de Rede (RFC-001 §3.2)
 */
export interface StartSessionMonitoringDTO {
  sessionId: string;
  appointmentId: string;
  patientId?: string;
  gracePeriodSeconds?: number;
  initialSnapshot?: Partial<import('./models').SessionStateSnapshot>;
}

export interface SessionHeartbeatDTO {
  sessionId: string;
  snapshot?: Partial<import('./models').SessionStateSnapshot>;
}

export interface TriggerSessionDisconnectionDTO {
  sessionId: string;
  cause: import('./enums').DisconnectionCause;
  detail?: string;
}

export interface AttemptSessionReconnectDTO {
  sessionId: string;
  reconnectionToken: string;
  clientTimestamp?: string;
}

export interface CompleteClinicalSessionDTO {
  sessionId: string;
  finalNotes?: string;
}

export interface SessionMonitoringResponse {
  success: boolean;
  session: import('./models').ClinicalSessionRecoverySession;
  reconnectionToken?: string; // Token HMAC emitido para reassunção em caso de queda
  message: string;
}

export interface SessionReconnectResponse {
  success: boolean;
  session: import('./models').ClinicalSessionRecoverySession;
  restoredSnapshot?: import('./models').SessionStateSnapshot;
  recoveryGrade?: import('./enums').SessionRecoveryGrade;
  message: string;
}

export interface SessionRecoveryListResponse {
  success: boolean;
  sessions: import('./models').ClinicalSessionRecoverySession[];
  metrics: import('./models').SessionRecoveryMetrics;
}

/**
 * DTOs de Provas de Conhecimento Zero (Zero-Knowledge Proofs - RFC-001 §3.4, §3.5 & CFP 006/2019)
 */
export interface GenerateZkpProofDTO {
  documentId: string;
  proofType?: import('./enums').ZkpProofType;
  documentTypeClaim: string; // "Laudo Psicológico", "Relatório Psicológico", "Atestado Psicológico", "Declaração"
  documentIssuedAt?: string;
  ttlSeconds?: number;
}

export interface VerifyZkpProofDTO {
  publicVerificationToken: string;
}

export interface ZkpProofResponse {
  success: boolean;
  proof: import('./models').ZkpClinicalDocumentProof;
  message: string;
}

export interface ZkpVerificationResponse {
  success: boolean;
  result: import('./models').ZkpVerificationResult;
  message: string;
}

export interface ZkpProofListResponse {
  success: boolean;
  proofs: import('./models').ZkpClinicalDocumentProof[];
  metrics: import('./models').ZkpSystemMetrics;
}

/**
 * DTOs de Monitoramento de Vazamentos na Dark Web & Resposta a Incidentes (RFC-001 §4.4, LGPD Art. 46/48)
 */
export interface CheckCredentialBreachDTO {
  emailOrIdentifier?: string;
  passwordSample?: string;
}

export interface TriggerDarkWebScanDTO {
  scope?: 'ALL_STAFF' | 'ADMINS_ONLY' | 'SPECIFIC_USER';
  targetEmail?: string;
  simulateBreachDump?: boolean;
}

export interface ContainIncidentDTO {
  incidentId: string;
  reason?: string;
  forcePasswordReset?: boolean;
}

export interface ResolveIncidentDTO {
  incidentId: string;
  alertId?: string;
  resolutionNotes: string;
  reportedToAnpd: boolean;
  anpdProtocolNumber?: string;
}

export interface CredentialBreachCheckResponse {
  success: boolean;
  result: import('./models').KAnonymityLookupResult;
  message: string;
}

export interface ThreatScanResponse {
  success: boolean;
  newIncidentsCount: number;
  incidents: import('./models').CredentialBreachRecord[];
  alertsGenerated: import('./models').DpoIncidentAlert[];
  message: string;
}

export interface ThreatIntelligenceOverviewResponse {
  success: boolean;
  incidents: import('./models').CredentialBreachRecord[];
  alerts: import('./models').DpoIncidentAlert[];
  metrics: import('./models').ThreatIntelligenceMetrics;
}

export interface ContainIncidentResponse {
  success: boolean;
  incident: import('./models').CredentialBreachRecord;
  sessionsRevokedCount: number;
  dpoAlert?: import('./models').DpoIncidentAlert;
  message: string;
}

export interface ResolveIncidentResponse {
  success: boolean;
  incident: import('./models').CredentialBreachRecord;
  alert?: import('./models').DpoIncidentAlert;
  message: string;
}







