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

export const SPREADCONNECT_TOKEN = required("SPREADCONNECT_TOKEN");
export const SPREADCONNECT_WEBHOOK_SECRET = required("SPREADCONNECT_WEBHOOK_SECRET");
export const SPREADCONNECT_BASE_URL = optional(
  "SPREADCONNECT_BASE_URL",
  "https://api.spreadconnect.app",
);

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
export const SHOP_TAX_TYPE = optional("SHOP_TAX_TYPE", "NOT_TAXABLE") as
  | "NOT_TAXABLE"
  | "SALESTAX"
  | "VAT";

// Per-item markup folded into every displayed/charged price to cover shipping.
// Stripe checkout shows "free shipping" — the cost is hidden in product price.
// Default 490 = €4.90, calibrated for EU standard shipping.
export const SHIPPING_MARKUP_CENTS = Number(optional("SHIPPING_MARKUP_CENTS", "490"));
