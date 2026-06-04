#!/usr/bin/env node
// Phase 1 of EU→US migration: dump the full EU catalog (designs + placements +
// variant prices) into a local JSON catalog file. Uses the saved Playwright
// session from scripts/scrape-sc-dashboard.mjs so the admin endpoints
// (which require x-auth-token) work without us re-implementing the login.
//
// Run with:
//   npm run discover:eu          # all EU articles → data/sc-eu-catalog.json
//
// Prereq: run `npm run scrape:dashboard` once first so the dashboard session
// is saved at data/sc-dashboard-session.json.

import { chromium } from "playwright";
import { Buffer } from "node:buffer";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessionPath = path.resolve(__dirname, "../data/sc-dashboard-session.json");
const outPath = path.resolve(__dirname, "../data/sc-eu-catalog.json");
const designsDir = path.resolve(__dirname, "../data/sc-designs");

const BASE = "https://api.spreadconnect.app";
const EU_TOKEN = required("SC_SYNC_EU_TOKEN");
const RATE_DELAY_MS = 700;

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`required env var ${name} is not set`);
    process.exit(1);
  }
  return v;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// SPOD public API — list articles.
async function fetchEuArticles() {
  const out = [];
  let offset = 0;
  const limit = 50;
  while (true) {
    const res = await fetch(`${BASE}/articles?limit=${limit}&offset=${offset}`, {
      headers: { "X-SPOD-ACCESS-TOKEN": EU_TOKEN, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`GET /articles → ${res.status}`);
    const page = await res.json();
    const items = page.items || page.articles || page;
    if (!items?.length) break;
    out.push(...items);
    if (items.length < limit) break;
    offset += limit;
  }
  return out;
}

async function main() {
  console.log("Discovering EU catalog…");
  console.log("  Listing articles via SPOD public API");
  const articles = await fetchEuArticles();
  console.log(`  ${articles.length} articles`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: sessionPath });
  const page = await ctx.newPage();
  // Land on the admin app so subsequent fetches inherit its origin + auth.
  await page.goto("https://admin.spreadconnect.app/", { waitUntil: "domcontentloaded" });
  // The dashboard hydrates auth state in localStorage at this URL — give it a
  // beat to settle before we issue any in-page fetches.
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await sleep(2_000);

  // Sanity-check: is the session still valid? Hit a known endpoint.
  const ping = await page.evaluate(async () => {
    const r = await fetch(
      "https://admin.spreadconnect.app/fulfillment/sam/api/merchant/dashboard",
      { headers: { Accept: "application/json" } },
    );
    return { status: r.status, ok: r.ok };
  });
  if (!ping.ok) {
    console.error(
      `dashboard session is not valid (got ${ping.status}). Re-run \`npm run scrape:dashboard\` to refresh, then try again.`,
    );
    await browser.close();
    process.exit(1);
  }
  console.log(`  dashboard session OK`);

  // Pull each article's sprd-product (design placements) + parameters (title,
  // price, etc.) via the page so x-auth-token is sent automatically.
  const catalog = [];
  for (let i = 0; i < articles.length; i++) {
    const a = articles[i];
    console.log(`  [${i + 1}/${articles.length}] ${a.id} ${a.title}`);
    try {
      const detail = await page.evaluate(async (articleId) => {
        const fetchJson = async (url) => {
          const r = await fetch(url, { headers: { Accept: "application/json" } });
          if (!r.ok) throw new Error(`${url} → ${r.status}`);
          return r.json();
        };
        const [sprdProduct, parameters] = await Promise.all([
          fetchJson(
            `https://admin.spreadconnect.app/fulfillment/sam/api/products/${articleId}/sprd-product`,
          ),
          fetchJson(
            `https://admin.spreadconnect.app/fulfillment/sam/api/products/${articleId}/parameters`,
          ),
        ]);
        return { sprdProduct, parameters };
      }, a.id);

      catalog.push({
        articleId: a.id,
        title: a.title,
        description: a.description,
        variants: a.variants,
        images: a.images,
        sprdProduct: detail.sprdProduct,
        parameters: detail.parameters,
      });
      await sleep(RATE_DELAY_MS);
    } catch (err) {
      console.error(`  ! ${a.id} failed: ${String(err).slice(0, 200)}`);
      catalog.push({ articleId: a.id, title: a.title, error: String(err).slice(0, 400) });
    }
  }

  // Distinct designs (lookupIds) for later re-upload to US.
  const designs = new Map();
  for (const entry of catalog) {
    for (const cfg of entry.sprdProduct?.configurations ?? []) {
      for (const d of cfg.designs ?? []) {
        if (!d.lookupId || designs.has(d.lookupId)) continue;
        designs.set(d.lookupId, {
          lookupId: d.lookupId,
          designId: d.id,
          downloadUrl: `https://image.spreadshirtmedia.net/image-server/v1/designs/${d.lookupId}`,
        });
      }
    }
  }
  console.log(`\n  ${designs.size} unique designs referenced`);

  // Download each design PNG locally so the backup survives even if SC's CDN
  // ever rotates the URLs. The image-server caps public widths at 1200 (the
  // ~4200x5100 originals are only available inside SC's own infrastructure),
  // but 1200px is what the sync will eventually re-upload anyway since SC's
  // server-side URL fetch goes through the same gateway. Idempotent.
  await mkdir(designsDir, { recursive: true });
  for (const d of designs.values()) {
    const file = path.join(designsDir, `${d.lookupId}.png`);
    try {
      const { stat } = await import("node:fs/promises");
      await stat(file);
      continue; // already on disk
    } catch {
      /* needs downloading */
    }
    const res = await fetch(`${d.downloadUrl},width=1200`);
    if (!res.ok) {
      console.warn(`  ! design ${d.lookupId}: ${res.status}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(file, buf);
    console.log(`  + saved ${file} (${(buf.length / 1024).toFixed(1)} KB)`);
  }

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(
    outPath,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        articleCount: catalog.length,
        designCount: designs.size,
        designs: [...designs.values()],
        articles: catalog,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`\nWrote ${outPath}`);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
