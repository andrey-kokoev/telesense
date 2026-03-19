# Quick Start

Get a 1:1 video call running in 5 minutes.

## Prerequisites

- Node.js 18+ and pnpm
- Cloudflare account with Realtime enabled
- Webcam and microphone (or use `--use-fake-device-for-media-stream` flag)

## 1. Clone and Setup

```bash
git clone https://github.com/andrey-kokoev/telesense.git
cd telesense
pnpm install
```

## 2. Configure Credentials

### Automated Setup (Recommended)

```bash
./scripts/setup.sh
```

This interactive script will:

- Check prerequisites (wrangler, pnpm)
- Guide you through creating a Cloudflare Calls app
- Generate secure tokens automatically
- Create KV namespaces
- Set up all required secrets

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
GENERIC_USER_TOKEN=$(openssl rand -hex 32)

# Edit wrangler.toml
# Set: REALTIME_APP_ID = "your-app-id"

# Set secrets in Cloudflare
echo "your-token" | wrangler secret put CF_CALLS_SECRET --config apps/telesense/wrangler.toml
echo "your-user-token" | wrangler secret put GENERIC_USER_TOKEN --config apps/telesense/wrangler.toml
```

> **Note**: The setup script sets `DO_NOT_ENFORCE_USER_TOKEN=true` in `.dev.vars` for local development. This disables authentication so you can test without sending the `X-User-Token` header. Remove or set to `false` to test auth locally. Production requires the token (this variable is not set in production).

## 3. Run Development Server

```bash
pnpm dev
```

This starts:

- Worker on http://localhost:8787 (API)
- Vite on http://localhost:5173 (Client)

## 4. Test the Call

1. Open http://localhost:5173/?call=test in **Tab 1**
2. Allow camera/mic when prompted
3. Open same URL in **Tab 2**
4. Allow camera/mic
5. Wait 5-10 seconds

**Expected**: Both tabs show local + remote video.

## 5. Run Automated Tests

```bash
# Run E2E tests (headless with fake media)
pnpm test

# Or with UI for debugging
pnpm test:ui
```

## Common Issues

### "Failed to capture: NotFoundError"

No camera/mic detected. For headless testing:

```bash
# Tests use fake devices automatically
pnpm test
```

### "Session failed: 502"

Check credentials in `.dev.vars` and `wrangler.toml`.

### "ICE failed"

Network/firewall blocking UDP. Try different network or check STUN connectivity.

## Next Steps

- [How It Works](./02-how-it-works.md) - Understand the architecture
- [Troubleshooting](./03-troubleshooting.md) - Debug common issues
- [Architecture Deep Dive](../10-architecture/01-overview.md) - System design
