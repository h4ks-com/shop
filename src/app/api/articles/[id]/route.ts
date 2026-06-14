import { NextResponse } from "next/server";
import { getProduct, productImagePath, storefrontVariants } from "@/lib/catalog";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const productId = Number(id);
  if (!Number.isSafeInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }
  const p = getProduct(productId);
  if (!p || p.needsArtwork || p.variants.length === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const imgPath = productImagePath(p);
  return NextResponse.json({
    id: p.id,
    title: p.title,
    description: p.description,
    images: imgPath ? [{ appearanceName: p.color, perspective: "FRONT", imageUrl: imgPath }] : [],
    variants: storefrontVariants(p),
  });
}
