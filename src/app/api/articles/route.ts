import { NextResponse } from "next/server";
import { listArticles, customerPriceAmount } from "@/lib/spreadconnect";

// Returns the parsed value, or null if the param was supplied but invalid.
function intParam(raw: string | null, fallback: number, min: number): number | null {
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < min) return null;
  return n;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limitRaw = intParam(url.searchParams.get("limit"), 50, 1);
  const offset = intParam(url.searchParams.get("offset"), 0, 0);
  if (limitRaw === null || offset === null) {
    return NextResponse.json({ error: "bad limit/offset" }, { status: 400 });
  }
  const limit = Math.min(limitRaw, 100);
  try {
    const data = await listArticles(limit, offset);
    const items = data.items.map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      previewImage:
        a.images?.find((i) => i.perspective === "FRONT")?.imageUrl ||
        a.images?.[0]?.imageUrl ||
        null,
      priceFrom: a.variants.length ? Math.min(...a.variants.map(customerPriceAmount)) : null,
    }));
    return NextResponse.json({ items, count: data.count });
  } catch (err) {
    console.error(`articles list upstream failed:`, err);
    return NextResponse.json({ error: "catalog lookup failed" }, { status: 502 });
  }
}
