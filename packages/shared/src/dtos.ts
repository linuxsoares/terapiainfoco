import { AppointmentStatus, DocumentType, UserRole } from './enums';
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










