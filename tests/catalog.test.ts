import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { numericId, storefrontVariants, toCatalogProduct } from "@/lib/catalog";
import type { GelatoStoreProduct, GelatoStoreVariant } from "@/lib/gelato";

const h = vi.hoisted(() => ({
  listStoreProducts: vi.fn<() => Promise<{ id: string }[]>>(),
  getStoreProduct: vi.fn<(storeId: string, id: string) => Promise<unknown>>(),
  listStoreVariants: vi.fn<(storeId: string, id: string) => Promise<unknown>>(),
}));

vi.mock("@/lib/gelato", () => h);

const storeVariant = (
  id: string,
  color: string,
  size: string,
  over: Partial<GelatoStoreVariant> = {},
): GelatoStoreVariant => ({
  id,
  productUid: `uid-${color}-${size}`,
  designId: `design-${id}`,
  price: 29.9,
  currency: "EUR",
  isHidden: false,
  position: 1,
  variantOptions: [
    { name: "Color", value: color },
    { name: "Size", value: size },
  ],
  ...over,
});

const storeProduct = (over: Partial<GelatoStoreProduct> = {}): GelatoStoreProduct => ({
  id: "product-1",
  title: "hanb tee",
  description: "<p>tee</p>",
  status: "active",
  createdAt: "2026-10-04T00:00:00Z",
  tags: ["h4ks", "key:hanb-tee"],
  productImages: [
    { fileUrl: "https://gelato.test/black.jpg", isPrimary: false, productVariantIds: ["v-black"] },
    { fileUrl: "https://gelato.test/white.jpg", isPrimary: true, productVariantIds: ["v-white"] },
  ],
  ...over,
});

describe("toCatalogProduct", () => {
  it("maps store variants to orderable catalog variants in position order", () => {
    const product = toCatalogProduct(
      storeProduct(),
      [
        storeVariant("v-black", "Black", "M", { position: 2 }),
        storeVariant("v-white", "White", "M", { position: 1 }),
      ],
      "EUR",
    );
    expect(product?.id).toBe(numericId("product-1"));
    expect(product?.variants).toEqual([
      {
        sku: "v-white",
        sizeName: "M",
        color: "White",
        productUid: "uid-White-M",
        designId: "design-v-white",
        priceCents: 2990,
      },
      {
        sku: "v-black",
        sizeName: "M",
        color: "Black",
        productUid: "uid-Black-M",
        designId: "design-v-black",
        priceCents: 2990,
      },
    ]);
  });

  it("puts the primary image first and tags images with their colour", () => {
    const product = toCatalogProduct(
      storeProduct(),
      [storeVariant("v-white", "White", "M"), storeVariant("v-black", "Black", "M")],
      "EUR",
    );
    expect(product?.images).toEqual([
      { url: "https://gelato.test/white.jpg", color: "White" },
      { url: "https://gelato.test/black.jpg", color: "Black" },
    ]);
  });

  it("drops hidden, design-less, other-currency and unpriced variants", () => {
    const product = toCatalogProduct(
      storeProduct(),
      [
        storeVariant("v-1", "White", "S", { isHidden: true }),
        storeVariant("v-2", "White", "M", { designId: null }),
        storeVariant("v-3", "White", "L", { currency: "USD" }),
        storeVariant("v-4", "White", "XL"),
        storeVariant("v-5", "White", "XXL", { price: 0 }),
      ],
      "EUR",
    );
    expect(product?.variants.map((v) => v.sku)).toEqual(["v-4"]);
  });

  it("skips products that are not active or have nothing to order", () => {
    expect(
      toCatalogProduct(
        storeProduct({ status: "publishing" }),
        [storeVariant("v", "White", "M")],
        "EUR",
      ),
    ).toBeNull();
    expect(toCatalogProduct(storeProduct(), [], "EUR")).toBeNull();
  });

  it("names variants without colour or size options", () => {
    const product = toCatalogProduct(
      storeProduct(),
      [storeVariant("v-1", "", "", { variantOptions: [{ name: "Model", value: "iPhone 15" }] })],
      "EUR",
    );
    expect(storefrontVariants(product!)).toEqual([
      {
        sku: "v-1",
        sizeName: "iPhone 15",
        appearanceName: "",
        appearanceColorValue: "",
        price: 29.9,
        stock: 1,
      },
    ]);
  });
});

describe("numericId", () => {
  it("is a stable positive integer for a Gelato product id", () => {
    expect(numericId("product-1")).toBe(numericId("product-1"));
    expect(Number.isSafeInteger(numericId("product-1"))).toBe(true);
    expect(numericId("product-1")).not.toBe(numericId("product-2"));
  });
});

describe("loadCatalog", () => {
  const T0 = new Date("2026-10-04T12:00:00Z").getTime();

  async function loadModule() {
    vi.resetModules();
    return await import("@/lib/catalog");
  }

  const serveProducts = (...ids: string[]) => {
    h.listStoreProducts.mockResolvedValue(ids.map((id) => ({ id })));
    h.getStoreProduct.mockImplementation(async (_store, id) => storeProduct({ id }));
    h.listStoreVariants.mockImplementation(async (_store, id) => [
      storeVariant(`v-${id}`, "White", "M"),
    ]);
  };

  beforeEach(() => {
    Object.values(h).forEach((fn) => fn.mockReset());
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("drops only the product that fails to load", async () => {
    serveProducts("p-1", "p-2");
    h.getStoreProduct.mockImplementation(async (_store, id) => {
      if (id === "p-2") throw new Error("gelato 404");
      return storeProduct({ id });
    });
    const { loadCatalog } = await loadModule();
    expect((await loadCatalog()).map((p) => p.id)).toEqual([numericId("p-1")]);
  });

  it("serves the last good catalog when a refresh fails", async () => {
    serveProducts("p-1");
    const { loadCatalog } = await loadModule();
    const first = await loadCatalog();

    vi.setSystemTime(T0 + 11 * 60 * 1000);
    h.listStoreProducts.mockRejectedValue(new Error("gelato 503"));
    expect(await loadCatalog()).toEqual(first);
    expect(h.listStoreProducts).toHaveBeenCalledTimes(2);
  });

  it("serves the last good catalog when every product fails to load", async () => {
    serveProducts("p-1");
    const { loadCatalog } = await loadModule();
    const first = await loadCatalog();

    vi.setSystemTime(T0 + 11 * 60 * 1000);
    h.getStoreProduct.mockRejectedValue(new Error("gelato 429"));
    expect(await loadCatalog()).toEqual(first);
  });

  it("waits before retrying after a failure with no catalog yet", async () => {
    h.listStoreProducts.mockRejectedValue(new Error("gelato 503"));
    const { loadCatalog } = await loadModule();
    await expect(loadCatalog()).rejects.toThrow("gelato 503");
    await expect(loadCatalog()).rejects.toThrow("gelato 503");
    expect(h.listStoreProducts).toHaveBeenCalledTimes(1);

    vi.setSystemTime(T0 + 31 * 1000);
    serveProducts("p-1");
    expect(await loadCatalog()).toHaveLength(1);
    expect(h.listStoreProducts).toHaveBeenCalledTimes(2);
  });
});
