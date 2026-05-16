"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

export type GalleryImage = {
  url: string;
  alt?: string;
};

const ZOOM = 2.5;

export default function Gallery({ images, title }: { images: GalleryImage[]; title: string }) {
  const [idx, setIdx] = useState(0);
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

  if (images.length === 0) {
    return (
      <div className="bg-[color:var(--bg-panel)] border border-[color:var(--border)] aspect-square flex items-center justify-center">
        <span className="mono text-text-dim">no image</span>
      </div>
    );
  }

  const active = images[Math.min(idx, images.length - 1)];

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
