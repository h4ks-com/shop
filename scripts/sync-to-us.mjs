#!/usr/bin/env node
// Declarative one-way sync from the EU Spreadconnect account to a US account.
// EU is the source of truth: each run reconciles the US catalog so it mirrors EU.
//
// Run with:
//   npm run sync:sc                                 # apply changes
//   npm run sync:sc -- --dry-run                    # print plan, do nothing
//   npm run sync:sc -- --force                      # ignore unchanged-hash check
//   npm run sync:sc -- --prune-orphans              # delete US articles that no
//                                                     longer exist on EU
//
// Source is `data/sc-eu-catalog.json` (produced by `npm run discover:eu`).
// We do NOT re-fetch the EU catalog here — that script alone has the dashboard
// session needed to extract design references, so we make it a hard prereq.
//
// Direction (explicit — sync only writes to target, never to source):
//   SC_SYNC_SOURCE             — region we read from. Default: EU
//   SC_SYNC_TARGET             — region we write to.  Default: US
//
// Required env vars (sync-only — kept distinct from runtime SPREADCONNECT_TOKEN):
//   SC_SYNC_EU_TOKEN           — API token for the EU SC account
//   SC_SYNC_US_TOKEN           — API token for the NA SC account
//   (only the two matching SC_SYNC_SOURCE / SC_SYNC_TARGET are required.)
//
// Optional (price conversion factors, applied source→target):
//   SC_EUR_TO_USD              — FX rate, e.g. 1.08 (default 1.08)
//   SC_US_PRICE_MULTIPLIER     — extra target-side markup, e.g. 1.10 (default 1.0)
//   SC_US_PRICE_ROUND          — "cents" (default) | "ninety_nine" (rounds to .99)
//
// State is kept at data/sc-sync-state.json — gitignored, contains only IDs,
// no secrets. Re-running is safe and converges US → EU. Crash-safe: state is
// flushed after each successful design upload and article create.
//
// API constraints (per https://api.spreadconnect.app/docs/):
//   • No PATCH/PUT on /articles. Changing anything means DELETE + POST → new id.
//   • Designs uploaded by URL: POST /designs/upload (multipart, "url" field).
//   • configurations[].view is an enum (FRONT|BACK|LEFT|RIGHT|HOOD_LEFT|HOOD_RIGHT).
//     The catalog stores numeric printArea ids per article, so we resolve each
//     to a view name via target /productTypes/{id}/views (cached per run).
//   • Rate limit 60 req/min — we throttle to be safe.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");
const stateFile = path.join(dataDir, "sc-sync-state.json");
const catalogFile = path.join(dataDir, "sc-eu-catalog.json");
const productTypeMapFile = path.join(dataDir, "sc-product-type-map.json");

const BASE = "https://api.spreadconnect.app";

const ALLOWED_REGIONS = ["EU", "US"];
const SOURCE_REGION = (process.env.SC_SYNC_SOURCE || "EU").toUpperCase();
const TARGET_REGION = (process.env.SC_SYNC_TARGET || "US").toUpperCase();
if (!ALLOWED_REGIONS.includes(SOURCE_REGION) || !ALLOWED_REGIONS.includes(TARGET_REGION)) {
  console.error(
    `SC_SYNC_SOURCE / SC_SYNC_TARGET must each be one of: ${ALLOWED_REGIONS.join(", ")}`,
  );
  process.exit(1);
}
if (SOURCE_REGION === TARGET_REGION) {
  console.error(`SC_SYNC_SOURCE (${SOURCE_REGION}) must differ from SC_SYNC_TARGET`);
  process.exit(1);
}
// Currency conversion direction is wired EU→US only for now. The reverse
// would need a USD→EUR rate and re-thinking the markup semantics.
if (SOURCE_REGION !== "EU" || TARGET_REGION !== "US") {
  console.error(
    `unsupported direction ${SOURCE_REGION} → ${TARGET_REGION}; only EU → US is wired today.`,
  );
  process.exit(1);
}

