"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { filterImagesByAppearance } from "@/lib/gallery-filter";

export type GalleryImage = {
  url: string;
  alt?: string;
  appearanceName?: string;
};

const ZOOM = 2.5;

export default function Gallery({
  images,
  title,
  activeAppearance,
}: {
  images: GalleryImage[];
  title: string;
  activeAppearance?: string;
}) {
  const visible = useMemo(
    () => filterImagesByAppearance(images, activeAppearance),
    [images, activeAppearance],
  );

  // Track selection by url instead of index so a color switch (which changes
  // the visible set) automatically falls back to the first image when the
  // previously-selected url is no longer in view — no setState-in-effect needed.
  const [selectedUrl, setSelectedUrl] = useState<string | undefined>(undefined);
  const [hover, setHover] = useState(false);
  const [origin, setOrigin] = useState("50% 50%");
  const [lightbox, setLightbox] = useState(false);
  const heroRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setLightbox(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  if (visible.length === 0) {
    return (
      <div className="bg-[color:var(--bg-panel)] border border-[color:var(--border)] aspect-square flex items-center justify-center">
        <span className="mono text-text-dim">no image</span>
      </div>
    );
  }

  const idx = Math.max(
    0,
    visible.findIndex((v) => v.url === selectedUrl),
  );
  const active = visible[idx];

  const onMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = heroRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    setOrigin(`${x}% ${y}%`);
  };

  return (
    <div>
      <button
        type="button"
        ref={heroRef}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onMouseMove={onMove}
        onClick={() => setLightbox(true)}
        aria-label={`zoom ${active.alt || title}`}
        className="block w-full bg-[color:var(--bg-panel)] border border-[color:var(--border)] aspect-square overflow-hidden cursor-zoom-in"
      >
        <Image
          src={active.url}
          alt={active.alt || title}
          width={800}
          height={800}
          unoptimized
          className="object-contain w-full h-full transition-transform duration-100 ease-out pointer-events-none"
          style={{
            transform: hover ? `scale(${ZOOM})` : "scale(1)",
            transformOrigin: origin,
          }}
        />
      </button>

      {visible.length > 1 && (
        <div className="grid grid-cols-5 gap-2 mt-3">
          {visible.map((img, i) => (
            <button
              key={img.url}
              type="button"
              onClick={() => setSelectedUrl(img.url)}
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

      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={active.alt || title}
          onClick={() => setLightbox(false)}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <Image
            src={active.url}
            alt={active.alt || title}
            width={1600}
            height={1600}
            unoptimized
            className="object-contain max-w-full max-h-full"
          />
        </div>
      )}
    </div>
  );
}
