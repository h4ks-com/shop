"use client";

// Thin client wrapper around next/dynamic — Next.js 15 disallows ssr:false in
// Server Components, so the dynamic import has to live inside a client boundary.
// Bonus: three.js stays in its own chunk and is only fetched when a cameo is
// configured for the page, never on product pages without one.
import nextDynamic from "next/dynamic";
import type { Cameo } from "@/lib/cameos";

const CameoStage = nextDynamic(() => import("./Cameo"), {
  ssr: false,
  loading: () => null,
});

export default function CameoMount({ cameo }: { cameo: Cameo }) {
  return <CameoStage cameo={cameo} />;
}
