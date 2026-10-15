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
  WAF_RULE_UPDATED = 'WAF_RULE_UPDATED',
  // Ações de Simulação de Resiliência de Rede & Contingência Clínica (RFC-001 §3.2, §5.1, §5.2 e CFP 011/2018)
  NETWORK_RESILIENCE_SIMULATED = 'NETWORK_RESILIENCE_SIMULATED',
  CLINICAL_CONTINGENCY_TRIGGERED = 'CLINICAL_CONTINGENCY_TRIGGERED',
  // Ações de Sharding de Mídia & Destruição Programada / Crypto-Shredding (RFC-001 §3.2, §3.3, §4.2 e CFP 011/2018)
  MEDIA_RECORDING_SHARDED = 'MEDIA_RECORDING_SHARDED',
  MEDIA_DECRYPTED_FOR_TRANSCRIPTION = 'MEDIA_DECRYPTED_FOR_TRANSCRIPTION',
  MEDIA_CRYPTO_SHREDDED = 'MEDIA_CRYPTO_SHREDDED',
  // Ações de Detecção de Queda de Conexão & Reconexão Segura (RFC-001 §3.2 & CFP 011/2018)
  CLINICAL_SESSION_MONITORED = 'CLINICAL_SESSION_MONITORED',
  CLINICAL_SESSION_DISCONNECTED = 'CLINICAL_SESSION_DISCONNECTED',
  CLINICAL_SESSION_RECONNECTED = 'CLINICAL_SESSION_RECONNECTED',
  CLINICAL_SESSION_TIMEOUT_TERMINATED = 'CLINICAL_SESSION_TIMEOUT_TERMINATED',
  // Ações de Provas de Conhecimento Zero (ZKP - RFC-001 §3.4, §3.5, §4.1 & CFP nº 006/2019)
  ZKP_PROOF_GENERATED = 'ZKP_PROOF_GENERATED',
  ZKP_PROOF_VERIFIED = 'ZKP_PROOF_VERIFIED',
  // Ações de Monitoramento de Vazamento de Credenciais na Dark Web & Contenção DPO (RFC-001 §4.4 & LGPD Art. 46/48)
  CREDENTIAL_BREACH_DETECTED = 'CREDENTIAL_BREACH_DETECTED',
  SESSION_FORCE_REVOKED = 'SESSION_FORCE_REVOKED',
  DPO_BREACH_ALERT_DISPATCHED = 'DPO_BREACH_ALERT_DISPATCHED',
  INCIDENT_CONTAINED = 'INCIDENT_CONTAINED',
  INCIDENT_RESOLVED = 'INCIDENT_RESOLVED',
  // Ações de Gestão Granular de Consentimento & Smart Revocation (LGPD Art. 7/8/9/11/18 & CFP 006/2019)
  CONSENT_GRANTED = 'CONSENT_GRANTED',
  CONSENT_REVOKED = 'CONSENT_REVOKED',
  CONSENT_RECEIPT_VERIFIED = 'CONSENT_RECEIPT_VERIFIED',
  CONSENT_ENFORCEMENT_BLOCKED = 'CONSENT_ENFORCEMENT_BLOCKED',
  // Ações de Data Loss Prevention (DLP) no Clipboard & Marca d'Água Esteganográfica (LGPD Art. 46 & CFP nº 001/2009)
  CLIPBOARD_COPY_AUDITED = 'CLIPBOARD_COPY_AUDITED',
  CLIPBOARD_WATERMARK_EMBEDDED = 'CLIPBOARD_WATERMARK_EMBEDDED',
  CLIPBOARD_EXFILTRATION_BLOCKED = 'CLIPBOARD_EXFILTRATION_BLOCKED',
  CLIPBOARD_WATERMARK_INSPECTED = 'CLIPBOARD_WATERMARK_INSPECTED',
  CLIPBOARD_POLICY_VIOLATION = 'CLIPBOARD_POLICY_VIOLATION',
  // Ações de Cartório Notarial Digital & Auditoria Forense de Prontuários (LGPD Art. 18 & CFP nº 001/2009)
  NOTARY_SEAL_GENERATED = 'NOTARY_SEAL_GENERATED',
  NOTARY_CHAIN_VERIFIED = 'NOTARY_CHAIN_VERIFIED',
  NOTARY_TAMPERING_DETECTED = 'NOTARY_TAMPERING_DETECTED',
  NOTARY_CERTIFICATE_ISSUED = 'NOTARY_CERTIFICATE_ISSUED',
  // Ações de Expurgamento Criptográfico e Descarte Seguro de Dados (LGPD Art. 16 & CFP nº 001/2009)
  DATA_PURGE_REQUESTED = 'DATA_PURGE_REQUESTED',
  DATA_PURGE_EXECUTED = 'DATA_PURGE_EXECUTED',
  DATA_PURGE_CERTIFICATE_ISSUED = 'DATA_PURGE_CERTIFICATE_ISSUED',
  DATA_PURGE_PROOF_VERIFIED = 'DATA_PURGE_PROOF_VERIFIED',
  DATA_PURGE_RETENTION_BLOCKED = 'DATA_PURGE_RETENTION_BLOCKED',
  // Ações de Federação de Identidades Descentralizadas (DID) & Credenciais Verificáveis (RFC-001 §3.5)
  DID_IDENTITY_CREATED = 'DID_IDENTITY_CREATED',
  DID_DOCUMENT_RESOLVED = 'DID_DOCUMENT_RESOLVED',
  VERIFIABLE_CREDENTIAL_ISSUED = 'VERIFIABLE_CREDENTIAL_ISSUED',
  VERIFIABLE_CREDENTIAL_VERIFIED = 'VERIFIABLE_CREDENTIAL_VERIFIED',
  VERIFIABLE_CREDENTIAL_REVOKED = 'VERIFIABLE_CREDENTIAL_REVOKED',
  // Ações de Análise Comportamental Preditiva e Detecção de Acesso Anômalo (UEBA - RFC-001 §4.4 & LGPD Art. 46)
  UEBA_ANOMALY_DETECTED = 'UEBA_ANOMALY_DETECTED',
  UEBA_CONTAINMENT_TRIGGERED = 'UEBA_CONTAINMENT_TRIGGERED',
  UEBA_CONTAINMENT_RELEASED = 'UEBA_CONTAINMENT_RELEASED',
  UEBA_PROFILE_LEARNED = 'UEBA_PROFILE_LEARNED',
  UEBA_RISK_THRESHOLD_MODIFIED = 'UEBA_RISK_THRESHOLD_MODIFIED',
  // Ações de Privacidade Diferencial e Pesquisa Epidemiológica (LGPD Art. 13 & CFP nº 001/2009)
  DP_QUERY_EXECUTED = 'DP_QUERY_EXECUTED',
  DP_BUDGET_ALLOCATED = 'DP_BUDGET_ALLOCATED',
  DP_BUDGET_EXHAUSTED = 'DP_BUDGET_EXHAUSTED',
  DP_DATASET_EXPORTED = 'DP_DATASET_EXPORTED',
  DP_PROOF_VERIFIED = 'DP_PROOF_VERIFIED',
  // Ações de Gestão de Sessões, Token Binding Criptográfico e Concorrência (RFC-001 §4.4 & OWASP ASVS)
  SESSION_BOUND_CREATED = 'SESSION_BOUND_CREATED',
  SESSION_DPOP_VERIFIED = 'SESSION_DPOP_VERIFIED',
  SESSION_FORCE_TERMINATED = 'SESSION_FORCE_TERMINATED',
  SESSION_CONCURRENT_REVOKED = 'SESSION_CONCURRENT_REVOKED',
  SESSION_ALL_OTHER_REVOKED = 'SESSION_ALL_OTHER_REVOKED',
  // Ações de Prevenção de Força Bruta & PoW Criptográfico (RFC-001 §4.4 & OWASP OAT-007 / OAT-008)
  POW_CHALLENGE_ISSUED = 'POW_CHALLENGE_ISSUED',
  POW_SOLUTION_VERIFIED = 'POW_SOLUTION_VERIFIED',
  POW_DEFENSE_TRIGGERED = 'POW_DEFENSE_TRIGGERED',
  BRUTE_FORCE_BLOCKED = 'BRUTE_FORCE_BLOCKED',
  IP_QUARANTINE_RESET = 'IP_QUARANTINE_RESET',
  // Ações de Proteção Anti-Automação, Honeypot & Tarpit Criptográfico (OWASP OAT-011 / OAT-020 & RFC-001 §4.4)
  HONEYPOT_TRAP_TRIGGERED = 'HONEYPOT_TRAP_TRIGGERED',
  TARPIT_DEFENSE_ENGAGED = 'TARPIT_DEFENSE_ENGAGED',
  SCRAPER_BLOCKED = 'SCRAPER_BLOCKED',
  SCRAPER_IP_ISOLATED = 'SCRAPER_IP_ISOLATED',
  TARPIT_QUARANTINE_RELEASED = 'TARPIT_QUARANTINE_RELEASED',
  // Ações de Certificação Notarial de Sessão Clínica & Carimbo do Tempo RFC 3161 / ICP-Brasil TSA (DOC-ICP-11 / CFP 001/2009)
  CLINICAL_SESSION_TIMESTAMP_REQUESTED = 'CLINICAL_SESSION_TIMESTAMP_REQUESTED',
  CLINICAL_SESSION_TIMESTAMP_ISSUED = 'CLINICAL_SESSION_TIMESTAMP_ISSUED',
  CLINICAL_SESSION_TIMESTAMP_VERIFIED = 'CLINICAL_SESSION_TIMESTAMP_VERIFIED',
  CLINICAL_SESSION_TIMESTAMP_TAMPERED = 'CLINICAL_SESSION_TIMESTAMP_TAMPERED',
  TSA_CERTIFICATE_VALIDATED = 'TSA_CERTIFICATE_VALIDATED'
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
  WAF = 'WAF',
  NETWORK_RESILIENCE = 'NETWORK_RESILIENCE',
  MEDIA_RECORDING = 'MEDIA_RECORDING',
  CLINICAL_SESSION_RECOVERY = 'CLINICAL_SESSION_RECOVERY',
  ZKP_PROOF = 'ZKP_PROOF',
  THREAT_INTELLIGENCE = 'THREAT_INTELLIGENCE',
  CONSENT_RECORD = 'CONSENT_RECORD',
  CLIPBOARD_DLP = 'CLIPBOARD_DLP',
  NOTARY_LEDGER = 'NOTARY_LEDGER',
  PURGE_LEDGER = 'PURGE_LEDGER',
  CLINICAL_FEDERATION_DID = 'CLINICAL_FEDERATION_DID',
  UEBA_SECURITY_ENGINE = 'UEBA_SECURITY_ENGINE',
  DIFFERENTIAL_PRIVACY_ENGINE = 'DIFFERENTIAL_PRIVACY_ENGINE',
  SESSION_MANAGEMENT = 'SESSION_MANAGEMENT',
  BRUTE_FORCE_DEFENSE = 'BRUTE_FORCE_DEFENSE',
  ANTI_AUTOMATION_TARPIT = 'ANTI_AUTOMATION_TARPIT',
  CLINICAL_SESSION_TSA_NOTARY = 'CLINICAL_SESSION_TSA_NOTARY'
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

