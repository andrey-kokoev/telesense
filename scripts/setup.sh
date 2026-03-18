#!/bin/bash
# Telesense One-Time Setup Script
# Run this once to initialize a new environment

set -e

echo "═══════════════════════════════════════════════════════════"
echo "  Telesense Setup - Cloudflare Realtime Video Calls"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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
ACCOUNT_ID=$(wrangler whoami 2>/dev/null | grep -oP 'Account ID: \K\w+' || true)
if [ -z "$ACCOUNT_ID" ]; then
    echo -e "${YELLOW}Enter your Cloudflare Account ID:${NC}"
    read -r ACCOUNT_ID
fi
echo -e "${GREEN}✓ Account ID: $ACCOUNT_ID${NC}"
echo ""

# Step 1: Cloudflare Calls App (Manual)
echo "═══════════════════════════════════════════════════════════"
echo "  STEP 1: Create Cloudflare Calls Application"
echo "═══════════════════════════════════════════════════════════"
echo ""
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
read -rs APP_SECRET
echo ""

# Update wrangler.toml
echo "Updating configuration files..."
sed -i.bak "s/REALTIME_APP_ID = \"[^\"]*/REALTIME_APP_ID = \"$APP_ID/" apps/telesense/wrangler.toml
rm -f apps/telesense/wrangler.toml.bak

echo -e "${GREEN}✓ Updated apps/telesense/wrangler.toml${NC}"
echo ""

# Step 2: KV Namespaces
echo "═══════════════════════════════════════════════════════════"
echo "  STEP 2: Create KV Namespaces"
echo "═══════════════════════════════════════════════════════════"
echo ""

cd apps/usage-meter

echo "Creating KV namespace for usage-meter..."
KV_OUTPUT=$(wrangler kv:namespace create "BUDGET_KV" 2>&1) || true
KV_ID=$(echo "$KV_OUTPUT" | grep -oP 'id = "\K[^"]+' || true)

if [ -z "$KV_ID" ]; then
    echo -e "${YELLOW}KV namespace may already exist. Checking...${NC}"
    # Try to get existing
    KV_LIST=$(wrangler kv:namespace list 2>&1 || true)
    KV_ID=$(echo "$KV_LIST" | grep -oP '"id": "\K[^"]+' | head -1 || true)
fi

if [ -n "$KV_ID" ]; then
    echo -e "${GREEN}✓ KV Namespace ID: $KV_ID${NC}"
    sed -i.bak "s/id = \"[^\"]*/id = \"$KV_ID/" wrangler.toml
    rm -f wrangler.toml.bak
    echo -e "${GREEN}✓ Updated wrangler.toml${NC}"
else
    echo -e "${RED}Failed to create/get KV namespace${NC}"
    echo "Please create manually: wrangler kv:namespace create 'BUDGET_KV'"
fi

echo ""
cd ../..

# Step 3: Set Secrets
echo "═══════════════════════════════════════════════════════════"
echo "  STEP 3: Set Secrets"
echo "═══════════════════════════════════════════════════════════"
echo ""

echo "Setting REALTIME_APP_SECRET for telesense..."
echo "$APP_SECRET" | wrangler secret put REALTIME_APP_SECRET --config apps/telesense/wrangler.toml
echo -e "${GREEN}✓ Secret set for telesense${NC}"
echo ""

# Step 4: Usage Meter Setup
echo "═══════════════════════════════════════════════════════════"
echo "  STEP 4: Usage Meter Configuration"
echo "═══════════════════════════════════════════════════════════"
echo ""

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
echo -e "${YELLOW}Enter your API Token:${NC}"
read -rs API_TOKEN
echo ""

echo "Setting CF_API_TOKEN for usage-meter..."
echo "$API_TOKEN" | wrangler secret put CF_API_TOKEN --config apps/usage-meter/wrangler.toml
echo -e "${GREEN}✓ Secret set for usage-meter${NC}"
echo ""

# Update usage-meter vars
sed -i.bak "s/# CF_ACCOUNT_ID = \"[^\"]*/CF_ACCOUNT_ID = \"$ACCOUNT_ID/" apps/usage-meter/wrangler.toml
sed -i.bak "s/# REALTIME_APP_ID = \"[^\"]*/REALTIME_APP_ID = \"$APP_ID/" apps/usage-meter/wrangler.toml
rm -f apps/usage-meter/wrangler.toml.bak

echo -e "${GREEN}✓ Updated apps/usage-meter/wrangler.toml${NC}"
echo ""

# Step 5: Test Build
echo "═══════════════════════════════════════════════════════════"
echo "  STEP 5: Test Build"
echo "═══════════════════════════════════════════════════════════"
echo ""

echo "Running type check..."
pnpm typecheck
echo -e "${GREEN}✓ Type check passed${NC}"
echo ""

echo "Running tests..."
pnpm test
echo -e "${GREEN}✓ Tests passed${NC}"
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
echo "Next steps:"
echo "  1. Deploy: pnpm deploy"
echo "  2. Or run locally: pnpm dev"
echo "  3. For CI/CD, add these secrets to GitHub:"
echo "     - CF_API_TOKEN"
echo "     - REALTIME_APP_SECRET"
echo ""
echo -e "${YELLOW}Documentation:${NC} https://github.com/andrey-kokoev/telesense#readme"
