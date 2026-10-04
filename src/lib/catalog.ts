import { createHash } from "node:crypto";
import { GELATO_STORE_ID, SHOP_CURRENCY } from "./config";
import {
  getStoreProduct,
  listStoreProducts,
  listStoreVariants,
  type GelatoStoreProduct,
  type GelatoStoreVariant,
} from "./gelato";

// The catalog is the products of our Gelato store. Gelato signs image links for
// 24 hours, so a 10 minute cache keeps them valid while sparing the API.
const CACHE_TTL_MS = 10 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 30 * 1000;

export type CatalogVariant = {
  // The Gelato store variant id.
  sku: string;
  sizeName: string;
  color: string;
  productUid: string;
  designId: string;
  priceCents: number;
};

export type CatalogImage = { url: string; color: string };

export type CatalogProduct = {
  // Numeric id for URLs and the SSH client, derived from the Gelato product id.
  id: number;
  title: string;
  description: string;
  images: CatalogImage[];
  variants: CatalogVariant[];
};

export function numericId(gelatoProductId: string): number {
  const hex = createHash("sha1").update(gelatoProductId).digest("hex");
  return 100_000_000 + (parseInt(hex.slice(0, 8), 16) % 900_000_000);
}

function option(variant: GelatoStoreVariant, ...names: string[]): string | undefined {
  return variant.variantOptions.find((o) => names.includes(o.name))?.value;
}

// Only active products with orderable variants in the shop currency make it into
// the shop, so a product half way through publishing never shows up.
export function toCatalogProduct(
  product: GelatoStoreProduct,
  storeVariants: GelatoStoreVariant[],
  currency: string,
): CatalogProduct | null {
  if (product.status !== "active") return null;
  const variants = storeVariants
    .filter((v) => !v.isHidden && v.designId && v.currency === currency && v.price > 0)
    .sort((a, b) => a.position - b.position)
    .map((v) => ({
      sku: v.id,
      sizeName: option(v, "Size", "Model") ?? "one size",
      color: option(v, "Color") ?? "",
      productUid: v.productUid,
      designId: v.designId as string,
      priceCents: Math.round(v.price * 100),
    }));
  if (variants.length === 0) return null;

  const colorOf = new Map(variants.map((v) => [v.sku, v.color]));
  const images = [...product.productImages]
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
    .map((img) => ({
      url: img.fileUrl,
      color: img.productVariantIds.map((id) => colorOf.get(id)).find((c) => c !== undefined) ?? "",
    }));

  return {
    id: numericId(product.id),
    title: product.title,
    description: product.description,
    images,
    variants,
  };
}

async function fetchCatalog(): Promise<CatalogProduct[]> {
  const products = await listStoreProducts(GELATO_STORE_ID);
  const results = await Promise.allSettled(
    products.map(async ({ id }) => {
      const [product, variants] = await Promise.all([
        getStoreProduct(GELATO_STORE_ID, id),
        listStoreVariants(GELATO_STORE_ID, id),
      ]);
      return toCatalogProduct(product, variants, SHOP_CURRENCY);
    }),
  );
  if (products.length > 0 && results.every((r) => r.status === "rejected")) {
    throw new Error("catalog: every Gelato product failed to load");
  }
  const catalog: CatalogProduct[] = [];
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(`catalog: skipping Gelato product ${products[i].id}:`, r.reason);
    } else if (r.value) {
      catalog.push(r.value);
    }
  });
  return catalog;
}

let cached: { at: number; products: CatalogProduct[] } | null = null;
let failure: { at: number; error: unknown } | null = null;
let refreshing: Promise<CatalogProduct[]> | null = null;

function refresh(): Promise<CatalogProduct[]> {
  refreshing ??= fetchCatalog()
    .then((products) => {
      cached = { at: Date.now(), products };
      failure = null;
      return products;
    })
    .catch((error: unknown) => {
      failure = { at: Date.now(), error };
      throw error;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

// We keep serving the last good catalog while Gelato fails, and wait
// RETRY_AFTER_FAILURE_MS between attempts so an outage costs one call per window.
export async function loadCatalog(): Promise<CatalogProduct[]> {
  const now = Date.now();
  if (cached && now - cached.at <= CACHE_TTL_MS) return cached.products;
  if (failure && now - failure.at < RETRY_AFTER_FAILURE_MS) {
    if (cached) return cached.products;
    throw failure.error;
  }
  try {
    return await refresh();
  } catch (err) {
    if (!cached) throw err;
    console.error("catalog: refresh failed, serving the last good catalog:", err);
    return cached.products;
  }
}

export async function listProducts(): Promise<CatalogProduct[]> {
  return loadCatalog();
}

export async function getProduct(id: number): Promise<CatalogProduct | undefined> {
  return (await loadCatalog()).find((p) => p.id === id);
}

export function findVariant(product: CatalogProduct, sku: string): CatalogVariant | undefined {
  return product.variants.find((v) => v.sku === sku);
}

export function lowestPriceCents(product: CatalogProduct): number {
  return Math.min(...product.variants.map((v) => v.priceCents));
}

// The variant shape the storefront (product page + articles API) renders.
export type StorefrontVariant = {
  sku: string;
  sizeName: string;
  appearanceName: string;
  appearanceColorValue: string;
  price: number;
  stock: number;
};

// Gelato is make-to-order, so every variant reports the same in-stock sentinel.
export function storefrontVariants(product: CatalogProduct): StorefrontVariant[] {
  return product.variants.map((v) => ({
    sku: v.sku,
    sizeName: v.sizeName,
    appearanceName: v.color,
    appearanceColorValue: "",
    price: v.priceCents / 100,
    stock: 1,
  }));
}

export function productImagePath(product: CatalogProduct): string | null {
  return product.images[0]?.url ?? null;
}
