import { createServer } from "node:http";
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const FRONTEND_DIR = path.join(ROOT_DIR, "frontend");
const DATA_FILE = path.join(__dirname, "data", "db.json");
const PORT = Number(process.env.PORT || 3000);

const api = await import("./service.js");

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
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
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
    if (size > 1_000_000) {
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

  if (method === "GET" && pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, service: "neurodent-backend" });
  }

  if (method === "POST" && pathname === "/api/auth/login") {
    const body = await readJsonBody(req);
    return sendJson(res, 200, await api.login(body.phone, body.password));
  }

  if (method === "GET" && pathname === "/api/doctors") {
    return sendJson(res, 200, await api.getDoctors());
  }

  if (method === "GET" && pathname === "/api/schedule") {
    return sendJson(
      res,
      200,
      await api.getSchedule(searchParams.get("doctorId"), searchParams.get("date")),
    );
  }

  if (method === "POST" && pathname === "/api/appointments") {
    return sendJson(res, 201, await api.createAppointment(await readJsonBody(req)));
  }

  if (method === "GET" && pathname === "/api/appointments/active") {
    return sendJson(res, 200, await api.getActiveAppointmentByPatient(searchParams.get("patientId")));
  }

  const appointmentStatusParams = routeParams(pathname, "/api/appointments/:id/status");
  if (method === "PATCH" && appointmentStatusParams) {
    const body = await readJsonBody(req);
    return sendJson(
      res,
      200,
      await api.updateAppointmentStatus(appointmentStatusParams.id, body.status),
    );
  }

  if (method === "GET" && pathname === "/api/patients") {
    return sendJson(res, 200, await api.searchPatients(searchParams.get("q") || ""));
  }

  if (method === "POST" && pathname === "/api/patients") {
    return sendJson(res, 201, await api.createPatient(await readJsonBody(req)));
  }

  const patientProtocolParams = routeParams(pathname, "/api/patients/:id/protocol");
  if (method === "GET" && patientProtocolParams) {
    return sendText(
      res,
      200,
      await api.getPatientProtocol(patientProtocolParams.id),
      "text/plain; charset=utf-8",
    );
  }

  const patientParams = routeParams(pathname, "/api/patients/:id");
  if (method === "GET" && patientParams) {
    return sendJson(res, 200, await api.getPatientById(patientParams.id));
  }
  if (method === "PUT" && patientParams) {
    return sendJson(res, 200, await api.updatePatient(patientParams.id, await readJsonBody(req)));
  }

  if (method === "POST" && pathname === "/api/visits/start") {
    const body = await readJsonBody(req);
    return sendJson(res, 201, await api.startVisit(body.appointmentId));
  }

  if (method === "POST" && pathname === "/api/visits/finish") {
    const body = await readJsonBody(req);
    return sendJson(res, 200, await api.finishVisit(body.appointmentId, body.visitData));
  }

  if (method === "GET" && pathname === "/api/visits") {
    return sendJson(res, 200, await api.getVisitsByPatient(searchParams.get("patientId")));
  }

  if (method === "GET" && pathname === "/api/payments") {
    return sendJson(res, 200, await api.getPaymentsByDate(searchParams.get("date")));
  }

  if (method === "GET" && pathname === "/api/payments/export") {
    return sendText(
      res,
      200,
      await api.exportPaymentsCsv(searchParams.get("date")),
      "text/csv; charset=utf-8",
    );
  }

  if (method === "POST" && pathname === "/api/payments") {
    return sendJson(res, 201, await api.createPayment(await readJsonBody(req)));
  }

  if (method === "GET" && pathname === "/api/debtors") {
    return sendJson(res, 200, await api.getDebtors(searchParams.get("q") || ""));
  }

  if (method === "GET" && pathname === "/api/reports/day") {
    return sendJson(res, 200, await api.getDayReport(searchParams.get("date")));
  }

  if (method === "GET" && pathname === "/api/inventory") {
    return sendJson(res, 200, await api.getInventoryItems());
  }

  if (method === "POST" && pathname === "/api/inventory") {
    return sendJson(res, 201, await api.addInventoryItem(await readJsonBody(req)));
  }

  const inventoryQuantityParams = routeParams(pathname, "/api/inventory/:id/quantity");
  if (method === "PATCH" && inventoryQuantityParams) {
    const body = await readJsonBody(req);
    return sendJson(
      res,
      200,
      await api.updateInventoryQuantity(inventoryQuantityParams.id, Number(body.delta)),
    );
  }

  if (method === "GET" && pathname === "/api/users") {
    return sendJson(res, 200, await api.getUsers(searchParams.get("q") || ""));
  }

  if (method === "POST" && pathname === "/api/users") {
    return sendJson(res, 201, await api.createUser(await readJsonBody(req)));
  }

  const userParams = routeParams(pathname, "/api/users/:id");
  if (method === "PUT" && userParams) {
    return sendJson(res, 200, await api.updateUser(userParams.id, await readJsonBody(req)));
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
