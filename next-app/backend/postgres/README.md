# PostgreSQL Migration Path

The current NeuroDent runtime uses SQLite because it works without external services and is suitable for local development and demonstration. For production scaling, PostgreSQL is prepared as the target database.

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

Apply the schema:

```bash
cd next-app
npm run db:postgres:migrate
```

Check connection and schema readiness:

```bash
npm run db:postgres:check
```

For Supabase, use the Supabase Postgres connection string and set:

```text
NEURODENT_POSTGRES_SSL=require
```

PostgreSQL runtime is not enabled yet. The next implementation step is replacing the current SQLite storage adapter with a PostgreSQL adapter that keeps the same service-layer API. Until then, keep `NEURODENT_STORAGE_DRIVER=sqlite`.
