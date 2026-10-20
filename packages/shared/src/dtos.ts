import { 
  AppointmentStatus, 
  DocumentType, 
  UserRole, 
  SocialAuthProvider,
  RecurrenceFrequency,
  ReminderChannel,
  ReminderTiming,
  ReminderDeliveryStatus,
  ClinicalMarkerCategory,
  ClinicalMarkerRelevance,
  GoalStatus,
  PsychometricScaleType
} from './enums';
import type { 
  SoapNote, 
  TranscriptUtterance, 
  SafeUser, 
  IcpCertificateInfo, 
  IcpSignatureData, 
  DecryptedAppointment,
  PsychometricAssessment,
  LeadStatus
} from './models';
import type { EnvelopeEncryptedData } from './crypto';

/** Pedido de acesso antecipado (formulário de demonstração da landing page) */
export interface CreateLeadDTO {
  name: string;
  email: string;
  crp: string;
  whatsapp?: string;
  practiceType?: string;
  consent: boolean;
  /** Campo invisível para pessoas: preenchido só por robôs */
  website?: string;
}

/** Pedido de acesso decifrado para o Admin */
export interface AdminLead {
  id: string;
  name: string;
  email: string;
  whatsapp?: string;
  crp: string;
  practiceType: string;
  createdAt: Date | string;
  status: LeadStatus;
  handledAt?: Date | string;
}

/** Aprovação do pedido: cria a conta de psicólogo com senha inicial */
export interface ApproveLeadDTO {
  /** UF do conselho regional (ex.: SP para o CRP 06) */
  crpRegion: string;
}

export interface ApproveLeadResponse {
  success: boolean;
  lead: AdminLead;
  temporaryPassword: string;
}

/** Consultório (psicólogo titular) ao qual contas da equipe podem ser vinculadas */
export interface AdminPractice {
  therapistId: string;
  name: string;
  email: string;
  crp?: string;
}

/** Conta não-paciente listada na gestão de equipe do Admin */
export interface AdminStaffMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  therapistId?: string;
  practiceName?: string;
  twoFactorEnabled: boolean;
  createdAt: Date | string;
  lastLoginAt?: Date | string | null;
  disabled: boolean;
  mustChangePassword: boolean;
}

export interface CreateStaffMemberDTO {
  name: string;
  email: string;
  role: UserRole;
  therapistId: string;
}

export interface CreateStaffMemberResponse {
  success: boolean;
  member: AdminStaffMember;
  /** Exibida uma única vez; a troca é exigida no primeiro acesso */
  temporaryPassword: string;
}

export type ResetStaffPasswordResponse = CreateStaffMemberResponse;

/** Resultado da busca de pacientes por nome ou e-mail (restrita ao consultório) */
export interface PatientSearchItem {
  id: string;
  name: string;
  email: string;
}

export interface PatientSearchResponse {
  success: boolean;
  patients: PatientSearchItem[];
}

export interface CreatePatientDTO {
  name: string;
  email: string;
  phone: string;
  cpf?: string;
  consentTranscriptionSigned: boolean;
}

/**
 * Configuração de Recorrência para Séries Terapêuticas (RFC-001 §3.1)
 */
export interface AppointmentRecurrenceConfig {
  frequency: RecurrenceFrequency; // WEEKLY, BIWEEKLY, MONTHLY
  count: number;                  // Número de sessões na série (ex: 4, 8, 12)
  totalSessions?: number;         // Alias para total de sessões
}

export interface CreateAppointmentDTO {
  patientId: string;
  scheduledStart: string; // ISO string
  scheduledEnd: string;   // ISO string
  bufferMinutes?: number;
  recurrence?: AppointmentRecurrenceConfig;
}

/**
 * Resposta de Criação de Agendamentos Recorrentes
 */
export interface CreateRecurrentAppointmentsResponse {
  success: boolean;
  seriesId: string;
  frequency: RecurrenceFrequency;
  requestedCount: number;
  count?: number; // Alias para conveniência
  createdAppointments: DecryptedAppointment[];
  conflictSlots?: {
    scheduledStart: string;
    scheduledEnd: string;
    reason: string;
  }[];
}

/**
 * DTO para Disparo de Lembrete de Consulta (RFC-001 §3.1)
 */
export interface SendReminderDTO {
  appointmentId: string;
  channel: ReminderChannel;
  timing?: ReminderTiming;
  customMessage?: string;
  recipientPhone?: string;
  recipientEmail?: string;
}

/**
 * Resposta de Disparo de Lembrete
 */
export interface SendReminderResponse {
  success: boolean;
  reminderId: string;
  appointmentId: string;
  patientId: string;
  channel: ReminderChannel;
  recipientPhone?: string;
  recipientEmail?: string;
  whatsappDirectUrl?: string;
  renderedMessage: string;
  status: ReminderDeliveryStatus;
  auditWormId?: string;
  message?: string;
  sentAt?: string;
}

/**
 * DTOs de Marcadores Clínicos em Tempo Real (RFC-001 §3.3)
 */
export interface CreateClinicalMarkerDTO {
  appointmentId: string;
  timestampMs: number;
  timeFormatted: string;
  category: ClinicalMarkerCategory;
  relevance: ClinicalMarkerRelevance;
  note: string;
  utteranceIndex?: number;
  suggestedSoapQuadrant?: 'SUBJECTIVE' | 'OBJECTIVE' | 'ASSESSMENT' | 'PLAN';
}

export interface UpdateClinicalMarkerDTO {
  category?: ClinicalMarkerCategory;
  relevance?: ClinicalMarkerRelevance;
  note?: string;
  suggestedSoapQuadrant?: 'SUBJECTIVE' | 'OBJECTIVE' | 'ASSESSMENT' | 'PLAN';
}

export interface ExportMarkersToSoapProposalResponse {
  success: boolean;
  appointmentId: string;
  totalMarkersCount: number;
  suggestedSoap: {
    subjective: string[];
    objective: string[];
    assessment: string[];
    plan: string[];
  };
}

/**
 * DTOs de Metas e Planos Terapêuticos SMART (RFC-001 §3.4)
 */
export interface CreateTherapeuticGoalDTO {
  patientId: string;
  title: string;
  description: string;
  category?: string;
  targetDate?: string;
  measurementMetric?: string;
  notes?: string;
  initialProgressPercent?: number;
}

export interface UpdateTherapeuticGoalDTO {
  title?: string;
  description?: string;
  category?: string;
  targetDate?: string;
  status?: GoalStatus;
  progressPercent?: number;
  measurementMetric?: string;
  notes?: string;
}

/**
 * DTOs de Avaliação e Escalas Psicométricas Padronizadas (PHQ-9 & GAD-7)
 */
export interface PsychometricScaleQuestionOption {
  score: number;
  label: string;
}

export interface PsychometricScaleDefinition {
  scaleType: PsychometricScaleType;
  title: string;
  description: string;
  questions: string[];
  options: PsychometricScaleQuestionOption[];
  maxScore: number;
}

export interface SubmitPsychometricAssessmentDTO {
  patientId: string;
  appointmentId?: string;
  scaleType: PsychometricScaleType;
  answers: {
    questionIndex: number;
    score: number; // 0 (Nenhuma vez) a 3 (Quase todos os dias)
  }[];
}

