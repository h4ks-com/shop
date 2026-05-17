import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

// Hoisted mock state — vi.mock factory runs before module import, so any
// reference to outer locals must be created via vi.hoisted.
const h = vi.hoisted(() => ({
  constructEvent: vi.fn<(raw: string, sig: string, sec: string) => Stripe.Event>(),
  retrieve: vi.fn<(id: string, opts?: unknown) => Promise<Stripe.Checkout.Session>>(),
  createOrder: vi.fn<(req: unknown) => Promise<{ id: number }>>(),
  confirmOrder: vi.fn<(id: number) => Promise<void>>(),
  sendEmail: vi.fn<(opts: unknown) => Promise<void>>(),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: () => ({
    webhooks: { constructEvent: h.constructEvent },
    checkout: { sessions: { retrieve: h.retrieve } },
  }),
}));

vi.mock("@/lib/spreadconnect", () => ({
  createOrder: h.createOrder,
  confirmOrder: h.confirmOrder,
}));

vi.mock("@/lib/mailer", () => ({
  sendEmail: h.sendEmail,
}));

const baseSession = (over: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session =>
  ({
    id: "cs_test_1",
    object: "checkout.session",
    metadata: {
      items: JSON.stringify([{ sku: "SKU-1", qty: 2, unitCents: 1999 }]),
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
      data: [
        {
          id: "li_1",
          quantity: 2,
          amount_subtotal: 3998,
          description: "Cool Tee",
          price: { unit_amount: 1999, product: "prod_1" },
        },
      ],
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

beforeEach(() => {
  h.constructEvent.mockReset();
  h.retrieve.mockReset();
  h.createOrder.mockReset();
  h.confirmOrder.mockReset();
  h.sendEmail.mockReset();
  h.sendEmail.mockResolvedValue();
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

  it("happy path creates + confirms spreadconnect order and emails the buyer", async () => {
    const s = baseSession();
    h.constructEvent.mockReturnValue(event(s));
    h.retrieve.mockResolvedValue(s);
    h.createOrder.mockResolvedValue({ id: 42 });
    h.confirmOrder.mockResolvedValue();
    const { POST } = await loadRoute();
    const res = await POST(makeReq("{}"));
    expect(res.status).toBe(200);
    expect(h.createOrder).toHaveBeenCalledTimes(1);
    expect(h.confirmOrder).toHaveBeenCalledWith(42);
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("dedupes a Stripe retry of a successful event without re-ordering", async () => {
    const s = baseSession();
    h.constructEvent.mockReturnValue(event(s, "evt_dup"));
    h.retrieve.mockResolvedValue(s);
    h.createOrder.mockResolvedValue({ id: 100 });
    h.confirmOrder.mockResolvedValue();
    const { POST } = await loadRoute();

    const r1 = await POST(makeReq("{}"));
    const r2 = await POST(makeReq("{}"));
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(h.createOrder).toHaveBeenCalledTimes(1);
  });

  it("allows reprocessing after a transient spreadconnect failure (5xx → retry must work)", async () => {
    const s = baseSession();
    h.constructEvent.mockReturnValue(event(s, "evt_retry"));
    h.retrieve.mockResolvedValue(s);
    h.createOrder.mockRejectedValueOnce(new Error("spreadconnect 503"));
    const { POST } = await loadRoute();

    const r1 = await POST(makeReq("{}"));
    expect(r1.status).toBe(500);
    expect(h.createOrder).toHaveBeenCalledTimes(1);

    // Stripe retries with the same event.id → must not be silently dedup'd.
    h.createOrder.mockResolvedValueOnce({ id: 7 });
    h.confirmOrder.mockResolvedValueOnce();
    const r2 = await POST(makeReq("{}"));
    expect(r2.status).toBe(200);
    expect(h.createOrder).toHaveBeenCalledTimes(2);
    expect(h.confirmOrder).toHaveBeenCalledWith(7);
  });

  it("does NOT call createOrder a second time if confirmOrder failed on the first attempt", async () => {
    // Real failure mode: createOrder succeeded on Spreadconnect, confirmOrder
    // network-failed before our process saw the response. Stripe retries the
    // same event.id. We must NOT createOrder again — that would print twice.
    const s = baseSession();
    h.constructEvent.mockReturnValue(event(s, "evt_confirm_fail"));
    h.retrieve.mockResolvedValue(s);
    h.createOrder.mockResolvedValueOnce({ id: 555 });
    h.confirmOrder.mockRejectedValueOnce(new Error("spreadconnect timeout on confirm"));
    const { POST } = await loadRoute();

    const r1 = await POST(makeReq("{}"));
    expect(r1.status).toBe(500);
    expect(h.createOrder).toHaveBeenCalledTimes(1);

    // Stripe retry → must hit the session gate and bail without re-creating.
    const r2 = await POST(makeReq("{}"));
    expect(r2.status).toBe(200);
    expect(h.createOrder).toHaveBeenCalledTimes(1);
  });

  it("skips fulfillment when payment_status is not 'paid' (async payment pending)", async () => {
    const s = baseSession({ payment_status: "unpaid" });
    h.constructEvent.mockReturnValue(event(s, "evt_unpaid"));
    h.retrieve.mockResolvedValue(s);
    const { POST } = await loadRoute();

    const res = await POST(makeReq("{}"));
    expect(res.status).toBe(200);
    expect(h.createOrder).not.toHaveBeenCalled();
    expect(h.confirmOrder).not.toHaveBeenCalled();
  });

  it("processes when payment_status is 'paid'", async () => {
    const s = baseSession({ payment_status: "paid" });
    h.constructEvent.mockReturnValue(event(s, "evt_paid"));
    h.retrieve.mockResolvedValue(s);
    h.createOrder.mockResolvedValue({ id: 1 });
    h.confirmOrder.mockResolvedValue();
    const { POST } = await loadRoute();
    const res = await POST(makeReq("{}"));
    expect(res.status).toBe(200);
    expect(h.createOrder).toHaveBeenCalledTimes(1);
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

  it("creates a spreadconnect order with all cart items from metadata", async () => {
    const s = baseSession({
      metadata: {
        items: JSON.stringify([
          { sku: "SKU-A", qty: 2, unitCents: 1500 },
          { sku: "SKU-B", qty: 1, unitCents: 2000 },
        ]),
        external_order_reference: "h4ks-cart-1",
      },
    });
    h.constructEvent.mockReturnValue(event(s, "evt_cart"));
    h.retrieve.mockResolvedValue(s);
    h.createOrder.mockResolvedValue({ id: 999 });
    h.confirmOrder.mockResolvedValue();
    const { POST } = await loadRoute();
    const res = await POST(makeReq("{}"));
    expect(res.status).toBe(200);
    const callArg = h.createOrder.mock.calls[0]?.[0] as {
      orderItems: { sku: string; quantity: number; customerPrice: { amount: number } }[];
    };
    expect(callArg.orderItems).toHaveLength(2);
    expect(callArg.orderItems[0]).toMatchObject({
      sku: "SKU-A",
      quantity: 2,
      customerPrice: { amount: 15 },
    });
    expect(callArg.orderItems[1]).toMatchObject({
      sku: "SKU-B",
      quantity: 1,
      customerPrice: { amount: 20 },
    });
  });

  it("400s when items metadata is missing", async () => {
    const s = baseSession({ metadata: {} });
    h.constructEvent.mockReturnValue(event(s, "evt_nosku"));
    h.retrieve.mockResolvedValue(s);
    const { POST } = await loadRoute();
    const res = await POST(makeReq("{}"));
    expect(res.status).toBe(400);
    expect(h.createOrder).not.toHaveBeenCalled();
  });
});
