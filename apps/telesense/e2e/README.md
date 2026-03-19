# E2E Tests

Automated end-to-end tests using [Playwright](https://playwright.dev/).

## What These Tests Verify

- **Session creation**: Both browsers create Cloudflare Realtime sessions
- **Track publishing**: Local camera/mic tracks published to SFU
- **Discovery**: Each browser discovers the other's tracks
- **Subscription**: Subscribe to remote tracks and receive Offer/Answer
- **Media flow**: Verify video elements have actual stream data

## Running Tests

```bash
# Run all e2e tests (starts dev server automatically)
pnpm test

# Run with UI mode (interactive debugging)
pnpm test:ui

# Run in debug mode (step through)
pnpm test:debug

# Run specific test
pnpm test one-to-one-call
```

## Test Structure

```
e2e/
├── one-to-one-call.spec.ts  # Main 1:1 call test
└── README.md                # This file
```

## Test Artifacts

On failure, Playwright saves:

- Screenshots in `test-results/`
- Videos in `test-results/`
- Trace files for debugging

## Requirements

- Chromium browser (installed by `pnpm exec playwright install chromium`)
- Camera/mic permissions (granted automatically in test contexts)
- Valid Cloudflare credentials in `.dev.vars`
- Dev server will auto-start via `webServer` config

## CI/CD

Tests can run in CI with:

```bash
CI=true pnpm test
```

This enables retries and prevents `reuseExistingServer`.
