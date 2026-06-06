import type {
  Article,
  CreateOrderRequest,
  ListArticlesResponse,
  SpreadconnectOrder,
} from "./types";
import { SHIPPING_MARKUP_CENTS, SPREADCONNECT_BASE_URL, SPREADCONNECT_TOKEN } from "./config";

// Catalog reads are revalidated rather than fetched live on every request: the
// Spreadconnect /articles endpoint is slow (~1.5s) and the catalog rarely
// changes, so without this every page render blocks on the upstream call.
// Stock counts can be up to this stale, which is acceptable for a merch shop.
const CATALOG_REVALIDATE_SECONDS = 300;

async function call<T>(
  method: string,
  path: string,
  body?: unknown,
  revalidate?: number,
): Promise<T> {
  const res = await fetch(SPREADCONNECT_BASE_URL + path, {
    method,
    headers: {
      "X-SPOD-ACCESS-TOKEN": SPREADCONNECT_TOKEN,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    ...(revalidate != null ? { next: { revalidate } } : { cache: "no-store" }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`spreadconnect ${method} ${path}: ${res.status} ${text.slice(0, 300)}`);
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export async function listArticles(limit = 50, offset = 0): Promise<ListArticlesResponse> {
  const q = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return call("GET", `/articles?${q.toString()}`, undefined, CATALOG_REVALIDATE_SECONDS);
}

export async function getArticle(id: number): Promise<Article> {
  return call("GET", `/articles/${id}`, undefined, CATALOG_REVALIDATE_SECONDS);
}

// Spreadshirt's image server encodes the render size in the URL path. Product
// image URLs come back at 1000×1000; downscale for grid thumbnails to cut
// transfer size (~6× fewer bytes at 400px).
export function resizeSpreadshirtImage(url: string, px: number): string {
  return url.replace(/width=\d+,height=\d+/, `width=${px},height=${px}`);
}

export async function createOrder(req: CreateOrderRequest): Promise<SpreadconnectOrder> {
  return call("POST", "/orders", req);
}

export async function confirmOrder(orderId: number): Promise<void> {
  await call("POST", `/orders/${orderId}/confirm`);
}

export async function cancelOrder(orderId: number): Promise<void> {
  await call("POST", `/orders/${orderId}/cancel`);
}

export async function getOrder(orderId: number): Promise<SpreadconnectOrder> {
  return call("GET", `/orders/${orderId}`);
}

export async function getShipments(orderId: number): Promise<Shipment[]> {
  return call("GET", `/orders/${orderId}/shipments`);
}

export type Subscription = {
  id: string;
  eventType: string;
  url: string;
  secret?: string;
};

export async function listSubscriptions(): Promise<Subscription[]> {
  return call("GET", "/subscriptions");
}

export async function createSubscription(req: {
  eventType: string;
  url: string;
  secret?: string;
}): Promise<Subscription> {
  return call("POST", "/subscriptions", req);
}

export async function deleteSubscription(id: string): Promise<void> {
  await call("DELETE", `/subscriptions/${id}`);
}

export type Shipment = {
  id: number;
  orderId: number;
  orderReference: number;
  externalOrderReference: string;
  orderItemReferences?: number[];
  externalOrderItemReferences?: string[];
  shipping?: { type?: { name?: string; company?: string }; address?: unknown };
  tracking?: { code?: string; url?: string }[];
  closedDate?: string;
  sentDate?: string;
};

// Pick d2cPrice if set, else mark up b2bPrice 50%. Spreadconnect stores prices
// as plain numbers (not cents), so result is also a plain number.
// SHIPPING_MARKUP_CENTS is folded in so we can advertise free shipping without
// eating real cost — applied here so every display + checkout path picks it up.
export function customerPriceAmount(v: { d2cPrice: number; b2bPrice: number }): number {
  const base = v.d2cPrice > 0 ? v.d2cPrice : v.b2bPrice * 1.5;
  return base + SHIPPING_MARKUP_CENTS / 100;
}
