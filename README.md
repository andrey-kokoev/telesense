# telesence

**Status: `full 1:1 call works` (protocol verified via Echo Demo 2026-03-18)**

Cloudflare Realtime SFU implementation with verified protocol. Now organized as a pnpm monorepo.

## Quick Start

```bash
# Install dependencies
vp install

# Run automated setup (creates tokens, sets secrets)
./scripts/setup.sh

# Or manual setup: cp apps/telesense/.dev.vars.example apps/telesense/.dev.vars
#                   edit with your Cloudflare credentials

# Run dev server
vp dev
```

## Monorepo Structure

```
tesense/
├── apps/                          # Deployable applications
│   ├── telesense/                 # Main video call worker + client
│   │   ├── src/
│   │   │   ├── worker/            # Hono backend
│   │   │   └── client/            # Browser frontend
│   │   ├── e2e/                   # Playwright tests
│   │   ├── public/                # Static assets
│   │   └── wrangler.toml
│   │
│   └── usage-meter/               # Usage tracking worker
│       ├── src/index.ts           # Analytics query + KV writer
│       └── wrangler.toml
│
├── packages/                      # Shared packages (if needed)
│   └── (empty for now)
│
├── docs/                          # Documentation
│   ├── 00-getting-started/
│   ├── 10-architecture/
│   ├── 20-protocol/
│   └── 90-references/
│
├── package.json                   # Root config
├── pnpm-workspace.yaml            # Workspace definition
└── turbo.json                     # Build orchestration
```

## Available Scripts

### Root Level

```bash
vp dev                # Run telesense app
vp run dev:meter      # Run usage meter
vp build              # Build all apps
vp run test           # Run E2E tests (Playwright)
vp run deploy         # Deploy all apps
vp check              # Format, lint, and type check
```

### App Level

```bash
# In apps/telesense/
vp dev                # Start dev server
vp run test           # Run E2E tests
vp run deploy         # Deploy to Cloudflare

# In apps/usage-meter/
vp dev                # Start dev server
vp run logs           # View logs
vp run trigger        # Manual trigger
vp run status         # Check budget status
```

## Applications

### 1. telesence (`apps/telesense`)

The main video calling application.

- **Worker**: Hono backend with Cloudflare Realtime API
- **Client**: Vanilla TypeScript WebRTC client
- **Features**: 1:1 calls, discovery, subscription

[Details](./apps/telesense/README.md)

### 2. Usage Meter (`apps/usage-meter`)

Optional usage tracking and budget enforcement.

- **Purpose**: Query Cloudflare Analytics, write to KV
- **Schedule**: Runs every 5 minutes via cron
- **Function**: Budget enforcement for telesense

[Details](./apps/usage-meter/README.md)

## Documentation

- [Quick Start](./docs/00-getting-started/01-quickstart.md)
- [How It Works](./docs/00-getting-started/02-how-it-works.md)
- [Architecture](./docs/10-architecture/01-overview.md)
- [Protocol](./docs/20-protocol/01-api-reference.md)
- [Pricing Calculator](./docs/pricing-calculator.md)

## Deployment

```bash
# Deploy everything
vp run deploy

# Or individually
vp run --filter telesense deploy
vp run --filter usage-meter deploy
```

## License

MIT
