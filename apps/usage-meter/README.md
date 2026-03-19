# Usage Meter

Tracks Cloudflare Realtime usage and enforces budget limits.

## What It Does

1. **Queries Cloudflare Analytics** every 5 minutes (cron)
2. **Writes usage to KV** for telesense to read
3. **Tracks monthly egress** against free tier (1TB)
4. **Signals budget status** (ok/warning/critical)

## Configuration

Edit `wrangler.toml`:

- `CF_ACCOUNT_ID` - Your Cloudflare account ID
- `REALTIME_APP_ID` - Your Calls app ID

Set secrets:

```bash
wrangler secret put CF_API_TOKEN
# Token needs: Analytics:Read permission
```

Create KV namespace:

```bash
wrangler kv:namespace create "BUDGET_KV"
# Copy ID to wrangler.toml
```

## Scripts

```bash
pnpm dev              # Start dev server
pnpm deploy           # Deploy to Cloudflare
pnpm logs             # View logs
pnpm trigger          # Manual trigger (if running)
pnpm status           # Check budget status
```

## Endpoints

- `POST /trigger` - Manual trigger (runs immediately)
- `GET /status` - Current budget status
- `GET /usage` - Detailed usage data

## How It Works

```
┌─────────────┐     Query      ┌─────────────┐
│ Usage Meter │ ◄───────────── │  Cloudflare │
│   (Cron)    │   Analytics    │  Analytics  │
└──────┬──────┘                └─────────────┘
       │
       │ Write
       ▼
┌─────────────┐     Read       ┌─────────────┐
│   KV Store  │ ─────────────► │  Telesense  │
│  budget:xxx │                │   Worker    │
└─────────────┘                └─────────────┘
```

## KV Keys

| Key             | Content                  |
| --------------- | ------------------------ |
| `usage:latest`  | Current cumulative usage |
| `usage:YYYY-MM` | Monthly usage history    |
| `budget:status` | Computed budget status   |
