"use client";

const API_BASE = "/api";
let authToken = "";

function withQuery(path, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, value);
    }
  });
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

async function request(path, options = {}) {
  const { method = "GET", body } = options;
  const headers = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const fetchOptions = {
    method,
    headers,
    credentials: "same-origin",
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    fetchOptions.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, fetchOptions);
  } catch {
    throw new Error("Backend недоступен. Запустите Next.js сервер командой: npm run dev");
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.error || data?.message || "Ошибка backend-запроса");
  }
  return data;
}

async function requestText(path, options = {}) {
  const { method = "GET", body } = options;
  const headers = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const fetchOptions = {
    method,
    headers,
    credentials: "same-origin",
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${path}`, fetchOptions);
  const text = await response.text();
  if (!response.ok) {
    try {
      const data = JSON.parse(text);
      throw new Error(data?.error || data?.message || "Ошибка backend-запроса");
    } catch (err) {
      if (err instanceof SyntaxError) throw new Error(text || "Ошибка backend-запроса");
      throw err;
    }
  }
  return text;
}

export async function login(phone, password) {
  const result = await request("/auth/login", {
    method: "POST",
    body: { phone, password },
  });
  authToken = result.token || "";
  return {
    ...(result.user || {}),
    token: result.token,
    expiresAt: result.expiresAt,
  };
}

export async function getCurrentUser() {
  const result = await request("/auth/me");
  return result.user;
}

export async function logout() {
  try {
    await request("/auth/logout", { method: "POST" });
  } finally {
    authToken = "";
  }
}

export async function changePassword(currentPassword, nextPassword) {
  return request("/auth/change-password", {
    method: "POST",
    body: { currentPassword, nextPassword },
  });
}

export async function requestPasswordReset(phone) {
  return request("/auth/request-password-reset", {
    method: "POST",
    body: { phone },
  });
}

export async function resetPassword(token, nextPassword) {
  return request("/auth/reset-password", {
    method: "POST",
    body: { token, nextPassword },
  });
}

export async function searchPatients(query = "") {
  return request(withQuery("/patients", { q: query }));
}

export async function getPatientById(id) {
  return request(`/patients/${encodeURIComponent(id)}`);
}

export async function createPatient(data) {
  return request("/patients", {
    method: "POST",
    body: data,
  });
}

export async function updatePatient(id, patch) {
  return request(`/patients/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: patch,
  });
}

export async function sendPatientReminder(patientId, message, channel = "whatsapp") {
  return request(`/patients/${encodeURIComponent(patientId)}/reminders`, {
    method: "POST",
    body: { message, channel },
  });
}

export async function createPatientProtocolDocument(patientId) {
  return request(`/patients/${encodeURIComponent(patientId)}/documents/protocol`, {
    method: "POST",
  });
}

export async function getPatientVisits(patientId) {
  return getVisitsByPatient(patientId);
}

export async function getPatientPayments(patientId) {
  return request(`/payments/patient/${encodeURIComponent(patientId)}`);
}

export async function getPaymentsByDate(date) {
  return request(withQuery("/payments", { date }));
}

export async function getDebtors(query = "") {
  return request(withQuery("/debtors", { q: query }));
}

export async function exportPaymentsCsv(date) {
  return requestText(withQuery("/payments/export", { date }));
}

export async function createPayment(data) {
  return request("/payments", {
    method: "POST",
    body: data,
  });
}

export async function getInventoryItems() {
  return request("/inventory");
}

export async function addInventoryItem(data) {
  return request("/inventory", {
    method: "POST",
    body: data,
  });
}

export async function updateInventoryQuantity(id, delta) {
  return request(`/inventory/${encodeURIComponent(id)}/quantity`, {
    method: "PATCH",
    body: { delta },
  });
}

export async function getStockMovements(filters = {}) {
  return request(withQuery("/stock-movements", filters));
}

