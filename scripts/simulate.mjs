#!/usr/bin/env node
// Run with: node --env-file=.env scripts/simulate.mjs <command> [orderId]
//
// Commands:
//   processed <id>       — POST /orders/<id>/simulate/order-processed
//   shipped <id>         — POST /orders/<id>/simulate/shipment-sent
//   cancelled <id>       — POST /orders/<id>/simulate/order-cancelled
//   lifecycle <id>       — processed → shipped (cancel is destructive, run separately)
//   subs                 — list registered webhook subscriptions
//
// <id> is the Spreadconnect numeric order id. Find it via:
//   docker compose logs shop | grep "webhook: confirmed"
// or in the Spreadconnect dashboard order detail page.

const BASE = process.env.SPREADCONNECT_BASE_URL || "https://api.spreadconnect.app";
const TOKEN = process.env.SPREADCONNECT_TOKEN;
if (!TOKEN) throw new Error("SPREADCONNECT_TOKEN required");
if (!BASE.includes("staging")) {
  console.warn(
    `⚠ SPREADCONNECT_BASE_URL=${BASE} is not staging — simulate endpoints only work on staging.`,
  );
}

async function call(method, path) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "X-SPOD-ACCESS-TOKEN": TOKEN, Accept: "application/json" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function simulate(orderId, event) {
  if (!orderId) throw new Error(`numeric Spreadconnect order id required for ${event}`);
  if (!/^\d+$/.test(orderId)) {
    throw new Error(
      `expected numeric Spreadconnect id, got "${orderId}". Spreadconnect has no list-orders endpoint — find the id with:\n` +
        `  docker compose logs shop | grep "webhook: confirmed"\n` +
        `or open the order in the Spreadconnect dashboard.`,
    );
  }
  console.log(`→ POST /orders/${orderId}/simulate/${event}`);
  await call("POST", `/orders/${orderId}/simulate/${event}`);
  console.log("  ok");
}

async function listSubs() {
  const subs = await call("GET", "/subscriptions");
  for (const s of subs) {
    console.log(`${s.id}  ${s.eventType.padEnd(20)}  ${s.url}`);
  }
}

const [, , cmd, arg] = process.argv;
switch (cmd) {
  case "processed":
    await simulate(arg, "order-processed");
    break;
  case "shipped":
    await simulate(arg, "shipment-sent");
    break;
  case "cancelled":
    await simulate(arg, "order-cancelled");
    break;
  case "lifecycle":
    await simulate(arg, "order-processed");
    await new Promise((r) => setTimeout(r, 1500));
    await simulate(arg, "shipment-sent");
    break;
  case "subs":
    await listSubs();
    break;
  default:
    console.log(
      "usage: npm run simulate -- <processed|shipped|cancelled|lifecycle|subs> [numericOrderId]",
    );
    process.exit(1);
}
