import * as api from "../../../../backend/service.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_ORIGIN = process.env.NEURODENT_CORS_ORIGIN || "*";
const COOKIE_SECURE = process.env.NODE_ENV === "production";
const MAX_BODY_BYTES = Number(process.env.NEURODENT_MAX_BODY_BYTES || 1_000_000);
const API_RATE_LIMIT_MAX = Number(process.env.NEURODENT_RATE_LIMIT_MAX || 300);
const API_RATE_LIMIT_WINDOW_MS = Number(process.env.NEURODENT_RATE_LIMIT_WINDOW_MS || 60_000);
const LOGIN_RATE_LIMIT_MAX = Number(process.env.NEURODENT_LOGIN_RATE_LIMIT_MAX || 20);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": CORS_ORIGIN,
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  ...(CORS_ORIGIN === "*" ? {} : { "Access-Control-Allow-Credentials": "true" }),
};

const apiBuckets = globalThis.__neurodentApiBuckets || new Map();
globalThis.__neurodentApiBuckets = apiBuckets;

const loginBuckets = globalThis.__neurodentLoginBuckets || new Map();
globalThis.__neurodentLoginBuckets = loginBuckets;

function json(payload, status = 200, headers = {}) {
  return Response.json(payload, {
    status,
    headers: {
      ...CORS_HEADERS,
      ...headers,
    },
  });
}

function text(payload, status = 200, contentType = "text/plain; charset=utf-8", headers = {}) {
  return new Response(payload, {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": contentType,
      ...headers,
    },
  });
}

function binary(payload, status = 200, { contentType, fileName } = {}) {
  const headers = {
    ...CORS_HEADERS,
    "Content-Type": contentType || "application/octet-stream",
  };
  if (fileName) {
    headers["Content-Disposition"] = `attachment; filename="${encodeURIComponent(fileName)}"`;
  }
  return new Response(payload, { status, headers });
}

function parseCookies(request) {
  const header = request.headers.get("cookie") || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) return [part, ""];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function getAuthToken(request) {
  const auth = request.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return parseCookies(request).nd_token || "";
}

function authCookie(token) {
  return `nd_token=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 60 * 60}${COOKIE_SECURE ? "; Secure" : ""}`;
}

function clearAuthCookie() {
  return `nd_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${COOKIE_SECURE ? "; Secure" : ""}`;
}

async function getRequestUser(request) {
  return api.getCurrentUser(getAuthToken(request));
}

function forbidden(message = "Недостаточно прав") {
  const err = new Error(message);
  err.statusCode = 403;
  return err;
}

function hasRole(user, allowedRoles) {
  if (!allowedRoles?.length) return true;
  return !!user && allowedRoles.includes(user.role);
}

async function requireRole(request, allowedRoles = []) {
  const user = await getRequestUser(request);
  if (!user) {
    const err = new Error("Требуется вход в систему");
    err.statusCode = 401;
    throw err;
  }
  if (!hasRole(user, allowedRoles)) throw forbidden();
  return user;
}

function patientIdForUser(user) {
  if (!user || user.role !== "patient") return "";
  return String(user.patientId || user.id || "");
}

function scopedPatientId(user, requestedPatientId = "") {
  if (user?.role === "patient") return patientIdForUser(user);
  return String(requestedPatientId || "");
}

function assertPatientAccess(user, patientId) {
  if (user?.role !== "patient") return;
  if (!patientId || String(patientId) !== patientIdForUser(user)) {
    throw forbidden("Пациент может смотреть только свои данные");
  }
}

function assertRecordPatientAccess(user, record) {
  if (user?.role !== "patient") return;
  assertPatientAccess(user, record?.patientId);
}

function routeParams(pathname, pattern) {
  const pathParts = pathname.split("/").filter(Boolean);
  const patternParts = pattern.split("/").filter(Boolean);
  if (pathParts.length !== patternParts.length) return null;
  const params = {};
  for (let i = 0; i < patternParts.length; i += 1) {
    const expected = patternParts[i];
    const actual = pathParts[i];
    if (expected.startsWith(":")) {
      params[expected.slice(1)] = decodeURIComponent(actual);
      continue;
    }
    if (expected !== actual) return null;
  }
  return params;
}

