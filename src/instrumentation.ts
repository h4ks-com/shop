// Validates required env vars at server start. Crashes the process if any
// are missing so misconfiguration is loud rather than silent.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const required = [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "SPREADCONNECT_TOKEN",
    "SPREADCONNECT_WEBHOOK_SECRET",
    "SHOP_PUBLIC_URL",
    "SHOP_CONTACT_EMAIL",
    "SMTP_HOST",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error("missing required env vars:", missing.join(", "));
    process.exit(1);
  }
}
