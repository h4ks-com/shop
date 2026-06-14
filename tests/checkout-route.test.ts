import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CatalogProduct, CatalogVariant } from "@/lib/catalog";

const h = vi.hoisted(() => ({
  getProduct: vi.fn<(id: number) => CatalogProduct | undefined>(),
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

const product = (id: number): CatalogProduct => ({
  id,
  title: `art-${id}`,
  description: "",
  color: "",
  designFile: "x.png",
  needsArtwork: false,
  variants: [{ sku: "SKU-1", sizeName: "M", productUid: "uid", priceCents: 1999 }],
});

beforeEach(() => {
  h.getProduct.mockReset();
  h.findVariant.mockReset();
  h.createCheckoutSession.mockReset();
  h.createCheckoutSession.mockResolvedValue({ id: "cs_test_x", url: "https://stripe.test/x" });
});

describe("POST /api/checkout — articleId validation", () => {
  it.each([
    ["decimal", 1.5],
    ["negative", -1],
    ["zero", 0],
    ["NaN-ish from huge number cast", Number.POSITIVE_INFINITY],
    ["object", { $gt: 0 }],
    ["array", [12404]],
  ])("rejects %s articleId without a catalog lookup", async (_label, articleId) => {
    const { POST } = await loadRoute();
    const res = await POST(post({ articleId, sku: "SKU-1" }));
    expect(res.status).toBe(400);
    expect(h.getProduct).not.toHaveBeenCalled();
  });

  it("accepts a stringified positive integer (common from form encoders)", async () => {
    const p = product(12404);
    h.getProduct.mockReturnValue(p);
    h.findVariant.mockReturnValue(p.variants[0]);
    const { POST } = await loadRoute();
    const res = await POST(post({ articleId: "12404", sku: "SKU-1" }));
    expect(res.status).toBe(200);
    expect(h.getProduct).toHaveBeenCalledWith(12404);
  });

  it("400s for an unknown product", async () => {
    h.getProduct.mockReturnValue(undefined);
    const { POST } = await loadRoute();
    const res = await POST(post({ articleId: 999, sku: "SKU-1" }));
    expect(res.status).toBe(400);
    expect(h.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("400s when the sku is not in the product", async () => {
    h.getProduct.mockReturnValue(product(1));
    h.findVariant.mockReturnValue(undefined);
    const { POST } = await loadRoute();
    const res = await POST(post({ articleId: 1, sku: "NOPE" }));
    expect(res.status).toBe(400);
  });
});
