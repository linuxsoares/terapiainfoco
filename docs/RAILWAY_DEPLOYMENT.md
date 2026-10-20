# 🚀 Guia de Deployment no Railway com Supabase — TerapiaInFoco

Este guia documenta o passo a passo completo para publicar a plataforma **TerapiaInFoco** no **Railway** (`railway.com`), utilizando **Supabase** como camada de dados/PostgreSQL e mantendo a **Landing Page no GitHub Pages**.

---

## 🏗️ Topologia de Produção

```mermaid
flowchart TD
    subgraph GitHub ["GitHub Pages"]
        LP["Landing Page\n(terapiainfoco.com.br)"]
    end

    subgraph Supabase ["Supabase Cloud"]
        SupaPG[("PostgreSQL 16\n(Tabelas Drizzle + FLE + Blind Index)")]
        SupaAuth["Supabase Auth / JWKS\n(SUPABASE_JWKS_URL)"]
    end

    subgraph Railway ["Railway Project"]
        API["API Hono / Bun (terapiainfoco-backend)\nPorta $PORT\nHealthcheck /health"]
        RD[("Redis (Opcional - Rate Limiting)")]
        FrontendSvc["Painel Clínico (terapiainfoco-frontend)\nDockerfile.frontend ou Vercel"]
    end

    LP -.->|Booking API / Validação| API
    FrontendSvc -->|VITE_API_URL| API
    API -->|DATABASE_URL\n(Pooler 6543 / 5432)| SupaPG
    API -->|SUPABASE_JWKS_URL| SupaAuth
    API -.->|REDIS_URL| RD
```

---

## 📋 Pré-requisitos & Credenciais

Você precisará das credenciais do Supabase já configuradas:
- `SUPABASE_URL`: `https://<seu-projeto>.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY`: Chave anônima / pública (`sbp_...` ou `eyJhbGci...`)
- `SUPABASE_SECRET_KEY`: Chave de serviço `service_role` (para operações seguras no backend)
- `SUPABASE_JWKS_URL`: `https://<seu-projeto>.supabase.co/auth/v1/.well-known/jwks.json`
- **Connection String do Banco de Dados PostgreSQL do Supabase** (`DATABASE_URL`).

---

## 🛠️ Passo a Passo de Configuração

