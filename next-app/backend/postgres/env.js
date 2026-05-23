import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_DIR = path.resolve(__dirname, "../..");
const LOCAL_DATABASE_URL = "postgres://neurodent:neurodent@localhost:5432/neurodent";

export function configurePostgresCliEnvironment(argv = process.argv) {
  loadEnvConfig(APP_DIR, process.env.NODE_ENV !== "production");

  const useLocal = argv.includes("--local");
  if (!useLocal) return { appDir: APP_DIR, local: false };

  if (!process.env.NEURODENT_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.NEURODENT_DATABASE_URL = LOCAL_DATABASE_URL;
  }
  if (!process.env.NEURODENT_POSTGRES_SSL) {
    process.env.NEURODENT_POSTGRES_SSL = "disable";
  }
  if (!process.env.NEURODENT_POSTGRES_CONNECT_RETRIES) {
    process.env.NEURODENT_POSTGRES_CONNECT_RETRIES = "20";
  }
  if (!process.env.NEURODENT_POSTGRES_CONNECT_RETRY_MS) {
    process.env.NEURODENT_POSTGRES_CONNECT_RETRY_MS = "500";
  }

  return {
    appDir: APP_DIR,
    local: true,
    databaseUrl: process.env.NEURODENT_DATABASE_URL || process.env.DATABASE_URL,
  };
}