/**
 * Perfis Padronizados de Simulação de Rede para Teleconsulta (RFC-001 §3.2, §5.1, §5.2 e CFP 011/2018)
 */
export enum NetworkProfileType {
  FIBRA_ESTAVEL = 'FIBRA_ESTAVEL',           // Fibra Óptica Estável: Jitter 2-5ms, Packet Loss 0.1%, RTT 20ms
  WIFI_OSCILANTE = 'WIFI_OSCILANTE',         // Wi-Fi Doméstico com Interferência: Jitter 25ms, Packet Loss 2.0%, RTT 60ms
  MOBILE_4G_CONGESTED = 'MOBILE_4G_CONGESTED', // Rede Móvel 4G/LTE Congestionada: Jitter 80ms, Packet Loss 6.0%, RTT 180ms
  DEGRADED_CRITICAL = 'DEGRADED_CRITICAL',   // Conexão Degradada Crítica: Jitter 200ms, Packet Loss 15.0%, RTT 450ms
  TEMPORARY_BLACKOUT = 'TEMPORARY_BLACKOUT', // Blackout / Queda Temporária de Conexão: Packet Loss 100% por 10s
  CUSTOM = 'CUSTOM'                          // Parâmetros Personalizados pelo Usuário
}

/**
 * Graus de Inteligibilidade Clínica da Fala Conforme Escala MOS ITU-T P.800 / E-Model
 */
