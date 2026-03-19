# Telesense — Cloudflare Realtime 1:1 Video Calls
# Quick reference for common tasks

.PHONY: dev build deploy clean check setup help

.DEFAULT_GOAL := help

help: ## Show this help
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

dev: ## Start development servers (Vite + Wrangler)
	pnpm dev

build: ## Build for production
	pnpm build

deploy: ## Deploy to Cloudflare
	pnpm deploy

clean: ## Clean build artifacts
	pnpm clean

clean-all: ## Clean everything including node_modules
	pnpm clean:all

check: ## Run type checks
	pnpm check

setup: ## Setup instructions for new developers
	@echo "=== Telesense Setup ==="
	@echo ""
	@echo "1. Copy .dev.vars.example to .dev.vars:"
	@echo "   cp .dev.vars.example .dev.vars"
	@echo ""
	@echo "2. Edit .dev.vars and add your Cloudflare Realtime credentials:"
	@echo "   - CF_CALLS_SECRET from https://dash.cloudflare.com/?to=/:account/calls"
	@echo ""
	@echo "3. Edit wrangler.toml and set REALTIME_APP_ID"
	@echo ""
	@echo "4. Install dependencies:"
	@echo "   pnpm install"
	@echo ""
	@echo "5. Start development:"
	@echo "   pnpm dev"
	@echo ""
	@echo "6. Open http://localhost:5173/?call=test in two browser tabs"

logs: ## View production logs
	pnpm logs

test: ## Run all checks (alias for check)
	pnpm check
