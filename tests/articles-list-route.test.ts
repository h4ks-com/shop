import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CatalogProduct } from "@/lib/catalog";

const h = vi.hoisted(() => ({
  listProducts: vi.fn<() => Promise<CatalogProduct[]>>(),
}));

vi.mock("@/lib/catalog", () => ({
  listProducts: h.listProducts,
  lowestPriceCents: (p: CatalogProduct) => Math.min(...p.variants.map((v) => v.priceCents)),
  productImagePath: (p: CatalogProduct) => p.images[0]?.url ?? null,
}));

async function loadRoute() {
  vi.resetModules();
  return await import("@/app/api/articles/route");
}

const get = (qs = "") => new Request(`http://x/api/articles${qs}`);

const product = (id: number): CatalogProduct => ({
  id,
  title: `p${id}`,
  description: "",
  images: [{ url: `https://gelato.test/${id}.jpg`, color: "White" }],
  variants: [
    {
      sku: `variant-${id}`,
      sizeName: "one size",
      color: "White",
      productUid: "uid",
      designId: "design-1",
      priceCents: 2690,
    },
  ],
});

beforeEach(() => {
  h.listProducts.mockReset();
  h.listProducts.mockResolvedValue([]);
});

describe("GET /api/articles — query validation", () => {
  it.each([
    ["?limit=-1", 400],
    ["?limit=0", 400],
    ["?limit=null", 400],
    ["?limit=1.5", 400],
    ["?offset=-1", 400],
    ["?offset=NaN", 400],
    ["?offset=1.5", 400],
  ])("rejects %s", async (qs, status) => {
    const { GET } = await loadRoute();
    const res = await GET(get(qs));
    expect(res.status).toBe(status);
  });

  it("accepts valid limit + offset and returns count", async () => {
    h.listProducts.mockResolvedValue([product(1), product(2), product(3)]);
    const { GET } = await loadRoute();
    const res = await GET(get("?limit=2&offset=0"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; count: number };
    expect(body.count).toBe(3);
    expect(body.items).toHaveLength(2);
  });

  it("slices by offset", async () => {
    h.listProducts.mockResolvedValue([product(1), product(2), product(3)]);
    const { GET } = await loadRoute();
    const res = await GET(get("?limit=10&offset=2"));
    const body = (await res.json()) as { items: { id: number }[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.id).toBe(3);
  });

  it("maps preview image + priceFrom", async () => {
    h.listProducts.mockResolvedValue([product(1)]);
    const { GET } = await loadRoute();
    const res = await GET(get());
    const body = (await res.json()) as {
      items: { previewImage: string; priceFrom: number }[];
    };
    expect(body.items[0]).toMatchObject({
      previewImage: "https://gelato.test/1.jpg",
      priceFrom: 26.9,
    });
  });
});