export async function createStockMovement(data) {
  return request("/stock-movements", {
    method: "POST",
    body: data,
  });
}

export async function getDoctors() {
  return request("/doctors");
}

export async function getSchedule(doctorId, date) {
  return request(withQuery("/schedule", { doctorId, date }));
}

export async function updateAppointmentStatus(apptId, newStatus) {
  return request(`/appointments/${encodeURIComponent(apptId)}/status`, {
    method: "PATCH",
    body: { status: newStatus },
  });
}

export async function getVisitsByPatient(patientId) {
  return request(withQuery("/visits", { patientId }));
}

export async function getVisitMaterials(visitId) {
  return request(`/visits/${encodeURIComponent(visitId)}/materials`);
}

export async function getVisitServices(visitId) {
  return request(`/visits/${encodeURIComponent(visitId)}/services`);
}

export async function getActiveAppointmentByPatient(patientId) {
  return request(withQuery("/appointments/active", { patientId }));
}

export async function startVisit(appointmentId) {
  return request("/visits/start", {
    method: "POST",
    body: { appointmentId },
  });
}

export async function finishVisit(appointmentId, visitData) {
  return request("/visits/finish", {
    method: "POST",
    body: { appointmentId, visitData },
  });
}

export async function createAppointment(data) {
  return request("/appointments", {
    method: "POST",
    body: data,
  });
}

export async function getDayReport(date) {
  return request(withQuery("/reports/day", { date }));
}

export async function getPeriodReport(dateFrom, dateTo) {
  return request(withQuery("/reports/period", { dateFrom, dateTo }));
}

export async function getBusinessAnalytics(dateFrom, dateTo) {
  return request(withQuery("/analytics/business", { dateFrom, dateTo }));
}

export async function getNotifications(filters = {}) {
  return request(withQuery("/notifications", filters));
}

export async function generateNotifications() {
  return request("/notifications/generate", { method: "POST" });
}

export async function markNotificationRead(id, isRead = true) {
  return request(`/notifications/${encodeURIComponent(id)}/read`, {
    method: "PATCH",
    body: { isRead },
  });
}

export async function getAuditLogs(filters = {}) {
  return request(withQuery("/audit-logs", filters));
}

export async function exportAuditLogsCsv(filters = {}) {
  return requestText(withQuery("/audit-logs/export", filters));
}

export async function getAllVisits(filters = {}) {
  return request(withQuery("/visits/all", {
    q: filters.query || filters.q || "",
    doctorId: filters.doctorId || "",
    from: filters.from || filters.dateFrom || "",
    to: filters.to || filters.dateTo || "",
  }));
}

export async function getUsers(query = "") {
  return request(withQuery("/users", { q: query }));
}

export async function createUser(data) {
  return request("/users", {
    method: "POST",
    body: data,
  });
}

