import { CART_MAX_ITEMS } from "./cart-config";

export type CartItem = {
  articleId: number;
  sku: string;
  quantity: number;
  productName: string;
  appearanceName: string;
  sizeName: string;
  price: number;
  imageUrl?: string;
};

export function totalQty(cart: CartItem[]): number {
  return cart.reduce((s, i) => s + i.quantity, 0);
}

export function subtotal(cart: CartItem[]): number {
  return cart.reduce((s, i) => s + i.price * i.quantity, 0);
}

export function canAdd(cart: CartItem[], adding: number): boolean {
  return totalQty(cart) + adding <= CART_MAX_ITEMS;
}

export function addItem(cart: CartItem[], item: CartItem): CartItem[] {
  const remaining = CART_MAX_ITEMS - totalQty(cart);
  if (remaining <= 0) return cart;
  const grow = Math.min(item.quantity, remaining);
  const existing = cart.findIndex((c) => c.sku === item.sku);
  if (existing >= 0) {
    return cart.map((c, i) => (i === existing ? { ...c, quantity: c.quantity + grow } : c));
  }
  return [...cart, { ...item, quantity: grow }];
}

export function removeItem(cart: CartItem[], sku: string): CartItem[] {
  return cart.filter((c) => c.sku !== sku);
}

export function setQty(cart: CartItem[], sku: string, qty: number): CartItem[] {
  if (qty <= 0) return removeItem(cart, sku);
  const others = cart.filter((c) => c.sku !== sku).reduce((s, i) => s + i.quantity, 0);
  const clamped = Math.min(qty, CART_MAX_ITEMS - others);
  return cart.map((c) => (c.sku === sku ? { ...c, quantity: clamped } : c));
}
