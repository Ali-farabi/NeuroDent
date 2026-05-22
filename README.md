# NeuroDent

The active application is in [`next-app`](./next-app). Work from that folder for development, backend code, API routes and deployment.

```bash
cd next-app
npm install
npm run dev
```

Backend code lives in `next-app/backend`, and runtime data is ignored under `next-app/backend/data`.

Production decision: run the current app with Docker/VPS and a durable volume for `next-app/backend/data`. Vercel/serverless is preview-only until the PostgreSQL runtime adapter is implemented.

See [`next-app/docs/DEPLOYMENT.md`](./next-app/docs/DEPLOYMENT.md) for deployment steps and readiness checks.
