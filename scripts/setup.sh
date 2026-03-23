#!/bin/bash
# telesense setup script
# Idempotent by default; use --force to intentionally regenerate configurable values.

set -euo pipefail

FORCE=false
DRY_RUN=false
AUTO_DEPLOY=false
MODE=""
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
    --deploy)
      AUTO_DEPLOY=true
      shift
      ;;
    --mode)
      MODE="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--force] [--dry-run] [--deploy] [--mode deploy-only|local-dev]"
      exit 1
      ;;
  esac
done

if [[ -n "$MODE" && "$MODE" != "deploy-only" && "$MODE" != "local-dev" ]]; then
  echo "Invalid mode: $MODE"
  echo "Allowed values: deploy-only, local-dev"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/telesense"
WRANGLER_CONFIG="$APP_DIR/wrangler.toml"
DEV_VARS="$APP_DIR/.dev.vars"
ENV_FILE="$APP_DIR/.env"
MIGRATIONS_DIR="$APP_DIR/migrations"
SETUP_SUMMARY_FILE="$ROOT_DIR/.setup-summary"
DEPLOYED_URL=""
BUDGET_ADMIN_TOKEN=""
SERVICE_ENTITLEMENT_SEEDED_TOKEN=""

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
  local host_admin_bootstrap_token="$3"
  if [[ "$DRY_RUN" == true ]]; then
    say "${BLUE}[dry-run] Would write $DEV_VARS${NC}"
    return
  fi
  cat > "$DEV_VARS" <<EOF
CF_CALLS_SECRET=$calls_secret
SERVICE_ENTITLEMENT_TOKEN=$entitlement_token
HOST_ADMIN_BOOTSTRAP_TOKEN=$host_admin_bootstrap_token

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

write_setup_summary() {
  local app_id="$1"
  local host_admin_db_id="$2"
  local host_admin_token="$3"
  local budget_admin_token="${4:-}"
  local service_entitlement_token="${5:-}"
  local deployed_url="${6:-}"

  if [[ "$DRY_RUN" == true ]]; then
    say "${BLUE}[dry-run] Would write $SETUP_SUMMARY_FILE${NC}"
    return
  fi

  cat > "$SETUP_SUMMARY_FILE" <<EOF
telesense setup summary
=======================

Calls App ID: $app_id
HOST_ADMIN_DB: $host_admin_db_id

What To Do First
----------------
Open the app at:
  ${deployed_url:-<deployed-app-url>}

There is one token entry field on the landing page.
Paste any one of the tokens below into that same field.
The app will detect what kind of token it is and route the user appropriately.

Authority Levels
----------------
1. Host Admin Token
   - Highest authority for this deployment.
   - Unlocks host administration for all budgets.
   - Also grants service access on the default budget.
   - After entry, the Admin button opens host admin.

2. Budget Admin Token
   - Admin authority for one budget only.
   - Can manage that budget and mint service entitlement tokens for it.
   - Also grants service access on that same budget.
   - After entry, the Admin button opens that budget's admin page.

3. Service Entitlement Token
   - Service-use token only.
   - Allows room creation/use against one budget.
   - Does not expose admin surfaces.

Seeded Tokens
-------------
Host Admin Token
$host_admin_token

Budget Admin Token
${budget_admin_token:-Not seeded}

Initial Service Entitlement Token
${service_entitlement_token:-Not seeded}

How The App Behaves
-------------------
- Enter Host Admin Token:
  unlocks deployment admin and service access on the default budget.
- Enter Budget Admin Token:
  unlocks budget admin and service access on that budget.
- Enter Service Entitlement Token:
  enables normal room creation/use only.

Operational Notes
-----------------
- Budget admin token is canonical per budget.
- Service entitlement tokens are budget-scoped and can be labeled, activated, and deactivated from budget admin.
- Rotating a budget secret invalidates all service entitlement tokens for that budget.
EOF
}

extract_json_value_with_node() {
  local json_input="$1"
  local expr="$2"
  node - <<'NODE' "$json_input" "$expr"
const [jsonInput, expr] = process.argv.slice(2)
try {
  const value = Function("data", `return ${expr}`)(JSON.parse(jsonInput))
  if (value === undefined || value === null) process.exit(1)
  process.stdout.write(String(value))
} catch {
  process.exit(1)
}
NODE
}

extract_json_array_from_output() {
  local output="$1"
  node - <<'NODE' "$output"
const output = process.argv[2] || ""
const lines = output.split(/\r?\n/)
const startIndex = lines.findIndex((line) => {
  const trimmed = line.trim()
  return trimmed === "[" || trimmed.startsWith("[{")
})
if (startIndex === -1) {
  process.stdout.write("[]")
  process.exit(0)
}
process.stdout.write(lines.slice(startIndex).join("\n"))
NODE
}

run_or_echo() {
  if [[ "$DRY_RUN" == true ]]; then
    say "${BLUE}[dry-run] $*${NC}"
    return 0
  fi
  "$@"
}

