import { createServer } from "node:http";
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSqliteFilePath } from "./storage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const FRONTEND_DIR = path.join(ROOT_DIR, "frontend");
const DATA_FILE = getSqliteFilePath();
const PORT = Number(process.env.PORT || 3000);
const CORS_ORIGIN = process.env.NEURODENT_CORS_ORIGIN || "*";
const COOKIE_SECURE = process.env.NODE_ENV === "production";
const API_RATE_LIMIT_MAX = Number(process.env.NEURODENT_RATE_LIMIT_MAX || 300);
const API_RATE_LIMIT_WINDOW_MS = Number(process.env.NEURODENT_RATE_LIMIT_WINDOW_MS || 60_000);
const LOGIN_RATE_LIMIT_MAX = Number(process.env.NEURODENT_LOGIN_RATE_LIMIT_MAX || 20);
const MAX_BODY_BYTES = Number(process.env.NEURODENT_MAX_BODY_BYTES || 1_000_000);

const api = await import("./service.js");
const apiBuckets = new Map();
const loginBuckets = new Map();

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (CORS_ORIGIN !== "*") res.setHeader("Access-Control-Allow-Credentials", "true");
}

function sendJson(res, statusCode, payload) {
  setCors(res);
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, payload, contentType = "text/plain; charset=utf-8") {
  setCors(res);
  res.writeHead(statusCode, { "Content-Type": contentType });
  res.end(payload);
}

