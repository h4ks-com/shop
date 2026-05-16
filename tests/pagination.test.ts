import { describe, it, expect } from "vitest";
import { parsePage, pageWindow, PAGE_SIZE } from "@/lib/pagination";

describe("parsePage", () => {
  it("defaults to 1 when missing", () => {
    expect(parsePage(undefined)).toBe(1);
  });
  it("clamps non-positive / decimal / garbage to 1", () => {
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-1")).toBe(1);
    expect(parsePage("1.5")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage("null")).toBe(1);
    expect(parsePage("999999999999999999999")).toBe(1);
  });
  it("accepts a positive integer", () => {
    expect(parsePage("3")).toBe(3);
  });
  it("accepts string[] (Next searchParams quirk) by taking the first valid", () => {
    expect(parsePage(["2", "9"])).toBe(2);
  });
});

describe("pageWindow", () => {
  it("computes offset, totalPages, has-prev/next correctly", () => {
    const w = pageWindow({ page: 1, total: 42 });
    expect(w.offset).toBe(0);
    expect(w.totalPages).toBe(Math.ceil(42 / PAGE_SIZE));
    expect(w.hasPrev).toBe(false);
    expect(w.hasNext).toBe(w.totalPages > 1);
  });
  it("clamps page over totalPages to last page", () => {
    const w = pageWindow({ page: 99, total: 17 });
    expect(w.page).toBe(2); // 17 items, PAGE_SIZE=15 → 2 pages
    expect(w.hasNext).toBe(false);
    expect(w.hasPrev).toBe(true);
  });
  it("handles zero items", () => {
    const w = pageWindow({ page: 1, total: 0 });
    expect(w.totalPages).toBe(1);
    expect(w.hasPrev).toBe(false);
    expect(w.hasNext).toBe(false);
  });
  it("hides pagination when total <= PAGE_SIZE", () => {
    const w = pageWindow({ page: 1, total: PAGE_SIZE });
    expect(w.totalPages).toBe(1);
    expect(w.hasNext).toBe(false);
  });
});
