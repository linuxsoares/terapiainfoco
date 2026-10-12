# 📋 TerapiaInFoco — Status de Implementação & Próximos Passos (RFC-001)

> **Documento de Continuidade Operacional**  
> **Data:** 12/10/2026  
> **Repositório:** `terapiainfoco` (Monorepo Bun Workspaces)  
> **Status Geral:** 8 Módulos Principais + 11 Extensões de Segurança | 120/120 Testes Passando


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
- [x] **Módulo 3 & 4 (Prontuário Eletrônico & Evolução SOAP):**
  - `POST /api/clinical-records/draft`: Rascunho com 4 eixos SOAP cifrados.
  - Segregação legal de anotações confidenciais do terapeuta (§3.4).
  - `POST /api/clinical-records/sign`: Assinatura compulsória com *Human-in-the-Loop* (§3.3), gerando hash SHA-256 e tornando o registro imutável (CFP nº 001/2009).
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
- [x] **Módulo SOAP & Transcrição com IA (`SoapModule.tsx`):**
  - Pipeline de áudio da teleconsulta e diarização com separação dos canais Terapeuta vs. Paciente e timestamps.
  - Alternância interativa entre transcrição diarizada e visualização com Sanitização LGPD Art. 11 (destaque visual de tokens protegidos).
  - Botão "Gerar Rascunho SOAP com IA" com síntese clínica dos 4 quadrantes (`S`, `O`, `A`, `P`) e notas privadas (§3.4).
  - Trava legal compulsória de *Human-in-the-Loop* (CFP nº 001/2009) e certificado visual de imutabilidade com hash SHA-256.
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
| `feat/dynamic-data-masking-ddm` | Mascaramento Dinâmico de Dados na Interface (DDM), Modo Anti-Shoulder Surfing (Alt+P) e Trilha WORM (Opção K) | PR #24 | **Em Aberto** |

---

## 🚀 O Que Precisamos Fazer (Próximos Passos Prioritários)

Com o Mascaramento Dinâmico de Dados (DDM) e o Modo Anti-Shoulder Surfing operacionais e validados por 120 testes automatizados, os próximos passos de evolução do roadmap são:

#### 📊 Opção L: Health Check Abrangente & Readiness Probes (RFC §5.2)
- [ ] **Probe Multi-Dependências:** Endpoint `/health/readiness` com checagem ativa de conexão PostgreSQL, PGlite, Redis, KMS e storage.
- [ ] **Métricas Liveness & Uptime:** Endpoint `/health/liveness` com tempo de atividade do processo e consumo de memória RAM.

---

## 🛠️ Comandos Rápidos para Retomada

```bash
# 1. Verificar status do git
git status

# 2. Executar suíte completa de testes (120 testes)
make test

# 3. Iniciar todos os serviços em desenvolvimento (Landing :5173, Frontend :5174, Backend :3000)
make dev

# 4. Compilar pacotes para produção
make build
```