async function readJsonBody(request) {
  const textBody = await request.text();
  if (!textBody.trim()) return {};
  if (textBody.length > MAX_BODY_BYTES) {
    const err = new Error("Request body is too large");
    err.statusCode = 413;
    throw err;
  }
  try {
    return JSON.parse(textBody);
  } catch {
    const err = new Error("Некорректный JSON в теле запроса");
    err.statusCode = 400;
    throw err;
  }
}

function clientKey(request) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0].trim() || request.headers.get("x-real-ip") || "local";
}

function assertRateLimit(request) {
  const key = `${clientKey(request)}:${request.method}:${new URL(request.url).pathname}`;
  const now = Date.now();
  const bucket = (apiBuckets.get(key) || []).filter((time) => now - time < API_RATE_LIMIT_WINDOW_MS);
  if (bucket.length >= API_RATE_LIMIT_MAX) {
    const err = new Error("Too many requests. Please try again later.");
    err.statusCode = 429;
    throw err;
  }
  bucket.push(now);
  apiBuckets.set(key, bucket);
}

function assertLoginRateLimit(request) {
  const key = clientKey(request);
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;
  const bucket = (loginBuckets.get(key) || []).filter((time) => now - time < windowMs);
  if (bucket.length >= LOGIN_RATE_LIMIT_MAX) {
    const err = new Error("Слишком много попыток входа. Попробуйте позже.");
    err.statusCode = 429;
    throw err;
  }
  bucket.push(now);
  loginBuckets.set(key, bucket);
}

function errorResponse(err) {
  const status = Number(err?.statusCode || err?.status || 400);
  return json({ error: err?.message || "Ошибка сервера" }, status);
}

