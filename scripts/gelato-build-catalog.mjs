#!/usr/bin/env node
// Builds src/data/catalog.json from the PRODUCTS list below: each product
// declares a Gelato blank (catalog + attribute filters) + sizes + a design file,
// and the generator resolves the concrete Gelato productUid per size. Run with
// `npm run gelato:build-catalog`. Products with designFile=null are emitted but
// can't be ordered until they get artwork.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.resolve(__dirname, "../src/data/catalog.json");

const TOKEN = required("GELATO_TOKEN");
const PRODUCT_BASE = process.env.GELATO_PRODUCT_BASE_URL || "https://product.gelatoapis.com";
const CURRENCY = process.env.SHOP_CURRENCY || "USD";
const MARKUP_CENTS = Number(process.env.SHIPPING_MARKUP_CENTS || "490");

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`required env var ${name} is not set`);
    process.exit(1);
  }
  return v;
}

async function call(base, method, p, body) {
  const res = await fetch(base + p, {
    method,
    headers: {
      "X-API-KEY": TOKEN,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : undefined;
}

// id is the product's stable public id — it appears in /p/<id> URLs, so don't
// renumber it. designFile is a filename under public/designs.
const PRODUCTS = [
  // --- Apparel: tees (Bella+Canvas 3001 as the simplest unisex blank) ---
  {
    id: 3405730,
    title: "hanb — Boxy Heavyweight Tee",
    description: "Heavyweight unisex tee.",
    catalog: "t-shirts",
    filters: { ApparelManufacturerSKU: ["3001"], GarmentCut: ["unisex"], GarmentColor: ["white"] },
    sizeAttr: "GarmentSize",
    sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL"],
    designFile: "4bfa1ffb-d9ba-43cb-a20e-e012fb8fa2c8.png",
  },
  {
    id: 3405731,
    title: "hanb — Oversized Tee (Blaster)",
    description: "Oversized unisex organic tee.",
    catalog: "t-shirts",
    filters: { ApparelManufacturerSKU: ["3001"], GarmentCut: ["unisex"], GarmentColor: ["white"] },
    sizeAttr: "GarmentSize",
    sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL"],
    designFile: "4bfa1ffb-d9ba-43cb-a20e-e012fb8fa2c8.png",
  },
  {
    id: 3405735,
    title: "hanb — Premium Oversized Tee",
    description: "Premium oversized organic tee.",
    catalog: "t-shirts",
    filters: { ApparelManufacturerSKU: ["3001"], GarmentCut: ["unisex"], GarmentColor: ["black"] },
    sizeAttr: "GarmentSize",
    sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL"],
    designFile: "2a4fda0b-3b5b-4b16-9473-48082da34eea.png",
  },
  {
    id: 3401680,
    title: "Men's h4ks.com T-Shirt",
    description: "Classic unisex tee.",
    catalog: "t-shirts",
    filters: { ApparelManufacturerSKU: ["3001"], GarmentCut: ["unisex"], GarmentColor: ["black"] },
    sizeAttr: "GarmentSize",
    sizes: ["S", "M", "L", "XL", "2XL", "3XL", "4XL"],
    designFile: null, // TEXT original — needs artwork
  },
  {
    id: 3405316,
    title: "Women's T-Shirt",
    description: "Women's fitted tee.",
    catalog: "t-shirts",
    // Simplest-compatible: unisex blank stands in until a women's blank is chosen.
    filters: { ApparelManufacturerSKU: ["3001"], GarmentCut: ["unisex"], GarmentColor: ["black"] },
    sizeAttr: "GarmentSize",
    sizes: ["S", "M", "L", "XL", "2XL"],
    designFile: null, // TEXT original — needs artwork
  },
  {
    id: 3405726,
    title: "hanb — Kids' T-Shirt",
    description: "Kids' tee.",
    catalog: "t-shirts",
    // Simplest-compatible: unisex blank stands in until a kids blank is chosen.
    filters: { ApparelManufacturerSKU: ["3001"], GarmentCut: ["unisex"], GarmentColor: ["white"] },
    sizeAttr: "GarmentSize",
    sizes: ["XS", "S", "M"],
    designFile: "4bfa1ffb-d9ba-43cb-a20e-e012fb8fa2c8.png",
  },
  // --- Hoodie ---
  {
    id: 3405725,
    title: "hanb — Unisex Hoodie",
    description: "Unisex pullover hoodie.",
    catalog: "hoodies",
    filters: { GarmentColor: ["black"] },
    sizeAttr: "GarmentSize",
    sizes: ["S", "M", "L", "XL", "2XL"],
    designFile: "925003c5-b276-49e9-ba8a-930d512e9500.png",
  },
  // --- Mugs (11oz) ---
  {
    id: 3405435,
    title: "hanb mug",
    description: "11oz ceramic mug.",
    catalog: "mugs",
    filters: { MugSize: ["11-oz"] },
    sizeAttr: null,
    sizes: [null],
    designFile: "4bfa1ffb-d9ba-43cb-a20e-e012fb8fa2c8.png",
  },
  {
    id: 3405851,
    title: "hanb mug — inverted",
    description: "11oz ceramic mug.",
    catalog: "mugs",
    filters: { MugSize: ["11-oz"] },
    sizeAttr: null,
    sizes: [null],
    designFile: "925003c5-b276-49e9-ba8a-930d512e9500.png",
  },
  {
    id: 3405481,
    title: "h4ks.com — Mug",
    description: "Ceramic mug.",
    catalog: "mugs",
    filters: { MugSize: ["11-oz"] },
    sizeAttr: null,
    sizes: [null],
    designFile: null, // TEXT original — needs artwork
  },
  // --- Bags ---
  {
    id: 3405635,
    title: "Beans Pouch",
    description: "Cotton tote.",
    catalog: "tote-bags",
    filters: {},
    sizeAttr: null,
    sizes: [null],
    designFile: "e7dea5c6-7f9d-4c6d-96bc-feb6f381aa3a.png",
  },
  {
    id: 3405637,
    title: "Beans Bag",
    description: "Cotton gift bag.",
    catalog: "tote-bags",
    filters: {},
    sizeAttr: null,
    sizes: [null],
    designFile: "e7dea5c6-7f9d-4c6d-96bc-feb6f381aa3a.png",
  },
  // --- Cap ---
  {
    id: 3405311,
    title: "Beano Trucker Cap",
    description: "Trucker cap.",
    catalog: "trucker-hat",
    filters: { ApparelManufacturerSKU: ["112"] },
    sizeAttr: null,
    sizes: [null],
    designFile: null, // TEXT original — needs artwork
  },
];

// Pick the productUid with the simplest print placement (fewest GarmentPrint
// segments) — a plain front print, not multi-area with labels.
function pickSimplest(products) {
  const score = (p) => (p.attributes?.GarmentPrint || "").split("_").length;
  return [...products].sort((a, b) => score(a) - score(b))[0];
}

async function resolveVariants(prod) {
  const variants = [];
  for (const size of prod.sizes) {
    const filters = { ...prod.filters };
    if (prod.sizeAttr && size) filters[prod.sizeAttr] = [size];
    let res;
    try {
      res = await call(PRODUCT_BASE, "POST", `/v3/catalogs/${prod.catalog}/products:search`, {
        attributeFilters: filters,
        limit: 30,
      });
    } catch (err) {
      console.warn(`  ! ${prod.id} size=${size}: search failed ${String(err).slice(0, 120)}`);
      continue;
    }
    const products = res.products || [];
    if (products.length === 0) {
      console.warn(`  ! ${prod.id} size=${size}: no Gelato product for ${JSON.stringify(filters)}`);
      continue;
    }
    const chosen = pickSimplest(products);
    variants.push({
      sku: `g-${prod.id}-${size || "os"}`,
      sizeName: size || "One Size",
      productUid: chosen.productUid,
    });
  }
  return variants;
}

// Placeholder retail prices per category (cents, before the shipping markup).
// Gelato's real price is destination-dependent and not exposed as a static
// figure (the /prices endpoint 404s for print variants and draft-order pricing
// is async), so these are sensible defaults to refine manually / via a future
// quote step rather than wrong $0 values.
const CATEGORY_PRICE_CENTS = {
  "t-shirts": 2200,
  hoodies: 4200,
  sweatshirts: 3500,
  mugs: 1500,
  "tote-bags": 1800,
  "trucker-hat": 2400,
};

async function main() {
  const out = [];
  for (const prod of PRODUCTS) {
    console.log(`Resolving ${prod.id} ${prod.title} (${prod.catalog})…`);
    const variants = await resolveVariants(prod);
    const finalCents = (CATEGORY_PRICE_CENTS[prod.catalog] ?? 2500) + MARKUP_CENTS;
    for (const v of variants) v.priceCents = finalCents;
    console.log(
      `  ${variants.length} variant(s), price ${(finalCents / 100).toFixed(2)} ${CURRENCY} (placeholder)`,
    );
    out.push({
      id: prod.id,
      title: prod.title,
      description: prod.description,
      // Representative colour name; empty for non-apparel blanks. The storefront
      // hides the colour picker when a product has only one.
      color: prod.filters.GarmentColor?.[0] || "",
      designFile: prod.designFile,
      needsArtwork: prod.designFile == null,
      variants,
    });
  }

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(
    outPath,
    JSON.stringify({ currency: CURRENCY, generatedAt: null, products: out }, null, 2),
    "utf8",
  );
  const ok = out.filter((p) => p.variants.length).length;
  console.log(`\nWrote ${outPath}: ${ok}/${out.length} products with variants`);
  const flagged = out.filter((p) => p.needsArtwork).map((p) => p.id);
  if (flagged.length) console.log(`Need artwork (designFile=null): ${flagged.join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
