# telesence — Cloudflare Realtime 1:1 Video Calls
# Quick reference for common tasks

.PHONY: dev build deploy clean check setup help

.DEFAULT_GOAL := help

help: ## Show this help
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

dev: ## Start development servers (Vite + Wrangler)
	vp dev

build: ## Build for production
	vp build

deploy: ## Deploy to Cloudflare
	vp run deploy

clean: ## Clean build artifacts
	vp run clean

clean-all: ## Clean everything including node_modules
	rm -rf apps/telesense/dist apps/telesense/.wrangler apps/telesense/test-results apps/telesense/playwright-report node_modules

check: ## Run type checks
	vp check

setup: ## Setup instructions for new developers
	@echo "=== telesence Setup ==="
	@echo ""
	@echo "1. Run automated setup:"
	@echo "   ./scripts/setup.sh"
	@echo ""
	@echo "2. Start development:"
	@echo "   vp dev"
	@echo ""
	@echo "3. Host admin:"
	@echo "   http://localhost:5173/host-admin"
	@echo ""
	@echo "4. Room test:"
	@echo "   http://localhost:5173/?room=TEST"

logs: ## View production logs
	vp run logs

test: ## Run all checks (alias for check)
	vp test