const SOURCE_TOKEN = required(`SC_SYNC_${SOURCE_REGION}_TOKEN`);
const TARGET_TOKEN = required(`SC_SYNC_${TARGET_REGION}_TOKEN`);
const EUR_TO_USD = Number(process.env.SC_EUR_TO_USD || "1.08");
const US_MARKUP = Number(process.env.SC_US_PRICE_MULTIPLIER || "1.0");
const PRICE_ROUND = process.env.SC_US_PRICE_ROUND || "cents";
const RATE_DELAY_MS = 1100; // 60/min ceiling = 1s; keep a 100ms cushion

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");
const PRUNE_ORPHANS = args.includes("--prune-orphans");

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`required env var ${name} is not set`);
    process.exit(1);
  }
  return v;
}

function maskToken(t) {
  if (!t) return "(unset)";
  return `****${t.slice(-4)}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------- HTTP ----------------

async function call(token, method, path, { body, multipart, expectJson = true } = {}) {
  // Token-bucket-friendly: 1.1s between requests. Coarse but safe.
  await sleep(RATE_DELAY_MS);
  const headers = { "X-SPOD-ACCESS-TOKEN": token, Accept: "application/json" };
  const init = { method, headers };
  if (multipart) {
    init.body = multipart;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return expectJson && text ? JSON.parse(text) : text;
}

// All HTTP we issue here writes to the target — the source catalog comes from
// the local discover:eu dump, so SOURCE_TOKEN is currently unused at runtime.
// We keep it required up top as documentation: this script is conceptually
// EU-read → US-write, even if today we only call the US side.
const target = (m, p, opts) => call(TARGET_TOKEN, m, p, opts);

// ---------------- State ----------------

async function loadState() {
  try {
    const raw = await readFile(stateFile, "utf8");
    const parsed = JSON.parse(raw);
    // Forward-compat defaults for the new fields.
    parsed.designs ||= {};
    parsed.articles ||= {};
    parsed.productTypeViews ||= {};
    return parsed;
  } catch {
    return { lastSyncAt: null, designs: {}, articles: {}, productTypeViews: {} };
  }
}

async function saveState(state) {
  await mkdir(dataDir, { recursive: true });
  state.lastSyncAt = new Date().toISOString();
  await writeFile(stateFile, JSON.stringify(state, null, 2), "utf8");
}

// ---------------- Catalog (local input) ----------------

async function loadCatalog() {
  let raw;
  try {
    raw = await readFile(catalogFile, "utf8");
  } catch {
    console.error(
      `\nmissing ${catalogFile}\n  run \`npm run sc:login\` and then \`npm run discover:eu\` first.`,
    );
    process.exit(1);
  }
  const cat = JSON.parse(raw);
  if (!Array.isArray(cat.articles) || !Array.isArray(cat.designs)) {
    console.error(`${catalogFile} is malformed (missing articles/designs)`);
    process.exit(1);
  }
  return cat;
}

