# 📋 TerapiaInFoco — Status de Implementação & Próximos Passos (RFC-001)

> **Documento de Continuidade Operacional**  
> **Data:** 09/10/2026  
> **Repositório:** `terapiainfoco` (Monorepo Bun Workspaces)  
> **Status Geral:** 5 Módulos Principais Implementados | 14/14 Testes Passando

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
- [x] **Módulo SOAP (`SoapModule.tsx`):**
  - Edição dos 4 quadrantes SOAP, notas privadas recolhíveis, trava de *Human-in-the-Loop* e certificado visual de imutabilidade.
- [x] **Módulo de Documentos CFP (`DocumentsModule.tsx`):**
  - Seleção dos 4 modelos oficiais do CFP (Declaração, Atestado, Relatório, Laudo).
  - Papel timbrado digital formatado com cabeçalho oficial e assinatura.
  - Renderização de QR Code dinâmico em tempo real (`qrcode`).
  - Modal com simulador do Portal de Validação Pública de Autenticidade.
  - Suporte a impressão e exportação em PDF (`window.print`).
- [x] **Módulo de Auditoria (`AuditModule.tsx`):**
  - Tabela de logs WORM em tempo real com identificação de IP e ação.

---

## 📌 Histórico de Branches & Pull Requests

| Branch | Escopo | PR no GitHub | Status |
|---|---|---|---|
| `feat/monorepo-setup` | Estrutura inicial do monorepo | PR #1 | Merged |
| `feat/db-schema-drizzle-pglite` | Drizzle ORM, PGlite & Postgres | PR #2 | Merged |
| `feat/frontend-backend-integration` | Conexão API REST + Módulos 1 a 4 | PR #4 | Merged |
| `feat/theme-toggle-dark-light` | Dark Mode / Light Mode adaptativo | PR #5 | Merged |
| `feat/modulo-5-documentos-cfp` | Módulo 5 (Documentos CFP + QR Code) | PR #6 | **Merged** |

---

## 🚀 O Que Precisamos Fazer (Próximos Passos Prioritários)

A branch `main` está 100% atualizada com os 5 primeiros módulos da RFC-001 integrados e validados. Os próximos passos para dar continuidade ao projeto estão estruturados abaixo:

#### 🎙️ Opção A: Módulo 3 — Pipeline de Transcrição, Diarização & IA (RFC §3.3)
- [ ] **Upload de Áudio:** Endpoint para envio de arquivos de áudio da teleconsulta (`/api/transcriptions/upload`).
- [ ] **Diarização de Áudio:** Separação automática dos canais de fala (Terapeuta vs. Paciente) com carimbos de tempo.
- [ ] **Sanitização de PII Pré-LLM (LGPD Art. 11):** Mecanismo de anonimização que substitui nomes, números, endereços e identificadores por tokens genéricos antes do envio da transcrição para a IA.
- [ ] **Geração Assistida de SOAP:** Prompting estruturado para gerar a proposta inicial dos 4 quadrantes clínicos com base na transcrição sanitizada.
- [ ] **Integração no Frontend:** Botão "Gerar com IA" no `SoapModule` que preenche o rascunho mantendo a revisão humana compulsória.

#### 🌐 Opção B: Experiência do Paciente & Agendamento Público na Landing Page (`apps/landingpage`)
- [ ] **Widget de Agendamento Online:** Conectar a landing page institucional (`terapiainfoco.com.br`) com o backend (`POST /api/appointments`).
- [ ] **Grade Dinâmica de Horários:** Visitantes consultam horários disponíveis da psicóloga sem precisar de login prévio.
- [ ] **Fluxo de Confirmação:** Envio de confirmação e link seguro de teleconsulta para o paciente.
- [ ] **Página Pública de Validação (`/validar/:token`):** Rota pública dedicada na web para que qualquer terceiro com o QR Code consulte a autenticidade de documentos sem entrar no painel do psicólogo.

#### 🔐 Opção C: Autenticação Segura & Gestão de Acessos
- [ ] **Auth Layer:** Implementação de JWT com refresh tokens e controle de sessão segura.
- [ ] **2FA / MFA:** Autenticação de dois fatores (TOTP / WebAuthn) para conformidade com prontuários de saúde.
- [ ] **Rate Limiting:** Proteção contra ataques de enumeração nos endpoints de Blind Index e validação pública.

---

## 🛠️ Comandos Rápidos para Retomada

```bash
# 1. Verificar status do git
git status

# 2. Executar suíte completa de testes
make test

# 3. Iniciar todos os serviços em desenvolvimento (Landing :5173, Frontend :5174, Backend :3000)
make dev

# 4. Compilar pacotes para produção
make build
```
