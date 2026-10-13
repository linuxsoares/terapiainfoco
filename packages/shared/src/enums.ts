/**
 * Enums centrais da plataforma definidos na RFC-001
 * (Plataforma de Gestão Clínica Psicológica)
 */

export enum TherapistStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED'
}

export enum AppointmentStatus {
  SOLICITADA = 'SOLICITADA',
  CONFIRMADA = 'CONFIRMADA',
  EM_ANDAMENTO = 'EM_ANDAMENTO',
  CONCLUIDA = 'CONCLUIDA',
  CANCELADA_PELO_PACIENTE = 'CANCELADA_PELO_PACIENTE',
  CANCELADA_PELO_TERAPEUTA = 'CANCELADA_PELO_TERAPEUTA',
  REAGENDADA = 'REAGENDADA',
  NAO_COMPARECEU = 'NAO_COMPARECEU'
}

export enum TranscriptionStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

export enum SpeakerRole {
  TERAPEUTA = 'TERAPEUTA',
  PACIENTE = 'PACIENTE'
}

export enum DocumentType {
  DECLARACAO = 'DECLARACAO',
  ATESTADO = 'ATESTADO',
  RELATORIO = 'RELATORIO',
  LAUDO = 'LAUDO'
}

/**
 * Papéis de controle de acesso baseado em função (RBAC)
 * para a clínica psicológica conforme RFC-001 e normas do CFP/LGPD
 */
export enum UserRole {
  PSICOLOGO_TITULAR = 'PSICOLOGO_TITULAR',
  SUPERVISOR_CLINICO = 'SUPERVISOR_CLINICO',
  RECEPCAO_SECRETARIA = 'RECEPCAO_SECRETARIA',
  ADMIN = 'ADMIN'
}

export enum AuditAction {
  DECRYPT_READ = 'DECRYPT_READ',
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  GENERATE_REPORT = 'GENERATE_REPORT',
  TRANSCRIPTION_VIEW = 'TRANSCRIPTION_VIEW',
  SIGN_RECORD = 'SIGN_RECORD',
  QUARANTINE = 'QUARANTINE',
  DELETE_REQUEST = 'DELETE_REQUEST',
  // Ações de Autenticação e Segurança (Opção C)
  AUTH_LOGIN = 'AUTH_LOGIN',
  AUTH_LOGIN_FAILED = 'AUTH_LOGIN_FAILED',
  AUTH_LOGOUT = 'AUTH_LOGOUT',
  AUTH_2FA_SETUP = 'AUTH_2FA_SETUP',
  AUTH_2FA_VERIFY = 'AUTH_2FA_VERIFY',
  AUTH_2FA_DISABLE = 'AUTH_2FA_DISABLE',
  AUTH_TOKEN_REFRESH = 'AUTH_TOKEN_REFRESH',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  // Ações de Portabilidade e Direitos do Titular LGPD Art. 18 (Opção F)
  DATA_EXPORT = 'DATA_EXPORT',
  CONSENT_REVOCATION = 'CONSENT_REVOCATION',
  PORTABILITY_REQUEST = 'PORTABILITY_REQUEST',
  // Ações de Backup e Disaster Recovery com KMS (Opção G)
  BACKUP_CREATE = 'BACKUP_CREATE',
  BACKUP_VERIFY = 'BACKUP_VERIFY',
  BACKUP_RESTORE = 'BACKUP_RESTORE',
  // Ações de Mascaramento Dinâmico de Dados e Privacidade (Opção K - DDM)
  UNMASK_DATA = 'UNMASK_DATA',
  // Ações de Autenticação Biométrica WebAuthn / Passkeys (Opção O)
  PASSKEY_REGISTER = 'PASSKEY_REGISTER',
  PASSKEY_REVOKE = 'PASSKEY_REVOKE',
  // Ações de Auditoria Contínua & Conformidade RIPD/DPIA (Fase 4 do RFC-001)
  COMPLIANCE_AUDIT_RUN = 'COMPLIANCE_AUDIT_RUN',
  DPIA_REPORT_EXPORT = 'DPIA_REPORT_EXPORT',
  // Ações de Integração SIEM Externa & Retry Resiliente
  SIEM_DISPATCH = 'SIEM_DISPATCH',
  SIEM_DLQ_MOVED = 'SIEM_DLQ_MOVED',
  SIEM_DLQ_REPLAY = 'SIEM_DLQ_REPLAY',
  // Ações de Ciclo de Vida e Rotação de Chaves KMS (RFC §4.2, NIST SP 800-57)
  KMS_KEY_ROTATED = 'KMS_KEY_ROTATED',
  KMS_KEY_RE_WRAPPED = 'KMS_KEY_RE_WRAPPED',
  KMS_KEY_REVOKED = 'KMS_KEY_REVOKED',
  KMS_POLICY_UPDATED = 'KMS_POLICY_UPDATED'
}

export enum AuditResourceType {
  PATIENT = 'PATIENT',
  CLINICAL_RECORD = 'CLINICAL_RECORD',
  TRANSCRIPT = 'TRANSCRIPT',
  APPOINTMENT = 'APPOINTMENT',
  DOCUMENT = 'DOCUMENT',
  USER = 'USER',
  SECURITY = 'SECURITY',
  BACKUP = 'BACKUP',
  COMPLIANCE = 'COMPLIANCE',
  SIEM = 'SIEM',
  KMS = 'KMS'
}

/**
 * Estados do Ciclo de Vida da Chave Mestre KEK (NIST SP 800-57 & RFC-001 §4.2)
 */
export enum KmsKeyStatus {
  ACTIVE = 'ACTIVE',       // Chave atual usada para novas encriptações e decriptações
  ROTATED = 'ROTATED',     // Chave legada/rotacionada: somente leitura para decriptação histórica
  REVOKED = 'REVOKED',     // Chave revogada por política de segurança (não permite novas decriptações)
  DESTROYED = 'DESTROYED'  // Chave expurgada/destruída permanentemente
}

/**
 * Tipos de Provedor de KMS Suportados
 */
export enum KmsProviderType {
  LOCAL_MOCK = 'LOCAL_MOCK',
  AWS_KMS = 'AWS_KMS',
  GCP_CLOUD_KMS = 'GCP_CLOUD_KMS',
  HASHICORP_VAULT = 'HASHICORP_VAULT'
}


