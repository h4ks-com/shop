// Per-article 3D mascot overlay. Add an entry to give a product page a small
// animated character pinned to the bottom-right corner. Entries are optional —
// articles without one render no 3D content and pay no bundle cost.

export type Cameo = {
  // Path under /public to a .glb file with one or more animation clips.
  glbUrl: string;
  // Cycle bounds (ms) between random animation swaps. Defaults: 8000–14000.
  minDurationMs?: number;
  maxDurationMs?: number;
  // Initial camera. Defaults: position [0, 1, 3], fov 35.
  cameraPosition?: [number, number, number];
  cameraFov?: number;
  // Wrapper size in px. Defaults: 300 × 400.
  widthPx?: number;
  heightPx?: number;
  // If set, clicking the character opens this URL in a new tab.
  href?: string;
};

export const CAMEOS: Record<number, Cameo> = {
  3405725: {
    glbUrl: "/cameo/3405725.glb",
    href: "https://party.h4ks.com/",
  },
};

export function getCameo(articleId: number): Cameo | undefined {
  return CAMEOS[articleId];
}
