import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

const h = vi.hoisted(() => ({
  getOrder: vi.fn<(id: number) => Promise<unknown>>(),
  getShipments: vi.fn<(id: number) => Promise<unknown[]>>(),
  sendEmail: vi.fn<(opts: unknown) => Promise<void>>(),
}));

vi.mock("@/lib/spreadconnect", () => ({
  getOrder: h.getOrder,
  getShipments: h.getShipments,
}));

vi.mock("@/lib/mailer", () => ({
  sendEmail: h.sendEmail,
}));

const SECRET = process.env.SPREADCONNECT_WEBHOOK_SECRET!;
const sign = (raw: string): string => createHmac("sha256", SECRET).update(raw).digest("base64");

const makeReq = (raw: string, sig: string | null = sign(raw)): Request =>
  new Request("http://localhost/api/webhooks/spreadconnect", {
    method: "POST",
    headers: sig ? { "x-sprd-signature": sig } : {},
    body: raw,
  });

async function loadRoute() {
  vi.resetModules();
  return await import("@/app/api/webhooks/spreadconnect/route");
}

beforeEach(() => {
  h.getOrder.mockReset();
  h.getShipments.mockReset();
  h.sendEmail.mockReset();
  h.sendEmail.mockResolvedValue();
});

describe("POST /api/webhooks/spreadconnect", () => {
  it("rejects requests with no signature header", async () => {
    const { POST } = await loadRoute();
    const res = await POST(makeReq('{"eventType":"Order.cancelled","data":{"order":{}}}', null));
    expect(res.status).toBe(401);
  });

  it("rejects requests with a forged signature", async () => {
    const { POST } = await loadRoute();
    const raw = '{"eventType":"Order.cancelled","data":{"order":{}}}';
    const res = await POST(makeReq(raw, "not-a-real-signature-of-any-kind=="));
    expect(res.status).toBe(401);
  });

  it("rejects a valid signature on a tampered body", async () => {
    const { POST } = await loadRoute();
    const raw = '{"eventType":"Order.cancelled","data":{"order":{}}}';
    const sig = sign(raw);
    const res = await POST(
      makeReq('{"eventType":"Order.cancelled","data":{"order":{"id":999}}}', sig),
    );
    expect(res.status).toBe(401);
  });

  it("accepts a valid signature and 202s", async () => {
    const raw = '{"eventType":"Order.processed","data":{"order":{}}}';
    const { POST } = await loadRoute();
    const res = await POST(makeReq(raw));
    expect(res.status).toBe(202);
  });

  it("dedupes repeated deliveries of the same event", async () => {
    const raw = JSON.stringify({
      eventType: "Shipment.sent",
      data: { shipment: { orderId: 1 } },
    });
    h.getOrder.mockResolvedValue({ email: "x@example.test", externalOrderReference: "ref" });
    h.getShipments.mockResolvedValue([{ tracking: [{ url: "https://t.example/1", code: "A" }] }]);
    const { POST } = await loadRoute();

    await POST(makeReq(raw));
    await POST(makeReq(raw));
    // Yield to background handlers spawned via .catch().
    await new Promise((r) => setTimeout(r, 10));
    expect(h.getOrder).toHaveBeenCalledTimes(1);
  });

  it("emails the buyer on Shipment.sent", async () => {
    const raw = JSON.stringify({
      eventType: "Shipment.sent",
      data: { shipment: { orderId: 99 } },
    });
    h.getOrder.mockResolvedValue({ email: "buyer@example.test", externalOrderReference: "h4ks-1" });
    h.getShipments.mockResolvedValue([{ tracking: [{ url: "https://t.example/1", code: "X" }] }]);
    const { POST } = await loadRoute();
    await POST(makeReq(raw));
    await new Promise((r) => setTimeout(r, 10));
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    const call = h.sendEmail.mock.calls[0]?.[0] as { to?: string } | undefined;
    expect(call?.to).toBe("buyer@example.test");
  });
});
