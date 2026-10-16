import {
  TherapistStatus,
  AppointmentStatus,
  TranscriptionStatus,
  SpeakerRole,
  DocumentType,
  UserRole,
  AuditAction,
  AuditResourceType,
  KmsKeyStatus,
  KmsProviderType,
  StressScenario,
  SloStatus,
  OtlpExporterProvider,
  OtlpExportStatus,
  ComplianceFramework,
  ComplianceControlStatus,
  MeetProvider,
  MeetAccessType,
  ConsentScope,
  ConsentStatus,
  ConsentLegalBasis,
  DlpPolicyMode,
  DlpRiskLevel,
  SteganographyInspectionStatus,
  NotaryStatus,
  NotaryVerificationStatus,
  PurgeReason,
  PurgeMethod,
  PurgeStatus,
  PurgeProofVerificationStatus,
  ClinicalDidMethod,
  CredentialRevocationStatus,
  DidVerificationStatus,
  UebaRiskLevel,
  UebaAnomalyType,
  UebaContainmentAction,
  UebaContainmentStatus,
  DpMechanism,
  DpQueryType,
  DpBudgetStatus,
  DpCohortMetric,
  DpResearchStatus,
  SessionBindingMode,
  SessionLifecycleStatus,
  SessionDeviceType,
  TsaAuthorityType,
  TimestampVerificationStatus,
  HppAttackCategory,
  HppDefensePolicy,
  HppSeverityLevel,
  Cid11Category,
  HomomorphicSecurityLevel,
  HomomorphicCohortStatus,
  SsrfAttackCategory,
  SsrfDefensePolicy,
  SsrfSeverityLevel,
  WebhookConnectorType,
  RateLimitingAlgorithm,
  RateLimitTier,
  RateLimitDecision,
  MemorySanitizationAlgorithm,
  HeapSprayingThreatLevel,
  SecureBufferState,
  TlsPinningStrategy,
  TlsPinValidationStatus,
  TlsPinPolicyMode
} from './enums';
import type { EncryptedPayload } from './crypto';


/**
 * 1. TERAPEUTA
 * Representa o profissional de psicologia habilitado no CFP/e-Psi
 */
export interface Therapist {
  id: string;
  crp: string;
  crpRegion: string;
  status: TherapistStatus;
  /** DEK do terapeuta encriptada pela KEK mestre (Cloud KMS) */
  encryptedDek: string;
  createdAt: Date | string;
}

/**
 * 2. PACIENTE
 * Representação da entidade com dados de saúde sensíveis (LGPD Art. 5º, II)
 */
export interface Patient {
  id: string;
  therapistId: string;
  
  /** Blind index HMAC-SHA256 para buscas exatas sem expor texto claro */
  emailBindex: string;
  cpfBindex?: string;
  
  consentTranscriptionSigned: boolean;
  consentSignedAt?: Date | string | null;
  /** Data/hora de revogação formal de consentimento (LGPD Art. 18, IX) */
  consentRevokedAt?: Date | string | null;
  /** Motivação registrada para a revogação do consentimento */
  consentRevokeReason?: string | null;
  createdAt: Date | string;
}

/**
 * Representação decriptada em memória do paciente (somente para psicólogo autenticado)
 */
export interface DecryptedPatient extends Patient {
  name: string;
  email: string;
  phone: string;
  cpf?: string;
}

/**
 * Representação armazenada no banco com Field-Level Encryption (FLE)
 */
export interface StoredPatient extends Patient {
  encryptedName: EncryptedPayload;
  encryptedEmail: EncryptedPayload;
  encryptedPhone: EncryptedPayload;
  encryptedCpf?: EncryptedPayload;
}

/**
 * 3. AGENDAMENTOS E SESSÕES (Módulo 1 & 2)
 */
export interface Appointment {
  id: string;
  therapistId: string;
  patientId: string;
  scheduledStart: Date | string;
  scheduledEnd: Date | string;
  status: AppointmentStatus;
  
  // Integração Google Meet REST API v2 & Calendar
  googleEventId?: string;
  meetAccessCode?: string;
  meetSpaceName?: string;
  meetProvider?: MeetProvider;
  meetAccessType?: MeetAccessType;
  
  createdAt: Date | string;
}

export interface StoredAppointment extends Appointment {
  encryptedMeetUrl: EncryptedPayload;
}

export interface DecryptedAppointment extends Appointment {
  meetUrl: string;
}

/**
 * 4. TRANSCRIÇÕES DE SESSÕES (Módulo 3)
 */
export interface TranscriptUtterance {
  speaker: SpeakerRole;
  time: string;
  text: string;
}

export interface SessionTranscription {
  id: string;
  appointmentId: string;
  storagePath: string;
  rawStatus: TranscriptionStatus;
  wordCount?: number;
  durationSeconds?: number;
  createdAt: Date | string;
}

export interface StoredSessionTranscription extends SessionTranscription {
  encryptedStorageKey: string;
  encryptedTranscript?: EncryptedPayload;
}

export interface DecryptedSessionTranscription extends SessionTranscription {
  utterances: TranscriptUtterance[];
  sanitizedUtterances?: TranscriptUtterance[];
}


/**
 * 5. PRONTUÁRIOS E EVOLUÇÃO CLÍNICA - SOAP (Módulo 4 - CFP 001/2009)
 */
export interface SoapNote {
  /** S - Subjetivo: queixas, sentimentos e relato do paciente */
  subjective: string;
  /** O - Objetivo: observações comportamentais e afeto */
  objective: string;
  /** A - Avaliação: hipóteses e análise clínica do psicólogo */
  assessment: string;
  /** P - Plano: condutas terapêuticas e tarefas combinadas */
  plan: string;
}

export interface ClinicalRecord {
  id: string;
  appointmentId: string;
  patientId: string;
  therapistId: string;
  sessionNumber: number;
  isSigned: boolean;
  signedAt?: Date | string | null;
  signatureHash?: string | null;
  createdAt: Date | string;
}

export interface DecryptedClinicalRecord extends ClinicalRecord {
  soap: SoapNote;
  /** Notas reflexivas privadas e confidenciais do terapeuta (§3.4) */
  privateNotes?: string;
}

export interface StoredClinicalRecord extends ClinicalRecord {
  encryptedSoapSubjective?: EncryptedPayload;
  encryptedSoapObjective?: EncryptedPayload;
  encryptedSoapAssessment?: EncryptedPayload;
  encryptedSoapPlan?: EncryptedPayload;
  encryptedPrivateNotes?: EncryptedPayload;
}

/**
 * 6. DOCUMENTOS PSICOLÓGICOS (Módulo 5 - CFP 006/2019)
 */
export interface PsychologicalDocument {
  id: string;
  type: DocumentType;
  patientId: string;
  therapistId: string;
  title: string;
  regulationReference: string;
  content: string;
  pdfStoragePath?: string;
  /** Token público para validação de autenticidade via QR Code */
  validationToken: string;
  isSigned: boolean;
  signedAt?: Date | string | null;
  signaturePadesHash?: string | null;
  /** Assinatura digital qualificada ICP-Brasil (PAdES / MP 2.200-2/2001) */
  icpSignature?: IcpSignatureData | null;
  createdAt: Date | string;
}

export interface IcpCertificateInfo {
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: string;
  validTo: string;
  cpf: string;
  crp?: string;
  certificateType: 'A1' | 'A3';
  complianceIcpBrasil: boolean;
}

export interface IcpSignatureData {
  certificate: IcpCertificateInfo;
  signatureHash: string;
  timestampToken: string;
  signedAt: string;
  padesSubFilter: 'ETSI.CAdES.detached' | 'adbe.pkcs7.detached';
}

export interface StoredPsychologicalDocument extends Omit<PsychologicalDocument, 'content'> {
  encryptedContent: EncryptedPayload;
}

export interface DecryptedPsychologicalDocument extends PsychologicalDocument {}


/**
 * 7. AUDITORIA IMUTÁVEL (Seção 4.4 - LGPD & CFP)
 */
export interface AuditLog {
  id: string;
  actorId: string;
  resourceType: AuditResourceType;
  resourceId: string;
  action: AuditAction;
  ipAddress: string;
  userAgent?: string;
  timestamp: Date | string;
  /** Número sequencial estritamente crescente na cadeia (1, 2, 3...) */
  sequenceNumber?: number;
  /** Hash SHA-256 do registro anterior na hash-chain WORM (tamper-evident) */
  previousHash?: string;
  /** Hash SHA-256 canônico computado sobre os dados do log */
  hash?: string;
}

/**
 * 8. USUÁRIO DO SISTEMA (Opção C - RFC §5.2)
 * Profissional autenticado com suporte a RBAC e 2FA/MFA
 */
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  crp?: string;
  crpRegion?: string;
  therapistId?: string;
  passwordHash: string;
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  twoFactorBackupCodes?: string[];
  passkeysCount?: number;
  createdAt: Date | string;
  lastLoginAt?: Date | string | null;
}

/**
 * Usuário seguro sem dados confidenciais (hash de senha e segredo 2FA)
 */
export interface SafeUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  crp?: string;
  crpRegion?: string;
  therapistId?: string;
  twoFactorEnabled: boolean;
  passkeysCount?: number;
  createdAt: Date | string;
  lastLoginAt?: Date | string | null;
}

/**
 * Payload estruturado do token JWT
 */
export interface AuthTokenPayload {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
  therapistId?: string;
  crp?: string;
  type: 'access' | 'refresh' | 'mfa_temp';
  exp: number;
  iat: number;
}

/**
 * 9. WEBHOOKS ASSINADOS & EVENTOS DE SEGURANÇA (Opção J - RFC-001)
 */
export type WebhookEventType = 
  | 'SECURITY_ALERT'
  | 'AUTH_LOGIN_FAILED'
  | 'BACKUP_RESTORE'
  | 'DATA_EXPORT_LGPD'
  | 'CONSENT_REVOKED'
  | 'DOCUMENT_SIGNED';

export interface WebhookDeliveryLog {
  id: string;
  webhookId: string;
  eventType: WebhookEventType;
  deliveryUrl: string;
  timestamp: string;
  httpStatus?: number;
  latencyMs: number;
  success: boolean;
  signatureHeader: string;
  error?: string;
}

export interface WebhookSubscription {
  id: string;
  url: string;
  description: string;
  events: WebhookEventType[];
  secret: string; // whsec_...
  enabled: boolean;
  createdAt: string;
  lastTriggeredAt?: string | null;
  lastDeliveryStatus?: 'SUCCESS' | 'FAILED' | null;
}

/**
 * 10. FICHA DE ADMISSÃO & ANAMNESE BIOPSICOSSOCIAL (RFC §3.4 e Resoluções CFP nº 001/2009 e 004/2020)
 */
export interface BiopsychosocialHistory {
  personalDevelopment?: string;
  familyDynamics?: string;
  socialSupportNetwork?: string;
  routineSleepNutrition?: string;
}

