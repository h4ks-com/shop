import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CatalogProduct } from "@/lib/catalog";

const h = vi.hoisted(() => ({
  getProduct: vi.fn<(id: number) => Promise<CatalogProduct | undefined>>(),
}));

vi.mock("@/lib/catalog", () => ({
  getProduct: h.getProduct,
  storefrontVariants: (p: CatalogProduct) =>
    p.variants.map((v) => ({
      sku: v.sku,
      sizeName: v.sizeName,
      appearanceName: v.color,
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
  images: [{ url: "https://gelato.test/front.jpg", color: "Black" }],
  variants: [
    {
      sku: "variant-1",
      sizeName: "M",
      color: "Black",
      productUid: "uid",
      designId: "design-1",
      priceCents: 2690,
    },
  ],
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
    h.getProduct.mockResolvedValue(product(12404));
    const { GET } = await loadRoute();
    const res = await GET(new Request("http://x/api/articles/12404"), params("12404"));
    expect(res.status).toBe(200);
    expect(h.getProduct).toHaveBeenCalledWith(12404);
    const body = (await res.json()) as {
      variants: { price: number; appearanceName: string }[];
      images: { appearanceName: string; imageUrl: string }[];
    };
    expect(body.variants[0]).toMatchObject({ price: 26.9, appearanceName: "Black" });
    expect(body.images[0]).toMatchObject({
      appearanceName: "Black",
      imageUrl: "https://gelato.test/front.jpg",
    });
  });

  it("404s for an unknown product", async () => {
    h.getProduct.mockResolvedValue(undefined);
    const { GET } = await loadRoute();
    const res = await GET(new Request("http://x/api/articles/999"), params("999"));
    expect(res.status).toBe(404);
  });
});
