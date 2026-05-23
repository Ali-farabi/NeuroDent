import {
  applyPostgresSchema,
  getPostgresConfigSummary,
  postgresQuery,
  withPostgresTransaction,
} from "./client.js";

let initialized = false;

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function encodeJson(value) {
  return JSON.stringify(value ?? null);
}

function bool(value) {
  return value === true || value === 1 || value === "1";
}

function limitNumber(value, fallback, max) {
  return Math.max(1, Math.min(Number(value) || fallback, max));
}

export function getStorageInfo() {
  const config = getPostgresConfigSummary();
  return {
    driver: "postgres",
    requestedDriver: "postgres",
    dataDir: "",
    file: "",
    isServerless: !!process.env.VERCEL,
    isEphemeral: false,
    durable: true,
    allowEphemeralStorage: false,
    unsupportedRequestedDriver: false,
    warning: config.configured ? "" : config.hint,
    postgres: config,
  };
}

export function checkpointDatabase() {
  return undefined;
}

async function tableIsEmpty(client, tableName) {
  const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${tableName}`);
  return Number(result.rows[0]?.count || 0) === 0;
}

async function insertSnapshot(client, snapshot) {
  for (const doctor of snapshot.doctors || []) {
    await client.query(
      `
        INSERT INTO doctors (id, name, specialty)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, specialty = EXCLUDED.specialty
      `,
      [doctor.id, doctor.name, doctor.specialty || ""],
    );
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
    await client.query(
      `
        INSERT INTO patients (id, name, phone, birth_date, created_at, email, address, extra_json)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          phone = EXCLUDED.phone,
          birth_date = EXCLUDED.birth_date,
          created_at = EXCLUDED.created_at,
          email = EXCLUDED.email,
          address = EXCLUDED.address,
          extra_json = EXCLUDED.extra_json
      `,
      [
        patient.id,
        patient.name,
        patient.phone,
        patient.birthDate || "",
        patient.createdAt || "",
        patient.email || "",
        patient.address || "",
        encodeJson(extra),
      ],
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
    await client.query(
      `
        INSERT INTO users
          (id, name, phone, email, role, is_active, created_at, password_hash, password_salt, patient_id, extra_json)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          phone = EXCLUDED.phone,
          email = EXCLUDED.email,
          role = EXCLUDED.role,
          is_active = EXCLUDED.is_active,
          created_at = EXCLUDED.created_at,
          password_hash = EXCLUDED.password_hash,
          password_salt = EXCLUDED.password_salt,
          patient_id = EXCLUDED.patient_id,
          extra_json = EXCLUDED.extra_json
      `,
      [
        user.id,
        user.name,
        user.phone,
        user.email || "",
        user.role,
        user.isActive === false ? false : true,
        user.createdAt || "",
        user.passwordHash || "",
        user.passwordSalt || "",
        user.patientId || null,
        encodeJson(extra),
      ],
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
    await client.query(
      `
        INSERT INTO appointments
          (id, doctor_id, patient_id, date, time, duration, status, visit_id, extra_json)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          doctor_id = EXCLUDED.doctor_id,
          patient_id = EXCLUDED.patient_id,
          date = EXCLUDED.date,
          time = EXCLUDED.time,
          duration = EXCLUDED.duration,
          status = EXCLUDED.status,
          visit_id = EXCLUDED.visit_id,
          extra_json = EXCLUDED.extra_json
      `,
      [
        appt.id,
        appt.doctorId,
        appt.patientId,
        appt.date,
        appt.time,
        Number(appt.duration || 30),
        appt.status,
        appt.visitId || null,
        encodeJson(extra),
      ],
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
    await client.query(
      `
        INSERT INTO visits
          (id, appointment_id, doctor_id, patient_id, started_at, finished_at, complaint, diagnosis, notes, is_final,
           diagnosis_code, caries_type, tooth_number, protocol_json, materials_json, extra_json)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb, $16::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          appointment_id = EXCLUDED.appointment_id,
          doctor_id = EXCLUDED.doctor_id,
          patient_id = EXCLUDED.patient_id,
          started_at = EXCLUDED.started_at,
          finished_at = EXCLUDED.finished_at,
          complaint = EXCLUDED.complaint,
          diagnosis = EXCLUDED.diagnosis,
          notes = EXCLUDED.notes,
          is_final = EXCLUDED.is_final,
          diagnosis_code = EXCLUDED.diagnosis_code,
          caries_type = EXCLUDED.caries_type,
          tooth_number = EXCLUDED.tooth_number,
          protocol_json = EXCLUDED.protocol_json,
          materials_json = EXCLUDED.materials_json,
          extra_json = EXCLUDED.extra_json
      `,
      [
        visit.id,
        visit.appointmentId || null,
        visit.doctorId,
        visit.patientId,
        visit.startedAt || "",
        visit.finishedAt || null,
        visit.complaint || "",
        visit.diagnosis || "",
        visit.notes || "",
        Boolean(visit.isFinal),
        visit.diagnosisCode || "",
        visit.cariesType || "",
        visit.toothNumber || "",
        encodeJson(visit.protocol || {}),
        encodeJson(visit.materials || []),
        encodeJson(extra),
      ],
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
    await client.query(
      `
        INSERT INTO payments (id, date, time, patient_id, visit_id, amount, method, extra_json)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          date = EXCLUDED.date,
          time = EXCLUDED.time,
          patient_id = EXCLUDED.patient_id,
          visit_id = EXCLUDED.visit_id,
          amount = EXCLUDED.amount,
          method = EXCLUDED.method,
          extra_json = EXCLUDED.extra_json
      `,
      [
        payment.id,
        payment.date,
        payment.time,
        payment.patientId,
        payment.visitId || null,
        Number(payment.amount || 0),
        payment.method,
        encodeJson(extra),
      ],
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
    await client.query(
      `
        INSERT INTO inventory (id, name, category, quantity, min_quantity, unit, extra_json)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          category = EXCLUDED.category,
          quantity = EXCLUDED.quantity,
          min_quantity = EXCLUDED.min_quantity,
          unit = EXCLUDED.unit,
          extra_json = EXCLUDED.extra_json
      `,
      [
        item.id,
        item.name,
        item.category,
        Number(item.quantity || 0),
        Number(item.minQuantity || 0),
        item.unit || "pcs",
        encodeJson(extra),
      ],
    );
  }
}

export async function initializeStore(seedSnapshot) {
  if (initialized) return;
  await applyPostgresSchema();
  await withPostgresTransaction(async (client) => {
    if (await tableIsEmpty(client, "doctors")) {
      await insertSnapshot(client, seedSnapshot);
    }
  });
  initialized = true;
}

function mapPatient(row) {
  return {
    ...parseJson(row.extra_json, {}),
    id: row.id,
    name: row.name,
    phone: row.phone,
    birthDate: row.birth_date,
    createdAt: row.created_at,
    email: row.email || undefined,
    address: row.address || undefined,
  };
}

function mapUser(row) {
  return {
    ...parseJson(row.extra_json, {}),
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    role: row.role,
    isActive: bool(row.is_active),
    createdAt: row.created_at,
    passwordHash: row.password_hash || undefined,
    passwordSalt: row.password_salt || undefined,
    patientId: row.patient_id || undefined,
  };
}

function mapAppointment(row) {
  return {
    ...parseJson(row.extra_json, {}),
    id: row.id,
    doctorId: row.doctor_id,
    patientId: row.patient_id,
    date: row.date,
    time: row.time,
    duration: Number(row.duration),
    status: row.status,
    visitId: row.visit_id,
  };
}

function mapVisit(row) {
  return {
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
    isFinal: bool(row.is_final),
    diagnosisCode: row.diagnosis_code,
    cariesType: row.caries_type,
    toothNumber: row.tooth_number,
    protocol: parseJson(row.protocol_json, {}),
    materials: parseJson(row.materials_json, []),
  };
}

function mapPayment(row) {
  return {
    ...parseJson(row.extra_json, {}),
    id: row.id,
    date: row.date,
    time: row.time,
    patientId: row.patient_id,
    visitId: row.visit_id,
    amount: Number(row.amount),
    method: row.method,
  };
}

function mapInventory(row) {
  return {
    ...parseJson(row.extra_json, {}),
    id: row.id,
    name: row.name,
    category: row.category,
    quantity: Number(row.quantity),
    minQuantity: Number(row.min_quantity),
    unit: row.unit,
  };
}

export async function loadDbSnapshot() {
  const [doctors, patients, users, appointments, visits, payments, inventory] = await Promise.all([
    postgresQuery("SELECT id, name, specialty FROM doctors ORDER BY id"),
    postgresQuery("SELECT * FROM patients ORDER BY created_at DESC, name"),
    postgresQuery("SELECT * FROM users ORDER BY (role = 'owner') DESC, name"),
    postgresQuery("SELECT * FROM appointments ORDER BY date, time"),
    postgresQuery("SELECT * FROM visits ORDER BY started_at DESC"),
    postgresQuery("SELECT * FROM payments ORDER BY date DESC, time DESC"),
    postgresQuery("SELECT * FROM inventory ORDER BY category, name"),
  ]);

  return {
    doctors: doctors.rows,
    patients: patients.rows.map(mapPatient),
    appointments: appointments.rows.map(mapAppointment),
    visits: visits.rows.map(mapVisit),
    payments: payments.rows.map(mapPayment),
    inventory: inventory.rows.map(mapInventory),
    users: users.rows.map(mapUser),
  };
}

export async function persistDbSnapshot(snapshot) {
  await withPostgresTransaction(async (client) => {
    await client.query(`
      DELETE FROM inventory;
      DELETE FROM payments;
      DELETE FROM visits;
      DELETE FROM appointments;
      DELETE FROM users;
      DELETE FROM patients;
      DELETE FROM doctors;
    `);
    await insertSnapshot(client, snapshot);
  });
}

export async function createSessionRecord({ token, subjectType, subjectId, createdAt, expiresAt }) {
  await postgresQuery(
    `
      INSERT INTO sessions (token, subject_type, subject_id, created_at, expires_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (token) DO UPDATE SET
        subject_type = EXCLUDED.subject_type,
        subject_id = EXCLUDED.subject_id,
        created_at = EXCLUDED.created_at,
        expires_at = EXCLUDED.expires_at
    `,
    [token, subjectType, subjectId, createdAt, expiresAt],
  );
}

export async function getSessionRecord(token) {
  if (!token) return null;
  const result = await postgresQuery(
    `
      SELECT token, subject_type AS "subjectType", subject_id AS "subjectId", created_at AS "createdAt", expires_at AS "expiresAt"
      FROM sessions
      WHERE token = $1
    `,
    [token],
  );
  const row = result.rows[0] || null;
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() <= Date.now()) {
    await deleteSessionRecord(token);
    return null;
  }
  return row;
}

export async function deleteSessionRecord(token) {
  if (!token) return;
  await postgresQuery("DELETE FROM sessions WHERE token = $1", [token]);
}

export async function deleteExpiredSessions(nowIso = new Date().toISOString()) {
  const result = await postgresQuery("DELETE FROM sessions WHERE expires_at <= $1", [nowIso]);
  return Number(result.rowCount || 0);
}

export async function listSessionRecords({ limit = 200 } = {}) {
  const result = await postgresQuery(
    `
      SELECT token, subject_type AS "subjectType", subject_id AS "subjectId", created_at AS "createdAt", expires_at AS "expiresAt"
      FROM sessions
      ORDER BY expires_at DESC
      LIMIT $1
    `,
    [limitNumber(limit, 200, 10000)],
  );
  return result.rows;
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

export async function createFileRecord(file) {
  await postgresQuery(
    `
      INSERT INTO files (id, patient_id, visit_id, file_name, mime_type, storage_path, created_at, extra_json)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    `,
    [
      file.id,
      file.patientId || null,
      file.visitId || null,
      file.fileName,
      file.mimeType,
      file.storagePath,
      file.createdAt,
      encodeJson(file.extra || {}),
    ],
  );
  return getFileRecord(file.id);
}

export async function getFileRecord(id) {
  const result = await postgresQuery("SELECT * FROM files WHERE id = $1", [id]);
  return result.rows[0] ? mapFile(result.rows[0]) : null;
}

export async function listFileRecords({ patientId = "", visitId = "" } = {}) {
  if (patientId) {
    const result = await postgresQuery("SELECT * FROM files WHERE patient_id = $1 ORDER BY created_at DESC", [patientId]);
    return result.rows.map(mapFile);
  }
  if (visitId) {
    const result = await postgresQuery("SELECT * FROM files WHERE visit_id = $1 ORDER BY created_at DESC", [visitId]);
    return result.rows.map(mapFile);
  }
  const result = await postgresQuery("SELECT * FROM files ORDER BY created_at DESC");
  return result.rows.map(mapFile);
}

export async function deleteFileRecord(id) {
  await postgresQuery("DELETE FROM files WHERE id = $1", [id]);
}

export async function updateFileRecordExtra(id, patch = {}) {
  const current = await getFileRecord(id);
  if (!current) return null;
  const extra = { ...current, ...patch };
  delete extra.id;
  delete extra.patientId;
  delete extra.visitId;
  delete extra.fileName;
  delete extra.mimeType;
  delete extra.storagePath;
  delete extra.createdAt;
  await postgresQuery("UPDATE files SET extra_json = $1::jsonb WHERE id = $2", [encodeJson(extra), id]);
  return getFileRecord(id);
}

function mapNotification(row) {
  return {
    ...parseJson(row.extra_json, {}),
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    role: row.role,
    isRead: bool(row.is_read),
    createdAt: row.created_at,
  };
}

export async function createNotificationRecord(notification) {
  await postgresQuery(
    `
      INSERT INTO notifications (id, type, title, body, role, is_read, created_at, extra_json)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        type = EXCLUDED.type,
        title = EXCLUDED.title,
        body = EXCLUDED.body,
        role = EXCLUDED.role,
        is_read = EXCLUDED.is_read,
        created_at = EXCLUDED.created_at,
        extra_json = EXCLUDED.extra_json
    `,
    [
      notification.id,
      notification.type,
      notification.title,
      notification.body || "",
      notification.role || "",
      Boolean(notification.isRead),
      notification.createdAt,
      encodeJson(notification.extra || {}),
    ],
  );
  return getNotificationRecord(notification.id);
}

export async function getNotificationRecord(id) {
  const result = await postgresQuery("SELECT * FROM notifications WHERE id = $1", [id]);
  return result.rows[0] ? mapNotification(result.rows[0]) : null;
}

export async function listNotificationRecords({ role = "", unreadOnly = false } = {}) {
  const params = [];
  const where = [];
  if (role) {
    params.push(role);
    where.push(`(role = '' OR role = $${params.length})`);
  }
  if (unreadOnly) where.push("is_read = FALSE");
  const result = await postgresQuery(
    `SELECT * FROM notifications${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC`,
    params,
  );
  return result.rows.map(mapNotification);
}

export async function markNotificationReadRecord(id, isRead = true) {
  await postgresQuery("UPDATE notifications SET is_read = $1 WHERE id = $2", [Boolean(isRead), id]);
  return getNotificationRecord(id);
}

export async function createAuditLogRecord({ actorUserId = "", action, entityType, entityId, createdAt, details = {} }) {
  await postgresQuery(
    `
      INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, created_at, details_json)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [actorUserId || null, action, entityType, entityId, createdAt, encodeJson(details)],
  );
}

