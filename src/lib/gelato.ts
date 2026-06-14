import { GELATO_ORDER_BASE_URL, GELATO_PRODUCT_BASE_URL, GELATO_TOKEN } from "./config";

// Gelato exposes three API hosts that share the same X-API-KEY auth:
//   product.gelatoapis.com  — catalog, product search, dimensions
//   order.gelatoapis.com    — order creation, quotes, status
//   ecommerce.gelatoapis.com— store/template products (unused: we own the catalog)
// We only need product (to resolve productUids at migration time) and order
// (to fulfil at checkout). Prices are destination-dependent, so there is no
// static per-product price — a draft order returns the price breakdown and is
// never charged, which is also Gelato's safe-test path.

async function call<T>(base: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(base + path, {
    method,
    headers: {
      "X-API-KEY": GELATO_TOKEN,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`gelato ${method} ${path}: ${res.status} ${text.slice(0, 400)}`);
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

// ---------------- Catalog (used at migration time to resolve productUids) ----------------

export type GelatoProduct = {
  productUid: string;
  attributes: Record<string, string>;
};

export async function searchProducts(
  catalogUid: string,
  attributeFilters: Record<string, string[]>,
  limit = 50,
): Promise<GelatoProduct[]> {
  const res = await call<{ products?: GelatoProduct[] }>(
    GELATO_PRODUCT_BASE_URL,
    "POST",
    `/v3/catalogs/${catalogUid}/products:search`,
    { attributeFilters, limit },
  );
  return res.products ?? [];
}

export async function getProduct(productUid: string): Promise<GelatoProduct> {
  return call(GELATO_PRODUCT_BASE_URL, "GET", `/v3/products/${productUid}`);
}

// ---------------- Orders ----------------

export type GelatoAddress = {
  firstName: string;
  lastName: string;
  addressLine1: string;
  addressLine2?: string;
  state?: string;
  city: string;
  postCode: string;
  country: string; // ISO-2
  email: string;
  phone?: string;
};

export type GelatoOrderItem = {
  itemReferenceId: string;
  productUid: string;
  // A single print file referenced by URL; Gelato downloads it at fulfilment.
  fileUrl: string;
  quantity: number;
};

export type CreateGelatoOrderRequest = {
  // "draft" stages an order and returns its price without charging or producing;
  // "order" commits it to fulfilment.
  orderType: "draft" | "order";
  orderReferenceId: string;
  customerReferenceId: string;
  currency: string;
  items: GelatoOrderItem[];
  shippingAddress: GelatoAddress;
  shipmentMethodUid?: "normal" | "express" | "standard";
};

export type GelatoTracking = { code?: string; url?: string };

export type GelatoOrder = {
  id: string;
  orderReferenceId: string;
  fulfillmentStatus: string;
  financialStatus: string;
  currency: string;
  shippingAddress?: { email?: string };
  // Price breakdown Gelato returns; shape kept loose since we only read totals.
  receipts?: Array<Record<string, unknown>>;
  items?: Array<{
    itemReferenceId?: string;
    fulfillmentStatus?: string;
    fulfillments?: Array<{ trackingCode?: string; trackingUrl?: string }>;
  }>;
};

// Pull the first tracking code/url out of an order's item fulfilments.
export function firstTracking(order: GelatoOrder): GelatoTracking {
  for (const item of order.items ?? []) {
    for (const f of item.fulfillments ?? []) {
      if (f.trackingCode || f.trackingUrl) {
        return { code: f.trackingCode, url: f.trackingUrl };
      }
    }
  }
  return {};
}

export async function createOrder(req: CreateGelatoOrderRequest): Promise<GelatoOrder> {
  const payload = {
    orderType: req.orderType,
    orderReferenceId: req.orderReferenceId,
    customerReferenceId: req.customerReferenceId,
    currency: req.currency,
    items: req.items.map((it) => ({
      itemReferenceId: it.itemReferenceId,
      productUid: it.productUid,
      files: [{ type: "default", url: it.fileUrl }],
      quantity: it.quantity,
    })),
    shippingAddress: req.shippingAddress,
    ...(req.shipmentMethodUid ? { shipmentMethodUid: req.shipmentMethodUid } : {}),
  };
  return call(GELATO_ORDER_BASE_URL, "POST", "/v4/orders", payload);
}

export async function getOrder(orderId: string): Promise<GelatoOrder> {
  return call(GELATO_ORDER_BASE_URL, "GET", `/v4/orders/${orderId}`);
}