async function handleApi(request) {
  const url = new URL(request.url);
  const { pathname, searchParams } = url;
  const method = request.method || "GET";

  if (method === "GET" && pathname === "/api/health") {
    return json({ ok: true, service: "neurodent-next-backend" });
  }

  if (method === "GET" && pathname === "/api/openapi.json") {
    return json(api.getOpenApiSpec());
  }

  if (method === "GET" && pathname === "/api/docs") {
    return text(api.getApiDocsHtml(), 200, "text/html; charset=utf-8");
  }

  if (method === "POST" && pathname === "/api/auth/login") {
    assertLoginRateLimit(request);
    const body = await readJsonBody(request);
    const result = await api.login(body.phone, body.password);
    return json(result, 200, { "Set-Cookie": authCookie(result.token) });
  }

  if (method === "GET" && pathname === "/api/auth/me") {
    const user = await api.getCurrentUser(getAuthToken(request));
    return json(user ? { user } : { error: "Сессия не найдена" }, user ? 200 : 401);
  }

  if (method === "POST" && pathname === "/api/auth/logout") {
    await api.logout(getAuthToken(request));
    return json({ ok: true }, 200, { "Set-Cookie": clearAuthCookie() });
  }

  if (method === "POST" && pathname === "/api/auth/change-password") {
    const user = await requireRole(request, ["owner", "admin", "doctor", "assistant"]);
    const body = await readJsonBody(request);
    return json(await api.changePassword(user.id, body.currentPassword, body.nextPassword));
  }

  if (method === "POST" && pathname === "/api/auth/request-password-reset") {
    const body = await readJsonBody(request);
    return json(await api.requestPasswordReset(body.phone));
  }

  if (method === "POST" && pathname === "/api/auth/reset-password") {
    const body = await readJsonBody(request);
    return json(await api.resetPassword(body.token, body.nextPassword));
  }

  if (method === "GET" && pathname === "/api/admin/system") {
    await requireRole(request, ["owner"]);
    return json(await api.getSystemStatus());
  }

  if (method === "GET" && pathname === "/api/admin/backups") {
    await requireRole(request, ["owner"]);
    return json(await api.listDatabaseBackups());
  }

  if (method === "POST" && pathname === "/api/admin/backups") {
    const user = await requireRole(request, ["owner"]);
    return json(await api.createDatabaseBackup({ actorUserId: user.id }), 201);
  }

  const backupDownloadParams = routeParams(pathname, "/api/admin/backups/:fileName/download");
  if (method === "GET" && backupDownloadParams) {
    await requireRole(request, ["owner"]);
    const file = await api.getDatabaseBackupDownload(backupDownloadParams.fileName);
    return binary(file.bytes, 200, { contentType: file.mimeType, fileName: file.fileName });
  }

  if (method === "GET" && pathname === "/api/reference/icd10") {
    await requireRole(request, ["owner", "admin", "doctor", "assistant"]);
    return json(await api.getIcd10Reference(searchParams.get("q") || ""));
  }

  if (method === "POST" && pathname === "/api/ai/analyze-transcript") {
    await requireRole(request, ["owner", "doctor", "assistant"]);
    return json(await api.analyzeClinicalTranscript(await readJsonBody(request)));
  }

  if (method === "POST" && pathname === "/api/ai/protocol-draft") {
    const user = await requireRole(request, ["owner", "doctor", "assistant"]);
    return json(await api.draftClinicalProtocol(await readJsonBody(request), { actorUserId: user.id }));
  }

  if (method === "GET" && pathname === "/api/doctors") {
    await requireRole(request, ["owner", "admin", "doctor", "assistant", "patient"]);
    return json(await api.getDoctors());
  }

  if (method === "GET" && pathname === "/api/schedule") {
    await requireRole(request, ["owner", "admin", "doctor", "assistant"]);
    return json(await api.getSchedule(searchParams.get("doctorId"), searchParams.get("date")));
  }

  if (method === "POST" && pathname === "/api/appointments") {
    const user = await requireRole(request, ["owner", "admin", "doctor", "assistant"]);
    return json(await api.createAppointment(await readJsonBody(request), { actorUserId: user.id }), 201);
  }

  if (method === "GET" && pathname === "/api/appointments/active") {
    const user = await requireRole(request, ["owner", "admin", "doctor", "assistant", "patient"]);
    const patientId = scopedPatientId(user, searchParams.get("patientId"));
    assertPatientAccess(user, patientId);
    return json(await api.getActiveAppointmentByPatient(patientId));
  }

  const appointmentStatusParams = routeParams(pathname, "/api/appointments/:id/status");
  if (method === "PATCH" && appointmentStatusParams) {
    const user = await requireRole(request, ["owner", "admin", "doctor", "assistant"]);
    const body = await readJsonBody(request);
    return json(await api.updateAppointmentStatus(appointmentStatusParams.id, body.status, { actorUserId: user.id }));
  }

  if (method === "GET" && pathname === "/api/patients") {
    await requireRole(request, ["owner", "admin", "doctor", "assistant"]);
    return json(await api.searchPatients(searchParams.get("q") || ""));
  }

  if (method === "POST" && pathname === "/api/patients") {
    const user = await requireRole(request, ["owner", "admin"]);
    return json(await api.createPatient(await readJsonBody(request), { actorUserId: user.id }), 201);
  }

  const patientProtocolParams = routeParams(pathname, "/api/patients/:id/protocol");
  if (method === "GET" && patientProtocolParams) {
    const user = await requireRole(request, ["owner", "admin", "doctor", "assistant", "patient"]);
    assertPatientAccess(user, patientProtocolParams.id);
    return text(await api.getPatientProtocol(patientProtocolParams.id));
  }

  const patientMedicalCardParams = routeParams(pathname, "/api/patients/:id/medical-card");
  if (method === "GET" && patientMedicalCardParams) {
    const user = await requireRole(request, ["owner", "admin", "doctor", "assistant", "patient"]);
    assertPatientAccess(user, patientMedicalCardParams.id);
    return json(await api.getPatientMedicalCard(patientMedicalCardParams.id));
  }

  const patientPlanParams = routeParams(pathname, "/api/patients/:id/treatment-plan");
  if (method === "GET" && patientPlanParams) {
    const user = await requireRole(request, ["owner", "admin", "doctor", "assistant", "patient"]);
    assertPatientAccess(user, patientPlanParams.id);
    return json(await api.getPatientTreatmentPlan(patientPlanParams.id));
  }

  const patientAiContextParams = routeParams(pathname, "/api/patients/:id/ai-context");
  if (method === "GET" && patientAiContextParams) {
    const user = await requireRole(request, ["owner", "admin", "doctor", "assistant", "patient"]);
    assertPatientAccess(user, patientAiContextParams.id);
    return json(await api.getPatientAiContext(patientAiContextParams.id));
  }

  const patientToothChartParams = routeParams(pathname, "/api/patients/:id/tooth-chart");
  if (method === "GET" && patientToothChartParams) {
    const user = await requireRole(request, ["owner", "admin", "doctor", "assistant", "patient"]);
    assertPatientAccess(user, patientToothChartParams.id);
    const context = await api.getPatientAiContext(patientToothChartParams.id);
    return json(context.toothChart);
  }

  if (method === "PUT" && patientToothChartParams) {
    const user = await requireRole(request, ["owner", "doctor", "assistant"]);
    return json(await api.savePatientToothChart(patientToothChartParams.id, await readJsonBody(request), { actorUserId: user.id }));
  }

  const patientReminderParams = routeParams(pathname, "/api/patients/:id/reminders");
  if (method === "POST" && patientReminderParams) {
    const user = await requireRole(request, ["owner", "admin", "doctor", "assistant"]);
    const body = await readJsonBody(request);
    return json(await api.sendPatientReminder(patientReminderParams.id, body.message, { actorUserId: user.id }), 201);
  }

  const patientDocumentParams = routeParams(pathname, "/api/patients/:id/documents/protocol");
  if (method === "POST" && patientDocumentParams) {
    const user = await requireRole(request, ["owner", "admin", "doctor", "assistant"]);
    return json(await api.createPatientProtocolDocument(patientDocumentParams.id, { actorUserId: user.id }), 201);
  }

  const patientParams = routeParams(pathname, "/api/patients/:id");
  if (method === "GET" && patientParams) {
    const user = await requireRole(request, ["owner", "admin", "doctor", "assistant", "patient"]);
    assertPatientAccess(user, patientParams.id);
    return json(await api.getPatientById(patientParams.id));
  }
  if (method === "PUT" && patientParams) {
    const user = await requireRole(request, ["owner", "admin"]);
    return json(await api.updatePatient(patientParams.id, await readJsonBody(request), { actorUserId: user.id }));
  }

  if (method === "POST" && pathname === "/api/visits/start") {
    const user = await requireRole(request, ["owner", "doctor", "assistant"]);
    const body = await readJsonBody(request);
    return json(await api.startVisit(body.appointmentId, { actorUserId: user.id }), 201);
  }

  if (method === "POST" && pathname === "/api/visits/finish") {
    const user = await requireRole(request, ["owner", "doctor", "assistant"]);
    const body = await readJsonBody(request);
    return json(await api.finishVisit(body.appointmentId, body.visitData, { actorUserId: user.id }));
  }

  if (method === "GET" && pathname === "/api/visits/all") {
    await requireRole(request, ["owner", "admin", "doctor", "assistant"]);
    return json(await api.getAllVisits({
      query: searchParams.get("q") || "",
      doctorId: searchParams.get("doctorId") || "",
      from: searchParams.get("from") || searchParams.get("dateFrom") || "",
      to: searchParams.get("to") || searchParams.get("dateTo") || "",
    }));
  }

  if (method === "GET" && pathname === "/api/visits") {
    const user = await requireRole(request, ["owner", "admin", "doctor", "assistant", "patient"]);
    const patientId = scopedPatientId(user, searchParams.get("patientId"));
    assertPatientAccess(user, patientId);
    return json(await api.getVisitsByPatient(patientId));
  }

  const visitMaterialsParams = routeParams(pathname, "/api/visits/:id/materials");
  if (method === "GET" && visitMaterialsParams) {
    await requireRole(request, ["owner", "admin", "doctor", "assistant"]);
    return json(await api.getVisitMaterials(visitMaterialsParams.id));
  }

  const visitServicesParams = routeParams(pathname, "/api/visits/:id/services");
  if (method === "GET" && visitServicesParams) {
    await requireRole(request, ["owner", "admin", "doctor", "assistant"]);
    return json(await api.getVisitServices(visitServicesParams.id));
  }

  if (method === "GET" && pathname === "/api/files") {
    const user = await requireRole(request, ["owner", "admin", "doctor", "assistant", "patient"]);
    const patientId = scopedPatientId(user, searchParams.get("patientId"));
    assertPatientAccess(user, patientId);
    return json(await api.getFiles({ patientId, visitId: searchParams.get("visitId") || "" }));
  }

  if (method === "POST" && pathname === "/api/files") {
    const user = await requireRole(request, ["owner", "admin", "doctor", "assistant"]);
    return json(await api.uploadFile(await readJsonBody(request), { actorUserId: user.id }), 201);
  }

  const fileDownloadParams = routeParams(pathname, "/api/files/:id/download");
  if (method === "GET" && fileDownloadParams) {
    const user = await requireRole(request, ["owner", "admin", "doctor", "assistant", "patient"]);
    const download = await api.getFileDownload(fileDownloadParams.id);
    assertRecordPatientAccess(user, download.file);
    return binary(download.bytes, 200, {
      contentType: download.file.mimeType,
      fileName: download.file.fileName,
    });
  }

  const fileParams = routeParams(pathname, "/api/files/:id");
  if (method === "DELETE" && fileParams) {
    const user = await requireRole(request, ["owner", "admin", "doctor", "assistant"]);
    return json(await api.deleteFile(fileParams.id, { actorUserId: user.id }));
  }

  const documentSignParams = routeParams(pathname, "/api/documents/:id/sign");
  if (method === "POST" && documentSignParams) {
    const user = await requireRole(request, ["owner", "doctor"]);
    return json(await api.signDocument(documentSignParams.id, await readJsonBody(request), { actorUserId: user.id }));
  }

  const patientPaymentsParams = routeParams(pathname, "/api/payments/patient/:id");
  if (method === "GET" && patientPaymentsParams) {
    const user = await requireRole(request, ["owner", "admin", "doctor", "assistant", "patient"]);
    assertPatientAccess(user, patientPaymentsParams.id);
    return json(await api.getPaymentsByPatient(patientPaymentsParams.id));
  }

  if (method === "GET" && pathname === "/api/payments") {
    await requireRole(request, ["owner", "admin"]);
    return json(await api.getPaymentsByDate(searchParams.get("date")));
  }

  if (method === "GET" && pathname === "/api/payments/export") {
    await requireRole(request, ["owner", "admin"]);
    return text(await api.exportPaymentsCsv(searchParams.get("date")), 200, "text/csv; charset=utf-8");
  }

  if (method === "POST" && pathname === "/api/payments") {
    const user = await requireRole(request, ["owner", "admin"]);
    return json(await api.createPayment(await readJsonBody(request), { actorUserId: user.id }), 201);
  }

  if (method === "GET" && pathname === "/api/debtors") {
    await requireRole(request, ["owner", "admin"]);
    return json(await api.getDebtors(searchParams.get("q") || ""));
  }

  if (method === "GET" && pathname === "/api/reports/day") {
    await requireRole(request, ["owner", "admin"]);
    return json(await api.getDayReport(searchParams.get("date")));
  }

  if (method === "GET" && pathname === "/api/reports/period") {
    await requireRole(request, ["owner", "admin"]);
    return json(await api.getPeriodReport({
      dateFrom: searchParams.get("dateFrom") || "",
      dateTo: searchParams.get("dateTo") || "",
    }));
  }

  if (method === "GET" && pathname === "/api/analytics/business") {
    await requireRole(request, ["owner", "admin"]);
    return json(await api.getBusinessAnalytics({
      dateFrom: searchParams.get("dateFrom") || "",
      dateTo: searchParams.get("dateTo") || "",
    }));
  }

  if (method === "GET" && pathname === "/api/notifications") {
    const user = await requireRole(request, ["owner", "admin", "doctor", "assistant", "patient"]);
    return json(await api.getNotifications({
      role: searchParams.get("role") || user.role,
      unreadOnly: searchParams.get("unreadOnly") === "true",
    }));
  }

  if (method === "POST" && pathname === "/api/notifications/generate") {
    await requireRole(request, ["owner", "admin"]);
    return json(await api.generateNotifications(), 201);
  }

  const notificationReadParams = routeParams(pathname, "/api/notifications/:id/read");
  if (method === "PATCH" && notificationReadParams) {
    await requireRole(request, ["owner", "admin", "doctor", "assistant", "patient"]);
    const body = await readJsonBody(request);
    return json(await api.markNotificationRead(notificationReadParams.id, body.isRead !== false));
  }

  if (method === "GET" && pathname === "/api/conversations") {
    await requireRole(request, ["owner", "admin", "doctor", "assistant"]);
    return json(await api.getConversations({
      query: searchParams.get("q") || "",
      channel: searchParams.get("channel") || "",
      status: searchParams.get("status") || "",
      patientId: searchParams.get("patientId") || "",
      limit: Number(searchParams.get("limit") || 100),
    }));
  }

  if (method === "POST" && pathname === "/api/conversations") {
    const user = await requireRole(request, ["owner", "admin", "doctor", "assistant"]);
    return json(await api.createConversation(await readJsonBody(request), { actorUserId: user.id }), 201);
  }

  const conversationMessagesParams = routeParams(pathname, "/api/conversations/:id/messages");
  if (method === "GET" && conversationMessagesParams) {
    await requireRole(request, ["owner", "admin", "doctor", "assistant"]);
    return json(await api.getConversationMessages(conversationMessagesParams.id, {
      limit: Number(searchParams.get("limit") || 100),
    }));
  }

  if (method === "POST" && conversationMessagesParams) {
    const user = await requireRole(request, ["owner", "admin", "doctor", "assistant"]);
    return json(await api.sendConversationMessage(conversationMessagesParams.id, await readJsonBody(request), { actorUserId: user.id }), 201);
  }

  const conversationDraftParams = routeParams(pathname, "/api/conversations/:id/ai-draft");
  if (method === "POST" && conversationDraftParams) {
    const user = await requireRole(request, ["owner", "admin", "doctor", "assistant"]);
    return json(await api.createConversationAiDraft(conversationDraftParams.id, await readJsonBody(request), { actorUserId: user.id }), 201);
  }

  const conversationStatusParams = routeParams(pathname, "/api/conversations/:id/status");
  if (method === "PATCH" && conversationStatusParams) {
    const user = await requireRole(request, ["owner", "admin", "doctor", "assistant"]);
    const body = await readJsonBody(request);
    return json(await api.updateConversationStatus(conversationStatusParams.id, body.status, { actorUserId: user.id }));
  }

  const conversationParams = routeParams(pathname, "/api/conversations/:id");
  if (method === "GET" && conversationParams) {
    await requireRole(request, ["owner", "admin", "doctor", "assistant"]);
    return json(await api.getConversation(conversationParams.id));
  }

  if (method === "GET" && pathname === "/api/audit-logs") {
    await requireRole(request, ["owner"]);
    return json(await api.getAuditLogs({
      entityType: searchParams.get("entityType") || "",
      entityId: searchParams.get("entityId") || "",
      dateFrom: searchParams.get("dateFrom") || "",
      dateTo: searchParams.get("dateTo") || "",
      limit: Number(searchParams.get("limit") || 100),
    }));
  }

  if (method === "GET" && pathname === "/api/audit-logs/export") {
    await requireRole(request, ["owner"]);
    return text(await api.exportAuditLogsCsv({
      entityType: searchParams.get("entityType") || "",
      entityId: searchParams.get("entityId") || "",
      dateFrom: searchParams.get("dateFrom") || "",
      dateTo: searchParams.get("dateTo") || "",
      limit: Number(searchParams.get("limit") || 500),
    }), 200, "text/csv; charset=utf-8");
  }

  if (method === "GET" && pathname === "/api/inventory") {
    await requireRole(request, ["owner", "admin", "doctor", "assistant"]);
    return json(await api.getInventoryItems());
  }

  if (method === "POST" && pathname === "/api/inventory") {
    const user = await requireRole(request, ["owner", "admin"]);
    return json(await api.addInventoryItem(await readJsonBody(request), { actorUserId: user.id }), 201);
  }

  const inventoryQuantityParams = routeParams(pathname, "/api/inventory/:id/quantity");
  if (method === "PATCH" && inventoryQuantityParams) {
    const user = await requireRole(request, ["owner", "admin"]);
    const body = await readJsonBody(request);
    return json(await api.updateInventoryQuantity(inventoryQuantityParams.id, Number(body.delta), { actorUserId: user.id }));
  }

  if (method === "GET" && pathname === "/api/price-items") {
    await requireRole(request, ["owner", "admin", "doctor", "assistant"]);
    return json(await api.getPriceItems(searchParams.get("q") || "", searchParams.get("activeOnly") === "true"));
  }

  if (method === "POST" && pathname === "/api/price-items") {
    const user = await requireRole(request, ["owner", "admin"]);
    return json(await api.createPriceItem(await readJsonBody(request), { actorUserId: user.id }), 201);
  }

  const priceItemActiveParams = routeParams(pathname, "/api/price-items/:id/active");
  if (method === "PATCH" && priceItemActiveParams) {
    const user = await requireRole(request, ["owner", "admin"]);
    const body = await readJsonBody(request);
    return json(await api.setPriceItemActive(priceItemActiveParams.id, body.isActive !== false, { actorUserId: user.id }));
  }

  const priceItemParams = routeParams(pathname, "/api/price-items/:id");
  if (method === "PUT" && priceItemParams) {
    const user = await requireRole(request, ["owner", "admin"]);
    return json(await api.updatePriceItem(priceItemParams.id, await readJsonBody(request), { actorUserId: user.id }));
  }

  if (method === "GET" && pathname === "/api/invoices") {
    const user = await requireRole(request, ["owner", "admin", "doctor", "assistant", "patient"]);
    return json(await api.getInvoices({
      patientId: scopedPatientId(user, searchParams.get("patientId")),
      status: searchParams.get("status") || "",
      dateFrom: searchParams.get("dateFrom") || "",
      dateTo: searchParams.get("dateTo") || "",
    }));
  }

  if (method === "POST" && pathname === "/api/invoices") {
    const user = await requireRole(request, ["owner", "admin", "doctor"]);
    return json(await api.createInvoice(await readJsonBody(request), { actorUserId: user.id }), 201);
  }

  const invoicePayParams = routeParams(pathname, "/api/invoices/:id/pay");
  if (method === "POST" && invoicePayParams) {
    const user = await requireRole(request, ["owner", "admin"]);
    return json(await api.payInvoice(invoicePayParams.id, await readJsonBody(request), { actorUserId: user.id }));
  }

  const invoiceParams = routeParams(pathname, "/api/invoices/:id");
  if (method === "GET" && invoiceParams) {
    const user = await requireRole(request, ["owner", "admin", "doctor", "assistant", "patient"]);
    const invoice = await api.getInvoice(invoiceParams.id);
    assertRecordPatientAccess(user, invoice);
    return json(invoice);
  }

  if (method === "GET" && pathname === "/api/stock-movements") {
    await requireRole(request, ["owner", "admin"]);
    return json(await api.getStockMovements({
      inventoryId: searchParams.get("inventoryId") || "",
      dateFrom: searchParams.get("dateFrom") || "",
      dateTo: searchParams.get("dateTo") || "",
      limit: Number(searchParams.get("limit") || 200),
    }));
  }

  if (method === "POST" && pathname === "/api/stock-movements") {
    const user = await requireRole(request, ["owner", "admin"]);
    return json(await api.createStockMovement(await readJsonBody(request), { actorUserId: user.id }), 201);
  }

  if (method === "GET" && pathname === "/api/users") {
    await requireRole(request, ["owner"]);
    return json(await api.getUsers(searchParams.get("q") || ""));
  }

  if (method === "POST" && pathname === "/api/users") {
    const user = await requireRole(request, ["owner"]);
    return json(await api.createUser(await readJsonBody(request), { actorUserId: user.id }), 201);
  }

  const userParams = routeParams(pathname, "/api/users/:id");
  if (method === "PUT" && userParams) {
    const user = await requireRole(request, ["owner"]);
    return json(await api.updateUser(userParams.id, await readJsonBody(request), { actorUserId: user.id }));
  }

  return json({ error: "Маршрут не найден" }, 404);
}

async function handler(request) {
  try {
    if (request.method !== "OPTIONS") assertRateLimit(request);
    return await handleApi(request);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
