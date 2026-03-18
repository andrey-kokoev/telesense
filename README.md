# Telesense

**Status: `full 1:1 call works` (protocol verified via Echo Demo 2026-03-18)**

Cloudflare Realtime SFU implementation with verified protocol. Now organized as a pnpm monorepo.

## Quick Start

```bash
# Install dependencies
pnpm install

# Run main app
cd apps/telesense
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your Cloudflare credentials
pnpm dev
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
pnpm dev              # Run telesense app
pnpm dev:meter        # Run usage meter
pnpm build            # Build all apps
pnpm test             # Run E2E tests
pnpm deploy           # Deploy all apps
pnpm typecheck        # Type check all apps
```

### App Level

```bash
# In apps/telesense/
pnpm dev              # Start dev server
pnpm test             # Run E2E tests
pnpm deploy           # Deploy to Cloudflare

# In apps/usage-meter/
pnpm dev              # Start dev server
pnpm logs             # View logs
pnpm trigger          # Manual trigger
pnpm status           # Check budget status
```

## Applications

### 1. Telesense (`apps/telesense`)

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
pnpm deploy

# Or individually
pnpm --filter telesense deploy
pnpm --filter usage-meter deploy
```

## Key Insight: Q8 Resolved ⭐

Remote subscription uses `POST /tracks/new` with `location: "remote"` to request an Offer from Cloudflare. This "pull model" was the breakthrough discovery.

## License

MIT