// EU and US Spreadconnect catalogs share no product type ids — physical printers,
// brands, and stock differ. So sync needs a hand-curated map of
//   EU productTypeId → { us_productTypeId, appearances, sizes }
// where appearances/sizes also remap (each US product type has its own ids).
// Generate a starter with `npm run dump:product-types`.
async function loadProductTypeMap() {
  try {
    const raw = await readFile(productTypeMapFile, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// ---------------- Pricing ----------------

function convertEurToUsd(eurAmount) {
  const raw = eurAmount * EUR_TO_USD * US_MARKUP;
  if (PRICE_ROUND === "ninety_nine") {
    const whole = Math.floor(raw);
    return raw >= whole + 0.5 ? whole + 0.99 : Math.max(0.99, whole - 1 + 0.99);
  }
  return Math.round(raw * 100) / 100;
}

// ---------------- Hashing ----------------

// Canonicalised hash of an EU catalog entry — used to detect changes between
// runs. Anything the US recreate cares about feeds in: title, description,
// variants (size/colour/price), and configurations (print area + design ref).
function articleHash(entry) {
  const canonical = {
    title: entry.title,
    description: entry.description,
    variants: (entry.variants || []).map((v) => ({
      productTypeId: v.productTypeId,
      appearanceId: v.appearanceId,
      sizeId: v.sizeId,
      d2cPrice: v.d2cPrice,
    })),
    configurations: (entry.sprdProduct?.configurations || []).map((c) => ({
      type: c.type,
      printAreaId: c.printArea?.id,
      designs: (c.designs || []).map((d) => d.lookupId),
    })),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 16);
}

// ---------------- Design sync ----------------

async function ensureTargetDesign(state, design) {
  const cached = state.designs[design.lookupId];
  if (cached) return cached;
  console.log(`  + upload design ${design.lookupId} → ${TARGET_REGION}`);
  if (DRY_RUN) return "<dry-run-design-id>";
  const form = new FormData();
  form.append("url", design.downloadUrl);
  const resp = await target("POST", "/designs/upload", { multipart: form });
  const targetId = resp.designId || resp.id;
  if (!targetId) {
    throw new Error(`design upload returned no id: ${JSON.stringify(resp).slice(0, 200)}`);
  }
  state.designs[design.lookupId] = targetId;
  await saveState(state);
  return targetId;
}

// ---------------- Product type views (printArea.id → view name) ----------------

async function getViewMap(state, productTypeId) {
  const key = String(productTypeId);
  if (state.productTypeViews[key]) return state.productTypeViews[key];
  if (DRY_RUN) {
    // Best-effort: still hit the API in dry-run since it's read-only and we
    // need it to print a realistic payload. Cache for the rest of the run.
  }
  const resp = await target("GET", `/productTypes/${productTypeId}/views`);
  const views = resp.views || [];
  const map = {};
  for (const v of views) {
    if (v.id && v.name) map[String(v.id)] = v.name;
  }
  state.productTypeViews[key] = map;
  return map;
}

// ---------------- Article build ----------------

// Translate a single dashboard configuration into the public-API shape.
// `printAreaMap` is an optional `{ eu_printAreaId: us_printAreaId }` from the
// product-type map — when present, we resolve via US view ids; otherwise we
// try the EU print-area id directly (works when they happen to coincide).
function buildConfiguration(config, viewMap, designIdMap, printAreaMap) {
  if (config.type !== "design") return { skip: `type=${config.type}` };
  const lookupId = config.designs?.[0]?.lookupId;
  if (!lookupId) return { skip: "no design lookupId" };
  const usDesignId = designIdMap[lookupId];
  if (!usDesignId) return { skip: `design ${lookupId} not uploaded` };
  const euPaId = String(config.printArea?.id);
  const usPaId = printAreaMap?.[euPaId] ?? euPaId;
  const viewName = viewMap[String(usPaId)];
  if (!viewName) {
    return { skip: `EU printArea ${euPaId} → US view unresolved (add to printAreas map)` };
  }
  return {
    config: {
      image: { designId: usDesignId },
      view: viewName,
    },
  };
}

async function buildTargetArticlePayload(state, entry, designIdMap, ptMap) {
  if (!entry.variants?.length) {
    throw new Error("no variants in source entry");
  }
  // Every SC article we've seen ships a single productTypeId; the variants
  // array just re-declares it per row. Pick it once.
  const srcProductTypeId = entry.variants[0].productTypeId;
  const ptEntry = ptMap[String(srcProductTypeId)];
  if (!ptEntry?.us_productTypeId) {
    return {
      skip: `EU productType ${srcProductTypeId} not mapped (run \`npm run dump:product-types\` and edit ${path.basename(productTypeMapFile)})`,
    };
  }
  const usProductTypeId = Number(ptEntry.us_productTypeId);
  const appearanceMap = ptEntry.appearances || {};
  const sizeMap = ptEntry.sizes || {};

  // Resolve EU printArea.id → US view name via the US product type.
  const viewMap = await getViewMap(state, usProductTypeId);

  const configurations = [];
  const cfgSkipped = [];
  for (const cfg of entry.sprdProduct?.configurations || []) {
    const r = buildConfiguration(cfg, viewMap, designIdMap, ptEntry.printAreas);
    if (r.skip) cfgSkipped.push(r.skip);
    else configurations.push(r.config);
  }

  const variants = [];
  const varSkipped = [];
  for (const v of entry.variants) {
    const usAppearance = appearanceMap[String(v.appearanceId)];
    const usSize = sizeMap[String(v.sizeId)];
    if (!usAppearance || !usSize) {
      varSkipped.push(
        `app=${v.appearanceId}(${v.appearanceName})/size=${v.sizeId}(${v.sizeName}) unmapped`,
      );
      continue;
    }
    variants.push({
      productTypeId: usProductTypeId,
      appearanceId: Number(usAppearance),
      sizeId: Number(usSize),
      d2cPrice: convertEurToUsd(v.d2cPrice ?? 0),
    });
  }

  return {
    payload: {
      title: entry.title,
      description: entry.description || "",
      variants,
      configurations,
    },
    skipped: [...cfgSkipped, ...varSkipped],
  };
}

// ---------------- Per-article sync ----------------

async function syncOneArticle(state, entry, ptMap) {
  const srcId = String(entry.articleId);
  const hash = articleHash(entry);
  const prior = state.articles[srcId];

  if (!FORCE && prior && prior.hash === hash && prior.target_id) {
    return { action: "skip", srcId, targetId: prior.target_id };
  }

  // 1. Upload every referenced design first, mapping lookupId → US designId.
  const designIdMap = {};
  for (const cfg of entry.sprdProduct?.configurations || []) {
    for (const d of cfg.designs || []) {
      if (!d.lookupId || designIdMap[d.lookupId]) continue;
      const catalogDesign = {
        lookupId: d.lookupId,
        downloadUrl: `https://image.spreadshirtmedia.net/image-server/v1/designs/${d.lookupId}`,
      };
      designIdMap[d.lookupId] = await ensureTargetDesign(state, catalogDesign);
    }
  }

  // 2. Build & validate target-side payload.
  const built = await buildTargetArticlePayload(state, entry, designIdMap, ptMap);
  if (built.skip) {
    return { action: "skip-unmapped", srcId, reason: built.skip };
  }
  const { payload, skipped } = built;
  if (payload.configurations.length === 0 || payload.variants.length === 0) {
    return {
      action: "skip-no-configs",
      srcId,
      reason: `no usable ${payload.configurations.length === 0 ? "configurations" : "variants"}${skipped.length ? ` (${skipped.join("; ")})` : ""}`,
    };
  }

  console.log(
    `  → ${prior?.target_id ? "replace" : "create"} ${TARGET_REGION} article for ${SOURCE_REGION}:${srcId} (${entry.title})`,
  );
  if (skipped.length)
    console.log(`    (${skipped.length} non-design configs skipped: ${skipped.join("; ")})`);

  if (DRY_RUN) {
    console.log(`    payload: ${JSON.stringify(payload).slice(0, 600)}`);
    return { action: prior?.target_id ? "would-replace" : "would-create", srcId };
  }

  const created = await target("POST", "/articles", { body: payload });
  // /articles returns the bare numeric id per spec.
  const newTargetId = typeof created === "number" ? created : created.id || created.articleId;
  if (!newTargetId) {
    throw new Error(`POST /articles returned no id: ${JSON.stringify(created).slice(0, 300)}`);
  }

  // 3. If a previous target article existed, delete it now that the new one is live.
  if (prior?.target_id && prior.target_id !== newTargetId) {
    try {
      await target("DELETE", `/articles/${prior.target_id}`, { expectJson: false });
      console.log(`  - deleted old ${TARGET_REGION}:${prior.target_id}`);
    } catch (err) {
      console.warn(
        `  ! failed to delete old ${TARGET_REGION}:${prior.target_id}: ${String(err).slice(0, 200)}`,
      );
    }
  }

  state.articles[srcId] = {
    target_id: newTargetId,
    hash,
    title: entry.title,
    syncedAt: new Date().toISOString(),
  };
  await saveState(state);
  return {
    action: prior?.target_id ? "replaced" : "created",
    srcId,
    targetId: newTargetId,
  };
}

// ---------------- Pruning ----------------

async function pruneOrphans(state, currentSrcIds) {
  for (const srcId of Object.keys(state.articles)) {
    if (currentSrcIds.has(srcId)) continue;
    const targetId = state.articles[srcId]?.target_id;
    if (!targetId) continue;
    console.log(
      `  - prune orphan: ${SOURCE_REGION}:${srcId} → DELETE ${TARGET_REGION}:${targetId}`,
    );
    if (DRY_RUN) continue;
    try {
      await target("DELETE", `/articles/${targetId}`, { expectJson: false });
      delete state.articles[srcId];
      await saveState(state);
    } catch (err) {
      console.warn(
        `  ! prune failed for ${TARGET_REGION}:${targetId}: ${String(err).slice(0, 200)}`,
      );
    }
  }
}

// ---------------- Main ----------------

async function main() {
  console.log(`Spreadconnect sync`);
  console.log(`  SOURCE: ${SOURCE_REGION}  (token ${maskToken(SOURCE_TOKEN)})  [read-only]`);
  console.log(`  TARGET: ${TARGET_REGION}  (token ${maskToken(TARGET_TOKEN)})  [will be modified]`);
  console.log(`  mode: ${DRY_RUN ? "DRY RUN" : "APPLY"}, force=${FORCE}, prune=${PRUNE_ORPHANS}`);
  console.log(`  FX: 1 EUR = ${EUR_TO_USD} USD, markup ×${US_MARKUP}, round=${PRICE_ROUND}`);

  const catalog = await loadCatalog();
  console.log(
    `\nLoaded catalog: ${catalog.articleCount ?? catalog.articles.length} articles, ${catalog.designCount ?? catalog.designs.length} designs (captured ${catalog.capturedAt})`,
  );

  const ptMap = await loadProductTypeMap();
  console.log(`  product-type map: ${Object.keys(ptMap).length} EU productTypes mapped`);

  const state = await loadState();
  console.log(
    `  state: ${Object.keys(state.articles).length} articles, ${Object.keys(state.designs).length} designs mapped`,
  );

  const results = {
    skip: 0,
    "skip-unmapped": 0,
    "skip-no-configs": 0,
    created: 0,
    replaced: 0,
    "would-create": 0,
    "would-replace": 0,
    error: 0,
  };
  const manualTodo = [];

  for (const entry of catalog.articles) {
    try {
      const r = await syncOneArticle(state, entry, ptMap);
      results[r.action] = (results[r.action] || 0) + 1;
      if (r.action === "skip") {
        console.log(`  = ${SOURCE_REGION}:${r.srcId} unchanged (${TARGET_REGION}:${r.targetId})`);
      } else if (r.action === "skip-unmapped" || r.action === "skip-no-configs") {
        console.log(`  ⊘ ${SOURCE_REGION}:${r.srcId} (${entry.title}): ${r.reason}`);
        manualTodo.push({ srcId: r.srcId, title: entry.title, reason: r.reason });
      }
    } catch (err) {
      console.error(
        `  x ${SOURCE_REGION}:${entry.articleId} (${entry.title}) failed: ${String(err).slice(0, 400)}`,
      );
      results.error++;
    }
  }

  if (PRUNE_ORPHANS) {
    console.log(`\nPruning orphans…`);
    const liveSrcIds = new Set(catalog.articles.map((a) => String(a.articleId)));
    await pruneOrphans(state, liveSrcIds);
  }

  await saveState(state);
  console.log(`\nDone: ${JSON.stringify(results)}`);
  console.log(`  state written to ${stateFile}`);

  if (manualTodo.length) {
    console.log(`\nNeeds attention: ${manualTodo.length} article(s) could not be synced.`);
    for (const t of manualTodo) {
      console.log(`    - ${SOURCE_REGION}:${t.srcId}  ${t.title}`);
      console.log(`        ${t.reason}`);
    }
    console.log(
      `\n  Most of these are either text-only configurations (only fixable by editing the article`,
    );
    console.log(
      `  on the US dashboard) or product types that need a mapping in ${path.basename(productTypeMapFile)}.`,
    );
    console.log(
      `  Generate a starter map with: npm run dump:product-types — then edit the file and re-run.`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
