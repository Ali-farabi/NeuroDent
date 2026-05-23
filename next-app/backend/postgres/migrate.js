import { configurePostgresCliEnvironment } from "./env.js";
import { applyPostgresSchema, closePostgresPool } from "./client.js";

configurePostgresCliEnvironment();

try {
  const status = await applyPostgresSchema();
  console.log(JSON.stringify(status, null, 2));
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
} finally {
  await closePostgresPool();
}
