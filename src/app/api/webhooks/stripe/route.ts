import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createOrder, findOrderByReference, type CreateGelatoOrderRequest } from "@/lib/gelato";
import { sendEmail } from "@/lib/mailer";
import { fulfillmentFailedAlertEmail, orderConfirmedEmail } from "@/lib/emails";
import { makeDedup } from "@/lib/dedup";
import {
  GELATO_LIVE_ORDERS,
  SHOP_CONTACT_EMAIL,
  SHOP_CURRENCY,
  STRIPE_WEBHOOK_SECRET,
} from "@/lib/config";

export const runtime = "nodejs";

// Stripe retries failed webhook deliveries for ~3 days. A 24h window catches
// the vast majority of retries while bounding memory in the in-process map.
const DAY_MS = 24 * 60 * 60 * 1000;
const seenStripeEvent = makeDedup(DAY_MS);
const seenStripeSession = makeDedup(DAY_MS);
const alertedSession = makeDedup(DAY_MS);

// We place the Gelato order only after Stripe collects the address; shipping is
// folded into the product price (free shipping at checkout) so no upfront quote
// is needed.
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
  let paidSession: Stripe.Checkout.Session | undefined;
  let orderId: string | undefined;
  try {
    // Belt-and-suspenders: also gate on session.id so two events for the same
    // session (a forged retry with a fresh event.id) can't double-fulfill.
    if (!seenStripeSession.claim(sessionRef.id)) {
      return NextResponse.json({ ok: true, deduped: true });
    }

    // We re-fetch with expansions because some events arrive with line_items unpopulated.
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
    paidSession = session;

    // We look the reference up at Gelato so a restart, which empties the dedup
    // gates, never places a second order for the same checkout.
    const orderReferenceId = externalReference(session);
    const existing = await findOrderByReference(orderReferenceId);
    if (existing) {
      console.log(
        `webhook: Gelato order ${existing.id} already exists for ${orderReferenceId}, skipping`,
      );
      return NextResponse.json({ ok: true, orderId: existing.id });
    }

    const order = orderRequest(session, orderReferenceId);
    orderId = (await createOrder(order)).id;
    console.log(
      `webhook: placed Gelato ${GELATO_LIVE_ORDERS ? "order" : "DRAFT order"} ${orderId} ` +
        `(${order.items.length} item(s)) for stripe session ${session.id}`,
    );
    sendConfirmation(session, order);
    return NextResponse.json({ ok: true, orderId });
  } catch (err) {
    if (orderId) {
      console.error(
        `webhook: Gelato order ${orderId} was placed but a later step failed for stripe session ${sessionRef.id}:`,
        err,
      );
      return NextResponse.json({ ok: true, orderId });
    }
    seenStripeEvent.forget(event.id);
    seenStripeSession.forget(sessionRef.id);
    console.error("webhook: fulfillment failed:", err);
    const error = err instanceof Error ? err.message : String(err);
    if (paidSession && alertedSession.claim(sessionRef.id)) {
      alertOwner(paidSession, error);
    }
    return NextResponse.json({ error }, { status: 500 });
  }
}

function externalReference(session: Stripe.Checkout.Session): string {
  return (
    session.client_reference_id ||
    session.metadata?.external_order_reference ||
    `stripe-${session.id}`
  );
}

type MetadataItem = {
  sku: string;
  qty: number;
  unitCents: number;
  productUid: string;
  designId: string;
};

function isFilled(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function parseItem(raw: string): MetadataItem {
  const it: unknown = JSON.parse(raw);
  if (typeof it === "object" && it !== null) {
    const { sku, qty, unitCents, productUid, designId } = it as Record<string, unknown>;
    if (
      isFilled(sku) &&
      isFilled(productUid) &&
      isFilled(designId) &&
      typeof qty === "number" &&
      Number.isInteger(qty) &&
      qty > 0 &&
      typeof unitCents === "number" &&
      Number.isInteger(unitCents) &&
      unitCents >= 0
    ) {
      return { sku, qty, unitCents, productUid, designId };
    }
  }
  throw new Error(`invalid item metadata: ${raw}`);
}

function parseItemsMetadata(metadata: Stripe.Metadata | null): MetadataItem[] {
  const meta = metadata ?? {};
  const items: MetadataItem[] = [];
  for (let i = 0; `item_${i}` in meta; i++) {
    items.push(parseItem(meta[`item_${i}`]));
  }
  if (items.length === 0) throw new Error("session has no item metadata");
  return items;
}

function orderRequest(
  session: Stripe.Checkout.Session,
  orderReferenceId: string,
): CreateGelatoOrderRequest {
  const items = parseItemsMetadata(session.metadata);

  // From API 2025-09-30 onward shipping moved under collected_information.
  const ship = session.collected_information?.shipping_details;
  const cust = session.customer_details;
  if (!ship?.address || !cust?.email) {
    throw new Error("session has no shipping address or customer email");
  }

  const [firstName, ...lastParts] = (ship.name || cust.name || "Customer").split(" ");
  return {
    orderType: GELATO_LIVE_ORDERS ? "order" : "draft",
    orderReferenceId,
    customerReferenceId: cust.email,
    currency: SHOP_CURRENCY,
    items: items.map((it) => ({
      itemReferenceId: it.sku,
      productUid: it.productUid,
      designId: it.designId,
      quantity: it.qty,
    })),
    shippingAddress: {
      firstName,
      lastName: lastParts.join(" ") || "-",
      addressLine1: ship.address.line1 || "",
      addressLine2: ship.address.line2 || undefined,
      state: ship.address.state || undefined,
      city: ship.address.city || "",
      postCode: ship.address.postal_code || "",
      country: ship.address.country || "",
      email: cust.email,
      phone: cust.phone || undefined,
    },
  };
}

function sendConfirmation(session: Stripe.Checkout.Session, order: CreateGelatoOrderRequest) {
  const lineDescriptions =
    session.line_items?.data?.map((li) => li.description).filter(Boolean) ?? [];
  // We send the email best-effort, since the order is already placed.
  void sendEmail({
    to: order.shippingAddress.email,
    ...orderConfirmedEmail({
      externalRef: order.orderReferenceId,
      productName: lineDescriptions.length > 0 ? lineDescriptions.join(", ") : undefined,
      quantity: order.items.reduce((s, i) => s + i.quantity, 0),
      totalAmount: session.amount_total ? session.amount_total / 100 : undefined,
      currency: (session.currency || SHOP_CURRENCY).toUpperCase(),
    }),
  }).catch((err) => console.error("order confirmation email failed:", err));
}

function alertOwner(session: Stripe.Checkout.Session, error: string) {
  void sendEmail({
    to: SHOP_CONTACT_EMAIL,
    ...fulfillmentFailedAlertEmail({
      sessionId: session.id,
      externalRef: externalReference(session),
      customerEmail: session.customer_details?.email ?? undefined,
      error,
    }),
  }).catch((err) => console.error("fulfillment alert email failed:", err));
}
