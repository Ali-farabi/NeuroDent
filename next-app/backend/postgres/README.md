# PostgreSQL Migration Path

The current NeuroDent runtime uses SQLite because it works without external services and is suitable for local development and demonstration. For production scaling, PostgreSQL is prepared as the target database.

Prepared files:

```text
next-app/backend/postgres/schema.sql
docker-compose.yml
```

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

The next implementation step is replacing the current SQLite storage adapter with a PostgreSQL adapter that keeps the same service-layer API.
