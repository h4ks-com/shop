import { describe, it, expect } from "vitest";
import { filterImagesByAppearance } from "@/lib/gallery-filter";

const img = (url: string, appearanceName?: string) => ({ url, appearanceName });

describe("filterImagesByAppearance", () => {
  it("returns all images when no appearance is selected", () => {
    const all = [img("a", "white"), img("b", "black")];
    expect(filterImagesByAppearance(all, undefined)).toEqual(all);
  });

  it("returns only images matching the selected appearance", () => {
    const all = [
      img("a", "white/yellow"),
      img("b", "white/yellow"),
      img("c", "white/cobalt blue"),
      img("d", "white/light blue"),
    ];
    expect(filterImagesByAppearance(all, "white/yellow")).toEqual([
      img("a", "white/yellow"),
      img("b", "white/yellow"),
    ]);
  });

  it("falls back to all images if filter yields zero matches", () => {
    const all = [img("a", "white"), img("b", "black")];
    expect(filterImagesByAppearance(all, "nonexistent")).toEqual(all);
  });

  it("includes images that have no appearance tag (treated as universal)", () => {
    const all = [img("logo", undefined), img("white-1", "white"), img("black-1", "black")];
    expect(filterImagesByAppearance(all, "white")).toEqual([
      img("logo", undefined),
      img("white-1", "white"),
    ]);
  });

  it("handles empty input safely", () => {
    expect(filterImagesByAppearance([], "white")).toEqual([]);
  });
});
