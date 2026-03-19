#!/bin/bash
# Telesense Setup Script
# Idempotent - safe to run multiple times

set -e

# Parse arguments
FORCE=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --force)
            FORCE=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--force]"
            exit 1
            ;;
    esac
done

echo "═══════════════════════════════════════════════════════════"
echo "  Telesense Setup - Cloudflare Realtime Video Calls"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v wrangler &> /dev/null; then
    echo -e "${RED}Error: wrangler CLI not found${NC}"
    echo "Install: npm install -g wrangler"
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}Error: pnpm not found${NC}"
    echo "Install: npm install -g pnpm"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites met${NC}"
echo ""

# Check if already configured (unless --force)
if [ "$FORCE" = false ] && [ -f "apps/telesense/.dev.vars" ]; then
    echo -e "${BLUE}Configuration already exists.${NC}"
    echo "Run with --force to reconfigure or continue to verify setup."
    echo ""
    read -p "Continue with verification? [Y/n] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        echo "Setup cancelled. Use --force to reconfigure."
        exit 0
    fi
fi

# Install dependencies
echo "Installing dependencies..."
pnpm install
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Check if already logged in to Wrangler
echo "Checking Cloudflare authentication..."
if ! wrangler whoami &> /dev/null; then
    echo -e "${YELLOW}Please authenticate with Cloudflare:${NC}"
    wrangler login
else
    echo -e "${GREEN}✓ Already authenticated${NC}"
fi
echo ""

# Get account ID
echo "Getting Cloudflare account ID..."
# Try to extract from wrangler whoami table format (wrangler 3.x+)
ACCOUNT_ID=$(wrangler whoami 2>/dev/null | grep -oE '[a-f0-9]{32}' | head -1 || true)
if [ -z "$ACCOUNT_ID" ]; then
    echo -e "${YELLOW}Enter your Cloudflare Account ID:${NC}"
    read -r ACCOUNT_ID
fi
echo -e "${GREEN}✓ Account ID: $ACCOUNT_ID${NC}"
echo ""

# Step 1: Cloudflare Calls App (Manual)
echo "═══════════════════════════════════════════════════════════"
echo "  STEP 1: Cloudflare Calls Application"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check if already configured
EXISTING_APP_ID=""
if [ -f "apps/telesense/wrangler.toml" ] && [ "$FORCE" = false ]; then
    EXISTING_APP_ID=$(grep "REALTIME_APP_ID = " apps/telesense/wrangler.toml | grep -oP 'REALTIME_APP_ID = "\K[^"]+' || true)
    if [ -n "$EXISTING_APP_ID" ] && [ "$EXISTING_APP_ID" != "your-app-id" ]; then
        echo -e "${BLUE}Existing App ID found: $EXISTING_APP_ID${NC}"
        read -p "Use existing App ID? [Y/n] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            APP_ID=$EXISTING_APP_ID
            # Try to get existing secret
            if [ -f "apps/telesense/.dev.vars" ]; then
                APP_SECRET=$(grep "CF_CALLS_SECRET=" apps/telesense/.dev.vars | cut -d'=' -f2 || true)
            fi
        fi
    fi
fi

if [ -z "$APP_ID" ]; then
    echo -e "${YELLOW}MANUAL STEP REQUIRED:${NC}"
    echo ""
    echo "1. Go to: https://dash.cloudflare.com/?to=/:account/calls"
    echo "2. Click 'Create Calls Application'"
    echo "3. Give it a name (e.g., 'telesense-prod')"
    echo "4. Copy the App ID (looks like: 8b4b4a5e75f322fe92872b9a1d3747b5)"
    echo "5. Copy the App Secret (long random string)"
    echo ""
    echo -e "${YELLOW}Enter your Calls App ID:${NC}"
    read -r APP_ID

    echo -e "${YELLOW}Enter your Calls App Secret:${NC}"
    echo "  (input hidden for security - paste and press Enter)"
    read -rs APP_SECRET
    if [ -n "$APP_SECRET" ]; then
        echo -e "  ${GREEN}✓ Secret received ($(echo "$APP_SECRET" | wc -c) chars)${NC}"
    else
        echo -e "  ${YELLOW}⚠ No input received${NC}"
    fi
    echo ""
fi

# Check for existing GENERIC_USER_TOKEN or generate new
TOKEN_IS_NEW=false
GENERIC_TOKEN=""

if [ -f "apps/telesense/.dev.vars" ] && [ "$FORCE" = false ]; then
    GENERIC_TOKEN=$(grep "GENERIC_USER_TOKEN=" apps/telesense/.dev.vars | cut -d'=' -f2 || true)
    if [ -n "$GENERIC_TOKEN" ]; then
        echo -e "${BLUE}Existing GENERIC_USER_TOKEN found${NC}"
        read -p "Generate new token? [y/N] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            GENERIC_TOKEN=""  # Will generate new below
        fi
    fi
