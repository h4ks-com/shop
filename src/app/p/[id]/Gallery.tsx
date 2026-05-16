"use client";

import Image from "next/image";
import { useState } from "react";

export type GalleryImage = {
  url: string;
  alt?: string;
};

export default function Gallery({ images, title }: { images: GalleryImage[]; title: string }) {
  const [idx, setIdx] = useState(0);
  if (images.length === 0) {
    return (
      <div className="bg-[color:var(--bg-panel)] border border-[color:var(--border)] aspect-square flex items-center justify-center">
        <span className="mono text-text-dim">no image</span>
      </div>
    );
  }
  const active = images[Math.min(idx, images.length - 1)];
  return (
    <div>
      <div className="bg-[color:var(--bg-panel)] border border-[color:var(--border)] aspect-square flex items-center justify-center overflow-hidden">
        <Image
          src={active.url}
          alt={active.alt || title}
          width={800}
          height={800}
          className="object-contain w-full h-full"
          unoptimized
        />
      </div>
      {images.length > 1 && (
        <div className="grid grid-cols-5 gap-2 mt-3">
          {images.map((img, i) => (
            <button
              key={img.url}
              type="button"
              onClick={() => setIdx(i)}
              className={`bg-[color:var(--bg-panel)] border aspect-square flex items-center justify-center overflow-hidden ${
                i === idx
                  ? "border-accent"
                  : "border-[color:var(--border)] opacity-60 hover:opacity-100"
              }`}
            >
              <Image
                src={img.url}
                alt={img.alt || `${title} ${i + 1}`}
                width={160}
                height={160}
                className="object-contain w-full h-full"
                unoptimized
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
