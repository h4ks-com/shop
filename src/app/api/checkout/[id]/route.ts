import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const sess = await stripe().checkout.sessions.retrieve(id);
    return NextResponse.json({
      id: sess.id,
      status: sess.status,
      paymentStatus: sess.payment_status,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 502 },
    );
  }
}