maybe_deploy() {
  local should_deploy="$AUTO_DEPLOY"

  if [[ "$AUTO_DEPLOY" == false && "$DRY_RUN" == false ]]; then
    if [[ -t 0 ]]; then
      echo
      read -r -p "Deploy telesense now? [y/N] " deploy_reply
      if [[ "$deploy_reply" =~ ^[Yy]$ ]]; then
        should_deploy=true
      fi
    else
      say "${BLUE}Non-interactive shell detected; skipping deploy prompt${NC}"
    fi
  fi

  if [[ "$should_deploy" == true ]]; then
    say "${BLUE}Deploying telesense...${NC}"
    if [[ "$DRY_RUN" == true ]]; then
      say "${BLUE}[dry-run] Would deploy telesense and capture deployed URL${NC}"
    else
      local deploy_output
      deploy_output="$(vp run --filter telesense ship 2>&1)"
      printf '%s\n' "$deploy_output"
      DEPLOYED_URL="$(printf '%s\n' "$deploy_output" | grep -oE 'https://[A-Za-z0-9._/-]+' | head -1 || true)"
    fi
    say "${GREEN}✓ Deploy step completed${NC}"
  else
    say "${BLUE}Skipping deploy step${NC}"
  fi
}

seed_initial_credentials() {
  if [[ "$DRY_RUN" == true ]]; then
    BUDGET_ADMIN_TOKEN="dry-run-budget-admin-token"
    SERVICE_ENTITLEMENT_SEEDED_TOKEN="dry-run-service-entitlement-token"
    say "${BLUE}[dry-run] Would seed budget-admin and service-entitlement tokens${NC}"
    return
  fi

  if [[ -z "$DEPLOYED_URL" ]]; then
    say "${YELLOW}Could not determine deployed URL; skipping seeded credential minting${NC}"
    return
  fi

  say "${BLUE}Seeding initial budget-admin and service-entitlement tokens...${NC}"
  local seed_response
  local attempt
  for attempt in 1 2 3 4 5; do
    if seed_response="$(
      curl -sS -X POST \
        -H "X-Host-Admin-Token: $HOST_ADMIN_BOOTSTRAP_TOKEN" \
        "${DEPLOYED_URL%/}/admin/bootstrap/seed-credentials"
    )"; then
      break
    fi
    sleep 2
  done

  if [[ -z "$seed_response" ]]; then
    say "${YELLOW}Could not seed initial credentials yet; skipping${NC}"
    return
  fi

  BUDGET_ADMIN_TOKEN="$(extract_json_value_with_node "$seed_response" "data.budgetAdminToken" || true)"
  SERVICE_ENTITLEMENT_SEEDED_TOKEN="$(extract_json_value_with_node "$seed_response" "data.serviceEntitlementToken" || true)"
  if [[ -z "$BUDGET_ADMIN_TOKEN" || -z "$SERVICE_ENTITLEMENT_SEEDED_TOKEN" ]]; then
    say "${YELLOW}Credential seeding endpoint did not return the expected tokens; skipping${NC}"
    return
  fi
  say "${GREEN}✓ Seeded budget-admin and service-entitlement tokens${NC}"
}

resolve_mode() {
  if [[ -n "$MODE" ]]; then
    return
  fi

  if [[ "$DRY_RUN" == true ]]; then
    MODE="local-dev"
    return
  fi

  echo
  read -r -p "Setup mode: deploy-only or local-dev? [deploy-only/local-dev] " mode_reply
  case "$mode_reply" in
    local-dev)
      MODE="local-dev"
      ;;
    *)
      MODE="deploy-only"
      ;;
  esac
}

say "═══════════════════════════════════════════════════════════"
say "  telesense Setup - Realtime + Entitlement Host Admin"
say "═══════════════════════════════════════════════════════════"
say ""

require_command vp
require_command openssl
require_command node
require_command curl

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

resolve_mode
say "${BLUE}Selected setup mode:${NC} $MODE"
say ""

say "${BLUE}Configuring service entitlement token...${NC}"
SERVICE_ENTITLEMENT_TOKEN="$(read_existing_dev_var SERVICE_ENTITLEMENT_TOKEN)"
if [[ -n "$SERVICE_ENTITLEMENT_TOKEN" && "$FORCE" == false ]]; then
  say "${GREEN}✓ Reusing existing SERVICE_ENTITLEMENT_TOKEN${NC}"
else
  SERVICE_ENTITLEMENT_TOKEN="$(openssl rand -hex 32)"
  say "${GREEN}✓ Generated new SERVICE_ENTITLEMENT_TOKEN${NC}"
fi

say "${BLUE}Configuring host admin bootstrap token...${NC}"
HOST_ADMIN_BOOTSTRAP_TOKEN="$(read_existing_dev_var HOST_ADMIN_BOOTSTRAP_TOKEN)"
if [[ -n "$HOST_ADMIN_BOOTSTRAP_TOKEN" && "$FORCE" == false ]]; then
  say "${GREEN}✓ Reusing existing HOST_ADMIN_BOOTSTRAP_TOKEN${NC}"
