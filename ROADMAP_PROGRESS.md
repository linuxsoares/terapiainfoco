# 📋 TerapiaInFoco — Status de Implementação & Próximos Passos (RFC-001)

> **Documento de Continuidade Operacional**  
> **Data:** 14/10/2026  
> **Status Geral:** 8 Módulos Principais + 34 Extensões de Segurança + Suporte Mobile + Ficha de Anamnese & Retificação CFP + Métricas Prometheus & Tracing OTel + WebAuthn Passkeys + Auditoria Contínua & Relatório RIPD/DPIA + Conectores SIEM Externos + Gestão de Chaves KMS + Homologação sob Carga + Exportador Automático OpenTelemetry OTLP + Dashboard Executivo de Governança & Compliance Package Multi-Normativo + Hardening HTTP (CSP/HSTS) & Honeypot + Google Meet REST API v2 + Auditoria de Sessão WebRTC com Fingerprint DTLS-SRTP & Safety Numbers + WAF Integrado com Detecção Heurística de SQLi/XSS & Registro WORM + Simulador de Resiliência de Redes & Fala Clínica (ITU-T G.107 / CFP 011/2018) + Gravação Cifrada com Sharding de Mídia, Envelope Encryption e Crypto-Shredding WORM (RFC §3.2, §4.2, LGPD Art. 16, CFP nº 011/2018) + Detector de Desconexão Abrupta & Protocolo de Reconexão Segura (RFC §3.2 & CFP nº 011/2018) + Protocolo Forense de Assinaturas com Provas de Conhecimento Zero (ZKP - RFC §3.4, §3.5 & CFP nº 006/2019) + Detecção Proativa de Vazamento de Credenciais na Dark Web & Contenção DPO (Threat Intelligence k-Anonymity NIST SP 800-63B / LGPD Art. 46, 48) + Controle Granular de Consentimento do Paciente com Smart Revocation & Trilha Consent-Led (LGPD Art. 7/8/9/11/18 & CFP nº 006/2019) + Data Loss Prevention (DLP) no Clipboard Clínico com Marca d'Água Esteganográfica Zero-Width & Prevenção de Exfiltração de Prontuários (LGPD Art. 46 & CFP nº 001/2009) + Cartório Notarial Digital de Prontuários & Auditoria Forense Zero-Knowledge (CFP nº 001/2009 e LGPD Art. 18) + Mecanismo de Descarte e Expurgamento Seguro de Dados Históricos por Fim de Ciclo de Tratamento com Prova Criptográfica de Destruição (LGPD Art. 16, CFP nº 001/2009) + Protocolo de Federação de Chaves e Identidades Clínicas Descentralizadas (DID / Verifiable Credentials - W3C DID v1.0, W3C VC v2.0, RFC-001 §3.5) + Análise Comportamental Preditiva de Acesso Anômalo (UEBA - User and Entity Behavior Analytics) para Detecção de Exfiltração Interna em Prontuários (RFC-001 §4.4 & LGPD Art. 46) + Protocolo Criptográfico de Anonimização Estatística Diferencial (Differential Privacy - ε-DP) para Pesquisa Clínica e Benchmarks Epidemiológicos (LGPD Art. 13 & CFP nº 001/2009) + Gestão de Sessões Clínicas com Token Binding DPoP RFC 9449 & Revogação Concorrente + Módulo de Detecção e Prevenção de Brute-Force & Credential Stuffing com PoW Criptográfico Dinâmico (OWASP OAT-007/OAT-008 & NIST SP 800-63B) + Proteção Anti-Automação, Honeypot Dinâmico & Tarpit Criptográfico (OWASP OAT-011/OAT-020) + Certificação Notarial de Sessão Clínica em Tempo Real com Timestamping RFC 3161 & ICP-Brasil Time-Stamping Authority (DOC-ICP-11, MP 2.200-2/2001, Resolução CFP nº 001/2009 e RFC-001 §3.4, §3.5, §4.4) + Blindagem contra Parameter Pollution (HPP) e Injeção de Cabeçalhos (CRLF) em Endpoints Críticos (OWASP Top 10 API Security & RFC-001 §4.4, §5.2) | 617/617 Testes Passando



---

## 🧭 Visão Geral da Arquitetura

O projeto implementa a especificação técnica **RFC-001** (*Plataforma de Gestão Clínica Psicológica com Teleatendimento, Transcrição Assistida por IA e Criptografia LGPD*), estruturado em monorepo com isolamento estrito de domínios e camadas de segurança.

```
terapiainfoco/
├── apps/
│   ├── landingpage/       # Landing page institucional & simuladores (React 19 + Tailwind v4)
│   ├── frontend/          # Painel clínico autenticado para psicólogos (React 19 + Tailwind v4)
│   └── backend/           # API REST Hono/Bun com arquitetura modular RFC-001
├── packages/
│   ├── shared/            # Modelos, DTOs, Enums e Tipos de Dados da RFC-001
│   └── crypto/            # Core criptográfico LGPD: AES-256-GCM, KMS e Blind Indexing
└── ROADMAP_PROGRESS.md    # Este documento de referência
```

---

## ✅ O Que Já Foi Implementado

### 1. Fundação do Monorepo & DevX
- [x] Configuração de **Bun Workspaces** e dependências compartilhadas.
- [x] **Makefile** como ferramenta central de comandos unificados (`make dev`, `make test`, `make build`, `make clean`).
- [x] **GitHub Actions Workflow** (`.github/workflows/deploy.yml`) preservado e funcional para deploy contínuo da landing page (`terapiainfoco.com.br`).
- [x] Suíte de testes unitários e de integração com 14 testes passando (`bun test`).

### 2. Camada Criptográfica LGPD (`packages/crypto`)
- [x] **Envelope Encryption (RFC §4.2):** KEK mestre no KMS gerenciando DEKs isoladas por contexto, descartadas da memória RAM logo após o uso.
- [x] **Field-Level Encryption (FLE):** Cifragem simétrica com `AES-256-GCM` (IV de 12 bytes + Tag de autenticação de 16 bytes).
- [x] **Blind Indexing (RFC §4.3):** Hashes determinísticos com `HMAC-SHA256` e salt secreto para busca exata de CPF e e-mail sem expor dados sensíveis no PostgreSQL.
- [x] **Quarentena Criptográfica & Pseudonimização (RFC §4.1):** Mecanismo de anonimização ativa preservando histórico criptografado pelo prazo legal de 5 anos (Resolução CFP nº 001/2009 vs LGPD Art. 16).

### 3. Banco de Dados PostgreSQL & Drizzle ORM (`apps/backend/src/db`)
- [x] Schema Drizzle mapeando as entidades relacionais da RFC:
  - `therapists` (cadastro e-Psi e DEK cifrada)
  - `patients` (PII cifrado com FLE + Blind Indexes de CPF e e-mail)
  - `appointments` (grade horária e links Meet cifrados)
  - `session_transcriptions` (áudios e transcrições com chaves de armazenamento)
  - `clinical_records` (quadrantes SOAP cifrados e hash de assinatura)
  - `psychological_documents` (documentos CFP 006/2019 com token de validação)
  - `audit_logs` (trilha de auditoria WORM imutável)
- [x] Fallback automático para `@electric-sql/pglite` (Postgres 16 WASM) quando não há banco externo, permitindo execução offline imediata.
- [x] **Auto-Migração no Boot & Resiliência Supabase:** Inicialização assíncrona/síncrona de `getDb()` no boot do container, resolução dinâmica de diretórios `drizzle/`, fallback SQL statement-by-statement tolerante a transaction pooling (PgBouncer porta 6543) e seed idempotente do terapeuta padrão.
- [x] **Persistência Ativa & Sincronização Supabase (Fix):** Persistência automática de pacientes, usuários e agendamentos nas tabelas do Supabase/PostgreSQL com Drizzle ORM, compatibilidade com UUIDs e foreign keys, sincronização bidirecional banco -> RAM no boot, e suporte a cadastro no Supabase Auth Admin (`auth.users`).
- [x] `MemoryDatabase` para testes unitários ultra-rápidos e isolamento.

### 4. Backend API Hono (`apps/backend`)
- [x] **Módulo 1 & 2 (Agenda & Google Meet):**
  - `POST /api/appointments`: Validação obrigatória de buffer de 10 minutos entre sessões (RFC §3.1).
  - Bloqueio de sobreposição de horários e conflitos de agenda.
  - `GoogleMeetService`: Integração para links de teleconsulta e suporte a salas instantâneas.
- [x] **Módulo 2 (Gestão de Pacientes):**
  - `POST /api/patients`: Cadastro de paciente com Field-Level Encryption e registro de consentimento (TCLE).
  - `GET /api/patients/search/cpf`: Busca determinística rápida via Blind Index HMAC.
  - `POST /api/patients/:id/quarantine`: Quarentena criptográfica LGPD.
  - `POST /api/patients/:id/anamnesis` & `GET /api/patients/:id/anamnesis`: **Ficha de Admissão & Anamnese Biopsicossocial (RFC §3.4, Resoluções CFP nº 001/2009 e 004/2020)** com Field-Level Encryption (AES-256-GCM), versionamento incremental (v1, v2...), objetivos terapêuticos e segregação RBAC (HTTP 403 para recepção).
- [x] **Módulo 3 & 4 (Prontuário Eletrônico & Evolução SOAP):**
  - `POST /api/clinical-records/draft`: Rascunho com 4 eixos SOAP cifrados.
  - Segregação legal de anotações confidenciais do terapeuta (§3.4).
  - `POST /api/clinical-records/sign`: Assinatura compulsória com *Human-in-the-Loop* (§3.3), gerando hash SHA-256 e tornando o registro imutável (CFP nº 001/2009).
  - `POST /api/clinical-records/:id/rectify` & `GET /api/clinical-records/:id/rectifications`: **Termo de Retificação Formal para Prontuários Selados (RFC §3.4 e Resolução CFP nº 001/2009)** com averbação aditiva vinculada, canonical SHA-256 digest, revisão ética compulsória e auditoria WORM (sem mutação no registro original).
- [x] **Módulo 5 (Documentos Psicológicos CFP nº 006/2019):**
  - `POST /api/documents/draft`: Geração de rascunho de Declaração, Atestado, Relatório e Laudo com cifragem AES-256.
  - `POST /api/documents/sign`: Assinatura digital com hash PAdES/SHA-256 e selo imutável.
  - `GET /api/documents/validate/:token`: Validação pública Zero-Knowledge via QR Code (exibe autoria e iniciais do paciente sem vazar prontuário).
- [x] **Trilha de Auditoria WORM (`/api/audit`):**
  - Registro *append-only* inviolável de todas as ações de criação, leitura decriptada e assinatura digital.

### 5. Frontend Clínico (`apps/frontend`)
- [x] **Suporte Completo a Dark Mode & Light Mode:**
  - Contexto global `ThemeContext` com persistência em `localStorage`.
  - Fallback automático para `prefers-color-scheme`.
  - Compatibilidade com Tailwind CSS v4 (`@custom-variant dark`).
  - Alternador animado `ThemeToggle` no cabeçalho.
- [x] **Módulo de Agenda (`AgendaModule.tsx`):**
  - Visualização de horários, buffers e agendamento com Google Meet.
- [x] **Módulo de Pacientes (`PatientsModule.tsx`):**
  - Formulário com TCLE, banner explicativo de Blind Indexing e Quarentena LGPD.
  - **Ficha de Anamnese Biopsicossocial Interativa (CFP 001/2009 e 004/2020):** Modal estruturado por abas (*Queixa & Demanda*, *Histórico Biopsicossocial*, *Histórico Médico/Psiquiátrico*, *Metas Terapêuticas & Contato de Emergência*), indicador de versão incremental (`v1`, `v2`...) e selo de cifragem AES-256-GCM (FLE).
- [x] **Módulo SOAP & Transcrição com IA (`SoapModule.tsx`):**
  - Pipeline de áudio da teleconsulta e diarização com separação dos canais Terapeuta vs. Paciente e timestamps.
  - Alternância interativa entre transcrição diarizada e visualização com Sanitização LGPD Art. 11 (destaque visual de tokens protegidos).
  - Botão "Gerar Rascunho SOAP com IA" com síntese clínica dos 4 quadrantes (`S`, `O`, `A`, `P`) e notas privadas (§3.4).
  - Trava legal compulsória de *Human-in-the-Loop* (CFP nº 001/2009) e certificado visual de imutabilidade com hash SHA-256.
  - **Averbação de Termo de Retificação Formal (Resolução CFP nº 001/2009):** Para prontuários assinados (`isSigned === true`), modal de averbação com seletor de quadrante afetado (`S`, `O`, `A`, `P` ou Geral), justificativa ética formal, conteúdo aditivo e listagem cronológica expansível com hash SHA-256 canônico.
- [x] **Módulo de Documentos CFP (`DocumentsModule.tsx`):**
  - Seleção dos 4 modelos oficiais do CFP (Declaração, Atestado, Relatório, Laudo).
  - Papel timbrado digital formatado com cabeçalho oficial e assinatura.
  - Renderização de QR Code dinâmico em tempo real (`qrcode`).
  - Modal com simulador do Portal de Validação Pública de Autenticidade.
  - Suporte a impressão e exportação em PDF (`window.print`).
- [x] **Módulo de Auditoria (`AuditModule.tsx`):**
  - Tabela de logs WORM em tempo real com identificação de IP e ação.

### 6. Pipeline de Transcrição, Diarização & IA Pré-LLM (`packages/crypto` & `apps/backend`)
- [x] **Upload & Validação de TCLE (RFC §3.3):** Endpoint `/api/transcriptions/upload` com validação de consentimento prévio do paciente (LGPD Art. 11).
- [x] **Armazenamento Criptografado de Mídia:** Cifragem simétrica AES-256-GCM para transcrições e metadados de áudio no repouso.
- [x] **Motor de Sanitização de PII Pré-LLM (`packages/crypto/src/sanitizer.ts`):** Substituição determinística de CPFs, telefones, e-mails, CEPs, RGs e nomes próprios contextuais por tokens genéricos (`[PACIENTE]`, `[TERAPEUTA]`, `[TELEFONE]`, `[CPF]`, etc.) antes da transmissão à nuvem.
- [x] **Geração Assistida de SOAP (`/api/transcriptions/generate-soap`):** Síntese clínica automática estruturada sob os 4 eixos SOAP com aviso legal compulsório de revisão humana.

### 7. Experiência do Paciente & Validação Pública (`apps/landingpage` & `apps/backend`)
- [x] **Widget de Agendamento Online (`BookingWidget.tsx`):** Consulta de horários livres com buffer obrigatório de 10 minutos, cadastro simplificado com FLE/Blind Indexing e geração instantânea de sala virtual no Google Meet.
- [x] **Termo de Consentimento Livre e Esclarecido (TCLE):** Validação obrigatória de consentimento prévio para teleconsultas psicológicas (Res. CFP nº 011/2018).
- [x] **Portal Público de Validação de Autenticidade (`ValidationPortal.tsx`):** Validação pública Zero-Knowledge de documentos (Atestados, Relatórios, Declarações e Laudos) via QR Code ou token (`#validar` ou `?token=...`), preservando o sigilo do prontuário formal.
- [x] **Endpoints Públicos do Backend:** `GET /api/appointments/available-slots` e `POST /api/appointments/public/book` com bloqueio determinístico de sobreposições de agenda.

### 8. Camada de Autenticação Segura, 2FA/MFA, RBAC & Rate Limiting (RFC-001 Opção C)
- [x] **Motor Criptográfico TOTP RFC 6238 (`packages/crypto/src/totp.ts`):** Codificação Base32, geração de segredo de 160 bits, códigos de 6 dígitos com tolerância a clock drift (±30s) e emissão de códigos de backup de uso único para contingência.
- [x] **Autenticação JWT com Token Rotation (`apps/backend/src/services/authService.ts`):** Access tokens de 1 hora e refresh tokens com rotação e blacklist de tokens revogados para mitigar replay attacks. Senhas cifradas com Argon2id nativo.
- [x] **Fluxo Completo de 2FA/MFA:** Ativação com QR Code para Google Authenticator / Authy (`POST /api/auth/2fa/setup`), verificação inicial (`/2fa/verify`) e desafio de MFA no login via `tempToken` (`/2fa/validate`).
- [x] **Proteção de Força Bruta & Rate Limiting (`apps/backend/src/middlewares/rateLimiter.ts`):** Middleware com cabeçalhos HTTP padronizados (`X-RateLimit-*`, `Retry-After` e HTTP 429) e presets dedicados:
  - `authRateLimiter`: máx. 5 req/min para login/2FA contra força bruta.
  - `searchRateLimiter`: máx. 30 req/min para busca por Blind Index CPF contra enumeração de dados de saúde.
  - `validationRateLimiter`: máx. 20 req/min para validação de documentos via QR Code.
  - `publicBookingRateLimiter`: máx. 15 req/min contra spam de agendamentos.
- [x] **Role-Based Access Control (RBAC):** Segregação estrita entre perfis clínicos e administrativos:
  - `PSICOLOGO_TITULAR`: Acesso completo a prontuários, notas SOAP, IA, laudos e assinatura.
  - `SUPERVISOR_CLINICO`: Supervisão clínica e revisão de prontuários.
  - `RECEPCAO_SECRETARIA`: Acesso restrito a Agenda e Contatos; bloqueio compulsório de prontuários SOAP, laudos CFP e transcrições com HTTP 403 Forbidden.
  - `ADMIN`: Gestão de segurança e trilha de auditoria WORM.
- [x] **Painel Frontend de Segurança & 2FA (`SecurityModule.tsx` & `App.tsx`):** Exibição do status de 2FA, leitor dinâmico de QR Code com `qrcode`, simulação de papéis em tempo real e bloqueio educativo/legal de RBAC (CFP 001/2009 & LGPD Art. 11).

### 9. Geração Server-Side de PDFs CFP nº 006/2019 & Assinatura ICP-Brasil (RFC-001 Opção D)
- [x] **Motor Server-Side de Geração de PDFs (`pdfGeneratorService.ts`):**
  - Geração nativa em TypeScript de documentos em formato A4 timbrado oficial conforme a Resolução CFP nº 006/2019 para os 4 modelos (Atestado, Relatório, Laudo e Declaração).
  - Cabeçalho timbrado profissional com dados da psicóloga responsável, CRP e e-Psi.
  - Word-wrapping e paginação automática do texto e fundamentação técnica.
  - Embutimento dinâmico de **QR Code em alta resolução** apontando para o portal de validação Zero-Knowledge.
  - Selo criptográfico com token de validação, hash SHA-256 e carimbo de autenticidade documental.
- [x] **Assinatura Digital Qualificada ICP-Brasil & TSA RFC 3161 (`icpBrasilService.ts`):**
  - Validação de cadeia de confiança ICP-Brasil (AC Soluti, AC Certisign, AC Serasa Experian, AC Notarial, etc.) conforme **MP nº 2.200-2/2001**.
  - Checagem estrita de período de vigência de certificados A1/A3 e emissão de Carimbo do Tempo (Timestamp Authority - TSA).
  - Cálculo de digest canônico SHA-256 do PDF para signing tools e PAdES detached (`ETSI.CAdES.detached`).
  - Garantia de imutabilidade jurídica e ética contra adulterações pós-assinatura.
- [x] **Endpoints Backend com RBAC e Rate Limiting (`apps/backend/src/routes/documents.ts`):**
  - `GET /api/documents/:id/pdf`: streaming binário HTTP do arquivo PDF timbrado (`Content-Type: application/pdf`).
  - `POST /api/documents/:id/prepare-icp-signature`: preparação e digest SHA-256 canônico.
  - `POST /api/documents/:id/sign-icp`: aplicação de assinatura digital qualificada com certificado ICP-Brasil.
