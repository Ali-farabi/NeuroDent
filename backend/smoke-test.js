import { GET, POST } from "../next-app/app/api/[[...path]]/route.js";

const BASE_URL = "http://localhost:3000";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(method, pathname, { body, token } = {}) {
  const headers = new Headers();
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const handler = method === "POST" ? POST : GET;
  const response = await handler(new Request(`${BASE_URL}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }));

  const text = await response.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // CSV or binary responses are intentionally left as text.
  }

  return { status: response.status, data };
}

const health = await request("GET", "/api/health");
assert(health.status === 200 && health.data.ok, "health check failed");

const unauthorized = await request("GET", "/api/doctors");
assert(unauthorized.status === 401, "protected route should require auth");

const login = await request("POST", "/api/auth/login", {
  body: { phone: "87001234567", password: "1234" },
});
assert(login.status === 200 && login.data.token, "owner login failed");

const token = login.data.token;
const me = await request("GET", "/api/auth/me", { token });
assert(me.status === 200 && me.data.user?.role === "owner", "current user check failed");

const doctors = await request("GET", "/api/doctors", { token });
assert(doctors.status === 200 && Array.isArray(doctors.data), "doctors endpoint failed");

const system = await request("GET", "/api/admin/system", { token });
assert(system.status === 200 && system.data.storage?.driver === "sqlite", "system status failed");

const backup = await request("POST", "/api/admin/backups", { token });
assert(backup.status === 201 && backup.data.fileName, "database backup failed");

const resetUnknown = await request("POST", "/api/auth/request-password-reset", {
  body: { phone: "00000000000" },
});
assert(resetUnknown.status === 200 && resetUnknown.data.ok, "password reset request failed");

const openapi = await request("GET", "/api/openapi.json");
assert(openapi.status === 200 && openapi.data.paths?.["/api/admin/system"], "OpenAPI schema failed");

console.log("Backend smoke-test passed");
