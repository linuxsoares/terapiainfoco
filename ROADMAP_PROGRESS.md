# 📋 TerapiaInFoco — Status de Implementação & Próximos Passos (RFC-001)

> **Documento de Continuidade Operacional**  
> **Data:** 12/10/2026  
> **Repositório:** `terapiainfoco` (Monorepo Bun Workspaces)  
> **Status Geral:** 8 Módulos Principais Implementados | 36/36 Testes Passando


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
| `feat/pdf-server-generation-icp-brasil` | Geração Server-Side de PDFs Timbrados CFP 006/2019 e Assinatura ICP-Brasil (Opção D) | PR #12 | **Em Aberto** |

---

## 🚀 O Que Precisamos Fazer (Próximos Passos Prioritários)

Com a geração server-side de PDFs e assinatura ICP-Brasil plenamente operacionais e validadas por 43 testes automatizados, os próximos passos de evolução do roadmap são:

#### 📊 Opção E: Observabilidade, Métricas & Dashboard Clínico do Paciente
- [ ] **Painel Analítico de Pacientes:** Visualização longitudinal da evolução clínica do paciente, aderência e frequência de sessões.
- [ ] **Métricas de Segurança & Auditoria:** Dashboard visual com indicadores de integridade dos logs WORM, tentativas de força bruta bloqueadas por rate limit e volumetria de requisições.

#### 📦 Opção F: Portabilidade de Dados & Exportação LGPD Art. 18
- [ ] **Exportação Segura de Prontuário:** Pacote de dados cifrado para portabilidade do titular conforme Artigo 18 da LGPD e Resoluções do CFP.

---

## 🛠️ Comandos Rápidos para Retomada

```bash
# 1. Verificar status do git
git status

# 2. Executar suíte completa de testes (43 testes)
make test

# 3. Iniciar todos os serviços em desenvolvimento (Landing :5173, Frontend :5174, Backend :3000)
make dev

# 4. Compilar pacotes para produção
make build
```

