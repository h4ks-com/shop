export type ImageWithAppearance = { url: string; appearanceName?: string };

// Keep images that match the selected appearance, plus any with no appearance
// (universal shots like a logo or a print-only render). If the filter would
// hide every image, fall back to showing everything so the page never goes
// imageless.
export function filterImagesByAppearance<T extends ImageWithAppearance>(
  images: T[],
  appearance: string | undefined,
): T[] {
  if (!appearance) return images;
  const matched = images.filter((i) => !i.appearanceName || i.appearanceName === appearance);
  return matched.length > 0 ? matched : images;
}
