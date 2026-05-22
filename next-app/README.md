# NeuroDent Next App

NeuroDent is a Next.js CRM for a dental clinic. The full active project lives in this folder: frontend pages, API route handlers, backend business logic, SQLite storage, integration adapters and deployment config.

## Project Layout

```text
next-app/
  app/                    Next.js App Router pages and API routes
  app/api/[[...path]]/    REST API entrypoint
  backend/                Server-side business logic and storage
  components/             Shared UI
  lib/                    Client API and auth context
  public/                 Static assets
```

The old root `frontend/` and root tracked `backend/` are not used. Runtime data is stored in `next-app/backend/data/` and is ignored by Git.

## Local Development

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

If port `3000` is busy, run:

```bash
npx next dev --webpack -p 3001
```

## Useful Commands

```bash
npm run lint
npm run build
npm run test:backend
npm run test:e2e
npm run reset:dev-passwords
npm audit
```

Seed users:

```text
owner:     87001234567 / 1234
admin:     87007654321 / admin
doctor:    87005551234 / doctor
assistant: 87009871234 / assistant
patient:   patient phone / patient
```

## API

Health and docs:

```text
GET /api/health
GET /api/ready
GET /api/capabilities
GET /api/docs
GET /api/openapi.json
```

The API uses the `nd_token` HTTP-only cookie and also accepts `Authorization: Bearer <token>`.

## Environment

Copy `.env.example` to `.env.local` for local secrets:

```bash
cp .env.example .env.local
```

Required runtime:

```text
Node.js >= 22
```

SQLite is the default local storage. Production PostgreSQL/Supabase persistence is prepared as the next stage.

For Docker production, mount a persistent volume to `next-app/backend/data` or set `NEURODENT_DATA_DIR` to a persistent path.

For serverless demos, SQLite may live on an ephemeral filesystem. `/api/ready` reports this as not durable unless `NEURODENT_ALLOW_EPHEMERAL_STORAGE=true` is explicitly set.

## Integrations

The admin system page shows each integration status and missing required env vars. Supported adapters:

```text
RESEND_API_KEY / EMAIL_FROM
NEURODENT_EMAIL_WEBHOOK_URL / NEURODENT_EMAIL_WEBHOOK_TOKEN
NEURODENT_SMS_WEBHOOK_URL / NEURODENT_SMS_WEBHOOK_TOKEN
NEURODENT_WHATSAPP_WEBHOOK_URL / NEURODENT_WHATSAPP_WEBHOOK_TOKEN
SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_STORAGE_BUCKET
NEURODENT_FISCALIZATION_WEBHOOK_URL / NEURODENT_FISCALIZATION_WEBHOOK_TOKEN
NEURODENT_ESIGN_WEBHOOK_URL / NEURODENT_ESIGN_WEBHOOK_TOKEN
NEURODENT_AI_WEBHOOK_URL / NEURODENT_AI_WEBHOOK_TOKEN
```
