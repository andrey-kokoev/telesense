#!/bin/bash
# Deploy telesense

set -e

echo "═══════════════════════════════════════════════════════════"
echo "  Deploying telesense"
echo "═══════════════════════════════════════════════════════════"
echo ""

GREEN='\033[0;32m'
NC='\033[0m'

echo "Building telesense client..."
vp run --filter telesense build
echo -e "${GREEN}✓ Client built${NC}"
echo ""

echo "Deploying telesense..."
vp run --filter telesense ship
echo -e "${GREEN}✓ telesense deployed${NC}"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  Deploy Complete!"
echo "═══════════════════════════════════════════════════════════"
