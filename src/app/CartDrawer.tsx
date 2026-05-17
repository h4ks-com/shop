"use client";

import { useEffect, useState } from "react";
import { useCart } from "@/lib/use-cart";
import { CART_MAX_ITEMS } from "@/lib/cart-config";
import { formatPrice } from "@/lib/format";

const OPEN_EVENT = "h4ks-cart-open";

export function openCart(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

export default function CartDrawer({ currency }: { currency: string }) {
  const { items, count, subtotal, setQty, remove, hydrated } = useCart();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function checkout() {
    if (items.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ articleId: i.articleId, sku: i.sku, quantity: i.quantity })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "checkout failed");
      window.location.assign(data.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "unknown");
      setBusy(false);
    }
  }

  if (!hydrated || !open) return null;

  return (
    <>
      <div
        onClick={() => setOpen(false)}
        className="fixed inset-0 z-40 bg-black/60"
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="shopping cart"
        className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-96 bg-[color:var(--bg-panel)] border-l border-[color:var(--border)] flex flex-col"
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-[color:var(--border)]">
          <div className="mono text-sm">
            <span className="text-accent">[ cart ]</span>{" "}
            <span className="text-text-dim">
              {count} / {CART_MAX_ITEMS} items
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="close cart"
            className="mono text-text-dim hover:text-accent text-lg leading-none px-2"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <p className="mono text-sm text-text-dim">your cart is empty.</p>
          ) : (
            items.map((i) => (
              <div
                key={i.sku}
                className="mb-4 pb-4 border-b border-[color:var(--border)] last:border-b-0"
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <div className="mono text-sm text-text truncate">{i.productName}</div>
                    <div className="mono text-xs text-text-dim mt-0.5">
                      {i.appearanceName} · {i.sizeName}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(i.sku)}
                    aria-label={`remove ${i.productName}`}
                    className="mono text-xs text-text-dim hover:text-accent2 shrink-0"
                  >
                    × remove
                  </button>
                </div>
                <div className="flex justify-between items-center mt-2 mono text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQty(i.sku, i.quantity - 1)}
                      aria-label={`decrease ${i.productName}`}
                      className="border border-[color:var(--border)] w-6 h-6 hover:border-accent hover:text-accent"
                    >
                      −
                    </button>
                    <span className="w-4 text-center">{i.quantity}</span>
                    <button
                      type="button"
                      onClick={() => setQty(i.sku, i.quantity + 1)}
                      disabled={count >= CART_MAX_ITEMS}
                      aria-label={`increase ${i.productName}`}
                      className="border border-[color:var(--border)] w-6 h-6 hover:border-accent hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-accent2">
                    {formatPrice(i.price * i.quantity, currency)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <footer className="px-5 py-4 border-t border-[color:var(--border)]">
            <div className="flex justify-between mono text-sm mb-1">
              <span className="text-text-dim">subtotal</span>
              <span className="text-text">{formatPrice(subtotal, currency)}</span>
            </div>
            <div className="mono text-xs text-text-dim mb-4">free shipping worldwide</div>
            <button
              type="button"
              onClick={checkout}
              disabled={busy}
              className="btn btn-orange w-full"
            >
              {busy ? "redirecting to stripe..." : "checkout →"}
            </button>
            {err && <div className="mt-3 mono text-xs text-accent2">error: {err}</div>}
          </footer>
        )}
      </aside>
    </>
  );
}
