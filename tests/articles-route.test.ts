import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  getArticle: vi.fn<(id: number) => Promise<unknown>>(),
  customerPriceAmount: vi.fn(() => 9.99),
}));

vi.mock("@/lib/spreadconnect", () => ({
  getArticle: h.getArticle,
  customerPriceAmount: h.customerPriceAmount,
}));

async function loadRoute() {
  vi.resetModules();
  return await import("@/app/api/articles/[id]/route");
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  h.getArticle.mockReset();
});

describe("GET /api/articles/[id] — id validation", () => {
  it.each(["abc", "1.5", "-1", "0", "Infinity", "1e308", "true", "null"])(
    "rejects %s without calling upstream",
    async (id) => {
      const { GET } = await loadRoute();
      const res = await GET(new Request("http://x/api/articles/" + id), params(id));
      expect(res.status).toBe(400);
      expect(h.getArticle).not.toHaveBeenCalled();
    },
  );

  it("accepts a positive integer id", async () => {
    h.getArticle.mockResolvedValue({
      id: 12404,
      title: "T",
      description: "",
      images: [],
      variants: [],
    });
    const { GET } = await loadRoute();
    const res = await GET(new Request("http://x/api/articles/12404"), params("12404"));
    expect(res.status).toBe(200);
    expect(h.getArticle).toHaveBeenCalledWith(12404);
  });
});

describe("GET /api/articles/[id] — error masking", () => {
  it("does NOT leak spreadconnect error details when upstream fails", async () => {
    h.getArticle.mockRejectedValue(
      new Error(
        'spreadconnect GET /articles/12404: 500 {"path":"/fulfillment/rest/api/articles/12404"}',
      ),
    );
    const { GET } = await loadRoute();
    const res = await GET(new Request("http://x/api/articles/12404"), params("12404"));
    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body).not.toContain("spreadconnect");
    expect(body).not.toContain("/fulfillment");
  });
});