fi

if [ -z "$GENERIC_TOKEN" ]; then
    GENERIC_TOKEN=$(openssl rand -hex 32)
    TOKEN_IS_NEW=true
    echo -e "${GREEN}✓ Generated new Generic User Token${NC}"
else
    echo -e "${GREEN}✓ Keeping existing Generic User Token${NC}"
fi
echo ""

# Update wrangler.toml
echo "Updating configuration files..."
sed -i.bak "s/REALTIME_APP_ID = \"[^\"]*/REALTIME_APP_ID = \"$APP_ID/" apps/telesense/wrangler.toml
rm -f apps/telesense/wrangler.toml.bak

# Create/Update .dev.vars with both secrets
cat > apps/telesense/.dev.vars << EOF
CF_CALLS_SECRET=$APP_SECRET
GENERIC_USER_TOKEN=$GENERIC_TOKEN

# Dev-only: Disable auth enforcement for local development
DO_NOT_ENFORCE_USER_TOKEN=true
EOF

echo -e "${GREEN}✓ Updated apps/telesense/.dev.vars${NC}"
echo ""

# Create/Update .env for client (Vite will pick this up)
cat > apps/telesense/.env << EOF
VITE_USER_TOKEN=$GENERIC_TOKEN
EOF

echo -e "${GREEN}✓ Updated apps/telesense/.env (for client)${NC}"
echo ""

# Step 2: KV Namespaces
echo "═══════════════════════════════════════════════════════════"
echo "  STEP 2: KV Namespaces"
echo "═══════════════════════════════════════════════════════════"
echo ""

cd apps/usage-meter

# Check for existing BUDGET_KV namespace
KV_ID=""
if [ "$FORCE" = false ]; then
    KV_LIST=$(wrangler kv namespace list 2>/dev/null || true)
    if command -v jq &> /dev/null; then
        KV_ID=$(echo "$KV_LIST" | jq -r '.[] | select(.title == "BUDGET_KV") | .id' 2>/dev/null || true)
    else
        # Fallback: extract id from entry matching our title
        KV_ID=$(echo "$KV_LIST" | grep -B1 '"title": "BUDGET_KV"' | grep '"id"' | grep -oP '"id": "\K[^"]+' | head -1 || true)
    fi
    if [ -n "$KV_ID" ]; then
        echo -e "${BLUE}Found existing BUDGET_KV namespace: $KV_ID${NC}"
    fi
fi

if [ -z "$KV_ID" ]; then
    echo "Creating KV namespace for usage-meter..."
    KV_OUTPUT=$(wrangler kv namespace create "BUDGET_KV" 2>&1) || true
    KV_ID=$(echo "$KV_OUTPUT" | grep -oP 'id = "\K[^"]+' || true)
    
    if [ -z "$KV_ID" ]; then
        echo -e "${YELLOW}KV namespace may already exist. Checking by listing...${NC}"
        KV_LIST=$(wrangler kv namespace list 2>/dev/null || true)
        if command -v jq &> /dev/null; then
            KV_ID=$(echo "$KV_LIST" | jq -r '.[] | select(.title == "BUDGET_KV") | .id' 2>/dev/null || true)
        else
            KV_ID=$(echo "$KV_LIST" | grep -B1 '"title": "BUDGET_KV"' | grep '"id"' | grep -oP '"id": "\K[^"]+' | head -1 || true)
        fi
    fi
fi

if [ -n "$KV_ID" ]; then
    echo -e "${GREEN}✓ KV Namespace ID: $KV_ID${NC}"
    sed -i.bak "s/id = \"[^\"]*/id = \"$KV_ID/" wrangler.toml
    rm -f wrangler.toml.bak
    echo -e "${GREEN}✓ Updated wrangler.toml${NC}"
else
    echo -e "${RED}Failed to create/get KV namespace${NC}"
    echo "Please create manually: wrangler kv namespace create 'BUDGET_KV'"
fi

echo ""
cd ../..

