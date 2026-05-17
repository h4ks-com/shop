"use client";

import { useState } from "react";
import BuyForm from "./BuyForm";
import Gallery, { type GalleryImage } from "./Gallery";

type Variant = {
  sku: string;
  sizeName: string;
  appearanceName: string;
  appearanceColorValue: string;
  price: number;
  stock: number;
};

export default function ProductView({
  articleId,
  title,
  description,
  images,
  variants,
  currency,
}: {
  articleId: number;
  title: string;
  description: string;
  images: GalleryImage[];
  variants: Variant[];
  currency: string;
}) {
  const firstInStockColor = variants.find((v) => v.stock > 0)?.appearanceName ?? "";
  const [color, setColor] = useState(firstInStockColor);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
      <Gallery images={images} title={title} activeAppearance={color} />

      <div>
        <div className="section-label">[ product ]</div>
        <h1 className="mono text-2xl mb-3">{title}</h1>
        {description && (
          <div
            className="text-text-mid mb-6 [&_ul]:list-disc [&_ul]:ml-5 [&_ul]:mt-2 [&_li]:mb-1"
            dangerouslySetInnerHTML={{ __html: description }}
          />
        )}

        <BuyForm
          articleId={articleId}
          variants={variants}
          color={color}
          onColorChange={setColor}
          currency={currency}
        />
      </div>
    </div>
  );
}
