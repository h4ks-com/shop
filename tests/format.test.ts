import { describe, it, expect } from "vitest";
import { formatPrice } from "@/lib/format";

describe("formatPrice", () => {
  it("formats EUR as €", () => {
    expect(formatPrice(15, "EUR")).toBe("€15.00");
  });
  it("formats USD as $", () => {
    expect(formatPrice(15, "USD")).toBe("$15.00");
  });
  it("formats GBP as £", () => {
    expect(formatPrice(15, "GBP")).toBe("£15.00");
  });
  it("includes the currency code and amount for unknown codes (whitespace tolerant)", () => {
    // Intl uses U+00A0 / U+202F as separators on some runtimes; match either.
    expect(formatPrice(15, "XYZ").replace(/\s+/g, " ")).toBe("XYZ 15.00");
  });
  it("renders two decimals for whole numbers", () => {
    expect(formatPrice(7, "EUR")).toBe("€7.00");
  });
});
