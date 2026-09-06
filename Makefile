SHELL := /bin/bash
.DEFAULT_GOAL := help

COMPOSE := docker compose
DEV_COMPOSE := $(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml
GO_CACHE ?= $(CURDIR)/.cache/go-build
SERVICE ?=

.PHONY: help doctor ensure-env setup up dev dev-up down restart status health \
	logs backend-shell frontend-shell db-shell redis-shell migrate security-up \
	install typecheck lint format test test-frontend test-go check build \
	build-dev build-frontend reset-data

help: ## Show available commands
	@awk 'BEGIN {FS = ":.*## "; printf "Usage: make <target>\n\nTargets:\n"} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

doctor: ## Check required local tools
	@for tool in docker node npm go curl; do \
		command -v "$$tool" >/dev/null || { echo "Missing required tool: $$tool"; exit 1; }; \
	done
	@$(COMPOSE) version
	@node --version
	@npm --version
	@go version
	@echo "Local tooling is ready."

ensure-env: ## Create .env from .env.example when missing
	@if [[ ! -f .env ]]; then \
		cp .env.example .env; \
		echo "Created .env from .env.example; add real service credentials as needed."; \
	else \
		echo ".env already exists."; \
	fi

setup: ensure-env ## Build, start, and verify the default stack
	@$(COMPOSE) up --build -d
	@$(MAKE) health

up: ensure-env ## Build and start the default stack in the background
	@$(COMPOSE) up --build -d

dev: ensure-env ## Switch to the hot-reload development stack in the foreground
	@$(COMPOSE) down
	@$(DEV_COMPOSE) up

dev-up: ensure-env ## Switch to the hot-reload development stack in the background
	@$(COMPOSE) down
	@$(DEV_COMPOSE) up -d

down: ## Stop containers while preserving data volumes
	@$(COMPOSE) down

restart: ## Recreate the default stack
	@$(COMPOSE) down
	@$(MAKE) up

status: ## Show all Compose services, including completed migrations
	@$(COMPOSE) ps --all

health: ## Wait for and verify the routed backend health endpoint
	@for attempt in {1..30}; do \
		if curl --fail --silent --show-error http://localhost/api/health; then \
			echo; \
			exit 0; \
		fi; \
		sleep 2; \
	done; \
	echo "Health check did not pass within 60 seconds." >&2; \
	exit 1

logs: ## Follow logs for all services, or one with SERVICE=backend
	@$(COMPOSE) logs --follow $(SERVICE)

backend-shell: ## Open a shell in the running FastAPI container
	@$(COMPOSE) exec backend /bin/sh

frontend-shell: ## Open a shell in the running Next.js container
	@$(COMPOSE) exec frontend /bin/sh

db-shell: ## Open psql in the running PostgreSQL container
	@$(COMPOSE) exec postgres /bin/sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

redis-shell: ## Open redis-cli in the running Redis container
	@$(COMPOSE) exec redis redis-cli

migrate: ensure-env ## Apply pending Alembic migrations
	@$(COMPOSE) run --rm migrate

security-up: ensure-env ## Start the stack with ClamAV upload scanning available
	@$(COMPOSE) --profile security up --build -d

install: ## Install locked frontend dependencies and generate Prisma Client
	@npm --prefix frontend ci
	@npm --prefix frontend run prebuild

typecheck: ## Run the frontend TypeScript check
	@npm --prefix frontend run typecheck

lint: ## Run the frontend Biome check
	@npm --prefix frontend run check

format: ## Format frontend source with Biome
	@npm --prefix frontend run format

test: test-frontend test-go ## Run all locally available test suites

test-frontend: ## Run the frontend Node test suite
	@npm --prefix frontend test

test-go: ## Run the Go API test suite
	@cd backend-go && GOCACHE="$(GO_CACHE)" go test ./...

check: lint typecheck test ## Run lint, typecheck, and all tests

build: ensure-env ## Build all Docker images
	@$(COMPOSE) build

build-dev: ensure-env ## Rebuild development images after dependency changes
	@$(DEV_COMPOSE) build

build-frontend: ## Generate Prisma Client and build Next.js locally
	@npm --prefix frontend run build

reset-data: ## Delete containers and all local database/media volumes (CONFIRM=yes)
	@if [[ "$(CONFIRM)" != "yes" ]]; then \
		echo "This deletes PostgreSQL and media volumes. Re-run with: make reset-data CONFIRM=yes"; \
		exit 1; \
	fi
	@$(COMPOSE) down --volumes --remove-orphans