export interface PsychometricAssessmentResultResponse {
  success: boolean;
  assessment: PsychometricAssessment;
  patientHistory: {
    previousScore?: number;
    scoreDelta?: number;
    trend: 'IMPROVED' | 'STABLE' | 'WORSENED' | 'BASELINE';
  };
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

/** Agendamento feito pelo paciente autenticado a partir do perfil público do psicólogo */
export interface PatientBookingDTO {
  therapistId: string;
  scheduledStart: string; // ISO
  scheduledEnd: string;   // ISO
  consentTeleconsultationSigned: boolean;
}

/** Consulta exibida ao paciente ("Minhas consultas") */
export interface PatientAppointmentView {
  id: string;
  therapistId: string;
  therapistName: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
  roomUrl: string;
}

export interface PublicBookingResponse {
  appointmentId: string;
  patientName: string;
  therapistName: string;
  scheduledStart: string;
  scheduledEnd: string;
  roomUrl: string;
  bufferMinutes: number;
  consentRecordedAt: string;
  instructions: string[];
}

/**
 * DTOs de Autenticação, Sessão, Login Social, Criação de Perfil e 2FA/MFA (Opção C)
 */
export interface RegisterDTO {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  crp?: string;
  crpRegion?: string;
  phone?: string;
  cpf?: string;
  patientId?: string;
  specialty?: string;
  bio?: string;
  sessionFeeCents?: number;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  department?: string;
  dpoCertification?: string;
  socialProvider?: SocialAuthProvider;
}

export interface SocialAuthLoginDTO {
  provider: SocialAuthProvider;
  email: string;
  name: string;
  role?: UserRole;
  providerToken?: string;
  crp?: string;
  crpRegion?: string;
  phone?: string;
  cpf?: string;
  specialty?: string;
  department?: string;
  dpoCertification?: string;
}

export interface UpdateUserProfileDTO {
  name?: string;
  phone?: string;
  crp?: string;
  crpRegion?: string;
  specialty?: string;
  bio?: string;
  sessionFeeCents?: number;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  department?: string;
  dpoCertification?: string;
}

export interface PublicPlatformShowcaseOverview {
  platformName: string;
  version: string;
  tagline: string;
  totalClinicalModules: number;
  totalSecurityLayers: number;
  totalAutomatedTests: number;
  supportedSocialProviders: SocialAuthProvider[];
  normativeCompliance: Array<{
    code: string;
    title: string;
    description: string;
  }>;
  profilesCatalog: Array<{
    role: UserRole;
    title: string;
    subtitle: string;
    badge: string;
    demoEmail: string;
    highlights: string[];
  }>;
  clinicalModulesHighlight: Array<{
    id: string;
    section: string;
    title: string;
    description: string;
    normativeBasis: string;
    targetRoles: UserRole[];
  }>;
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
  socialProviderUsed?: SocialAuthProvider;
  isNewProfile?: boolean;
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
  /** Restringe aos registros do consultório (atores da equipe ou recursos clínicos dele) */
  therapistId?: string;
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
  /** @deprecated Ignorado: a chave pública vem sempre do authenticatorData */
  publicKeyPem?: string;
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
  /** Controles avaliados agora (o pacote emitido é um retrato de um momento anterior) */
  controls: import('./models').ComplianceControlDetail[];
  /** Identificação sugerida para o próximo pacote (último emitido ou configuração do ambiente) */
  identity: { organization: string; dpoName: string; technicalResponsibleCrp: string };
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

/**
 * 22. GESTÃO GRANULAR DE CONSENTIMENTO DO PACIENTE & SMART REVOCATION (LGPD Art. 7/8/9/11/18 & CFP 006/2019)
 */
export interface GrantGranularConsentDTO {
  patientId: string;
  scopes: Array<{
    scope: import('./enums').ConsentScope;
    granted: boolean;
    revocationReason?: string;
  }>;
  termVersion?: string;
  notes?: string;
}

export interface RevokeGranularConsentDTO {
  patientId: string;
  scope: import('./enums').ConsentScope;
  reason: string;
}

export interface VerifyConsentTokenDTO {
  token: string;
}

export interface EnforceConsentDTO {
  patientId: string;
  requestedScope: import('./enums').ConsentScope;
}

export interface GranularConsentResponse {
  success: boolean;
  ledger: import('./models').PatientConsentLedger;
  newReceipts: import('./models').ConsentReceipt[];
  message: string;
}

export interface ConsentReceiptResponse {
  success: boolean;
  valid: boolean;
  receipt?: import('./models').ConsentReceipt;
  patientNameMasked?: string;
  message: string;
}

export interface EnforceConsentResponse {
  success: boolean;
  result: import('./models').ConsentValidationResult;
}

export interface ConsentLedgerOverviewResponse {
  success: boolean;
  overview: import('./models').ConsentLedgerOverview;
  recentReceipts: import('./models').ConsentReceipt[];
  patientLedger?: import('./models').PatientConsentLedger;
}

/**
 * 23. DATA LOSS PREVENTION (DLP) NO CLIPBOARD & MARCA D'ÁGUA ESTEGANOGRÁFICA (LGPD Art. 46 & CFP nº 001/2009)
 */
export interface EvaluateClipboardDlpDTO {
  text: string;
  patientId: string;
  patientName?: string;
  operatorId?: string;
  operatorName?: string;
  sourceContext?: 'SOAP_NOTES' | 'ANAMNESE' | 'PATIENT_PROFILE' | 'DOCUMENT' | 'PRESCRIPTION' | 'GENERAL' | string;
  policyMode?: import('./enums').DlpPolicyMode;
}

export interface InspectClipboardDlpDTO {
  suspiciousText: string;
  investigatorId?: string;
}

export interface UpdateDlpPolicyDTO {
  policyMode: import('./enums').DlpPolicyMode;
}

export interface EvaluateClipboardDlpResponse {
  success: boolean;
  result: import('./models').DlpEvaluationResult;
}

export interface InspectClipboardDlpResponse {
  success: boolean;
  result: import('./models').DlpInspectionResult;
}

export interface DlpOverviewResponse {
  success: boolean;
  overview: import('./models').DlpAuditOverview;
}

/**
 * 24. CARTÓRIO NOTARIAL DIGITAL DE PRONTUÁRIOS & AUDITORIA FORENSE ZERO-KNOWLEDGE
 * (LGPD Art. 18 & CFP nº 001/2009)
 */

export interface SealClinicalRecordDTO {
  recordId: string;
  patientId: string;
  therapistId: string;
  therapistCrp: string;
  clinicalCanonicalHash?: string;
}

export interface VerifyNotarySealDTO {
  sealTokenOrBlindIndex: string;
}

export interface VerifyNotaryChainDTO {
  patientId: string;
}

export interface IssueNotaryCertificateDTO {
  recordId: string;
  patientId: string;
}

export interface SealClinicalRecordResponse {
  success: boolean;
  block: import('./models').ClinicalNotaryBlock;
  message: string;
}

export interface VerifyNotaryResponse {
  success: boolean;
  result: import('./models').NotaryChainVerificationResult;
}

export interface NotaryOverviewResponse {
  success: boolean;
  overview: import('./models').NotaryLedgerOverview;
}

export interface NotaryCertificateResponse {
  success: boolean;
  certificate: import('./models').NotaryCertificate;
}

/**
 * 25. MECANISMO DE DESCARTE E EXPURGAMENTO SEGURO DE DADOS HISTÓRICOS (LGPD Art. 16 & CFP nº 001/2009)
 */

export interface ExecuteDataPurgeDTO {
  patientId: string;
  purgeReason: import('./enums').PurgeReason;
  purgeMethod?: import('./enums').PurgeMethod;
  dpoConfirmationPassword?: string;
  override5YearRuleWithLegalOrder?: boolean;
  legalOrderNumber?: string;
}

export interface VerifyPurgeProofDTO {
  purgeSealOrCertificateId: string;
}

export interface PurgeCandidatesResponse {
  success: boolean;
  candidates: import('./models').PurgeCandidateRecord[];
  count: number;
}

export interface ExecutePurgeResponse {
  success: boolean;
  result: import('./models').PurgeExecutionResult;
}

export interface PurgeOverviewResponse {
  success: boolean;
  overview: import('./models').PurgeLedgerOverview;
}

export interface VerifyPurgeProofResponse {
  success: boolean;
  result: import('./models').PurgeProofVerificationResult;
}

export interface PurgeCertificateResponse {
  success: boolean;
  certificate: import('./models').DataPurgeCertificate;
}

/**
 * 26. FEDERAÇÃO DE IDENTIDADES DESCENTRALIZADAS (DID) & CREDENCIAIS VERIFICÁVEIS (RFC-001 §3.5)
 */

export interface ResolveDidDTO {
  did: string;
}

export interface ResolveDidResponse {
  success: boolean;
  didDocument?: import('./models').W3CDidDocument;
  message?: string;
}

export interface IssueVerifiableCredentialDTO {
  credentialType: import('./enums').VerifiableCredentialType;
  subjectId?: string; // DID ou URN do paciente
  patientId: string;
  therapistId: string;
  therapistCrp: string;
  therapistName: string;
  expirationMonths?: number;
  clinicalSpecialty?: string;
  referralReason?: string;
  targetSpecialistType?: string; // PSIQUIATRA, NEUROLOGISTA, etc.
  cidOrCid11Category?: string;
  additionalClaims?: Record<string, any>;
}

export interface IssueVerifiableCredentialResponse {
  success: boolean;
  credential: import('./models').W3CVerifiableCredential;
  jwtToken: string;
  message: string;
}

export interface VerifyVerifiableCredentialDTO {
  credentialOrPresentationPayload: string; // JSON serializado ou JWT ou ID
  expectedNonce?: string;
}

export interface VerifyVerifiableCredentialResponse {
  success: boolean;
  result: import('./models').VerifiableCredentialVerificationResult;
}

export interface RevokeVerifiableCredentialDTO {
  credentialId: string;
  revocationReason: string;
}

export interface RevokeVerifiableCredentialResponse {
  success: boolean;
  credentialId: string;
  revokedAt: string;
  message: string;
}

export interface DidFederationOverviewResponse {
  success: boolean;
  overview: import('./models').DidFederationOverview;
}

export interface PatientVerifiableCredentialsResponse {
  success: boolean;
  patientId: string;
  credentials: import('./models').W3CVerifiableCredential[];
  count: number;
}

/**
 * DTOs para Análise Comportamental Preditiva (UEBA - RFC-001 §4.4 & LGPD Art. 46)
 */
export interface EvaluateAccessRiskDTO {
  userId: string;
  therapistCrp?: string;
  userRole?: string;
  patientId?: string;
  patientBlindIndex?: string;
  resourceType: 'CLINICAL_RECORD' | 'SOAP_NOTE' | 'PATIENT_PROFILE' | 'TRANSCRIPT' | 'DOCUMENT' | 'BLIND_INDEX_SEARCH';
  actionType: 'READ' | 'EXPORT' | 'BULK_READ' | 'SEARCH' | 'PRINT';
  ipAddress?: string;
  userAgent?: string;
  locationCountry?: string;
  timestamp?: string;
  recordsAccessedCount?: number;
}

export interface EvaluateAccessRiskResponse {
  success: boolean;
  assessment: import('./models').UebaRiskAssessment;
  incidentCreated?: boolean;
  incident?: import('./models').UebaAnomalyIncident;
  containmentApplied?: boolean;
  message: string;
}

export interface SimulateAccessPatternDTO {
  scenario: 'NORMAL_ROUTINE' | 'BULK_SCRAPING' | 'OFF_HOURS_MIDNIGHT' | 'IMPOSSIBLE_GEO_JUMP' | 'BLIND_INDEX_DICTIONARY' | 'UNLINKED_PATIENT_ACCESS';
  userId?: string;
  therapistCrp?: string;
  patientId?: string;
}

export interface SimulateAccessPatternResponse {
  success: boolean;
  scenario: string;
  simulatedEvent: import('./models').UebaAccessEvent;
  assessment: import('./models').UebaRiskAssessment;
  incident?: import('./models').UebaAnomalyIncident;
  message: string;
}

export interface ApplyUebaContainmentDTO {
  incidentId?: string;
  userId: string;
  action: import('./enums').UebaContainmentAction;
  reason: string;
  adminNotes?: string;
}

export interface ApplyUebaContainmentResponse {
  success: boolean;
  userId: string;
  action: import('./enums').UebaContainmentAction;
  status: import('./enums').UebaContainmentStatus;
  appliedAt: string;
  message: string;
}

export interface UebaOverviewResponse {
  success: boolean;
  overview: import('./models').UebaSystemOverview;
}

export interface UebaIncidentsResponse {
  success: boolean;
  incidents: import('./models').UebaAnomalyIncident[];
  total: number;
}

export interface GetUserUebaProfileResponse {
  success: boolean;
  baseline: import('./models').UebaUserProfileBaseline;
  contained: boolean;
  activeContainmentAction?: import('./enums').UebaContainmentAction;
}

/**
 * DTOs para Privacidade Diferencial e Estatísticas Clínicas Anonimizadas (LGPD Art. 13 & CFP nº 001/2009)
 */
export interface ExecuteDpQueryDTO {
  projectId: string;
  metric: import('./enums').DpCohortMetric;
  queryType: import('./enums').DpQueryType;
  epsilon: number;
  mechanism?: import('./enums').DpMechanism;
  clampingLowerBound?: number;
  clampingUpperBound?: number;
}

export interface ExecuteDpQueryResponse {
  success: boolean;
  result: import('./models').DpQueryResult;
  remainingBudget: number;
  budgetStatus: import('./enums').DpBudgetStatus;
  message: string;
}

export interface AllocateDpBudgetDTO {
  projectId: string;
  title?: string;
  researcherName?: string;
  institution?: string;
  cepProtocol?: string;
  purpose?: string;
  epsilonBudget: number;
  deltaBudget?: number;
  dpoApprover: string;
}

export interface AllocateDpBudgetResponse {
  success: boolean;
  project: import('./models').DpResearchProject;
  message: string;
}

export interface VerifyDpProofDTO {
  proofSeal: string;
}

export interface VerifyDpProofResponse {
  success: boolean;
  verification: import('./models').DpProofVerification;
  message: string;
}

export interface GenerateDpBenchmarkDTO {
  projectId: string;
  benchmarkType: 'CLINICAL_OUTCOMES' | 'EPIDEMIOLOGICAL_PREVALENCE' | 'SESSION_DURATION_ANALYTICS';
  epsilonPerMetric: number;
  mechanism?: import('./enums').DpMechanism;
}

export interface GenerateDpBenchmarkResponse {
  success: boolean;
  benchmark: import('./models').DpEpidemiologicalBenchmark;
  remainingBudget: number;
  message: string;
}

export interface DpOverviewResponse {
  success: boolean;
  overview: import('./models').DpSystemOverview;
}

export interface DpProjectsResponse {
  success: boolean;
  projects: import('./models').DpResearchProject[];
  total: number;
}

/**
 * DTOs para Gestão Segura de Sessões Clínicas e Token Binding DPoP (RFC-001 §4.4 & OWASP ASVS)
 */
export interface TerminateSessionDTO {
  sessionId: string;
  reason?: string;
}

export interface TerminateSessionResponse {
  success: boolean;
  sessionId?: string;
  /** Sessão encerrada (campo devolvido pela API) */
  terminatedSessionId?: string;
  proofSeal?: string;
  message: string;
}

export interface TerminateAllOtherSessionsDTO {
  currentSessionId: string;
  reason?: string;
}

export interface TerminateAllOtherSessionsResponse {
  success: boolean;
  terminatedCount: number;
  terminatedSessionIds: string[];
  message: string;
}

export interface SimulateConcurrentLoginDTO {
  userId?: string;
  scenario: 'NEW_UNKNOWN_DEVICE' | 'TOKEN_REPLAY_ATTACK' | 'EXCEED_CONCURRENCY_LIMIT';
  ipAddress?: string;
  deviceName?: string;
}

export interface SimulateConcurrentLoginResponse {
  success: boolean;
  actionTaken: 'ALLOWED' | 'REVOKED_OLDER_SESSION' | 'BLOCKED_TOKEN_BINDING_MISMATCH' | 'BLOCKED_CONCURRENCY_LIMIT';
  session?: import('./models').ClinicalActiveSession;
  revokedSessionId?: string;
  proofSeal?: string;
  message: string;
}

export interface VerifyDpopBindingDTO {
  dpopProof: string;
  httpMethod: string;
  httpUri: string;
  accessToken?: string;
}

export interface VerifyDpopBindingResponse {
  success: boolean;
  verification: import('./models').DpopVerificationResult;
  message: string;
}

export interface SessionOverviewResponse {
  success: boolean;
  overview: import('./models').SessionManagementOverview;
}

export interface ActiveSessionsListResponse {
  success: boolean;
  sessions: import('./models').ClinicalActiveSession[];
  total: number;
}

/**
 * DTOs de Prevenção de Força Bruta & Desafio PoW (RFC-001 §4.4 & OWASP OAT-007 / OAT-008)
 */
export interface RequestPowChallengeDTO {
  clientIp?: string;
}

export interface RequestPowChallengeResponse {
  success: boolean;
  challenge: import('./models').PowChallenge;
  requiresPoW: boolean;
  difficulty: number;
}

export interface SubmitPowSolutionDTO {
  challenge: import('./models').PowChallenge;
  nonce: number;
  clientDurationMs?: number;
}

export interface SubmitPowSolutionResponse {
  success: boolean;
  verification: import('./models').PowVerificationResult;
  defenseSeal?: string;
  message: string;
}

export interface SimulateBruteForceAttackDTO {
  ipAddress?: string;
  attemptsCount?: number;
  threatCategory: import('./enums').BruteForceThreatCategory;
}

export interface SimulateBruteForceAttackResponse {
  success: boolean;
  attackSimulated: boolean;
  attemptsBlocked: number;
  finalDifficultyTier: import('./enums').PowDifficultyTier;
  finalDifficulty: number;
  defenseSeal: string;
  ipReputation: import('./models').BruteForceIpReputation;
  message: string;
}

export interface ResetIpReputationDTO {
  ipAddress: string;
  reason: string;
}

export interface ResetIpReputationResponse {
  success: boolean;
  ipAddress: string;
  message: string;
}

export interface PowDefenseOverviewResponse {
  success: boolean;
  overview: import('./models').PowDefenseOverview;
}

/**
 * 33. DTOS DE PROTEÇÃO ANTI-AUTOMAÇÃO, HONEYPOT DINÂMICO & TARPIT CRIPTOGRÁFICO
 * (OWASP OAT-011 / OAT-020 & RFC-001 §4.4, §5.2)
 */

export interface CreateHoneypotTrapDTO {
  routePath: string;
  ttlSeconds?: number;
  clientIp?: string;
}

export interface CreateHoneypotTrapResponse {
  success: boolean;
  trap: import('./models').HoneypotTrapConfig;
  invisibleHtmlSnippet: string;
}

export interface TriggerHoneypotTrapDTO {
  token: string;
}

export interface TriggerHoneypotTrapResponse {
  success: boolean;
  tarpitDelayAppliedMs: number;
  defenseSeal?: string;
  incident: import('./models').ScraperIncidentRecord;
  message: string;
}

export interface SimulateScrapingAttackDTO {
  ipAddress?: string;
  threatCategory: import('./enums').ScraperThreatCategory;
  requestsBurstCount?: number;
  simulateHoneypotHit?: boolean;
}

export interface SimulateScrapingAttackResponse {
  success: boolean;
  attackContained: boolean;
  tarpitDelayMs: number;
  bandwidthSavedBytes: number;
  incident: import('./models').ScraperIncidentRecord;
  defenseSeal: string;
  message: string;
}

export interface ReleaseTarpitQuarantineDTO {
  ipAddress: string;
  reason: string;
}

export interface ReleaseTarpitQuarantineResponse {
  success: boolean;
  ipAddress: string;
  message: string;
}

export interface VerifyTarpitSealDTO {
  seal: string;
}

export interface VerifyTarpitSealResponse {
  success: boolean;
  verification: import('./models').TarpitDefenseProof;
}

export interface TarpitMetricsOverviewResponse {
  success: boolean;
  overview: import('./models').TarpitMetricsOverview;
}

/**
 * 34. DTOs DE CERTIFICAÇÃO NOTARIAL DE SESSÃO CLÍNICA & CARIMBO DO TEMPO RFC 3161 / ICP-BRASIL TSA
 * (DOC-ICP-11, MP 2.200-2/2001, CFP nº 001/2009 e RFC-001 §3.4, §3.5, §4.4)
 */

export interface CreateSessionTimestampDTO {
  sessionId: string;
  patientId: string;
  therapistId: string;
  therapistCrp: string;
  sessionStartTime: string;
  sessionEndTime: string;
  clinicalSummaryOrHash?: string;
  policyOid?: string;
  authorityType?: import('./enums').TsaAuthorityType;
}

export interface CreateSessionTimestampResponse {
  success: boolean;
  token: import('./models').ClinicalSessionTimestampToken;
  message: string;
}

export interface VerifySessionTimestampDTO {
  rawTokenBase64?: string;
  tokenId?: string;
  sessionId?: string;
  expectedImprint?: string;
  sessionData?: {
    sessionId: string;
    patientBlindIndex: string;
    therapistId: string;
    therapistCrp: string;
    sessionStartTime: string;
    sessionEndTime: string;
    clinicalSummaryOrHash?: string;
  };
}

export interface VerifySessionTimestampResponse {
  success: boolean;
  result: import('./models').TimestampVerificationResult;
}

export interface SimulateTimestampTamperDTO {
  tokenId: string;
  tamperType: import('./enums').TimestampTamperType;
}

export interface SimulateTimestampTamperResponse {
  success: boolean;
  tamperedTokenBase64: string;
  tamperType: import('./enums').TimestampTamperType;
  verificationBefore: import('./models').TimestampVerificationResult;
  verificationAfter: import('./models').TimestampVerificationResult;
  message: string;
}

export interface TimestampNotaryOverviewResponse {
  success: boolean;
  overview: import('./models').TimestampNotaryOverview;
}

/**
 * 35. BLINDAGEM CONTRA POLUIÇÃO DE PARÂMETROS HTTP (HPP) & INJEÇÃO DE CABEÇALHOS (CRLF)
 */

export interface SimulateHppAttackDTO {
  endpoint: string;
  method?: string;
  queryString: string;
  defensePolicy?: import('./enums').HppDefensePolicy;
  clientIp?: string;
}

export interface SimulateHppAttackResponse {
  success: boolean;
  blocked: boolean;
  incident?: import('./models').HttpGuardIncident;
  inspectionResult: import('./models').HppInspectionResult;
  message: string;
}

export interface SimulateHeaderInjectionDTO {
  endpoint: string;
  method?: string;
  headerName: string;
  headerValue: string;
  clientIp?: string;
}

export interface SimulateHeaderInjectionResponse {
  success: boolean;
  blocked: boolean;
  incident?: import('./models').HttpGuardIncident;
  inspectionResult: import('./models').HeaderInjectionInspectionResult;
  message: string;
}

export interface VerifyHttpGuardSealDTO {
  proofSealToken: string;
}

export interface VerifyHttpGuardSealResponse {
  success: boolean;
  isValid: boolean;
  seal?: import('./models').HttpGuardProofSeal;
  incident?: import('./models').HttpGuardIncident;
  message: string;
  verifiedAt: string;
}

export interface HttpGuardOverviewResponse {
  success: boolean;
  overview: import('./models').HttpGuardOverview;
}

/**
 * 36. PROTOCOLO DE CIFRAGEM HOMOMÓRFICA PARCIAL (PHE - PAILLIER CRYPTOSYSTEM)
 */

export interface CreateHomomorphicCohortDTO {
  cohortName: string;
  patientBlindIndexes: string[];
  securityLevel?: import('./enums').HomomorphicSecurityLevel;
}

export interface EncryptPatientCidVectorDTO {
  patientBlindIndex: string;
  diagnosesCidCodes: string[];
}

export interface AddCohortEncryptedPatientDTO {
  cohortId: string;
  encryptedVector: import('./models').PatientEncryptedCidVector;
}

export interface DecryptCohortAggregationDTO {
  cohortId: string;
  authorizedBy: string;
  ethicsApprovalCode: string;
  privateKeyLambda: string;
  privateKeyMu: string;
}

export interface VerifyHomomorphicProofSealDTO {
  proofSealToken: string;
}

export interface HomomorphicOverviewResponse {
  success: boolean;
  overview: import('./models').HomomorphicOverview;
}

export interface HomomorphicCohortResponse {
  success: boolean;
  cohort: import('./models').HomomorphicCohortAggregation;
  message: string;
}

export interface HomomorphicDecryptResponse {
  success: boolean;
  decryptedResult: import('./models').HomomorphicDecryptedResult;
  message: string;
}

export interface HomomorphicVerifyProofResponse {
  success: boolean;
  isValid: boolean;
  seal?: import('./models').HomomorphicProofSeal;
  cohort?: import('./models').HomomorphicCohortAggregation;
  message: string;
  verifiedAt: string;
}

/**
 * 37. DTOs de Proteção Avançada contra SSRF & DNS Rebinding em Webhooks (OWASP API8:2023)
 */

export interface SimulateSsrfDTO {
  url: string;
  connectorType?: import('./enums').WebhookConnectorType;
  simulateDnsRebinding?: boolean;
  forcedResolvedIp?: string;
  defensePolicy?: import('./enums').SsrfDefensePolicy;
}

export interface SimulateSsrfResponse {
  success: boolean;
  inspection: import('./models').SsrfInspectionResult;
  incident?: import('./models').SsrfIncident;
  proofSeal?: import('./models').SsrfProofSeal;
  message: string;
}

export interface ValidateWebhookUrlDTO {
  url: string;
  connectorId?: string;
  connectorType?: import('./enums').WebhookConnectorType;
  policy?: import('./enums').SsrfDefensePolicy;
}

export interface ValidateWebhookUrlResponse {
  success: boolean;
  inspection: import('./models').SsrfInspectionResult;
  proofSeal?: import('./models').SsrfProofSeal;
  message: string;
}

export interface VerifySsrfSealDTO {
  proofSealToken: string;
}

export interface VerifySsrfSealResponse {
  success: boolean;
  isValid: boolean;
  seal?: import('./models').SsrfProofSeal;
  message: string;
  verifiedAt: string;
}

export interface SsrfOverviewResponse {
  success: boolean;
  overview: import('./models').SsrfOverview;
}

/**
 * 38. DTOs de Rate Limiting Avançado (Token Bucket + Sliding Window Log)
 */

export interface EvaluateRateLimitDTO {
  clientId: string;
  path: string;
  tokensToConsume?: number;
  tier?: import('./enums').RateLimitTier;
  overrideAlgorithm?: import('./enums').RateLimitingAlgorithm;
}

export interface EvaluateRateLimitResponse {
  success: boolean;
  evaluation: import('./models').RateLimitEvaluationResult;
  proofSeal?: import('./models').RateLimitProofSeal;
  message: string;
}

export interface ConfigureRateLimitRuleDTO {
  ruleId: string;
  bucketCapacity?: number;
  refillRatePerSecond?: number;
  windowSizeSeconds?: number;
  maxRequestsPerWindow?: number;
  burstAllowanceMultiplier?: number;
  penaltyQuarantineMinutes?: number;
}

export interface ResetClientBucketDTO {
  clientId: string;
  reason?: string;
}

export interface VerifyRateLimitSealDTO {
  proofSealToken: string;
}

export interface VerifyRateLimitSealResponse {
  success: boolean;
  isValid: boolean;
  seal?: import('./models').RateLimitProofSeal;
  message: string;
  verifiedAt: string;
}

export interface AdvancedRateLimitOverviewResponse {
  success: boolean;
  overview: import('./models').AdvancedRateLimitOverview;
}

/**
 * 39. BLINDAGEM DE MEMÓRIA & PREVENÇÃO DE HEAP SPRAYING
 * (NIST SP 800-88 Rev. 1 & OWASP ASVS v4.0 V14.1)
 */

export interface AllocateSecureBufferDTO {
  tag: string;
  sizeBytes: number;
  ttlMs?: number;
  initialContentHex?: string;
}

export interface AllocateSecureBufferResponse {
  success: boolean;
  block: import('./models').SecureMemoryBlock;
  message: string;
}

export interface ZeroizeSecureBufferDTO {
  blockId: string;
  algorithm?: import('./enums').MemorySanitizationAlgorithm;
}

export interface ZeroizeSecureBufferResponse {
  success: boolean;
  proofSeal: import('./models').MemoryZeroizationProofSeal;
  message: string;
}

export interface InspectHeapSprayingDTO {
  payloadHexOrText: string;
  sampleTag?: string;
}

export interface InspectHeapSprayingResponse {
  success: boolean;
  inspection: import('./models').HeapSprayingInspectionResult;
  auditLogged: boolean;
  message: string;
}

export interface PurgeExpiredDeksResponse {
  success: boolean;
  purgedCount: number;
  purgedBlockIds: string[];
  message: string;
}

export interface VerifyZeroizationSealDTO {
  proofSealToken: string;
}

export interface VerifyZeroizationSealResponse {
  success: boolean;
  isValid: boolean;
  seal?: import('./models').MemoryZeroizationProofSeal;
  message: string;
  verifiedAt: string;
}

export interface SecureMemoryOverviewResponse {
  success: boolean;
  overview: import('./models').SecureMemoryOverview;
}

/**
 * 40. TLS CERTIFICATE PINNING & ROTAÇÃO DE CAS
 * (RFC-001 §4.4, §5.2, RFC 7469 HPKP, RFC 6698 DANE & OWASP MASVS)
 */
export interface ValidateTlsPinDTO {
  hostname: string;
  presentedSpkiOrCertPem?: string;
  simulatedScenario?: 'LEGITIMATE_LETS_ENCRYPT' | 'BURP_MITM_PROXY' | 'EXPIRED_CERTIFICATE' | 'SAN_SPOOFING' | 'ROGUE_QUARANTINED_CA' | 'BACKUP_ROTATION_TEST';
}

export interface ValidateTlsPinResponse {
  success: boolean;
  result: import('./models').TlsPinValidationResult;
  message: string;
}

export interface RegisterTlsPinDTO {
  hostname: string;
  spkiSha256: string;
  strategy?: import('./enums').TlsPinningStrategy;
  type: 'PRIMARY' | 'BACKUP_ROTATION' | 'EMERGENCY_RECOVERY';
  caIssuer: string;
  subjectCommonName: string;
  validFrom: string;
  validTo: string;
}

export interface RegisterTlsPinResponse {
  success: boolean;
  pin: import('./models').TlsSpkiPin;
  message: string;
}

export interface RotateTlsCaDTO {
  hostname: string;
  newPrimaryPinId: string;
  reason: string;
  emergencyRevocation?: boolean;
}

export interface RotateTlsCaResponse {
  success: boolean;
  promotedPin: import('./models').TlsSpkiPin;
  demotedPin?: import('./models').TlsSpkiPin;
  message: string;
  rotatedAt: string;
}

export interface QuarantineCompromisedCaDTO {
  caCommonNameOrIdentifier: string;
  reason: string;
  cveReference?: string;
}

export interface QuarantineCompromisedCaResponse {
  success: boolean;
  quarantinedCa: string;
  revokedPinsCount: number;
  message: string;
  quarantinedAt: string;
}

export interface VerifyTlsPinSealDTO {
  sealToken: string;
}

export interface VerifyTlsPinSealResponse {
  success: boolean;
  isValid: boolean;
  seal?: import('./models').TlsPinProofSeal;
  message: string;
  verifiedAt: string;
}

export interface TlsPinningOverviewResponse {
  success: boolean;
  overview: import('./models').TlsPinningOverview;
}

/**
 * 41. AVALIAÇÃO CONTÍNUA DE POSTURA DE DISPOSITIVO ZERO TRUST (NIST SP 800-207 & OWASP MASVS)
 */
export interface AssessDevicePostureDTO {
  deviceId?: string;
  deviceName?: string;
  therapistId?: string;
  telemetry?: Partial<import('./models').DevicePostureTelemetry>;
  simulatedScenario?: 'COMPLIANT_MAC_WORKSTATION' | 'UNENCRYPTED_DISK_WINDOWS' | 'ROOTED_ANDROID_WITH_FRIDA' | 'EMULATOR_DEVTOOLS_OPEN' | 'OUTDATED_OS_VULNERABLE';
}

export interface AssessDevicePostureResponse {
  success: boolean;
  assessment: import('./models').DevicePostureAssessmentResult;
  message: string;
}

export interface QuarantineDeviceDTO {
  deviceId: string;
  reason: string;
}

export interface QuarantineDeviceResponse {
  success: boolean;
  device: import('./models').DevicePostureRecord;
  message: string;
}

export interface ReleaseDeviceQuarantineDTO {
  deviceId: string;
  dpoNotes: string;
}

export interface ReleaseDeviceQuarantineResponse {
  success: boolean;
  device: import('./models').DevicePostureRecord;
  message: string;
}

export interface UpdatePosturePolicyDTO {
  policy: import('./enums').DevicePostureEnforcementPolicy;
  reason?: string;
}

export interface UpdatePosturePolicyResponse {
  success: boolean;
  policy: import('./enums').DevicePostureEnforcementPolicy;
  message: string;
}

export interface VerifyDevicePostureSealDTO {
  sealToken: string;
}

export interface VerifyDevicePostureSealResponse {
  success: boolean;
  isValid: boolean;
  seal?: import('./models').DevicePostureProofSeal;
  message: string;
  verifiedAt: string;
}

export interface DevicePostureOverviewResponse {
  success: boolean;
  overview: import('./models').DevicePostureOverview;
}

/**
 * 36. DTOs de Criptografia Pós-Quântica Híbrida (NIST FIPS 203 ML-KEM & FIPS 204 ML-DSA)
 */
export interface GeneratePqcKeyPairDTO {
  alias: string;
  securityLevel?: import('./enums').PqcSecurityLevel;
  kemScheme?: import('./enums').PqcKemScheme;
  dsaScheme?: import('./enums').PqcDsaScheme;
}

export interface GeneratePqcKeyPairResponse {
  success: boolean;
  keyPair: import('./models').PqcHybridKeyPair;
  message: string;
}

export interface EncapsulatePqcRecordDTO {
  keyId: string;
  targetType: import('./enums').PqcClinicalTargetType;
  title: string;
  patientBlindIndex: string;
  plaintextClinicalData: string;
  hybridMode?: import('./enums').PqcHybridMode;
}

export interface EncapsulatePqcRecordResponse {
  success: boolean;
  protectedRecord: import('./models').PqcProtectedClinicalRecord;
  message: string;
}

export interface DecapsulatePqcRecordDTO {
  recordId: string;
  keyId: string;
}

export interface DecapsulatePqcRecordResponse {
  success: boolean;
  decryptedPlaintext: string;
  verifiedSignature: boolean;
  message: string;
}

export interface SignPqcDocumentDTO {
  keyId: string;
  documentContent: string;
  dsaScheme?: import('./enums').PqcDsaScheme;
}

export interface SignPqcDocumentResponse {
  success: boolean;
  signatureResult: import('./models').PqcHybridSignatureResult;
  message: string;
}

export interface VerifyPqcSignatureDTO {
  keyId: string;
  documentContent: string;
  classicalSignatureHex: string;
  pqSignatureBase64: string;
}

export interface VerifyPqcSignatureResponse {
  success: boolean;
  verification: import('./models').PqcSignatureVerificationResult;
  message: string;
}

export interface SimulateQuantumAttackDTO {
  recordId: string;
  attackType: import('./enums').PqcQuantumAttackType;
}

export interface SimulateQuantumAttackResponse {
  success: boolean;
  simulation: import('./models').PqcQuantumAttackSimulationResult;
  message: string;
}

export interface VerifyPqcSealDTO {
  sealToken: string;
}

export interface VerifyPqcSealResponse {
  success: boolean;
  isValid: boolean;
  seal?: import('./models').PqcProofSeal;
  message: string;
  verifiedAt: string;
}

export interface PqcOverviewResponse {
  success: boolean;
  overview: import('./models').PqcOverview;
}

// ============================================================================
// DTOs e Responses: Assinatura Cega Chaumiana (RFC 9474 & Resolução CFP nº 001/2009)
// ============================================================================

export interface GenerateBlindAuthorityKeyDTO {
  scheme?: import('./enums').BlindSignatureScheme;
  authorityName?: string;
  authorityRole?: string;
}

export interface GenerateBlindAuthorityKeyResponse {
  success: boolean;
  publicKey: import('./models').BlindSignaturePublicKey;
  message: string;
}

export interface BlindMessageDTO {
  originalMessage: string;
  purpose: import('./enums').BlindSignaturePurpose;
  authorityKeyId?: string;
}

export interface BlindMessageResponse {
  success: boolean;
  blindedMessage: import('./models').BlindSignatureBlindedMessage;
  message: string;
}

export interface SignBlindMessageDTO {
  blindedMessageHex: string;
  authorityKeyId: string;
  therapistCrp?: string;
  purpose: import('./enums').BlindSignaturePurpose;
}

export interface SignBlindMessageResponse {
  success: boolean;
  signedResponse: import('./models').BlindSignatureSignedResponse;
  message: string;
}

export interface UnblindSignatureDTO {
  blindSignatureHex: string;
  blindingFactorHex: string;
  originalMessage: string;
  authorityKeyId: string;
  purpose: import('./enums').BlindSignaturePurpose;
}

export interface UnblindSignatureResponse {
  success: boolean;
  unblindedToken: import('./models').BlindSignatureUnblindedToken;
  message: string;
}

export interface RedeemOrCastBallotDTO {
  unblindedToken: import('./models').BlindSignatureUnblindedToken;
  ballotCaseNumber?: string;
  ballotCaseTitle?: string;
  decision?: import('./enums').BlindBallotDecision;
  voucherSpecialty?: string;
  voucherUrgency?: 'NORMAL' | 'URGENTE' | 'EMERGENCIAL_CAPS';
  serviceCategory?: string;
}

export interface RedeemOrCastBallotResponse {
  success: boolean;
  redemption: import('./models').BlindSignatureRedemptionResult;
  message: string;
}

export interface VerifyBlindTokenDTO {
  unblindedSignatureHex: string;
  originalMessage: string;
  authorityKeyId: string;
  purpose: import('./enums').BlindSignaturePurpose;
}

export interface VerifyBlindTokenResponse {
  success: boolean;
  verification: import('./models').BlindSignatureVerificationResult;
  message: string;
}

export interface SimulateDoubleSpendDTO {
  unblindedToken: import('./models').BlindSignatureUnblindedToken;
}

export interface SimulateDoubleSpendResponse {
  success: boolean;
  blocked: boolean;
  nullifierHash: string;
  message: string;
}

export interface VerifyBlindSealDTO {
  sealToken: string;
}

export interface VerifyBlindSealResponse {
  success: boolean;
  isValid: boolean;
  seal?: import('./models').BlindSignatureProofSeal;
  message: string;
  verifiedAt: string;
}

export interface BlindSignaturesOverviewResponse {
  success: boolean;
  overview: import('./models').BlindSignatureOverview;
}

// ============================================================================
// DTOs e Responses: Proteção contra Side-Channel e Timing Attacks
// ============================================================================

export interface InspectSideChannelDTO {
  targetOperation: import('./enums').SideChannelTargetOperation;
  payloadA?: string;
  payloadB?: string;
  iterations?: number;
}

export interface InspectSideChannelResponse {
  success: boolean;
  inspection: import('./models').SideChannelInspectionResult;
  message: string;
}

export interface RunWelchTestDTO {
  targetOperation: import('./enums').SideChannelTargetOperation;
  sampleSize?: number;
}

export interface RunWelchTestResponse {
  success: boolean;
  report: import('./models').SideChannelBenchmarkReport;
  message: string;
}

export interface CalibrateJitterDTO {
  targetLatencyMs: number;
  varianceMs?: number;
}

export interface CalibrateJitterResponse {
  success: boolean;
  activeJitterTargetMs: number;
  message: string;
}

export interface UpdateSideChannelPolicyDTO {
  protectionMode: import('./enums').SideChannelProtectionMode;
}

export interface UpdateSideChannelPolicyResponse {
  success: boolean;
  protectionMode: import('./enums').SideChannelProtectionMode;
  message: string;
}

export interface SimulateTimingAttackDTO {
  targetOperation: import('./enums').SideChannelTargetOperation;
  useVulnerableAlgorithm?: boolean;
}

export interface SimulateTimingAttackResponse {
  success: boolean;
  detectedLeak: boolean;
  welchTScore: number;
  leakedInformation: string;
  message: string;
}

export interface VerifySideChannelSealDTO {
  sealToken: string;
}

export interface VerifySideChannelSealResponse {
  success: boolean;
  isValid: boolean;
  seal?: import('./models').SideChannelProofSeal;
  message: string;
  verifiedAt: string;
}

export interface SideChannelOverviewResponse {
  success: boolean;
  overview: import('./models').SideChannelOverview;
}

// ============================================================================
// DTOs e Responses: Proteção contra Ataques de Replay & Reutilização de Nonce (RFC 8446/9147)
// ============================================================================

export interface VerifyNonceDTO {
  targetProtocol: import('./enums').ReplayTargetProtocol;
  nonceOrSeq: string;
  channelId?: string;
  keyId?: string;
  timestamp?: number;
}

export interface VerifyNonceResponse {
  success: boolean;
  result: import('./models').ReplayVerificationResult;
  message: string;
}

export interface GetSlidingWindowStatusDTO {
  channelId: string;
}

export interface GetSlidingWindowStatusResponse {
  success: boolean;
  window: import('./models').SlidingWindowStatus;
}

export interface RotateBloomFilterResponse {
  success: boolean;
  activeGeneration: number;
  message: string;
}

export interface UpdateReplayPolicyDTO {
  mode: import('./enums').ReplayDefenseMode;
}

export interface UpdateReplayPolicyResponse {
  success: boolean;
  mode: import('./enums').ReplayDefenseMode;
  message: string;
}

export interface SimulateReplayAttackDTO {
  targetProtocol: import('./enums').ReplayTargetProtocol;
  sequenceNumber?: number;
  nonce?: string;
  attemptReplay: boolean;
}

export interface SimulateReplayAttackResponse {
  success: boolean;
  replayDetected: boolean;
  severity: import('./enums').ReplayThreatSeverity;
  explanation: string;
  message: string;
}

export interface VerifyAntiReplaySealDTO {
  sealToken: string;
}

export interface VerifyAntiReplaySealResponse {
  success: boolean;
  isValid: boolean;
  seal?: import('./models').AntiReplayProofSeal;
  message: string;
  verifiedAt: string;
}

export interface AntiReplayOverviewResponse {
  success: boolean;
  overview: import('./models').AntiReplayOverview;
}

// ============================================================================
// DTOs: Marcação D'água Esteganográfica Visual e Traçabilidade Forense (LGPD Art. 46 & CFP 011/2018)
// ============================================================================

export interface CreateWatermarkSeedDTO {
  therapistCrp: string;
  patientId: string;
  sessionId?: string;
  target?: import('./enums').VisualWatermarkTarget;
  patternType?: import('./enums').WatermarkPatternType;
  strength?: import('./enums').WatermarkEmbeddingStrength;
}

export interface CreateWatermarkSeedResponse {
  success: boolean;
  seed: import('./models').VisualWatermarkSeed;
  message: string;
}

export interface EmbedVisualWatermarkDTO {
  seedId: string;
  frameData?: string;
  width?: number;
  height?: number;
}

export interface EmbedVisualWatermarkResponse {
  success: boolean;
  result: import('./models').WatermarkEmbeddingResult;
  message: string;
}

export interface ExtractLeakSourceDTO {
  suspectFrameData: string;
  target?: import('./enums').VisualWatermarkTarget;
  filterSessionId?: string;
}

export interface ExtractLeakSourceResponse {
  success: boolean;
  result: import('./models').LeakExtractionResult;
  message: string;
}

export interface SimulateScreenLeakDTO {
  seedId: string;
  cropPercentage?: number;
  compressionQuality?: number;
  applyNoise?: boolean;
}

export interface SimulateScreenLeakResponse {
  success: boolean;
  simulation: {
    simulatedCrop: number;
    simulatedQuality: number;
    extractionResult: import('./models').LeakExtractionResult;
    survivedAnalysis: boolean;
  };
  message: string;
}

export interface UpdateWatermarkStrengthDTO {
  strength: import('./enums').WatermarkEmbeddingStrength;
}

export interface UpdateWatermarkStrengthResponse {
  success: boolean;
  activeStrength: import('./enums').WatermarkEmbeddingStrength;
  message: string;
}

export interface VerifyVisualWatermarkSealDTO {
  sealToken: string;
}

export interface VerifyVisualWatermarkSealResponse {
  success: boolean;
  isValid: boolean;
  seal?: import('./models').VisualWatermarkProofSeal;
  message: string;
  verifiedAt: string;
}

export interface VisualWatermarkOverviewResponse {
  success: boolean;
  overview: import('./models').VisualWatermarkOverview;
}

// ============================================================================
// DTOs: Tokens Efêmeros de Teleconsulta e Auto-Revogação (RFC 7519, RFC 7009 & LGPD Art. 46)
// ============================================================================

export interface IssueEphemeralTokenDTO {
  patientId: string;
  therapistCrp: string;
  roomId: string;
  target?: import('./enums').EphemeralTokenTarget;
  ttlMinutes?: number;
  validInAdvanceMinutes?: number;
  singleUse?: boolean;
}

export interface IssueEphemeralTokenResponse {
  success: boolean;
  token: import('./models').EphemeralAccessToken;
  magicLink: string;
  qrCodeDataUri?: string;
  message: string;
}

export interface ConsumeEphemeralTokenDTO {
  tokenString: string;
  roomId: string;
  clientIp?: string;
  userAgent?: string;
}

export interface ConsumeEphemeralTokenResponse {
  success: boolean;
  verdict: import('./enums').EphemeralTokenVerificationVerdict;
  granted: boolean;
  token?: import('./models').EphemeralAccessToken;
  record: import('./models').EphemeralTokenConsumptionRecord;
  message: string;
}

export interface RevokeEphemeralTokenDTO {
  tokenId: string;
  reason: import('./enums').RevocationReason;
}

export interface RevokeEphemeralTokenResponse {
  success: boolean;
  token: import('./models').EphemeralAccessToken;
  message: string;
}

export interface SimulateTokenIntrusionDTO {
  scenario: 'EXPIRED_TOKEN' | 'REUSED_CONSUMED_TOKEN' | 'REVOKED_TOKEN' | 'TAMPERED_SIGNATURE' | 'WRONG_ROOM';
  tokenId?: string;
}

export interface SimulateTokenIntrusionResponse {
  success: boolean;
  blocked: boolean;
  verdict: import('./enums').EphemeralTokenVerificationVerdict;
  message: string;
  record: import('./models').EphemeralTokenConsumptionRecord;
}

export interface UpdateEphemeralPolicyDTO {
  defaultTtlMinutes: number;
  allowConcurrentAccess: boolean;
}

export interface UpdateEphemeralPolicyResponse {
  success: boolean;
  defaultTtlMinutes: number;
  allowConcurrentAccess: boolean;
  message: string;
}

export interface VerifyEphemeralTokenSealDTO {
  sealToken: string;
}

export interface VerifyEphemeralTokenSealResponse {
  success: boolean;
  isValid: boolean;
  seal?: import('./models').EphemeralTokenProofSeal;
  message: string;
  verifiedAt: string;
}

export interface EphemeralTokenOverviewResponse {
  success: boolean;
  overview: import('./models').EphemeralTokenOverview;
}

/**
 * DTOs para Módulo de Liberação Colegiada de Prontuários Sob Ordem Judicial com Threshold Cryptography (CFP nº 001/2009 Art. 9º, LGPD Art. 11 & RFC §4.2)
 */
export interface CreateCourtOrderVaultDTO {
  patientId: string;
  patientMaskedName: string;
  legalCaseNumber: string;
  legalJustification: import('./enums').LegalJustificationType;
  thresholdRequired: number;     // t (2..5)
  totalShares: number;           // n (3..7)
  secretRecordText: string;      // Prontuário confidencial a ser lacrado
  custodians: Array<{
    role: import('./enums').CustodianRole;
    name: string;
  }>;
}

export interface CreateCourtOrderVaultResponse {
  success: boolean;
  vault: import('./models').CourtOrderVault;
  generatedShares: import('./models').ShamirKeyShare[];
  message: string;
}

export interface SubmitCustodianShareDTO {
  vaultId: string;
  shareIndex: number;
  shareData: string;
  custodianRole: import('./enums').CustodianRole;
}

export interface SubmitCustodianShareResponse {
  success: boolean;
  vault: import('./models').CourtOrderVault;
  currentSharesCount: number;
  thresholdRequired: number;
  isQuorumReached: boolean;
  message: string;
}

export interface ReconstructAndDecryptDTO {
  vaultId: string;
}

export interface ReconstructAndDecryptResponse {
  success: boolean;
  result: import('./models').ThresholdReconstructionResult;
  message: string;
}

export interface SimulateThresholdAttackDTO {
  scenario: 'INSUFFICIENT_SHARES_1_OF_3' | 'CORRUPTED_SHARE_DATA' | 'DUPLICATE_CUSTODIAN_REPLAY' | 'EXPIRED_COURT_ORDER_VAULT';
  vaultId?: string;
}

export interface SimulateThresholdAttackResponse {
  success: boolean;
  blocked: boolean;
  verdict: import('./enums').ThresholdReconstructionVerdict;
  scenario: string;
  message: string;
  timestamp: string;
}

export interface VerifyThresholdSealDTO {
  sealToken: string;
}

export interface VerifyThresholdSealResponse {
  success: boolean;
  isValid: boolean;
  seal?: import('./models').ThresholdProofSeal;
  message: string;
  verifiedAt: string;
}

export interface ThresholdVaultOverviewResponse {
  success: boolean;
  overview: import('./models').ThresholdVaultOverview;
}

/**
 * 44. PROTOTYPE POLLUTION GUARD & DESSERIALIZAÇÃO SEGURA
 * (OWASP ASVS v4.0 V5.5, CWE-1321 & Node.js Security Best Practices)
 */
export interface ScanObjectPayloadDTO {
  payload: any;
  category: import('./enums').PayloadCategory;
  strategy?: import('./enums').SanitizationStrategy;
  customAllowlist?: string[];
  maxDepth?: number;
}

export interface ScanObjectPayloadResponse {
  success: boolean;
  result: import('./models').PollutionScanResult;
  message: string;
}

export interface UpdatePollutionPolicyDTO {
  policy: Partial<import('./models').PollutionGuardPolicy>;
}

export interface UpdatePollutionPolicyResponse {
  success: boolean;
  policy: import('./models').PollutionGuardPolicy;
  message: string;
}

export interface SimulatePollutionAttackDTO {
  scenario: 'PROTO_INJECTION_IS_ADMIN' | 'CONSTRUCTOR_PROTOTYPE_POLLUTION' | 'CIRCULAR_REFERENCE_BOMB' | 'NESTED_DEPTH_OVERFLOW_20' | 'GETTER_SETTER_RCE_ATTEMPT';
  customPayload?: any;
}

export interface SimulatePollutionAttackResponse {
  success: boolean;
  blocked: boolean;
  vector: import('./enums').PollutionAttackVector;
  scenario: string;
  threatDetected?: import('./models').PollutionThreat;
  result: import('./models').PollutionScanResult;
  message: string;
  timestamp: string;
}

export interface VerifyPollutionSealDTO {
  sealToken: string;
}

export interface VerifyPollutionSealResponse {
  success: boolean;
  isValid: boolean;
  seal?: import('./models').PollutionProofSeal;
  message: string;
  verifiedAt: string;
}

export interface PollutionGuardOverviewResponse {
  success: boolean;
  overview: import('./models').PollutionGuardOverview;
}

/**
 * ============================================================================
 * 63. DTOs DE PROTEÇÃO CONTRA WEB CACHE POISONING & CACHE DECEPTION
 * ============================================================================
 */

export interface InspectCacheRequestDTO {
  method: string;
  url: string;
  headers: Record<string, string>;
  sensitivity: import('./enums').ResourceSensitivityLevel;
  expectedContentType?: string;
  bodyPayload?: string;
}

export interface InspectCacheResponseDTO {
  success: boolean;
  inspection: import('./models').CacheInspectionResult;
  message: string;
}

export interface SimulateCacheAttackDTO {
  attackType: import('./enums').CacheThreatType;
  customHeaders?: Record<string, string>;
  targetPath?: string;
  method?: string;
  sensitivity?: import('./enums').ResourceSensitivityLevel;
}

export interface SimulateCacheAttackResponseDTO {
  success: boolean;
  threatDetected: boolean;
  incident?: import('./models').CacheSecurityIncident;
  inspection: import('./models').CacheInspectionResult;
  message: string;
  timestamp: string;
}

export interface UpdateCachePolicyDTO {
  policy: Partial<import('./models').CacheGuardPolicy>;
}

export interface UpdateCachePolicyResponseDTO {
  success: boolean;
  policy: import('./models').CacheGuardPolicy;
  message: string;
}

export interface VerifyCacheSealDTO {
  sealToken: string;
}

export interface VerifyCacheSealResponseDTO {
  success: boolean;
  isValid: boolean;
  seal?: import('./models').CacheProofSeal;
  message: string;
  verifiedAt: string;
}

export interface CacheGuardOverviewResponse {
  success: boolean;
  overview: import('./models').CacheGuardOverview;
}

/**
 * ============================================================================
 * 64. DTOs DE PROTEÇÃO CONTRA XXE & XML BOMBS (CWE-611 / CWE-776)
 * ============================================================================
 */

export interface ScanXmlPayloadDTO {
  xmlPayload: string;
  schemaType?: import('./enums').XmlClinicalSchemaType;
  mode?: import('./enums').XmlSanitizationMode;
}

export interface ScanXmlPayloadResponse {
  success: boolean;
  result: import('./models').XmlSanitizationResult;
  message: string;
}

export interface SimulateXmlAttackDTO {
  attackType: import('./enums').XmlThreatType;
  schemaType?: import('./enums').XmlClinicalSchemaType;
  customPayload?: string;
}

export interface SimulateXmlAttackResponse {
  success: boolean;
  threatDetected: boolean;
  incident?: import('./models').XmlSecurityIncident;
  result: import('./models').XmlSanitizationResult;
  message: string;
  timestamp: string;
}

export interface UpdateXmlPolicyDTO {
  policy: Partial<import('./models').XmlGuardPolicy>;
}

export interface UpdateXmlPolicyResponse {
  success: boolean;
  policy: import('./models').XmlGuardPolicy;
  message: string;
}

export interface VerifyXmlSealDTO {
  sealToken: string;
}

export interface VerifyXmlSealResponse {
  success: boolean;
  isValid: boolean;
  seal?: import('./models').XmlProofSeal;
  message: string;
  verifiedAt: string;
}

export interface XmlGuardOverviewResponse {
  success: boolean;
  overview: import('./models').XmlGuardOverview;
}

/**
 * 65. PROTEÇÃO CONTRA FIXAÇÃO E SEQUESTRO DE SESSÃO (OWASP ASVS V3.3 & NIST SP 800-63B)
 */

export interface EvaluateSessionDTO {
  sessionId: string;
  clientIp: string;
  userAgent: string;
  tlsFingerprint?: string;
  countryCode?: string;
  currentRoute?: string;
  isPrivilegeElevation?: boolean;
}

export interface EvaluateSessionResponse {
  success: boolean;
  evaluation: import('./models').SessionEvaluationResult;
  message: string;
}

export interface RotateSessionDTO {
  oldSessionId: string;
  userId: string;
  userRole: string;
  clientIp: string;
  userAgent: string;
  tlsFingerprint?: string;
  securityLevel?: import('./enums').SessionSecurityLevel;
}

export interface RotateSessionResponse {
  success: boolean;
  newSessionId: string;
  oldSessionInvalidated: boolean;
  seal: import('./models').SessionProofSeal;
  message: string;
}

export interface UpdateSessionGuardPolicyDTO {
  policy: Partial<import('./models').SessionGuardPolicy>;
}

export interface UpdateSessionGuardPolicyResponse {
  success: boolean;
  policy: import('./models').SessionGuardPolicy;
  message: string;
}

export interface SimulateSessionAttackDTO {
  anomalyType: import('./enums').SessionAnomalyType;
  targetSessionId?: string;
  customIp?: string;
  customUserAgent?: string;
  customTlsFingerprint?: string;
}

export interface SimulateSessionAttackResponse {
  success: boolean;
  threatDetected: boolean;
  evaluation: import('./models').SessionEvaluationResult;
  incident?: import('./models').SessionGuardIncident;
  message: string;
  timestamp: string;
}

export interface VerifySessionSealDTO {
  sealToken: string | import('./models').SessionProofSeal;
}

export interface VerifySessionSealResponse {
  success: boolean;
  isValid: boolean;
  seal?: import('./models').SessionProofSeal;
  message: string;
  verifiedAt: string;
}

export interface SessionGuardOverviewResponse {
  success: boolean;
  overview: import('./models').SessionGuardOverview;
}

/**
 * 66. DETECÇÃO E PREVENÇÃO DE REDOS & SAFE REGEX ENGINE
 * (OWASP ASVS v4.0 V5.5, CWE-1333 & ReDoS Guard)
 */

export interface AnalyzeRegexDTO {
  pattern: string;
  flags?: string;
  testInput?: string;
}

export interface AnalyzeRegexResponse {
  success: boolean;
  analysis: import('./models').RegexAstAnalysisResult;
  execution?: import('./models').SafeRegexExecutionResult;
  seal?: import('./models').RedosProofSeal;
  message: string;
}

export interface ExecuteSafeRegexDTO {
  pattern: string;
  flags?: string;
  input: string;
  maxTimeoutMs?: number;
  autoRewrite?: boolean;
}

export interface ExecuteSafeRegexResponse {
  success: boolean;
  result: import('./models').SafeRegexExecutionResult;
  seal?: import('./models').RedosProofSeal;
  message: string;
}

export interface UpdateRedosPolicyDTO {
  policy: Partial<import('./models').RedosGuardPolicy>;
}

export interface UpdateRedosPolicyResponse {
  success: boolean;
  policy: import('./models').RedosGuardPolicy;
  message: string;
}

export interface SimulateRedosAttackDTO {
  vulnerabilityType: import('./enums').RegexVulnerabilityType;
  customInputSize?: number;
}

export interface SimulateRedosAttackResponse {
  success: boolean;
  threatBlocked: boolean;
  attackPattern: string;
  attackInputSnippet: string;
  analysis: import('./models').RegexAstAnalysisResult;
  execution: import('./models').SafeRegexExecutionResult;
  incident?: import('./models').RedosSecurityIncident;
  message: string;
}

export interface VerifyRedosSealDTO {
  sealToken: string | import('./models').RedosProofSeal;
}

export interface VerifyRedosSealResponse {
  success: boolean;
  isValid: boolean;
  seal?: import('./models').RedosProofSeal;
  message: string;
  verifiedAt: string;
}

export interface RedosGuardOverviewResponse {
  success: boolean;
  overview: import('./models').RedosGuardOverview;
}

/**
 * 67. BLINDAGEM CONTRA SSTI & SECURE SANDBOXED TEMPLATE ENGINE
 * (OWASP ASVS v4.0 V5.2, CWE-1336 & CFP nº 006/2019)
 */

export interface InspectTemplateDTO {
  templateContent: string;
  contextVariables?: Record<string, string>;
}

export interface InspectTemplateResponse {
  success: boolean;
  inspection: import('./models').TemplateInspectionResult;
  message: string;
}

export interface RenderSandboxedTemplateDTO {
  templateContent: string;
  contextVariables?: Record<string, string>;
  strictSandboxing?: boolean;
}

export interface RenderSandboxedTemplateResponse {
  success: boolean;
  result: import('./models').SandboxedRenderResult;
  seal?: import('./models').SstiProofSeal;
  message: string;
}

export interface UpdateSstiPolicyDTO {
  policy: Partial<import('./models').SstiGuardPolicy>;
}

export interface UpdateSstiPolicyResponse {
  success: boolean;
  policy: import('./models').SstiGuardPolicy;
  message: string;
}

export interface SimulateSstiAttackDTO {
  threatVector: import('./enums').SstiThreatVector;
  documentType?: import('./enums').ClinicalDocumentTemplateType;
}

export interface SimulateSstiAttackResponse {
  success: boolean;
  threatBlocked: boolean;
  attackPayload: string;
  inspection: import('./models').TemplateInspectionResult;
  renderResult?: import('./models').SandboxedRenderResult;
  incident?: import('./models').SstiSecurityIncident;
  message: string;
}

export interface VerifySstiSealDTO {
  sealToken: string | import('./models').SstiProofSeal;
}

export interface VerifySstiSealResponse {
  success: boolean;
  isValid: boolean;
  seal?: import('./models').SstiProofSeal;
  message: string;
  verifiedAt: string;
}

export interface SstiGuardOverviewResponse {
  success: boolean;
  overview: import('./models').SstiGuardOverview;
}

/**
 * 68. BLINDAGEM CONTRA OS COMMAND INJECTION & SECURE ENCLAVE SANDBOX
 * (OWASP ASVS v4.0 V5.3, CWE-78 & CWE-88)
 */

export interface InspectCommandInputDTO {
  executable: string;
  args: string[];
  jobType?: import('./enums').ClinicalConverterJobType;
}

export interface InspectCommandInputResponse {
  success: boolean;
  inspection: import('./models').CommandInspectionResult;
  message: string;
}

export interface ExecuteSandboxedCommandDTO {
  jobType: import('./enums').ClinicalConverterJobType;
  executable: string;
  args: string[];
  documentId?: string;
}

export interface ExecuteSandboxedCommandResponse {
  success: boolean;
  result: import('./models').SandboxedExecutionResult;
  seal?: import('./models').CommandProofSeal;
  message: string;
}

export interface UpdateCommandPolicyDTO {
  policy: Partial<import('./models').CommandGuardPolicy>;
}

export interface UpdateCommandPolicyResponse {
  success: boolean;
  policy: import('./models').CommandGuardPolicy;
  message: string;
}

export interface SimulateCommandAttackDTO {
  threatVector: import('./enums').CommandThreatVector;
  targetJob?: import('./enums').ClinicalConverterJobType;
}

export interface SimulateCommandAttackResponse {
  success: boolean;
  threatBlocked: boolean;
  attackPayload: string;
  inspection: import('./models').CommandInspectionResult;
  executionResult?: import('./models').SandboxedExecutionResult;
  incident?: import('./models').CommandSecurityIncident;
  message: string;
}

export interface VerifyCommandSealDTO {
  sealToken: string | import('./models').CommandProofSeal;
}

export interface VerifyCommandSealResponse {
  success: boolean;
  isValid: boolean;
  seal?: import('./models').CommandProofSeal;
  message: string;
  verifiedAt: string;
}

export interface CommandGuardOverviewResponse {
  success: boolean;
  overview: import('./models').CommandGuardOverview;
}

/**
 * DTOs de Sanitização e Prevenção de Path Traversal & LFI (CWE-22, CWE-23 & OWASP ASVS V5.5)
 */
export interface InspectPathInputDTO {
  path: string;
  category?: import('./enums').ClinicalAttachmentCategory;
  customJailRoot?: string;
}

export interface InspectPathInputResponse {
  success: boolean;
  inspection: import('./models').PathInspectionResult;
  message: string;
}

export interface ResolveSafePathDTO {
  category: import('./enums').ClinicalAttachmentCategory;
  proposedPath: string;
  patientId?: string;
  documentId?: string;
}

export interface ResolveSafePathResponse {
  success: boolean;
  result: import('./models').SafePathResolutionResult;
  message: string;
}

export interface UpdatePathPolicyDTO {
  policy: Partial<import('./models').PathGuardPolicy>;
}

export interface UpdatePathPolicyResponse {
  success: boolean;
  policy: import('./models').PathGuardPolicy;
  message: string;
}

export interface SimulatePathAttackDTO {
  threatVector: import('./enums').PathThreatVector;
  category?: import('./enums').ClinicalAttachmentCategory;
}

export interface SimulatePathAttackResponse {
  success: boolean;
  threatBlocked: boolean;
  attackPayload: string;
  inspection: import('./models').PathInspectionResult;
  resolutionResult?: import('./models').SafePathResolutionResult;
  incident?: import('./models').PathSecurityIncident;
  message: string;
}

export interface VerifyPathSealDTO {
  sealToken: string | import('./models').PathProofSeal;
}

export interface VerifyPathSealResponse {
  success: boolean;
  isValid: boolean;
  seal?: import('./models').PathProofSeal;
  message: string;
  verifiedAt: string;
}

export interface PathGuardOverviewResponse {
  success: boolean;
  overview: import('./models').PathGuardOverview;
}

/**
 * DTOs de Blindagem contra Injeção de Código em Expressões e Consultas (CWE-94, CWE-95 & ASVS V5.2)
 */
export interface InspectExpressionDTO {
  expression: string;
  dialect?: import('./enums').ExpressionFilterDialect;
}

export interface InspectExpressionResponse {
  success: boolean;
  inspection: import('./models').ExpressionInspectionResult;
  message: string;
}

export interface EvaluateExpressionDTO {
  expression: string;
  dialect?: import('./enums').ExpressionFilterDialect;
  recordsSubset?: import('./models').ClinicalRecordSample[];
}

export interface EvaluateExpressionResponse {
  success: boolean;
  result: import('./models').ExpressionEvaluationResult;
  message: string;
}

export interface UpdateExpressionPolicyDTO {
  policy: Partial<import('./models').ExpressionGuardPolicy>;
}

export interface UpdateExpressionPolicyResponse {
  success: boolean;
  policy: import('./models').ExpressionGuardPolicy;
  message: string;
}

export interface SimulateExpressionAttackDTO {
  threatCategory: import('./enums').ExpressionThreatCategory;
  dialect?: import('./enums').ExpressionFilterDialect;
}

export interface SimulateExpressionAttackResponse {
  success: boolean;
  threatBlocked: boolean;
  attackPayload: string;
  inspection: import('./models').ExpressionInspectionResult;
  incident?: import('./models').ExpressionSecurityIncident;
  message: string;
}

export interface VerifyExpressionSealDTO {
  sealToken: string | import('./models').ExpressionProofSeal;
}

export interface VerifyExpressionSealResponse {
  success: boolean;
  isValid: boolean;
  seal?: import('./models').ExpressionProofSeal;
  message: string;
  verifiedAt: string;
}

export interface ExpressionGuardOverviewResponse {
  success: boolean;
  overview: import('./models').ExpressionGuardOverview;
}

/**
 * 45. PROTEÇÃO CONTRA INJEÇÃO DE CONSULTAS GRAPHQL, INTROSPECÇÃO & QUERY COST LIMITING
 * (OWASP ASVS v4.0 V5.1 & GraphQL Security Best Practices)
 */
export interface InspectGraphQLQueryDTO {
  query: string;
  operationName?: string;
  variables?: Record<string, any>;
  userRole?: import('./enums').UserRole;
}

export interface InspectGraphQLQueryResponse {
  success: boolean;
  inspection: import('./models').GraphQLInspectionResult;
  message: string;
}

export interface UpdateGraphQLPolicyDTO {
  policy: Partial<import('./models').GraphQLGuardPolicy>;
}

export interface UpdateGraphQLPolicyResponse {
  success: boolean;
  policy: import('./models').GraphQLGuardPolicy;
  message: string;
}

export interface SimulateGraphQLAttackDTO {
  threatCategory: import('./enums').GraphQLThreatCategory;
}

export interface SimulateGraphQLAttackResponse {
  success: boolean;
  threatBlocked: boolean;
  attackPayload: string;
  inspection: import('./models').GraphQLInspectionResult;
  incident?: import('./models').GraphQLSecurityIncident;
  message: string;
}

export interface VerifyGraphQLCostSealDTO {
  sealToken: string | import('./models').GraphQLCostProofSeal;
}

export interface VerifyGraphQLCostSealResponse {
  success: boolean;
  isValid: boolean;
  seal?: import('./models').GraphQLCostProofSeal;
  message: string;
  verifiedAt: string;
}

export interface GraphQLGuardOverviewResponse {
  success: boolean;
  overview: import('./models').GraphQLGuardOverview;
}

export interface GetGraphQLSchemasResponse {
  success: boolean;
  schemas: import('./models').GraphQLSchemaDefinition[];
}

/**
 * 72. PROTEÇÃO CONTRA INJEÇÃO DE CABEÇALHOS E SPLIT DE REQUISIÇÕES HTTP/2 & GRPC
 * (CWE-113, CWE-444 & RFC 9113 HTTP/2 Desync / Request Smuggling)
 */
export interface InspectHttp2HeadersDTO {
  headers: Array<{ name: string; value: string }>;
  protocolTarget?: import('./enums').Http2ProtocolTarget;
  clientIp?: string;
  userAgent?: string;
}

export interface InspectHttp2HeadersResponse {
  success: boolean;
  isValid: boolean;
  action: import('./enums').Http2ValidationAction;
  inspection: import('./models').Http2InspectionResult;
  incident?: import('./models').Http2SecurityIncident;
  message: string;
}

export interface UpdateHttp2PolicyDTO {
  blockTransferEncoding?: boolean;
  enforceLowercaseHeaders?: boolean;
  stripConnectionHeaders?: boolean;
  validateGrpcMetadata?: boolean;
  maxHeaderNameLength?: number;
  maxHeaderValueLength?: number;
  maxTotalHeadersCount?: number;
  strictContentLengthValidation?: boolean;
}

export interface UpdateHttp2PolicyResponse {
  success: boolean;
  policy: import('./models').Http2GuardPolicy;
  message: string;
}

export interface SimulateHttp2AttackDTO {
  threatCategory: import('./enums').Http2ThreatCategory;
}

export interface SimulateHttp2AttackResponse {
  success: boolean;
  threatBlocked: boolean;
  attackPayloadHeaders: Array<{ name: string; value: string }>;
  inspection: import('./models').Http2InspectionResult;
  incident?: import('./models').Http2SecurityIncident;
  message: string;
}

export interface VerifyHttp2SealDTO {
  sealToken: string | import('./models').Http2ProofSeal;
}

export interface VerifyHttp2SealResponse {
  success: boolean;
  isValid: boolean;
  seal?: import('./models').Http2ProofSeal;
  message: string;
  verifiedAt: string;
}

export interface Http2GuardOverviewResponse {
  success: boolean;
  overview: import('./models').Http2GuardOverview;
}

/**
 * 73. PROTEÇÃO CONTRA INJEÇÃO DE DEPENDÊNCIAS DINÂMICAS E HIJACKING DE MÓDULOS NODE/BUN (CWE-470, CWE-912, SLSA L3)
 */
export interface InspectDependenciesDTO {
  manifestContent?: string | Record<string, any>;
  lockfileContent?: string;
  targetRegistry?: string;
  strictMode?: boolean;
  dependencies?: import('./models').DependencyNode[];
}

export interface InspectDependenciesResponse {
  success: boolean;
  result: import('./models').DependencyInspectionResult;
  incident?: import('./models').DependencySecurityIncident;
  seal?: import('./models').DependencyProofSeal;
  message: string;
}

export interface InspectDynamicImportDTO {
  specifier: string;
  callerContext?: string;
  executionScope?: string;
}

export interface InspectDynamicImportResponse {
  success: boolean;
  result: import('./models').DynamicImportInspectionResult;
  incident?: import('./models').DependencySecurityIncident;
  message: string;
}

export interface UpdateDependencyPolicyDTO {
  enforceStrictWhitelisting?: boolean;
  blockDynamicImportsWithVariables?: boolean;
  blockLifecycleScripts?: boolean;
  enforceSriIntegrity?: boolean;
  blockUnscopedInternalCollisions?: boolean;
  allowedRegistries?: string[];
  allowedScopes?: string[];
  whitelistedPackages?: string[];
  quarantinedPackages?: string[];
  maxCriticalVulnerabilities?: number;
}

export interface UpdateDependencyPolicyResponse {
  success: boolean;
  policy: import('./models').DependencyGuardPolicy;
  message: string;
}

export interface SimulateSupplyChainAttackDTO {
  attackCategory: import('./enums').DependencyThreatCategory;
  customPayload?: string;
  targetPackageName?: string;
}

export interface SimulateSupplyChainAttackResponse {
  success: boolean;
  attackCategory: import('./enums').DependencyThreatCategory;
  threatBlocked: boolean;
  attackSimulationName: string;
  inspection: import('./models').DependencyInspectionResult | import('./models').DynamicImportInspectionResult;
  incident?: import('./models').DependencySecurityIncident;
  message: string;
}

export interface VerifySupplyChainSealDTO {
  sealToken: string | import('./models').DependencyProofSeal;
}

export interface VerifySupplyChainSealResponse {
  success: boolean;
  isValid: boolean;
  seal?: import('./models').DependencyProofSeal;
  message: string;
  verifiedAt: string;
}

export interface SupplyChainOverviewResponse {
  success: boolean;
  overview: import('./models').SupplyChainGuardOverview;
}

/**
 * LAUDO PERICIAL MULTI-SESSÕES & RELATÓRIO PSICOLÓGICO CONSOLIDADO (Resolução CFP nº 006/2019 & RFC-001 §3.5)
 */
export interface GenerateConsolidatedReportDTO {
  patientId: string;
  finalidade: import('./enums').ClinicalReportPurpose;
  solicitante: string;
  descricaoDemanda: string;
  dataInicio?: string;
  dataFim?: string;
  includePsychometrics?: boolean;
  includeGoals?: boolean;
  includeTimelineSessions?: boolean;
  hipoteseDiagnostica?: string;
  parecerFinal?: string;
  prognostico?: string;
  encaminhamentosSugeridos?: string[];
  localEmissao?: string;
}

export interface ConsolidatedReportResponse {
  success: boolean;
  report: import('./models').ConsolidatedClinicalReport;
  message?: string;
}

export interface SignConsolidatedReportDTO {
  reportId: string;
  signatureToken?: string;
}

export interface ListConsolidatedReportsResponse {
  success: boolean;
  reports: import('./models').ConsolidatedClinicalReport[];
  total: number;
}

/**
 * ENCAMINHAMENTO MULTIDISCIPLINAR INTEROPERÁVEL (Contra-Referência Psiquiátrica / Médica - RFC-001 §3.5)
 */
export interface CreateClinicalReferralDTO {
  patientId: string;
  recipientProfessional: string;
  recipientSpecialty: string;
  recipientInstitution?: string;
  urgency: import('./enums').ReferralUrgency;
  clinicalSummary: string;
  reasonForReferral: string;
  diagnosticHypothesis?: string;
  currentMedicationReported?: string;
  includeLatestPsychometric?: boolean;
}

export interface ClinicalReferralResponse {
  success: boolean;
  referral: import('./models').ClinicalReferral;
  message?: string;
}

export interface ListClinicalReferralsResponse {
  success: boolean;
  referrals: import('./models').ClinicalReferral[];
  total: number;
}

export interface CounterReferralDTO {
  referralId: string;
  counterReferenceNotes: string;
  counterReferredBy: string;
}

export interface ValidateReferralPublicResponse {
  success: boolean;
  valid: boolean;
  referral?: {
    id: string;
    patientInitials: string;
    therapistName: string;
    therapistCrp: string;
    recipientProfessional: string;
    recipientSpecialty: string;
    urgency: import('./enums').ReferralUrgency;
    status: import('./enums').ReferralStatus;
    reasonForReferral: string;
    diagnosticHypothesis?: string;
    issuedAt: string;
    wormAuditId?: string;
  };
  message: string;
}

/**
 * FATURAMENTO CLÍNICO & RECIBOS DE HONORÁRIOS (RFC-001 §3.6 / Receita Federal DMED / IRPF / CFP)
 */
export interface CreateClinicalReceiptDTO {
  patientId: string;
  financialResponsible?: {
    nome: string;
    cpf: string;
    parentesco?: string;
  };
  purpose: import('./enums').ReceiptPurpose;
  modality: import('./enums').BillingModality;
  sessionsCovered: Array<{
    data: string;
    horario?: string;
    modalidade: 'ONLINE' | 'PRESENCIAL';
    appointmentId?: string;
  }>;
  amountCents: number;
  paymentMethod: import('./enums').PaymentMethod;
  paymentDate?: string;
  notes?: string;
}

export interface ClinicalReceiptResponse {
  success: boolean;
  receipt: import('./models').ClinicalReceipt;
  message?: string;
}

export interface ListClinicalReceiptsResponse {
  success: boolean;
  receipts: import('./models').ClinicalReceipt[];
  totalAmountCents: number;
  totalFormatted: string;
  total: number;
}

export interface CancelReceiptDTO {
  receiptId: string;
  cancelReason: string;
}

export interface ValidateReceiptPublicResponse {
  success: boolean;
  valid: boolean;
  receipt?: {
    id: string;
    receiptNumber: string;
    patientInitials: string;
    therapistName: string;
    therapistCrp: string;
    purpose: import('./enums').ReceiptPurpose;
    amountFormatted: string;
    paymentDate: string;
    sessionsCount: number;
    paymentStatus: import('./enums').PaymentStatus;
    documentHashSha256: string;
    wormAuditId?: string;
  };
  message: string;
}

export interface CreateFeeContractDTO {
  patientId: string;
  sessionPriceCents: number;
  paymentDueDateRule?: string;
  cancellationPolicyHours?: number;
  reajustRule?: string;
  confidentialityTerms?: string;
}

export interface FeeContractResponse {
  success: boolean;
  contract: import('./models').FeeContract;
  message?: string;
}

/**
 * TELECONSULTA NATIVA WEBRTC & SALA DE ESPERA (RFC-001 §3.2, §3.3)
 */
export interface KnockWaitingRoomDTO {
  appointmentId: string;
  /** @deprecated o nome vem do cadastro do paciente */
  patientName?: string;
  clientFingerprint?: string;
}

/** Polling da sala: sinais da outra parte desde o cursor e estado da admissão */
export interface TeleconsultationPollResponse {
  success: boolean;
  signals: import('./models').WebRtcSignalEnvelope[];
  cursor: string;
  roomStatus: import('./enums').TeleconsultationRoomStatus;
  /** Situação do paciente na sala de espera (somente para o paciente) */
  myStatus?: 'WAITING' | 'ADMITTED' | 'REJECTED' | null;
  /** Fila da sala de espera (somente para o psicólogo) */
  waitingParticipants?: Array<{ participantId: string; name: string; knockedAt: string; status: 'WAITING' | 'ADMITTED' | 'REJECTED' }>;
}

/** Trecho de áudio do microfone de um participante para transcrição (nunca armazenado) */
export interface LiveTranscriptChunkDTO {
  appointmentId: string;
  /** Áudio codificado (ex.: audio/webm;codecs=opus) em base64 */
  audioBase64: string;
  mimeType: string;
  durationMs: number;
}

export interface LiveTranscriptUtterance {
  id: string;
  speaker: import('./enums').TranscriptionSpeaker;
  startTimeMs: number;
  endTimeMs: number;
  text: string;
  createdAt: string;
}

export interface LiveTranscriptStatusResponse {
  success: boolean;
  enabled: boolean;
  reason?: 'NO_CONSENT' | 'STT_DISABLED';
}

export interface LiveTranscriptResponse {
  success: boolean;
  utterances: LiveTranscriptUtterance[];
}

export interface IceServersResponse {
  success: boolean;
  iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>;
}

export interface KnockWaitingRoomResponse {
  success: boolean;
  participantId: string;
  status: 'WAITING' | 'ADMITTED';
  message: string;
  roomStatus: import('./enums').TeleconsultationRoomStatus;
}

export interface AdmitParticipantDTO {
  appointmentId: string;
  participantId: string;
  action: 'ADMIT' | 'REJECT';
}

export interface UpdateCallQualityDTO {
  appointmentId: string;
  rttMs: number;
  jitterMs: number;
  packetLoss: number;
}

export interface EndTeleconsultationDTO {
  appointmentId: string;
  durationSeconds?: number;
  summaryNotes?: string;
}

export interface TeleconsultationRoomResponse {
  success: boolean;
  room: import('./models').TeleconsultationRoom;
  message?: string;
}

export interface SendWebRtcSignalDTO {
  appointmentId: string;
  /** @deprecated o papel é derivado da sessão autenticada */
  senderRole?: import('./enums').TeleconsultationParticipantRole;
  signalType: import('./models').WebRtcSignalType;
  sessionId?: string;
  sdp?: string;
  candidate?: {
    candidate: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
  };
  mediaState?: import('./models').MediaHardwareState;
}

export interface SyncMediaHardwareDTO {
  appointmentId: string;
  role?: import('./enums').TeleconsultationParticipantRole;
  cameraActive: boolean;
  microphoneActive: boolean;
  screenShareActive?: boolean;
  cameraLabel?: string;
  microphoneLabel?: string;
  resolution?: string;
  frameRate?: number;
  audioSampleRate?: number;
}

/**
 * -------------------------------------------------------------------------------------------------
 * 40. TRANSCRIÇÃO ASSISTIDA POR IA, DIARIZAÇÃO & SÍNTESE SOAP EM TEMPO REAL (RFC-001 §3.3)
 * -------------------------------------------------------------------------------------------------
 */

export interface IngestTranscriptionDTO {
  appointmentId: string;
  patientId: string;
  rawTranscriptText?: string;
  utterances?: Array<{
    speaker: import('./enums').TranscriptionSpeaker;
    startTimeMs: number;
    endTimeMs: number;
    text: string;
    confidenceScore?: number;
    sentimentPolarity?: import('./enums').ConversationalSentiment;
    linkedMarkerId?: string;
  }>;
  consentConfirmed: boolean;
  includeClinicalMarkers?: boolean;
}

export interface ReviewAiSoapDraftDTO {
  draftId: string;
  status: 'ACCEPTED_BY_THERAPIST' | 'MODIFIED_BY_THERAPIST' | 'REJECTED';
  reviewedSubjective?: string;
  reviewedObjective?: string;
  reviewedAssessment?: string;
  reviewedPlan?: string;
  finalCid11?: string;
  reviewNotes?: string;
  saveAsOfficialEhrNote?: boolean;
}

export interface TranscriptionSessionResponse {
  success: boolean;
  session: import('./models').TranscriptionSession;
  soapDraft?: import('./models').AiSoapDraft;
  message?: string;
}

export interface AiSoapDraftResponse {
  success: boolean;
  draft: import('./models').AiSoapDraft;
  message?: string;
  createdEhrRecordId?: string;
}

/**
 * -------------------------------------------------------------------------------------------------
 * 41. ASSINATURA AVANÇADA ICP-BRASIL EM LOTE & FECHAMENTO DE CICLOS CLÍNICOS (RFC-001 §3.4, §3.5)
 * -------------------------------------------------------------------------------------------------
 */

export interface PrepareBatchClosingDTO {
  recordIds?: string[];
  documentIds?: string[];
  reportIds?: string[];
  receiptIds?: string[];
  patientId?: string;
  dateRangeStart?: string;
  dateRangeEnd?: string;
}

export interface ExecuteBatchSignatureDTO {
  recordIds: string[];
  documentIds?: string[];
  reportIds?: string[];
  receiptIds?: string[];
  certificateType: import('./enums').IcpCertificateType;
  certificatePinOrSecret?: string;
  certificateSubjectDn?: string;
  pscCloudProvider?: string; // BirdID, SafeID, NeoID
}

export interface VerifyIcpBatchDTO {
  publicValidationToken: string;
}

export interface BatchPendingItemsResponse {
  success: boolean;
  items: import('./models').BatchSignableItem[];
  totalPendingCount: number;
  message?: string;
}

export interface BatchClosingResponse {
  success: boolean;
  manifest: import('./models').IcpBatchClosingManifest;
  sealedRecordsCount: number;
  message: string;
}

export interface BatchVerificationResponse {
  success: boolean;
  valid: boolean;
  manifest?: import('./models').IcpBatchClosingManifest;
  verifiedAt: string;
  details: string;
}

/**
 * DTOs para o Portal do Paciente e Exercícios Terapêuticos (RFC-001 §3.6, §3.7)
 */
export interface RequestPatientAccessCodeDTO {
  email: string;
}

export interface VerifyPatientAccessCodeDTO {
  email: string;
  code: string;
}

export interface PatientAuthResponse {
  success: boolean;
  token?: string;
  profile?: import('./models').PatientPortalProfile;
  message: string;
}

export interface PatientPortalOverviewResponse {
  success: boolean;
  data: import('./models').PatientPortalOverview;
}

export interface AssignExerciseDTO {
  patientId: string;
  title: string;
  description: string;
  type: import('./enums').ExerciseType;
  dueAt?: string;
  templateData?: Record<string, any>;
}

export interface SubmitExerciseResponseDTO {
  exerciseId: string;
  answers: Record<string, any>;
  notes?: string;
}

export interface ReviewExerciseDTO {
  exerciseId: string;
  feedback: string;
}

export interface AcknowledgeConsentDTO {
  consentType: string;
}

export interface ExerciseResponse {
  success: boolean;
  exercise: import('./models').TherapeuticExercise;
  message: string;
}

export interface ExerciseListResponse {
  success: boolean;
  exercises: import('./models').TherapeuticExercise[];
  total: number;
}

/**
 * DTOs para o Módulo de Anamnese Digital Interativa & Árvore Diagnóstica (RFC-001 §3.4)
 */
export interface SaveDiagnosticAssessmentDTO {
  patientId: string;
  primaryTrack: import('./enums').DiagnosticTrackCategory;
  answers: import('./models').DiagnosticAssessmentAnswer[];
  psychometricAnswers?: {
    screenerType: import('./enums').InitialScreenerType;
    answers: Record<string, number>;
  };
  clinicalNotes?: string;
  confidentialNotes?: string;
}

export interface DiagnosticDecisionTreeDefinitionResponse {
  success: boolean;
  tracks: {
    category: import('./enums').DiagnosticTrackCategory;
    label: string;
    description: string;
    entryNodeId: string;
  }[];
  nodes: Record<string, import('./models').DiagnosticDecisionNode>;
  screeners: Record<string, {
    title: string;
    instructions: string;
    items: {
      id: string;
      text: string;
      options: { label: string; score: number }[];
    }[];
  }>;
}

export interface DiagnosticAssessmentReportResponse {
  success: boolean;
  report: import('./models').DiagnosticAssessmentReport;
  isRedFlagAlert: boolean;
  clinicalActionDirectives: string[];
  message: string;
}

export interface DiagnosticAssessmentListResponse {
  success: boolean;
  reports: import('./models').DiagnosticAssessmentReport[];
  total: number;
}

/**
 * DTOs para Prescrição & Encaminhamento Psiquiátrico com Validação Farmacológica (RFC-001 §3.5)
 */
export interface CheckDrugInteractionsDTO {
  drugIds: string[];
}

export interface CheckDrugInteractionsResponse {
  success: boolean;
  interactions: import('./models').DrugInteractionRecord[];
  maxSeverity: import('./enums').DrugInteractionSeverity | 'NONE';
  warningCount: number;
}

export interface CreatePsychiatricReferralDTO {
  patientId: string;
  urgencyLevel: import('./enums').DiagnosticUrgencyLevel;
  reasonForReferral: string;
  clinicalHypothesesCid11: string[];
  currentMedications: import('./models').PatientCurrentMedication[];
  psychometricSummary?: {
    scale: string;
    score: number;
    severity: string;
  };
  confidentialNotes?: string;
}

export interface PsychiatricReferralResponse {
  success: boolean;
  referral: import('./models').PsychiatricReferralGuide;
  validationUrl: string;
  message: string;
}

export interface PsychiatricReferralListResponse {
  success: boolean;
  referrals: import('./models').PsychiatricReferralGuide[];
  total: number;
}

export interface PsychopharmaceuticalCatalogResponse {
  success: boolean;
  drugs: import('./models').Psychopharmaceutical[];
  total: number;
}

/**
 * -------------------------------------------------------------------------------------------------
 * 42. EXPORTAÇÃO SEGURA E PORTABILIDADE DE PRONTUÁRIO EM PACOTE CIFRADO .ENC (RFC-001 §3.3, §4.4 & LGPD Art. 18)
 * -------------------------------------------------------------------------------------------------
 */

export interface GeneratePortabilityEncVaultDTO {
  patientId: string;
  holderPassphrase: string;
  kdfAlgorithm?: import('./enums').PortabilityKdfAlgorithm;
  requestReason?: string;
}

export interface GeneratePortabilityEncVaultResponse {
  success: boolean;
  vaultFile: import('./models').EncryptedPortabilityEncFile;
  fileName: string;
  merkleRootSha256: string;
  notarySeal: import('./models').PortabilityNotarySeal;
  message: string;
}

export interface VerifyPortabilityEncVaultDTO {
  vaultFile: import('./models').EncryptedPortabilityEncFile;
  holderPassphrase?: string;
}

export interface VerifyPortabilityEncVaultResponse {
  success: boolean;
  verification: import('./models').PortabilityVaultVerificationResult;
  message: string;
}

export interface DecryptPortabilityEncVaultDTO {
  vaultFile: import('./models').EncryptedPortabilityEncFile;
  holderPassphrase: string;
}

export interface DecryptPortabilityEncVaultResponse {
  success: boolean;
  payload: import('./models').ConsolidatedPortabilityPayload;
  verification: import('./models').PortabilityVaultVerificationResult;
  message: string;
}

export interface PortabilityVaultHistoryResponse {
  success: boolean;
  vaults: Array<{
    vaultId: string;
    patientId: string;
    patientInitials: string;
    kdfAlgorithm: import('./enums').PortabilityKdfAlgorithm;
    merkleRootSha256: string;
    sealToken: string;
    totalRecordsCount: number;
    exportedAt: string;
  }>;
  total: number;
}

/**
 * -------------------------------------------------------------------------------------------------
 * 43. PROTEÇÃO CONTRA INJEÇÃO DE OBJETOS E DESSERIALIZAÇÃO NÃO SEGURA EM WEBSOCKET (RFC 6455 & CWE-502)
 * -------------------------------------------------------------------------------------------------
 */

export interface InspectWebSocketFrameDTO {
  channel: import('./enums').ClinicalWebSocketChannelType;
  opcode?: import('./enums').WebSocketFrameOpcode;
  rawFramePayload: string;
  sessionId?: string;
}

export interface InspectWebSocketFrameResponse {
  success: boolean;
  result: import('./models').WebSocketFrameInspectionResult;
  incident?: import('./models').WebSocketSecurityIncident;
  seal: import('./models').WebSocketProofSeal;
  message: string;
}

export interface UpdateWebSocketGuardPolicyDTO {
  policy: Partial<import('./models').WebSocketGuardPolicy>;
}

export interface UpdateWebSocketGuardPolicyResponse {
  success: boolean;
  policy: import('./models').WebSocketGuardPolicy;
  message: string;
}

export interface SimulateWebSocketAttackDTO {
  sampleId?: string;
  attackCategory?: import('./enums').WebSocketThreatCategory;
}

export interface SimulateWebSocketAttackResponse {
  success: boolean;
  sampleUsed: import('./models').WebSocketAdversarialSample;
  result: import('./models').WebSocketFrameInspectionResult;
  incident: import('./models').WebSocketSecurityIncident;
  seal: import('./models').WebSocketProofSeal;
  message: string;
}

export interface VerifyWebSocketSealDTO {
  sealId: string;
  seal?: import('./models').WebSocketProofSeal;
}

export interface VerifyWebSocketSealResponse {
  success: boolean;
  isValid: boolean;
  sealId: string;
  verifiedAt: string;
  details: string;
}







