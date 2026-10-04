import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getProduct, findVariant } from "@/lib/catalog";
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
  const rawQuantity = Number(raw.quantity ?? 1);
  if (!Number.isSafeInteger(articleId) || articleId <= 0 || !sku) return null;
  if (!Number.isInteger(rawQuantity)) return null;
  const quantity = Math.min(Math.max(rawQuantity, 1), CART_MAX_ITEMS);
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
      return NextResponse.json(
        { error: "articleId and sku required, quantity must be an integer" },
        { status: 400 },
      );
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

  // Validate each line against the local catalog and price it. Gelato is
  // make-to-order, so there is no stock to check.
  const lines: Line[] = [];
  for (const it of items) {
    const product = await getProduct(it.articleId);
    if (!product) {
      return NextResponse.json({ error: "unknown product" }, { status: 400 });
    }
    const variant = findVariant(product, it.sku);
    if (!variant) {
      return NextResponse.json({ error: "sku not in product" }, { status: 400 });
    }
    lines.push({
      sku: it.sku,
      productName: product.title,
      unitAmountCents: variant.priceCents,
      quantity: it.quantity,
      productUid: variant.productUid,
      designId: variant.designId,
    });
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
