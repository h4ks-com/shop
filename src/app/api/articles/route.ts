import { NextResponse } from "next/server";
import { listProducts, lowestPriceCents, productImagePath } from "@/lib/catalog";

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
  const all = await listProducts();
  const items = all.slice(offset, offset + limit).map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    previewImage: productImagePath(p),
    priceFrom: lowestPriceCents(p) / 100,
  }));
  return NextResponse.json({ items, count: all.length });
}
