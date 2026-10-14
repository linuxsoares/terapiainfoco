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
  KMS_POLICY_UPDATED = 'KMS_POLICY_UPDATED',
  // Ações de Testes de Carga, Stress Concorrente e SLOs (RFC §5.1, §5.2)
  STRESS_TEST_RUN = 'STRESS_TEST_RUN',
  // Ações de Exportação OTLP OpenTelemetry (RFC §5.2 - Opção N)
  OTLP_EXPORT_CONFIG_UPDATE = 'OTLP_EXPORT_CONFIG_UPDATE',
  OTLP_BATCH_EXPORT = 'OTLP_BATCH_EXPORT',
  // Ações de Governança Executiva & Compliance Multi-Normativo
  EXECUTIVE_COMPLIANCE_GENERATED = 'EXECUTIVE_COMPLIANCE_GENERATED',
  COMPLIANCE_PACKAGE_EXPORT = 'COMPLIANCE_PACKAGE_EXPORT',
  DPO_SIGNOFF_APPLIED = 'DPO_SIGNOFF_APPLIED',
  // Ações de Hardening HTTP & Honeypot Anti-Probe (RFC-001 §4.4, §5.2)
  HONEYPOT_PROBE_BLOCKED = 'HONEYPOT_PROBE_BLOCKED',
  HONEYPOT_IP_UNBANNED = 'HONEYPOT_IP_UNBANNED',
  SECURITY_HEADERS_EVALUATED = 'SECURITY_HEADERS_EVALUATED',
  // Ações de Google Meet REST API v2 & Teleconferência
  MEET_SPACE_CREATED = 'MEET_SPACE_CREATED',
  MEET_CONFERENCE_ENDED = 'MEET_CONFERENCE_ENDED',
  // Ações de Auditoria WebRTC & Fingerprint DTLS (RFC-001 §3.2, §4.4, §5.2 e CFP 011/2018)
  WEBRTC_SESSION_INITIATED = 'WEBRTC_SESSION_INITIATED',
  WEBRTC_FINGERPRINT_VERIFIED = 'WEBRTC_FINGERPRINT_VERIFIED',
  WEBRTC_QUALITY_AUDITED = 'WEBRTC_QUALITY_AUDITED',
  WEBRTC_SESSION_TERMINATED = 'WEBRTC_SESSION_TERMINATED',
  // Ações do Web Application Firewall - WAF em Camada de Aplicação (RFC-001 §4.4, §5.2)
  WAF_ATTACK_BLOCKED = 'WAF_ATTACK_BLOCKED',
  WAF_RULE_UPDATED = 'WAF_RULE_UPDATED'
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
  KMS = 'KMS',
  BENCHMARK = 'BENCHMARK',
  TELEMETRY = 'TELEMETRY',
  HONEYPOT = 'HONEYPOT',
  MEET = 'MEET',
  WEBRTC_SESSION = 'WEBRTC_SESSION',
  WAF = 'WAF'
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

/**
 * Cenários de Testes de Carga & Stress Concorrente (k6 / Artillery / RFC §5.1, §5.2)
 */
export enum StressScenario {
  READ_CONCURRENCY = 'READ_CONCURRENCY',               // Consultas concorrentes de horários livres
  CRYPTO_ENVELOPE_STRESS = 'CRYPTO_ENVELOPE_STRESS',   // Cifragem em massa AES-256-GCM + Blind Index
  WORM_LEDGER_STRESS = 'WORM_LEDGER_STRESS',           // Gravações simultâneas na Hash-Chain WORM
  RATE_LIMIT_SATURATION = 'RATE_LIMIT_SATURATION',     // Saturação e resiliência de HTTP 429
  FULL_SYSTEM_MIXED = 'FULL_SYSTEM_MIXED'              // Carga mista ponta a ponta simulando pico real
}

/**
 * Status de Conformidade de Service Level Objective (SLO)
 */
export enum SloStatus {
  MET = 'MET',             // SLO rigorosamente cumprido dentro da meta
  WARNING = 'WARNING',     // Próximo do limite de tolerância
  BREACHED = 'BREACHED'    // Meta de latência ou taxa de erro violada
}

/**
 * Provedores de Coleta OpenTelemetry OTLP Suportados (RFC §5.2 - Opção N)
 */
export enum OtlpExporterProvider {
  GENERIC_COLLECTOR = 'GENERIC_COLLECTOR', // OpenTelemetry Collector Padrão (porta 4318)
  DATADOG = 'DATADOG',                     // Datadog OTLP Intake (otlp.datadoghq.com)
  NEW_RELIC = 'NEW_RELIC',                 // New Relic OTLP Intake (otlp.nr-data.net:4318)
  DYNATRACE = 'DYNATRACE',                 // Dynatrace OTLP HTTP Endpoint
  CUSTOM = 'CUSTOM'                        // Endpoint customizado HTTP/OTLP
}

/**
 * Status Operacional do Exportador de Telemetria OTLP
 */
