#!/usr/bin/env node
// Gelato migration helper — proves the fulfilment slice end to end and is the
// tool we use to map each h4ks product variant to a Gelato productUid + price.
//
// Given a catalog + attribute filters it:
//   1. searches the Gelato catalog for matching productUids
//   2. places a DRAFT order for the first match to a sample US + DE address
//      (draft orders are never charged and never produced) to read the price
//
// Run with:
//   npm run gelato:resolve
//
// Requires GELATO_TOKEN in .env. Read-only/no-charge: only draft orders.

const TOKEN = required("GELATO_TOKEN");
const PRODUCT_BASE = process.env.GELATO_PRODUCT_BASE_URL || "https://product.gelatoapis.com";
const ORDER_BASE = process.env.GELATO_ORDER_BASE_URL || "https://order.gelatoapis.com";

// A small public PNG to stand in as the print file for the price probe.
const SAMPLE_FILE_URL = "https://cdn.gelato.com/docs/sample-print-file.png";

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`required env var ${name} is not set`);
    process.exit(1);
  }
  return v;
}

async function call(base, method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: {
      "X-API-KEY": TOKEN,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : undefined;
}

const sampleAddress = (country) => ({
  firstName: "Test",
  lastName: "Buyer",
  addressLine1: country === "US" ? "123 Main St" : "Hauptstrasse 1",
  city: country === "US" ? "New York" : "Berlin",
  state: country === "US" ? "NY" : undefined,
  postCode: country === "US" ? "10001" : "10115",
  country,
  email: "test@example.com",
});

async function priceFor(productUid, country) {
  const order = await call(ORDER_BASE, "POST", "/v4/orders", {
    orderType: "draft",
    orderReferenceId: `resolve-${country}-${Date.now()}`,
    customerReferenceId: "gelato-resolve",
    currency: country === "US" ? "USD" : "EUR",
    items: [
      {
        itemReferenceId: "probe-1",
        productUid,
        files: [{ type: "default", url: SAMPLE_FILE_URL }],
        quantity: 1,
      },
    ],
    shippingAddress: sampleAddress(country),
  });
  return order;
}

async function main() {
  const catalogUid = process.argv[2] || "t-shirts";
  const filtersArg = process.argv[3] || '{"ApparelManufacturerSKU":["3001"],"GarmentSize":["L"]}';
  const attributeFilters = JSON.parse(filtersArg);

  console.log(`Searching ${catalogUid} with ${JSON.stringify(attributeFilters)}…`);
  const search = await call(PRODUCT_BASE, "POST", `/v3/catalogs/${catalogUid}/products:search`, {
    attributeFilters,
    limit: 5,
  });
  const products = search.products || [];
  console.log(`  ${products.length} matches`);
  for (const p of products.slice(0, 5)) console.log(`    ${p.productUid}`);
  if (products.length === 0) return;

  const productUid = products[0].productUid;
  console.log(`\nPricing first match via draft orders (no charge):\n  ${productUid}`);
  for (const country of ["US", "DE"]) {
    try {
      const order = await priceFor(productUid, country);
      const receipt = order.receipts?.[0] || {};
      console.log(
        `  ${country}: orderId=${order.id} status=${order.fulfillmentStatus} ` +
          `total=${receipt.productPriceInclVat ?? receipt.total ?? "?"} ${order.currency}`,
      );
      console.log(`       receipt keys: ${Object.keys(receipt).join(", ") || "(none)"}`);
    } catch (err) {
      console.error(`  ${country}: ${String(err).slice(0, 300)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
