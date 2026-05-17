import type { Metadata } from "next";
import Link from "next/link";
import { SHOP_CONTACT_EMAIL, SHOP_CURRENCY } from "@/lib/config";
import CartHeaderLink from "./CartHeaderLink";
import CartDrawer from "./CartDrawer";
import "./globals.css";

export const metadata: Metadata = {
  title: "h4ks shop",
  description: "support h4ks, get some merch — also available over ssh",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <header className="border-b border-[color:var(--border)]">
          <div className="max-w-container mx-auto px-8 py-4 flex items-center justify-between">
            <div className="flex items-baseline gap-3">
              <Link
                href="/"
                className="text-text mono text-base font-bold no-underline hover:no-underline"
              >
                h4ks/shop
              </Link>
              <span className="text-text-dim mono text-xs">support h4ks, get some merch</span>
            </div>
            <nav className="flex items-center">
              <CartHeaderLink />
            </nav>
          </div>
        </header>

        <main className="flex-1 max-w-container mx-auto w-full px-8 py-8">{children}</main>

        <CartDrawer currency={SHOP_CURRENCY} />

        <footer className="max-w-container mx-auto w-full px-8 py-6 mt-8 border-t border-[color:var(--border)]">
          <div className="mono text-xs text-text-dim flex justify-between flex-wrap gap-3 items-center">
            <span>
              &gt; http is for losers — try <code className="text-accent2">ssh h4ks.com</code> and
              pick <code className="text-accent2">shop</code>
            </span>
            <div className="flex gap-4 items-center">
              <a href="https://h4ks.com" className="text-text-dim hover:text-accent">
                ← h4ks.com
              </a>
              <a href={`mailto:${SHOP_CONTACT_EMAIL}`} className="text-text-dim hover:text-text">
                contact
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
