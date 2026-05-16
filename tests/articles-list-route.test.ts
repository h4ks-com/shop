import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  listArticles: vi.fn<(limit: number, offset: number) => Promise<unknown>>(),
  customerPriceAmount: vi.fn(() => 9.99),
}));

vi.mock("@/lib/spreadconnect", () => ({
  listArticles: h.listArticles,
  customerPriceAmount: h.customerPriceAmount,
}));

async function loadRoute() {
  vi.resetModules();
  return await import("@/app/api/articles/route");
}

const get = (qs = "") => new Request(`http://x/api/articles${qs}`);

beforeEach(() => {
  h.listArticles.mockReset();
  h.listArticles.mockResolvedValue({ items: [], count: 0 });
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
  ])("rejects %s without calling upstream", async (qs, status) => {
    const { GET } = await loadRoute();
    const res = await GET(get(qs));
    expect(res.status).toBe(status);
    expect(h.listArticles).not.toHaveBeenCalled();
  });

  it("clamps limit > 100 to 100 (silently)", async () => {
    const { GET } = await loadRoute();
    const res = await GET(get("?limit=99999"));
    expect(res.status).toBe(200);
    expect(h.listArticles).toHaveBeenCalledWith(100, 0);
  });

  it("accepts valid limit + offset", async () => {
    const { GET } = await loadRoute();
    const res = await GET(get("?limit=15&offset=30"));
    expect(res.status).toBe(200);
    expect(h.listArticles).toHaveBeenCalledWith(15, 30);
  });

  it("defaults to limit=50 offset=0 when missing", async () => {
    const { GET } = await loadRoute();
    const res = await GET(get(""));
    expect(res.status).toBe(200);
    expect(h.listArticles).toHaveBeenCalledWith(50, 0);
  });
});

describe("GET /api/articles — error masking", () => {
  it("does NOT leak spreadconnect URL paths or reference UUIDs on 502", async () => {
    h.listArticles.mockRejectedValue(
      new Error(
        'spreadconnect GET /articles?limit=50&offset=0: 500 {"path":"/fulfillment/rest/api/articles","reference":"8db3fa2c-5499-4d55-bc31-a3403f4cb480"}',
      ),
    );
    const { GET } = await loadRoute();
    const res = await GET(get());
    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body).not.toContain("spreadconnect");
    expect(body).not.toContain("/fulfillment");
    expect(body).not.toContain("8db3fa2c");
  });
});
