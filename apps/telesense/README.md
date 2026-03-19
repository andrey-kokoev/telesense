# Telesense App

The main video calling application.

## Structure

```
src/
├── worker/
│   └── index.ts           # Hono backend
├── client/
│   └── main.ts            # Browser WebRTC client
└── e2e/
    └── one-to-one-call.spec.ts  # Playwright tests

public/
└── index.html             # Static HTML
```

## Scripts

```bash
pnpm dev              # Start dev servers (Worker + Vite)
pnpm dev:debug        # With debug logging
pnpm build            # Build for production
pnpm deploy           # Deploy to Cloudflare
pnpm test             # Run E2E tests
pnpm test:ui          # Interactive test mode
pnpm health           # Check health endpoint
```

## Configuration

Copy `.dev.vars.example` to `.dev.vars` and set:
- `CF_CALLS_SECRET` - From Cloudflare dashboard

Edit `wrangler.toml`:
- `REALTIME_APP_ID` - Your app ID

## API Endpoints

- `POST /api/calls/:callId/session` - Create session
- `POST /api/calls/:callId/publish-offer` - Publish tracks
- `POST /api/calls/:callId/subscribe-offer` - Subscribe to tracks
- `POST /api/calls/:callId/complete-subscribe` - Complete subscription
- `GET /api/calls/:callId/discover-remote-tracks` - Find remote tracks
- `POST /api/calls/:callId/leave` - Clean up session
- `GET /health` - Health check
