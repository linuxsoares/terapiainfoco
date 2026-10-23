# 📋 TerapiaInFoco — Status de Implementação & Próximos Passos (RFC-001)

> **Documento de Continuidade Operacional**  
> **Data:** 16/10/2026  
> **Status Geral:** 8 Módulos Principais + Evolução de Produto RFC-001 (Módulo de Prescrição & Encaminhamento Psiquiátrico com Validação Cruzada de Medicamentos e Interações Farmacológicas §3.5 + Anamnese Digital Interativa com Árvore de Decisão Diagnóstica & Escalas Psicométricas Iniciais §3.4 + Portal do Paciente Autenticado com Exercícios Terapêuticos TCC/ACT/DBT, Histórico de Recibos & Termos TCLE §3.6, §3.7 + Assinatura Avançada ICP-Brasil A1/A3/Nuvem em Lote & Fechamento de Ciclos §3.4, §3.5 + Transcrição Assistida por IA, Diarização de Voz & Síntese SOAP Human-in-the-Loop §3.3 + Teleconsulta Nativa WebRTC P2P, Sala de Espera Ética CFP nº 011/2018 & Telemetria MOS ITU-T G.107 §3.2, §3.3 + Faturamento Clínico & Emissão de Recibos de Honorários para Reembolso de Convênio/DMED & Termos de Serviços §3.6 + Laudos Periciais Multi-Sessões & Relatório Consolidado CFP nº 006/2019 §3.5 + Encaminhamento Multidisciplinar Interoperável & Contra-Referência §3.5 + Marcadores Clínicos em Tempo Real §3.3 + Metas Terapêuticas SMART & Escalas Psicométricas PHQ-9/GAD-7 §3.4 + Agendamento Recorrente & Séries Clínicas §3.1 + Notificações & Lembretes Multicanal WhatsApp/Email CFP nº 011/2018 + Linha do Tempo Clínica Longitudinal do Paciente §3.4) + 47 Extensões de Segurança | 1.356/1.356 Testes Passando (0 falhas em 137 arquivos)



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

### 33. [Removido pelo ADR-005 — a teleconsulta não é gravada] Módulo de Gravação em Repouso com Cifragem Assíncrona, Sharding de Mídia (Envelope Encryption com DEKs Efêmeras por Shard), Validação Merkle Tree e Destruição Programada Pós-Transcrição (*Crypto-Shredding*) com Selo Probatório WORM (RFC-001 §3.2, §3.3, §4.2, LGPD Art. 11/16, CFP nº 011/2018)
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

### 49. Protocolo de Cifragem Homomórfica Parcial (PHE - Paillier Cryptosystem) para Agregação Estatística Segura de Diagnósticos CID-11 sem Decifragem Centralizada (LGPD Art. 13, Resolução CFP nº 001/2009 e RFC-001 §4.4, §5.2)
- [x] **Motor Criptográfico Homomórfico Paillier (`packages/crypto/src/homomorphicPaillier.ts`):**
  - **Primitivas de Aritmética Modular BigInt:** Algoritmo de Euclides para Maior Divisor Comum (`gcd`), Algoritmo Estendido de Euclides para coeficientes de Bézout (`extendedGcd`), Inverso Multiplicativo Modular (`modInverse`), Mínimo Múltiplo Comum (`lcm`), Exponenciação Modular Rápida (`modExp`), gerador de coprimos (`randomCoprime`) e função de Paillier $L(u) = \frac{u - 1}{n}$.
  - **Geração Segura de Chaves Paillier (`generatePaillierKeyPair`):** Pares de primos seguros pré-computados e validados pelo teste de primalidade de Miller-Rabin ($k=20$) satisfazendo rigorosamente $\gcd(\lambda, n) = 1$. Geração de chave pública $(n, g = n + 1, n^2)$ e chave privada $(\lambda = \text{lcm}(p-1, q-1), \mu = \lambda^{-1} \pmod n)$.
  - **Cifragem Probabilística Aditiva (`paillierEncrypt`):** Cifragem com número aleatório $r \in \mathbb{Z}^*_n$ gerando $c = (1 + m \cdot n) \cdot r^n \pmod{n^2}$, garantindo textos cifrados distintos para uma mesma entrada clínica.
  - **Decifragem Homomórfica (`paillierDecrypt`):** Recuperação exata da mensagem através de $m = L(c^\lambda \bmod n^2) \cdot \mu \pmod n$.
  - **Operações Homomórficas Aditivas e Escalares:**
    - `paillierAdd`: Adição de dois textos cifrados $D(c_1 \cdot c_2 \bmod n^2) = m_1 + m_2 \pmod n$.
    - `paillierAddMultiple`: Acumulação aditiva em lote por produtório modular $\prod c_i \pmod{n^2}$.
    - `paillierMultiplyScalar`: Multiplicação de texto cifrado por escalar $D(c^k \bmod n^2) = k \cdot m \pmod n$.
    - `paillierAddConstant`: Adição de constante ao texto cifrado $D(c \cdot g^k \bmod n^2) = m + k \pmod n$.
  - **Zero-Knowledge Range Proof para Domínio Booleano $\{0, 1\}$ (`generateZkProofBit` / `verifyZkProofBit`):** Prova de conhecimento zero que atesta a validade da entrada booleana $\{0, 1\}$ por diagnóstico, rejeitando injeções maliciosas ou valores inflacionados.
  - **Catálogo Canônico CID-11 de Saúde Mental (`CID11_MENTAL_HEALTH_CATALOG`):** Cobertura oficial de 9 diagnósticos OMS (`6A70` Depressão Única, `6A71` Depressão Recorrente, `6B00` TAG, `6B01` Pânico, `6B40` TEPT, `6B20` TOC, `6A20` Esquizofrenia, `6C40` Uso de Substâncias e `MB40` Burnout).
  - **Processamento Clínico & Agregação de Coorte:** `encryptPatientCidCohortVector`, `aggregateCohortHomomorphic` e `decryptCohortAggregation` com cálculo de prevalência percentual.
  - **Selo Probatório WORM com HMAC-SHA256 (`createHomomorphicProofSeal` / `verifyHomomorphicProofSeal`):** Digest canônico e assinatura HMAC garantindo integridade contra mutações retroativas.
  - Suíte com 19 testes unitários rigorosos aprovados em `packages/crypto/test/homomorphicPaillier.test.ts`.
- [x] **Contratos Compartilhados & Tipagem Forte (`packages/shared`):**
  - **Enums (`enums.ts`):** `Cid11Category`, `HomomorphicSecurityLevel`, `HomomorphicCohortStatus`, `AuditResourceType.HOMOMORPHIC_ENCRYPTION_ENGINE` e 5 ações WORM (`HOMOMORPHIC_KEYPAIR_GENERATED`, `HOMOMORPHIC_COHORT_ENCRYPTED`, `HOMOMORPHIC_AGGREGATION_COMPUTED`, `HOMOMORPHIC_RESULT_DECRYPTED`, `HOMOMORPHIC_PROOF_VERIFIED`).
  - **Modelos (`models.ts`):** `PaillierPublicKey`, `PaillierPrivateKey`, `PaillierKeyPair`, `PaillierCiphertext`, `Cid11Item`, `PatientEncryptedCidVector`, `HomomorphicCohortAggregation`, `HomomorphicDecryptedResult`, `HomomorphicProofSeal`, `HomomorphicMetrics`, `HomomorphicOverview`.
  - **DTOs (`dtos.ts`):** `CreateHomomorphicCohortDTO`, `EncryptPatientCidVectorDTO`, `AddCohortEncryptedPatientDTO`, `DecryptCohortAggregationDTO`, `VerifyHomomorphicProofSealDTO`, etc.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - **Serviço Central (`homomorphicService.ts`):** Gerenciamento do ciclo de vida das chaves Paillier, coortes epidemiológicas em memória com sementes de demonstração, validação de provas ZK, agregação cega e gravação compulsória na trilha WORM inalterável via `AuditService.log`.
  - **Rotas REST (`homomorphic.ts`):**
    - `GET /api/homomorphic/overview`: Visão geral das métricas, coortes e chave pública ativa.
    - `GET /api/homomorphic/catalog`: Catálogo de diagnósticos CID-11.
    - `GET /api/homomorphic/public-key`: Chave pública para cifragem cliente.
    - `POST /api/homomorphic/cohorts`: Criação de nova coorte de pesquisa.
    - `POST /api/homomorphic/cohorts/:id/patients`: Adição de vetor cifrado de paciente com soma homomórfica.
    - `POST /api/homomorphic/cohorts/decrypt`: Decifragem autorizada com validação compulsória de aprovação CEP/CONEP.
    - `POST /api/homomorphic/verify-seal`: Validação do selo probatório WORM.
  - Suíte com 8 testes de integração aprovados em `apps/backend/test/homomorphic.test.ts`.
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Client de API (`api.ts`):** 7 métodos implementados para integração com a API homomórfica.
  - **Módulo de Segurança (`SecurityModule.tsx`):**
    - **Card 31** (*Cifragem Homomórfica Parcial (PHE - Paillier) & Agregação CID-11*) com 4 KPIs regulatórios (Coortes Ativas, Prontuários Cifrados, Operações Cegas, Decifragens Não-Autorizadas: 0).
    - **Banner de Chave Pública Ativa:** Visualização dos parâmetros de 512 bits e garantia matemática de sigilo clínico.
    - **Criador de Nova Coorte:** Formulário integrado para criação de estudos epidemiológicos.
    - **Simulador de Agregação de Prontuário:** Seleção de coorte, checklist dos 9 CIDs de saúde mental e cifragem/soma em tempo real.
    - **Tabela de Coortes Epidemiológicas:** Listagem das coortes com status, total de pacientes, ações para Laudo WORM (31.A) e Decifragem Autorizada (31.B).
    - **Modal 31.A (Laudo Notarial do Selo Probatório Homomórfico):** Certidão pericial timbrada com parâmetros ASN.1/Paillier, token probatório e botão de verificação instantânea no cartório WORM.
    - **Modal 31.B (Decifragem Ética Autorizada CEP/CONEP & Relatório de Prevalência):** Exigência de parecer ético formal, validação de chave privada e exibição de gráfico e percentuais de prevalência.
  - Suporte completo a **Light Mode** e **Dark Mode**.

### 50. Módulo de Proteção Avançada contra Server-Side Request Forgery (SSRF) e DNS Rebinding em Webhooks e Conectores Externos (OWASP Top 10 API Security API8:2023, OWASP ASVS v4.0 e RFC-001 §4.4, §5.2)
- [x] **Motor Criptográfico & Anti-SSRF (`packages/crypto/src/ssrfProtectionGuard.ts`):**
  - **De-obfuscation Completa de Endereços IP:** Decodificação de notações dword decimal (`2130706433`), hexadecimal puro e pontilhado (`0x7f000001`), octal (`0177.0.0.1`), notações abreviadas de 2 e 3 partes (`127.1`) e IPv6 mapeado (`::ffff:127.0.0.1`, `::1`).
  - **Identificação Rigorosa de Subredes Restritas & Cloud Metadata:** Bloqueio de Loopback (`127.0.0.0/8`, `0.0.0.0/8`), Link-Local e Cloud Metadata (`169.254.169.254`, `metadata.google.internal`), RFC 1918 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), CGNAT (`100.64.0.0/10`), Multicast (`224.0.0.0/4`) e Test-Nets.
  - **Restrição de Esquemas & Port Scanning:** Bloqueio estrito de protocolos perigosos (`file://`, `gopher://`, `dict://`, `ftp://`, `ldap://`) e portas internas sensíveis (SSH 22, Docker 2375, Redis 6379, Postgres 5432, Elasticsearch 9200, MongoDB 27017, etc.).
  - **Mitigação Ativa de DNS Rebinding & IP Pinning:** Detecção de TTL 0 / múltiplos registros A divergentes, simulação de dupla resolução e obrigatoriedade de correspondência exata com o IP homologado fixado (`pinnedIp`).
  - **Selo Probatório WORM HMAC-SHA256 (`createSsrfProofSeal` / `verifySsrfProofSeal`):** Digest canônico SHA-256 e assinatura digital HMAC garantindo integridade e cadeia de custódia inalterável.
  - Suíte com 23 testes unitários rigorosos aprovados em `packages/crypto/test/ssrfProtectionGuard.test.ts`.
- [x] **Contratos Compartilhados & Tipagem Forte (`packages/shared`):**
  - **Enums (`enums.ts`):** `SsrfAttackCategory`, `SsrfDefensePolicy`, `SsrfSeverityLevel`, `WebhookConnectorType`, `AuditResourceType.SSRF_PROTECTION_GUARD` e 5 ações WORM (`SSRF_ATTACK_DETECTED`, `SSRF_ATTACK_BLOCKED`, `DNS_REBINDING_DETECTED`, `EXTERNAL_WEBHOOK_VALIDATED`, `SSRF_SEAL_VERIFIED`).
  - **Modelos (`models.ts`):** `SsrfInspectionResult`, `WebhookConnectorConfig`, `SsrfIncident`, `SsrfProofSeal`, `SsrfMetrics`, `SsrfOverview`.
  - **DTOs (`dtos.ts`):** `SimulateSsrfDTO`, `SimulateSsrfResponse`, `ValidateWebhookUrlDTO`, `ValidateWebhookUrlResponse`, `VerifySsrfSealDTO`, `VerifySsrfSealResponse`, `SsrfOverviewResponse`.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - **Serviço Central (`ssrfGuardService.ts`):** Catálogo de conectores protegidos (EHR Telessaúde, TSA Notary, Gateway de Faturamento, SIEM Hospitalar e Telemedicina WebRTC), controle de métricas em tempo real, gestão de incidentes e auditoria compulsória no WORM via `AuditService.log`.
  - **Rotas REST (`ssrfGuard.ts`):**
    - `GET /api/ssrf-guard/overview`: Métricas operacionais, conectores com IP Pinning e incidentes recentes.
    - `POST /api/ssrf-guard/simulate-ssrf`: Simulação e teste de vetores SSRF e DNS Rebinding.
    - `POST /api/ssrf-guard/validate-url`: Validação pré-voo de URLs de webhook e disparo seguro.
    - `POST /api/ssrf-guard/verify-seal`: Verificação forense independente do selo probatório HMAC-SHA256.
    - `GET /api/ssrf-guard/incidents`: Feed de incidentes neutralizados.
  - Montagem central em `apps/backend/src/index.ts` sob `/api/ssrf-guard`.
  - Suíte com 11 testes de integração aprovados em `apps/backend/test/ssrfGuard.test.ts`.
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Client de API (`api.ts`):** 5 novos métodos implementados para integração com a API anti-SSRF.
  - **Módulo de Segurança (`SecurityModule.tsx`):**
    - **Card 32** (*Proteção Avançada contra SSRF e DNS Rebinding em Webhooks*) com 5 KPIs regulatórios (URLs Inspecionadas, Ataques Bloqueados, Rebinding Barrados, Cloud Metadata Probes, Conectores Protegidos).
    - **Simulador Pericial de Conexões Externas & SSRF:** 5 presets com botões clicáveis (Cloud Metadata, IP Decimal, DNS Rebinding, RFC 1918 Privado, Legítimo TSA), seletor de conector, seletor de política e checkbox para simular DNS Rebinding.
    - **Tabela de Conectores Hospitalares Protegidos (IP Pinning):** Status ativo, IP fixado, total de invocações e URL homologada.
    - **Feed de Incidentes Recentes:** Card colorido com severidade, data/hora e link para laudo pericial.
    - **Modal 32.A (Laudo Forense de Incidente SSRF):** Detalhes da tentativa, cabeçalhos, IP de origem, categorias detectadas e digest WORM.
    - **Modal 32.B (Verificação Notarial do Selo WORM SSRF):** Validação criptográfica de autenticidade HMAC-SHA256 com feedback em tempo real.
  - Suporte completo a **Light Mode** e **Dark Mode**.

---

### 51. Módulo de Rate Limiting Avançado com Algoritmo Híbrido Token Bucket + Sliding Window Log para Proteção Anti-DDoS e Abuso de Endpoints Clínicos Sensíveis (OWASP Top 10 API Security API4:2023 - Unrestricted Resource Consumption & RFC-001 §4.4, §5.2)
- [x] **Motor Criptográfico & Matemático (`packages/crypto/src/advancedRateLimiter.ts`):**
  - **Algoritmo Token Bucket Contínuo:** Implementação matemática exata com recarga temporal fracionária contínua $\Delta t \times r$ sem drift de relógio e suporte a absorção elástica de bursts controlados.
  - **Algoritmo Sliding Window Log:** Registro de requisições retidas em janela deslizante com granularidade de microssegundos, mitigando ataques de rajada sincronizada em bordas de janela fixa.
  - **Avaliação Híbrida Unificada:** Execução combinada onde o Token Bucket avalia a elasticidade imediata de rajada e o Sliding Window Log valida o teto agregado de volume por janela temporal, com rollback atômico e compensatório de tokens caso a janela deslizante rejeite o acesso.
  - **Cálculo Preciso de `Retry-After`:** Estimativa analítica do tempo exato de espera necessário para recuperação de saldo de tokens ou expiração dos itens mais antigos do log de janela.
  - **Quarentena Automática Progressiva:** Isolamento compulsório de clientes ou IPs com excesso de violações consecutivas (>5 bursts excedidos), impedindo exaustão de CPU/memória no desembrulho criptográfico.
  - **Selo Probatório WORM HMAC-SHA256 (`createRateLimitProofSeal` / `verifyRateLimitProofSeal`):** Emissão de token criptográfico canônico (`RL-SEAL-v1-...`) assinado digitalmente para não-repúdio e auditoria forense.
  - Suíte com 13 testes unitários rigorosos aprovados em `packages/crypto/test/advancedRateLimiter.test.ts`.
- [x] **Contratos Compartilhados & Tipagem Forte (`packages/shared`):**
  - **Enums (`enums.ts`):** `RateLimitingAlgorithm` (`TOKEN_BUCKET`, `SLIDING_WINDOW_LOG`, `HYBRID_DUAL_PASS`), `RateLimitTier` (`PUBLIC_ANONYMOUS`, `AUTHENTICATED_CLINICAL`, `CRITICAL_EHR_EXPORT`, `INTERNAL_SERVICE_MESH`), `RateLimitDecision` (`ALLOWED`, `THROTTLED`, `QUARANTINED`, `BYPASSED`), `AuditResourceType.ADVANCED_RATE_LIMIT_ENGINE` e 6 ações de auditoria WORM (`RATE_LIMIT_EVALUATED`, `RATE_LIMIT_THROTTLED`, `RATE_LIMIT_QUARANTINED`, `RATE_LIMIT_CLIENT_RESET`, `RATE_LIMIT_RULE_UPDATED`, `RATE_LIMIT_SEAL_VERIFIED`).
  - **Modelos (`models.ts`):** `TokenBucketState`, `SlidingWindowLogEntry`, `RateLimitRuleConfig`, `RateLimitEvaluationResult`, `RateLimitProofSeal`, `AdvancedRateLimitMetrics`, `AdvancedRateLimitOverview`.
  - **DTOs (`dtos.ts`):** `EvaluateRateLimitDTO`, `EvaluateRateLimitResponse`, `ConfigureRateLimitRuleDTO`, `ResetClientBucketDTO`, `VerifyRateLimitSealDTO`, `VerifyRateLimitSealResponse`, `AdvancedRateLimitOverviewResponse`.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - **Serviço Central (`advancedRateLimiterService.ts`):** Catálogo de 6 políticas padrão pré-calibradas para endpoints clínicos críticos (Autenticação Login, Desafio 2FA TOTP, Exportação de Prontuário LGPD Art. 18, Assinatura Digital ICP-Brasil, WebRTC ICE Handshake e Agendamento Público Landing), gestão de buckets, retenção de métricas em tempo real e auditoria compulsória no WORM via `AuditService.log`.
  - **Rotas REST (`advancedRateLimiter.ts`):**
    - `GET /api/advanced-rate-limiter/overview`: Visão geral de métricas, regras ativas e clientes em quarentena.
    - `POST /api/advanced-rate-limiter/evaluate`: Avaliação e consumo sob demanda de tokens para qualquer cliente/endpoint.
    - `POST /api/advanced-rate-limiter/rules/configure`: Criação ou atualização dinâmica de regras por Tier.
    - `POST /api/advanced-rate-limiter/clients/reset`: Desbloqueio operacional de cliente isolado em quarentena com emissão de log WORM.
    - `POST /api/advanced-rate-limiter/verify-seal`: Validação notarial independente de autenticidade do selo HMAC-SHA256.
    - `GET /api/advanced-rate-limiter/rules`: Listagem completa do catálogo de regras ativas.
  - Montagem central em `apps/backend/src/index.ts` sob `/api/advanced-rate-limiter`.
  - Suíte com 10 testes de integração aprovados em `apps/backend/test/advancedRateLimiter.test.ts`.
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Client de API (`api.ts`):** 6 novos métodos tipados para integração transparente com o motor de rate limiting.
  - **Módulo de Segurança (`SecurityModule.tsx`):**
    - **Card 33** (*Rate Limiting Avançado & Proteção Anti-DDoS - OWASP API4:2023*) com 5 KPIs operacionais (Requisições Avaliadas, Throttlings Ativos, Clientes em Quarentena, Consumos de Bucket, Violações de Janela).
    - **Simulador Interativo de Tráfego & Consumo:** 4 presets rápidos (Login Brute-Force, 2FA Spraying, Exportação LGPD Massiva, Agendamento Público), configuração de tokens a consumir, seletor de Tier regulatório e exibição de decisão com badge de status e Retry-After.
    - **Catálogo de Regras por Endpoint & Tier:** Visualização de capacidade de bucket, taxa de recarga contínua e limites de janela deslizante.
    - **Feed de Clientes em Quarentena:** Listagem com identificador, total de violações, motivo do isolamento, data de expiração e botão de desbloqueio operacional.
    - **Modal 33.B (Auditoria de Selo WORM de Rate Limiting):** Verificação notarial independente da assinatura digital HMAC-SHA256 com atestado de autenticidade em tempo real.
    - **Modal 33.C (Confirmação de Desbloqueio de Quarentena):** Modal de segurança para confirmação com justificativa auditada.
  - Suporte completo a **Light Mode** e **Dark Mode**.

---

### 52. Módulo de Blindagem de Memória & Prevenção de Heap Spraying em Sessões Criptográficas com Secure Memory Allocator e Limpeza Imediata de DEKs (NIST SP 800-88 Rev. 1, OWASP ASVS v4.0 V14.1 e RFC-001 §4.2, §4.4, §5.2)
- [x] **Motor Criptográfico & Matemático (`packages/crypto/src/secureMemoryShield.ts`):**
  - **Encapsulamento Defensivo (`SecureBuffer`):** Alocação controlada com proteção contra Use-After-Free (UAF), cópias defensivas estritas e ciclo de vida auditado (`ALLOCATED`, `ACTIVE`, `ZEROIZED`, `RELEASED`, `CORRUPTED`).
  - **Sanitização Multi-Pass Determinística (Cryptographic Erase):**
    - **NIST SP 800-88 Overwrite:** 4 passos determinísticos (0x00, 0xFF, bytes pseudo-aleatórios criptograficamente seguros via CSPRNG e 0x00 final com verificação pericial de integridade).
    - **DoD 5220.22-M:** 3 passos (0x00, 0xFF, CSPRNG + 0x00).
    - **Zeroize Immediate:** 1 passo rápido para baixa latência.
  - **Cálculo Estocástico de Entropia de Shannon:** Determinação matemática precisa da aleatoriedade ($H \in [0.0, 8.0]$ bits/byte) para distinguir texto clínico legítimo de injeções repetitivas ou NOP sleds.
  - **Motor de Detecção de Heap Spraying & Exploit Sleds (`inspectHeapSpraying`):**
    - Identificação de assinaturas conhecidas: `X86_NOP_SLED` (0x90), `INT3_TRAP_SLED` (0xCC), `ARM64_NOP_SLED` (0x1f2003d5), `CLASSIC_BROWSER_SPRAY_0C/0D/0A` e padding repetido.
    - Análise de repetição de k-grams (padrões de 2 a 8 bytes repetidos) e dominância de byte (>50%).
    - Classificação de ameaça em 4 níveis: `NORMAL`, `SUSPICIOUS`, `ATTACK_DETECTED`, `CRITICAL_SPRAYING`.
  - **Selo Probatório WORM HMAC-SHA256 (`createMemoryZeroizationProofSeal` / `verifyMemoryZeroizationProofSeal`):** Emissão de token criptográfico canônico (`MEM-ZEROIZE-v1-...`) assinado para não-repúdio de destruição de dados.
  - Suíte com 19 testes unitários rigorosos aprovados em `packages/crypto/test/secureMemoryShield.test.ts`.
- [x] **Contratos Compartilhados & Tipagem Forte (`packages/shared`):**
  - **Enums (`enums.ts`):** `MemorySanitizationAlgorithm`, `HeapSprayingThreatLevel`, `SecureBufferState`, `AuditResourceType.SECURE_MEMORY_SHIELD` e 6 ações de auditoria WORM (`SECURE_MEMORY_ALLOCATED`, `SECURE_MEMORY_ZEROIZED`, `HEAP_SPRAYING_DETECTED`, `HEAP_SPRAYING_BLOCKED`, `DEK_EXPIRATION_PURGED`, `MEMORY_ZEROIZATION_SEAL_VERIFIED`).
  - **Modelos (`models.ts`):** `SecureMemoryBlock`, `HeapSprayingInspectionResult`, `MemoryZeroizationProofSeal`, `SecureMemoryMetrics`, `SecureMemoryOverview`.
  - **DTOs (`dtos.ts`):** `AllocateSecureBufferDTO`, `AllocateSecureBufferResponse`, `ZeroizeSecureBufferDTO`, `ZeroizeSecureBufferResponse`, `InspectHeapSprayingDTO`, `InspectHeapSprayingResponse`, `PurgeExpiredDeksResponse`, `VerifyZeroizationSealDTO`, `VerifyZeroizationSealResponse`, `SecureMemoryOverviewResponse`.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - **Serviço Central (`secureMemoryService.ts`):** Gestão em memória de blocos seguros (DEKs SOAP, SRTP WebRTC, ICP-Brasil, TOTP), controle de métricas e ciclo de vida, varredura de DEKs expiradas por TTL com destruição automática compulsória e auditoria WORM via `AuditService.log`.
  - **Rotas REST (`secureMemory.ts`):**
    - `GET /api/secure-memory/overview`: Métricas de blocos, bytes em heap, selos de sanitização e status.
    - `POST /api/secure-memory/allocate`: Alocação protegida de novo bloco com tag, tamanho e TTL.
    - `POST /api/secure-memory/zeroize`: Sanitização e destruição imediata com algoritmo NIST/DoD.
    - `POST /api/secure-memory/inspect-heap-spraying`: Inspeção pericial de payloads contra heap spraying e sleds.
    - `POST /api/secure-memory/purge-expired`: Varredura e expurgamento forçado de DEKs com TTL vencido.
    - `POST /api/secure-memory/verify-seal`: Validação notarial independente de selo WORM de sanitização.
  - Montagem central em `apps/backend/src/index.ts` sob `/api/secure-memory`.
  - Suíte com 10 testes de integração aprovados em `apps/backend/test/secureMemory.test.ts`.
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Client de API (`api.ts`):** 6 métodos implementados para integração com a blindagem de memória.
  - **Módulo de Segurança (`SecurityModule.tsx`):**
    - **Card 34** (*Blindagem de Memória & Prevenção de Heap Spraying - NIST SP 800-88 & ASVS*) com 5 KPIs operacionais.
    - Botão de ação rápida: "Expurgar DEKs Expiradas (Varredura NIST)".
    - **Aba 1 (Alocação & Ciclo de Vida de DEK):** Formulário completo com presets clínicos (SOAP 32B, ICP-Brasil 64B, TOTP 32B), seletor de algoritmo de sanitização e contadores.
    - **Aba 2 (Simulador de Heap Spraying & Entropia):** 4 presets rápidos (NOP Sled 0x90, Browser Spray 0x0C, Repetitive DEADBEEF, Texto Clínico Legítimo), cálculo de Entropia de Shannon e badge de ameaça.
    - **Tabela de Blocos Seguros em Memória:** Status ativo, tamanho em bytes, expiração e botão para sanitização NIST imediata.
    - **Feed de Selos de Sanitização WORM:** Histórico de selos com tokens e botão para auditoria pericial.
    - **Modal 34.B (Auditoria de Selo WORM de Sanitização de Memória):** Verificação notarial independente com atestado criptográfico em tempo real.
  - Suporte completo a **Light Mode** e **Dark Mode**.

