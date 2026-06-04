#!/usr/bin/env node
// Spreadconnect's EU and US catalogs use disjoint product-type ids — same garment,
// different printer, different id. Designs upload fine cross-account, but to
// recreate an article on US we need to know:
//   • which US productTypeId corresponds to each EU productTypeId we use
//   • which US appearanceId corresponds to each EU appearance (per product type)
//   • which US sizeId corresponds to each EU size (per product type)
//
// This script fetches both catalogs and writes:
//   data/sc-product-types-eu.json    — full EU /productTypes data
//   data/sc-product-types-us.json    — full US /productTypes data
//   data/sc-product-types-side-by-side.csv  — readable diff to eyeball matches
// It also seeds `data/sc-product-type-map.json` (the file the sync consumes)
// with empty stubs for every EU productTypeId referenced in sc-eu-catalog.json,
// so you just need to fill in the US ids.
//
// Run with:
//   npm run dump:product-types

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");
const catalogFile = path.join(dataDir, "sc-eu-catalog.json");
const euOut = path.join(dataDir, "sc-product-types-eu.json");
const usOut = path.join(dataDir, "sc-product-types-us.json");
const csvOut = path.join(dataDir, "sc-product-types-side-by-side.csv");
const mapFile = path.join(dataDir, "sc-product-type-map.json");

const BASE = "https://api.spreadconnect.app";
const EU_TOKEN = required("SC_SYNC_EU_TOKEN");
const US_TOKEN = required("SC_SYNC_US_TOKEN");
const RATE_DELAY_MS = 1100;

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`required env var ${name} is not set`);
    process.exit(1);
  }
  return v;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(token, url) {
  await sleep(RATE_DELAY_MS);
  const res = await fetch(BASE + url, {
    headers: { "X-SPOD-ACCESS-TOKEN": token, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.json();
}

// Fetch a region's full product-type list, then enrich each with the detail
// endpoint (the listing returns only ids — names live on the per-type GET).
async function pullCatalog(token, label, wanted) {
  console.log(`\n${label}: fetching product type list…`);
  const list = await get(token, "/productTypes");
  const ids = list.map((p) => p.id);
  console.log(`  ${ids.length} product types available`);
  const toFetch = wanted ? ids.filter((id) => wanted.has(String(id))) : ids;
  console.log(`  enriching ${toFetch.length} with detail…`);
  const out = [];
  let i = 0;
  for (const id of toFetch) {
    i++;
    process.stdout.write(`\r  [${i}/${toFetch.length}] ${id}        `);
    try {
      const detail = await get(token, `/productTypes/${id}`);
      out.push({
        id: String(detail.id),
        brand: detail.brand,
        customerName: detail.customerName,
        merchantName: detail.merchantName,
        appearances: (detail.appearances || []).map((a) => ({ id: String(a.id), name: a.name })),
        sizes: (detail.sizes || []).map((s) => ({ id: String(s.id), name: s.name })),
        views: (detail.views || []).map((v) => ({ id: String(v.id), name: v.name })),
      });
    } catch (err) {
      console.warn(`\n  ! ${id} failed: ${String(err).slice(0, 120)}`);
    }
  }
  process.stdout.write("\n");
  return out;
}

function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCsv(rows) {
  const header = ["eu_id", "eu_brand", "eu_name", "eu_sizes", "eu_appearances", "us_match_hint"];
  const lines = [header.join(",")];
  for (const r of rows) lines.push(r.map(csvEscape).join(","));
  return lines.join("\n");
}

async function main() {
  const catalogRaw = await readFile(catalogFile, "utf8");
  const catalog = JSON.parse(catalogRaw);
  const used = new Set(
    catalog.articles.flatMap((a) => (a.variants || []).map((v) => String(v.productTypeId))),
  );
  console.log(`Catalog references ${used.size} unique EU productTypeIds: ${[...used].join(", ")}`);

  await mkdir(dataDir, { recursive: true });
  const euTypes = await pullCatalog(EU_TOKEN, "EU", used);
  // For US we don't have a "wanted" set yet — pull everything once so the user
  // can pick equivalents. (Slow but one-time.)
  const usTypes = await pullCatalog(US_TOKEN, "US", null);

  await writeFile(euOut, JSON.stringify(euTypes, null, 2));
  await writeFile(usOut, JSON.stringify(usTypes, null, 2));
  console.log(`\nWrote ${euOut} (${euTypes.length} EU types)`);
  console.log(`Wrote ${usOut} (${usTypes.length} US types)`);

  // Side-by-side: for each EU type we use, suggest US candidates by name overlap.
  const rows = [];
  for (const eu of euTypes) {
    const euTokens = (eu.customerName || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    const candidates = usTypes
      .map((us) => {
        const usName = (us.customerName || "").toLowerCase();
        const score = euTokens.reduce((n, t) => (usName.includes(t) ? n + 1 : n), 0);
        return { id: us.id, name: us.customerName, brand: us.brand, score };
      })
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    rows.push([
      eu.id,
      eu.brand,
      eu.customerName,
      eu.sizes.map((s) => s.name).join("|"),
      eu.appearances.length,
      candidates.map((c) => `${c.id} [${c.brand}] ${c.name} (${c.score})`).join(" ; "),
    ]);
  }
  await writeFile(csvOut, writeCsv(rows));
  console.log(`Wrote ${csvOut}`);

  // Seed/refresh the mapping file: keep existing entries, add empty stubs for
  // newly-discovered EU productTypeIds the user hasn't filled in yet.
  let existing = {};
  try {
    existing = JSON.parse(await readFile(mapFile, "utf8"));
  } catch {
    /* fresh file */
  }
  for (const eu of euTypes) {
    if (!existing[eu.id]) {
      existing[eu.id] = {
        _eu_name: eu.customerName,
        us_productTypeId: null,
        appearances: Object.fromEntries(eu.appearances.map((a) => [a.id, null])),
        sizes: Object.fromEntries(eu.sizes.map((s) => [s.id, null])),
        printAreas: {},
      };
    }
  }
  await writeFile(mapFile, JSON.stringify(existing, null, 2));
  console.log(
    `Wrote ${mapFile} (fill in null values, then re-run \`npm run sync:sc -- --dry-run\`)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