export enum ClinicalIntelligibilityGrade {
  EXCELLENT = 'EXCELLENT',                   // MOS 4.0 - 5.0: Comunicação fluida, sem cortes perceptíveis, escuta plena
  GOOD = 'GOOD',                             // MOS 3.5 - 3.9: Comunicação clara, leve atraso imperceptível na fala
  DEGRADED = 'DEGRADED',                     // MOS 2.8 - 3.4: Micro-cortes frequentes, distorção leve, atenção necessária
  CRITICAL_UNACCEPTABLE = 'CRITICAL_UNACCEPTABLE' // MOS < 2.8: Quebra de frases, ininteligível, veto ético CFP 011/2018
}

/**
 * Codecs de Áudio Suportados na Avaliação de Resiliência WebRTC
 */
export enum AudioCodecType {
  OPUS_FULLBAND = 'OPUS_FULLBAND',           // Opus 48kHz (Padrão Ouro WebRTC)
  OPUS_VOIP = 'OPUS_VOIP',                   // Opus 16kHz (Modo Otimizado para Baixa Largura de Banda)
  G722 = 'G722',                             // G.722 Wideband
  G711_ALAW = 'G711_ALAW'                    // G.711 A-law (Legado Telefônico)
}

/**
 * Estados do Shard Individual de Mídia em Repouso (RFC-001 §3.2, §3.3, §4.2)
 */
export enum MediaShardStatus {
  ACTIVE_ENCRYPTED = 'ACTIVE_ENCRYPTED',         // Shard cifrado com DEK efêmera exclusiva em repouso
  DECRYPTED_PROCESSING = 'DECRYPTED_PROCESSING', // Em decifragem estritamente temporária em RAM para IA
  SHREDDED_DESTROYED = 'SHREDDED_DESTROYED'       // Shard destruído via sobrescrita segura e purga de DEK
}

/**
 * Estados do Ciclo de Vida da Gravação de Teleconsulta
 */
export enum MediaRecordingStatus {
  RECORDING = 'RECORDING',                               // Em gravação e fatiamento contínuo
  SHARDED_ENCRYPTED = 'SHARDED_ENCRYPTED',               // Gravação concluída e 100% particionada e cifrada em repouso
  PROCESSING_TRANSCRIPTION = 'PROCESSING_TRANSCRIPTION', // Em processamento pela IA de transcrição/SOAP
  SHREDDED_PURGED = 'SHREDDED_PURGED',                   // Áudio bruto destruído com emissão de laudo forense WORM
  FAILED = 'FAILED'
}

/**
 * Método de Destruição / Expurgamento Criptográfico (Crypto-Shredding)
 */
export enum CryptoShreddingMethod {
  ZERO_FILL_AND_KEY_DESTROY = 'ZERO_FILL_AND_KEY_DESTROY', // Sobrescrita de payload com zeros e purga irreversível da DEK
  CRYPTOGRAPHIC_ERASURE = 'CRYPTOGRAPHIC_ERASURE'           // Destruição instantânea da DEK tornando o ciphertext irrecuperável
}

/**
 * Estados do Ciclo de Resiliência e Reconexão da Sessão Clínica (RFC-001 §3.2 & CFP 011/2018)
 */
export enum ClinicalSessionState {
  ACTIVE_CONNECTED = 'ACTIVE_CONNECTED',                             // Sessão online com heartbeats regulares
  DISCONNECTED_PENDING_RECONNECT = 'DISCONNECTED_PENDING_RECONNECT', // Conexão perdida, aguardando reconexão na janela de tolerância
  RECONNECTING = 'RECONNECTING',                                     // Handshake de reconexão com token criptográfico em validação
  RECONNECTED = 'RECONNECTED',                                       // Sessão reassumida com sucesso e snapshot de dados restaurado
  TERMINATED_TIMEOUT = 'TERMINATED_TIMEOUT',                         // Janela de contingência esgotada, sessão encerrada e selada
  COMPLETED_NORMALLY = 'COMPLETED_NORMALLY'                          // Consulta concluída normalmente pelo psicólogo
}

/**
 * Causa Identificada da Desconexão Abrupta
 */
export enum DisconnectionCause {
  HEARTBEAT_TIMEOUT = 'HEARTBEAT_TIMEOUT', // Perda consecutiva de pacotes de heartbeat (silent drop)
  SOCKET_DROP = 'SOCKET_DROP',             // Queda de socket TCP/WebSocket ou falha de transporte ICE
  CLIENT_OFFLINE = 'CLIENT_OFFLINE',       // Evento de offline do navegador / perda de interface de rede
  MANUAL_SIMULATION = 'MANUAL_SIMULATION'  // Teste de resiliência e injeção de falha executado na interface
}

/**
 * Classificação do Tempo de Resposta e Qualidade da Recuperação
 */
export enum SessionRecoveryGrade {
  SEAMLESS = 'SEAMLESS',                     // Recuperado em menos de 15 segundos (sem percepção de quebra clínica)
  RECOVERED = 'RECOVERED',                   // Recuperado dentro da janela de tolerância ética (15s a 10 min)
  EXPIRED_CONTINGENCY = 'EXPIRED_CONTINGENCY' // Janela esgotada, exigido acionamento de canal de contingência CFP 011/2018
}

/**
 * Tipos de Provas de Conhecimento Zero (Zero-Knowledge Proofs - RFC-001 §3.4, §3.5 & CFP 006/2019)
 */
