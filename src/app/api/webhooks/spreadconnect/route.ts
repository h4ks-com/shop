import { NextResponse } from "next/server";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getOrder, getShipments } from "@/lib/spreadconnect";
import { sendEmail } from "@/lib/mailer";
import { orderCancelledEmail, orderNeedsActionEmail, shipmentSentEmail } from "@/lib/emails";
import { makeDedup } from "@/lib/dedup";
import { SPREADCONNECT_WEBHOOK_SECRET } from "@/lib/config";

export const runtime = "nodejs";

type OrderRef = { id?: number; email?: string; externalOrderReference?: string };

type SCEvent =
  | { eventType: "Shipment.sent"; data: { shipment: { orderId: number } } }
  | { eventType: "Order.cancelled"; data: { order: OrderRef } }
  | { eventType: "Order.processed"; data: { order: unknown } }
  | { eventType: "Order.needs-action"; data: { errorReason?: string; order: OrderRef } }
  | { eventType: string; data: unknown };

function verifySignature(raw: string, header: string | null): boolean {
  if (!header) return false;
  const expected = createHmac("sha256", SPREADCONNECT_WEBHOOK_SECRET).update(raw).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Spreadconnect retries with backoff on missed acks. SHA-256 over the raw
// signed body is collision-free for any practical adversary (and the body is
// already signature-verified before we get here).
const seenDelivery = makeDedup(10 * 60 * 1000);
function alreadyDelivered(raw: string): boolean {
  const key = createHash("sha256").update(raw).digest("hex");
  return !seenDelivery.claim(key);
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-sprd-signature"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  if (alreadyDelivered(raw)) {
    return new NextResponse("[accepted]", { status: 202 });
  }

  let event: SCEvent;
  try {
    event = JSON.parse(raw) as SCEvent;
  } catch {
    return new NextResponse("[accepted]", { status: 202 });
  }

  // Best-effort email side effects. Spreadconnect doesn't retry on 5xx, so
  // there's nothing useful to gain by holding the response.
  handleEvent(event).catch((err) => {
    console.error("spreadconnect webhook handler failed:", err);
  });

  return new NextResponse("[accepted]", { status: 202 });
}

async function handleEvent(event: SCEvent): Promise<void> {
  switch (event.eventType) {
    case "Shipment.sent":
      return onShipmentSent((event.data as { shipment: { orderId: number } }).shipment);
    case "Order.cancelled":
      return onOrderCancelled((event.data as { order: OrderRef }).order);
    case "Order.needs-action": {
      const d = event.data as { errorReason?: string; order: OrderRef };
      return onOrderNeedsAction(d.order, d.errorReason);
    }
    default:
      return;
  }
}

async function onShipmentSent(shipment: { orderId: number }): Promise<void> {
  if (!shipment.orderId) return;
  const order = await getOrder(shipment.orderId);
  if (!order.email) return;

  const shipments = await getShipments(shipment.orderId);
  const track = shipments[0]?.tracking?.[0];

  const { subject, html, text } = shipmentSentEmail({
    externalRef: order.externalOrderReference || `order ${shipment.orderId}`,
    trackingUrl: track?.url,
    trackingCode: track?.code,
  });
  await sendEmail({ to: order.email, subject, html, text });
}

async function onOrderCancelled(partial: OrderRef): Promise<void> {
  const o = await resolveOrder(partial);
  if (!o?.email) return;
  const { subject, html, text } = orderCancelledEmail({
    externalRef: o.externalOrderReference || `order ${o.id}`,
  });
  await sendEmail({ to: o.email, subject, html, text });
}

async function onOrderNeedsAction(partial: OrderRef, reason: string | undefined): Promise<void> {
  const o = await resolveOrder(partial);
  if (!o?.email) return;
  const { subject, html, text } = orderNeedsActionEmail({
    externalRef: o.externalOrderReference || `order ${o.id}`,
    reason,
  });
  await sendEmail({ to: o.email, subject, html, text });
}

// Webhook payloads sometimes contain a slim order; fetch the full record if
// the email is missing.
async function resolveOrder(partial: OrderRef): Promise<OrderRef | null> {
  if (partial.email) return partial;
  if (!partial.id) return null;
  return getOrder(partial.id);
}