### 53. Módulo de TLS Certificate Pinning & Validação Estrita de Cadeia X.509 com HPKP/DANE e Rotação de CAs (RFC-001 §4.4, §5.2 e OWASP MASVS)
- [x] **Core Criptográfico & Motor de Validação X.509 (`packages/crypto/src/tlsPinningGuard.ts`):**
  - **Cálculo Canônico SPKI Pin (RFC 7469):** `calculateSpkiPinSha256` calculando hash SHA-256 codificado em Base64 da chave pública DER (`pin-sha256="..."`), compatível com especificações HPKP e DANE (RFC 6698).
  - **Digest de Fingerprint do Certificado:** `calculateCertFingerprintSha256` gerando representação hexadecimal auditável SHA-256 com delimitadores dois pontos (`AA:BB:CC:...`).
  - **Validação Estrita de Hostname & SAN (RFC 6125):** `matchHostname` com suporte a wildcard restrito ao primeiro subdomínio, rejeitando wildcards em TLDs públicos (`*.com.br`, `*.com`) ou de múltiplos níveis (`*.*.terapiainfoco.com.br`).
  - **Detecção de Assinaturas de Interceptação MitM:** `detectMitmSignatures` inspecionando CAs fraudulentas conhecidas (`PortSwigger`, `Burp Suite`, `Fiddler`, `Charles Proxy`, `mitmproxy`, `OWASP ZAP`) e quarentenadas pelo DPO.
  - **Validação de Cadeia & Validade Temporal:** Verificação de períodos de vigência (`validFrom`, `validTo`) e sanidade de emissores.
  - **Motor Central de Avaliação (`evaluateTlsCertificatePinning`):** Classificação em 6 status (`PIN_MATCH_PRIMARY`, `PIN_MATCH_BACKUP`, `PIN_MISMATCH_SUSPECTED_MITM`, `CHAIN_UNTRUSTED_ROGUE_CA`, `CERTIFICATE_EXPIRED`, `SAN_MISMATCH`) e 5 níveis de ameaça (`NONE`, `LOW`, `MEDIUM`, `HIGH`, `CRITICAL_MITM`).
  - **Selo Notarial Probatório WORM (`createTlsPinProofSeal` / `verifyTlsPinProofSeal`):** Token canônico assinado HMAC-SHA256 (`tls_pin_v1_<base64url>`) com digest JCS (RFC 8785) e validação pericial matemática anti-tampering.
  - Suíte com 19 testes unitários aprovados em `packages/crypto/test/tlsPinningGuard.test.ts`.
- [x] **Contratos Compartilhados, Modelos & DTOs (`packages/shared`):**
  - **Enums e Ações WORM:** `AuditResourceType.TLS_PINNING_GUARD`, ações (`TLS_PIN_VERIFIED`, `TLS_PIN_VIOLATION_BLOCKED`, `TLS_CA_ROTATED`, `TLS_ROGUE_CA_DETECTED`, `TLS_BACKUP_PIN_PROMOTED`, `TLS_PIN_SEAL_VERIFIED`), `TlsPinningStrategy`, `TlsPinValidationStatus`, `TlsPinPolicyMode`.
  - **Modelos e DTOs:** Interfaces `TlsSpkiPin`, `X509CertInspection`, `TlsPinProofSeal`, `TlsPinValidationResult`, `TlsPinningMetrics`, `TlsPinningOverview` e DTOs `ValidateTlsPinDTO`, `RegisterTlsPinDTO`, `RotateTlsCaDTO`, `QuarantineCompromisedCaDTO`, `VerifyTlsPinSealDTO`, `TlsPinningOverviewResponse`.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - **TlsPinningService (`apps/backend/src/services/tlsPinningService.ts`):** Gestão em memória dos pins homologados para domínios clínicos (`api...`, `meet...`, `notary...`, `auth...`), catálogo de CAs quarentenadas, rotação atômica de autoridades (zero-downtime) promovendo Backup Pin a Primary e gravação na trilha WORM inalterável via `AuditService.log`.
  - **Rotas REST (`apps/backend/src/routes/tlsPinning.ts`):**
    - `GET /api/tls-pinning/overview`: Visão geral executiva com métricas, pins ativos, CAs em quarentena e validações recentes.
    - `POST /api/tls-pinning/validate`: Validação em tempo real de certificados/handshakes com simulador de pentest.
    - `POST /api/tls-pinning/register-pin`: Cadastro de novos Pins SPKI com tipagem PRIMARY ou BACKUP_ROTATION.
    - `POST /api/tls-pinning/rotate-ca`: Rotação controlada de CA com rebaixamento e promoção atômica.
    - `POST /api/tls-pinning/quarantine-ca`: Quarentena de CA com revogação em cascata de pins vinculados.
    - `POST /api/tls-pinning/verify-seal`: Validação pericial independente da fé pública do selo WORM.
  - Suíte com 11 testes de integração aprovados em `apps/backend/test/tlsPinning.test.ts`.
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Métodos de API (`api.ts`):** `getTlsPinningOverview`, `validateTlsPin`, `registerTlsPin`, `rotateTlsCa`, `quarantineTlsCa`, `verifyTlsPinSeal`.
  - **Módulo de Segurança (`SecurityModule.tsx`):**
    - **Card 35** (*TLS Certificate Pinning & Rotação Contínua de CAs*) com 5 KPIs regulatórios (Pins SPKI Ativos, Validações 24h, Ataques MitM Bloqueados, Rotações de CA, CAs Quarentenadas).
    - **Abas Especializadas:**
      - Aba 1: *Verificador & Simulador de Ataques MitM*: Teste com presets (Let's Encrypt Legítimo, Burp Suite CA, Certificado Expirado, SAN Spoofing, CA Quarentenada, Rotação Suave).
      - Aba 2: *Pins SPKI Cadastrados & Rotação de CA*: Tabela de Pins por domínio com botão de promoção imediata a Primary.
      - Aba 3: *Quarentena de CAs Comprometidas*: Formulário para isolamento e lista de CAs sob bloqueio ativo.
    - **Tabela Auditada de Validações Recentes:** Histórico com status, nível de ameaça, CA apresentada e botão para auditar selo WORM.
    - **Modal 35.A:** Laudo Notarial do Selo WORM de TLS Pinning com validação pericial HMAC-SHA256 em tempo real.
  - Suporte completo a **Light Mode** e **Dark Mode**.

### 54. Módulo de Avaliação Contínua de Postura de Dispositivo (Zero Trust Device Posture Assessment) para Terminais de Atendimento Clínico (NIST SP 800-207, OWASP MASVS & RFC-001 §4.4, §5.2)
- [x] **Core Criptográfico & Motor de Avaliação Zero Trust (`packages/crypto/src/devicePostureGuard.ts`):**
  - **Serialização Canônica Determinística JCS (RFC 8785):** Normalização e digest SHA-256 para telemetria de integridade.
  - **Heurística de Detecção de Violações Multivetoriais:** 9 categorias de ameaça (`ROOT_OR_JAILBREAK`, `DEBUGGER_ATTACHED`, `RUNTIME_HOOK_DETECTED`, `EMULATOR_DETECTED`, `DISK_UNENCRYPTED`, `SCREEN_LOCK_DISABLED`, `DEVTOOLS_OPEN_IN_PROD`, `SYSTEM_CLOCK_SKEWED`, `OUTDATED_OS_VERSION`).
  - **Cálculo de Trust Score Ponderado (0-100) e Enquadramento em Tiers:** `DeviceTrustTier` (`TRUSTED`, `MONITORED`, `RISKY`, `UNTRUSTED_BLOCKED`).
  - **Motor de Decisão Automatizada Zero Trust:** `DevicePostureDecision` (`ALLOWED`, `RESTRICTED_READ_ONLY`, `STEP_UP_REQUIRED`, `BLOCKED_QUARANTINED`) condicionado à política ativa.
  - **Emissão e Verificação Notarial WORM:** Geração de selos probatórios `posture_proof_v1_<base64url>` com HMAC-SHA256 e conferência matemática independente contra adulteração retroativa.
  - **Presets de Pentest Clínico:** 5 cenários para auditoria (`CLINICAL_TRUSTED_MAC`, `JAILBROKEN_IPHONE`, `DEBUGGED_DEV_STATION`, `UNENCRYPTED_WINDOWS_TERMINAL`, `EMULATOR_OUTDATED_ANDROID`).
  - Suíte com 23 testes unitários aprovados em `packages/crypto/test/devicePostureGuard.test.ts`.
- [x] **Contratos Compartilhados, Modelos & DTOs (`packages/shared`):**
  - **Enums e Ações WORM:** `AuditResourceType.DEVICE_POSTURE_ENGINE`, ações (`DEVICE_POSTURE_ASSESSED`, `DEVICE_POSTURE_VIOLATION_BLOCKED`, `DEVICE_QUARANTINED`, `DEVICE_QUARANTINE_RELEASED`, `DEVICE_POSTURE_POLICY_UPDATED`, `DEVICE_POSTURE_SEAL_VERIFIED`), `DeviceTrustTier`, `DevicePlatform`, `DeviceViolationCategory`, `DevicePostureEnforcementPolicy`, `DevicePostureDecision`.
  - **Modelos e DTOs:** Interfaces `DevicePostureTelemetry`, `DevicePostureViolation`, `DevicePostureProofSeal`, `DevicePostureAssessmentResult`, `DevicePostureRecord`, `DevicePostureMetrics`, `DevicePostureOverview` e DTOs `AssessDevicePostureDTO`, `QuarantineDeviceDTO`, `ReleaseDeviceQuarantineDTO`, `UpdatePosturePolicyDTO`, `VerifyDevicePostureSealDTO`, `DevicePostureOverviewResponse`.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - **DevicePostureService (`apps/backend/src/services/devicePostureService.ts`):** Gestão em memória do inventário de dispositivos clínicos, quarentena de emergência pelo DPO, controle dinâmico de políticas Zero Trust e registro compulsório na trilha WORM inalterável via `AuditService.log`.
  - **Rotas REST (`apps/backend/src/routes/devicePosture.ts`):**
    - `GET /api/device-posture/overview`: Visão geral com métricas, dispositivos cadastrados, violações e política ativa.
    - `POST /api/device-posture/assess`: Avaliação contínua de telemetria com selagem WORM imediata.
    - `POST /api/device-posture/quarantine`: Quarentena de emergência de dispositivo clínico violado.
    - `POST /api/device-posture/release-quarantine`: Liberação de quarentena com parecer técnico do DPO.
    - `POST /api/device-posture/update-policy`: Atualização dinâmica da política Zero Trust.
    - `POST /api/device-posture/verify-seal`: Validação pericial independente da fé pública do selo WORM.
  - Suíte com 11 testes de integração aprovados em `apps/backend/test/devicePosture.test.ts`.
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Métodos de API (`api.ts`):** `getDevicePostureOverview`, `assessDevicePosture`, `quarantineDevice`, `releaseDeviceQuarantine`, `updateDevicePosturePolicy`, `verifyDevicePostureSeal`.
  - **Módulo de Segurança (`SecurityModule.tsx`):**
    - **Card 36** (*Avaliação Contínua de Postura de Dispositivo Zero Trust*) com 5 KPIs regulatórios (Dispositivos Homologados, Terminais Confiáveis, Terminais Monitorados/Risco, Quarentenas Ativas, Selos Emitidos).
    - **Abas Especializadas:**
      - Aba 1: *Simulador Pentest & Avaliação ao Vivo*: Seleção de presets ou parâmetros manuais, envio de telemetria e exibição de decisão e laudo.
      - Aba 2: *Inventário de Terminais & Quarentena*: Tabela de terminais com status, score, botão de quarentena ou liberação pericial.
      - Aba 3: *Políticas de Acesso Zero Trust*: Seletor interativo da postura operacional (`STRICT_BLOCK`, `STEP_UP_AUTH`, `READ_ONLY_DEGRADATION`, `AUDIT_ONLY_MONITOR`).
    - **Tabela Auditada de Histórico de Avaliações Recentes:** Registro contínuo com botão para visualização do laudo probatório.
    - **Modal 36.A:** Laudo Pericial de Postura de Dispositivo com checklist de violações, metadados do selo WORM e validação HMAC-SHA256 em tempo real.
  - Suporte completo a **Light Mode** e **Dark Mode**.

### 55. Módulo de Criptografia Pós-Quântica Híbrida (PQC Kyber/ML-KEM & Dilithium/ML-DSA) para Telemedicina e Prontuários Clínicos (NIST FIPS 203 & FIPS 204, RFC-001 §3.4, §4.2, §4.4, §5.2)
- [x] **Core Criptográfico & Motor PQC Híbrido (`packages/crypto/src/pqcHybridCrypto.ts`):**
  - **Primitivas de Reticulados Modulares (Lattice-based Cryptography):** Emulação rigorosa e determinística de anéis ciclotômicos $R_q = \mathbb{Z}_q[X]/(X^{256}+1)$, matrizes polinomiais e amostragem de ruído gaussiano centrado em zero para ML-KEM ($q=3329$) e ML-DSA ($q=8380417$).
  - **KEM Híbrido (Key Encapsulation Mechanism - NIST FIPS 203):** ML-KEM-768 / Kyber-768 (NIST Categoria 3, 192-bit) e ML-KEM-1024 / Kyber-1024 (NIST Categoria 5, 256-bit) combinados com troca de chaves clássica ECDH curva NIST P-256 (prime256v1).
  - **KDF Combinada HKDF-SHA256:** Derivação segura da DEK AES-256-GCM combinando $(SS_{classical} \parallel SS_{pq})$ com separação de contexto (`TerapiaInFoco-PQC-Hybrid-KDF-v1`).
  - **Assinatura Dual Pós-Quântica (DSA - NIST FIPS 204):** Assinatura simultânea com validação nacional DOC-ICP-15 (ECDSA P-256) e resistência quântica baseada em reticulados (ML-DSA-65 / Dilithium-3).
  - **Cifragem de Envelope de Prontuários e Mídia:** Proteção de evolução SOAP, transcrições de teleconsulta e termos TCLE com envelope quântico e selagem WORM.
  - **Simulador de Pentest de Computação Quântica:** Simulação de quebra de logaritmo discreto pelo Algoritmo de Shor, ataques *Store Now, Decrypt Later* (SNDL), falsificação de assinaturas clássicas e aceleração quadrática de Grover.
  - **Emissão e Verificação de Selos Notariais WORM:** Tokens probatórios `pqc_proof_v1_<base64url>` com digest canônico JCS (RFC 8785) e assinatura HMAC-SHA256 inalterável.
  - Suíte com 12 testes unitários aprovados em `packages/crypto/test/pqcHybridCrypto.test.ts`.
- [x] **Contratos Compartilhados, Modelos & DTOs (`packages/shared`):**
  - **Enums e Ações WORM:** `AuditResourceType.PQC_CRYPTO_ENGINE`, 7 ações (`PQC_KEYPAIR_GENERATED`, `PQC_HYBRID_ENCAPSULATED`, `PQC_HYBRID_DECAPSULATED`, `PQC_HYBRID_SIGNED`, `PQC_HYBRID_SIGNATURE_VERIFIED`, `PQC_QUANTUM_ATTACK_SIMULATED`, `PQC_SEAL_VERIFIED`), `PqcKemScheme`, `PqcDsaScheme`, `PqcHybridMode`, `PqcSecurityLevel`, `PqcClinicalTargetType`, `PqcQuantumAttackType`, `PqcDefenseOutcome`.
  - **Modelos e DTOs:** Interfaces `PqcPublicKeyBundle`, `PqcPrivateKeyBundle`, `PqcHybridKeyPair`, `PqcEncapsulationResult`, `PqcHybridSignatureResult`, `PqcSignatureVerificationResult`, `PqcProofSeal`, `PqcProtectedClinicalRecord`, `PqcQuantumAttackSimulationResult`, `PqcMetrics`, `PqcOverview` e 8 DTOs com respostas tipadas.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - **PqcHybridService (`apps/backend/src/services/pqcHybridService.ts`):** Enclave em memória gerenciando chaves ativas NIST Level 3 e 5, coorte de registros clínicos protegidos, simulações de pentest e gravação compulsória na trilha WORM via `AuditService.log`.
  - **Rotas REST (`apps/backend/src/routes/pqcHybrid.ts`):**
    - `GET /api/pqc-hybrid/overview`: Visão geral e inventário quântico.
    - `POST /api/pqc-hybrid/generate-keypair`: Emissão de novas chaves híbridas PQC.
    - `POST /api/pqc-hybrid/encapsulate`: Cifragem de envelope e selagem WORM.
    - `POST /api/pqc-hybrid/decapsulate`: Abertura e decifragem autorizada de prontuário.
    - `POST /api/pqc-hybrid/sign`: Emissão de assinatura dual híbrida.
    - `POST /api/pqc-hybrid/verify-signature`: Validação independente clássica e quântica.
    - `POST /api/pqc-hybrid/simulate-attack`: Pentest de computação quântica (Shor / SNDL).
    - `POST /api/pqc-hybrid/verify-seal`: Validação pericial forense de selos WORM.
  - Suíte com 10 testes de integração aprovados em `apps/backend/test/pqcHybrid.test.ts`.
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Métodos de API (`api.ts`):** 8 novos métodos implementados com tipagem forte.
  - **Módulo de Segurança (`SecurityModule.tsx`):**
    - **Card 37** (*Criptografia Pós-Quântica Híbrida - FIPS 203 & 204*) com 5 KPIs regulatórios.
    - **Abas Especializadas:**
      - Aba 1: *Envelope Híbrido Quântico & Cifragem*: Seleção de presets clínicos (Risco Suicida, Violência Doméstica, TEA, TCLE), formulário de proteção, exibição do envelope e decapsulamento/abertura em tempo real.
      - Aba 2: *Assinatura Dual Pós-Quântica*: Assinatura combinada DOC-ICP-15 + FIPS 204 ML-DSA e verificador pericial instantâneo.
      - Aba 3: *Simulador de Ataques Quânticos (Shor / SNDL)*: Pentest interativo contra registros clínicos com laudo técnico comparativo.
    - **Tabela Auditada de Prontuários e Gravações:** Histórico com status quântico, chaves KEM e atalho para Laudo WORM.
    - **Modal 37.A:** Laudo Pericial Timbrado de Criptografia Pós-Quântica com metadados ASN.1/JCS, hashes SHA-256 e validação pericial HMAC em tempo real.
---

### 56. Módulo de Assinatura Cega RSA/ECDSA (Blind Signatures / Chaumian Protocol) para Prescrições Digitais e Votações de Colegiado Ético Clínico Anônimas com Verificação de Fé Pública (LGPD Art. 13 & Resolução CFP nº 001/2009)
- [x] **Motor Criptográfico Chaumiano & Anti-Double-Spend (`packages/crypto/src/blindSignaturesCrypto.ts`):**
  - **Aritmética Modular de Alta Precisão (BigInt):** Implementação de exponenciação rápida modular (`modPow`), inversão modular por Algoritmo Euclidiano Estendido (`modInverse`) e geração de pares de chaves RSA coprimas determinísticas e seguras de 2048/4096 bits.
  - **Protocolo de Cegamento Chaumiano (David Chaum 1982 / RFC 9474):**
    - **Digest e Cegamento do Cliente:** $h = \text{FDH-SHA256}(m) \pmod N$; fator de cegamento aleatório secreto $r \in \mathbb{Z}_N^*$; mensagem cega $m' \equiv h \cdot r^e \pmod N$.
    - **Assinatura Cega da Autoridade:** $s' \equiv (m')^d \equiv (h \cdot r^e)^d \equiv h^d \cdot r \pmod N$ sem acesso ao conteúdo legível da cédula ou prescrição.
    - **Descegamento Algébrico pelo Cliente:** $s \equiv s' \cdot r^{-1} \equiv h^d \pmod N$, obtendo assinatura RSA válida da autoridade.
    - **Verificação Pública com Fé Pública:** Verificação universal $s^e \equiv h \pmod N$ sem expor identidade ou requisição original (Incondicionalmente Desvinculada / Information-Theoretic Unlinkability).
  - **Prevenção de Duplo Resgate (Anti-Double-Spending):** Nullifier determinístico $H(\text{token} \parallel s)$ impedindo voto duplo ou resgate duplicado de receitas/vouchers.
  - **Selo Probatório WORM HMAC-SHA256:** Geração de selo canônico JCS (RFC 8785) e verificação de não-adulteração.
- [x] **Contratos Compartilhados, Modelos & DTOs (`packages/shared`):**
  - **Enums e Ações WORM:** `AuditResourceType.BLIND_SIGNATURE_ENGINE`, 7 ações de auditoria (`BLIND_SIGNATURE_KEYPAIR_GENERATED`, `BLIND_SIGNATURE_BLINDED`, `BLIND_SIGNATURE_BLIND_SIGNED`, `BLIND_SIGNATURE_UNBLINDED`, `BLIND_SIGNATURE_TOKEN_REDEEMED`, `BLIND_SIGNATURE_VERIFIED`, `BLIND_SIGNATURE_DOUBLE_SPEND_BLOCKED`), `BlindSignatureScheme`, `BlindSignaturePurpose`, `BlindSignatureStatus`.
  - **Modelos e DTOs:** `BlindSignatureKeyPair`, `BlindSignatureBlindedMessage`, `BlindSignatureSignedResponse`, `BlindSignatureUnblindedToken`, `BlindSignatureRedemptionResult`, `BlindSignatureVerificationResult`, `BlindSignatureProofSeal`, `BlindSignatureOverview`, `BlindSignatureMetrics`, `BlindSignatureBallotItem` e DTOs tipados.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - **BlindSignaturesService (`apps/backend/src/services/blindSignaturesService.ts`):** Enclave de autoridade certificadora com cotas de emissão por CRP, coorte de cédulas éticas e vouchers psiquiátricos, registro de nullifiers e auditoria WORM.
  - **Rotas REST (`apps/backend/src/routes/blindSignatures.ts`):** 9 rotas sob `/api/blind-signatures` (`/overview`, `/generate-authority-key`, `/blind`, `/sign-blind`, `/unblind`, `/redeem-or-vote`, `/verify`, `/simulate-tamper`, `/verify-seal`).
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Módulo de Segurança (`SecurityModule.tsx`):** Card 38 com 5 KPIs e 3 abas interativas (*Votação de Colegiado Ético Anônima*, *Prescrição Digital / Voucher Psiquiátrico Desvinculado*, *Verificador Forense de Fé Pública & Anti-Double-Spend*).
  - **Modal 38.A:** Laudo Pericial Chaumiano com digest canônico, descegamento matemático e validação pericial WORM em tempo real.
---

