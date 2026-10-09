.DEFAULT_GOAL := help

# Colors
GREEN  := $(shell printf "\033[32m")
CYAN   := $(shell printf "\033[36m")
YELLOW := $(shell printf "\033[33m")
RESET  := $(shell printf "\033[0m")

##@ Ajuda
.PHONY: help
help: ## Exibe os comandos disponíveis no Makefile
	@echo ""
	@echo "$(CYAN)TerapiaInFoco — Comandos de Desenvolvimento Local$(RESET)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-18s$(RESET) %s\n", $$1, $$2}'
	@echo ""

##@ Instalação
.PHONY: install
install: ## Instala todas as dependências do monorepo (Bun Workspaces)
	bun install

##@ Desenvolvimento Local
.PHONY: dev
dev: ## Inicia Backend (porta 3000) e Frontend (porta 5174) simultaneamente
	@trap 'kill 0' EXIT INT TERM; bun run dev:backend & bun run dev:frontend & wait

.PHONY: dev-backend
dev-backend: ## Inicia a API Backend com live-reload (Porta 3000)
	bun run dev:backend

.PHONY: dev-frontend
dev-frontend: ## Inicia o Painel Clínico Frontend com Vite (Porta 5174)
	bun run dev:frontend

.PHONY: dev-landing
dev-landing: ## Inicia a Landing Page com Vite (Porta 5173)
	bun run dev:landing

##@ Banco de Dados (PostgreSQL & Drizzle)
.PHONY: db-generate
db-generate: ## Gera novos arquivos de migração SQL a partir do schema da RFC
	bun --filter @terapiainfoco/backend exec drizzle-kit generate

.PHONY: db-migrate
db-migrate: ## Aplica as migrações SQL no banco PostgreSQL
	bun --filter @terapiainfoco/backend exec drizzle-kit migrate

.PHONY: db-studio
db-studio: ## Abre o Drizzle Studio para inspecionar tabelas e dados no navegador
	bun --filter @terapiainfoco/backend exec drizzle-kit studio

.PHONY: docker-up
docker-up: ## Inicia o container PostgreSQL 16 via Docker Compose
	docker compose up -d

.PHONY: docker-down
docker-down: ## Para os containers do Docker Compose
	docker compose down

##@ Testes & Verificação
.PHONY: test
test: ## Executa todos os testes automatizados (Criptografia & Backend API)
	bun test

.PHONY: test-backend
test-backend: ## Executa apenas os testes de integração do Backend
	bun test apps/backend

.PHONY: test-crypto
test-crypto: ## Executa os testes do pacote criptográfico LGPD
	bun test packages/crypto

.PHONY: typecheck
typecheck: ## Valida tipagem TypeScript em todos os pacotes
	bun x tsc --noEmit -p packages/shared/tsconfig.json
	bun x tsc --noEmit -p packages/crypto/tsconfig.json
	bun --filter @terapiainfoco/frontend exec tsc -b
	bun --filter @terapiainfoco/landingpage exec tsc -b

##@ Compilação / Build
.PHONY: build
build: build-landing build-frontend ## Compila todas as aplicações para produção

.PHONY: build-landing
build-landing: ## Compila a Landing Page (gera dist em apps/landingpage/dist)
	bun run build:landing

.PHONY: build-frontend
build-frontend: ## Compila o Painel Clínico (gera dist em apps/frontend/dist)
	bun run build:frontend

##@ Manutenção
.PHONY: clean
clean: ## Remove diretórios de build gerados (dist)
	rm -rf apps/landingpage/dist apps/frontend/dist
	@echo "$(GREEN)Diretórios de compilação limpos!$(RESET)"
