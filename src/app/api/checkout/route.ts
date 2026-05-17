import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getArticle, customerPriceAmount } from "@/lib/spreadconnect";
import { createCheckoutSession, type Line } from "@/lib/stripe";
import { CART_MAX_ITEMS } from "@/lib/cart-config";

type CartItemInput = { articleId: unknown; sku: unknown; quantity?: unknown };
type Body =
  | { items: unknown }
  | { articleId: unknown; sku: unknown; quantity?: unknown; email?: unknown };

function parseItem(
  raw: CartItemInput,
): { articleId: number; sku: string; quantity: number } | null {
  const rawId = raw.articleId;
  const articleId = typeof rawId === "number" || typeof rawId === "string" ? Number(rawId) : NaN;
  const sku = typeof raw.sku === "string" ? raw.sku : "";
  if (!Number.isSafeInteger(articleId) || articleId <= 0 || !sku) return null;
  const quantity = Math.min(Math.max(Number(raw.quantity ?? 1) || 1, 1), CART_MAX_ITEMS);
  return { articleId, sku, quantity };
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  // Normalize single-item shape to a 1-element items array (SSH client still
  // uses the legacy shape; both go through the same path from here on).
  const rawItems: CartItemInput[] =
    "items" in body && Array.isArray(body.items)
      ? (body.items as CartItemInput[])
      : [
          {
            articleId: (body as Record<string, unknown>).articleId,
            sku: (body as Record<string, unknown>).sku,
            quantity: (body as Record<string, unknown>).quantity,
          },
        ];

  if (rawItems.length === 0) {
    return NextResponse.json({ error: "cart is empty" }, { status: 400 });
  }

  const items: { articleId: number; sku: string; quantity: number }[] = [];
  for (const raw of rawItems) {
    const parsed = parseItem(raw);
    if (!parsed) {
      return NextResponse.json({ error: "articleId and sku required" }, { status: 400 });
    }
    items.push(parsed);
  }

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  if (totalQty > CART_MAX_ITEMS) {
    return NextResponse.json(
      { error: `cart exceeds max of ${CART_MAX_ITEMS} items` },
      { status: 400 },
    );
  }

  const lines: Line[] = [];
  try {
    // Fetch each unique articleId once even if multiple SKUs share it.
    const articleCache = new Map<number, Awaited<ReturnType<typeof getArticle>>>();
    for (const it of items) {
      let article = articleCache.get(it.articleId);
      if (!article) {
        article = await getArticle(it.articleId);
        articleCache.set(it.articleId, article);
      }
      const variant = article.variants.find((v) => v.sku === it.sku);
      if (!variant) {
        return NextResponse.json({ error: "sku not in article" }, { status: 400 });
      }
      if ((variant.stock ?? 0) < it.quantity) {
        return NextResponse.json(
          { error: "out of stock", sku: it.sku, stock: variant.stock ?? 0 },
          { status: 409 },
        );
      }
      lines.push({
        sku: it.sku,
        productName: article.title,
        unitAmountCents: Math.round(customerPriceAmount(variant) * 100),
        quantity: it.quantity,
      });
    }
  } catch (err) {
    console.error(`checkout upstream failed:`, err);
    return NextResponse.json({ error: "catalog lookup failed" }, { status: 502 });
  }

  const externalOrderReference = "h4ks-" + randomUUID();
  const customerEmail =
    !("items" in body) && typeof (body as Record<string, unknown>).email === "string"
      ? ((body as Record<string, unknown>).email as string)
      : undefined;

  const session = await createCheckoutSession({
    lines,
    externalOrderReference,
    customerEmail,
  });

  return NextResponse.json({
    sessionId: session.id,
    url: session.url,
    externalOrderReference,
  });
}
