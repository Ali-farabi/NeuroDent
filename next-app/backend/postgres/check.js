import { configurePostgresCliEnvironment } from "./env.js";
import { checkPostgresConnection, closePostgresPool } from "./client.js";

configurePostgresCliEnvironment();

const skipIfMissing = process.argv.includes("--skip-if-missing");
const allowMissingSchema = process.argv.includes("--allow-missing-schema");

try {
  const status = await checkPostgresConnection();
  console.log(JSON.stringify(status, null, 2));
  if (!status.configured && !skipIfMissing) {
    console.error(status.hint || "Set NEURODENT_DATABASE_URL before running PostgreSQL commands.");
  }

  if (!status.configured && skipIfMissing) {
    process.exitCode = 0;
  } else if (!status.configured || !status.reachable || (!allowMissingSchema && !status.schemaReady)) {
    process.exitCode = 1;
  }
} finally {
  await closePostgresPool();
}