export interface MedicalAndPsychiatricHistory {
  currentMedications?: string;
  previousTreatments?: string;
  familyPsychiatricHistory?: string;
  allergiesOrMedicalConditions?: string;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

export interface AnamnesisRecord {
  id: string;
  patientId: string;
  therapistId: string;
  chiefComplaint: string;
  historyOfComplaint: string;
  biopsychosocialHistory: BiopsychosocialHistory;
  medicalAndPsychiatricHistory: MedicalAndPsychiatricHistory;
  therapeuticGoals: string;
  emergencyContact?: EmergencyContact;
  version: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface DecryptedAnamnesisRecord extends AnamnesisRecord {}

export interface StoredAnamnesisRecord {
  id: string;
  patientId: string;
  therapistId: string;
  version: number;
  encryptedChiefComplaint: EncryptedPayload;
  encryptedHistoryOfComplaint: EncryptedPayload;
  encryptedBiopsychosocialHistory: EncryptedPayload;
  encryptedMedicalAndPsychiatricHistory: EncryptedPayload;
  encryptedTherapeuticGoals: EncryptedPayload;
  encryptedEmergencyContact?: EncryptedPayload;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * 11. TERMO DE RETIFICAÇÃO FORMAL DE PRONTUÁRIO (RFC §3.4 e Resolução CFP nº 001/2009)
 */
export type RectifiedQuadrant = 'SUBJECTIVE' | 'OBJECTIVE' | 'ASSESSMENT' | 'PLAN' | 'GENERAL';

export interface ClinicalRecordRectification {
  id: string;
  clinicalRecordId: string;
  therapistId: string;
  rectifiedQuadrant: RectifiedQuadrant;
  reason: string;
  rectifiedContent: string;
  signatureHash: string;
  signedAt: Date | string;
  createdAt: Date | string;
}

export interface StoredClinicalRecordRectification {
  id: string;
  clinicalRecordId: string;
  therapistId: string;
  rectifiedQuadrant: RectifiedQuadrant;
  encryptedReason: EncryptedPayload;
  encryptedRectifiedContent: EncryptedPayload;
  signatureHash: string;
  signedAt: Date | string;
  createdAt: Date | string;
}

/**
 * 12. MÉTRICAS OPENTELEMETRY / PROMETHEUS & TRACING DISTRIBUÍDO (RFC-001 §5.2 - Opção N)
 */
export type SpanKind = 'SERVER' | 'CLIENT' | 'INTERNAL' | 'PRODUCER' | 'CONSUMER';
export type SpanStatus = 'OK' | 'ERROR';

export interface TraceSpan {
  traceId: string;       // 32-hex chars W3C Trace ID
  spanId: string;        // 16-hex chars W3C Span ID
  parentSpanId?: string; // 16-hex chars Parent Span ID
  name: string;          // ex: http.request, crypto.encrypt_fle, db.query, ai.generate_soap
  kind: SpanKind;
  startTimeMs: number;
  endTimeMs?: number;
  durationMs?: number;
  status: SpanStatus;
  attributes: Record<string, string | number | boolean>;
  events?: Array<{
    name: string;
    timestampMs: number;
    attributes?: Record<string, string | number | boolean>;
  }>;
}

export interface RedMetrics {
  requestRatePerSec: number;
  errorRatePercentage: number;
  totalRequests: number;
  totalErrors: number;
  activeRequests: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
}

export interface CryptoTelemetryMetrics {
  totalEncryptions: number;
  totalDecryptions: number;
  totalBlindIndexes: number;
  avgDurationMs: number;
  activeKeysInRam: number;
}

export interface BusinessTelemetryMetrics {
  activePatients: number;
  sessionsCompletedTotal: number;
  aiSoapGenerationsTotal: number;
  avgAiDurationMs: number;
  wormAuditRecordsTotal: number;
}

export interface TelemetrySystemMetrics {
  uptimeSeconds: number;
  memoryRssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  cpuUsagePercent?: number;
}

export interface TelemetryOverview {
  timestamp: string;
  service: string;
  version: string;
  red: RedMetrics;
  crypto: CryptoTelemetryMetrics;
  business: BusinessTelemetryMetrics;
  system: TelemetrySystemMetrics;
  recentTraces: TraceSpan[];
}

/**
 * 13. AUTENTICAÇÃO BIOMÉTRICA WEBAUTHN / PASSKEYS (FIDO2 / TouchID / FaceID - RFC-001 Opção O)
 */
export type PasskeyDeviceType = 'singleDevice' | 'multiDevice';

export interface PasskeyCredential {
  id: string; // UUID interno
  userId: string;
  credentialId: string; // base64url
  publicKeyPem: string; // SPKI PEM format
  counter: number; // Sign count anti-replay
  deviceType: PasskeyDeviceType;
  backedUp: boolean;
  transports?: Array<'internal' | 'usb' | 'ble' | 'nfc' | 'hybrid'>;
  friendlyName: string; // ex: "MacBook TouchID", "YubiKey 5C"
  aaguid?: string;
  createdAt: Date | string;
  lastUsedAt?: Date | string | null;
}

export interface WebAuthnChallengeSession {
  challenge: string; // base64url
  userId?: string;
  userEmail?: string;
  type: 'registration' | 'authentication';
  expiresAt: number; // timestamp ms
}

/**
 * 14. AUDITORIA CONTÍNUA, PENTESTING AUTOMATIZADO & RELATÓRIO RIPD/DPIA (Fase 4 do RFC-001 & LGPD Art. 38/50)
 */
export type PentestCategory = 
  | 'RBAC_AUTHORIZATION' 
  | 'RATE_LIMITING' 
  | 'WEBHOOK_TAMPERING' 
  | 'WORM_INTEGRITY' 
  | 'PASSKEY_REPLAY' 
  | 'ICP_BRASIL_SECURITY';

export interface PentestScenarioResult {
  scenarioId: string;
  title: string;
  category: PentestCategory;
  status: 'passed' | 'failed';
  latencyMs: number;
  attackVectorSimulated: string;
  defenseMechanismTriggered: string;
  legalBasisRef: string;
  details?: string;
}

export interface LgpdArticleCompliance {
  article: string;
  title: string;
  requirement: string;
  technicalSafeguard: string;
  status: 'COMPLIANT' | 'WARNING';
}

export interface CfpResolutionCompliance {
  resolution: string;
  title: string;
  requirement: string;
  technicalSafeguard: string;
  status: 'COMPLIANT' | 'WARNING';
}

export interface DPIAReport {
  reportId: string;
  generatedAt: string;
  dpoName: string;
  overallScore: number; // 0 a 100
  complianceStatus: 'FULL_COMPLIANCE' | 'ACTION_REQUIRED';
  executiveSummary: string;
  pentestSummary: {
    totalScenarios: number;
    passed: number;
    failed: number;
  };
  scenarios: PentestScenarioResult[];
  lgpdArticles: LgpdArticleCompliance[];
  cfpResolutions: CfpResolutionCompliance[];
  canonicalHash: string;
  verifiedBy: string;
}

/**
 * 14. CONECTORES SIEM EXTERNOS & RETRY EXPONENCIAL (RFC §4.4 & §5.2)
 */
export type SiemProvider = 'datadog' | 'splunk' | 'elastic' | 'generic';

export type CircuitBreakerStatus = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface SiemConnector {
  id: string;
  provider: SiemProvider;
  name: string;
  endpointUrl: string;
  apiKey?: string;
  indexOrSource?: string;
  tags?: Record<string, string>;
  subscribedEvents: WebhookEventType[];
  enabled: boolean;
  circuitBreakerStatus: CircuitBreakerStatus;
  consecutiveFailures: number;
  circuitOpenedAt?: string | null;
  stats: {
    totalDispatched: number;
    successful: number;
    retried: number;
    dlqMoved: number;
    lastLatencyMs?: number;
    lastDispatchedAt?: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

export type QueueItemStatus = 'PENDING' | 'RETRYING' | 'DELIVERED' | 'DEAD_LETTER';

export interface SiemDeliveryAttempt {
  attemptNumber: number;
  timestamp: string;
  httpStatus?: number;
  latencyMs: number;
  error?: string;
}

export interface SiemQueueItem {
  id: string;
  connectorId: string;
  provider: SiemProvider;
  eventType: WebhookEventType;
  payload: any;
  status: QueueItemStatus;
  currentAttempt: number;
  maxAttempts: number;
  nextRetryAt?: string | null;
  attemptsHistory: SiemDeliveryAttempt[];
  createdAt: string;
  deliveredAt?: string | null;
  deadLetteredAt?: string | null;
  deadLetterReason?: string;
}

/**
 * 15. CICLO DE VIDA E ROTAÇÃO DE CHAVES KMS (RFC §4.2, §4.3 & NIST SP 800-57)
 */
export interface KmsKeyMetadata {
  keyId: string;
  version: number;
  algorithm: string;
  status: KmsKeyStatus;
  providerType: KmsProviderType;
  createdAt: string;
  rotatedAt?: string | null;
  revokedAt?: string | null;
  expiresAt: string;
  encryptedDeksCount: number;
  rotationReason?: string;
}

export interface KmsRotationPolicy {
  enabled: boolean;
  intervalDays: number;
  autoReWrapLegacyDeks: boolean;
  alertThresholdDays: number;
  lastRotationDate?: string | null;
  nextScheduledRotationDate: string;
}

export interface KmsSystemStatus {
  activeKeyVersion: number;
  totalKeysCount: number;
  keys: KmsKeyMetadata[];
  policy: KmsRotationPolicy;
  reWrappedDeksCount: number;
  complianceScore: number;
  nistCompliance: boolean;
  lastAuditAction?: string;
}

/**
 * 16. TESTES DE CARGA, STRESS CONCORRENTE & SLOS RED (RFC §5.1, §5.2)
 */
export interface StressPercentiles {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  avg: number;
}

export interface StressSloEvaluation {
  id: string;
  name: string;
  targetDescription: string;
  thresholdMs?: number;
  maxErrorRate?: number;
  actualValue: number;
  unit: string;
  status: SloStatus;
}

export interface StressTestReport {
  id: string;
  scenario: StressScenario;
  totalRequests: number;
  concurrency: number;
  durationMs: number;
  rps: number;
  successfulRequests: number;
  failedRequests: number;
  errorRate: number;
  percentiles: StressPercentiles;
  memoryDeltaMb: {
    rss: number;
    heapUsed: number;
  };
  slos: StressSloEvaluation[];
  slosPassedCount: number;
  slosTotalCount: number;
  allSlosMet: boolean;
  timestamp: string;
  executedBy: string;
}

/**
 * 17. EXPORTAÇÃO AUTOMÁTICA OTLP & TELEMETRIA REMOTA (RFC §5.2 - Opção N)
 */
export interface OtlpExporterConfig {
  enabled: boolean;
  provider: OtlpExporterProvider;
  endpoint: string;               // URL base do coletor (ex: https://otlp.datadoghq.com ou http://localhost:4318)
  apiKey?: string;                // Chave de API mascarada na leitura
  batchSize: number;              // Quantidade máxima de spans por lote
  flushIntervalSeconds: number;   // Intervalo de auto-flush em segundos
  customHeaders?: Record<string, string>;
  exportTraces: boolean;
  exportMetrics: boolean;
  serviceName: string;
  environment: string;
}

export interface OtlpExporterStats {
  status: OtlpExportStatus;
  queuedSpansCount: number;
  totalExportedSpans: number;
  totalExportedBatches: number;
  failedBatchesCount: number;
  successRate: number;            // 0 a 100%
  lastExportAt?: string;
  lastError?: string;
  lastLatencyMs?: number;
  endpoint: string;
  provider: OtlpExporterProvider;
}

export interface OtlpBatchExportResult {
  success: boolean;
  batchesSent: number;
  spansCount: number;
  metricsCount: number;
  durationMs: number;
  statusCode?: number;
  endpoint: string;
  error?: string;
  timestamp: string;
}

/**
 * 18. GOVERNANÇA EXECUTIVA, AUDITORIA & COMPLIANCE MULTI-NORMATIVO (RFC-001 §4.4, §5.2)
 */
export interface ComplianceControlDetail {
  id: string;
  framework: ComplianceFramework;
  normReference: string;          // Ex: "LGPD Art. 11", "CFP 001/2009 Art. 4º", "MP 2.200-2/2001", "SOC2 CC6.1"
  title: string;
  description: string;
  technicalSafeguard: string;     // Ex: "Envelope Encryption AES-256-GCM + Blind Index HMAC-SHA256"
  evidenceSummary: string;
  status: ComplianceControlStatus;
}

export interface ComplianceFrameworkEvaluation {
  framework: ComplianceFramework;
  name: string;
  description: string;
  regulatoryBasis: string[];
  totalControls: number;
  compliantControls: number;
  scorePercentage: number;        // 0 a 100%
  status: ComplianceControlStatus;
}

export interface DpoSignOff {
  signedBy: string;
  role: string;
  technicalResponsibleCrp?: string;
  signedAt: string;
  statement: string;
  signatureDigest: string;
}

export interface ForensicMetricsSnapshot {
  totalWormBlocks: number;
  wormChainIntegrity: 'INTACT' | 'COMPROMISED';
  activeKmsKeyVersion: number;
  dataBackupsCount: number;
  resilienceFallbackPassed: boolean;
  twoFactorAdoptionRate: number;
  passkeysCount: number;
  rateLimitingStoreType: string;
  otlpExporterActive: boolean;
}

export interface ExecutiveCompliancePackage {
  id: string;
  issuedAt: string;
  organization: string;
  dpoName: string;
  technicalResponsibleCrp: string;
  globalScorePercentage: number;
  status: ComplianceControlStatus;
  frameworks: ComplianceFrameworkEvaluation[];
  controls: ComplianceControlDetail[];
  forensicMetrics: ForensicMetricsSnapshot;
  canonicalDigest: string;        // SHA-256 canônico gerado sobre o payload
  tamperEvidentSeal: string;      // Selo probatório de conformidade forense
  dpoSignOff?: DpoSignOff;
}

/**
 * 22. HARDENING HTTP & HONEYPOT ANTI-PROBE (RFC-001 §4.4, §5.2)
 */
export interface SecurityHeaderCheck {
  header: string;
  expectedValue: string;
  actualValue?: string;
  present: boolean;
  status: 'PASS' | 'WARN' | 'FAIL';
  recommendation: string;
}

export interface SecurityHeadersEvaluationResult {
  evaluatedAt: string;
  scorePercentage: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'F';
  checks: SecurityHeaderCheck[];
  totalPassed: number;
  totalChecks: number;
}

export interface HoneypotProbeRecord {
  id: string;
  ipAddress: string;
  path: string;
  method: string;
  userAgent: string;
  headersPreview: Record<string, string>;
  trappedAt: string;
  banExpiresAt: string;
  blockedAttemptsCount: number;
  status: 'ACTIVE_BAN' | 'EXPIRED' | 'PARDONED';
}

export interface SecurityHardeningMetrics {
  totalProbesTrapped: number;
  activeBannedIpsCount: number;
  uniqueAttackingIpsCount: number;
  lastProbeAt?: string;
  headersEvaluation: SecurityHeadersEvaluationResult;
  honeypotEnabled: boolean;
  banDurationMinutes: number;
}

/**
 * 23. AUDITORIA DE SESSÃO WEBRTC & FINGERPRINT DE SEGURANÇA (RFC-001 §3.2, §4.4, §5.2 e CFP 011/2018)
 */
export interface WebRtcPeerFingerprint {
  role: 'THERAPIST' | 'PATIENT';
  fingerprint: string;            // SHA-256 XX:XX:XX... formato RFC 8122
  certificateAlgorithm?: string;  // ex: ECDSA P-256, RSA 2048
  sdpHash?: string;               // Hash SHA-256 do SDP Session Description
  clientReportedAt?: string;
}

export interface WebRtcSessionAuditRecord {
  sessionId: string;
  appointmentId?: string;
  therapistId: string;
  patientId: string;
  startedAt: string;
  endedAt?: string;
  therapistFingerprint: WebRtcPeerFingerprint;
  patientFingerprint?: WebRtcPeerFingerprint;
  safetyNumbers: string;          // Ex: "48291 30194 82015 67123" (SAS gerado do par ordenado)
  phoneticSas?: string;           // Ex: "alpha-delta-whiskey-echo"
  verificationStatus: import('./enums').WebRtcVerificationStatus;
  securityGrade: import('./enums').WebRtcSecurityGrade;
  cipherSuite: string;            // ex: SRTP_AEAD_AES_256_GCM
  dtlsVersion: string;            // ex: DTLS 1.3 ou DTLS 1.2
  verifiedAt?: string;
  verifiedBy?: string;
  averageJitterMs?: number;
  packetLossPercent?: number;
  roundTripTimeMs?: number;
  bytesEncrypted?: number;
  probataryDigest: string;        // SHA-256 canônico da sessão selada
  tamperEvidentSeal: string;      // Hash WORM encadeado
}

export interface WebRtcSessionMetrics {
  sessionId: string;
  timestamp: string;
  jitterMs: number;
  packetLoss: number;
  rttMs: number;
  bytesSent: number;
  bytesReceived: number;
  cipherSuite: string;
}

/**
 * 24. WAF EM CAMADA DE APLICAÇÃO & INSPEÇÃO HEURÍSTICA DE PAYLOADS (RFC-001 §4.4, §5.2)
 */
export interface WafMatchedRule {
  category: import('./enums').WafAttackType;
  ruleId: string;
  description: string;
  severityScore: number;
  detectedPattern: string;
  fieldPath?: string;
}

export interface WafInspectionResult {
  passed: boolean;
  threatScore: number; // 0 a 100
  matchedRules: WafMatchedRule[];
  inspectedAt: string;
  actionTaken: 'PASSED' | 'LOGGED' | 'BLOCKED';
}

export interface WafIncidentRecord {
  id: string;
  ipAddress: string;
  userAgent: string;
  method: string;
  path: string;
  threatScore: number;
  attackType: import('./enums').WafAttackType;
  matchedRulesCount: number;
  primaryRuleId: string;
  payloadSnippet: string;
  blockedAt: string;
  status: 'BLOCKED' | 'FLAGGED';
}

export interface WafMetrics {
  totalAttacksBlocked: number;
  totalInspections: number;
  totalSqliAttempts: number;
  totalXssAttempts: number;
  totalTraversalAttempts: number;
  totalCommandInjectionAttempts: number;
  lastAttackAt?: string;
  mode: import('./enums').WafMode;
  blockThreshold: number;
}

/**
 * 25. SIMULAÇÃO DE RESILIÊNCIA DE REDE & INTELIGIBILIDADE CLÍNICA (RFC-001 §3.2, §5.1, §5.2 e CFP 011/2018)
 */
export interface NetworkSimulationParams {
  jitterMs: number;
  packetLossPercent: number; // 0.00 a 100.00%
  rttMs: number;
  bandwidthKbps: number;
  durationSeconds: number;
  codec: import('./enums').AudioCodecType;
  simulateAudioOnly?: boolean;
}

export interface ClinicalSpeechAssessment {
  mosScore: number; // Mean Opinion Score ITU-T G.107 (1.00 a 5.00)
  rFactor: number; // Transmission Rating Factor R (0 a 100)
  speechClippingPercent: number; // Estimativa percentual de perda de fonemas/palavras
  effectiveDelayMs: number; // Atraso ponta-a-ponta percebido
  intelligibilityGrade: import('./enums').ClinicalIntelligibilityGrade;
  clinicalRecommendation: string; // Orientação fundamentada no CFP 011/2018
  requiresContingency: boolean; // Indica se o ato psicológico foi comprometido
  videoQualityStatus: 'HD_OPTIMAL' | 'SD_ACCEPTABLE' | 'FROZEN_DEGRADED' | 'DISABLED_AUDIO_ONLY';
}

export interface NetworkSimulationReport {
  id: string;
  timestamp: string;
  patientId?: string;
  therapistId: string;
  profile: import('./enums').NetworkProfileType;
  params: NetworkSimulationParams;
  assessment: ClinicalSpeechAssessment;
  probatoryDigest: string; // SHA-256 canônico
  wormAuditId?: string;
}

export interface NetworkResilienceMetrics {
  totalSimulations: number;
  avgMosScore: number;
  degradedSimulationsCount: number;
  criticalSimulationsCount: number;
  contingencyRecommendedCount: number;
  lastSimulationAt?: string;
}

export interface NetworkProfilePreset {
  profile: import('./enums').NetworkProfileType;
  name: string;
  description: string;
  defaultParams: NetworkSimulationParams;
  expectedMosRange: string;
}

/**
 * 26. GRAVAÇÃO EM REPOUSO COM SHARDING & DESTRUIÇÃO PROGRAMADA (CRYPTO-SHREDDING) (RFC-001 §3.2, §3.3, §4.2, CFP 011/2018)
 */
export interface MediaShardMetadata {
  shardId: string;
  shardIndex: number;
  ivHex: string;
  authTagHex: string;
  encryptedDek: string; // DEK do shard cifrada pela KEK mestre
  sha256Hash: string;   // Hash do shard cifrado para validação Merkle
  byteLength: number;
  status: import('./enums').MediaShardStatus;
  createdAt: string;
  shreddedAt?: string;
}

export interface EncryptedMediaShard {
  metadata: MediaShardMetadata;
  ciphertextBase64: string;
}

export interface MediaRecordingManifest {
  id: string;
  sessionId: string;
  patientId?: string;
  therapistId: string;
  totalShards: number;
  totalBytes: number;
  durationSeconds: number;
  codec: import('./enums').AudioCodecType;
  merkleRoot: string;
  status: import('./enums').MediaRecordingStatus;
  createdAt: string;
  finalizedAt?: string;
  shreddedAt?: string;
  shards: MediaShardMetadata[];
  wormAuditId?: string;
}

export interface CryptoShreddingCertificate {
  certificateId: string;
  recordingId: string;
  sessionId: string;
  destroyedAt: string;
  shreddedShardsCount: number;
  totalBytesPurged: number;
  method: import('./enums').CryptoShreddingMethod;
  probatoryWormDigest: string; // Hash SHA-256 canônico atestando destruição irrestrita
  lgpdBasis: string;           // LGPD Art. 16 (Término de tratamento de dados sensíveis de saúde)
  cfpComplianceRule: string;   // Resolução CFP nº 011/2018 (Sigilo estrito e guarda restrita ao prontuário)
}

export interface MediaStorageMetrics {
  totalRecordings: number;
  activeEncryptedRecordings: number;
  shreddedRecordingsCount: number;
  totalShardsCreated: number;
  activeShardsInStorage: number;
  shreddedShardsCount: number;
  totalBytesPurged: number;
  lastShreddedAt?: string;
}

/**
 * 27. DETECTOR DE DESCONEXÃO ABRUPTA E RECUPERAÇÃO DE SESSÃO CLÍNICA (RFC-001 §3.2 & CFP 011/2018)
 */
export interface SessionStateSnapshot {
  elapsedSeconds: number;
  clinicalNotesDraft: string;   // Anotações imediatas da consulta em andamento
  soapSubjectiveDraft?: string; // Rascunho de fala clínica ou quadrante S
  micMuted: boolean;
  camMuted: boolean;
  activeParticipants: string[];
  lastHeartbeatAt: string;
  sequenceNumber: number;
}

export interface EncryptedSessionSnapshot {
  ciphertextBase64: string;
  ivHex: string;
  authTagHex: string;
  encryptedAt: string;
  snapshotDigest: string; // Hash SHA-256 do snapshot original para verificação de integridade pós-decriptação
}

export interface ClinicalSessionRecoverySession {
  sessionId: string;
  appointmentId: string;
  therapistId: string;
  patientId?: string;
  state: import('./enums').ClinicalSessionState;
  startedAt: string;
  lastHeartbeatAt: string;
  heartbeatCount: number;
  disconnectionCause?: import('./enums').DisconnectionCause;
  disconnectedAt?: string;
  gracePeriodSeconds: number;    // Janela de tolerância ética (default: 600 segundos = 10 minutos)
  gracePeriodExpiresAt?: string;
  reconnectedAt?: string;
  terminatedAt?: string;
  reconnectionAttempts: number;
  reconnectionTokenHash?: string; // Hash do token HMAC emitido
  encryptedSnapshot?: EncryptedSessionSnapshot;
  recoveryGrade?: import('./enums').SessionRecoveryGrade;
  probatoryDigest?: string;       // Selo SHA-256 canônico WORM de queda/recuperação
  auditWormId?: string;
}

export interface SessionRecoveryMetrics {
  totalMonitoredSessions: number;
  activeConnectedCount: number;
  pendingReconnectCount: number;
  successfullyReconnectedCount: number;
  terminatedTimeoutCount: number;
  avgReconnectionTimeSeconds: number;
  recoverySuccessRate: number;    // Porcentagem (0 a 100)
  lastEventAt?: string;
}

/**
 * 28. PROVAS DE CONHECIMENTO ZERO (ZKP) PARA ASSINATURAS FORENSES (RFC-001 §3.4, §3.5, §4.1 & CFP 006/2019)
 */
export interface ZkpSchnorrProof {
  commitHex: string;              // R = g^r mod p
  challengeHex: string;           // c = H(g || Y || R || metadata) (Fiat-Shamir Heuristic)
  responseHex: string;            // s = r + c*x mod q
  generatorHex: string;           // Parâmetro público g
  publicKeyCommitmentHex: string; // Y = g^x mod p (Compromisso cego da chave de assinatura)
}

export interface ZkpClinicalDocumentProof {
  proofId: string;
  documentId: string;
  proofType: import('./enums').ZkpProofType;
  therapistId: string;
  therapistCrpCommitment: string;   // Hash do CRP do psicólogo garantindo autoria profissional
  documentTypeClaim: string;        // Tipo CFP: Laudo, Atestado, Relatório ou Declaração
  documentIssuedAt: string;         // Data formal de emissão do documento
  schnorrProof: ZkpSchnorrProof;
  publicVerificationToken: string;  // Token Zero-Knowledge para validação externa por peritos/juizados
  probatoryWormDigest: string;      // Digest canônico SHA-256 selado na trilha WORM
  createdAt: string;
  expiresAt: string;
}

export interface ZkpVerificationResult {
  valid: boolean;
  status: import('./enums').ZkpVerificationStatus;
  proofType: import('./enums').ZkpProofType;
  documentTypeClaim: string;
  therapistCrpCommitment: string;
  documentIssuedAt: string;
  verifiedAt: string;
  verificationLatencyMs: number;
  probatoryWormDigest: string;
  message: string;
}

export interface ZkpSystemMetrics {
  totalProofsGenerated: number;
  totalVerificationsExecuted: number;
  validVerificationsCount: number;
  invalidAttemptsCount: number;
  avgVerificationLatencyMs: number;
  lastProofGeneratedAt?: string;
  lastVerificationAt?: string;
}

/**
 * 22. MONITOR DE VAZAMENTO NA DARK WEB & RESPOSTA A INCIDENTES DPO (RFC-001 §4.4, LGPD Art. 46/48)
 */
export interface CredentialBreachRecord {
  id: string;
  userId?: string;
  userEmailMasked: string; // Ex: g***r@terapiainfoco.com.br
  userRole: import('./enums').UserRole | string;
  source: import('./enums').ThreatSourceType;
  breachTitle: string;     // Ex: "RedLine Stealer Botnet Dump 2026", "Collection #1 v2"
  breachDate: string;      // Data aproximada do vazamento original
  detectedAt: string;      // Momento da detecção pelo monitor proativo
  kAnonymityPrefix: string; // Primeiros 5 caracteres hexadecimais SHA-1 (ex: "21BD1")
  breachCount: number;     // Frequência de ocorrência nos dumps
  severity: import('./enums').BreachSeverity;
  containmentStatus: import('./enums').IncidentContainmentStatus;
  sessionsRevokedCount: number;
  compromisedFields: string[]; // ['EMAIL', 'PASSWORD_HASH', 'SESSION_COOKIE']
  probatoryWormDigest: string; // Hash SHA-256 do incidente selado na trilha WORM
  dpoAlertId?: string;
}

export interface DpoIncidentAlert {
  alertId: string;
  breachRecordId: string;
  severity: import('./enums').BreachSeverity;
  anpdNotificationRequired: boolean; // Flag de exigência de comunicação formal à ANPD (Resolução CD/ANPD 15/2024)
  anpdDeadlineAt: string;            // Prazo regulatório (3 dias úteis conforme regulamento ANPD)
  status: 'DISPATCHED' | 'ACKNOWLEDGED' | 'REPORTED_TO_ANPD' | 'RESOLVED_INTERNAL';
  title: string;
  summary: string;
  recommendedActions: string[];
  createdAt: string;
  resolvedAt?: string;
  resolutionNotes?: string;
  probatoryWormDigest: string;
}

export interface ThreatIntelligenceMetrics {
  monitoredAccountsCount: number;
  totalBreachesDetected: number;
  activeThreatsCount: number;
  compulsoryRevocationsExecuted: number;
  dpoAlertsCount: number;
  lastScanAt: string;
  averageContainmentTimeSec: number;
  darkWebFeedsActive: number;
}

export interface KAnonymityLookupResult {
  prefix: string;
  matched: boolean;
  breachCount: number;
  breachesFound: string[];
  checkedAt: string;
  zeroKnowledgePreserved: boolean;
}

/**
 * 22. GESTÃO GRANULAR DE CONSENTIMENTO DO PACIENTE & SMART REVOCATION (LGPD Art. 7/8/9/11/18 & CFP 006/2019)
 */
export interface PatientConsentScopePreference {
  scope: ConsentScope;
  status: ConsentStatus;
  grantedAt?: string;
  revokedAt?: string;
  termVersion: string;
  receiptHash: string;
  revocationReason?: string;
  legalBasis: ConsentLegalBasis;
  ipAddress?: string;
  userAgent?: string;
}

export interface ConsentReceipt {
  receiptId: string;
  patientId: string;
  scope: ConsentScope;
  action: 'GRANT' | 'REVOKE';
  status: ConsentStatus;
  termVersion: string;
  legalBasis: ConsentLegalBasis;
  receiptHash: string;
  verificationToken: string; // Token tcle_v1_<base64>
  timestamp: string;
  revocationReason?: string;
  ipAddress?: string;
  userAgent?: string;
  wormAuditLogId?: string;
}

export interface PatientConsentLedger {
  patientId: string;
  patientName: string;
  preferences: Record<ConsentScope, PatientConsentScopePreference>;
  receiptsHistory: ConsentReceipt[];
  lastUpdatedAt: string;
}

export interface ConsentValidationResult {
  permitted: boolean;
  scope: ConsentScope;
  status: ConsentStatus;
  reason: string;
  evaluatedAt: string;
  termVersion?: string;
  receiptHash?: string;
}

export interface ConsentLedgerOverview {
  totalPatientsWithConsent: number;
  activeConsentsByScope: Record<ConsentScope, number>;
  revocationsCount: number;
  blockedProcessingsCount: number;
  complianceRatePercent: number;
  lastRevocationAt?: string;
  termVersionActive: string;
}

/**
 * 28. DATA LOSS PREVENTION (DLP) NO CLIPBOARD & MARCA D'ÁGUA ESTEGANOGRÁFICA
 * (LGPD Art. 46, CFP nº 001/2009 & Resolução CFP nº 006/2019)
 */

export interface DlpForensicPayload {
  watermarkId: string;
  operatorId: string;
  operatorName?: string;
  patientId: string;
  patientName?: string;
  timestamp: number;
  sessionOrRecordId?: string;
  contentDigest: string; // SHA-256 (prefixo 16-32 chars) do texto original
  hmacSignature: string; // HMAC-SHA256 para prevenir falsificação da marca d'água
}

export interface DlpInspectionResult {
  status: SteganographyInspectionStatus;
  hasZeroWidthChars: boolean;
  zeroWidthCharCount: number;
  payload: DlpForensicPayload | null;
  sourceNotice?: string;
  verifiedAt: string;
  riskLevel: DlpRiskLevel;
  extractedIntegrity: boolean;
  message: string;
}

export interface DlpEvaluationResult {
  allowed: boolean;
  action: DlpPolicyMode;
  riskLevel: DlpRiskLevel;
  transformedText: string;
  watermarkId: string;
  invisibleCharsCount: number;
  disclaimerText?: string;
  requiresJustification: boolean;
  rejectionReason?: string;
}

export interface DlpEventLog {
  id: string;
  timestamp: string;
  operatorId: string;
  operatorName?: string;
  patientId: string;
  action: DlpPolicyMode;
  riskLevel: DlpRiskLevel;
  status: string;
  charactersCopied: number;
  invisibleCharsCount: number;
  watermarkId: string;
  sourceContext: string;
}

export interface DlpAuditOverview {
  totalCopiesMonitored: number;
  watermarksEmbedded: number;
  bulkExfiltrationsBlocked: number;
  forensicInspectionsPerformed: number;
  activePolicy: DlpPolicyMode;
  recentEvents: DlpEventLog[];
}

/**
 * 29. CARTÓRIO NOTARIAL DIGITAL DE PRONTUÁRIOS & AUDITORIA FORENSE ZERO-KNOWLEDGE
 * (LGPD Art. 18 & Resolução CFP nº 001/2009)
 */

export interface ClinicalNotaryBlock {
  notaryId: string;
  recordId: string;
  recordBlindIndex: string;
  patientId: string;
  versionNumber: number;
  clinicalCanonicalHash: string;
  previousNotaryHash: string;
  blockHash: string;
  digitalNotarySeal: string; // Token público notary_v1_<base64url>
  notaryTimestamp: string;
  therapistId: string;
  therapistCrp: string;
  status: NotaryStatus;
  hasRectifications: boolean;
  rectificationCount: number;
  wormAuditLogId?: string;
}

export interface NotaryChainVerificationResult {
  valid: boolean;
  status: NotaryVerificationStatus;
  totalBlocks: number;
  brokenIndex?: number;
  message: string;
  verifiedAt: string;
  recordBlindIndex?: string;
  blockDetails?: ClinicalNotaryBlock;
}

export interface NotaryLedgerOverview {
  totalNotarizedRecords: number;
  totalVerifiedChains: number;
  integrityPercentage: number;
  tamperingAttemptsDetected: number;
  activeNotaryVersion: string;
  recentNotaryBlocks: ClinicalNotaryBlock[];
}

export interface NotaryCertificate {
  certificateId: string;
  issuedAt: string;
  recordId: string;
  recordBlindIndex: string;
  patientIdMasked: string;
  therapistCrp: string;
  notarizedAt: string;
  versionNumber: number;
  blockHash: string;
  digitalNotarySeal: string;
  cfpComplianceAssertion: string;
  lgpdComplianceAssertion: string;
  verifierUrl: string;
}

/**
 * 25. MECANISMO DE DESCARTE E EXPURGAMENTO SEGURO DE DADOS HISTÓRICOS (LGPD Art. 16 & CFP nº 001/2009)
 */

export interface DataPurgeCertificate {
  certificateId: string;
  issuedAt: string;
  patientBlindIndex: string;
  patientIdMasked: string;
  therapistId: string;
  dpoApproverId: string;
  recordsPurgedCount: number;
  recordIdsPurged: string[];
  sessionsPurgedCount: number;
  audioShardsPurgedCount: number;
  purgeReason: PurgeReason;
  purgeMethod: PurgeMethod;
  status: PurgeStatus;
  purgedAt: string;
  inactivityPeriodMonths: number;
  canonicalProofHash: string;
  cryptographicPurgeSeal: string; // Token purge_v1_<base64url>
  retentionPolicyCompliance: string;
  wormAuditLogId?: string;
  verifierUrl: string;
}

export interface PurgeCandidateRecord {
  patientId: string;
  patientNameMasked: string;
  lastSessionDate: string;
  inactivityMonths: number;
  isEligibleForPurge: boolean; // true se inatividade >= 60 meses (5 anos CFP 001/2009)
  clinicalRecordsCount: number;
  audioRecordingsCount: number;
  blockingReason?: string;
}

export interface PurgeExecutionResult {
  success: boolean;
  certificate: DataPurgeCertificate;
  destroyedKeysCount: number;
  sanitizedBytesEstimate: number;
  message: string;
}

export interface PurgeLedgerOverview {
  totalPurgedPatients: number;
  totalRecordsDestroyed: number;
  totalCertificatesIssued: number;
  eligibleCandidatesCount: number;
  blockedBy5YearRuleCount: number;
  recentCertificates: DataPurgeCertificate[];
}

export interface PurgeProofVerificationResult {
  valid: boolean;
  status: PurgeProofVerificationStatus;
  certificateId?: string;
  patientBlindIndex?: string;
  purgedAt?: string;
  purgeReason?: PurgeReason;
  purgeMethod?: PurgeMethod;
  recordsDestroyedCount?: number;
  canonicalProofHash?: string;
  message: string;
  verifiedAt: string;
}

/**
 * 26. FEDERAÇÃO DE IDENTIDADES DESCENTRALIZADAS (DID) & CREDENCIAIS VERIFICÁVEIS (RFC-001 §3.5)
 */

export interface W3CVerificationMethod {
  id: string; // Ex: did:terapiainfoco:crp-06-123456#key-1
  type: string; // Ex: Ed25519VerificationKey2020 ou JsonWebKey2020
  controller: string; // Ex: did:terapiainfoco:crp-06-123456
  publicKeyMultibase?: string;
  publicKeyJwk?: {
    kty: string;
    crv?: string;
    x?: string;
    y?: string;
    alg?: string;
    use?: string;
  };
}

export interface W3CDidDocument {
  '@context': string[];
  id: string; // Ex: did:terapiainfoco:crp-06-123456 ou did:key:z...
  verificationMethod: W3CVerificationMethod[];
  authentication: string[];
  assertionMethod: string[];
  service?: Array<{
    id: string;
    type: string;
    serviceEndpoint: string;
  }>;
  created: string;
  updated?: string;
  active: boolean;
}

export interface ClinicalCredentialSubject {
  id: string; // DID do sujeito ou URN de Blind Index do paciente (urn:terapiainfoco:blind:...)
  therapistCrp: string;
  therapistName: string;
  patientBlindIndex?: string;
  patientNameMasked?: string;
  clinicalSpecialty?: string;
  referralReason?: string;
  targetSpecialistType?: string; // PSIQUIATRA, NEUROLOGISTA, ASSISTENTE_SOCIAL, NUTRICIONISTA
  cidOrCid11Category?: string; // Opcional / consentido
  cfpResolutionCompliance: string; // Ex: "Resolução CFP nº 006/2019"
  cfpComplianceAssertion?: string; // Alias para exibição em modais
  additionalClaims?: Record<string, any>;
}

export interface W3CDataIntegrityProof {
  type: string; // Ed25519Signature2020 ou DataIntegrityProof
  created: string;
  verificationMethod: string; // Ex: did:terapiainfoco:crp-06-123456#key-1
  proofPurpose: string; // assertionMethod
  proofValue: string; // Assinatura Base64URL
  canonicalHash: string; // SHA-256 canônico JCS (RFC 8785)
}

export interface W3CVerifiableCredential {
  '@context': string[];
  id: string; // URN ou URI única: urn:uuid:...
  type: string[]; // ['VerifiableCredential', 'ClinicalReferralCredential', ...]
  issuer: string; // DID do emissor (did:terapiainfoco:crp-...)
  issuanceDate: string;
  expirationDate?: string;
  credentialSubject: ClinicalCredentialSubject;
  credentialStatus?: {
    id: string;
    type: string;
    status: CredentialRevocationStatus;
  };
  proof: W3CDataIntegrityProof;
  jwtRepresentation?: string;
}

export interface W3CVerifiablePresentation {
  '@context': string[];
  id: string;
  type: string[];
  verifiableCredential: W3CVerifiableCredential[];
  holder: string; // DID do apresentador
  proof: W3CDataIntegrityProof;
}

export interface DidFederationOverview {
  totalFederatedTherapists: number;
  totalIssuedCredentials: number;
  totalVerifiedCredentials: number;
  activeCredentialsCount: number;
  revokedCredentialsCount: number;
  supportedDidMethods: ClinicalDidMethod[];
  recentCredentials: W3CVerifiableCredential[];
}

export interface VerifiableCredentialVerificationResult {
  valid: boolean;
  status: DidVerificationStatus;
  credentialId?: string;
  issuerDid?: string;
  subjectDid?: string;
  credentialType?: string[];
  issuedAt?: string;
  expiresAt?: string;
  tamperingDetected: boolean;
  revocationStatus: CredentialRevocationStatus;
  message: string;
  verifiedAt: string;
}

/**
 * Evento individual de acesso clínico para análise comportamental UEBA (RFC-001 §4.4)
 */
export interface UebaAccessEvent {
  eventId: string;
  userId: string;
  therapistCrp?: string;
  userRole: string;
  patientId?: string;
  patientBlindIndex?: string;
  resourceType: 'CLINICAL_RECORD' | 'SOAP_NOTE' | 'PATIENT_PROFILE' | 'TRANSCRIPT' | 'DOCUMENT' | 'BLIND_INDEX_SEARCH';
  actionType: 'READ' | 'EXPORT' | 'BULK_READ' | 'SEARCH' | 'PRINT';
  ipAddress: string;
  userAgent: string;
  locationCountry?: string;
  timestamp: string; // ISO 8601
  hourOfDay: number; // 0 a 23
  dayOfWeek: number; // 0 (Domingo) a 6 (Sábado)
  recordsAccessedCount: number;
}

/**
 * Baseline comportamental aprendido para um usuário/terapeuta
 */
export interface UebaUserProfileBaseline {
  userId: string;
  therapistCrp?: string;
  usualHoursStart: number; // Ex: 8 (08:00)
  usualHoursEnd: number;   // Ex: 20 (20:00)
  usualDaysOfWeek: number[]; // Ex: [1, 2, 3, 4, 5] (Segunda a Sexta)
  avgEventsPerHour: number;
  stdDevEventsPerHour: number;
  maxEventsPerMinuteLimit: number;
  usualIpPrefixes: string[]; // Ex: ["189.40.", "177.18."]
  usualCountries: string[];  // Ex: ["BR"]
  totalLearnedEvents: number;
  lastUpdatedAt: string;
  modelConfidenceScore: number; // 0 a 100%
}

/**
 * Avaliação preditiva de risco gerada pelo motor UEBA
 */
export interface UebaRiskAssessment {
  riskScore: number; // 0 a 100
  riskLevel: UebaRiskLevel;
  detectedAnomalies: Array<{
    type: UebaAnomalyType;
    description: string;
    severityScore: number;
    evidence: Record<string, any>;
  }>;
  recommendedAction: UebaContainmentAction;
  evaluatedAt: string;
  canonicalHash: string; // SHA-256 canônico JCS da avaliação
}

/**
 * Incidente registrado na trilha de auditoria comportamental WORM
 */
export interface UebaAnomalyIncident {
  incidentId: string;
  userId: string;
  therapistCrp?: string;
  timestamp: string;
  riskScore: number;
  riskLevel: UebaRiskLevel;
  anomalies: UebaAnomalyType[];
  anomalyDetails: Array<{
    type: UebaAnomalyType;
    description: string;
    severityScore: number;
  }>;
  triggerEvent: UebaAccessEvent;
  containmentAction: UebaContainmentAction;
  containmentStatus: UebaContainmentStatus;
  proofSeal: string; // ueba_v1_<base64url>
  wormAuditLogId?: string;
  notes?: string;
  releasedAt?: string;
  releasedBy?: string;
}

/**
 * Visão Geral Executiva de Governança Comportamental UEBA
 */
export interface UebaSystemOverview {
  avgRiskScore: number;
  totalEvaluatedEvents: number;
  totalAnomaliesDetected: number;
  criticalIncidentsBlocked: number;
  activeContainedSessionsCount: number;
  activeBaselinesCount: number;
  riskDistribution: {
    normal: number;
    suspicious: number;
    anomalous: number;
    highRisk: number;
    critical: number;
  };
  recentIncidents: UebaAnomalyIncident[];
}

/**
 * 32. PROTOCOLO CRIPTOGRÁFICO DE PRIVACIDADE DIFERENCIAL (ε-DP) & BENCHMARKS EPIDEMIOLÓGICOS (LGPD Art. 13 & CFP nº 001/2009)
 */

/**
 * Projeto de Pesquisa Científica / Epidemiológica com Cota de Privacidade
 */
export interface DpResearchProject {
  projectId: string;
  title: string;
  researcherName: string;
  institution: string;
  cepProtocol: string; // Registro no Comitê de Ética em Pesquisa (ex: CEP-CONEP/2026-9481)
  purpose: string;
  totalEpsilonBudget: number; // Ex: 2.0 ε
  spentEpsilonBudget: number;
  remainingEpsilonBudget: number;
  deltaBudget: number; // Ex: 1e-5
  status: DpResearchStatus;
  approvedByDpo: string;
  createdAt: string;
  lastQueryAt?: string;
}

/**
 * Parâmetros de Execução de Consulta Estatística Diferencial
 */
export interface DpQueryParameter {
  metric: DpCohortMetric;
  queryType: DpQueryType;
  epsilon: number; // Orçamento gasto nesta consulta específica
  mechanism: DpMechanism;
  clampingLowerBound?: number; // Limite inferior para truncamento de sensibilidade
  clampingUpperBound?: number; // Limite superior para truncamento de sensibilidade
}

/**
 * Resultado Criptograficamente Protegido com Garantia Matemática de Privacidade
 */
export interface DpQueryResult {
  queryId: string;
  projectId: string;
  metric: DpCohortMetric;
  queryType: DpQueryType;
  mechanism: DpMechanism;
  epsilonUsed: number;
  deltaUsed?: number;
  clampingBounds: { lower: number; upper: number };
  sensitivity: number;
  noiseScale: number; // Parâmetro de escala de ruído (ex: b = Δf / ε)
  rawExactValue: number | Record<string, number>; // Disponível apenas no enclave interno
  noisyProtectedValue: number | Record<string, number>; // Valor público entregue ao pesquisador
  exactValueSha256: string; // Hash determinístico canônico do valor real sem revelar o segredo
  privacyGuarantee: string; // Ex: "e^ε = 1.649x bounded likelihood ratio"
  sampleCohortSize: number;
  executedAt: string;
  proofSeal: string; // dp_v1_<base64url>
}

/**
 * Resultado da Verificação Pericial da Prova Notarial de Privacidade Diferencial
 */
export interface DpProofVerification {
  isValid: boolean;
  proofSeal: string;
  queryId: string;
  projectId: string;
  mechanism: DpMechanism;
  epsilon: number;
  theoreticalMaxDistortion: number;
  verifiedAt: string;
  details: string;
}

/**
 * Benchmark Epidemiológico Consolidado de Saúde Mental
 */
export interface DpEpidemiologicalBenchmark {
  benchmarkId: string;
  title: string;
  cohortTotal: number;
  metrics: Array<{
    key: string;
    label: string;
    noisyValue: number;
    unit: string;
    epsilonAllocated: number;
    mechanism: DpMechanism;
  }>;
  generatedAt: string;
  proofSeal: string;
}

/**
 * Visão Geral Executiva de Governança de Privacidade Diferencial
 */
export interface DpSystemOverview {
  totalResearchProjects: number;
  totalQueriesExecuted: number;
  aggregateEpsilonBudget: number;
  aggregateEpsilonConsumed: number;
  averageEpsilonPerQuery: number;
  privacyBudgetHealth: DpBudgetStatus;
  recentQueries: DpQueryResult[];
  activeProjects: DpResearchProject[];
}

/**
 * 33. GESTÃO SEGURA DE SESSÕES CLÍNICAS, TOKEN BINDING CRIPTOGRÁFICO (DPoP) & CONCORRÊNCIA (RFC-001 §4.4 & OWASP ASVS)
 */

/**
 * Representação de Sessão Clínica Ativa do Terapeuta / Usuário
 */
export interface ClinicalActiveSession {
  sessionId: string;
  userId: string;
  therapistCrp?: string;
  deviceType: SessionDeviceType;
  deviceName: string; // Ex: "MacBook Pro 16\" (macOS / Chrome 129)"
  ipAddress: string;
  location: string;   // Ex: "Belo Horizonte, MG - BR"
  bindingMode: SessionBindingMode;
  clientJkt?: string; // JWK SHA-256 Thumbprint (RFC 7638 / RFC 9449)
  status: SessionLifecycleStatus;
  createdAt: string;
  lastActivityAt: string;
  isCurrentDevice: boolean;
  revokedAt?: string;
  revocationReason?: string;
  revocationProofSeal?: string; // session_rev_v1_<base64url>
}

/**
 * Payload estruturado de Prova de Posse DPoP (RFC 9449)
 */
export interface DpopProofPayload {
  jti: string;
  htm: string; // Método HTTP (GET, POST, etc.)
  htu: string; // URI HTTP completa
  iat: number; // Timestamp Unix em segundos
  ath?: string; // Access Token Hash (SHA-256 Base64URL)
}

/**
 * Resultado da Validação Criptográfica de Token Binding DPoP
 */
export interface DpopVerificationResult {
  isValid: boolean;
  clientThumbprint: string;
  error?: string;
  verifiedAt: string;
  claims?: DpopProofPayload;
}

/**
 * Resultado da Verificação Pericial do Selo de Revogação de Sessão
 */
export interface SessionRevocationProof {
  isValid: boolean;
  proofSeal: string;
  sessionId: string;
  userId: string;
  reason: string;
  revokedAt: string;
  details: string;
}

/**
 * Visão Geral Executiva de Governança de Sessões e Dispositivos
 */
export interface SessionManagementOverview {
  totalActiveSessions: number;
  totalProtectedUsers: number;
  dpopBoundPercentage: number;
  concurrencyLimitPerTherapist: number;
  recentRevocationsCount: number;
  activeSessions: ClinicalActiveSession[];
}

/**
 * 34. PREVENÇÃO DE FORÇA BRUTA & POW CRIPTOGRÁFICO (RFC-001 §4.4, OWASP OAT-007/008 & NIST SP 800-63B)
 */
export interface PowChallenge {
  challengeId: string;
  salt: string;
  difficulty: number;
  tier: import('./enums').PowDifficultyTier;
  createdAt: string;
  expiresAt: string;
  hmacSignature: string;
  clientIp?: string;
}

export interface PowVerificationResult {
  isValid: boolean;
  difficulty: number;
  computedHash?: string;
  verifiedAt: string;
  error?: string;
}

export interface BruteForceIpReputation {
  ipAddress: string;
  failedAttemptsCount: number;
  lastAttemptAt: string;
  currentDifficultyTier: import('./enums').PowDifficultyTier;
  isBlocked: boolean;
  blockedUntil?: string;
  threatCategory?: import('./enums').BruteForceThreatCategory;
  lastProofSeal?: string;
}

export interface PowDefenseOverview {
  totalChallengesIssued: number;
  totalChallengesSolved: number;
  automatedAttacksMitigated: number;
  activeIpQuarantinesCount: number;
  currentSystemThreatLevel: 'LOW' | 'ELEVATED' | 'CRITICAL';
  averageSolveTimeMs: number;
  recentIpIncidents: BruteForceIpReputation[];
}

export interface PowDefenseProof {
  isValid: boolean;
  proofSeal: string;
  challengeId: string;
  clientIp: string;
  difficulty: number;
  verifiedAt: string;
  details: string;
}

/**
 * 33. MODELOS DE ANTI-AUTOMAÇÃO, HONEYPOT DINÂMICO & TARPIT CRIPTOGRÁFICO
 * (OWASP OAT-011 / OAT-020 & RFC-001 §4.4, §5.2)
 */

export interface HoneypotTrapConfig {
  trapId: string;
  token: string;
  routePath: string;
  expiresAt: string;
  clientIp?: string;
  triggerCount: number;
  createdAt: string;
}

export interface ScraperIncidentRecord {
  id: string;
  ipAddress: string;
  threatCategory: import('./enums').ScraperThreatCategory;
  status: import('./enums').TarpitDefenseStatus;
  userAgent?: string;
  detectedVectors: string[];
  threatScore: number;
  tarpitDelayMs: number;
  totalTrapsTriggered: number;
  bandwidthSavedBytes: number;
  firstSeenAt: string;
  lastSeenAt: string;
  blockedUntil?: string;
  proofSeal?: string;
}

export interface TarpitMetricsOverview {
  totalTrappedCrawlersCount: number;
  totalHoneypotsTriggered: number;
  totalTarpitTimeSpentMs: number;
  bandwidthSavedKb: number;
  isolatedIpsCount: number;
  activeHoneypotsCount: number;
  currentThreatIndex: 'NORMAL' | 'ELEVATED' | 'HIGH';
  recentIncidents: ScraperIncidentRecord[];
  activeTraps: HoneypotTrapConfig[];
}

export interface TarpitDefenseProof {
  isValid: boolean;
  proofSeal: string;
  trapId: string;
  clientIp: string;
  threatCategory: import('./enums').ScraperThreatCategory;
  delayMs: number;
  trappedAt: string;
  details: string;
}

/**
 * 34. CERTIFICAÇÃO NOTARIAL DE SESSÃO CLÍNICA & CARIMBO DO TEMPO RFC 3161 / ICP-BRASIL TSA
 * (DOC-ICP-11, MP 2.200-2/2001, CFP nº 001/2009 e RFC-001 §3.4, §3.5, §4.4)
 */

export interface ClinicalSessionMessageImprint {
  hashAlgorithm: 'sha256';
  hashAlgorithmOid: string; // '2.16.840.1.101.3.4.2.1'
  hashedMessage: string;    // SHA-256 hex dos metadados e conteúdo da sessão
}

export interface ClinicalSessionTimestampReq {
  version: number;          // 1 (RFC 3161)
  sessionId: string;
  patientBlindIndex: string;
  therapistId: string;
  therapistCrp: string;
  messageImprint: ClinicalSessionMessageImprint;
  reqPolicyOid: string;     // Ex: '2.16.76.1.4.1' (ICP-Brasil DOC-ICP-11)
  nonce: string;            // Nonce criptográfico aleatório anti-replay
  certReq: boolean;
  requestedAt: string;      // ISO-8601 UTC Zulu
}

export interface TsaCertificateInfo {
  tsaId: string;
  commonName: string;
  organization: string;
  country: string;
  serialNumber: string;
  validFrom: string;
  validTo: string;
  keyUsage: string[];
  extendedKeyUsageOid: string; // '1.3.6.1.5.5.7.3.8' (id-kp-timeStamping)
  sha256Thumbprint: string;
  authorityType: TsaAuthorityType;
}

export interface TSTInfo {
  version: number;
  policyOid: string;
  messageImprint: ClinicalSessionMessageImprint;
  serialNumber: string;
  genTime: string;          // Data e hora atestada em UTC Zulu
  accuracy: {
    seconds: number;
    millis: number;
    micros: number;
  };
  ordering: boolean;
  nonce: string;
  tsaName: string;
}

export interface ClinicalSessionTimestampToken {
  tokenId: string;          // Prefixo tst_rfc3161_...
  sessionId: string;
  patientBlindIndex: string;
  therapistCrp: string;
  tstInfo: TSTInfo;
  signature: string;        // Assinatura digital da TSA
  tsaCertificate: TsaCertificateInfo;
  status: {
    code: number;           // 0 = granted
    statusString: string;
  };
  rawTokenBase64: string;   // Token serializado base64url auditável
  wormSealHash: string;     // Hash SHA-256 selado na trilha WORM
  issuedAt: string;
}

export interface TimestampVerificationResult {
  isValid: boolean;
  status: TimestampVerificationStatus;
  sessionId: string;
  tokenId: string;
  verifiedAt: string;
  messageImprintMatch: boolean;
  signatureValid: boolean;
  nonceMatch: boolean;
  certificateValid: boolean;
  driftMilliseconds: number;
  details: string;
  wormAuditId?: string;
}

export interface TimestampNotaryMetrics {
  totalStampsIssued: number;
  validStampsCount: number;
  tamperingAttemptsBlocked: number;
  icpBrasilStampsCount: number;
  avgIssuanceLatencyMs: number;
  lastStampTimestamp?: string;
}

export interface TimestampNotaryOverview {
  metrics: TimestampNotaryMetrics;
  tsaCertificate: TsaCertificateInfo;
  recentTokens: ClinicalSessionTimestampToken[];
  activePolicyOid: string;
}

/**
 * 35. BLINDAGEM CONTRA POLUIÇÃO DE PARÂMETROS HTTP (HPP) & INJEÇÃO DE CABEÇALHOS (CRLF)
 * (OWASP Top 10 API Security & RFC-001 §4.4, §5.2)
 */

export interface HppParameterViolation {
  parameterName: string;
  values: string[];
  count: number;
  source: 'QUERY' | 'BODY' | 'FORM';
  remediation: string;
}

export interface HppInspectionResult {
  isPolluted: boolean;
  severity: HppSeverityLevel;
  violations: HppParameterViolation[];
  canonicalParams: Record<string, string>;
  analyzedAt: string;
}

export interface HeaderInjectionViolation {
  headerName: string;
  rawHeaderValue: string;
  sanitizedHeaderValue: string;
  detectedPattern: string;
  injectionType: HppAttackCategory;
  severity: HppSeverityLevel;
  remediation: string;
}

export interface HeaderInjectionInspectionResult {
  hasInjection: boolean;
  severity: HppSeverityLevel;
  violations: HeaderInjectionViolation[];
  sanitizedHeaders: Record<string, string>;
  analyzedAt: string;
}

export interface HttpGuardIncident {
  id: string;
  timestamp: string;
  clientIp: string;
  userAgent: string;
  targetEndpoint: string;
  httpMethod: string;
  category: HppAttackCategory;
  severity: HppSeverityLevel;
  actionTaken: HppDefensePolicy;
  details: string;
  proofSealToken: string;
  isBlocked: boolean;
}

export interface HttpGuardProofSeal {
  token: string;
  incidentId: string;
  timestamp: string;
  canonicalDigest: string;
  hmacSignature: string;
  issuer: string;
  targetEndpoint: string;
}

export interface HttpGuardMetrics {
  totalInspectedRequests: number;
  hppPollutionsBlocked: number;
  crlfInjectionsNeutralized: number;
  criticalEndpointsProtected: number;
  validProofSealsIssued: number;
  activeDefensePolicy: HppDefensePolicy;
  lastIncidentTimestamp?: string;
}

export interface HttpGuardOverview {
  metrics: HttpGuardMetrics;
  recentIncidents: HttpGuardIncident[];
  protectedEndpoints: Array<{
    path: string;
    methods: string[];
    strictHpp: boolean;
    preventCrlf: boolean;
    description: string;
  }>;
}

/**
 * 36. PROTOCOLO DE CIFRAGEM HOMOMÓRFICA PARCIAL (PHE - PAILLIER CRYPTOSYSTEM)
 * (LGPD Art. 13, Resolução CFP nº 001/2009 e RFC-001 §4.4, §5.2)
 */

export interface PaillierPublicKey {
  n: string;
  g: string;
  n2: string;
  bitLength: number;
  keyId: string;
  createdAt: string;
}

export interface PaillierPrivateKey {
  lambda: string;
  mu: string;
  p?: string;
  q?: string;
  n: string;
  keyId: string;
}

export interface PaillierKeyPair {
  publicKey: PaillierPublicKey;
  privateKey: PaillierPrivateKey;
}

export interface PaillierCiphertext {
  ciphertext: string;
  randomizerHash?: string;
  timestamp: string;
}

export interface Cid11Item {
  code: string;
  name: string;
  category: Cid11Category;
  description: string;
  icd10Equivalent?: string;
}

export interface PatientEncryptedCidVector {
  patientBlindIndex: string;
  encryptedValues: Record<string, string>; // cidCode -> ciphertext hex/decimal
  proofOfZeroOrOne: Record<string, string>; // Prova ZK simplificada de pertinência {0, 1}
  encryptedAt: string;
}

export interface HomomorphicCohortAggregation {
  cohortId: string;
  cohortName: string;
  totalPatients: number;
  aggregatedCiphertexts: Record<string, string>; // cidCode -> aggregated ciphertext sum
  status: HomomorphicCohortStatus;
  publicKeyId: string;
  createdAt: string;
  aggregatedAt?: string;
  decryptedAt?: string;
  proofSealToken?: string;
}

export interface HomomorphicDecryptedResult {
  cohortId: string;
  totalPatients: number;
  results: Array<{
    code: string;
    name: string;
    category: Cid11Category;
    count: number;
    prevalencePercentage: number;
  }>;
  decryptedAt: string;
  authorizedBy: string;
  ethicsApprovalCode: string;
}

export interface HomomorphicProofSeal {
  token: string;
  cohortId: string;
  canonicalDigest: string;
  hmacSignature: string;
  timestamp: string;
  totalRecords: number;
  publicKeyId: string;
  algorithm: string;
}

export interface HomomorphicMetrics {
  totalCohorts: number;
  totalPatientsHomomorphicallyProtected: number;
  totalCiphertextOperations: number;
  zeroDecryptionsWithoutAuth: number;
  activeSecurityLevel: HomomorphicSecurityLevel;
  proofSealsVerified: number;
}

export interface HomomorphicOverview {
  metrics: HomomorphicMetrics;
  cohorts: HomomorphicCohortAggregation[];
  activePublicKey: PaillierPublicKey;
  availableCidCatalog: Cid11Item[];
  recentAudits: Array<{
    id: string;
    action: string;
    timestamp: string;
    details: string;
  }>;
}

/**
 * 37. PROTEÇÃO AVANÇADA CONTRA SSRF E DNS REBINDING EM WEBHOOKS E CONECTORES EXTERNOS
 * (OWASP Top 10 API Security API8:2023, OWASP ASVS v4.0 e RFC-001 §4.4, §5.2)
 */

export interface SsrfInspectionResult {
  isSafe: boolean;
  targetUrl: string;
  normalizedUrl: string;
  parsedHost: string;
  parsedPort: number;
  parsedProtocol: string;
  resolvedIps: string[];
  pinnedIp?: string;
  detectedThreats: SsrfAttackCategory[];
  severity: SsrfSeverityLevel;
  actionTaken: SsrfDefensePolicy;
  dnsRebindingRisk: boolean;
  dnsTtlSeconds?: number;
  reason: string;
  timestamp: string;
}

export interface WebhookConnectorConfig {
  id: string;
  name: string;
  connectorType: WebhookConnectorType;
  targetUrl: string;
  pinnedIp?: string;
  strictHttpsOnly: boolean;
  allowedPorts: number[];
  defensePolicy: SsrfDefensePolicy;
  status: 'ACTIVE' | 'ISOLATED' | 'BLOCKED';
  totalInvocations: number;
  blockedAttempts: number;
  lastValidatedAt: string;
}

export interface SsrfIncident {
  id: string;
  timestamp: string;
  sourceIp: string;
  targetUrl: string;
  detectedCategories: SsrfAttackCategory[];
  severity: SsrfSeverityLevel;
  defensePolicy: SsrfDefensePolicy;
  blocked: boolean;
  dnsRebindingAttempt: boolean;
  resolvedIp?: string;
  proofSealDigest: string;
  details: string;
}

export interface SsrfProofSeal {
  token: string;
  incidentId?: string;
  urlChecked: string;
  resolvedIps: string[];
  canonicalDigest: string;
  hmacSignature: string;
  timestamp: string;
  algorithm: string;
  isSafe: boolean;
}

export interface SsrfMetrics {
  totalUrlsInspected: number;
  totalAttacksBlocked: number;
  dnsRebindingAttemptsPrevented: number;
  cloudMetadataProbesBlocked: number;
  privateSubnetProbesBlocked: number;
  activeConnectorsProtected: number;
  activeDefensePolicy: SsrfDefensePolicy;
}

export interface SsrfOverview {
  metrics: SsrfMetrics;
  connectors: WebhookConnectorConfig[];
  recentIncidents: SsrfIncident[];
  recentAudits: Array<{
    id: string;
    action: string;
    timestamp: string;
    details: string;
  }>;
}

/**
 * 38. RATE LIMITING AVANÇADO (TOKEN BUCKET + SLIDING WINDOW LOG)
 * (OWASP Top 10 API Security API4:2023 - Unrestricted Resource Consumption & RFC-001 §4.4, §5.2)
 */

export interface TokenBucketState {
  tokens: number;
  capacity: number;
  refillRatePerSecond: number;
  lastRefillTimestampMs: number;
}

export interface SlidingWindowLogEntry {
  timestampMs: number;
  weight: number;
}

export interface RateLimitRuleConfig {
  id: string;
  name: string;
  pathPattern: string;
  tier: RateLimitTier;
  algorithm: RateLimitingAlgorithm;
  bucketCapacity: number;
  refillRatePerSecond: number;
  windowSizeSeconds: number;
  maxRequestsPerWindow: number;
  burstAllowanceMultiplier: number;
  penaltyQuarantineMinutes: number;
  description: string;
}

export interface RateLimitEvaluationResult {
  decision: RateLimitDecision;
  isAllowed: boolean;
  clientId: string;
  ruleId: string;
  tier: RateLimitTier;
  remainingTokens: number;
  tokenBucketCapacity: number;
  currentWindowCount: number;
  maxWindowAllowance: number;
  retryAfterSeconds: number;
  quarantinedUntil?: string;
  reason: string;
  timestamp: string;
}

export interface RateLimitProofSeal {
  token: string;
  clientId: string;
  ruleId: string;
  decision: RateLimitDecision;
  canonicalDigest: string;
  hmacSignature: string;
  timestamp: string;
  algorithm: string;
}

export interface AdvancedRateLimitMetrics {
  totalEvaluatedRequests: number;
  totalThrottledRequests: number;
  activeQuarantinedClients: number;
  tokenBucketConsumptions: number;
  slidingWindowRejections: number;
  activeRulesCount: number;
}

export interface AdvancedRateLimitOverview {
  metrics: AdvancedRateLimitMetrics;
  rules: RateLimitRuleConfig[];
  quarantinedClients: Array<{
    clientId: string;
    reason: string;
    quarantinedUntil: string;
    totalViolations: number;
  }>;
  recentAudits: Array<{
    id: string;
    action: string;
    timestamp: string;
    details: string;
  }>;
}

/**
 * 39. BLINDAGEM DE MEMÓRIA & PREVENÇÃO DE HEAP SPRAYING
 * (NIST SP 800-88 Rev. 1 & OWASP ASVS v4.0 V14.1)
 */

export interface SecureMemoryBlock {
  id: string;
  tag: string;
  byteLength: number;
  allocatedAt: string;
  state: SecureBufferState;
  sanitizationPasses: number;
  zeroizedAt?: string;
  ttlMs: number;
  expiresAt: string;
}

export interface HeapSprayingInspectionResult {
  isSprayingDetected: boolean;
  threatLevel: HeapSprayingThreatLevel;
  detectedPatterns: string[];
  entropyScore: number; // 0.0 a 8.0 bits por byte
  analyzedBytes: number;
  reason: string;
}

export interface MemoryZeroizationProofSeal {
  token: string;
  blockId: string;
  tag: string;
  byteLength: number;
  sanitizationAlgorithm: MemorySanitizationAlgorithm;
  passesCompleted: number;
  zeroizedAt: string;
  canonicalDigest: string;
  hmacSignature: string;
}

export interface SecureMemoryMetrics {
  activeAllocatedBlocks: number;
  totalBytesInSecureHeap: number;
  totalZeroizedBlocks: number;
  heapSprayingAttemptsBlocked: number;
  autoPurgedExpiredDeks: number;
  averageBlockLifespanMs: number;
}

export interface SecureMemoryOverview {
  metrics: SecureMemoryMetrics;
  activeBlocks: SecureMemoryBlock[];
  recentZeroizationSeals: MemoryZeroizationProofSeal[];
  systemStatus: 'SHIELDED' | 'WARNING' | 'ALERT';
}

/**
 * 40. TLS CERTIFICATE PINNING & ROTAÇÃO DE CAS
 * (RFC-001 §4.4, §5.2, RFC 7469 HPKP, RFC 6698 DANE & OWASP MASVS)
 */
export interface TlsSpkiPin {
  pinId: string;
  hostname: string;
  spkiSha256: string; // Ex: pin-sha256="WoiWRyIOVNa9ihaBciRSC7XHjliYS9VwUGOIud4PB18="
  strategy: TlsPinningStrategy;
  type: 'PRIMARY' | 'BACKUP_ROTATION' | 'EMERGENCY_RECOVERY';
  caIssuer: string;
  subjectCommonName: string;
  validFrom: string;
  validTo: string;
  createdAt: string;
  lastVerifiedAt?: string;
}

export interface X509CertInspection {
  fingerprintSha256: string;
  spkiSha256: string;
  subjectCN: string;
  subjectAltNames: string[];
  issuerCN: string;
  validFrom: string;
  validTo: string;
  serialNumber: string;
  signatureAlgorithm: string;
  publicKeyBitLength: number;
}

export interface TlsPinProofSeal {
  sealId: string;
  token: string;
  canonicalDigest: string;
  hmacSignature: string;
  issuedAt: string;
  status: TlsPinValidationStatus;
  hostname: string;
  matchedPinId?: string;
}

export interface TlsPinValidationResult {
  evaluationId: string;
  hostname: string;
  status: TlsPinValidationStatus;
  policyMode: TlsPinPolicyMode;
  matchedPin?: TlsSpkiPin;
  presentedCertificate: X509CertInspection;
  chainValid: boolean;
  threatLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL_MITM';
  mitmSignaturesDetected: string[];
  recommendation: string;
  timestamp: string;
  proofSeal: TlsPinProofSeal;
}

export interface TlsPinningMetrics {
  activePinsCount: number;
  primaryPinsCount: number;
  backupPinsCount: number;
  verifications24h: number;
  mitmBlockedCount: number;
  caRotationsCount: number;
  compromisedCAsQuarantined: number;
  enforceModeEnabled: boolean;
}

export interface TlsPinningOverview {
  metrics: TlsPinningMetrics;
  pins: TlsSpkiPin[];
  recentVerifications: TlsPinValidationResult[];
  quarantinedCAs: string[];
  systemStatus: 'PINNED_SECURE' | 'DEGRADED_ROTATING' | 'MITM_ATTACK_DETECTED';
}

/**
 * 41. AVALIAÇÃO CONTÍNUA DE POSTURA DE DISPOSITIVO ZERO TRUST (NIST SP 800-207 & OWASP MASVS)
 */
export interface DevicePostureTelemetry {
  platform: import('./enums').DevicePlatform;
  osName: string;
  osVersion: string;
  browser: string;
  browserVersion: string;
  isRootedOrJailbroken: boolean;
  isDebuggerPresent: boolean;
  isEmulator: boolean;
  isDiskEncrypted: boolean;
  isScreenLockEnabled: boolean;
  devToolsOpen: boolean;
  suspiciousHooksDetected: boolean;
  clockSkewSeconds: number;
  userAgent: string;
  clientIp: string;
}

export interface DevicePostureViolation {
  id: string;
  category: import('./enums').DeviceViolationCategory;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  remediation: string;
  detectedAt: string;
}

export interface DevicePostureProofSeal {
  sealId: string;
  token: string; // posture_proof_v1_<base64url>
  canonicalDigest: string;
  hmacSignature: string;
  issuedAt: string;
  assessmentId: string;
  deviceId: string;
  trustScore: number;
  trustTier: import('./enums').DeviceTrustTier;
}

export interface DevicePostureAssessmentResult {
  assessmentId: string;
  deviceId: string;
  deviceName: string;
  therapistId: string;
  trustScore: number;
  trustTier: import('./enums').DeviceTrustTier;
  decision: import('./enums').DevicePostureDecision;
  activePolicy: import('./enums').DevicePostureEnforcementPolicy;
  violations: DevicePostureViolation[];
  telemetry: DevicePostureTelemetry;
  proofSeal: DevicePostureProofSeal;
  assessedAt: string;
}

export interface DevicePostureRecord {
  deviceId: string;
  deviceName: string;
  therapistId: string;
  platform: import('./enums').DevicePlatform;
  isQuarantined: boolean;
  quarantineReason?: string;
  quarantinedAt?: string;
  quarantinedBy?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  latestTrustScore: number;
  latestTrustTier: import('./enums').DeviceTrustTier;
  latestDecision: import('./enums').DevicePostureDecision;
}

export interface DevicePostureMetrics {
  totalDevicesMonitored: number;
  trustedCount: number;
  monitoredCount: number;
  riskyCount: number;
  blockedCount: number;
  activeQuarantinesCount: number;
  averageTrustScore: number;
  violationsBlocked24h: number;
}

export interface DevicePostureOverview {
  metrics: DevicePostureMetrics;
  activePolicy: import('./enums').DevicePostureEnforcementPolicy;
  registeredDevices: DevicePostureRecord[];
  recentAssessments: DevicePostureAssessmentResult[];
  systemHealth: 'COMPLIANT' | 'DEGRADED' | 'THREAT_CONTAINMENT';
}

/**
 * 36. CRIPTOGRAFIA PÓS-QUÂNTICA HÍBRIDA (NIST FIPS 203 ML-KEM & FIPS 204 ML-DSA)
 */
export interface PqcPublicKeyBundle {
  classicalPublicKeyPem: string;   // ECDH P-256 (ou X25519)
  pqKemPublicKeyBase64: string;    // ML-KEM-768 ou ML-KEM-1024
  classicalVerifyKeyPem: string;   // ECDSA P-256
  pqDsaPublicKeyBase64: string;    // ML-DSA-65 ou ML-DSA-87
  kemScheme: import('./enums').PqcKemScheme;
  dsaScheme: import('./enums').PqcDsaScheme;
  keyId: string;
  createdAt: string;
}

export interface PqcPrivateKeyBundle {
  classicalPrivateKeyPem: string;
  pqKemPrivateKeyBase64: string;
  classicalSignKeyPem: string;
  pqDsaPrivateKeyBase64: string;
  keyId: string;
}

export interface PqcHybridKeyPair {
  keyId: string;
  alias: string;
  securityLevel: import('./enums').PqcSecurityLevel;
  kemScheme: import('./enums').PqcKemScheme;
  dsaScheme: import('./enums').PqcDsaScheme;
  publicKey: PqcPublicKeyBundle;
  privateKey?: PqcPrivateKeyBundle;
  createdAt: string;
}

export interface PqcEncapsulationResult {
  keyId: string;
  sharedSecretHex: string;          // DEK canônica de 256 bits derivada via HKDF-SHA256 (SS_classical || SS_pq)
  classicalCiphertextPem: string;   // Chave efêmera pública ECDH
  pqCiphertextBase64: string;       // Texto cifrado do reticulado ML-KEM
  kemScheme: import('./enums').PqcKemScheme;
  encapsulatedAt: string;
}

export interface PqcHybridSignatureResult {
  keyId: string;
  documentDigestHex: string;        // SHA-256 do documento clínico
  classicalSignatureHex: string;    // Assinatura ECDSA P-256 (ICP-Brasil/DOC-ICP-15)
  pqSignatureBase64: string;        // Assinatura digital por reticulados ML-DSA
  dsaScheme: import('./enums').PqcDsaScheme;
  signedAt: string;
}

export interface PqcSignatureVerificationResult {
  isValid: boolean;
  classicalSignatureValid: boolean;
  pqSignatureValid: boolean;
  hybridValid: boolean;
  signerKeyId: string;
  evaluatedAt: string;
  message: string;
}

export interface PqcProofSeal {
  sealToken: string;                // formato 'pqc_proof_v1_<base64url>'
  canonicalDigest: string;          // Digest SHA-256 canônico JCS (RFC 8785)
  hmacSignature: string;            // Assinatura HMAC-SHA256 anti-tampering WORM
  issuedAt: string;
  operationId: string;
  targetType: import('./enums').PqcClinicalTargetType;
  hybridMode: import('./enums').PqcHybridMode;
}

export interface PqcProtectedClinicalRecord {
  id: string;
  targetType: import('./enums').PqcClinicalTargetType;
  title: string;
  patientBlindIndex: string;
  therapistId: string;
  ciphertextBase64: string;         // AES-256-GCM com a DEK híbrida
  ivHex: string;
  authTagHex: string;
  encapsulation: PqcEncapsulationResult;
  signature: PqcHybridSignatureResult;
  proofSeal: PqcProofSeal;
  createdAt: string;
  quantumSafe: boolean;
}

export interface PqcQuantumAttackSimulationResult {
  simulationId: string;
  attackType: import('./enums').PqcQuantumAttackType;
  targetRecordId: string;
  outcome: import('./enums').PqcDefenseOutcome;
  classicalCracked: boolean;
  postQuantumCracked: boolean;
  dataExfiltrated: boolean;
  explanation: string;
  proofSeal: PqcProofSeal;
  simulatedAt: string;
}

export interface PqcMetrics {
  totalProtectedRecords: number;
  activeKeyPairsCount: number;
  hybridEncapsulationsCount: number;
  hybridSignaturesCount: number;
  quantumSimulationsRun: number;
  sndlAttacksNeutralized: number;
  averageKdfLatencyMs: number;
}

export interface PqcOverview {
  metrics: PqcMetrics;
  activeHybridKeyPair: PqcHybridKeyPair;
  availableKeyPairs: PqcHybridKeyPair[];
  protectedRecords: PqcProtectedClinicalRecord[];
  recentSimulations: PqcQuantumAttackSimulationResult[];
  defaultSecurityLevel: import('./enums').PqcSecurityLevel;
  systemHealth: 'QUANTUM_SAFE' | 'TRANSITIONING' | 'AT_RISK';
}

// ============================================================================
// Módulo de Assinatura Cega RSA/ECDSA (Blind Signatures / Chaumian Protocol)
// LGPD Art. 13 & Resolução CFP nº 001/2009 & RFC 9474
// ============================================================================

export interface BlindSignaturePublicKey {
  keyId: string;
  scheme: import('./enums').BlindSignatureScheme;
  modulusHex: string;               // N (Módulo RSA em hexadecimal)
  publicExponentHex: string;         // e (Expoente público em hexadecimal, ex: 010001 = 65537)
  authorityName: string;            // Ex: "Comitê de Ética e Fiscalização do CRP-06 / TerapiaInFoco"
  authorityRole: string;            // Ex: "AUTORIDADE_EMISSORA_COLEGIADO"
  fingerprint: string;              // SHA-256 da chave pública
  createdAt: string;
  expiresAt: string;
}

export interface BlindSignaturePrivateKey {
  keyId: string;
  privateExponentHex: string;        // d (Expoente privado em hexadecimal - retido no enclave)
}

export interface BlindSignatureKeyPair {
  publicKey: BlindSignaturePublicKey;
  privateKey?: BlindSignaturePrivateKey;
}

export interface BlindSignatureBlindedMessage {
  blindedMessageHex: string;        // m' = (h * r^e) mod N
  blindingFactorHex?: string;       // r (segredo retido no cliente para descegamento)
  messageDigestHex: string;         // h = H(m)
  originalMessage: string;          // m (conteúdo original: voto, voucher, prescrição)
  purpose: import('./enums').BlindSignaturePurpose;
  authorityKeyId: string;
  scheme: import('./enums').BlindSignatureScheme;
  createdAt: string;
}

export interface BlindSignatureSignedResponse {
  blindSignatureHex: string;        // s' = (m')^d mod N
  authorityKeyId: string;
  scheme: import('./enums').BlindSignatureScheme;
  signedAt: string;
}

export interface BlindSignatureUnblindedToken {
  tokenId: string;
  originalMessage: string;          // m
  messageDigestHex: string;         // h
  unblindedSignatureHex: string;    // s = (s' * r^-1) mod N
  nullifierHash: string;            // H(token || s) - impede double-spending
  purpose: import('./enums').BlindSignaturePurpose;
  authorityKeyId: string;
  scheme: import('./enums').BlindSignatureScheme;
  status: import('./enums').BlindSignatureStatus;
  issuedAt: string;
}

export interface BlindSignatureProofSeal {
  sealToken: string;
  canonicalDigest: string;          // Digest SHA-256 canônico JCS (RFC 8785)
  hmacSignature: string;            // Assinatura HMAC-SHA256 WORM
  issuedAt: string;
  operationId: string;
  purpose: import('./enums').BlindSignaturePurpose;
  scheme: import('./enums').BlindSignatureScheme;
}

export interface BlindSignatureVerificationResult {
  valid: boolean;
  mathematicalProofValid: boolean;  // s^e mod N == h mod N
  authorityVerified: boolean;
  doubleSpendDetected: boolean;
  nullifier: string;
  purpose: import('./enums').BlindSignaturePurpose;
  scheme: import('./enums').BlindSignatureScheme;
  publicFaithAttestation: string;   // Atestado formal de fé pública
  unlinkedClientGuaranteed: boolean; // 100% matematicamente desvinculado
  proofSeal: BlindSignatureProofSeal;
  verifiedAt: string;
  message: string;
}

export interface BlindSignatureBallotItem {
  id: string;
  caseNumber: string;               // Ex: "PROCESSO-DISCIPLINAR-CFP-2026-441"
  caseTitle: string;
  decision: import('./enums').BlindBallotDecision;
  unblindedSignatureHex: string;
  nullifierHash: string;
  verifiedPublicFaith: boolean;
  castAt: string;
}

export interface BlindSignatureReferralVoucher {
  id: string;
  voucherCode: string;              // Código público seguro para farmácia / CAPS
  medicalSpecialty: string;         // Ex: "Psiquiatria da Infância e Adolescência"
  urgencyLevel: 'NORMAL' | 'URGENTE' | 'EMERGENCIAL_CAPS';
  serviceCategory: string;          // Ex: "Prescrição Digital Controlada / Parecer Clínico"
  unblindedSignatureHex: string;
  nullifierHash: string;
  redeemed: boolean;
  issuedAt: string;
  redeemedAt?: string;
}

export interface BlindSignatureRedemptionResult {
  success: boolean;
  tokenId: string;
  nullifierHash: string;
  purpose: import('./enums').BlindSignaturePurpose;
  recordedItem: BlindSignatureBallotItem | BlindSignatureReferralVoucher;
  proofSeal: BlindSignatureProofSeal;
  message: string;
}

export interface BlindSignatureMetrics {
  totalBlindedTokens: number;
  totalSignedTokens: number;
  totalUnblindedTokens: number;
  totalRedeemedTokens: number;
  totalDoubleSpendBlocked: number;
  ethicalBallotsCount: number;
  vouchersRedeemedCount: number;
  averageOperationLatencyMs: number;
}

export interface BlindSignatureOverview {
  metrics: BlindSignatureMetrics;
  activeAuthorityKey: BlindSignaturePublicKey;
  availableKeys: BlindSignaturePublicKey[];
  recentBallots: BlindSignatureBallotItem[];
  recentVouchers: BlindSignatureReferralVoucher[];
  systemHealth: 'OPERATIONAL' | 'DEGRADED' | 'WARNING';
}

// ============================================================================
// Módulo de Proteção Criptográfica contra Side-Channel e Timing Attacks
// NIST SP 800-38D, RFC-001 §4.2, §4.4 & OWASP Top 10 API Security
// ============================================================================

export interface SideChannelInspectionResult {
  id: string;
  targetOperation: import('./enums').SideChannelTargetOperation;
  constantTimeGuaranteed: boolean;
  meanDurationNs: number;
  varianceNs: number;
  deltaTimingNs: number;             // Diferença absoluta entre caso A (válido) e B (inválido)
  jitterInjectedMs: number;          // Jitter estocástico regulado adicionado
  vulnerabilityLevel: import('./enums').SideChannelVulnerabilityLevel;
  welchTScore: number;               // Estatística t de Welch (|t| < 4.5 NIST)
  explanation: string;
  inspectedAt: string;
}

export interface WelchTTestSampleData {
  sampleCountA: number;             // Quantidade de amostras com input válido
  sampleCountB: number;             // Quantidade de amostras com input incorreto
  meanDurationNsA: number;          // Tempo médio em nanossegundos (Grupo A)
  meanDurationNsB: number;          // Tempo médio em nanossegundos (Grupo B)
  stdDevA: number;                  // Desvio-padrão amostral (Grupo A)
  stdDevB: number;                  // Desvio-padrão amostral (Grupo B)
  degreesOfFreedom: number;         // Graus de liberdade (Welch-Satterthwaite)
  tScore: number;                   // Valor |t| estatístico
  pValEstimate: number;             // Valor-p estimado
  nistCompliant: boolean;           // True se |t| < 4.5
  vulnerabilityLevel: import('./enums').SideChannelVulnerabilityLevel;
  explanation: string;
}

export interface SideChannelProofSeal {
  sealToken: string;
  canonicalDigest: string;          // Digest SHA-256 canônico JCS (RFC 8785)
  hmacSignature: string;            // Assinatura HMAC-SHA256 WORM
  issuedAt: string;
  operationId: string;
  targetOperation: import('./enums').SideChannelTargetOperation;
  mode: import('./enums').SideChannelProtectionMode;
}

export interface SideChannelBenchmarkReport {
  id: string;
  targetOperation: import('./enums').SideChannelTargetOperation;
  protectionMode: import('./enums').SideChannelProtectionMode;
  welchTest: WelchTTestSampleData;
  isTimingSafe: boolean;
  proofSeal: SideChannelProofSeal;
  generatedAt: string;
}

export interface SideChannelMetrics {
  totalInspectionsCount: number;
  timingLeaksBlockedCount: number;
  constantTimeVerificationsCount: number;
  activeJitterTargetMs: number;
  averageWelchTScore: number;
  systemHealth: 'IMMUNE' | 'HARDENED' | 'MONITORING';
}

export interface SideChannelOverview {
  metrics: SideChannelMetrics;
  activeProtectionMode: import('./enums').SideChannelProtectionMode;
  recentInspections: SideChannelInspectionResult[];
  recentBenchmarks: SideChannelBenchmarkReport[];
  availableOperations: import('./enums').SideChannelTargetOperation[];
}

// ============================================================================
// Modelos: Proteção contra Ataques de Replay & Reutilização de Nonce (RFC 8446/9147)
// ============================================================================

export interface AntiReplayProofSeal {
  sealToken: string;
  canonicalDigest: string;          // Digest SHA-256 canônico JCS (RFC 8785)
  hmacSignature: string;            // Assinatura HMAC-SHA256 WORM
  issuedAt: string;
  verificationId: string;
  protocol: import('./enums').ReplayTargetProtocol;
  mode: import('./enums').ReplayDefenseMode;
}

export interface ReplayVerificationResult {
  id: string;
  targetProtocol: import('./enums').ReplayTargetProtocol;
  nonceOrSeq: string;
  allowed: boolean;
  severity: import('./enums').ReplayThreatSeverity;
  reason: string;
  slidingWindowPosition?: {
    sequenceNumber: number;
    highestSequence: number;
    windowSize: number;
    inWindow: boolean;
    bitIndex: number;
  };
  bloomFilterMatch?: boolean;
  proofSeal?: AntiReplayProofSeal;
  evaluatedAt: string;
}

export interface SlidingWindowStatus {
  channelId: string;
  windowSize: number;
  highestSequenceNumber: number;
  lowestAcceptableSequenceNumber: number;
  bitmapHex: string;
  packetsAccepted: number;
  packetsReplayed: number;
  packetsOutOfWindow: number;
  lastUpdated: string;
}

export interface BloomFilterMetrics {
  capacity: number;
  elementCount: number;
  hashFunctionsCount: number;
  falsePositiveProbability: number;
  saturationPercentage: number;
  activeGeneration: number;
  lastRotatedAt: string;
  totalNoncesEvaluated: number;
  totalReplaysBlocked: number;
}

export interface ReplayIncidentRecord {
  id: string;
  protocol: import('./enums').ReplayTargetProtocol;
  nonceOrSeq: string;
  sourceIp: string;
  severity: import('./enums').ReplayThreatSeverity;
  actionTaken: string;
  proofSeal: AntiReplayProofSeal;
  timestamp: string;
}

export interface AntiReplayMetrics {
  totalVerificationsCount: number;
  replaysBlockedCount: number;
  nonceReusesBlockedCount: number;
  activeSlidingWindowsCount: number;
  bloomFilterSaturation: number;
  systemHealth: 'PROTECTED' | 'WARNING' | 'COMPROMISED';
}

export interface AntiReplayOverview {
  metrics: AntiReplayMetrics;
  activeMode: import('./enums').ReplayDefenseMode;
  bloomMetrics: BloomFilterMetrics;
  activeWindows: SlidingWindowStatus[];
  recentIncidents: ReplayIncidentRecord[];
}

// ============================================================================
// Modelos: Marcação D'água Esteganográfica Visual e Traçabilidade Forense (LGPD Art. 46 & CFP 011/2018)
// ============================================================================

export interface VisualWatermarkSeed {
  seedId: string;
  therapistCrp: string;
  patientBlindIndex: string;
  patientIdMasked: string;
  sessionId: string;
  patternType: import('./enums').WatermarkPatternType;
  strength: import('./enums').WatermarkEmbeddingStrength;
  target: import('./enums').VisualWatermarkTarget;
  issuedAt: string;
  saltHex: string;
}

export interface VisualWatermarkProofSeal {
  sealToken: string;
  canonicalDigest: string;          // Digest SHA-256 canônico JCS (RFC 8785)
  hmacSignature: string;            // Assinatura HMAC-SHA256 WORM
  issuedAt: string;
  verificationId: string;
  target: import('./enums').VisualWatermarkTarget;
  patternType: import('./enums').WatermarkPatternType;
}

export interface WatermarkEmbeddingResult {
  embeddingId: string;
  seedId: string;
  psnrDb: number;                   // Peak Signal-to-Noise Ratio (dB)
  ssimScore: number;                // Structural Similarity Index (0 a 1)
  imperceptibilityGrade: 'PRISTINE' | 'EXCELLENT' | 'DEGRADED';
  canvasWidth: number;
  canvasHeight: number;
  watermarkedFramePreview?: string; // Amostra de imagem / canvas data
  proofSeal: VisualWatermarkProofSeal;
  embeddedAt: string;
}

export interface LeakExtractionResult {
  extractionId: string;
  correlationScore: number;         // Normalized Cross-Correlation NCC (-1.0 a +1.0)
  confidence: import('./enums').WatermarkExtractionConfidence;
  pProbability: number;             // p-value de probabilidade estatística de falso positivo
  identifiedSessionId?: string;
  identifiedTherapistCrp?: string;
  identifiedPatientMasked?: string;
  identifiedIpAddress?: string;
  leakTimestampEstimate?: string;
  forensicAnalysis: string;
  proofSeal: VisualWatermarkProofSeal;
  extractedAt: string;
}

export interface VisualWatermarkIncident {
  id: string;
  sourceSuspect: string;
  target: import('./enums').VisualWatermarkTarget;
  correlationScore: number;
  confidence: import('./enums').WatermarkExtractionConfidence;
  identifiedTherapistCrp: string;
  identifiedPatientMasked: string;
  proofSeal: VisualWatermarkProofSeal;
  timestamp: string;
}

export interface VisualWatermarkMetrics {
  activeWatermarkedSessionsCount: number;
  framesWatermarkedCount: number;
  leakInvestigationsCount: number;
  leaksPositivelyIdentifiedCount: number;
  averagePsnrDb: number;
  averageSsimScore: number;
  systemHealth: 'IMMUNE' | 'WARNING' | 'COMPROMISED';
}

export interface VisualWatermarkOverview {
  metrics: VisualWatermarkMetrics;
  activeSeeds: VisualWatermarkSeed[];
  recentIncidents: VisualWatermarkIncident[];
  activeStrength: import('./enums').WatermarkEmbeddingStrength;
}

// ============================================================================
// Modelos: Tokens Efêmeros de Teleconsulta e Auto-Revogação (RFC 7519, RFC 7009 & LGPD Art. 46)
// ============================================================================

export interface EphemeralTokenProofSeal {
  sealToken: string;                // Token público ephemeral_v1_<base64url>
  canonicalDigest: string;          // Digest SHA-256 determinístico JCS (RFC 8785)
  hmacSignature: string;            // Assinatura de não-repúdio do Enclave
  issuedAt: string;
  tokenId: string;
  action: string;
}

export interface EphemeralAccessTokenPayload {
  jti: string;                      // JWT ID único anti-replay
  sub: string;                      // Blind Index do Paciente
  therapistCrp: string;             // CRP do psicólogo responsável
  roomId: string;                   // ID da sala clínica
  roomHash: string;                 // Hash SHA-256 da sala para vinculação estrita
  target: import('./enums').EphemeralTokenTarget;
  singleUse: boolean;               // Consumo único obrigatório
  iat: number;                      // Emitido em (epoch segundos)
  nbf: number;                      // Válido a partir de (epoch segundos)
  exp: number;                      // Expiração definitiva (epoch segundos)
  maxDurationMinutes: number;
  nonce: string;                    // Entropia criptográfica adicional
}

export interface EphemeralAccessToken {
  tokenId: string;
  tokenString: string;              // String canônica assinada (header.payload.signature)
  patientBlindIndex: string;
  patientIdMasked: string;
  therapistCrp: string;
  roomId: string;
  target: import('./enums').EphemeralTokenTarget;
  status: import('./enums').EphemeralTokenStatus;
  singleUse: boolean;
  issuedAt: string;
  notBefore: string;
  expiresAt: string;
  ttlSecondsRemaining: number;
  consumedAt?: string;
  consumedByIp?: string;
  revokedAt?: string;
  revocationReason?: import('./enums').RevocationReason;
  proofSeal: EphemeralTokenProofSeal;
}

export interface EphemeralTokenConsumptionRecord {
  id: string;
  tokenId: string;
  timestamp: string;
  clientIp: string;
  userAgent: string;
  verdict: import('./enums').EphemeralTokenVerificationVerdict;
  granted: boolean;
  denialReason?: string;
  proofSeal: EphemeralTokenProofSeal;
}

export interface EphemeralTokenMetrics {
  totalTokensIssued: number;
  activePendingTokens: number;
  consumedTokens: number;
  revokedTokens: number;
  expiredTokens: number;
  unauthorizedIntrusionsBlocked: number;
  averageTokenTtlMinutes: number;
  systemHealth: 'PROTECTED' | 'WARNING' | 'ALERT';
}

export interface EphemeralTokenOverview {
  metrics: EphemeralTokenMetrics;
  activeTokens: EphemeralAccessToken[];
  recentAccessLogs: EphemeralTokenConsumptionRecord[];
  defaultTtlMinutes: number;
  allowConcurrentAccess: boolean;
}

/**
 * Selo Probatório WORM de Operação de Threshold Cryptography (RFC 8785 JCS)
 */
export interface ThresholdProofSeal {
  sealToken: string;            // Prefixo: threshold_v1_<base64url>
  canonicalDigest: string;      // Digest SHA-256 canônico JCS (RFC 8785)
  action: import('./enums').AuditAction;
  vaultId: string;
  issuedAt: string;
  signature: string;
}

/**
 * Cota de Chave Criptográfica de Shamir (Shamir Secret Share)
 */
export interface ShamirKeyShare {
  shareIndex: number;            // Coordenada x no corpo finito (1..n)
  shareData: string;             // Valor f(x) codificado em hex/base64
  custodianRole: import('./enums').CustodianRole;
  custodianName: string;
  checksum: string;              // Hash SHA-256 parcial para validação de integridade do share
}

/**
 * Cofre Criptográfico de Quebra de Sigilo por Ordem Judicial (Court Order Vault)
 */
export interface CourtOrderVault {
  vaultId: string;
  patientId: string;
  patientMaskedName: string;
  legalCaseNumber: string;       // Número do processo judicial (ex: CNJ 0001234-56.2026.8.26.0100)
  legalJustification: import('./enums').LegalJustificationType;
  thresholdRequired: number;     // t (mínimo de cotas necessárias, ex: 3)
  totalShares: number;           // n (total de cotas distribuídas, ex: 5)
  cipheredRecordPayload: string; // Prontuário cifrado com AES-256-GCM
  ivHex: string;                 // Nonce/IV AES-GCM
  authTagHex: string;            // Tag de autenticação GCM
  status: import('./enums').CourtOrderVaultStatus;
  createdAt: string;
  expiresAt: string;
  submittedShares: ShamirKeyShare[];
  decryptedRecordText?: string;  // Disponível apenas se status for DECRYPTED_FOR_INSPECTION
  proofSeal: ThresholdProofSeal;
}

/**
 * Resultado da Reconstrução de Quorum e Decifragem
 */
export interface ThresholdReconstructionResult {
  success: boolean;
  verdict: import('./enums').ThresholdReconstructionVerdict;
  quorumCount: number;
  thresholdRequired: number;
  recoveredKeyHex?: string;
  decryptedPayload?: string;
  proofSeal: ThresholdProofSeal;
  message: string;
}

/**
 * Métricas e Telemetria de Governança de Threshold Cryptography
 */
export interface ThresholdVaultMetrics {
  totalVaultsCreated: number;
  pendingQuorumVaults: number;
  successfullyUnlockedVaults: number;
  rejectedQuorumAttempts: number;
  averageQuorumThreshold: number;
  systemIntegrity: 'OPTIMAL' | 'WARNING' | 'ALERT';
}

/**
 * Visão Geral de Cofres de Quebra de Sigilo
 */
export interface ThresholdVaultOverview {
  metrics: ThresholdVaultMetrics;
  activeVaults: CourtOrderVault[];
  defaultThreshold: number;
  defaultTotalShares: number;
}

/**
 * Detalhes de Ameaça de Poluição de Protótipo ou Desserialização Detectada
 */
export interface PollutionThreat {
  vector: import('./enums').PollutionAttackVector;
  path: string;
  maliciousKey: string;
  sampleValue: string;
  severity: import('./enums').PollutionThreatSeverity;
  description: string;
}

/**
 * Selo Probatório Forense WORM de Escaneamento e Sanitização de Objetos (RFC 8785)
 */
export interface PollutionProofSeal {
  version: string;
  scanId: string;
  category: import('./enums').PayloadCategory;
  threatsCount: number;
  isClean: boolean;
  timestamp: string;
  canonicalHash: string;
  signature: string;
}

/**
 * Resultado da Varredura e Sanitização de Payload Clínico Dinâmico
 */
export interface PollutionScanResult {
  scanId: string;
  isClean: boolean;
  category: import('./enums').PayloadCategory;
  strategyApplied: import('./enums').SanitizationStrategy;
  threatsDetected: PollutionThreat[];
  sanitizedObject: any;
  processingTimeMs: number;
  maxDepthReached: number;
  totalKeysEvaluated: number;
  proofSeal: PollutionProofSeal;
  message: string;
}

/**
 * Política de Proteção Ativa contra Poluição de Protótipo e Injeção de Objetos
 */
export interface PollutionGuardPolicy {
  defaultStrategy: import('./enums').SanitizationStrategy;
  maxAllowedDepth: number;
  maxKeyCount: number;
  blockOnCriticalThreat: boolean;
  freezeSanitizedObjects: boolean;
  stripGettersSetters: boolean;
  allowedKeysAllowlist: string[];
}

/**
 * Métricas e Telemetria de Defesa de Prototype Pollution
 */
export interface PollutionGuardMetrics {
  totalScannedPayloads: number;
  totalThreatsBlocked: number;
  protoPollutionBlocked: number;
  circularBombsBlocked: number;
  depthOverflowBlocked: number;
  averageScanLatencyMs: number;
  lastAttackBlockedTimestamp?: string;
  guardHealthScore: number;
}

/**
 * Registro de Incidente de Segurança de Injeção de Protótipo
 */
export interface PollutionSecurityIncident {
  incidentId: string;
  timestamp: string;
  category: import('./enums').PayloadCategory;
  threats: PollutionThreat[];
  clientIp: string;
  userAgent: string;
  strategyApplied: import('./enums').SanitizationStrategy;
  actionTaken: string;
  proofSeal: PollutionProofSeal;
}

/**
 * Visão Geral de Governança do Guard de Poluição de Protótipo
 */
export interface PollutionGuardOverview {
  metrics: PollutionGuardMetrics;
  policy: PollutionGuardPolicy;
  recentIncidents: PollutionSecurityIncident[];
  supportedCategories: import('./enums').PayloadCategory[];
}

/**
 * ============================================================================
 * 63. PROTEÇÃO CONTRA WEB CACHE POISONING & CACHE DECEPTION (RFC 7234, RFC 9111)
 * ============================================================================
 */

/**
 * Componentes Canônicos da Cache Key Normalizada
 */
export interface CacheKeyCanonicalComponents {
  method: string;
  normalizedPath: string;
  canonicalQuery: string;
  keyedHeadersHash: string;
  sensitivityLevel: import('./enums').ResourceSensitivityLevel;
  rawKeyString: string;
}

/**
 * Detecção de Ameaça de Poluição ou Deception de Cache
 */
export interface CacheThreatDetection {
  threatType: import('./enums').CacheThreatType;
  severity: import('./enums').CacheThreatSeverity;
  description: string;
  triggerHeaderOrParam: string;
  evidence: string;
  mitigationAction: import('./enums').CacheDirectiveAction;
}

/**
 * Selo Probatório de Normalização e Integridade de Cache (RFC 8785 / JCS)
 */
export interface CacheProofSeal {
  version: '1.0.0';
  sealId: string; // cache_guard_v1_<base64url>
  timestamp: string;
  resourceUri: string;
  canonicalCacheKeyHash: string;
  threatsCount: number;
  directive: string;
  hmacSignature: string;
}

/**
 * Resultado de Inspeção de Requisição e Validação de Cache
 */
export interface CacheInspectionResult {
  isSafe: boolean;
  canonicalCacheKey: string;
  canonicalCacheKeyHash: string;
  components: CacheKeyCanonicalComponents;
  threats: CacheThreatDetection[];
  recommendedCacheControl: string;
  recommendedPragma: string;
  recommendedVary: string[];
  headersToStrip: string[];
  seal: CacheProofSeal;
}

/**
 * Política de Blindagem e Regras de Cache HTTP
 */
export interface CacheGuardPolicy {
  blockUnkeyedHeaders: boolean;
  enforceNoStoreOnClinical: boolean;
  blockStaticExtensionOnDynamicRoutes: boolean;
  allowedExtensionsOnDynamicRoutes: string[];
  unkeyedHeadersBlacklist: string[];
  enableCacheSignatureProof: boolean;
  maxQueryParameters: number;
}

/**
 * Métricas e Telemetria de Proteção de Cache HTTP
 */
export interface CacheGuardMetrics {
  totalRequestsInspected: number;
  poisoningAttemptsBlocked: number;
  deceptionAttemptsBlocked: number;
  cleanRequestsAllowed: number;
  strictNoStoreEnforced: number;
  activePolicy: CacheGuardPolicy;
  lastIncidentTimestamp: string | null;
}

/**
 * Registro de Incidente Forense de Cache Poisoning / Deception
 */
export interface CacheSecurityIncident {
  id: string;
  timestamp: string;
  threatType: import('./enums').CacheThreatType;
  severity: import('./enums').CacheThreatSeverity;
  targetUri: string;
  clientIp: string;
  actorId: string;
  evidence: string;
  actionTaken: import('./enums').CacheDirectiveAction;
  seal: CacheProofSeal;
}

/**
 * Visão Geral de Governança e Métricas de Cache Guard
 */
export interface CacheGuardOverview {
  metrics: CacheGuardMetrics;
  policy: CacheGuardPolicy;
  recentIncidents: CacheSecurityIncident[];
  sampleProtectedRoutes: Array<{
    path: string;
    sensitivity: import('./enums').ResourceSensitivityLevel;
    cacheControl: string;
  }>;
}

/**
 * ============================================================================
 * 64. DEFESA ATIVA CONTRA XXE & EXPANSÃO DE ENTIDADES XML (CWE-611 / CWE-776)
 * ============================================================================
 */

/**
 * Detecção de Ameaça em Documento XML Clínico
 */
export interface XmlThreatDetection {
  threatType: import('./enums').XmlThreatType;
  severity: import('./enums').XmlThreatSeverity;
  description: string;
  triggerSnippet: string;
  evidence: string;
  mitigationAction: string;
}

/**
 * Selo Probatório Notarial WORM RFC 8785 de Higienização XML
 */
export interface XmlProofSeal {
  version: '1.0.0';
  sealId: string; // xml_guard_v1_<base64url>
  timestamp: string;
  canonicalXmlHash: string;
  cleanDigest: string;
  threatsCount: number;
  schemaType: import('./enums').XmlClinicalSchemaType;
  hmacSignature: string;
}

/**
 * Resultado da Varredura e Sanitização XML
 */
export interface XmlSanitizationResult {
  isSafe: boolean;
  sanitizedXml: string;
  parsedData: Record<string, any> | null;
  threats: XmlThreatDetection[];
  detectedEntitiesCount: number;
  maxNestingDepth: number;
  expansionMultiplier: number;
  seal: XmlProofSeal;
}

/**
 * Política de Segurança e Limites Operacionais de XML
 */
export interface XmlGuardPolicy {
  disallowDoctype: boolean;
  disallowExternalEntities: boolean;
  disallowXInclude: boolean;
  maxXmlSizeBytes: number;
  maxNestingDepth: number;
  maxEntityExpansions: number;
  allowedUriSchemes: string[];
  enableWormSeal: boolean;
}

/**
 * Métricas e Telemetria de Proteção XML
 */
export interface XmlGuardMetrics {
  totalXmlDocumentsScanned: number;
  xxeAttacksBlocked: number;
  xmlBombsDefused: number;
  cleanDocumentsProcessed: number;
  averageScanLatencyMs: number;
  activePolicy: XmlGuardPolicy;
  lastIncidentTimestamp: string | null;
}

/**
 * Registro de Incidente Forense de Ameaça XML
 */
export interface XmlSecurityIncident {
  id: string;
  timestamp: string;
  threatType: import('./enums').XmlThreatType;
  severity: import('./enums').XmlThreatSeverity;
  schemaType: import('./enums').XmlClinicalSchemaType;
  clientIp: string;
  actorId: string;
  evidence: string;
  actionTaken: string;
  seal: XmlProofSeal;
}

/**
 * Visão Geral de Governança de Proteção XML
 */
export interface XmlGuardOverview {
  metrics: XmlGuardMetrics;
  policy: XmlGuardPolicy;
  recentIncidents: XmlSecurityIncident[];
  supportedSchemas: import('./enums').XmlClinicalSchemaType[];
}

/**
 * 65. PROTEÇÃO CONTRA FIXAÇÃO E SEQUESTRO DE SESSÃO (OWASP ASVS V3.3 & NIST SP 800-63B)
 */

/**
 * Fingerprint de Contexto do Cliente para Dynamic Session Binding
 */
export interface ClientContextFingerprint {
  clientIp: string;
  subnetPrefix: string; // Ex: 198.51.100.0/24 ou 2001:db8:abcd::/48
  userAgent: string;
  userAgentHash: string; // SHA-256 canônico do User-Agent
  tlsFingerprint?: string; // JA4 ou JA3 fingerprint TLS
  countryCode?: string;
  asn?: string;
}

/**
 * Token Seguro de Sessão com Metadados Criptográficos
 */
export interface SessionSecurityToken {
  sessionId: string;
  userId: string;
  userRole: string;
  createdAt: string;
  lastRotatedAt: string;
  securityLevel: import('./enums').SessionSecurityLevel;
  contextHash: string;
  preAuthSessionIdInvalidated?: string;
  isActive: boolean;
}

/**
 * Selo Probatório Notarial WORM RFC 8785 de Sessão Clínica
 */
export interface SessionProofSeal {
  version: '1.0.0';
  sealId: string; // session_guard_v1_<base64url>
  timestamp: string;
  sessionIdHash: string;
  contextHash: string;
  anomalyCount: number;
  mitigationAction: import('./enums').SessionMitigationAction;
  hmacSignature: string;
}

/**
 * Anomalia Específica Detectada na Sessão
 */
export interface SessionEvaluationAnomaly {
  type: import('./enums').SessionAnomalyType;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  evidence: string;
}

/**
 * Resultado da Avaliação Contínua de Sessão
 */
export interface SessionEvaluationResult {
  isAllowed: boolean;
  sessionId: string;
  action: import('./enums').SessionMitigationAction;
  anomalies: SessionEvaluationAnomaly[];
  requiresRotation: boolean;
  newSessionId?: string;
  contextFingerprint: ClientContextFingerprint;
  seal: SessionProofSeal;
}

/**
 * Registro de Incidente Forense de Sessão
 */
export interface SessionGuardIncident {
  id: string;
  timestamp: string;
  anomalyType: import('./enums').SessionAnomalyType;
  sessionId: string;
  userId: string;
  expectedSubnet: string;
  actualIp: string;
  expectedUserAgentHash: string;
  actualUserAgentHash: string;
  mitigationAction: import('./enums').SessionMitigationAction;
  evidence: string;
  seal: SessionProofSeal;
}

/**
 * Política de Segurança e Dynamic Binding de Sessões
 */
export interface SessionGuardPolicy {
  enforceRotationOnElevation: boolean;
  bindIpSubnet: boolean;
  bindUserAgent: boolean;
  bindTlsFingerprint: boolean;
  allowSubnetShift: boolean; // Permite shift em roaming se User-Agent for idêntico
  maxSessionAgeMinutes: number;
  idleTimeoutMinutes: number;
  enableWormSeal: boolean;
}

/**
 * Métricas e Telemetria de Segurança de Sessões
 */
export interface SessionGuardMetrics {
  totalEvaluations: number;
  fixationAttemptsBlocked: number;
  hijackAttemptsBlocked: number;
  legitimateRotations: number;
  activeProtectedSessions: number;
  lastIncidentTimestamp: string | null;
  activePolicy: SessionGuardPolicy;
}

/**
 * Visão Geral de Governança de Sessão
 */
export interface SessionGuardOverview {
  metrics: SessionGuardMetrics;
  policy: SessionGuardPolicy;
  recentIncidents: SessionGuardIncident[];
  activeSessionsSample: Array<{
    sessionIdMasked: string;
    userId: string;
    role: string;
    securityLevel: import('./enums').SessionSecurityLevel;
    createdAt: string;
    lastSeenAt: string;
    subnet: string;
  }>;
}

/**
 * 66. DETECÇÃO E PREVENÇÃO DE REDOS & SAFE REGEX ENGINE
 * (OWASP ASVS v4.0 V5.5, CWE-1333 & ReDoS Guard)
 */

export interface RegexAstAnalysisResult {
  pattern: string;
  complexity: import('./enums').RegexComplexityRisk;
  vulnerabilityType: import('./enums').RegexVulnerabilityType;
  isVulnerable: boolean;
  starHeight: number;
  hasNestedQuantifiers: boolean;
  hasOverlappingDisjunction: boolean;
  hasAdjacentUnboundedRepetitions: boolean;
  recommendations: string[];
  suggestedSafePattern?: string;
}

export interface SafeRegexExecutionResult {
  matched: boolean;
  matchCount: number;
  matches: string[];
  executionTimeMs: number;
  timedOut: boolean;
  inputLength: number;
  actionTaken: import('./enums').RegexSanitizationAction;
  executedPattern: string;
}

export interface RedosProofSeal {
  version: '1.0.0';
  sealId: string; // redos_seal_<base64url>
  timestamp: string;
  patternHash: string; // SHA-256 do pattern normalizado
  inputHash: string;   // SHA-256 do input testado
  complexity: import('./enums').RegexComplexityRisk;
  vulnerabilityType: import('./enums').RegexVulnerabilityType;
  actionTaken: import('./enums').RegexSanitizationAction;
  executionTimeMs: number;
  hmacSignature: string; // Assinatura determinística RFC 8785
}

export interface RedosSecurityIncident {
  id: string;
  timestamp: string;
  pattern: string;
  patternSnippet: string;
  inputSnippet: string;
  vulnerabilityType: import('./enums').RegexVulnerabilityType;
  complexity: import('./enums').RegexComplexityRisk;
  executionTimeMs: number;
  timedOut: boolean;
  clientIp: string;
  userId: string;
  actionTaken: import('./enums').RegexSanitizationAction;
  seal: RedosProofSeal;
}

export interface RedosGuardPolicy {
  maxExecutionTimeMs: number;        // Teto rígido em ms (default: 25ms)
  maxPatternLength: number;          // Tamanho máximo do pattern (default: 500 chars)
  maxInputLength: number;            // Tamanho máximo da entrada a ser testada (default: 20000 chars)
  blockExponentialPatterns: boolean; // Rejeita sumariamente padrões O(2^n)
  autoRewriteIfPossible: boolean;    // Converte padrões conhecidos para forma linear segura
  strictClinicalMode: boolean;       // Exige conformidade rígida para filtros e prontuários
}

export interface ClinicalRegexPreset {
  type: import('./enums').RegexClinicalPresetType;
  title: string;
  description: string;
  pattern: string;
  sampleValid: string;
  sampleInvalid: string;
  complexity: import('./enums').RegexComplexityRisk;
}

export interface RedosGuardMetrics {
  totalEvaluations: number;
  safeEvaluations: number;
  blockedAttacks: number;
  timeoutsTriggered: number;
  patternsRewritten: number;
  avgExecutionTimeMs: number;
  lastIncidentTimestamp: string | null;
}

export interface RedosGuardOverview {
  metrics: RedosGuardMetrics;
  policy: RedosGuardPolicy;
  recentIncidents: RedosSecurityIncident[];
  clinicalPresets: ClinicalRegexPreset[];
  recentSealsSample: RedosProofSeal[];
}
















