import Link from "next/link";
import { SHOP_CONTACT_EMAIL } from "@/lib/config";

export default async function OkPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  return (
    <div className="text-center py-16">
      <div className="section-label inline-block">[ status ]</div>
      <h1 className="mono text-3xl mb-4 text-accent">✓ payment received</h1>
      <p className="text-text-mid mb-8">
        thanks for supporting h4ks. printing&apos;s queued.
        <br />
        you&apos;ll get a tracking email when it ships.
      </p>
      {session_id && (
        <p className="mono text-xs text-text-dim mb-8">session: {session_id.slice(0, 24)}…</p>
      )}
      <Link href="/" className="btn">
        ← back to shop
      </Link>
      <p className="mono text-xs text-text-dim mt-8">
        questions? <a href={`mailto:${SHOP_CONTACT_EMAIL}`}>{SHOP_CONTACT_EMAIL}</a>
      </p>
    </div>
  );
}
