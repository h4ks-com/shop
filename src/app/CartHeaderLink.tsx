"use client";

import { useCart } from "@/lib/use-cart";
import { openCart } from "./CartDrawer";

export default function CartHeaderLink() {
  const { count, hydrated } = useCart();
  // Avoid SSR/client hydration mismatch — render an empty pill server-side and
  // let it fill in on hydrate. Width stays roughly constant.
  return (
    <button
      type="button"
      onClick={() => openCart()}
      className="mono text-xs text-text-dim hover:text-accent"
      aria-label="open cart"
    >
      {hydrated && count > 0 ? `[ cart: ${count} ]` : "[ cart ]"}
    </button>
  );
}
