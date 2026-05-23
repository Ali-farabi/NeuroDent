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
npm run test:postgres
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

Patient portal endpoints:

```text
POST /api/patients/:id/documents/protocol
GET  /api/patients/:id/documents/protocol/latest
GET  /api/patients/:id/billing-summary
POST /api/patients/:id/appointment-requests
```

Backend files support `kind` / `category` values such as `xray`, `ct`, `before`, `after`, `protocol`, `consent` and `invoice`.

## Environment

Copy `.env.example` to `.env.local` for local secrets:

```bash
cp .env.example .env.local
```

Required runtime:

```text
Node.js >= 22
```

SQLite is the default runtime storage for local development. PostgreSQL/Supabase runtime storage is available by setting:

```text
NEURODENT_STORAGE_DRIVER=postgres
NEURODENT_DATABASE_URL=postgres://...
NEURODENT_POSTGRES_SSL=require
```

Production decision: use Docker/VPS with a durable volume mounted to `next-app/backend/data`, set `NEURODENT_DATA_DIR` to another durable path, or run the PostgreSQL/Supabase storage adapter for serverless deployments.

For Vercel/serverless production, use `NEURODENT_STORAGE_DRIVER=postgres`. For serverless demos with SQLite, the database may live on an ephemeral filesystem; `/api/ready` reports this as not durable unless `NEURODENT_ALLOW_EPHEMERAL_STORAGE=true` is explicitly set.

PostgreSQL preflight commands:

```bash
npm run db:postgres:migrate
npm run db:postgres:check
```

For local Docker PostgreSQL without editing env first:

```bash
npm run db:postgres:local
npm run db:postgres:local:migrate
npm run db:postgres:local:check
```

The Postgres CLI scripts load `.env.local` automatically. Without `NEURODENT_DATABASE_URL`, `db:postgres:migrate` has no database to connect to and will stop with a configuration hint.

To smoke-test the app against PostgreSQL in PowerShell without changing `.env.local`:

```powershell
$env:NEURODENT_STORAGE_DRIVER="postgres"
npm run test:backend
```

Deployment guide:

```text
next-app/docs/DEPLOYMENT.md
```

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
