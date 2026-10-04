import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct, storefrontVariants } from "@/lib/catalog";
import { SHOP_CURRENCY } from "@/lib/config";
import { getCameo } from "@/lib/cameos";
import ProductView from "./ProductView";
import CameoMount from "./CameoMount";
import type { GalleryImage } from "./Gallery";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const productId = Number(id);
  if (!Number.isFinite(productId)) notFound();

  const product = await getProduct(productId);
  if (!product) notFound();

  const variants = storefrontVariants(product);

  const images: GalleryImage[] = product.images.map((i) => ({
    url: i.url,
    appearanceName: i.color,
    alt: `${product.title} ${i.color}`,
  }));

  const cameo = getCameo(product.title);

  return (
    <>
      <Link href="/" className="mono text-xs text-text-dim hover:text-accent">
        ← back
      </Link>

      <ProductView
        articleId={product.id}
        title={product.title}
        description={product.description}
        images={images}
        variants={variants}
        currency={SHOP_CURRENCY}
      />

      {cameo && <CameoMount cameo={cameo} />}
    </>
  );
}
