# 📋 TerapiaInFoco — Status de Implementação & Próximos Passos (RFC-001)

> **Documento de Continuidade Operacional**  
> **Data:** 14/10/2026  
> **Status Geral:** 8 Módulos Principais + 21 Extensões de Segurança + Suporte Mobile + Ficha de Anamnese & Retificação CFP + Métricas Prometheus & Tracing OTel + WebAuthn Passkeys + Auditoria Contínua & Relatório RIPD/DPIA + Conectores SIEM Externos + Gestão de Chaves KMS + Homologação sob Carga + Exportador Automático OpenTelemetry OTLP + Dashboard Executivo de Governança & Compliance Package Multi-Normativo + Hardening HTTP (CSP/HSTS) & Honeypot + Google Meet REST API v2 + Auditoria de Sessão WebRTC com Fingerprint DTLS-SRTP & Safety Numbers + WAF Integrado com Detecção Heurística de SQLi/XSS & Registro WORM + Simulador de Resiliência de Redes & Fala Clínica (ITU-T G.107 / CFP 011/2018) | 347/347 Testes Passando



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
| `feat/synthetic-monitoring-e2e` | Monitoramento Sintético, Testes E2E Automatizados & Resiliência PGlite (Opção M) | PR #29 | Merged |
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
| `feat/teleconsultation-network-resilience-simulation` | Simulador de Resiliência de Redes Instáveis para Teleconsulta (Jitter & Packet Loss Injection), Avaliação de Inteligibilidade Clínica (MOS ITU-T G.107 / E-Model), Recomendação Ética de Contingência (CFP 011/2018) e Registro WORM | [PR #46](https://github.com/linuxsoares/terapiainfoco/pull/46) | **Em Aberto** |

---

## 🚀 O Que Precisamos Fazer (Próximos Passos Prioritários)

Com o **Simulador de Resiliência de Redes Instáveis & Avaliação de Inteligibilidade Clínica (ITU-T G.107 / CFP nº 011/2018)**, o **WAF Integrado com Detecção de Injeção SQL & XSS em Camada de Aplicação (OWASP Top 10)**, a **Auditoria de Sessão WebRTC com Fingerprint de Segurança (DTLS-SRTP / SAS) & Laudo WORM (RFC-001 §3.2, §4.4, §5.2 e CFP nº 011/2018)**, a **Integração Google Meet REST API v2 (RFC §3.2 & CFP 011/2018)**, o **Hardening de Segurança HTTP (CSP, HSTS & OWASP) e Honeypot Anti-Probe**, o **Dashboard Executivo de Governança & Compliance Package Multi-Normativo**, a **Exportação Automática OpenTelemetry OTLP & Coletores Remotos**, a **Homologação sob Carga & Auditoria de SLOs RED (k6)**, a **Gestão de Chaves KMS & Rotação Contínua (NIST SP 800-57)**, os **Conectores SIEM Externos & Retry Resiliente**, a **Fase 4 do RFC-001 (Auditoria Contínua, Pentest & RIPD/DPIA)**, a **Autenticação Biométrica WebAuthn / Passkeys (Opção O)**, as **Métricas Prometheus & Tracing Distribuído OpenTelemetry (Opção N)**, a **Ficha de Anamnese Biopsicossocial**, o **Termo de Retificação Formal com Hash SHA-256 (CFP nº 001/2009)**, o Monitoramento Sintético E2E, o Simulador de Resiliência PGlite e o suporte mobile completos e validados por **347 testes automatizados**, os próximos passos de evolução do roadmap são:

#### 🛡️ Governança, Hardening & Proteção em Tempo Real
- [x] **Exportação Automática de Métricas OpenTelemetry OTLP via HTTP/JSON para Datadog/NewRelic:** Coleta remota de traces e métricas em lote com buffer em memória.
- [x] **Dashboard Executivo de Auditoria & Conformidade Regulatória Consolidada (LGPD + CFP + ICP-Brasil + SOC2/ISO 27001):** Exportação consolidada de compliance package multi-normativo com fé pública e DPO Sign-Off.
- [x] **Hardening de CSP (Content Security Policy) & Cabeçalhos HTTP HSTS/Honeypot na API REST Hono:** Blindagem adicional contra XSS, clickjacking e probes automatizados com quarentena em memória e trilha WORM.
- [x] **Integração Oficial Google Meet REST API v2 (spaces.create & endActiveConference):** Emissão de links Meet via API v2 com política de knocking TRUSTED (sala de espera CFP) e diagnósticos.
- [x] **Auditoria de Sessão WebRTC com Fingerprint de Segurança:** Verificação de integridade ponto-a-ponto dos canais de mídia para telepsicologia com DTLS-SRTP, Safety Numbers (SAS) e selo WORM.
- [x] **WAF Integrado com Detecção de Injeção SQL & XSS em Camada de Aplicação:** Inspeção heurística de payloads clínicos antes do desembrulho criptográfico.
- [x] **Simulador de Resiliência de Redes Instáveis para Teleconsulta (Jitter & Packet Loss Injection):** Testes de degradação controlada de canais de voz e vídeo com avaliação de inteligibilidade clínica (MOS ITU-T G.107) e diretriz ética CFP 011/2018.
- [ ] **Módulo de Gravação em Repouso com Cifragem Assíncrona & Sharding de Mídia (RFC §3.2, §4.2):** Armazenamento em chunks encriptados com DEK transitória e destruição programada pós-transcrição.
- [ ] **Detector de Desconexão Abrupta e Protocolo Automático de Reconexão Segura com Retenção de Estado da Sessão Clínica.**

---

## 🛠️ Comandos Rápidos para Retomada

```bash
# 1. Verificar status do git
git status

# 2. Executar suíte completa de testes (347 testes)
make test

# 3. Iniciar todos os serviços em desenvolvimento (Landing :5173, Frontend :5174, Backend :3000)
make dev

# 4. Compilar pacotes para produção
make build
```







