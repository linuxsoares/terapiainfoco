# ==============================================================================
# TerapiaInFoco — Dockerfile de Produção (Railway / Container Engine)
# Suporte nativo a Bun Workspaces e API Hono (RFC-001)
# ==============================================================================

FROM oven/bun:1-alpine AS base
WORKDIR /app

# Instala curl para healthchecks do container
RUN apk add --no-cache curl

# Copia os manifestos do monorepo e pacotes compartilhados
COPY package.json bun.lock ./
COPY packages ./packages
COPY apps/backend ./apps/backend

# Instala dependências respeitando o bun.lock do monorepo
RUN bun install --frozen-lockfile --production

# Define variáveis padrão de ambiente
ENV NODE_ENV=production
ENV PORT=3000

# Porta de rede exposta
EXPOSE 3000

# Checagem de integridade e saúde da aplicação
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

# Inicializa o serviço backend
CMD ["bun", "apps/backend/src/index.ts"]