export enum ZkpProofType {
  AUTHORSHIP_PROOF = 'AUTHORSHIP_PROOF',                     // Prova Schnorr de posse da chave privada do psicólogo sem revelar a chave
  INTEGRITY_NONCE_PROOF = 'INTEGRITY_NONCE_PROOF',           // Prova de integridade do documento sem revelar o texto clínico
  ATTRIBUTES_PREDICATE_PROOF = 'ATTRIBUTES_PREDICATE_PROOF', // Prova de validade de atributos (ex: data de emissão, tipo de documento CFP)
  FULL_FORENSIC_ZKP = 'FULL_FORENSIC_ZKP'                    // Prova combinada de autoria, integridade temporal e registro WORM
}

/**
 * Status da Verificação ZKP de Assinatura Digital
 */
export enum ZkpVerificationStatus {
  VERIFIED_VALID = 'VERIFIED_VALID',         // Prova matematicamente válida (100% de certeza com 0% de dados vazados)
  INVALID_PROOF = 'INVALID_PROOF',           // Equação de verificação de Schnorr falhou
  TAMPERED_CHALLENGE = 'TAMPERED_CHALLENGE', // Desafio de Fiat-Shamir não corresponde ao compromisso
  EXPIRED_CREDENTIAL = 'EXPIRED_CREDENTIAL'  // Credencial e-Psi ou prazo de validade probatória expirado
}

/**
 * Origem / Vetor do Vazamento de Credenciais na Dark Web (RFC-001 §4.4)
 */
export enum ThreatSourceType {
  DARK_WEB_BREACH_DUMP = 'DARK_WEB_BREACH_DUMP', // Dumps massivos de fóruns de cibercrime / marketplaces clandestinos
  STEALER_LOGS = 'STEALER_LOGS',                 // Logs de infecções por malware infostealer (RedLine, Racoon, Vidar)
  PUBLIC_PASTE = 'PUBLIC_PASTE',                 // Pastas públicas em texto aberto (Pastebin, Ghostbin)
  HIBP_K_ANONYMITY = 'HIBP_K_ANONYMITY'          // Base k-Anonymity do HaveIBeenPwned / NIST SP 800-63B
}

/**
 * Nível de Severidade do Incidente de Vazamento (LGPD Art. 48 & Resolução CD/ANPD nº 15/2024)
 */
export enum BreachSeverity {
  LOW = 'LOW',         // Menos de 5 vazamentos históricos legados, senha alterada previamente
  MEDIUM = 'MEDIUM',   // Credencial de paciente sem acesso a prontuários de outros titulares
  HIGH = 'HIGH',       // Credencial ativa de Psicólogo Titular com risco a prontuários SOAP sigilosos
  CRITICAL = 'CRITICAL' // Credencial de Administrador com acesso a chaves KMS ou exposição em logs de stealer recentes
}

/**
 * Status de Contenção e Resposta ao Incidente pelo DPO (LGPD Art. 46/48)
 */
export enum IncidentContainmentStatus {
  DETECTED_UNCONTAINED = 'DETECTED_UNCONTAINED',     // Incidente recém-detectado, pendente de contenção imediata
  CONTAINED_REVOKED = 'CONTAINED_REVOKED',           // Sessões ativas e tokens revogados compulsoriamente
  PENDING_PASSWORD_RESET = 'PENDING_PASSWORD_RESET', // Usuário notificado, bloqueado até redefinir senha/Passkey
  RESOLVED = 'RESOLVED',                             // Incidente sanado, analisado e documentado na trilha WORM pelo DPO
  FALSE_POSITIVE = 'FALSE_POSITIVE'                  // Marcado como falso positivo após perícia técnica
}

/**
 * Escopos / Finalidades Determinadas de Consentimento Clínico (LGPD Art. 7º, 8º, 9º, 11 e CFP 006/2019)
 */
export enum ConsentScope {
  TELECONSULTATION_AUDIO_RECORDING = 'TELECONSULTATION_AUDIO_RECORDING', // Gravação e transmissão audiovisual para teleconsulta (CFP 011/2018)
  AI_CLINICAL_SYNTHESIS = 'AI_CLINICAL_SYNTHESIS',                       // Síntese SOAP e transcrição assistida por inteligência artificial com sanitização prévia
  ANONYMIZED_RESEARCH = 'ANONYMIZED_RESEARCH',                           // Dados agregados, irreversivelmente anonimizados para estudos clínicos e pesquisa científica (LGPD Art. 7º, IV)
  INTERPROFESSIONAL_SHARING = 'INTERPROFESSIONAL_SHARING',               // Compartilhamento interprofissional com médicos/psiquiatras da equipe multiprofissional (CFP 006/2019)
  COMMUNICATION_REMINDERS = 'COMMUNICATION_REMINDERS'                    // Envio de lembretes de consultas e notificações operacionais por e-mail/WhatsApp/SMS
}

/**
 * Estado Atual do Consentimento do Paciente para cada Finalidade (LGPD Art. 8º §5º)
 */
export enum ConsentStatus {
  GRANTED = 'GRANTED',   // Consentimento expresso ativo e vigente
  REVOKED = 'REVOKED',   // Revogado formalmente pelo titular (Smart Revocation)
  EXPIRED = 'EXPIRED',   // Expirado por término do ciclo de tratamento ou decurso de prazo
  REFUSED = 'REFUSED'    // Recusado expressamente pelo titular na admissão
}

/**
 * Bases Legais Normativas do Consentimento & Tratamento em Saúde Mental
 */
export enum ConsentLegalBasis {
  LGPD_ART_7_I_CONSENT = 'LGPD_ART_7_I_CONSENT',                   // Consentimento livre, informado e inequívoco (Art. 7º, I)
  LGPD_ART_11_I_SENSITIVE = 'LGPD_ART_11_I_SENSITIVE',             // Consentimento específico e destacado para dados sensíveis de saúde (Art. 11, I)
  LGPD_ART_16_I_LEGAL_DUTY = 'LGPD_ART_16_I_LEGAL_DUTY',           // Guarda legal obrigatória de prontuário por 5 anos (Art. 16, I & CFP 001/2009)
  CFP_011_2018_TELEPSY = 'CFP_011_2018_TELEPSY',                   // Prestação de serviços psicológicos realizados por meios de tecnologias da informação
  CFP_006_2019_INTERPROFESSIONAL = 'CFP_006_2019_INTERPROFESSIONAL' // Emissão e compartilhamento ético de documentos psicológicos
}