# Step 3: Set Secrets
echo "═══════════════════════════════════════════════════════════"
echo "  STEP 3: Set Secrets"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check if secrets already exist (wrangler doesn't have a "get secret", so we try a workaround)
# We'll just set them - wrangler will update existing secrets

echo "Setting CF_CALLS_SECRET for telesense..."
echo "$APP_SECRET" | wrangler secret put CF_CALLS_SECRET --config apps/telesense/wrangler.toml
echo -e "${GREEN}✓ CF_CALLS_SECRET set for telesense${NC}"

echo "Setting GENERIC_USER_TOKEN for telesense..."
echo "$GENERIC_TOKEN" | wrangler secret put GENERIC_USER_TOKEN --config apps/telesense/wrangler.toml
echo -e "${GREEN}✓ GENERIC_USER_TOKEN set for telesense${NC}"
echo ""

# Step 4: Usage Meter Setup (Optional)
echo "═══════════════════════════════════════════════════════════"
echo "  STEP 4: Usage Meter Configuration (Optional)"
echo "═══════════════════════════════════════════════════════════"
echo ""

read -p "Set up usage-meter for analytics? [y/N] " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Check if CF_API_TOKEN already set
    API_TOKEN_SET=false
    if [ "$FORCE" = false ]; then
        if wrangler secret list --config apps/usage-meter/wrangler.toml 2>/dev/null | grep -q "CF_API_TOKEN"; then
            echo -e "${BLUE}CF_API_TOKEN already set for usage-meter${NC}"
            read -p "Update CF_API_TOKEN? [y/N] " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                API_TOKEN_SET=true
            fi
        fi
    fi

    if [ "$API_TOKEN_SET" = false ]; then
        echo -e "${YELLOW}Create an API Token for Usage Meter:${NC}"
        echo ""
        echo "1. Go to: https://dash.cloudflare.com/profile/api-tokens"
        echo "2. Click 'Create Token'"
        echo "3. Use 'Create Custom Token'"
        echo "4. Permissions needed:"
        echo "   - Zone:Read (or Account:Read)"
        echo "   - Analytics:Read"
        echo "5. Copy the token"
        echo ""
        echo -e "${YELLOW}Enter your API Token (or press Enter to skip):${NC}"
        echo "  (input hidden for security - paste and press Enter)"
        read -rs API_TOKEN
        if [ -n "$API_TOKEN" ]; then
            echo -e "  ${GREEN}✓ Token received ($(echo "$API_TOKEN" | wc -c) chars)${NC}"
        else
            echo -e "  ${BLUE}ℹ Skipped${NC}"
        fi
        echo ""

        if [ -n "$API_TOKEN" ]; then
            echo "Setting CF_API_TOKEN for usage-meter..."
            echo "$API_TOKEN" | wrangler secret put CF_API_TOKEN --config apps/usage-meter/wrangler.toml
            echo -e "${GREEN}✓ Secret set for usage-meter${NC}"
        else
            echo -e "${YELLOW}Skipped CF_API_TOKEN setup${NC}"
        fi
    else
        echo -e "${GREEN}✓ Skipping CF_API_TOKEN (already set)${NC}"
    fi

    # Update usage-meter vars regardless
    sed -i.bak "s/CF_ACCOUNT_ID = \"[^\"]*/CF_ACCOUNT_ID = \"$ACCOUNT_ID/" apps/usage-meter/wrangler.toml
    sed -i.bak "s/REALTIME_APP_ID = \"[^\"]*/REALTIME_APP_ID = \"$APP_ID/" apps/usage-meter/wrangler.toml
    rm -f apps/usage-meter/wrangler.toml.bak
    echo -e "${GREEN}✓ Updated apps/usage-meter/wrangler.toml${NC}"
else
    echo -e "${BLUE}Skipped usage-meter setup (optional)${NC}"
fi
echo ""

# Step 5: Type Check
echo "═══════════════════════════════════════════════════════════"
echo "  STEP 5: Type Check"
echo "═══════════════════════════════════════════════════════════"
echo ""

echo "Running type check..."
pnpm typecheck
echo -e "${GREEN}✓ Type check passed${NC}"
echo ""

# Summary
echo "═══════════════════════════════════════════════════════════"
echo "  Setup Complete! 🎉"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo -e "${GREEN}Configuration Summary:${NC}"
echo "  Account ID: $ACCOUNT_ID"
echo "  App ID: $APP_ID"
echo "  KV Namespace: ${KV_ID:-'Not created (create manually)'}"
echo ""
echo -e "${GREEN}Token Management:${NC}"
if [ "$TOKEN_IS_NEW" = true ]; then
    echo "  GENERIC_USER_TOKEN: ${GENERIC_TOKEN:0:16}... (new)"
else
    echo "  GENERIC_USER_TOKEN: ${GENERIC_TOKEN:0:16}... (existing preserved)"
fi
echo ""
echo "Next steps:"
echo "  1. Run locally: pnpm dev"
echo "  2. Run tests (requires valid credentials): pnpm test"
echo "  3. Deploy: pnpm deploy"
echo "  4. For CI/CD, add these secrets to GitHub:"
echo "     - CF_API_TOKEN"
echo "     - CF_CALLS_SECRET"
echo "     - GENERIC_USER_TOKEN"
echo ""
echo -e "${YELLOW}Documentation:${NC} https://github.com/andrey-kokoev/telesense#readme"
echo ""
echo -e "${BLUE}To reconfigure, run: ./scripts/setup.sh --force${NC}"
