import Link from "next/link";
import Image from "next/image";
import { listArticles, customerPriceAmount } from "@/lib/spreadconnect";
import { PAGE_SIZE, parsePage, pageWindow } from "@/lib/pagination";
import { formatPrice } from "@/lib/format";
import { SHOP_CURRENCY } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ p?: string | string[] }>;
}) {
  const sp = await searchParams;
  const requested = parsePage(sp.p);

  let articles: Awaited<ReturnType<typeof listArticles>>["items"] = [];
  let total = 0;
  let error: string | null = null;
  try {
    const data = await listArticles(PAGE_SIZE, (requested - 1) * PAGE_SIZE);
    articles = data.items;
    total = data.count ?? data.items.length;
  } catch (err) {
    error = err instanceof Error ? err.message : "unknown error";
  }

  const win = pageWindow({ page: requested, total });

  return (
    <>
      <div className="section-label">[ merch ]</div>
      <h1 className="mono text-2xl mb-2 text-text">support h4ks</h1>
      <p className="text-text-dim mb-8 mono text-sm">
        every order pays h4ks bills. printed and shipped by{" "}
        <a
          href="https://www.spreadshirt.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          Spreadshirt
        </a>
        .
      </p>

      {error && (
        <div className="border border-[color:var(--accent2)] p-4 mono text-sm text-accent2">
          shop is offline: {error}
        </div>
      )}

      {!error && articles.length === 0 && (
        <p className="text-text-dim mono">
          no products yet — come back soon, or yell at the admins on irc.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {articles.map((a) => {
          const img =
            a.images?.find((i) => i.perspective === "FRONT")?.imageUrl || a.images?.[0]?.imageUrl;
          const priceFrom = a.variants.length
            ? Math.min(...a.variants.map(customerPriceAmount))
            : null;
          return (
            <Link
              key={a.id}
              href={`/p/${a.id}`}
              className="block bg-[color:var(--bg-panel)] border border-[color:var(--border)] p-3 hover:border-accent transition-colors no-underline"
            >
              <div className="aspect-square bg-bg flex items-center justify-center overflow-hidden mb-3">
                {img ? (
                  <Image
                    src={img}
                    alt={a.title}
                    width={400}
                    height={400}
                    className="object-contain w-full h-full"
                    unoptimized
                  />
                ) : (
                  <span className="mono text-xs text-text-dim">no image</span>
                )}
              </div>
              <div className="mono text-sm text-text mb-1">{a.title}</div>
              <div className="mono text-xs text-accent2">
                {priceFrom !== null ? `from ${formatPrice(priceFrom, SHOP_CURRENCY)}` : ""}
                {priceFrom !== null && (
                  <span className="text-accent ml-2">· free shipping</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {win.totalPages > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-4 mono text-sm">
          {win.hasPrev ? (
            <Link
              href={win.page - 1 === 1 ? "/" : `/?p=${win.page - 1}`}
              className="text-accent hover:underline"
            >
              ← prev
            </Link>
          ) : (
            <span className="text-text-dim opacity-50">← prev</span>
          )}
          <span className="text-text-dim">
            page {win.page} / {win.totalPages}
          </span>
          {win.hasNext ? (
            <Link href={`/?p=${win.page + 1}`} className="text-accent hover:underline">
              next →
            </Link>
          ) : (
            <span className="text-text-dim opacity-50">next →</span>
          )}
        </nav>
      )}
    </>
  );
}
