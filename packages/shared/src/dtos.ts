import { AppointmentStatus, DocumentType } from './enums';
import { SoapNote, TranscriptUtterance } from './models';


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

