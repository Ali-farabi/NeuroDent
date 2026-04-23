const DEFAULT_LOCAL_API = "http://localhost:3000/api";

function getApiBase() {
  const configured = window.NEURODENT_API_URL;
  if (configured) return configured.replace(/\/$/, "");

  const isLocalHost = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  const isExternalLocalServer = isLocalHost && location.port && location.port !== "3000";

  if (location.protocol === "file:" || isExternalLocalServer) {
    return DEFAULT_LOCAL_API;
  }

  return "/api";
}

const API_BASE = getApiBase();

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
  const fetchOptions = { method, headers };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    fetchOptions.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, fetchOptions);
  } catch {
    throw new Error("Backend недоступен. Запустите сервер командой: npm start");
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
  const fetchOptions = { method, headers };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    fetchOptions.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, fetchOptions);
  } catch {
    throw new Error("Backend недоступен. Запустите сервер командой: npm start");
  }

  const text = await response.text();
  if (!response.ok) {
    try {
      const data = JSON.parse(text);
      throw new Error(data?.error || data?.message || "Ошибка backend-запроса");
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new Error(text || "Ошибка backend-запроса");
      }
      throw err;
    }
  }

  return text;
}

export async function login(phone, password) {
  return request("/auth/login", {
    method: "POST",
    body: { phone, password },
  });
}

export async function getDoctors() {
  return request("/doctors");
}

export async function getSchedule(doctorId, date) {
  return request(withQuery("/schedule", { doctorId, date }));
}

export async function createAppointment(data) {
  return request("/appointments", {
    method: "POST",
    body: data,
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

export async function getActiveAppointmentByPatient(patientId) {
  return request(withQuery("/appointments/active", { patientId }));
}

export async function updateAppointmentStatus(appointmentId, status) {
  return request(`/appointments/${encodeURIComponent(appointmentId)}/status`, {
    method: "PATCH",
    body: { status },
  });
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

export async function createPayment(data) {
  return request("/payments", {
    method: "POST",
    body: data,
  });
}

export async function getPaymentsByDate(date) {
  return request(withQuery("/payments", { date }));
}

export async function exportPaymentsCsv(date) {
  return requestText(withQuery("/payments/export", { date }));
}

export async function getDebtors(query = "") {
  return request(withQuery("/debtors", { q: query }));
}

export async function getDayReport(date) {
  return request(withQuery("/reports/day", { date }));
}

export async function getVisitsByPatient(patientId) {
  return request(withQuery("/visits", { patientId }));
}

export async function getPatientProtocol(patientId) {
  return requestText(`/patients/${encodeURIComponent(patientId)}/protocol`);
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
