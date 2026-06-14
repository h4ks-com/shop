import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CatalogProduct } from "@/lib/catalog";

const h = vi.hoisted(() => ({
  getProduct: vi.fn<(id: number) => CatalogProduct | undefined>(),
}));

vi.mock("@/lib/catalog", () => ({
  getProduct: h.getProduct,
  productImagePath: (p: CatalogProduct) => (p.designFile ? `/designs/${p.designFile}` : null),
  storefrontVariants: (p: CatalogProduct) =>
    p.variants.map((v) => ({
      sku: v.sku,
      sizeName: v.sizeName,
      appearanceName: p.color,
      appearanceColorValue: "",
      price: v.priceCents / 100,
      stock: 1,
    })),
}));

async function loadRoute() {
  vi.resetModules();
  return await import("@/app/api/articles/[id]/route");
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const product = (id: number): CatalogProduct => ({
  id,
  title: "T",
  description: "",
  color: "black",
  designFile: "x.png",
  needsArtwork: false,
  variants: [{ sku: `g-${id}-os`, sizeName: "One Size", productUid: "uid", priceCents: 2690 }],
});

beforeEach(() => {
  h.getProduct.mockReset();
});

describe("GET /api/articles/[id] — id validation", () => {
  it.each(["abc", "1.5", "-1", "0", "Infinity", "1e308", "true", "null"])(
    "rejects %s without a catalog lookup",
    async (id) => {
      const { GET } = await loadRoute();
      const res = await GET(new Request("http://x/api/articles/" + id), params(id));
      expect(res.status).toBe(400);
      expect(h.getProduct).not.toHaveBeenCalled();
    },
  );

  it("accepts a positive integer id and returns the product", async () => {
    h.getProduct.mockReturnValue(product(12404));
    const { GET } = await loadRoute();
    const res = await GET(new Request("http://x/api/articles/12404"), params("12404"));
    expect(res.status).toBe(200);
    expect(h.getProduct).toHaveBeenCalledWith(12404);
    const body = (await res.json()) as { variants: { price: number }[] };
    expect(body.variants[0]?.price).toBe(26.9);
  });

  it("404s for an unknown product", async () => {
    h.getProduct.mockReturnValue(undefined);
    const { GET } = await loadRoute();
    const res = await GET(new Request("http://x/api/articles/999"), params("999"));
    expect(res.status).toBe(404);
  });

  it("404s for an artwork-pending product", async () => {
    h.getProduct.mockReturnValue({ ...product(5), needsArtwork: true });
    const { GET } = await loadRoute();
    const res = await GET(new Request("http://x/api/articles/5"), params("5"));
    expect(res.status).toBe(404);
  });
});
