import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

// Hoisted mock state — vi.mock factory runs before module import, so any
// reference to outer locals must be created via vi.hoisted.
const h = vi.hoisted(() => ({
  constructEvent: vi.fn<(raw: string, sig: string, sec: string) => Stripe.Event>(),
  retrieve: vi.fn<(id: string, opts?: unknown) => Promise<Stripe.Checkout.Session>>(),
  createOrder: vi.fn<(req: unknown) => Promise<{ id: string }>>(),
  findBySku: vi.fn<(sku: string) => unknown>(),
  designUrlFor: vi.fn<() => string>(),
  sendEmail: vi.fn<(opts: unknown) => Promise<void>>(),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: () => ({
    webhooks: { constructEvent: h.constructEvent },
    checkout: { sessions: { retrieve: h.retrieve } },
  }),
}));

vi.mock("@/lib/gelato", () => ({
  createOrder: h.createOrder,
}));

vi.mock("@/lib/catalog", () => ({
  findBySku: h.findBySku,
  designUrlFor: h.designUrlFor,
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

beforeEach(() => {
  h.constructEvent.mockReset();
  h.retrieve.mockReset();
  h.createOrder.mockReset();
  h.findBySku.mockReset();
  // Every SKU resolves to a product+variant by default.
  h.findBySku.mockImplementation((sku: string) => ({
    product: { id: 1, title: "Cool Tee", designFile: "x.png", needsArtwork: false },
    variant: { sku, productUid: `uid-${sku}`, priceCents: 1999 },
  }));
  h.designUrlFor.mockReset();
  h.designUrlFor.mockReturnValue("https://shop.test/designs/x.png");
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

  it("happy path places a Gelato order and emails the buyer", async () => {
    const s = baseSession();
    h.constructEvent.mockReturnValue(event(s));
    h.retrieve.mockResolvedValue(s);
    h.createOrder.mockResolvedValue({ id: "go_42" });
    const { POST } = await loadRoute();
    const res = await POST(makeReq("{}"));
    expect(res.status).toBe(200);
    expect(h.createOrder).toHaveBeenCalledTimes(1);
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    const arg = h.createOrder.mock.calls[0]?.[0] as { orderType: string; orderReferenceId: string };
    expect(arg.orderType).toBe("order");
    expect(arg.orderReferenceId).toBe("h4ks-ref-1");
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

  it("allows reprocessing after a transient Gelato failure (5xx → retry must work)", async () => {
    const s = baseSession();
    h.constructEvent.mockReturnValue(event(s, "evt_retry"));
    h.retrieve.mockResolvedValue(s);
    h.createOrder.mockRejectedValueOnce(new Error("gelato 503"));
    const { POST } = await loadRoute();

    const r1 = await POST(makeReq("{}"));
    expect(r1.status).toBe(500);
    expect(h.createOrder).toHaveBeenCalledTimes(1);

    h.createOrder.mockResolvedValueOnce({ id: "go_7" });
    const r2 = await POST(makeReq("{}"));
    expect(r2.status).toBe(200);
    expect(h.createOrder).toHaveBeenCalledTimes(2);
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

  it("places a Gelato order with all cart items mapped to productUid + file", async () => {
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
    h.createOrder.mockResolvedValue({ id: "go_999" });
    const { POST } = await loadRoute();
    const res = await POST(makeReq("{}"));
    expect(res.status).toBe(200);
    const arg = h.createOrder.mock.calls[0]?.[0] as {
      items: { itemReferenceId: string; productUid: string; fileUrl: string; quantity: number }[];
    };
    expect(arg.items).toHaveLength(2);
    expect(arg.items[0]).toMatchObject({
      itemReferenceId: "SKU-A",
      productUid: "uid-SKU-A",
      quantity: 2,
    });
    expect(arg.items[1]).toMatchObject({ itemReferenceId: "SKU-B", quantity: 1 });
  });

  it("400s when a purchased sku is not in the catalog", async () => {
    const s = baseSession();
    h.constructEvent.mockReturnValue(event(s, "evt_badsku"));
    h.retrieve.mockResolvedValue(s);
    h.findBySku.mockReturnValue(null);
    const { POST } = await loadRoute();
    const res = await POST(makeReq("{}"));
    expect(res.status).toBe(400);
    expect(h.createOrder).not.toHaveBeenCalled();
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
