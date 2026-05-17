"use client";

import { useCart } from "@/lib/use-cart";
import { openCart } from "./CartDrawer";

export default function CartHeaderLink() {
  const { count, hydrated } = useCart();
  const filled = hydrated && count > 0;
  return (
    <button
      type="button"
      onClick={() => openCart()}
      aria-label={filled ? `open cart, ${count} items` : "open cart"}
      className={
        filled
          ? "mono text-sm font-bold text-accent2 hover:opacity-80"
          : "mono text-xs text-text-dim hover:text-accent"
      }
    >
      {filled ? `[ cart: ${count} ]` : "[ cart ]"}
    </button>
  );
}