- [x] **Interface Frontend Integrada (`apps/frontend`):**
  - Botão **"Baixar PDF Timbrado"** em [`DocumentsModule.tsx`](file:///Users/gilmar/projects/terapiainfoco/apps/frontend/src/components/DocumentsModule.tsx) para download de documento oficial.
  - Modal **"Assinar com ICP-Brasil (PAdES)"** com detecção de certificado e confirmação.
  - Selo visual verde de conformidade ICP-Brasil na folha timbrada e no portal de validação.
  - Badges de indicação ICP-Brasil na lista lateral de documentos.

---

### 10. Dashboard Clínico, Métricas Longitudinais & Observabilidade de Segurança (RFC-001 Opção E)
- [x] **Serviço de Analytics & Métricas Clínicas (`analyticsService.ts`):**
  - Consolidação longitudinal de dados de atendimento clínico: pacientes ativos vs. quarentenados LGPD, sessões agendadas, concluídas e canceladas.
  - Cálculo de **taxa de comparecimento e assiduidade (attendance rate)** em tempo real.
  - Taxa de conformidade de **Human-in-the-Loop compulsório** em notas SOAP (CFP nº 001/2009).
  - Agrupamento temporal de atendimentos por mês e distribuição dos 4 modelos oficiais CFP nº 006/2019 (Atestado, Relatório, Laudo, Declaração).
  - Análise longitudinal por paciente com timeline de evolução clínica, resumos dos eixos Subjetivo e Avaliação diagnóstica.
- [x] **Observabilidade de Segurança & Auditoria WORM (`analyticsService.ts`):**
  - Verificação de integridade estrutural e criptográfica da trilha WORM (`INTACT` - imutabilidade garantida por append-only).
  - Contabilização de leituras decifradas FLE (Field-Level Encryption), assinaturas digitais aplicadas e adoção de 2FA/MFA (TOTP RFC 6238).
  - Monitoramento de tentativas de força bruta e requisições interceptadas por Rate Limiting (HTTP 429).
  - Feed de alertas de segurança com classificação de severidade (`INFO`, `WARN`, `ALERT`) e IP de origem.
- [x] **Endpoints Backend com RBAC Estrito (`apps/backend/src/routes/analytics.ts`):**
  - `GET /api/analytics/clinical-overview`: KPIs consolidados do consultório.
  - `GET /api/analytics/security-metrics`: observabilidade e telemetria de segurança.
  - `GET /api/analytics/patient/:patientId`: métricas e evolução longitudinal individual.
- [x] **Interface Frontend Integrada (`DashboardModule.tsx` & `App.tsx`):**
  - Alternador dinâmico entre **Visão Clínica** e **Segurança & WORM**.
  - Gráfico responsivo em barras do volume mensal de sessões psicológicas.
  - Barras de distribuição dos 4 modelos formais de documentos do CFP.
  - Seletor de paciente com histórico detalhado e linha do tempo de evolução terapêutica.
  - Suporte completo a **Light Mode** e **Dark Mode** e bloqueio educativo para perfil de secretária (RBAC).

### 11. Portabilidade de Dados & Exportação Criptografada (RFC-001 Opção F - LGPD Art. 18 & Resoluções CFP)
- [x] **Serviço de Portabilidade e Exportação (`portabilityService.ts`):**
  - Consolidação e decifragem autorizada de prontuário psicológico completo: dados cadastrais, consentimentos (TCLE), agendamentos, evoluções SOAP assinadas, documentos emitidos e transcrições com diarização.
  - Formato aberto e interoperável JSON (LGPD Art. 18, inciso V) para portabilidade sem aprisionamento tecnológico.
  - Cálculo de **Checksum SHA-256 canônico** do pacote estruturado para verificação de integridade pelo destinatário.
  - Resumo de acessos da trilha de auditoria e carimbo formal de exportação.
- [x] **Criptografia Simétrica por Passphrase (`passphrasePackage.ts`):**
  - Cifragem do pacote de prontuário por frase secreta (passphrase) definida pelo titular ou terapeuta via **AES-256-GCM** com derivação de chave **PBKDF2-HMAC-SHA512** (100.000 iterações e Salt de 128 bits).
  - Validação estrita de autenticidade (Auth Tag GCM) impedindo adulteração ou decifragem com senha incorreta.
- [x] **Revogação Formal de Consentimento & Retenção Legal CFP (`portabilityService.ts`):**
  - Endpoint `POST /api/patients/:id/revoke-consent` para cancelamento de telepsicologia ou transcrição assistida por IA (LGPD Art. 18, IX).
  - Harmonização com a **Resolução CFP nº 001/2009 (Art. 4º)** e **LGPD (Art. 16, I)**: preservação e salvaguarda da guarda sigilosa dos registros de atendimento pelo período mínimo legal de 5 anos.
  - Opção de quarentena de dados e anonimização ativa de contato sob requisição expressa.
- [x] **Auditoria WORM & Controle de Acesso RBAC:**
  - Registro compulsório de eventos `AuditAction.DATA_EXPORT` e `AuditAction.CONSENT_REVOCATION` na trilha imutável.
  - Bloqueio estrito de acesso para perfil de Recepção/Secretária (HTTP 403 Forbidden) e requisições sem token (HTTP 401 Unauthorized).
- [x] **Interface Frontend no Módulo de Pacientes (`PatientsModule.tsx`):**
  - Botão de ação "Portabilidade LGPD (Art. 18)" e modal interativo para seleção de formato (JSON vs. Criptografado por Senha).
  - Cópia com um clique do Checksum SHA-256 e download imediato do arquivo gerado (`.json`).
  - Modal de "Revogar Consentimento" com justificativa, opção de quarentena e aviso transparente sobre a retenção de 5 anos do CFP.
  - Total compatibilidade com **Light Mode** e **Dark Mode**.

---

### 12. Backup Criptografado & Disaster Recovery com KMS (RFC-001 Opção G - §4.2, §4.4, §5.2)
- [x] **Serviço de Backup e Snapshot Criptografado (`backupService.ts`):**
  - Captura estruturada de todo o estado relacional do banco (terapeutas, pacientes, consultas, prontuários SOAP, documentos, transcrições, usuários e logs de auditoria).
  - Criptografia em repouso com **Envelope Encryption via Cloud KMS / HSM**: geração de DEK temporária de 256 bits, cifra com **AES-256-GCM** e envelopamento da chave pela Master Key (KEK) com zeroização em RAM.
  - Cálculo de **Checksum SHA-256 canônico** do envelope cifrado para garantia de não-adulteração.
  - Política de retenção e rotação automática mantendo os últimos 20 snapshots mais recentes.
- [x] **Simulação de Disaster Recovery & Verificação Contínua (`backupService.ts`):**
  - Endpoint `POST /api/backups/:id/verify`: decifragem via KMS, validação da Auth Tag GCM e checagem do Checksum SHA-256 sem afetar o banco ativo.
  - Métricas de **RPO** (tempo decorrido desde o último backup - meta < 24h) e **RTO** medido em tempo real (tempo de decifragem e validação da base).
- [x] **Restauração Emergencial de Desastre (`backupService.ts`):**
  - Endpoint `POST /api/backups/:id/restore` restrito estritamente a perfil Administrador (`ADMIN`).
  - Restabelecimento integral e atômico do banco de dados com registro mandatório na trilha de auditoria WORM (`AuditAction.BACKUP_RESTORE`).
- [x] **Auditoria WORM & Controle de Acesso RBAC:**
  - Registro compulsório de eventos `BACKUP_CREATE`, `BACKUP_VERIFY` e `BACKUP_RESTORE`.
  - Bloqueio de secretária (HTTP 403 Forbidden) e requisições sem token (HTTP 401 Unauthorized).
- [x] **Interface Frontend Dedicada (`BackupModule.tsx` & `App.tsx`):**
  - Painel com KPIs de RPO, RTO estimado, total de snapshots e status de integridade.
  - Tabela com histórico, download do arquivo cifrado (`.kms-backup.json`), botão "Testar DR" e modal de confirmação de restauração para Admin.
  - Suporte completo a **Light Mode** e **Dark Mode**.

---

### 13. Trilha de Auditoria Externa, Hash-Chain WORM & Relatório DPO/CFP (RFC-001 Opção H - §4.4, §5.2 e LGPD Art. 37/38/50)
- [x] **Ledger Imutável Criptográfico SHA-256 (Hash-Chain WORM):**
  - Encadeamento sequencial de blocos de auditoria onde cada entrada contém `sequenceNumber`, `previousHash` e seu próprio `hash` calculado canonicamente via **SHA-256** de todos os atributos.
  - Bloco gênesis padronizado (`0000...0000` de 64 caracteres) com garantia *Tamper-Evident*: qualquer alteração, injeção ou remoção retroativa rompe a cadeia imediatamente.
- [x] **Verificação Contínua de Integridade da Cadeia (`verifyChainIntegrity`):**
  - Algoritmo que recalcula e atesta cada elo da cadeia em tempo de execução, detectando e apontando com precisão o índice exato de qualquer bloco adulterado (`tamperedAtIndex`).
  - Endpoint dedicado `GET /api/audit/verify-chain`.
- [x] **Relatório Formal de Conformidade para DPO e Fiscalização do CFP (`generateComplianceReport`):**
  - Consolidação oficial fundamentada nos Artigos 37, 38 e 50 da **LGPD** e Resoluções **CFP nº 001/2009, 011/2018 e 006/2019**.
  - Metadados do controlador, DPO, responsável técnico com CRP e resumo estatístico de operações sensíveis (leituras decriptadas, assinaturas, quarentenas e backups).
  - Emissão de **Checksum SHA-256 canônico** do relatório completo para garantia de fé pública e autenticidade forense.
- [x] **Exportação Forense em Múltiplos Formatos:**
  - Endpoint `GET /api/audit/export/csv`: download de planilha formatada RFC 4180 contendo todos os registros encadeados.
  - Endpoint `GET /api/audit/export/json`: download do pacote estruturado e assinado para auditorias externas.
- [x] **Controle de Acesso RBAC Estrito:**
  - Acesso à trilha restrito exclusivamente a `ADMIN` e `PSICOLOGO_TITULAR` (secretária e não-autenticados bloqueados com HTTP 403 / 401).
- [x] **Interface Frontend Avançada (`AuditModule.tsx`):**
  - Status em tempo real da integridade da hash-chain com badge *"Tamper-Evident: 100% Íntegro"*.
  - Botão de validação sob demanda *"Verificar Cadeia SHA-256"*.
  - Botões para download direto de *"CSV Forense"* e *"Relatório DPO (JSON)"*.
  - Filtros dinâmicos por ação e recurso, com exibição de `#Seq`, `Hash SHA-256` e `IP de Origem`.

---

### 14. Rate Limiting Distribuído com Redis & Cache Criptográfico em Memória (RFC-001 Opção I - §4.2, §4.4)
- [x] **Store de Rate Limiting Distribuído Multi-Instâncias (`rateLimitStore.ts`):**
  - Implementação de `RedisRateLimitStore` baseada em **Scripts Lua atômicos** (`INCR` + `PEXPIRE` / `PTTL`), eliminando race conditions em clusters com múltiplos pods/nós.
  - Implementação de `ResilientRateLimitStore` com **Circuit Breaker & Graceful Degradation**: fallback imediato e transparente para `InMemoryRateLimitStore` caso o Redis falhe ou esteja indisponível, sem interrupção de serviço.
  - Emissão de cabeçalhos padronizados HTTP: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` e `X-RateLimit-Store` (`redis` ou `memory`).
- [x] **Motor de Cache Criptográfico em Memória RAM (`EncryptedInMemoryCache` em `@terapiainfoco/crypto`):**
  - Cifragem em repouso volátil utilizando **AES-256-GCM** com Data Encryption Key (DEK) de 256 bits gerada aleatoriamente em memória (`crypto.randomBytes(32)`).
  - Proteção contra extração de dados sensíveis e PII de pacientes em caso de inspeção de heap memory, core dumps ou vazamentos em ambientes multi-tenant.
  - Expiração automática por TTL, descarte e detecção de adulteração de memória via GCM Auth Tag.
  - Rotação sob demanda da DEK em RAM com recifragem imediata e descarte seguro (`zeroize`) da chave anterior.
- [x] **Endpoints Administrativos de Sistema (`/api/system`):**
  - `GET /api/system/rate-limit/status`: Telemetria em tempo real do store ativo, chaves monitoradas e status de conexão.
  - `POST /api/system/rate-limit/reset`: Desbloqueio e reset administrativo de IPs ou chaves específicas por administradores.
  - `GET /api/system/cache/stats`: Estatísticas de observabilidade (Hit Ratio %, objetos cifrados, bytes em RAM e idade da DEK).
  - `POST /api/system/cache/rotate-key`: Disparo de rotação manual da DEK em RAM com auditoria WORM.
  - Controle estrito de RBAC: acesso restrito a `ADMIN` (secretária bloqueada com HTTP 403 Forbidden e não-autenticados com HTTP 401).
- [x] **Painel Frontend de Infraestrutura & Segurança (`SecurityModule.tsx`):**
  - Card dedicado com status do motor de Rate Limiting (`Redis Cluster Distribuído` vs. `In-Memory Fallback Local`).
  - Painel de métricas do Cache Criptográfico em RAM (Hit Ratio, bytes cifrados e idade da chave).
  - Formulário para Administrador desbloquear IP ou limpar rate limits e botão para rotacionar a DEK em RAM.
  - Totalmente adaptativo com suporte a **Light Mode** e **Dark Mode**.

---

### 15. Webhooks Assinados (HMAC-SHA256) & Notificações de Segurança em Tempo Real (RFC-001 Opção J - §4.4, §5.2 e LGPD Art. 48)
- [x] **Motor Criptográfico HMAC-SHA256 (`webhookSignature.ts` em `@terapiainfoco/crypto`):**
  - Geração canônica de assinaturas baseadas no RFC 2104 via HMAC-SHA256 para payloads de eventos em trânsito.
  - Formato padronizado de cabeçalho: `X-TerapiaInFoco-Signature: t=1697123456,v1=abcdef...`.
  - **Mitigação de Replay Attacks:** Inclusão compulsória do timestamp UNIX `t` no hash assinado com tolerância máxima de 300 segundos (5 minutos).
  - **Proteção contra Timing Attacks:** Validação da assinatura com `crypto.timingSafeEqual` para blindagem contra análise de canal lateral.
  - Geração de segredos exclusivos por endpoint com prefixo `whsec_...` gerados via `crypto.randomBytes(24)`.
- [x] **Serviço de Despacho & Notificação em Tempo Real (`webhookService.ts`):**
  - Disparo assíncrono para múltiplos endpoints cadastrados associados a eventos de segurança (`notifyEvent`).
  - Cabeçalhos de rastreamento forense: `X-TerapiaInFoco-Delivery-Id`, `X-TerapiaInFoco-Event` e `User-Agent: TerapiaInFoco-Webhooks/1.0`.
  - Hooks automáticos acionados em eventos críticos: exportação de dados (LGPD Art. 18), revogação de consentimento, restauração de backup e alertas de incidentes.
  - Simulação de testes sob demanda (`POST /api/webhooks/:id/test`) com registro de latência em milissegundos e status HTTP.
  - Histórico de entregas (`WebhookDeliveryLog`) persistindo os últimos 100 registros com detalhes forenses.
- [x] **Endpoints REST Administrativos (`/api/webhooks`):**
  - `GET /api/webhooks`: Listagem de endpoints cadastrados com segredos e status de entrega.
  - `POST /api/webhooks`: Registro de novo webhook com validação estrita de HTTPS e seleção de eventos.
  - `PATCH /api/webhooks/:id`: Atualização de descrição, URL ou pausa temporária do webhook.
  - `DELETE /api/webhooks/:id`: Remoção segura da inscrição.
  - `POST /api/webhooks/:id/test`: Disparo simulado com medição de entrega em tempo real.
  - `GET /api/webhooks/:id/logs`: Consulta dos logs de entrega do endpoint.
  - Controle de Acesso RBAC Estrito: Acesso restrito a `ADMIN` (bloqueio 403 para secretária/terapeuta e 401 para anônimos).
- [x] **Interface Frontend de Gestão de Webhooks (`SecurityModule.tsx`):**
  - Card dedicado no painel de segurança exibindo todos os endpoints, status (Ativo/Pausado) e badges dos eventos inscritos.
  - Cópia do segredo HMAC (`whsec_...`) com um clique.
  - Botão *"Testar Envio HMAC"* executando teste de entrega em tempo real com retorno de status HTTP e latência.
  - Modal interativo *"Cadastrar Novo Webhook"* com seleção por checkbox de eventos críticos e validação de URL HTTPS.
  - Totalmente adaptativo com suporte a **Light Mode** e **Dark Mode**.

---

### 16. Infraestrutura de Nuvem, Containers & Deployment no Railway (DevOps & RFC §5.2)
- [x] **Configuração de Deployment Automatizado (`railway.json` & `Dockerfile`):**
  - Multi-stage build otimizado com `oven/bun:1-alpine` isolando backend e dependências de workspace com zero dependências externas pesadas.
  - Healthcheck nativo em `/health` com verificação de status HTTP e tolerância a boot.
  - Injeção dinâmica de porta `$PORT` padrão do Railway.
- [x] **Auto-Migração Drizzle em Produção (`apps/backend/src/db/index.ts`):**
  - Aplicação automática de migrações Drizzle no PostgreSQL gerenciado assim que o container sobe com a variável `DATABASE_URL`.
  - Seed automático não-destrutivo de registros essenciais iniciais (`onConflictDoNothing`).
- [x] **Suporte a Deployment de Frontend SPA (`Dockerfile.frontend`):**
  - Servidor estático Bun ultra-leve com suporte nativo a roteamento SPA (fallback para `index.html`).
  - Normalização flexível de `API_BASE` em `apps/frontend` e `apps/landingpage` para evitar problemas com URLs com ou sem `/api` ou barras.
- [x] **Documentação Passo a Passo para Railway (`/docs/RAILWAY_DEPLOYMENT.md`):**
  - Guia completo com diagramas, vinculação de plugins PostgreSQL/Redis e configuração de variáveis de ambiente.


---

### 17. Mascaramento Dinâmico de Dados na Interface (DDM) & Modo Anti-Shoulder Surfing (Opção K - RFC-001 §3.4, §4.4 e LGPD Art. 11)
- [x] **Motor Criptográfico de Mascaramento (`packages/crypto/src/dataMasking.ts`):**
  - Ofuscação determinística e configurável para exibição visual segura em telas clínicas:
    - `maskCPF`: preserva 3 primeiros e 2 últimos dígitos (`123.***.***-00`) ou ofuscação integral (`***.***.***-**`).
    - `maskEmail`: ofuscação de usuário e domínio intermediário preservando TLD (`m***a@e***l.com`).
    - `maskPhone`: preserva DDD e os 2 últimos dígitos (`(11) 9****-**21`).
    - `maskName`: proteção de nome de paciente contra identificação visual (`Mariana S. •••••••`).
    - `maskDiagnosticHypothesis`: blindagem estrita de CID-11 conforme LGPD Art. 11 (`[CID-11 / HIPÓTESE DIAGNÓSTICA PROTEGIDA]`).
    - `maskClinicalText`: ofuscação de notas de prontuário mantendo estrutura visual de parágrafos.
  - Suíte de 20 testes unitários cobrindo todos os cenários e opções de fullMask (`dataMasking.test.ts`).
- [x] **Rota de Auditoria de Desmascaramento Forense no Backend (`POST /api/audit/unmask`):**
  - Registro compulsório de cada revelação sob demanda na trilha imutável WORM (SHA-256 Hash Chain).
  - Controle de Acesso RBAC Estrito: bloqueio com HTTP 403 Forbidden para perfis administrativos/secretaria que tentarem revelar dados clínicos (SOAP ou transcrições).
  - Suíte de 5 testes de integração validando RBAC e integridade da hash-chain (`unmaskAudit.test.ts`).
- [x] **Contexto Global de Privacidade & Modo Anti-Shoulder Surfing (`PrivacyContext.tsx`):**
  - Estado global de proteção com atalho de teclado global `Alt + P` (e `Cmd/Ctrl + Shift + P`) para ocultar/desfocar dados instantaneamente em consultório.
  - Auto-ocultação com temporizador de segurança regressivo de 30 segundos (`autoHideSeconds`).
  - Botão de emergência *"Ocultar Todos"* para re-mascarar todos os campos com 1 clique.
- [x] **Componentes React Adaptativos (`MaskedField.tsx` & `PrivacyBanner.tsx`):**
  - `<MaskedField />`: botão interativo *"Revelar (WORM)"* com spinner, indicador forense e contagem regressiva.
  - `<PrivacyBanner />` & `<PrivacyToggleButton />`: banner de aviso destacado no topo com atalho exibido e botão toggle no Header.
  - Integração em `PatientsModule.tsx` (CPF, telefone, e-mail e nome).
  - Integração em `SoapModule.tsx` (os 4 quadrantes SOAP e anotações confidenciais com desfoque `blur` e clique para revelar).

---

### 18. Health Check Abrangente, Liveness & Readiness Probes (Opção L - RFC-001 §5.2 e 12-Factor App)
- [x] **Sondas Ativas do Ciclo de Vida de Containers (`apps/backend/src/services/healthService.ts`):**
  - **Liveness Probe (`GET /health/liveness` e `GET /health`):** Validação instantânea de responsividade do processo Bun, telemetria de memória RAM (`process.memoryUsage()` com RSS e Heap em MB), uptime formatado (`uptimeFormatted`), PID, versão do Bun/Node, arquitetura e sistema operacional.
  - **Readiness Probe Multi-Dependências (`GET /health/readiness`):**
    - **PostgreSQL / Supabase:** Teste ativo de leitura/escrita relacional com medição de latência em milissegundos (`latencyMs`) e status do pooler.
    - **Cloud KMS & Envelope Encryption:** Teste de integridade da Master KEK (`AES-256-GCM`) e rotação de chaves.
    - **Encrypted Cache em Memória RAM:** Validação de gravação e leitura de itens cifrados em memória.
    - **Rate Limiting Distribuído (Redis):** Inspeção de conexão ao cluster Redis e fallback transparente in-memory.
    - **Trilha WORM Forense (SHA-256):** Verificação criptográfica compulsória da integridade da hash-chain e total de blocos encadeados.
    - **Webhooks Subsystem:** Contagem e status de endpoints assinados cadastrados para notificações de segurança.
  - **Startup Probe (`GET /health/startup`):** Confirmação de término das migrações Drizzle e bootstrap de banco de dados com registro de duração em milissegundos (`bootstrapDurationMs`).
  - Respostas com código **HTTP 503 Service Unavailable** quando dependências vitais reportarem falha crítica (`unhealthy`), atendendo aos requisitos de orquestração do Railway e Kubernetes.
- [x] **Painel de Observabilidade no Frontend (`SecurityModule.tsx` - Card 5):**
  - Card dedicado no módulo de segurança exibindo o status geral consolidado (Operacional / Degradado / Crítico) e latência global.
  - Grade detalhada com status, latência em ms, driver e metadados de cada subsistema.
  - Telemetria de runtime com uptime, memória RSS, Heap, versão do Bun e PID do processo.
  - Botão interativo *"Executar Probes Agora"* com refresh sob demanda e spinner de carregamento.
  - Suporte completo a **Light Mode** e **Dark Mode**.
- [x] **Suíte de Testes Automatizados (`healthProbes.test.ts`):**
  - 7 testes de integração cobrindo Liveness, Readiness, Startup, RBAC (acesso restrito de ADMIN e bloqueio 403 para outros perfis) e compatibilidade com o formato legado de `/health`.

---

### 19. Monitoramento Sintético, Testes E2E Automatizados & Resiliência PGlite (Opção M - RFC-001 §5.2 e Continuous Verification)
- [x] **Motor de Sondas Sintéticas Ponta-a-Ponta (`apps/backend/src/services/syntheticService.ts`):**
  - Simulação ativa e automatizada dos 8 passos da jornada clínica sem risco ou exposição de dados reais:
    1. **Agendamento Público na Landing Page:** Validação de buffer obrigatório de 10 minutos (RFC §3.1), geração determinística de sala no Google Meet (formato `xxx-yyyy-zzz`) e registro de TCLE.
    2. **Autenticação Segura JWT & 2FA TOTP:** Desafio RFC 6238 com segredo Base32 (160 bits), tolerância a clock drift e validação com `timingSafeEqual`.
    3. **Despacho & Verificação de Webhook Assinado:** Assinatura canônica via HMAC-SHA256 (`t=...,v1=...`) com proteção contra replay attacks (janela de 300s).
    4. **Teleconsulta, Transcrição & Minuta SOAP com IA:** Sanitização pré-LLM eliminando 100% de PIIs (LGPD Art. 11), estruturação dos 4 eixos SOAP e trava compulsória de *Human-in-the-Loop* (CFP nº 001/2009).
    5. **Mascaramento Dinâmico (DDM) & Trilha WORM:** Ofuscação de telas Anti-Shoulder Surfing com registro compulsório de revelação no ledger imutável.
    6. **Emissão de Documento CFP nº 006/2019 & Assinatura ICP-Brasil:** Papel timbrado digital, carimbo de tempo TSA (RFC 3161), hash SHA-256 e validação pública Zero-Knowledge via QR Code.
    7. **Integridade da Hash-Chain WORM SHA-256:** Recálculo forense atestando que toda a cadeia de auditoria permanece 100% íntegra (*Tamper-Evident*).
    8. **Simulação de Resiliência & Fallback PGlite WASM:** Inicialização e execução de queries em instância isolada de contingência.
  - Retenção em memória dos últimos 20 resultados de execuções com detalhamento de latência por passo e contadores de sucesso.
- [x] **Simulador de Resiliência de Conectividade & Fallback PGlite (`checkResilience`):**
  - Teste de failover automático para `@electric-sql/pglite` (PostgreSQL 16 compilado em WebAssembly) comprovando capacidade de operação contínua e offline mesmo quando a rede externa ou Supabase estiverem indisponíveis.
  - Verificação de schema relacional (7 tabelas centrais) e medição de latência de failover em milissegundos.
- [x] **Endpoints REST de Monitoramento Sintético (`apps/backend/src/routes/system.ts`):**
  - `POST /api/system/synthetic/run`: disparo de probes sintéticos sob demanda com seleção de cenários (`full_clinical_journey` vs. `resilience_only`) e auditoria WORM.
  - `GET /api/system/synthetic/history`: consulta do histórico das últimas execuções.
  - `GET /api/system/synthetic/resilience`: diagnóstico isolado do motor de contingência PGlite.
  - Controle de Acesso RBAC Estrito: restrito a `ADMIN` (bloqueio 403 para terapeuta/secretária e 401 para anônimos).
- [x] **Painel de Monitoramento Sintético no Frontend (`apps/frontend/src/components/SecurityModule.tsx` - Card 6):**
  - Card dedicado com seleção interativa de cenário e botão *"Disparar Probe Sintético Agora"* com spinner em tempo real.
  - Indicadores visuais de resultado global (100% Validado / Parcial / Falhou), latência total e status de resiliência.
  - Banner informativo de tolerância a falhas (RFC §5.2) destacando o papel do PGlite embutido.
  - Linha do tempo interativa detalhando cada um dos 8 passos com status, tempo em ms e metadados.
  - Tabela com histórico recente de execuções, datas e durações.
  - Suporte completo a **Light Mode** e **Dark Mode**.
- [x] **Suíte de Testes Automatizados E2E (`apps/backend/test/syntheticClinicalJourney.test.ts`):**
  - 10 testes de integração cobrindo execução da jornada completa, cenário de resiliência, isolamento PGlite, endpoints REST, proteção RBAC e integridade pós-execução do ledger WORM.

### 18. Experiência Multi-Dispositivo & Otimização Mobile (Painel Clínico & Landing Page)
- [x] **Navegação Móvel Adaptativa & Ergonomia de Toque (`App.tsx`):**
  - Ocultação inteligente da sidebar desktop rígida em telas menores que 768px (`hidden md:flex`).
  - Menu drawer off-canvas deslizante com overlay e backdrop blur, permitindo acesso fluido a todos os 8 módulos clínicos, seletor de usuário/papéis RBAC e status de segurança.
  - Barra de navegação inferior nativa (`fixed bottom-0 md:hidden`) com acesso a 1 toque aos módulos essenciais (*Início*, *Agenda*, *Pacientes*, *SOAP IA* e *Mais*).
  - Topbar reconfigurada com padding compacto (`px-3 sm:px-6 py-2.5 sm:py-3.5`) e contenção de tela cheia para o dropdown de perfil do terapeuta (`max-w-[calc(100vw-1.5rem)]`).
  - Container principal adaptado com padding inferior (`pb-20 md:pb-8`) evitando sobreposição com a barra de navegação móvel e rolagem horizontal bloqueada (`overflow-x-hidden`).
- [x] **Adaptação e Rolagem Bounded de Modais Clínicos:**
  - `AgendaModule`: Modal de novo agendamento com altura máxima controlada (`max-h-[90vh] overflow-y-auto`), campos responsivos em 1 ou 2 colunas e proteção contra quebra de layout em URLs longas do Google Meet.
  - `PatientsModule`: Barra de busca de pacientes em coluna flexível no mobile e modais de cadastro e portabilidade LGPD com rolagem vertical suave e seleção de formato em grade responsiva.
  - `SoapModule`: Pipeline de transcrição de áudio, botões de ação e gravação de rascunho SOAP com alvos de toque em largura total (`w-full sm:w-auto`).
  - `DocumentsModule`: Papel timbrado A4 com padding adaptativo (`p-4 sm:p-8 md:p-12`), e modais de novo documento, visualizador de QR Code público e assinatura ICP-Brasil com rolagem vertical garantida.
  - `AuditModule` & `BackupModule`: Seletores de filtro responsivos e modal de restauração de desastre (DR) flexível.
  - `DashboardModule`: Cabeçalhos e badges flexíveis para exibição harmônica em telas verticais.
- [x] **Landing Page & Portal de Validação Pública Responsivos:**
  - `ValidationPortal`: Campo de busca por token e botão de verificação convertidos para pilha vertical em telas móveis (`flex-col sm:flex-row`).
  - `LeadModal`: Container com altura máxima segura (`max-h-[90vh] overflow-y-auto my-auto`) prevenindo corte de formulário quando o teclado virtual é aberto.
- [x] **Preservação de Temas:**
  - 100% de paridade visual e funcional mantida em ambos os temas: **Light Mode** e **Dark Mode**.

### 20. Métricas OpenTelemetry / Prometheus & Tracing Distribuído W3C (RFC-001 §5.2 - Opção N)
- [x] **Motor & Registro de Métricas Prometheus (`apps/backend/src/telemetry/prometheusRegistry.ts`):**
  - Registro in-memory de alta performance sem dependências externas, conforme formato oficial OpenMetrics / Prometheus (`text/plain; version=0.0.4; charset=utf-8`).
  - Suporte a métricas do tipo `Counter`, `Gauge` e `Histogram` com buckets cumulativos (`_bucket`, `_sum`, `_count`).
  - **Métricas RED (Rate, Errors, Duration):** `http_requests_total`, `http_request_duration_seconds`, `http_requests_in_flight`, `http_errors_total` com cálculo de percentis P50, P95, P99 e taxa de requisições por segundo.
  - **Métricas de Criptografia FLE / KMS LGPD:** `crypto_operations_total` (cifra/decifra AES-256-GCM, blind index HMAC-SHA256), `crypto_operation_duration_seconds`, `crypto_active_keys_in_ram`.
  - **Métricas de Negócio & Sistema:** `clinical_sessions_completed_total`, `clinical_ai_soap_generations_total`, `worm_audit_records_total`, `process_uptime_seconds`, `process_memory_rss_bytes`, `process_memory_heap_bytes`.
- [x] **Tracing Distribuído OpenTelemetry (OTel) & Padrão W3C Trace Context (`openTelemetryTracer.ts`):**
  - Geração e propagação dos cabeçalhos oficiais W3C: `traceparent: 00-{traceId}-{spanId}-01`.
  - Geração criptográfica segura de IDs hexadecimais (128-bit trace ID e 64-bit span ID).
  - Spans hierárquicos com ciclo de vida completo (`startSpan`, `end`), kinds (`SERVER`, `INTERNAL`, `CLIENT`), atributos estruturados, captura de exceções/eventos e status (`OK` | `ERROR`).
  - Buffer circular em memória com os últimos spans completados para inspeção.
- [x] **Middleware Global Hono (`telemetryMiddleware.ts`):**
  - Interceptação de 100% das requisições HTTP da API.
  - Injeção automática dos cabeçalhos de resposta: `x-trace-id`, `traceparent` e `x-response-time`.
  - Normalização inteligente de rotas com UUIDs (`normalizeRoutePath`) mitigando problemas de alta cardinalidade no Prometheus.
- [x] **Endpoints Backend (`GET /metrics` e `/api/system/telemetry/*`):**
  - Endpoint root `GET /metrics` aberto no padrão oficial Prometheus v0.0.4.
  - Endpoints administrativos `/api/system/telemetry/overview`, `/traces` e `/metrics-raw` com controle estrito RBAC restrito a `ADMIN` (HTTP 403 para outros perfis).
- [x] **Visualizador de Observabilidade & Trace Explorer no Frontend (`DashboardModule.tsx`):**
  - 3ª aba *"Observabilidade RED & OTel"* integrada harmoniosamente no `DashboardModule`.
  - 4 Cards RED: Taxa de Requisições (req/s), Taxa de Erros (%), Latência Percentis (P50/P95/P99) e Concorrência Ativa (in-flight).
  - 4 Cards de Infraestrutura: Cifragens FLE (AES-256-GCM), Blind Indexes HMAC, Memória do Processo (RSS/Heap) e Operações de Negócio/WORM.
  - **Trace Explorer Interativo:** Listagem dos spans W3C com status, duração e painel de detalhes exibindo atributos OTel, Trace/Span IDs e eventos de ciclo de vida.
  - **Modal de Prévia Prometheus:** Inspeção do payload bruto exportado por `GET /metrics` com botão de cópia com um clique.
- [x] **Suíte de Testes Automatizados (`telemetry.test.ts`):**
  - 11 testes cobrindo formato OpenMetrics, histogramas, propagação de cabeçalhos W3C, spans hierárquicos, bloqueio RBAC e snapshot RED.

---

### 21. Autenticação Biométrica WebAuthn / Passkeys (FIDO2 / TouchID / FaceID - RFC-001 §4 & LGPD Art. 46 - Opção O)
- [x] **Motor Criptográfico WebAuthn Level 3 (`@terapiainfoco/crypto`):**
  - Desafios criptográficos anti-replay de 32 bytes (256 bits) codificados em Base64URL segura.
  - Decodificação e validação estrita de `clientDataJSON` (origem, desafio e tipo de operação).
  - Parser de `authenticatorData` com verificação de flags UP (User Present), UV (User Verified / Biometria ativa), AT (Attested Credential Data) e extração de `signCount`.
  - Verificação de assinatura ECDSA P-256 (ES256) sobre `authenticatorData || SHA-256(clientDataJSON)` com `node:crypto.createVerify`.
  - Suíte de 7 testes criptográficos automatizados cobrindo anti-tampering e rejeição de assinaturas inválidas (`webauthn.test.ts`).
- [x] **Modelos, DTOs & Trilha WORM Compartilhados (`@terapiainfoco/shared`):**
  - Modelos `PasskeyCredential`, `WebAuthnChallengeSession` e propriedade `passkeysCount` em `SafeUser`.
  - DTOs de opções e verificação de registro e autenticação passwordless.
  - Eventos de auditoria imutável `PASSKEY_REGISTER` e `PASSKEY_REVOKE` gravados na hash-chain WORM.
- [x] **Serviço Backend & Endpoints REST (`apps/backend`):**
  - `WebAuthnService` gerenciando geração de opções de desafio com TTL de 120s e consumo de uso único.
  - Validação estrita de `signCount` para detecção de clonagem de credencial de hardware.
  - Endpoints: `POST /api/auth/passkeys/register/options`, `POST /api/auth/passkeys/register/verify`, `POST /api/auth/passkeys/auth/options`, `POST /api/auth/passkeys/auth/verify`, `GET /api/auth/passkeys`, `DELETE /api/auth/passkeys/:id`.
  - Suíte de 11 testes de integração automatizados (`passkeys.test.ts`).
- [x] **Interface Frontend de Gestão de Passkeys (`SecurityModule.tsx` - Card 7):**
  - Card 7 dedicado à Autenticação Biométrica com badge FIDO2 Level 3 e detecção de sensor biométrico nativo.
  - Listagem de Passkeys cadastradas com contador de acessos (`counter`), data e identificador de credencial.
  - Modal interativo para cadastro de nova biometria com TouchID, FaceID, Windows Hello ou chave física YubiKey.
  - Botão *"Testar Autenticação Biométrica"* demonstrando a asserção e verificação da assinatura P-256 em tempo real.
  - Suporte completo a **Light Mode** e **Dark Mode**.

---

### 22. Auditoria Contínua de Segurança, Pentest Automatizado & Relatório RIPD/DPIA (Fase 4 do RFC-001 & LGPD Art. 38/50)
- [x] **Motor Criptográfico de Auditoria e Anti-Tampering (`packages/crypto/src/compliance.ts`):**
  - Verificação sequencial rigorosa de integridade de hash-chains WORM (`verifyHashChainIntegrity`), identificando o índice exato de quebra em caso de adulteração.
  - Teste ativo de detecção de adulteração em repouso (`simulateCryptographicTamperingTest`) confirmando validação por Auth Tag AES-256-GCM de 128 bits e determinismo de Blind Index HMAC-SHA256.
  - Cálculo de digest canônico determinístico SHA-256 de objetos JSON ordenados (`calculateReportCanonicalHash`) para selagem pericial e probatória do relatório.
  - Suíte de testes unitários criptográficos com 6 cenários cobrindo integridade e detecção de violações (`compliance.test.ts`).
- [x] **Modelos, Contratos & DTOs Compartilhados (`packages/shared`):**
  - Entidades `PentestScenarioResult`, `LgpdArticleCompliance`, `CfpResolutionCompliance` e `DPIAReport`.
  - Ações de auditoria WORM `AuditAction.COMPLIANCE_AUDIT_RUN` e `AuditAction.DPIA_REPORT_EXPORT`.
  - DTOs padronizados para execução de pentest e exportação oficial do RIPD.
- [x] **Serviço Backend & Bateria de Pentests Automatizados (`apps/backend/src/services/complianceService.ts`):**
  - Execução sequencial de 6 cenários de penetration testing automatizado com latência, vetor de ataque, mecanismo defensivo e base legal:
    1. *Bypass RBAC em Prontuário SOAP*: Bloqueio mandatório com HTTP 403 Forbidden para perfis não autorizados (CFP 001/2009 e LGPD Art. 11).
    2. *Ataque de Força Bruta & Enumeração de Credenciais*: Interceptação com HTTP 429 Too Many Requests pelo Rate Limiter (LGPD Art. 46).
    3. *Adulteração de Payload em Webhook Assinado*: Rejeição por violação de assinatura HMAC-SHA256 e proteção anti-replay (LGPD Art. 48).
    4. *Corrupção Estrutural de Hash-Chain WORM*: Detecção imediata de violação de integridade por elo quebrado (LGPD Art. 37).
    5. *Replay Attack em Desafio WebAuthn / Passkeys*: Rejeição por expiração/reuso de desafio criptográfico FIDO2 (LGPD Art. 46).
    6. *Adulteração de Ciphertext / Chave FLE*: Rejeição mandatória da decifragem pela Auth Tag GCM de 16 bytes (LGPD Art. 46 e RFC §4.2).
  - Cálculo de Score de Blindagem Criptográfica (100% Blindado).
  - Mapeamento analítico de conformidade para 9 artigos centrais da LGPD e 4 resoluções deontológicas do CFP (001/2009, 011/2018, 006/2019, 004/2020).
  - Geração de selo canônico SHA-256 e gravação na trilha WORM.
- [x] **Endpoints REST Seguros com RBAC (`apps/backend/src/routes/audit.ts`):**
  - `POST /api/audit/compliance/run`: disparo sob demanda da bateria de pentest restrito a `ADMIN` e `PSICOLOGO_TITULAR`.
  - `GET /api/audit/compliance/report`: consulta do último relatório RIPD/DPIA consolidado.
  - `GET /api/audit/compliance/download-ripd`: download direto do arquivo assinado em JSON com cabeçalho `Content-Disposition`.
  - Suíte de 5 testes de integração com validação estrita de RBAC e auditoria WORM (`complianceAudit.test.ts`).
- [x] **Interface Frontend Integrada (`apps/frontend/src/components/AuditModule.tsx`):**
  - Aba 2 *"Relatório de Impacto (RIPD / DPIA) & Pentest"* no Módulo de Auditoria.
  - Card executivo com Score 100%, status "BLINDADO & CONFORME", DPO e data da auditoria.
  - Selo probatório com digest SHA-256 canônico e botão de cópia rápida.
  - Grid interativo dos 6 cenários de pentest com badge de bloqueio, latência, vetor de ataque e salvaguarda aplicada.
  - Matriz técnica detalhada para os 9 artigos da LGPD e matriz deontológica para as 4 resoluções do CFP.
  - Botões para disparo de pentest em tempo real e download imediato do relatório oficial assinado.
  - Suporte completo a **Light Mode** e **Dark Mode**.

---

### 23. Conectores SIEM Externos (Datadog, Splunk, Elastic) & Retry Resiliente com Dead-Letter Queue (RFC §4.4 & §5.2)
- [x] **Motor Criptográfico & Adaptadores SIEM (`packages/crypto/src/siem.ts`):**
  - `formatDatadogPayload`: Formatação oficial conforme schema v2 da API de Logs do Datadog (`ddsource`, `ddtags`, `service`, `status` de erro/info e metadados forenses).
  - `formatSplunkPayload`: Formatação conforme Splunk HEC (HTTP Event Collector) com `time` em epoch seconds, `source`, `sourcetype` e `index`.
  - `formatElasticPayload`: Mapeamento estruturado no padrão Elastic Common Schema (ECS 8.11.0) com categorização de eventos e tags de conformidade LGPD/CFP.
  - `formatGenericWebhookPayload`: Payload com identificador de entrega UUIDv4, timestamp e selo normativo.
  - `buildSiemHeaders`: Injeção automática de cabeçalhos de autenticação específicos (`DD-API-KEY`, `Authorization: Splunk ...`, `Authorization: ApiKey ...`).
  - `calculateExponentialBackoff`: Algoritmo de backoff exponencial (`base * 2^(attempt - 1)`) com variação pseudo-aleatória de Jitter (±20%) mitigando *thundering herd* contra coletores corporativos e teto máximo de 30s.
  - Suíte de 14 testes unitários cobrindo formatadores e cálculo de backoff (`siem.test.ts`).
- [x] **Modelos, Contratos & DTOs Compartilhados (`packages/shared`):**
  - Entidades `SiemConnector`, `SiemQueueItem`, `SiemDeliveryAttempt`, `CircuitBreakerStatus` e `QueueItemStatus`.
  - Ações de auditoria WORM `AuditAction.SIEM_DISPATCH`, `AuditAction.SIEM_DLQ_MOVED` e `AuditAction.SIEM_DLQ_REPLAY`.
  - DTOs para CRUD de conectores, testes sob demanda, inspeção de fila e reprocessamento da Dead-Letter Queue.
- [x] **Serviço Backend & Fila Resiliente (`apps/backend/src/services/siemService.ts`):**
  - 3 Conectores padrão corporativos pré-configurados (Datadog Logs API, Splunk HEC e Elasticsearch ECS Lake).
  - Fila resiliente de eventos assíncronos (`enqueueEvent`) com despacho multicanal.
  - **Circuit Breaker Inteligente:** Monitoramento de falhas consecutivas com bloqueio preventivo (`OPEN`) após 5 erros contínuos e período de arrefecimento (30s) para transição em `HALF_OPEN`.
  - **Dead-Letter Queue (DLQ):** Desvio seguro e automático de eventos que excedem 5 tentativas com registro compulsório na trilha WORM.
  - Capacidade de **Replay** de itens individuais ou em lote (`replayAllDlq`).
- [x] **Endpoints REST Administrativos com RBAC (`apps/backend/src/routes/siem.ts`):**
  - `GET /api/siem/connectors`: Listagem dos conectores registrados.
  - `POST /api/siem/connectors`: Cadastro de novo conector com validação estrita de HTTPS (TLS 1.3).
  - `PATCH /api/siem/connectors/:id` e `DELETE /api/siem/connectors/:id`.
  - `POST /api/siem/connectors/:id/test`: Teste sob demanda com inspeção de payload transformado.
  - `GET /api/siem/queue`: Telemetria e estado dos Circuit Breakers em tempo real.
  - `GET /api/siem/dlq`: Listagem de eventos retidos na Dead-Letter Queue.
  - `POST /api/siem/dlq/:id/replay` e `POST /api/siem/dlq/replay-all`: Reprocessamento com auditoria WORM.
  - Controle de Acesso Estrito: Acesso restrito a `ADMIN` (bloqueio 403 para secretária e 401 para anônimos).
  - Suíte de 14 testes de integração passando (`siemConnectors.test.ts`).
- [x] **Interface Frontend Integrada no Painel de Segurança (`SecurityModule.tsx` - Card 8):**
  - Card 8 dedicado: *Conectores SIEM Externos (Datadog, Splunk, Elastic) & Retry Resiliente*.
  - KPIs: Conectores Ativos, Entregas Confirmadas, Fila de Retry e Dead-Letter Queue.
  - Grade com badges do provedor, status visual de Circuit Breaker (Operacional / Testando / Aberto) e latência em ms.
  - Botão *"Testar Conector"* com modal de inspeção do payload JSON transformado e cabeçalhos HTTP.
  - Modal interativo *"Novo Conector SIEM"* com templates inteligentes para Datadog, Splunk e Elastic.
  - Painel de Dead-Letter Queue (DLQ) com histórico de falhas e botão de reprocessamento (replay).
  - Suporte completo a **Light Mode** e **Dark Mode**.

### 24. Gestão de Chaves KMS & Rotação Contínua de KEKs (NIST SP 800-57 & RFC-001 §4.2, §4.3)
- [x] **Motor Criptográfico de Ciclo de Vida de Chaves (`packages/crypto/src/kms.ts` & `envelope.ts`):**
  - Implementação completa dos estados do ciclo de vida de chaves conforme NIST SP 800-57 (`ACTIVE`, `ROTATED`, `REVOKED`, `DESTROYED`).
  - Prefixação e identificação determinística de versão no envelope de DEK (`v{version}:{base64}`) com 100% de compatibilidade reversa para chaves legadas.
  - Geração de novas chaves DEK sempre associadas à KEK ativa (`ACTIVE`).
  - Método `rotateMasterKey`: transição de estado da KEK anterior para `ROTATED` com registro de justificativa, geração de nova chave de 256 bits e ativação transparente.
  - Método `reWrapDataKey`: re-envelopamento seguro de DEKs legadas para a KEK mais recente sem expor a chave fora da camada segura.
  - Método `reWrapEnvelope`: re-envelopamento em nível de envelope sem decifrar nem tocar no payload clínico em repouso (Envelope Encryption puro).
  - Bloqueio estrito de decifragem para chaves em estado `REVOKED` e bloqueio de revogação acidental da chave ativa atual.
  - 7 testes unitários passando em `kmsRotation.test.ts` (86 testes totais em `packages/crypto`).
- [x] **Modelos, Contratos & DTOs Compartilhados (`packages/shared`):**
  - Enums `KmsKeyStatus` e `KmsProviderType`.
  - Ações WORM `AuditAction.KMS_KEY_ROTATED`, `KMS_KEY_RE_WRAPPED`, `KMS_KEY_REVOKED`, `KMS_POLICY_UPDATED` e `AuditResourceType.KMS`.
  - Interfaces `KmsKeyMetadata`, `KmsRotationPolicy`, `KmsSystemStatus` e DTOs de rotação, re-wrapping, política e revogação.
- [x] **Serviço Backend & Trilha WORM (`apps/backend/src/services/kmsService.ts`):**
  - `KmsService` gerenciando ciclo de vida, persistência e política de agendamento automático (intervalo padrão de 90 dias recomendado pelo NIST SP 800-57).
  - Re-envelopamento em lote de DEKs de terapeutas com contagem de examinadas e atualizadas.
  - Registro compulsório de todas as operações criptográficas na trilha de auditoria WORM imutável (Hash-Chain SHA-256).
- [x] **API REST Administrativa com RBAC (`apps/backend/src/routes/kms.ts`):**
  - `GET /api/kms/status`: Retorna versão ativa, métricas, score de conformidade (100%) e histórico de chaves.
  - `POST /api/kms/rotate`: Disparo de rotação de KEK sob demanda com opção de re-wrapping imediato.
  - `POST /api/kms/re-wrap`: Execução de re-envelopamento de DEKs legadas.
  - `PUT /api/kms/policy`: Atualização dos parâmetros da política de rotação automática.
  - `POST /api/kms/revoke/:version`: Revogação controlada de versões históricas com bloqueio para versão ativa.
  - Protegido por `authMiddleware({ strict: true })` e `requireRoles([UserRole.ADMIN])`.
  - Suíte com 6 testes de integração passando (`kmsRotation.test.ts`).
- [x] **Interface Frontend Integrada no Painel de Segurança (`SecurityModule.tsx` - Card 9):**
  - Card 9 dedicado: *Gestão de Chaves KMS & Rotação Contínua (NIST SP 800-57 & RFC §4.2)*.
  - 4 KPIs: KEK Ativa no HSM (v2 AES-256-GCM), Versões Gerenciadas, Score de Blindagem (100% OK) e Auto-Rotação Agendada (em dias).
  - Tabela do Ciclo de Vida das KEKs com histórico de rotação, badges de status, datas, DEKs protegidas e botão de revogação.
  - Botão *"Rotacionar KEK Agora"* com modal de confirmação, justificativa WORM e opção de re-wrap automático.
  - Botão *"Re-envelopar DEKs"* e modal de configuração da *"Política de Auto-Rotação"*.
  - Suporte completo a **Light Mode** e **Dark Mode**.

### 25. Homologação sob Carga, Stress Concorrente & Auditoria de SLOs RED (RFC-001 §5.1, §5.2 e Opção N)
- [x] **Motor Estatístico & Estresse Criptográfico (`packages/crypto/src/benchmark.ts`):**
  - Implementação determinística de cálculo de percentis RED (`calculatePercentiles`): P50, P90, P95, P99, além de min, max e média com precisão decimal.
  - Função `runConcurrentCryptoStress` simulando alta concorrência em Envelope Encryption com KMS e Blind Indexing HMAC-SHA256, mensurando taxas de erro e latência.
  - Suíte de 4 testes unitários criptográficos com 100% de aprovação (`benchmark.test.ts`).
- [x] **Modelos, Contratos & DTOs Compartilhados (`packages/shared`):**
  - Enums `StressScenario` (`CRYPTO_CONCURRENCY`, `AVAILABLE_SLOTS`, `PUBLIC_BOOKING`, `MIXED_LOAD`) e `SloStatus` (`MET`, `WARNING`, `BREACHED`).
  - Ações WORM `AuditAction.STRESS_TEST_RUN` e recurso `AuditResourceType.BENCHMARK`.
  - Interfaces `StressPercentiles`, `StressSloEvaluation` e `StressTestReport`.
  - DTOs padronizados `RunStressTestDTO`, `StressTestResponse`, `StressHistoryResponse` e `StressSlosResponse`.
- [x] **Serviço Backend & REST API de Estresse (`apps/backend/src/services/stressTestService.ts`):**
  - `StressTestService` com execução isolada de 4 cenários clínicos fundamentais:
    1. *Consulta de Horários Disponíveis*: Leitura concorrente com validação de buffer de 10 min.
    2. *Agendamento Concorrente com Google Meet & TCLE*: Cifragem de PII, Blind Indexing e bloqueio determinístico de sobreposições.
    3. *Estresse Criptográfico*: Múltiplas operações paralelas de Envelope Encryption (KMS) e blind index.
    4. *Cenário Realista Misto*: 60% leitura de agenda, 20% agendamentos e 20% operações criptográficas de prontuário.
  - **Avaliação Contratual de 4 SLOs RED:**
    1. `read_p99_latency`: P99 de leitura < 200ms.
    2. `crypto_p99_latency`: P99 de operações criptográficas < 500ms.
    3. `error_rate_under_one_percent`: Taxa de erro < 1.0%.
    4. `worm_audit_integrity`: 100% dos eventos com garantia de imutabilidade.
  - Execução de baseline automático no boot com registro na trilha WORM.
  - Endpoints administrativos REST:
    - `POST /api/system/stress/run`: Disparo de bateria de testes de estresse sob demanda.
    - `GET /api/system/stress/history`: Histórico dos últimos benchmarks executados.
    - `GET /api/system/stress/slos`: Status contratual consolidado dos SLOs RED.
  - Proteção RBAC restrita a perfil `ADMIN` (HTTP 401 para anônimos e HTTP 403 para não-ADMIN).
  - Suíte de 6 testes de integração passando (`stressTesting.test.ts`).
- [x] **Scripts Executáveis de Carga (CLI & k6):**
  - `scripts/load-test.ts`: Script executável via Bun CLI (`bun test:load`) simulando concorrência massiva direta na API com painel RED em tempo real.
  - `scripts/k6-stress-test.js`: Script padrão da indústria para k6 com estágios de aquecimento, rampa para 1.000 requisições simultâneas e validação de thresholds de SLO.
  - Adicionado script `"test:load": "bun scripts/load-test.ts"` no `package.json` raiz.
- [x] **Painel Frontend de Homologação sob Carga (`SecurityModule.tsx` - Card 10):**
  - Card 10 dedicado: *Homologação sob Carga & SLOs RED (k6 / Stress Concorrente)*.
  - 4 KPIs RED em tempo real: RPS (Req/s), Latência P99, Taxa de Erro (%) e SLOs Contratuais Atingidos.
  - Formulário interativo de configuração: seletor de cenário, total de requisições (50 a 1.000) e concorrência (5 a 50).
  - Botão *"Disparar Teste de Carga"* com medição e progresso em tempo real.
  - Distribuição visual de latência por barras (P50, P90, P95, P99, Média, Min e Max).
  - Matriz de auditoria de SLOs contratuais com badges de status (`MET`, `WARNING`, `BREACHED`).
  - Histórico cronológico das baterias de stress test com data, duração e RPS.
  - Totalmente adaptativo com suporte completo a **Light Mode** e **Dark Mode**.

### 26. Exportador Automático OpenTelemetry OTLP & Coletores Remotos (RFC-001 §5.2 - Opção N / Fase 5)
- [x] **Motor de Serialização & Cabeçalhos OTLP (`packages/crypto/src/otlp.ts`):**
  - Formatação oficial conforme especificação OpenTelemetry Protocol JSON v1 (`ExportTraceServiceRequest` e `ExportMetricsServiceRequest`).
  - Conversão de atributos fortemente tipados (`stringValue`, `intValue`, `doubleValue`, `boolValue`).
  - Conversão de timestamps de milissegundos para nanossegundos OTLP string (`BigInt * 1000000n`).
  - Resolução dinâmica de URLs de endpoint por provedor (`resolveOtlpEndpoint`).
  - Injeção de cabeçalhos de autenticação específicos por provedor (`buildOtlpHeaders`):
    - Datadog OTLP: `dd-api-key`
    - New Relic OTLP: `api-key`
    - Dynatrace: `Authorization: Api-Token ...`
    - Generic OTel Collector / Custom: `Authorization: Bearer ...`
  - Suíte de 9 testes unitários dedicados passando (`otlp.test.ts`).
- [x] **Modelos, Contratos & DTOs Compartilhados (`packages/shared`):**
  - Enums `OtlpExporterProvider` e `OtlpExportStatus`.
  - Ações WORM `AuditAction.OTLP_EXPORT_CONFIG_UPDATE`, `AuditAction.OTLP_BATCH_EXPORT` e recurso `AuditResourceType.TELEMETRY`.
  - Interfaces `OtlpExporterConfig`, `OtlpExporterStats`, `OtlpBatchExportResult`.
  - DTOs padronizados: `UpdateOtlpConfigDTO`, `TestOtlpExportDTO`, `OtlpStatusResponse`, `OtlpExportResponse`.
- [x] **Serviço Backend & Batch Exporter Resiliente (`apps/backend/src/telemetry/otlpBatchExporter.ts`):**
  - `OtlpBatchExporter` com fila circular em memória e proteção de limite (max 500 spans).
  - Auto-flush periódico baseado em temporizador (`flushIntervalSeconds`) e trigger imediato por tamanho de lote (`batchSize`).
  - Despacho transparente sem blocking no ciclo de vida das rotas da API.
  - Exportação de spans e snapshot de métricas RED/Prometheus via `/v1/metrics`.
  - Registro de alterações de configuração na trilha WORM imutável (Hash-Chain SHA-256).
  - Endpoints REST com RBAC restrito a `ADMIN`:
    - `GET /api/system/telemetry/otlp/status`: status e configuração com API key mascarada.
    - `PUT /api/system/telemetry/otlp/config`: atualização dinâmica e auditoria WORM.
    - `POST /api/system/telemetry/otlp/flush`: disparo sob demanda de lote de spans.
    - `POST /api/system/telemetry/otlp/test`: teste de conectividade sintético com diagnóstico em tempo real.
  - Suíte de 6 testes de integração passando (`otlpExporter.test.ts`).
- [x] **Interface Frontend de Gestão OTLP (`DashboardModule.tsx` - 3ª Aba):**
  - Card dedicado: *Exportador Automático OpenTelemetry OTLP (Coletores Remotos)* na aba de Observabilidade.
  - 4 KPIs em tempo real: Spans em Buffer, Total Exportado, Taxa de Sucesso (%) e Última Latência.
  - Botão interativo *"Forçar Flush OTLP"* com envio do lote acumulado.
  - Botão *"Testar Conexão"* com envio de probe e diagnóstico detalhado.
  - Modal interativo *"Configuração do Exportador OTLP"* com seleção de provedor (Datadog, New Relic, Dynatrace, Genérico), chave de API, tamanho de lote e auto-flush.
  - Suporte completo a **Light Mode** e **Dark Mode**.

### 27. Dashboard Executivo de Governança, Compliance Package Multi-Normativo & DPO Sign-Off (RFC-001 §4.4, §5.2)
- [x] **Motor Criptográfico de Governança (`packages/crypto/src/governance.ts`):**
  - Catálogo determinístico de 17 controles mapeados para os 4 frameworks normativos:
    - **LGPD (Lei nº 13.709/2018):** FLE com AES-256-GCM, Blind Indexing HMAC-SHA256, Portabilidade Criptografada Art. 18, Trilha WORM Art. 37/50, DDM Anti-Shoulder Surfing Art. 46.
    - **CFP (Deontologia Psicológica):** Guarda de 5 anos (Res. CFP 001/2009), Retificação Formal de Prontuário, Telepsicologia & TCLE (Res. CFP 011/2018), 4 Modelos Documentais (Res. CFP 006/2019), Validação Zero-Knowledge.
    - **ICP-Brasil (MP nº 2.200-2/2001):** Assinatura Digital Qualificada PAdES, Carimbo do Tempo TSA (RFC 3161), Digest Canônico SHA-256 do documento timbrado.
    - **SOC2 Type II & ISO/IEC 27001:2022:** Gestão do Ciclo de Vida KMS NIST SP 800-57, RBAC estrito + 2FA + Passkeys FIDO2, Resiliência & Backup Criptografado com PGlite, Observabilidade OTLP & Conectores SIEM com DLQ.
  - Avaliação determinística e ponderada de conformidade (`evaluateGovernanceControls`) com pontuação percentual global e por framework.
  - Construção do Pacote Executivo de Conformidade (`buildExecutiveCompliancePackage`) com Digest Canônico SHA-256 recursivo (`calculateReportCanonicalHash`) e Selo Probatório Tamper-Evident (`GOV-SEAL-SHA256:...`).
  - Verificação pericial pós-emissão (`verifyCompliancePackageIntegrity`) detectando adulterações retroativas.
  - Mecanismo de Chancela Formal do DPO (`applyDpoSignOffToPackage`) vinculando o Digest do pacote às credenciais e fé pública do Encarregado pelo Tratamento de Dados Pessoais.
  - Suíte de 6 testes unitários dedicados passando (`governance.test.ts`).
- [x] **Modelos, Contratos & DTOs Compartilhados (`packages/shared`):**
  - Enums `ComplianceFramework` (`LGPD`, `CFP`, `ICP_BRASIL`, `SOC2_ISO27001`) e `ComplianceControlStatus` (`COMPLIANT`, `PARTIALLY_COMPLIANT`, `NON_COMPLIANT`).
  - Novas ações WORM imutáveis: `AuditAction.EXECUTIVE_COMPLIANCE_GENERATED`, `AuditAction.COMPLIANCE_PACKAGE_EXPORT`, `AuditAction.DPO_SIGNOFF_APPLIED`.
  - Interfaces `ComplianceControlDetail`, `ComplianceFrameworkEvaluation`, `DpoSignOff`, `ForensicMetricsSnapshot` e `ExecutiveCompliancePackage`.
  - DTOs padronizados: `GenerateCompliancePackageDTO`, `ApplyDpoSignOffDTO`, `ExecutiveComplianceOverviewResponse` e `ExecutiveCompliancePackageResponse`.
- [x] **Serviço Backend & API REST (`apps/backend`):**
  - `ComplianceGovernanceService` com consolidação dinâmica de métricas forenses em tempo real:
    - Status de integridade da Trilha WORM (`INTACT` / `COMPROMISED`).
    - Versão ativa da KEK mestre no KMS.
    - Contagem de snapshots de backup cifrados.
    - Taxa de adoção de 2FA e total de Passkeys FIDO2 registradas.
    - Provedor do Rate Limiter e status do exportador OTLP.
  - Endpoints REST em `/api/audit/governance/*` protegidos por RBAC (`ADMIN` e `PSICOLOGO_TITULAR`):
    - `GET /api/audit/governance/overview`: Panorama consolidado dos 4 frameworks, scores e evidências.
    - `POST /api/audit/governance/package/generate`: Emissão de novo pacote com selo SHA-256 e gravação na trilha WORM.
    - `POST /api/audit/governance/package/sign-off`: Aplicação de chancela formal do DPO vinculada ao digest do pacote.
    - `GET /api/audit/governance/package/download`: Exportação pericial em JSON assinado com verificação de integridade e headers `Content-Disposition`.
  - Suíte de 7 testes de integração passando (`complianceGovernance.test.ts`).
- [x] **Interface Frontend de Governança Executiva (`AuditModule.tsx` - 1ª Aba):**
  - Nova aba principal: *Governança & Pacote Multi-Normativo (LGPD + CFP + ICP + SOC2)*.
  - Card Executivo com Selo Probatório Tamper-Evident SHA-256, botão de cópia do digest, score circular global e status do pacote.
  - Seção formal de **DPO Sign-Off**: indicação de status (Chancelado / Pendente), nome do DPO, data/hora e declaração juramentada.
  - Grid de 4 Cards Normativos (LGPD, CFP, ICP-Brasil, SOC2/ISO 27001) com barra de progresso de conformidade e base legal detalhada.
  - Snapshot de Evidências Forenses em Produção (WORM, KMS, Backups, 2FA/OTLP).
  - Matriz de 17 Controles regulatórios com filtros por pílulas (Todos, LGPD, CFP, ICP, SOC2), salvaguarda técnica e evidência forense.
  - Modal interativo de DPO Sign-Off com confirmação e gravação no WORM.
  - Suporte completo e consistente a **Light Mode** e **Dark Mode**.

### 28. Hardening de Segurança HTTP (CSP, HSTS) & Honeypot Anti-Probe com Ledger WORM (RFC-001 §4.4, §5.2)
- [x] **Motor Criptográfico e Avaliador de Cabeçalhos OWASP (`packages/crypto/src/securityHeaders.ts`):**
  - Catálogo formal dos 9 cabeçalhos recomendados por OWASP/NIST: `Content-Security-Policy` (`default-src 'self'; frame-ancestors 'none'`), `Strict-Transport-Security` (`max-age=31536000; includeSubDomains; preload`), `X-Content-Type-Options` (`nosniff`), `X-Frame-Options` (`DENY`), `X-XSS-Protection` (`0`), `Referrer-Policy` (`strict-origin-when-cross-origin`), `Permissions-Policy` (restrição estrita de `camera=(self)` e `microphone=(self)` apenas para teleconsulta, bloqueando geolocalização e pagamentos), `Cross-Origin-Opener-Policy` (`same-origin`) e `Cross-Origin-Resource-Policy` (`same-origin`).
  - Avaliador e calculador de pontuação de conformidade HTTP (`evaluateSecurityHeaders`) com scoring ponderado de 0 a 100%.
  - Detecção de probes e reconnaissance maliciosos com expressões regulares (`HONEYPOT_PROBE_PATTERNS` cobrindo `/.env`, `/.git`, `/wp-admin`, `/actuator`, `phpinfo`, `/aws`, `/config`, etc.).
- [x] **Middlewares de Segurança Global & Honeypot Ativo (`apps/backend`):**
  - `securityHeadersMiddleware`: Injeção compulsória dos 9 cabeçalhos em todas as respostas da API Hono.
  - `honeypotService`: Gerenciamento em memória de quarentena de IPs maliciosos com janela configurável (padrão de 60 minutos), detecção de probes automatizados e registro no ledger WORM com ação `HONEYPOT_PROBE_BLOCKED`.
  - `honeypotMiddleware`: Interceptação precoce de scanner bot com resposta HTTP 418 ("I'm a teapot") e bloqueio preventivo de IPs sob quarentena com HTTP 403 Forbidden (`IP_QUARANTINED`).
- [x] **Endpoints Administrativos de Defesa Ativa (`/api/security/hardening/*`):**
  - `GET /api/security/hardening/overview`: Retorna status do Honeypot, cabeçalhos OWASP ativos, IPs em quarentena e últimos probes interceptados.
  - `POST /api/security/hardening/honeypot/unban`: Permite a administradores remover IPs da quarentena com auditoria forense obrigatória gravada no ledger WORM (`HONEYPOT_IP_UNBANNED`).
  - `GET /api/security/hardening/headers/verify`: Executa auditoria em tempo real dos cabeçalhos injetados e gera laudo com score e status PASS/WARN.
- [x] **Painel de Controle no Frontend Clínico (`apps/frontend/src/components/SecurityModule.tsx`):**
  - Card 11 dedicado à Defesa HTTP & Honeypot com 4 KPIs em tempo real (Score de Conformidade, Probes Interceptados, IPs em Quarentena e Status Ativo do Honeypot).
  - Matriz de Auditoria OWASP exibindo valor esperado, valor atual e status PASS/WARN de cada cabeçalho.
  - Monitor forense de probes em tempo real com identificação de IP, path sonda interceptado, data/hora e tempo de expiração do ban.
  - Modal de Desbloqueio Auditado de IP solicitando justificativa formal registrada no ledger WORM.
  - Suporte completo e consistente a **Light Mode** e **Dark Mode**.

### 29. Integração Google Meet REST API v2 & Orquestração de Teleconsultas (RFC-001 §3.2 & CFP 011/2018)
- [x] **Motor de Integração Google Meet REST API v2 (`apps/backend/src/services/googleMeetService.ts`):**
  - Implementação oficial da Google Meet REST API v2 (`POST https://meet.googleapis.com/v2/spaces`) conforme documentação Google Workspace Developers.
  - Escopo OAuth 2.0 requerido: `https://www.googleapis.com/auth/meetings.space.created` e `https://www.googleapis.com/auth/meetings.space.readonly`.
  - Configuração estrita de política de controle de admissão `accessType`:
    - `TRUSTED` (padrão recomendado CFP): Knocking obrigatório com sala de espera, impedindo que pacientes entrem acidentalmente antes da psicóloga admiti-los.
    - `OPEN`: Acesso livre sem knocking.
    - `RESTRICTED`: Acesso restrito apenas a participantes convidados explicitamente.
  - Encerramento ativo de conferência: `POST https://meet.googleapis.com/v2/spaces/{name}:endActiveConference` ao concluir o atendimento.
  - Suporte a links personalizados (salas fixas/recorrentes do terapeuta).
  - Fallback em camadas resiliente: Google Calendar API v3 (`conferenceDataVersion=1`) e gerador determinístico formatado no padrão oficial `xxx-yyyy-zzz` (`3-4-3`) para contingência e desenvolvimento local.
- [x] **Modelos, Contratos & DTOs Compartilhados (`packages/shared`):**
  - Enums `MeetProvider` (`google_meet_v2`, `google_calendar`, `custom`, `simulated`) e `MeetAccessType` (`OPEN`, `TRUSTED`, `RESTRICTED`).
  - Atualização de `Appointment`, `StoredAppointment` e `DecryptedAppointment` com `meetSpaceName`, `meetProvider` e `meetAccessType`.
  - Ações de auditoria WORM `AuditAction.MEET_SPACE_CREATED`, `AuditAction.MEET_CONFERENCE_ENDED` e `AuditResourceType.MEET`.
  - DTOs `GoogleMeetStatusResponse` e `GoogleMeetTestResponse`.
- [x] **Serviço de Agendamento Assíncrono & Trilha WORM (`AppointmentService`):**
  - Orquestração transparente de salas Meet v2 durante agendamento clínico ou agendamento público na landing page.
  - Cifragem compulsória da URL de teleconsulta via Field-Level Encryption (`AES-256-GCM`).
  - Endpoint `POST /api/appointments/:id/end-meet` para encerramento de sala com auditoria WORM.
  - Endpoints administrativos `GET /api/system/google-meet/status` e `POST /api/system/google-meet/test`.
- [x] **Interface Frontend Integrada no Módulo de Agenda (`AgendaModule.tsx`):**
  - Badges visuais de provedor Meet (`Google Meet v2 API`, `Google Calendar`, `Sala Fixa`, `Simulado`) e política de knocking (`Sala de Espera Ativa`).
  - Botão de ação direta *"Encerrar Meet"* para teleconsultas em andamento.
  - Modal de agendamento com seletor de admissão e opções explicativas de conformidade ética do CFP.
  - Modal interativo de Diagnóstico e Teste da Google Meet REST API v2 com medição de latência em tempo real.
  - Suporte completo a **Light Mode** e **Dark Mode**.
- [x] **Suíte de Testes Automatizados (`googleMeetService.test.ts`):**
  - 10 testes unitários e de integração cobrindo criação v2, knocking, fallbacks, encerramento de conferência e rotas REST (287 testes totais passando).

### 30. Auditoria de Sessão WebRTC com Fingerprint de Segurança (DTLS-SRTP / SAS) & Laudo WORM (RFC-001 §3.2, §4.4, §5.2 e CFP nº 011/2018)
- [x] **Motor Criptográfico e Validador de Certificados DTLS (`packages/crypto/src/webrtcSecurity.ts`):**
  - Normalização e validação estrita de fingerprints DTLS no formato RFC 8122 (`SHA-256 XX:XX:...`).
  - Geração de Safety Numbers simétricos (Short Authentication String - SAS) de 4 blocos numéricos de 5 dígitos e SAS fonético legível no alfabeto internacional OTAN (ex: `Alfa-Delta-Whiskey-Echo`) para conferência verbal de integridade ponto-a-ponto, mitigando ataques Man-in-the-Middle (MitM) em teleconsultas.
  - Avaliador de conformidade de ciphersuites WebRTC DTLS-SRTP (`evaluateCipherSuite`), assegurando suporte a `AEAD_AES_256_GCM` e `AEAD_AES_128_GCM` com Perfect Forward Secrecy (PFS).
  - Gerador de Digest Probatório Canônico da Sessão (`calculateSessionProbataryDigest`) via SHA-256.
  - Suíte de 11 testes unitários passando em `packages/crypto/test/webrtcSecurity.test.ts`.
- [x] **Contratos Compartilhados (`packages/shared`):**
  - Enums de auditoria WORM `WEBRTC_SESSION_INITIATED`, `WEBRTC_FINGERPRINT_VERIFIED`, `WEBRTC_QUALITY_AUDITED`, `WEBRTC_SESSION_TERMINATED` e recurso `WEBRTC_SESSION`.
  - Enums `WebRtcVerificationStatus`, `WebRtcCipherSuite` e `WebRtcSecurityGrade`.
  - Interfaces `WebRtcPeerFingerprint`, `WebRtcSessionAuditRecord`, `WebRtcSessionMetrics` e DTOs correspondentes.
- [x] **Backend Service & API REST Hono (`apps/backend`):**
  - `WebRtcSecurityService`: Gerenciamento do ciclo de vida da sessão WebRTC em memória, cálculo de Safety Numbers, médias móveis de telemetria e selagem final na trilha de auditoria WORM.
  - Endpoints REST em `/api/teleconsultation/webrtc/*` protegidos por RBAC (`PSICOLOGO_TITULAR` e `ADMIN`):
    - `POST /session/initiate`: Inicia auditoria da chamada e registra evento WORM.
    - `POST /session/verify-fingerprint`: Valida fingerprint do paciente, gera Safety Numbers e sela o canal P2P.
    - `POST /session/metrics`: Recebe telemetria contínua (jitter, packet loss, RTT e bytes cifrados).
    - `POST /session/terminate`: Encerra a sessão, gera laudo probatório e sela na Hash-Chain WORM.
    - `GET /sessions` e `GET /session/:sessionId`: Consulta de histórico e detalhes periciais.
  - Suíte de 6 testes de integração passando em `apps/backend/test/webrtcSecurity.test.ts`.
- [x] **Frontend Clínico & Gestão de Segurança (`apps/frontend`):**
  - Card 12 (*Auditoria de Canais WebRTC & Sigilo Telepsicológico*) integrado no `SecurityModule.tsx` exibindo 4 KPIs em tempo real (Sessões Auditadas, Ciphersuite Padrão Ouro, Taxa de Verificação SAS e Sigilo CFP 011/2018).
  - Simulador Interativo de Integridade P2P com formulário de teste de certificados DTLS, seleção de ciphersuite e selagem em tempo real.
  - Tabela forense de sessões de telepsicologia com visualização dos Safety Numbers (numéricos e fonéticos), status de verificação P2P, selo probatório WORM e botão de encerramento auditado.
  - Suporte completo a **Light Mode** e **Dark Mode**.

### 31. WAF em Camada de Aplicação com Detecção Heurística de Injeção SQL, XSS, Path Traversal & Registro WORM (RFC-001 §4.4, §5.2 e OWASP Top 10)
- [x] **Motor Criptográfico e Heurístico (`packages/crypto/src/waf.ts`):**
  - Catálogo formal com 15 regras de alta precisão cobrindo os principais vetores de ataque em conformidade com o OWASP Top 10:
    - **SQL Injection (`WAF-SQLI-001..006`):** Tautologias clássicas (`' OR '1'='1'`), injeção UNION, comentários maliciosos inline (`--`, `/*...*/`, `#`), funções analíticas (`sleep()`, `pg_sleep()`, `benchmark()`) e stacked queries (`DROP`, `ALTER`, `TRUNCATE`).
    - **Cross-Site Scripting (`WAF-XSS-001..005`):** Tags `<script>`, event handlers inline (`onload=`, `onerror=`, `onclick=`), pseudo-protocolos `javascript:`, data URIs e injeções de elementos perigosos (`<iframe>`, `<object>`, `<embed>`).
    - **Path Traversal & LFI (`WAF-LFI-001..002`):** Padrões de escape de diretório (`../`, `..\`) e acesso a arquivos confidenciais (`/etc/passwd`, `/etc/shadow`, `boot.ini`).
    - **Command Injection & RCE (`WAF-CMD-001..002`):** Encadeamento de comandos shell (`|`, `;`, `&`, backticks, `$()`) e ferramentas de rede ofensivas (`nc `, `netcat`, `curl `, `wget `).
  - Mecanismo anti-evasão multi-nível (`normalizeForInspection`) com decodificação recursiva de double URL encoding (`%2527`) e normalização de entidades HTML (`&quot;`, `&#x27;`, etc.).
  - Varredura recursiva de objetos e arrays aninhados (`inspectPayload`) computando o `threatScore` agregado (0 a 100).
  - Suíte de 13 testes unitários dedicados passando (`packages/crypto/test/waf.test.ts`).
- [x] **Contratos Compartilhados (`packages/shared`):**
  - Enums de auditoria WORM `WAF_ATTACK_BLOCKED`, `WAF_RULE_UPDATED` e recurso `WAF`.
  - Enums `WafAttackType` (`SQLI`, `XSS`, `PATH_TRAVERSAL`, `COMMAND_INJECTION`, `UNKNOWN`) e `WafMode` (`ACTIVE_BLOCK`, `MONITOR_ONLY`).
  - Interfaces `WafMatchedRule`, `WafInspectionResult`, `WafIncidentRecord`, `WafMetrics` e DTOs `WafOverviewResponse`, `InspectPayloadDTO`, `InspectPayloadResponse`, `UpdateWafModeDTO`, `UpdateWafModeResponse`.
- [x] **Backend Middleware, Service & Rotas REST (`apps/backend`):**
  - `WafService`: Serviço singleton com agregação de métricas por vetor em tempo real, ring-buffer dos últimos 100 incidentes forenses e selagem compulsória de bloqueios no ledger imutável WORM (`AuditAction.WAF_ATTACK_BLOCKED`).
  - `wafMiddleware`: Middleware Hono interceptando Query String e Body JSON antes do desembrulho criptográfico, retornando HTTP 403 Forbidden (`WAF_ATTACK_DETECTED`) quando `threatScore >= 50`, com isenção segura de auto-inspeção para o laboratório de testes e clonagem segura de stream via `c.req.raw.clone().text()`.
  - Rotas REST protegidas por RBAC em `/api/security/waf/*` (`/overview`, `/inspect`, `/mode`).
  - Suíte de 7 testes de integração passando (`apps/backend/test/waf.test.ts`).
- [x] **Frontend Clínico & Gestão de Segurança (`apps/frontend`):**
  - Card 13 (*Web Application Firewall (WAF) & Inspeção Heurística*) integrado no `SecurityModule.tsx` exibindo 4 KPIs em tempo real (Requisições Inspecionadas, Ataques Bloqueados, Vetores Detectados e Limiar de Risco).
  - Seletor de Modo Operacional do WAF (*Bloqueio Ativo 403* vs. *Monitorar Apenas*) exclusivo para Administrador.
  - Laboratório Interativo de Testes & Homologação de Payloads com templates rápidos (SQLi UNION, XSS Script, Path Traversal, Command Inj, Nota Clínica Válida) e laudo pericial com Threat Score, regras disparadas e fragmentos detectados.
  - Tabela forense de incidentes bloqueados com histórico preservado no WORM.
  - Suporte completo e consistente a **Light Mode** e **Dark Mode**.

### 32. Simulador de Resiliência de Redes Instáveis para Teleconsulta & Inteligibilidade da Fala Clínica (ITU-T G.107 / E-Model & Resolução CFP nº 011/2018)
- [x] **Motor Criptográfico e Heurístico (`packages/crypto/src/networkResilience.ts`):**
  - Modelagem acústica e estatística baseada no ITU-T G.107 (E-Model) calibrada para codecs de voz modernos (WebRTC Opus Fullband / VoIP com NetEQ PLC e FEC):
    - Cálculo de atraso efetivo ponta-a-ponta (`effectiveDelayMs`) combinando latência RTT/2 com dimensionamento dinâmico de jitter buffer.
    - Fator de transmissão $R$-Factor (escala 0 a 100) ponderando atraso perceptual ($I_d$) e degradação por perda de pacotes ($I_e$).
    - Escala de Opinião Média (MOS - Mean Opinion Score) ITU-T na faixa 1.00 a 4.50+.
    - Estimativa quantitativa de perda de fonemas (*speech clipping %*).
    - Avaliação da integridade do fluxo de vídeo (`HD_OPTIMAL`, `SD_ACCEPTABLE`, `FROZEN_DEGRADED`, `DISABLED_AUDIO_ONLY`).
    - Classificação em 4 graus clínicos de inteligibilidade: `EXCELLENT`, `GOOD`, `DEGRADED`, `CRITICAL_UNACCEPTABLE`.
    - Emissão de parecer deontológico fundamentado na Resolução CFP nº 011/2018 (contingência e migração de canal quando o ato psicológico for prejudicado).
    - Digest probatório SHA-256 canônico (`probatoryDigest`) para selagem da simulação forense.
  - Suíte de 12 testes unitários dedicados passando (`packages/crypto/test/networkResilience.test.ts`).
- [x] **Contratos Compartilhados (`packages/shared`):**
  - Enums de auditoria WORM `AuditAction.NETWORK_RESILIENCE_SIMULATED`, `AuditAction.CLINICAL_CONTINGENCY_TRIGGERED` e `AuditResourceType.NETWORK_RESILIENCE`.
  - Enums `NetworkProfileType` (`FIBRA_ESTAVEL`, `WIFI_OSCILANTE`, `MOBILE_4G_CONGESTED`, `DEGRADED_CRITICAL`, `TEMPORARY_BLACKOUT`, `CUSTOM`), `ClinicalIntelligibilityGrade` e `AudioCodecType`.
  - Interfaces `NetworkSimulationParams`, `ClinicalSpeechAssessment`, `NetworkSimulationReport`, `NetworkResilienceMetrics` e `NetworkProfilePreset`.
  - DTOs `RunNetworkSimulationDTO`, `NetworkSimulationResponse`, `NetworkResilienceHistoryResponse` e `NetworkSimulationPresetsResponse`.
- [x] **Backend Service & Rotas REST Hono (`apps/backend`):**
  - `NetworkResilienceService`: Serviço singleton com catálogo de presets, agregação de métricas em tempo real, ring-buffer dos últimos 100 relatórios e selagem compulsória no ledger WORM com dupla auditoria quando recomendada contingência clínica.
  - Endpoints REST protegidos por autenticação estrita e RBAC em `/api/teleconsultation/network-resilience/*`:
    - `GET /presets`: Catálogo de perfis padronizados de conectividade.
    - `POST /simulate`: Executa injeção controlada de jitter/packet loss, gera laudo pericial e sela no WORM.
    - `GET /history`: Trilha forense dos relatórios emitidos.
    - `GET /metrics`: Agregados estatísticos para o painel de segurança.
  - Suíte de 6 testes de integração passando (`apps/backend/test/networkResilience.test.ts`).
- [x] **Frontend Clínico & Gestão de Segurança (`apps/frontend`):**
  - Card 14 (*Resiliência de Redes Instáveis & Inteligibilidade Clínica*) integrado no `SecurityModule.tsx` exibindo 4 KPIs em tempo real (Score MOS Médio, Simulações Registradas 100% WORM, Contingências Éticas CFP e Incidentes Degradados/Críticos).
  - Seletor rápido dos 6 presets de rede com parametrização automática de perda e jitter.
  - Painel de Injeção de Anomalias com sliders de Loss (0 a 50%), Jitter (0 a 350ms), RTT (10 a 800ms), seletor de codecs e modo áudio puro.
  - Laudo pericial com score MOS colorido, submétricas acústicas (R-Factor, fonemas perdidos, atraso total, vídeo), diretriz ética CFP 011/2018 e digest probatório SHA-256.
  - Tabela forense de simulações recentes com suporte a Light Mode e Dark Mode.

### 33. Módulo de Gravação em Repouso com Cifragem Assíncrona, Sharding de Mídia (Envelope Encryption com DEKs Efêmeras por Shard), Validação Merkle Tree e Destruição Programada Pós-Transcrição (*Crypto-Shredding*) com Selo Probatório WORM (RFC-001 §3.2, §3.3, §4.2, LGPD Art. 11/16, CFP nº 011/2018)
- [x] **Core Criptográfico (`packages/crypto/src/mediaSharding.ts`):**
  - **Particionamento em Chunks (`splitBufferIntoChunks`):** Fatiamento determinístico de áudios brutos em fragmentos de tamanho configurável (default 64KB).
  - **Envelope Encryption por Shard:** Geração de DEK simétrica de 32 bytes (`AES-256-GCM`) exclusiva e efêmera para cada shard, cifrada com KEK Mestre do KMS (`encryptDEK` / `decryptDEK`).
  - **Cifragem de Shard (`encryptMediaShard`):** Encriptação individual com IV de 12 bytes e Auth Tag de 16 bytes, garantindo confidencialidade e autenticidade ponta a ponta.
  - **Árvore de Merkle Determinística (`calculateMerkleRoot`):** Cálculo de hash SHA-256 por shard e agregação em nós emparelhados até a raiz global, permitindo atestação matemática de integridade do arquivo completo sem necessidade de decifrá-lo.
  - **Decifragem Transitória em RAM para Transcrição (`decryptMediaShard`, `reassembleAndVerifyMedia`):** Desembrulho temporário estritamente em memória volátil durante a execução da esteira de transcrição / diarização / SOAP.
  - **Destruição Programada Irreversível (*Crypto-Shredding* via `executeCryptoShredding`):**
    - Sobrescrita compulsória de buffers brutos e decifrados com zeros (*zero-fill secure wipe*).
    - Purga criptográfica irreversível da DEK cifrada em repouso (`encryptedDEK: 'DEK_PURGED_CRYPTO_SHREDDED'`), tornando a decifragem dos shards de mídia matematicamente impossível mesmo em caso de exfiltração de backups brutos.
    - Emissão de Laudo Pericial Forense (`CryptoShreddingCertificate`) com carimbo de tempo ISO, contagem de bytes e shards expurgados, motivo legal (LGPD Art. 16 e Resolução CFP nº 011/2018) e selagem através de digest SHA-256 canônico (`probatoryDigest`).
  - Suíte de 13 testes unitários dedicados passando (`packages/crypto/test/mediaSharding.test.ts`).
- [x] **Contratos Compartilhados (`packages/shared`):**
  - Enums de auditoria WORM `AuditAction.MEDIA_RECORDING_SHARDED`, `AuditAction.MEDIA_DECRYPTED_FOR_TRANSCRIPTION`, `AuditAction.MEDIA_CRYPTO_SHREDDED` e `AuditResourceType.MEDIA_RECORDING`.
  - Enums `MediaShardStatus`, `MediaRecordingStatus` e `CryptoShreddingMethod`.
  - Interfaces `MediaShardMetadata`, `EncryptedMediaShard`, `MediaRecordingManifest`, `CryptoShreddingCertificate` e `MediaStorageMetrics`.
  - DTOs `CreateMediaSessionDTO`, `UploadMediaChunkDTO`, `FinalizeMediaRecordingDTO`, `ExecuteCryptoShreddingDTO`, `MediaRecordingResponse`, `MediaSessionListResponse`, `CryptoShreddingResponse` e `SimulateMediaPipelineResponse`.
- [x] **Backend Service & Rotas REST Hono (`apps/backend`):**
  - `MediaShardingService`: Singleton em memória gerenciando sessões de teleconsulta gravadas, ingestão em streaming de shards, validação de integridade Merkle Root, esteira de transcrição simulada com auto-shredding, expurgamento compulsório sob demanda e selagem probatória na trilha WORM.
  - Endpoints REST protegidos por autenticação estrita e RBAC (`ADMIN` e `PSICOLOGO_TITULAR`) em `/api/teleconsultation/media/*`:
    - `POST /recordings`: Cria sessão de gravação particionada vinculada a um agendamento.
    - `POST /recordings/:id/chunks`: Ingestão de chunk em base64 com cifragem e DEK dedicada.
    - `POST /recordings/:id/finalize`: Consolidação do manifesto e cravamento da Merkle Root SHA-256.
    - `POST /recordings/:id/simulate-pipeline`: Reconstituição transitória em RAM, extração de texto simulada e auto-expurgo criptográfico.
    - `POST /recordings/:id/shred`: Execução de Crypto-Shredding imediato com emissão de certificado e zero-fill.
    - `GET /recordings`: Listagem das gravações e seu status de retenção.
    - `GET /recordings/:id/certificate`: Consulta do Certificado Forense de Crypto-Shredding emitido.
    - `GET /metrics`: Agregados estatísticos para o dashboard clínico e de segurança.
  - Suíte de 6 testes de integração passando (`apps/backend/test/mediaSharding.test.ts`).
- [x] **Frontend Clínico & Gestão de Segurança (`apps/frontend`):**
  - Card 15 (*Gravação Cifrada em Repouso com Sharding & Crypto-Shredding Forense WORM*) no `SecurityModule.tsx` exibindo 4 KPIs em tempo real (Sessões Gravadas, Shards Cifrados em Repouso, Volume Total Protegido e Expurgos Irreversíveis Executados).
  - Simulador interativo de gravação de áudio particionado em shards (geração de chunks simulados, envelope encryption e consolidação com Merkle Root).
  - Visualizador topológico dos shards de cada sessão exibindo status criptográfico, tamanho, IV e sinalização de chave purgada.
  - Ações com feedback imediato: *Transcrever & Auto-Expurgar* (simulação da esteira SOAP + eliminação compulsória) e *Crypto-Shredding Imediato*.
  - Modal pericial do Certificado Forense de Crypto-Shredding com carimbo cronológico, motivo legal fundamentado no CFP e LGPD, contagem de bytes/shards destruídos e selo probatório SHA-256.
  - Suporte completo e consistente a **Light Mode** e **Dark Mode**.

### 34. Detector de Desconexão Abrupta e Protocolo Automático de Reconexão Segura com Retenção de Estado da Sessão Clínica (RFC-001 §3.2 & Resolução CFP nº 011/2018)
- [x] **Core Criptográfico (`packages/crypto/src/sessionRecovery.ts`):**
  - **Reconnection Tokens com HMAC-SHA256 (`generateReconnectionToken`):** Emissão de tokens efêmeros assinados vinculados ao `sessionId`, `therapistId`, nonce aleatório e timestamp de expiração estrita.
  - **Verificação com Proteção Anti-Timing (`verifyReconnectionToken`):** Validação segura de assinatura com `timingSafeEqual`, barreira contra Session Hijacking e enforcement da janela temporal de contingência.
  - **Cifragem de Snapshot de Sessão (`encryptSessionSnapshot` & `decryptSessionSnapshot`):** Cifragem simétrica com `AES-256-GCM` do estado volátil da consulta (anotações imediatas, rascunhos SOAP, status de microfone/câmera e contador incremental de batimentos) e atestação com hash SHA-256 canônico (`snapshotDigest`).
  - **Digest Probatório WORM (`calculateSessionEventDigest`):** Selagem matemática de eventos de queda e recuperação no ledger imutável.
  - **Classificação Temporal de Recuperação (`evaluateRecoveryGrade`):** Classificação ética em `SEAMLESS` (<= 15s), `RECOVERED` (<= janela de tolerância) ou `EXPIRED_CONTINGENCY`.
  - Suíte de 9 testes unitários dedicados passando (`packages/crypto/test/sessionRecovery.test.ts`).
- [x] **Contratos Compartilhados (`packages/shared`):**
  - Enums de auditoria WORM `AuditAction.CLINICAL_SESSION_MONITORED`, `AuditAction.CLINICAL_SESSION_DISCONNECTED`, `AuditAction.CLINICAL_SESSION_RECONNECTED`, `AuditAction.CLINICAL_SESSION_TIMEOUT_TERMINATED` e `AuditResourceType.CLINICAL_SESSION_RECOVERY`.
  - Enums `ClinicalSessionState`, `DisconnectionCause` e `SessionRecoveryGrade`.
  - Interfaces `SessionStateSnapshot`, `EncryptedSessionSnapshot`, `ClinicalSessionRecoverySession` e `SessionRecoveryMetrics`.
  - DTOs `StartSessionMonitoringDTO`, `SessionHeartbeatDTO`, `TriggerSessionDisconnectionDTO`, `AttemptSessionReconnectDTO`, `CompleteClinicalSessionDTO`, `SessionMonitoringResponse`, `SessionReconnectResponse` e `SessionRecoveryListResponse`.
- [x] **Backend Service & Rotas REST Hono (`apps/backend`):**
  - `SessionRecoveryService`: Singleton gerenciando estado de sessões, persistência de snapshots cifrados, batimentos periódicos, emissão de tokens HMAC e dupla trilha de auditoria WORM em transições de estado.
  - Endpoints REST protegidos por autenticação estrita e RBAC (`ADMIN` e `PSICOLOGO_TITULAR`) em `/api/teleconsultation/session-recovery/*`:
    - `POST /start`: Inicia monitoramento contínuo de sessão com snapshot inicial e emissão do token HMAC.
    - `POST /heartbeat`: Registra batimento e atualiza snapshot incremental em memória volátil.
    - `POST /disconnect`: Simula ou detecta desconexão abrupta, acionando a janela ética de 10 min.
    - `POST /reconnect`: Valida token HMAC, restaura snapshot cifrado e sela o grau de recuperação no WORM.
    - `POST /complete`: Encerra a consulta normalmente.
    - `GET /sessions` & `GET /sessions/:id`: Trilha forense de sessões monitoradas.
    - `GET /metrics`: Agregados estatísticos em tempo real para observabilidade clínica.
  - Suíte de 6 testes de integração passando (`apps/backend/test/sessionRecovery.test.ts`).
- [x] **Frontend Clínico & Gestão de Segurança (`apps/frontend`):**
  - Card 16 (*Detector de Desconexão Abrupta & Protocolo de Reconexão Segura*) integrado no `SecurityModule.tsx` com 4 KPIs em tempo real (Sessões Monitoradas, Sessões Ativas Online, Quedas em Janela de Tolerância e Taxa de Recuperação com Sucesso).
  - Simulador interativo de teleconsulta com injeção de oscilação/drop de conexão em tempo real, indicador visual animado de pulso e contagem regressiva da janela de tolerância ética (10 minutos) conforme CFP nº 011/2018.
  - Reassunção com 1 clique através de Reconnection Token HMAC com restauração instantânea do snapshot clínico em tela.
  - Tabela forense de sessões monitoradas com suporte completo a **Light Mode** e **Dark Mode**.

### 35. Protocolo de Validação Forense de Assinaturas Digitais com Provas de Conhecimento Zero (Zero-Knowledge Proofs - ZKP) sem Exposição de Metadados Clínicos (RFC-001 §3.4, §3.5, §4.1 & Resolução CFP nº 006/2019)
- [x] **Core Criptográfico (`packages/crypto/src/zkpProof.ts`):**
  - **Prova Não-Interativa de Schnorr com Heurística de Fiat-Shamir (NIZK):** Grupo modular seguro de 256 bits com exponenciação modular BigInt (`modExp`) e geração de números aleatórios criptograficamente seguros de alta entropia.
  - **Identidade Criptográfica Exata ($g^s \equiv R \cdot Y^c \pmod p$):** Verificação matemática rigorosa de autoria profissional sem transmissão nem exposição da chave privada do terapeuta.
  - **Compromisso Cego de Autoria Profissional (`createTherapistCrpCommitment`):** Hash SHA-256 irreversível do número de inscrição profissional no Conselho Regional de Psicologia (CRP) com salt secreto da clínica.
  - **Digest Canônico e Selagem WORM (`calculateZkpDigest`):** Digest de integridade temporal e de conteúdo vinculando o hash do documento clínico sem divulgar uma única palavra do texto confidencial do laudo ou prontuário.
  - **Serialização de Token Público (`encodeZkpToken` & `decodeZkpToken`):** Empacotamento transparente com prefixo `zkp_v1_<base64url>` contendo o compromisso efêmero $R$, a resposta modular $s$, o desafio de Fiat-Shamir $c$, os compromissos públicos e metadados probatórios.
  - Suíte de 8 testes unitários dedicados passando (`packages/crypto/test/zkpProof.test.ts`).
- [x] **Contratos Compartilhados (`packages/shared`):**
  - Enums de auditoria WORM `AuditAction.ZKP_PROOF_GENERATED`, `AuditAction.ZKP_PROOF_VERIFIED`, `AuditResourceType.ZKP_PROOF`.
  - Enums de domínio `ZkpProofType` (`AUTHORSHIP_PROOF`, `INTEGRITY_NONCE_PROOF`, `ATTRIBUTES_PREDICATE_PROOF`, `FULL_FORENSIC_ZKP`) e `ZkpVerificationStatus` (`VERIFIED_VALID`, `INVALID_PROOF`, `TAMPERED_CHALLENGE`, `EXPIRED_CREDENTIAL`).
  - Interfaces `ZkpSchnorrProof`, `ZkpClinicalDocumentProof`, `ZkpVerificationResult` e `ZkpSystemMetrics`.
  - DTOs `GenerateZkpProofDTO`, `VerifyZkpProofDTO`, `ZkpProofResponse`, `ZkpVerificationResponse` e `ZkpProofListResponse`.
- [x] **Backend Service & Rotas REST Hono (`apps/backend`):**
  - `ZkpService`: Singleton gerenciando a emissão de provas Schnorr NIZK, verificação forense anônima com proteção anti-tampering de desafio, selagem na hash-chain WORM e agregação de métricas com latência de resposta.
  - Endpoints REST em `/api/security/zkp/*`:
    - `POST /generate`: Emissão autenticada de prova ZKP (RBAC `PSICOLOGO_TITULAR` e `ADMIN`) para laudos, pareceres, atestados e prontuários.
    - `POST /verify`: Endpoint público e anônimo permitindo que juizados, planos de saúde e peritos validem a autenticidade e integridade documental com 0 bytes de dados clínicos vazados.
    - `GET /proofs`: Trilha forense de provas registradas.
    - `GET /metrics`: Agregados estatísticos de geração e conferência ZKP em tempo real.
  - Suíte de 5 testes de integração passando (`apps/backend/test/zkp.test.ts`).
- [x] **Frontend Clínico & Gestão de Segurança (`apps/frontend`):**
  - Card 17 (*Assinaturas Forenses com Provas de Conhecimento Zero - ZKP*) integrado no `SecurityModule.tsx` com 4 KPIs em tempo real (Provas Geradas, Validações Forenses, Taxa de Sucesso ZKP e Vazamento de Texto: 0 Bytes).
  - Laboratório de Emissão de Prova Schnorr NIZK para psicólogos titulares com redução determinística local do texto clínico.
  - Verificador Forense Público & Anônimo com feedback visual Zero-Leakage e validação instantânea da identidade $g^s \equiv R \cdot Y^c \pmod p$.
  - Tabela forense de provas ativas com carregamento imediato de tokens e cópia facilitada.
  - Conformidade estrita com **Light Mode** e **Dark Mode**.

### 36. Módulo de Detecção Proativa de Vazamento de Credenciais na Dark Web & Contenção de Incidentes (Threat Intelligence / HaveIBeenPwned Monitor com k-Anonymity NIST SP 800-63B) (RFC-001 §4.4, LGPD Art. 46, 48 e Resolução CD/ANPD nº 15/2024)
- [x] **Core Criptográfico (`packages/crypto/src/breachMonitor.ts`):**
  - **Motor k-Anonymity SHA-1 (`calculateKAnonymitySplit`):** Implementação estrita do modelo NIST SP 800-63B / HaveIBeenPwned dividindo o hash SHA-1 da senha em prefixo de 5 caracteres hexadecimais maiúsculos (`prefix5`) e sufixo de 35 caracteres (`suffix35`), garantindo consulta com 0 vazamento da credencial completa.
  - **Correspondência Determinística em Sufixos (`matchKAnonymitySuffix`):** Comparação em tempo constante contra listas de sufixos comprometidos com extração precisa de contagem de exposições (`pwnedCount`).
  - **Matriz de Severidade de Vazamento (`evaluateBreachSeverity`):** Classificação dinâmica baseada em vetor de ataque (`STEALER_LOG`, `DARK_WEB_FORUM`, `PUBLIC_PASTE`, `CREDENTIAL_STUFFING_DUMP`), privilégios do usuário (`ADMIN`, `PSICOLOGO_TITULAR`) e volume de ocorrências.
  - **Avaliação de Notificação Tempestiva à ANPD (`requiresAnpdNotification`):** Avaliação de risco relevante e dano aos titulares (LGPD Art. 48) para credenciais administrativas, operadores e profissionais de saúde com mais de 3 exposições.
  - **Cálculo de Prazo Legal Tempestivo ANPD (`calculateAnpdDeadline`):** Prazo estrito de 3 dias úteis conforme regulamentação da Resolução CD/ANPD nº 15/2024, computando finais de semana.
  - **Digest Canônico e Selagem WORM (`calculateIncidentWormDigest`):** Geração de hash SHA-256 canônico imutável vinculando identificador mascarado, vetor, severidade, data e protocolo do incidente.
  - Suíte de 9 testes unitários dedicados passando (`packages/crypto/test/breachMonitor.test.ts`).
- [x] **Contratos Compartilhados (`packages/shared`):**
  - Enums de auditoria WORM `AuditAction.CREDENTIAL_BREACH_DETECTED`, `AuditAction.SESSION_FORCE_REVOKED`, `AuditAction.DPO_BREACH_ALERT_DISPATCHED`, `AuditAction.INCIDENT_CONTAINED`, `AuditAction.INCIDENT_RESOLVED` e `AuditResourceType.THREAT_INTELLIGENCE`.
  - Enums de domínio `ThreatSourceType` (`DARK_WEB_FORUM`, `STEALER_LOG`, `PUBLIC_PASTE`, `CREDENTIAL_STUFFING_DUMP`), `BreachSeverity` (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) e `IncidentContainmentStatus` (`ACTIVE_THREAT`, `CONTAINED_SESSIONS_REVOKED`, `RESOLVED_PASSWORD_RESET`, `FALSE_POSITIVE`).
  - Interfaces `CredentialBreachRecord`, `DpoIncidentAlert`, `ThreatIntelligenceMetrics` e `KAnonymityLookupResult`.
  - DTOs `CheckCredentialBreachDTO`, `TriggerDarkWebScanDTO`, `ContainIncidentDTO`, `ResolveIncidentDTO`, `CredentialBreachCheckResponse`, `ThreatScanResponse`, `ContainIncidentResponse`, `ResolveIncidentResponse` e `ThreatIntelligenceOverviewResponse`.
- [x] **Backend Service & Rotas REST Hono (`apps/backend`):**
  - `ThreatIntelligenceService`: Singleton gerenciando o banco de hashes k-Anonymity em memória, orquestração de varreduras simuladas de dumps/stealers, revogação compulsória de sessões ativas (`revokeUserSessions`), despacho de alertas DPO tempestivos, resolução de incidentes e agregação de métricas com trilha WORM.
  - Endpoints REST em `/api/security/threat-intelligence/*`:
    - `POST /check`: Verificação instantânea de credencial via k-Anonymity (sem armazenar texto plano).
    - `POST /scan`: Execução sob demanda de varredura proativa em feeds de Threat Intelligence da Dark Web.
    - `POST /contain`: Contenção imediata em 1 clique com revogação compulsória de sessões do usuário e mitigação de acesso não autorizado.
    - `POST /resolve`: Resolução formal pelo DPO com averbação de protocolo da ANPD, justificativa ética e auditoria WORM.
    - `GET /overview`: Panorama consolidado de Threat Intelligence, incidentes recentes e alertas pendentes do DPO.
  - Suíte de 6 testes de integração passando (`apps/backend/test/threatIntelligence.test.ts`).
- [x] **Frontend Clínico & Gestão de Segurança (`apps/frontend`):**
  - Card 18 (*Threat Intelligence & Monitor de Vazamento de Credenciais na Dark Web*) integrado no `SecurityModule.tsx` com 4 KPIs em tempo real (Credenciais Monitoradas, Incidentes Ativos na Dark Web, Sessões Revogadas Compulsoriamente e Alertas DPO/ANPD).
  - Verificador k-Anonymity em tempo real para auditoria de senhas sem transmissão em texto plano.
  - Disparador de Varredura Proativa com detecção de logs de infostealers e dumps de credenciais.
  - Central de Alertas Críticos para o DPO com badge de prazo tempestivo (3 dias úteis - CD/ANPD nº 15/2024).
  - Tabela forense de incidentes com botão de **Contenção Imediata (Revogar Sessões)** e ação de **Resolução DPO com Protocolo ANPD**.
  - Modal de Resolução Formal DPO com validação de número de protocolo e motivo ético.
  - Suporte completo a **Light Mode** e **Dark Mode**.

### 37. Controle Granular de Consentimento do Paciente com Smart Revocation & Trilha Consent-Led (LGPD Art. 7/8/9/11/18 & Resolução CFP nº 006/2019)
- [x] **Core Criptográfico (`packages/crypto/src/consentLedger.ts`):**
  - **Digest Canônico de Recibo WORM (`calculateConsentReceiptHash`):** Função determinística gerando hash SHA-256 de 64 caracteres imutável vinculando paciente, finalidade, ação (GRANT/REVOKE), base legal (LGPD Art. 7, 11 e CFP), versão do termo (`v2.1`), carimbo temporal, IP e User-Agent.
  - **Codificação e Decodificação de Token TCLE (`encodeConsentToken` & `decodeConsentToken`):** Geração de token público `tcle_v1_<base64url>` para conferência e validação Zero-Knowledge pelo titular.
  - **Validação Matemática de Integridade (`verifyConsentReceiptIntegrity`):** Verificação criptográfica de integridade contra adulteração temporal ou de escopo.
  - **Motor de Consent-Led Enforcement (`evaluateProcessingPermission`):** Avaliação em tempo real que autoriza escopos com status `GRANTED` e bloqueia tempestivamente tratamentos em caso de `REVOKED` (Smart Revocation com fundamentação legal no Art. 8º §5º da LGPD), `REFUSED` ou `EXPIRED`.
  - Suíte de 9 testes unitários dedicados passando (`packages/crypto/test/consentLedger.test.ts`).
- [x] **Contratos Compartilhados (`packages/shared`):**
  - Enums de auditoria WORM `AuditAction.CONSENT_GRANTED`, `AuditAction.CONSENT_REVOKED`, `AuditAction.CONSENT_RECEIPT_VERIFIED`, `AuditAction.CONSENT_ENFORCEMENT_BLOCKED` e `AuditResourceType.CONSENT_RECORD`.
  - Enums de domínio `ConsentScope` (5 finalidades determinadas: `TELECONSULTATION_AUDIO_RECORDING`, `AI_CLINICAL_SYNTHESIS`, `ANONYMIZED_RESEARCH`, `INTERPROFESSIONAL_SHARING`, `COMMUNICATION_REMINDERS`), `ConsentStatus` (`GRANTED`, `REVOKED`, `EXPIRED`, `REFUSED`) e `ConsentLegalBasis`.
  - Interfaces `PatientConsentScopePreference`, `ConsentReceipt`, `PatientConsentLedger`, `ConsentValidationResult` e `ConsentLedgerOverview`.
  - DTOs `GrantGranularConsentDTO`, `RevokeGranularConsentDTO`, `VerifyConsentTokenDTO`, `EnforceConsentDTO`, `GranularConsentResponse`, `ConsentReceiptResponse`, `EnforceConsentResponse` e `ConsentLedgerOverviewResponse`.
- [x] **Backend Service, Rotas REST & Bloqueio em Tempo de Execução (`apps/backend`):**
  - `ConsentService`: Singleton gerenciando livros-razão de consentimento por paciente, emissão de recibos WORM, persistência em memória, Smart Revocation e agregação de métricas de conformidade.
  - Endpoints REST em `/api/consent/*`:
    - `POST /grant`: Concessão granular por escopo com emissão de recibo e token `tcle_v1_`.
    - `POST /revoke`: Smart Revocation com justificativa ética formal e registro na hash-chain WORM.
    - `GET /patient/:patientId`: Extrato completo de consentimento do paciente.
    - `POST /enforce`: Validação pontual de autorização de tratamento.
    - `GET /verify/:token`: Verificação pública Zero-Knowledge do recibo.
    - `GET /overview`: Métricas globais de conformidade LGPD da clínica e trilha de recibos recentes.
  - **Consent-Led Enforcement em IA (`apps/backend/src/services/aiSoapService.ts`):** Validação ativa no método `generateSoapProposal` que bloqueia geração de SOAP assistida por IA caso o escopo `AI_CLINICAL_SYNTHESIS` tenha sido revogado pelo paciente.
  - Suíte de 7 testes de integração passando (`apps/backend/test/consent.test.ts`).
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Módulo de Pacientes (`PatientsModule.tsx`):**
    - Botão "Consentimento Granular (LGPD)" adicionado a cada paciente.
    - Modal interativo com abas *Escopos Determinados (5)* e *Recibos Probatórios WORM*.
    - Switches/toggles para controle individual de cada escopo com status badges (`GRANTED`, `REVOKED`, `REFUSED`).
    - Fluxo de **Smart Revocation** solicitando justificativa formal e orientando sobre o prazo legal de guarda obrigatória de 5 anos (Resolução CFP nº 001/2009 e LGPD Art. 16, I).
  - **Módulo de Segurança (`SecurityModule.tsx`):**
    - **Card 19** (*Governança Granular de Consentimento & Smart Revocation*) com 4 KPIs em tempo real (Pacientes com TCLE Ativo, Smart Revocations Registradas, Bloqueios Ativos de Tratamento e Taxa de Conformidade LGPD).
    - Validador Público de Recibo TCLE (Zero-Knowledge) para conferência matemática de tokens `tcle_v1_*`.
    - Tabela de Recibos Recentes na Trilha WORM com cópia instantânea de tokens.
  - Conformidade estrita com **Light Mode** e **Dark Mode**.

### 38. Data Loss Prevention (DLP) no Clipboard Clínico com Marca d'Água Esteganográfica & Prevenção de Exfiltração de Prontuários (LGPD Art. 46 & CFP nº 001/2009)
- [x] **Core Criptográfico & Esteganográfico Zero-Width (`packages/crypto/src/clipboardDlp.ts`):**
  - **Tabela de Caracteres Invisíveis Unicode:** Codificação de bits em caracteres de largura zero (`\u200B` = ZWSP / Bit 0, `\u200C` = ZWNJ / Bit 1) com delimitadores de enquadramento de pacote (`\uFEFF\u200D` / `\u200D\uFEFF`).
  - **Digest Canônico & Assinatura HMAC:** Função `calculateContentDigest` (SHA-256) e assinatura `signForensicData` (HMAC-SHA256) para validação anti-adulteração de marcas d'água.
  - **Injeção Esteganográfica Imperceptível:** Função `embedSteganographicWatermark` que incorpora identificador de watermark, ID do operador, ID do paciente, timestamp e digest no texto sem alterar a leitura visual humana.
  - **Decodificador Forense de Exfiltração:** Função `extractSteganographicWatermark` capaz de recuperar metadados de procedência mesmo em textos recortados ou colados em canais externos (WhatsApp, chats, documentos locais).
  - **Motor de Políticas de Clipboard DLP:** Função `evaluateClipboardPolicyEngine` com suporte aos modos `WATERMARK_ONLY`, `WATERMARK_AND_NOTICE`, `MASK_SENSITIVE` e `BLOCK_EXFILTRATION`.
  - Suíte de 11 testes unitários passando (`packages/crypto/test/clipboardDlp.test.ts`).
- [x] **Contratos Compartilhados (`packages/shared`):**
  - **Enums de DLP e Auditoria WORM (`enums.ts`):** `DlpPolicyMode`, `DlpRiskLevel`, `SteganographyInspectionStatus`, `AuditResourceType.CLIPBOARD_DLP` e ações de auditoria (`CLIPBOARD_COPY_AUDITED`, `CLIPBOARD_WATERMARK_EMBEDDED`, `CLIPBOARD_EXFILTRATION_BLOCKED`, `CLIPBOARD_WATERMARK_INSPECTED`, `CLIPBOARD_POLICY_VIOLATION`).
  - **Modelos e DTOs (`models.ts` & `dtos.ts`):** Interfaces `DlpForensicPayload`, `DlpInspectionResult`, `DlpEvaluationResult`, `DlpEventLog`, `DlpAuditOverview`, DTOs de avaliação/inspeção e tipos inferidos.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - **DlpService (`apps/backend/src/services/dlpService.ts`):** Singleton com controle de cópias monitoradas, bloqueios de exfiltração, registros invioláveis via `AuditService.log` (WORM hash-chain) e persistência de histórico de eventos.
  - **Rotas REST (`apps/backend/src/routes/dlp.ts`):**
    - `POST /api/dlp/evaluate`: Avalia e aplica política de DLP e marca d'água na cópia.
    - `POST /api/dlp/inspect`: Perícia forense em textos suspeitos com extração de evidências.
    - `GET /api/dlp/overview`: Estatísticas consolidadas e trilha de eventos recentes.
    - `PUT /api/dlp/policy`: Atualização administrativa da política ativa global.
  - Suíte de 8 testes de integração passando (`apps/backend/test/dlp.test.ts`).
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Métodos de API (`api.ts`):** `evaluateClipboardDlp`, `inspectClipboardDlp`, `getDlpOverview`, `updateDlpPolicy`.
  - **Módulo de Segurança (`SecurityModule.tsx`):**
    - **Card 20** (*Data Loss Prevention no Clipboard & Rastreabilidade Forense Esteganográfica*) com 4 KPIs regulatórios (Cópias Monitoradas, Marcas Injetadas, Exfiltrações Bloqueadas, Perícias Forenses).
    - Seletor de Política Ativa em tempo real com 4 modos configuráveis para Administrador.
    - **Inspetor Forense de Marca d'Água Esteganográfica (Zero-Width Decoder):** Textarea interativo para perícia de textos suspeitos de vazamento, decodificando imediatamente autor da cópia, paciente, data/hora e integridade HMAC.
    - Botão de Amostra Clínica Protegida para testes rápidos com 1 clique.
    - Tabela de Auditoria WORM em Tempo Real de Eventos de Clipboard com níveis de risco.
  - Suporte completo e refinado a **Light Mode** e **Dark Mode**.

### 39. Cartório Notarial Digital de Prontuários & Auditoria Forense Zero-Knowledge (CFP nº 001/2009 e LGPD Art. 18)
- [x] **Core Criptográfico Notarial (`packages/crypto/src/clinicalNotary.ts`):**
  - **Blind Indexing Notarial:** Função `generateRecordBlindIndex` (HMAC-SHA256) para pseudonimização determinística de prontuários com chave isolada (`NOTARY_BLIND_INDEX_SALT`), garantindo que nenhuma PII ou dado clínico seja exposto em perícias públicas.
  - **Digest Canônico SHA-256:** Função `calculateClinicalCanonicalHash` com ordenação determinística de chaves para cálculo invariante de integridade intrínseca de evoluções clínicas.
  - **Encadeamento Temporal de Blocos (WORM Hash-Chain):** Função `calculateNotaryBlockHash` encadeando `previousNotaryHash`, versão sequencial do registro, timestamp canônico e blind index.
  - **Selo Notarial Público de Fé Pública:** Funções `encodeNotarySeal` e `decodeNotarySeal` gerando e decodificando tokens seguros `notary_v1_<base64url>` para verificação pericial externa sem autenticação.
  - **Motores de Verificação Forense:**
    - `verifyNotaryBlockIntegrity`: Validação matemática intrínseca do bloco e do selo notarial.
    - `verifyNotaryChainIntegrity`: Auditoria de consistência sequencial temporal de toda a cadeia de sessões do paciente (detecção de adulteração, truncamento ou inserção forjada).
  - Suíte de 8 testes unitários passando (`packages/crypto/test/clinicalNotary.test.ts`).
- [x] **Contratos Compartilhados (`packages/shared`):**
  - **Enums e Ações de Auditoria WORM:** `AuditResourceType.NOTARY_LEDGER`, ações (`NOTARY_SEAL_GENERATED`, `NOTARY_CHAIN_VERIFIED`, `NOTARY_TAMPERING_DETECTED`, `NOTARY_CERTIFICATE_ISSUED`), `NotaryStatus` (`NOTARIZED`, `RECTIFIED`, `REVOKED`, `DISPUTED`) e `NotaryVerificationStatus` (`VALID_GENUINE`, `CHAIN_BROKEN`, `CONTENT_TAMPERED`, `NOT_FOUND`).
  - **Modelos e DTOs:** Interfaces `ClinicalNotaryBlock`, `NotaryChainVerificationResult`, `NotaryLedgerOverview`, `NotaryCertificate`, DTOs de selagem, verificação, cadeia e emissão de certidão tipada.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - **ClinicalNotaryService (`apps/backend/src/services/clinicalNotaryService.ts`):** Singleton em memória gerenciando livros notariais por paciente, encadeamento gênese, certidões com fé pública e logs WORM invioláveis via `AuditService.log`.
  - **Rotas REST (`apps/backend/src/routes/clinicalNotary.ts`):**
    - `POST /api/notary/seal`: Notariza formalmente nota clínica com blind index e hash-chain WORM.
    - `POST /api/notary/verify`: Perícia Zero-Knowledge pública via selo digital ou blind index.
    - `GET /api/notary/patient/:patientId`: Retorna histórico cronológico de blocos e validação da cadeia.
    - `POST /api/notary/certificate`: Emite certidão forense timbrada de autenticidade notarial.
    - `GET /api/notary/overview`: Estatísticas executivas e blocos notariais recentes.
  - Suíte de 6 testes de integração passando (`apps/backend/test/clinicalNotary.test.ts`).
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Métodos de API (`api.ts`):** `sealClinicalRecord`, `verifyNotarySeal`, `getPatientNotaryBlocks`, `issueNotaryCertificate`, `getNotaryOverview`.
  - **Módulo de Segurança (`SecurityModule.tsx`):**
    - **Card 21** (*Cartório Notarial Digital & Fé Pública de Prontuários*) com 4 KPIs regulatórios (Blocos Selados, Cadeias Auditadas, Tentativas de Fraude, Conformidade Notarial).
    - **Validador Notarial Público Zero-Knowledge:** Formulário interativo para perícia de tokens `notary_v1_*`, decodificando status, integridade intrínseca da cadeia e blind index sem expor dados clínicos.
    - **Livro Notarial de Blocos Clínicos Encadeados (Ledger WORM):** Tabela de blocos cronológicos com hashes SHA-256, atalhos de cópia e emissão de certidão pericial com 1 clique.
    - **Modal Timbrado de Certidão Notarial Forense:** Documento probatório com blind index, asserções de conformidade CFP nº 001/2009 e LGPD Art. 18, II, ID da certidão e selo copiado.
  - Suporte completo a **Light Mode** e **Dark Mode**.

### 40. Mecanismo de Descarte e Expurgamento Seguro de Dados Históricos por Fim de Ciclo de Tratamento com Prova Criptográfica de Destruição (LGPD Art. 16, CFP nº 001/2009)
- [x] **Core Criptográfico de Expurgamento & Sanitização (`packages/crypto/src/securePurge.ts`):**
  - **Blind Indexing de Paciente Purgado:** Função `generatePurgeBlindIndex` (HMAC-SHA256) gerando pseudonimização determinística invariante com chave isolada (`PURGE_BLIND_INDEX_SALT`), garantindo que o titular não possa ser reidentificado após a destruição.
  - **Digest Canônico SHA-256 de Destruição:** Função `calculatePurgeProofHash` com ordenação canônica lexicográfica de campos para geração do hash probatório irrefutável.
  - **Selo Probatório Público de Destruição (`purge_v1_*`):** Funções `encodePurgeSeal` e `decodePurgeSeal` gerando tokens URL-safe `purge_v1_<base64url>` contendo metadata forense para verificação externa sem expor conteúdo clínico.
  - **Validação Matemática de Prova de Destruição:** Função `verifyPurgeCertificateIntegrity` validando assinatura, hash canônico e consistência temporal.
  - **Simulador Criptográfico de Sanitização NIST SP 800-88 Rev. 1 CE:** Função `simulateCryptoShredding` calculando entropia de chaves DEK/KEK destruídas e bytes sanitizados.
  - Suíte de 8 testes unitários passando (`packages/crypto/test/securePurge.test.ts`).
- [x] **Contratos Compartilhados (`packages/shared`):**
  - **Enums e Ações de Auditoria WORM:** `AuditResourceType.PURGE_LEDGER`, ações (`DATA_PURGE_REQUESTED`, `DATA_PURGE_BLOCKED_CFP_RULE`, `DATA_PURGE_EXECUTED`, `DATA_PURGE_CERTIFICATE_ISSUED`, `DATA_PURGE_PROOF_VERIFIED`), `PurgeReason` (`RETENTION_PERIOD_EXPIRED_5_YEARS`, `PATIENT_REQUEST_ART_18`, `LEGAL_DETERMINATION`, `TREATMENT_TERMINATION`), `PurgeMethod` (`CRYPTO_SHREDDING_NIST_800_88`, `DEK_REVOCATION_AND_OVERWRITE`, `HYBRID_SHREDDING_WORM`), `PurgeStatus` e `PurgeProofVerificationStatus`.
  - **Modelos e DTOs:** Interfaces `DataPurgeCertificate`, `PurgeCandidateRecord`, `PurgeExecutionResult`, `PurgeLedgerOverview`, `PurgeProofVerificationResult` e DTOs `ExecuteDataPurgeDTO`, `VerifyPurgeProofDTO` e respostas tipadas.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - **SecurePurgeService (`apps/backend/src/services/securePurgeService.ts`):** Singleton com cálculo de inatividade em meses, aplicação estrita da regra de 5 anos (60 meses) da Resolução CFP nº 001/2009 Art. 2º §2º (bloqueio administrativo com HTTP 403 e auditoria WORM, ressalvada determinação judicial explícita), destruição de chaves simétricas e registros clínicos, emissão de certidões probatórias e trilha WORM inviolável via `AuditService.log`.
  - **Rotas REST (`apps/backend/src/routes/securePurge.ts`):**
    - `GET /api/purge/candidates`: Lista candidatos a expurgo com status de elegibilidade CFP.
    - `POST /api/purge/execute`: Executa o descarte irreversível com validação de regras legais.
    - `POST /api/purge/verify`: Perícia e validação pública de provas matemáticas de destruição.
    - `GET /api/purge/overview`: Estatísticas de governança de descarte e certidões recentes.
    - `GET /api/purge/certificate/:certificateId`: Busca certidão probatória individual.
  - Suíte de 8 testes de integração passando (`apps/backend/test/securePurge.test.ts`).
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Métodos de API (`api.ts`):** `getPurgeCandidates`, `executeDataPurge`, `verifyPurgeProof`, `getPurgeOverview`, `getPurgeCertificate`.
  - **Módulo de Segurança (`SecurityModule.tsx`):**
    - **Card 22** (*Descarte & Expurgamento Seguro de Dados Históricos*) com 4 KPIs regulatórios (Pacientes Purgados, Registros Destruídos, Certidões Emitidas, Candidatos Elegíveis).
    - **Validador de Prova Criptográfica de Destruição (Zero-Knowledge):** Formulário interativo para verificação pericial de tokens `purge_v1_*` ou IDs de certidão com botão de carga rápida de amostra demo.
    - **Tabela de Candidatos a Expurgamento:** Listagem de prontuários com meses de inatividade, badges de status regulatório (> 60 meses vs Retenção Obrigatória) e gatilho de expurgo.
    - **Livro Notarial de Certidões de Expurgamento:** Tabela com certidões emitidas, hashes canônicos SHA-256 e atalhos para visualização e cópia de selos.
    - **Modal de Confirmação de Expurgamento:** Modal com avisos solenes de irreversibilidade, seleção de motivação legal e método de sanitização, e campo obrigatório de número de mandado/processo judicial para override de prontuários com menos de 5 anos.
    - **Modal Timbrado de Certidão Probatória:** Documento pericial de fé pública com blind index ZK, asserções de conformidade LGPD Art. 16 e CFP nº 001/2009 e selo criptográfico.
  - Suporte completo a **Light Mode** e **Dark Mode**.

### 41. Protocolo de Federação de Chaves e Identidades Clínicas Descentralizadas (DID / Verifiable Credentials) para Interoperabilidade em Saúde Mental (RFC-001 §3.5)
- [x] **Core Criptográfico de DID & Verifiable Credentials (`packages/crypto/src/clinicalDid.ts`):**
  - **Canonicalização JCS RFC 8785 (`canonicalizeJson`):** Serialização canônica determinística com ordenação lexicográfica recursiva filtrando propriedades `undefined` para garantia de reprodução exata de digests criptográficos entre memória e payloads serializados.
  - **Identificadores Descentralizados W3C DID v1.0:** Geração e parsing de DIDs para terapeutas (`did:terapia:crp-XX-YYYYYY`), nós descentralizados (`did:key:z6Mk...`) e sujeitos clínicos com Blind Index (`did:terapia:patient:blind-...`).
  - **DID Documents W3C v1.0:** Emissão de documentos DID completos contendo `authentication`, `assertionMethod` e `service` endpoints.
  - **Emissão de Verifiable Credentials W3C VC v2.0 (`signVerifiableCredential`):** Assinatura de credenciais clínicas com prova de integridade `DataIntegrityProof` / `Ed25519Signature2020` e `JsonWebSignature2020`, hash canônico SHA-256 e blind index do paciente.
  - **Empacotamento VC-JWT (`encodeCredentialJwt` / `decodeCredentialJwt`):** Compactação e descompactação em conformidade com o padrão W3C VC-JWT para transporte interoperável em QR Codes e URLs.
  - **Verificação Matemática Descentralizada (`verifyVerifiableCredentialProof`):** Validação matemática offline/online de autenticidade da assinatura, integridade de payload, prazo de validade e checagem de revogação W3C (`StatusList2021`).
  - **Verifiable Presentations com Proteção Anti-Replay (`createVerifiablePresentation` / `verifyVerifiablePresentation`):** Criação e validação de pacotes de apresentação de múltiplas credenciais com verificação de `nonce` e `audience`.
  - Suíte de 9 testes unitários passando (`packages/crypto/test/clinicalDid.test.ts`).
- [x] **Contratos Compartilhados (`packages/shared`):**
  - **Enums e Ações de Auditoria WORM:** `AuditResourceType.CLINICAL_FEDERATION_DID`, ações (`DID_DOCUMENT_RESOLVED`, `VERIFIABLE_CREDENTIAL_ISSUED`, `VERIFIABLE_CREDENTIAL_VERIFIED`, `VERIFIABLE_CREDENTIAL_REVOKED`, `VERIFIABLE_PRESENTATION_VERIFIED`), `ClinicalDidMethod`, `VerifiableCredentialType`, `CredentialRevocationStatus` e `DidVerificationStatus`.
  - **Modelos e DTOs:** Interfaces `W3CVerificationMethod`, `W3CDidDocument`, `ClinicalCredentialSubject`, `W3CDataIntegrityProof`, `W3CVerifiableCredential`, `W3CVerifiablePresentation`, `DidFederationOverview`, `VerifiableCredentialVerificationResult` e DTOs `ResolveDidDTO`, `IssueVerifiableCredentialDTO`, `VerifyVerifiableCredentialDTO`, `RevokeVerifiableCredentialDTO` e respostas tipadas.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - **ClinicalDidService (`apps/backend/src/services/clinicalDidService.ts`):** Singleton gerenciando federação descentralizada com seed demonstrativo, resolução de DID Documents, emissão de credenciais com blind index de paciente (`computeBlindIndex`), verificação descentralizada independente de autoridades centrais, revogação solene e registro de todas as operações na trilha de auditoria WORM imutável via `AuditService.log`.
  - **Rotas REST (`apps/backend/src/routes/clinicalDid.ts`):**
    - `GET /api/did/resolve/:did`: Resolução de DID Documents W3C v1.0.
    - `POST /api/did/credentials/issue`: Emissão de credenciais verificáveis assinadas pelo terapeuta titular.
    - `POST /api/did/credentials/verify`: Perícia e validação matemática de credenciais e apresentações (VC-JWT ou JSON).
    - `POST /api/did/credentials/revoke`: Revogação solene de credenciais com registro WORM.
    - `GET /api/did/overview`: Métricas de federação, total de terapeutas federados e credenciais emitidas/verificadas.
    - `GET /api/did/credentials/patient/:patientId`: Listagem de credenciais associadas a um paciente específico.
  - Suíte de 8 testes de integração passando (`apps/backend/test/clinicalDid.test.ts`).
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Métodos de API (`api.ts`):** `resolveDid`, `issueVerifiableCredential`, `verifyVerifiableCredential`, `revokeVerifiableCredential`, `getDidFederationOverview`, `getPatientVerifiableCredentials`.
  - **Módulo de Segurança (`SecurityModule.tsx`):**
    - **Card 23** (*Federação de Identidades Descentralizadas (DID) & Credenciais Verificáveis W3C*) com 4 KPIs regulatórios (Terapeutas Federados, Credenciais Emitidas, Credenciais Validadas, Credenciais Ativas).
    - **Validador Descentralizado de Credenciais W3C (Zero-Knowledge):** Validação de credenciais e apresentações (VC-JWT ou JSON) com botão de carga rápida de amostra demo.
    - **Formulário de Emissão de Credenciais Clínicas:** Emissão de guias de encaminhamento, atestados (CFP 006/2019) e laudos psicológicos com blind index do paciente e selagem WORM.
    - **Livro Notarial WORM de Credenciais Emitidas:** Tabela de credenciais com status dinâmicos (ACTIVE vs REVOKED), hashes, visualização pericial, cópia de token VC-JWT e gatilho de revogação.
    - **Modal de Confirmação de Revogação Solene:** Alerta compulsório de ética médica/psicológica, justificativa formal e registro imutável na trilha WORM.
    - **Modal Timbrado de Credencial Verificável W3C:** Documento timbrado pericial com QR Code de leitura pública federada, dados estruturados do sujeito clínico, prova de integridade W3C e ações de cópia de VC-JWT e JSON.
  - Suporte completo a **Light Mode** e **Dark Mode**.

### 42. Análise Comportamental Preditiva de Acesso Anômalo (UEBA - User and Entity Behavior Analytics) para Detecção de Exfiltração Interna em Prontuários (RFC-001 §4.4 & LGPD Art. 46)
- [x] **Core Criptográfico & Motor Analítico UEBA (`packages/crypto/src/uebaEngine.ts`):**
  - **Modelagem Preditiva de Risco Heurístico:** Função `evaluateAccessRisk` calculando pontuação consolidada de risco de 0 a 100 com fatores multiplicadores para ataques combinados e classificação em 5 níveis (`NORMAL`, `SUSPICIOUS`, `ANOMALOUS`, `HIGH_RISK`, `CRITICAL_EXFILTRATION`).
  - **Classificadores de Anomalia de Acesso:** Detecção de acessos fora de horário e madrugada (`OFF_HOURS_ACCESS`), raspagem massiva sequencial e bulk read (`BULK_RECORD_SCRAPING`), varredura de notas confidenciais SOAP (`SOAP_MASS_READ`), salto geográfico/IP de país divergente (`UNUSUAL_GEO_IP_JUMP`), enumeração acelerada de Blind Index de CPF (`BLIND_INDEX_ENUMERATION`) e sessões concorrentes rápidas (`RAPID_CONCURRENT_SESSIONS`).
  - **Aprendizado de Baseline Individual (`calculateBaselineStats`):** Extração estatística de janelas horárias habituais, dias da semana, média/desvio padrão de requisições por hora e prefixos de rede confiáveis.
  - **Selo Notarial Probatório WORM (`generateUebaIncidentProof` / `verifyUebaIncidentProof`):** Geração determinística de token `ueba_v1_<base64url>` contendo canonical digest SHA-256 (RFC 8785) e assinatura HMAC anti-tampering.
  - Suíte de 10 testes unitários passando (`packages/crypto/test/uebaEngine.test.ts`).
- [x] **Contratos Compartilhados (`packages/shared`):**
  - **Enums e Ações de Auditoria WORM:** `AuditResourceType.UEBA_SECURITY_ENGINE`, ações (`UEBA_ANOMALY_DETECTED`, `UEBA_CONTAINMENT_TRIGGERED`, `UEBA_CONTAINMENT_RELEASED`, `UEBA_PROFILE_LEARNED`, `UEBA_RISK_THRESHOLD_MODIFIED`), `UebaRiskLevel`, `UebaAnomalyType`, `UebaContainmentAction` e `UebaContainmentStatus`.
  - **Modelos e DTOs:** Interfaces `UebaAccessEvent`, `UebaUserProfileBaseline`, `UebaRiskAssessment`, `UebaAnomalyIncident`, `UebaSystemOverview` e DTOs `EvaluateAccessRiskDTO`, `SimulateAccessPatternDTO`, `ApplyUebaContainmentDTO` e respostas tipadas.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - **UebaService (`apps/backend/src/services/uebaService.ts`):** Singleton com baselines em memória, janela deslizante de 15 minutos por usuário, detecção em tempo real, disparo compulsório de contenção (`SUSPEND_SESSION` / `STEP_UP_2FA_CHALLENGE`) para scores >= 75 e registro na trilha WORM inviolável via `AuditService.log`.
  - **Rotas REST (`apps/backend/src/routes/ueba.ts`):**
    - `POST /api/ueba/evaluate`: Avaliação preditiva de risco em tempo real.
    - `POST /api/ueba/simulate`: Simulação de cenários anômalos (Bulk Scraping, Midnight, Geo Jump, Blind Index Dictionary).
    - `POST /api/ueba/contain`: Aplicação ou liberação de contenção administrativa.
    - `GET /api/ueba/overview`: Métricas de governança e distribuição de risco.
    - `GET /api/ueba/incidents`: Listagem cronológica de incidentes anômalos.
    - `GET /api/ueba/profile/:userId`: Baseline comportamental e status de contenção.
  - Suíte de 8 testes de integração passando (`apps/backend/test/ueba.test.ts`).
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Métodos de API (`api.ts`):** `getUebaOverview`, `evaluateUebaAccess`, `simulateUebaPattern`, `applyUebaContainment`, `getUebaIncidents`, `getUserUebaProfile`.
  - **Módulo de Segurança (`SecurityModule.tsx`):**
    - **Card 24** (*Inteligência Comportamental & Detecção de Acesso Anômalo - UEBA*) com 4 KPIs regulatórios (Score Médio de Risco, Anomalias em 24h, Exfiltrações Bloqueadas, Sessões em Contenção).
    - **Simulador Interativo de Padrões de Acesso Clínico:** 5 cenários clicáveis para teste de detecção em tempo real.
    - **Painel de Análise Preditiva em Tempo Real:** Medidor visual com barra de risco, badges de nível, evidências de anomalias com pontuações parciais e ação recomendada.
    - **Livro Notarial de Incidentes Comportamentais UEBA:** Tabela de incidentes WORM com severidade, anomalias, ações mitigadoras e botões de detalhes e contenção/liberação.
    - **Modal de Aplicação de Contenção Preventiva:** Opções de Step-up 2FA, Suspensão de Sessão ou Quarentena com justificativa formal registrada na trilha WORM.
    - **Modal Timbrado de Incidente Forense UEBA:** Documento pericial completo com metadados do evento disparador, IP, User Agent, fatores de anomalia e selo probatório `ueba_v1_*`.
  - Suporte completo a **Light Mode** e **Dark Mode**.

### 43. Protocolo Criptográfico de Anonimização Estatística Diferencial (Differential Privacy - ε-DP) para Pesquisa Clínica e Benchmarks Epidemiológicos (LGPD Art. 13 & CFP nº 001/2009)
- [x] **Core Criptográfico & Motor Matemático de Privacidade Diferencial (`packages/crypto/src/differentialPrivacy.ts`):**
  - **Mecanismos de Ruído Estocástico:** Implementação do Mecanismo de Laplace (Pure $\varepsilon$-DP) com inversão de CDF via CSPRNG (`sampleLaplaceNoise`) e Mecanismo Gaussiano ($(\varepsilon, \delta)$-DP com Box-Muller transform `sampleGaussianNoise` e cálculo de sigma `calculateGaussianSigma`).
  - **Sensibilidade Global e Clamping:** `calculateSensitivity` computando sensibilidade $L_1$ ($\Delta f = 1$ para `COUNT` e `HISTOGRAM`, $\Delta f = \frac{U - L}{N}$ para `MEAN`, $\Delta f = U - L$ para `SUM`) com truncamento compulsório (`clampValue`) para blindagem contra outliers.
  - **Simulador de Coorte Epidemiológica Sintética:** `generateSyntheticClinicalCohort` gerando 200 prontuários representativos com diagnósticos CID-11 (F41.1/6B00 Ansiedade, F32/6A70 Depressão, QD85 Burnout, 6B40 TEPT), escalas psicométricas GAD-7/PHQ-9 e remissão de sintomas.
  - **Execução e Prova Notarial WORM:** `executeDifferentialPrivacyQuery` gerando token `dp_v1_<base64url>` com digest canônico SHA-256 (RFC 8785 JCS), hash cego do valor real e assinatura HMAC anti-tampering.
  - **Verificação Pericial Matemática (`verifyDifferentialPrivacyProof`):** Atestado formal de integridade e conferência da distorção teórica máxima admissível ($3 \times b$).
  - **Benchmark Multicêntrico (`generateEpidemiologicalBenchmark`):** Geração consolidada de 4 métricas epidemiológicas anonimizadas com selo criptográfico.
  - Suíte de 10 testes unitários dedicados passando (`packages/crypto/test/differentialPrivacy.test.ts`).
- [x] **Contratos Compartilhados (`packages/shared`):**
  - **Enums e Ações de Auditoria WORM:** `AuditResourceType.DIFFERENTIAL_PRIVACY_ENGINE`, ações (`DP_QUERY_EXECUTED`, `DP_BUDGET_ALLOCATED`, `DP_BUDGET_EXHAUSTED`, `DP_DATASET_EXPORTED`, `DP_PROOF_VERIFIED`), `DpMechanism`, `DpQueryType`, `DpBudgetStatus`, `DpCohortMetric` e `DpResearchStatus`.
  - **Modelos e DTOs:** Interfaces `DpResearchProject`, `DpQueryParameter`, `DpQueryResult`, `DpProofVerification`, `DpEpidemiologicalBenchmark`, `DpSystemOverview` e DTOs `ExecuteDpQueryDTO`, `AllocateDpBudgetDTO`, `VerifyDpProofDTO`, `GenerateDpBenchmarkDTO` e respostas tipadas.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - **DifferentialPrivacyService (`apps/backend/src/services/differentialPrivacyService.ts`):** Singleton gerenciando projetos com aprovação CEP/CONEP, controle contínuo de orçamento $\varepsilon$ com mitigação contra ataques de reconstrução de base (`DP_BUDGET_EXHAUSTED`), agregação segura no enclave e registro compulsório na trilha WORM via `AuditService.log`.
  - **Rotas REST (`apps/backend/src/routes/differentialPrivacy.ts`):**
    - `GET /api/differential-privacy/overview`: Visão geral de governança e cotas.
    - `GET /api/differential-privacy/projects`: Lista de projetos homologados.
    - `POST /api/differential-privacy/query`: Execução de consulta protegida com ruído diferencial e débito de orçamento.
    - `POST /api/differential-privacy/benchmark`: Geração de benchmark multicêntrico completo.
    - `POST /api/differential-privacy/verify-proof`: Validação pericial do selo notarial.
    - `POST /api/differential-privacy/allocate-budget`: Alocação ou renovação de cota $\varepsilon$ pelo DPO.
  - Suíte de 7 testes de integração passando (`apps/backend/test/differentialPrivacy.test.ts`).
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Métodos de API (`api.ts`):** `getDpOverview`, `getDpProjects`, `executeDpQuery`, `generateDpBenchmark`, `verifyDpProof`, `allocateDpBudget`.
  - **Módulo de Segurança (`SecurityModule.tsx`):**
    - **Card 25** (*Privacidade Diferencial (ε-DP) & Benchmarks Epidemiológicos*) com 4 KPIs regulatórios (Orçamento $\varepsilon$ Consumido/Total, Consultas Anonimizadas, Fator de Proteção $e^\varepsilon$, Projetos CEP/CONEP).
    - **Painel Interativo de Consulta Epidemiológica:** Seletores de projeto homologado, dimensão clínica, tipo de agregação (Média, Contagem, Soma, Histograma), orçamento $\varepsilon$ e mecanismo (Laplace/Gaussiano).
    - **Visualizador Comparativo de Resultado Diferencial:** Exibição do valor real no enclave (com blind hash), ruído injetado ($\pm b$), valor público anonimizado entregue ao pesquisador e botão de verificação matemática em 1 clique.
    - **Livro Notarial WORM de Consultas Científicas:** Tabela com histórico auditável, IDs de query, custos $\varepsilon$, valores protegidos e selos WORM.
    - **Modal de Alocação de Cota DPO:** Formulário para autorização ética e concessão de cotas $\varepsilon$ para instituições de pesquisa.
    - **Modal Timbrado Forense de Laudo Diferencial:** Documento oficial com fé pública sob LGPD Art. 13 e CFP nº 001/2009, garantias matemáticas $e^\varepsilon$, selo probatório `dp_v1_*` e atestado de não-reidentificação.
    - **Modal Timbrado Forense de Laudo Diferencial:** Documento oficial com fé pública sob LGPD Art. 13 e CFP nº 001/2009, garantias matemáticas $e^\varepsilon$, selo probatório `dp_v1_*` e atestado de não-reidentificação.
  - Suporte completo a **Light Mode** e **Dark Mode**.

---

### 44. Gestão Segura de Sessões Clínicas com Revogação Forçada de Dispositivos Concorrentes e Token Binding Criptográfico (RFC-001 §4.4, RFC 9449, OWASP ASVS v4.0 & NIST SP 800-63B)
- [x] **Core Criptográfico & Motor de Token Binding DPoP (`packages/crypto/src/tokenBinding.ts`):**
  - `generateClientDeviceKeyPair`: Geração determinística de pares de chaves assimétricas ECDSA curva NIST P-256 (prime256v1) com exportação combinada em PEM e JWK RFC 7638.
  - `calculateJwkThumbprint`: Cálculo canônico RFC 7638 ordenando estritamente as propriedades (`crv`, `kty`, `x`, `y`) com digest SHA-256 Base64URL (`clientJkt`).
  - `createDpopProof`: Geração de provas de posse DPoP JWT em conformidade com a RFC 9449, contendo cabeçalho `typ: "dpop+jwt"`, `alg: "ES256"`, `jwk`, e payload com `jti`, método HTTP (`htm`), URI de destino (`htu`), timestamp de emissão (`iat`) e hash criptográfico do token de acesso (`ath` SHA-256 Base64URL).
  - `verifyDpopProof`: Verificação matemática rigorosa contra adulterações, validação cruzada de método HTTP e URI, verificação temporal anti-replay (janela de tolerância estrita de 300s) e validação da assinatura digital ECDSA P-256 com IEEE P1363.
  - `generateSessionRevocationProof`: Geração de selo notarial probatório WORM de revogação de sessão no formato `session_rev_v1_<base64url>` com digest canônico SHA-256 (RFC 8785 JCS) e assinatura HMAC anti-tampering.
  - `verifySessionRevocationProof`: Verificação pericial da fé pública e integridade matemática do selo de revogação de dispositivo.
  - Suíte com 8 testes unitários passando em `packages/crypto/test/tokenBinding.test.ts`.
- [x] **Contratos Compartilhados, Modelos & DTOs (`packages/shared`):**
  - Enums `SessionBindingMode` (`STRICT_DPOP`, `DPOP_BOUND`, `COOKIE_BOUND`, etc.), `SessionLifecycleStatus` (`ACTIVE`, `TERMINATED_BY_USER`, `REVOKED_CONCURRENT_LIMIT`, `FORCE_KILLED_ADMIN`, etc.) e `SessionDeviceType` (`DESKTOP_CHROME`, `MOBILE_IOS`, `CLINICAL_WORKSTATION`, etc.).
  - Ações de auditoria WORM `SESSION_CREATE`, `SESSION_TERMINATE`, `SESSION_TERMINATE_ALL_OTHERS`, `SESSION_CONCURRENT_DISPLACEMENT`, `SESSION_DPOP_REJECTED` e recurso `AuditResourceType.SESSION_MANAGEMENT`.
  - Interfaces `ClinicalActiveSession`, `DpopProofPayload`, `DpopVerificationResult`, `SessionRevocationProof`, `SessionManagementOverview`.
  - DTOs `TerminateSessionDTO`, `TerminateSessionResponse`, `TerminateAllOtherSessionsDTO`, `TerminateAllOtherSessionsResponse`, `SimulateConcurrentLoginDTO`, `SimulateConcurrentLoginResponse`, `VerifyDpopBindingDTO`, `VerifyDpopBindingResponse`.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - `SessionBindingService`:
    - Gerenciamento de sessões clínicas ativas em memória com persistência e rastreabilidade por terapeuta.
    - Política de concorrência com limite máximo configurável (padrão 2 dispositivos simultâneos) e auto-eviction da sessão mais antiga sob novo login concorrente.
    - Kill switch remoto para revogação em massa de todas as outras sessões ativas (`terminateAllOtherSessions`).
    - Validação em tempo real de provas DPoP com detecção de replay attacks e injeção de tokens não vinculados.
    - Registro compulsório de todas as operações na trilha de auditoria inviolável WORM (`AuditService.log`).
  - Rotas REST sob `/api/session-binding`:
    - `GET /api/session-binding/overview`: Visão geral de governança e concorrência.
    - `GET /api/session-binding/sessions`: Listagem de sessões do terapeuta autenticado com identificação da sessão vigente.
    - `POST /api/session-binding/terminate`: Revogação forçada de um dispositivo específico com emissão de selo WORM.
    - `POST /api/session-binding/terminate-others`: Kill switch de concorrência.
    - `POST /api/session-binding/simulate-concurrent`: Simulação de novos logins, estouro de limite e replay attacks.
    - `POST /api/session-binding/verify-dpop`: Validação de provas de posse DPoP JWT.
    - `GET /api/session-binding/verify-seal/:sessionId`: Verificação pericial pública de integridade do selo notarial.
  - Suíte com 7 testes de integração passando em `apps/backend/test/sessionBinding.test.ts`.
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Client de API (`api.ts`):** Métodos `getSessionOverview`, `getActiveSessions`, `terminateSession`, `terminateAllOtherSessions`, `simulateConcurrentLogin`, `verifyDpopBinding`, `verifySessionSeal`.
  - **Módulo de Segurança (`SecurityModule.tsx`):**
    - **Card 26** (*Gestão Segura de Sessões Clínicas & Token Binding Criptográfico*) com 4 KPIs regulatórios (Dispositivos Ativos Conectados, Token Binding DPoP 100%, Política de Concorrência Máx. 2 com Auto-Eviction, Revogações Forenses WORM).
    - **Tabela de Dispositivos Conectados:** Ícones específicos por ambiente/SO, IPs, localizações, thumbprints JWK DPoP, badges de status (`Ativa`, `Expulsa por Concorrência`, `Kill Switch Remoto`, `Revogada`), tag `Este Dispositivo` e ações de revogação/laudo.
    - **Ação Rápida de Kill Switch:** Botão *"Kill Switch (Desconectar Outras)"* para revogação instantânea de todas as sessões concorrentes.
    - **Simulador Interativo de Segurança & Ataques de Replay:** Testes de estresse com 3 cenários clicáveis (Simular 3º Login Concorrente com Eviction, Simular Replay Attack de Token sem chave ECDSA, Vincular Novo Dispositivo Clínico).
    - **Modal de Justificativa de Revogação:** Coleta do motivo formal gravado permanentemente na trilha WORM.
    - **Modal Notarial Pericial do Selo WORM:** Documento timbrado com fé pública, status de integridade da assinatura, dados da sessão, timestamp ISO e botão de cópia do token `session_rev_v1_*`.
  - Suporte completo a **Light Mode** e **Dark Mode**.

---

### 45. Módulo de Detecção e Prevenção Ativa de Brute-Force & Credential Stuffing com PoW (Proof-of-Work) Criptográfico e Desafio Dinâmico (RFC-001 §4.4, OWASP Automated Threats OAT-007 / OAT-008 & NIST SP 800-63B)
- [x] **Core Criptográfico & Motor Hashcash Adaptativo (`packages/crypto/src/powChallenge.ts`):**
  - Emissão determinística de desafios PoW com proteção anti-tampering via HMAC-SHA256 (`challengeId:salt:difficulty:expiresAt:clientIp`), impedindo manipulação de dificuldade ou troca de salt por atacantes.
  - Algoritmo de resolução client-side Hashcash SHA-256 (`solvePowChallenge`) com busca iterativa e não-bloqueante por prefixo hexadecimal de zeros (`"0".repeat(difficulty)`).
  - Verificação instantânea $O(1)$ pelo servidor (`verifyPowSolution`) sem custo computacional para o enclave da aplicação.
  - Cálculo de barreira adaptativa (`calculateDynamicDifficulty`): graduação de dificuldade (Tier 0 baseline instantâneo, Tier 1 a 3 para atipicidades leves, Tier 4 a 6 com custo exponencial para botnets, credential stuffing e força bruta massiva).
  - Emissão e atestação pericial de selos notariais WORM `pow_proof_v1_<base64url>` com digest canônico SHA-256 (RFC 8785 JCS).
  - Suíte com 9 testes unitários passando em `packages/crypto/test/powChallenge.test.ts`.
- [x] **Contratos Compartilhados, Modelos & DTOs (`packages/shared`):**
  - Enums `PowDifficultyTier` (`NONE`, `LOW`, `MEDIUM`, `HIGH`, `MAXIMUM`), `BruteForceThreatCategory` (`DICTIONARY_ATTACK`, `CREDENTIAL_STUFFING`, `DISTRIBUTED_BOTNET`, `PASSWORD_SPRAYING`, `ANOMALOUS_BURST`) e `PowChallengeStatus` (`PENDING`, `SOLVED`, `EXPIRED`, `TAMPERED`).
  - Ações de auditoria WORM `POW_CHALLENGE_ISSUED`, `POW_SOLUTION_VERIFIED`, `POW_DEFENSE_TRIGGERED`, `BRUTE_FORCE_BLOCKED`, `IP_QUARANTINE_RESET` e recurso `AuditResourceType.BRUTE_FORCE_DEFENSE`.
  - Interfaces `PowChallenge`, `PowVerificationResult`, `BruteForceIpReputation`, `PowDefenseOverview`, `PowDefenseProof`.
  - DTOs `RequestPowChallengeDTO`, `RequestPowChallengeResponse`, `SubmitPowSolutionDTO`, `SubmitPowSolutionResponse`, `SimulateBruteForceAttackDTO`, `SimulateBruteForceAttackResponse`, `ResetIpReputationDTO`, `ResetIpReputationResponse`, `VerifyPowSealDTO`, `VerifyPowSealResponse`.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - `BruteForcePowService`:
    - Rastreabilidade de reputação de IPs em memória com detecção de rajadas anômalas e contagem de falhas recentes em janelas deslizantes.
    - Mecanismo anti-replay estrito com cache `consumedChallenges`, invalidando tentativas de reutilização do mesmo desafio e registrando ofensas na trilha WORM.
    - Elevação dinâmica e automática da barreira PoW antes de quarentena total, desacelerando bots sem descartar usuários legítimos.
    - Quarentena administrativa temporária com capacidade de desbloqueio pericial auditado pelo DPO (`resetIpReputation`).
    - Integração compulsória com a trilha de auditoria inviolável WORM (`AuditService.log`).
  - Rotas REST sob `/api/brute-force-pow`:
    - `GET /api/brute-force-pow/overview`: Visão geral executiva com KPIs de desafios emitidos, mitigados, nível de ameaça sistêmico e lista de reputações.
    - `POST /api/brute-force-pow/challenge`: Emissão de desafio dinâmico assinado.
    - `POST /api/brute-force-pow/verify`: Validação $O(1)$ da solução, consumo do nonce e geração do selo notarial.
    - `POST /api/brute-force-pow/simulate-attack`: Simulação controlada de rajada de ataque (20+ tentativas) para validação da contenção ativa.
    - `POST /api/brute-force-pow/reset-ip`: Remoção de quarentena com parecer DPO.
    - `POST /api/brute-force-pow/verify-seal`: Validação pericial pública da integridade do selo de defesa.
  - Suíte com 7 testes de integração passando em `apps/backend/test/bruteForcePow.test.ts`.
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Client de API (`api.ts`):** Métodos `getPowOverview`, `requestPowChallenge`, `submitPowSolution`, `simulateBruteForceAttack`, `resetIpReputation`, `verifyPowSeal`.
  - **Módulo de Segurança (`SecurityModule.tsx`):**
    - **Card 27** (*Defesa Ativa contra Força Bruta & PoW Criptográfico Dinâmico*) com 4 KPIs regulatórios (Desafios Emitidos, Ataques Automatizados Mitigados, Quarentenas Ativas, Tempo Médio de Resolução Client-Side).
    - **Tabela de Reputação de IPs em Tempo Real:** Listagem de IPs suspeitos, contadores de falhas, categorias de ameaça (Credential Stuffing, Botnet, Ataque de Dicionário), badges de status e barreira de dificuldade imposta.
    - **Simulador Interativo de Rajadas:** Teste de estresse com injeção de 20 tentativas automatizadas para observação da elevação imediata da barreira e bloqueio preventivo.
    - **Benchmark PoW Client-Side:** Cálculo nativo no navegador via `crypto.subtle` (SHA-256 não-bloqueante) para testes de benchmark nas dificuldades 3 e 4 com validação em tempo real no enclave backend.
    - **Modal de Desbloqueio de IP:** Formulário com parecer técnico / justificativa DPO registrada na trilha WORM.
    - **Modal Notarial Pericial do Selo WORM:** Laudo timbrado com fé pública, status de integridade, identificadores técnicos e botão de cópia do token `pow_proof_v1_*`.
  - Suporte total a **Light Mode** e **Dark Mode**.

---

### 46. Módulo de Proteção Anti-Automação & Honeypot Dinâmico com Tarpit Criptográfico e Desaceleração de Scrapers (OWASP Automated Threats OAT-011 / OAT-020 & RFC-001 §4.4, §5.2)
- [x] **Core Criptográfico & Motor de Tarpit Assíncrono (`packages/crypto/src/antiAutomationTarpit.ts`):**
  - `generateHoneypotTrapToken`: Geração de tokens de armadilhas invisíveis com HMAC-SHA256 anti-tampering (`trapId:routePath:expiresAt:clientIp`) e formato assinado `hp_trap_<uuid>_<base64url>`.
  - `verifyHoneypotTrapToken`: Verificação matemática contra adulterações e validação de TTL/expiração.
  - `detectCrawlerHeuristics`: Inspeção de assinaturas de automação em cabeçalhos HTTP (Scrapy, Python Requests, HeadlessChrome, Puppeteer, ausência de Sec-CH-UA e User-Agent) com pontuação de risco (0 a 100).
  - `calculateTarpitDelay`: Cálculo dinâmico do atraso no poço de piche (de 2.000ms a 30.000ms com multiplicadores específicos por categoria de ameaça OAT-011 / OAT-020).
  - `generateTarpitDefenseSeal`: Geração de selo notarial WORM `tarpit_proof_v1_<base64url>` com digest canônico SHA-256 (RFC 8785 JCS).
  - `verifyTarpitDefenseSeal`: Atestação pericial forense da fé pública do selo WORM de mitigação.
  - Suíte com 11 testes unitários aprovados em `packages/crypto/test/antiAutomationTarpit.test.ts`.
- [x] **Contratos Compartilhados, Modelos & DTOs (`packages/shared`):**
  - Enums `ScraperThreatCategory` (`DATA_SCRAPING_OAT011`, `ACCOUNT_ENUMERATION_OAT020`, `HEADLESS_BOT_PROBE`, `RESOURCE_EXHAUSTION_OAT015`) e `TarpitDefenseStatus` (`ACTIVE`, `ENGAGED`, `TARPITTING`, `ISOLATED`, `RELEASED`).
  - Ações de auditoria WORM `HONEYPOT_TRAP_TRIGGERED`, `TARPIT_DEFENSE_ENGAGED`, `SCRAPER_BLOCKED`, `SCRAPER_IP_ISOLATED`, `TARPIT_QUARANTINE_RELEASED` e recurso `AuditResourceType.ANTI_AUTOMATION_TARPIT`.
  - Interfaces `HoneypotTrapConfig`, `ScraperIncidentRecord`, `TarpitMetricsOverview`, `TarpitDefenseProof`.
  - DTOs `CreateHoneypotTrapDTO`, `CreateHoneypotTrapResponse`, `TriggerHoneypotTrapResponse`, `SimulateScrapingAttackDTO`, `SimulateScrapingAttackResponse`, `ReleaseTarpitQuarantineDTO`, `ReleaseTarpitQuarantineResponse`, `VerifyTarpitSealDTO`, `VerifyTarpitSealResponse`, `TarpitMetricsOverviewResponse`.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - `AntiAutomationTarpitService`:
    - Rastreamento em memória de incidentes de scraping, bots e IPs isolados com cálculo de tráfego/I/O preservado.
    - Mecanismo de Tarpit assíncrono cooperativo (`tarpitSleep`) retendo a conexão do crawler sem consumir CPU ou bloquear threads do enclave.
    - Isolamento automático em quarentena de 24h para reincidentes (≥ 3 violações).
    - Registro compulsório de cada armadilha e retenção na trilha de auditoria WORM (`AuditService.log`).
  - Rotas REST sob `/api/anti-automation`:
    - `GET /api/anti-automation/overview`: Métricas executivas de crawlers detidos, honeypots acionados e banda preservada.
    - `POST /api/anti-automation/trap/create`: Emissão de nova armadilha com snippet HTML invisível para injeção.
    - `GET /api/anti-automation/trap/:token`: Rota invisível de captura de crawlers que aplica a retenção Tarpit.
    - `POST /api/anti-automation/simulate-scraping`: Simulação de rajadas de scraping (15+ requisições) com contenção imediata.
    - `POST /api/anti-automation/release-ip`: Desbloqueio e revogação de quarentena com parecer técnico do DPO.
    - `POST /api/anti-automation/verify-seal`: Validação pericial pública da integridade do selo de defesa.
  - Suíte com 7 testes de integração aprovados em `apps/backend/test/antiAutomationTarpit.test.ts`.
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Client de API (`api.ts`):** Métodos `getTarpitOverview`, `createHoneypotTrap`, `triggerHoneypotTrap`, `simulateScrapingAttack`, `releaseTarpitQuarantine`, `verifyTarpitSeal`.
  - **Módulo de Segurança (`SecurityModule.tsx`):**
    - **Card 28** (*Proteção Anti-Automação, Honeypot Dinâmico & Tarpit Criptográfico*) com 4 KPIs regulatórios (Crawlers Presos em Tarpit, Armadilhas Honeypot Acionadas, Largura de Banda Preservada, IPs em Quarentena Tarpit).
    - **Tabela de Scrapers & Crawlers Monitorados em Tempo Real:** IPs, User-Agents, heurísticas detectadas, atraso imposto e status de defesa.
    - **Simulador Interativo de Raspagem:** Disparo de bot coletor OAT-011 / OAT-020 com acionamento de honeypot e retenção no poço de piche.
    - **Testador de Armadilha ao Vivo:** Acionamento real de armadilha com medição do atraso no browser e emissão de laudo WORM.
    - **Modal de Desbloqueio de Quarentena Tarpit:** Parecer técnico auditado do DPO gravado no WORM.
    - **Modal Notarial Pericial do Selo WORM:** Documento timbrado com fé pública e botão de cópia do token `tarpit_proof_v1_*`.
### 47. Certificação Notarial de Sessão Clínica em Tempo Real com Timestamping RFC 3161 & ICP-Brasil Time-Stamping Authority (DOC-ICP-11, MP 2.200-2/2001, Resolução CFP nº 001/2009 e RFC-001 §3.4, §3.5, §4.4)
- [x] **Motor Criptográfico Notarial RFC 3161 (`packages/crypto/src/rfc3161TimestampNotary.ts`):**
  - **MessageImprint Canônico SHA-256:** Formação determinística do digest da sessão clínica via `canonicalStringify`, vinculando `sessionId`, `therapistId`, `patientBlindIndex` (anonimizado via HMAC-SHA256 para estrito cumprimento da LGPD sem exposição de PII à ACT), tipo de sessão (`TELECONSULTATION`, `IN_PERSON`, `EMERGENCY_SUPPORT`), horário de início e término e hash SHA-256 da evolução clínica SOAP. OID padronizado da IANA para SHA-256 (`2.16.840.1.101.3.4.2.1`).
  - **TimeStampReq RFC 3161 v1:** Requisição formal de carimbo com nonce criptográfico anti-replay de 64 bits (`crypto.randomBytes(8).toString('hex')`) e requisição de inclusão de certificado da ACT (`certReq: true`).
  - **Emissão pela Autoridade de Carimbo do Tempo (ACT / TSA):** Simulação fidedigna de ACT credenciada pelo ITI/ICP-Brasil e sincronizada com a Hora Legal Brasileira (HLB) do Observatório Nacional (ON / DTI), sob a política de carimbo do tempo oficial `2.16.76.1.4.1` (DOC-ICP-11).
  - **Estrutura TSTInfo & Assinatura Digital:** Geração do `TSTInfo` RFC 3161 com número de série notarial sequencial, timestamp UTC em microssegundos, acurácia de 1 milissegundo (`accuracy: { seconds: 0, millis: 1 }`), assinado digitalmente com chave RSA/ECDSA da ACT (`sha256WithRSAEncryption` / OID `1.2.840.113549.1.1.11`).
  - **Verificação Independente em 5 Pontos:** Avaliação matemática de (1) Integridade do MessageImprint, (2) Correspondência do Nonce anti-replay, (3) Validade da Assinatura Digital da ACT, (4) Conformidade de Política ICP-Brasil e (5) Validade Temporal do Certificado da ACT.
  - **Simulador de Pentest de Adulteração & Retrodatação:** Módulo de ataque simulado com 5 cenários de invasão/fraude (`CONTENT_ALTERED`, `BACKDATED_TIME`, `SIGNATURE_FORGED`, `NONCE_MISMATCH`, `EXPIRED_CERT`) para auditorias periciais e comprovação de fé pública.
  - Suíte com 10 testes unitários rigorosos aprovados em `packages/crypto/test/rfc3161TimestampNotary.test.ts`.
- [x] **Contratos Compartilhados & Tipagem Forte (`packages/shared`):**
  - **Enums (`enums.ts`):** `TsaAuthorityType` (`ICP_BRASIL_ON_ACT`, `ICP_BRASIL_SERPRO_ACT`, `ICP_BRASIL_SOLUTI_ACT`, `INTERNAL_REDUNDANT_TSA`), `TimestampVerificationStatus` (`VALID_AUTHENTIC`, `INVALID_SIGNATURE`, `INVALID_MESSAGE_IMPRINT`, `EXPIRED_CERTIFICATE`, `NONCE_MISMATCH`, `REVOKED_AUTHORITY`, `TAMPERED_CONTENT`), `TimestampTamperType` (`CONTENT_ALTERED`, `BACKDATED_TIME`, `SIGNATURE_FORGED`, `NONCE_MISMATCH`, `EXPIRED_CERT`), `AuditResourceType.CLINICAL_SESSION_TSA_NOTARY` e 5 ações WORM (`CLINICAL_SESSION_TIMESTAMP_REQUESTED`, `CLINICAL_SESSION_TIMESTAMP_ISSUED`, `CLINICAL_SESSION_TIMESTAMP_VERIFIED`, `CLINICAL_SESSION_TIMESTAMP_TAMPERED`, `TSA_CERTIFICATE_VALIDATED`).
  - **Modelos (`models.ts`):** `ClinicalSessionMessageImprint`, `ClinicalSessionTimestampReq`, `TsaCertificateInfo`, `TSTInfo`, `ClinicalSessionTimestampToken`, `TimestampVerificationResult`, `TimestampNotaryMetrics`, `TimestampNotaryOverview`.
  - **DTOs (`dtos.ts`):** `CreateClinicalSessionTimestampDto`, `VerifyTimestampTokenDto`, `SimulateTimestampTamperDto`, `TimestampNotaryOverviewDto`.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - **Serviço Central (`clinicalSessionTsaService.ts`):** Emissão e verificação de tokens RFC 3161 com sementes de demonstração, rastreamento de KPIs notariais e gravação na trilha WORM imutável via `AuditService.log`.
  - **Rotas REST (`clinicalSessionTsa.ts`):**
    - `GET /api/tsa-notary/overview`: Painel consolidado com métricas, status da ACT credenciada e histórico de sessões notarizadas.
    - `POST /api/tsa-notary/stamp-session`: Emissão de carimbo do tempo RFC 3161 para sessão clínica com gravação WORM.
    - `POST /api/tsa-notary/verify-token`: Verificação forense independente em 5 pontos do token de carimbo.
    - `POST /api/tsa-notary/simulate-tampering`: Pentest interativo de adulteração e retrodatação com laudo probatório.
    - `GET /api/tsa-notary/session/:sessionId/token`: Consulta direta do token RFC 3161 por identificador da sessão.
    - `GET /api/tsa-notary/tsa-info`: Metadados públicos e certificados da ACT do Observatório Nacional / ITI.
  - Suíte com 7 testes de integração aprovados em `apps/backend/test/clinicalSessionTsa.test.ts`.
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Client de API (`api.ts`):** Métodos `getTimestampNotaryOverview`, `createSessionTimestamp`, `verifySessionTimestamp`, `simulateTimestampTampering`, `getSessionTimestampToken`, `getTsaInfo`.
  - **Módulo de Segurança (`SecurityModule.tsx`):**
    - **Card 29** (*Certificação Notarial de Sessão Clínica RFC 3161 & ICP-Brasil TSA*) com 4 KPIs regulatórios (Sessões Notarizadas com Timestamp, Certificados TSA Válidos, Conformidade Regulatória ICP-Brasil, Ataques de Retrodatação Bloqueados).
    - **Painel da ACT Credenciada ICP-Brasil / Observatório Nacional:** Status operacional, OID de política (`2.16.76.1.4.1`), sincronismo UTC/HLB, número de série e algoritmo SHA-256.
    - **Formulário de Carimbo ao Vivo:** Notarização em tempo real de sessões em telepsicologia ou presenciais com seleção de modalidade, data/hora e hash de prontuário SOAP.
    - **Tabela de Sessões Clínicas Notarizadas:** Listagem com identificador, horário UTC atestado, serial notarial, status e ações para Laudo Pericial (29.A), Pentest de Adulteração (29.B) e Verificação (29.C).
    - **Modal 29.A (Laudo Notarial do Token TSTInfo):** Certidão pericial timbrada com fé pública, metadados ASN.1/RFC 3161, OID da política ICP-Brasil e token canônico com botão de cópia.
    - **Modal 29.B (Pentest Interativo de Adulteração & Retrodatação):** Seleção de vetor de ataque (`CONTENT_ALTERED`, `BACKDATED_TIME`, etc.), execução do teste e emissão de laudo probatório WORM.
    - **Modal 29.C (Laudo Pericial de Verificação em 5 Pontos):** Exibição do checklist forense, selo de autenticidade documental e chancela do perito.
### 48. Blindagem contra Parameter Pollution (HPP) e Injeção de Cabeçalhos (CRLF) em Endpoints Críticos (OWASP Top 10 API Security & RFC-001 §4.4, §5.2)
- [x] **Motor Criptográfico & Heurístico de Inspeção HTTP (`packages/crypto/src/httpSecurityGuard.ts`):**
  - **Parser Canônico de Query String (`parseRawQueryString`):** Decomposição estrita de query strings sem ambiguidade, identificando ocorrências repetidas de parâmetros e preservando a ordem exata de envio.
  - **Detector de Poluição de Parâmetros HTTP (`detectHttpParameterPollution`):**
    - Suporte a políticas configuráveis de defesa: `STRICT_REJECT` (rejeição imediata se houver duplicidade em parâmetros restritos), `FIRST_OCCURRENCE_ONLY`, `LAST_OCCURRENCE_ONLY`, `CONCATENATE_ARRAY` e `QUARANTINE_INSPECT`.
    - Whitelist de parâmetros com cardinalidade múltipla permitida (ex.: `tags`, `sort`, `filter`).
    - Elevação automática de severidade para `CRITICAL` em parâmetros clínicos e de controle de acesso (`patientId`, `clinicalRecordId`, `appointmentId`, `role`, `token`, `sessionToken`, `tcleConsent`).
    - Detecção de payloads maliciosos embutidos em parâmetros duplicados (`maliciousPayloadDetected`).
  - **Detector de Injeção de Cabeçalhos e CRLF (`detectHeaderInjection`):**
    - Inspeção rigorosa contra sequências CRLF (`\r\n`, `\r`, `\n`), encodings percentuais (`%0d`, `%0a`, `%0D%0A`, variantes duplas `%250d`, `%250a`), unicode lookalikes (`\u000d`, `\u000a`, `\u2028`, `\u2029`) e injeções de byte nulo (`\0`, `%00`).
    - Classificação de vetores de ataque: `CRLF_RESPONSE_SPLITTING`, `HEADER_INJECTION`, `COOKIE_POISONING`, `LOG_INJECTION_LINE_FEED`, `STATUS_LINE_OVERRIDE`, `NULL_BYTE_INJECTION`.
  - **Sanitização Segura de Cabeçalhos (`sanitizeHeaderValue`):** Neutralização e substituição de bytes de controle e terminadores CRLF por espaços seguros.
  - **Selo Probatório HMAC-SHA256 (`createHttpGuardProofSeal` / `verifyHttpGuardProofSeal`):** Emissão de laudo forense com assinatura digital HMAC-SHA256 e verificação independente contra adulteração.
  - Suíte com 17 testes unitários rigorosos aprovados em `packages/crypto/test/httpSecurityGuard.test.ts`.
- [x] **Contratos Compartilhados & Tipagem Forte (`packages/shared`):**
  - **Enums (`enums.ts`):** `HppAttackCategory` (`REPEATED_PARAMETER_ATTACK`, `WAF_BYPASS_ATTACK`, `RBAC_ROLE_OVERRIDE`, `CLINICAL_ID_HIJACKING`, `ARRAY_POLLUTION_INJECTION`), `HppDefensePolicy` (`STRICT_REJECT`, `FIRST_OCCURRENCE_ONLY`, `LAST_OCCURRENCE_ONLY`, `CONCATENATE_ARRAY`, `QUARANTINE_INSPECT`), `HppSeverityLevel` (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), `AuditResourceType.HTTP_SECURITY_GUARD` e 5 ações WORM (`HPP_POLLUTION_DETECTED`, `HPP_POLLUTION_BLOCKED`, `HEADER_INJECTION_DETECTED`, `HEADER_INJECTION_BLOCKED`, `HTTP_GUARD_SEAL_VERIFIED`).
  - **Modelos (`models.ts`):** `HppParameterViolation`, `HppInspectionResult`, `HeaderInjectionViolation`, `HeaderInjectionInspectionResult`, `HttpGuardIncident`, `HttpGuardProofSeal`, `HttpGuardMetrics`, `HttpGuardOverview`.
  - **DTOs (`dtos.ts`):** `SimulateHppDto`, `SimulateHeaderInjectionDto`, `VerifyHttpGuardSealDto`, `HttpGuardOverviewDto`.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - **Serviço Central (`httpGuardService.ts`):** Catálogo de endpoints protegidos, sementes de demonstração, rastreamento de métricas e gravação compulsória na trilha WORM inalterável via `AuditService.log`.
  - **Rotas REST (`httpGuard.ts`):**
    - `GET /api/http-guard/overview`: Visão geral das métricas, política ativa e incidentes recentes.
    - `POST /api/http-guard/simulate-hpp`: Simulação de ataque HPP e emissão de selo forense.
    - `POST /api/http-guard/simulate-header-injection`: Simulação de ataque CRLF/Header Injection e emissão de laudo.
    - `POST /api/http-guard/verify-seal`: Validação independente do selo probatório HMAC-SHA256.
    - `GET /api/http-guard/incidents`: Listagem auditada de incidentes bloqueados.
  - Suíte com 8 testes de integração aprovados em `apps/backend/test/httpGuard.test.ts`.
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Client de API (`api.ts`):** Métodos `getHttpGuardOverview`, `simulateHpp`, `simulateHeaderInjection`, `verifyHttpGuardSeal`, `getHttpGuardIncidents`.
  - **Módulo de Segurança (`SecurityModule.tsx`):**
    - **Card 30** (*Blindagem contra Parameter Pollution (HPP) & Injeção de Cabeçalhos (CRLF)*) com 4 KPIs regulatórios (Ataques HPP Bloqueados, Injeções CRLF Neutralizadas, Endpoints Críticos Blindados, Selos WORM Emitidos).
    - **Banner de Política Ativa:** Visualização em tempo real da política defensiva (`STRICT_REJECT`), whitelist de parâmetros e catálogo de endpoints clínicos monitorados.
    - **Simulador Interativo com Abas Pentest:**
      - Aba 1: Simulação HPP (URL clínica com parâmetros duplicados, payload malicioso e seleção de endpoint alvo).
      - Aba 2: Simulação CRLF (Header Name, Header Value com injeção `\r\n` ou percent-encoded).
    - **Tabela de Incidentes Bloqueados:** Listagem em tempo real com severidade, tipo de ataque, endpoint e ação para Laudo Forense (30.A).
    - **Modal 30.A (Laudo Forense do Incidente HTTP):** Certidão técnica com dados da requisição violada, parâmetros duplicados/cabeçalhos injetados, selo probatório com HMAC-SHA256 e botão de cópia.
    - **Modal 30.B (Validação Independente do Selo WORM):** Teste de integridade criptográfica do selo probatório contra adulteração com feedback visual em tempo real.
  - Suporte completo a **Light Mode** e **Dark Mode**.

---

## 📌 Histórico de Branches & Pull Requests

| Branch | Escopo | PR no GitHub | Status |
|---|---|---|---|
| `feat/monorepo-setup` | Estrutura inicial do monorepo | PR #1 | Merged |
| `feat/db-schema-drizzle-pglite` | Drizzle ORM, PGlite & Postgres | PR #2 | Merged |
| `feat/frontend-backend-integration` | Conexão API REST + Módulos 1 a 4 | PR #4 | Merged |
| `feat/theme-toggle-dark-light` | Dark Mode / Light Mode adaptativo | PR #5 | Merged |
| `feat/modulo-5-documentos-cfp` | Módulo 5 (Documentos CFP + QR Code) | PR #6 | Merged |
| `feat/pipeline-transcricao-ia-soap` | Módulo 3 (Transcrição, Diarização, Sanitização LGPD & SOAP IA) | PR #9 | Merged |
| `feat/landing-agendamento-validacao-publica` | Agendamento Online na Landing Page & Validação Pública Zero-Knowledge (RFC §3.1, §3.5) | PR #10 | Merged |
| `feat/auth-jwt-2fa-rate-limiting-rbac` | Autenticação Segura JWT, 2FA/MFA (TOTP), RBAC e Rate Limiting (RFC-001 Opção C) | PR #11 | Merged |
| `feat/pdf-server-generation-icp-brasil` | Geração Server-Side de PDFs Timbrados CFP 006/2019 e Assinatura ICP-Brasil (Opção D) | PR #12 | Merged |
| `feat/analytics-clinical-dashboard-observability` | Dashboard Clínico, Métricas Longitudinais e Observabilidade WORM (Opção E) | PR #13 | Merged |
| `feat/data-portability-lgpd-export` | Portabilidade de Dados, Exportação Criptografada LGPD Art. 18 e Revogação CFP (Opção F) | PR #14 | Merged |
| `feat/backup-kms-disaster-recovery` | Backup Automatizado em Repouso, Envelope Encryption KMS e Disaster Recovery (Opção G) | PR #15 | Merged |
| `feat/audit-worm-compliance-report` | Trilha de Auditoria Externa WORM (Hash-Chain SHA-256) & Relatórios DPO/CFP (Opção H) | PR #16 | Merged |
| `feat/rfc-001-docs` | Documentação oficial da especificação técnica RFC-001 em `/docs/RFC-001.md` | PR #17 | Merged |
| `feat/distributed-rate-limiting-redis-cache` | Rate Limiting Distribuído com Redis & Cache Criptográfico em Memória (Opção I) | PR #18 | Merged |
| `feat/security-webhooks-hmac` | Webhooks Assinados (HMAC-SHA256) & Notificações de Segurança (Opção J) | PR #19 | Merged |
| `feat/railway-deployment` | Configuração de Deployment no Railway (Dockerfile, railway.json, auto-migrações e guia) | PR #20 | Merged |
| `gil/fix-deploy` | Correção de railway.json global e isolamento de builds do frontend | PR #21 | Merged |
| `chore/deploy-trigger` | Disparo de deploy no Railway e inclusão do runner de produção | PR #22 | Merged |
| `railway/code-change-ZOB6Fg` | Fix apps/frontend/Dockerfile para Railpack chdir | PR #23 | Merged |
| `feat/dynamic-data-masking-ddm` | Mascaramento Dinâmico de Dados na Interface (DDM), Modo Anti-Shoulder Surfing (Alt+P) e Trilha WORM (Opção K) | PR #24 | Merged |
| `feat/backend-auto-migrations` | Inicialização compulsória com getDb no boot, auto-migração resiliente Supabase e scripts db:migrate | PR #25 | Merged |
| `fix/supabase-persistence-sync` | Persistência ativa de pacientes, usuários e agendamentos no Supabase, sincronização com Supabase Auth Admin e migração 0001 (users/docs) | PR #26 | Merged |
| `fix/supabase-persistence-sync` | Script supabase_full_schema.sql e fallback direto de gravação PostgREST | PR #27 | Merged |
| `feat/health-readiness-probes` | Health Check Abrangente, Liveness, Readiness & Startup Probes (Opção L) | PR #28 | Merged |
| `feat/synthetic-monitoring-e2e` | Monitoramento Sintético, Testes E2E Automatizados & Resiliência PGlite | PR #29 | Merged |
| `feat/mobile` | Responsividade Mobile Completa: Drawer, Bottom Nav, Modais com Rolagem & Validação Pública | PR #30 | Merged |
| `feat/anamnese-e-retificacao-prontuario` | Ficha de Admissão & Anamnese Biopsicossocial (CFP 001/2009, 004/2020) e Termo de Retificação Formal de Prontuário Selado (RFC §3.4) | [PR #31](https://github.com/linuxsoares/terapiainfoco/pull/31) | Merged |
| `feat/opentelemetry-prometheus-metrics` | Métricas OpenTelemetry, Prometheus (RED/OpenMetrics v0.0.4) & Tracing Distribuído W3C (Opção N) | [PR #32](https://github.com/linuxsoares/terapiainfoco/pull/32) | Merged |
| `feat/continuous-compliance-pentest-ripd` | Auditoria Contínua, Penetration Testing Automatizado & Relatório RIPD/DPO (RFC-001 Fase 4 & LGPD Art. 38/50) | [PR #34](https://github.com/linuxsoares/terapiainfoco/pull/34) | Merged |
| `feat/siem-integration-exponential-retry` | Conectores SIEM Externos (Datadog, Splunk, Elastic), Dispatcher Resiliente com Exponential Backoff e DLQ (RFC §4.4, §5.2) | [PR #35](https://github.com/linuxsoares/terapiainfoco/pull/35) | Merged |
| `feat/kms-auto-key-rotation-lifecycle` | Gestão de Chaves KMS, Rotação Contínua de KEKs e Re-wrapping de DEKs (NIST SP 800-57 & RFC §4.2) | [PR #36](https://github.com/linuxsoares/terapiainfoco/pull/36) | Merged |
| `feat/load-testing-stress-benchmarks-slo` | Homologação sob Carga, Stress Concorrente & Auditoria de SLOs RED (k6 / RFC §5.1, §5.2) | [PR #37](https://github.com/linuxsoares/terapiainfoco/pull/37) | Merged |
| `feat/opentelemetry-otlp-exporter-batch` | Exportação Automática de Métricas e Traces OpenTelemetry OTLP via HTTP/JSON para Datadog/NewRelic & Batch Exporter (RFC §5.2) | [PR #38](https://github.com/linuxsoares/terapiainfoco/pull/38) | Merged |
| `feat/executive-compliance-governance-package` | Dashboard Executivo de Governança, Compliance Package Multi-Normativo Forense (LGPD, CFP, ICP-Brasil, SOC2) & DPO Sign-Off (RFC §4.4, §5.2) | [PR #39](https://github.com/linuxsoares/terapiainfoco/pull/39) | Merged |
| `feat/csp-hsts-honeypot-hardening` | Hardening de Segurança HTTP (CSP, HSTS & OWASP), Honeypot Anti-Probe/Reconnaissance com Quarentena e Registro WORM (RFC §4.4, §5.2) | [PR #40](https://github.com/linuxsoares/terapiainfoco/pull/40) | Merged |
| `feat/google-meet-api-integration` | Integração Google Meet REST API v2 (spaces.create), Knocking TRUSTED, Fluxo OAuth 2.0 Web (Google Cloud Client ID/Secret, Code Exchange & Auto-Refresh) e Diagnósticos no Painel (RFC §3.2 & CFP 011/2018) | [PR #41](https://github.com/linuxsoares/terapiainfoco/pull/41) | Merged |
| `fix/google-meet-rbac-routes` | Correção de RBAC em rotas Google Meet (/api/system/google-meet/*) para perfil PSICOLOGO_TITULAR e ajuste de mensagens | [PR #42](https://github.com/linuxsoares/terapiainfoco/pull/42) | Merged |
| `feat/webrtc-session-fingerprint-audit` | Auditoria de Sessão WebRTC com Fingerprint de Segurança (DTLS-SRTP RFC 8122), Safety Numbers (SAS Anti-MitM) e Selagem WORM (RFC §3.2, CFP 011/2018) | [PR #44](https://github.com/linuxsoares/terapiainfoco/pull/44) | Merged |
| `feat/application-waf-sqli-xss-detection` | WAF Integrado com Detecção de Injeção SQL & XSS em Camada de Aplicação com Inspeção Heurística de Payloads Clínicos antes do Desembrulho Criptográfico, Bloqueio Ativo e Registro WORM (RFC-001 §4.4, §5.2 e OWASP Top 10) | [PR #45](https://github.com/linuxsoares/terapiainfoco/pull/45) | Merged |
| `feat/teleconsultation-network-resilience-simulation` | Simulador de Resiliência de Redes Instáveis para Teleconsulta (Jitter & Packet Loss Injection), Avaliação de Inteligibilidade Clínica (MOS ITU-T G.107 / E-Model), Recomendação Ética de Contingência (CFP 011/2018) e Registro WORM | [PR #46](https://github.com/linuxsoares/terapiainfoco/pull/46) | Merged |
| `feat/media-recording-sharding-crypto-shredding` | Gravação em Repouso com Cifragem Assíncrona, Sharding de Mídia (Envelope Encryption com DEKs Efêmeras por Shard), Validação Merkle Tree e Destruição Programada Pós-Transcrição (Crypto-Shredding) com Selo Probatório WORM (RFC-001 §3.2, §3.3, §4.2, LGPD Art. 11/16, CFP nº 011/2018) | [PR #47](https://github.com/linuxsoares/terapiainfoco/pull/47) | Merged |
| `feat/session-disconnection-detector-auto-reconnect` | Detector de Desconexão Abrupta e Protocolo Automático de Reconexão Segura com Retenção de Estado da Sessão Clínica (Tokens HMAC-SHA256, Snapshot Cifrado AES-256-GCM, Tolerância Ética de 10 min e Registro WORM - RFC-001 §3.2 & CFP 011/2018) | [PR #48](https://github.com/linuxsoares/terapiainfoco/pull/48) | Merged |
| `feat/zkp-zero-knowledge-signature-verification` | Protocolo de Validação Forense de Assinaturas Digitais com Provas de Conhecimento Zero (Zero-Knowledge Proofs - Schnorr NIZK / Fiat-Shamir) sem Exposição de Metadados Clínicos (RFC-001 §3.4, §3.5 & CFP nº 006/2019) | [PR #49](https://github.com/linuxsoares/terapiainfoco/pull/49) | Merged |
| `feat/dark-web-credential-leak-monitor-containment` | Módulo de Detecção Proativa de Vazamento de Credenciais na Dark Web & Contenção de Incidentes (Threat Intelligence / k-Anonymity NIST SP 800-63B, LGPD Art. 46/48) | [PR #50](https://github.com/linuxsoares/terapiainfoco/pull/50) | Merged |
| `feat/patient-granular-consent-smart-revocation` | Controle Granular de Consentimento do Paciente com Smart Revocation & Trilha Consent-Led (LGPD Art. 7/8/9/11/18 & CFP nº 006/2019) | [PR #51](https://github.com/linuxsoares/terapiainfoco/pull/51) | Merged |
| `feat/clipboard-dlp-steganographic-watermark` | Data Loss Prevention (DLP) no Clipboard Clínico com Marca d'Água Esteganográfica & Prevenção de Exfiltração de Prontuários (LGPD Art. 46 & CFP nº 001/2009) | [PR #52](https://github.com/linuxsoares/terapiainfoco/pull/52) | Merged |
| `feat/clinical-record-notary-blind-audit` | Cartório Notarial Digital de Prontuários & Auditoria Forense Zero-Knowledge (CFP nº 001/2009 e LGPD Art. 18) | [PR #53](https://github.com/linuxsoares/terapiainfoco/pull/53) | Merged |
| `fix/google-oauth-redirect-uri-detection` | Auto-resolução dinâmica de redirect_uri OAuth 2.0 (Railway/Proxy) e exibição com cópia no painel | [PR #54](https://github.com/linuxsoares/terapiainfoco/pull/54) | Merged |
| `fix/google-oauth-redirect-uri-fallback-railway` | Remoção do default localhost estático no config e resolução unificada de proxy reverso em status/authorize/callback | [PR #55](https://github.com/linuxsoares/terapiainfoco/pull/55) | Merged |
| `feat/secure-data-purge-crypto-proof` | Mecanismo de Descarte e Expurgamento Seguro de Dados Históricos por Fim de Ciclo de Tratamento com Prova Criptográfica de Destruição (LGPD Art. 16, CFP nº 001/2009) | [PR #57](https://github.com/linuxsoares/terapiainfoco/pull/57) | Merged |
| `feat/did-verifiable-credentials-clinical-federation` | Protocolo de Federação de Chaves e Identidades Clínicas Descentralizadas (DID / Verifiable Credentials - W3C DID v1.0, W3C VC v2.0, RFC-001 §3.5) | [PR #58](https://github.com/linuxsoares/terapiainfoco/pull/58) | Merged |
| `feat/ueba-anomaly-detection-record-access` | Análise Comportamental Preditiva de Acesso Anômalo (UEBA) para Detecção de Exfiltração Interna em Prontuários (RFC-001 §4.4 & LGPD Art. 46) | [PR #59](https://github.com/linuxsoares/terapiainfoco/pull/59) | Merged |
| `feat/differential-privacy-clinical-research` | Protocolo Criptográfico de Anonimização Estatística Diferencial (Differential Privacy - ε-DP) para Pesquisa Clínica e Benchmarks Epidemiológicos (LGPD Art. 13 & CFP nº 001/2009) | [PR #60](https://github.com/linuxsoares/terapiainfoco/pull/60) | Merged |
| `feat/session-token-binding-concurrent-revocation` | Módulo de Gestão Segura de Sessões Clínicas com Revogação Forçada de Dispositivos Concorrentes e Token Binding Criptográfico (RFC-001 §4.4, RFC 9449, OWASP ASVS v4.0 & NIST SP 800-63B) | [PR #61](https://github.com/linuxsoares/terapiainfoco/pull/61) | Merged |
| `feat/brute-force-pow-defense-challenge` | Módulo de Detecção e Prevenção Ativa de Brute-Force & Credential Stuffing com PoW (Proof-of-Work) Criptográfico e Desafio Dinâmico (RFC-001 §4.4, OWASP Automated Threats OAT-007 / OAT-008 & NIST SP 800-63B) | [PR #62](https://github.com/linuxsoares/terapiainfoco/pull/62) | Merged |
| `feat/anti-automation-tarpit-honeypot` | Módulo de Proteção Anti-Automação & Honeypot Dinâmico com Tarpit Criptográfico e Desaceleração de Scrapers (OWASP Automated Threats OAT-011 / OAT-020 & RFC-001 §4.4, §5.2) | [PR #63](https://github.com/linuxsoares/terapiainfoco/pull/63) | Merged |
| `feat/clinical-session-rfc3161-icp-brasil-tsa` | Módulo de Certificação Notarial de Sessão Clínica em Tempo Real com Timestamping RFC 3161 & ICP-Brasil Time-Stamping Authority (TSA - DOC-ICP-11, MP 2.200-2/2001, Resolução CFP nº 001/2009 e RFC-001 §3.4, §3.5, §4.4) | [PR #64](https://github.com/linuxsoares/terapiainfoco/pull/64) | Merged |
| `feat/http-parameter-pollution-header-injection-guard` | Módulo de Blindagem contra Parameter Pollution (HPP) e Injeção de Cabeçalhos (CRLF) em Endpoints Críticos (OWASP Top 10 API Security & RFC-001 §4.4, §5.2) | [PR #65](https://github.com/linuxsoares/terapiainfoco/pull/65) | Em Aberto |

---

## 🚀 O Que Precisamos Fazer (Próximos Passos Prioritários)

Com o **Módulo de Blindagem contra Parameter Pollution (HPP) e Injeção de Cabeçalhos (CRLF) em Endpoints Críticos (OWASP Top 10 API Security & RFC-001 §4.4, §5.2)**, o **Módulo de Certificação Notarial de Sessão Clínica em Tempo Real com Timestamping RFC 3161 & ICP-Brasil Time-Stamping Authority (DOC-ICP-11, MP 2.200-2/2001, Resolução CFP nº 001/2009 e RFC-001 §3.4, §3.5, §4.4)**, o **Módulo de Proteção Anti-Automação, Honeypot Dinâmico & Tarpit Criptográfico (OWASP OAT-011 / OAT-020)**, o **Módulo de Prevenção de Brute-Force & Credential Stuffing com PoW Criptográfico Dinâmico (OWASP OAT-007/OAT-008 & NIST SP 800-63B)**, a **Gestão Segura de Sessões Clínicas com Token Binding DPoP RFC 9449**, o **Protocolo Criptográfico de Anonimização Estatística Diferencial (Differential Privacy - ε-DP) para Pesquisa Clínica (LGPD Art. 13)**, a **Análise Comportamental Preditiva de Acesso Anômalo (UEBA)**, o **Protocolo DID / Verifiable Credentials W3C**, o **Expurgamento Seguro de Dados Históricos com Prova Criptográfica**, o **Cartório Notarial Digital de Prontuários & Auditoria Forense Zero-Knowledge**, o **Data Loss Prevention (DLP) no Clipboard Clínico com Marca d'Água Esteganográfica**, o **Controle Granular de Consentimento do Paciente**, o **Módulo Dark Web / HaveIBeenPwned Monitor**, as **Provas de Conhecimento Zero (ZKP)**, a **Gravação de Mídia com Sharding & Crypto-Shredding**, o **WAF Integrado em Camada de Aplicação**, a **Auditoria WebRTC com DTLS-SRTP & SAS**, o **Hardening HTTP (CSP, HSTS & Honeypot)**, o **Dashboard Executivo de Governança**, o **Exportador OpenTelemetry OTLP**, a **Gestão de Chaves KMS**, e a suíte completa de **617 testes automatizados**, os próximos passos de evolução do roadmap são:

#### 🛡️ Governança, Hardening & Proteção em Tempo Real
- [x] **Exportação Automática de Métricas OpenTelemetry OTLP via HTTP/JSON para Datadog/NewRelic:** Coleta remota de traces e métricas em lote com buffer em memória.
- [x] **Dashboard Executivo de Auditoria & Conformidade Regulatória Consolidada (LGPD + CFP + ICP-Brasil + SOC2/ISO 27001):** Exportação consolidada de compliance package multi-normativo com fé pública e DPO Sign-Off.
- [x] **Hardening de CSP (Content Security Policy) & Cabeçalhos HTTP HSTS/Honeypot na API REST Hono:** Blindagem adicional contra XSS, clickjacking e probes automatizados com quarentena em memória e trilha WORM.
- [x] **Integração Oficial Google Meet REST API v2 (spaces.create & endActiveConference):** Emissão de links Meet via API v2 com política de knocking TRUSTED (sala de espera CFP) e diagnósticos.
- [x] **Auditoria de Sessão WebRTC com Fingerprint de Segurança:** Verificação de integridade ponto-a-ponto dos canais de mídia para telepsicologia com DTLS-SRTP, Safety Numbers (SAS) e selo WORM.
- [x] **WAF Integrado com Detecção de Injeção SQL & XSS em Camada de Aplicação:** Inspeção heurística de payloads clínicos antes do desembrulho criptográfico.
- [x] **Simulador de Resiliência de Redes Instáveis para Teleconsulta (Jitter & Packet Loss Injection):** Testes de degradação controlada de canais de voz e vídeo com avaliação de inteligibilidade clínica (MOS ITU-T G.107) e diretriz ética CFP 011/2018.
- [x] **Módulo de Gravação em Repouso com Cifragem Assíncrona & Sharding de Mídia (RFC §3.2, §4.2):** Armazenamento em chunks encriptados com DEK transitória e destruição programada pós-transcrição.
- [x] **Detector de Desconexão Abrupta e Protocolo Automático de Reconexão Segura com Retenção de Estado da Sessão Clínica (RFC §3.2).**
- [x] **Protocolo de Validação Forense de Assinaturas Digitais com Provas de Conhecimento Zero (Zero-Knowledge Proofs - ZKP) sem Exposição de Metadados Clínicos (RFC-001 §3.4, §3.5 & CFP nº 006/2019).**
- [x] **Módulo de Detecção Proativa de Vazamento de Credenciais e PII (Dark Web / HaveIBeenPwned Monitor) com Revogação Instantânea de Sessões e Alerta DPO (RFC-001 §4.4, LGPD Art. 46/48 e Resolução CD/ANPD nº 15/2024).**
- [x] **Controle Granular de Consentimento do Paciente com Smart Revocation & Logs de Trilha Consent-Led (LGPD Art. 7/8/9/11/18 & CFP nº 006/2019).**
- [x] **Data Loss Prevention (DLP) no Clipboard Clínico com Marca d'Água Esteganográfica & Prevenção de Exfiltração de Prontuários (LGPD Art. 46 & CFP nº 001/2009).**
- [x] **Auditoria Forense de Integridade de Prontuários Eletrônicos com Hash Blind Indexing & Verificação Notarial Digital (LGPD Art. 18, CFP nº 001/2009).**
- [x] **Mecanismo de Descarte e Expurgamento Seguro de Dados Históricos por Fim de Ciclo de Tratamento com Prova Criptográfica de Destruição (LGPD Art. 16, CFP nº 001/2009).**
- [x] **Protocolo de Federação de Chaves e Identidades Clínicas Descentralizadas (DID / Verifiable Credentials) para Interoperabilidade em Saúde Mental (RFC-001 §3.5).**
- [x] **Análise Comportamental Preditiva de Acesso Anômalo (UEBA - User and Entity Behavior Analytics) para Detecção de Exfiltração Interna em Prontuários (RFC-001 §4.4 & LGPD Art. 46).**
- [x] **Protocolo Criptográfico de Anonimização Estatística Diferencial (Differential Privacy - ε-DP) para Pesquisa Clínica e Benchmarks Epidemiológicos (LGPD Art. 13 & CFP nº 001/2009).**
- [x] **Módulo de Gestão Segura de Sessões Clínicas com Revogação Forçada de Dispositivos Concorrentes e Token Binding Criptográfico (RFC-001 §4.4, RFC 9449, OWASP ASVS v4.0 & NIST SP 800-63B).**
- [x] **Módulo de Detecção e Prevenção Ativa de Brute-Force & Credential Stuffing com PoW (Proof-of-Work) Criptográfico e Desafio Dinâmico (RFC-001 §4.4, OWASP Automated Threats OAT-007 / OAT-008 & NIST SP 800-63B).**
- [x] **Módulo de Proteção Anti-Automação & Honeypot Dinâmico com Tarpit Criptográfico e Desaceleração de Scrapers (OWASP Automated Threats OAT-011 / OAT-020).**
- [x] **Módulo de Certificação Notarial de Sessão Clínica em Tempo Real com Timestamping RFC 3161 & ICP-Brasil Time-Stamping Authority (DOC-ICP-11, MP 2.200-2/2001, Resolução CFP nº 001/2009 e RFC-001 §3.4, §3.5, §4.4).**
- [x] **Módulo de Blindagem contra Ataques de Poluição de Parâmetros HTTP (HPP - HTTP Parameter Pollution) e Injeção de Cabeçalhos em Endpoints Críticos (OWASP Top 10 API Security).**
- [ ] **Protocolo de Cifragem Homomórfica Parcial (PHE - Paillier Cryptosystem) para agregação estatística segura de diagnósticos CID-11 sem decifragem centralizada.**
- [ ] **Proteção Avançada contra Server-Side Request Forgery (SSRF) e DNS Rebinding em Webhooks e Conectores Externos (OWASP API8:2023 & ASVS v4.0).**

---

## 🛠️ Comandos Rápidos para Retomada

```bash
# 1. Verificar status do git
git status

# 2. Executar suíte completa de testes (592 testes)
make test

# 3. Iniciar todos os serviços em desenvolvimento (Landing :5173, Frontend :5174, Backend :3000)
make dev

# 4. Compilar pacotes para produção
make build
```








