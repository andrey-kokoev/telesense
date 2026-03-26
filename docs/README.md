# telesense Documentation

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
│   ├── 02-media-flow.md         # Packet-level details
│   └── 03-authority-topologies.md # Role and token delegation patterns
│
├── 20-protocol/                 # API documentation
│   ├── 01-api-reference.md      # All endpoints
│   └── 02-lifecycle.md          # Call sequence
│
├── 30-development/              # Development guide
│   └── (create as needed)
│
└── 40-security/                 # Security & encryption
    └── 01-webrtc-security.md    # DTLS, key exchange, interception
```

## Key Concepts

### How Remote Subscription Works

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

| ID          | What                  | Example         |
| ----------- | --------------------- | --------------- |
| `roomId`    | App-level room name   | `"ABC123"`      |
| `sessionId` | Cloudflare connection | `"ea2a61a4..."` |
| `trackName` | Media stream ID       | `"0aad9523..."` |

## Project Status

✅ **Complete**: Full 1:1 video calls working  
✅ **Verified**: Protocol via Echo Demo capture  
✅ **Tested**: Automated E2E tests passing  
✅ **Documented**: This comprehensive guide

## Navigation by Role

**New Developer?**

1. [Quick Start](./00-getting-started/01-quickstart.md)
2. [How It Works](./00-getting-started/02-how-it-works.md)
3. Run the tests: `vp run test`

**Implementing Features?**

1. [API Reference](./20-protocol/01-api-reference.md)
2. [Call Lifecycle](./20-protocol/02-lifecycle.md)
3. Check [Architecture](./10-architecture/01-overview.md) for system boundaries

**Debugging Issues?**

1. [Troubleshooting](./00-getting-started/03-troubleshooting.md)
2. [Media Flow](./10-architecture/02-media-flow.md) for packet details
3. Enable `DEBUG=true` in `.dev.vars`

**Understanding Decisions?**

1. [Architecture](./10-architecture/01-overview.md) - Current system structure
2. [Authority Topologies](./10-architecture/03-authority-topologies.md) - Role and token sharing models
3. [API Reference](./20-protocol/01-api-reference.md) - Current route surface

## Contributing

Documentation improvements welcome! Guidelines:

- Keep getting-started docs simple
- Put technical deep-dives in architecture/
- Add diagrams for complex flows

## See Also

- [Main README](../README.md) - Project overview
- [E2E Tests](../apps/telesense/e2e/) - Automated test suite
- [Task History](../.ai/tasks/) - Implementation tasks (completed)
