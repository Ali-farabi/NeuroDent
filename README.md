# NeuroDent

The active application is in [`next-app`](./next-app). Work from that folder for development, backend code, API routes and deployment.

```bash
cd next-app
npm install
npm run dev
```

Backend code lives in `next-app/backend`, and runtime data is ignored under `next-app/backend/data`.

Production can run with Docker/VPS and durable SQLite data, or with `NEURODENT_STORAGE_DRIVER=postgres` for PostgreSQL/Supabase. Supabase Storage is used for durable uploaded files when server-only storage env vars are configured.

See [`next-app/docs/DEPLOYMENT.md`](./next-app/docs/DEPLOYMENT.md) for deployment steps and readiness checks.
