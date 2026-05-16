import Link from "next/link";
import { notFound } from "next/navigation";
import { getArticle, customerPriceAmount } from "@/lib/spreadconnect";
import BuyForm from "./BuyForm";
import Gallery, { type GalleryImage } from "./Gallery";

export const dynamic = "force-dynamic";

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
  const images: GalleryImage[] = (() => {
    const seen = new Set<string>();
    const out: GalleryImage[] = [];
    const push = (url: string | undefined, alt?: string) => {
      if (!url || seen.has(url)) return;
      seen.add(url);
      out.push({ url, alt });
    };
    const front = article.images?.find((i) => i.perspective === "FRONT");
    if (front) push(front.imageUrl, front.appearanceName);
    for (const img of article.images || []) {
      push(img.imageUrl, img.appearanceName);
    }
    return out;
  })();

  return (
    <>
      <Link href="/" className="mono text-xs text-text-dim hover:text-accent">
        ← back
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
        <Gallery images={images} title={article.title} />

        <div>
          <div className="section-label">[ product ]</div>
          <h1 className="mono text-2xl mb-3">{article.title}</h1>
          {article.description && (
            <div
              className="text-text-mid mb-6 [&_ul]:list-disc [&_ul]:ml-5 [&_ul]:mt-2 [&_li]:mb-1"
              dangerouslySetInnerHTML={{ __html: article.description }}
            />
          )}

          <BuyForm articleId={article.id} variants={variants} />
        </div>
      </div>
    </>
  );
}
