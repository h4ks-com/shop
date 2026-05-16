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

beforeEach(() => {
  h.getArticle.mockReset();
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
  ])("rejects %s articleId without calling upstream", async (_label, articleId) => {
    const { POST } = await loadRoute();
    const res = await POST(post({ articleId, sku: "SKU-1" }));
    expect(res.status).toBe(400);
    expect(h.getArticle).not.toHaveBeenCalled();
  });

  it("accepts a stringified positive integer (common from form encoders)", async () => {
    h.getArticle.mockResolvedValue({
      title: "T",
      variants: [{ sku: "SKU-1", stock: 10, d2cPrice: 9.99, b2bPrice: 0 }],
    });
    const { POST } = await loadRoute();
    const res = await POST(post({ articleId: "12404", sku: "SKU-1" }));
    expect(res.status).toBe(200);
    expect(h.getArticle).toHaveBeenCalledWith(12404);
  });
});

describe("POST /api/checkout — upstream error masking", () => {
  it("does NOT leak spreadconnect error bodies, paths, or reference UUIDs", async () => {
    h.getArticle.mockRejectedValue(
      new Error(
        'spreadconnect GET /articles/12404: 500 {"status":500,"path":"/fulfillment/rest/api/articles/12404","reference":"e40175e0-2b10-4ca3-94ca-643fa1dcadb5"}',
      ),
    );
    const { POST } = await loadRoute();
    const res = await POST(post({ articleId: 12404, sku: "SKU-1" }));
    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body).not.toContain("spreadconnect");
    expect(body).not.toContain("/fulfillment/");
    expect(body).not.toContain("e40175e0");
    expect(body).not.toContain("500");
  });
});
