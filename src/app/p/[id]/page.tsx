import Link from "next/link";
import { notFound } from "next/navigation";
import { getArticle, customerPriceAmount } from "@/lib/spreadconnect";
import { SHOP_CURRENCY } from "@/lib/config";
import { getCameo } from "@/lib/cameos";
import ProductView from "./ProductView";
import CameoMount from "./CameoMount";
import type { GalleryImage } from "./Gallery";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const articleId = Number(id);
  if (!Number.isFinite(articleId)) notFound();

  let article;
  try {
    article = await getArticle(articleId);
  } catch {
    notFound();
  }
  if (!article) notFound();

  const variants = article.variants.map((v) => ({
    sku: v.sku,
    sizeName: v.sizeName,
    appearanceName: v.appearanceName,
    appearanceColorValue: v.appearanceColorValue,
    price: customerPriceAmount(v),
    stock: v.stock ?? 0,
  }));

  // FRONT view goes first, then everything else in API order, deduped by url.
  // appearanceName carries through so the gallery can filter by selected color.
  const images: GalleryImage[] = (() => {
    const seen = new Set<string>();
    const out: GalleryImage[] = [];
    const push = (url: string | undefined, appearanceName?: string) => {
      if (!url || seen.has(url)) return;
      seen.add(url);
      out.push({ url, alt: appearanceName, appearanceName });
    };
    const front = article.images?.find((i) => i.perspective === "FRONT");
    if (front) push(front.imageUrl, front.appearanceName);
    for (const img of article.images || []) {
      push(img.imageUrl, img.appearanceName);
    }
    return out;
  })();

  const cameo = getCameo(article.id);

  return (
    <>
      <Link href="/" className="mono text-xs text-text-dim hover:text-accent">
        ← back
      </Link>

      <ProductView
        articleId={article.id}
        title={article.title}
        description={article.description}
        images={images}
        variants={variants}
        currency={SHOP_CURRENCY}
      />

      {cameo && <CameoMount cameo={cameo} />}
    </>
  );
}
