import Link from "next/link";

export default function CancelPage() {
  return (
    <div className="text-center py-16">
      <div className="section-label inline-block">[ status ]</div>
      <h1 className="mono text-3xl mb-4 text-accent2">payment cancelled</h1>
      <p className="text-text-mid mb-8">
        no charge made. cart cleared. come back when you&apos;re ready.
      </p>
      <Link href="/" className="btn btn-orange">
        ← back to shop
      </Link>
    </div>
  );
}