else
  HOST_ADMIN_BOOTSTRAP_TOKEN="$(openssl rand -hex 32)"
  say "${GREEN}✓ Generated new HOST_ADMIN_BOOTSTRAP_TOKEN${NC}"
fi

if [[ "$MODE" == "local-dev" ]]; then
  write_dev_vars "$APP_SECRET" "$SERVICE_ENTITLEMENT_TOKEN" "$HOST_ADMIN_BOOTSTRAP_TOKEN"
  write_env_file "$SERVICE_ENTITLEMENT_TOKEN"
  say "${GREEN}✓ Updated $DEV_VARS and $ENV_FILE${NC}"
else
  say "${BLUE}Skipping local dev files in deploy-only mode${NC}"
fi
say ""

say "${BLUE}Configuring D1 host-admin registry...${NC}"
D1_LIST_JSON="$(
  if [[ "$DRY_RUN" == true ]]; then
    echo '[]'
  else
    extract_json_array_from_output "$(vp exec wrangler d1 list --json 2>/dev/null || echo '[]')"
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

say "${BLUE}Applying host-admin D1 migrations...${NC}"
for migration_file in "$MIGRATIONS_DIR"/*.sql; do
  run_or_echo vp exec wrangler d1 execute "$HOST_ADMIN_DB_NAME" --file "$migration_file" --config "$WRANGLER_CONFIG" >/dev/null
done
say "${GREEN}✓ Applied D1 schema from $(basename "$MIGRATIONS_DIR")${NC}"
say ""

say "${BLUE}Setting Cloudflare worker secrets...${NC}"
if [[ "$DRY_RUN" == true ]]; then
  say "${BLUE}[dry-run] Would set CF_CALLS_SECRET via wrangler secret put${NC}"
  say "${BLUE}[dry-run] Would set SERVICE_ENTITLEMENT_TOKEN via wrangler secret put${NC}"
  say "${BLUE}[dry-run] Would set HOST_ADMIN_BOOTSTRAP_TOKEN via wrangler secret put${NC}"
else
  printf '%s' "$APP_SECRET" | vp exec wrangler secret put CF_CALLS_SECRET --config "$WRANGLER_CONFIG" >/dev/null
  printf '%s' "$SERVICE_ENTITLEMENT_TOKEN" | vp exec wrangler secret put SERVICE_ENTITLEMENT_TOKEN --config "$WRANGLER_CONFIG" >/dev/null
  printf '%s' "$HOST_ADMIN_BOOTSTRAP_TOKEN" | vp exec wrangler secret put HOST_ADMIN_BOOTSTRAP_TOKEN --config "$WRANGLER_CONFIG" >/dev/null
fi
say "${GREEN}✓ Updated CF_CALLS_SECRET, SERVICE_ENTITLEMENT_TOKEN, and HOST_ADMIN_BOOTSTRAP_TOKEN in Cloudflare${NC}"
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
say "  Host Admin Token: $HOST_ADMIN_BOOTSTRAP_TOKEN"
say "  HOST_ADMIN_DB: $HOST_ADMIN_DB_NAME ($HOST_ADMIN_DB_ID)"
if [[ -n "$BUDGET_ADMIN_TOKEN" ]]; then
  say "  Budget Admin Token: $BUDGET_ADMIN_TOKEN"
fi
if [[ -n "$SERVICE_ENTITLEMENT_SEEDED_TOKEN" ]]; then
  say "  Service Entitlement Token: $SERVICE_ENTITLEMENT_SEEDED_TOKEN"
fi
say ""
say "${GREEN}Notes:${NC}"
say "  - Host-admin registry seeding happens automatically on first host-admin access or scheduled monthly processing."
say "  - Full bootstrap details were written to $SETUP_SUMMARY_FILE"
if [[ "$MODE" == "local-dev" ]]; then
  say "  - Local development keeps DO_NOT_ENFORCE_SERVICE_ENTITLEMENT=true in $DEV_VARS."
fi
say ""
say "${GREEN}Next steps:${NC}"
maybe_deploy
seed_initial_credentials
write_setup_summary \
  "$APP_ID" \
  "$HOST_ADMIN_DB_ID" \
  "$HOST_ADMIN_BOOTSTRAP_TOKEN" \
  "$BUDGET_ADMIN_TOKEN" \
  "$SERVICE_ENTITLEMENT_SEEDED_TOKEN" \
  "$DEPLOYED_URL"
say "${GREEN}✓ Setup summary available at $SETUP_SUMMARY_FILE${NC}"
say ""
if [[ "$MODE" == "local-dev" ]]; then
  say "  1. Run locally: vp dev"
  say "  2. Open http://localhost:5173 and enter one of the seeded tokens in the landing token field"
  say "  3. Run E2E tests: vp run test"
else
  say "  1. Open the deployed app"
  say "  2. Paste one of the seeded tokens into the landing token field"
  say "  3. Use the Admin button only after entering a host-admin or budget-admin token"
fi
say ""
say "${BLUE}To reconfigure, run: ./scripts/setup.sh --force${NC}"
