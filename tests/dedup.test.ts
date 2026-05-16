import { describe, it, expect, vi, afterEach } from "vitest";
import { makeDedup } from "@/lib/dedup";

afterEach(() => {
  vi.useRealTimers();
});

describe("makeDedup", () => {
  it("claim returns true the first time, false on repeat", () => {
    const seen = makeDedup(1000);
    expect(seen.claim("a")).toBe(true);
    expect(seen.claim("a")).toBe(false);
  });

  it("forget releases a claim so it can be re-claimed", () => {
    const seen = makeDedup(1000);
    seen.claim("a");
    expect(seen.claim("a")).toBe(false);
    seen.forget("a");
    expect(seen.claim("a")).toBe(true);
  });

  it("claim entries expire after ttl", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
    const seen = makeDedup(1000);
    seen.claim("a");
    expect(seen.claim("a")).toBe(false);
    vi.setSystemTime(new Date("2025-01-01T00:00:01.001Z"));
    expect(seen.claim("a")).toBe(true);
  });

  it("forget is a no-op for unknown keys", () => {
    const seen = makeDedup(1000);
    expect(() => seen.forget("never-seen")).not.toThrow();
  });

  it("distinct keys do not collide", () => {
    const seen = makeDedup(1000);
    expect(seen.claim("a")).toBe(true);
    expect(seen.claim("b")).toBe(true);
    expect(seen.claim("a")).toBe(false);
    expect(seen.claim("b")).toBe(false);
  });
});
