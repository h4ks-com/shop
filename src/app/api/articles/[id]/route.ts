import { NextResponse } from "next/server";
import { getProduct, storefrontVariants } from "@/lib/catalog";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const productId = Number(id);
  if (!Number.isSafeInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }
  const p = await getProduct(productId);
  if (!p) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({
    id: p.id,
    title: p.title,
    description: p.description,
    images: p.images.map((i) => ({
      appearanceName: i.color,
      perspective: "FRONT",
      imageUrl: i.url,
    })),
    variants: storefrontVariants(p),
  });
}