export async function listAuditLogRecords({ entityType = "", entityId = "", dateFrom = "", dateTo = "", limit = 100 } = {}) {
  const params = [];
  const where = [];
  if (entityType) {
    params.push(entityType);
    where.push(`entity_type = $${params.length}`);
  }
  if (entityId) {
    params.push(entityId);
    where.push(`entity_id = $${params.length}`);
  }
  if (dateFrom) {
    params.push(`${dateFrom}T00:00:00`);
    where.push(`created_at >= $${params.length}`);
  }
  if (dateTo) {
    params.push(`${dateTo}T23:59:59`);
    where.push(`created_at <= $${params.length}`);
  }
  params.push(limitNumber(limit, 100, 500));
  const result = await postgresQuery(
    `
      SELECT id, actor_user_id AS "actorUserId", action, entity_type AS "entityType",
             entity_id AS "entityId", created_at AS "createdAt", details_json AS "detailsJson"
      FROM audit_logs
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY id DESC
      LIMIT $${params.length}
    `,
    params,
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
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

export async function upsertConversationRecord(conversation) {
  await postgresQuery(
    `
      INSERT INTO conversations
        (id, patient_id, channel, external_id, title, status, last_message_at, assigned_user_id, created_at, extra_json)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        patient_id = EXCLUDED.patient_id,
        channel = EXCLUDED.channel,
        external_id = EXCLUDED.external_id,
        title = EXCLUDED.title,
        status = EXCLUDED.status,
        last_message_at = EXCLUDED.last_message_at,
        assigned_user_id = EXCLUDED.assigned_user_id,
        created_at = EXCLUDED.created_at,
        extra_json = EXCLUDED.extra_json
    `,
    [
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
    ],
  );
  return getConversationRecord(conversation.id);
}

export async function getConversationRecord(id) {
  const result = await postgresQuery("SELECT * FROM conversations WHERE id = $1", [id]);
  if (!result.rows[0]) return null;
  const message = await postgresQuery(
    "SELECT * FROM conversation_messages WHERE conversation_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1",
    [id],
  );
  return {
    ...mapConversation(result.rows[0]),
    lastMessage: message.rows[0] ? mapConversationMessage(message.rows[0]) : null,
  };
}

export async function listConversationRecords({ query = "", channel = "", status = "", patientId = "", limit = 100 } = {}) {
  const params = [];
  const where = [];
  const q = String(query || "").trim().toLowerCase();
  if (q) {
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    where.push(`(LOWER(title) LIKE $${params.length - 2} OR LOWER(external_id) LIKE $${params.length - 1} OR LOWER(channel) LIKE $${params.length})`);
  }
  if (channel) {
    params.push(channel);
    where.push(`channel = $${params.length}`);
  }
  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  if (patientId) {
    params.push(patientId);
    where.push(`patient_id = $${params.length}`);
  }
  params.push(limitNumber(limit, 100, 500));
  const result = await postgresQuery(
    `SELECT id FROM conversations${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY last_message_at DESC, created_at DESC LIMIT $${params.length}`,
    params,
  );
  return Promise.all(result.rows.map((row) => getConversationRecord(row.id)));
}

export async function createConversationMessageRecord(message) {
  await withPostgresTransaction(async (client) => {
    await client.query(
      `
        INSERT INTO conversation_messages (id, conversation_id, direction, sender_name, body, status, created_at, extra_json)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      `,
      [
        message.id,
        message.conversationId,
        message.direction,
        message.senderName || "",
        message.body,
        message.status || "sent",
        message.createdAt,
        encodeJson(message.extra || {}),
      ],
    );
    await client.query("UPDATE conversations SET last_message_at = $1 WHERE id = $2", [message.createdAt, message.conversationId]);
  });
  const result = await postgresQuery("SELECT * FROM conversation_messages WHERE id = $1", [message.id]);
  return result.rows[0] ? mapConversationMessage(result.rows[0]) : null;
}

export async function listConversationMessageRecords({ conversationId, limit = 100 } = {}) {
  const result = await postgresQuery(
    `
      SELECT * FROM conversation_messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC, id ASC
      LIMIT $2
    `,
    [conversationId, limitNumber(limit, 100, 500)],
  );
  return result.rows.map(mapConversationMessage);
}

function mapPriceItem(row) {
  return {
    ...parseJson(row.extra_json, {}),
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    price: Number(row.price),
    isActive: bool(row.is_active),
    createdAt: row.created_at,
  };
}

export async function upsertPriceItemRecord(item) {
  await postgresQuery(
    `
      INSERT INTO price_items (id, code, name, category, price, is_active, created_at, extra_json)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        code = EXCLUDED.code,
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        price = EXCLUDED.price,
        is_active = EXCLUDED.is_active,
        created_at = EXCLUDED.created_at,
        extra_json = EXCLUDED.extra_json
    `,
    [
      item.id,
      item.code,
      item.name,
      item.category || "",
      Number(item.price || 0),
      item.isActive === false ? false : true,
      item.createdAt,
      encodeJson(item.extra || {}),
    ],
  );
  return getPriceItemRecord(item.id);
}

export async function getPriceItemRecord(idOrCode) {
  const result = await postgresQuery("SELECT * FROM price_items WHERE id = $1 OR code = $1", [idOrCode]);
  return result.rows[0] ? mapPriceItem(result.rows[0]) : null;
}

export async function listPriceItemRecords({ query = "", activeOnly = false } = {}) {
  const params = [];
  const where = [];
  const q = String(query || "").trim().toLowerCase();
  if (q) {
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    where.push(`(LOWER(name) LIKE $${params.length - 2} OR LOWER(code) LIKE $${params.length - 1} OR LOWER(category) LIKE $${params.length})`);
  }
  if (activeOnly) where.push("is_active = TRUE");
  const result = await postgresQuery(
    `SELECT * FROM price_items${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY category, name`,
    params,
  );
  return result.rows.map(mapPriceItem);
}

export async function setPriceItemActiveRecord(id, isActive) {
  await postgresQuery("UPDATE price_items SET is_active = $1 WHERE id = $2", [Boolean(isActive), id]);
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

export async function createInvoiceRecord(invoice, items) {
  await withPostgresTransaction(async (client) => {
    await client.query(
      `
        INSERT INTO invoices (id, patient_id, visit_id, date, status, subtotal, discount, total, paid, created_at, extra_json)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
      `,
      [
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
      ],
    );

    for (const item of items || []) {
      await client.query(
        `
          INSERT INTO invoice_items (id, invoice_id, price_item_id, name, quantity, unit_price, total, extra_json)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        `,
        [
          item.id,
          invoice.id,
          item.priceItemId || null,
          item.name,
          Number(item.quantity || 1),
          Number(item.unitPrice || 0),
          Number(item.total || 0),
          encodeJson(item.extra || {}),
        ],
      );
    }
  });
  return getInvoiceRecord(invoice.id);
}

export async function getInvoiceRecord(id) {
  const invoice = await postgresQuery("SELECT * FROM invoices WHERE id = $1", [id]);
  if (!invoice.rows[0]) return null;
  const items = await postgresQuery("SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY id", [id]);
  return { ...mapInvoice(invoice.rows[0]), items: items.rows.map(mapInvoiceItem) };
}

export async function listInvoiceRecords({ patientId = "", status = "", dateFrom = "", dateTo = "" } = {}) {
  const where = [];
  const params = [];
  if (patientId) {
    params.push(patientId);
    where.push(`patient_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  if (dateFrom) {
    params.push(dateFrom);
    where.push(`date >= $${params.length}`);
  }
  if (dateTo) {
    params.push(dateTo);
    where.push(`date <= $${params.length}`);
  }
  const result = await postgresQuery(
    `SELECT id FROM invoices${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY date DESC, created_at DESC`,
    params,
  );
  return Promise.all(result.rows.map((row) => getInvoiceRecord(row.id)));
}

export async function updateInvoicePaymentRecord(id, paid, status) {
  await postgresQuery("UPDATE invoices SET paid = $1, status = $2 WHERE id = $3", [Number(paid || 0), status, id]);
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

export async function createStockMovementRecord(movement) {
  await postgresQuery(
    `
      INSERT INTO stock_movements
        (id, inventory_id, type, quantity, balance_after, reason, visit_id, actor_user_id, created_at, extra_json)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
    `,
    [
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
    ],
  );
  return getStockMovementRecord(movement.id);
}

export async function getStockMovementRecord(id) {
  const result = await postgresQuery("SELECT * FROM stock_movements WHERE id = $1", [id]);
  return result.rows[0] ? mapStockMovement(result.rows[0]) : null;
}

export async function listStockMovementRecords({ inventoryId = "", dateFrom = "", dateTo = "", limit = 200 } = {}) {
  const where = [];
  const params = [];
  if (inventoryId) {
    params.push(inventoryId);
    where.push(`inventory_id = $${params.length}`);
  }
  if (dateFrom) {
    params.push(`${dateFrom}T00:00:00`);
    where.push(`created_at >= $${params.length}`);
  }
  if (dateTo) {
    params.push(`${dateTo}T23:59:59`);
    where.push(`created_at <= $${params.length}`);
  }
  params.push(limitNumber(limit, 200, 1000));
  const result = await postgresQuery(
    `SELECT * FROM stock_movements${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT $${params.length}`,
    params,
  );
  return result.rows.map(mapStockMovement);
}
