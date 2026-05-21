import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "data");
const SQLITE_FILE = path.join(DATA_DIR, "neurodent.sqlite");
const LEGACY_JSON_FILE = path.join(DATA_DIR, "db.json");
const INIT_LOCK_DIR = path.join(DATA_DIR, ".sqlite-init.lock");

let db = null;
let initialized = false;

export function getSqliteFilePath() {
  return SQLITE_FILE;
}

export function checkpointDatabase() {
  getDb().exec("PRAGMA optimize");
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function acquireInitLock() {
  mkdirSync(DATA_DIR, { recursive: true });
  const startedAt = Date.now();
  while (true) {
    try {
      mkdirSync(INIT_LOCK_DIR);
      return () => {
        rmSync(INIT_LOCK_DIR, { recursive: true, force: true });
      };
    } catch (err) {
      if (err?.code !== "EEXIST") throw err;
      try {
        const ageMs = Date.now() - statSync(INIT_LOCK_DIR).mtimeMs;
        if (ageMs > 30_000) {
          rmSync(INIT_LOCK_DIR, { recursive: true, force: true });
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() - startedAt > 10_000) {
        throw new Error("SQLite initialization is locked by another process");
      }
      sleepSync(100);
    }
  }
}

function getDb() {
  if (!db) {
    mkdirSync(DATA_DIR, { recursive: true });
    db = new DatabaseSync(SQLITE_FILE);
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("PRAGMA journal_mode = DELETE");
    db.exec("PRAGMA busy_timeout = 5000");
  }
  return db;
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function encodeJson(value) {
  return JSON.stringify(value ?? null);
}

function readLegacyJson() {
  if (!existsSync(LEGACY_JSON_FILE)) return null;
  try {
    return JSON.parse(readFileSync(LEGACY_JSON_FILE, "utf8"));
  } catch {
    return null;
  }
}

function tableIsEmpty(database, tableName) {
  const row = database.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get();
  return Number(row?.count || 0) === 0;
}

function createSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS doctors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      specialty TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      birth_date TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      extra_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL DEFAULT '',
      password_salt TEXT NOT NULL DEFAULT '',
      patient_id TEXT,
      extra_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      doctor_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      duration INTEGER NOT NULL DEFAULT 30,
      status TEXT NOT NULL,
      visit_id TEXT,
      extra_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS visits (
      id TEXT PRIMARY KEY,
      appointment_id TEXT,
      doctor_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      started_at TEXT NOT NULL DEFAULT '',
      finished_at TEXT,
      complaint TEXT NOT NULL DEFAULT '',
      diagnosis TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      is_final INTEGER NOT NULL DEFAULT 0,
      diagnosis_code TEXT NOT NULL DEFAULT '',
      caries_type TEXT NOT NULL DEFAULT '',
      tooth_number TEXT NOT NULL DEFAULT '',
      protocol_json TEXT NOT NULL DEFAULT '{}',
      materials_json TEXT NOT NULL DEFAULT '[]',
      extra_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      visit_id TEXT,
      amount REAL NOT NULL DEFAULT 0,
      method TEXT NOT NULL,
      extra_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      min_quantity REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'шт',
      extra_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      patient_id TEXT,
      visit_id TEXT,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      extra_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      extra_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      patient_id TEXT,
      channel TEXT NOT NULL,
      external_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      last_message_at TEXT NOT NULL DEFAULT '',
      assigned_user_id TEXT,
      created_at TEXT NOT NULL,
      extra_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS conversation_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      sender_name TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'sent',
      created_at TEXT NOT NULL,
      extra_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS price_items (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      extra_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      visit_id TEXT,
      date TEXT NOT NULL,
      status TEXT NOT NULL,
      subtotal REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      paid REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      extra_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      price_item_id TEXT,
      name TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      extra_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      inventory_id TEXT NOT NULL,
      type TEXT NOT NULL,
      quantity REAL NOT NULL,
      balance_after REAL NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      visit_id TEXT,
      actor_user_id TEXT,
      created_at TEXT NOT NULL,
      extra_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_appointments_doctor_date ON appointments (doctor_id, date);
    CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments (patient_id);
    CREATE INDEX IF NOT EXISTS idx_visits_patient ON visits (patient_id);
    CREATE INDEX IF NOT EXISTS idx_payments_date ON payments (date);
    CREATE INDEX IF NOT EXISTS idx_payments_patient ON payments (patient_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory (category);
    CREATE INDEX IF NOT EXISTS idx_sessions_subject ON sessions (subject_type, subject_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_patient ON conversations (patient_id, status);
    CREATE INDEX IF NOT EXISTS idx_conversations_channel ON conversations (channel, last_message_at);
    CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation ON conversation_messages (conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_invoices_patient ON invoices (patient_id, date);
    CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items (invoice_id);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_inventory ON stock_movements (inventory_id, created_at);
  `);
}

function runMigrations(database) {
  const appliedAt = new Date().toISOString();
  database
    .prepare(`
      INSERT OR IGNORE INTO schema_migrations (version, name, applied_at)
      VALUES (?, ?, ?)
    `)
    .run(1, "initial_sqlite_backend", appliedAt);
  database
    .prepare(`
      INSERT OR IGNORE INTO schema_migrations (version, name, applied_at)
      VALUES (?, ?, ?)
    `)
    .run(2, "billing_stock_documents_sessions", appliedAt);
  database
    .prepare(`
      INSERT OR IGNORE INTO schema_migrations (version, name, applied_at)
      VALUES (?, ?, ?)
    `)
    .run(3, "crm_conversations_messages", appliedAt);
}

function runTransaction(database, fn) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    database.exec("COMMIT");
    return result;
  } catch (err) {
    database.exec("ROLLBACK");
    throw err;
  }
}

function insertSnapshot(database, snapshot) {
  const insertDoctor = database.prepare(`
    INSERT OR REPLACE INTO doctors (id, name, specialty)
    VALUES (?, ?, ?)
  `);
  const insertPatient = database.prepare(`
    INSERT OR REPLACE INTO patients
      (id, name, phone, birth_date, created_at, email, address, extra_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertUser = database.prepare(`
    INSERT OR REPLACE INTO users
      (id, name, phone, email, role, is_active, created_at, password_hash, password_salt, patient_id, extra_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertAppointment = database.prepare(`
    INSERT OR REPLACE INTO appointments
      (id, doctor_id, patient_id, date, time, duration, status, visit_id, extra_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertVisit = database.prepare(`
    INSERT OR REPLACE INTO visits
      (id, appointment_id, doctor_id, patient_id, started_at, finished_at, complaint, diagnosis, notes, is_final,
       diagnosis_code, caries_type, tooth_number, protocol_json, materials_json, extra_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertPayment = database.prepare(`
    INSERT OR REPLACE INTO payments
      (id, date, time, patient_id, visit_id, amount, method, extra_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertInventory = database.prepare(`
    INSERT OR REPLACE INTO inventory
      (id, name, category, quantity, min_quantity, unit, extra_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const doctor of snapshot.doctors || []) {
    insertDoctor.run(doctor.id, doctor.name, doctor.specialty || "");
  }

  for (const patient of snapshot.patients || []) {
    const extra = { ...patient };
    delete extra.id;
    delete extra.name;
    delete extra.phone;
    delete extra.birthDate;
    delete extra.createdAt;
    delete extra.email;
    delete extra.address;
    insertPatient.run(
      patient.id,
      patient.name,
      patient.phone,
      patient.birthDate || "",
      patient.createdAt || "",
      patient.email || "",
      patient.address || "",
      encodeJson(extra),
    );
  }

  for (const user of snapshot.users || []) {
    const extra = { ...user };
    delete extra.id;
    delete extra.name;
    delete extra.phone;
    delete extra.email;
    delete extra.role;
    delete extra.isActive;
    delete extra.createdAt;
    delete extra.passwordHash;
    delete extra.passwordSalt;
    delete extra.patientId;
    insertUser.run(
      user.id,
      user.name,
      user.phone,
      user.email || "",
      user.role,
      user.isActive === false ? 0 : 1,
      user.createdAt || "",
      user.passwordHash || "",
      user.passwordSalt || "",
      user.patientId || null,
      encodeJson(extra),
    );
  }

  for (const appt of snapshot.appointments || []) {
    const extra = { ...appt };
    delete extra.id;
    delete extra.doctorId;
    delete extra.patientId;
    delete extra.date;
    delete extra.time;
    delete extra.duration;
    delete extra.status;
    delete extra.visitId;
    insertAppointment.run(
      appt.id,
      appt.doctorId,
      appt.patientId,
      appt.date,
      appt.time,
      Number(appt.duration || 30),
      appt.status,
      appt.visitId || null,
      encodeJson(extra),
    );
  }

  for (const visit of snapshot.visits || []) {
    const extra = { ...visit };
    delete extra.id;
    delete extra.appointmentId;
    delete extra.doctorId;
    delete extra.patientId;
    delete extra.startedAt;
    delete extra.finishedAt;
    delete extra.complaint;
    delete extra.diagnosis;
    delete extra.notes;
    delete extra.isFinal;
    delete extra.diagnosisCode;
    delete extra.cariesType;
    delete extra.toothNumber;
    delete extra.protocol;
    delete extra.materials;
    insertVisit.run(
      visit.id,
      visit.appointmentId || null,
      visit.doctorId,
      visit.patientId,
      visit.startedAt || "",
      visit.finishedAt || null,
      visit.complaint || "",
      visit.diagnosis || "",
      visit.notes || "",
      visit.isFinal ? 1 : 0,
      visit.diagnosisCode || "",
      visit.cariesType || "",
      visit.toothNumber || "",
      encodeJson(visit.protocol || {}),
      encodeJson(visit.materials || []),
      encodeJson(extra),
    );
  }

  for (const payment of snapshot.payments || []) {
    const extra = { ...payment };
    delete extra.id;
    delete extra.date;
    delete extra.time;
    delete extra.patientId;
    delete extra.visitId;
    delete extra.amount;
    delete extra.method;
    insertPayment.run(
      payment.id,
      payment.date,
      payment.time,
      payment.patientId,
      payment.visitId || null,
      Number(payment.amount || 0),
      payment.method,
      encodeJson(extra),
    );
  }

  for (const item of snapshot.inventory || []) {
    const extra = { ...item };
    delete extra.id;
    delete extra.name;
    delete extra.category;
    delete extra.quantity;
    delete extra.minQuantity;
    delete extra.unit;
    insertInventory.run(
      item.id,
      item.name,
      item.category,
      Number(item.quantity || 0),
      Number(item.minQuantity || 0),
      item.unit || "шт",
      encodeJson(extra),
    );
  }
}

export function initializeStore(seedSnapshot) {
  if (initialized) return;
  const releaseLock = acquireInitLock();
  try {
    if (initialized) return;
    const database = getDb();
    createSchema(database);
    runMigrations(database);

    if (tableIsEmpty(database, "doctors")) {
      const legacySnapshot = readLegacyJson();
      runTransaction(database, () => {
        insertSnapshot(database, legacySnapshot || seedSnapshot);
      });
    }

    initialized = true;
  } finally {
    releaseLock();
  }
}

export function loadDbSnapshot() {
  const database = getDb();
  const doctors = database
    .prepare("SELECT id, name, specialty FROM doctors ORDER BY id")
    .all();

  const patients = database
    .prepare("SELECT * FROM patients ORDER BY created_at DESC, name")
    .all()
    .map((row) => ({
      ...parseJson(row.extra_json, {}),
      id: row.id,
      name: row.name,
      phone: row.phone,
      birthDate: row.birth_date,
      createdAt: row.created_at,
      email: row.email || undefined,
      address: row.address || undefined,
    }));

  const users = database
    .prepare("SELECT * FROM users ORDER BY role = 'owner' DESC, name")
    .all()
    .map((row) => ({
      ...parseJson(row.extra_json, {}),
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      role: row.role,
      isActive: !!row.is_active,
      createdAt: row.created_at,
      passwordHash: row.password_hash || undefined,
      passwordSalt: row.password_salt || undefined,
      patientId: row.patient_id || undefined,
    }));

  const appointments = database
    .prepare("SELECT * FROM appointments ORDER BY date, time")
    .all()
    .map((row) => ({
      ...parseJson(row.extra_json, {}),
      id: row.id,
      doctorId: row.doctor_id,
      patientId: row.patient_id,
      date: row.date,
      time: row.time,
      duration: Number(row.duration),
      status: row.status,
      visitId: row.visit_id,
    }));

  const visits = database
    .prepare("SELECT * FROM visits ORDER BY started_at DESC")
    .all()
    .map((row) => ({
      ...parseJson(row.extra_json, {}),
      id: row.id,
      appointmentId: row.appointment_id,
      doctorId: row.doctor_id,
      patientId: row.patient_id,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      complaint: row.complaint,
      diagnosis: row.diagnosis,
      notes: row.notes,
      isFinal: !!row.is_final,
      diagnosisCode: row.diagnosis_code,
      cariesType: row.caries_type,
      toothNumber: row.tooth_number,
      protocol: parseJson(row.protocol_json, {}),
      materials: parseJson(row.materials_json, []),
    }));

  const payments = database
    .prepare("SELECT * FROM payments ORDER BY date DESC, time DESC")
    .all()
    .map((row) => ({
      ...parseJson(row.extra_json, {}),
      id: row.id,
      date: row.date,
      time: row.time,
      patientId: row.patient_id,
      visitId: row.visit_id,
      amount: Number(row.amount),
      method: row.method,
    }));

  const inventory = database
    .prepare("SELECT * FROM inventory ORDER BY category, name")
    .all()
    .map((row) => ({
      ...parseJson(row.extra_json, {}),
      id: row.id,
      name: row.name,
      category: row.category,
      quantity: Number(row.quantity),
      minQuantity: Number(row.min_quantity),
      unit: row.unit,
    }));

  return {
    doctors,
    patients,
    appointments,
    visits,
    payments,
    inventory,
    users,
  };
}

export function persistDbSnapshot(snapshot) {
  const database = getDb();
  runTransaction(database, () => {
    database.exec(`
      DELETE FROM inventory;
      DELETE FROM payments;
      DELETE FROM visits;
      DELETE FROM appointments;
      DELETE FROM users;
      DELETE FROM patients;
      DELETE FROM doctors;
    `);
    insertSnapshot(database, snapshot);
  });
}

export function createSessionRecord({ token, subjectType, subjectId, createdAt, expiresAt }) {
  const database = getDb();
  database
    .prepare(`
      INSERT OR REPLACE INTO sessions (token, subject_type, subject_id, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `)
    .run(token, subjectType, subjectId, createdAt, expiresAt);
}

export function getSessionRecord(token) {
  if (!token) return null;
  const database = getDb();
  const row = database
    .prepare(`
      SELECT token, subject_type AS subjectType, subject_id AS subjectId, created_at AS createdAt, expires_at AS expiresAt
      FROM sessions
      WHERE token = ?
    `)
    .get(token);
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() <= Date.now()) {
    deleteSessionRecord(token);
    return null;
  }
  return row;
}

export function deleteSessionRecord(token) {
  if (!token) return;
  const database = getDb();
  database.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function deleteExpiredSessions(nowIso = new Date().toISOString()) {
  const database = getDb();
  const result = database.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(nowIso);
  return Number(result?.changes || 0);
}

export function listSessionRecords({ limit = 200 } = {}) {
  const database = getDb();
  return database
    .prepare(`
      SELECT token, subject_type AS subjectType, subject_id AS subjectId, created_at AS createdAt, expires_at AS expiresAt
      FROM sessions
      ORDER BY expires_at DESC
      LIMIT ?
    `)
    .all(Number(limit || 200));
}

function mapFile(row) {
  return {
    ...parseJson(row.extra_json, {}),
    id: row.id,
    patientId: row.patient_id || "",
    visitId: row.visit_id || "",
    fileName: row.file_name,
    mimeType: row.mime_type,
    storagePath: row.storage_path,
    createdAt: row.created_at,
  };
}

export function createFileRecord(file) {
  const database = getDb();
  database
    .prepare(`
      INSERT INTO files
        (id, patient_id, visit_id, file_name, mime_type, storage_path, created_at, extra_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      file.id,
      file.patientId || null,
      file.visitId || null,
      file.fileName,
      file.mimeType,
      file.storagePath,
      file.createdAt,
      encodeJson(file.extra || {}),
    );
  return getFileRecord(file.id);
}

export function getFileRecord(id) {
  const database = getDb();
  const row = database.prepare("SELECT * FROM files WHERE id = ?").get(id);
  return row ? mapFile(row) : null;
}

export function listFileRecords({ patientId = "", visitId = "" } = {}) {
  const database = getDb();
  if (patientId) {
    return database
      .prepare("SELECT * FROM files WHERE patient_id = ? ORDER BY created_at DESC")
      .all(patientId)
      .map(mapFile);
  }
  if (visitId) {
    return database
      .prepare("SELECT * FROM files WHERE visit_id = ? ORDER BY created_at DESC")
      .all(visitId)
      .map(mapFile);
  }
  return database.prepare("SELECT * FROM files ORDER BY created_at DESC").all().map(mapFile);
}

export function deleteFileRecord(id) {
  const database = getDb();
  database.prepare("DELETE FROM files WHERE id = ?").run(id);
}

function mapNotification(row) {
  return {
    ...parseJson(row.extra_json, {}),
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    role: row.role,
    isRead: !!row.is_read,
    createdAt: row.created_at,
  };
}

export function createNotificationRecord(notification) {
  const database = getDb();
  database
    .prepare(`
      INSERT OR REPLACE INTO notifications
        (id, type, title, body, role, is_read, created_at, extra_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      notification.id,
      notification.type,
      notification.title,
      notification.body || "",
      notification.role || "",
      notification.isRead ? 1 : 0,
      notification.createdAt,
      encodeJson(notification.extra || {}),
    );
  return getNotificationRecord(notification.id);
}

export function getNotificationRecord(id) {
  const database = getDb();
  const row = database.prepare("SELECT * FROM notifications WHERE id = ?").get(id);
  return row ? mapNotification(row) : null;
}

export function listNotificationRecords({ role = "", unreadOnly = false } = {}) {
  const database = getDb();
  const params = [];
  const where = [];
  if (role) {
    where.push("(role = '' OR role = ?)");
    params.push(role);
  }
  if (unreadOnly) {
    where.push("is_read = 0");
  }
  const sql = `SELECT * FROM notifications${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC`;
  return database.prepare(sql).all(...params).map(mapNotification);
}

export function markNotificationReadRecord(id, isRead = true) {
  const database = getDb();
  database.prepare("UPDATE notifications SET is_read = ? WHERE id = ?").run(isRead ? 1 : 0, id);
  return getNotificationRecord(id);
}

export function createAuditLogRecord({ actorUserId = "", action, entityType, entityId, createdAt, details = {} }) {
  const database = getDb();
  database
    .prepare(`
      INSERT INTO audit_logs
        (actor_user_id, action, entity_type, entity_id, created_at, details_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(actorUserId || null, action, entityType, entityId, createdAt, encodeJson(details));
}

export function listAuditLogRecords({ entityType = "", entityId = "", dateFrom = "", dateTo = "", limit = 100 } = {}) {
  const database = getDb();
  const params = [];
  const where = [];
  if (entityType) {
    where.push("entity_type = ?");
    params.push(entityType);
  }
  if (entityId) {
    where.push("entity_id = ?");
    params.push(entityId);
  }
  if (dateFrom) {
    where.push("created_at >= ?");
    params.push(`${dateFrom}T00:00:00`);
  }
  if (dateTo) {
    where.push("created_at <= ?");
    params.push(`${dateTo}T23:59:59`);
  }
  params.push(Math.max(1, Math.min(Number(limit) || 100, 500)));
  const sql = `
    SELECT id, actor_user_id AS actorUserId, action, entity_type AS entityType,
           entity_id AS entityId, created_at AS createdAt, details_json AS detailsJson
    FROM audit_logs
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY id DESC
    LIMIT ?
  `;
  return database.prepare(sql).all(...params).map((row) => ({
    id: row.id,
    actorUserId: row.actorUserId || "",
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    createdAt: row.createdAt,
    details: parseJson(row.detailsJson, {}),
  }));
}

function mapConversation(row) {
  return {
    ...parseJson(row.extra_json, {}),
    id: row.id,
    patientId: row.patient_id || "",
    channel: row.channel,
    externalId: row.external_id || "",
    title: row.title || "",
    status: row.status,
    lastMessageAt: row.last_message_at || "",
    assignedUserId: row.assigned_user_id || "",
    createdAt: row.created_at,
  };
}

function mapConversationMessage(row) {
  return {
    ...parseJson(row.extra_json, {}),
    id: row.id,
    conversationId: row.conversation_id,
    direction: row.direction,
    senderName: row.sender_name || "",
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function upsertConversationRecord(conversation) {
  const database = getDb();
  database
    .prepare(`
      INSERT OR REPLACE INTO conversations
        (id, patient_id, channel, external_id, title, status, last_message_at, assigned_user_id, created_at, extra_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      conversation.id,
      conversation.patientId || null,
      conversation.channel,
      conversation.externalId || "",
      conversation.title || "",
      conversation.status || "open",
      conversation.lastMessageAt || conversation.createdAt,
      conversation.assignedUserId || null,
      conversation.createdAt,
      encodeJson(conversation.extra || {}),
    );
  return getConversationRecord(conversation.id);
}

export function getConversationRecord(id) {
  const database = getDb();
  const row = database.prepare("SELECT * FROM conversations WHERE id = ?").get(id);
  if (!row) return null;
  const conversation = mapConversation(row);
  const lastMessage = database
    .prepare("SELECT * FROM conversation_messages WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1")
    .get(id);
  return {
    ...conversation,
    lastMessage: lastMessage ? mapConversationMessage(lastMessage) : null,
  };
}

export function listConversationRecords({ query = "", channel = "", status = "", patientId = "", limit = 100 } = {}) {
  const database = getDb();
  const params = [];
  const where = [];
  const q = String(query || "").trim().toLowerCase();
  if (q) {
    where.push("(LOWER(title) LIKE ? OR LOWER(external_id) LIKE ? OR LOWER(channel) LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (channel) {
    where.push("channel = ?");
    params.push(channel);
  }
  if (status) {
    where.push("status = ?");
    params.push(status);
  }
  if (patientId) {
    where.push("patient_id = ?");
    params.push(patientId);
  }
  params.push(Math.max(1, Math.min(Number(limit) || 100, 500)));
  const sql = `SELECT * FROM conversations${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY last_message_at DESC, created_at DESC LIMIT ?`;
  return database.prepare(sql).all(...params).map((row) => getConversationRecord(row.id));
}

export function createConversationMessageRecord(message) {
  const database = getDb();
  runTransaction(database, () => {
    database
      .prepare(`
        INSERT INTO conversation_messages
          (id, conversation_id, direction, sender_name, body, status, created_at, extra_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        message.id,
        message.conversationId,
        message.direction,
        message.senderName || "",
        message.body,
        message.status || "sent",
        message.createdAt,
        encodeJson(message.extra || {}),
      );
    database
      .prepare("UPDATE conversations SET last_message_at = ? WHERE id = ?")
      .run(message.createdAt, message.conversationId);
  });
  const row = database.prepare("SELECT * FROM conversation_messages WHERE id = ?").get(message.id);
  return row ? mapConversationMessage(row) : null;
}

export function listConversationMessageRecords({ conversationId, limit = 100 } = {}) {
  const database = getDb();
  return database
    .prepare(`
      SELECT * FROM conversation_messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC, rowid ASC
      LIMIT ?
    `)
    .all(conversationId, Math.max(1, Math.min(Number(limit) || 100, 500)))
    .map(mapConversationMessage);
}

function mapPriceItem(row) {
  return {
    ...parseJson(row.extra_json, {}),
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    price: Number(row.price),
    isActive: !!row.is_active,
    createdAt: row.created_at,
  };
}

export function upsertPriceItemRecord(item) {
  const database = getDb();
  database
    .prepare(`
      INSERT OR REPLACE INTO price_items
        (id, code, name, category, price, is_active, created_at, extra_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      item.id,
      item.code,
      item.name,
      item.category || "",
      Number(item.price || 0),
      item.isActive === false ? 0 : 1,
      item.createdAt,
      encodeJson(item.extra || {}),
    );
  return getPriceItemRecord(item.id);
}

export function getPriceItemRecord(idOrCode) {
  const database = getDb();
  const row = database
    .prepare("SELECT * FROM price_items WHERE id = ? OR code = ?")
    .get(idOrCode, idOrCode);
  return row ? mapPriceItem(row) : null;
}

export function listPriceItemRecords({ query = "", activeOnly = false } = {}) {
  const database = getDb();
  const params = [];
  const where = [];
  const q = String(query || "").trim().toLowerCase();
  if (q) {
    where.push("(LOWER(name) LIKE ? OR LOWER(code) LIKE ? OR LOWER(category) LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (activeOnly) {
    where.push("is_active = 1");
  }
  const sql = `SELECT * FROM price_items${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY category, name`;
  return database.prepare(sql).all(...params).map(mapPriceItem);
}

export function setPriceItemActiveRecord(id, isActive) {
  const database = getDb();
  database.prepare("UPDATE price_items SET is_active = ? WHERE id = ?").run(isActive ? 1 : 0, id);
  return getPriceItemRecord(id);
}

function mapInvoice(row) {
  return {
    ...parseJson(row.extra_json, {}),
    id: row.id,
    patientId: row.patient_id,
    visitId: row.visit_id || "",
    date: row.date,
    status: row.status,
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    total: Number(row.total),
    paid: Number(row.paid),
    createdAt: row.created_at,
  };
}

function mapInvoiceItem(row) {
  return {
    ...parseJson(row.extra_json, {}),
    id: row.id,
    invoiceId: row.invoice_id,
    priceItemId: row.price_item_id || "",
    name: row.name,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    total: Number(row.total),
  };
}

export function createInvoiceRecord(invoice, items) {
  const database = getDb();
  runTransaction(database, () => {
    database
      .prepare(`
        INSERT INTO invoices
          (id, patient_id, visit_id, date, status, subtotal, discount, total, paid, created_at, extra_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        invoice.id,
        invoice.patientId,
        invoice.visitId || null,
        invoice.date,
        invoice.status,
        Number(invoice.subtotal || 0),
        Number(invoice.discount || 0),
        Number(invoice.total || 0),
        Number(invoice.paid || 0),
        invoice.createdAt,
        encodeJson(invoice.extra || {}),
      );

    const insertItem = database.prepare(`
      INSERT INTO invoice_items
        (id, invoice_id, price_item_id, name, quantity, unit_price, total, extra_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of items || []) {
      insertItem.run(
        item.id,
        invoice.id,
        item.priceItemId || null,
        item.name,
        Number(item.quantity || 1),
        Number(item.unitPrice || 0),
        Number(item.total || 0),
        encodeJson(item.extra || {}),
      );
    }
  });
  return getInvoiceRecord(invoice.id);
}

export function getInvoiceRecord(id) {
  const database = getDb();
  const invoiceRow = database.prepare("SELECT * FROM invoices WHERE id = ?").get(id);
  if (!invoiceRow) return null;
  const items = database
    .prepare("SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY rowid")
    .all(id)
    .map(mapInvoiceItem);
  return { ...mapInvoice(invoiceRow), items };
}

export function listInvoiceRecords({ patientId = "", status = "", dateFrom = "", dateTo = "" } = {}) {
  const database = getDb();
  const where = [];
  const params = [];
  if (patientId) {
    where.push("patient_id = ?");
    params.push(patientId);
  }
  if (status) {
    where.push("status = ?");
    params.push(status);
  }
  if (dateFrom) {
    where.push("date >= ?");
    params.push(dateFrom);
  }
  if (dateTo) {
    where.push("date <= ?");
    params.push(dateTo);
  }
  const sql = `SELECT * FROM invoices${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY date DESC, created_at DESC`;
  return database.prepare(sql).all(...params).map((row) => getInvoiceRecord(row.id));
}

export function updateInvoicePaymentRecord(id, paid, status) {
  const database = getDb();
  database.prepare("UPDATE invoices SET paid = ?, status = ? WHERE id = ?").run(Number(paid || 0), status, id);
  return getInvoiceRecord(id);
}

function mapStockMovement(row) {
  return {
    ...parseJson(row.extra_json, {}),
    id: row.id,
    inventoryId: row.inventory_id,
    type: row.type,
    quantity: Number(row.quantity),
    balanceAfter: Number(row.balance_after),
    reason: row.reason,
    visitId: row.visit_id || "",
    actorUserId: row.actor_user_id || "",
    createdAt: row.created_at,
  };
}

export function createStockMovementRecord(movement) {
  const database = getDb();
  database
    .prepare(`
      INSERT INTO stock_movements
        (id, inventory_id, type, quantity, balance_after, reason, visit_id, actor_user_id, created_at, extra_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      movement.id,
      movement.inventoryId,
      movement.type,
      Number(movement.quantity || 0),
      Number(movement.balanceAfter || 0),
      movement.reason || "",
      movement.visitId || null,
      movement.actorUserId || null,
      movement.createdAt,
      encodeJson(movement.extra || {}),
    );
  return getStockMovementRecord(movement.id);
}

export function getStockMovementRecord(id) {
  const database = getDb();
  const row = database.prepare("SELECT * FROM stock_movements WHERE id = ?").get(id);
  return row ? mapStockMovement(row) : null;
}

export function listStockMovementRecords({ inventoryId = "", dateFrom = "", dateTo = "", limit = 200 } = {}) {
  const database = getDb();
  const where = [];
  const params = [];
  if (inventoryId) {
    where.push("inventory_id = ?");
    params.push(inventoryId);
  }
  if (dateFrom) {
    where.push("created_at >= ?");
    params.push(`${dateFrom}T00:00:00`);
  }
  if (dateTo) {
    where.push("created_at <= ?");
    params.push(`${dateTo}T23:59:59`);
  }
  params.push(Math.max(1, Math.min(Number(limit) || 200, 1000)));
  const sql = `SELECT * FROM stock_movements${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT ?`;
  return database.prepare(sql).all(...params).map(mapStockMovement);
}
