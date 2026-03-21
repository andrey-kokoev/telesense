# E2E Tests

Automated end-to-end tests using [Playwright](https://playwright.dev/).

## What These Tests Verify

- session creation in both browsers
- local track publishing to Cloudflare Realtime
- remote track discovery between participants
- subscribe/answer flow for remote media
- actual media arriving on the remote video elements

## Running Tests

```bash
# Run all e2e tests (starts dev server automatically)
vp run test

# Run with UI mode
vp run test:ui

# Run in debug mode
vp run test:debug
```

For a single file:

```bash
vp run test -- e2e/one-to-one-call.spec.ts
```

## Test Structure

```text
e2e/
├── one-to-one-call.spec.ts
└── README.md
```

## Test Artifacts

On failure, Playwright saves:

- screenshots in `test-results/`
- videos in `test-results/`
- trace files for debugging

## Requirements

- Chromium browser available to Playwright
- camera/mic permissions granted in the test context
- valid Cloudflare credentials in `.dev.vars`
- dev server auto-starts through Playwright `webServer` config

## CI

```bash
CI=true vp run test
```

This enables retries and disables `reuseExistingServer`.
