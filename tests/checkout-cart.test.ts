import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  getArticle: vi.fn<(id: number) => Promise<unknown>>(),
  customerPriceAmount: vi.fn<(v: { d2cPrice: number; b2bPrice: number }) => number>(
    (v) => v.d2cPrice || v.b2bPrice * 1.5,
  ),
  createCheckoutSession: vi.fn<(args: unknown) => Promise<{ id: string; url: string }>>(),
}));

vi.mock("@/lib/spreadconnect", () => ({
  getArticle: h.getArticle,
  customerPriceAmount: h.customerPriceAmount,
}));

vi.mock("@/lib/stripe", () => ({
  createCheckoutSession: h.createCheckoutSession,
}));

const post = (body: unknown) =>
  new Request("http://localhost/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

async function loadRoute() {
  vi.resetModules();
  return await import("@/app/api/checkout/route");
}

const variant = (sku: string, stock = 10, price = 15) => ({
  sku,
  stock,
  d2cPrice: price,
  b2bPrice: 0,
});

beforeEach(() => {
  h.getArticle.mockReset();
  h.createCheckoutSession.mockReset();
  h.createCheckoutSession.mockResolvedValue({ id: "cs_x", url: "https://stripe.test/x" });
});

describe("POST /api/checkout — multi-item cart", () => {
  it("accepts a cart with multiple items and creates one stripe session with N lines", async () => {
    h.getArticle.mockImplementation(async (id: number) => ({
      title: `art-${id}`,
      variants: [variant(`SKU-${id}-A`, 10, 12), variant(`SKU-${id}-B`, 10, 18)],
    }));
    const { POST } = await loadRoute();
    const res = await POST(
      post({
        items: [
          { articleId: 1, sku: "SKU-1-A", quantity: 2 },
          { articleId: 2, sku: "SKU-2-B", quantity: 1 },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(h.createCheckoutSession).toHaveBeenCalledTimes(1);
    const args = h.createCheckoutSession.mock.calls[0]?.[0] as {
      lines: { sku: string; quantity: number; unitAmountCents: number }[];
    };
    expect(args.lines).toHaveLength(2);
    expect(args.lines[0]).toMatchObject({ sku: "SKU-1-A", quantity: 2, unitAmountCents: 1200 });
    expect(args.lines[1]).toMatchObject({ sku: "SKU-2-B", quantity: 1, unitAmountCents: 1800 });
  });

  it("rejects a cart whose total quantity exceeds CART_MAX_ITEMS", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      post({
        items: [
          { articleId: 1, sku: "A", quantity: 3 },
          { articleId: 1, sku: "B", quantity: 3 },
        ],
      }),
    );
    expect(res.status).toBe(400);
    expect(h.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("rejects an empty items array", async () => {
    const { POST } = await loadRoute();
    const res = await POST(post({ items: [] }));
    expect(res.status).toBe(400);
  });

  it("rejects an item with invalid articleId without calling upstream", async () => {
    const { POST } = await loadRoute();
    const res = await POST(post({ items: [{ articleId: -1, sku: "A", quantity: 1 }] }));
    expect(res.status).toBe(400);
    expect(h.getArticle).not.toHaveBeenCalled();
  });

  it("409s when any item is out of stock", async () => {
    h.getArticle.mockResolvedValue({
      title: "art",
      variants: [variant("A", 0)],
    });
    const { POST } = await loadRoute();
    const res = await POST(post({ items: [{ articleId: 1, sku: "A", quantity: 1 }] }));
    expect(res.status).toBe(409);
  });

  it("back-compat: still accepts the single-item body shape", async () => {
    h.getArticle.mockResolvedValue({
      title: "art",
      variants: [variant("A", 10, 12)],
    });
    const { POST } = await loadRoute();
    const res = await POST(post({ articleId: 1, sku: "A", quantity: 1 }));
    expect(res.status).toBe(200);
    const args = h.createCheckoutSession.mock.calls[0]?.[0] as { lines: unknown[] };
    expect(args.lines).toHaveLength(1);
  });
});
