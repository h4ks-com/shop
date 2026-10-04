# shop.h4ks.com

Storefront for a Gelato store with Stripe checkout. The Gelato order is placed after payment.

## Setup

```bash
cp .env.example .env
# fill in the vars (see .env.example)
```

## Run

```bash
npm run dev
docker compose --profile dev up   # shop, Stripe webhook forwarding and a public tunnel
```

## Test

```bash
npm test
npm run typecheck
npm run lint
E2E_BASE_URL=http://localhost:3000 npm run test:e2e  # needs Stripe test keys, Gelato env and a running server
```
