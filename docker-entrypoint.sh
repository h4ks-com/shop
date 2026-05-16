#!/bin/sh
# If the dev tunnel sidecar wrote a public URL, use it as SHOP_PUBLIC_URL.
# In production this file never exists, so the env var passed via .env wins.
if [ -f /tunnel/url ] && [ -s /tunnel/url ]; then
  SHOP_PUBLIC_URL="$(cat /tunnel/url)"
  export SHOP_PUBLIC_URL
  echo "entrypoint: using tunnel SHOP_PUBLIC_URL=${SHOP_PUBLIC_URL}"
fi

# Fail fast on missing required env. Next.js instrumentation only runs on
# first request, which is too late to catch a misconfigured deploy.
missing=""
for v in STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET \
         SPREADCONNECT_TOKEN SPREADCONNECT_WEBHOOK_SECRET \
         SHOP_PUBLIC_URL SHOP_CONTACT_EMAIL \
         SMTP_HOST SMTP_USER SMTP_PASS SMTP_FROM; do
  eval "val=\$$v"
  [ -z "$val" ] && missing="$missing $v"
done
if [ -n "$missing" ]; then
  echo "entrypoint: missing required env vars:$missing" >&2
  exit 1
fi

exec "$@"
