import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { getOrder, firstTracking } from "@/lib/gelato";
import { sendEmail } from "@/lib/mailer";
import { orderCancelledEmail, shipmentSentEmail } from "@/lib/emails";
import { makeDedup } from "@/lib/dedup";
import { GELATO_WEBHOOK_SECRET } from "@/lib/config";

export const runtime = "nodejs";

// Gelato webhook events. The order-level event carries an orderReferenceId (our
// externalOrderReference) and a fulfillmentStatus; tracking + the customer email
// live on the full order, which we fetch by id. Status values of interest:
// "shipped" → tracking email, "canceled" → cancellation email.
type GelatoEvent = {
  event?: string;
  orderId?: string;
  orderReferenceId?: string;
  fulfillmentStatus?: string;
};

// Gelato doesn't sign webhooks, so the endpoint is protected by a shared secret
// embedded as ?token= in the registered URL (when GELATO_WEBHOOK_SECRET is set).
function authorized(req: Request): boolean {
  if (!GELATO_WEBHOOK_SECRET) return true;
  const token = new URL(req.url).searchParams.get("token") || "";
  const a = Buffer.from(token);
  const b = Buffer.from(GELATO_WEBHOOK_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Gelato retries on missed acks; dedup on a hash of the raw body.
const seenDelivery = makeDedup(10 * 60 * 1000);

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const raw = await req.text();
  if (!seenDelivery.claim(createHash("sha256").update(raw).digest("hex"))) {
    return new NextResponse("[accepted]", { status: 202 });
  }

  let event: GelatoEvent;
  try {
    event = JSON.parse(raw) as GelatoEvent;
  } catch {
    return new NextResponse("[accepted]", { status: 202 });
  }

  // Best-effort email side effects — Gelato doesn't need us to block on them.
  handleEvent(event).catch((err) => {
    console.error("gelato webhook handler failed:", err);
  });

  return new NextResponse("[accepted]", { status: 202 });
}

async function handleEvent(event: GelatoEvent): Promise<void> {
  if (event.event !== "order_status_updated" || !event.orderId) return;
  const status = (event.fulfillmentStatus || "").toLowerCase();
  if (status !== "shipped" && status !== "canceled" && status !== "cancelled") return;

  const order = await getOrder(event.orderId);
  const email = order.shippingAddress?.email;
  if (!email) return;
  const externalRef = order.orderReferenceId || event.orderReferenceId || `order ${event.orderId}`;

  if (status === "shipped") {
    const track = firstTracking(order);
    const { subject, html, text } = shipmentSentEmail({
      externalRef,
      trackingUrl: track.url,
      trackingCode: track.code,
    });
    await sendEmail({ to: email, subject, html, text });
    return;
  }

  const { subject, html, text } = orderCancelledEmail({ externalRef });
  await sendEmail({ to: email, subject, html, text });
}
