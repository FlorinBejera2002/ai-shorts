SHELL := /bin/bash
.DEFAULT_GOAL := help

COMPOSE := docker compose
DEV_COMPOSE := $(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml
GO_CACHE ?= $(CURDIR)/.cache/go-build
SERVICE ?=
PRODUCTION_COMPONENT ?= all
PRODUCTION_DEPLOY := ./scripts/deploy.sh

.PHONY: help doctor ensure-env setup up dev dev-up dev-watch down restart status health \
	logs backend-shell restart-go frontend-shell db-shell redis-shell migrate security-up \
	install typecheck lint format test test-frontend test-go check build \
	build-dev build-frontend reset-data prod-build prod-build-backend \
	prod-build-frontend prod-build-studio prod-build-api prod-build-workers prod-build-gateway \
	deploy deploy-backend deploy-frontend deploy-studio deploy-api deploy-workers \
	deploy-gateway rollback production-status production-verify

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
	@$(DEV_COMPOSE) up --build --watch

dev-up: ensure-env ## Switch to the hot-reload development stack in the background
	@$(DEV_COMPOSE) up --build -d
	@echo "Frontend hot reload is active. Run make dev-watch for Go reload."

dev-watch: ## Watch Go changes after make dev-up (keep this terminal open)
	@$(DEV_COMPOSE) watch --no-up

down: ## Stop containers while preserving data volumes
	@$(COMPOSE) down

restart: ## Recreate the default stack
	@$(COMPOSE) down
	@$(MAKE) up

status: ## Show all Compose services, including completed migrations
	@$(COMPOSE) ps --all

health: ## Wait for and verify the routed backend health endpoint
	@for attempt in {1..30}; do \
		if curl --fail --silent --show-error http://localhost/api/ready; then \
			echo; \
			exit 0; \
		fi; \
		sleep 2; \
	done; \
	echo "Health check did not pass within 60 seconds." >&2; \
	exit 1

logs: ## Follow logs for all services, or one with SERVICE=backend
	@$(COMPOSE) logs --follow $(SERVICE)

backend-shell: ## Open a shell in the Go worker container
	@$(COMPOSE) exec worker /bin/sh

restart-go: ## Restart Go using its last built or synchronized source
	@$(DEV_COMPOSE) restart backend

frontend-shell: ## Open a shell in the running Vite container
	@$(COMPOSE) exec frontend /bin/sh

db-shell: ## Open psql in the running PostgreSQL container
	@$(COMPOSE) exec postgres /bin/sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

redis-shell: ## Open redis-cli in the running Redis container
	@$(COMPOSE) exec redis redis-cli

migrate: ensure-env ## Apply pending Go migrations
	@$(COMPOSE) run --rm migrate

security-up: ensure-env ## Start the stack with ClamAV upload scanning available
	@$(COMPOSE) --profile security up --build -d

install: ## Install locked frontend dependencies
	@pnpm --dir frontend install --frozen-lockfile

typecheck: ## Run the frontend TypeScript check
	@npm --prefix frontend run typecheck

lint: ## Run the frontend lint check
	@npm --prefix frontend run lint

format: ## Apply frontend lint fixes
	@npm --prefix frontend run lint -- --fix

test: test-frontend test-go ## Run all locally available test suites

test-frontend: ## Run the frontend Node test suite
	@npm --prefix frontend test

test-go: ## Run the Go API test suite
	@cd backend && GOCACHE="$(GO_CACHE)" go test ./...

check: lint typecheck test ## Run lint, typecheck, and all tests

build: ensure-env ## Build all Docker images
	@$(COMPOSE) build

build-dev: ensure-env ## Rebuild development images after dependency changes
	@$(DEV_COMPOSE) build

build-frontend: ## Build Vite locally
	@npm --prefix frontend run build

prod-build: ## Upload and build the complete production release on the server
	@$(PRODUCTION_DEPLOY) build all

prod-build-backend: ## Upload and build API, worker, and dispatcher images
	@$(PRODUCTION_DEPLOY) build backend

prod-build-frontend: ## Upload and build only the production frontend image
	@$(PRODUCTION_DEPLOY) build frontend

prod-build-studio: ## Upload and build Studio and its frontend integration
	@$(PRODUCTION_DEPLOY) build studio

prod-build-api: ## Upload and build only API and migration images
	@$(PRODUCTION_DEPLOY) build api

prod-build-workers: ## Upload and build only worker and dispatcher images
	@$(PRODUCTION_DEPLOY) build workers

prod-build-gateway: ## Validate and pull the production gateway images
	@$(PRODUCTION_DEPLOY) build gateway

deploy: ## Build and deploy all production components to the server
	@$(PRODUCTION_DEPLOY) deploy all

deploy-backend: ## Build and deploy the backend without starting the frontend
	@$(PRODUCTION_DEPLOY) deploy backend

deploy-frontend: ## Build and deploy the production frontend and public gateway
	@$(PRODUCTION_DEPLOY) deploy frontend

deploy-studio: ## Build and deploy Studio, frontend integration and HTTPS gateway
	@$(PRODUCTION_DEPLOY) deploy studio

deploy-api: ## Build and deploy the Go API, migrations, and API gateway
	@$(PRODUCTION_DEPLOY) deploy api

deploy-workers: ## Build and deploy the ML worker and job dispatcher
	@$(PRODUCTION_DEPLOY) deploy workers

deploy-gateway: ## Deploy only Nginx and Caddy from the current release
	@$(PRODUCTION_DEPLOY) deploy gateway

rollback: ## Swap to the single previous release and redeploy the complete stack
	@$(PRODUCTION_DEPLOY) rollback all

production-status: ## Show production Compose status on the server
	@$(PRODUCTION_DEPLOY) status $(PRODUCTION_COMPONENT)

production-verify: ## Run production checks on the server
	@$(PRODUCTION_DEPLOY) verify $(PRODUCTION_COMPONENT)

reset-data: ## Delete containers and all local database/media volumes (CONFIRM=yes)
	@if [[ "$(CONFIRM)" != "yes" ]]; then \
		echo "This deletes PostgreSQL and media volumes. Re-run with: make reset-data CONFIRM=yes"; \
		exit 1; \
	fi
	@$(COMPOSE) down --volumes --remove-orphans
