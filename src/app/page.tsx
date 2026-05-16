import Link from "next/link";
import Image from "next/image";
import { listArticles, customerPriceAmount } from "@/lib/spreadconnect";

export const dynamic = "force-dynamic";

export default async function Home() {
  let articles: Awaited<ReturnType<typeof listArticles>>["items"] = [];
  let error: string | null = null;
  try {
    const data = await listArticles(50, 0);
    articles = data.items;
  } catch (err) {
    error = err instanceof Error ? err.message : "unknown error";
  }

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
                {priceFrom !== null ? `from $${priceFrom.toFixed(2)}` : ""}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
