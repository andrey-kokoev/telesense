#!/bin/bash
# telesense setup script
# Idempotent by default; use --force to intentionally regenerate configurable values.

set -euo pipefail

FORCE=false
DRY_RUN=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)
      FORCE=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--force] [--dry-run]"
      exit 1
      ;;
  esac
done

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/telesense"
WRANGLER_CONFIG="$APP_DIR/wrangler.toml"
DEV_VARS="$APP_DIR/.dev.vars"
ENV_FILE="$APP_DIR/.env"
MIGRATION_FILE="$APP_DIR/migrations/0001_host_admin_registry.sql"

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

say() {
  echo -e "$1"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    say "${RED}Error: required command '$1' not found${NC}"
    exit 1
  fi
}

read_existing_dev_var() {
  local key="$1"
  if [[ -f "$DEV_VARS" ]]; then
    grep "^${key}=" "$DEV_VARS" | head -1 | cut -d'=' -f2- || true
  fi
}

replace_toml_string() {
  local file="$1"
  local key="$2"
  local value="$3"
  node - <<'NODE' "$file" "$key" "$value"
const fs = require("fs")
const [file, key, value] = process.argv.slice(2)
const source = fs.readFileSync(file, "utf8")
const pattern = new RegExp(`^(${key}\\s*=\\s*\")([^\"]*)(\")`, "m")
if (!pattern.test(source)) {
  console.error(`Could not find TOML key ${key} in ${file}`)
  process.exit(1)
}
fs.writeFileSync(file, source.replace(pattern, `$1${value}$3`))
NODE
}

write_dev_vars() {
  local calls_secret="$1"
  local entitlement_token="$2"
  if [[ "$DRY_RUN" == true ]]; then
    say "${BLUE}[dry-run] Would write $DEV_VARS${NC}"
    return
  fi
  cat > "$DEV_VARS" <<EOF
CF_CALLS_SECRET=$calls_secret
SERVICE_ENTITLEMENT_TOKEN=$entitlement_token

# Dev-only: disable service entitlement enforcement for local development.
DO_NOT_ENFORCE_SERVICE_ENTITLEMENT=true
EOF
}

write_env_file() {
  local entitlement_token="$1"
  if [[ "$DRY_RUN" == true ]]; then
    say "${BLUE}[dry-run] Would write $ENV_FILE${NC}"
    return
  fi
  cat > "$ENV_FILE" <<EOF
VITE_SERVICE_ENTITLEMENT_TOKEN=$entitlement_token
EOF
}

extract_json_value_with_node() {
  local json_input="$1"
  local expr="$2"
  node - <<'NODE' "$json_input" "$expr"
const [jsonInput, expr] = process.argv.slice(2)
const value = Function("data", `return ${expr}`)(JSON.parse(jsonInput))
if (value === undefined || value === null) process.exit(1)
process.stdout.write(String(value))
NODE
}

run_or_echo() {
  if [[ "$DRY_RUN" == true ]]; then
    say "${BLUE}[dry-run] $*${NC}"
    return 0
  fi
  "$@"
}

say "═══════════════════════════════════════════════════════════"
say "  telesense Setup - Realtime + Entitlement Host Admin"
say "═══════════════════════════════════════════════════════════"
say ""

require_command vp
require_command openssl
require_command node

cd "$ROOT_DIR"

say "${BLUE}Checking dependencies and authentication...${NC}"
run_or_echo vp install
if [[ "$DRY_RUN" == true ]]; then
  say "${BLUE}[dry-run] Would verify Wrangler authentication${NC}"
elif ! vp exec wrangler whoami >/dev/null 2>&1; then
  say "${YELLOW}Please authenticate with Cloudflare:${NC}"
  vp exec wrangler login
fi
say "${GREEN}✓ Dependencies installed and Wrangler authenticated${NC}"
say ""

say "${BLUE}Configuring Cloudflare Realtime app...${NC}"
EXISTING_APP_ID="$(grep '^REALTIME_APP_ID = ' "$WRANGLER_CONFIG" | cut -d'"' -f2 || true)"
APP_ID="$EXISTING_APP_ID"
APP_SECRET="$(read_existing_dev_var CF_CALLS_SECRET)"

if [[ -n "$EXISTING_APP_ID" && "$EXISTING_APP_ID" != "your-app-id" && "$FORCE" == false ]]; then
  say "${BLUE}Existing REALTIME_APP_ID found:${NC} $EXISTING_APP_ID"
  if [[ -n "$APP_SECRET" ]]; then
    say "${GREEN}✓ Reusing existing local CF_CALLS_SECRET${NC}"
  else
    say "${YELLOW}No local CF_CALLS_SECRET found; you will need to enter it.${NC}"
  fi
else
  say "${YELLOW}Manual step required in Cloudflare dashboard:${NC}"
  say "  1. Open https://dash.cloudflare.com/?to=/:account/calls"
  say "  2. Create or inspect your Calls application"
  say "  3. Copy the App ID and App Secret"
  say ""
  read -r -p "Enter Cloudflare Calls App ID: " APP_ID
  say "${YELLOW}Enter Cloudflare Calls App Secret:${NC}"
  read -rs APP_SECRET
  echo
fi

if [[ -z "$APP_ID" || -z "$APP_SECRET" ]]; then
  say "${RED}Cloudflare Calls App ID and secret are required.${NC}"
  exit 1
fi

if [[ "$DRY_RUN" == true ]]; then
  say "${BLUE}[dry-run] Would update REALTIME_APP_ID in $WRANGLER_CONFIG${NC}"
else
  replace_toml_string "$WRANGLER_CONFIG" "REALTIME_APP_ID" "$APP_ID"
fi
say "${GREEN}✓ Updated REALTIME_APP_ID${NC}"
say ""

