import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getArticle, customerPriceAmount } from "@/lib/spreadconnect";
import { createCheckoutSession } from "@/lib/stripe";

type CheckoutBody = {
  articleId: unknown;
  sku: unknown;
  quantity?: unknown;
  email?: unknown;
};

export async function POST(req: Request) {
  let body: CheckoutBody;
  try {
    body = (await req.json()) as CheckoutBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  // Coerce + validate up-front. Accept number or stringified positive int
  // (form encoders). Reject arrays/objects/decimals/negatives/non-safe ints —
  // any of those would be forwarded into the spreadconnect URL and surface
  // upstream errors that leak internal paths.
  // (Note: `Number([12404])` coerces to 12404, so we have to type-check first.)
  const rawId = body.articleId;
  const articleId = typeof rawId === "number" || typeof rawId === "string" ? Number(rawId) : NaN;
  const sku = typeof body.sku === "string" ? body.sku : "";
  if (!Number.isSafeInteger(articleId) || articleId <= 0 || !sku) {
    return NextResponse.json({ error: "articleId and sku required" }, { status: 400 });
  }

  const quantity = Math.min(Math.max(Number(body.quantity ?? 1) || 1, 1), 10);
  const customerEmail = typeof body.email === "string" ? body.email : undefined;

  // Re-fetch price + stock from spreadconnect. Never trust client-supplied
  // amounts; gate on stock here so we don't take payment for an item we
  // can't fulfill.
  let productName: string;
  let unitAmountCents: number;
  try {
    const article = await getArticle(articleId);
    const variant = article.variants.find((v) => v.sku === sku);
    if (!variant) {
      return NextResponse.json({ error: "sku not in article" }, { status: 400 });
    }
    if ((variant.stock ?? 0) < quantity) {
      return NextResponse.json(
        { error: "out of stock", stock: variant.stock ?? 0 },
        { status: 409 },
      );
    }
    productName = article.title;
    unitAmountCents = Math.round(customerPriceAmount(variant) * 100);
  } catch (err) {
    console.error(`checkout articleId=${articleId} upstream failed:`, err);
    return NextResponse.json({ error: "catalog lookup failed" }, { status: 502 });
  }

  const externalOrderReference = "h4ks-" + randomUUID();
  const session = await createCheckoutSession({
    sku,
    productName,
    unitAmountCents,
    quantity,
    externalOrderReference,
    customerEmail,
  });

  return NextResponse.json({
    sessionId: session.id,
    url: session.url,
    externalOrderReference,
  });
}
