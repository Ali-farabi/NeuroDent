import { DELETE, GET, PATCH, POST, PUT } from "../next-app/app/api/[[...path]]/route.js";

const BASE_URL = "http://localhost:3000";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(method, pathname, { body, token } = {}) {
  const headers = new Headers();
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const handlers = { DELETE, GET, PATCH, POST, PUT };
  const handler = handlers[method];
  assert(handler, `unsupported test method: ${method}`);
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

const ready = await request("GET", "/api/ready");
assert(ready.status === 200 && ready.data.database?.ready, "readiness check failed");

const capabilities = await request("GET", "/api/capabilities");
assert(capabilities.status === 200 && capabilities.data.ai?.mode === "demo-rule-based", "capabilities endpoint failed");

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
assert(doctors.data.length > 0, "seed doctors are missing");

const suffix = Date.now().toString().slice(-8);
const testDate = new Date(Date.UTC(
  2090 + (Number(suffix.slice(-4)) % 9),
  Number(suffix.slice(-6, -4)) % 12,
  (Number(suffix.slice(-8, -6)) % 28) + 1,
)).toISOString().slice(0, 10);
const startMinutes = Number(suffix.slice(-4)) % (23 * 60);
const testTime = `${String(Math.floor(startMinutes / 60)).padStart(2, "0")}:${String(startMinutes % 60).padStart(2, "0")}`;
const patient = await request("POST", "/api/patients", {
  token,
  body: {
    name: `Smoke Test Patient ${suffix}`,
    phone: `8700${suffix}`,
    birthDate: "1995-05-10",
    email: `smoke-${suffix}@neurodent.test`,
  },
});
assert(patient.status === 201 && patient.data.id, "patient creation failed");

const doctorId = doctors.data[0].id;
const appointment = await request("POST", "/api/appointments", {
  token,
  body: {
    doctorId,
    patientId: patient.data.id,
    date: testDate,
    time: testTime,
    duration: 30,
  },
});
assert(appointment.status === 201 && appointment.data.id, "appointment creation failed");

const conflict = await request("POST", "/api/appointments", {
  token,
  body: {
    doctorId,
    patientId: patient.data.id,
    date: appointment.data.date,
    time: appointment.data.time,
    duration: 30,
  },
});
assert(conflict.status === 400, "schedule conflict validation failed");

const invoice = await request("POST", "/api/invoices", {
  token,
  body: {
    patientId: patient.data.id,
    items: [{ name: "Smoke test consultation", quantity: 1, unitPrice: 1000 }],
  },
});
assert(invoice.status === 201 && invoice.data.id && invoice.data.total === 1000, "invoice creation failed");

const invoiceEmail = await request("POST", `/api/invoices/${invoice.data.id}/send`, {
  token,
  body: { email: patient.data.email, message: "Smoke test invoice delivery" },
});
assert(invoiceEmail.status === 200 && invoiceEmail.data.invoiceId === invoice.data.id && invoiceEmail.data.delivery?.provider, "invoice email delivery failed");

const payment = await request("POST", `/api/invoices/${invoice.data.id}/pay`, {
  token,
  body: { amount: 1000, method: "cash" },
});
assert(payment.status === 200 && payment.data.status === "paid", "invoice payment failed");

const inventory = await request("GET", "/api/inventory", { token });
assert(inventory.status === 200 && Array.isArray(inventory.data) && inventory.data.length > 0, "inventory endpoint failed");

const stockMovement = await request("POST", "/api/stock-movements", {
  token,
  body: {
    inventoryId: inventory.data[0].id,
    type: "in",
    quantity: 1,
    reason: "Backend smoke test",
  },
});
assert(stockMovement.status === 201 && stockMovement.data.id, "stock movement creation failed");

const system = await request("GET", "/api/admin/system", { token });
assert(system.status === 200 && system.data.storage?.driver === "sqlite", "system status failed");

const integrations = await request("GET", "/api/admin/integrations", { token });
assert(integrations.status === 200 && integrations.data.some((item) => item.provider === "sms"), "integration status failed");

const sessions = await request("GET", "/api/admin/sessions", { token });
assert(sessions.status === 200 && sessions.data.some((item) => item.subjectType === "user"), "sessions endpoint failed");

const exportData = await request("GET", "/api/admin/export", { token });
assert(exportData.status === 200 && exportData.data.format === "neurodent-json-v1", "admin export failed");

const cleanup = await request("POST", "/api/admin/maintenance/cleanup", {
  token,
  body: { backupRetentionDays: 36500 },
});
assert(cleanup.status === 200 && cleanup.data.ok, "maintenance cleanup failed");

const backup = await request("POST", "/api/admin/backups", { token });
assert(backup.status === 201 && backup.data.fileName, "database backup failed");

const deleteBackup = await request("DELETE", `/api/admin/backups/${backup.data.fileName}`, { token });
assert(deleteBackup.status === 200 && deleteBackup.data.ok, "database backup delete failed");

const resetUnknown = await request("POST", "/api/auth/request-password-reset", {
  body: { phone: "00000000000" },
});
assert(resetUnknown.status === 200 && resetUnknown.data.ok, "password reset request failed");

const reminder = await request("POST", `/api/patients/${patient.data.id}/reminders`, {
  token,
  body: { message: "Smoke test reminder", channel: "whatsapp" },
});
assert(reminder.status === 201 && reminder.data.delivery?.provider === "whatsapp", "patient reminder integration failed");

const auditLogs = await request("GET", "/api/audit-logs?limit=20", { token });
assert(auditLogs.status === 200 && Array.isArray(auditLogs.data) && auditLogs.data.length > 0, "audit logs failed");

const openapi = await request("GET", "/api/openapi.json");
assert(openapi.status === 200 && openapi.data.paths?.["/api/admin/system"], "OpenAPI schema failed");

console.log("Backend smoke-test passed");
