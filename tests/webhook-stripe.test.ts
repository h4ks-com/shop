import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type Stripe from "stripe";

// Hoisted mock state: the vi.mock factory runs before module import, so any
// reference to outer locals must be created via vi.hoisted.
const h = vi.hoisted(() => ({
  constructEvent: vi.fn<(raw: string, sig: string, sec: string) => Stripe.Event>(),
  retrieve: vi.fn<(id: string, opts?: unknown) => Promise<Stripe.Checkout.Session>>(),
  createOrder: vi.fn<(req: unknown) => Promise<{ id: string }>>(),
  findOrderByReference: vi.fn<(ref: string) => Promise<{ id: string } | null>>(),
  sendEmail: vi.fn<(opts: { to: string; text?: string }) => Promise<void>>(),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: () => ({
    webhooks: { constructEvent: h.constructEvent },
    checkout: { sessions: { retrieve: h.retrieve } },
  }),
}));

vi.mock("@/lib/gelato", () => ({
  createOrder: h.createOrder,
  findOrderByReference: h.findOrderByReference,
}));

vi.mock("@/lib/mailer", () => ({
  sendEmail: h.sendEmail,
}));

const item = (sku: string, qty: number, over: Record<string, unknown> = {}) =>
  JSON.stringify({
    sku,
    qty,
    unitCents: 1999,
    productUid: `uid-${sku}`,
    designId: `design-${sku}`,
    ...over,
  });

const baseSession = (over: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session =>
  ({
    id: "cs_test_1",
    object: "checkout.session",
    metadata: {
      item_0: item("SKU-1", 2),
      external_order_reference: "h4ks-ref-1",
    },
    client_reference_id: "h4ks-ref-1",
    payment_status: "paid",
    customer_details: { email: "buyer@example.test", name: "Ada Lovelace", phone: "+1" },
    collected_information: {
      shipping_details: {
        name: "Ada Lovelace",
        address: {
          line1: "10 Downing",
          line2: null,
          city: "London",
          state: null,
          postal_code: "SW1",
          country: "GB",
        },
      },
    },
    line_items: {
      data: [{ id: "li_1", quantity: 2, amount_subtotal: 3998, description: "Cool Tee" }],
    },
    amount_total: 4798,
    currency: "usd",
    ...over,
  }) as unknown as Stripe.Checkout.Session;

const makeReq = (body: string, sig = "sig_ok"): Request =>
  new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": sig },
    body,
  });

const event = (session: Stripe.Checkout.Session, id = "evt_1"): Stripe.Event =>
  ({ id, type: "checkout.session.completed", data: { object: session } }) as Stripe.Event;

async function loadRoute() {
  vi.resetModules();
  return await import("@/app/api/webhooks/stripe/route");
}

const alerts = () =>
  h.sendEmail.mock.calls.map((c) => c[0]).filter((m) => m.to === process.env.SHOP_CONTACT_EMAIL);