export async function updateUser(id, patch) {
  return request(`/users/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: patch,
  });
}

export async function getPatientProtocol(patientId) {
  return requestText(`/patients/${encodeURIComponent(patientId)}/protocol`);
}

export async function getPatientMedicalCard(patientId) {
  return request(`/patients/${encodeURIComponent(patientId)}/medical-card`);
}

export async function getPatientTreatmentPlan(patientId) {
  return request(`/patients/${encodeURIComponent(patientId)}/treatment-plan`);
}

export async function getPatientAiContext(patientId) {
  return request(`/patients/${encodeURIComponent(patientId)}/ai-context`);
}

export async function getPatientToothChart(patientId) {
  return request(`/patients/${encodeURIComponent(patientId)}/tooth-chart`);
}

export async function savePatientToothChart(patientId, chart) {
  return request(`/patients/${encodeURIComponent(patientId)}/tooth-chart`, {
    method: "PUT",
    body: chart,
  });
}

export async function getFiles(filters = {}) {
  return request(withQuery("/files", filters));
}

export async function uploadFile(data) {
  return request("/files", {
    method: "POST",
    body: data,
  });
}

export async function deleteFile(id) {
  return request(`/files/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function getFileDownloadUrl(id) {
  return `${API_BASE}/files/${encodeURIComponent(id)}/download`;
}

export async function signDocument(id, data = {}) {
  return request(`/documents/${encodeURIComponent(id)}/sign`, {
    method: "POST",
    body: data,
  });
}

export async function getIcd10Reference(query = "") {
  return request(withQuery("/reference/icd10", { q: query }));
}

export async function analyzeClinicalTranscript(data) {
  return request("/ai/analyze-transcript", {
    method: "POST",
    body: data,
  });
}

export async function draftClinicalProtocol(data) {
  return request("/ai/protocol-draft", {
    method: "POST",
    body: data,
  });
}

export async function getConversations(filters = {}) {
  return request(withQuery("/conversations", filters));
}

export async function createConversation(data = {}) {
  return request("/conversations", {
    method: "POST",
    body: data,
  });
}

export async function getConversation(id) {
  return request(`/conversations/${encodeURIComponent(id)}`);
}

export async function updateConversationStatus(id, status) {
  return request(`/conversations/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: { status },
  });
}

export async function getConversationMessages(id) {
  return request(`/conversations/${encodeURIComponent(id)}/messages`);
}

export async function sendConversationMessage(id, body) {
  return request(`/conversations/${encodeURIComponent(id)}/messages`, {
    method: "POST",
    body,
  });
}

export async function createConversationAiDraft(id, body = {}) {
  return request(`/conversations/${encodeURIComponent(id)}/ai-draft`, {
    method: "POST",
    body,
  });
}

export async function getPriceItems(query = "", activeOnly = false) {
  return request(withQuery("/price-items", { q: query, activeOnly: activeOnly ? "true" : "" }));
}

export async function createPriceItem(data) {
  return request("/price-items", {
    method: "POST",
    body: data,
  });
}

export async function updatePriceItem(id, patch) {
  return request(`/price-items/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: patch,
  });
}

export async function setPriceItemActive(id, isActive) {
  return request(`/price-items/${encodeURIComponent(id)}/active`, {
    method: "PATCH",
    body: { isActive },
  });
}

export async function getInvoices(filters = {}) {
  return request(withQuery("/invoices", filters));
}

export async function createInvoice(data) {
  return request("/invoices", {
    method: "POST",
    body: data,
  });
}

export async function getInvoice(id) {
  return request(`/invoices/${encodeURIComponent(id)}`);
}

export async function sendInvoiceEmail(id, data = {}) {
  return request(`/invoices/${encodeURIComponent(id)}/send`, {
    method: "POST",
    body: data,
  });
}

export async function payInvoice(id, data = {}) {
  return request(`/invoices/${encodeURIComponent(id)}/pay`, {
    method: "POST",
    body: data,
  });
}

export async function getSystemStatus() {
  return request("/admin/system");
}

export async function getAdminIntegrations() {
  return request("/admin/integrations");
}

export async function sendAdminTestEmail(data) {
  return request("/admin/email/test", {
    method: "POST",
    body: data,
  });
}

export async function getAdminSessions(limit = 200) {
  return request(withQuery("/admin/sessions", { limit }));
}

export async function exportSystemData() {
  return request("/admin/export");
}

export async function cleanupSystemMaintenance(data = {}) {
  return request("/admin/maintenance/cleanup", {
    method: "POST",
    body: data,
  });
}

export async function getDatabaseBackups() {
  return request("/admin/backups");
}

export async function createDatabaseBackup() {
  return request("/admin/backups", { method: "POST" });
}

export async function deleteDatabaseBackup(fileName) {
  return request(`/admin/backups/${encodeURIComponent(fileName)}`, {
    method: "DELETE",
  });
}

export function getDatabaseBackupDownloadUrl(fileName) {
  return `${API_BASE}/admin/backups/${encodeURIComponent(fileName)}/download`;
}
