# Quick Start

Get a 1:1 video call running in 5 minutes.

## Prerequisites

- Node.js 18+
- `vp`
- Cloudflare account with Realtime enabled
- Webcam and microphone (or use `--use-fake-device-for-media-stream` flag)

## 1. Clone and Setup

```bash
git clone https://github.com/andrey-kokoev/telesense.git
cd telesense
vp install
```

## 2. Configure Credentials

### Automated Setup (Recommended)

```bash
./scripts/setup.sh
```

This interactive script will:

- Check prerequisites (`vp`, Wrangler auth, Node)
- Guide you through creating a Cloudflare Calls app
- Generate or reuse:
  - the worker `SERVICE_ENTITLEMENT_TOKEN`
  - the `HOST_ADMIN_BOOTSTRAP_TOKEN`
- Create or reuse the host-admin D1 database
- Apply the host-admin D1 migration
- Set all required worker secrets
- Write a local `.setup-summary` with the host-admin bootstrap token for first `/host-admin` login

**Re-running**: The script is idempotent. It will reuse existing tokens and skip already-configured resources. Use `./scripts/setup.sh --force` to regenerate everything.

### Manual Setup (Alternative)

If you prefer manual configuration:

1. Go to https://dash.cloudflare.com/?to=/:account/calls
2. Create a new Calls application
3. Copy:
   - **App ID** (looks like `8b4b4a5e75f322fe92872b9a1d3747b5`)
   - **App Token** (long random string)

```bash
# Copy template
cp apps/telesense/.dev.vars.example apps/telesense/.dev.vars

# Edit .dev.vars
CF_CALLS_SECRET=your-token-here
SERVICE_ENTITLEMENT_TOKEN=$(openssl rand -hex 32)
HOST_ADMIN_BOOTSTRAP_TOKEN=$(openssl rand -hex 32)
DO_NOT_ENFORCE_SERVICE_ENTITLEMENT=true

# Edit wrangler.toml
# Set: REALTIME_APP_ID = "your-app-id"
# Replace HOST_ADMIN_DB database_id with your real D1 id

# Set secrets in Cloudflare
echo "your-token" | vp exec wrangler secret put CF_CALLS_SECRET --config apps/telesense/wrangler.toml
echo "your-service-entitlement-token" | vp exec wrangler secret put SERVICE_ENTITLEMENT_TOKEN --config apps/telesense/wrangler.toml
echo "your-host-admin-bootstrap-token" | vp exec wrangler secret put HOST_ADMIN_BOOTSTRAP_TOKEN --config apps/telesense/wrangler.toml

# Create and migrate host-admin D1
vp exec wrangler d1 create telesense-host-admin
vp exec wrangler d1 execute telesense-host-admin --file apps/telesense/migrations/0001_host_admin_registry.sql --config apps/telesense/wrangler.toml
```

> **Note**: The setup script sets `DO_NOT_ENFORCE_SERVICE_ENTITLEMENT=true` in `.dev.vars` for local development. This disables service-entitlement enforcement so you can test without sending the `X-Service-Entitlement-Token` header. Remove or set to `false` to test auth locally. Production requires the token.

## 3. Run Development Server

```bash
vp dev
```

This starts:

- Worker on http://localhost:8787 (API)
- Vite on http://localhost:5173 (Client)

## 4. Test the Call

1. Open http://localhost:5173/?room=ABC123 in **Tab 1**
2. Allow camera/mic when prompted
3. Open same URL in **Tab 2**
4. Allow camera/mic
5. Wait 5-10 seconds

**Expected**: Both tabs show local + remote video.

## 4a. First Host Admin Login

After setup, use the host-admin bootstrap token once:

1. Open http://localhost:5173/host-admin
2. Paste the `Host Admin Token` from `.setup-summary`
3. The app exchanges it for a host-admin session token stored in local storage

After that, host-admin uses the session token, not the bootstrap token directly.

## 5. Run Automated Tests

```bash
# Run E2E tests (headless with fake media)
vp run test

# Or with UI for debugging
vp run test:ui
```

## Common Issues

### "Failed to capture: NotFoundError"

No camera/mic detected. For headless testing:

```bash
# Tests use fake devices automatically
vp run test
```

### "Session failed: 502"

Check credentials in `.dev.vars` and `wrangler.toml`.

### "ICE failed"

Network/firewall blocking UDP. Try different network or check STUN connectivity.

## Next Steps

- [How It Works](./02-how-it-works.md) - Understand the architecture
- [Troubleshooting](./03-troubleshooting.md) - Debug common issues
- [Architecture Deep Dive](../10-architecture/01-overview.md) - System design
