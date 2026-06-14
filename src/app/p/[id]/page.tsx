import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct, productImagePath, storefrontVariants } from "@/lib/catalog";
import { SHOP_CURRENCY } from "@/lib/config";
import { getCameo } from "@/lib/cameos";
import ProductView from "./ProductView";
import CameoMount from "./CameoMount";
import type { GalleryImage } from "./Gallery";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const productId = Number(id);
  if (!Number.isFinite(productId)) notFound();

  const product = getProduct(productId);
  // Hide products that have no artwork yet or no buyable variants.
  if (!product || product.needsArtwork || product.variants.length === 0) notFound();

  const variants = storefrontVariants(product);

  const imgPath = productImagePath(product);
  const images: GalleryImage[] = imgPath
    ? [{ url: imgPath, alt: product.title, appearanceName: product.color }]
    : [];

  const cameo = getCameo(product.id);

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