### 1. Obter a Connection String do Supabase (`DATABASE_URL`)
Para que o backend e o Drizzle ORM se conectem ao PostgreSQL do Supabase:
1. Acesse o [Supabase Dashboard](https://supabase.com/dashboard).
2. Selecione seu projeto ➔ Clique no ícone de engrenagem **Project Settings** no menu lateral.
3. Clique em **Database** ➔ role até a seção **Connection string**.
4. Selecione a aba **URI** e escolha **Connection pooling** (Modo Transaction na porta 6543 ou Session na porta 5432):
   ```
   postgresql://postgres.[PROJECT-REF]:[SUA-SENHA]@aws-0-[REGIAO].pooler.supabase.com:6543/postgres?sslmode=require
   ```
   > 💡 *Nota:* O backend já foi preparado com `ssl: 'require'` e `prepare: false` automáticos para compatibilidade total com o PgBouncer/Supavisor do Supabase!

---

### 2. Criar o Projeto no Railway
1. Acesse o [Dashboard do Railway](https://railway.com/dashboard).
2. Clique em **"New Project"**.
3. Selecione **"Deploy from GitHub repo"** ➔ escolha o repositório **`terapiainfoco`**.

---

### 3. Configurar o Serviço do Backend (`terapiainfoco-backend`)
1. No Railway, clique no serviço recém-criado e vá em **"Settings"**:
   - **Service Name:** `terapiainfoco-backend`
   - **Root Directory:** `/` (raiz do monorepo)
   - O Railway usará automaticamente o [`railway.json`](file:///Users/gilmar/projects/terapiainfoco/railway.json) e o [`Dockerfile`](file:///Users/gilmar/projects/terapiainfoco/Dockerfile).
2. Acesse a aba **"Variables"** e preencha as variáveis de ambiente:

| Variável | Exemplo de Valor | Descrição |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres.[ref]:[senha]@[host]:6543/postgres?sslmode=require` | Connection String URI do PostgreSQL do Supabase |
| `SUPABASE_URL` | `https://[ref].supabase.co` | URL da instância Supabase |
| `SUPABASE_PUBLISHABLE_KEY` | `sbp_...` | Chave pública do Supabase |
| `SUPABASE_SECRET_KEY` | `sbp_...` | Chave de serviço `service_role` (segredo) |
| `SUPABASE_JWKS_URL` | `https://[ref].supabase.co/auth/v1/.well-known/jwks.json` | Endpoint público JWKS para validação de JWTs |
| `JWT_SECRET` | *(string aleatória de 32+ caracteres)* | Chave interna para tokens JWT da plataforma |
| `BLIND_INDEX_SALT` | *(hexadecimal de 32+ caracteres)* | Salt secreto determinístico para busca LGPD |
| `NODE_ENV` | `production` | Ambiente de produção |

3. **Gerar Domínio Público:**
   - Em **"Settings"** ➔ **"Networking"**, clique em **"Generate Domain"** (ex: `terapiainfoco-backend.up.railway.app`).
   - Copie este domínio.

---

### 4. Publicar o Painel Clínico (`terapiainfoco-frontend`)
Para que os psicólogos acessem o painel administrativo:

1. No mesmo projeto do Railway, clique no botão **"+ New"** ➔ **"GitHub Repo"** ➔ selecione `terapiainfoco` novamente.
2. Acesse as **"Settings"** deste novo serviço:
   - **Service Name:** `terapiainfoco-frontend`
   - **Build:** Altere **Dockerfile Path** para `Dockerfile.frontend`.
3. Na aba **"Variables"**:
   - Configure `VITE_API_URL` com a URL pública gerada no backend (ex: `https://terapiainfoco-backend.up.railway.app/api`).
4. Na aba **"Networking"**, clique em **"Generate Domain"** para ter o link de acesso ao painel.

*(Obs: Você também pode publicar este painel na Vercel ou Cloudflare Pages apontando para a mesma `VITE_API_URL`).*

---

### 5. Landing Page (Já ativa no GitHub Pages)
- A landing page continuará funcionando no GitHub Pages através do workflow já existente `.github/workflows/deploy.yml`.
- Se o widget de agendamento público da landing page precisar chamar a API em produção, basta configurar o Secret `VITE_API_URL` nas configurações do repositório no GitHub (`Settings` ➔ `Secrets and variables` ➔ `Actions`).

---

### 6. Backups (duas camadas)

**a) Snapshots cifrados da aplicação (módulo Backup & DR).** O Admin gera snapshots do banco cifrados por Envelope Encryption com a `KMS_MASTER_KEY`. Para que eles sobrevivam a restarts e deploys, configure um bucket S3-compatível (AWS S3, Cloudflare R2, MinIO) no serviço do backend:

| Variável | Exemplo de Valor | Descrição |
|---|---|---|
| `BACKUP_S3_BUCKET` | `terapiainfoco-backups` | Bucket de destino. Sem ela, os snapshots ficam só na memória (o painel avisa). |
| `BACKUP_S3_ACCESS_KEY_ID` | *(chave de acesso)* | Obrigatória quando há bucket |
| `BACKUP_S3_SECRET_ACCESS_KEY` | *(segredo)* | Obrigatória quando há bucket |
| `BACKUP_S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` | Necessária para R2/MinIO; omita para AWS S3 |
| `BACKUP_S3_REGION` | `us-east-1` / `auto` (R2) | Região do bucket |
| `BACKUP_S3_PREFIX` | `backups/` | Prefixo das chaves (padrão `backups/`) |

- Cada snapshot é gravado como `<prefixo><id>.kms-backup.json` (mesmo formato do download no painel). O bucket só recebe dados já cifrados, mas mantenha-o **privado** e com credenciais restritas a esse prefixo.
- Se o envio ao bucket falhar, a geração do backup falha (não há cópia apenas em memória).
- No boot, os 20 snapshots mais recentes são recarregados do bucket; os anteriores continuam acessíveis por id (verificação/restauração/download).
- A aplicação não apaga snapshots do bucket: defina a retenção com uma **regra de ciclo de vida** no provedor.
- A restauração exige a mesma `KMS_MASTER_KEY` usada na geração. Guarde-a fora do Railway (cofre de senhas da organização): sem ela, nenhum snapshot pode ser decifrado.

**b) Backups gerenciados do PostgreSQL.** Os snapshots da aplicação não substituem o backup do banco. Confira no provedor do `DATABASE_URL` se há backups diários ou PITR habilitados no seu plano e qual é a janela de retenção:
- **Supabase:** *Project Settings* ➔ *Database* ➔ *Backups* (e o add-on de *Point in Time Recovery*).
- **Railway PostgreSQL** (se usado no lugar do Supabase): aba *Backups* do serviço do banco.

Teste periodicamente as duas restaurações (o módulo Backup & DR tem a simulação de DR para a primeira).

---

## 🔍 Verificação & Healthcheck

Após o Railway realizar o build e deploy, valide se a API conectou com sucesso no Supabase:

```bash
curl https://seu-backend.up.railway.app/health
```

Resposta esperada (HTTP 200):
```json
{
  "status": "ok",
  "service": "terapiainfoco-backend",
  "version": "1.0.0",
  "rfc": "RFC-001",
  "timestamp": "..."
}
```

No log do Railway, você verá:
```
🔌 Conectando ao PostgreSQL via DATABASE_URL (Supabase detectado)...
✅ Migrações aplicadas com sucesso no PostgreSQL.
🚀 TerapiaInFoco Backend rodando na porta 3000
```
As tabelas Drizzle e o seed do terapeuta serão criados automaticamente na base do Supabase!
