import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { checkIntegrationHealth } from "../integrations.js";

const { loadEnvConfig } = nextEnv;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_DIR = path.resolve(__dirname, "../..");

loadEnvConfig(APP_DIR, process.env.NODE_ENV !== "production");

const sendWebhookChecks = process.argv.includes("--send-webhook-checks");
const skipIfMissing = process.argv.includes("--skip-if-missing");

const statuses = await checkIntegrationHealth({ sendWebhookChecks });
console.log(JSON.stringify(statuses, null, 2));

const configured = statuses.filter((item) => item.configured);
const failed = statuses.filter((item) => item.health?.status === "failed");
const ready = statuses.filter((item) => item.health?.status === "ready");

if (!configured.length && skipIfMissing) {
  process.exitCode = 0;
} else if (failed.length > 0) {
  process.exitCode = 1;
} else if (configured.some((item) => item.provider === "supabaseStorage") && !ready.some((item) => item.provider === "supabaseStorage")) {
  process.exitCode = 1;
}
