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

export async function getPatientVisits(patientId) {
  return getVisitsByPatient(patientId);
}

export async function getPatientPayments(patientId) {
  return request(`/payments/patient/${encodeURIComponent(patientId)}`);
}

export async function getPaymentsByDate(date) {
  return request(withQuery("/payments", { date }));
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
