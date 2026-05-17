import Stripe from "stripe";
import {
  SHIPPING_EXPRESS_AMOUNT_CENTS,
  SHIPPING_STANDARD_AMOUNT_CENTS,
  SHOP_CURRENCY,
  SHOP_PUBLIC_URL,
  STRIPE_SECRET_KEY,
} from "./config";

// Lazy construct — route handlers are imported at Next.js build time for page
// data collection; deferring the SDK init avoids spinning it up there.
let _stripe: Stripe | null = null;
export function stripe(): Stripe {
  if (!_stripe) {
    // Pin the API version so server upgrades don't change behaviour silently.
    _stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2026-04-22.dahlia",
    });
  }
  return _stripe;
}

const CURRENCY = SHOP_CURRENCY.toLowerCase();

export type Line = {
  sku: string;
  productName: string;
  unitAmountCents: number;
  quantity: number;
};

export type CheckoutInput = {
  lines: Line[];
  externalOrderReference: string;
  customerEmail?: string;
};

export async function createCheckoutSession(args: CheckoutInput): Promise<Stripe.Checkout.Session> {
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    // Restrict to instant-settlement methods. Async methods (SEPA, BACS,
    // Klarna's deferred flows) fire checkout.session.completed before money
    // settles and require handling checkout.session.async_payment_succeeded
    // separately. Until that flow is wired up, refuse to accept them.
    payment_method_types: ["card", "link"],
    line_items: args.lines.map((l) => ({
      quantity: l.quantity,
      price_data: {
        currency: CURRENCY,
        unit_amount: l.unitAmountCents,
        product_data: { name: l.productName },
      },
    })),
    success_url: `${SHOP_PUBLIC_URL}/ok?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SHOP_PUBLIC_URL}/cancel`,
    client_reference_id: args.externalOrderReference,
    shipping_address_collection: {
      allowed_countries: ["US", "CA", "GB", "DE", "FR", "ES", "IT", "NL", "BR", "AU"],
    },
    phone_number_collection: { enabled: true },
    shipping_options: [
      {
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: SHIPPING_STANDARD_AMOUNT_CENTS, currency: CURRENCY },
          display_name: "Standard",
          delivery_estimate: {
            minimum: { unit: "business_day", value: 5 },
            maximum: { unit: "business_day", value: 10 },
          },
        },
      },
      {
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: SHIPPING_EXPRESS_AMOUNT_CENTS, currency: CURRENCY },
          display_name: "Express",
          delivery_estimate: {
            minimum: { unit: "business_day", value: 2 },
            maximum: { unit: "business_day", value: 4 },
          },
        },
      },
    ],
    // Encode the full line set so the webhook can reconstruct spreadconnect
    // orderItems with the right SKUs, quantities, and unit prices. Stripe's
    // line_items expand returns description text only (no SKU), so we
    // round-trip our own truth via metadata.
    metadata: {
      items: JSON.stringify(
        args.lines.map((l) => ({ sku: l.sku, qty: l.quantity, unitCents: l.unitAmountCents })),
      ),
      external_order_reference: args.externalOrderReference,
    },
    customer_email: args.customerEmail,
  };

  return stripe().checkout.sessions.create(params, {
    idempotencyKey: args.externalOrderReference,
  });
}