function sendBinary(res, statusCode, payload, { contentType, fileName } = {}) {
  setCors(res);
  const headers = { "Content-Type": contentType || "application/octet-stream" };
  if (fileName) {
    headers["Content-Disposition"] = `attachment; filename="${encodeURIComponent(fileName)}"`;
  }
  res.writeHead(statusCode, headers);
  res.end(payload);
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
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

function getAuthToken(req) {
  const auth = req.headers.authorization || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return parseCookies(req).nd_token || "";
}

function clientKey(req) {
  const forwarded = req.headers["x-forwarded-for"] || "";
  return String(forwarded).split(",")[0].trim() || req.socket.remoteAddress || "local";
}

function assertBucketLimit(buckets, key, limit, windowMs) {
  const now = Date.now();
  const bucket = (buckets.get(key) || []).filter((time) => now - time < windowMs);
  if (bucket.length >= limit) {
    const err = new Error("Too many requests. Please try again later.");
    err.statusCode = 429;
    throw err;
  }
  bucket.push(now);
  buckets.set(key, bucket);
}

function assertApiRateLimit(req, pathname) {
  assertBucketLimit(
    apiBuckets,
    `${clientKey(req)}:${req.method}:${pathname}`,
    API_RATE_LIMIT_MAX,
    API_RATE_LIMIT_WINDOW_MS,
  );
}

function assertLoginRateLimit(req) {
  assertBucketLimit(loginBuckets, clientKey(req), LOGIN_RATE_LIMIT_MAX, 5 * 60 * 1000);
}

function setAuthCookie(res, token) {
  res.setHeader(
    "Set-Cookie",
    `nd_token=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 60 * 60}${COOKIE_SECURE ? "; Secure" : ""}`,
  );
}

function clearAuthCookie(res) {
  res.setHeader("Set-Cookie", `nd_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${COOKIE_SECURE ? "; Secure" : ""}`);
}

async function getRequestUser(req) {
  return api.getCurrentUser(getAuthToken(req));
}

function hasRole(user, allowedRoles) {
  if (!allowedRoles?.length) return true;
  return !!user && allowedRoles.includes(user.role);
}

function forbidden(message = "Недостаточно прав") {
  const err = new Error(message);
  err.statusCode = 403;
  return err;
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

async function requireRole(req, allowedRoles = []) {
  const user = await getRequestUser(req);
  if (!user) {
    const err = new Error("Требуется вход в систему");
    err.statusCode = 401;
    throw err;
  }
  if (!hasRole(user, allowedRoles)) {
    throw forbidden();
  }
  return user;
}

function sendError(res, err) {
  const statusCode = Number(err?.statusCode || err?.status || 400);
  sendJson(res, statusCode, {
    error: err?.message || "Ошибка сервера",
  });
}

function notFound(message = "Маршрут не найден") {
  const err = new Error(message);
  err.statusCode = 404;
  return err;
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const err = new Error("Слишком большой запрос");
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }

  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    const err = new Error("Некорректный JSON в теле запроса");
    err.statusCode = 400;
    throw err;
  }
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

async function handleApi(req, res, url) {
  const { pathname, searchParams } = url;
  const method = req.method || "GET";
  assertApiRateLimit(req, pathname);

  if (method === "GET" && pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, service: "neurodent-backend" });
  }

  if (method === "GET" && pathname === "/api/ready") {
    return sendJson(res, 200, await api.getReadinessStatus());
  }

  if (method === "GET" && pathname === "/api/capabilities") {
    return sendJson(res, 200, await api.getBackendCapabilities());
  }

  if (method === "GET" && pathname === "/api/openapi.json") {
    return sendJson(res, 200, api.getOpenApiSpec());
  }

  if (method === "GET" && pathname === "/api/docs") {
    return sendText(res, 200, api.getApiDocsHtml(), "text/html; charset=utf-8");
  }

  if (method === "POST" && pathname === "/api/auth/login") {
    assertLoginRateLimit(req);
    const body = await readJsonBody(req);
    const result = await api.login(body.phone, body.password);
    setAuthCookie(res, result.token);
    return sendJson(res, 200, result);
  }

  if (method === "GET" && pathname === "/api/auth/me") {
    const user = await api.getCurrentUser(getAuthToken(req));
    return sendJson(res, user ? 200 : 401, user ? { user } : { error: "Сессия не найдена" });
  }

  if (method === "POST" && pathname === "/api/auth/logout") {
    await api.logout(getAuthToken(req));
    clearAuthCookie(res);
    return sendJson(res, 200, { ok: true });
  }

  if (method === "POST" && pathname === "/api/auth/change-password") {
    const user = await requireRole(req, ["owner", "admin", "doctor", "assistant", "patient"]);
    const body = await readJsonBody(req);
    if (user.role === "patient") {
      return sendJson(res, 200, await api.changePatientPortalPassword(user.patientId || user.id, body.currentPassword, body.nextPassword, { actorUserId: user.id }));
    }
    return sendJson(res, 200, await api.changePassword(user.id, body.currentPassword, body.nextPassword));
  }

  if (method === "POST" && pathname === "/api/auth/request-password-reset") {
    const body = await readJsonBody(req);
    return sendJson(res, 200, await api.requestPasswordReset(body.phone));
  }

  if (method === "POST" && pathname === "/api/auth/reset-password") {
    const body = await readJsonBody(req);
    return sendJson(res, 200, await api.resetPassword(body.token, body.nextPassword));
  }

  if (method === "GET" && pathname === "/api/admin/system") {
    await requireRole(req, ["owner"]);
    return sendJson(res, 200, await api.getSystemStatus());
  }

  if (method === "GET" && pathname === "/api/admin/integrations") {
    await requireRole(req, ["owner"]);
    return sendJson(res, 200, await api.getAdminIntegrations());
  }

  if (method === "POST" && pathname === "/api/admin/email/test") {
    const user = await requireRole(req, ["owner"]);
    return sendJson(res, 200, await api.sendAdminTestEmail(await readJsonBody(req), { actorUserId: user.id }));
  }

  if (method === "GET" && pathname === "/api/admin/sessions") {
    await requireRole(req, ["owner"]);
    return sendJson(res, 200, await api.getAdminSessions({ limit: Number(searchParams.get("limit") || 200) }));
  }

  if (method === "GET" && pathname === "/api/admin/export") {
    await requireRole(req, ["owner"]);
    return sendJson(res, 200, await api.exportSystemData());
  }

  if (method === "POST" && pathname === "/api/admin/maintenance/cleanup") {
    const user = await requireRole(req, ["owner"]);
    return sendJson(res, 200, await api.cleanupSystemMaintenance(await readJsonBody(req), { actorUserId: user.id }));
  }

  if (method === "GET" && pathname === "/api/admin/backups") {
    await requireRole(req, ["owner"]);
    return sendJson(res, 200, await api.listDatabaseBackups());
  }

  if (method === "POST" && pathname === "/api/admin/backups") {
    const user = await requireRole(req, ["owner"]);
    return sendJson(res, 201, await api.createDatabaseBackup({ actorUserId: user.id }));
  }

  const backupParams = routeParams(pathname, "/api/admin/backups/:fileName");
  if (method === "DELETE" && backupParams) {
    const user = await requireRole(req, ["owner"]);
    return sendJson(res, 200, await api.deleteDatabaseBackup(backupParams.fileName, { actorUserId: user.id }));
  }

  const backupDownloadParams = routeParams(pathname, "/api/admin/backups/:fileName/download");
  if (method === "GET" && backupDownloadParams) {
    await requireRole(req, ["owner"]);
    const file = await api.getDatabaseBackupDownload(backupDownloadParams.fileName);
    return sendBinary(res, 200, file.bytes, { contentType: file.mimeType, fileName: file.fileName });
  }

  if (method === "GET" && pathname === "/api/reference/icd10") {
    await requireRole(req, ["owner", "admin", "doctor", "assistant"]);
    return sendJson(res, 200, await api.getIcd10Reference(searchParams.get("q") || ""));
  }

  if (method === "POST" && pathname === "/api/ai/analyze-transcript") {
    await requireRole(req, ["owner", "doctor", "assistant"]);
    return sendJson(res, 200, await api.analyzeClinicalTranscript(await readJsonBody(req)));
  }

  if (method === "POST" && pathname === "/api/ai/protocol-draft") {
    const user = await requireRole(req, ["owner", "doctor", "assistant"]);
    return sendJson(res, 200, await api.draftClinicalProtocol(await readJsonBody(req), { actorUserId: user.id }));
  }

  if (method === "GET" && pathname === "/api/doctors") {
    await requireRole(req, ["owner", "admin", "doctor", "assistant", "patient"]);
    return sendJson(res, 200, await api.getDoctors());
  }

  if (method === "GET" && pathname === "/api/schedule") {
    await requireRole(req, ["owner", "admin", "doctor", "assistant"]);
    return sendJson(
      res,
      200,
      await api.getSchedule(searchParams.get("doctorId"), searchParams.get("date")),
    );
  }

  if (method === "POST" && pathname === "/api/appointments") {
    const user = await requireRole(req, ["owner", "admin", "doctor", "assistant"]);
    return sendJson(res, 201, await api.createAppointment(await readJsonBody(req), { actorUserId: user.id }));
  }

  if (method === "GET" && pathname === "/api/appointments/active") {
    const user = await requireRole(req, ["owner", "admin", "doctor", "assistant", "patient"]);
    const patientId = scopedPatientId(user, searchParams.get("patientId"));
    assertPatientAccess(user, patientId);
    return sendJson(res, 200, await api.getActiveAppointmentByPatient(patientId));
  }

  const appointmentStatusParams = routeParams(pathname, "/api/appointments/:id/status");
  if (method === "PATCH" && appointmentStatusParams) {
    const user = await requireRole(req, ["owner", "admin", "doctor", "assistant"]);
    const body = await readJsonBody(req);
    return sendJson(
      res,
      200,
      await api.updateAppointmentStatus(appointmentStatusParams.id, body.status, { actorUserId: user.id }),
    );
  }

  if (method === "GET" && pathname === "/api/patients") {
    await requireRole(req, ["owner", "admin", "doctor", "assistant"]);
    return sendJson(res, 200, await api.searchPatients(searchParams.get("q") || ""));
  }

  if (method === "POST" && pathname === "/api/patients") {
    const user = await requireRole(req, ["owner", "admin"]);
    return sendJson(res, 201, await api.createPatient(await readJsonBody(req), { actorUserId: user.id }));
  }

  const patientProtocolParams = routeParams(pathname, "/api/patients/:id/protocol");
  if (method === "GET" && patientProtocolParams) {
    const user = await requireRole(req, ["owner", "admin", "doctor", "assistant", "patient"]);
    assertPatientAccess(user, patientProtocolParams.id);
    return sendText(
      res,
      200,
      await api.getPatientProtocol(patientProtocolParams.id),
      "text/plain; charset=utf-8",
    );
  }

  const patientMedicalCardParams = routeParams(pathname, "/api/patients/:id/medical-card");
  if (method === "GET" && patientMedicalCardParams) {
    const user = await requireRole(req, ["owner", "admin", "doctor", "assistant", "patient"]);
    assertPatientAccess(user, patientMedicalCardParams.id);
    return sendJson(res, 200, await api.getPatientMedicalCard(patientMedicalCardParams.id));
  }

  const patientPlanParams = routeParams(pathname, "/api/patients/:id/treatment-plan");
  if (method === "GET" && patientPlanParams) {
    const user = await requireRole(req, ["owner", "admin", "doctor", "assistant", "patient"]);
    assertPatientAccess(user, patientPlanParams.id);
    return sendJson(res, 200, await api.getPatientTreatmentPlan(patientPlanParams.id));
  }

  const patientAiContextParams = routeParams(pathname, "/api/patients/:id/ai-context");
  if (method === "GET" && patientAiContextParams) {
    const user = await requireRole(req, ["owner", "admin", "doctor", "assistant", "patient"]);
    assertPatientAccess(user, patientAiContextParams.id);
    return sendJson(res, 200, await api.getPatientAiContext(patientAiContextParams.id));
  }

  const patientToothChartParams = routeParams(pathname, "/api/patients/:id/tooth-chart");
  if (method === "GET" && patientToothChartParams) {
    const user = await requireRole(req, ["owner", "admin", "doctor", "assistant", "patient"]);
    assertPatientAccess(user, patientToothChartParams.id);
    const context = await api.getPatientAiContext(patientToothChartParams.id);
    return sendJson(res, 200, context.toothChart);
  }

  if (method === "PUT" && patientToothChartParams) {
    const user = await requireRole(req, ["owner", "doctor", "assistant"]);
    return sendJson(res, 200, await api.savePatientToothChart(patientToothChartParams.id, await readJsonBody(req), { actorUserId: user.id }));
  }

  const patientReminderParams = routeParams(pathname, "/api/patients/:id/reminders");
  if (method === "POST" && patientReminderParams) {
    const user = await requireRole(req, ["owner", "admin", "doctor", "assistant"]);
    const body = await readJsonBody(req);
    return sendJson(
      res,
      201,
      await api.sendPatientReminder(patientReminderParams.id, body.message, { actorUserId: user.id, channel: body.channel }),
    );
  }

  const patientDocumentParams = routeParams(pathname, "/api/patients/:id/documents/protocol");
  const latestPatientDocumentParams = routeParams(pathname, "/api/patients/:id/documents/protocol/latest");
  if (method === "GET" && latestPatientDocumentParams) {
    const user = await requireRole(req, ["owner", "admin", "doctor", "assistant", "patient"]);
    assertPatientAccess(user, latestPatientDocumentParams.id);
    return sendJson(res, 200, await api.getLatestPatientProtocolDocument(latestPatientDocumentParams.id));
  }

  if (method === "POST" && patientDocumentParams) {
    const user = await requireRole(req, ["owner", "admin", "doctor", "assistant", "patient"]);
    assertPatientAccess(user, patientDocumentParams.id);
    return sendJson(res, 201, await api.createPatientProtocolDocument(patientDocumentParams.id, { actorUserId: user.id }));
  }

  const patientBillingParams = routeParams(pathname, "/api/patients/:id/billing-summary");
  if (method === "GET" && patientBillingParams) {
    const user = await requireRole(req, ["owner", "admin", "doctor", "assistant", "patient"]);
    assertPatientAccess(user, patientBillingParams.id);
    return sendJson(res, 200, await api.getPatientBillingSummary(patientBillingParams.id));
  }

  const patientAppointmentRequestParams = routeParams(pathname, "/api/patients/:id/appointment-requests");
  if (method === "POST" && patientAppointmentRequestParams) {
    const user = await requireRole(req, ["owner", "admin", "doctor", "assistant", "patient"]);
    assertPatientAccess(user, patientAppointmentRequestParams.id);
    return sendJson(res, 201, await api.createPatientAppointmentRequest(patientAppointmentRequestParams.id, await readJsonBody(req), { actorUserId: user.id }));
  }

  const patientParams = routeParams(pathname, "/api/patients/:id");
  if (method === "GET" && patientParams) {
    const user = await requireRole(req, ["owner", "admin", "doctor", "assistant", "patient"]);
    assertPatientAccess(user, patientParams.id);
    return sendJson(res, 200, await api.getPatientById(patientParams.id));
  }
  if (method === "PUT" && patientParams) {
    const user = await requireRole(req, ["owner", "admin"]);
    return sendJson(res, 200, await api.updatePatient(patientParams.id, await readJsonBody(req), { actorUserId: user.id }));
  }

  if (method === "POST" && pathname === "/api/visits/start") {
    const user = await requireRole(req, ["owner", "doctor", "assistant"]);
    const body = await readJsonBody(req);
    return sendJson(res, 201, await api.startVisit(body.appointmentId, { actorUserId: user.id }));
  }

  if (method === "POST" && pathname === "/api/visits/finish") {
    const user = await requireRole(req, ["owner", "doctor", "assistant"]);
    const body = await readJsonBody(req);
    return sendJson(res, 200, await api.finishVisit(body.appointmentId, body.visitData, { actorUserId: user.id }));
  }

  if (method === "GET" && pathname === "/api/visits") {
    const user = await requireRole(req, ["owner", "admin", "doctor", "assistant", "patient"]);
    const patientId = scopedPatientId(user, searchParams.get("patientId"));
    assertPatientAccess(user, patientId);
    return sendJson(res, 200, await api.getVisitsByPatient(patientId));
  }

  if (method === "GET" && pathname === "/api/visits/all") {
    await requireRole(req, ["owner", "admin", "doctor", "assistant"]);
    return sendJson(
      res,
      200,
      await api.getAllVisits({
        query: searchParams.get("q") || "",
        doctorId: searchParams.get("doctorId") || "",
        from: searchParams.get("from") || searchParams.get("dateFrom") || "",
        to: searchParams.get("to") || searchParams.get("dateTo") || "",
      }),
    );
  }

  const visitMaterialsParams = routeParams(pathname, "/api/visits/:id/materials");
  if (method === "GET" && visitMaterialsParams) {
    await requireRole(req, ["owner", "admin", "doctor", "assistant"]);
    return sendJson(res, 200, await api.getVisitMaterials(visitMaterialsParams.id));
  }

  const visitServicesParams = routeParams(pathname, "/api/visits/:id/services");
  if (method === "GET" && visitServicesParams) {
    await requireRole(req, ["owner", "admin", "doctor", "assistant"]);
    return sendJson(res, 200, await api.getVisitServices(visitServicesParams.id));
  }

  if (method === "GET" && pathname === "/api/files") {
    const user = await requireRole(req, ["owner", "admin", "doctor", "assistant", "patient"]);
    const patientId = scopedPatientId(user, searchParams.get("patientId"));
    assertPatientAccess(user, patientId);
    return sendJson(
      res,
      200,
      await api.getFiles({
        patientId,
        visitId: user.role === "patient" ? "" : searchParams.get("visitId") || "",
        kind: searchParams.get("kind") || "",
        category: searchParams.get("category") || "",
      }),
    );
  }

  if (method === "POST" && pathname === "/api/files") {
    const user = await requireRole(req, ["owner", "admin", "doctor", "assistant"]);
    return sendJson(res, 201, await api.uploadFile(await readJsonBody(req), { actorUserId: user.id }));
  }

  const fileDownloadParams = routeParams(pathname, "/api/files/:id/download");
  if (method === "GET" && fileDownloadParams) {
    const user = await requireRole(req, ["owner", "admin", "doctor", "assistant", "patient"]);
    const result = await api.getFileDownload(fileDownloadParams.id);
    assertRecordPatientAccess(user, result.file);
    return sendBinary(res, 200, result.bytes, {
      contentType: result.file.mimeType,
      fileName: result.file.fileName,
    });
  }

  const fileParams = routeParams(pathname, "/api/files/:id");
  if (method === "DELETE" && fileParams) {
    const user = await requireRole(req, ["owner", "admin", "doctor", "assistant"]);
    return sendJson(res, 200, await api.deleteFile(fileParams.id, { actorUserId: user.id }));
  }

  const documentSignParams = routeParams(pathname, "/api/documents/:id/sign");
  if (method === "POST" && documentSignParams) {
    const user = await requireRole(req, ["owner", "doctor"]);
    return sendJson(res, 200, await api.signDocument(documentSignParams.id, await readJsonBody(req), { actorUserId: user.id }));
  }

  if (method === "GET" && pathname === "/api/payments") {
    await requireRole(req, ["owner", "admin"]);
    return sendJson(res, 200, await api.getPaymentsByDate(searchParams.get("date")));
  }

  const patientPaymentsParams = routeParams(pathname, "/api/payments/patient/:id");
  if (method === "GET" && patientPaymentsParams) {
    const user = await requireRole(req, ["owner", "admin", "doctor", "assistant", "patient"]);
    assertPatientAccess(user, patientPaymentsParams.id);
    return sendJson(res, 200, await api.getPaymentsByPatient(patientPaymentsParams.id));
  }

  if (method === "GET" && pathname === "/api/payments/export") {
    await requireRole(req, ["owner", "admin"]);
    return sendText(
      res,
      200,
      await api.exportPaymentsCsv(searchParams.get("date")),
      "text/csv; charset=utf-8",
    );
  }

  if (method === "POST" && pathname === "/api/payments") {
    const user = await requireRole(req, ["owner", "admin"]);
    return sendJson(res, 201, await api.createPayment(await readJsonBody(req), { actorUserId: user.id }));
  }

  if (method === "GET" && pathname === "/api/debtors") {
    await requireRole(req, ["owner", "admin"]);
    return sendJson(res, 200, await api.getDebtors(searchParams.get("q") || ""));
  }

  if (method === "GET" && pathname === "/api/reports/day") {
    await requireRole(req, ["owner", "admin"]);
    return sendJson(res, 200, await api.getDayReport(searchParams.get("date")));
  }

  if (method === "GET" && pathname === "/api/reports/period") {
    await requireRole(req, ["owner", "admin"]);
    return sendJson(
      res,
      200,
      await api.getPeriodReport({
        dateFrom: searchParams.get("dateFrom") || "",
        dateTo: searchParams.get("dateTo") || "",
      }),
    );
  }

  if (method === "GET" && pathname === "/api/analytics/business") {
    await requireRole(req, ["owner", "admin"]);
    return sendJson(
      res,
      200,
      await api.getBusinessAnalytics({
        dateFrom: searchParams.get("dateFrom") || "",
        dateTo: searchParams.get("dateTo") || "",
      }),
    );
  }

  if (method === "GET" && pathname === "/api/notifications") {
    const user = await requireRole(req, ["owner", "admin", "doctor", "assistant", "patient"]);
    return sendJson(
      res,
      200,
      await api.getNotifications({
        role: searchParams.get("role") || user.role,
        unreadOnly: searchParams.get("unreadOnly") === "true",
      }),
    );
  }

  if (method === "POST" && pathname === "/api/notifications/generate") {
    await requireRole(req, ["owner", "admin"]);
    return sendJson(res, 201, await api.generateNotifications());
  }

  const notificationReadParams = routeParams(pathname, "/api/notifications/:id/read");
  if (method === "PATCH" && notificationReadParams) {
    await requireRole(req, ["owner", "admin", "doctor", "assistant", "patient"]);
    const body = await readJsonBody(req);
    return sendJson(res, 200, await api.markNotificationRead(notificationReadParams.id, body.isRead !== false));
  }

  if (method === "GET" && pathname === "/api/conversations") {
    await requireRole(req, ["owner", "admin", "doctor", "assistant"]);
    return sendJson(
      res,
      200,
      await api.getConversations({
        query: searchParams.get("q") || "",
        channel: searchParams.get("channel") || "",
        status: searchParams.get("status") || "",
        patientId: searchParams.get("patientId") || "",
        limit: Number(searchParams.get("limit") || 100),
      }),
    );
  }

  if (method === "POST" && pathname === "/api/conversations") {
    const user = await requireRole(req, ["owner", "admin", "doctor", "assistant"]);
    return sendJson(res, 201, await api.createConversation(await readJsonBody(req), { actorUserId: user.id }));
  }

  const conversationMessagesParams = routeParams(pathname, "/api/conversations/:id/messages");
  if (method === "GET" && conversationMessagesParams) {
    await requireRole(req, ["owner", "admin", "doctor", "assistant"]);
    return sendJson(
      res,
      200,
      await api.getConversationMessages(conversationMessagesParams.id, {
        limit: Number(searchParams.get("limit") || 100),
      }),
    );
  }

  if (method === "POST" && conversationMessagesParams) {
    const user = await requireRole(req, ["owner", "admin", "doctor", "assistant"]);
    return sendJson(res, 201, await api.sendConversationMessage(conversationMessagesParams.id, await readJsonBody(req), { actorUserId: user.id }));
  }

  const conversationDraftParams = routeParams(pathname, "/api/conversations/:id/ai-draft");
  if (method === "POST" && conversationDraftParams) {
    const user = await requireRole(req, ["owner", "admin", "doctor", "assistant"]);
    return sendJson(res, 201, await api.createConversationAiDraft(conversationDraftParams.id, await readJsonBody(req), { actorUserId: user.id }));
  }

  const conversationStatusParams = routeParams(pathname, "/api/conversations/:id/status");
  if (method === "PATCH" && conversationStatusParams) {
    const user = await requireRole(req, ["owner", "admin", "doctor", "assistant"]);
    const body = await readJsonBody(req);
    return sendJson(res, 200, await api.updateConversationStatus(conversationStatusParams.id, body.status, { actorUserId: user.id }));
  }

  const conversationParams = routeParams(pathname, "/api/conversations/:id");
  if (method === "GET" && conversationParams) {
    await requireRole(req, ["owner", "admin", "doctor", "assistant"]);
    return sendJson(res, 200, await api.getConversation(conversationParams.id));
  }

  if (method === "GET" && pathname === "/api/audit-logs") {
    await requireRole(req, ["owner"]);
    return sendJson(
      res,
      200,
      await api.getAuditLogs({
        entityType: searchParams.get("entityType") || "",
        entityId: searchParams.get("entityId") || "",
        dateFrom: searchParams.get("dateFrom") || "",
        dateTo: searchParams.get("dateTo") || "",
        limit: Number(searchParams.get("limit") || 100),
      }),
    );
  }

  if (method === "GET" && pathname === "/api/audit-logs/export") {
    await requireRole(req, ["owner"]);
    return sendText(
      res,
      200,
      await api.exportAuditLogsCsv({
        entityType: searchParams.get("entityType") || "",
        entityId: searchParams.get("entityId") || "",
        dateFrom: searchParams.get("dateFrom") || "",
        dateTo: searchParams.get("dateTo") || "",
        limit: Number(searchParams.get("limit") || 500),
      }),
      "text/csv; charset=utf-8",
    );
  }

  if (method === "GET" && pathname === "/api/inventory") {
    await requireRole(req, ["owner", "admin", "doctor", "assistant"]);
    return sendJson(res, 200, await api.getInventoryItems());
  }

  if (method === "POST" && pathname === "/api/inventory") {
    const user = await requireRole(req, ["owner", "admin"]);
    return sendJson(res, 201, await api.addInventoryItem(await readJsonBody(req), { actorUserId: user.id }));
  }

  const inventoryQuantityParams = routeParams(pathname, "/api/inventory/:id/quantity");
  if (method === "PATCH" && inventoryQuantityParams) {
    const user = await requireRole(req, ["owner", "admin"]);
    const body = await readJsonBody(req);
    return sendJson(
      res,
      200,
      await api.updateInventoryQuantity(inventoryQuantityParams.id, Number(body.delta), { actorUserId: user.id }),
    );
  }

  if (method === "GET" && pathname === "/api/price-items") {
    await requireRole(req, ["owner", "admin", "doctor", "assistant"]);
    return sendJson(
      res,
      200,
      await api.getPriceItems(searchParams.get("q") || "", searchParams.get("activeOnly") === "true"),
    );
  }

  if (method === "POST" && pathname === "/api/price-items") {
    const user = await requireRole(req, ["owner", "admin"]);
    return sendJson(res, 201, await api.createPriceItem(await readJsonBody(req), { actorUserId: user.id }));
  }

  const priceItemActiveParams = routeParams(pathname, "/api/price-items/:id/active");
  if (method === "PATCH" && priceItemActiveParams) {
    const user = await requireRole(req, ["owner", "admin"]);
    const body = await readJsonBody(req);
    return sendJson(res, 200, await api.setPriceItemActive(priceItemActiveParams.id, body.isActive !== false, { actorUserId: user.id }));
  }

  const priceItemParams = routeParams(pathname, "/api/price-items/:id");
  if (method === "PUT" && priceItemParams) {
    const user = await requireRole(req, ["owner", "admin"]);
    return sendJson(res, 200, await api.updatePriceItem(priceItemParams.id, await readJsonBody(req), { actorUserId: user.id }));
  }

  if (method === "GET" && pathname === "/api/invoices") {
    const user = await requireRole(req, ["owner", "admin", "doctor", "assistant", "patient"]);
    return sendJson(
      res,
      200,
      await api.getInvoices({
        patientId: scopedPatientId(user, searchParams.get("patientId")),
        status: searchParams.get("status") || "",
        dateFrom: searchParams.get("dateFrom") || "",
        dateTo: searchParams.get("dateTo") || "",
      }),
    );
  }

  if (method === "POST" && pathname === "/api/invoices") {
    const user = await requireRole(req, ["owner", "admin", "doctor"]);
    return sendJson(res, 201, await api.createInvoice(await readJsonBody(req), { actorUserId: user.id }));
  }

  const invoiceSendParams = routeParams(pathname, "/api/invoices/:id/send");
  if (method === "POST" && invoiceSendParams) {
    const user = await requireRole(req, ["owner", "admin"]);
    return sendJson(res, 200, await api.sendInvoiceEmail(invoiceSendParams.id, await readJsonBody(req), { actorUserId: user.id }));
  }

  const invoicePayParams = routeParams(pathname, "/api/invoices/:id/pay");
  if (method === "POST" && invoicePayParams) {
    const user = await requireRole(req, ["owner", "admin"]);
    return sendJson(res, 200, await api.payInvoice(invoicePayParams.id, await readJsonBody(req), { actorUserId: user.id }));
  }

  const invoiceParams = routeParams(pathname, "/api/invoices/:id");
  if (method === "GET" && invoiceParams) {
    const user = await requireRole(req, ["owner", "admin", "doctor", "assistant", "patient"]);
    const invoice = await api.getInvoice(invoiceParams.id);
    assertRecordPatientAccess(user, invoice);
    return sendJson(res, 200, invoice);
  }

  if (method === "GET" && pathname === "/api/stock-movements") {
    await requireRole(req, ["owner", "admin"]);
    return sendJson(
      res,
      200,
      await api.getStockMovements({
        inventoryId: searchParams.get("inventoryId") || "",
        dateFrom: searchParams.get("dateFrom") || "",
        dateTo: searchParams.get("dateTo") || "",
        limit: Number(searchParams.get("limit") || 200),
      }),
    );
  }

  if (method === "POST" && pathname === "/api/stock-movements") {
    const user = await requireRole(req, ["owner", "admin"]);
    return sendJson(res, 201, await api.createStockMovement(await readJsonBody(req), { actorUserId: user.id }));
  }

  if (method === "GET" && pathname === "/api/users") {
    await requireRole(req, ["owner"]);
    return sendJson(res, 200, await api.getUsers(searchParams.get("q") || ""));
  }

  if (method === "POST" && pathname === "/api/users") {
    const user = await requireRole(req, ["owner"]);
    return sendJson(res, 201, await api.createUser(await readJsonBody(req), { actorUserId: user.id }));
  }

  const userParams = routeParams(pathname, "/api/users/:id");
  if (method === "PUT" && userParams) {
    const user = await requireRole(req, ["owner"]);
    return sendJson(res, 200, await api.updateUser(userParams.id, await readJsonBody(req), { actorUserId: user.id }));
  }

  throw notFound();
}

function safeStaticPath(pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const resolved = path.resolve(FRONTEND_DIR, `.${decodeURIComponent(requestedPath)}`);
  if (!resolved.startsWith(FRONTEND_DIR)) return null;
  return resolved;
}

async function serveStatic(req, res, url) {
  const filePath = safeStaticPath(url.pathname);
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    const indexPath = path.join(FRONTEND_DIR, "index.html");
    const html = await readFile(indexPath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[".html"] });
    res.end(html);
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
  });
  res.end(await readFile(filePath));
}

const server = createServer(async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || `localhost:${PORT}`}`);

  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    await serveStatic(req, res, url);
  } catch (err) {
    sendError(res, err);
  }
});

server.listen(PORT, () => {
  console.log(`NeuroDent backend: http://localhost:${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
});
