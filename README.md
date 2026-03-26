# telesense

**Status: `full 1:1 call works` (protocol verified via Echo Demo 2026-03-18)**

Cloudflare Realtime SFU implementation with verified protocol.

## Quick Start

```bash
# Install dependencies
vp install

# Run automated setup (Calls app, host-admin bootstrap token, D1 host-admin registry, secrets)
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
├── packages/                      # Shared packages (if needed)
│   └── (empty for now)
│
├── docs/                          # Documentation
│   ├── 00-getting-started/
│   ├── 10-architecture/
│   ├── 20-protocol/
│   └── 40-security/
│
├── package.json                   # Root config
├── pnpm-workspace.yaml            # Workspace definition
└── turbo.json                     # Build orchestration
```

## Available Scripts

### Root Level

```bash
vp dev                # Run telesense app
vp build              # Build telesense
vp run test           # Run E2E tests (Playwright)
vp run deploy         # Deploy telesense
vp check              # Format, lint, and type check
```

### App Level

```bash
# In apps/telesense/
vp dev                # Start dev server
vp run test           # Run E2E tests
vp run deploy         # Deploy to Cloudflare
```

## Applications

### 1. telesense (`apps/telesense`)

The main video calling application.

- **Worker**: Hono backend with Cloudflare Realtime API
- **Client**: Vanilla TypeScript WebRTC client
- **Features**: 1:1 calls, entitlement budgets, monthly allowance reset, host admin

[Details](./apps/telesense/README.md)

## Documentation

- [Quick Start](./docs/00-getting-started/01-quickstart.md)
- [How It Works](./docs/00-getting-started/02-how-it-works.md)
- [Architecture](./docs/10-architecture/01-overview.md)
- [Protocol](./docs/20-protocol/01-api-reference.md)
- [Pricing Calculator](./docs/pricing-calculator.md)

## Deployment

```bash
# Deploy
vp run deploy

# Or directly
vp run --filter telesense deploy
```

## License

MIT