/**
 * Modos de Política de Data Loss Prevention (DLP) no Clipboard Clínico (LGPD Art. 46 & CFP nº 001/2009)
 */
export enum DlpPolicyMode {
  WATERMARK_ONLY = 'WATERMARK_ONLY',             // Injeta esteganografia zero-width invisível mantendo o texto visual 100% idêntico
  WATERMARK_AND_NOTICE = 'WATERMARK_AND_NOTICE', // Injeta esteganografia invisível + disclaimer legal formal de confidencialidade
  MASK_SENSITIVE = 'MASK_SENSITIVE',             // Mascara PIIs e CPFs automaticamente antes da transferência
  BLOCK_EXFILTRATION = 'BLOCK_EXFILTRATION'      // Bloqueia tentativas de cópia em massa ou volumosa de prontuários
}

/**
 * Níveis de Risco de Vazamento / Exfiltração de Prontuário Clínico (LGPD Art. 46 / CFP nº 001/2009)
 */
export enum DlpRiskLevel {
  LOW = 'LOW',         // Trecho curto de texto sem PII ou sem termos clínicos restritos
  MEDIUM = 'MEDIUM',   // Dados clínicos parciais ou identificador de paciente com texto descritivo
  HIGH = 'HIGH',       // Prontuário estruturado, notas SOAP completas, hipóteses diagnósticas ou anamnese
  CRITICAL = 'CRITICAL' // Tentativa de cópia em massa ou volume excessivo suscetível a exfiltração não autorizada
}

/**
 * Status da Inspeção Forense de Esteganografia no Texto do Clipboard
 */
export enum SteganographyInspectionStatus {
  GENUINE_WATERMARK = 'GENUINE_WATERMARK',   // Marca d'água autêntica decodificada com sucesso e HMAC validado
  TAMPERED_WATERMARK = 'TAMPERED_WATERMARK', // Padrão zero-width detectado, porém com HMAC inválido ou payload corrompido
  NO_WATERMARK = 'NO_WATERMARK',             // Nenhum padrão esteganográfico zero-width detectado no texto
  INVALID_PAYLOAD = 'INVALID_PAYLOAD'        // Caracteres zero-width presentes, mas não correspondem à estrutura de pacote válida
}

/**
 * Status Notarial do Bloco de Prontuário Clínico (CFP nº 001/2009 & LGPD Art. 18)
 */
export enum NotaryStatus {
  NOTARIZED = 'NOTARIZED',       // Selado e imutável no cartório digital com fé pública
  RECTIFIED = 'RECTIFIED',       // Aditado formalmente por termo de retificação com novo hash encadeado
  REVOKED = 'REVOKED',           // Revogado por determinação judicial ou fiscalizatória do CRP
  DISPUTED = 'DISPUTED'          // Em disputa pericial ou sindicância ética
}

/**
 * Status do Resultado da Verificação Notarial Digital Forense
 */
export enum NotaryVerificationStatus {
  VALID_GENUINE = 'VALID_GENUINE',       // Selo e encadeamento temporal 100% íntegros e auditados
  CHAIN_BROKEN = 'CHAIN_BROKEN',         // Quebra na hash-chain temporal de sessões do paciente
  CONTENT_TAMPERED = 'CONTENT_TAMPERED', // O conteúdo da nota clínica não confere com o hash canônico notarial
  NOT_FOUND = 'NOT_FOUND'                // Selo ou blind index não localizado no cartório digital
}

/**
 * Motivações Legais e Regulatórias para Expurgamento e Descarte de Dados (LGPD Art. 16 & CFP nº 001/2009)
 */
export enum PurgeReason {
  RETENTION_PERIOD_EXPIRED_5_YEARS = 'RETENTION_PERIOD_EXPIRED_5_YEARS', // Prazo mínimo legal de 5 anos (Resolução CFP nº 001/2009 Art. 2º §2º) cumprido
  PATIENT_REQUEST_ART_18 = 'PATIENT_REQUEST_ART_18',                     // Exercício legítimo do titular (LGPD Art. 18, VI) sem óbice regulatório
  LEGAL_DETERMINATION = 'LEGAL_DETERMINATION',                           // Mandado judicial ou decisão transitada em julgado
  TREATMENT_TERMINATION = 'TREATMENT_TERMINATION'                        // Encerramento formal do ciclo de atendimento com autorização do DPO
}

/**
 * Método Técnico de Expurgamento Criptográfico e Sanitização de Mídia (NIST SP 800-88 Rev. 1 & DoD 5220.22-M)
 */
export enum PurgeMethod {
  CRYPTO_SHREDDING_NIST_800_88 = 'CRYPTO_SHREDDING_NIST_800_88',   // Destruição irreversível de DEK no KMS + sobreescrita do registro
  DEK_REVOCATION_AND_OVERWRITE = 'DEK_REVOCATION_AND_OVERWRITE',   // Revogação criptográfica e truncamento permanente
  HYBRID_SHREDDING_WORM = 'HYBRID_SHREDDING_WORM'                  // Destruição da chave criptográfica com guarda do certificado probatório WORM
}

/**
 * Status do Processo de Expurgamento
 */
export enum PurgeStatus {
  PURGED_CONFIRMED = 'PURGED_CONFIRMED',                         // Expurgado irreversivelmente com certificado probatório emitido
  RETAINED_PENDING_LEGAL_TERM = 'RETAINED_PENDING_LEGAL_TERM',   // Bloqueado para descarte: dentro do prazo legal de 5 anos (CFP)
  LOCKED_AUDIT_DISPUTE = 'LOCKED_AUDIT_DISPUTE'                  // Bloqueado administrativamente por processo ético/judicial em aberto
}

/**
 * Status da Verificação Pública de Prova Criptográfica de Destruição
 */
