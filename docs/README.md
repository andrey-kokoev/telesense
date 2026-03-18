# Telesense Documentation

Complete guide to the Cloudflare Realtime 1:1 video calling system.

## Quick Links

- 🚀 [Quick Start](./00-getting-started/01-quickstart.md) - Running in 5 minutes
- 🧠 [How It Works](./00-getting-started/02-how-it-works.md) - High-level overview
- 🆘 [Troubleshooting](./00-getting-started/03-troubleshooting.md) - Common issues

## Documentation Structure

```
docs/
├── 00-getting-started/          # Start here
│   ├── 01-quickstart.md         # 5-minute setup
│   ├── 02-how-it-works.md       # Architecture overview
│   └── 03-troubleshooting.md    # Debug guide
│
├── 10-architecture/             # System design
│   ├── 01-overview.md           # Component architecture
│   └── 02-media-flow.md         # Packet-level details
│
├── 20-protocol/                 # API documentation
│   ├── 01-api-reference.md      # All endpoints
│   └── 02-lifecycle.md          # Call sequence
│
├── 30-development/              # Development guide
│   └── (create as needed)
│
└── 90-references/               # Historical/technical refs
    ├── consensus-log.md         # Architectural decisions
    ├── open-questions.md        # Q&A tracking
    └── wire-format.md           # Verified payloads
```

## Key Concepts

### Q8: The Critical Discovery ⭐

The breakthrough finding: **Remote subscription uses the same endpoint with `location: "remote"`**.

```http
# Publishing (send)
POST /tracks/new
{ "location": "local", ... } → Returns Answer

# Subscribing (receive)
POST /tracks/new  
{ "location": "remote", ... } → Returns Offer
```

This "pull model" means browsers **ask** Cloudflare for subscription Offers.

### Three IDs to Understand

| ID | What | Example |
|----|------|---------|
| `callId` | App-level room name | `"test-call"` |
| `sessionId` | Cloudflare connection | `"ea2a61a4..."` |
| `trackName` | Media stream ID | `"0aad9523..."` |

## Project Status

✅ **Complete**: Full 1:1 video calls working  
✅ **Verified**: Protocol via Echo Demo capture  
✅ **Tested**: Automated E2E tests passing  
✅ **Documented**: This comprehensive guide

## Navigation by Role

**New Developer?**
1. [Quick Start](./00-getting-started/01-quickstart.md)
2. [How It Works](./00-getting-started/02-how-it-works.md)
3. Run the tests: `pnpm test`

**Implementing Features?**
1. [API Reference](./20-protocol/01-api-reference.md)
2. [Call Lifecycle](./20-protocol/02-lifecycle.md)
3. Check [Consensus Log](./90-references/consensus-log.md) for constraints

**Debugging Issues?**
1. [Troubleshooting](./00-getting-started/03-troubleshooting.md)
2. [Media Flow](./10-architecture/02-media-flow.md) for packet details
3. Enable `DEBUG=true` in `.dev.vars`

**Understanding Decisions?**
1. [Consensus Log](./90-references/consensus-log.md) - Why we chose this architecture
2. [Open Questions](./90-references/open-questions.md) - What's still unknown
3. [Wire Format](./90-references/wire-format.md) - Verified API payloads

## Contributing

Documentation improvements welcome! Guidelines:
- Keep getting-started docs simple
- Put technical deep-dives in architecture/
- Update references/ when protocol changes
- Add diagrams for complex flows

## See Also

- [Main README](../README.md) - Project overview
- [E2E Tests](../e2e/) - Automated test suite
- [Task History](../.ai/tasks/) - Implementation tasks (completed)
