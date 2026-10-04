import { GELATO_ECOMMERCE_BASE_URL, GELATO_ORDER_BASE_URL, GELATO_TOKEN } from "./config";

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
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`gelato ${method} ${path}: ${res.status} ${text.slice(0, 400)}`);
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

// ---------------- Store products ----------------

export type GelatoStoreVariant = {
  id: string;
  productUid: string;
  designId: string | null;
  price: number;
  currency: string;
  isHidden: boolean;
  position: number;
  variantOptions: Array<{ name: string; value: string }>;
};

export type GelatoStoreImage = {
  fileUrl: string;
  isPrimary: boolean;
  productVariantIds: string[];
};

export type GelatoStoreProduct = {
  id: string;
  title: string;
  description: string;
  status: string;
  createdAt: string;
  tags: string[];
  productImages: GelatoStoreImage[];
};

export async function listStoreProducts(storeId: string): Promise<GelatoStoreProduct[]> {
  const res = await call<{ products: GelatoStoreProduct[] }>(
    GELATO_ECOMMERCE_BASE_URL,
    "GET",
    `/v1/stores/${storeId}/products?limit=100`,
  );
  return res.products;
}

// The product list leaves out images, variant prices and design ids, so we read
// each product and its variants separately.
export async function getStoreProduct(
  storeId: string,
  productId: string,
): Promise<GelatoStoreProduct> {
  return call(GELATO_ECOMMERCE_BASE_URL, "GET", `/v1/stores/${storeId}/products/${productId}`);
}

export async function listStoreVariants(
  storeId: string,
  productId: string,
): Promise<GelatoStoreVariant[]> {
  const res = await call<{ productVariants: GelatoStoreVariant[] }>(
    GELATO_ECOMMERCE_BASE_URL,
    "GET",
    `/v1/stores/${storeId}/products/${productId}/variants`,
  );
  return res.productVariants;
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

// designId points at the design Gelato keeps for a store product variant, so
// Gelato prints that design and we send no print files.
export type GelatoOrderItem = {
  itemReferenceId: string;
  productUid: string;
  designId: string;
  quantity: number;
};

export type CreateGelatoOrderRequest = {
  // "draft" stages an order without charging or producing it; "order" commits it
  // to fulfilment.
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
  receipts?: Array<Record<string, unknown>>;
  items?: Array<{
    itemReferenceId?: string;
    fulfillmentStatus?: string;
    fulfillments?: Array<{ trackingCode?: string; trackingUrl?: string }>;
  }>;
};

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
  return call(GELATO_ORDER_BASE_URL, "POST", "/v4/orders", req);
}

export async function findOrderByReference(orderReferenceId: string): Promise<GelatoOrder | null> {
  const res = await call<{ orders: GelatoOrder[] }>(
    GELATO_ORDER_BASE_URL,
    "POST",
    "/v4/orders:search",
    { orderReferenceIds: [orderReferenceId], limit: 5 },
  );
  return res.orders.find((o) => o.orderReferenceId === orderReferenceId) ?? null;
}

export async function getOrder(orderId: string): Promise<GelatoOrder> {
  return call(GELATO_ORDER_BASE_URL, "GET", `/v4/orders/${orderId}`);
}