export enum PurgeProofVerificationStatus {
  PROOF_VALID_AUTHENTIC = 'PROOF_VALID_AUTHENTIC', // Prova matemática autêntica e confirmada na cadeia WORM
  PROOF_TAMPERED = 'PROOF_TAMPERED',               // Certificado corrompido ou assinatura forjada
  PROOF_NOT_FOUND = 'PROOF_NOT_FOUND'              // Certificado ou token não localizado no livro de expurgo
}

/**
 * Métodos DID Suportados na Federação Clínica (W3C DID v1.0 & RFC-001 §3.5)
 */
export enum ClinicalDidMethod {
  DID_KEY = 'did:key',                     // Identificador descentralizado autocontido baseado em chave pública multibase
  DID_TERAPIAINFOCO = 'did:terapiainfoco', // Método federado do ecossistema TerapiaInFoco vinculado ao registro e-Psi/CRP
  DID_ION = 'did:ion'                      // Rede pública descentralizada Sidetree (Bitcoin/IPFS)
}

/**
 * Tipos de Credenciais Clínicas Verificáveis Emitidas (W3C VC v2.0 & CFP nº 006/2019)
 */
export enum VerifiableCredentialType {
  PSYCHOLOGIST_LICENSE_CREDENTIAL = 'PsychologistLicenseCredential',     // Habilitação e regularidade profissional no Conselho Regional de Psicologia
  CLINICAL_REFERRAL_CREDENTIAL = 'ClinicalReferralCredential',           // Guia de encaminhamento interprofissional clínico com autorização do paciente
  MENTAL_HEALTH_ATTESTATION_CREDENTIAL = 'MentalHealthAttestationCredential', // Atestado psicológico com fé pública digital e validação externa
  PSYCHOLOGICAL_REPORT_CREDENTIAL = 'PsychologicalReportCredential'       // Relatório / laudo psicológico emitido conforme CFP nº 006/2019
}

/**
 * Status de Revogação de Credencial Verificável (W3C StatusList2021)
 */
export enum CredentialRevocationStatus {
  ACTIVE = 'ACTIVE',       // Credencial válida e em pleno vigor
  REVOKED = 'REVOKED',     // Revogada formalmente pelo emissor ou DPO na trilha WORM
  SUSPENDED = 'SUSPENDED', // Suspensa temporariamente para averiguação ética
  EXPIRED = 'EXPIRED'      // Prazo de vigência clínica expirado
}

/**
 * Status de Verificação Descentralizada de Credencial / Apresentação
 */
export enum DidVerificationStatus {
  VALID_VERIFIED = 'VALID_VERIFIED',           // Assinatura matemática íntegra, emissor ativo e sem revogação
  SIGNATURE_INVALID = 'SIGNATURE_INVALID',     // Assinatura digital forjada ou conteúdo adulterado (anti-tampering)
  CREDENTIAL_REVOKED = 'CREDENTIAL_REVOKED',   // Credencial consta na lista de revogação WORM
  CREDENTIAL_EXPIRED = 'CREDENTIAL_EXPIRED',   // Data de validade clínica ultrapassada
  UNRESOLVED_DID = 'UNRESOLVED_DID'            // Não foi possível resolver o DID Document do emissor
}

/**
 * Níveis de Risco Comportamental Preditivo (UEBA - RFC-001 §4.4)
 */
export enum UebaRiskLevel {
  NORMAL = 'NORMAL',                         // Score 0 - 29: Comportamento dentro do padrão baseline
  SUSPICIOUS = 'SUSPICIOUS',                 // Score 30 - 59: Atipicidade leve ou moderada
  ANOMALOUS = 'ANOMALOUS',                   // Score 60 - 74: Desvio evidente do padrão habitual (Alerta DPO)
  HIGH_RISK = 'HIGH_RISK',                   // Score 75 - 89: Risco elevado de exfiltração (Desafio 2FA compulsório)
  CRITICAL_EXFILTRATION = 'CRITICAL_EXFILTRATION' // Score 90 - 100: Ataque em curso ou exfiltração em massa (Suspensão preventiva)
}

/**
 * Categorias Heurísticas de Anomalia de Acesso a Prontuários (LGPD Art. 46 & CFP nº 001/2009)
 */
export enum UebaAnomalyType {
  OFF_HOURS_ACCESS = 'OFF_HOURS_ACCESS',                     // Acesso fora do horário habitual de atendimento (ex: madrugada/finais de semana)
  BULK_RECORD_SCRAPING = 'BULK_RECORD_SCRAPING',             // Consulta massiva e sequencial de múltiplos prontuários em janela curta
  SOAP_MASS_READ = 'SOAP_MASS_READ',                         // Varredura de notas clínicas SOAP sem agendamento associado
  UNUSUAL_GEO_IP_JUMP = 'UNUSUAL_GEO_IP_JUMP',               // Salto geográfico ou conexão a partir de ASN/país não habitual
  BLIND_INDEX_ENUMERATION = 'BLIND_INDEX_ENUMERATION',       // Múltiplas buscas cegas de CPF/e-mail (tentativa de dicionário/enumeração)
  UNLINKED_PATIENT_ACCESS = 'UNLINKED_PATIENT_ACCESS',       // Tentativa de acesso a prontuário sem vínculo clínico terapêutico
  RAPID_CONCURRENT_SESSIONS = 'RAPID_CONCURRENT_SESSIONS'    // Sessões concorrentes simultâneas em múltiplos dispositivos distintos
}

/**
 * Ações de Contenção Automática e Mitigação Preventiva do UEBA
 */
export enum UebaContainmentAction {
  NONE = 'NONE',                                     // Nenhuma ação punitiva; telemetria rotineira
  FLAG_WORM_AUDIT = 'FLAG_WORM_AUDIT',               // Registro de incidente com flag na trilha WORM inviolável
  STEP_UP_2FA_CHALLENGE = 'STEP_UP_2FA_CHALLENGE',   // Exigência de reautenticação imediata com segundo fator (TOTP/Passkey)
  SUSPEND_SESSION = 'SUSPEND_SESSION',               // Revogação imediata do token JWT e encerramento da sessão clínica
  QUARANTINE_IP_AND_ACCOUNT = 'QUARANTINE_IP_AND_ACCOUNT' // Bloqueio temporário da conta e isolamento do IP de origem
}

