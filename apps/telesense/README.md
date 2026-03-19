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
vp dev                # Start dev servers (Worker + Vite)
vp run dev:debug      # With debug logging
vp build              # Build for production
vp run deploy         # Deploy to Cloudflare
vp run test           # Run E2E tests (Playwright)
vp run test:ui        # Interactive test mode
vp run health         # Check health endpoint
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
