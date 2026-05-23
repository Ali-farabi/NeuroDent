import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCHEMA_FILE = path.join(__dirname, "schema.sql");

const EXPECTED_TABLES = [
  "doctors",
  "patients",
  "users",
  "appointments",
  "visits",
  "payments",
  "inventory",
  "files",
  "notifications",
  "audit_logs",
  "conversations",
  "conversation_messages",
  "price_items",
  "invoices",
  "invoice_items",
  "stock_movements",
  "sessions",
  "schema_migrations",
];

let pool = null;

function missingDatabaseUrlHint() {
  return [
    "Set NEURODENT_DATABASE_URL before running PostgreSQL commands.",
    "For local Docker Postgres, run: npm run db:postgres:local, then npm run db:postgres:local:migrate.",
    "For Supabase, put NEURODENT_DATABASE_URL and NEURODENT_POSTGRES_SSL=require in next-app/.env.local.",
  ].join(" ");
}

export function isPostgresConfigured() {
  return Boolean(process.env.NEURODENT_DATABASE_URL || process.env.DATABASE_URL);
}

export function isPostgresRuntimeEnabled() {
  return String(process.env.NEURODENT_STORAGE_DRIVER || "").toLowerCase() === "postgres";
}

function getDatabaseUrl() {
  return process.env.NEURODENT_DATABASE_URL || process.env.DATABASE_URL || "";
}

function getSslConfig(databaseUrl) {
  const requested = String(process.env.NEURODENT_POSTGRES_SSL || "").trim().toLowerCase();
  if (["false", "0", "disable", "disabled", "off"].includes(requested)) return false;
  if (["true", "1", "require", "required", "on"].includes(requested)) {
    return { rejectUnauthorized: process.env.NEURODENT_POSTGRES_SSL_REJECT_UNAUTHORIZED === "true" };
  }

  try {
    const parsed = new URL(databaseUrl);
    const host = parsed.hostname.toLowerCase();
    if (host.endsWith(".supabase.co") || host.includes("pooler.supabase.com")) {
      return { rejectUnauthorized: false };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function getPostgresConfigSummary() {
  const databaseUrl = getDatabaseUrl();
  const source = process.env.NEURODENT_DATABASE_URL ? "NEURODENT_DATABASE_URL" : "DATABASE_URL";
  if (!databaseUrl) {
    return {
      configured: false,
      source: "",
      host: "",
      port: "",
      database: "",
      user: "",
      ssl: "",
      hint: missingDatabaseUrlHint(),
    };
  }

  try {
    const parsed = new URL(databaseUrl);
    const ssl = getSslConfig(databaseUrl);
    return {
      configured: true,
      source,
      host: parsed.hostname,
      port: parsed.port || "5432",
      database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
      user: decodeURIComponent(parsed.username || ""),
      ssl: ssl === false ? "disabled" : ssl ? "required" : "default",
    };
  } catch {
    return {
      configured: true,
      source,
      host: "",
      port: "",
      database: "",
      user: "",
      ssl: "",
      invalid: true,
    };
  }
}

function getPool() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("NEURODENT_DATABASE_URL or DATABASE_URL is required for PostgreSQL");
  }
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      max: Math.max(1, Number(process.env.NEURODENT_POSTGRES_POOL_MAX || 5)),
      connectionTimeoutMillis: Math.max(500, Number(process.env.NEURODENT_POSTGRES_CONNECT_TIMEOUT_MS || 3000)),
      idleTimeoutMillis: Math.max(1000, Number(process.env.NEURODENT_POSTGRES_IDLE_TIMEOUT_MS || 30000)),
      ssl: getSslConfig(databaseUrl),
    });
  }
  return pool;
}

function safeError(error) {
  const message = String(error?.message || "PostgreSQL request failed");
  return {
    message: message.replace(getDatabaseUrl(), "[database-url]"),
    code: error?.code || "",
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectWithRetry() {
  const retries = Math.max(0, Number(process.env.NEURODENT_POSTGRES_CONNECT_RETRIES || 0));
  const retryMs = Math.max(50, Number(process.env.NEURODENT_POSTGRES_CONNECT_RETRY_MS || 500));
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await getPool().connect();
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await delay(retryMs);
    }
  }
  throw lastError;
}

async function getSchemaState(client) {
  const result = await client.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY table_name
    `,
    [EXPECTED_TABLES],
  );
  const existing = result.rows.map((row) => row.table_name);
  const missing = EXPECTED_TABLES.filter((tableName) => !existing.includes(tableName));
  return {
    ready: missing.length === 0,
    existingTables: existing,
    missingTables: missing,
  };
}

export async function checkPostgresConnection() {
  const config = getPostgresConfigSummary();
  if (!config.configured || config.invalid) {
    return {
      ...config,
      reachable: false,
      schemaReady: false,
      runtimeEnabled: isPostgresRuntimeEnabled(),
      error: config.invalid ? { message: "Invalid PostgreSQL connection URL", code: "" } : null,
    };
  }

  try {
    const client = await connectWithRetry();
    try {
      const startedAt = Date.now();
      const info = await client.query(
        `
          SELECT current_database() AS database,
                 current_user AS "user",
                 version() AS version
        `,
      );
      const schema = await getSchemaState(client);
      return {
        ...config,
        reachable: true,
        schemaReady: schema.ready,
        runtimeEnabled: isPostgresRuntimeEnabled(),
        latencyMs: Date.now() - startedAt,
        database: info.rows[0]?.database || config.database,
        user: info.rows[0]?.user || config.user,
        version: info.rows[0]?.version || "",
        missingTables: schema.missingTables,
      };
    } finally {
      client.release();
    }
  } catch (error) {
    return {
      ...config,
      reachable: false,
      schemaReady: false,
      runtimeEnabled: isPostgresRuntimeEnabled(),
      error: safeError(error),
    };
  }
}

export async function applyPostgresSchema() {
  if (!isPostgresConfigured()) {
    throw new Error(missingDatabaseUrlHint());
  }

  const client = await connectWithRetry();
  let inTransaction = false;
  try {
    const schemaSql = await readFile(SCHEMA_FILE, "utf8");
    await client.query("BEGIN");
    inTransaction = true;
    await client.query(schemaSql);
    const appliedAt = new Date().toISOString();
    const migrations = [
      [1, "initial_sqlite_backend"],
      [2, "billing_stock_documents_sessions"],
      [3, "crm_conversations_messages"],
      [4, "postgres_schema_preflight"],
    ];
    for (const [version, name] of migrations) {
      await client.query(
        `
          INSERT INTO schema_migrations (version, name, applied_at)
          VALUES ($1, $2, $3)
          ON CONFLICT (version) DO NOTHING
        `,
        [version, name, appliedAt],
      );
    }
    await client.query("COMMIT");
    inTransaction = false;
  } catch (error) {
    if (inTransaction) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return checkPostgresConnection();
}

export async function postgresQuery(sql, params = []) {
  return getPool().query(sql, params);
}

export async function withPostgresTransaction(fn) {
  const client = await connectWithRetry();
  let inTransaction = false;
  try {
    await client.query("BEGIN");
    inTransaction = true;
    const result = await fn(client);
    await client.query("COMMIT");
    inTransaction = false;
    return result;
  } catch (error) {
    if (inTransaction) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closePostgresPool() {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}