/**
 * Status do Incidente de Contenção UEBA
 */
export enum UebaContainmentStatus {
  ACTIVE_CONTAINMENT = 'ACTIVE_CONTAINMENT', // Contenção ativa e restrição vigente
  RELEASED = 'RELEASED',                     // Contenção liberada formalmente pelo DPO ou administrador
  ACKNOWLEDGED = 'ACKNOWLEDGED'              // Incidente revisado e arquivado para conformidade
}

/**
 * Mecanismos Matemáticos de Adição de Ruído Criptográfico (Differential Privacy)
 */
export enum DpMechanism {
  LAPLACE = 'LAPLACE',   // Pure ε-DP: Mecanismo de Laplace para sensibilidade L1 (Δf / ε)
  GAUSSIAN = 'GAUSSIAN'  // (ε, δ)-DP: Mecanismo Gaussiano com relaxamento delta
}

/**
 * Tipos de Agregações Estatísticas Suportadas com Proteção Diferencial
 */
export enum DpQueryType {
  COUNT = 'COUNT',         // Sensibilidade Δf = 1 (contagens de coortes e prevalências)
  MEAN = 'MEAN',           // Sensibilidade Δf = (B - A) / n (médias clínicas com clipping)
  SUM = 'SUM',             // Sensibilidade Δf = B - A (somatórios com truncamento)
  HISTOGRAM = 'HISTOGRAM'  // Sensibilidade Δf = 1 (partições de frequência mutuamente exclusivas)
}

/**
 * Estado do Orçamento de Privacidade (Privacy Budget Accountant)
 */
export enum DpBudgetStatus {
  HEALTHY = 'HEALTHY',     // Orçamento restante > 20%
  WARNING = 'WARNING',     // Orçamento restante <= 20% (alerta prévio ao pesquisador e DPO)
  EXHAUSTED = 'EXHAUSTED'  // Orçamento esgotado (novas consultas bloqueadas por mitigação anti-reconstrução)
}

/**
 * Métricas Epidemiológicas e Clínicas de Pesquisa em Saúde Mental
 */
export enum DpCohortMetric {
  DIAGNOSIS_DISTRIBUTION = 'DIAGNOSIS_DISTRIBUTION',           // Prevalência de transtornos mentais (CID-11)
  GAD7_SEVERITY_SCORE = 'GAD7_SEVERITY_SCORE',                 // Escore psicométrico de ansiedade (0 - 21)
  PHQ9_SEVERITY_SCORE = 'PHQ9_SEVERITY_SCORE',                 // Escore psicométrico de depressão (0 - 27)
  REMISSION_DURATION_SESSIONS = 'REMISSION_DURATION_SESSIONS', // Número de sessões clínicas até remissão sintomática
  AGE_GROUP_DEMOGRAPHICS = 'AGE_GROUP_DEMOGRAPHICS'            // Distribuição demográfica de faixas etárias
}

/**
 * Status do Projeto de Pesquisa Clínica Homologado pelo CEP / DPO
 */
export enum DpResearchStatus {
  ACTIVE = 'ACTIVE',     // Autorizado com cota de privacidade vigente
  DEPLETED = 'DEPLETED', // Orçamento ε completamente consumido
  REVOKED = 'REVOKED'    // Acesso suspenso por violação de protocolo ético
}

/**
 * Modo de Vinculação Criptográfica da Sessão Clínica (RFC-001 §4.4 & RFC 9449 DPoP)
 */
export enum SessionBindingMode {
  STRICT_DPOP = 'STRICT_DPOP',                 // Vinculação Criptográfica Estrita com Par de Chaves ECDSA P-256 (RFC 9449)
  DPOP_BOUND = 'DPOP_BOUND',                   // Vinculação Criptográfica com Par de Chaves ECDSA P-256 do Cliente (RFC 9449)
  COOKIE_BOUND = 'COOKIE_BOUND',               // Vinculação a Cookie Criptografado com SameSite Strict
  DEVICE_FINGERPRINT = 'DEVICE_FINGERPRINT',   // Vinculação por Fingerprint Criptográfico de Hardware/Navegador
  BEARER_LEGACY = 'BEARER_LEGACY'              // Token Bearer convencional sem prova de posse (Não recomendado)
}

/**
 * Ciclo de Vida da Sessão do Profissional de Saúde
 */
export enum SessionLifecycleStatus {
  ACTIVE = 'ACTIVE',                                       // Sessão ativa e plenamente autorizada
  TERMINATED_BY_USER = 'TERMINATED_BY_USER',               // Revogada voluntariamente pelo psicólogo
  REVOKED_BY_USER = 'REVOKED_BY_USER',                     // Revogada remotamente pelo próprio psicólogo
  REVOKED_CONCURRENT_LIMIT = 'REVOKED_CONCURRENT_LIMIT',   // Interrompida por excesso de dispositivos concorrentes (Eviction)
  REVOKED_BY_CONCURRENCY = 'REVOKED_BY_CONCURRENCY',       // Interrompida por excesso de dispositivos concorrentes
  FORCE_KILLED_ADMIN = 'FORCE_KILLED_ADMIN',               // Encerrada em massa por Kill Switch Administrativo
  REVOKED_BY_DPO = 'REVOKED_BY_DPO',                       // Interrompida compulsória pelo Encarregado (DPO / Segurança)
  EXPIRED = 'EXPIRED'                                      // Expirada por inatividade ética
}

/**
 * Categoria do Dispositivo de Acesso Clínico
 */
