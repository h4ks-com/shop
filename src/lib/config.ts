function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`required env var ${name} is not set`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

// --- required ---
export const STRIPE_SECRET_KEY = required("STRIPE_SECRET_KEY");
export const STRIPE_WEBHOOK_SECRET = required("STRIPE_WEBHOOK_SECRET");

// Gelato fulfilment — single global account that auto-routes to the nearest
// facility and ships worldwide.
export const GELATO_TOKEN = required("GELATO_TOKEN");
export const GELATO_PRODUCT_BASE_URL = optional(
  "GELATO_PRODUCT_BASE_URL",
  "https://product.gelatoapis.com",
);
export const GELATO_ORDER_BASE_URL = optional(
  "GELATO_ORDER_BASE_URL",
  "https://order.gelatoapis.com",
);
// Optional shared secret. Gelato webhooks aren't HMAC-signed, so we secure the
// endpoint by embedding this as a ?token= query param in the URL registered in
// the Gelato dashboard. When unset, the webhook accepts any caller (dev).
export const GELATO_WEBHOOK_SECRET = optional("GELATO_WEBHOOK_SECRET", "");

export const SHOP_PUBLIC_URL = required("SHOP_PUBLIC_URL");
export const SHOP_CONTACT_EMAIL = required("SHOP_CONTACT_EMAIL");

export const SMTP_HOST = required("SMTP_HOST");
export const SMTP_PORT = Number(optional("SMTP_PORT", "587"));
export const SMTP_USER = required("SMTP_USER");
export const SMTP_PASS = required("SMTP_PASS");
export const SMTP_FROM = required("SMTP_FROM");
export const SMTP_SECURE = optional("SMTP_SECURE", "false") === "true";

// --- optional knobs ---
export const SHOP_NAME = optional("SHOP_NAME", "h4ks shop");
export const SHOP_CURRENCY = optional("SHOP_CURRENCY", "USD");

// Per-item markup folded into every displayed/charged price to cover shipping.
// Stripe checkout shows "free shipping" — the cost is hidden in product price.
// Default 490 = €4.90, calibrated for EU standard shipping.
export const SHIPPING_MARKUP_CENTS = Number(optional("SHIPPING_MARKUP_CENTS", "490"));
