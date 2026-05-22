# NeuroDent Backend

NeuroDent backend is a Node.js 22+ server-side API with SQLite storage. It lives inside `next-app/backend` so the Next.js app and backend logic are shipped from one project root.

## Architecture

The backend is split into three layers:

- `backend/server.js` runs the standalone HTTP server and exposes REST routes.
- `backend/service.js` contains business logic for auth, patients, doctors, appointments, visits, payments, invoices, inventory, CRM conversations, AI clinical assistant logic, reports and audit logs.
- `backend/storage.js` owns SQLite schema creation, migrations and database read/write helpers.
- `app/api/[[...path]]/route.js` connects the Next.js app to the same backend service layer through `/api`.

## Run

```bash
cd next-app
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
GET /api/ready
GET /api/capabilities
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
next-app/backend/data/neurodent.sqlite
```

Runtime data is ignored by Git. Database backups are created under:

```text
next-app/backend/data/backups/
```

`GET /api/ready` reports whether the active SQLite path is durable. On serverless platforms that place SQLite under `/tmp`, readiness is marked not durable unless `NEURODENT_ALLOW_EPHEMERAL_STORAGE=true` is set for demo-only deployments.

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
POST /api/admin/email/test
GET  /api/admin/sessions
GET  /api/admin/export
POST /api/admin/maintenance/cleanup
GET  /api/admin/backups
POST /api/admin/backups
GET  /api/admin/backups/:fileName/download
DELETE /api/admin/backups/:fileName
```

## External Integrations

Email, SMS, WhatsApp, file storage, fiscalization, e-signature and AI delivery are implemented through webhook adapters. Email also supports direct Resend delivery through `RESEND_API_KEY`. File storage also supports direct Supabase Storage delivery through server-only Supabase keys. If provider URLs or cloud keys are not configured, delivery is safely marked as `skipped`.

```text
RESEND_API_KEY=
EMAIL_FROM=NeuroDent <onboarding@resend.dev>
NEURODENT_EMAIL_WEBHOOK_URL=
NEURODENT_EMAIL_WEBHOOK_TOKEN=
NEURODENT_SMS_WEBHOOK_URL=
NEURODENT_SMS_WEBHOOK_TOKEN=
NEURODENT_WHATSAPP_WEBHOOK_URL=
NEURODENT_WHATSAPP_WEBHOOK_TOKEN=
NEURODENT_FILE_STORAGE_WEBHOOK_URL=
NEURODENT_FILE_STORAGE_WEBHOOK_TOKEN=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=neurodent-files
SUPABASE_STORAGE_PREFIX=neurodent
SUPABASE_STORAGE_PUBLIC=false
NEURODENT_FISCALIZATION_WEBHOOK_URL=
NEURODENT_FISCALIZATION_WEBHOOK_TOKEN=
NEURODENT_ESIGN_WEBHOOK_URL=
NEURODENT_ESIGN_WEBHOOK_TOKEN=
NEURODENT_AI_WEBHOOK_URL=
NEURODENT_AI_WEBHOOK_TOKEN=
```

These adapters are used by password reset, patient reminders, invoice email delivery, file upload mirroring, payment fiscalization, document signing and AI clinical assistant logic. `SUPABASE_SERVICE_ROLE_KEY` must stay on the server only and must never be exposed as a `NEXT_PUBLIC_` variable.

Cloud file storage behavior:

```text
POST /api/files
```

The backend always stores an uploaded file locally as a fallback. If Supabase Storage is configured, the same file is mirrored to the configured bucket and the cloud storage metadata is saved in the `files.extra_json` field. Download uses the local file first and falls back to cloud storage if the local copy is missing. Delete removes the local file and also attempts to remove the cloud object.

Business delivery routes:

```text
POST /api/patients/:id/reminders
POST /api/invoices/:id/send
```

## Backend Smoke Test

```bash
npm run test:backend
```

The smoke test checks health, protected access, owner login, current session, doctors, patient creation, schedule conflict validation, file upload/download/delete with cloud metadata, invoice email delivery, invoice payment, stock movement, system status, backup creation, password reset request, reminders, audit logs and OpenAPI generation.

## Docker

The project includes a production Docker setup:

```bash
docker compose up --build
```

The container runs the Next.js application with the Node.js backend runtime. SQLite data is stored in the `neurodent-data` Docker volume and is not lost when the container restarts.

This is the current production path. Vercel/serverless deployments are preview-only until the PostgreSQL runtime adapter is implemented. Full deployment notes are in:

```text
next-app/docs/DEPLOYMENT.md
```

Optional PostgreSQL service for production migration:

```bash
docker compose --profile postgres up -d postgres
```

PostgreSQL schema:

```text
next-app/backend/postgres/schema.sql
```

PostgreSQL preflight:

```bash
cd next-app
npm run db:postgres:migrate
npm run db:postgres:check
```

These commands apply the prepared schema and verify connection/schema readiness. The main runtime remains SQLite until the PostgreSQL storage adapter is implemented.

## CI

GitHub Actions workflow:

```text
.github/workflows/backend.yml
```

The workflow installs Next.js dependencies, checks backend syntax, runs backend/Next/PostgreSQL preflight tests, and builds the Next.js application.
