import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({
  getOrder: vi.fn<(id: string) => Promise<unknown>>(),
  firstTracking: vi.fn<() => { code?: string; url?: string }>(),
  sendEmail: vi.fn<(opts: unknown) => Promise<void>>(),
}));

vi.mock("@/lib/gelato", () => ({
  getOrder: h.getOrder,
  firstTracking: h.firstTracking,
}));

vi.mock("@/lib/mailer", () => ({
  sendEmail: h.sendEmail,
}));

const post = (body: unknown, url = "http://localhost/api/webhooks/gelato") =>
  new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

async function loadRoute() {
  vi.resetModules();
  return await import("@/app/api/webhooks/gelato/route");
}

// The handler runs detached from the response; let its microtasks settle.
const flush = () => new Promise((r) => setTimeout(r, 0));

const order = (over: Record<string, unknown> = {}) => ({
  id: "go_1",
  orderReferenceId: "h4ks-ref-1",
  shippingAddress: { email: "buyer@example.test" },
  items: [],
  ...over,
});

beforeEach(() => {
  h.getOrder.mockReset();
  h.firstTracking.mockReset();
  h.firstTracking.mockReturnValue({ code: "TRACK123", url: "https://track.test/TRACK123" });
  h.sendEmail.mockReset();
  h.sendEmail.mockResolvedValue();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/webhooks/gelato", () => {
  it("sends a shipment email on order_status_updated=shipped", async () => {
    h.getOrder.mockResolvedValue(order());
    const { POST } = await loadRoute();
    const res = await POST(
      post({ event: "order_status_updated", orderId: "go_1", fulfillmentStatus: "shipped" }),
    );
    expect(res.status).toBe(202);
    await flush();
    expect(h.getOrder).toHaveBeenCalledWith("go_1");
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    const arg = h.sendEmail.mock.calls[0]?.[0] as { to: string };
    expect(arg.to).toBe("buyer@example.test");
  });

  it("sends a cancellation email on order_status_updated=canceled", async () => {
    h.getOrder.mockResolvedValue(order());
    const { POST } = await loadRoute();
    const res = await POST(
      post({ event: "order_status_updated", orderId: "go_1", fulfillmentStatus: "canceled" }),
    );
    expect(res.status).toBe(202);
    await flush();
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("ignores non-order_status_updated events", async () => {
    const { POST } = await loadRoute();
    const res = await POST(post({ event: "store_product_created" }));
    expect(res.status).toBe(202);
    await flush();
    expect(h.getOrder).not.toHaveBeenCalled();
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it("ignores fulfillment statuses other than shipped/canceled", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      post({ event: "order_status_updated", orderId: "go_1", fulfillmentStatus: "printed" }),
    );
    expect(res.status).toBe(202);
    await flush();
    expect(h.getOrder).not.toHaveBeenCalled();
  });

  it("does not email when the order has no customer email", async () => {
    h.getOrder.mockResolvedValue(order({ shippingAddress: {} }));
    const { POST } = await loadRoute();
    await POST(
      post({ event: "order_status_updated", orderId: "go_1", fulfillmentStatus: "shipped" }),
    );
    await flush();
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it("dedupes a redelivered webhook (same body)", async () => {
    h.getOrder.mockResolvedValue(order());
    const { POST } = await loadRoute();
    const body = { event: "order_status_updated", orderId: "go_1", fulfillmentStatus: "shipped" };
    const r1 = await POST(post(body));
    const r2 = await POST(post(body));
    expect(r1.status).toBe(202);
    expect(r2.status).toBe(202);
    await flush();
    expect(h.getOrder).toHaveBeenCalledTimes(1);
  });

  it("401s when a shared secret is configured and the token is wrong", async () => {
    vi.stubEnv("GELATO_WEBHOOK_SECRET", "s3cret");
    const { POST } = await loadRoute();
    const res = await POST(
      post(
        { event: "order_status_updated", orderId: "go_1", fulfillmentStatus: "shipped" },
        "http://localhost/api/webhooks/gelato?token=wrong",
      ),
    );
    expect(res.status).toBe(401);
  });

  it("accepts the correct token when a shared secret is configured", async () => {
    vi.stubEnv("GELATO_WEBHOOK_SECRET", "s3cret");
    h.getOrder.mockResolvedValue(order());
    const { POST } = await loadRoute();
    const res = await POST(
      post(
        { event: "order_status_updated", orderId: "go_1", fulfillmentStatus: "shipped" },
        "http://localhost/api/webhooks/gelato?token=s3cret",
      ),
    );
    expect(res.status).toBe(202);
  });
});
