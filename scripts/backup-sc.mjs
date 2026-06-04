#!/usr/bin/env node
// Local snapshot of a Spreadconnect account — articles (full detail),
// designs (referenced inside articles), and webhook subscriptions.
// Saves to data/sc-backup/{region}-{timestamp}.json. Gitignored.
//
// Run with:
//   npm run backup:sc                 # backs up SC_SYNC_SOURCE  (default EU)
//   SC_SYNC_SOURCE=US npm run backup:sc   # back up the target side too
//
// Uses the same tokens as the sync (SC_SYNC_EU_TOKEN / SC_SYNC_US_TOKEN).

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backupDir = path.resolve(__dirname, "../data/sc-backup");

const BASE = "https://api.spreadconnect.app";
const REGION = (process.env.SC_SYNC_SOURCE || "EU").toUpperCase();
const TOKEN = process.env[`SC_SYNC_${REGION}_TOKEN`];
if (!TOKEN) {
  console.error(`required env var SC_SYNC_${REGION}_TOKEN is not set`);
  process.exit(1);
}

const RATE_DELAY_MS = 1100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, p) {
  await sleep(RATE_DELAY_MS);
  const res = await fetch(BASE + p, {
    method,
    headers: { "X-SPOD-ACCESS-TOKEN": TOKEN, Accept: "application/json" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

const maskToken = (t) => `****${t.slice(-4)}`;

async function main() {
  console.log(`Backing up ${REGION} account (token ${maskToken(TOKEN)})`);
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  await mkdir(backupDir, { recursive: true });

  // Paginate article list
  console.log("  Fetching article list…");
  const list = [];
  let offset = 0;
  const limit = 50;
  while (true) {
    const page = await call("GET", `/articles?limit=${limit}&offset=${offset}`);
    const items = page.items || page.articles || page;
    if (!items || items.length === 0) break;
    list.push(...items);
    if (items.length < limit) break;
    offset += limit;
  }
  console.log(`  ${list.length} articles`);

  // Fetch full detail for each
  const articles = [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    console.log(`  GET /articles/${a.id}  (${i + 1}/${list.length}: ${a.title || ""})`);
    articles.push(await call("GET", `/articles/${a.id}`));
  }

  // Webhook subscriptions — useful for restore / parity check
  let webhookSubscriptions = null;
  try {
    webhookSubscriptions = await call("GET", "/subscriptions");
  } catch (err) {
    console.warn(`  ! webhook subs: ${String(err).slice(0, 200)}`);
  }

  const backup = {
    region: REGION,
    backedUpAt: new Date().toISOString(),
    articleCount: articles.length,
    articles,
    webhookSubscriptions,
  };

  const file = path.join(backupDir, `${REGION.toLowerCase()}-${ts}.json`);
  await writeFile(file, JSON.stringify(backup, null, 2), "utf8");
  const kb = (JSON.stringify(backup).length / 1024).toFixed(1);
  console.log(`\nWrote ${file} (${kb} KB, ${articles.length} articles)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
