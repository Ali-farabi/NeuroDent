import { DELETE, GET, PATCH, POST, PUT } from "../app/api/[[...path]]/route.js";

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

const doctorLogin = await request("POST", "/api/auth/login", {
  body: { phone: "87005551234", password: "doctor" },
});
assert(doctorLogin.status === 200 && doctorLogin.data.token, "doctor login failed");

const adminLogin = await request("POST", "/api/auth/login", {
  body: { phone: "87007654321", password: "admin" },
});
assert(adminLogin.status === 200 && adminLogin.data.token, "admin login failed");

const assistantLogin = await request("POST", "/api/auth/login", {
  body: { phone: "87009871234", password: "assistant" },
});
assert(assistantLogin.status === 200 && assistantLogin.data.token, "assistant login failed");

const roleMatrix = [
  { role: "owner", token, method: "GET", path: "/api/admin/system", status: 200 },
  { role: "owner", token, method: "GET", path: "/api/users", status: 200 },
  { role: "admin", token: adminLogin.data.token, method: "GET", path: "/api/admin/system", status: 403 },
  { role: "admin", token: adminLogin.data.token, method: "GET", path: "/api/invoices", status: 200 },
  { role: "doctor", token: doctorLogin.data.token, method: "GET", path: "/api/admin/system", status: 403 },
  { role: "doctor", token: doctorLogin.data.token, method: "GET", path: "/api/payments", status: 403 },
  { role: "assistant", token: assistantLogin.data.token, method: "GET", path: "/api/users", status: 403 },
  { role: "assistant", token: assistantLogin.data.token, method: "GET", path: "/api/patients", status: 200 },
];

for (const check of roleMatrix) {
  const result = await request(check.method, check.path, { token: check.token });
  assert(result.status === check.status, `${check.role} ${check.method} ${check.path} expected ${check.status}, got ${result.status}`);
}

const doctorForbiddenPayments = await request("GET", `/api/payments/patient/${patient.data.id}`, { token: doctorLogin.data.token });
assert(doctorForbiddenPayments.status === 403, "doctor should not access payments for unrelated patient");

const doctorForbiddenFiles = await request("GET", `/api/files?patientId=${patient.data.id}`, { token: doctorLogin.data.token });
assert(doctorForbiddenFiles.status === 403, "doctor should not access files for unrelated patient");

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

const fileUpload = await request("POST", "/api/files", {
  token,
  body: {
    patientId: patient.data.id,
    fileName: "smoke-test.txt",
    mimeType: "text/plain",
    kind: "xray",
    base64: Buffer.from("NeuroDent smoke file").toString("base64"),
  },
});
assert(fileUpload.status === 201 && fileUpload.data.id && fileUpload.data.cloudStorage?.provider, "file upload with cloud metadata failed");
assert(fileUpload.data.kind === "xray" && fileUpload.data.category === "xray" && fileUpload.data.previewUrl, "file kind/category preview metadata failed");

const xrayFiles = await request("GET", `/api/files?patientId=${patient.data.id}&kind=xray`, { token });
assert(xrayFiles.status === 200 && xrayFiles.data.some((file) => file.id === fileUpload.data.id), "file kind filter failed");

const fileDownload = await request("GET", `/api/files/${fileUpload.data.id}/download`, { token });
assert(fileDownload.status === 200 && String(fileDownload.data).includes("NeuroDent smoke file"), "file download failed");

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

const billingSummary = await request("GET", `/api/patients/${patient.data.id}/billing-summary`, { token });
assert(billingSummary.status === 200 && billingSummary.data.total >= 1000 && billingSummary.data.debt === 0, "patient billing summary failed");

const patientLogin = await request("POST", "/api/auth/login", {
  body: { phone: patient.data.phone, password: "patient" },
});
assert(patientLogin.status === 200 && patientLogin.data.user?.role === "patient", "patient portal login failed");

