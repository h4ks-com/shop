"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  type CartItem,
  addItem as opAdd,
  removeItem as opRemove,
  setQty as opSetQty,
  subtotal,
  totalQty,
} from "./cart-ops";

const STORAGE_KEY = "h4ks-cart-v1";
const CART_EVENT = "h4ks-cart-change";

function readStorage(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch {
    return [];
  }
}

function writeStorage(cart: CartItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  // Cross-component sync in the same tab (storage event fires only in other tabs).
  window.dispatchEvent(new CustomEvent(CART_EVENT));
}

// useSyncExternalStore requires stable snapshot identity — return the same
// array reference until the underlying string changes.
let snapshot: CartItem[] = [];
let snapshotKey: string | null = null;
function getSnapshot(): CartItem[] {
  if (typeof window === "undefined") return snapshot;
  const raw = window.localStorage.getItem(STORAGE_KEY) ?? "";
  if (raw !== snapshotKey) {
    snapshotKey = raw;
    snapshot = readStorage();
  }
  return snapshot;
}
const EMPTY: CartItem[] = [];
function getServerSnapshot(): CartItem[] {
  return EMPTY;
}
function subscribe(cb: () => void): () => void {
  window.addEventListener(CART_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CART_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useCart() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = typeof window !== "undefined" && snapshotKey !== null;

  const add = useCallback((item: CartItem) => writeStorage(opAdd(readStorage(), item)), []);
  const remove = useCallback((sku: string) => writeStorage(opRemove(readStorage(), sku)), []);
  const setQty = useCallback(
    (sku: string, qty: number) => writeStorage(opSetQty(readStorage(), sku, qty)),
    [],
  );
  const clear = useCallback(() => writeStorage([]), []);

  return {
    items,
    hydrated,
    count: totalQty(items),
    subtotal: subtotal(items),
    add,
    remove,
    setQty,
    clear,
  };
}
