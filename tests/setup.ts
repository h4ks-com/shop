// Stub the required-env-or-die contract in config.ts so route modules can
// import without crashing. Individual tests can override with vi.stubEnv.
process.env.STRIPE_SECRET_KEY ||= "sk_test_x";
process.env.STRIPE_WEBHOOK_SECRET ||= "whsec_test_x";
process.env.SPREADCONNECT_TOKEN ||= "sct_test_x";
process.env.SPREADCONNECT_WEBHOOK_SECRET ||= "scwh_test_x";
process.env.SHOP_PUBLIC_URL ||= "http://localhost:3000";
process.env.SHOP_CONTACT_EMAIL ||= "test@h4ks.test";
process.env.SMTP_HOST ||= "smtp.test";
process.env.SMTP_USER ||= "u";
process.env.SMTP_PASS ||= "p";
process.env.SMTP_FROM ||= "test <test@h4ks.test>";
