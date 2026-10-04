import { afterAll, describe, expect, it } from "vitest";
import { chromium } from "playwright";
import Stripe from "stripe";
import { GELATO_ORDER_BASE_URL, GELATO_STORE_ID, GELATO_TOKEN } from "@/lib/config";
import { getOrder, listStoreProducts, listStoreVariants } from "@/lib/gelato";

const baseUrl = process.env.E2E_BASE_URL;
const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const customerEmail = process.env.SHOP_CONTACT_EMAIL ?? "";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(baseUrl + path);
  expect(res.status).toBe(200);
  return (await res.json()) as T;
}

async function payWithTestCard(url: string) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url);
    await page.locator("#cardNumber").fill("4242424242424242");
    await page.locator("#cardExpiry").fill("12 / 40");
    await page.locator("#cardCvc").fill("123");
    await page.locator("#shippingName").fill("E2E Test");
    await page.locator("#shippingCountry").selectOption("DE");
    await page.locator("#shippingAddressLine1").fill("Musterstrasse 1");
    await page.locator("#shippingPostalCode").fill("10115");
    await page.locator("#shippingLocality").fill("Berlin");
    await page.locator("#phoneNumber").fill("15123456789");
    const redirected = page.waitForRequest(/\/ok\?session_id=/, { timeout: 60_000 });
    await page.locator("button[type=submit]").click();
    await redirected;
  } finally {
    await browser.close();
  }
}

describe.skipIf(!baseUrl)("checkout end to end (Stripe test mode, Gelato draft)", () => {
  let gelatoOrderId: string | undefined;

  afterAll(async () => {
    if (!gelatoOrderId) return;
    const res = await fetch(`${GELATO_ORDER_BASE_URL}/v4/orders/${gelatoOrderId}`, {
      method: "DELETE",
      headers: { "X-API-KEY": GELATO_TOKEN },
    });
    expect(res.ok).toBe(true);
  });

  it("places a Gelato draft order after a paid Stripe test checkout", async () => {
    if (!stripeKey.startsWith("sk_test_")) throw new Error("e2e needs a Stripe test secret key");
    if (process.env.GELATO_LIVE_ORDERS === "true") {
      throw new Error("e2e refuses to run with GELATO_LIVE_ORDERS=true");
    }
    if (!customerEmail) throw new Error("e2e needs SHOP_CONTACT_EMAIL for the customer email");

    const { items } = await getJson<{ items: { id: number }[] }>("/api/articles");
    const article = await getJson<{ id: number; variants: { sku: string }[] }>(
      `/api/articles/${items[0].id}`,
    );
    const { sku } = article.variants[0];

    const checkoutRes = await fetch(`${baseUrl}/api/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId: article.id, sku, quantity: 1, email: customerEmail }),
    });
    expect(checkoutRes.status).toBe(200);
    const checkout = (await checkoutRes.json()) as {
      sessionId: string;
      url: string;
      externalOrderReference: string;
    };
    expect(checkout.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);

    await payWithTestCard(checkout.url);

    const stripe = new Stripe(stripeKey);
    const session = await stripe.checkout.sessions.retrieve(checkout.sessionId);
    expect(session.payment_status).toBe("paid");

    const payload = JSON.stringify({
      id: `evt_e2e_${checkout.sessionId}`,
      object: "event",
      type: "checkout.session.completed",
      data: { object: session },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
    });
    const webhookRes = await fetch(`${baseUrl}/api/webhooks/stripe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "stripe-signature": signature },
      body: payload,
    });
    expect(webhookRes.status).toBe(200);
    const webhook = (await webhookRes.json()) as { ok: boolean; orderId: string };
    expect(webhook.ok).toBe(true);
    gelatoOrderId = webhook.orderId;

    const order = await getOrder(gelatoOrderId);
    expect(order.orderReferenceId).toBe(checkout.externalOrderReference);
    expect(order.fulfillmentStatus).toBe("draft");

    const products = await listStoreProducts(GELATO_STORE_ID);
    const variants = (
      await Promise.all(products.map((p) => listStoreVariants(GELATO_STORE_ID, p.id)))
    ).flat();
    const variant = variants.find((v) => v.id === sku);
    expect(variant).toBeDefined();
    const orderRaw = (await fetch(`${GELATO_ORDER_BASE_URL}/v4/orders/${gelatoOrderId}`, {
      headers: { "X-API-KEY": GELATO_TOKEN },
    }).then((r) => r.json())) as { items: { productUid: string }[] };
    expect(orderRaw.items.map((i) => i.productUid)).toEqual([variant!.productUid]);
  }, 180_000);
});
