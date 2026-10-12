import {
  TherapistStatus,
  AppointmentStatus,
  TranscriptionStatus,
  SpeakerRole,
  DocumentType,
  UserRole,
  AuditAction,
  AuditResourceType
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
  
  // Integração Google Meet
  googleEventId?: string;
  meetAccessCode?: string;
  
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

