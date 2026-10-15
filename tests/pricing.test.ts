import { describe, it, expect } from "vitest";
import { retailPrice } from "@/lib/pricing";

describe("retailPrice", () => {
  it("keeps the margin over cost and rounds up to x.90", () => {
    expect(retailPrice(37.7, 0.4)).toBe(62.9);
    expect(retailPrice(6, 0.4)).toBe(10.9);
    expect(retailPrice(5.34, 0.4)).toBe(8.9);
    expect(retailPrice(5.35, 0.4)).toBe(9.9);
    expect(retailPrice(4.8, 0.4)).toBe(8.9);
  });

  it("never prices below cost plus margin", () => {
    for (let cents = 100; cents < 10000; cents += 7) {
      const cost = cents / 100;
      const price = retailPrice(cost, 0.4);
      expect(price * 0.6).toBeGreaterThanOrEqual(cost - 0.005);
      expect(Math.round(price * 100) % 100).toBe(90);
      expect(price - 1).toBeLessThan(cost / 0.6);
    }
  });
});