beforeEach(() => {
  h.constructEvent.mockReset();
  h.retrieve.mockReset();
  h.createOrder.mockReset();
  h.findOrderByReference.mockReset();
  h.findOrderByReference.mockResolvedValue(null);
  h.sendEmail.mockReset();
  h.sendEmail.mockResolvedValue();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/webhooks/stripe", () => {
  it("400s when signature header is missing", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("http://x", { method: "POST", body: "{}" }) as unknown as Request,
    );
    expect(res.status).toBe(400);
  });

  it("400s when signature is invalid", async () => {
    h.constructEvent.mockImplementation(() => {
      throw new Error("bad sig");
    });
    const { POST } = await loadRoute();
    const res = await POST(makeReq("{}", "sig_bad"));
    expect(res.status).toBe(400);
  });

  it("happy path places a Gelato order and emails the buyer", async () => {
    const s = baseSession();
    h.constructEvent.mockReturnValue(event(s));
    h.retrieve.mockResolvedValue(s);
    h.createOrder.mockResolvedValue({ id: "go_42" });
    const { POST } = await loadRoute();
    const res = await POST(makeReq("{}"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, orderId: "go_42" });
    expect(h.createOrder).toHaveBeenCalledTimes(1);
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    expect(h.sendEmail.mock.calls[0]?.[0].to).toBe("buyer@example.test");
    const arg = h.createOrder.mock.calls[0]?.[0] as { orderReferenceId: string };
    expect(arg.orderReferenceId).toBe("h4ks-ref-1");
  });

  it("places a DRAFT order by default (safe for local/staging)", async () => {
    const s = baseSession();
    h.constructEvent.mockReturnValue(event(s, "evt_draft"));
    h.retrieve.mockResolvedValue(s);
    h.createOrder.mockResolvedValue({ id: "go_draft" });
    const { POST } = await loadRoute();
    await POST(makeReq("{}"));
    expect((h.createOrder.mock.calls[0]?.[0] as { orderType: string }).orderType).toBe("draft");
  });

  it("places a live order when GELATO_LIVE_ORDERS=true", async () => {
    vi.stubEnv("GELATO_LIVE_ORDERS", "true");
    const s = baseSession();
    h.constructEvent.mockReturnValue(event(s, "evt_live"));
    h.retrieve.mockResolvedValue(s);
    h.createOrder.mockResolvedValue({ id: "go_live" });
    const { POST } = await loadRoute();
    await POST(makeReq("{}"));
    expect((h.createOrder.mock.calls[0]?.[0] as { orderType: string }).orderType).toBe("order");
  });

  it("dedupes a Stripe retry of a successful event without re-ordering", async () => {
    const s = baseSession();
    h.constructEvent.mockReturnValue(event(s, "evt_dup"));
    h.retrieve.mockResolvedValue(s);
    h.createOrder.mockResolvedValue({ id: "go_100" });
    const { POST } = await loadRoute();

    const r1 = await POST(makeReq("{}"));
    const r2 = await POST(makeReq("{}"));
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(h.createOrder).toHaveBeenCalledTimes(1);
  });

  it("returns the existing Gelato order for the reference without ordering or emailing", async () => {
    const s = baseSession();
    h.constructEvent.mockReturnValue(event(s, "evt_existing"));
    h.retrieve.mockResolvedValue(s);
    h.findOrderByReference.mockResolvedValue({ id: "go_existing" });
    const { POST } = await loadRoute();
    const res = await POST(makeReq("{}"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, orderId: "go_existing" });
    expect(h.findOrderByReference).toHaveBeenCalledWith("h4ks-ref-1");
    expect(h.createOrder).not.toHaveBeenCalled();
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it("on a Gelato failure releases both gates, 500s and alerts the owner once", async () => {
    const s = baseSession();
    h.constructEvent.mockReturnValue(event(s, "evt_retry"));
    h.retrieve.mockResolvedValue(s);
    h.createOrder.mockRejectedValue(new Error("gelato 503"));
    const { POST } = await loadRoute();

    const r1 = await POST(makeReq("{}"));
    const r2 = await POST(makeReq("{}"));
    expect(r1.status).toBe(500);
    expect(r2.status).toBe(500);
    expect(h.createOrder).toHaveBeenCalledTimes(2);
    expect(alerts()).toHaveLength(1);
    expect(alerts()[0]?.text).toContain("cs_test_1");
    expect(alerts()[0]?.text).toContain("h4ks-ref-1");
    expect(alerts()[0]?.text).toContain("buyer@example.test");
    expect(alerts()[0]?.text).toContain("gelato 503");

    h.createOrder.mockResolvedValueOnce({ id: "go_7" });
    const r3 = await POST(makeReq("{}"));
    expect(r3.status).toBe(200);
    expect(h.createOrder).toHaveBeenCalledTimes(3);
  });

  it("a fresh event for the same session re-enters after a failure", async () => {
    const s = baseSession();
    h.retrieve.mockResolvedValue(s);
    h.createOrder.mockRejectedValueOnce(new Error("timeout"));
    const { POST } = await loadRoute();

    h.constructEvent.mockReturnValue(event(s, "evt_a"));
    expect((await POST(makeReq("{}"))).status).toBe(500);
    h.createOrder.mockResolvedValueOnce({ id: "go_b" });
    h.constructEvent.mockReturnValue(event(s, "evt_b"));
    expect((await POST(makeReq("{}"))).status).toBe(200);
  });

  it("keeps the session gate and 200s when a step after createOrder fails", async () => {
    const s = baseSession();
    h.constructEvent.mockReturnValue(event(s, "evt_after_order"));
    h.retrieve.mockResolvedValue(s);
    h.createOrder.mockResolvedValue({ id: "go_placed" });
    h.sendEmail.mockImplementation(() => {
      throw new Error("smtp down");
    });
    const { POST } = await loadRoute();

    const r1 = await POST(makeReq("{}"));
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ ok: true, orderId: "go_placed" });
    h.constructEvent.mockReturnValue(event(s, "evt_after_order_2"));
    const r2 = await POST(makeReq("{}"));
    expect(await r2.json()).toEqual({ ok: true, deduped: true });
    expect(h.createOrder).toHaveBeenCalledTimes(1);
  });

  it("does not alert when the session cannot be retrieved", async () => {
    const s = baseSession();
    h.constructEvent.mockReturnValue(event(s, "evt_stripe_down"));
    h.retrieve.mockRejectedValue(new Error("stripe 503"));
    const { POST } = await loadRoute();
    const res = await POST(makeReq("{}"));
    expect(res.status).toBe(500);
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it("skips fulfillment when payment_status is not 'paid'", async () => {
    const s = baseSession({ payment_status: "unpaid" });
    h.constructEvent.mockReturnValue(event(s, "evt_unpaid"));
    h.retrieve.mockResolvedValue(s);
    const { POST } = await loadRoute();
    const res = await POST(makeReq("{}"));
    expect(res.status).toBe(200);
    expect(h.createOrder).not.toHaveBeenCalled();
  });

  it("ignores non-checkout events", async () => {
    h.constructEvent.mockReturnValue({
      id: "evt_other",
      type: "payment_intent.succeeded",
      data: { object: {} },
    } as Stripe.Event);
    const { POST } = await loadRoute();
    const res = await POST(makeReq("{}"));
    expect(res.status).toBe(200);
    expect(h.createOrder).not.toHaveBeenCalled();
  });

  it("builds the Gelato order items from the item_N metadata only", async () => {
    const s = baseSession({
      metadata: {
        item_0: item("SKU-A", 2),
        item_1: item("SKU-B", 1),
        external_order_reference: "h4ks-cart-1",
      },
    });
    h.constructEvent.mockReturnValue(event(s, "evt_cart"));
    h.retrieve.mockResolvedValue(s);
    h.createOrder.mockResolvedValue({ id: "go_999" });
    const { POST } = await loadRoute();
    const res = await POST(makeReq("{}"));
    expect(res.status).toBe(200);
    const arg = h.createOrder.mock.calls[0]?.[0] as { items: unknown[] };
    expect(arg.items).toEqual([
      { itemReferenceId: "SKU-A", productUid: "uid-SKU-A", designId: "design-SKU-A", quantity: 2 },
      { itemReferenceId: "SKU-B", productUid: "uid-SKU-B", designId: "design-SKU-B", quantity: 1 },
    ]);
  });

  it.each([
    ["missing", {}],
    ["not JSON", { item_0: "{" }],
    ["empty designId", { item_0: item("SKU-1", 1, { designId: "" }) }],
    ["fractional qty", { item_0: item("SKU-1", 1.5) }],
    ["zero qty", { item_0: item("SKU-1", 0) }],
    ["qty as string", { item_0: item("SKU-1", 1, { qty: "1" }) }],
  ])("500s and alerts when item metadata is %s", async (_label, metadata) => {
    const s = baseSession({ metadata });
    h.constructEvent.mockReturnValue(event(s, `evt_meta_${_label}`));
    h.retrieve.mockResolvedValue(s);
    const { POST } = await loadRoute();
    const res = await POST(makeReq("{}"));
    expect(res.status).toBe(500);
    expect(h.createOrder).not.toHaveBeenCalled();
    expect(alerts()).toHaveLength(1);
  });

  it("500s and alerts when the shipping address is missing", async () => {
    const s = baseSession({ collected_information: null });
    h.constructEvent.mockReturnValue(event(s, "evt_noaddr"));
    h.retrieve.mockResolvedValue(s);
    const { POST } = await loadRoute();
    const res = await POST(makeReq("{}"));
    expect(res.status).toBe(500);
    expect(h.createOrder).not.toHaveBeenCalled();
    expect(alerts()).toHaveLength(1);
  });
});
