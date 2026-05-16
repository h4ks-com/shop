#!/usr/bin/env node
// Print the current cloudflared quick-tunnel URL. Dev-only helper.
// Usage:
//   npm run -s tunnel-url
//   SHOP_PUBLIC_URL=$(npm run -s tunnel-url) npm run register-webhooks

const r = await fetch("http://127.0.0.1:20241/quicktunnel", {
  signal: AbortSignal.timeout(2000),
}).catch(() => null);
if (!r || !r.ok) {
  console.error("no tunnel found on :20241 — is `docker compose --profile dev up` running?");
  process.exit(1);
}
const { hostname } = await r.json();
if (!hostname) {
  console.error("tunnel metrics returned no hostname yet — wait a few seconds and retry");
  process.exit(1);
}
process.stdout.write(`https://${hostname}\n`);
