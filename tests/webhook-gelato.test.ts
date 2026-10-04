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

const ORDER_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const URL_WITH_TOKEN = `http://localhost/api/webhooks/gelato?token=${process.env.GELATO_WEBHOOK_SECRET}`;

const post = (body: unknown, url = URL_WITH_TOKEN) =>
  new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const statusEvent = (fulfillmentStatus = "shipped", orderId = ORDER_ID) => ({
  event: "order_status_updated",
  orderId,
  fulfillmentStatus,
});

async function loadRoute() {
  vi.resetModules();
  return await import("@/app/api/webhooks/gelato/route");
}

// The handler runs detached from the response; let its microtasks settle.
const flush = () => new Promise((r) => setTimeout(r, 0));

const order = (over: Record<string, unknown> = {}) => ({
  id: ORDER_ID,
  orderReferenceId: "h4ks-ref-1",
  fulfillmentStatus: "shipped",
  shippingAddress: { email: "buyer@example.test" },
  items: [],
  ...over,
});

const sentSubject = () => (h.sendEmail.mock.calls[0]?.[0] as { subject: string }).subject;

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
  it("sends a shipment email when the fetched order is shipped", async () => {
    h.getOrder.mockResolvedValue(order());
    const { POST } = await loadRoute();
    const res = await POST(post(statusEvent("shipped")));
    expect(res.status).toBe(202);
    await flush();
    expect(h.getOrder).toHaveBeenCalledWith(ORDER_ID);
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    const arg = h.sendEmail.mock.calls[0]?.[0] as { to: string };
    expect(arg.to).toBe("buyer@example.test");
    expect(sentSubject()).toBe("your order is on the way");
  });

  it("sends a cancellation email when the fetched order is canceled", async () => {
    h.getOrder.mockResolvedValue(order({ fulfillmentStatus: "canceled" }));
    const { POST } = await loadRoute();
    await POST(post(statusEvent("canceled")));
    await flush();
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    expect(sentSubject()).toBe("order cancelled");
  });

  it("decides the email from the fetched order, ignoring the body status", async () => {
    h.getOrder.mockResolvedValue(order({ fulfillmentStatus: "printed" }));
    const { POST } = await loadRoute();
    await POST(post(statusEvent("canceled")));
    await flush();
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it("sends the email the fetched order calls for when the body status disagrees", async () => {
    h.getOrder.mockResolvedValue(order({ fulfillmentStatus: "shipped" }));
    const { POST } = await loadRoute();
    await POST(post(statusEvent("canceled")));
    await flush();
    expect(sentSubject()).toBe("your order is on the way");
  });

  it("ignores non-order_status_updated events", async () => {
    const { POST } = await loadRoute();
    const res = await POST(post({ event: "store_product_created" }));
    expect(res.status).toBe(202);
    await flush();
    expect(h.getOrder).not.toHaveBeenCalled();
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it("ignores an orderId that is not a UUID", async () => {
    const { POST } = await loadRoute();
    await POST(post(statusEvent("shipped", "../v4/orders")));
    await flush();
    expect(h.getOrder).not.toHaveBeenCalled();
  });

  it("does not email when the order has no customer email", async () => {
    h.getOrder.mockResolvedValue(order({ shippingAddress: {} }));
    const { POST } = await loadRoute();
    await POST(post(statusEvent()));
    await flush();
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it("dedupes a redelivered webhook (same body)", async () => {
    h.getOrder.mockResolvedValue(order());
    const { POST } = await loadRoute();
    const r1 = await POST(post(statusEvent()));
    const r2 = await POST(post(statusEvent()));
    expect(r1.status).toBe(202);
    expect(r2.status).toBe(202);
    await flush();
    expect(h.getOrder).toHaveBeenCalledTimes(1);
  });

  it("re-enters after a transient handler failure (dedup key released)", async () => {
    h.getOrder.mockRejectedValueOnce(new Error("gelato 503"));
    h.getOrder.mockResolvedValue(order());
    const { POST } = await loadRoute();
    await POST(post(statusEvent()));
    await flush();
    await POST(post(statusEvent()));
    await flush();
    expect(h.getOrder).toHaveBeenCalledTimes(2);
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("401s without a token", async () => {
    const { POST } = await loadRoute();
    const res = await POST(post(statusEvent(), "http://localhost/api/webhooks/gelato"));
    expect(res.status).toBe(401);
  });

  it("401s when the token is wrong", async () => {
    vi.stubEnv("GELATO_WEBHOOK_SECRET", "s3cret");
    const { POST } = await loadRoute();
    const res = await POST(post(statusEvent(), "http://localhost/api/webhooks/gelato?token=wrong"));
    expect(res.status).toBe(401);
  });

  it("accepts the correct token", async () => {
    vi.stubEnv("GELATO_WEBHOOK_SECRET", "s3cret");
    h.getOrder.mockResolvedValue(order());
    const { POST } = await loadRoute();
    const res = await POST(
      post(statusEvent(), "http://localhost/api/webhooks/gelato?token=s3cret"),
    );
    expect(res.status).toBe(202);
  });
});
