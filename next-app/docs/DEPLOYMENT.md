# NeuroDent Deployment

This document records the current production decision for the `next-app` project.

## Decision

Production should run as a Docker/VPS deployment with a durable filesystem volume mounted for SQLite data.

Vercel or other serverless platforms are preview/demo only until the PostgreSQL runtime adapter is implemented. The current backend uses Node.js SQLite on the local filesystem, so serverless storage under `/tmp` is not durable enough for clinic production data.

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
NEURODENT_STORAGE_DRIVER=sqlite
NEURODENT_DATA_DIR=<durable path>
NEURODENT_ALLOW_EPHEMERAL_STORAGE=false
NEURODENT_EXPOSE_RESET_TOKEN=false
```

Recommended clinic integrations:

```text
RESEND_API_KEY
EMAIL_FROM
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
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
```

The admin integrations page shows missing integration env vars at runtime.

## Backups

The backend creates SQLite backup files under:

```text
next-app/backend/data/backups
```

For Docker production, back up the `neurodent-data` volume regularly. Owner users can also create and download backups from the admin maintenance endpoints.

## Vercel Preview

The repository keeps Vercel config for preview builds and UI checks. Do not use Vercel for clinic production data while `postgresRuntimeEnabled` is `false` in `/api/capabilities`.

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

## Next Stage

The next implementation stage is the PostgreSQL/Supabase runtime storage adapter that keeps the existing service-layer API and makes serverless production deployment possible. Until that adapter is enabled, keep `NEURODENT_STORAGE_DRIVER=sqlite`.
