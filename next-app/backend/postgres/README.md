# PostgreSQL Migration Path

The default NeuroDent runtime uses SQLite because it works without external services and is suitable for local development and demonstration. For production scaling and serverless deployment, PostgreSQL/Supabase can be enabled as the runtime storage adapter.

Prepared files:

```text
next-app/backend/postgres/schema.sql
docker-compose.yml
```

`docker-compose.yml` is at the repository root.

Start the PostgreSQL service:

```bash
docker compose --profile postgres up -d postgres
```

Apply schema manually:

```bash
docker compose exec -T postgres psql -U neurodent -d neurodent < next-app/backend/postgres/schema.sql
```

Production database URL:

```text
NEURODENT_DATABASE_URL=postgres://neurodent:neurodent@postgres:5432/neurodent
```

For local Docker from the host machine, use port `55432` because many Windows machines already have another PostgreSQL service on `5432`:

```text
NEURODENT_DATABASE_URL=postgres://neurodent:neurodent@localhost:55432/neurodent
```

Apply the schema:

```bash
cd next-app
npm run db:postgres:migrate
```

Check connection and schema readiness:

```bash
npm run db:postgres:check
```

The scripts load `next-app/.env.local` automatically. If no database URL is configured, migration stops because there is no PostgreSQL target.

Local Docker shortcut:

```bash
cd next-app
npm run db:postgres:local
npm run db:postgres:local:migrate
npm run db:postgres:local:check
```

For Supabase, use the Supabase Postgres connection string and set:

```text
NEURODENT_POSTGRES_SSL=require
```

Enable PostgreSQL runtime storage:

```text
NEURODENT_STORAGE_DRIVER=postgres
```

The adapter keeps the same service-layer API as SQLite. `/api/ready`, `/api/capabilities`, and the admin system status report the active driver and PostgreSQL schema readiness.
