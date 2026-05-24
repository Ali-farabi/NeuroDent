# NeuroDent Deployment

This document records the current production decision for the `next-app` project.

## Decision

Production can run either as a Docker/VPS deployment with a durable filesystem volume mounted for SQLite data, or with the PostgreSQL/Supabase runtime storage adapter.

For Vercel or other serverless platforms, use `NEURODENT_STORAGE_DRIVER=postgres`. SQLite on serverless storage under `/tmp` is only suitable for demos because it is not durable enough for clinic production data.

## Production Target

Use the root `docker-compose.yml` from the repository root:

```bash
docker compose up --build -d neurodent
```

The app listens on:

```text
http://localhost:3000
```

The compose file mounts the durable Docker volume:

```text
neurodent-data -> /app/next-app/backend/data
```

Keep this path durable in production. If deploying without Docker Compose, set:

```text
NEURODENT_DATA_DIR=/app/next-app/backend/data
NEURODENT_ALLOW_EPHEMERAL_STORAGE=false
NEURODENT_EXPOSE_RESET_TOKEN=false
```

## Readiness Checks

After deploy, check:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/ready
curl http://localhost:3000/api/capabilities
```

`/api/ready` must return `ok: true` and `database.ready: true` for production. If it reports ephemeral storage, the deployment is not production-ready.

## Required Production Configuration

Minimum required runtime:

```text
Node.js >= 22
NODE_ENV=production
PORT=3000
NEURODENT_ALLOW_EPHEMERAL_STORAGE=false
NEURODENT_EXPOSE_RESET_TOKEN=false
NEURODENT_MAX_BODY_BYTES=4000000
```

SQLite production storage:

```text
NEURODENT_STORAGE_DRIVER=sqlite
NEURODENT_DATA_DIR=<durable path>
```

PostgreSQL/Supabase production storage:

```text
NEURODENT_STORAGE_DRIVER=postgres
NEURODENT_DATABASE_URL=postgres://...
NEURODENT_POSTGRES_SSL=require
```

Recommended clinic integrations:

```text
RESEND_API_KEY
EMAIL_FROM
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_SECRET_KEY
SUPABASE_STORAGE_BUCKET
NEURODENT_SMS_WEBHOOK_URL
NEURODENT_SMS_WEBHOOK_TOKEN
NEURODENT_WHATSAPP_WEBHOOK_URL
NEURODENT_WHATSAPP_WEBHOOK_TOKEN
NEURODENT_FISCALIZATION_WEBHOOK_URL
NEURODENT_FISCALIZATION_WEBHOOK_TOKEN
NEURODENT_ESIGN_WEBHOOK_URL
NEURODENT_ESIGN_WEBHOOK_TOKEN
NEURODENT_AI_WEBHOOK_URL
NEURODENT_AI_WEBHOOK_TOKEN
NEURODENT_WEBHOOK_TIMEOUT_MS
NEURODENT_INTEGRATION_HEALTHCHECK_SEND
```

The admin integrations page shows missing integration env vars at runtime and has a safe readiness check. The same check is available from CLI:

```bash
npm run integrations:check
```

By default this verifies env configuration and Supabase Storage bucket readiness without sending webhook traffic. To POST dry-run health checks to configured webhook providers, run `npm run integrations:check -- --send-webhook-checks` or set `NEURODENT_INTEGRATION_HEALTHCHECK_SEND=true`.

For Supabase Storage file persistence, set one server-only key: `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`. The `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` key is only for browser/SSR client setup and must not be used as the backend storage secret.

For Vercel deployments, keep `NEURODENT_MAX_BODY_BYTES` at or below `4000000` because Vercel Functions reject payloads over 4.5 MB. Larger medical files should use direct-to-storage upload URLs instead of passing base64 through the Next.js function.

## Backups

The backend creates backup files under:

```text
next-app/backend/data/backups
```

SQLite backups are `.sqlite` file copies. PostgreSQL/Supabase runtime backups are JSON exports from the admin export payload. For Docker production, back up the `neurodent-data` volume regularly. Owner users can also create and download backups from the admin maintenance endpoints.

## Vercel Preview

The repository keeps Vercel config for preview builds and UI checks. Use PostgreSQL/Supabase for clinic production data on Vercel and confirm `postgresRuntimeEnabled` is `true` in `/api/capabilities`.

If a demo deployment is intentionally allowed to use ephemeral SQLite, set:

```text
NEURODENT_ALLOW_EPHEMERAL_STORAGE=true
```

That setting is only for demos. It allows readiness to pass even when the database lives on ephemeral storage.

## PostgreSQL Preflight

The prepared PostgreSQL schema lives at:

```text
next-app/backend/postgres/schema.sql
```

Configure a PostgreSQL or Supabase connection string:

```text
NEURODENT_DATABASE_URL=postgres://...
NEURODENT_POSTGRES_SSL=require
```

For local Docker PostgreSQL, SSL can stay disabled:

```text
NEURODENT_POSTGRES_SSL=disable
```

Apply the prepared schema:

```bash
cd next-app
npm run db:postgres:migrate
```

Check connectivity and schema readiness:

```bash
npm run db:postgres:check
```

The app also reports PostgreSQL preflight state in `/api/capabilities` and the admin system status.

The PostgreSQL CLI scripts load `next-app/.env.local` automatically. If no `NEURODENT_DATABASE_URL` or `DATABASE_URL` is configured, migration cannot run because there is no target database.

For local Docker PostgreSQL:

```bash
cd next-app
npm run db:postgres:local
npm run db:postgres:local:migrate
npm run db:postgres:local:check
```

The local Docker PostgreSQL service is exposed on host port `55432` to avoid conflicts with an existing Windows PostgreSQL service on `5432`.

## PostgreSQL Runtime

To run the backend on PostgreSQL/Supabase, apply the schema and start the app with:

```text
NEURODENT_STORAGE_DRIVER=postgres
```

The adapter keeps the existing service-layer API and `/api/ready` validates both connectivity and schema readiness before reporting production readiness.
