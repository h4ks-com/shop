import { NextResponse } from "next/server";
import { getArticle, customerPriceAmount } from "@/lib/spreadconnect";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const articleId = Number(id);
  // Spreadconnect articleIds are always positive integers. Reject anything
  // else up-front so we don't waste an upstream call and don't surface
  // upstream's error body (which leaks internal paths and reference UUIDs).
  if (!Number.isSafeInteger(articleId) || articleId <= 0) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }
  try {
    const a = await getArticle(articleId);
    return NextResponse.json({
      id: a.id,
      title: a.title,
      description: a.description,
      images:
        a.images?.map((i) => ({
          id: i.id,
          appearanceId: i.appearanceId,
          appearanceName: i.appearanceName,
          perspective: i.perspective,
          imageUrl: i.imageUrl,
        })) ?? [],
      variants: a.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        sizeName: v.sizeName,
        appearanceName: v.appearanceName,
        appearanceColorValue: v.appearanceColorValue,
        price: customerPriceAmount(v),
        stock: v.stock ?? 0,
      })),
    });
  } catch (err) {
    // Log the upstream detail, but don't echo it: spreadconnect error bodies
    // contain internal paths and per-request reference UUIDs.
    console.error(`articles/${articleId} upstream failed:`, err);
    return NextResponse.json({ error: "catalog lookup failed" }, { status: 502 });
  }
}
