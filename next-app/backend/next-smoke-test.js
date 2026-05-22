import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_DIR = path.resolve(__dirname, "..");
const NEXT_BIN = path.join(APP_DIR, "node_modules", "next", "dist", "bin", "next");
const PORT = Number(process.env.NEURODENT_E2E_PORT || 3100);
let baseUrl = process.env.NEURODENT_E2E_BASE_URL || "";
const START_TIMEOUT_MS = 45_000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function healthAt(url) {
  try {
    const response = await fetch(`${url}/api/health`);
    if (!response.ok) return false;
    const data = await response.json();
    return data?.service === "neurodent-next-backend";
  } catch {
    return false;
  }
}

async function findExistingServer() {
  if (baseUrl && await healthAt(baseUrl)) return baseUrl;
  const candidates = [
    `http://127.0.0.1:${PORT}`,
    "http://127.0.0.1:3001",
    "http://localhost:3001",
  ];
  for (const candidate of candidates) {
    if (await healthAt(candidate)) return candidate;
  }
  return "";
}

async function waitForHealth() {
  const startedAt = Date.now();
  let lastError = "";
  while (Date.now() - startedAt < START_TIMEOUT_MS) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (err) {
      lastError = err?.message || "request failed";
    }
    await delay(750);
  }
  throw new Error(`Next server did not become ready: ${lastError}`);
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const text = await response.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { response, data, text };
}

let server = null;
let serverOutput = "";

try {
  const existingServer = await findExistingServer();
  if (existingServer) {
    baseUrl = existingServer;
  } else {
    baseUrl = `http://127.0.0.1:${PORT}`;
    server = spawn(process.execPath, [NEXT_BIN, "dev", "--webpack", "-p", String(PORT)], {
      cwd: APP_DIR,
      env: {
        ...process.env,
        NODE_ENV: "development",
        NEURODENT_CORS_ORIGIN: baseUrl,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout.on("data", (chunk) => {
      serverOutput += chunk.toString();
    });
    server.stderr.on("data", (chunk) => {
      serverOutput += chunk.toString();
    });
    await waitForHealth();
  }

  const loginPage = await request("/login");
  assert(loginPage.response.status === 200, "login page did not load");
  assert(loginPage.text.includes("Neurodent"), "login page HTML does not contain app brand");

  const health = await request("/api/health");
  assert(health.response.status === 200 && health.data?.service === "neurodent-next-backend", "health endpoint did not use Next backend route");

  const login = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "87001234567", password: "1234" }),
  });
  assert(login.response.status === 200 && login.data?.token, "owner login failed through HTTP server");

  const me = await request("/api/auth/me", {
    headers: { Authorization: `Bearer ${login.data.token}` },
  });
  assert(me.response.status === 200 && me.data?.user?.role === "owner", "auth/me failed through HTTP server");

  const schedulePage = await request("/schedule");
  assert(schedulePage.response.status === 200, "dashboard route did not load");

  console.log("Next app smoke-test passed");
} catch (err) {
  console.error(serverOutput);
  throw err;
} finally {
  server?.kill();
}