export enum OtlpExportStatus {
  ACTIVE = 'ACTIVE',       // Exportação ativa e operando normalmente
  PAUSED = 'PAUSED',       // Exportação pausada administrativamente
  DEGRADED = 'DEGRADED',   // Coletor respondendo com latência alta ou retries
  ERROR = 'ERROR'          // Falha persistente de conexão ou autenticação
}

/**
 * Frameworks Regulatórios & Padrões Normativos do Setor de Saúde Mental (RFC-001)
 */
export enum ComplianceFramework {
  LGPD = 'LGPD',                   // Lei Geral de Proteção de Dados (Lei nº 13.709/2018)
  CFP = 'CFP',                     // Resoluções CFP 001/2009, 011/2018, 006/2019, 004/2020
  ICP_BRASIL = 'ICP_BRASIL',       // MP nº 2.200-2/2001 & PAdES Assinatura Qualificada
  SOC2_ISO27001 = 'SOC2_ISO27001'  // SOC2 Type II Security/Privacy & ISO/IEC 27001:2022
}

/**
 * Status de Conformidade de Controles Regulatórios
 */
export enum ComplianceControlStatus {
  COMPLIANT = 'COMPLIANT',                     // 100% em conformidade com salvaguardas ativas
  PARTIALLY_COMPLIANT = 'PARTIALLY_COMPLIANT', // Em transição ou mitigação compensatória
  NON_COMPLIANT = 'NON_COMPLIANT'              // Não conforme ou sem controle implementado
}

/**
 * Provedor de geração do link de teleatendimento
 */
export enum MeetProvider {
  GOOGLE_MEET_V2 = 'google_meet_v2',       // Google Meet REST API v2 (POST https://meet.googleapis.com/v2/spaces)
  GOOGLE_CALENDAR = 'google_calendar',     // Google Calendar API v3 com conferenceData
  CUSTOM = 'custom',                       // Link personalizado/recorrente informado pelo terapeuta
  SIMULATED = 'simulated'                  // Fallback determinístico de contingência (dev / offline)
}

/**
 * Políticas de controle de admissão (Knocking) no Google Meet (RFC §3.2 & CFP 011/2018)
 */
export enum MeetAccessType {
  OPEN = 'OPEN',             // Qualquer participante com o link acessa diretamente
  TRUSTED = 'TRUSTED',       // Apenas organização ou convidados entram direto; outros batem na porta (sala de espera recomendada)
  RESTRICTED = 'RESTRICTED'  // Apenas pessoas explicitamente convidadas entram direto; outros batem na porta
}

/**
 * Status de Verificação de Integridade DTLS Peer-to-Peer (RFC-001 §3.2 e CFP 011/2018)
 */
export enum WebRtcVerificationStatus {
  UNVERIFIED = 'UNVERIFIED',             // Sessão iniciada, aguardando fingerprint do paciente
  VERIFIED_MATCH = 'VERIFIED_MATCH',     // Fingerprints confirmados e Safety Numbers idênticos (Anti-MitM)
  VERIFIED_MISMATCH = 'VERIFIED_MISMATCH', // Divergência de chaves detectada (possível interceptação)
  FAILED = 'FAILED'                      // Falha de handshake ou expiração da sessão
}

/**
 * Ciphersuites Criptográficas WebRTC / DTLS-SRTP
 */
export enum WebRtcCipherSuite {
  AEAD_AES_256_GCM = 'AEAD_AES_256_GCM',
  AEAD_AES_128_GCM = 'AEAD_AES_128_GCM',
  SRTP_AEAD_AES_256_GCM = 'SRTP_AEAD_AES_256_GCM',
  SRTP_AEAD_AES_128_GCM = 'SRTP_AEAD_AES_128_GCM',
  SRTP_AES128_CM_HMAC_SHA1_80 = 'SRTP_AES128_CM_HMAC_SHA1_80'
}

/**
 * Nível Criptográfico da Chamada de Telepsicologia
 */
export enum WebRtcSecurityGrade {
  OPTIMAL = 'OPTIMAL',       // AES-256-GCM com PFS e Safety Numbers confirmados
  ACCEPTABLE = 'ACCEPTABLE', // AES-128-GCM com PFS
  LEGACY = 'LEGACY',         // AES-128-CM HMAC
  INSECURE = 'INSECURE'      // Não verificado ou falha de integridade
}

/**
 * Vetores de Ataque Inspecionados pelo WAF em Camada de Aplicação (OWASP Top 10)
 */
export enum WafAttackType {
  SQL_INJECTION = 'SQL_INJECTION',
  CROSS_SITE_SCRIPTING = 'CROSS_SITE_SCRIPTING',
  PATH_TRAVERSAL = 'PATH_TRAVERSAL',
  COMMAND_INJECTION = 'COMMAND_INJECTION',
  SUSPICIOUS_PAYLOAD = 'SUSPICIOUS_PAYLOAD'
}

/**
 * Modos de Operação do Web Application Firewall
 */
export enum WafMode {
  ACTIVE_BLOCK = 'ACTIVE_BLOCK', // Bloqueia com HTTP 403 e grava na trilha WORM
  MONITOR_ONLY = 'MONITOR_ONLY', // Apenas audita e gera alertas sem interromper a chamada
  DISABLED = 'DISABLED'          // Desativado
}

