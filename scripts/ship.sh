#!/bin/bash
# Smart deploy script - skips usage-meter if not configured

set -e

echo "═══════════════════════════════════════════════════════════"
echo "  Deploying Telesense"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Deploy telesense (always)
echo "Deploying telesense..."
pnpm --filter telesense ship
echo -e "${GREEN}✓ Telesense deployed${NC}"
echo ""

# Check if usage-meter is configured
CF_API_TOKEN_SET=$(cd apps/usage-meter && wrangler secret list 2>/dev/null | grep -c "CF_API_TOKEN" || true)

if [ "$CF_API_TOKEN_SET" -gt 0 ]; then
    echo "Deploying usage-meter..."
    pnpm --filter usage-meter ship
    echo -e "${GREEN}✓ Usage-meter deployed${NC}"
else
    echo -e "${YELLOW}⚠ Skipping usage-meter (CF_API_TOKEN not set)${NC}"
    echo -e "${BLUE}  To deploy usage-meter later, run: pnpm ship:meter${NC}"
    echo ""
    echo "  Or set up with:"
    echo "    1. Create API token at https://dash.cloudflare.com/profile/api-tokens"
    echo "    2. echo 'your-token' | wrangler secret put CF_API_TOKEN --config apps/usage-meter/wrangler.toml"
    echo "    3. pnpm deploy:meter"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Deploy Complete!"
echo "═══════════════════════════════════════════════════════════"
