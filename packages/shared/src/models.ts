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
  DidVerificationStatus
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

