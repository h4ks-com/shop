import { GELATO_STORE_ID, PRICE_MARGIN, SHOP_CURRENCY } from "./config";
import {
  listStoreProducts,
  listStoreVariants,
  quoteCost,
  updateStoreVariant,
  type QuoteAddress,
} from "./gelato";

// We price every variant from what Gelato charges to make it and ship it to the
// first of these it can deliver to, and hide variants it can deliver to none.
const QUOTE_ADDRESSES: QuoteAddress[] = [
  { country: "DE", city: "Berlin", postCode: "10115" },
  { country: "GB", city: "London", postCode: "SW1A 1AA" },
  { country: "US", city: "New York", postCode: "10001", state: "NY" },
];

const REPRICE_EVERY_MS = 30 * 60 * 1000;

// The lowest x.90 price that keeps `margin` of it over `cost`. We work in whole
// cents so float noise like 8.900000000000002 cannot push a price up a euro.
export function retailPrice(cost: number, margin: number): number {
  const cents = Math.round((cost / (1 - margin)) * 100);
  return (Math.ceil((cents - 90) / 100) * 100 + 90) / 100;
}

// ponytail: costs stay cached until the next deploy, add expiry if Gelato changes prices under us.
const costs = new Map<string, number | null>();

async function costOf(productUid: string): Promise<number | null> {
  if (costs.has(productUid)) return costs.get(productUid)!;
  let cost: number | null = null;
  for (const address of QUOTE_ADDRESSES) {
    cost = await quoteCost(productUid, address, SHOP_CURRENCY);
    if (cost != null) break;
  }
  costs.set(productUid, cost);
  return cost;
}

export async function repriceStore(): Promise<void> {
  for (const product of await listStoreProducts(GELATO_STORE_ID)) {
    for (const variant of await listStoreVariants(GELATO_STORE_ID, product.id)) {
      const cost = await costOf(variant.productUid);
      if (cost == null) {
        if (!variant.isHidden) {
          await updateStoreVariant(GELATO_STORE_ID, product.id, variant.id, { isHidden: true });
          console.warn(`pricing: hid ${product.title} ${variant.id}, Gelato cannot ship it`);
        }
        continue;
      }
      const price = retailPrice(cost, PRICE_MARGIN);
      if (variant.price !== price || variant.currency !== SHOP_CURRENCY) {
        await updateStoreVariant(GELATO_STORE_ID, product.id, variant.id, {
          price,
          currency: SHOP_CURRENCY,
        });
      }
    }
  }
}

let running = false;

async function repriceOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await repriceStore();
  } catch (err) {
    console.error("pricing: run failed:", err);
  } finally {
    running = false;
  }
}

export function startRepricing(): void {
  void repriceOnce();
  setInterval(repriceOnce, REPRICE_EVERY_MS);
}
