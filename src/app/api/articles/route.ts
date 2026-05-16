import { NextResponse } from "next/server";
import { listArticles, customerPriceAmount } from "@/lib/spreadconnect";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);
  const offset = Math.max(Number(url.searchParams.get("offset") || 0), 0);
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 502 },
    );
  }
}
