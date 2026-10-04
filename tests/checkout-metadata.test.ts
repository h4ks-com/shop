import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

const h = vi.hoisted(() => ({
  create: vi.fn<(params: Stripe.Checkout.SessionCreateParams) => Promise<unknown>>(),
  retrieve: vi.fn<(id: string) => Promise<Stripe.Checkout.Session>>(),
  constructEvent: vi.fn<() => Stripe.Event>(),
  createOrder: vi.fn<(req: unknown) => Promise<{ id: string }>>(),
}));

vi.mock("stripe", () => ({
  default: class {
    webhooks = { constructEvent: h.constructEvent };
    checkout = { sessions: { create: h.create, retrieve: h.retrieve } };
  },
}));

vi.mock("@/lib/gelato", () => ({
  createOrder: h.createOrder,
  findOrderByReference: async () => null,
}));

vi.mock("@/lib/mailer", () => ({
  sendEmail: async () => {},
}));

const lines = [
  {
    sku: "0c9f7e2a-1111-4c3e-9a1b-000000000001",
    productName: "hanb tee",
    unitAmountCents: 2990,
    quantity: 2,
    productUid:
      "apparel_product_gca_t-shirt_gsc_crewneck_gcu_unisex_gqa_classic_gsi_xl_gco_white_gpr_4-4",
    designId: "5d1c3f7e-2222-4c3e-9a1b-000000000002",
  },
  {
    sku: "0c9f7e2a-3333-4c3e-9a1b-000000000003",
    productName: "hanb mug",
    unitAmountCents: 1500,
    quantity: 1,
    productUid: "mug_product_msz_11-oz_mmat_ceramic-white_cl_4-0",
    designId: "5d1c3f7e-4444-4c3e-9a1b-000000000004",
  },
];

beforeEach(() => {
  vi.resetModules();
  h.create.mockResolvedValue({ id: "cs_rt", url: "https://stripe.test/rt" });
});

describe("checkout metadata round trip", () => {
  it("the webhook orders exactly the lines checkout stored, with a short session expiry", async () => {
    const { createCheckoutSession } = await import("@/lib/stripe");
    const before = Math.floor(Date.now() / 1000);
    await createCheckoutSession({ lines, externalOrderReference: "h4ks-rt" });
    const params = h.create.mock.calls[0]![0];

    expect(params.expires_at).toBeGreaterThanOrEqual(before + 30 * 60);
    expect(params.expires_at).toBeLessThanOrEqual(before + 32 * 60);
    const metadata = params.metadata as Record<string, string>;
    expect(Object.keys(metadata).sort()).toEqual(["external_order_reference", "item_0", "item_1"]);
    for (const value of Object.values(metadata)) expect(value.length).toBeLessThanOrEqual(500);

    const session = {
      id: "cs_rt",
      metadata,
      client_reference_id: params.client_reference_id,
      payment_status: "paid",
      customer_details: { email: "buyer@example.test", name: "Ada Lovelace" },
      collected_information: {
        shipping_details: {
          name: "Ada Lovelace",
          address: {
            line1: "Musterstrasse 1",
            city: "Berlin",
            postal_code: "10115",
            country: "DE",
          },
        },
      },
    } as unknown as Stripe.Checkout.Session;
    h.constructEvent.mockReturnValue({
      id: "evt_rt",
      type: "checkout.session.completed",
      data: { object: session },
    } as Stripe.Event);
    h.retrieve.mockResolvedValue(session);
    h.createOrder.mockResolvedValue({ id: "go_rt" });

    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const res = await POST(
      new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: "{}",
      }),
    );

    expect(res.status).toBe(200);
    const order = h.createOrder.mock.calls[0]![0] as { orderReferenceId: string; items: unknown[] };
    expect(order.orderReferenceId).toBe("h4ks-rt");
    expect(order.items).toEqual(
      lines.map((l) => ({
        itemReferenceId: l.sku,
        productUid: l.productUid,
        designId: l.designId,
        quantity: l.quantity,
      })),
    );
  });
});
