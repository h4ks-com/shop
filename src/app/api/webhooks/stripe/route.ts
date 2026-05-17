import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createOrder, confirmOrder } from "@/lib/spreadconnect";
import { sendEmail } from "@/lib/mailer";
import { orderConfirmedEmail } from "@/lib/emails";
import { makeDedup } from "@/lib/dedup";
import { SHOP_CURRENCY, SHOP_TAX_TYPE, STRIPE_WEBHOOK_SECRET } from "@/lib/config";

export const runtime = "nodejs";

// Stripe retries failed webhook deliveries for ~3 days. A 24h window catches
// the vast majority of retries while bounding memory in the in-process map.
const DAY_MS = 24 * 60 * 60 * 1000;
const seenStripeEvent = makeDedup(DAY_MS);
const seenStripeSession = makeDedup(DAY_MS);

// We create the spreadconnect order only after Stripe collects the address;
// shipping is flat-tier in Stripe so no upfront quote is needed.
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "no signature" }, { status: 400 });
  }
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return NextResponse.json(
      { error: "bad signature: " + (err instanceof Error ? err.message : "") },
      { status: 400 },
    );
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ ok: true, ignored: event.type });
  }

  // claim() is atomic: if false, a previous successful run already handled
  // this event. On failure below we forget() so Stripe's retry can re-enter.
  if (!seenStripeEvent.claim(event.id)) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  const sessionRef = event.data.object as Stripe.Checkout.Session;
  // Track whether spreadconnect.createOrder has actually run. If it has, we
  // must NOT let a Stripe retry trigger a second createOrder (spreadconnect
  // has no idempotency on externalOrderReference) — that would double-print.
  let orderCreated = false;
  try {
    // Belt-and-suspenders: also gate on session.id so two events for the same
    // session (a forged retry with a fresh event.id) can't double-fulfill.
    if (!seenStripeSession.claim(sessionRef.id)) {
      return NextResponse.json({ ok: true, deduped: true });
    }

    // Re-fetch with expansions — some events arrive with line_items unpopulated.
    const session = await stripe().checkout.sessions.retrieve(sessionRef.id, {
      expand: ["customer_details", "line_items"],
    });

    // Async methods (SEPA, BACS, some Klarna flows) fire checkout.session.completed
    // before money settles. Card / Link / Apple-Google-Pay always settle
    // synchronously; createCheckoutSession restricts to those, so this branch
    // is defense-in-depth in case the allowed list ever widens.
    if (session.payment_status !== "paid") {
      seenStripeSession.forget(sessionRef.id);
      return NextResponse.json({ ok: true, awaitingPayment: true });
    }

    const result = await fulfill(session, () => {
      orderCreated = true;
    });
    if (!result.ok) {
      seenStripeSession.forget(sessionRef.id);
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, orderId: result.orderId });
  } catch (err) {
    // Always allow Stripe to retry by clearing the event gate. The session
    // gate stays claimed iff we got past createOrder — that way a retry hits
    // the session gate and bails without re-issuing createOrder.
    seenStripeEvent.forget(event.id);
    if (!orderCreated) {
      seenStripeSession.forget(sessionRef.id);
    } else {
      console.error(
        `webhook: ORDER STUCK — spreadconnect createOrder succeeded but a later step failed for stripe session ${sessionRef.id}; confirm manually in the spreadconnect dashboard`,
      );
    }
    console.error("webhook: fulfillment failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}

type FulfillResult = { ok: true; orderId: number } | { ok: false; status: number; error: string };

type MetadataItem = { sku: string; qty: number; unitCents: number };

function parseItemsMetadata(raw: string | undefined | null): MetadataItem[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const out: MetadataItem[] = [];
    for (const it of parsed) {
      if (
        !it ||
        typeof it.sku !== "string" ||
        typeof it.qty !== "number" ||
        typeof it.unitCents !== "number"
      )
        return null;
      out.push({ sku: it.sku, qty: it.qty, unitCents: it.unitCents });
    }
    return out;
  } catch {
    return null;
  }
}

async function fulfill(
  session: Stripe.Checkout.Session,
  onOrderCreated: () => void,
): Promise<FulfillResult> {
  const externalOrderReference =
    session.client_reference_id ||
    session.metadata?.external_order_reference ||
    `stripe-${session.id}`;

  const items = parseItemsMetadata(session.metadata?.items);
  if (!items || items.length === 0) {
    console.error("webhook: session has no items metadata", session.id);
    return { ok: false, status: 400, error: "missing items" };
  }

  // From API 2025-09-30 onward shipping moved under collected_information.
  const ship = session.collected_information?.shipping_details;
  const cust = session.customer_details;
  if (!ship?.address || !cust?.email) {
    console.error("webhook: missing shipping_details/customer_details", session.id);
    return { ok: false, status: 400, error: "missing address" };
  }

  const [firstName, ...lastParts] = (ship.name || cust.name || "Customer").split(" ");
  const lastName = lastParts.join(" ") || "—";

  const order = await createOrder({
    orderItems: items.map((it) => ({
      sku: it.sku,
      quantity: it.qty,
      customerPrice: {
        amount: it.unitCents / 100,
        currency: SHOP_CURRENCY,
        taxRate: 0,
        taxType: SHOP_TAX_TYPE,
      },
    })),
    shipping: {
      address: {
        firstName,
        lastName,
        street: ship.address.line1 || "",
        streetAnnex: ship.address.line2 || undefined,
        city: ship.address.city || "",
        state: ship.address.state || undefined,
        zipCode: ship.address.postal_code || "",
        country: ship.address.country || "",
      },
    },
    phone: cust.phone || "",
    email: cust.email,
    externalOrderReference,
    state: "NEW",
    customerTaxType: SHOP_TAX_TYPE,
    origin: "h4kshop-web",
  });
  onOrderCreated();
  await confirmOrder(order.id);
  console.log(
    `webhook: confirmed spreadconnect order ${order.id} (${items.length} item(s)) for stripe session ${session.id}`,
  );

  // Build a summary string for the email body. For multi-item carts we list
  // each line; for a single item this matches the prior format.
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const lineDescriptions =
    session.line_items?.data?.map((li) => li.description).filter(Boolean) ?? [];
  const productSummary = lineDescriptions.length > 0 ? lineDescriptions.join(", ") : undefined;

  // Email is best-effort — a delivery failure must not roll back fulfillment.
  void sendEmail({
    to: cust.email,
    ...orderConfirmedEmail({
      externalRef: externalOrderReference,
      productName: productSummary,
      quantity: totalQty,
      totalAmount: session.amount_total ? session.amount_total / 100 : undefined,
      currency: (session.currency || SHOP_CURRENCY).toUpperCase(),
    }),
  }).catch((err) => console.error("order confirmation email failed:", err));

  return { ok: true, orderId: order.id };
}
