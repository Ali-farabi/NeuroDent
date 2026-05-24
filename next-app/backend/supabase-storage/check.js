import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { checkSupabaseStorage } from "../integrations.js";

const { loadEnvConfig } = nextEnv;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_DIR = path.resolve(__dirname, "../..");

loadEnvConfig(APP_DIR, process.env.NODE_ENV !== "production");

const skipIfMissing = process.argv.includes("--skip-if-missing");

const status = await checkSupabaseStorage();
console.log(JSON.stringify(status, null, 2));

if (!status.configured && skipIfMissing) {
  process.exitCode = 0;
} else if (!status.configured || !status.reachable || !status.bucketReady) {
  process.exitCode = 1;
}