### 57. Módulo de Proteção Criptográfica contra Ataques Side-Channel e Timing Attacks (Constant-Time Operations, Blinding & Cache Allocation Shield - NIST SP 800-38D & RFC §4.2, §4.4)
- [x] **Motor Criptográfico de Tempo Constante & Jitter Estocástico (`packages/crypto/src/sideChannelShield.ts`):**
  - **Primitivas de Comparação em Tempo Constante (Constant-Time Equality):** Implementação de comparação bitwise XOR sem branching condicional (`constantTimeCompare`), cópia atômica (`constantTimeBufferCopy`) e seleção condicional (`constantTimeSelect`), eliminando vazamentos de temporização em validações de Auth Tags AES-GCM, HMACs e senhas.
  - **Injeção de Jitter Estocástico Regulado (Gaussian Noise Jitter):** Adição de latência estocástica calibrada via Transformada de Box-Muller em endpoints de decifragem e autenticação, destruindo correlações estatísticas de tempo em ataques remotos de temporização.
  - **Pentest Estatístico Automatizado de Welch (Welch's t-test):** Módulo de análise estatística comparando 100 amostras com entradas corretas versus incorretas, calculando o $t$-score. Critério NIST: se $|t| < 4.5$, a operação é matematicamente indistinguível e imune a vazamentos microarquiteturais.
  - **Selo Probatório WORM HMAC-SHA256:** Geração de selo canônico JCS (RFC 8785) e verificação de não-adulteração de telemetria.
- [x] **Contratos Compartilhados, Modelos & DTOs (`packages/shared`):**
  - **Enums e Ações WORM:** `AuditResourceType.SIDE_CHANNEL_SHIELD`, 6 ações de auditoria (`SIDE_CHANNEL_DEFENSE_ASSESSED`, `CONSTANT_TIME_EXECUTION_VERIFIED`, `TIMING_LEAK_DETECTED`, `TIMING_JITTER_INJECTED`, `SIDE_CHANNEL_SEAL_VERIFIED`, `SIDE_CHANNEL_POLICY_UPDATED`), `SideChannelProtectionMode`, `SideChannelVulnerabilityLevel`, `SideChannelTargetOperation`.
  - **Modelos e DTOs:** `SideChannelInspectionResult`, `SideChannelBenchmarkReport`, `SideChannelMetrics`, `SideChannelOverview`, `SideChannelProofSeal` e DTOs de inspeção, pentest e configuração de políticas.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - **SideChannelService (`apps/backend/src/services/sideChannelService.ts`):** Enclave de inspeção contínua, telemetria de jitter, pentest de Welch $t$-test e registro na hash-chain WORM.
  - **Rotas REST (`apps/backend/src/routes/sideChannel.ts`):** 7 rotas sob `/api/side-channel` (`/overview`, `/inspect-operation`, `/run-welch-test`, `/calibrate-jitter`, `/update-policy`, `/simulate-timing-attack`, `/verify-seal`).
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Módulo de Segurança (`SecurityModule.tsx`):** Card 39 com 5 KPIs e 3 abas interativas (*Inspetor de Operações em Tempo Constante*, *Calibrador de Jitter Estocástico*, *Pentest Estatístico Welch t-test*).
  - **Modal 39.A:** Laudo Pericial Timbrado de Imunidade Side-Channel com análise estatística de Welch, intervalo de confiança e validação WORM em tempo real.
  - Suporte completo a **Light Mode** e **Dark Mode**.

---

---

### 58. Módulo de Proteção contra Ataques de Replay & Reutilização de Nonce/IV em Sessões WebRTC e Tokens Clínicos com Janela Deslizante e Bloom Filter (RFC 8446 TLS 1.3, RFC 9147 DTLS 1.3 & OWASP Top 10 API Security)
- [x] **Motor Anti-Replay & Validador de Janela Deslizante (`packages/crypto/src/antiReplayShield.ts`):**
  - **Validador de Janela Deslizante de 64/128 bits (Sliding Window Anti-Replay Bitmap):** Implementação conforme RFC 6479 / RFC 4303 (IPsec/DTLS) para verificação estrita de sequencialidade de pacotes com aritmética modular `BigInt`, aceitando pacotes dentro da janela tolerável de jitter de rede e rejeitando deterministicamente pacotes duplicados (`DUPLICATE_REPLAY_DETECTED`) ou com timestamp retroativo (`OUT_OF_WINDOW_EXPIRED`).
  - **Filtro Probabilístico de Bloom com Rotação Temporal (Time-Decaying Bloom Filter):** Estrutura de dados compacta de 2 gerações baseada no teorema de Kirsch-Mitzenmacher (duplo hashing via FNV-1a e Murmur3-like) com taxa de falso-positivo $P_{fp} < 0.001\%$, permitindo verificação ultrarrápida em memória ($O(1)$) de expiração de nonces e tokens de autorização DPoP/REST sem vazamento de memória.
  - **Detecção de Reutilização de IV (GCM Nonce-Reuse Detector):** Bloqueio incondicional caso o mesmo par $(KeyID, IV)$ seja reapresentado, prevenindo o ataque catastrófico de quebra de integridade de GHASH em AES-GCM (NIST SP 800-38D §8).
  - **Selo Probatório WORM HMAC-SHA256:** Emissão de prova forense de mitigação de replay com canonicalização determinística JCS (RFC 8785) e assinatura criptográfica `anti_replay_proof_v1_<base64url>`.
  - Suíte com 15 testes unitários rigorosos aprovados em `packages/crypto/test/antiReplayShield.test.ts`.
- [x] **Contratos Compartilhados, Modelos & DTOs (`packages/shared`):**
  - **Enums e Ações WORM:** `AuditResourceType.ANTI_REPLAY_SHIELD`, 6 ações de auditoria (`REPLAY_ATTACK_BLOCKED`, `NONCE_REUSE_DETECTED`, `SLIDING_WINDOW_EVALUATED`, `BLOOM_FILTER_ROTATED`, `ANTI_REPLAY_SEAL_VERIFIED`, `REPLAY_POLICY_UPDATED`), `ReplayDefenseMode` (`HYBRID_DEFENSE_WINDOW_PLUS_BLOOM`, `STRICT_SLIDING_WINDOW`, `BLOOM_FILTER_EXPIRING`, `MONITORING_ONLY`), `ReplayThreatSeverity`, `ReplayTargetProtocol`.
  - **Modelos e DTOs:** `ReplayVerificationResult`, `SlidingWindowStatus`, `BloomFilterMetrics`, `ReplayIncidentRecord`, `AntiReplayProofSeal`, `AntiReplayOverview` e DTOs tipados de verificação de nonce, simulação de replay e rotação de filtro.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - **AntiReplayService (`apps/backend/src/services/antiReplayService.ts`):** Enclave de proteção de nonces em memória com janela deslizante, filtro de Bloom rotativo, telemetria de ataques bloqueados e registro compulsório na hash-chain WORM inalterável via `AuditService.log`.
  - **Rotas REST (`apps/backend/src/routes/antiReplay.ts`):** 7 rotas sob `/api/anti-replay` (`/overview`, `/verify-nonce`, `/sliding-window-status`, `/rotate-bloom-filter`, `/update-policy`, `/simulate-replay-attack`, `/verify-seal`).
  - Suíte com 10 testes de integração aprovados em `apps/backend/test/antiReplay.test.ts`.
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Client de API (`api.ts`):** 7 métodos tipados para consulta e validação em tempo real.
  - **Módulo de Segurança (`SecurityModule.tsx`):**
    - **Card 40** com 5 KPIs regulatórios (Nonces Avaliados, Replays Bloqueados, IVs Reutilizados Prevenidos, Janelas Ativas, Modo de Operação) e 3 abas interativas (*Verificador de Nonce & Unicidade de IV*, *Telemetria da Janela Deslizante (RFC 6479) & Bitmap Gráfico*, *Filtro de Bloom Rotativo & Simulador de Replay / MITM*).
    - **Visualizador Gráfico de Bitmap 64-bit:** Mapeamento visual das 64 células de bits com indicação dinâmica de pacotes recebidos vs ausentes e cálculo de limites inferiores.
    - **Tabela de Auditoria de Incidentes:** Trilha forense com data/hora, protocolo alvo, severidade, ação tomada e botão de emissão de Laudo Pericial WORM.
    - **Modal 40.A:** Certidão Notarial Criptográfica de Defesa Anti-Replay com dados do evento, digest canônico JCS (RFC 8785), token WORM e botão de auditoria em tempo real.
  - Suporte completo a **Light Mode** e **Dark Mode**.

### 59. Módulo de Marcação D'água Esteganográfica Visual e Traçabilidade Forense Anti-Exfiltração de Tela em Sessões WebRTC e Prontuários Médicos (LGPD Art. 46, Resolução CFP nº 011/2018 e RFC-001 §3.2, §4.4)
- [x] **Motor Criptográfico de Esteganografia Visual & DCT/DWT Invisível (`packages/crypto/src/visualWatermarkShield.ts`):**
  - **Injeção de Marca d'Água Espectral Invisível em Quadros de Vídeo WebRTC (Spatial / Frequency Domain DCT Watermarking):** Algoritmo de dispersão de ruído imperceptível ao olho humano nos coeficientes de média frequência da Transformada Discreta de Cosseno (DCT), resistente a compressões de vídeo H.264/VP8/VP9 e capturas de tela parciais.
  - **Semente Esteganográfica Pseudorrandomica (CSPRNG Watermark Seed):** Derivação criptográfica baseada em `(TherapistCRP, PatientBlindIndex, SessionTimestamp, SessionSalt)` gerando matriz ortogonal única de rastreamento.
  - **Detector & Extrator Forense de Vazamento (Leak Tracer):** Algoritmo de correlação cruzada normalizada que detecta e extrai a identidade do usuário vazador mesmo a partir de printscreens recortados, fotografias de monitor ou vídeos recompactados.
  - **Selo Probatório WORM HMAC-SHA256:** Certidão de autoria de mídia e rastreabilidade forense com canonicalização JCS (RFC 8785).
- [x] **Contratos Compartilhados, Modelos & DTOs (`packages/shared`):**
  - **Enums e Ações WORM:** `AuditResourceType.VISUAL_WATERMARK_SHIELD`, ações `VISUAL_WATERMARK_EMBEDDED`, `LEAK_EXTRACTION_ATTEMPTED`, `LEAK_SOURCE_IDENTIFIED`, `WATERMARK_PROOF_VERIFIED`.
  - **Modelos e DTOs:** Interfaces de configuração espectral, laudo de correlação forense e DTOs tipados.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - **Serviço Central e Rotas REST (`/api/visual-watermark`):** Rastreamento de sessões, injeção de metadados invisíveis e verificação pericial de prints vazados.
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Card 41:** Painel de proteção contra exfiltração de tela com simulador forense de detecção de printscreens.
  - **Modal 41.A:** Laudo Pericial de Traçabilidade de Vazamento.
  - Suporte completo a **Light Mode** e **Dark Mode**.

---

### 60. Rastreabilidade & Proteção de Credenciais de Acesso Temporário / Links Efêmeros de Teleconsulta com HMAC-Time-Constrained Token e Auto-Revogação com Prova de Não-Repúdio (RFC 7519, RFC 7009 & LGPD Art. 46)
- [x] **Motor Criptográfico de Tokens Efêmeros e Auto-Revogação (`packages/crypto/src/ephemeralTokenEngine.ts`):**
  - **Emissão Criptográfica com HMAC-SHA256 e Restrição Temporal Estrita:** Tokens pontuais com payload mínimo cifrado, nonce anti-colisão, derivação de chave de sessão única e TTL milimétrico (5 a 120 minutos).
  - **Consumo Único & Auto-Revogação Imediata:** Invalidação atômica e irreversível do token no primeiro uso (One-Time Access), impedindo reutilização acidental ou intencional por terceiros.
  - **Revogação Pró-Ativa e Bloqueio de Emergência:** Capacidade do psicólogo titular revogar imediatamente links de atendimento caso detecte comportamento suspeito ou link compartilhado indevidamente.
  - **Selo Probatório WORM HMAC-SHA256 & RFC 8785:** Certidão imutável de emissão, consumo ou revogação forçada com hash-chain auditável.
- [x] **Contratos Compartilhados, Modelos & DTOs (`packages/shared`):**
  - Enums `EphemeralTokenStatus`, `EphemeralTokenTarget`, `RevocationReason` e ação WORM `EPHEMERAL_TOKEN_ISSUED`, `CONSUMED`, `REVOKED`, `SEAL_VERIFIED`.
  - Modelos `EphemeralAccessToken`, `EphemeralTokenProofSeal`, `EphemeralTokenOverview` e DTOs de criação, consumo e auditoria.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - `EphemeralTokenService` com armazenamento em memória, proteção contra replay, cotas e trilha WORM inalterável.
  - Rotas sob `/api/ephemeral-tokens` (`/overview`, `/issue`, `/consume`, `/revoke`, `/simulate-intrusion`, `/verify-seal`).
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Card 42:** Painel de Credenciais Temporárias & Links Efêmeros com KPIs, gerador dinâmico de links e simulador de intrusão.
  - **Modal 42.A:** Certidão Notarial Forense do Link Temporário com verificação WORM em tempo real.

---

### 61. Liberação Colegiada de Prontuários Sob Ordem Judicial com Threshold Cryptography & Shamir's Secret Sharing (t-of-n Multi-Party Computation - CFP nº 001/2009 Art. 9º, LGPD Art. 11 e RFC §4.2)
- [x] **Motor Criptográfico de Shamir's Secret Sharing no Corpo Finito $GF(256)$ (`packages/crypto/src/shamirSecretSharingEngine.ts`):**
  - **Aritmética Exata de Galois Field $GF(2^8)$:** Implementação com polinômio redutor irredutível $0x11b$ ($x^8 + x^4 + x^3 + x + 1$) e tabelas de logaritmo/exponencial com gerador $\alpha = 3$, garantindo soma/multiplicação/divisão em tempo constante $O(1)$.
  - **Divisão de Segredo em $n$ Cotas com Limiar $t$ ($t$-of-$n$ Scheme):** Geração de polinômio aleatório de grau $t-1$ onde $P(0) = \text{SecretByte}$ e avaliação em pontos $x \in \{1, \dots, n\}$.
  - **Reconstrução Colegiada via Interpolação de Lagrange:** Reconstrução exata do segredo em $x=0$ a partir de qualquer subconjunto arbitrário de $k \ge t$ cotas distintas; garantia de segurança teórica de informação (Information-Theoretic Security) para $k < t$.
  - **Envelopamento de Prontuário Clínico (AES-256-GCM + SSS):** Cifragem do prontuário com DEK de 256 bits e divisão da DEK em cotas distribuídas entre os custodiantes legais (Juiz da Vara, Presidente da Comissão de Ética do CRP, Psicólogo Titular, DPO Institucional, Ministério Público).
  - **Selo Probatório Notarial WORM RFC 8785:** Geração de certidão criptográfica canônica com prefixo `threshold_v1_<base64url>`.
  - Suíte com 12 testes unitários aprovados em `packages/crypto/test/shamirSecretSharingEngine.test.ts`.
- [x] **Contratos Compartilhados, Modelos & DTOs (`packages/shared`):**
  - Enums `CourtOrderVaultStatus`, `CustodianRole`, `ThresholdReconstructionVerdict`, `LegalJustificationType`.
  - Ações WORM `COURT_ORDER_VAULT_INITIALIZED`, `THRESHOLD_KEY_SPLIT`, `CUSTODIAN_SHARE_ISSUED`, `CUSTODIAN_SHARE_SUBMITTED`, `QUORUM_RECONSTRUCTION_SUCCESS`, `QUORUM_RECONSTRUCTION_FAILED`, `COURT_ORDER_RECORD_DECRYPTED`, `COURT_ORDER_VAULT_PURGED`, `THRESHOLD_PROOF_SEAL_VERIFIED`.
  - Modelos `ThresholdProofSeal`, `ShamirKeyShare`, `CourtOrderVault`, `ThresholdReconstructionResult`, `ThresholdVaultMetrics`, `ThresholdVaultOverview` e DTOs tipados.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - `CourtOrderThresholdService` singleton gerenciando cofres judiciais, cotas de custodiantes, quorum de liberação e registro compulsório na hash-chain WORM via `AuditService.log`.
  - 6 rotas REST sob `/api/court-order-threshold` (`/overview`, `/create-vault`, `/submit-share`, `/reconstruct-decrypt`, `/simulate-attack`, `/verify-seal`).
  - Suíte com 6 testes de integração aprovados em `apps/backend/test/courtOrderThreshold.test.ts`.
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Card 43:** Painel de Liberação Colegiada de Prontuários Judiciais com 5 KPIs, 3 abas interativas (*Cofre & Custodiantes Legais*, *Assembleia Colegiada & Reconstrução de Quorum*, *Simulador Adversarial de Sub-Quorum / Fraude*) e tabela WORM de processos.
  - **Modal 43.A:** Certidão Notarial Forense de Abertura Colegiada com validação do selo criptográfico WORM em tempo real.
  - Suporte completo a **Light Mode** e **Dark Mode**.

---

### 62. Detecção e Prevenção Ativa de Ataques de Poluição de Protótipo (Prototype Pollution) & Desserialização Insegura em Objetos Clínicos Dinâmicos (OWASP ASVS v4.0 V5.5, CWE-1321 & Node.js Security Best Practices)
- [x] **Motor Criptográfico e Sanitizador Seguro (`packages/crypto/src/prototypePollutionGuard.ts`):**
  - **Detecção de Chaves Perigosas & Anti-Mutation:** Interceptação em tempo de execução de chaves suscetíveis a poluição de protótipo: `__proto__`, `constructor`, `prototype`, `__defineGetter__`, `__defineSetter__`, `__lookupGetter__`, `__lookupSetter__`.
  - **Dicionários Limpos de Protótipo Nulo (`Object.create(null)`):** Normalização estrutural de objetos garantindo que instâncias intermediárias e finais não herdem `Object.prototype`, impossibilitando contaminação transversal de memória em Node.js/V8.
  - **Deep-Merge Seguro com Mitigação de DoS / Recursion Bombs:** Fusão recursiva profunda de grafos de objetos clínicos com rastreamento de referências circulares via `WeakSet`, limite de profundidade configurável (`maxDepth`) e congelamento recursivo (`Object.freeze`).
  - **Filtro contra Desserialização Insegura / RCE:** Inspeção heurística de strings de injeção de gadgets (`_$$ND_FUNC$$_`, `eval(`, `Function(`, `child_process`, `exec(`, `spawn(`, etc.) bloqueando execução remota de código via JSON malformado.
  - **Selo Probatório Notarial WORM RFC 8785:** Geração de certidão probatória canônica JCS com prefixo `proto_guard_v1_<base64url>` atestando sanitização segura e integridade de objetos clínicos.
  - Suíte com 14 testes unitários aprovados em `packages/crypto/test/prototypePollutionGuard.test.ts`.
- [x] **Contratos Compartilhados, Modelos & DTOs (`packages/shared`):**
  - Enums `PollutionThreatSeverity`, `PollutionAttackVector`, `SanitizationStrategy`, `PayloadCategory`.
  - Ações WORM `PROTOTYPE_POLLUTION_ATTEMPT_BLOCKED`, `INSECURE_DESERIALIZATION_BLOCKED`, `SAFE_OBJECT_NORMALIZED`, `POLLUTION_GUARD_POLICY_UPDATED`, `PROTOTYPE_GUARD_SEAL_VERIFIED`.
  - Modelos `PollutionThreat`, `PollutionProofSeal`, `PollutionScanResult`, `PollutionGuardPolicy`, `PollutionGuardMetrics`, `PollutionSecurityIncident`, `PollutionGuardOverview` e DTOs tipados.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - `PrototypePollutionService` singleton com quarentena de payloads, telemetria em tempo real, simulação de vetores adversariais e auditoria WORM contínua via `AuditService.log`.
  - 5 rotas REST sob `/api/prototype-pollution` (`/overview`, `/scan-payload`, `/update-policy`, `/simulate-attack`, `/verify-seal`).
  - Suíte com 7 testes de integração aprovados em `apps/backend/test/prototypePollution.test.ts`.
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Card 44:** Painel de Blindagem contra Prototype Pollution & Desserialização Insegura com 5 KPIs, 3 abas interativas (*Scanner & Normalizador Seguro*, *Simulador Adversarial CWE-1321*, *Políticas de Quarentena & Hardening*) e tabela WORM de incidentes bloqueados.
  - **Modal 44.A:** Certidão Notarial Forense de Varredura WORM com validação do selo criptográfico em tempo real.
---

### 63. Proteção contra Ataques de Poluição de Cache HTTP (Web Cache Poisoning & Cache Deception) em Recursos Clínicos com Normalização de Chave e Assinatura de Cache (RFC 7234, RFC 9111 & OWASP ASVS v4.0)
- [x] **Motor Criptográfico e Sanitizador Seguro (`packages/crypto/src/webCacheGuard.ts`):**
  - **Normalização Canônica de Cache Key (RFC 7234 & RFC 9111):** Resolução determinística de dot-segments (`../`, `./`), normalização de múltiplos slashes (`//`), remoção de semicolons de path-confusion e ordenação alfabética estrita de parâmetros de query string.
  - **Keyed Headers Hashing:** Incorporação controlada de cabeçalhos sensíveis de negociação (`Authorization`, `Accept`, `Accept-Language`, `Host`) no hash canônico da Cache Key, prevenindo contaminação cruzada entre representações.
  - **Mitigação Ativa de Web Cache Poisoning:** Detecção e stripping de cabeçalhos não-chaveados malévolos (`X-Forwarded-Host`, `X-Forwarded-Proto`, `X-Forwarded-Prefix`, `X-Original-URL`, `X-Rewrite-URL`, `X-Host`), injeções de CRLF / Split-Request nos cabeçalhos, requisições Fat-GET e `X-HTTP-Method-Override`.
  - **Blindagem contra Web Cache Deception:** Verificação e bloqueio de sufixos estáticos (`.css`, `.js`, `.png`, `.jpg`, `.ico`, `.woff2`) acoplados maliciosamente a rotas dinâmicas de prontuários clínicos privados (`/api/patients/`, `/api/soap-notes/`), impedindo armazenamento em caches/CDNs públicos intermediários.
  - **Imposição Compulsória de NO-STORE:** Geração automática de cabeçalhos anti-caching estritos (`Cache-Control: no-store, no-cache, must-revalidate, private, max-age=0, s-maxage=0`, `Pragma: no-cache`, `Expires: 0`, `Vary: Authorization, Accept, Accept-Encoding, Cookie`) para dados clínicos confidenciais ou requisições sob ameaça.
  - **Selo Probatório Notarial WORM RFC 8785:** Geração de certidão criptográfica JCS com prefixo `cache_guard_v1_<base64url>` assinada via HMAC-SHA256 atestando integridade e diretiva de cache.
  - Suíte com 17 testes unitários aprovados em `packages/crypto/test/webCacheGuard.test.ts`.
- [x] **Contratos Compartilhados, Modelos & DTOs (`packages/shared`):**
  - Enums `CacheThreatType`, `CacheThreatSeverity`, `CacheDirectiveAction`, `ResourceSensitivityLevel`.
  - Ações WORM `CACHE_POISONING_ATTEMPT_BLOCKED`, `CACHE_DECEPTION_ATTEMPT_BLOCKED`, `CANONICAL_CACHE_KEY_GENERATED`, `CACHE_GUARD_POLICY_UPDATED`, `CACHE_GUARD_SEAL_VERIFIED`.
  - Modelos `CacheKeyCanonicalComponents`, `CacheThreatDetection`, `CacheProofSeal`, `CacheInspectionResult`, `CacheGuardPolicy`, `CacheGuardMetrics`, `CacheSecurityIncident`, `CacheGuardOverview` e DTOs tipados.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - `WebCacheGuardService` singleton com telemetria contínua, histórico forense de incidentes, simulação de vetores de envenenamento e auditoria WORM mandatória via `AuditService.log`.
  - 5 rotas REST sob `/api/cache-guard` (`/overview`, `/inspect`, `/policy`, `/simulate`, `/verify-seal`).
  - Suíte com 7 testes de integração aprovados em `apps/backend/test/webCacheGuard.test.ts`.
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Card 45:** Painel de Blindagem contra Web Cache Poisoning & Cache Deception com 5 KPIs, 4 abas interativas (*Inspetor & Normalizador de Cache Key*, *Simulador Adversarial de Cache*, *Políticas de Cache & Sanitização*, *Rotas Protegidas*) e tabela WORM de incidentes bloqueados.
  - **Modal 45.A:** Certidão Notarial Forense de Integridade de Cache WORM com validação do selo criptográfico em tempo real.
  - Suporte completo a **Light Mode** e **Dark Mode**.

---

### 64. Detecção e Prevenção Ativa de Injeção de Entidades Externas XML (XXE) & Expansão de Entidades (Billion Laughs / XML Bomb) em Intercâmbios de Saúde Mental (CWE-611, CWE-776 & HL7/FHIR)
- [x] **Motor Criptográfico e Sanitizador Seguro (`packages/crypto/src/xxeGuard.ts`):**
  - **Detecção Rigorosa de DTDs e Declarações Maliciosas:** Bloqueio preemptivo de declarações `<!DOCTYPE`, `<!ENTITY`, `SYSTEM` e `PUBLIC`.
  - **Prevenção de XML Entity Expansion / Recursion Bombs:** Proteção matemática contra ataques do tipo Billion Laughs e Quadratic Blowup com contadores estritos de entidades expandidas.
  - **Mitigação de SSRF via XML Schemas:** Varredura léxica impedindo esquemas de URI perigosos (`file://`, `http://`, `https://`, `ftp://`, `gopher://`, `php://`, `expect://`).
  - **Selo Probatório Notarial WORM RFC 8785:** Geração de certidão criptográfica canônica JCS com prefixo `xxe_guard_v1_<base64url>` assinada via HMAC-SHA256 atestando sanitização segura.
  - Suíte com 14 testes unitários aprovados em `packages/crypto/test/xxeGuard.test.ts`.
- [x] **Contratos Compartilhados, Modelos & DTOs (`packages/shared`):**
  - Enums `XxeThreatSeverity`, `XxeThreatType`, `XxeSanitizationAction`, `XmlPayloadType`.
  - Ações WORM `XXE_ATTEMPT_BLOCKED`, `XML_BOMB_BLOCKED`, `SAFE_XML_SANITIZED`, `XXE_GUARD_POLICY_UPDATED`, `XXE_GUARD_SEAL_VERIFIED`.
  - Modelos `XxeThreat`, `XxeProofSeal`, `XxeScanResult`, `XxeGuardPolicy`, `XxeGuardMetrics`, `XxeSecurityIncident`, `XxeGuardOverview` e DTOs tipados.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - `XxeGuardService` singleton com telemetria contínua, histórico forense de incidentes, simulação de vetores de injeção XML e auditoria WORM mandatória via `AuditService.log`.
  - 5 rotas REST sob `/api/xxe-guard` (`/overview`, `/scan`, `/policy`, `/simulate`, `/verify-seal`).
  - Suíte com 8 testes de integração aprovados em `apps/backend/test/xxeGuard.test.ts`.
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Card 46:** Painel de Blindagem contra XXE & XML Bombs com 5 KPIs, 3 abas interativas (*Scanner & Sanitizador XML*, *Simulador Adversarial CWE-611/776*, *Políticas de Hardening & Incidentes*) e tabela WORM de incidentes bloqueados.
  - **Modal 46.A:** Certidão Notarial Forense de Integridade XML WORM com validação do selo criptográfico em tempo real.
  - Suporte completo a **Light Mode** e **Dark Mode**.

---

### 65. Blindagem contra Fixação & Sequestro de Sessão com Rotação Criptográfica Obrigatória Pós-Autenticação e Dynamic TLS/Network Context Binding (OWASP ASVS v4.0 V3.3, CWE-384, CWE-287 & NIST SP 800-63B)
- [x] **Motor Criptográfico e Binding Dinâmico (`packages/crypto/src/sessionFixationGuard.ts`):**
  - **Rotação Criptográfica Obrigatória Pós-Autenticação (CWE-384):** Destruição atômica de tokens pré-autenticação e emissão de nova sessão criptográfica com entropia de 256 bits gerada via CSPRNG.
  - **Binding Dinâmico Multidimensão de Contexto de Rede & TLS (OWASP ASVS V3.3):** Vinculação criptográfica contínua da sessão ao IP de origem, ASN, Fingerprint TLS/JA3/JA4 e cabeçalhos de integridade.
  - **Detecção Heurística de Hijacking & Deslocamento Geográfico Impossível:** Análise de discrepâncias anômalas de rede entre requisições consecutivas, disparando revogação forçada de sessão.
  - **Selo Probatório Notarial WORM RFC 8785:** Geração de certidão criptográfica canônica JCS com prefixo `session_guard_v1_<base64url>` atestando validação e rotação de sessão.
  - Suíte com 14 testes unitários aprovados em `packages/crypto/test/sessionFixationGuard.test.ts`.
- [x] **Contratos Compartilhados, Modelos & DTOs (`packages/shared`):**
  - Enums `SessionRiskSeverity`, `SessionThreatVector`, `SessionEnforcementAction`, `SessionLifecycleStage`.
  - Ações WORM `SESSION_ROTATED_POST_AUTH`, `SESSION_HIJACK_ATTEMPT_BLOCKED`, `SESSION_CONTEXT_MISMATCH_TERMINATED`, `SESSION_GUARD_POLICY_UPDATED`, `SESSION_GUARD_SEAL_VERIFIED`.
  - Modelos `SessionContextFingerprint`, `SessionValidationResult`, `SessionProofSeal`, `SessionGuardPolicy`, `SessionGuardMetrics`, `SessionSecurityIncident`, `SessionGuardOverview` e DTOs tipados.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - `SessionFixationGuardService` singleton com telemetria contínua, histórico forense de incidentes, simulação de vetores de fixação/sequestro e auditoria WORM mandatória via `AuditService.log`.
  - 6 rotas REST sob `/api/session-guard` (`/overview`, `/rotate`, `/validate`, `/policy`, `/simulate`, `/verify-seal`).
  - Suíte com 8 testes de integração aprovados em `apps/backend/test/sessionFixationGuard.test.ts`.
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Card 47:** Painel de Blindagem contra Fixação & Sequestro de Sessão com 5 KPIs, 3 abas interativas (*Monitor & Validador de Sessão*, *Simulador de Sequestro/Fixação*, *Políticas de Context Binding & Incidentes*) e tabela WORM de incidentes bloqueados.
  - **Modal 47.A:** Certidão Notarial Forense de Validação de Sessão WORM com validação do selo criptográfico em tempo real.
  - Suporte completo a **Light Mode** e **Dark Mode**.

---

### 66. Detecção e Prevenção Ativa de Negação de Serviço por Expressões Regulares (ReDoS) com Validador Léxico AST, Timeout Não-Bloqueante e Sanitização de Regex Clínico (OWASP ASVS v4.0 V5.5 & CWE-1333)
- [x] **Motor Criptográfico e Safe Regex Engine (`packages/crypto/src/redosGuard.ts`):**
  - **Análise Léxica & AST de Expressões Regulares:** Detecção estática de quantificadores aninhados suscetíveis a backtracking catastrófico ($O(2^n)$ e $O(n^k)$), repetições sobrepostas e grupos ambíguos.
  - **Execução Sandboxed com Timeout Não-Bloqueante:** Avaliação protegida de expressões contra inputs arbitrários com isolamento temporal estrito em microssegundos.
  - **Sanitização Proativa & Sugestão de Padrões Seguros:** Conversão automática de regex vulneráveis para alternativas determinísticas equivalentes ($O(n)$) e presets clínicos certificados (CFP 001/2009, CPF, CID-11, Telefone, E-mail).
  - **Selo Probatório Notarial WORM RFC 8785:** Geração de certidão criptográfica canônica JCS com prefixo `redos_guard_v1_<base64url>` atestando validação e segurança assintótica.
  - Suíte com 15 testes unitários aprovados em `packages/crypto/test/redosGuard.test.ts`.
- [x] **Contratos Compartilhados, Modelos & DTOs (`packages/shared`):**
  - Enums `RegexVulnerabilitySeverity`, `BacktrackingComplexity`, `RegexSanitizationAction`, `ClinicalRegexCategory`.
  - Ações WORM `REDOS_PATTERN_BLOCKED`, `REDOS_INPUT_EVALUATION_TIMEOUT`, `SAFE_REGEX_COMPILED`, `REDOS_GUARD_POLICY_UPDATED`, `REDOS_GUARD_SEAL_VERIFIED`.
  - Modelos `RegexVulnerabilityPattern`, `RegexEvaluationResult`, `RedosProofSeal`, `RedosGuardPolicy`, `RedosGuardMetrics`, `RedosSecurityIncident`, `RedosGuardOverview` e DTOs tipados.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - `RedosGuardService` singleton com telemetria contínua, histórico forense de incidentes, simulação de vetores de ReDoS e auditoria WORM mandatória via `AuditService.log`.
  - 6 rotas REST sob `/api/redos-guard` (`/overview`, `/inspect`, `/evaluate`, `/policy`, `/simulate`, `/verify-seal`).
  - Suíte com 8 testes de integração aprovados em `apps/backend/test/redosGuard.test.ts`.
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Card 48:** Painel de Blindagem contra ReDoS com 5 KPIs, 3 abas interativas (*Inspetor Léxico AST & Validador*, *Simulador de Backtracking Catastrófico*, *Políticas de Sanitização & Incidentes*) e tabela WORM de incidentes bloqueados.
  - **Modal 48.A:** Certidão Notarial Forense de Avaliação ReDoS WORM com validação do selo criptográfico em tempo real.
  - Suporte completo a **Light Mode** e **Dark Mode**.

---

### 67. Blindagem Criptográfica contra Injeção de Templates no Lado do Servidor (SSTI) e Execução Remota em Laudos, Pareceres e Relatórios Psicológicos Multiformato (OWASP ASVS v4.0 V5.2, CWE-1336, CFP nº 006/2019 & Secure Sandboxed Template Engine)
- [x] **Motor Criptográfico e Sandboxed Template Engine (`packages/crypto/src/sstiGuard.ts`):**
  - **Análise Estática Léxica AST de Templates Clínicos:** Detecção precoce de vetores de injeção de template, tais como: acesso a protótipo (`__proto__`, `constructor`, `prototype`), globais de runtime (`process`, `global`, `window`, `require`, `import`), tentativas de avaliação dinâmica (`eval`, `Function`, `setTimeout`, `setInterval`) e delimitadores anômalos de engines vulneráveis (`{{ ... }}`, `${ ... }`, `<%= ... %>`, `#{ ... }`, `*{ ... }`).
  - **Mecanismo de Renderização Hermético e Sandboxed:** Interpolação léxica segura onde os identificadores permitidos são estritamente delimitados por listas de variáveis declaradas, e a renderização opera sobre um escopo congelado construído com `Object.create(null)` e suporte a escape HTML contextual (`escapeHtml`), impossibilitando fuga de escopo ou execução remota de código (RCE).
  - **Templates Clínicos Certificados (Resolução CFP nº 006/2019):** Presets auditados de Atestado Psicológico, Declaração Psicológica, Relatório Psicológico, Laudo Pericial, Parecer Técnico e Termo de Consentimento Livre e Esclarecido (TCLE) com validação sintática compulsória.
  - **Selo Probatório Notarial WORM RFC 8785:** Geração de certidão criptográfica canônica JCS com prefixo `ssti_guard_v1_<base64url>` assinada via HMAC-SHA256 atestando sanitização segura e conformidade de template.
  - Suíte com 15 testes unitários aprovados em `packages/crypto/test/sstiGuard.test.ts`.
- [x] **Contratos Compartilhados, Modelos & DTOs (`packages/shared`):**
  - Enums `TemplateRiskSeverity`, `SstiThreatVector`, `SstiSanitizationAction`, `ClinicalDocumentTemplateType`.
  - Ações WORM `SSTI_ATTEMPT_BLOCKED`, `SSTI_TEMPLATE_SANITIZED`, `SSTI_SANDBOX_RENDER_SUCCESS`, `SSTI_POLICY_UPDATED`, `SSTI_SEAL_VERIFIED`.
  - Modelos `SstiThreat`, `SstiProofSeal`, `TemplateInspectionResult`, `SandboxedRenderResult`, `SstiGuardPolicy`, `SstiGuardMetrics`, `SstiSecurityIncident`, `SstiGuardOverview` e DTOs tipados.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - `SstiGuardService` singleton com telemetria contínua, histórico forense de incidentes, simulação de vetores de injeção de templates e auditoria WORM mandatória via `AuditService.log`.
  - 6 rotas REST sob `/api/ssti-guard` (`/overview`, `/inspect`, `/render`, `/policy`, `/simulate`, `/verify-seal`).
  - Atualização do `wafMiddleware.ts` para isenção da rota `/api/ssti-guard` de bloqueio de borda durante testes de simulação.
  - Suíte com 8 testes de integração aprovados em `apps/backend/test/sstiGuard.test.ts`.
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Card 49:** Painel de Blindagem contra SSTI em Laudos Psicológicos (OWASP ASVS V5.2 & CFP nº 006/2019) com 5 KPIs, 4 abas interativas (*Editor & Sandbox Seguro*, *Modelos Oficiais CFP nº 006/2019*, *Simulador Adversarial de SSTI*, *Políticas de Sandboxing & Incidentes*) e tabela WORM de incidentes bloqueados.
  - **Modal 49.A:** Certidão Notarial Forense de Avaliação SSTI WORM (RFC 8785) com fé pública e validação instantânea.
  - Suporte completo a **Light Mode** e **Dark Mode**.


### 68. Detecção e Prevenção Ativa de Injeção de Comandos de Sistema Operacional (OS Command Injection) em Conversores de PDF e Renderizadores de Laudos com Argument Whitelisting e Enclave Sandboxed (CWE-78, CWE-88 & OWASP ASVS v4.0 V5.3)
- [x] **Motor Criptográfico e Enclave Sandboxed (`packages/crypto/src/osCommandGuard.ts`):**
  - **Inspeção Léxica Rigorosa & Sanitização Segura:** Análise de executáveis e listas de argumentos contra metacaracteres de shell (`;`, `|`, `&`, `$`, '`', `$(...)`, `>`, `<`), flags perigosas de renderizadores (`--eval`, `--exec`, `--shell-escape`, `-shell-escape`, `--run-script`), manipulação de variáveis de ambiente (`LD_PRELOAD`, `PATH`, `PYTHONPATH`) e path traversal (`/etc/passwd`, `../../`).
  - **Mecanismo de Execução Hermético Sandboxed:** Isolamento de processos sem shell (`shell: false`), variáveis de ambiente restritas e sanitizadas, código de saída de segurança determinístico (126 em tentativa bloqueada) e tempo de execução estritamente controlado.
  - **Pipelines de Conversores Clínicos Homologados (CFP nº 006/2019):** Presets auditados para Laudo Pericial Psicológico, Atestado Psicológico Digital, Prontuário PAdES para Arquivamento, Relatório de Anamnese Biopsicossocial e Fusão de Páginas com Marca d'Água.
  - **Selo Probatório Notarial WORM RFC 8785:** Geração de certidão criptográfica canônica JCS com prefixo `os_cmd_seal_v1_<base64url>` assinada via HMAC-SHA256 atestando integridade da execução sandboxed e não-repúdio.
  - Suíte com 13 testes unitários aprovados em `packages/crypto/test/osCommandGuard.test.ts`.
- [x] **Contratos Compartilhados, Modelos & DTOs (`packages/shared`):**
  - Enums `CommandRiskSeverity`, `CommandThreatVector`, `CommandExecutionPolicyAction`, `ClinicalConverterJobType`, `IncidentSeverity`.
  - Ações WORM `OS_COMMAND_ATTEMPT_BLOCKED`, `COMMAND_ARGUMENTS_SANITIZED`, `SANDBOX_PROCESS_EXECUTED`, `COMMAND_GUARD_POLICY_UPDATED`, `COMMAND_GUARD_SEAL_VERIFIED`.
  - Modelos `CommandThreat`, `CommandProofSeal`, `CommandInspectionResult`, `SandboxedExecutionResult`, `CommandGuardPolicy`, `ClinicalConverterPipeline`, `CommandGuardMetrics`, `CommandSecurityIncident`, `CommandGuardOverview` e DTOs tipados.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - `OsCommandGuardService` singleton com telemetria contínua, histórico forense de incidentes, simulação de vetores de ataque CWE-78/CWE-88 e auditoria WORM mandatória via `AuditService.log`.
  - 6 rotas REST sob `/api/os-command-guard` (`/overview`, `/inspect`, `/execute`, `/policy`, `/simulate`, `/verify-seal`).
  - Atualização do `wafMiddleware.ts` para isenção da rota `/api/os-command-guard` de bloqueio precoce durante testes e simulações.
  - Suíte com 9 testes de integração aprovados em `apps/backend/test/osCommandGuard.test.ts`.
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Card 50:** Painel de Blindagem contra Injeção de Comandos de SO em Conversores de PDF e Laudos com 5 KPIs dinâmicos, 4 abas operacionais (*Inspetor & Enclave Sandboxed*, *Pipelines Clínicos Homologados*, *Simulador Adversarial CWE-78*, *Políticas de Sandboxing & Incidentes*) e tabela WORM de incidentes bloqueados.
  - **Modal 50.A:** Certidão Notarial Forense WORM de Execução de Comandos (RFC 8785) com validação criptográfica instantânea.
  - Suporte completo a **Light Mode** e **Dark Mode**.

### 69. Sanitização e Validação Estrita de Caminhos de Arquivos e Prevenção de Path Traversal / Local File Inclusion (LFI) em Uploads e Anexos de Prontuários (CWE-22, CWE-23, CWE-73 & OWASP ASVS v4.0 V5.5)
- [x] **Motor Criptográfico e Sanitizador Seguro (`packages/crypto/src/pathTraversalGuard.ts`):**
  - **Canonicalização e Resolução de Caminhos:** Decodificação recursiva contra evasão por multi-layer percent-encoding (`%252e%252e`), normalização determinística de separadores de caminho (`\` para `/`), detecção de Unicode lookalikes, remoção e bloqueio de bytes nulos (`\0`, `%00`), detecção de esquemas de URI maliciosos (`file://`, `data://`, `php://`, etc.) e detecção de Alternate Data Streams no NTFS do Windows (`::$DATA`).
  - **Confinamento em Jail Chroot Seguro:** Resolução léxica determinística sem acesso a disco e validação compulsória de prefixo (`resolvedPath.startsWith(jailRoot)`), barrando tentativas de fuga (`../`, `..\`) ou acesso a caminhos absolutos de sistema (`/etc/passwd`, `/proc/self/environ`, `C:\Windows`).
  - **Sanitização Segura de Nomes de Arquivo (`sanitizeSafeFileName`):** Remoção de diacríticos e acentos via `normalize('NFD')`, substituição de caracteres proibidos por underscores, geração de slugs únicos com timestamp e garantia de extensões clínicas homologadas (substituição forçada de extensões perigosas como `.php`/`.exe` por `.pdf`).
  - **Selo Probatório Notarial WORM RFC 8785:** Geração e verificação timing-safe de certidão criptográfica canônica JCS com prefixo `path_guard_seal_v1_<base64url>` assinada via HMAC-SHA256 atestando conformidade do confinamento em jail.
  - **Presets Clínicos Homologados:** Diretórios isolados por categoria clínica (Anamnese, Laudos Neuropsicológicos, Exames Médicos, Determinações Judiciais CFP e Resumos Clínicos de Encaminhamento).
  - Suíte com 16 testes unitários aprovados em `packages/crypto/test/pathTraversalGuard.test.ts`.
- [x] **Contratos Compartilhados, Modelos & DTOs (`packages/shared`):**
  - Enums `PathRiskSeverity`, `PathThreatVector`, `PathValidationAction`, `ClinicalAttachmentCategory`.
  - Ações WORM `PATH_TRAVERSAL_ATTEMPT_BLOCKED`, `FILE_PATH_SANITIZED`, `SAFE_STORAGE_RESOLVED`, `PATH_GUARD_POLICY_UPDATED`, `PATH_GUARD_SEAL_VERIFIED` e recurso `AuditResourceType.PATH_TRAVERSAL_GUARD`.
  - Modelos `PathThreat`, `PathProofSeal`, `PathInspectionResult`, `SafePathResolutionResult`, `PathGuardPolicy`, `ClinicalAttachmentPreset`, `PathGuardMetrics`, `PathSecurityIncident`, `PathGuardOverview` e DTOs tipados.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - `PathTraversalGuardService` singleton com telemetria contínua, histórico forense de incidentes, simulação de vetores de ataque adversariais e auditoria WORM mandatória via `AuditService.log`.
  - 6 rotas REST sob `/api/path-traversal-guard` (`/overview`, `/inspect`, `/resolve`, `/policy`, `/simulate`, `/verify-seal`).
  - Isenção configurada no `wafMiddleware.ts`.
  - Suíte com 12 testes de integração aprovados em `apps/backend/test/pathTraversalGuard.test.ts`.
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Card 51:** Painel de Blindagem contra Path Traversal e LFI em Anexos de Prontuários com 5 KPIs dinâmicos, 4 abas operacionais (*Inspetor & Jail Confinement*, *Repositórios Homologados CFP*, *Simulador Adversarial CWE-22*, *Políticas de Confinamento & Trilha*) e tabela WORM de incidentes bloqueados.
  - **Modal 51.A:** Certidão Notarial Forense WORM de Confinamento em Jail (RFC 8785) com validação criptográfica instantânea.
  - Suporte completo a **Light Mode** e **Dark Mode**.

### 70. Detecção e Prevenção Ativa de Injeção de Código em Expressões e Consultas Dinâmicas (Code/Expression Injection) em Filtros de Prontuários e Buscas Clínicas (CWE-94, CWE-95 & OWASP ASVS v4.0 V5.2)
- [x] **Motor Criptográfico e Avaliador AST Seguro Sandboxed (`packages/crypto/src/expressionInjectionGuard.ts`):**
  - **Tokenizador Léxico Determinístico e Parser de Descida Recursiva:** Imunidade a ReDoS, construção de AST estrita com restrição de profundidade máxima (10) e limite de nós (100), operando com suporte a identificadores clínicos, literais, operadores lógicos (`AND`, `OR`, `NOT`, `&&`, `||`, `!`), comparação (`==`, `!=`, `<`, `<=`, `>`, `>=`, `IN`, `CONTAINS`, `STARTS_WITH`) e arrays literais (`[...]`).
  - **Avaliador Sandboxed de Prontuários (Zero `eval()`, Zero `new Function()`):** Execução estritamente confinada em memória com short-circuit boolean, sem possibilidade de execução de código arbitrário ou escape de contexto.
  - **Heurística Estática e Whitelist Estrita de Identificadores:** Detecção e bloqueio de identificadores perigosos (`__proto__`, `constructor`, `prototype`, `process`, `require`, `eval`, `Function`, `${...}`, `$where`, `sleep(`, `T(java.lang...)`) e confinamento de campos a um schema clínico estrito (`id`, `patientId`, `patientNameMasked`, `sessionDate`, `cid11`, `cidCategory`, `severity`, `riskLevel`, `attended`, `tags`, `doctorName`, `modality`, `notesLength`).
  - **Selo Probatório Notarial WORM RFC 8785:** Geração e verificação timing-safe de certidão criptográfica canônica JCS com prefixo `expr_seal_<hash>` assinada via HMAC-SHA256 atestando conformidade da avaliação segura.
  - **Catálogo de Pentest Adversarial & Coorte Clínica:** 8 vetores de ataque simulando explorações CWE-94 e CWE-95 e 4 amostras de prontuários com CIDs de saúde mental (F32.2, F41.1, F43.1, F10.2).
  - Suíte com 26 testes unitários aprovados em `packages/crypto/test/expressionInjectionGuard.test.ts`.
- [x] **Contratos Compartilhados, Modelos & DTOs (`packages/shared`):**
  - Enums `ExpressionRiskSeverity`, `ExpressionThreatCategory`, `ExpressionValidationAction`, `ExpressionFilterDialect`.
  - Ações WORM `CODE_INJECTION_ATTEMPT_BLOCKED`, `QUERY_EXPRESSION_SANITIZED`, `SAFE_AST_FILTER_EVALUATED`, `EXPRESSION_POLICY_UPDATED`, `EXPRESSION_SEAL_VERIFIED` e recurso `AuditResourceType.CODE_EXPRESSION_GUARD`.
  - Modelos `AstNode`, `ExpressionThreat`, `ExpressionProofSeal`, `ExpressionInspectionResult`, `ClinicalRecordSample`, `ExpressionEvaluationResult`, `ExpressionGuardPolicy`, `ExpressionGuardMetrics`, `ExpressionSecurityIncident`, `ExpressionGuardOverview` e DTOs tipados.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - `ExpressionInjectionGuardService` singleton com telemetria contínua, coorte clínica em memória, histórico forense de incidentes, simulação de ataques e auditoria WORM mandatória via `AuditService.log`.
  - 6 rotas REST sob `/api/expression-guard` (`/overview`, `/inspect`, `/evaluate`, `/policy`, `/simulate`, `/verify-seal`).
  - Isenção de decodificação configurada no `wafMiddleware.ts`.
  - Suíte com 12 testes de integração aprovados em `apps/backend/test/expressionGuard.test.ts`.
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Card 52:** Painel de Blindagem contra Injeção de Código em Expressões e Consultas Clínicas com 5 KPIs dinâmicos, 4 abas operacionais (*Inspetor Léxico & AST Segura*, *Avaliador Clínico Sandboxed*, *Simulador Adversarial CWE-94 / CWE-95*, *Políticas de Governança & Incidentes*) e tabela WORM de incidentes bloqueados.
  - **Modal 52.A:** Certidão Notarial Forense WORM de Avaliação Segura de Expressão AST (RFC 8785) com validação criptográfica instantânea.
  - Suporte completo a **Light Mode** e **Dark Mode**.

### 71. Proteção Avançada contra Injeção de Consultas GraphQL, Introspecção Maliciosa & Query Cost Limiting (OWASP ASVS v4.0 V5.1 & GraphQL Security Best Practices)
- [x] **Motor Criptográfico e Analisador AST de Consultas GraphQL (`packages/crypto/src/graphQLQueryGuard.ts`):**
  - **Tokenizador Léxico & Parser de Descida Recursiva Determinístico:** Imune a ReDoS, livre de regex recursivo instável, construindo AST tipada com suporte a Operations (`query`, `mutation`, `subscription`), SelectionSets, Argumentos, Diretivas e Fragment Definitions/Spreads.
  - **Query Cost Analysis & Profundidade AST Confinada:** Cálculo ponderado de complexidade computacional com multiplicadores dinâmicos para campos confidenciais de saúde mental (`anamnesis`, `prescriptions`, `diagnoses`, `soapNotes`, `records`), profundidade máxima permitida configurável e limites estritos para aliases (`FIELD_ALIAS_OVERLOADING`) e mutações em lote (`BATCH_MUTATION_FLOODING`).
  - **Bloqueio Ativo de Introspecção Maliciosa & Fragment Loops:** Detecção e contenção instantânea de tentativas de enumeração via `__schema` / `__type` e mitigação de loops infinitos cíclicos de fragmentos (`CIRCULAR_FRAGMENT_LOOP`).
  - **Selo Probatório Notarial WORM RFC 8785:** Geração e verificação timing-safe de certidão criptográfica canônica JCS com identificador `gql_cost_seal_<hash>` assinado via HMAC-SHA256 atestando conformidade da consulta antes da execução.
  - **Catálogo de Pentest Adversarial & Schemas Clínicos Homologados:** 8 vetores de ataque GraphQL (Introspecção maliciosa, Nested Depth Bomb, Alias Overloading, Circular Fragment Loop, Batch Mutation Flooding, Diretivas não homologadas, etc.) e 3 schemas de referência em telepsicologia (`TherapySessionService`, `ClinicalRecordsGraph`, `PsychiatricCareHub`).
  - Suíte com 24 testes unitários aprovados em `packages/crypto/test/graphQLQueryGuard.test.ts`.
- [x] **Contratos Compartilhados, Modelos & DTOs (`packages/shared`):**
  - Enums `GraphQLRiskSeverity`, `GraphQLThreatCategory`, `GraphQLValidationAction`, `GraphQLOperationType`.
  - Ações WORM `GRAPHQL_INTROSPECTION_BLOCKED`, `GRAPHQL_COMPLEXITY_EXCEEDED`, `GRAPHQL_DEPTH_VIOLATION_BLOCKED`, `GRAPHQL_QUERY_ANALYZED`, `GRAPHQL_GUARD_POLICY_UPDATED`, `GRAPHQL_COST_SEAL_VERIFIED` e recurso `AuditResourceType.GRAPHQL_QUERY_GUARD`.
  - Modelos `GraphQLCostNode`, `GraphQLThreat`, `GraphQLCostProofSeal`, `GraphQLInspectionResult`, `GraphQLSchemaDefinition`, `GraphQLGuardPolicy`, `GraphQLGuardMetrics`, `GraphQLSecurityIncident`, `GraphQLGuardOverview` e DTOs tipados.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - `GraphQLQueryGuardService` singleton com telemetria contínua, histórico forense de incidentes, catálogo de schemas, simulação adversarial e auditoria WORM mandatória via `AuditService.log`.
  - 6 rotas REST sob `/api/graphql-guard` (`/overview`, `/inspect`, `/policy`, `/simulate`, `/verify-seal`, `/schemas`).
  - Isenção de decodificação configurada no `wafMiddleware.ts`.
  - Suíte com 14 testes de integração aprovados em `apps/backend/test/graphQLQueryGuard.test.ts`.
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Card 53:** Painel de Blindagem contra Injeção de Consultas GraphQL & Query Cost Limiting com 5 KPIs dinâmicos, 4 abas operacionais (*Inspetor de AST & Custo*, *Schemas Clínicos Homologados*, *Simulador Adversarial GraphQL*, *Políticas de Governança & Incidentes*) e tabela WORM de incidentes interceptados.
  - **Modal 53.A:** Certidão Notarial Forense WORM de Avaliação Segura de Custo de Consulta GraphQL (RFC 8785) com validação criptográfica instantânea e dados contextuais do incidente.
  - Suporte completo a **Light Mode** e **Dark Mode**.

### 72. Proteção contra Injeção de Cabeçalhos e Split de Requisições HTTP/2 & gRPC (CWE-113, CWE-444 & RFC 9113 HTTP/2 Desync / Request Smuggling)
- [x] **Motor Criptográfico e Analisador de Cabeçalhos RFC 9113 (`packages/crypto/src/http2GrpcGuard.ts`):**
  - **Validação Estrita de Framing e Lowercase Enforcement:** Imposição de nomes em minúsculas conforme RFC 9113 §8.2.1 (rejeitando/sanitizando maiúsculas), checagem de precedência de pseudo-cabeçalhos (`:method`, `:path`, `:authority`, `:scheme`, `:status`) antes dos campos regulares e veto a pseudo-cabeçalhos não autorizados.
  - **Mitigação Ativa de HTTP/2 to HTTP/1.1 Request Smuggling (H2.TE & H2.CL):** Bloqueio irrevogável de cabeçalhos `transfer-encoding` e valores arbitrários em `te` (permitindo apenas `te: trailers` conforme RFC 9113 §8.2.2), além de detecção de múltiplos cabeçalhos `content-length` conflitantes ou valores numéricos negativos.
  - **Blindagem contra CRLF Injection & Header Splitting (CWE-113):** Detecção e neutralização de sequências `\r`, `\n` ou bytes de controle (`\0`) no nome ou valor de cabeçalhos HTTP/2, impedindo divisão de requisições downstream em proxies reversos.
  - **Validação Estrita de Metadados gRPC:** Inspeção de conformidade de `grpc-timeout` (formato numérico + unidades `H`, `M`, `S`, `m`, `u`, `n`), restrição a codecs homologados em `grpc-encoding` (`identity`, `gzip`, `deflate`, `snappy`) e bloqueio de injeção precoce de `grpc-status` no frame HEADERS inicial.
  - **Selo Probatório Notarial WORM RFC 8785:** Geração e verificação timing-safe de certidão criptográfica canônica JCS com identificador `h2_desync_seal_<hash>` assinado via HMAC-SHA256 atestando conformidade da requisição.
  - **Catálogo de Pentest Adversarial & Suítes Benignas:** 7 vetores de ataque cobrindo H2.TE Smuggling, CRLF Header Split, gRPC Timeout Tampering, H2.CL Desync, Connection Hop-by-Hop, Uppercase Violation e Null Byte Path Injection; acompanhado de 3 suítes clínicas benignas (REST, gRPC Telemetry e WebRTC Signal).
  - Suíte com 22 testes unitários aprovados em `packages/crypto/test/http2GrpcGuard.test.ts`.
- [x] **Contratos Compartilhados, Modelos & DTOs (`packages/shared`):**
  - Enums `Http2RiskSeverity`, `Http2ThreatCategory`, `Http2ValidationAction`, `Http2ProtocolTarget`.
  - Ações WORM `HTTP2_SMUGGLING_ATTEMPT_BLOCKED`, `HTTP2_HEADER_INJECTION_DETECTED`, `GRPC_METADATA_TAMPERING_BLOCKED`, `HTTP2_FRAME_ANALYZED`, `HTTP2_GUARD_POLICY_UPDATED`, `HTTP2_DESYNC_SEAL_VERIFIED` e recurso `AuditResourceType.HTTP2_GRPC_GUARD`.
  - Modelos `Http2HeaderPair`, `Http2Threat`, `Http2ProofSeal`, `Http2InspectionResult`, `Http2GuardPolicy`, `Http2GuardMetrics`, `Http2SecurityIncident`, `Http2GuardOverview` e DTOs tipados.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - `Http2GrpcGuardService` singleton com telemetria contínua, histórico forense de incidentes, simulação adversarial e auditoria WORM mandatória via `AuditService.log`.
  - 5 rotas REST sob `/api/http2-guard` (`/overview`, `/inspect`, `/policy`, `/simulate`, `/verify-seal`).
  - Isenção de inspeção redundante configurada no `wafMiddleware.ts`.
  - Suíte com 14 testes de integração aprovados em `apps/backend/test/http2GrpcGuard.test.ts`.
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Card 54:** Painel de Blindagem contra Injeção de Cabeçalhos e Split HTTP/2 & gRPC com 5 KPIs dinâmicos, 4 abas operacionais (*Inspetor de Cabeçalhos & Desync Guard*, *Suítes Homologadas RFC 9113 & gRPC*, *Simulador Adversarial de Desincronização*, *Políticas de Governança & Incidentes*) e tabela WORM de incidentes interceptados.
  - **Modal 54.A:** Certidão Notarial Forense WORM de Avaliação Segura de Cabeçalhos HTTP/2 & gRPC Framing (RFC 8785) com validação criptográfica instantânea.
  - Suporte completo a **Light Mode** e **Dark Mode**.

### 73. Proteção contra Injeção de Dependências Dinâmicas & Supply Chain Guard (SLSA L3, SCVS v1.0, RFC SRI, CWE-470, CWE-912)
- [x] **Motor Criptográfico e Analisador de Proveniência SLSA L3 (`packages/crypto/src/supplyChainGuard.ts`):**
  - **Mitigação Ativa de Injeção Dinâmica de Módulos (CWE-470):** Inspeção de chamadas `import()` dinâmicas e `require()`, bloqueio compulsório de interpolações com variáveis (`${...}`), concatenações de runtime, URLs remotas externas (`http://`, `https://`, `unpkg.com`), escapes por path traversal (`../`) e injeções de null bytes (`\0`).
  - **Blindagem contra Dependency Confusion (Mitre ATT&CK T1195.001):** Detecção de tentativas de sequestro de pacotes internos sem escopo autorizado, exigindo estritamente namespaces oficiais homologados (`@terapiainfoco/`).
  - **Detecção Heurística de Typosquatting via Levenshtein:** Cálculo de distância de edição para identificar nomes anômalos que imitam pacotes legítimos e de alta confiança da infraestrutura clínica.
  - **Inspeção de Backdoors de Ciclo de Vida (CWE-912):** Análise léxica de scripts de lifecycle de manifestos `package.json` (`preinstall`, `install`, `postinstall`), bloqueando execução de comandos perigosos (`curl`, `wget`, `powershell`, `eval`, `rm -rf`, shells interativas).
  - **Verificação de Subresource Integrity (SRI RFC 3986 / RFC SRI):** Validação criptográfica de hashes SHA-512 e assinaturas de proveniência de build hermético SLSA L3.
  - **Selo Probatório Notarial WORM RFC 8785:** Geração e verificação timing-safe de certidão criptográfica canônica JCS com identificador `sc_guard_seal_<hash>` assinado via HMAC-SHA256 atestando integridade irrevogável do manifesto/módulo.
  - **Catálogo de Pentest Adversarial & Manifestos Benignos:** Simulações cobrindo Dependency Confusion, CWE-470 Dynamic Import Injection, CWE-912 Lifecycle Backdoor e Typosquatting, além de pacotes homologados e amostras benignas do monorepo.
  - Suíte com 18 testes unitários aprovados em `packages/crypto/test/supplyChainGuard.test.ts`.
- [x] **Contratos Compartilhados, Modelos & DTOs (`packages/shared`):**
  - Enums `DependencyRiskSeverity`, `DependencyThreatCategory`, `DependencyValidationAction`, `DependencyRegistryScope`.
  - Ações WORM `SUPPLY_CHAIN_DEPENDENCY_INSPECTED`, `SUPPLY_CHAIN_DEPENDENCY_CONFUSION_BLOCKED`, `SUPPLY_CHAIN_DYNAMIC_IMPORT_INJECTION_BLOCKED`, `SUPPLY_CHAIN_LIFECYCLE_BACKDOOR_BLOCKED`, `SUPPLY_CHAIN_TYPOSQUATTING_QUARANTINED`, `SUPPLY_CHAIN_POLICY_UPDATED`, `SUPPLY_CHAIN_SEAL_VERIFIED` e recurso `AuditResourceType.SUPPLY_CHAIN_GUARD`.
  - Modelos `DependencyNode`, `DependencyThreat`, `DependencyProofSeal`, `DependencyInspectionResult`, `DynamicImportInspectionResult`, `DependencyGuardPolicy`, `DependencyGuardMetrics`, `DependencySecurityIncident`, `SupplyChainGuardOverview` e DTOs tipados.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - `SupplyChainGuardService` singleton com telemetria contínua, histórico forense de incidentes, catálogo de pacotes homologados do monorepo, simulação adversarial e auditoria WORM mandatória via `AuditService.log`.
  - 7 rotas REST sob `/api/supply-chain-guard` (`/overview`, `/inspect`, `/inspect-import`, `/policy`, `/simulate`, `/verify-seal`, `/homologated`).
  - Isenção de inspeção redundante configurada no `wafMiddleware.ts`.
  - Suíte com 13 testes de integração aprovados em `apps/backend/test/supplyChainGuard.test.ts`.
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Card 55:** Painel de Proteção de Supply Chain & Injeção de Dependências Dinâmicas com 5 KPIs dinâmicos, 4 abas operacionais (*Inspetor de Manifestos & Importações*, *Pacotes Homologados & SRI*, *Simulador Adversarial de Supply Chain*, *Políticas de Governança SLSA*) e tabela WORM de incidentes interceptados.
  - **Modal 55.A:** Certidão Notarial Forense WORM de Avaliação de Integridade de Supply Chain & SLSA L3 Provenance (RFC 8785) com validação criptográfica instantânea.

### 74. Proteção contra Injeção de Objetos e Desserialização Não Segura em Sessões WebSocket (RFC 6455, OWASP ASVS v4.0 V5.5 & CWE-502)
- [x] **Motor Criptográfico e Validador de Frames WebSocket (`packages/crypto/src/webSocketDeserializationGuard.ts`):**
  - **Detecção de Gadget Chains & Magic Markers (CWE-502):** Varredura profunda contra desserialização insegura (`node-serialize` IIFE `_$$ND_FUNC$$_`, Java Serialization `rO0AB`, Python Pickle, PHP Object Injection `O:4:"User"`, `.NET $type` e YAML `!!python/object`).
  - **Prevenção de Poluição de Protótipo (CWE-1321) & Sanitização Recursiva:** Bloqueio ativo de chaves proibidas (`__proto__`, `constructor`, `prototype`, `__defineGetter__`, `__defineSetter__`) e limites estritos de profundidade de aninhamento (`maxNestingDepth`) e chaves totais (`maxTotalKeys`).
  - **Conformidade RFC 6455 & Anti-Smuggling:** Validação estrita de opcodes permitidos, rejeição de bits reservados (`RSV1/RSV2/RSV3`) sem extensão negociada, exigência de mascaramento cliente->servidor (`MASK=1`) e contenção de bombas de fragmentação.
  - **Assinatura HMAC-SHA256 & Selo Probatório Notarial WORM RFC 8785:** Verificação de autenticidade de envelopes de sinalização WebRTC/Teleconsulta e emissão de certidão `ws_guard_seal_<hash>` com comparação em tempo constante (*timing-safe*).
  - Suíte com 8 testes unitários aprovados em `packages/crypto/test/webSocketDeserializationGuard.test.ts`.
- [x] **Contratos Compartilhados, Modelos & DTOs (`packages/shared`):**
  - Enums `WebSocketThreatCategory`, `WebSocketFrameAction`, `WebSocketChannelType`.
  - Ações WORM `WEBSOCKET_FRAME_INSPECTED`, `WEBSOCKET_INSECURE_DESERIALIZATION_BLOCKED`, `WEBSOCKET_OBJECT_INJECTION_BLOCKED`, `WEBSOCKET_PROTOTYPE_POLLUTION_BLOCKED`, `WEBSOCKET_SMUGGLING_BLOCKED`, `WEBSOCKET_POLICY_UPDATED`, `WEBSOCKET_SEAL_VERIFIED` e recurso `AuditResourceType.WEBSOCKET_GUARD`.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - `WebSocketGuardService` singleton com telemetria contínua, histórico de incidentes, catálogo de amostras benignas e adversariais e auditoria WORM via `AuditService.log`.
  - 6 rotas REST sob `/api/websocket-guard` (`/overview`, `/inspect`, `/policy`, `/simulate`, `/verify-seal`, `/samples`) com isenção no `wafMiddleware.ts`.
  - Suíte com 5 testes de integração aprovados em `apps/backend/test/webSocketGuard.test.ts`.
- [x] **Frontend Clínico & Painel de Governança (`apps/frontend`):**
  - **Card 56 (`SecurityModule.tsx`):** Painel de Proteção contra Injeção de Objetos & Desserialização WebSocket com 5 KPIs dinâmicos, 3 abas operacionais (*Inspetor de Frames & Sinalização*, *Simulador Adversarial CWE-502*, *Política RFC 6455 & ASVS V5.5*) e tabela WORM de incidentes.
  - **Modal 56.A (`SecurityModule.tsx`):** Certidão Notarial Forense WORM de Inspeção de Frame WebSocket (RFC 8785) com verificação criptográfica instantânea.

### 12. Evolução de Produto RFC-001: Faturamento Clínico, Emissão de Recibos para Reembolso de Convênio/DMED e Termo de Honorários Psicológicos (§3.6)
- [x] **Conversor Numérico Monetário para Extenso em Português Formal:**
  - Implementação de algoritmo determinístico em `BillingReceiptService` convertendo valores monetários em centavos para texto por extenso (ex: 25000 centavos -> "Duzentos e cinquenta reais", 100050 centavos -> "Mil reais e cinquenta centavos"), atendendo às exigências normativas da Receita Federal (Livro Caixa / Carnê-Leão / DMED) e operadoras de saúde suplementar.
- [x] **Emissão de Recibo de Honorários Psicológicos com Selo WORM & Hash SHA-256:**
  - Numeração sequencial anual padronizada (`REC-YYYY-NNNN`).
  - Identificação completa do psicólogo com registro CRP ativo (`CRP 06/142980`) e CPF para dedutibilidade tributária.
  - Discriminação obrigatória de cada sessão coberta (data, modalidade ONLINE / PRESENCIAL, finalidade).
  - Suporte completo a responsável financeiro para pacientes menores de idade ou dependentes legais (nome, CPF e parentesco).
  - Assinatura digital criptográfica com hash SHA-256 canônico gerado a partir do payload imutável e selo WORM de auditoria.
- [x] **Cancelamento Justificado com Preservação de Rastreabilidade Fiscal:**
  - Em conformidade com auditoria contábil e CFP, recibos cancelados não são deletados, mas marcados com status `CANCELLED`, registrando justificativa formal, data/hora e trilha de auditoria WORM imutável.
- [x] **Validador Público de Recibo para Operadoras de Saúde & Convênios:**
  - Endpoint público rate-limited (`GET /api/billing/receipts/validate/:token`).
  - Anonimização de dados segundo LGPD (Art. 11) e CFP (Art. 9º): o nome do paciente é anonimizado em iniciais (ex: "Mariana Silva de Oliveira" -> "M. S. d. O."), permitindo que a operadora de saúde comprove a autenticidade e quitação do serviço sem violar o sigilo profissional da psicoterapia.
- [x] **Contrato / Termo de Honorários Psicológicos & Prestação de Serviços (Resolução CFP nº 010/2005):**
  - Formalização de honorários profissionais (Art. 4º) com valor por sessão individual ou pacote, regras de vencimento, política de cancelamento/desmarcações com antecedência mínima estipulada (ex: 24 horas) e cláusula estrita de confidencialidade e sigilo psicológico (Art. 9º).
  - Geração de hash SHA-256 e auditoria WORM vinculada ao prontuário do paciente.
- [x] **Frontend Clínico & Módulo de Faturamento Integrado (`apps/frontend`):**
  - Aba integrada "Faturamento & Recibos de Honorários (RFC §3.6)" em `DocumentsModule.tsx` e componente dedicado `BillingReceiptsModule.tsx`.
  - Painel com KPIs financeiros (Total Faturado em R$, Recibos Emitidos e Status Quitado/Cancelado).
  - Visualizador timbrado oficial com layout timbrado profissional, pronto para impressão / exportação PDF com QR Code de autenticidade instantânea.
  - Modais para Emissão de Recibo, Cancelamento Formal Justificado, Emissão de Termo de Honorários e Validador Público de Recibo para Convênio.
  - Suporte completo a **Light Mode** e **Dark Mode**.
- [x] **Suíte de Testes do Módulo:**
  - 9 testes unitários e de integração HTTP REST aprovados com 100% de sucesso em `apps/backend/test/billingReceiptsAndContracts.test.ts`.

---

### 13. Evolução de Produto RFC-001: Teleconsulta Nativa WebRTC P2P, Sala de Espera Ética & Transcrição com Diarização e Síntese SOAP IA (§3.2, §3.3)
- [x] **Teleconsulta Nativa WebRTC com Sala de Espera Ética (Knocking CFP nº 011/2018):**
  - Implementação de sala virtual de telepsicologia ponto-a-ponto (P2P WebRTC) com estado de knocking e admissão manual compulsória pelo psicólogo para garantia de sigilo profissional.
  - Gravação consentida com registro de aceite de TCLE em trilha WORM e telemetria de qualidade com MOS ITU-T G.107 em tempo real.
- [x] **Transcrição Assistida por IA, Diarização de Voz & Síntese SOAP Human-in-the-Loop:**
  - Ingestão de áudio da teleconsulta com particionamento temporal, diarização entre Terapeuta e Paciente e cálculo de taxa de escuta ativa (*Talk-to-Listen Ratio*).
  - Síntese de rascunho de nota nos quatro quadrantes SOAP com sanitização prévia de PII (k-Anonymity) e fluxo de revisão obrigatória pelo terapeuta (*Human-in-the-Loop*).
  - 12 testes aprovados em `apps/backend/test/aiTranscriptionSoap.test.ts`.

---

### 14. Evolução de Produto RFC-001: Assinatura Avançada ICP-Brasil em Lote com Certificado A1/A3/Nuvem PSC & Fechamento de Ciclos de Prontuário (§3.4, §3.5)
- [x] **Arquitetura de Merkle Tree Determinística para Assinatura em Lote:**
  - Construção de árvore de Merkle determinística com nós SHA-256 sobre a coleção de itens clínicos pendentes (evoluções de prontuário SOAP, documentos emitidos CFP nº 006/2019, relatórios consolidados e recibos de honorários).
  - Resolução de folhas ímpares por duplicação do último hash e cálculo da Raiz de Merkle imutável (*Merkle Root*).
- [x] **Emissão de Assinatura Qualificada ICP-Brasil & Carimbo do Tempo TSA (DOC-ICP-11):**
  - Cifragem assimétrica ECDSA P-256 sobre a raiz de Merkle com emissão de assinatura no padrão PAdES-T / PAdES-LT (Lei nº 14.063/2020 e MP nº 2.200-2/2001).
  - Inclusão compulsória de carimbo do tempo TSA credenciado pelo ITI / Observatório Nacional (política OID `2.16.76.1.4.1`), garantindo prova inequívoca de tempestividade e não-repúdio.
  - Suporte completo a múltiplos modelos de custódia: Certificado A1 (PKCS#12 / arquivo criptografado), Token de Hardware A3 (USB / smartcard) e Provedores PSC em Nuvem Homologados (BirdID, SafeID, NeoID, VIDaaS).
- [x] **Travamento WORM de Imutabilidade & Fé Pública:**
  - Travamento atômico de imutabilidade (*lockedByBatchSignature*) em todos os prontuários e documentos do lote, impedindo alterações posteriores e exigindo termo formal de retificação (CFP nº 001/2009 Art. 9º).
  - Geração de token público de verificação notarial `icp_batch_v1_<base64url>`.
- [x] **Validador Notarial Público de Lote sem Login:**
  - Endpoint público `POST /api/icp-batch/verify` com proteção por rate limiting e mascaramento de iniciais dos pacientes (K-Anonymity) para atestar a fé pública do lote sem violar a privacidade médica.
- [x] **Interface Frontend Integrada (`IcpBatchSigningModal.tsx` & `SoapModule.tsx`):**
  - Modal com 3 abas operacionais (*Assinar Lote Pendente*, *Histórico de Lotes Selados*, *Validador Notarial Público*).
  - Visualização de itens pendentes por paciente com seleção individual ou em massa, seletor de credencial criptográfica (A1, A3, Nuvem PSC) e entrada segura de PIN.
  - Totalmente adaptado para **Light Mode** e **Dark Mode**.
- [x] **Suíte de Testes do Módulo:**
  - 8 testes unitários e de integração REST aprovados com 100% de sucesso em `apps/backend/test/icpBatchSigning.test.ts`.

---

### 15. Evolução de Produto RFC-001: Portal do Paciente Autenticado com Acesso a Exercícios Terapêuticos Interativos (TCC/ACT/DBT), Histórico de Recibos para Reembolso e Termos TCLE (§3.6, §3.7)
- [x] **Autenticação Segura Passwordless com Blind Indexing:**
  - Solicitação de código temporário numérico de 6 dígitos via e-mail (`POST /api/patient-portal/auth/request-code`).
  - Verificação determinística via Blind Index HMAC-SHA256 sem vazamento de PII (`POST /api/patient-portal/auth/verify-code`).
  - Emissão de token JWT assinado (`HS256`) com expiração e isolamento de escopo por paciente.
- [x] **Prescrição & Templates de Exercícios Clínicos Interativos:**
  - Prescrição pelo psicólogo de tarefas entre sessões com templates dinâmicos:
    - **Registro de Pensamentos Disfuncionais (RPD - TCC):** Situação, pensamento automático, emoção, distorção cognitiva, resposta racional adaptativa e reavaliação.
    - **Diário & Rastreador de Humor:** Escala de 1 a 10, gatilhos contextuais e identificação de momento positivo do dia.
    - **Treino de Respiração & Mindfulness (4-4-6):** Biofeedback pré/pós e mensuração de alívio autonômico.
    - **Inventário de Valores & Ação Comprometida (ACT):** Definição de valores centrais e metas acionáveis.
    - **Ativação Comportamental (DBT/TCC):** Planejamento de atividades prazerosas e de domínio.
- [x] **Criptografia Ponta a Ponta de Respostas (FLE AES-256-GCM) & Prevenção de IDOR:**
  - Respostas submetidas pelo paciente são cifradas com Field-Level Encryption antes da persistência no banco.
  - Validação estrita de autorização e posse do exercício, prevenindo vulnerabilidades de Broken Object Level Authorization (IDOR).
- [x] **Revisão Clínica com Feedback Human-in-the-Loop:**
  - Painel do terapeuta para leitura das respostas decifradas e emissão de orientações clínicas / feedback que são exibidos de forma acolhedora no portal do paciente.
- [x] **Acesso Seguro a Recibos de Honorários para Reembolso:**
  - Consulta pelo paciente de recibos emitidos e quitados com número de validação pública e dados para operadora de saúde / DMED.
- [x] **Gestão de Termos TCLE Ativos:**
  - Visualização dos termos de consentimento formalmente aceitos (Atendimento Psicológico Online CFP nº 011/2018 e Gravação Consentida LGPD Art. 11).
- [x] **Interface Frontend Integrada (`PatientPortalModal.tsx` & `PatientsModule.tsx`):**
  - Modal com alternador de visão dupla: Visão do Paciente (área autenticada com abas de Visão Geral, Exercícios Terapêuticos, Recibos e TCLE) vs. Visão do Psicólogo Prescritor (seleção de paciente, formulário de prescrição e histórico de exercícios com inserção de feedback).
  - Suporte completo a **Light Mode** e **Dark Mode**.
- [x] **Suíte de Testes do Módulo:**
  - 8 testes unitários e de integração REST aprovados com 100% de sucesso em `apps/backend/test/patientPortal.test.ts`.

---

### 16. Evolução de Produto RFC-001: Anamnese Digital Interativa com Árvore de Decisão Diagnóstica Baseada em Hipóteses & Escalas Psicométricas Iniciais (§3.4 / CFP)
- [x] **Árvore de Decisão Diagnóstica Ramificada (Branching Logic):**
  - Catálogo com 5 trilhas de investigação clínica orientadas por hipóteses do CID-11:
    - **Espectro de Ansiedade:** TAG (6B00), Pânico (6B01), Fobia Social (6B04).
    - **Espectro Depressivo:** Episódio Depressivo Maior (6A70), Distimia Crônica (6A72).
    - **Neurodesenvolvimento & TDAH Adulto:** Início na infância vs. sobrecarga funcional (6A05).
    - **Trauma & Fatores de Estresse:** TEPT (6B40), TEPT Complexo (6B41), Dissociação.
    - **Esgotamento Ocupacional & Somatização:** Tríade de Burnout (QD85) e sintomas somáticos (6C20).
- [x] **Detecção de Sinais de Alerta Críticos (Red Flags) & Protocolo de Crise CFP:**
  - Identificação imediata de ideação suicida ativa, planos de autolesão ou desregulação grave.
  - Elevação automática de severidade para `CRITICAL_RED_FLAG`, acionamento de diretivas de segurança, notificação da rede de apoio do TCLE e auditoria no WORM (`DIAGNOSTIC_RED_FLAG_TRIGGERED`).
- [x] **Bateria de Escalas Psicométricas Iniciais Padronizadas:**
  - Aplicação e cálculo de escores basais para monitoramento longitudinal:
    - **PHQ-4:** Triagem rápida de 4 itens de ansiedade (GAD-2) e depressão (PHQ-2).
    - **PSS-10:** Escala de 10 itens de estresse percebido com inversão matemática de itens reversos.
    - **ASRS-v1.1:** Triagem de TDAH no adulto validada pela OMS (6 itens Parte A).
- [x] **Criptografia FLE AES-256-GCM & Segregação Ética de Anotações:**
  - Cifragem em repouso da síntese clínica e das anotações confidenciais do psicólogo (Art. 9º CFP).
  - Cálculo de hash SHA-256 canônico de integridade e registro de auditoria WORM (`DIAGNOSTIC_ASSESSMENT_COMPLETED`).
- [x] **Componente Frontend Interativo (`DiagnosticDecisionTreeModal.tsx` & `PatientsModule.tsx`):**
  - Fluxo passo a passo (*wizard*) moderno: Seleção da Trilha -> Perguntas da Árvore com badges de CID-11 -> Bateria Psicométrica com escore dinâmico -> Síntese & Salvar.
  - Aba de Histórico de Avaliações com visualizador detalhado de relatórios emitidos.
  - Totalmente adaptado para **Light Mode** e **Dark Mode**.
- [x] **Suíte de Testes do Módulo:**
  - 8 testes unitários e de integração REST aprovados com 100% de sucesso em `apps/backend/test/diagnosticDecisionTree.test.ts`.

---

### 17. Prescrição & Encaminhamento Psiquiátrico com Validação Cruzada de Medicamentos e Interações Farmacológicas (RFC-001 §3.5 & Art. 9º do Código de Ética do Psicólogo)
- [x] **Catálogo Padronizado de Psicofármacos Brasileiros (`PSYCHOPHARMACEUTICALS_CATALOG`):**
  - Mapeamento abrangente de 18 psicofármacos comuns no Brasil com dosagens, indicações principais, efeitos colaterais e pérolas clínicas em 8 classes farmacológicas:
    - **ISRS:** Fluoxetina, Sertralina, Escitalopram.
    - **IRSN:** Venlafaxina, Duloxetina.
    - **Antidepressivos Atípicos:** Bupropiona, Mirtazapina, Tranilcipromina (IMAO).
    - **Benzodiazepínicos & Hipnóticos:** Clonazepam, Alprazolam, Zolpidem.
    - **Estabilizadores de Humor:** Carbonato de Lítio, Ácido Valproico/Divalproato, Lamotrigina.
    - **Antipsicóticos Atípicos (Segunda Geração):** Quetiapina, Risperidona, Aripiprazol.
    - **Psicoestimulantes:** Metilfenidato, Lisdexanfetamina.
- [x] **Motor de Regras Farmacológicas de Interações Cruzadas (`DRUG_INTERACTION_RULES`):**
  - Avaliação automatizada de interações par-a-par com matriz de severidade clínica padronizada:
    - **CONTRAINDICATED:** Combinações de altíssimo risco de letalidade por Síndrome Serotoninérgica Aguda (ex: Inibidores da MAO como Tranilcipromina combinados a ISRS/IRSN).
    - **MAJOR:** Riscos graves de depressão respiratória central e sedação extrema (Benzodiazepínicos + Zolpidem), além de toxicidade neuromuscular e tremor por litiemia tóxica (Lítio + ISRS).
    - **MODERATE:** Redução cumulativa de limiar convulsivo, taquicardia sinusal e hipersedação com hipotensão ortostática (Bupropiona + IRSN; Clonazepam + Quetiapina; Psicoestimulantes + IRSN).
  - Emissão de orientações práticas direcionadas ao psicólogo (`psychologistManagementTip`) para observação clínica e manejo em sessão.
- [x] **Guia de Encaminhamento Psiquiátrico Interoperável & Notarial:**
  - Emissão com cálculo imutável de **Checksum SHA-256** sobre o payload clínico e hipóteses CID-11.
  - Geração de token notarial único (`psy_ref_<hex>`) para verificação pública pelo médico psiquiatra externo sem necessidade de autenticação.
  - Cifragem **Field-Level Encryption (AES-256-GCM)** exclusiva para notas confidenciais do terapeuta, preservando o sigilo profissional (Art. 9º do Código de Ética do Psicólogo).
  - Trilha de auditoria WORM imutável registrando `PSYCHIATRIC_REFERRAL_CREATED`, `DRUG_INTERACTIONS_EVALUATED` e `CRITICAL_DRUG_ALERT_TRIGGERED`.
- [x] **Componente Frontend Dedicado (`PsychiatricReferralModal.tsx` & `PatientsModule.tsx`):**
  - Interface clínica por abas (*Novo Encaminhamento & Checagem* vs. *Histórico de Guias*).
  - Seletor de níveis de urgência (`ROUTINE`, `MODERATE`, `CRITICAL_RED_FLAG`), atalhos de hipóteses diagnósticas CID-11, cadastro de medicamentos em uso com dosagem, posologia e adesão relatada.
  - Verificador instantâneo de interações com badges dinâmicos de severidade e dicas práticas de manejo.
  - Pré-visualização da Guia Timbrada com carimbo digital, QR/Token notarial e botão de cópia rápida.
  - Suporte completo a **Light Mode** e **Dark Mode**.
- [x] **Suíte de Testes Automatizados:**
  - 8 testes unitários e de integração REST com 41 asserções aprovadas com 100% de sucesso em `apps/backend/test/psychiatricReferral.test.ts`.

---

### 18. Exportação Segura e Portabilidade de Prontuário Clínico em Pacote Cifrado por Senha do Titular (.enc Argon2id + AES-256-GCM) com Verificação de Integridade (RFC-001 §3.3, §4.4 & LGPD Art. 18)
- [x] **Motor Criptográfico de Cofre `.enc` com Argon2id + AES-256-GCM & AAD (`packages/crypto/src/encryptedPortabilityVault.ts`):**
  - Derivação de chave simétrica 256-bit via KDF resistente a ASIC/GPU (Argon2id / PBKDF2-HMAC-SHA256 parametrizado) com salt aleatório de 32 bytes e IV de 12 bytes.
  - Cifragem autenticada AES-256-GCM vinculando cabeçalho de contexto (`patientId`, `merkleRoot`, `plaintextSha256`, `createdAt`) como *Additional Authenticated Data (AAD)* para impedir substituição de metadados.
  - Avaliador de entropia de passphrase em bits (`evaluatePassphraseStrength`) exigindo nível mínimo `STRONG` para emissão do pacote `.enc`.
  - Suíte com 8 testes unitários aprovados em `packages/crypto/test/encryptedPortabilityVault.test.ts`.
- [x] **Árvore de Merkle Determinística sobre 11 Seções Clínicas & Selo Notarial WORM RFC 8785:**
  - Compilação integral de: Dados Cadastrais, Ficha de Admissão Biopsicossocial, Anamneses Diagnósticas Interativas, Sessões Agendadas, Evoluções SOAP Decifradas, Planos SMART, Escalas Psicométricas (PHQ-9/GAD-7), Documentos CFP nº 006/2019, Encaminhamentos Psiquiátricos, Exercícios Terapêuticos do Portal e Recibos/Contratos de Honorários.
  - Segregação ética estrita (Art. 9º do Código de Ética do Psicólogo): anotações confidenciais de uso exclusivo do psicólogo são omitidas na modalidade de portabilidade ao titular (`PATIENT_SELF_PORTABILITY`).
  - Emissão de selo notarial WORM `port_vault_seal_<hash>` com verificação pública zero-knowledge sem necessidade de revelar a senha do titular.
- [x] **Backend Service & Rotas REST (`apps/backend`):**
  - `PortabilityVaultService` e 5 rotas sob `/api/portability-vault` (`/:patientId/generate`, `/verify`, `/decrypt`, `/:patientId/history`, `/evaluate-passphrase`).
  - Suíte com 4 testes de integração aprovados em `apps/backend/test/portabilityVault.test.ts`.
- [x] **Componente Frontend Dedicado (`PortabilityVaultModal.tsx` & `PatientsModule.tsx`):**
  - Modal com 3 abas operacionais (*Gerar Cofre .enc*, *Verificar & Decifrar .enc*, *Histórico WORM*), medidor de entropia de senha em tempo real, download direto do arquivo `.enc` e explorador de árvore de Merkle.

---

### 19. Vitrine Pública Sem Login, Autenticação Unificada (Com ou Sem Login Social) & Gestão de Perfis Dedicados (Paciente, Psicólogo e Admin/DPO)
- [x] **Vitrine Pública Interativa Sem Login (`PublicShowcasePage.tsx` & `GET /api/auth/public-showcase`):**
  - Página inicial aberta sem necessidade de autenticação prévia, permitindo explorar todos os **18 módulos clínicos RFC-001**, as **74 camadas de segurança em tempo real** e a conformidade normativa (**CFP nº 001/2009**, **011/2018**, **006/2019**, **LGPD Art. 11/18/38** e **ICP-Brasil MP 2.200-2/2001**).
  - Seletor interativo de experiência por persona (*Jornada do Paciente*, *Jornada do Psicólogo* e *Jornada do Admin / DPO*) e filtro por categoria de módulos.
  - Botões de entrada rápida 1-Clique Demo para experimentação imediata em cada papel RBAC, além de botões *"Entrar"* e *"Criar Perfil"* e alternância para o Workspace a qualquer momento.
- [x] **Perfis Dedicados (`PACIENTE`, `PSICOLOGO_TITULAR`, `ADMIN`, `SUPERVISOR_CLINICO`, `RECEPCAO_SECRETARIA`):**
  - Inclusão do papel `UserRole.PACIENTE` e seed padrão de *Mariana Silva de Oliveira* (`paciente@terapiainfoco.com.br`) vinculada ao prontuário cifrado.
  - Atributos específicos por perfil em `SafeUser`:
    - **Psicólogo(a):** CRP, UF, Abordagem Clínica (`specialty`), Honorário por Sessão (`sessionFeeCents`), Biografia Clínica e Cadastro e-Psi.
    - **Paciente:** CPF Mascarado (`cpfMasked`), WhatsApp, Nome e Telefone do Contato de Emergência (Rede de Apoio CFP) e `patientId` com prontuário FLE AES-256-GCM criado automaticamente no registro.
    - **Admin / DPO:** Departamento e Certificação DPO/Segurança (`CDPO/BR`, `ISO/IEC 27701`).
  - Experiência dedicada para o perfil `PACIENTE` no painel (`App.tsx`), com acesso focado à Agenda & Teleconsulta e ao Portal de Exercícios Terapêuticos, Recibos e Cofre de Portabilidade LGPD Art. 18 (`.enc`), bloqueando módulos restritos de prontuário e governança administrativa.
- [x] **Login & Criação de Perfil Com ou Sem Login Social (`AuthModal.tsx`, `POST /api/auth/register`, `POST /api/auth/social`):**
  - Modal unificado com abas *"Entrar na Conta"* e *"Criar Novo Perfil"*.
  - Suporte a **Login Social OAuth 2.0 / OIDC** (`GOOGLE`, `GOV_BR` Nível Prata/Ouro ICP-Brasil, `APPLE`) e **Passkey / FIDO2 WebAuthn** (`PASSKEY_FIDO2`), tanto para login rápido quanto para criação automática de perfil ou vinculação a conta existente.
  - Suporte completo a cadastro tradicional **Sem Login Social** (`EMAIL_PASSWORD` com Argon2id + suporte a 2FA TOTP RFC 6238), com formulário adaptativo conforme o perfil selecionado (*Paciente*, *Psicólogo* ou *Admin*).
- [x] **Gestão e Edição de Perfil (`UserProfileModal.tsx`, `PUT /api/auth/profile`, `GET /api/auth/profiles`):**
  - Modal completo de edição cadastral em tempo real, exibição de provedores sociais vinculados, status de 2FA TOTP e trilha de auditoria WORM (`SOCIAL_AUTH_LOGIN`, `USER_PROFILE_UPDATED`, `PUBLIC_SHOWCASE_ACCESSED`).
- [x] **Suíte de Testes Automatizados (`apps/backend/test/authProfilesAndShowcase.test.ts`):**
  - 4 testes de integração cobrindo a Vitrine Pública sem login, criação de perfil tradicional (`PSICOLOGO_TITULAR`, `PACIENTE` com FLE automático e `ADMIN`), criação/vinculação via Login Social (`GOOGLE`, `GOV_BR`, `APPLE`) e atualização de perfil autenticado.

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
| `feat/http-parameter-pollution-header-injection-guard` | Módulo de Blindagem contra Parameter Pollution (HPP) e Injeção de Cabeçalhos (CRLF) em Endpoints Críticos (OWASP Top 10 API Security & RFC-001 §4.4, §5.2) | [PR #65](https://github.com/linuxsoares/terapiainfoco/pull/65) | Merged |
| `feat/homomorphic-encryption-paillier-cid11` | Protocolo de Cifragem Homomórfica Parcial (PHE - Paillier Cryptosystem) para Agregação Estatística Segura de Diagnósticos CID-11 sem Decifragem Centralizada (LGPD Art. 13 & Resolução CFP nº 001/2009) | [PR #66](https://github.com/linuxsoares/terapiainfoco/pull/66) | Merged |
| `feat/ssrf-dns-rebinding-protection-guard` | Módulo de Proteção Avançada contra Server-Side Request Forgery (SSRF) e DNS Rebinding em Webhooks e Conectores Externos (OWASP API8:2023 & ASVS v4.0) | [PR #67](https://github.com/linuxsoares/terapiainfoco/pull/67) | Merged |
| `feat/advanced-api-rate-limiting-token-bucket-sliding-window` | Módulo de Rate Limiting Avançado com Algoritmo Híbrido Token Bucket + Sliding Window Log para Proteção Anti-DDoS e Abuso de Endpoints Clínicos Sensíveis (OWASP API4:2023 & RFC-001 §4.4, §5.2) | [PR #68](https://github.com/linuxsoares/terapiainfoco/pull/68) | Merged |
| `feat/memory-shield-heap-spraying-protection` | Módulo de Blindagem de Memória & Prevenção de Heap Spraying em Sessões Criptográficas com Secure Memory Allocator e Limpeza Imediata de DEKs (NIST SP 800-88 & OWASP ASVS) | [PR #69](https://github.com/linuxsoares/terapiainfoco/pull/69) | Merged |
| `feat/device-posture-zero-trust-assessment` | Módulo de Avaliação Contínua de Postura de Dispositivo (Zero Trust Device Posture Assessment) para Terminais de Atendimento Clínico (NIST SP 800-207 & OWASP MASVS) | [PR #71](https://github.com/linuxsoares/terapiainfoco/pull/71) | Merged |
| `feat/pqc-hybrid-kyber-dilithium-clinical-crypto` | Módulo de Criptografia Pós-Quântica Híbrida (PQC Kyber/ML-KEM & Dilithium/ML-DSA) para Telemedicina e Prontuários Clínicos (NIST FIPS 203 & FIPS 204) | [PR #72](https://github.com/linuxsoares/terapiainfoco/pull/72) | Merged |
| `feat/side-channel-timing-attack-protection` | Módulo de Proteção Criptográfica contra Ataques Side-Channel e Timing Attacks (Constant-Time Operations, Blinding & Cache Allocation Shield - NIST SP 800-38D & RFC §4.2, §4.4) | [PR #74](https://github.com/linuxsoares/terapiainfoco/pull/74) | Merged |
| `feat/anti-replay-nonce-sliding-window-bloom-filter` | Módulo de Proteção contra Ataques de Replay & Reutilização de Nonce/IV em Sessões WebRTC e Tokens Clínicos com Janela Deslizante e Bloom Filter (RFC 8446 TLS 1.3, RFC 9147 DTLS 1.3 & OWASP Top 10 API Security) | [PR #75](https://github.com/linuxsoares/terapiainfoco/pull/75) | Merged |
| `feat/visual-watermark-screen-exfiltration-tracer` | Módulo de Marcação D'água Esteganográfica Visual e Traçabilidade Forense Anti-Exfiltração de Tela em Sessões WebRTC e Prontuários Médicos (LGPD Art. 46, Resolução CFP nº 011/2018 e RFC-001 §3.2, §4.4) | [PR #76](https://github.com/linuxsoares/terapiainfoco/pull/76) | Merged |
| `feat/ephemeral-teleconsult-tokens-auto-revocation` | Rastreabilidade & Proteção de Credenciais de Acesso Temporário / Links Efêmeros de Teleconsulta com HMAC-Time-Constrained Token e Auto-Revogação com Prova de Não-Repúdio (RFC 7519, RFC 7009 & LGPD Art. 46) | [PR #77](https://github.com/linuxsoares/terapiainfoco/pull/77) | Merged |
| `feat/threshold-shamir-secret-sharing-court-order` | Liberação Colegiada de Prontuários Sob Ordem Judicial com Threshold Cryptography & Shamir's Secret Sharing (t-of-n Multi-Party Computation - CFP nº 001/2009 Art. 9º, LGPD Art. 11 e RFC §4.2) | [PR #78](https://github.com/linuxsoares/terapiainfoco/pull/78) | Merged |
| `feat/prototype-pollution-insecure-deserialization-guard` | Módulo de Detecção e Prevenção Ativa de Ataques de Poluição de Protótipo (Prototype Pollution) & Desserialização Insegura em Objetos Clínicos Dinâmicos (OWASP ASVS v4.0 V5.5, CWE-1321 & Node.js Security Best Practices) | [PR #79](https://github.com/linuxsoares/terapiainfoco/pull/79) | Merged |
| `feat/web-cache-poisoning-deception-guard` | Módulo de Proteção contra Ataques de Poluição de Cache HTTP (Web Cache Poisoning & Cache Deception) em Recursos Clínicos com Normalização de Chave e Assinatura de Cache (RFC 7234, RFC 9111 & OWASP ASVS v4.0) | [PR #80](https://github.com/linuxsoares/terapiainfoco/pull/80) | Merged |
| `feat/xxe-injection-xml-bomb-defense` | Módulo de Detecção e Prevenção Ativa de Ataques de Injeção de Entidades Externas XML (XXE) & Expansão de Entidades (Billion Laughs / XML Bomb) em Intercâmbios de Saúde Mental (CWE-611, CWE-776 & HL7/FHIR) | [PR #81](https://github.com/linuxsoares/terapiainfoco/pull/81) | Merged |
| `feat/session-fixation-hijacking-guard` | Blindagem contra Fixação & Sequestro de Sessão com Rotação Criptográfica Obrigatória Pós-Autenticação e Dynamic TLS/Network Context Binding (OWASP ASVS v4.0 V3.3, CWE-384, CWE-287 & NIST SP 800-63B) | [PR #82](https://github.com/linuxsoares/terapiainfoco/pull/82) | Merged |
| `feat/redos-safe-regex-engine` | Detecção e Prevenção de Negação de Serviço por Expressões Regulares (ReDoS) com Validador Léxico AST, Timeout Não-Bloqueante e Sanitização de Regex Clínico (OWASP ASVS v4.0 V5.5 & CWE-1333) | [PR #83](https://github.com/linuxsoares/terapiainfoco/pull/83) | Merged |
| `feat/ssti-secure-template-engine` | Blindagem contra Injeção de Templates no Servidor (SSTI) em Laudos Psicológicos com Sandboxed Template Engine (OWASP ASVS V5.2, CWE-1336 & CFP 006/2019) | [PR #84](https://github.com/linuxsoares/terapiainfoco/pull/84) | Merged |
| `feat/os-command-injection-pdf-guard` | Detecção e Prevenção de OS Command Injection em Conversores de PDF e Laudos Psicológicos com Enclave Sandboxed (CWE-78, CWE-88 & OWASP ASVS V5.3) | [PR #85](https://github.com/linuxsoares/terapiainfoco/pull/85) | Merged |
| `feat/path-traversal-lfi-guard` | Sanitização e Validação Estrita de Caminhos de Arquivos e Prevenção de Path Traversal / Local File Inclusion (LFI) em Uploads e Anexos de Prontuários (CWE-22, CWE-23, CWE-73 & OWASP ASVS v4.0 V5.5) | [PR #86](https://github.com/linuxsoares/terapiainfoco/pull/86) | Merged |
| `feat/code-expression-injection-guard` | Detecção e Prevenção Ativa de Injeção de Código em Expressões e Consultas Dinâmicas (Code/Expression Injection) em Filtros de Prontuários e Buscas Clínicas (CWE-94, CWE-95 & OWASP ASVS v4.0 V5.2) | [PR #87](https://github.com/linuxsoares/terapiainfoco/pull/87) | Merged |
| `feat/graphql-query-cost-guard` | Proteção Avançada contra Injeção de Consultas GraphQL, Introspecção Maliciosa & Query Cost Limiting (OWASP ASVS v4.0 V5.1 & GraphQL Security Best Practices) | [PR #88](https://github.com/linuxsoares/terapiainfoco/pull/88) | Merged |
| `feat/http2-grpc-header-guard` | Proteção contra Injeção de Cabeçalhos e Split de Requisições HTTP/2 & gRPC (CWE-113, CWE-444 & RFC 9113 HTTP/2 Desync / Request Smuggling) | [PR #89](https://github.com/linuxsoares/terapiainfoco/pull/89) | Merged |
| `feat/supply-chain-dependency-guard` | Proteção contra Injeção de Dependências Dinâmicas & Supply Chain Guard (SLSA L3, SCVS v1.0, RFC SRI, CWE-470, CWE-912) | [PR #90](https://github.com/linuxsoares/terapiainfoco/pull/90) | Merged |
| `feat/recurrent-booking-reminders-clinical-timeline` | Agendamento Recorrente & Séries Clínicas, Notificações & Lembretes Multicanal WhatsApp/Email (CFP nº 011/2018) e Linha do Tempo Clínica Longitudinal do Paciente (RFC-001 §3.1, §3.4) | [PR #91](https://github.com/linuxsoares/terapiainfoco/pull/91) | Merged |
| `feat/clinical-session-markers-and-smart-plans` | Marcadores Clínicos em Tempo Real na Teleconsulta (§3.3), Metas Terapêuticas SMART & Escalas Psicométricas Padronizadas PHQ-9 e GAD-7 (RFC-001 §3.4 / CFP) | [PR #92](https://github.com/linuxsoares/terapiainfoco/pull/92) | Merged |
| `feat/consolidated-clinical-reports-and-referrals` | Laudos Periciais Multi-Sessões & Relatórios Psicológicos Consolidados (CFP nº 006/2019) e Encaminhamentos Multidisciplinares Interoperáveis com Contra-Referência Médica (RFC-001 §3.5) | [PR #93](https://github.com/linuxsoares/terapiainfoco/pull/93) | Merged |
| `feat/clinical-billing-receipts-and-fee-terms` | Faturamento Clínico, Emissão de Recibos para Reembolso de Convênio/DMED com Assinatura Digital e Termo de Honorários Psicológicos (RFC-001 §3.6) | [PR #94](https://github.com/linuxsoares/terapiainfoco/pull/94) | Merged |
| `feat/webrtc-teleconsultation-and-waiting-room` | Teleconsulta Nativa WebRTC P2P com Sala de Espera Ética (Knocking CFP nº 011/2018), Gravação Consentida TCLE, Telemetria MOS ITU-T G.107 e Painel de Marcadores Clínicos (RFC-001 §3.2, §3.3) | [PR #95](https://github.com/linuxsoares/terapiainfoco/pull/95) | Merged |
| `feat/ai-transcription-diarization-soap-synthesizer` | Transcrição Assistida por IA com Diarização de Voz, Escuta Ativa (Talk-to-Listen Ratio) e Síntese de Rascunho SOAP Human-in-the-Loop (RFC-001 §3.3) | [PR #96](https://github.com/linuxsoares/terapiainfoco/pull/96) | Merged |
| `feat/patient-portal-and-therapeutic-exercises` | Portal do Paciente Autenticado com Acesso a Exercícios Terapêuticos Interativos (TCC/ACT/DBT), Histórico de Recibos para Reembolso e Termos TCLE (RFC-001 §3.6, §3.7) | [PR #98](https://github.com/linuxsoares/terapiainfoco/pull/98) | Merged |
| `feat/interactive-diagnostic-tree-and-initial-scales` | Anamnese Digital Interativa com Árvore de Decisão Diagnóstica e Escalas Psicométricas Iniciais (RFC-001 §3.4) | [PR #99](https://github.com/linuxsoares/terapiainfoco/pull/99) | Merged |
| `feat/psychiatric-referral-and-drug-interactions` | Prescrição & Encaminhamento Psiquiátrico com Validação Cruzada de Medicamentos e Interações Farmacológicas (RFC-001 §3.5) | [PR #100](https://github.com/linuxsoares/terapiainfoco/pull/100) | Merged |
| `feat/v0-encrypted-portability-and-websocket-guard` | Fechamento do Marco V0: Cofre de Portabilidade Cifrado `.enc` (Argon2id + AES-256-GCM + Merkle Tree LGPD Art. 18) e Proteção contra Injeção de Objetos & Desserialização WebSocket (RFC 6455 / CWE-502) | [PR #101](https://github.com/linuxsoares/terapiainfoco/pull/101) | Merged |
| `feat/public-showcase-auth-social-and-profiles` | Vitrine Pública Sem Login, Login Unificado (OAuth Social Google/Gov.br/Apple/Passkey + E-mail/Senha 2FA), Criação de Perfil Com/Sem Login Social e Perfis Dedicados (Paciente, Psicólogo e Admin/DPO) | [PR #102](https://github.com/linuxsoares/terapiainfoco/pull/102) | Merged |
| `feat/webrtc-real-camera-microphone-signaling` | Captura Real de Câmera e Microfone via `getUserMedia`, Seletor de Hardware (`enumerateDevices`), Medidor de Voz em Tempo Real (`AudioContext` VU Meter), Compartilhamento de Tela (`getDisplayMedia`), Gravação Local (`MediaRecorder` `.webm`) e Loopback/Sinalização WebRTC P2P (`RTCPeerConnection`) | [PR #103](https://github.com/linuxsoares/terapiainfoco/pull/103) | Merged |
| `fix/crypto-stable-keys` | Chaves FLE/KMS estáveis via ambiente (`FIELD_ENCRYPTION_KEY`, `KMS_MASTER_KEY`) e segredos obrigatórios em produção (fail-fast) | [PR #104](https://github.com/linuxsoares/terapiainfoco/pull/104) | Merged |
| `feat/db-bootstrap-hardening` | Bootstrap explícito do banco: `DATABASE_URL` obrigatório em produção, migrações com baseline controlado, `DEMO_MODE` e `PGLITE_DATA_DIR` | [PR #105](https://github.com/linuxsoares/terapiainfoco/pull/105) | Merged |
| `feat/durable-entity-store` | Persistência durável de todas as coleções no PostgreSQL via `entity_store` (ADR-004): flush transacional por requisição, hidratação no boot e importação legada | [PR #106](https://github.com/linuxsoares/terapiainfoco/pull/106) | Merged |
| `fix/authz-require-authentication` | Autenticação obrigatória (fim da personificação sem token), agenda/pacientes escopados ao consultório, cadastro público sem Admin e `admin:create` | [PR #107](https://github.com/linuxsoares/terapiainfoco/pull/107) | Merged |
| `fix/authz-ownership-and-clinical-access` | Posse por consultório (`accessPolicy`) em pacientes, consultas e prontuários; Admin/DPO sem acesso clínico; matriz de acesso no RFC-001 §4.5 | [PR #108](https://github.com/linuxsoares/terapiainfoco/pull/108) | Merged |
| `fix/authz-clinical-modules-ownership` | Posse por consultório e restrição clínica em documentos CFP, transcrições (clássica/IA), marcadores, metas e escalas | [PR #109](https://github.com/linuxsoares/terapiainfoco/pull/109) | Merged |
| `feat/role-based-dynamic-menus` | Menus dinâmicos por perfil (`MODULE_ACCESS` compartilhado), módulo Meu Espaço do paciente, `/appointments/mine` e backups exclusivos do Admin | [PR #110](https://github.com/linuxsoares/terapiainfoco/pull/110) | Merged |
| `feat/therapist-search-backend` | Busca pública de psicólogos (backend): `therapist_profiles` com full-text GIN, perfil público por slug, edição pelo psicólogo e verificação de CRP pelo Admin | [PR #111](https://github.com/linuxsoares/terapiainfoco/pull/111) | Merged |
| `feat/therapist-search-frontend` | Diretório público de psicólogos na vitrine, módulos Encontrar Psicólogo / Meu Perfil Público / Verificação de CRP | [PR #112](https://github.com/linuxsoares/terapiainfoco/pull/112) | Merged |
| `feat/patient-booking-from-profile` | Agendamento pelo paciente a partir do perfil público (vínculo paciente ↔ consultório), correção de IDOR no cadastro e do agendamento público | [PR #113](https://github.com/linuxsoares/terapiainfoco/pull/113) | Merged |
| `feat/patient-booking-frontend` | Agendamento pelo paciente no perfil do psicólogo, Minhas consultas, fim do fallback para paciente demo e horários no fuso da clínica | [PR #114](https://github.com/linuxsoares/terapiainfoco/pull/114) | Merged |
| `fix/authz-remaining-modules-ownership` | Posse por consultório nos módulos restantes: encaminhamentos, laudos, recibos, teleconsulta, árvore diagnóstica, psiquiátrico, ICP, consentimento e cofre | [PR #115](https://github.com/linuxsoares/terapiainfoco/pull/115) | Merged |
| `fix/demo-ui-only-in-demo-mode` | Atalhos 1-clique, credenciais demo e seletor de perfis apenas em `DEMO_MODE` (`/api/auth/public-config`); troca de perfil exige login real | [PR #116](https://github.com/linuxsoares/terapiainfoco/pull/116) | Merged |
| `fix/audit-trail-practice-scope` | Trilha de auditoria do psicólogo restrita ao consultório; governança, RIPD/DPIA e pentest exclusivos do DPO | [PR #117](https://github.com/linuxsoares/terapiainfoco/pull/117) | Merged |
| `fix/kms-rotation-durable` | Rotação de KEK durável: versões derivadas via HKDF da `KMS_MASTER_KEY` e estado do KMS (versão ativa/revogações) persistido | [PR #118](https://github.com/linuxsoares/terapiainfoco/pull/118) | Merged |
| `feat/patient-actions-by-role` | Ações do módulo de pacientes por perfil (`PATIENT_ACTION_ACCESS`), recepção sem ações clínicas e contrato com o backend | [PR #119](https://github.com/linuxsoares/terapiainfoco/pull/119) | Merged |
| `refactor/remove-google-meet` | Remoção do Google Meet: sala de teleconsulta própria por consulta (`roomUrl`), RFC-001 v1.2.0 com ADR-005 | [PR #120](https://github.com/linuxsoares/terapiainfoco/pull/120) | Merged |
| `feat/teleconsulta-chamada-real` | Chamada real psicólogo ↔ paciente: sinalização WebRTC efêmera, sala de espera autenticada, `TeleconsultationRoom`, link `?sala=` e E2E com dois Chrome | [PR #121](https://github.com/linuxsoares/terapiainfoco/pull/121) | Merged |
| `refactor/teleconsulta-sem-gravacao` | Remoção da gravação de sessões e do módulo de mídia gravada (ADR-005) | [PR #122](https://github.com/linuxsoares/terapiainfoco/pull/122) | Merged |
| `feat/teleconsulta-transcricao-stt` | Transcrição ao vivo por STT no servidor (áudio descartado, texto cifrado), painel na sala e SOAP a partir da transcrição | [PR #123](https://github.com/linuxsoares/terapiainfoco/pull/123) | Merged |
| `fix/admin-create-visivel-no-login` | Admin criado via `admin:create` loga sem reiniciar o servidor; script recusa banco temporário | [PR #124](https://github.com/linuxsoares/terapiainfoco/pull/124) | Merged |
| `fix/link-sala-teleconsulta` | Link da sala usa a URL do site no painel; `PUBLIC_APP_URL` obrigatória em produção (sem localhost) | [PR #125](https://github.com/linuxsoares/terapiainfoco/pull/125) | Merged |
| `fix/sessao-persistente-no-refresh` | Sessão persistente ao recarregar (última tela), renovação automática do access token com refresh rotacionado e E2E de sessão | [PR #126](https://github.com/linuxsoares/terapiainfoco/pull/126) | Merged |
| `fix/consentimento-transcricao-na-sala` | Paciente autoriza a transcrição na sala; nova autorização limpa revogação; erros do SOAP e da OpenAI explicam o motivo | [PR #127](https://github.com/linuxsoares/terapiainfoco/pull/127) | Merged |
| `fix/transcricao-preenchida-no-soap` | Transcrição da sala aparece preenchida no campo do SOAP (sem edição usa a original) | [PR #128](https://github.com/linuxsoares/terapiainfoco/pull/128) | Merged |
| `fix/soap-sintetizado-por-ia` | Rascunho SOAP sintetizado pela OpenAI a partir das falas (sem conteúdo fixo, sem CID padrão) | [PR #129](https://github.com/linuxsoares/terapiainfoco/pull/129) | Merged |
| `feat/busca-paciente-nome-email` | Busca de pacientes por nome ou e-mail (sem acento, restrita ao consultório, auditada) | [PR #130](https://github.com/linuxsoares/terapiainfoco/pull/130) | Merged |
| `fix/dashboard-psicologo-metricas` | Dashboard usa o consultório do usuário logado; SOAP por IA salvo como prontuário válido; auditoria encadeada; correção de registros antigos | [PR #131](https://github.com/linuxsoares/terapiainfoco/pull/131) | Merged |
| `fix/auth-social-e-listagem-perfis` | Login social só em `DEMO_MODE` (sem verificação OIDC permitia entrar em qualquer conta pelo e-mail), listagem de perfis restrita ao Admin, campos de perfil por papel | [PR #132](https://github.com/linuxsoares/terapiainfoco/pull/132) | Merged |
| `fix/agenda-ciclo-de-vida-sessao` | Iniciar/concluir sessão só pelo psicólogo e no horário; paciente não vê sala de sessão encerrada; cancelamento pela agenda como do terapeuta | [PR #133](https://github.com/linuxsoares/terapiainfoco/pull/133) | Merged |
| `feat/paciente-meus-psicologos` | "Meu psicólogo" no Meu Espaço com agendamento direto da próxima sessão; paciente vinculado agenda mesmo com perfil fora da busca | [PR #134](https://github.com/linuxsoares/terapiainfoco/pull/134) | Merged |
| `feat/admin-observabilidade` | Dashboard do psicólogo só com indicadores clínicos; segurança e telemetria em módulo próprio do Admin (fim dos 403 em `/system/telemetry/*`) | [PR #135](https://github.com/linuxsoares/terapiainfoco/pull/135) | Merged |
| `feat/agenda-selecao-paciente` | Agendamento pela agenda escolhe o paciente por busca de nome/e-mail no consultório (fim do campo de ID livre) | [PR #136](https://github.com/linuxsoares/terapiainfoco/pull/136) | Merged |
| `fix/ajustes-perfil-interface` | Rótulos de papel amigáveis, sem "Criar Novo Perfil" para logado, erro real ao salvar perfil, Recepção fora da sala de teleconsulta | [PR #137](https://github.com/linuxsoares/terapiainfoco/pull/137) | Merged |
| `fix/linguagem-produto-painel` | Remove jargão interno (RFC-001, numeração de módulos, enums crus) da navegação e dos módulos do consultório | [PR #138](https://github.com/linuxsoares/terapiainfoco/pull/138) | Merged |
| `fix/acoes-duplicadas-topo-sidebar` | Um único ponto de acesso para Meu Perfil, Vitrine e Segurança & 2FA | [PR #139](https://github.com/linuxsoares/terapiainfoco/pull/139) | Merged |
| `feat/agenda-nome-paciente` | Cartões da agenda mostram o nome do paciente (`patientName` na agenda do consultório) | [PR #140](https://github.com/linuxsoares/terapiainfoco/pull/140) | Merged |
| `fix/admin-governanca-dados-reais` | Pacote de conformidade sem identidade fixa e score calculado com 2FA da equipe, backups e OTLP reais | [PR #141](https://github.com/linuxsoares/terapiainfoco/pull/141) | Merged |
| `feat/troca-de-senha` | Troca da própria senha em Segurança, com encerramento das demais sessões | [PR #142](https://github.com/linuxsoares/terapiainfoco/pull/142) | Merged |
| `fix/remove-fallback-supabase-auth` | Remove login e tokens via Supabase Auth (tomada de conta pelo e-mail e papel declarado pelo próprio usuário) | [PR #143](https://github.com/linuxsoares/terapiainfoco/pull/143) | Merged |
| `feat/admin-gestao-equipe` | Módulo Equipe: Admin cria Recepção/Supervisor vinculados a um consultório | [PR #144](https://github.com/linuxsoares/terapiainfoco/pull/144) | Merged |
| `fix/landing-sem-simulacoes` | Landing sem respostas simuladas (inclusive documento "válido" falso) e URL da API configurada no deploy | [PR #145](https://github.com/linuxsoares/terapiainfoco/pull/145) | Merged |
| `feat/landing-busca-e-entrar` | Landing leva à busca de psicólogos e ao login do painel (fim do agendamento fixo em uma psicóloga) | [PR #146](https://github.com/linuxsoares/terapiainfoco/pull/146) | Merged |
| `feat/landing-leads` | Formulário de demonstração grava pedidos de acesso (contato cifrado) e Admin os vê em "Pedidos de Acesso" | [PR #147](https://github.com/linuxsoares/terapiainfoco/pull/147) | Merged |
| `feat/landing-dark-mode` | Dark Mode na landing page com botão de tema e preferência do sistema | [PR #148](https://github.com/linuxsoares/terapiainfoco/pull/148) | Merged |
| `feat/equipe-desativar-reemitir` | Desativar/reativar conta da equipe, reemitir senha inicial e troca obrigatória no primeiro acesso | [PR #149](https://github.com/linuxsoares/terapiainfoco/pull/149) | Merged |
| `fix/pacotes-conformidade-duraveis` | Pacotes de conformidade persistidos e métricas com versão real da KEK | [PR #150](https://github.com/linuxsoares/terapiainfoco/pull/150) | Merged |
| `chore/remove-agendamento-anonimo` | Remove o agendamento público anônimo da API e estabiliza a simulação de timing attack | [PR #151](https://github.com/linuxsoares/terapiainfoco/pull/151) | Merged |
| `fix/seguranca-pessoal-e-linguagem` | Segurança mostra só a própria conta (ferramentas da plataforma para o Admin), linguagem da vitrine e correção da tela do Admin | [PR #152](https://github.com/linuxsoares/terapiainfoco/pull/152) | Merged |
| `fix/auditoria-ator-e-detalhes` | Auditoria grava o ator correto e os detalhes do evento (com hash compatível com a cadeia existente) | [PR #153](https://github.com/linuxsoares/terapiainfoco/pull/153) | Merged |
| `fix/tipos-portal-e-modelos` | Corrige bugs revelados pelo typecheck: ICP em lote, laudo consolidado, WebAuthn RP ID, descarte seguro, notário, portabilidade, health check, portal do paciente | [PR #154](https://github.com/linuxsoares/terapiainfoco/pull/154) | Merged |
| `fix/webauthn-endurecimento` | Corrige tomada de conta por passkey (chave MOCK sem verificação de assinatura) e implementa as checagens WebAuthn | [PR #155](https://github.com/linuxsoares/terapiainfoco/pull/155) | Merged |
| `feat/leads-aprovacao` | Admin aprova (cria conta de psicólogo com senha inicial) ou recusa os pedidos de acesso da landing | [PR #156](https://github.com/linuxsoares/terapiainfoco/pull/156) | Merged |
| `fix/auditoria-ator-servicos-seguranca` | Exige login de Admin nas 33 rotas de ferramentas da plataforma, antes abertas sem autenticação | [PR #157](https://github.com/linuxsoares/terapiainfoco/pull/157) | Merged |
| `fix/auditoria-ator-real` | Auditoria de tokens efêmeros, GraphQL Guard e DID grava o usuário autenticado como ator | [PR #158](https://github.com/linuxsoares/terapiainfoco/pull/158) | Merged |
| `fix/monitor-sintetico-isolado` | Monitor sintético roda em consultório isolado e limpa os registros ao fim | [PR #159](https://github.com/linuxsoares/terapiainfoco/pull/159) | Merged |
| `fix/typecheck-crypto-exports` | Zera os erros de tipo do pacote crypto (barrel ambíguo, enums do shared, JWK, política de supply chain) | [PR #160](https://github.com/linuxsoares/terapiainfoco/pull/160) | Merged |
| `fix/typecheck-backend` | Zera os erros de tipo do backend e coloca o typecheck no `make test` e no CI | [PR #161](https://github.com/linuxsoares/terapiainfoco/pull/161) | Merged |
| `feat/backups-object-storage` | Snapshots de backup cifrados em object storage S3/R2, recarregados no boot, e documentação dos backups gerenciados do PostgreSQL | [PR #162](https://github.com/linuxsoares/terapiainfoco/pull/162) | Merged |
| `chore/lint-floating-promises` | Lint de promessas no backend (await esquecido) no `make test` e no CI, preparando os repositórios SQL assíncronos | [PR #164](https://github.com/linuxsoares/terapiainfoco/pull/164) | Merged |
| `feat/user-repository-sql` | Contas de usuário em repositório SQL assíncrono (ADR-004 fase 2), fora do cache em memória | [PR #165](https://github.com/linuxsoares/terapiainfoco/pull/165) | Merged |
| `feat/patient-repository-sql` | Pacientes em repositório SQL assíncrono (ADR-004 fase 2), fora do cache em memória | [PR #166](https://github.com/linuxsoares/terapiainfoco/pull/166) | Merged |
| `feat/appointment-repository-sql` | Consultas em repositório SQL assíncrono (ADR-004 fase 2), fora do cache em memória | [PR #167](https://github.com/linuxsoares/terapiainfoco/pull/167) | Merged |
| `feat/clinical-record-repository-sql` | Prontuários SOAP em repositório SQL assíncrono (ADR-004 fase 2), fora do cache em memória | [PR #168](https://github.com/linuxsoares/terapiainfoco/pull/168) | Merged |
| `fix/migrations-legacy-fkey-names` | Migrações 0004–0007 removem FKs legadas `*_fkey` (supabase_full_schema.sql) antes da troca uuid → text | [PR #169](https://github.com/linuxsoares/terapiainfoco/pull/169) | Merged |
| `fix/admin-no-clinical-analytics` | Admin/DPO sem acesso a métricas clínicas e trechos de SOAP (`/api/analytics`), conforme RFC §4.5 | [PR #170](https://github.com/linuxsoares/terapiainfoco/pull/170) | Merged |
| `fix/teleconsultation-room-roles` | Sala de teleconsulta e sinalização WebRTC restritas a paciente, psicólogo e supervisor (`TELECONSULTATION_ROLES`) | [PR #171](https://github.com/linuxsoares/terapiainfoco/pull/171) | Merged |
| `fix/platform-routes-admin-only` | Ferramentas de operação da plataforma (WAF, ZKP, DLP, cartório, expurgo, marca d’água etc.) restritas ao Admin/DPO | [PR #172](https://github.com/linuxsoares/terapiainfoco/pull/172) | Merged |
| `feat/practice-access-history` | Auditoria do psicólogo vira "Histórico de Acessos" do consultório; verificação da cadeia sem dados de outros consultórios | [PR #173](https://github.com/linuxsoares/terapiainfoco/pull/173) | Merged |
| `test/access-matrix` | Teste permanente da matriz de acesso: todas as rotas GET × perfis, invariantes clínicas e snapshot versionado | [PR #174](https://github.com/linuxsoares/terapiainfoco/pull/174) | Merged |
| `fix/soap-draft-per-appointment` | Prontuário único por consulta: rascunho atualizado no lugar, paciente/sessão derivados da consulta e rota por consulta | [PR #176](https://github.com/linuxsoares/terapiainfoco/pull/176) | Merged |
| `feat/soap-linked-to-appointment` | Evolução SOAP vinculada à consulta real: seletor, prontuário real, transcrição da teleconsulta e minuta pelo pipeline de IA | [PR #177](https://github.com/linuxsoares/terapiainfoco/pull/177) | Merged |
| `refactor/remove-legacy-soap-demo` | Remove transcrição fictícia e SOAP fixo; pipeline real exige consentimento AI_CLINICAL_SYNTHESIS e paciente da consulta | [PR #178](https://github.com/linuxsoares/terapiainfoco/pull/178) | Merged |
| `feat/logo-home` | Logo do topo leva à tela inicial de cada perfil | [PR #179](https://github.com/linuxsoares/terapiainfoco/pull/179) | Merged |

---

## 🚀 O Que Precisamos Fazer (Próximos Passos Prioritários — Marco V0 100% Concluído & Evolução V1)

Com o **Marco V0 100% Concluído + Experiência de Entrada, Perfis & Teleconsulta Real WebRTC V1** — contemplando a Vitrine Pública Sem Login, Login e Criação de Perfil Com/Sem Login Social (`PACIENTE`, `PSICOLOGO_TITULAR`, `ADMIN`), Captura Real de Câmera e Microfone na Teleconsulta WebRTC P2P, todos os 18 módulos clínicos da especificação **RFC-001** e todas as 74 camadas de **Governança, Hardening Criptográfico & Proteção em Tempo Real**, respaldados por **1.386 testes automatizados (0 falhas em 142 arquivos)** — o estado atual e os próximos passos rumo ao **Marco V1** são:

#### 🧱 Fundação de Produção V1 (Prioridade Máxima — Persistência Real, Perfis & Busca)
> Diagnóstico de 19/10/2026: o `memoryDb` (RAM) ainda é a fonte de verdade; só usuários, pacientes e agendamentos são copiados para o PostgreSQL (em fire-and-forget) e as chaves FLE/KMS eram aleatórias a cada boot. Nenhum novo módulo de segurança deve entrar antes desta fundação.

- [x] **Chaves criptográficas estáveis entre deploys:** `FIELD_ENCRYPTION_KEY` e `KMS_MASTER_KEY` via ambiente; `JWT_SECRET`, `BLIND_INDEX_SALT` e chaves obrigatórios em produção (fail-fast).
- [x] **Bootstrap explícito do banco:** `DATABASE_URL` obrigatório em produção, migrações sem engolir erros (baseline controlado para schemas pré-existentes), inicialização única concorrente, seed de demonstração restrito a `DEMO_MODE` e `PGLITE_DATA_DIR` para dev local persistente.
- [x] **Persistência durável de todas as coleções no PostgreSQL** (ADR-004 do RFC-001): tabela `entity_store` (JSONB), hidratação no boot, flush transacional antes de cada resposta (503 se falhar), flush periódico + varredura completa, gravação no `SIGTERM`, importação única das tabelas legadas e remoção das escritas fire-and-forget/PostgREST.
- [ ] **[Fase 2 do ADR-004] Repositórios SQL assíncronos** para usuários, pacientes, agendamentos e prontuários (habilita múltiplas réplicas).
  - [x] Lint de promessas no backend (`no-floating-promises`, `no-misused-promises`, `await-thenable`) no `make test`/CI: pega `await` esquecido (`if (!promessa)` sempre falso). Corrigidos 49 `globalRateLimitStore.reset()` sem `await` nos testes e 103 `await` em `AuditService.log` (síncrono).
  - [x] `users` → `UserRepository` SQL: tabela `users` redefinida (todos os campos do modelo, ids em texto, e-mail único sem diferenciar maiúsculas); contas fora do `memoryDb`/`entity_store` (movidas uma vez no boot); seed demo no banco; padrão carregar → alterar → `save`; middleware autentica com uma consulta; trilha de auditoria do consultório carrega a equipe uma vez; titular do consultório via `findPracticeOwner` (antes portal, portabilidade e cofre pegavam qualquer conta do consultório, inclusive a recepção); reparo legado de SOAP (pré-#131) removido; `resetDb()` nos testes.
  - [x] `patients` → `PatientRepository` SQL: tabela `patients` redefinida (ids e `therapistId` em texto, `linked_user_id` com índice, FKs legadas para `patients`/`therapists` removidas); pacientes fora do `memoryDb`/`entity_store` (movidos uma vez no boot, o `entity_store` prevalece); paciente demo semeado no banco; buscas por blind index de CPF/e-mail no SQL; política de acesso (`canAccessPatient`/`canAccessAppointment`/`canAccessEntity`) assíncrona; trilha de auditoria do consultório carrega os ids de pacientes uma vez; quarentena, revogação, expurgo e vínculo do portal gravam com `save`; restauração de backup substitui a tabela.
  - [x] `appointments` → `AppointmentRepository` SQL: tabela `appointments` redefinida (ids em texto, série recorrente e lembretes como colunas, campos do Google Meet removidos, FKs legadas para `appointments`/`therapists` removidas); consultas fora do `memoryDb`/`entity_store` (movidas uma vez no boot) e importação legada encerrada; conflito de agenda consultado no SQL (sobreposição com buffer, sem canceladas); consulta demo semeada no banco e fim da recriação automática da sessão demo em SOAP/transcrição; expurgo seguro remove as transcrições das consultas expurgadas (antes comparava `appointmentId` com o id do paciente); monitor sintético limpa as entidades ligadas às consultas da sondagem; agenda do frontend usa `seriesId`/`sequenceNumber` (o selo de série e o cancelamento em lote nunca apareciam).
  - [x] `clinicalRecords` → `ClinicalRecordRepository` SQL: tabela `clinical_records` redefinida (ids em texto, `batch_closing_manifest_id` do fechamento em lote ICP-Brasil, índices por consultório e consulta, FKs legadas removidas); prontuários fora do `memoryDb`/`entity_store` (movidos uma vez no boot); imutabilidade do prontuário assinado verificada no SQL; posse (`canAccessClinicalRecord`) assíncrona; expurgo, backup e monitor sintético apagam/restauram na tabela; a migração do `entity_store` dos três domínios virou uma função só (`moveOutOfEntityStore`). A trava do lote ICP gravava `lockedByBatchSignature`, que ninguém lia: ficou só o id do manifesto.
  - [ ] Estado restante em memória por instância (KMS, rate limit sem Redis, ledger de consentimento, tokens efêmeros, sinalização WebRTC) para de fato rodar várias réplicas.
- [x] **Rotação de KEK do KMS durável:** versões ≥ 2 derivadas da `KMS_MASTER_KEY` via HKDF-SHA256 (reconstruíveis após restart), estado do KMS (versão ativa e revogações) persistido no `entity_store` e restaurado no boot.
- [x] **Backups fora do processo:** snapshots cifrados (envelope KMS) enviados a object storage S3-compatível (S3/R2/MinIO via `Bun.S3Client`, variáveis `BACKUP_S3_*`); falha no envio falha o backup; boot recarrega os 20 mais recentes e verificação/restauração/download buscam no bucket os demais; resultado da verificação regravado no bucket; governança marca offsite só com bucket configurado; aviso no painel quando os snapshots estão só em memória; `docs/RAILWAY_DEPLOYMENT.md` documenta as variáveis, retenção por ciclo de vida, guarda da `KMS_MASTER_KEY` e os backups gerenciados do PostgreSQL (Supabase/Railway).
- [ ] **Cobertura do snapshot de backup:** o dump inclui só 8 coleções (usuários, pacientes, consultas, prontuários, documentos, transcrições, terapeutas, auditoria) e a restauração substitui só essas; consentimentos, leads, metas, recibos, perfis públicos e as demais coleções do `entity_store` ficam de fora.
- [x] **Separação de perfis (1/2) — autenticação real:** fim da personificação automática da psicóloga padrão em requisições sem token, agenda e cadastro/busca de pacientes restritos à equipe do consultório (`PRACTICE_STAFF_ROLES`) e escopados ao `therapistId` do usuário, `actorId` real na auditoria, cadastro público limitado a Paciente/Psicólogo, consentimento de transcrição não presumido e `bun run admin:create` para contas Admin/DPO.
- [x] **Separação de perfis (2/2) — posse e conteúdo clínico (rotas centrais):** política `accessPolicy` (posse por `therapistId`, 404 para recursos alheios) em pacientes, consultas e prontuários; busca por CPF restrita ao consultório; Admin/DPO sem acesso a prontuário/anamnese/linha do tempo/exportação, mantendo revogação de consentimento e quarentena (LGPD Art. 18); matriz de acesso no RFC-001 §4.5.
- [x] **Posse nos módulos de conteúdo clínico:** documentos CFP, transcrições (clássica e IA), marcadores, metas e escalas restritos a `CLINICAL_ROLES` com posse por paciente/consulta (`requireBodyOwnership`, `requireOwnedResource`); Admin/DPO sem acesso.
- [x] **Posse nos módulos restantes:** encaminhamentos, laudos consolidados, recibos/contratos (listagem escopada ao consultório), teleconsulta (paciente e psicólogo da própria consulta), árvore diagnóstica e encaminhamento psiquiátrico (antes abertos a qualquer perfil), lote ICP (só titular), exercícios atribuídos, consentimento (com acesso do DPO) e cofre de portabilidade (agora também para o próprio paciente).
- [x] **Menus dinâmicos por perfil:** `MODULE_ACCESS` em `@terapiainfoco/shared` dirige sidebar, menu mobile e barra inferior (sem cadeados nem tela de "acesso restrito"); módulo "Meu Espaço" para o paciente (que deixa de ver a agenda do consultório); backups restritos ao Admin; `GET /api/appointments/mine` corrige a agenda que pedia o id do usuário no lugar do consultório; teste de contrato menu ↔ backend.
- [x] **Ações por perfil dentro dos módulos:** `PATIENT_ACTION_ACCESS` (shared) controla os botões do módulo de pacientes (recepção sem ações clínicas, exportação/revogação/quarentena só do titular), com teste de contrato contra o backend; leitura do histórico de consentimento alinhada a quem pode registrá-lo.
- [x] **Trilha de auditoria do psicólogo filtrada pelo próprio consultório** (atores da equipe ou recursos clínicos do consultório) em listagem, relatório e exportações; governança, RIPD/DPIA e pentest exclusivos do Admin/DPO, com abas ocultas para o psicólogo.
- [x] **"Minhas consultas" no Meu Espaço do paciente.**
- [x] **Vínculo paciente ↔ psicólogo no agendamento** (fim do `therapist-001` fixo no autocadastro de pacientes).
- [x] **Interface demo apenas em `DEMO_MODE`:** `GET /api/auth/public-config` informa o modo ao frontend (padrão desligado); atalhos 1-clique, credenciais pré-preenchidas, seletor "Alternar Perfil" e simulador RBAC só aparecem em demonstração; a troca de perfil exige login real (sem troca cosmética); vitrine não oferece cadastro de Admin.
- [ ] **Rotas por área no frontend** (`/paciente`, `/psicologo`, `/admin`) com URL própria por módulo (hoje a navegação é por estado, já filtrada por perfil).
- [x] **Busca pública de psicólogos (backend):** tabela `therapist_profiles` com full-text (`tsvector` + GIN), `GET /api/therapists/search` (texto sem acento/por prefixo, abordagem, especialidade, valor máximo, paginação), página pública por slug, edição pelo psicólogo (`/me/profile`), verificação de CRP pelo Admin (`/admin/pending`, `/admin/:id/verify-crp`) e perfil demo em `DEMO_MODE`.
- [x] **Busca pública de psicólogos (frontend):** diretório sem login na vitrine ("Encontrar Psicólogo") com filtros e perfil detalhado; módulos dinâmicos "Encontrar Psicólogo" (paciente), "Meu Perfil Público" (psicólogo, com status de verificação e publicação) e "Verificação de CRP" (Admin); fila de CRP restrita a perfis que pediram publicação.
- [x] **Login social sem verificação OIDC fechado em produção:** `POST /api/auth/social` aceitava só o e-mail para emitir tokens de qualquer conta (inclusive Admin); agora existe apenas em `DEMO_MODE` (botões ocultos fora dele). `GET /api/auth/profiles` (e-mails/telefones de todos os usuários) deixou de ser público e é exclusivo do Admin/DPO; edição de perfil aceita só os campos do próprio papel (paciente não declara CRP).
- [ ] **Login social real:** verificar o ID token do provedor (Google/Gov.br/Apple via OIDC) antes de reativar `POST /api/auth/social` fora do `DEMO_MODE`; o botão "Passkey FIDO2" do login deve usar o fluxo WebAuthn existente, não o login social.
- [x] **Ajustes de perfil na interface:** papel exibido por rótulo amigável em todos os pontos (`ROLE_LABELS`: fim do "Meu Perfil (Psicólogo)" para Supervisor/Recepção e do enum cru no menu mobile); "Criar Novo Perfil / Login Social" removido do menu do usuário logado; edição de perfil mostra o erro da API em vez de simular sucesso; Recepção não vê "Sala de Teleconsulta" nem "SOAP IA" na agenda e o link `?sala=` só abre a sala para paciente, psicólogo e supervisor.
- [x] **Ciclo de vida da sessão coerente:** iniciar/concluir/registrar falta só pelo psicólogo ou supervisor e respeitando o horário (iniciar a partir de 15 min antes; concluir em andamento ou após o início; falta só após o horário). Sessões futuras deixam de contar como "concluídas" no dashboard; "Meu Espaço" do paciente não oferece a sala para sessões concluídas/canceladas; cancelamento pela agenda registra `CANCELADA_PELO_TERAPEUTA`.
- [x] **"Meu psicólogo" no Meu Espaço do paciente:** `GET /api/appointments/patient/therapists` lista os psicólogos (CRP verificado) com quem a conta já tem registro, com a próxima sessão e o botão "Agendar nova sessão" abrindo o agendamento direto, sem passar pela busca. Quem já é paciente do consultório continua agendando mesmo que o psicólogo despublique o perfil da busca (novos pacientes, não).
- [x] **Linguagem de produto no painel (consultório):** navegação sem numeração nem "RFC-001" ("Pacientes", "Evolução SOAP & IA", "Auditoria"…), cabeçalho "Gestão clínica e teleconsulta", títulos sem "Módulo N:", selos e parênteses "RFC §x" removidos da agenda, pacientes, SOAP, documentos e modais clínicos, "Paciente (Titular LGPD)" → "Paciente" e status de conformidade traduzidos ("Parcialmente conforme").
- [x] **Segurança da conta e linguagem da vitrine:** o módulo Segurança mostra a todos só a própria conta (2FA, senha, passkeys); os ~40 cartões de simuladores e ferramentas da plataforma (antes visíveis ao psicólogo, e aos demais como avisos de "restrito") e seus carregamentos ficam só para o Admin; textos sem "RFC-001 Opção X"; vitrine pública sem seções da RFC; corrigido `process.pid` no navegador, que derrubava a tela de Segurança do Admin.
- [x] **Ações duplicadas no topo e na sidebar:** módulos (inclusive "Segurança & 2FA", agora com aviso "Ativar 2FA") ficam só na sidebar/menu mobile; "Meu Perfil", "Vitrine Pública" e "Sair" só no menu da conta no topo (fim das pílulas do topo e dos atalhos repetidos na sidebar e no menu mobile).
- [x] **Dashboard do psicólogo sem observabilidade de infraestrutura:** o Dashboard Clínico mostra só indicadores do consultório; as visões de segurança (trilha WORM, alertas) e de desempenho (RED, traces, Prometheus, exportador OTLP) foram para o módulo "Segurança & Observabilidade" (`observability`, exclusivo do Admin), com teste de contrato menu ↔ backend.
- [x] **Painel Admin (1/2) — governança com dados reais:** sem CRP/DPO fixos no código nem pacote fictício no boot (identidade informada pelo Admin, sugerida do último pacote ou de `COMPLIANCE_*` opcionais; sem DPO e CRP o pacote não é emitido); score reflete 2FA da equipe (contas não-paciente), backups (snapshots só em memória = parcialmente conforme) e exportador OTLP; status traduzidos e coloridos por situação.
- [x] **Troca da própria senha:** `POST /api/auth/password` (exige a senha atual, rate limit de autenticação, auditoria `AUTH_PASSWORD_CHANGED`) com cartão "Alterar senha" em Segurança; tokens emitidos antes da troca deixam de valer (outras sessões encerradas) e a sessão atual recebe tokens novos.
- [x] **Fim do fallback de autenticação pelo Supabase:** o login validava a senha no Supabase Auth para uma conta local com o mesmo e-mail e o middleware aceitava tokens do Supabase com papel vindo de `user_metadata` (editável pelo usuário); agora só tokens emitidos pela API e senhas locais valem.
- [x] **Painel Admin (2/2) — gestão de equipe:** módulo "Equipe" (Admin) lista contas não-paciente com consultório e 2FA e cria Recepção/Supervisor vinculados a um consultório (`/api/admin/practices`, `/api/admin/users`), com senha inicial aleatória exibida uma vez e auditoria em nome do Admin.
- [x] **Equipe: desativar conta, reemitir senha e troca obrigatória:** Admin desativa/reativa contas de Recepção/Supervisor (login e tokens já emitidos rejeitados) e reemite a senha inicial (sessões encerradas); senha inicial/reemitida marca `mustChangePassword`, o backend responde `PASSWORD_CHANGE_REQUIRED` em tudo exceto perfil, troca de senha e saída, e o painel mostra só a tela de definição de senha; auditoria `USER_DISABLED`/`USER_ENABLED`/`USER_PASSWORD_RESET`.
- [x] **Histórico de pacotes de conformidade durável:** pacotes emitidos e chancelas do DPO na coleção `compliancePackages` do `entity_store` (sem limite de 20, por serem evidência); métricas passam a aguardar o status do KMS e do rate limit (a versão da KEK aparecia sempre como v1).
- [x] **Erros de tipo no backend (352 → 0):** typecheck do backend no `make test` e no CI.
  - [x] Auditoria (1/4): 46 chamadas passavam `userId` no lugar de `actorId` e 26 não informavam ator (registros sem autor); `details` era descartado em 45 chamadas — agora é gravado (cópia normalizada) e entra no hash só quando presente, mantendo válida a cadeia já gravada; `metadata`/`clientIp`/`therapistId`/`resource` corrigidos.
  - [x] Portal do paciente e modelos (2/4): bugs de comportamento corrigidos — assinatura ICP em lote lia campos SOAP inexistentes (listagem quebrava com prontuário real) e gravava auditoria fora da hash-chain (comprometia a trilha); laudo consolidado quebrava com consultas (`scheduledStartTime`); WebAuthn usava `config.frontendUrl` inexistente (RP ID sempre `localhost`); descarte seguro gravava auditoria com argumentos posicionais (sem ator nem ação) e calculava retenção com `appointment.date`; notário nunca achava retificações; portabilidade exportava metas sem título e descrição; health check marcava webhooks como falhos; ações de auditoria inexistentes (`QUERY`, `READ`, `SIGN`, `SESSION_*`) gravadas como `undefined`; portal do paciente usava datas inexistentes e aceitava refresh tokens e tokens de outros perfis.
  - [x] Pacote crypto (3/4): nomes ambíguos no barrel (`canonicalStringify`, `toBase64Url`, `gcd`, `Token`…) desfeitos com re-exports explícitos; PoW e tarpit usam os enums do `shared` (antes uniões de string incompatíveis); geração de chave RSA cega exporta JWK pelo `KeyObject`; listas opcionais da política de supply chain tratadas (registry sem homologação bloqueia); `@types/bun` no pacote. `packages/crypto` e `packages/shared` com 0 erros.
  - [x] Backend e testes (4/4): `authMiddleware`/`requireRoles`/`rateLimiter` tipados como `MiddlewareHandler` (rotas voltam a tipar `c.req.param`); `success` duplicado nas respostas removido (o spread já prevalecia); `tls-pinning/verify-seal` com `await` (JSON inválido escapava do `try`); auditoria da simulação SSTI gravava `userId`/`metadata` inexistentes (sem autor nem detalhes) e o rate limiter/SSRF usavam `therapistId` ausente como ator — agora o usuário autenticado; utterances do monitor no formato `TranscriptUtterance`; `issueTokens` com tokens obrigatórios no tipo; testes com enums inexistentes (`UserRole.SECRETARIA`, `ReceiptPurpose.PER_SESSION`, `XmlClinicalSchemaType.GENERIC_CLINICAL_XML`, avaliados como `undefined`) e fixtures fora do modelo corrigidos.
  - [x] Typecheck no fluxo de validação: `make test` roda `make typecheck` (shared, crypto, backend, painel e landing, cada um com o próprio TypeScript — antes `bun x tsc` baixava outra versão na raiz) e o workflow `CI` executa typecheck, testes e build do painel em todo PR.
- [x] **Endurecer WebAuthn (tomada de conta corrigida):** o backend ignorava o `attestationObject` do navegador e gravava chave "MOCK"; o login com essas passkeys não verificava assinatura e as opções de login devolviam os `credentialId`s de qualquer e-mail — bastava saber o e-mail para entrar. Agora: CBOR/COSE (ES256, RS256, EdDSA) → PEM no registro, origem, `rpIdHash`, presença do usuário e `credentialId` conferidos, assinatura sempre verificada, contador anti-clone efetivo, desafio por e-mail preso à conta, passkeys legadas recusadas (pedir recadastro) e fim do modo simulado no frontend.
- [x] **Ferramentas da plataforma sem autenticação:** 33 rotas do painel de Segurança (tokens efêmeros, DID, UEBA, session binding, guardas SSRF/SSTI/XML/GraphQL etc.) não tinham `authMiddleware` — qualquer requisição anônima emitia/revogava tokens efêmeros, alterava políticas e lia telemetria. Agora exigem login de Admin (único perfil cujo painel as usa), com teste de contrato (401 anônimo, 403 psicólogo).
- [x] **Revisão de perfis × acessos (PRs #170–#174):** o Admin/DPO não lê mais trechos de SOAP via analytics; a recepção não entra mais na sala de teleconsulta; as ferramentas de operação da plataforma passam a ser só do Admin (e `/api/visual-watermark` passa a exigir login); a auditoria do psicólogo virou "Histórico de Acessos" do consultório; a matriz de todas as rotas GET por perfil virou teste com snapshot (`test/accessMatrix.test.ts`).
- [ ] **Matriz de acesso para rotas de escrita:** o `accessMatrix.test.ts` cobre só GET; estender para POST/PUT/DELETE com corpo mínimo e só no sentido da negação (sem efeitos colaterais).
- [ ] **Papel lido de header nos guardas ReDoS/SSTI:** `x-user-role` decide permissões nessas rotas; usar o perfil do usuário autenticado.
- [x] **Ator real na auditoria dos serviços de segurança:** `EphemeralTokenService`, `GraphQLQueryGuardService` e `ClinicalDidService` recebem o usuário autenticado das rotas (antes `actorId: 'system'`; no DID, o `therapistId` do corpo, `'verifier-public'` ou o DID emissor); o `therapistId` informado segue em `details`.
- [x] **Landing page (1/4) — sem simulações e com API configurada no deploy:** removidos os fallbacks que simulavam horários, agendamento confirmado e **documento válido para qualquer token de 32 caracteres** quando a API não respondia; o build do GitHub Pages recebe `VITE_API_URL`/`VITE_APP_URL` das variáveis `LANDING_API_URL`/`LANDING_APP_URL` do repositório (aviso no workflow se faltarem; sem elas a página informa indisponibilidade, nunca chama `localhost`); meta description sem "Google Meet nativo".
- [x] **Landing page (2/4) — busca de psicólogos e entrada no painel:** widget de agendamento anônimo fixo em `therapist-001`/"Dra. Vanessa Andrade" substituído pela seção "Encontre seu psicólogo" com links para o painel (`?vitrine=psicologos` abre a busca pública; `?cadastro=paciente` e `?entrar` abrem o cadastro/login); botão "Entrar" na navbar. Links ocultos se `VITE_APP_URL` não estiver configurada.
- [x] **Landing page (3/4) — pedidos de acesso reais:** o `LeadModal` envia a `POST /api/leads` (público, 5 pedidos/hora por IP, honeypot, consentimento LGPD explícito — antes vinha marcado), com e-mail e WhatsApp cifrados no `entity_store`; módulo "Pedidos de Acesso" para o Admin; tela de sucesso sem token "BETA" aleatório nem promessa de prazo.
- [x] **Triagem dos pedidos de acesso:** botões Aprovar/Recusar no módulo "Pedidos de Acesso"; aprovar cria a conta de Psicólogo Titular com os dados do pedido (UF do CRP sugerida pelo número do conselho), senha inicial exibida uma vez e troca obrigatória no primeiro acesso, com atalhos de aviso por WhatsApp/e-mail sem a senha; auditoria `LEAD_APPROVED`/`LEAD_REJECTED`.
- [x] **Landing page (4/4) — Dark Mode:** tema escuro pela paleta do Tailwind v4 espelhada em `html.dark` (sem duplicar classes), seções escuras por design preservadas (`.theme-keep`), tema aplicado antes da primeira pintura (preferência salva ou do sistema) e botão de tema na navbar (desktop e mobile).
- [x] **Agendamento a partir do perfil (backend):** `POST /api/appointments/patient/book` e `GET /api/appointments/patient/mine`; registro do paciente criado no consultório escolhido e vinculado à conta (`linkedUserId`); cadastro de paciente não cria mais prontuário em `therapist-001` nem aceita `patientId` informado (IDOR); agendamento público anônimo exige psicólogo verificado, busca CPF no consultório e não presume consentimento.
- [x] **Agendamento a partir do perfil (frontend):** `BookingPanel` (data, horários livres, TCLE e confirmação com link da teleconsulta) no perfil do psicólogo; "Minhas consultas" no Meu Espaço; portal e cofre só aparecem após existir prontuário (fim do fallback para o paciente demo); horários gerados no fuso da clínica (`CLINIC_UTC_OFFSET`, padrão -03:00) e horários passados indisponíveis.

#### 🎥 Teleconsulta Própria sem Gravação (ADR-005 — Prioridade antes do restante do roadmap)
- [x] **Remoção do Google Meet:** OAuth, criação de salas, diagnóstico e campos `meet*` removidos; cada consulta tem o link da sala própria (`PUBLIC_APP_URL/?sala=<id>`); RFC-001 v1.2.0 com §3.2/§3.3 reescritos e ADR-005 (substitui o ADR-001); landing page e vitrine atualizadas.
- [x] **Chamada real psicólogo ↔ paciente:** sinalização WebRTC entre os dois navegadores (barramento efêmero com cursor `época:seq`, JOIN/OFFER/ANSWER/ICE/BYE com `sessionId`), sala de espera autenticada (identidade e nome vindos da sessão), paciente só sinaliza após admitido, abertura pelo link `?sala=`, STUN/TURN configuráveis (`/ice-servers`), telemetria real via `getStats()`; novo `TeleconsultationRoom` substitui o modal com loopback; E2E com dois Chrome (`bun run e2e:teleconsulta`).
- [x] **Agendamento anônimo removido da API:** `POST /api/appointments/public/book` (sem autenticação, sem uso desde a nova landing) deixou de existir; o agendamento é feito pelo paciente logado (`/patient/book`). O método de serviço segue só para o monitor sintético. Acesso de convidado à sala deixa de ser necessário.
- [x] **Monitor sintético sem dados no consultório demo:** a jornada roda no consultório isolado `synthetic-probe` (ator `synthetic-monitor`) e apaga ao fim pacientes, consultas, prontuários, documentos e o ledger de consentimento criados (trilha WORM preservada); consentimento da síntese SOAP registrado explicitamente; passos dependentes falham em vez de usar registros do demo; `bookPublicAppointment` (sem uso) removido.
- [ ] **Consentimento presumido no ledger LGPD:** desde o PR #166 o ledger nasce sob demanda a partir do cadastro (`consentTranscriptionSigned`), sem o `GRANTED` automático para pacientes novos ou inexistentes. Falta: o TCLE de transcrição ainda concede de uma vez os outros escopos (síntese por IA, pesquisa anonimizada, compartilhamento, lembretes); cada escopo deve exigir aceite próprio. O ledger também segue em memória por instância.
- [x] **Remoção da gravação:** sem `MediaRecorder` na sala, rota `/recording` e campos de gravação removidos, módulo de sharding/armazenamento de mídia (`/api/teleconsultation/media`, `packages/crypto/mediaSharding`) e seu card no painel de segurança removidos; escopo de consentimento rotulado como transcrição da fala.
- [x] **Transcrição ao vivo por STT no servidor:** trechos de ~8 s do microfone de cada participante (Opus 32 kbps, sem envio de silêncio) → `POST /transcription/chunk` → provedor de STT (OpenAI `gpt-4o-mini-transcribe`, configurável; `simulated` fora de produção) → texto cifrado em `liveTranscripts`; áudio zerado após o STT; exige consentimento vigente e paciente admitido; painel de transcrição para o psicólogo; rascunho SOAP usa a transcrição da sessão (diálogo de exemplo só em `DEMO_MODE`); E2E valida falas dos dois participantes.
- [x] **Dashboard do psicólogo sem chamadas de telemetria administrativa** (gerava 403 em `/system/telemetry/*`).
- [x] **Seleção de paciente no agendamento:** o modal da agenda busca pacientes do consultório por nome ou e-mail (`GET /api/patients/search`, com espera de 400 ms) em vez do campo de ID livre com `pat-001` pré-preenchido; sem paciente escolhido o agendamento não é enviado.
- [x] **Nome do paciente nos cartões da agenda:** `GET /api/appointments/mine` traz `patientName` (decifrado só para pacientes do próprio consultório, como no dashboard) no lugar de "Paciente ID: xxxxxxxx...".

#### 🔐 Sessão
- [x] **Sessão persistente:** recarregar a página mantém o login e a última tela aberta; access token expirado é renovado com o refresh token (uma renovação em voo, compatível com a rotação); sessão inválida volta à vitrine; E2E `bun run e2e:sessao`.

#### 🌟 Evolução de Produto & Funcionalidades Clínicas (RFC-001)
- [x] **Agendamento Recorrente & Séries Clínicas (RFC-001 §3.1):** Criação e gestão de séries periódicas (semanal, quinzenal, mensal; até 24 sessões) com verificação de conflitos, buffers de respiro e cancelamento em lote.
- [x] **Notificações & Lembretes Multicanal de Teleconsulta (WhatsApp & E-mail - RFC-001 §3.1 / CFP nº 011/2018):** Disparo de mensagens éticas e acolhedoras com link direto wa.me, salas criptografadas com knocking (sala de espera) e auditoria WORM imutável.
- [x] **Linha do Tempo Clínica Longitudinal do Paciente (Timeline - RFC-001 §3.4):** Agregação unificada de consultas, evoluções SOAP assinadas, fichas de anamnese, documentos CFP emitidos e termos TCLE, com taxa de assiduidade dinâmica (attendanceRate).
- [x] **Módulo de Prontuário Multidimensional com Marcadores Clínicos em Tempo Real (RFC-001 §3.3):** Marcação de momentos-chave na sessão durante a teleconsulta (INSIGHT, CRISIS_ALERT, AFFECT_SHIFT, SOMATIC_COMPLAINT, etc.) com notas timestamped criptografadas em repouso (FLE AES-256-GCM) e integração com 1 clique para consolidação preliminar dos quadrantes SOAP.
- [x] **Módulo de Planos Terapêuticos SMART & Escalas Psicométricas Padronizadas (PHQ-9 & GAD-7 - RFC-001 §3.4 / CFP):** Definição de objetivos terapêuticos SMART com mensuração de progresso visual (0% a 100%), e avaliação clínica padronizada com cálculo automático de escores, níveis de severidade, detecção de ideação de autolesão (Item 9 do PHQ-9) com diretrizes éticas CFP imediatas, selo WORM de imutabilidade e análise de tendência longitudinal.
- [x] **Módulo de Laudo Pericial Multi-Sessões & Relatório Consolidado (Resolução CFP nº 006/2019 & RFC-001 §3.5):** Compilação estruturada nas 5 seções canônicas (I - Identificação com CRP, II - Descrição da Demanda, III - Procedimento com sessões da timeline e testes, IV - Análise com evolução psicométrica longitudinal e metas SMART, V - Conclusão com parecer e CID-11) com hash SHA-256 canônico e assinatura digital ICP-Brasil em lote.
- [x] **Módulo de Encaminhamento Multidisciplinar Interoperável & Contra-Referência (RFC-001 §3.5):** Comunicação multiprofissional ética sob o Art. 9º do Código de Ética do Psicólogo, níveis de urgência (ROUTINE, PRIORITY, EMERGENCY), resumo psicométrico objetivo, validação pública anônima sem login por token (iniciais do paciente mascaradas para LGPD/CFP) e registro de contra-referência médica/psiquiátrica.
- [x] **Módulo de Faturamento Clínico, Emissão de Recibos para Reembolso de Convênio/DMED com Assinatura Digital e Termo de Honorários (RFC-001 §3.6).**
- [x] **Módulo de Teleconsulta Nativa WebRTC P2P com Captura Real de Câmera e Microfone (`getUserMedia`), Medidor de Voz em Tempo Real (`AudioContext`), Seletor de Periféricos (`enumerateDevices`), Compartilhamento de Tela (`getDisplayMedia`), Gravação Local (`MediaRecorder`), Sala de Espera Ética (Knocking CFP nº 011/2018) e Marcadores Clínicos (RFC-001 §3.2, §3.3).**
- [x] **Módulo de Telemetria & Qualidade de Chamada Clínica WebRTC com Diagnósticos de Conexão (MOS ITU-T G.107) e Alertas Éticos CFP (RFC-001 §3.2).**
- [x] **Módulo de Transcrição Assistida por IA com Diarização de Voz, Escuta Ativa (Talk-to-Listen Ratio) e Síntese de Rascunho SOAP Human-in-the-Loop (RFC-001 §3.3).**
- [x] **Módulo de Assinatura Avançada ICP-Brasil com Certificado A1/A3 em Lote para Fechamento de Ciclos de Prontuário (RFC-001 §3.5):** Assinatura em lote com árvore de Merkle determinística (SHA-256), Carimbo do Tempo TSA ICP-Brasil (DOC-ICP-11 / política `2.16.76.1.4.1`), credenciais A1/A3 e Nuvem PSC (BirdID/SafeID/NeoID/VIDaaS), token público de verificação notarial sem login, trava WORM contra adulterações e conformidade com MP nº 2.200-2/2001 e Resolução CFP nº 001/2009.
- [x] **Módulo de Portal do Paciente Autenticado com Acesso a Exercícios Terapêuticos e Histórico de Recibos (RFC-001 §3.6, §3.7).**
- [x] **Módulo de Anamnese Digital Interativa com Árvore de Decisão Diagnóstica e Escalas Psicométricas Iniciais (RFC-001 §3.4).**
- [x] **Módulo de Prescrição & Encaminhamento Psiquiátrico com Validação Cruzada de Medicamentos e Interações Farmacológicas (RFC-001 §3.5):** Catálogo de 18 psicofármacos comuns no Brasil, motor de regras farmacológicas cruzadas com matriz de severidade (Contraindicada, Maior, Moderada), alertas de Síndrome Serotoninérgica letal e depressão respiratória, guia interoperável timbrada com token notarial de validação pública e FLE AES-256-GCM para anotações do terapeuta.
- [x] **Módulo de Exportação Segura e Portabilidade de Prontuário Clínico em Pacote Cifrado por Senha do Titular com Verificação de Integridade (RFC-001 §3.3, §4.4 & LGPD Art. 18):** Geração sob demanda de arquivo `.enc` protegido por Argon2id e AES-256-GCM contendo a integralidade dos registros clínicos, sessões, escalas e recibos para cumprimento estrito do direito de portabilidade e autodeterminação informativa.
- [x] **Vitrine Pública Sem Login, Autenticação Unificada (Com ou Sem Login Social: Google, Gov.br ICP-Brasil, Apple, Passkey FIDO2 e E-mail/Senha) & Criação/Gestão de Perfis Dedicados (`PACIENTE`, `PSICOLOGO_TITULAR`, `ADMIN`).**
- [ ] **[V1] Módulo de Supervisão Clínica Ética & Discussão de Casos Anonimizados com Blindagem k-Anonymity (Resolução CFP nº 010/2005 & LGPD Art. 12):** Compartilhamento controlado de recortes clínicos com supervisor credenciado mediante pseudonimização reversível zero-knowledge e revogação automática pós-supervisão.

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
- [x] **Protocolo de Cifragem Homomórfica Parcial (PHE - Paillier Cryptosystem) para agregação estatística segura de diagnósticos CID-11 sem decifragem centralizada.**
- [x] **Proteção Avançada contra Server-Side Request Forgery (SSRF) e DNS Rebinding em Webhooks e Conectores Externos (OWASP API8:2023 & ASVS v4.0).**
- [x] **Módulo de Rate Limiting Avançado com Algoritmo Híbrido Token Bucket + Sliding Window Log para Proteção Anti-DDoS e Abuso de Endpoints Clínicos Sensíveis (OWASP API4:2023 & RFC-001 §4.4, §5.2).**
- [x] **Módulo de Blindagem de Memória & Prevenção de Heap Spraying em Sessões Criptográficas com Secure Memory Allocator e Limpeza Imediata de DEKs (NIST SP 800-88 & OWASP ASVS).**
- [x] **Módulo de TLS Certificate Pinning & Validação Estrita de Cadeia X.509 com HPKP/DANE e Rotação de CAs (RFC-001 §4.4, §5.2 e OWASP MASVS).**
- [x] **Módulo de Avaliação Contínua de Postura de Dispositivo (Zero Trust Device Posture Assessment) para Terminais de Atendimento Clínico (NIST SP 800-207 & OWASP MASVS).**
- [x] **Módulo de Criptografia Pós-Quântica Híbrida (PQC Kyber/ML-KEM & Dilithium/ML-DSA) para Telemedicina e Prontuários Clínicos (NIST FIPS 203 & FIPS 204).**
- [x] **Módulo de Proteção Criptográfica contra Ataques Side-Channel e Timing Attacks (Constant-Time Operations, Blinding & Cache Allocation Shield - NIST SP 800-38D & RFC §4.2, §4.4).**
- [x] **Módulo de Proteção contra Ataques de Replay & Reutilização de Nonce/IV em Sessões WebRTC e Tokens Clínicos com Janela Deslizante e Bloom Filter (RFC 8446 TLS 1.3, RFC 9147 DTLS 1.3 & OWASP Top 10 API Security).**
- [x] **Módulo de Marcação D'água Esteganográfica Visual e Traçabilidade Forense Anti-Exfiltração de Tela em Sessões WebRTC e Prontuários Médicos (LGPD Art. 46, Resolução CFP nº 011/2018 e RFC-001 §3.2, §4.4).**
- [x] **Módulo de Rastreabilidade & Proteção de Credenciais de Acesso Temporário / Links Efêmeros de Teleconsulta com HMAC-Time-Constrained Token e Auto-Revogação com Prova de Não-Repúdio (RFC 7519, RFC 7009 & LGPD Art. 46).**
- [x] **Módulo de Liberação Colegiada de Prontuários Sob Ordem Judicial com Threshold Cryptography & Shamir's Secret Sharing (t-of-n Multi-Party Computation - CFP nº 001/2009 Art. 9º, LGPD Art. 11 e RFC §4.2).**
- [x] **Módulo de Detecção e Prevenção Ativa de Ataques de Poluição de Protótipo (Prototype Pollution) & Desserialização Insegura em Objetos Clínicos Dinâmicos (OWASP ASVS v4.0 V5.5, CWE-1321 & Node.js Security Best Practices).**
- [x] **Módulo de Proteção contra Ataques de Poluição de Cache HTTP (Web Cache Poisoning & Cache Deception) em Recursos Clínicos com Normalização de Chave e Assinatura de Cache (RFC 7234, RFC 9111 & OWASP ASVS v4.0).**
- [x] **Módulo de Detecção e Prevenção Ativa de Ataques de Injeção de Entidades Externas XML (XXE - XML External Entity Injection) & Expansão de Entidades (Billion Laughs / XML Bomb) em Intercâmbios de Dados em Saúde Mental (OWASP Top 10 API Security, CWE-611, CWE-776 & HL7/FHIR XML Best Practices).**
- [x] **Módulo de Proteção contra Ataques de Fixação de Sessão & Hijacking de Sessão Clínica com Rotação Criptográfica Obrigatória Pós-Autenticação e Dynamic TLS/Network Context Binding (OWASP ASVS v4.0 V3.3, CWE-384, CWE-287 & NIST SP 800-63B).**
- [x] **Módulo de Detecção e Prevenção Ativa de Ataques de Negação de Serviço por Expressões Regulares (ReDoS - Regular Expression Denial of Service) com Validador Léxico AST, Timeout Não-Bloqueante e Sanitização de Regex Clínico (OWASP ASVS v4.0 V5.5, CWE-1333 & Safe Regex Engine).**
- [x] **Módulo de Blindagem Criptográfica contra Injeção de Templates no Lado do Servidor (SSTI - Server-Side Template Injection) e Execução Remota em Laudos, Pareceres e Relatórios Psicológicos Multiformato (OWASP ASVS v4.0 V5.2, CWE-1336 & Secure Sandboxed Template Engine).**
- [x] **Módulo de Detecção e Prevenção Ativa de Injeção de Comandos de Sistema Operacional (OS Command Injection) em Conversores de PDF e Renderizadores de Laudos com Argument Whitelisting e Enclave Sandboxed (CWE-78, CWE-88 & OWASP ASVS v4.0 V5.3).**
- [x] **Módulo de Sanitização e Validação Estrita de Caminhos de Arquivos e Prevenção de Path Traversal / Local File Inclusion (LFI) em Uploads e Anexos de Prontuários (CWE-22, CWE-23, CWE-73 & OWASP ASVS v4.0 V5.5).**
- [x] **Módulo de Detecção e Prevenção Ativa de Injeção de Código em Expressões e Consultas Dinâmicas (Code/Expression Injection) em Filtros de Prontuários e Buscas Clínicas (CWE-94, CWE-95 & OWASP ASVS v4.0 V5.2).**
- [x] **Módulo de Proteção Avançada contra Injeção de Consultas GraphQL, Introspecção Maliciosa & Query Cost Limiting (OWASP ASVS v4.0 V5.1 & GraphQL Security Best Practices).**
- [x] **Módulo de Proteção contra Injeção de Cabeçalhos e Split de Requisições HTTP/2 & gRPC (CWE-113, CWE-444 & RFC 9113 HTTP/2 Desync / Request Smuggling).**
- [x] **Módulo de Proteção contra Injeção de Dependências Dinâmicas e Hijacking de Módulos Node/Bun (CWE-470, CWE-912 & Dependency Confusion / Supply Chain Guard).**
- [x] **Módulo de Proteção contra Injeção de Objetos e Desserialização Não Segura em Sessões WebSocket (RFC 6455, OWASP ASVS v4.0 V5.5 & CWE-502).**
- [ ] **[V1] Módulo de Proteção contra Ataques de Mass Assignment & Broken Object Property Level Authorization (BOPLA) em Payloads Clínicos (OWASP API3:2023 & ASVS v4.0 V4.1).**

---

## 🛠️ Comandos Rápidos para Retomada

```bash
# 1. Verificar status do git
git status

# 2. Executar suíte completa de testes (1.381 testes)
make test

# 3. Iniciar todos os serviços em desenvolvimento (Landing :5173, Frontend :5174, Backend :3000)
make dev

# 4. Compilar pacotes para produção
make build
```








