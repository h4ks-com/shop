import { describe, it, expect } from "vitest";
import { addItem, removeItem, setQty, totalQty, subtotal, canAdd } from "@/lib/cart-ops";
import { CART_MAX_ITEMS } from "@/lib/cart-config";

const item = (sku: string, quantity = 1, price = 10) => ({
  articleId: 1,
  sku,
  quantity,
  productName: "thing",
  appearanceName: "white",
  sizeName: "M",
  price,
  imageUrl: undefined,
});

describe("addItem", () => {
  it("adds a new sku to an empty cart", () => {
    expect(addItem([], item("A"))).toHaveLength(1);
  });

  it("increments quantity when the same sku is added again", () => {
    const c = addItem([item("A", 1)], item("A", 1));
    expect(c).toHaveLength(1);
    expect(c[0].quantity).toBe(2);
  });

  it("treats different skus as separate line items", () => {
    const c = addItem([item("A", 1)], item("B", 1));
    expect(c).toHaveLength(2);
  });

  it("caps total quantity at CART_MAX_ITEMS even when adding more", () => {
    const c = addItem([item("A", 4)], item("A", 5));
    expect(totalQty(c)).toBe(CART_MAX_ITEMS);
  });

  it("refuses to add a new sku that would push total over CART_MAX_ITEMS", () => {
    const start = [item("A", 5)];
    const after = addItem(start, item("B", 1));
    expect(after).toEqual(start); // unchanged
  });
});

describe("removeItem", () => {
  it("removes the matching sku", () => {
    const c = removeItem([item("A", 1), item("B", 1)], "A");
    expect(c).toEqual([item("B", 1)]);
  });

  it("is a no-op on unknown sku", () => {
    const start = [item("A", 1)];
    expect(removeItem(start, "Z")).toEqual(start);
  });
});

describe("setQty", () => {
  it("updates qty within cap", () => {
    const c = setQty([item("A", 1)], "A", 3);
    expect(c[0].quantity).toBe(3);
  });

  it("clamps qty to CART_MAX_ITEMS minus other items", () => {
    const c = setQty([item("A", 2), item("B", 1)], "B", 99);
    expect(c.find((x) => x.sku === "B")?.quantity).toBe(CART_MAX_ITEMS - 2);
    expect(totalQty(c)).toBe(CART_MAX_ITEMS);
  });

  it("removes the line when qty drops to 0", () => {
    const c = setQty([item("A", 1)], "A", 0);
    expect(c).toHaveLength(0);
  });

  it("refuses negative qty (clamps to 0 = removal)", () => {
    const c = setQty([item("A", 1)], "A", -5);
    expect(c).toHaveLength(0);
  });
});

describe("subtotal / totalQty / canAdd", () => {
  it("subtotal sums price * qty", () => {
    expect(subtotal([item("A", 2, 10), item("B", 1, 15)])).toBe(35);
  });
  it("totalQty sums quantities", () => {
    expect(totalQty([item("A", 2), item("B", 1)])).toBe(3);
  });
  it("canAdd returns true when capacity remains", () => {
    expect(canAdd([item("A", 2)], 1)).toBe(true);
  });
  it("canAdd returns false when adding would exceed cap", () => {
    expect(canAdd([item("A", 5)], 1)).toBe(false);
  });
});
