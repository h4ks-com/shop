import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CatalogProduct, CatalogVariant } from "@/lib/catalog";

const h = vi.hoisted(() => ({
  getProduct: vi.fn<(id: number) => Promise<CatalogProduct | undefined>>(),
  findVariant: vi.fn<(p: CatalogProduct, sku: string) => CatalogVariant | undefined>(),
  createCheckoutSession: vi.fn<(args: unknown) => Promise<{ id: string; url: string }>>(),
}));

vi.mock("@/lib/catalog", () => ({
  getProduct: h.getProduct,
  findVariant: h.findVariant,
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

const variant = (sku: string, priceCents: number): CatalogVariant => ({
  sku,
  sizeName: "M",
  color: "black",
  productUid: "uid",
  designId: "design-1",
  priceCents,
});

const productWith = (id: number, variants: CatalogVariant[]): CatalogProduct => ({
  id,
  title: `art-${id}`,
  description: "",
  images: [],
  variants,
});

beforeEach(() => {
  h.getProduct.mockReset();
  h.findVariant.mockReset();
  // Default: resolve the requested sku out of the product's variant list.
  h.findVariant.mockImplementation((p, sku) => p.variants.find((v) => v.sku === sku));
  h.createCheckoutSession.mockReset();
  h.createCheckoutSession.mockResolvedValue({ id: "cs_x", url: "https://stripe.test/x" });
});

describe("POST /api/checkout — multi-item cart", () => {
  it("accepts a multi-item cart and creates one stripe session with N lines", async () => {
    h.getProduct.mockImplementation(async (id) =>
      productWith(id, [variant(`SKU-${id}-A`, 1200), variant(`SKU-${id}-B`, 1800)]),
    );
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
    expect(args.lines[0]).toMatchObject({
      sku: "SKU-1-A",
      quantity: 2,
      unitAmountCents: 1200,
      productUid: "uid",
      designId: "design-1",
    });
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

  it.each([1.5, "2.5", "abc"])("rejects non-integer quantity %s", async (quantity) => {
    h.getProduct.mockResolvedValue(productWith(1, [variant("A", 1200)]));
    const { POST } = await loadRoute();
    const res = await POST(post({ items: [{ articleId: 1, sku: "A", quantity }] }));
    expect(res.status).toBe(400);
    expect(h.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("rejects an empty items array", async () => {
    const { POST } = await loadRoute();
    const res = await POST(post({ items: [] }));
    expect(res.status).toBe(400);
  });

  it("rejects an item with invalid articleId without a catalog lookup", async () => {
    const { POST } = await loadRoute();
    const res = await POST(post({ items: [{ articleId: -1, sku: "A", quantity: 1 }] }));
    expect(res.status).toBe(400);
    expect(h.getProduct).not.toHaveBeenCalled();
  });

  it("back-compat: still accepts the single-item body shape", async () => {
    h.getProduct.mockResolvedValue(productWith(1, [variant("A", 1200)]));
    const { POST } = await loadRoute();
    const res = await POST(post({ articleId: 1, sku: "A", quantity: 1 }));
    expect(res.status).toBe(200);
    const args = h.createCheckoutSession.mock.calls[0]?.[0] as { lines: unknown[] };
    expect(args.lines).toHaveLength(1);
  });
});
