"use client";

import { useMemo, useState } from "react";

type Variant = {
  sku: string;
  sizeName: string;
  appearanceName: string;
  appearanceColorValue: string;
  price: number;
  stock: number;
};

export default function BuyForm({
  articleId,
  variants,
}: {
  articleId: number;
  variants: Variant[];
}) {
  // Drop colors whose every variant is out of stock.
  const colors = useMemo(() => {
    const seen = new Map<string, { name: string; value: string }>();
    for (const v of variants) {
      if (v.stock <= 0) continue;
      if (!seen.has(v.appearanceName))
        seen.set(v.appearanceName, {
          name: v.appearanceName,
          value: v.appearanceColorValue,
        });
    }
    return Array.from(seen.values());
  }, [variants]);

  const [color, setColor] = useState(colors[0]?.name ?? "");
  const sizesForColor = variants.filter((v) => v.appearanceName === color);
  const firstInStock = sizesForColor.find((v) => v.stock > 0)?.sizeName ?? "";
  const [size, setSize] = useState(firstInStock);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selected = variants.find((v) => v.appearanceName === color && v.sizeName === size);

  async function buy() {
    if (!selected) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleId,
          sku: selected.sku,
          quantity: 1,
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        throw new Error("out of stock — pick another size");
      }
      if (!res.ok || !data.url) {
        throw new Error(data.error || "checkout failed");
      }
      window.location.assign(data.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "unknown");
      setBusy(false);
    }
  }

  if (colors.length === 0) {
    return <div className="mono text-sm text-accent2">sold out — check back later</div>;
  }

  return (
    <div>
      <div className="mb-5">
        <div className="section-label">[ color ]</div>
        <div className="flex flex-wrap gap-2">
          {colors.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => {
                setColor(c.name);
                const next = variants.find((v) => v.appearanceName === c.name && v.stock > 0);
                if (next) setSize(next.sizeName);
              }}
              className={`mono text-xs px-3 py-1.5 border ${
                color === c.name
                  ? "border-accent text-accent"
                  : "border-[color:var(--border)] text-text-dim"
              }`}
              style={c.value ? { borderLeft: `4px solid #${c.value.replace("#", "")}` } : undefined}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <div className="section-label">[ size ]</div>
        <div className="flex flex-wrap gap-2">
          {sizesForColor.map((v) => {
            const oos = v.stock <= 0;
            return (
              <button
                key={v.sku}
                type="button"
                disabled={oos}
                onClick={() => setSize(v.sizeName)}
                title={oos ? "out of stock" : undefined}
                className={`mono text-xs px-3 py-1.5 border ${
                  oos
                    ? "border-[color:var(--border)] text-text-dim opacity-40 line-through cursor-not-allowed"
                    : size === v.sizeName
                      ? "border-accent text-accent"
                      : "border-[color:var(--border)] text-text-dim"
                }`}
              >
                {v.sizeName}
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="mono text-xl text-accent2 mb-5">${selected.price.toFixed(2)}</div>
      )}

      <button type="button" className="btn btn-orange" disabled={!selected || busy} onClick={buy}>
        {busy ? "redirecting to stripe..." : "buy →"}
      </button>

      {err && <div className="mt-4 mono text-xs text-accent2">error: {err}</div>}

      <p className="mt-6 mono text-xs text-text-dim">
        secure payment via stripe. ships worldwide via spreadshirt. shipping added at checkout.
      </p>
    </div>
  );
}
