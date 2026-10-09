# TerapiaInFoco — Monorepo

Plataforma de gestão clínica psicológica desenvolvida em conformidade estrita com a **RFC-001** (*Plataforma de Gestão Clínica Psicológica com Teleatendimento, Transcrição Assistida por IA e Criptografia LGPD*).

---

## 🏛️ Estrutura do Monorepo

O repositório é gerenciado via **Bun Workspaces** e estruturado da seguinte forma:

```
terapiainfoco/
├── apps/
│   ├── landingpage/       # Landing page institucional & simuladores (React 19 + Vite + Tailwind v4)
│   ├── frontend/          # Painel clínico autenticado para psicólogos (React 19 + Tailwind v4)
│   └── backend/           # API REST em Hono/Bun com arquitetura de domínios RFC-001
├── packages/
│   ├── shared/            # Contratos de tipos, enums, DTOs e modelos da RFC-001
│   └── crypto/            # Core de segurança LGPD: Envelope Encryption (AES-256-GCM + KMS) & Blind Indexing
└── .github/workflows/
    └── deploy.yml         # CI/CD automático do GitHub Pages para a landing page (terapiainfoco.com.br)
```

---

## 🚀 Como Executar

### 1. Pré-requisitos
- [Bun](https://bun.sh/) (v1.2+)

### 2. Instalação de Dependências
```bash
bun install
```

### 3. Executando os Projetos

| Aplicação | Comando de Desenvolvimento | Porta Local |
|---|---|---|
| **Landing Page** | `bun run dev:landing` | `http://localhost:5173` |
| **Frontend Clínico** | `bun run dev:frontend` | `http://localhost:5174` |
| **Backend API** | `bun run dev:backend` | `http://localhost:3000` |

### 4. Executando Testes
```bash
bun test
```
Executa a suíte completa de testes unitários criptográficos e de integração da API REST.

### 5. Compilação (Build de Produção)
```bash
# Compilar landing page
bun run build:landing

# Compilar frontend clínico
bun run build:frontend
```

---

## 🔒 Conformidade Legal & Segurança Implementada
- **Envelope Encryption (RFC §4.2):** AES-256-GCM com IV único de 12 bytes, Auth Tag de 16 bytes e DEK isolada por contexto gerenciada via KMS.
- **Blind Indexing (RFC §4.3):** Buscas determinísticas de CPF e e-mail via `HMAC-SHA256` com salt secreto, sem expor dados sensíveis no banco.
- **Human-in-the-Loop (RFC §3.3):** Bloqueio estrito de assinatura autônoma de IA; o psicólogo deve revisar e autenticar antes do selo imutável.
- **CFP nº 001/2009 & 004/2020:** Prontuário eletrônico em modo *append-only* com assinatura e hash criptográfico SHA-256.
- **LGPD Art. 16 vs CFP 5 Anos:** Quarentena criptográfica e pseudonimização ativa com retenção legal obrigatória.