const appointmentRequest = await request("POST", `/api/patients/${patient.data.id}/appointment-requests`, {
  token: patientLogin.data.token,
  body: {
    doctorId,
    preferredDate: testDate,
    preferredTime: "14:30",
    comment: "Smoke test appointment request",
  },
});
assert(appointmentRequest.status === 201 && appointmentRequest.data.status === "requested", "patient appointment request failed");

const protocolDocument = await request("POST", `/api/patients/${patient.data.id}/documents/protocol`, { token: patientLogin.data.token });
assert(protocolDocument.status === 201 && protocolDocument.data.mimeType === "application/pdf" && protocolDocument.data.kind === "protocol", "patient protocol PDF creation failed");

const latestProtocol = await request("GET", `/api/patients/${patient.data.id}/documents/protocol/latest`, { token: patientLogin.data.token });
assert(latestProtocol.status === 200 && latestProtocol.data?.id === protocolDocument.data.id, "latest patient protocol endpoint failed");

const protocolDownload = await request("GET", `/api/files/${protocolDocument.data.id}/download`, { token: patientLogin.data.token });
assert(protocolDownload.status === 200 && String(protocolDownload.data).startsWith("%PDF-"), "protocol document is not a PDF");

const signedDocument = await request("POST", `/api/documents/${protocolDocument.data.id}/sign`, {
  token,
  body: { signerName: "Smoke Test Owner" },
});
assert(signedDocument.status === 200 && signedDocument.data.signatureId && signedDocument.data.file?.signatureStatus, "signed document status failed");

const patientPasswordChange = await request("POST", "/api/auth/change-password", {
  token: patientLogin.data.token,
  body: { currentPassword: "patient", nextPassword: "portal123" },
});
assert(patientPasswordChange.status === 200 && patientPasswordChange.data.ok, "patient portal password change failed");

const changedPatientLogin = await request("POST", "/api/auth/login", {
  body: { phone: patient.data.phone, password: "portal123" },
});
assert(changedPatientLogin.status === 200 && changedPatientLogin.data.user?.role === "patient", "patient portal changed password login failed");

const patientReset = await request("POST", "/api/auth/request-password-reset", {
  body: { phone: patient.data.phone },
});
assert(patientReset.status === 200 && patientReset.data.ok && patientReset.data.resetToken, "patient portal password reset request failed");

const patientResetApply = await request("POST", "/api/auth/reset-password", {
  body: { token: patientReset.data.resetToken, nextPassword: "portal456" },
});
assert(patientResetApply.status === 200 && patientResetApply.data.ok, "patient portal password reset apply failed");

const resetPatientLogin = await request("POST", "/api/auth/login", {
  body: { phone: patient.data.phone, password: "portal456" },
});
assert(resetPatientLogin.status === 200 && resetPatientLogin.data.user?.role === "patient", "patient portal reset password login failed");

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

const fileDelete = await request("DELETE", `/api/files/${fileUpload.data.id}`, { token });
assert(fileDelete.status === 200 && fileDelete.data.ok, "file delete failed");

const system = await request("GET", "/api/admin/system", { token });
const expectedStorageDriver = String(process.env.NEURODENT_STORAGE_DRIVER || "sqlite").toLowerCase() === "postgres"
  ? "postgres"
  : "sqlite";
assert(system.status === 200 && system.data.storage?.driver === expectedStorageDriver, "system status failed");

const integrations = await request("GET", "/api/admin/integrations", { token });
assert(integrations.status === 200 && integrations.data.some((item) => item.provider === "sms"), "integration status failed");
assert(integrations.data.some((item) => item.provider === "supabaseStorage"), "Supabase storage integration status failed");

const integrationChecks = await request("POST", "/api/admin/integrations/check", {
  token,
  body: { sendWebhookChecks: false },
});
assert(integrationChecks.status === 200 && integrationChecks.data.some((item) => item.provider === "supabaseStorage"), "integration check failed");

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
