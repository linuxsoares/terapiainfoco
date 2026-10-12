import { AppointmentStatus, DocumentType, UserRole } from './enums';
import type { SoapNote, TranscriptUtterance, SafeUser, IcpCertificateInfo, IcpSignatureData } from './models';




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