say "${BLUE}Configuring service entitlement token...${NC}"
SERVICE_ENTITLEMENT_TOKEN="$(read_existing_dev_var SERVICE_ENTITLEMENT_TOKEN)"
if [[ -n "$SERVICE_ENTITLEMENT_TOKEN" && "$FORCE" == false ]]; then
  say "${GREEN}✓ Reusing existing SERVICE_ENTITLEMENT_TOKEN${NC}"
else
  SERVICE_ENTITLEMENT_TOKEN="$(openssl rand -hex 32)"
  say "${GREEN}✓ Generated new SERVICE_ENTITLEMENT_TOKEN${NC}"
fi

write_dev_vars "$APP_SECRET" "$SERVICE_ENTITLEMENT_TOKEN"
write_env_file "$SERVICE_ENTITLEMENT_TOKEN"
say "${GREEN}✓ Updated $DEV_VARS and $ENV_FILE${NC}"
say ""

say "${BLUE}Configuring D1 host-admin registry...${NC}"
D1_LIST_JSON="$(
  if [[ "$DRY_RUN" == true ]]; then
    echo '[]'
  else
    vp exec wrangler d1 list --json 2>/dev/null || echo '[]'
  fi
)"
HOST_ADMIN_DB_NAME="telesense-host-admin"
HOST_ADMIN_DB_ID="$(node - <<'NODE' "$D1_LIST_JSON" "$HOST_ADMIN_DB_NAME"
const [jsonInput, name] = process.argv.slice(2)
const dbs = JSON.parse(jsonInput)
const match = dbs.find((db) => db.name === name || db.database_name === name)
if (match?.uuid) process.stdout.write(match.uuid)
else if (match?.id) process.stdout.write(match.id)
NODE
)"

if [[ -z "$HOST_ADMIN_DB_ID" ]]; then
  if [[ "$DRY_RUN" == true ]]; then
    HOST_ADMIN_DB_ID="dry-run-host-admin-db-id"
    say "${BLUE}[dry-run] Would create D1 database: $HOST_ADMIN_DB_NAME${NC}"
  else
    say "${YELLOW}Creating D1 database: $HOST_ADMIN_DB_NAME${NC}"
    CREATE_OUTPUT="$(vp exec wrangler d1 create "$HOST_ADMIN_DB_NAME")"
    HOST_ADMIN_DB_ID="$(printf '%s' "$CREATE_OUTPUT" | grep -oE '[a-f0-9-]{36}' | head -1 || true)"
  fi
fi

if [[ -z "$HOST_ADMIN_DB_ID" ]]; then
  say "${RED}Could not determine HOST_ADMIN_DB id.${NC}"
  exit 1
fi

if [[ "$DRY_RUN" == true ]]; then
  say "${BLUE}[dry-run] Would update HOST_ADMIN_DB database_id in $WRANGLER_CONFIG${NC}"
else
  replace_toml_string "$WRANGLER_CONFIG" "database_id" "$HOST_ADMIN_DB_ID"
fi
say "${GREEN}✓ Bound HOST_ADMIN_DB ($HOST_ADMIN_DB_ID) in wrangler.toml${NC}"

say "${BLUE}Applying host-admin D1 migration...${NC}"
run_or_echo vp exec wrangler d1 execute "$HOST_ADMIN_DB_NAME" --file "$MIGRATION_FILE" --config "$WRANGLER_CONFIG" >/dev/null
say "${GREEN}✓ Applied D1 schema from $(basename "$MIGRATION_FILE")${NC}"
say ""

say "${BLUE}Setting Cloudflare worker secrets...${NC}"
if [[ "$DRY_RUN" == true ]]; then
  say "${BLUE}[dry-run] Would set CF_CALLS_SECRET via wrangler secret put${NC}"
  say "${BLUE}[dry-run] Would set SERVICE_ENTITLEMENT_TOKEN via wrangler secret put${NC}"
else
  printf '%s' "$APP_SECRET" | vp exec wrangler secret put CF_CALLS_SECRET --config "$WRANGLER_CONFIG" >/dev/null
  printf '%s' "$SERVICE_ENTITLEMENT_TOKEN" | vp exec wrangler secret put SERVICE_ENTITLEMENT_TOKEN --config "$WRANGLER_CONFIG" >/dev/null
fi
say "${GREEN}✓ Updated CF_CALLS_SECRET and SERVICE_ENTITLEMENT_TOKEN in Cloudflare${NC}"
say ""

say "${BLUE}Running verification...${NC}"
run_or_echo vp check
say "${GREEN}✓ Project check passed${NC}"
say ""

say "═══════════════════════════════════════════════════════════"
say "  Setup Complete"
say "═══════════════════════════════════════════════════════════"
say ""
say "${GREEN}Configured:${NC}"
say "  Calls App ID: $APP_ID"
say "  SERVICE_ENTITLEMENT_TOKEN: ${SERVICE_ENTITLEMENT_TOKEN:0:16}..."
say "  HOST_ADMIN_DB: $HOST_ADMIN_DB_NAME ($HOST_ADMIN_DB_ID)"
say ""
say "${GREEN}Notes:${NC}"
say "  - Host-admin registry seeding happens automatically on first host-admin access or scheduled monthly processing."
say "  - Local development keeps DO_NOT_ENFORCE_SERVICE_ENTITLEMENT=true in $DEV_VARS."
say ""
say "${GREEN}Next steps:${NC}"
say "  1. Run locally: vp dev"
say "  2. Open host admin: http://localhost:5173/?admin=1"
say "  3. Run E2E tests: vp run test"
say ""
say "${BLUE}To reconfigure, run: ./scripts/setup.sh --force${NC}"
