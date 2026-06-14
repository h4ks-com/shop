import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CatalogProduct } from "@/lib/catalog";

const h = vi.hoisted(() => ({
  listProducts: vi.fn<() => CatalogProduct[]>(),
}));

vi.mock("@/lib/catalog", () => ({
  listProducts: h.listProducts,
  lowestPriceCents: (p: CatalogProduct) =>
    p.variants.length ? Math.min(...p.variants.map((v) => v.priceCents)) : null,
  productImagePath: (p: CatalogProduct) => (p.designFile ? `/designs/${p.designFile}` : null),
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
  color: "",
  designFile: "x.png",
  needsArtwork: false,
  variants: [{ sku: `g-${id}-os`, sizeName: "One Size", productUid: "uid", priceCents: 2690 }],
});

beforeEach(() => {
  h.listProducts.mockReset();
  h.listProducts.mockReturnValue([]);
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
    h.listProducts.mockReturnValue([product(1), product(2), product(3)]);
    const { GET } = await loadRoute();
    const res = await GET(get("?limit=2&offset=0"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; count: number };
    expect(body.count).toBe(3);
    expect(body.items).toHaveLength(2);
  });

  it("slices by offset", async () => {
    h.listProducts.mockReturnValue([product(1), product(2), product(3)]);
    const { GET } = await loadRoute();
    const res = await GET(get("?limit=10&offset=2"));
    const body = (await res.json()) as { items: { id: number }[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.id).toBe(3);
  });

  it("maps preview image + priceFrom", async () => {
    h.listProducts.mockReturnValue([product(1)]);
    const { GET } = await loadRoute();
    const res = await GET(get());
    const body = (await res.json()) as {
      items: { previewImage: string; priceFrom: number }[];
    };
    expect(body.items[0]).toMatchObject({ previewImage: "/designs/x.png", priceFrom: 26.9 });
  });
});
