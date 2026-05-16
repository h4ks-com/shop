#!/usr/bin/env node
// Run with: npm run register-webhooks
// Reads SHOP_PUBLIC_URL from .env. For local dev, override via env:
//   SHOP_PUBLIC_URL=$(npm run -s tunnel-url) npm run register-webhooks

const BASE = process.env.SPREADCONNECT_BASE_URL || "https://api.spreadconnect.app";
const TOKEN = process.env.SPREADCONNECT_TOKEN;
const SECRET = process.env.SPREADCONNECT_WEBHOOK_SECRET;
const PUBLIC_URL = process.env.SHOP_PUBLIC_URL;
const EVENTS = ["Shipment.sent", "Order.cancelled", "Order.needs-action"];

if (!TOKEN) throw new Error("SPREADCONNECT_TOKEN required");
if (!PUBLIC_URL) throw new Error("SHOP_PUBLIC_URL required");
if (PUBLIC_URL.includes("localhost") || PUBLIC_URL.includes("127.0.0.1")) {
  throw new Error("SHOP_PUBLIC_URL must be a public URL Spreadconnect can reach");
}
if (!SECRET) console.warn("SPREADCONNECT_WEBHOOK_SECRET empty — signatures will be skipped");

const url = `${PUBLIC_URL.replace(/\/$/, "")}/api/webhooks/spreadconnect`;

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "X-SPOD-ACCESS-TOKEN": TOKEN,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const existing = await call("GET", "/subscriptions");
console.log(`existing subscriptions: ${existing.length}`);

for (const ev of EVENTS) {
  const dup = existing.find((s) => s.eventType === ev && s.url === url);
  if (dup) {
    console.log(`  ✓ ${ev} already subscribed (id ${dup.id})`);
    continue;
  }
  const created = await call("POST", "/subscriptions", {
    eventType: ev,
    url,
    secret: SECRET || undefined,
  });
  console.log(`  + ${ev} → ${url} (id ${created.id})`);
}
