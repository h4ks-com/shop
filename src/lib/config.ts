function required(name: string): string {
  const v = process.env[name];
  if (v) return v;
  // Next imports every route while building the image, which has no env, so we defer the check to runtime.
  if (process.env.NEXT_PHASE === "phase-production-build") return "";
  throw new Error(`required env var ${name} is not set`);
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
// The Gelato store whose products the shop sells.
export const GELATO_STORE_ID = required("GELATO_STORE_ID");
export const GELATO_ORDER_BASE_URL = optional(
  "GELATO_ORDER_BASE_URL",
  "https://order.gelatoapis.com",
);
export const GELATO_ECOMMERCE_BASE_URL = optional(
  "GELATO_ECOMMERCE_BASE_URL",
  "https://ecommerce.gelatoapis.com",
);
// Gelato webhooks are unsigned, so we authenticate them with this secret, sent as
// ?token= in the webhook URL registered in the Gelato dashboard.
export const GELATO_WEBHOOK_SECRET = required("GELATO_WEBHOOK_SECRET");
// We place uncharged Gelato draft orders unless GELATO_LIVE_ORDERS=true, since real orders cost money.
export const GELATO_LIVE_ORDERS = optional("GELATO_LIVE_ORDERS", "false") === "true";

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
// Must match the currency of the Gelato store, since the shop charges its prices.
export const SHOP_CURRENCY = optional("SHOP_CURRENCY", "EUR");
