import { applyPostgresSchema, closePostgresPool } from "./client.js";

try {
  const status = await applyPostgresSchema();
  console.log(JSON.stringify(status, null, 2));
} finally {
  await closePostgresPool();
}
