# Troubleshooting

Common issues and solutions.

## Setup Issues

### "Command not found: vp"

```bash
# Install Vite+ (global CLI)
npm install -g vite-plus

# Or use npx
npx vp <command>
```

### "Failed to install dependencies"

```bash
# Clean and retry
rm -rf node_modules pnpm-lock.yaml
vp install
```

## Runtime Issues

### "Failed to capture: NotFoundError"

**Cause**: No camera/mic detected.

**Solutions**:

1. Check hardware is connected
2. Check browser permissions (click lock icon in address bar)
3. For headless testing, use fake devices:
   ```bash
   pnpm test  # Tests use fake media automatically
   ```

### "Session failed: 502"

**Cause**: Cloudflare API rejected request.

**Check**:

1. `REALTIME_APP_ID` in `wrangler.toml` is correct
2. `CF_CALLS_SECRET` in `.dev.vars` is correct
3. Credentials are from the same Cloudflare Calls app

**Debug**:

```bash
# Enable debug logging
echo "DEBUG=true" >> .dev.vars
vp dev
```

### "Missing authentication token" / "Invalid authentication token"

**Cause**: `X-User-Token` header missing or incorrect.

**Solutions**:

1. **Development**: Check `DO_NOT_ENFORCE_USER_TOKEN=true` is in `.dev.vars` to disable auth
2. **Production**: Ensure client sends correct `X-User-Token` header matching `GENERIC_USER_TOKEN`
3. Check browser devtools Network tab for the header value

```bash
# Temporarily disable auth for testing (dev only)
echo "DO_NOT_ENFORCE_USER_TOKEN=true" >> apps/telesense/.dev.vars
```

### "ICE failed" or "ICE timeout"

**Cause**: Network can't establish peer connection.

**Solutions**:

1. Check firewall allows UDP
2. Try different network (mobile hotspot)
3. Check STUN connectivity:
   ```javascript
   // In browser console
   pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] })
   // Check iceConnectionState
   ```

### "Published but no remote video"

**Cause**: Discovery/subscription not working.

**Check**:

1. Both tabs use same `roomId` (check URL: `?room=ABC123`)
2. Check browser console for errors
3. Check network tab for `/discover-remote-tracks` calls
4. Wait longer (discovery polls every 2 seconds)

**Debug**:

```bash
# Check health endpoint
vp run health
# Should show: callsActive, sessionsActive
```

## Development Issues

### "Port 5173 already in use"

```bash
# Kill process on port 5173
lsof -ti:5173 | xargs kill -9

# Or use different port
PORT=3000 vp dev
```

### "TypeScript errors"

```bash
# Check types and more
vp check

# Rebuild
vp install
```

### "Wrangler compatibility warning"

Safe to ignore. Update if desired:

```bash
vp update wrangler
```

## E2E Test Issues

### Tests fail with "Requested device not found"

Tests use fake media devices. Check `playwright.config.ts` has:

```typescript
launchOptions: {
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]
}
```

### Tests timeout

Increase timeout in `playwright.config.ts`:

```typescript
timeout: 60000 // 60 seconds
```

Or extend specific test:

```typescript
test("slow test", async () => {
  test.setTimeout(60000)
  // ...
})
```

## Still Stuck?

1. Check [GitHub Issues](https://github.com/andrey-kokoev/telesense/issues)
2. Review [Architecture Docs](../10-architecture/01-overview.md)
3. Check [Protocol Reference](../20-protocol/01-api-reference.md)
4. Enable debug mode and check logs

## Debug Mode

Enable verbose logging:

```bash
# Method 1: Environment variable
DEBUG=true vp dev

# Method 2: .dev.vars file
echo "DEBUG=true" >> .dev.vars
vp dev
```

You'll see:

- Cloudflare API requests/responses
- Session creation details
- Track publishing/subscription flow

## Getting Help

Include in bug reports:

1. Browser version
2. `vp check` output
3. Browser console errors
4. Network tab screenshots
5. `DEBUG=true` logs (sanitized)
