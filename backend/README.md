# NeuroDent Backend

NeuroDent backend is a Node.js 22+ server-side API with SQLite storage. It replaces frontend mock data with real backend logic, role-based access control, sessions, database persistence, audit logs and operational endpoints.

## Architecture

The backend is split into three layers:

- `backend/server.js` runs the standalone HTTP server and exposes REST routes.
- `backend/service.js` contains business logic for auth, patients, doctors, appointments, visits, payments, invoices, inventory, CRM conversations, AI clinical assistant logic, reports and audit logs.
- `backend/storage.js` owns SQLite schema creation, migrations and database read/write helpers.
- `next-app/app/api/[[...path]]/route.js` connects the Next.js app to the same backend service layer through `/api`.

## Run

```bash
npm start
```

Next.js integrated mode:

```bash
cd next-app
npm run dev
```

Health check:

```text
GET /api/health
```

API documentation:

```text
GET /api/docs
GET /api/openapi.json
```

## Authentication

The API uses phone/password login. A successful login creates a server-side session and returns a token. The token can be sent as the `nd_token` cookie or as `Authorization: Bearer <token>`.

Seed users:

```text
owner:     87001234567 / 1234
admin:     87007654321 / admin
doctor:    87005551234 / doctor
assistant: 87009871234 / assistant
```

Roles:

```text
owner, admin, doctor, assistant, patient
```

Security features:

- Password hashes are generated with Node.js `scrypt`.
- Protected endpoints return `401 Unauthorized` without a valid session.
- Role restrictions return `403 Forbidden` when the user has no permission.
- Patient users are scoped to their own `patientId`.
- Login and API requests have in-memory rate limiting.
- Request body size is limited by `NEURODENT_MAX_BODY_BYTES`.
- Password reset endpoints use time-limited reset tokens.

## Storage

SQLite database file:

```text
backend/data/neurodent.sqlite
```

Runtime data is ignored by Git. Database backups are created under:

```text
backend/data/backups/
```

Main tables include:

```text
users, patients, doctors, appointments, visits, payments, invoices,
invoice_items, inventory, stock_movements, files, notifications,
audit_logs, conversations, conversation_messages, sessions,
schema_migrations
```

## Admin Operations

Owner-only operational routes:

```text
GET  /api/admin/system
GET  /api/admin/integrations
GET  /api/admin/backups
POST /api/admin/backups
GET  /api/admin/backups/:fileName/download
```

## External Integrations

Email, SMS, WhatsApp, file storage, fiscalization, e-signature and AI delivery are implemented through webhook adapters. If provider URLs are not configured, delivery is safely marked as `skipped`.

```text
NEURODENT_EMAIL_WEBHOOK_URL=
NEURODENT_EMAIL_WEBHOOK_TOKEN=
NEURODENT_SMS_WEBHOOK_URL=
NEURODENT_SMS_WEBHOOK_TOKEN=
NEURODENT_WHATSAPP_WEBHOOK_URL=
NEURODENT_WHATSAPP_WEBHOOK_TOKEN=
NEURODENT_FILE_STORAGE_WEBHOOK_URL=
NEURODENT_FILE_STORAGE_WEBHOOK_TOKEN=
NEURODENT_FISCALIZATION_WEBHOOK_URL=
NEURODENT_FISCALIZATION_WEBHOOK_TOKEN=
NEURODENT_ESIGN_WEBHOOK_URL=
NEURODENT_ESIGN_WEBHOOK_TOKEN=
NEURODENT_AI_WEBHOOK_URL=
NEURODENT_AI_WEBHOOK_TOKEN=
```

These adapters are used by password reset, patient reminders, file upload mirroring, payment fiscalization, document signing and AI clinical assistant logic.

## Backend Smoke Test

```bash
npm run test:backend
```

The smoke test checks health, protected access, owner login, current session, doctors, patient creation, schedule conflict validation, invoice payment, stock movement, system status, backup creation, password reset request, audit logs and OpenAPI generation.

## Docker

The project includes a production Docker setup:

```bash
docker compose up --build
```

The container runs the Next.js application with the Node.js backend runtime. SQLite data is stored in the `neurodent-data` Docker volume and is not lost when the container restarts.

Optional PostgreSQL service for production migration:

```bash
docker compose --profile postgres up -d postgres
```

PostgreSQL schema:

```text
backend/postgres/schema.sql
```

## CI

GitHub Actions workflow:

```text
.github/workflows/backend.yml
```

The workflow installs Next.js dependencies, checks backend syntax, runs `npm run test:backend`, and builds the Next.js application.