export enum SessionDeviceType {
  DESKTOP = 'DESKTOP',                                     // Estação de trabalho / Notebook clínico genérico
  DESKTOP_CHROME = 'DESKTOP_CHROME',                       // Navegador Google Chrome Desktop
  DESKTOP_FIREFOX = 'DESKTOP_FIREFOX',                     // Navegador Mozilla Firefox Desktop
  DESKTOP_SAFARI = 'DESKTOP_SAFARI',                       // Navegador Apple Safari macOS
  MOBILE = 'MOBILE',                                       // Dispositivo móvel / Smartphone genérico
  MOBILE_IOS = 'MOBILE_IOS',                               // Apple iPhone / iOS
  MOBILE_ANDROID = 'MOBILE_ANDROID',                       // Google Android
  TABLET = 'TABLET',                                       // Tablet clínico / iPad
  CLINICAL_WORKSTATION = 'CLINICAL_WORKSTATION',           // Terminal dedicado de consultório homologado
  UNKNOWN = 'UNKNOWN'                                      // Origem genérica / Não classificada
}

/**
 * Tiers de Dificuldade de Prova de Trabalho Criptográfica (PoW Hashcash Moderno)
 */
export enum PowDifficultyTier {
  NONE = 'NONE',       // Dificuldade 0: Acesso comum sem PoW
  LOW = 'LOW',         // Dificuldade 3: Desafio leve (~4k iterações)
  MEDIUM = 'MEDIUM',   // Dificuldade 4: Desafio moderado (~65k iterações)
  HIGH = 'HIGH',       // Dificuldade 5: Desafio alto (~1M iterações)
  MAXIMUM = 'MAXIMUM'  // Dificuldade 6: Contenção extrema para ataques massivos
}

/**
 * Categorias Heurísticas de Ataques de Força Bruta (OWASP Automated Threats OAT-007 / OAT-008)
 */
export enum BruteForceThreatCategory {
  CREDENTIAL_STUFFING = 'CREDENTIAL_STUFFING',   // Uso automatizado de listas vazadas de credenciais (OAT-007)
  DICTIONARY_ATTACK = 'DICTIONARY_ATTACK',       // Ataque de dicionário contra senhas comuns (OAT-008)
  DISTRIBUTED_SPRAYING = 'DISTRIBUTED_SPRAYING', // Password spraying distribuído de múltiplos IPs
  RAPID_ENUMERATION = 'RAPID_ENUMERATION'        // Enumeração rápida de logins/CPFs de psicólogos
}

/**
 * Status do Desafio PoW
 */
export enum PowChallengeStatus {
  ISSUED = 'ISSUED',                     // Desafio gerado e entregue ao cliente
  SOLVED = 'SOLVED',                     // Desafio resolvido com sucesso
  EXPIRED = 'EXPIRED',                   // Desafio expirou sem resposta válida
  INVALID_SOLUTION = 'INVALID_SOLUTION', // Solução incorreta fornecida
  REPLAY_ATTEMPT = 'REPLAY_ATTEMPT'      // Tentativa de reutilização de desafio já consumido
}

/**
 * 33. PROTEÇÃO ANTI-AUTOMAÇÃO, HONEYPOT DINÂMICO & TARPIT CRIPTOGRÁFICO
 * (OWASP Automated Threats OAT-011 / OAT-020 & RFC-001 §4.4, §5.2)
 */

export enum ScraperThreatCategory {
  DATA_SCRAPING_OAT011 = 'DATA_SCRAPING_OAT011',               // Raspagem sistemática de dados de pacientes/terapeutas
  ACCOUNT_ENUMERATION_OAT020 = 'ACCOUNT_ENUMERATION_OAT020',   // Enumeração ou agregação maliciosa de contas
  HEADLESS_BOT_PROBE = 'HEADLESS_BOT_PROBE',                   // Sondagem por navegadores headless não autorizados
  RESOURCE_EXHAUSTION_OAT015 = 'RESOURCE_EXHAUSTION_OAT015'    // Tentativa de exaustão de conexões HTTP (DoS na camada de aplicação)
}

export enum TarpitDefenseStatus {
  ACTIVE = 'ACTIVE',         // Armadilhas honeypot ativas e monitoramento heurístico ligado
  ENGAGED = 'ENGAGED',       // Tarpit acionado contra requisição suspeita
  TARPITTING = 'TARPITTING', // Conexão presa no poço de piche sob atraso progressivo
  ISOLATED = 'ISOLATED',     // IP colocado em quarentena de baixa prioridade por reincidência
  RELEASED = 'RELEASED'      // Quarentena removida com parecer auditado pelo DPO
}

/**
 * 34. CERTIFICAÇÃO NOTARIAL DE SESSÃO CLÍNICA & CARIMBO DO TEMPO RFC 3161 / ICP-BRASIL TSA
 * (DOC-ICP-11, MP 2.200-2/2001, CFP nº 001/2009 e RFC-001 §3.4, §3.5, §4.4)
 */

export enum TsaAuthorityType {
  ICP_BRASIL_ACT = 'ICP_BRASIL_ACT',             // Autoridade de Carimbo do Tempo credenciada pelo ITI / ICP-Brasil (DOC-ICP-11)
  INTERNAL_NOTARY_TSA = 'INTERNAL_NOTARY_TSA',   // TSA corporativa interna de alta tempestividade (RFC 3161)
  FEDERATED_HEALTH_TSA = 'FEDERATED_HEALTH_TSA'  // Autoridade notarial da federação interoperável em saúde mental
}

export enum TimestampVerificationStatus {
  VALID = 'VALID',                                     // Carimbo do tempo íntegro, autêntico e tempestivo
  HASH_MISMATCH = 'HASH_MISMATCH',                     // O digest dos dados da sessão difere do MessageImprint
  NONCE_MISMATCH = 'NONCE_MISMATCH',                   // Nonce não corresponde ao desafio original (ataque de replay)
  SIGNATURE_INVALID = 'SIGNATURE_INVALID',             // Assinatura digital da TSA violada ou corrompida
  EXPIRED_TSA_CERTIFICATE = 'EXPIRED_TSA_CERTIFICATE', // Certificado digital da TSA expirado no momento da validação
  UNAUTHORIZED_POLICY = 'UNAUTHORIZED_POLICY'          // Política de carimbo (OID) não autorizada
}

export enum TimestampTamperType {
  NONE = 'NONE',
  CORRUPT_IMPRINT = 'CORRUPT_IMPRINT',
  ALTER_TIMESTAMP = 'ALTER_TIMESTAMP',
  TAMPER_NONCE = 'TAMPER_NONCE',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE'
}





