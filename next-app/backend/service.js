import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getIntegrationStatus,
  deleteExternalFile,
  downloadExternalFile,
  requestESignature,
  requestExternalAi,
  sendEmail,
  sendFiscalReceipt,
  sendSms,
  sendWhatsApp,
  uploadExternalFile,
} from "./integrations.js";
import { checkPostgresConnection } from "./postgres/client.js";
import {
  checkpointDatabase,
  createAuditLogRecord,
  createConversationMessageRecord,
  createFileRecord,
  createNotificationRecord,
  createInvoiceRecord,
  createStockMovementRecord,
  createSessionRecord,
  deleteFileRecord,
  deleteExpiredSessions,
  deleteSessionRecord,
  getFileRecord,
  getConversationRecord,
  getInvoiceRecord,
  getNotificationRecord,
  getPriceItemRecord,
  getSessionRecord,
  getSqliteFilePath,
  getStorageInfo,
  initializeStore,
  listAuditLogRecords,
  listConversationMessageRecords,
  listConversationRecords,
  listFileRecords,
  listInvoiceRecords,
  listNotificationRecords,
  listPriceItemRecords,
  listSessionRecords,
  listStockMovementRecords,
  loadDbSnapshot,
  markNotificationReadRecord,
  persistDbSnapshot,
  setPriceItemActiveRecord,
  updateInvoicePaymentRecord,
  upsertConversationRecord,
  upsertPriceItemRecord,
} from "./storage.js";

// NeuroDent — серверная бизнес-логика CRM стоматологической клиники.
// Данные сохраняются backend-сервером в SQLite. Этот слой можно заменить
// на PostgreSQL без изменений во frontend API.
//
// СЛОВАРЬ ТЕРМИНОВ (для backend разработчика):
// appointment  — запись: пациент записан к врачу на определённое время
// visit        — визит: открывается когда врач начинает приём, закрывается когда завершает
// isFinal      — визит завершён (true = врач закончил приём, данные сохранены)
// cariesType   — тип кариеса: surface (поверхностный) | medium (средний) | deep (глубокий) | complicated (осложнённый)
// toothNumber  — номер зуба по международной системе FDI (верхние: 11-18, 21-28 | нижние: 31-38, 41-48)
// diagnosisCode— код МКБ-10 (международная классификация болезней, например K02.1 = кариес дентина)
// inventory    — склад: материалы и медикаменты клиники (анестетики, пломбировочные материалы и др.)
// protocol     — клинический протокол врача (жалобы, анамнез, объективно, диагноз, лечение)
// materials    — список использованных материалов на визите (при завершении автоматически списываются со склада)
//
// СИСТЕМА РОЛЕЙ:
// owner     — владелец: доступ ко всем модулям
// admin     — администратор: расписание, пациенты, платежи
// doctor    — врач: AI протокол, расписание, пациенты
// assistant — ассистент: те же права что у врача
// patient   — пациент: видит только свою медицинскую карту

const clone = (data) => JSON.parse(JSON.stringify(data));
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const DOCUMENTS_DIR = path.join(DATA_DIR, "documents");
const BACKUPS_DIR = path.join(DATA_DIR, "backups");

const TODAY = new Date().toISOString().slice(0, 10);
const SESSION_TTL_MS = Number(process.env.NEURODENT_SESSION_TTL_MS || 7 * 24 * 60 * 60 * 1000);
const PASSWORD_RESET_TTL_MS = Number(process.env.NEURODENT_PASSWORD_RESET_TTL_MS || 30 * 60 * 1000);
const EXPOSE_RESET_TOKEN = process.env.NEURODENT_EXPOSE_RESET_TOKEN !== "false" && process.env.NODE_ENV !== "production";

function delay() {
  return Promise.resolve();
}

// Remove redundant clone function since we defined it at top
// function clone(data) {
//   return structuredClone
//     ? structuredClone(data)
//     : JSON.parse(JSON.stringify(data));
// }

function genId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

function shiftDate(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function getPatientName(patientId) {
  const p = db.patients.find((x) => x.id === patientId);
  return p ? p.name : "Неизвестно";
}

function getPatient(patientId) {
  return db.patients.find((x) => x.id === patientId) || null;
}

function getDoctorName(doctorId) {
  const doctor = db.doctors.find((x) => x.id === doctorId);
  return doctor ? doctor.name : "Неизвестный врач";
}

function getDoctor(doctorId) {
  return db.doctors.find((x) => x.id === doctorId) || null;
}

export function getAppointmentById(appointmentId) {
  const appointment = (db.appointments || []).find((appt) => appt.id === appointmentId);
  return appointment ? clone(appointment) : null;
}

function normalizePersonName(name = "") {
  return String(name).trim().toLowerCase().replace(/\s+/g, " ");
}

export function getDoctorIdForUser(user = {}) {
  if (!user || user.role !== "doctor") return "";
  if (user.doctorId && getDoctor(user.doctorId)) return user.doctorId;
  const byName = db.doctors.find((doctor) => normalizePersonName(doctor.name) === normalizePersonName(user.name));
  return byName?.id || "";
}

export function patientBelongsToDoctor(patientId, doctorId) {
  if (!patientId || !doctorId) return false;
  return (db.appointments || []).some((appt) => appt.patientId === patientId && appt.doctorId === doctorId)
    || (db.visits || []).some((visit) => visit.patientId === patientId && visit.doctorId === doctorId);
}

function estimateVisitCost(visit) {
  const type = visit?.cariesType || "";
  const byCariesType = {
    surface: 15000,
    medium: 22000,
    deep: 30000,
    complicated: 45000,
  };
  return byCariesType[type] || 15000;
}

function paymentsForPatient(patientId) {
  return (db.payments || []).filter((payment) => payment.patientId === patientId);
}

function visitsForPatient(patientId) {
  return (db.visits || []).filter((visit) => visit.patientId === patientId);
}

function appointmentsForPatient(patientId) {
  return (db.appointments || []).filter((appt) => appt.patientId === patientId);
}

function cleanPhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function maskPhone(phone) {
  const digits = cleanPhone(phone);
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 2)}******${digits.slice(-4)}`;
}

function hashToken(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

function resetSessionToken(token) {
  return `password_reset:${hashToken(token)}`;
}

function publicUser(user) {
  if (!user) return null;
  const safeUser = { ...user };
  delete safeUser.passwordHash;
  delete safeUser.passwordSalt;
  return safeUser;
}

function patientAsUser(patient, phone = "") {
  if (!patient) return null;
  return {
    id: patient.id,
    patientId: patient.id,
    role: "patient",
    phone: phone || patient.phone,
    name: patient.name,
  };
}

function verifyPatientPassword(patient, password) {
  const rawPassword = String(password || "");
  const portalPassword = String(patient?.portalPassword || "patient");
  return rawPassword === portalPassword;
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(String(password), salt, 64).toString("hex");
  return { passwordHash: hash, passwordSalt: salt };
}

function verifyPassword(user, password) {
  if (!user?.passwordHash || !user?.passwordSalt) return false;
  const candidate = scryptSync(String(password), user.passwordSalt, 64);
  const stored = Buffer.from(user.passwordHash, "hex");
  return stored.length === candidate.length && timingSafeEqual(stored, candidate);
}

function defaultPasswordForRole(role) {
  if (role === "owner") return "1234";
  if (role === "admin") return "admin";
  if (role === "doctor") return "doctor";
  if (role === "assistant") return "assistant";
  return "";
}

function actorIdFromOptions(options = {}) {
  return String(options?.actorUserId || options?.actor?.id || "");
}

function ensurePasswordHash(user, password) {
  if (!user || user.passwordHash) return;
  const defaults = new Set([defaultPasswordForRole(user.role), user.role].filter(Boolean));
  if (!defaults.has(String(password))) return;
  Object.assign(user, hashPassword(password));
  saveDb();
}

function ensureSeedUserPasswords() {
  let changed = false;
  for (const user of db.users || []) {
    if (user.passwordHash) continue;
    const password = defaultPasswordForRole(user.role);
    if (!password) continue;
    Object.assign(user, hashPassword(password));
    changed = true;
  }
  if (changed) saveDb();
}

export async function resetDemoUserPasswords() {
  await delay(50);
  const updated = [];
  for (const user of db.users || []) {
    const password = defaultPasswordForRole(user.role);
    if (!password) continue;
    Object.assign(user, hashPassword(password));
    updated.push({ id: user.id, phone: user.phone, role: user.role, password });
  }
  if (updated.length) saveDb();
  return clone(updated);
}

function createSession(subjectType, subjectId) {
  deleteExpiredSessions();
  const token = randomBytes(32).toString("hex");
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  createSessionRecord({ token, subjectType, subjectId, createdAt, expiresAt });
  return { token, expiresAt };
}

function withSession(subjectType, subject) {
  const session = createSession(subjectType, subject.id);
  return {
    ...subject,
    token: session.token,
    expiresAt: session.expiresAt,
    user: subject,
  };
}

function audit(action, entityType, entityId, details = {}, actorUserId = "") {
  createAuditLogRecord({
    actorUserId,
    action,
    entityType,
    entityId,
    createdAt: new Date().toISOString(),
    details,
  });
}

function safeFileName(name, fallback = "file") {
  const raw = String(name || fallback).trim() || fallback;
  return raw.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 140);
}

function writeStoredFile(directory, fileName, bytes) {
  mkdirSync(directory, { recursive: true });
  const id = genId("file");
  const safeName = safeFileName(fileName, `${id}.bin`);
  const hasExtension = path.extname(safeName);
  const finalName = hasExtension ? `${id}_${safeName}` : `${id}_${safeName}.bin`;
  const storagePath = path.join(directory, finalName);
  writeFileSync(storagePath, bytes);
  return { id, storagePath, fileName: safeName };
}

function latestFinalVisit(patientId) {
  return visitsForPatient(patientId)
    .filter((visit) => visit.isFinal)
    .sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")))[0] || null;
}

function getVisit(visitId) {
  return db.visits.find((visit) => visit.id === visitId) || null;
}

export async function getVisitById(visitId) {
  await delay();
  const visit = getVisit(visitId);
  if (!visit) throw new Error("Визит не найден");
  return clone(visit);
}

function serviceItemsForVisit(visit) {
  if (!visit) return [];
  const basePrice = estimateVisitCost(visit);
  const services = [
    {
      code: visit.diagnosisCode || "ST-BASE",
      name: visit.protocol?.diagnosisText || visit.diagnosis || "Стоматологический прием",
      price: basePrice,
      toothNumber: visit.toothNumber || "",
    },
  ];

  if ((visit.materials || []).some((item) => String(item.name).toLowerCase().includes("ultracain"))) {
    services.push({ code: "AN-01", name: "Анестезия", price: 3000, toothNumber: visit.toothNumber || "" });
  }

  return services;
}

function treatmentPlanForPatient(patientId) {
  const visits = visitsForPatient(patientId).filter((visit) => visit.isFinal);
  if (!visits.length) {
    return [
      {
        id: genId("plan"),
        toothNumber: "",
        text: "Первичная диагностика и составление плана лечения",
        status: "planned",
      },
    ];
  }

  return visits.slice(0, 5).map((visit) => ({
    id: `plan_${visit.id}`,
    toothNumber: visit.toothNumber || "",
    text: visit.cariesType === "complicated"
      ? "Контроль после эндодонтического лечения"
      : "Контрольный осмотр через 6 месяцев",
    status: "planned",
    sourceVisitId: visit.id,
  }));
}

function validateStatus(status) {
  const allowed = new Set(["scheduled", "arrived", "completed", "cancelled"]);
  if (!allowed.has(status)) throw new Error("Неверный статус записи");
}

function validatePaymentMethod(method) {
  const allowed = new Set(["cash", "card", "kaspi", "terminal", "insurance", "transfer"]);
  if (!allowed.has(method)) throw new Error("Неверный метод оплаты");
}

function validateIsoDate(date, fieldName = "Дата") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) {
    throw new Error(`${fieldName} должна быть в формате YYYY-MM-DD`);
  }
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`${fieldName} некорректна`);
  }
}

function timeToMinutes(time) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(time || ""));
  if (!match) throw new Error("Время должно быть в формате HH:mm");
  return Number(match[1]) * 60 + Number(match[2]);
}

function validateDuration(duration) {
  if (!Number.isInteger(duration) || duration < 10 || duration > 240) {
    throw new Error("Длительность визита должна быть от 10 до 240 минут");
  }
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function appointmentBlocksSlot(appt) {
  return appt.status !== "cancelled";
}

function assertAppointmentSlotAvailable({ doctorId, date, time, duration, excludeId = "" }) {
  const start = timeToMinutes(time);
  const end = start + duration;
  if (end > 24 * 60) throw new Error("Визит не может выходить за пределы дня");
  const conflict = (db.appointments || []).find((appt) => {
    if (appt.id === excludeId) return false;
    if (appt.doctorId !== doctorId || appt.date !== date) return false;
    if (!appointmentBlocksSlot(appt)) return false;
    const apptStart = timeToMinutes(appt.time);
    const apptEnd = apptStart + Number(appt.duration || 30);
    return rangesOverlap(start, end, apptStart, apptEnd);
  });
  if (conflict) throw new Error("У врача уже есть запись на это время");
}

function assertAppointmentTransition(appt, nextStatus) {
  if (appt.status === nextStatus) return;
  if (appt.status === "cancelled") throw new Error("Отмененную запись нельзя изменить");
  if (appt.status === "completed") throw new Error("Завершенную запись нельзя изменить");
  if (nextStatus === "completed") {
    const visit = appt.visitId ? getVisit(appt.visitId) : null;
    if (!visit?.isFinal) throw new Error("Нельзя завершить запись без завершенного визита");
    return;
  }
  if (nextStatus === "arrived" && appt.status !== "scheduled") {
    throw new Error("Пациент может прийти только по запланированной записи");
  }
  if (!["arrived", "cancelled"].includes(nextStatus)) {
    throw new Error("Недопустимый переход статуса записи");
  }
}

const initialDb = {
  doctors: [
    { id: "d1", name: "Сейтқали Марат Бекұлы", specialty: "Терапевт" },
    { id: "d2", name: "Жұмабаев Ерлан Сейітұлы", specialty: "Хирург-стоматолог" },
    { id: "d3", name: "Нұрланова Айгүл Маратқызы", specialty: "Ортодонт" },
    { id: "d4", name: "Қасымов Данияр Әлібекұлы", specialty: "Пародонтолог" },
    { id: "d5", name: "Бекова Сабина Нұрланқызы", specialty: "Эндодонт" },
    { id: "d6", name: "Әбілов Тимур Сейітқалиұлы", specialty: "Ортопед-стоматолог" },
  ],
  patients: [
    {
      id: "p1",
      name: "Иван Иванов",
      phone: "87001112233",
      birthDate: "2001-04-10",
      createdAt: "2023-03-02",
    },
    {
      id: "p2",
      name: "Анна Петрова",
      phone: "87009998877",
      birthDate: "1998-11-05",
      createdAt: "2023-11-10",
    },
    {
      id: "p3",
      name: "Дамир Алиев",
      phone: "87005556677",
      birthDate: "2005-02-01",
      createdAt: "2024-01-15",
    },
    {
      id: "p4",
      name: "Айгерим Бекова",
      phone: "87712345678",
      birthDate: "1995-07-22",
      createdAt: "2024-02-10",
    },
    {
      id: "p5",
      name: "Нұрлан Сейітов",
      phone: "87001234567",
      birthDate: "1988-03-15",
      createdAt: "2024-03-05",
    },
    {
      id: "p6",
      name: "Мадина Қасымова",
      phone: "87759876543",
      birthDate: "2000-12-30",
      createdAt: "2024-03-18",
    },
    {
      id: "p7",
      name: "Арман Жұмабаев",
      phone: "87013334455",
      birthDate: "1992-09-08",
      createdAt: "2024-04-01",
    },
    {
      id: "p8",
      name: "Зарина Әбілова",
      phone: "87027778899",
      birthDate: "2003-05-17",
      createdAt: "2024-04-10",
    },
    {
      id: "p9",
      name: "Серік Нұрланов",
      phone: "87051112233",
      birthDate: "1979-11-04",
      createdAt: "2024-04-15",
    },
    {
      id: "p10",
      name: "Дина Марат",
      phone: "87082223344",
      birthDate: "1997-06-25",
      createdAt: "2024-04-18",
    },
  ],
  appointments: [
    {
      id: "a1",
      doctorId: "d1",
      date: TODAY,
      time: "09:30",
      duration: 30,
      patientId: "p1",
      status: "scheduled",
      visitId: null,
    },
    {
      id: "a2",
      doctorId: "d1",
      date: TODAY,
      time: "10:00",
      duration: 60,
      patientId: "p2",
      status: "arrived",
      visitId: null,
    },
    {
      id: "a3",
      doctorId: "d2",
      date: TODAY,
      time: "11:30",
      duration: 45,
      patientId: "p3",
      status: "scheduled",
      visitId: null,
    },
    {
      id: "a5",
      doctorId: "d2",
      date: shiftDate(TODAY, -3),
      time: "09:00",
      duration: 30,
      patientId: "p1",
      status: "completed",
      visitId: "v2",
    },
    {
      id: "a6",
      doctorId: "d3",
      date: TODAY,
      time: "10:30",
      duration: 90,
      patientId: "p2",
      status: "arrived",
      visitId: null,
    },
    {
      id: "a7",
      doctorId: "d1",
      date: TODAY,
      time: "14:00",
      duration: 45,
      patientId: "p3",
      status: "scheduled",
      visitId: null,
    },
    {
      id: "a8",
      doctorId: "d3",
      date: TODAY,
      time: "13:00",
      duration: 60,
      patientId: "p1",
      status: "cancelled",
      visitId: null,
    },
    {
      id: "a9",
      doctorId: "d3",
      date: shiftDate(TODAY, -5),
      time: "08:30",
      duration: 30,
      patientId: "p3",
      status: "completed",
      visitId: "v4",
    },
    {
      id: "a10",
      doctorId: "d5",
      date: TODAY,
      time: "12:00",
      duration: 60,
      patientId: "p1",
      status: "arrived",
      visitId: null,
    },
    {
      id: "a11",
      doctorId: "d1",
      date: shiftDate(TODAY, -2),
      time: "09:00",
      duration: 45,
      patientId: "p2",
      status: "completed",
      visitId: "v3",
    },
    {
      id: "a4",
      doctorId: "d1",
      date: shiftDate(TODAY, -1),
      time: "15:00",
      duration: 30,
      patientId: "p3",
      status: "completed",
      visitId: "v1",
    },
  ],
  visits: [
    {
      id: "v1",
      appointmentId: "a4",
      doctorId: "d1",
      patientId: "p3",
      startedAt: `${shiftDate(TODAY, -1)}T15:00:00`,
      finishedAt: `${shiftDate(TODAY, -1)}T15:25:00`,
      // Легаси поля (для других модулей)
      complaint: "Зубная боль",
      diagnosis: "Кариес",
      notes: "Рекомендована консультация стоматолога",
      isFinal: true,
      // Core AI Layer — расширенная модель визита
      diagnosisCode: "K02.1",
      cariesType: "deep", // surface | medium | deep | complicated
      toothNumber: "16",
      protocol: {
        complaints: "Боль в верхней челюсти справа при приеме холодной пищи. Ноет со вчерашнего дня.",
        anamnesis: "Обострение хронического кариеса, ранее лечение не проводилось.",
        objective: "Глубокая кариозная полость в зубе 1.6, размягченный дентин, зондирование болезненно.",
        diagnosisText: "Кариес дентина (16)",
        treatment: "Анестезия Ultracain, препарирование, обработка, пломба Filtek Z250.",
      },
      materials: [
        { code: "ultracain", name: "Ultracain D-S forte 1.7ml", qty: 1, unit: "амп" },
        { code: "filtek", name: "Filtek Z250 (шприц)", qty: 1, unit: "шт" },
      ],
    },
    {
      id: "v2",
      appointmentId: "a5",
      doctorId: "d2",
      patientId: "p1",
      startedAt: `${shiftDate(TODAY, -3)}T09:00:00`,
      finishedAt: `${shiftDate(TODAY, -3)}T09:40:00`,
      complaint: "Боль при жевании справа снизу",
      diagnosis: "Пульпит зуба 46",
      notes: "Проведено эндодонтическое лечение, временная пломба",
      isFinal: true,
      diagnosisCode: "K04.0",
      cariesType: "complicated",
      toothNumber: "46",
      protocol: {
        complaints: "Острая боль при жевании справа снизу, ночные боли.",
        anamnesis: "Ранее лечился по поводу кариеса зуба 46, пломба выпала 2 недели назад.",
        objective: "Глубокая кариозная полость зуба 46, зондирование резко болезненно, перкуссия положительная.",
        diagnosisText: "Острый пульпит (46)",
        treatment: "Анестезия, раскрытие полости зуба, удаление пульпы, обработка каналов, временная пломба.",
      },
      materials: [
        { code: "ultracain", name: "Ultracain D-S forte 1.7ml", qty: 2, unit: "амп" },
        { code: "guttapercha", name: "Гуттаперча (конусы)", qty: 1, unit: "упак" },
        { code: "biodentine", name: "Biodentine (временная пломба)", qty: 1, unit: "шт" },
      ],
    },
    {
      id: "v3",
      appointmentId: "a11",
      doctorId: "d1",
      patientId: "p2",
      startedAt: `${shiftDate(TODAY, -2)}T11:00:00`,
      finishedAt: `${shiftDate(TODAY, -2)}T11:30:00`,
      complaint: "Кровоточивость дёсен, неприятный запах",
      diagnosis: "Хронический генерализованный гингивит",
      notes: "Проведена профессиональная гигиена, рекомендована противовоспалительная терапия",
      isFinal: true,
      diagnosisCode: "K05.1",
      cariesType: "surface",
      toothNumber: "31",
      protocol: {
        complaints: "Кровоточивость дёсен при чистке зубов, неприятный запах изо рта.",
        anamnesis: "Жалобы в течение 3 месяцев, к врачу ранее не обращался.",
        objective: "Отёк и гиперемия дёсен, зубной камень на нижних фронтальных зубах.",
        diagnosisText: "Хронический генерализованный гингивит",
        treatment: "Удаление зубного камня ультразвуком, полировка, антисептическая обработка.",
      },
      materials: [
        { code: "chlorhexidine", name: "Хлоргексидин 0.05% (флакон)", qty: 1, unit: "шт" },
        { code: "prophy-paste", name: "Полировочная паста Detartrine", qty: 1, unit: "шт" },
      ],
    },
    {
      id: "v4",
      appointmentId: "a9",
      doctorId: "d3",
      patientId: "p3",
      startedAt: `${shiftDate(TODAY, -5)}T08:30:00`,
      finishedAt: `${shiftDate(TODAY, -5)}T09:15:00`,
      complaint: "Скученность зубов, хочу брекеты",
      diagnosis: "Скученность зубов II степени, дистальный прикус",
      notes: "Назначена ортодонтическая консультация, сделаны слепки",
      isFinal: true,
      diagnosisCode: "K07.2",
      cariesType: "surface",
      toothNumber: "12",
      protocol: {
        complaints: "Скученность зубов в переднем отделе, эстетическая проблема.",
        anamnesis: "Ранее ортодонтическое лечение не проводилось.",
        objective: "Скученность зубов 12, 11, 21, 22. Дистальное соотношение боковых групп зубов.",
        diagnosisText: "Скученность зубов II степени, дистальный прикус",
        treatment: "Снятие слепков, фотопротокол, планирование брекет-системы.",
      },
      materials: [
        { code: "speedex", name: "Слепочная масса Speedex", qty: 1, unit: "упак" },
      ],
    },
  ],
  payments: [
    {
      id: "pay1",
      date: shiftDate(TODAY, -1),
      time: "15:30",
      patientId: "p3",
      visitId: "v1",
      amount: 5000,
      method: "cash",
    },
    {
      id: "pay2",
      date: shiftDate(TODAY, -3),
      time: "09:45",
      patientId: "p1",
      visitId: "v2",
      amount: 18000,
      method: "card",
    },
    {
      id: "pay3",
      date: shiftDate(TODAY, -2),
      time: "11:35",
      patientId: "p2",
      visitId: "v3",
      amount: 7500,
      method: "cash",
    },
    {
      id: "pay4",
      date: shiftDate(TODAY, -5),
      time: "09:20",
      patientId: "p3",
      visitId: "v4",
      amount: 3000,
      method: "card",
    },
    {
      id: "pay5",
      date: TODAY,
      time: "10:15",
      patientId: "p4",
      visitId: null,
      amount: 25000,
      method: "card",
    },
  ],
  inventory: [
    { id: "inv1", name: "Имплант Straumann BLT", category: "Имплантология", quantity: 15, unit: "шт", minQuantity: 5 },
    { id: "inv2", name: "Ultracain D-S forte 1.7ml", category: "Анестезия", quantity: 120, unit: "амп", minQuantity: 50 },
    { id: "inv3", name: "Filtek Z250 (шприц)", category: "Терапия", quantity: 8, unit: "шт", minQuantity: 3 },
    { id: "inv4", name: "Слепочная масса Speedex", category: "Ортопедия", quantity: 4, unit: "упак", minQuantity: 2 },
    { id: "inv5", name: "Перчатки смотровые (M)", category: "Расходники", quantity: 45, unit: "упак", minQuantity: 10 },
    { id: "inv6", name: "Гуттаперча (конусы, асс.)", category: "Эндодонтия", quantity: 12, unit: "упак", minQuantity: 3 },
    { id: "inv7", name: "Biodentine (временная пломба)", category: "Терапия", quantity: 6, unit: "шт", minQuantity: 2 },
    { id: "inv8", name: "Хлоргексидин 0.05% (флакон)", category: "Антисептики", quantity: 30, unit: "шт", minQuantity: 10 },
    { id: "inv9", name: "Полировочная паста Detartrine", category: "Гигиена", quantity: 5, unit: "шт", minQuantity: 2 },
    { id: "inv10", name: "Маски хирургические", category: "Расходники", quantity: 200, unit: "шт", minQuantity: 50 },
    { id: "inv11", name: "Коффердам (латекс, M)", category: "Расходники", quantity: 3, unit: "упак", minQuantity: 2 },
    { id: "inv12", name: "Брекет-система металл (комплект)", category: "Ортодонтия", quantity: 7, unit: "комп", minQuantity: 2 },
  ],
  users: [
    { id: "u1", name: "Сейтқали Болат Маратұлы", phone: "87001234567", email: "owner@neurodent.kz", role: "owner", isActive: true, createdAt: "2023-01-01" },
    { id: "u2", name: "Жақсыбекова Айнур", phone: "87007654321", email: "admin@neurodent.kz", role: "admin", isActive: true, createdAt: "2023-02-15" },
    { id: "u3", name: "Сейтқали Марат Бекұлы", phone: "87005551234", email: "doctor1@neurodent.kz", role: "doctor", isActive: true, createdAt: "2023-03-10" },
    { id: "u4", name: "Жұмабаев Ерлан Сейітұлы", phone: "87005557890", email: "doctor2@neurodent.kz", role: "doctor", isActive: true, createdAt: "2023-04-01" },
    { id: "u5", name: "Сәрсенова Камила", phone: "87009871234", email: "assistant@neurodent.kz", role: "assistant", isActive: true, createdAt: "2023-06-20" },
  ],
};

function getDb() {
  initializeStore(initialDb);
  const data = loadDbSnapshot();
  if (!Array.isArray(data.users)) data.users = clone(initialDb.users);
  return data;
}

function saveDb() {
  persistDbSnapshot(db);
}

const db = getDb();
ensureSeedUserPasswords();

// Вход в систему. Принимает телефон + пароль, возвращает роль и имя пользователя.
// Backend: POST /auth/login → { token, user: { role, name, phone } }
export async function login(phone, password) {
  await delay(800);
  const phoneDigits = cleanPhone(phone);
  const rawPassword = String(password || "");
  if (phoneDigits.length < 10) throw new Error("Неверный номер телефона");

  const users = db.users || [];
  let user = users.find((item) => cleanPhone(item.phone) === phoneDigits && item.isActive !== false);
  if (user) {
    ensurePasswordHash(user, rawPassword);
    if (verifyPassword(user, rawPassword)) {
      return withSession("user", publicUser(user));
    }
  }

  const patient = (db.patients || []).find((item) => cleanPhone(item.phone) === phoneDigits);
  if (patient && verifyPatientPassword(patient, rawPassword)) {
    return withSession("patient", patientAsUser(patient));
  }

  throw new Error("Неверный телефон или пароль");
}

export async function getCurrentUser(token) {
  await delay(100);
  const session = getSessionRecord(token);
  if (!session) return null;

  if (session.subjectType === "user") {
    const user = db.users.find((item) => item.id === session.subjectId && item.isActive !== false);
    return user ? publicUser(user) : null;
  }

  if (session.subjectType === "patient") {
    return patientAsUser(getPatient(session.subjectId));
  }

  return null;
}

export async function logout(token) {
  await delay(100);
  deleteSessionRecord(token);
  return { ok: true };
}

export async function changePassword(userId, currentPassword, nextPassword) {
  await delay(150);
  const user = db.users.find((item) => item.id === userId && item.isActive !== false);
  if (!user) throw new Error("Пользователь не найден");
  if (!verifyPassword(user, currentPassword)) throw new Error("Текущий пароль неверный");
  const password = String(nextPassword || "");
  if (password.length < 4) throw new Error("Новый пароль слишком короткий");
  Object.assign(user, hashPassword(password));
  saveDb();
  audit("change_password", "user", user.id, {}, user.id);
  return { ok: true };
}

// Creates a time-limited password reset token.
// Backend: POST /auth/request-password-reset -> { ok, expiresAt }
export async function requestPasswordReset(phone) {
  await delay(100);
  const phoneDigits = cleanPhone(phone);
  const user = (db.users || []).find((entry) => cleanPhone(entry.phone) === phoneDigits && entry.isActive !== false);
  const response = {
    ok: true,
    message: "If the user exists, password reset instructions will be prepared.",
  };

  if (!user) return response;

  deleteExpiredSessions();
  const token = randomBytes(32).toString("hex");
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString();

  createSessionRecord({
    token: resetSessionToken(token),
    subjectType: "password_reset",
    subjectId: user.id,
    createdAt,
    expiresAt,
  });

  audit("request_password_reset", "user", user.id, { phone: maskPhone(user.phone), expiresAt }, "");

  const resetMessage = `NeuroDent password reset token: ${token}. It expires at ${expiresAt}.`;
  const deliveries = [];
  deliveries.push(await sendSms({
    to: user.phone,
    message: resetMessage,
    metadata: { type: "password_reset", userId: user.id },
  }));
  if (user.email) {
    deliveries.push(await sendEmail({
      to: user.email,
      subject: "NeuroDent password reset",
      text: resetMessage,
      metadata: { type: "password_reset", userId: user.id },
    }));
  }

  return {
    ...response,
    expiresAt,
    delivery: deliveries,
    ...(EXPOSE_RESET_TOKEN ? { resetToken: token } : {}),
  };
}

export async function resetPassword(token, nextPassword) {
  await delay(100);
  const resetToken = String(token || "").trim();
  const password = String(nextPassword || "");
  if (!resetToken) throw new Error("Password reset token is required");
  if (password.length < 4) throw new Error("New password is too short");

  const sessionKey = resetSessionToken(resetToken);
  const session = getSessionRecord(sessionKey);
  if (!session || session.subjectType !== "password_reset") {
    const err = new Error("Password reset token is invalid or expired");
    err.statusCode = 401;
    throw err;
  }

  const user = db.users.find((entry) => entry.id === session.subjectId && entry.isActive !== false);
  if (!user) throw new Error("User not found");

  Object.assign(user, hashPassword(password));
  saveDb();
  deleteSessionRecord(sessionKey);
  audit("reset_password", "user", user.id, {}, user.id);

  return { ok: true };
}

// Returns all clinic doctors.
// Backend: GET /doctors -> Doctor[]
export async function getDoctors() {
  await delay();
  return clone(db.doctors);
}

// Возвращает расписание приёмов конкретного врача на указанную дату.
// Backend: GET /schedule?doctorId=&date= → Appointment[]
export async function getSchedule(doctorId, date) {
  await delay();
  if (!doctorId) throw new Error("Выберите врача");
  if (!date) throw new Error("Выберите дату");
  const list = db.appointments
    .filter((a) => a.doctorId === doctorId && a.date === date)
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((a) => ({ ...a, patientName: getPatientName(a.patientId) }));
  return clone(list);
}

// Создаёт новую запись к врачу. Требует: врач, пациент, дата, время, длительность.
// Backend: POST /appointments → Appointment
export async function createAppointment(data, options = {}) {
  await delay();
  const doctorId = String(data?.doctorId || "");
  const patientId = String(data?.patientId || "");
  const date = String(data?.date || "");
  const time = String(data?.time || "");
  const duration = Number(data?.duration) || 30;
  if (!doctorId) throw new Error("Выберите врача");
  if (!patientId) throw new Error("Выберите пациента");
  if (!date) throw new Error("Выберите дату");
  if (!time) throw new Error("Выберите время");
  if (!getDoctor(doctorId)) throw new Error("Врач не найден");
  if (!getPatient(patientId)) throw new Error("Пациент не найден");
  validateIsoDate(date);
  validateDuration(duration);
  assertAppointmentSlotAvailable({ doctorId, date, time, duration });
  const appt = {
    id: genId("a"),
    doctorId,
    patientId,
    date,
    time,
    duration,
    status: "scheduled",
    visitId: null,
  };
  db.appointments.push(appt);
  saveDb();
  audit("create", "appointment", appt.id, { doctorId, patientId, date, time }, actorIdFromOptions(options));
  return clone({ ...appt, patientName: getPatientName(patientId) });
}

// Поиск пациентов по имени или телефону. Если query пустой — возвращает всех.
// Backend: GET /patients?q= → Patient[]
export async function searchPatients(query = "", options = {}) {
  await delay();
  const q = String(query).trim().toLowerCase();
  const doctorId = String(options?.doctorId || "");
  
  // Create an array of patients
  const patientsArray = Array.isArray(db.patients) ? db.patients : [];
  
  const list = patientsArray
    .filter(
      (p) =>
        (!doctorId || patientBelongsToDoctor(p.id, doctorId)) &&
        (!q || p.name.toLowerCase().includes(q) || String(p.phone).includes(q)),
    )
    .sort((a, b) => {
        // Сортировка по дате регистрации по убыванию (сначала новые)
        const dateA = new Date(a.createdAt || "2000-01-01");
        const dateB = new Date(b.createdAt || "2000-01-01");
        if (dateB > dateA) return 1;
        if (dateB < dateA) return -1;
        return a.name.localeCompare(b.name);
    });
  return clone(list);
}

// Находит пациента по ID. Возвращает вместе с историей лечения и списком визитов.
// Backend: GET /patients/:id → Patient (with treatments[] and visits[])
export async function getPatientById(id) {
  await delay(350);
  const p = db.patients.find((x) => x.id === id);
  if (!p) throw new Error("Пациент не найден");
  
  // Добавляем динамические данные для вкладки "Лечение" и "Визиты" на основе расписания и визитов
  const patientVisits = db.visits.filter(v => v.patientId === id);
  const patientAppointments = db.appointments.filter(a => a.patientId === id);
  
  const formattedTreatments = patientVisits.map(v => {
    const doctor = db.doctors.find(d => d.id === v.doctorId);
    const appt = db.appointments.find(a => a.id === v.appointmentId);
    return {
      procedure: v.diagnosis || "Лечение", // Для демо используем диагноз как процедуру
      diagnosis: v.complaint || "Без диагноза",
      doctor: doctor ? doctor.name : "Неизвестный врач",
      date: appt ? appt.date : "Неизвестная дата",
      cost: "15 000", // Заглушка, можно брать из payments
      aiSummary: v.notes || "AI резюме не сформировано."
    };
  });

  const formattedVisits = patientAppointments.map(a => {
    const doctor = db.doctors.find(d => d.id === a.doctorId);
    return {
      date: a.date,
      time: a.time,
      type: "Прием специалиста", // Заглушка
      doctor: doctor ? doctor.name : "Неизвестный врач",
      status: a.status === 'completed' ? 'Завершен' : 'Запланирован'
    };
  });

  const fullPatientData = {
    ...p,
    treatments: formattedTreatments,
    visits: formattedVisits
  };
  
  return clone(fullPatientData);
}

// Регистрирует нового пациента. Требует: имя, телефон, дата рождения.
// Backend: POST /patients → Patient
export async function createPatient(data, options = {}) {
  await delay();
  const name = String(data?.name || "").trim();
  const phone = String(data?.phone || "").replace(/\D/g, "");
  const birthDate = data?.birthDate ? String(data.birthDate) : "";
  const email = String(data?.email || "").trim();
  const address = String(data?.address || "").trim();
  if (name.length < 2) throw new Error("Имя слишком короткое");
  if (phone.length < 10) throw new Error("Неверный номер телефона");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Valid email is required");
  if (db.patients.some((p) => p.phone === phone))
    throw new Error("Пациент с таким телефоном уже существует");
  const newPatient = { 
    id: genId("p"), 
    name, 
    phone, 
    birthDate,
    email,
    address,
    createdAt: TODAY // сохраняем дату регистрации
  };
  db.patients.push(newPatient);
  saveDb();
  audit("create", "patient", newPatient.id, { name, phone }, actorIdFromOptions(options));
  return clone(newPatient);
}

// Обновляет данные пациента (имя, телефон, дата рождения).
// Backend: PUT /patients/:id → Patient
export async function updatePatient(id, patch, options = {}) {
  await delay();
  const p = db.patients.find((x) => x.id === id);
  if (!p) throw new Error("Пациент не найден");
  const name = patch?.name !== undefined ? String(patch.name).trim() : p.name;
  const phone =
    patch?.phone !== undefined
      ? String(patch.phone).replace(/\D/g, "")
      : p.phone;
  const birthDate =
    patch?.birthDate !== undefined
      ? String(patch.birthDate || "")
      : p.birthDate;
  const email =
    patch?.email !== undefined
      ? String(patch.email || "").trim()
      : p.email || "";
  const address =
    patch?.address !== undefined
      ? String(patch.address || "").trim()
      : p.address || "";
  if (name.length < 2) throw new Error("Имя слишком короткое");
  if (phone.length < 10) throw new Error("Неверный номер телефона");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Valid email is required");
  if (
    phone !== p.phone &&
    db.patients.some((x) => x.phone === phone && x.id !== id)
  ) {
    throw new Error("Этот телефон уже используется другим пациентом");
  }
  p.name = name;
  p.phone = phone;
  p.birthDate = birthDate;
  p.email = email;
  p.address = address;
  saveDb();
  audit("update", "patient", id, { patch }, actorIdFromOptions(options));
  return clone(p);
}

// Находит активную (незавершённую/неотменённую) запись пациента.
// Backend: GET /appointments/active?patientId= → Appointment | null
export async function getActiveAppointmentByPatient(patientId) {
  await delay();
  const id = String(patientId || "");
  if (!id) return null;
  const candidates = db.appointments
    .filter(
      (a) =>
        a.patientId === id &&
        a.status !== "cancelled" &&
        a.status !== "completed",
    )
    .sort((a, b) => a.time.localeCompare(b.time));
  const appt = candidates[0];
  return appt ? clone(appt) : null;
}

// Изменяет статус записи: scheduled → arrived → completed | cancelled
// Backend: PATCH /appointments/:id/status { status } → Appointment
export async function updateAppointmentStatus(appointmentId, status, options = {}) {
  await delay(450);
  validateStatus(status);
  const appt = db.appointments.find((a) => a.id === appointmentId);
  if (!appt) throw new Error("Запись не найдена");
  assertAppointmentTransition(appt, status);
  appt.status = status;
  saveDb();
  audit("update_status", "appointment", appointmentId, { status }, actorIdFromOptions(options));
  return clone(appt);
}

// Начинает визит — вызывается когда врач начинает принимать пациента.
// Статус записи становится "arrived", создаётся новая запись визита.
// Backend: POST /visits/start { appointmentId } → Visit
export async function startVisit(appointmentId, options = {}) {
  await delay(700);
  const appt = db.appointments.find((a) => a.id === appointmentId);
  if (!appt) throw new Error("Запись не найдена");
  if (appt.status === "cancelled") throw new Error("Запись отменена");
  if (appt.status === "completed") throw new Error("Визит уже завершён");
  if (!getDoctor(appt.doctorId)) throw new Error("Врач не найден");
  if (!getPatient(appt.patientId)) throw new Error("Пациент не найден");
  if (appt.visitId) {
    const existing = db.visits.find((v) => v.id === appt.visitId);
    if (existing) return clone(existing);
  }
  const visit = {
    id: genId("v"),
    appointmentId: appt.id,
    doctorId: appt.doctorId,
    patientId: appt.patientId,
    startedAt: `${appt.date}T${appt.time}:00`,
    finishedAt: null,
    complaint: "",
    diagnosis: "",
    notes: "",
    isFinal: false,
  };
  db.visits.push(visit);
  appt.visitId = visit.id;
  if (appt.status === "scheduled") appt.status = "arrived";
  saveDb();
  audit("start", "visit", visit.id, { appointmentId }, actorIdFromOptions(options));
  return clone(visit);
}

// Завершает визит. Сохраняет клинический протокол + AI данные.
// ВАЖНО: автоматически списывает использованные материалы со склада (inventory).
// visitData: { complaint, diagnosis, notes, diagnosisCode, cariesType, toothNumber, protocol, materials[] }
// Backend: POST /visits/finish { appointmentId, visitData } → Visit
export async function finishVisit(appointmentId, visitData, options = {}) {
  await delay(800);
  const appt = db.appointments.find((a) => a.id === appointmentId);
  if (!appt) throw new Error("Запись не найдена");
  if (!appt.visitId) throw new Error("Визит не начат");
  const visit = db.visits.find((v) => v.id === appt.visitId);
  if (!visit) throw new Error("Визит не найден");
  if (visit.isFinal) throw new Error("Визит уже завершён");
  const complaint = String(visitData?.complaint || "").trim();
  const diagnosis = String(visitData?.diagnosis || "").trim();
  const notes = String(visitData?.notes || "").trim();
  if (complaint.length < 2) throw new Error("Введите жалобу пациента");
  if (diagnosis.length < 2) throw new Error("Введите диагноз");
  visit.complaint = complaint;
  visit.diagnosis = diagnosis;
  visit.notes = notes;
  // Расширенные AI-поля (если переданы)
  if (visitData) {
    if (visitData.diagnosisCode) {
      visit.diagnosisCode = String(visitData.diagnosisCode);
    }
    if (visitData.cariesType) {
      visit.cariesType = String(visitData.cariesType);
    }
    if (visitData.toothNumber) {
      visit.toothNumber = String(visitData.toothNumber);
    }
    if (visitData.protocol && typeof visitData.protocol === "object") {
      visit.protocol = {
        complaints: String(visitData.protocol.complaints || ""),
        anamnesis: String(visitData.protocol.anamnesis || ""),
        objective: String(visitData.protocol.objective || ""),
        diagnosisText: String(visitData.protocol.diagnosisText || ""),
        treatment: String(visitData.protocol.treatment || ""),
      };
    }
    if (Array.isArray(visitData.materials)) {
      visit.materials = visitData.materials.map((m) => ({
        code: String(m.code || ""),
        name: String(m.name || ""),
        qty: Number(m.qty) || 0,
        unit: String(m.unit || ""),
      }));
    }
  }
  visit.isFinal = true;
  visit.finishedAt = new Date().toISOString();
  appt.status = "completed";

  // Автосписание со склада
  if (db.inventory) {
    // 1) Если Core AI передал конкретные материалы — используем их
    if (Array.isArray(visit.materials) && visit.materials.length) {
      for (const m of visit.materials) {
        const qty = Number(m.qty) || 0;
        if (!qty) continue;
        const code = String(m.code || "").toLowerCase();
        const name = String(m.name || "").toLowerCase();
        const item =
          db.inventory.find((i) =>
            code ? i.name.toLowerCase().includes(code) : false,
          ) ||
          db.inventory.find((i) =>
            name ? i.name.toLowerCase().includes(name) : false,
          );
        if (item && qty > 0) {
          await createStockMovement({
            inventoryId: item.id,
            type: "out",
            quantity: qty,
            reason: "Visit material",
            visitId: visit.id,
          }, options);
        }
      }
    } else {
      // 2) Иначе — старый текстовый парсер (для других модулей)
      const textToAnalyze = (notes + " " + diagnosis).toLowerCase();
      
      if (textToAnalyze.includes("имплант") || textToAnalyze.includes("straumann")) {
        const item = db.inventory.find(i => i.name.toLowerCase().includes("straumann"));
        if (item) {
          await createStockMovement({
            inventoryId: item.id,
            type: "out",
            quantity: 1,
            reason: "Visit material auto-detect",
            visitId: visit.id,
          }, options);
        }
      }
      
      if (textToAnalyze.includes("пломб") || textToAnalyze.includes("filtek")) {
        const item = db.inventory.find(i => i.name.toLowerCase().includes("filtek"));
        if (item) {
          await createStockMovement({
            inventoryId: item.id,
            type: "out",
            quantity: 1,
            reason: "Visit material auto-detect",
            visitId: visit.id,
          }, options);
        }
      }

      if (textToAnalyze.includes("анестези") || textToAnalyze.includes("ultracain")) {
        const item = db.inventory.find(i => i.name.toLowerCase().includes("ultracain"));
        if (item) {
          await createStockMovement({
            inventoryId: item.id,
            type: "out",
            quantity: 1,
            reason: "Visit material auto-detect",
            visitId: visit.id,
          }, options);
        }
      }
    }
  }

  saveDb();
  audit("finish", "visit", visit.id, { appointmentId, diagnosis: visit.diagnosis }, actorIdFromOptions(options));
  return clone(visit);
}

// Создаёт новый платёж. Требует: сумма, метод (cash/card), ID пациента.
// Backend: POST /payments → Payment
export async function createPayment(data, options = {}) {
  await delay(650);
  const amount = Number(data?.amount);
  const method = String(data?.method || "");
  const patientId = String(data?.patientId || "");
  const visitId = data?.visitId ? String(data.visitId) : null;
  if (!Number.isFinite(amount) || amount <= 0)
    throw new Error("Сумма должна быть больше 0");
  validatePaymentMethod(method);
  if (!patientId) throw new Error("Выберите пациента");
  if (!getPatient(patientId)) throw new Error("Пациент не найден");
  if (visitId) {
    const visit = getVisit(visitId);
    if (!visit) throw new Error("Визит не найден");
    if (visit.patientId !== patientId) throw new Error("Визит не принадлежит пациенту");
  }
  const payment = {
    id: genId("pay"),
    date: data?.date ? String(data.date) : TODAY,
    time: new Date().toTimeString().slice(0, 5),
    patientId,
    visitId,
    amount,
    method,
  };
  validateIsoDate(payment.date);
  db.payments.push(payment);
  saveDb();
  const fiscalization = await sendFiscalReceipt({
    payment,
    patient: getPatient(patientId),
    metadata: { type: "payment_created", actorUserId: actorIdFromOptions(options) },
  });
  payment.fiscalization = fiscalization;
  saveDb();
  audit("create", "payment", payment.id, { patientId, amount, method, fiscalization }, actorIdFromOptions(options));
  return clone(payment);
}

// Возвращает все платежи за указанную дату.
// Backend: GET /payments?date= → Payment[]
export async function getPaymentsByDate(date) {
  await delay(450);
  if (!date) throw new Error("Выберите дату");
  const list = db.payments
    .filter((p) => p.date === date)
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((p) => ({ ...p, patientName: getPatientName(p.patientId) }));
  return clone(list);
}

export async function getPaymentsByPatient(patientId) {
  await delay(250);
  if (!patientId) throw new Error("Пациент не выбран");
  const patient = getPatient(patientId);
  if (!patient) throw new Error("Пациент не найден");
  const list = db.payments
    .filter((payment) => payment.patientId === patientId)
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
    .map((payment) => ({ ...payment, patientName: patient.name }));
  return clone(list);
}

// Формирует CSV по платежам за дату на backend.
// Backend: GET /payments/export?date= → text/csv
export async function exportPaymentsCsv(date) {
  await delay(300);
  const payments = await getPaymentsByDate(date);
  const rows = [
    ["Дата", "Время", "Пациент", "Сумма", "Метод"],
    ...payments.map((p) => [
      p.date,
      p.time,
      p.patientName,
      String(p.amount),
      p.method === "cash" ? "Наличные" : "Карта",
    ]),
  ];

  return rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");
}

// Возвращает пациентов с непогашенным остатком по завершенным визитам.
// Backend: GET /debtors?q= → Debtor[]
export async function getDebtors(query = "") {
  await delay(350);
  const q = String(query || "").trim().toLowerCase();
  const result = [];

  for (const patient of db.patients || []) {
    if (
      q &&
      !patient.name.toLowerCase().includes(q) &&
      !String(patient.phone).includes(q)
    ) {
      continue;
    }

    const visits = (db.visits || []).filter(
      (visit) => visit.patientId === patient.id && visit.isFinal,
    );
    if (!visits.length) continue;

    const totalDue = visits.reduce((sum, visit) => sum + estimateVisitCost(visit), 0);
    const paid = paymentsForPatient(patient.id).reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0,
    );
    const debt = totalDue - paid;
    if (debt <= 0) continue;

    const latestVisit = visits
      .slice()
      .sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")))[0];

    result.push({
      patientId: patient.id,
      patientName: patient.name,
      phone: patient.phone,
      debt,
      totalDue,
      paid,
      date: latestVisit?.startedAt ? String(latestVisit.startedAt).slice(0, 10) : patient.createdAt,
    });
  }

  return clone(result.sort((a, b) => b.debt - a.debt));
}

// Дневной отчёт: общая выручка, количество завершённых визитов, AI-сигналы (типы кариеса, частые зубы).
// Backend: GET /reports/day?date= → DayReport
export async function getDayReport(date) {
  await delay(700);
  if (!date) throw new Error("Выберите дату");
  const payments = await getPaymentsByDate(date);
  const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);
  const visitsCompleted = db.appointments.filter(
    (a) => a.date === date && a.status === "completed",
  ).length;
  // AI-сигналы по визитам за день
  const aiSignals = {
    cariesByType: {
      surface: 0,
      medium: 0,
      deep: 0,
      complicated: 0,
    },
    teethByCount: {}, // { "16": 3, "46": 1, ... }
  };

  const completedAppts = db.appointments.filter(
    (a) => a.date === date && a.visitId,
  );
  const doctorStats = new Map();
  const specialtyStats = new Map();

  function ensureDoctorStats(doctorId) {
    const doctor = getDoctor(doctorId);
    const id = doctor?.id || "unknown";
    if (!doctorStats.has(id)) {
      doctorStats.set(id, {
        doctorId: id,
        doctorName: doctor?.name || "Без врача",
        specialty: doctor?.specialty || "Без направления",
        revenue: 0,
        transactions: 0,
        completedVisits: 0,
        protocolReady: 0,
      });
    }
    return doctorStats.get(id);
  }

  function addSpecialtyRevenue(specialty, amount) {
    const name = specialty || "Без направления";
    specialtyStats.set(name, (specialtyStats.get(name) || 0) + amount);
  }

  for (const payment of payments) {
    const visit = payment.visitId
      ? db.visits.find((x) => x.id === payment.visitId)
      : null;
    const stats = ensureDoctorStats(visit?.doctorId);
    const amount = Number(payment.amount || 0);
    stats.revenue += amount;
    stats.transactions += 1;
    addSpecialtyRevenue(stats.specialty, amount);
  }

  for (const appt of completedAppts) {
    const v = db.visits.find((x) => x.id === appt.visitId);
    if (!v) continue;
    const stats = ensureDoctorStats(v.doctorId);
    stats.completedVisits += 1;
    if (v.protocol && v.diagnosisCode) stats.protocolReady += 1;

    const type = v.cariesType;
    if (type && aiSignals.cariesByType[type] !== undefined) {
      aiSignals.cariesByType[type] += 1;
    }
    const tooth = v.toothNumber;
    if (tooth) {
      aiSignals.teethByCount[tooth] = (aiSignals.teethByCount[tooth] || 0) + 1;
    }
  }

  // Оставим только топ-5 зубов по частоте
  const teethEntries = Object.entries(aiSignals.teethByCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  aiSignals.teethByCount = Object.fromEntries(teethEntries);

  const doctorRevenue = Array.from(doctorStats.values())
    .map((item) => ({
      ...item,
      avgCheck: item.transactions ? Math.round(item.revenue / item.transactions) : 0,
      protocolCompliance: item.completedVisits
        ? Math.round((item.protocolReady / item.completedVisits) * 100)
        : null,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const specialtyRevenue = Array.from(specialtyStats.entries())
    .map(([specialty, revenue]) => ({ specialty, revenue }))
    .sort((a, b) => b.revenue - a.revenue);
  const lowInventory = (db.inventory || []).filter((item) => Number(item.quantity || 0) <= Number(item.minQuantity || 0));

  return clone({
    date,
    payments,
    totalAmount,
    visitsCompleted,
    aiSignals,
    lowInventory,
    doctorStats: doctorRevenue.map((item) => ({ ...item, id: item.doctorId, name: item.doctorName, visits: item.completedVisits })),
    specialtyStats: specialtyRevenue.map((item) => ({ ...item, name: item.specialty })),
    doctorRevenue,
    specialtyRevenue,
  });
}

// Возвращает историю всех завершённых визитов пациента (от новых к старым).
// Backend: GET /visits?patientId= → Visit[]
export async function getVisitsByPatient(patientId, options = {}) {
  await delay(500);
  if (!patientId) throw new Error("Пациент не выбран");
  const doctorId = String(options?.doctorId || "");
  const list = db.visits
    .filter((v) => v.patientId === patientId && (!doctorId || v.doctorId === doctorId))
    .sort((a, b) => {
      const aTime = a.startedAt || "";
      const bTime = b.startedAt || "";
      return bTime.localeCompare(aTime);
    })
    .map((v) => ({
      id: v.id,
      startedAt: v.startedAt,
      finishedAt: v.finishedAt,
      diagnosis: v.diagnosis || v.protocol?.diagnosisText || "",
      diagnosisCode: v.diagnosisCode || "",
      cariesType: v.cariesType || "",
      toothNumber: v.toothNumber || "",
      isFinal: !!v.isFinal,
    }));
  return clone(list);
}

export async function getAllVisits({ query = "", doctorId = "", from = "", to = "", dateFrom = "", dateTo = "" } = {}) {
  await delay(350);
  const q = String(query || "").trim().toLowerCase();
  const start = String(from || dateFrom || "");
  const end = String(to || dateTo || "");
  const list = (db.visits || [])
    .filter((visit) => {
      const patient = getPatient(visit.patientId);
      const doctor = getDoctor(visit.doctorId);
      const date = String(visit.startedAt || "").slice(0, 10);
      if (doctorId && visit.doctorId !== doctorId) return false;
      if (start && date < start) return false;
      if (end && date > end) return false;
      if (!q) return true;
      return [
        patient?.name,
        patient?.phone,
        doctor?.name,
        visit.diagnosis,
        visit.diagnosisCode,
        visit.toothNumber,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(q));
    })
    .sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")))
    .map((visit) => ({
      ...visit,
      patientName: getPatientName(visit.patientId),
      doctorName: getDoctorName(visit.doctorId),
    }));
  return clone(list);
}

// Генерирует текстовый AI-протокол пациента на backend.
// Backend: GET /patients/:id/protocol → text/plain
export async function getPatientProtocol(patientId) {
  await delay(300);
  const patient = getPatient(patientId);
  if (!patient) throw new Error("Пациент не найден");

  const visits = (db.visits || [])
    .filter((visit) => visit.patientId === patient.id && visit.isFinal)
    .sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));

  if (!visits.length) {
    throw new Error("У пациента пока нет завершенных AI-протоколов");
  }

  const visit = visits[0];
  const protocol = visit.protocol || {};
  const lines = [
    "NeuroDent AI-протокол",
    `Пациент: ${patient.name}`,
    `Телефон: ${patient.phone}`,
    `Дата визита: ${visit.startedAt ? String(visit.startedAt).slice(0, 10) : ""}`,
    `Врач: ${getDoctorName(visit.doctorId)}`,
    "",
    `Жалобы: ${protocol.complaints || visit.complaint || ""}`,
    `Анамнез: ${protocol.anamnesis || ""}`,
    `Объективно: ${protocol.objective || ""}`,
    `Диагноз: ${protocol.diagnosisText || visit.diagnosis || ""}`,
    `Код МКБ-10: ${visit.diagnosisCode || ""}`,
    `Зуб: ${visit.toothNumber || ""}`,
    `Тип кариеса: ${visit.cariesType || ""}`,
    `Лечение: ${protocol.treatment || visit.notes || ""}`,
    "",
    "Материалы:",
    ...(visit.materials || []).map(
      (material) => `- ${material.name}: ${material.qty} ${material.unit}`,
    ),
  ];

  return lines.join("\n");
}

// Возвращает список всех материалов на складе (отсортированных по категории).
// Backend: GET /inventory → InventoryItem[]
export async function getInventoryItems() {
  await delay(400);
  // Return sorted by category then name
  const list = (db.inventory || []).sort((a, b) => {
    if (a.category < b.category) return -1;
    if (a.category > b.category) return 1;
    return a.name.localeCompare(b.name);
  });
  return clone(list);
}

// Добавляет новый материал на склад.
// Backend: POST /inventory → InventoryItem
export async function addInventoryItem(data, options = {}) {
  await delay(500);
  const name = String(data?.name || "").trim();
  const category = String(data?.category || "").trim();
  const quantity = Number(data?.quantity) || 0;
  const minQuantity = Number(data?.minQuantity) || 0;
  const unit = String(data?.unit || "шт").trim();

  if (name.length < 2) throw new Error("Название слишком короткое");
  if (!category) throw new Error("Укажите категорию");

  const newItem = {
    id: genId("inv"),
    name,
    category,
    quantity,
    minQuantity,
    unit
  };

  if (!db.inventory) db.inventory = [];
  db.inventory.push(newItem);
  saveDb();
  audit("create", "inventory", newItem.id, { name, category, quantity }, actorIdFromOptions(options));
  return clone(newItem);
}

// Изменяет количество материала на складе. delta может быть положительным (+) или отрицательным (-).
// Backend: PATCH /inventory/:id/quantity { delta } → InventoryItem
export async function updateInventoryQuantity(id, delta, options = {}) {
  await delay(300);
  if (!db.inventory) db.inventory = [];
  const item = db.inventory.find(x => x.id === id);
  if (!item) throw new Error("Материал не найден");
  
  const newQty = item.quantity + delta;
  if (newQty < 0) throw new Error("Недостаточно на складе");
  
  item.quantity = newQty;
  saveDb();
  audit("update_quantity", "inventory", id, { delta, quantity: item.quantity }, actorIdFromOptions(options));
  return clone(item);
}

// ——— Пользователи (staff) ———
const ROLES = ["owner", "admin", "doctor", "assistant"];

// Возвращает список сотрудников (owner, admin, doctor, assistant). Поддерживает поиск.
// Backend: GET /users?q= → User[]
export async function getUsers(query = "") {
  await delay(350);
  const q = String(query).trim().toLowerCase();
  const list = (db.users || [])
    .filter(u => !q || u.name.toLowerCase().includes(q) || String(u.phone).includes(q) || (u.email || "").toLowerCase().includes(q))
    .sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : 0) || a.name.localeCompare(b.name));
  return clone(list.map(publicUser));
}

// Регистрирует нового сотрудника. Роль: owner | admin | doctor | assistant
// Backend: POST /users → User
export async function createUser(data, options = {}) {
  await delay(400);
  const name = String(data?.name || "").trim();
  const phone = String(data?.phone || "").replace(/\D/g, "");
  const email = String(data?.email || "").trim();
  const role = ROLES.includes(data?.role) ? data.role : "admin";
  const password = String(data?.password || defaultPasswordForRole(role) || "1234");
  if (name.length < 2) throw new Error("Имя слишком короткое");
  if (phone.length < 10) throw new Error("Неверный номер телефона");
  if (password.length < 4) throw new Error("Пароль слишком короткий");
  if (db.users.some(u => u.phone === phone)) throw new Error("Пользователь с таким телефоном уже есть");
  const passwordFields = hashPassword(password);
  const newUser = {
    id: genId("u"),
    name,
    phone,
    email,
    role,
    isActive: true,
    createdAt: new Date().toISOString().slice(0, 10),
    ...passwordFields,
  };
  db.users.push(newUser);
  saveDb();
  audit("create", "user", newUser.id, { name, phone, role }, actorIdFromOptions(options));
  return clone(publicUser(newUser));
}

// Обновляет данные сотрудника (имя, телефон, email, роль, активность).
// Backend: PUT /users/:id → User
export async function updateUser(id, patch, options = {}) {
  await delay(400);
  const u = db.users.find(x => x.id === id);
  if (!u) throw new Error("Пользователь не найден");
  const next = {
    ...u,
    name: patch.name !== undefined ? String(patch.name).trim() : u.name,
    phone: patch.phone !== undefined ? String(patch.phone).replace(/\D/g, "") : u.phone,
    email: patch.email !== undefined ? String(patch.email).trim() : u.email,
    role: patch.role !== undefined && ROLES.includes(patch.role) ? patch.role : u.role,
    isActive: patch.isActive !== undefined ? !!patch.isActive : u.isActive,
  };
  if (patch.password !== undefined && String(patch.password).length < 4) throw new Error("Пароль слишком короткий");
  if (next.name.length < 2) throw new Error("Имя слишком короткое");
  if (next.phone.length < 10) throw new Error("Неверный номер телефона");
  if (db.users.some((item) => item.id !== id && item.phone === next.phone)) {
    throw new Error("Пользователь с таким телефоном уже есть");
  }
  const activeOwners = db.users
    .map((item) => (item.id === id ? next : item))
    .filter((item) => item.role === "owner" && item.isActive !== false).length;
  if (activeOwners === 0) {
    throw new Error("Нельзя отключить или понизить последнего владельца");
  }
  Object.assign(u, next);
  if (patch.password !== undefined) Object.assign(u, hashPassword(String(patch.password)));
  saveDb();
  const auditPatch = { ...patch };
  if (auditPatch.password !== undefined) auditPatch.password = "[redacted]";
  audit("update", "user", id, { patch: auditPatch }, actorIdFromOptions(options));
  return clone(publicUser(u));
}

export async function getPatientMedicalCard(patientId) {
  await delay(250);
  const patient = getPatient(patientId);
  if (!patient) throw new Error("Пациент не найден");

  const visits = visitsForPatient(patientId)
    .sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")))
    .map((visit) => ({
      ...visit,
      doctorName: getDoctorName(visit.doctorId),
      services: serviceItemsForVisit(visit),
    }));
  const appointments = appointmentsForPatient(patientId)
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
    .map((appt) => ({
      ...appt,
      doctorName: getDoctorName(appt.doctorId),
    }));
  const payments = paymentsForPatient(patientId);
  const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const totalDue = visits.filter((visit) => visit.isFinal).reduce((sum, visit) => sum + estimateVisitCost(visit), 0);

  return clone({
    patient,
    visits,
    appointments,
    payments,
    totalPaid,
    totalDue,
    debt: Math.max(0, totalDue - totalPaid),
    bonuses: Math.floor(totalPaid * 0.03),
    treatmentPlan: treatmentPlanForPatient(patientId),
    files: listFileRecords({ patientId }).map(redactFileRecord),
  });
}

export async function getVisitMaterials(visitId) {
  await delay(150);
  const visit = getVisit(visitId);
  if (!visit) throw new Error("Визит не найден");
  return clone(visit.materials || []);
}

export async function getVisitServices(visitId) {
  await delay(150);
  const visit = getVisit(visitId);
  if (!visit) throw new Error("Визит не найден");
  return clone(serviceItemsForVisit(visit));
}

export async function getPatientTreatmentPlan(patientId) {
  await delay(150);
  if (!getPatient(patientId)) throw new Error("Пациент не найден");
  return clone(treatmentPlanForPatient(patientId));
}

export async function uploadFile(data, options = {}) {
  await delay(150);
  const patientId = String(data?.patientId || "");
  const visitId = String(data?.visitId || "");
  const fileName = safeFileName(data?.fileName || data?.name || "upload");
  const mimeType = String(data?.mimeType || "application/octet-stream");
  const base64 = String(data?.base64 || data?.data || "");

  if (!patientId && !visitId) throw new Error("Нужно указать patientId или visitId");
  if (patientId && !getPatient(patientId)) throw new Error("Пациент не найден");
  if (visitId && !getVisit(visitId)) throw new Error("Визит не найден");
  if (!base64) throw new Error("Файл не передан");

  const cleanBase64 = base64.includes(",") ? base64.split(",").pop() : base64;
  const bytes = Buffer.from(cleanBase64, "base64");
  if (!bytes.length) throw new Error("Файл пустой");

  const stored = writeStoredFile(UPLOADS_DIR, fileName, bytes);
  const externalStorage = await uploadExternalFile({
    fileName,
    mimeType,
    base64: cleanBase64,
    metadata: { fileId: stored.id, patientId, visitId, kind: data?.kind || "upload" },
  });
  const record = createFileRecord({
    id: stored.id,
    patientId,
    visitId,
    fileName: stored.fileName,
    mimeType,
    storagePath: stored.storagePath,
    createdAt: new Date().toISOString(),
    extra: { kind: data?.kind || "upload", cloudStorage: externalStorage, externalStorage },
  });
  audit("create", "file", record.id, { patientId, visitId, fileName: record.fileName }, actorIdFromOptions(options));
  return clone(redactFileRecord(record));
}

export async function getFiles({ patientId = "", visitId = "" } = {}) {
  await delay(100);
  const files = listFileRecords({ patientId, visitId }).map(redactFileRecord);
  return clone(files);
}

export async function getFileMetadata(fileId) {
  await delay(50);
  const file = getFileRecord(fileId);
  if (!file) throw new Error("Файл не найден");
  return clone(redactFileRecord(file));
}

export async function getFileDownload(fileId) {
  await delay(100);
  const file = getFileRecord(fileId);
  if (!file) throw new Error("Файл не найден");
  let bytes = existsSync(file.storagePath) ? readFileSync(file.storagePath) : null;
  let mimeType = file.mimeType;
  if (!bytes) {
    const cloudDownload = await downloadExternalFile(file.cloudStorage || file.externalStorage);
    if (!cloudDownload.ok) throw new Error("Файл не найден");
    bytes = cloudDownload.bytes;
    mimeType = cloudDownload.mimeType || mimeType;
  }
  return {
    file: {
      id: file.id,
      patientId: file.patientId,
      visitId: file.visitId,
      fileName: file.fileName,
      mimeType,
      createdAt: file.createdAt,
    },
    bytes,
  };
}

export async function deleteFile(fileId, options = {}) {
  await delay(100);
  const file = getFileRecord(fileId);
  if (!file) throw new Error("Файл не найден");
  if (existsSync(file.storagePath)) unlinkSync(file.storagePath);
  const cloudDelete = await deleteExternalFile(file.cloudStorage || file.externalStorage);
  deleteFileRecord(fileId);
  audit("delete", "file", fileId, { fileName: file.fileName, cloudDelete }, actorIdFromOptions(options));
  return { ok: true, cloudDelete };
}

export async function createPatientProtocolDocument(patientId, options = {}) {
  await delay(250);
  const text = await getPatientProtocol(patientId);
  const patient = getPatient(patientId);
  const createdAt = new Date().toISOString();
  const bytes = Buffer.from(text, "utf8");
  const stored = writeStoredFile(DOCUMENTS_DIR, `AI_Protocol_${patientId}.txt`, bytes);
  const visitId = latestFinalVisit(patientId)?.id || "";
  const cloudStorage = await uploadExternalFile({
    fileName: stored.fileName,
    mimeType: "text/plain; charset=utf-8",
    base64: bytes.toString("base64"),
    metadata: { fileId: stored.id, patientId, visitId, kind: "ai-protocol" },
  });
  const record = createFileRecord({
    id: stored.id,
    patientId,
    visitId,
    fileName: stored.fileName,
    mimeType: "text/plain; charset=utf-8",
    storagePath: stored.storagePath,
    createdAt,
    extra: { kind: "ai-protocol", patientName: patient?.name || "", cloudStorage, externalStorage: cloudStorage },
  });
  audit("create", "document", record.id, { patientId, type: "ai-protocol" }, actorIdFromOptions(options));
  return clone(redactFileRecord(record));
}

export async function signDocument(fileId, data = {}, options = {}) {
  await delay(250);
  const file = getFileRecord(fileId);
  if (!file) throw new Error("Документ не найден");
  const signatureId = genId("sign");
  const provider = data.provider || "egov";
  const eSignature = await requestESignature({
    file: {
      id: file.id,
      fileName: file.fileName,
      mimeType: file.mimeType,
    },
    signer: {
      name: data.signerName || data.signer || "",
      provider,
    },
    metadata: { signatureId, actorUserId: actorIdFromOptions(options) },
  });
  const notification = createNotificationRecord({
    id: genId("notif"),
    type: "document_signed",
    title: "Документ подписан",
    body: `${file.fileName} подписан через ЭЦП`,
    role: "owner",
    isRead: false,
    createdAt: new Date().toISOString(),
    extra: { fileId, signatureId, eSignature },
  });
  audit("sign", "document", fileId, {
    signatureId,
    provider,
    eSignature,
    notificationId: notification.id,
  }, actorIdFromOptions(options));
  return {
    ok: true,
    fileId,
    signatureId,
    provider,
    eSignature,
    signedAt: new Date().toISOString(),
  };
}

export async function getNotifications({ role = "", unreadOnly = false } = {}) {
  await delay(100);
  return clone(listNotificationRecords({ role, unreadOnly }));
}

export async function getNotificationById(id) {
  await delay(50);
  const notification = getNotificationRecord(id);
  if (!notification) throw new Error("Уведомление не найдено");
  return clone(notification);
}

export async function markNotificationRead(id, isRead = true) {
  await delay(100);
  const notification = markNotificationReadRecord(id, isRead);
  if (!notification) throw new Error("Уведомление не найдено");
  return clone(notification);
}

export async function generateNotifications() {
  await delay(150);
  const created = [];
  const lowInventory = (db.inventory || []).filter((item) => Number(item.quantity) <= Number(item.minQuantity));
  for (const item of lowInventory) {
    created.push(createNotificationRecord({
      id: `low_inventory_${item.id}`,
      type: "low_inventory",
      title: "Запасы на исходе",
      body: `${item.name}: ${item.quantity} ${item.unit}`,
      role: "owner",
      isRead: false,
      createdAt: new Date().toISOString(),
      extra: { inventoryId: item.id },
    }));
  }

  const tomorrow = shiftDate(TODAY, 1);
  const scheduledTomorrow = (db.appointments || []).filter((appt) => appt.date === tomorrow && appt.status === "scheduled");
  if (scheduledTomorrow.length) {
    created.push(createNotificationRecord({
      id: `unconfirmed_${tomorrow}`,
      type: "unconfirmed_appointments",
      title: "Есть неподтвержденные визиты",
      body: `${scheduledTomorrow.length} записей на ${tomorrow} требуют подтверждения`,
      role: "admin",
      isRead: false,
      createdAt: new Date().toISOString(),
      extra: { date: tomorrow, count: scheduledTomorrow.length },
    }));
  }

  return clone(created);
}

export async function getAuditLogs(query = {}) {
  await delay(100);
  return clone(listAuditLogRecords(query));
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function exportAuditLogsCsv(query = {}) {
  await delay(100);
  const rows = listAuditLogRecords({
    ...query,
    limit: query?.limit || 500,
  });
  const header = ["id", "createdAt", "actorUserId", "action", "entityType", "entityId", "details"];
  const lines = rows.map((row) => [
    row.id,
    row.createdAt,
    row.actorUserId,
    row.action,
    row.entityType,
    row.entityId,
    JSON.stringify(row.details || {}),
  ].map(csvEscape).join(","));
  return [header.join(","), ...lines].join("\n");
}

const CONVERSATION_CHANNELS = new Set(["whatsapp", "sms", "phone", "instagram", "email", "website", "manual"]);
const CONVERSATION_STATUSES = new Set(["open", "pending", "closed"]);
const MESSAGE_DIRECTIONS = new Set(["inbound", "outbound", "system"]);
const MESSAGE_STATUSES = new Set(["draft", "sent", "delivered", "read", "failed"]);

function normalizeConversationChannel(channel = "whatsapp") {
  const normalized = String(channel || "whatsapp").trim().toLowerCase();
  if (!CONVERSATION_CHANNELS.has(normalized)) throw new Error("Unsupported conversation channel");
  return normalized;
}

function normalizeConversationStatus(status = "open") {
  const normalized = String(status || "open").trim().toLowerCase();
  if (!CONVERSATION_STATUSES.has(normalized)) throw new Error("Unsupported conversation status");
  return normalized;
}

function enrichConversation(conversation) {
  if (!conversation) return null;
  const patient = getPatient(conversation.patientId);
  return {
    ...conversation,
    patientName: patient?.name || "",
    patientPhone: patient?.phone || "",
  };
}

function ensureDefaultConversations() {
  if (listConversationRecords({ limit: 1 }).length) return;
  const now = new Date().toISOString();
  for (const patient of (db.patients || []).slice(0, 3)) {
    const conversation = upsertConversationRecord({
      id: genId("conv"),
      patientId: patient.id,
      channel: "whatsapp",
      externalId: patient.phone || "",
      title: patient.name,
      status: "open",
      lastMessageAt: now,
      createdAt: now,
      extra: { source: "seed" },
    });
    createConversationMessageRecord({
      id: genId("msg"),
      conversationId: conversation.id,
      direction: "inbound",
      senderName: patient.name,
      body: "Здравствуйте, хочу уточнить время приема.",
      status: "delivered",
      createdAt: now,
      extra: { source: "seed" },
    });
  }
}

export async function getConversations(query = {}) {
  await delay(120);
  ensureDefaultConversations();
  const doctorId = String(query?.doctorId || "");
  return clone(listConversationRecords({
    query: query?.query || query?.q || "",
    channel: query?.channel || "",
    status: query?.status || "",
    patientId: query?.patientId || "",
    limit: query?.limit || 100,
  })
    .filter((conversation) => !doctorId || patientBelongsToDoctor(conversation.patientId, doctorId))
    .map(enrichConversation));
}

export async function createConversation(data = {}, options = {}) {
  await delay(140);
  const patientId = data?.patientId ? String(data.patientId) : "";
  const patient = patientId ? getPatient(patientId) : null;
  if (patientId && !patient) throw new Error("Patient not found");
  const channel = normalizeConversationChannel(data?.channel || "whatsapp");
  const status = normalizeConversationStatus(data?.status || "open");
  const now = new Date().toISOString();
  const conversation = upsertConversationRecord({
    id: genId("conv"),
    patientId,
    channel,
    externalId: String(data?.externalId || patient?.phone || ""),
    title: String(data?.title || patient?.name || `${channel} conversation`).trim(),
    status,
    lastMessageAt: now,
    assignedUserId: data?.assignedUserId ? String(data.assignedUserId) : actorIdFromOptions(options),
    createdAt: now,
    extra: { source: data?.source || "manual" },
  });
  if (data?.initialMessage) {
    createConversationMessageRecord({
      id: genId("msg"),
      conversationId: conversation.id,
      direction: "inbound",
      senderName: patient?.name || String(data?.senderName || "Patient"),
      body: String(data.initialMessage),
      status: "delivered",
      createdAt: now,
      extra: { source: "initial" },
    });
  }
  audit("create", "conversation", conversation.id, { patientId, channel }, actorIdFromOptions(options));
  return clone(enrichConversation(getConversationRecord(conversation.id)));
}

export async function getConversation(id) {
  await delay(80);
  ensureDefaultConversations();
  const conversation = getConversationRecord(id);
  if (!conversation) throw new Error("Conversation not found");
  return clone(enrichConversation(conversation));
}

export async function updateConversationStatus(id, status, options = {}) {
  await delay(100);
  const conversation = getConversationRecord(id);
  if (!conversation) throw new Error("Conversation not found");
  const nextStatus = normalizeConversationStatus(status);
  const updated = upsertConversationRecord({
    ...conversation,
    status: nextStatus,
    extra: { statusChangedAt: new Date().toISOString() },
  });
  audit("update_status", "conversation", id, { status: nextStatus }, actorIdFromOptions(options));
  return clone(enrichConversation(updated));
}

export async function getConversationMessages(conversationId, { limit = 100 } = {}) {
  await delay(100);
  const conversation = getConversationRecord(conversationId);
  if (!conversation) throw new Error("Conversation not found");
  return clone(listConversationMessageRecords({ conversationId, limit }));
}

export async function sendConversationMessage(conversationId, data = {}, options = {}) {
  await delay(140);
  const conversation = getConversationRecord(conversationId);
  if (!conversation) throw new Error("Conversation not found");
  const body = String(data?.body || data?.message || "").trim();
  if (body.length < 1) throw new Error("Message body is required");
  if (body.length > 4000) throw new Error("Message is too long");
  const direction = data?.direction ? String(data.direction).toLowerCase() : "outbound";
  if (!MESSAGE_DIRECTIONS.has(direction)) throw new Error("Unsupported message direction");
  const status = data?.status ? String(data.status).toLowerCase() : direction === "outbound" ? "sent" : "delivered";
  if (!MESSAGE_STATUSES.has(status)) throw new Error("Unsupported message status");
  const actor = db.users.find((user) => user.id === actorIdFromOptions(options));
  const message = createConversationMessageRecord({
    id: genId("msg"),
    conversationId,
    direction,
    senderName: String(data?.senderName || actor?.name || (direction === "inbound" ? "Patient" : "NeuroDent")),
    body,
    status,
    createdAt: new Date().toISOString(),
    extra: {
      providerMessageId: data?.providerMessageId || "",
      providerStatus: data?.providerStatus || "",
    },
  });
  audit("send_message", "conversation", conversationId, { messageId: message.id, direction, status }, actorIdFromOptions(options));
  return clone(message);
}

export async function createConversationAiDraft(conversationId, data = {}, options = {}) {
  await delay(180);
  const conversation = getConversationRecord(conversationId);
  if (!conversation) throw new Error("Conversation not found");
  const patient = getPatient(conversation.patientId);
  const messages = listConversationMessageRecords({ conversationId, limit: 20 });
  const lastInbound = [...messages].reverse().find((message) => message.direction === "inbound");
  const appointment = patient ? appointmentsForPatient(patient.id)
    .filter((appt) => appt.status !== "cancelled")
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0] : null;
  const prompt = String(data?.prompt || "").trim();
  const body = prompt
    ? `Черновик ответа: ${prompt}`
    : appointment
      ? `Здравствуйте, ${patient?.name || ""}. Подтверждаем вашу запись на ${appointment.date} в ${appointment.time}. Если нужно перенести время, напишите нам.`
      : `Здравствуйте, ${patient?.name || ""}. Мы получили ваше сообщение${lastInbound ? `: "${lastInbound.body}"` : ""}. Администратор NeuroDent скоро ответит.`;
  const draft = createConversationMessageRecord({
    id: genId("msg"),
    conversationId,
    direction: "outbound",
    senderName: "AI draft",
    body,
    status: "draft",
    createdAt: new Date().toISOString(),
    extra: { generatedBy: "backend-rule-draft" },
  });
  audit("create_ai_draft", "conversation", conversationId, { messageId: draft.id }, actorIdFromOptions(options));
  return clone(draft);
}

const DENTAL_ICD10 = [
  { code: "K00.0", title: "Anodontia", group: "Development", keywords: ["missing", "anodontia"] },
  { code: "K01.1", title: "Impacted teeth", group: "Eruption", keywords: ["impacted", "retained"] },
  { code: "K02.0", title: "Caries limited to enamel", group: "Caries", cariesType: "surface", keywords: ["surface", "enamel", "white spot"] },
  { code: "K02.1", title: "Caries of dentine", group: "Caries", cariesType: "medium", keywords: ["caries", "dentine", "deep", "medium"] },
  { code: "K02.2", title: "Caries of cementum", group: "Caries", keywords: ["root", "cementum"] },
  { code: "K03.6", title: "Deposits on teeth", group: "Hard tissues", keywords: ["calculus", "plaque", "hygiene"] },
  { code: "K04.0", title: "Pulpitis", group: "Pulp/periapical", cariesType: "complicated", keywords: ["pulpitis", "night pain", "acute pain"] },
  { code: "K04.4", title: "Acute apical periodontitis", group: "Pulp/periapical", cariesType: "complicated", keywords: ["periodontitis", "percussion", "apical"] },
  { code: "K05.1", title: "Chronic gingivitis", group: "Periodontal", keywords: ["gingivitis", "bleeding gums"] },
  { code: "K05.3", title: "Chronic periodontitis", group: "Periodontal", keywords: ["periodontitis", "mobility", "pocket"] },
  { code: "K07.2", title: "Anomalies of dental arch relationship", group: "Orthodontics", keywords: ["crowding", "bite", "orthodontic"] },
  { code: "K08.1", title: "Loss of teeth", group: "Other", keywords: ["missing tooth", "extraction"] },
];

function normalizedText(value = "") {
  return String(value || "").toLowerCase();
}

function scoreIcd(item, query) {
  const q = normalizedText(query);
  if (!q) return 1;
  let score = 0;
  if (item.code.toLowerCase().includes(q)) score += 10;
  if (item.title.toLowerCase().includes(q)) score += 6;
  for (const keyword of item.keywords || []) {
    if (q.includes(keyword) || keyword.includes(q)) score += 3;
  }
  return score;
}

export async function getIcd10Reference(query = "") {
  await delay(80);
  const q = String(query || "").trim();
  return clone(DENTAL_ICD10
    .map((item) => ({ ...item, score: scoreIcd(item, q) }))
    .filter((item) => !q || item.score > 0)
    .sort((a, b) => b.score - a.score || a.code.localeCompare(b.code))
    .map((item) => {
      const result = { ...item };
      delete result.score;
      return result;
    }));
}

function detectClinicalSignals(text = "", data = {}) {
  const combined = normalizedText([
    text,
    data?.complaint,
    data?.diagnosis,
    data?.notes,
    data?.protocol?.complaints,
    data?.protocol?.objective,
    data?.protocol?.diagnosisText,
  ].filter(Boolean).join(" "));
  let cariesType = data?.cariesType || "";
  if (!cariesType) {
    if (combined.includes("пульпит") || combined.includes("pulpitis") || combined.includes("periodont") || combined.includes("периодонт")) cariesType = "complicated";
    else if (combined.includes("глуб") || combined.includes("deep")) cariesType = "deep";
    else if (combined.includes("сред") || combined.includes("medium")) cariesType = "medium";
    else if (combined.includes("поверх") || combined.includes("enamel") || combined.includes("surface")) cariesType = "surface";
  }

  let diagnosisCode = data?.diagnosisCode || "";
  if (!diagnosisCode) {
    if (combined.includes("пульпит") || combined.includes("pulpitis")) diagnosisCode = "K04.0";
    else if (combined.includes("периодонт") || combined.includes("periodontitis")) diagnosisCode = "K04.4";
    else if (combined.includes("гингив") || combined.includes("gingivitis")) diagnosisCode = "K05.1";
    else if (combined.includes("ортодонт") || combined.includes("crowding") || combined.includes("скуч")) diagnosisCode = "K07.2";
    else if (cariesType === "surface") diagnosisCode = "K02.0";
    else if (["medium", "deep", "complicated"].includes(cariesType) || combined.includes("кариес") || combined.includes("caries")) diagnosisCode = "K02.1";
  }

  const toothMatch = String(data?.toothNumber || text || "").match(/\b(1[1-8]|2[1-8]|3[1-8]|4[1-8])\b/);
  const toothNumber = data?.toothNumber || toothMatch?.[1] || "";
  const icd = DENTAL_ICD10.find((item) => item.code === diagnosisCode) || null;
  const diagnosisText = data?.diagnosis || data?.protocol?.diagnosisText || icd?.title || "Dental examination";
  const materials = [];
  if (["deep", "complicated"].includes(cariesType)) materials.push({ code: "ultracain", name: "Ultracain D-S forte 1.7ml", qty: 1, unit: "amp" });
  if (["surface", "medium", "deep"].includes(cariesType)) materials.push({ code: "filtek", name: "Filtek Z250", qty: 1, unit: "pc" });
  if (cariesType === "complicated") materials.push({ code: "guttapercha", name: "Gutta-percha cones", qty: 1, unit: "pack" });

  return {
    complaint: data?.complaint || text,
    diagnosis: diagnosisText,
    diagnosisCode,
    cariesType,
    toothNumber,
    materials,
    services: [
      {
        code: diagnosisCode || "ST-BASE",
        name: diagnosisText,
        price: estimateVisitCost({ cariesType }),
        toothNumber,
      },
    ],
  };
}

function clinicalRiskAlerts(patient, visits = [], signals = {}) {
  const alerts = [];
  const recentComplicated = visits.some((visit) => ["deep", "complicated"].includes(visit.cariesType));
  if (recentComplicated || ["deep", "complicated"].includes(signals.cariesType)) {
    alerts.push({
      level: signals.cariesType === "complicated" ? "high" : "medium",
      code: "CARIES_RISK",
      title: "Caries progression risk",
      message: "Check pulp vitality, X-ray data and treatment history before final protocol.",
    });
  }
  const debt = paymentsForPatient(patient?.id).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  if (visits.length >= 4) {
    alerts.push({
      level: "info",
      code: "FREQUENT_VISITS",
      title: "Frequent visits",
      message: "Patient has several visits in history; review previous diagnosis and materials.",
    });
  }
  if (patient?.allergies || patient?.allergy) {
    alerts.push({
      level: "high",
      code: "ALLERGY",
      title: "Allergy note",
      message: String(patient.allergies || patient.allergy),
    });
  }
  return alerts.map((alert) => ({ ...alert, patientPaidTotal: debt }));
}

export async function analyzeClinicalTranscript(data = {}) {
  await delay(140);
  const text = String(data?.transcript || data?.text || "");
  const signals = detectClinicalSignals(text, data);
  const patient = data?.patientId ? getPatient(String(data.patientId)) : null;
  const visits = patient ? visitsForPatient(patient.id) : [];
  const externalAi = await requestExternalAi({
    task: "analyze_clinical_transcript",
    input: data,
    metadata: { patientId: patient?.id || "" },
  });
  return clone({
    ...signals,
    icdSuggestions: DENTAL_ICD10
      .filter((item) => item.code === signals.diagnosisCode || item.cariesType === signals.cariesType)
      .slice(0, 5),
    riskAlerts: clinicalRiskAlerts(patient, visits, signals),
    externalAi,
  });
}

export async function draftClinicalProtocol(data = {}, options = {}) {
  await delay(160);
  const patient = data?.patientId ? getPatient(String(data.patientId)) : null;
  if (data?.patientId && !patient) throw new Error("Patient not found");
  const signals = detectClinicalSignals(data?.transcript || data?.complaint || "", data);
  const latest = patient ? latestFinalVisit(patient.id) : null;
  const protocol = {
    patientId: patient?.id || "",
    patientName: patient?.name || "",
    complaints: data?.protocol?.complaints || signals.complaint || "",
    anamnesis: data?.protocol?.anamnesis || (latest ? `Previous visit: ${latest.diagnosis || latest.diagnosisCode || latest.id}` : ""),
    objective: data?.protocol?.objective || "",
    diagnosisText: data?.protocol?.diagnosisText || signals.diagnosis,
    treatment: data?.protocol?.treatment || "Clinical examination, diagnosis confirmation and treatment according to protocol.",
    diagnosisCode: signals.diagnosisCode,
    cariesType: signals.cariesType,
    toothNumber: signals.toothNumber,
    materials: signals.materials,
    services: signals.services,
    riskAlerts: clinicalRiskAlerts(patient, patient ? visitsForPatient(patient.id) : [], signals),
    createdAt: new Date().toISOString(),
  };
  const externalAi = await requestExternalAi({
    task: "draft_clinical_protocol",
    input: data,
    metadata: { patientId: patient?.id || "", actorUserId: actorIdFromOptions(options) },
  });
  protocol.externalAi = externalAi;
  audit("draft", "clinical_protocol", patient?.id || "anonymous", { diagnosisCode: signals.diagnosisCode, externalAi }, actorIdFromOptions(options));
  return clone(protocol);
}

export async function getPatientAiContext(patientId) {
  await delay(120);
  const patient = getPatient(patientId);
  if (!patient) throw new Error("Patient not found");
  const visits = visitsForPatient(patientId).sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));
  const activeAppointment = appointmentsForPatient(patientId)
    .filter((appt) => ["scheduled", "arrived"].includes(appt.status))
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0] || null;
  const latest = visits[0] || null;
  const signals = detectClinicalSignals(latest?.complaint || latest?.diagnosis || "", latest || {});
  return clone({
    patient,
    activeAppointment,
    latestVisit: latest,
    visits: visits.slice(0, 10),
    toothChart: patient.toothChart || { bite: "permanent", teeth: {}, updatedAt: "" },
    aiSummary: {
      visitsCount: visits.length,
      lastDiagnosis: latest?.diagnosis || "",
      lastDiagnosisCode: latest?.diagnosisCode || "",
      suggestedDiagnosisCode: signals.diagnosisCode,
      suggestedCariesType: signals.cariesType,
    },
    riskAlerts: clinicalRiskAlerts(patient, visits, signals),
  });
}

export async function savePatientToothChart(patientId, data = {}, options = {}) {
  await delay(120);
  const patient = getPatient(patientId);
  if (!patient) throw new Error("Patient not found");
  const teeth = data?.teeth && typeof data.teeth === "object" ? data.teeth : data?.chart || {};
  const bite = String(data?.bite || "permanent");
  patient.toothChart = {
    bite,
    teeth,
    updatedAt: new Date().toISOString(),
    updatedBy: actorIdFromOptions(options),
  };
  saveDb();
  audit("update_tooth_chart", "patient", patientId, { bite, teethCount: Object.keys(teeth || {}).length }, actorIdFromOptions(options));
  return clone(patient.toothChart);
}

export async function getBusinessAnalytics({ dateFrom, dateTo } = {}) {
  await delay(180);
  const from = String(dateFrom || TODAY);
  const to = String(dateTo || from);
  validateIsoDate(from, "Start date");
  validateIsoDate(to, "End date");
  if (from > to) throw new Error("Start date cannot be later than end date");
  const payments = db.payments.filter((payment) => payment.date >= from && payment.date <= to);
  const appointments = db.appointments.filter((appt) => appt.date >= from && appt.date <= to);
  const visits = db.visits.filter((visit) => {
    const date = String(visit.startedAt || "").slice(0, 10);
    return date >= from && date <= to;
  });
  const invoices = listInvoiceRecords({ dateFrom: from, dateTo: to });
  const debtors = await getDebtors("");
  const revenue = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const avgCheck = payments.length ? Math.round(revenue / payments.length) : 0;
  const byDate = {};
  for (const payment of payments) {
    byDate[payment.date] = (byDate[payment.date] || 0) + Number(payment.amount || 0);
  }
  const doctorRevenue = new Map();
  for (const payment of payments) {
    const visit = payment.visitId ? db.visits.find((entry) => entry.id === payment.visitId) : null;
    const doctor = getDoctor(visit?.doctorId);
    const key = doctor?.id || "unknown";
    if (!doctorRevenue.has(key)) {
      doctorRevenue.set(key, {
        doctorId: key,
        doctorName: doctor?.name || "Unknown doctor",
        specialty: doctor?.specialty || "",
        revenue: 0,
        paymentsCount: 0,
      });
    }
    const row = doctorRevenue.get(key);
    row.revenue += Number(payment.amount || 0);
    row.paymentsCount += 1;
  }
  const lowStock = (db.inventory || []).filter((item) => Number(item.quantity || 0) <= Number(item.minQuantity || 0));
  const completed = appointments.filter((appt) => appt.status === "completed").length;
  return clone({
    dateFrom: from,
    dateTo: to,
    revenue,
    avgCheck,
    paymentsCount: payments.length,
    appointmentsCount: appointments.length,
    completedVisits: visits.filter((visit) => visit.isFinal).length || completed,
    conversionRate: appointments.length ? Math.round((completed / appointments.length) * 100) : 0,
    invoiceTotal: invoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0),
    invoicePaid: invoices.reduce((sum, invoice) => sum + Number(invoice.paid || 0), 0),
    debtTotal: debtors.reduce((sum, debtor) => sum + Number(debtor.debt || 0), 0),
    debtorsCount: debtors.length,
    lowStockCount: lowStock.length,
    businessRisks: [
      ...(debtors.length ? [{ level: "medium", code: "DEBTORS", message: `${debtors.length} patients have debt.` }] : []),
      ...(lowStock.length ? [{ level: "medium", code: "LOW_STOCK", message: `${lowStock.length} inventory items are below minimum.` }] : []),
    ],
    revenueTrend: Object.entries(byDate).map(([date, amount]) => ({ date, amount })).sort((a, b) => a.date.localeCompare(b.date)),
    doctorRevenue: Array.from(doctorRevenue.values()).sort((a, b) => b.revenue - a.revenue),
    lowStock,
  });
}

function backupFileNameFromDate(date = new Date()) {
  const stamp = date.toISOString().replace(/\.\d{3}Z$/, "").replace(/[-:]/g, "");
  return `neurodent-backup-${stamp}-${randomBytes(3).toString("hex")}.sqlite`;
}

function resolveBackupPath(fileName) {
  const safeName = safeFileName(path.basename(String(fileName || "")), "");
  if (!/^neurodent-backup-\d{8}T\d{6}-[a-f0-9]{6}\.sqlite$/.test(safeName)) {
    const err = new Error("Invalid backup file name");
    err.statusCode = 400;
    throw err;
  }
  return path.join(BACKUPS_DIR, safeName);
}

function sessionPreview(token) {
  const raw = String(token || "");
  return `${raw.slice(0, 8)}...${raw.slice(-6)}`;
}

function publicSession(session) {
  return {
    tokenPreview: sessionPreview(session.token),
    subjectType: session.subjectType,
    subjectId: session.subjectId,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    isExpired: new Date(session.expiresAt).getTime() <= Date.now(),
  };
}

function redactFileRecord(file) {
  const safeFile = { ...file };
  delete safeFile.storagePath;
  return safeFile;
}

export async function getReadinessStatus() {
  await delay(50);
  const storage = getStorageInfo();
  const hasDatabase = existsSync(storage.file);
  const ready = hasDatabase && storage.durable && !storage.unsupportedRequestedDriver;
  return {
    ok: ready,
    service: "neurodent-backend",
    database: {
      ...storage,
      ready,
    },
    warnings: storage.warning ? [storage.warning] : [],
    timestamp: new Date().toISOString(),
  };
}

export async function getBackendCapabilities() {
  await delay(60);
  const storage = getStorageInfo();
  const postgres = await checkPostgresConnection();
  return {
    service: "neurodent-backend",
    storage: {
      activeDriver: storage.driver,
      requestedDriver: storage.requestedDriver,
      durable: storage.durable,
      postgresPrepared: true,
      postgresConfigured: postgres.configured,
      postgresReachable: postgres.reachable,
      postgresSchemaReady: postgres.schemaReady,
      postgresRuntimeEnabled: postgres.runtimeEnabled,
      postgres,
    },
    ai: {
      mode: "demo-rule-based",
      externalProviderPrepared: true,
      requiresPaidKey: false,
    },
    modules: [
      "auth",
      "rbac",
      "patients",
      "doctors",
      "appointments",
      "visits",
      "payments",
      "invoices",
      "inventory",
      "files",
      "documents",
      "notifications",
      "reports",
      "analytics",
      "crm",
      "audit_logs",
      "admin_operations",
    ],
    integrations: getIntegrationStatus(),
  };
}

export async function exportSystemData() {
  await delay(100);
  const conversations = listConversationRecords({ limit: 10000 }).map((conversation) => ({
    ...conversation,
    messages: listConversationMessageRecords({ conversationId: conversation.id, limit: 10000 }),
  }));
  return {
    exportedAt: new Date().toISOString(),
    format: "neurodent-json-v1",
    data: {
      doctors: clone(db.doctors),
      patients: clone(db.patients),
      users: clone((db.users || []).map(publicUser)),
      appointments: clone(db.appointments),
      visits: clone(db.visits),
      payments: clone(db.payments),
      inventory: clone(db.inventory),
      files: clone(listFileRecords().map(redactFileRecord)),
      notifications: clone(listNotificationRecords()),
      auditLogs: clone(listAuditLogRecords({ limit: 10000 })),
      conversations: clone(conversations),
      priceItems: clone(listPriceItemRecords()),
      invoices: clone(listInvoiceRecords()),
      stockMovements: clone(listStockMovementRecords({ limit: 10000 })),
    },
  };
}

export async function getSystemStatus() {
  await delay(80);
  const storageInfo = getStorageInfo();
  const postgres = await checkPostgresConnection();
  const sqlitePath = getSqliteFilePath();
  const sqliteSize = existsSync(sqlitePath) ? statSync(sqlitePath).size : 0;
  return {
    ok: true,
    service: "neurodent-backend",
    storage: {
      ...storageInfo,
      size: sqliteSize,
      postgres,
    },
    counts: {
      doctors: db.doctors.length,
      patients: db.patients.length,
      users: db.users.length,
      appointments: db.appointments.length,
      visits: db.visits.length,
      payments: db.payments.length,
      inventory: db.inventory.length,
      files: listFileRecords().length,
      notifications: listNotificationRecords().length,
      auditLogs: listAuditLogRecords({ limit: 10000 }).length,
      conversations: listConversationRecords({ limit: 10000 }).length,
      priceItems: listPriceItemRecords().length,
      invoices: listInvoiceRecords().length,
      stockMovements: listStockMovementRecords({ limit: 10000 }).length,
      sessions: listSessionRecords({ limit: 10000 }).length,
    },
  };
}

export async function getAdminIntegrations() {
  await delay(60);
  return getIntegrationStatus();
}

export async function sendAdminTestEmail({ to, subject = "", message = "" } = {}, options = {}) {
  await delay(80);
  const recipient = String(to || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new Error("Valid recipient email is required");
  }
  const emailSubject = String(subject || "NeuroDent email integration test");
  const text = String(message || "NeuroDent backend email integration is working.");
  const delivery = await sendEmail({
    to: recipient,
    subject: emailSubject,
    text,
    html: `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`,
    metadata: {
      type: "admin_test_email",
      actorUserId: actorIdFromOptions(options),
    },
  });
  audit("send_test_email", "system", recipient, { delivery }, actorIdFromOptions(options));
  return {
    ok: !!delivery?.ok,
    to: recipient,
    subject: emailSubject,
    delivery,
  };
}

export async function getAdminSessions({ limit = 200 } = {}) {
  await delay(60);
  return listSessionRecords({ limit }).map(publicSession);
}

export async function createDatabaseBackup(options = {}) {
  await delay(120);
  checkpointDatabase();
  mkdirSync(BACKUPS_DIR, { recursive: true });

  const sourcePath = getSqliteFilePath();
  if (!existsSync(sourcePath)) throw new Error("SQLite database file was not found");

  const fileName = backupFileNameFromDate();
  const backupPath = path.join(BACKUPS_DIR, fileName);
  copyFileSync(sourcePath, backupPath);
  const stats = statSync(backupPath);

  audit("create_backup", "system", fileName, { size: stats.size }, actorIdFromOptions(options));

  return {
    ok: true,
    fileName,
    size: stats.size,
    createdAt: stats.mtime.toISOString(),
  };
}

export async function listDatabaseBackups() {
  await delay(80);
  mkdirSync(BACKUPS_DIR, { recursive: true });
  return readdirSync(BACKUPS_DIR)
    .filter((fileName) => /^neurodent-backup-\d{8}T\d{6}-[a-f0-9]{6}\.sqlite$/.test(fileName))
    .map((fileName) => {
      const stats = statSync(path.join(BACKUPS_DIR, fileName));
      return {
        fileName,
        size: stats.size,
        createdAt: stats.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteDatabaseBackup(fileName, options = {}) {
  await delay(80);
  const backupPath = resolveBackupPath(fileName);
  if (!existsSync(backupPath)) {
    const err = new Error("Backup file was not found");
    err.statusCode = 404;
    throw err;
  }
  const stats = statSync(backupPath);
  unlinkSync(backupPath);
  audit("delete_backup", "system", path.basename(backupPath), { size: stats.size }, actorIdFromOptions(options));
  return {
    ok: true,
    fileName: path.basename(backupPath),
    deletedAt: new Date().toISOString(),
  };
}

export async function getDatabaseBackupDownload(fileName) {
  await delay(80);
  const backupPath = resolveBackupPath(fileName);
  if (!existsSync(backupPath)) {
    const err = new Error("Backup file was not found");
    err.statusCode = 404;
    throw err;
  }
  return {
    fileName: path.basename(backupPath),
    mimeType: "application/vnd.sqlite3",
    bytes: readFileSync(backupPath),
  };
}

export async function cleanupSystemMaintenance({ backupRetentionDays = 30 } = {}, options = {}) {
  await delay(100);
  const expiredSessionsDeleted = deleteExpiredSessions();
  let backupsDeleted = 0;
  const retentionDays = Number(backupRetentionDays);
  if (Number.isFinite(retentionDays) && retentionDays >= 0) {
    mkdirSync(BACKUPS_DIR, { recursive: true });
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    for (const backup of await listDatabaseBackups()) {
      const backupPath = resolveBackupPath(backup.fileName);
      if (new Date(backup.createdAt).getTime() < cutoff && existsSync(backupPath)) {
        unlinkSync(backupPath);
        backupsDeleted += 1;
      }
    }
  }
  const result = {
    ok: true,
    expiredSessionsDeleted,
    backupsDeleted,
    retentionDays,
    cleanedAt: new Date().toISOString(),
  };
  audit("cleanup", "system", "maintenance", result, actorIdFromOptions(options));
  return result;
}

const API_ENDPOINTS = [
  ["GET", "/api/health", "Backend health check", false],
  ["GET", "/api/ready", "Backend readiness check", false],
  ["GET", "/api/capabilities", "Backend capabilities and enabled modules", false],
  ["GET", "/api/docs", "HTML API documentation", false],
  ["GET", "/api/openapi.json", "OpenAPI schema", false],
  ["POST", "/api/auth/login", "Login by phone and password", false],
  ["GET", "/api/auth/me", "Current session user", true],
  ["POST", "/api/auth/logout", "Logout current session", true],
  ["POST", "/api/auth/change-password", "Change current password", true],
  ["POST", "/api/auth/request-password-reset", "Request password reset token", false],
  ["POST", "/api/auth/reset-password", "Reset password with token", false],
  ["GET", "/api/admin/system", "Backend system status", true],
  ["GET", "/api/admin/integrations", "External integration status", true],
  ["POST", "/api/admin/email/test", "Send test email through configured provider", true],
  ["GET", "/api/admin/sessions", "List active backend sessions without raw tokens", true],
  ["GET", "/api/admin/export", "Export sanitized system data", true],
  ["POST", "/api/admin/maintenance/cleanup", "Clean expired sessions and old backups", true],
  ["GET", "/api/admin/backups", "List database backups", true],
  ["POST", "/api/admin/backups", "Create database backup", true],
  ["GET", "/api/admin/backups/:fileName/download", "Download database backup", true],
  ["DELETE", "/api/admin/backups/:fileName", "Delete database backup", true],
  ["GET", "/api/reference/icd10", "Dental ICD-10 reference", true],
  ["POST", "/api/ai/analyze-transcript", "Analyze clinical transcript", true],
  ["POST", "/api/ai/protocol-draft", "Create clinical protocol draft", true],
  ["GET", "/api/doctors", "List doctors", true],
  ["GET", "/api/schedule", "Doctor schedule", true],
  ["POST", "/api/appointments", "Create appointment", true],
  ["GET", "/api/appointments/active", "Active appointment by patient", true],
  ["PATCH", "/api/appointments/:id/status", "Update appointment status", true],
  ["GET", "/api/patients", "Search patients", true],
  ["POST", "/api/patients", "Create patient", true],
  ["GET", "/api/patients/:id", "Patient profile", true],
  ["PUT", "/api/patients/:id", "Update patient", true],
  ["GET", "/api/patients/:id/protocol", "Generated protocol text", true],
  ["GET", "/api/patients/:id/medical-card", "Patient medical card", true],
  ["GET", "/api/patients/:id/treatment-plan", "Patient treatment plan", true],
  ["GET", "/api/patients/:id/ai-context", "Patient AI clinical context", true],
  ["GET", "/api/patients/:id/tooth-chart", "Patient tooth chart", true],
  ["PUT", "/api/patients/:id/tooth-chart", "Save patient tooth chart", true],
  ["POST", "/api/patients/:id/reminders", "Create patient reminder", true],
  ["POST", "/api/patients/:id/documents/protocol", "Create protocol document", true],
  ["POST", "/api/visits/start", "Start visit", true],
  ["POST", "/api/visits/finish", "Finish visit", true],
  ["GET", "/api/visits", "List visits", true],
  ["GET", "/api/visits/all", "List all visits with filters", true],
  ["GET", "/api/visits/:id/materials", "Visit materials", true],
  ["GET", "/api/visits/:id/services", "Visit services", true],
  ["GET", "/api/files", "List files", true],
  ["POST", "/api/files", "Upload file metadata/content", true],
  ["GET", "/api/files/:id/download", "Download file", true],
  ["DELETE", "/api/files/:id", "Delete file", true],
  ["POST", "/api/documents/:id/sign", "Sign document placeholder", true],
  ["GET", "/api/payments", "Payments by date", true],
  ["GET", "/api/payments/patient/:id", "Payments by patient", true],
  ["GET", "/api/payments/export", "Payments CSV export", true],
  ["POST", "/api/payments", "Create payment", true],
  ["GET", "/api/debtors", "List debtors", true],
  ["GET", "/api/reports/day", "Day report", true],
  ["GET", "/api/reports/period", "Period report", true],
  ["GET", "/api/analytics/business", "Business analytics dashboard data", true],
  ["GET", "/api/notifications", "List notifications", true],
  ["POST", "/api/notifications/generate", "Generate system notifications", true],
  ["PATCH", "/api/notifications/:id/read", "Mark notification read", true],
  ["GET", "/api/audit-logs", "List audit logs", true],
  ["GET", "/api/audit-logs/export", "Audit logs CSV export", true],
  ["GET", "/api/conversations", "List CRM conversations", true],
  ["POST", "/api/conversations", "Create CRM conversation", true],
  ["GET", "/api/conversations/:id", "Conversation details", true],
  ["PATCH", "/api/conversations/:id/status", "Update conversation status", true],
  ["GET", "/api/conversations/:id/messages", "Conversation messages", true],
  ["POST", "/api/conversations/:id/messages", "Send or store conversation message", true],
  ["POST", "/api/conversations/:id/ai-draft", "Create AI reply draft", true],
  ["GET", "/api/inventory", "List inventory", true],
  ["POST", "/api/inventory", "Create inventory item", true],
  ["PATCH", "/api/inventory/:id/quantity", "Adjust inventory quantity", true],
  ["GET", "/api/price-items", "List price items", true],
  ["POST", "/api/price-items", "Create price item", true],
  ["PUT", "/api/price-items/:id", "Update price item", true],
  ["PATCH", "/api/price-items/:id/active", "Toggle price item active status", true],
  ["GET", "/api/invoices", "List invoices", true],
  ["POST", "/api/invoices", "Create invoice", true],
  ["GET", "/api/invoices/:id", "Invoice details", true],
  ["POST", "/api/invoices/:id/send", "Send invoice to patient email", true],
  ["POST", "/api/invoices/:id/pay", "Pay invoice", true],
  ["GET", "/api/stock-movements", "List stock movements", true],
  ["POST", "/api/stock-movements", "Create stock movement", true],
  ["GET", "/api/users", "List users", true],
  ["POST", "/api/users", "Create user", true],
  ["PUT", "/api/users/:id", "Update user", true],
];

function openApiPath(pathname) {
  return pathname.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function openApiParameters(pathname) {
  const matches = [...pathname.matchAll(/:([A-Za-z0-9_]+)/g)];
  return matches.map((match) => ({
    name: match[1],
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
}

function schemaRef(name) {
  return { $ref: `#/components/schemas/${name}` };
}

function arraySchema(itemSchema) {
  return { type: "array", items: itemSchema };
}

function jsonContent(schema) {
  return {
    content: {
      "application/json": {
        schema,
      },
    },
  };
}

function requestBody(schema, required = true) {
  return {
    required,
    ...jsonContent(schema),
  };
}

function objectSchema(properties = {}, required = []) {
  return {
    type: "object",
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: true,
  };
}

function openApiRequestBody(method, pathname) {
  if (method === "GET" || method === "DELETE") return null;
  if (pathname === "/api/auth/login") {
    return requestBody(objectSchema({
      phone: { type: "string", example: "87001234567" },
      password: { type: "string", example: "1234" },
    }, ["phone", "password"]));
  }
  if (pathname === "/api/auth/change-password") {
    return requestBody(objectSchema({
      currentPassword: { type: "string" },
      nextPassword: { type: "string", minLength: 4 },
    }, ["currentPassword", "nextPassword"]));
  }
  if (pathname === "/api/auth/request-password-reset") {
    return requestBody(objectSchema({ phone: { type: "string" } }, ["phone"]));
  }
  if (pathname === "/api/auth/reset-password") {
    return requestBody(objectSchema({
      token: { type: "string" },
      nextPassword: { type: "string", minLength: 4 },
    }, ["token", "nextPassword"]));
  }
  if (pathname === "/api/admin/maintenance/cleanup") {
    return requestBody(objectSchema({ backupRetentionDays: { type: "integer", minimum: 0 } }), false);
  }
  if (pathname === "/api/admin/email/test") {
    return requestBody(objectSchema({
      to: { type: "string", format: "email", example: "owner@example.com" },
      subject: { type: "string", example: "NeuroDent email test" },
      message: { type: "string", example: "Email integration is working." },
    }, ["to"]));
  }
  if (pathname === "/api/appointments") return requestBody(schemaRef("AppointmentInput"));
  if (pathname === "/api/appointments/:id/status") {
    return requestBody(objectSchema({ status: { type: "string", enum: ["scheduled", "arrived", "completed", "cancelled"] } }, ["status"]));
  }
  if (pathname === "/api/patients" || pathname === "/api/patients/:id") return requestBody(schemaRef("PatientInput"));
  if (pathname === "/api/patients/:id/tooth-chart") return requestBody(schemaRef("ToothChart"));
  if (pathname === "/api/patients/:id/reminders") {
    return requestBody(objectSchema({
      message: { type: "string" },
      channel: { type: "string", enum: ["sms", "whatsapp", "email"] },
    }));
  }
  if (pathname === "/api/visits/start") return requestBody(objectSchema({ appointmentId: { type: "string" } }, ["appointmentId"]));
  if (pathname === "/api/visits/finish") return requestBody(schemaRef("VisitFinishInput"));
  if (pathname === "/api/files") return requestBody(schemaRef("FileUploadInput"));
  if (pathname === "/api/documents/:id/sign") return requestBody(schemaRef("DocumentSignInput"));
  if (pathname === "/api/payments") return requestBody(schemaRef("PaymentInput"));
  if (pathname === "/api/conversations") return requestBody(schemaRef("ConversationInput"));
  if (pathname === "/api/conversations/:id/status") {
    return requestBody(objectSchema({ status: { type: "string", enum: ["open", "pending", "closed"] } }, ["status"]));
  }
  if (pathname === "/api/conversations/:id/messages") return requestBody(schemaRef("ConversationMessageInput"));
  if (pathname === "/api/conversations/:id/ai-draft") return requestBody(objectSchema({ tone: { type: "string" }, language: { type: "string" } }));
  if (pathname === "/api/inventory") return requestBody(schemaRef("InventoryInput"));
  if (pathname === "/api/inventory/:id/quantity") return requestBody(objectSchema({ delta: { type: "number" } }, ["delta"]));
  if (pathname === "/api/price-items" || pathname === "/api/price-items/:id") return requestBody(schemaRef("PriceItemInput"));
  if (pathname === "/api/price-items/:id/active") return requestBody(objectSchema({ isActive: { type: "boolean" } }, ["isActive"]));
  if (pathname === "/api/invoices") return requestBody(schemaRef("InvoiceInput"));
  if (pathname === "/api/invoices/:id/send") {
    return requestBody(objectSchema({
      email: { type: "string", format: "email" },
      subject: { type: "string" },
      message: { type: "string" },
    }), false);
  }
  if (pathname === "/api/invoices/:id/pay") return requestBody(objectSchema({
    amount: { type: "number", minimum: 0 },
    method: { type: "string", enum: ["cash", "card", "kaspi", "terminal", "insurance", "transfer"] },
  }, ["amount", "method"]));
  if (pathname === "/api/stock-movements") return requestBody(schemaRef("StockMovementInput"));
  if (pathname === "/api/users" || pathname === "/api/users/:id") return requestBody(schemaRef("UserInput"));
  if (pathname.startsWith("/api/ai/")) return requestBody(objectSchema());
  return method === "POST" || method === "PUT" || method === "PATCH" ? requestBody(objectSchema(), false) : null;
}

function openApiResponseSchema(method, pathname) {
  if (pathname === "/api/health") return schemaRef("HealthResponse");
  if (pathname === "/api/ready") return schemaRef("ReadinessResponse");
  if (pathname === "/api/capabilities") return schemaRef("Capabilities");
  if (pathname === "/api/auth/login") return schemaRef("LoginResponse");
  if (pathname === "/api/auth/me") return objectSchema({ user: schemaRef("User") });
  if (pathname.startsWith("/api/auth/")) return schemaRef("StatusResponse");
  if (pathname === "/api/admin/system") return schemaRef("SystemStatus");
  if (pathname === "/api/admin/integrations") return arraySchema(schemaRef("IntegrationStatus"));
  if (pathname === "/api/admin/email/test") return schemaRef("EmailTestResult");
  if (pathname === "/api/admin/sessions") return arraySchema(schemaRef("SessionInfo"));
  if (pathname === "/api/admin/export") return schemaRef("SystemExport");
  if (pathname === "/api/admin/maintenance/cleanup") return schemaRef("MaintenanceResult");
  if (pathname === "/api/admin/backups") return method === "GET" ? arraySchema(schemaRef("Backup")) : schemaRef("Backup");
  if (pathname === "/api/admin/backups/:fileName") return schemaRef("StatusResponse");
  if (pathname.includes("/download") || pathname.includes("/export") || pathname === "/api/docs") return null;
  if (pathname === "/api/doctors") return arraySchema(schemaRef("Doctor"));
  if (pathname === "/api/schedule") return arraySchema(schemaRef("Appointment"));
  if (pathname.startsWith("/api/appointments")) return schemaRef("Appointment");
  if (pathname === "/api/patients") return method === "GET" ? arraySchema(schemaRef("Patient")) : schemaRef("Patient");
  if (pathname === "/api/patients/:id") return schemaRef("Patient");
  if (pathname.includes("/medical-card")) return schemaRef("MedicalCard");
  if (pathname.includes("/treatment-plan")) return arraySchema(schemaRef("TreatmentPlanItem"));
  if (pathname.includes("/tooth-chart")) return schemaRef("ToothChart");
  if (pathname.includes("/protocol")) return objectSchema({ text: { type: "string" }, document: schemaRef("FileRecord") });
  if (pathname.startsWith("/api/visits")) return pathname.includes("/materials") || pathname.includes("/services") ? arraySchema(objectSchema()) : arraySchema(schemaRef("Visit"));
  if (pathname === "/api/files") return method === "GET" ? arraySchema(schemaRef("FileRecord")) : schemaRef("FileRecord");
  if (pathname === "/api/payments" || pathname.startsWith("/api/payments/patient")) return method === "GET" ? arraySchema(schemaRef("Payment")) : schemaRef("Payment");
  if (pathname === "/api/debtors") return arraySchema(schemaRef("Debtor"));
  if (pathname.startsWith("/api/reports") || pathname === "/api/analytics/business") return schemaRef("Report");
  if (pathname === "/api/notifications") return arraySchema(schemaRef("Notification"));
  if (pathname.startsWith("/api/notifications")) return schemaRef("Notification");
  if (pathname === "/api/audit-logs") return arraySchema(schemaRef("AuditLog"));
  if (pathname === "/api/conversations") return method === "GET" ? arraySchema(schemaRef("Conversation")) : schemaRef("Conversation");
  if (pathname.includes("/messages")) return method === "GET" ? arraySchema(schemaRef("ConversationMessage")) : schemaRef("ConversationMessage");
  if (pathname.includes("/ai-draft")) return objectSchema({ draft: { type: "string" } });
  if (pathname.startsWith("/api/conversations")) return schemaRef("Conversation");
  if (pathname === "/api/inventory") return method === "GET" ? arraySchema(schemaRef("InventoryItem")) : schemaRef("InventoryItem");
  if (pathname.startsWith("/api/inventory")) return schemaRef("InventoryItem");
  if (pathname === "/api/price-items") return method === "GET" ? arraySchema(schemaRef("PriceItem")) : schemaRef("PriceItem");
  if (pathname.startsWith("/api/price-items")) return schemaRef("PriceItem");
  if (pathname === "/api/invoices") return method === "GET" ? arraySchema(schemaRef("Invoice")) : schemaRef("Invoice");
  if (pathname === "/api/invoices/:id/send") return schemaRef("InvoiceEmailResult");
  if (pathname.startsWith("/api/invoices")) return schemaRef("Invoice");
  if (pathname === "/api/stock-movements") return method === "GET" ? arraySchema(schemaRef("StockMovement")) : schemaRef("StockMovement");
  if (pathname === "/api/users") return method === "GET" ? arraySchema(schemaRef("User")) : schemaRef("User");
  if (pathname.startsWith("/api/users")) return schemaRef("User");
  return objectSchema();
}

function openApiSuccessResponse(method, pathname) {
  const schema = openApiResponseSchema(method, pathname);
  if (!schema) return { description: "Success" };
  return {
    description: "Success",
    ...jsonContent(schema),
  };
}

function openApiSchemas() {
  const id = { type: "string" };
  const date = { type: "string", format: "date" };
  const dateTime = { type: "string", format: "date-time" };
  const phone = { type: "string", example: "87001234567" };
  return {
    Error: objectSchema({ error: { type: "string" } }, ["error"]),
    StatusResponse: objectSchema({ ok: { type: "boolean" }, message: { type: "string" } }),
    HealthResponse: objectSchema({ ok: { type: "boolean" }, service: { type: "string" } }, ["ok", "service"]),
    ReadinessResponse: objectSchema({
      ok: { type: "boolean" },
      service: { type: "string" },
      database: objectSchema({ driver: { type: "string" }, ready: { type: "boolean" }, file: { type: "string" } }),
      timestamp: dateTime,
    }, ["ok", "service", "database"]),
    Capabilities: objectSchema({
      service: { type: "string" },
      storage: objectSchema(),
      ai: objectSchema(),
      modules: arraySchema({ type: "string" }),
      integrations: arraySchema(schemaRef("IntegrationStatus")),
    }),
    User: objectSchema({
      id,
      name: { type: "string" },
      phone,
      email: { type: "string" },
      role: { type: "string", enum: ["owner", "admin", "doctor", "assistant", "patient"] },
      isActive: { type: "boolean" },
      patientId: id,
    }, ["id", "name", "phone", "role"]),
    UserInput: objectSchema({
      name: { type: "string" },
      phone,
      email: { type: "string" },
      role: { type: "string" },
      password: { type: "string" },
      isActive: { type: "boolean" },
      patientId: id,
    }),
    LoginResponse: objectSchema({
      token: { type: "string" },
      expiresAt: dateTime,
      user: schemaRef("User"),
    }, ["token", "expiresAt", "user"]),
    Patient: objectSchema({
      id,
      name: { type: "string" },
      phone,
      birthDate: date,
      email: { type: "string" },
      address: { type: "string" },
      createdAt: dateTime,
    }, ["id", "name", "phone"]),
    PatientInput: objectSchema({
      name: { type: "string" },
      phone,
      birthDate: date,
      email: { type: "string" },
      address: { type: "string" },
    }, ["name", "phone"]),
    Doctor: objectSchema({ id, name: { type: "string" }, specialty: { type: "string" } }, ["id", "name"]),
    Appointment: objectSchema({
      id,
      doctorId: id,
      patientId: id,
      date,
      time: { type: "string", example: "09:30" },
      duration: { type: "integer" },
      status: { type: "string" },
      visitId: id,
    }, ["id", "doctorId", "patientId", "date", "time", "status"]),
    AppointmentInput: objectSchema({
      doctorId: id,
      patientId: id,
      date,
      time: { type: "string", example: "09:30" },
      duration: { type: "integer", minimum: 10, maximum: 240 },
    }, ["doctorId", "patientId", "date", "time"]),
    Visit: objectSchema({
      id,
      appointmentId: id,
      doctorId: id,
      patientId: id,
      startedAt: dateTime,
      finishedAt: dateTime,
      complaint: { type: "string" },
      diagnosis: { type: "string" },
      isFinal: { type: "boolean" },
      diagnosisCode: { type: "string" },
      toothNumber: { type: "string" },
    }, ["id", "doctorId", "patientId"]),
    VisitFinishInput: objectSchema({
      appointmentId: id,
      complaint: { type: "string" },
      diagnosis: { type: "string" },
      notes: { type: "string" },
      diagnosisCode: { type: "string" },
      toothNumber: { type: "string" },
      materials: arraySchema(objectSchema()),
    }, ["appointmentId", "complaint", "diagnosis"]),
    Payment: objectSchema({
      id,
      patientId: id,
      visitId: id,
      amount: { type: "number" },
      method: { type: "string" },
      date,
      time: { type: "string" },
    }, ["id", "patientId", "amount", "method"]),
    PaymentInput: objectSchema({
      patientId: id,
      visitId: id,
      amount: { type: "number", minimum: 0 },
      method: { type: "string" },
      date,
    }, ["patientId", "amount", "method"]),
    InventoryItem: objectSchema({
      id,
      name: { type: "string" },
      category: { type: "string" },
      quantity: { type: "number" },
      minQuantity: { type: "number" },
      unit: { type: "string" },
    }, ["id", "name", "quantity"]),
    InventoryInput: objectSchema({
      name: { type: "string" },
      category: { type: "string" },
      quantity: { type: "number" },
      minQuantity: { type: "number" },
      unit: { type: "string" },
    }, ["name", "category"]),
    Invoice: objectSchema({
      id,
      patientId: id,
      visitId: id,
      status: { type: "string", enum: ["open", "partial", "paid"] },
      subtotal: { type: "number" },
      discount: { type: "number" },
      total: { type: "number" },
      paid: { type: "number" },
      items: arraySchema(objectSchema()),
    }, ["id", "patientId", "status", "total"]),
    InvoiceInput: objectSchema({
      patientId: id,
      visitId: id,
      discount: { type: "number" },
      items: arraySchema(objectSchema({
        priceItemId: id,
        name: { type: "string" },
        quantity: { type: "number" },
        unitPrice: { type: "number" },
      })),
    }, ["patientId", "items"]),
    PriceItem: objectSchema({
      id,
      code: { type: "string" },
      name: { type: "string" },
      category: { type: "string" },
      price: { type: "number" },
      isActive: { type: "boolean" },
    }, ["id", "code", "name", "price"]),
    PriceItemInput: objectSchema({
      code: { type: "string" },
      name: { type: "string" },
      category: { type: "string" },
      price: { type: "number" },
      isActive: { type: "boolean" },
    }, ["code", "name", "price"]),
    StockMovement: objectSchema({
      id,
      inventoryId: id,
      type: { type: "string", enum: ["in", "out", "adjustment"] },
      quantity: { type: "number" },
      balanceAfter: { type: "number" },
      reason: { type: "string" },
      createdAt: dateTime,
    }, ["id", "inventoryId", "type", "quantity"]),
    StockMovementInput: objectSchema({
      inventoryId: id,
      type: { type: "string", enum: ["in", "out", "adjustment"] },
      quantity: { type: "number" },
      reason: { type: "string" },
      visitId: id,
    }, ["inventoryId", "type", "quantity"]),
    FileRecord: objectSchema({ id, patientId: id, visitId: id, fileName: { type: "string" }, mimeType: { type: "string" }, createdAt: dateTime, cloudStorage: objectSchema() }),
    FileUploadInput: objectSchema({ patientId: id, visitId: id, fileName: { type: "string" }, mimeType: { type: "string" }, base64: { type: "string" } }, ["fileName", "base64"]),
    DocumentSignInput: objectSchema({ signerName: { type: "string" }, signature: { type: "string" } }),
    Notification: objectSchema({ id, type: { type: "string" }, title: { type: "string" }, body: { type: "string" }, role: { type: "string" }, isRead: { type: "boolean" }, createdAt: dateTime }),
    AuditLog: objectSchema({ id: { type: "integer" }, actorUserId: id, action: { type: "string" }, entityType: { type: "string" }, entityId: id, createdAt: dateTime }),
    Conversation: objectSchema({ id, patientId: id, channel: { type: "string" }, title: { type: "string" }, status: { type: "string" }, lastMessageAt: dateTime }),
    ConversationInput: objectSchema({ patientId: id, channel: { type: "string" }, title: { type: "string" }, externalId: { type: "string" } }, ["channel"]),
    ConversationMessage: objectSchema({ id, conversationId: id, direction: { type: "string" }, senderName: { type: "string" }, body: { type: "string" }, status: { type: "string" }, createdAt: dateTime }),
    ConversationMessageInput: objectSchema({ direction: { type: "string" }, senderName: { type: "string" }, body: { type: "string" }, status: { type: "string" } }, ["body"]),
    ToothChart: objectSchema({ bite: { type: "string" }, teeth: objectSchema(), updatedAt: dateTime }),
    MedicalCard: objectSchema({ patient: schemaRef("Patient"), visits: arraySchema(schemaRef("Visit")), payments: arraySchema(schemaRef("Payment")) }),
    TreatmentPlanItem: objectSchema({ id, toothNumber: { type: "string" }, text: { type: "string" }, status: { type: "string" } }),
    Debtor: objectSchema({ patientId: id, patientName: { type: "string" }, debt: { type: "number" } }),
    Report: objectSchema(),
    Backup: objectSchema({ fileName: { type: "string" }, size: { type: "integer" }, createdAt: dateTime }),
    SessionInfo: objectSchema({
      tokenPreview: { type: "string" },
      subjectType: { type: "string" },
      subjectId: { type: "string" },
      createdAt: dateTime,
      expiresAt: dateTime,
      isExpired: { type: "boolean" },
    }),
    MaintenanceResult: objectSchema({
      ok: { type: "boolean" },
      expiredSessionsDeleted: { type: "integer" },
      backupsDeleted: { type: "integer" },
      retentionDays: { type: "integer" },
      cleanedAt: dateTime,
    }),
    SystemExport: objectSchema({
      exportedAt: dateTime,
      format: { type: "string" },
      data: objectSchema(),
    }),
    IntegrationStatus: objectSchema({
      provider: { type: "string", enum: ["email", "sms", "whatsapp", "fileStorage", "fiscalization", "eSignature", "ai", "resend", "supabaseStorage"] },
      configured: { type: "boolean" },
      urlEnv: { type: "string" },
      tokenEnv: { type: "string" },
      bucketEnv: { type: "string" },
    }, ["provider", "configured"]),
    EmailTestResult: objectSchema({
      ok: { type: "boolean" },
      to: { type: "string", format: "email" },
      subject: { type: "string" },
      delivery: objectSchema({
        ok: { type: "boolean" },
        provider: { type: "string" },
        status: { type: "string" },
        statusCode: { type: "integer" },
        id: { type: "string" },
        reason: { type: "string" },
        error: { type: "string" },
      }),
    }, ["ok", "to", "subject", "delivery"]),
    InvoiceEmailResult: objectSchema({
      ok: { type: "boolean" },
      invoiceId: id,
      patientId: id,
      to: { type: "string", format: "email" },
      subject: { type: "string" },
      delivery: objectSchema(),
      notification: schemaRef("Notification"),
    }, ["ok", "invoiceId", "to", "delivery"]),
    SystemStatus: objectSchema({
      ok: { type: "boolean" },
      service: { type: "string" },
      storage: objectSchema({ driver: { type: "string" }, file: { type: "string" }, size: { type: "integer" } }),
      counts: objectSchema(),
    }),
  };
}

export function getOpenApiSpec() {
  const paths = {};
  for (const [method, pathname, summary, isProtected] of API_ENDPOINTS) {
    const pathKey = openApiPath(pathname);
    const request = openApiRequestBody(method, pathname);
    if (!paths[pathKey]) paths[pathKey] = {};
    paths[pathKey][method.toLowerCase()] = {
      summary,
      tags: [pathname.split("/")[2] || "system"],
      security: isProtected ? [{ bearerAuth: [] }, { cookieAuth: [] }] : [],
      parameters: openApiParameters(pathname),
      ...(request ? { requestBody: request } : {}),
      responses: {
        200: openApiSuccessResponse(method, pathname),
        201: openApiSuccessResponse(method, pathname),
        400: { description: "Bad request", ...jsonContent(schemaRef("Error")) },
        401: { description: "Unauthorized", ...jsonContent(schemaRef("Error")) },
        403: { description: "Forbidden", ...jsonContent(schemaRef("Error")) },
        404: { description: "Not found", ...jsonContent(schemaRef("Error")) },
        429: { description: "Too many requests", ...jsonContent(schemaRef("Error")) },
      },
    };
  }
  return {
    openapi: "3.0.3",
    info: {
      title: "NeuroDent Backend API",
      version: "1.0.0",
      description: "Server-side REST API for NeuroDent CRM.",
    },
    servers: [{ url: "http://localhost:3000" }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
        cookieAuth: { type: "apiKey", in: "cookie", name: "nd_token" },
      },
      schemas: openApiSchemas(),
    },
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function getApiDocsHtml() {
  const rows = API_ENDPOINTS.map(([method, pathname, summary, isProtected]) => `
    <tr>
      <td><span class="method">${escapeHtml(method)}</span></td>
      <td><code>${escapeHtml(pathname)}</code></td>
      <td>${escapeHtml(summary)}</td>
      <td>${isProtected ? "auth" : "public"}</td>
    </tr>
  `).join("");
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>NeuroDent Backend API</title>
  <style>
    body { margin: 0; font-family: Georgia, "Times New Roman", serif; background: #f6f2e9; color: #1f2933; }
    main { max-width: 1100px; margin: 0 auto; padding: 40px 20px; }
    h1 { font-size: 42px; margin: 0 0 10px; }
    p { font-size: 18px; line-height: 1.6; }
    a { color: #075e54; }
    table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #e3dccf; border-radius: 16px; overflow: hidden; }
    th, td { padding: 12px 14px; border-bottom: 1px solid #eee7da; text-align: left; vertical-align: top; }
    th { background: #0f3d36; color: white; font-size: 13px; text-transform: uppercase; letter-spacing: .08em; }
    code { font-family: "SFMono-Regular", Consolas, monospace; }
    .method { display: inline-block; min-width: 54px; font-weight: 700; color: #0f3d36; }
  </style>
</head>
<body>
  <main>
    <h1>NeuroDent Backend API</h1>
    <p>REST API работает на сервере, хранит данные в SQLite и защищает рабочие route-ы через <code>nd_token</code> cookie или Bearer token.</p>
    <p>OpenAPI JSON: <a href="/api/openapi.json">/api/openapi.json</a></p>
    <table>
      <thead><tr><th>Method</th><th>Route</th><th>Description</th><th>Access</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </main>
</body>
</html>`;
}

export async function sendPatientReminder(patientId, message = "", options = {}) {
  await delay(150);
  const patient = getPatient(patientId);
  if (!patient) throw new Error("Пациент не найден");
  const text = String(message || `Здравствуйте, ${patient.name}. Напоминаем о визите в NeuroDent.`);
  const channel = String(options.channel || "sms").toLowerCase();
  if (!["sms", "whatsapp", "email"].includes(channel)) {
    throw new Error("Unsupported reminder channel");
  }
  if (channel === "email" && !patient.email) {
    throw new Error("Patient email is required for email reminder");
  }
  const metadata = { type: "patient_reminder", patientId };
  let delivery;
  if (channel === "email") {
    delivery = await sendEmail({
      to: patient.email,
      subject: "NeuroDent appointment reminder",
      text,
      html: `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`,
      metadata,
    });
  } else if (channel === "whatsapp") {
    delivery = await sendWhatsApp({ to: patient.phone, message: text, metadata });
  } else {
    delivery = await sendSms({ to: patient.phone, message: text, metadata });
  }
  const notification = createNotificationRecord({
    id: genId("notif"),
    type: "reminder_sent",
    title: "Напоминание отправлено",
    body: `${patient.name}: ${text}`,
    role: "admin",
    isRead: false,
    createdAt: new Date().toISOString(),
    extra: { patientId, channel, delivery },
  });
  audit("send_reminder", "patient", patientId, { message: text, notificationId: notification.id, channel, delivery }, actorIdFromOptions(options));
  return {
    ok: true,
    patientId,
    phone: patient.phone,
    email: patient.email || "",
    message: text,
    channel,
    delivery,
    notification,
  };
}

function defaultPriceItems() {
  return [
    { code: "CONSULT", name: "Консультация стоматолога", category: "Диагностика", price: 5000 },
    { code: "CARIES-SURFACE", name: "Лечение поверхностного кариеса", category: "Терапия", price: 15000 },
    { code: "CARIES-MEDIUM", name: "Лечение среднего кариеса", category: "Терапия", price: 22000 },
    { code: "CARIES-DEEP", name: "Лечение глубокого кариеса", category: "Терапия", price: 30000 },
    { code: "ENDO", name: "Эндодонтическое лечение", category: "Эндодонтия", price: 45000 },
    { code: "ANESTHESIA", name: "Анестезия", category: "Анестезия", price: 3000 },
    { code: "HYGIENE", name: "Профессиональная гигиена", category: "Гигиена", price: 18000 },
    { code: "ORTHO-PLAN", name: "Ортодонтическая диагностика", category: "Ортодонтия", price: 25000 },
  ];
}

function ensureDefaultPriceList() {
  const existing = listPriceItemRecords({});
  if (existing.length) return;
  const now = new Date().toISOString();
  for (const item of defaultPriceItems()) {
    upsertPriceItemRecord({
      id: genId("price"),
      ...item,
      isActive: true,
      createdAt: now,
    });
  }
}

export async function getPriceItems(query = "", activeOnly = false) {
  await delay(120);
  ensureDefaultPriceList();
  return clone(listPriceItemRecords({ query, activeOnly }));
}

export async function createPriceItem(data, options = {}) {
  await delay(150);
  const code = String(data?.code || "").trim().toUpperCase();
  const name = String(data?.name || "").trim();
  const category = String(data?.category || "").trim();
  const price = Number(data?.price);
  if (!code) throw new Error("Укажите код услуги");
  if (name.length < 2) throw new Error("Название услуги слишком короткое");
  if (!Number.isFinite(price) || price < 0) throw new Error("Цена должна быть положительным числом");
  if (getPriceItemRecord(code)) throw new Error("Услуга с таким кодом уже есть");
  const item = upsertPriceItemRecord({
    id: genId("price"),
    code,
    name,
    category,
    price,
    isActive: data?.isActive !== false,
    createdAt: new Date().toISOString(),
  });
  audit("create", "price_item", item.id, { code, name, price }, actorIdFromOptions(options));
  return clone(item);
}

export async function updatePriceItem(id, patch, options = {}) {
  await delay(150);
  const existing = getPriceItemRecord(id);
  if (!existing) throw new Error("Услуга не найдена");
  const nextCode = patch?.code !== undefined ? String(patch.code).trim().toUpperCase() : existing.code;
  const nextName = patch?.name !== undefined ? String(patch.name).trim() : existing.name;
  const nextPrice = patch?.price !== undefined ? Number(patch.price) : existing.price;
  const duplicate = getPriceItemRecord(nextCode);
  if (!nextCode) throw new Error("Укажите код услуги");
  if (nextName.length < 2) throw new Error("Название услуги слишком короткое");
  if (!Number.isFinite(nextPrice) || nextPrice < 0) throw new Error("Цена должна быть положительным числом");
  if (duplicate && duplicate.id !== existing.id) throw new Error("Услуга с таким кодом уже есть");
  const item = upsertPriceItemRecord({
    ...existing,
    code: nextCode,
    name: nextName,
    category: patch?.category !== undefined ? String(patch.category).trim() : existing.category,
    price: nextPrice,
    isActive: patch?.isActive !== undefined ? !!patch.isActive : existing.isActive,
    createdAt: existing.createdAt,
  });
  audit("update", "price_item", item.id, { patch }, actorIdFromOptions(options));
  return clone(item);
}

export async function setPriceItemActive(id, isActive, options = {}) {
  await delay(120);
  const item = setPriceItemActiveRecord(id, isActive);
  if (!item) throw new Error("Услуга не найдена");
  audit(isActive ? "activate" : "deactivate", "price_item", id, {}, actorIdFromOptions(options));
  return clone(item);
}

function invoiceStatus(total, paid) {
  if (paid <= 0) return "open";
  if (paid >= total) return "paid";
  return "partial";
}

function normalizeInvoiceItems(items = []) {
  ensureDefaultPriceList();
  return items.map((raw) => {
    const priceItem = raw.priceItemId || raw.code
      ? getPriceItemRecord(raw.priceItemId || raw.code)
      : null;
    const quantity = Number(raw.quantity || 1);
    const unitPrice = raw.unitPrice !== undefined ? Number(raw.unitPrice) : Number(priceItem?.price || 0);
    const name = String(raw.name || priceItem?.name || "").trim();
    if (!name) throw new Error("У позиции счета нет названия");
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Количество должно быть больше 0");
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error("Цена позиции некорректна");
    return {
      id: genId("inv_item"),
      priceItemId: priceItem?.id || raw.priceItemId || "",
      name,
      quantity,
      unitPrice,
      total: quantity * unitPrice,
    };
  });
}

export async function createInvoice(data, options = {}) {
  await delay(180);
  const patientId = String(data?.patientId || "");
  const visitId = data?.visitId ? String(data.visitId) : "";
  if (!getPatient(patientId)) throw new Error("Пациент не найден");
  if (visitId) {
    const visit = getVisit(visitId);
    if (!visit) throw new Error("Визит не найден");
    if (visit.patientId !== patientId) throw new Error("Визит не принадлежит пациенту");
  }
  const items = normalizeInvoiceItems(data?.items || []);
  if (!items.length) throw new Error("Добавьте хотя бы одну позицию счета");
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const discount = Number(data?.discount || 0);
  if (!Number.isFinite(discount) || discount < 0) throw new Error("Скидка некорректна");
  const total = Math.max(0, subtotal - discount);
  const requestedPaid = Number(data?.paid || 0);
  if (!Number.isFinite(requestedPaid) || requestedPaid < 0) throw new Error("Оплаченная сумма некорректна");
  const paid = Math.min(total, requestedPaid);
  const now = new Date().toISOString();
  const invoice = createInvoiceRecord(
    {
      id: genId("invoice"),
      patientId,
      visitId,
      date: data?.date ? String(data.date) : now.slice(0, 10),
      status: invoiceStatus(total, paid),
      subtotal,
      discount,
      total,
      paid,
      createdAt: now,
    },
    items,
  );
  if (paid > 0) {
    await createPayment({
      date: invoice.date,
      amount: paid,
      method: data?.method || "cash",
      patientId,
      visitId: visitId || null,
    }, options);
  }
  audit("create", "invoice", invoice.id, { patientId, visitId, total }, actorIdFromOptions(options));
  return clone(invoice);
}

export async function getInvoices(query = {}) {
  await delay(140);
  return clone(listInvoiceRecords(query));
}

export async function getInvoice(id) {
  await delay(100);
  const invoice = getInvoiceRecord(id);
  if (!invoice) throw new Error("Счет не найден");
  return clone(invoice);
}

function formatInvoiceAmount(amount) {
  return `${Math.round(Number(amount || 0)).toLocaleString("ru-RU")} KZT`;
}

function invoiceEmailText(invoice, patient, message = "") {
  const lines = [
    message ? String(message) : `Hello, ${patient.name}. NeuroDent has prepared your invoice.`,
    "",
    `Invoice: ${invoice.id}`,
    `Date: ${invoice.date}`,
    `Status: ${invoice.status}`,
    "",
    "Items:",
    ...(invoice.items || []).map((item, index) => `${index + 1}. ${item.name} x ${item.quantity} = ${formatInvoiceAmount(item.total)}`),
    "",
    `Subtotal: ${formatInvoiceAmount(invoice.subtotal)}`,
    `Discount: ${formatInvoiceAmount(invoice.discount)}`,
    `Total: ${formatInvoiceAmount(invoice.total)}`,
    `Paid: ${formatInvoiceAmount(invoice.paid)}`,
    `Debt: ${formatInvoiceAmount(Math.max(0, Number(invoice.total || 0) - Number(invoice.paid || 0)))}`,
  ];
  return lines.join("\n");
}

function invoiceEmailHtml(invoice, patient, message = "") {
  const items = (invoice.items || [])
    .map((item) => `<li>${escapeHtml(item.name)} x ${escapeHtml(item.quantity)} = ${escapeHtml(formatInvoiceAmount(item.total))}</li>`)
    .join("");
  return `
    <p>${escapeHtml(message || `Hello, ${patient.name}. NeuroDent has prepared your invoice.`)}</p>
    <p><strong>Invoice:</strong> ${escapeHtml(invoice.id)}<br>
    <strong>Date:</strong> ${escapeHtml(invoice.date)}<br>
    <strong>Status:</strong> ${escapeHtml(invoice.status)}</p>
    <ul>${items}</ul>
    <p><strong>Total:</strong> ${escapeHtml(formatInvoiceAmount(invoice.total))}<br>
    <strong>Paid:</strong> ${escapeHtml(formatInvoiceAmount(invoice.paid))}<br>
    <strong>Debt:</strong> ${escapeHtml(formatInvoiceAmount(Math.max(0, Number(invoice.total || 0) - Number(invoice.paid || 0))))}</p>
  `;
}

export async function sendInvoiceEmail(id, data = {}, options = {}) {
  await delay(150);
  const invoice = getInvoiceRecord(id);
  if (!invoice) throw new Error("Invoice not found");
  const patient = getPatient(invoice.patientId);
  if (!patient) throw new Error("Patient not found");
  const recipient = String(data.email || data.to || patient.email || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new Error("Valid patient email is required");
  }
  const subject = String(data.subject || `NeuroDent invoice ${invoice.id}`);
  const message = String(data.message || "");
  const delivery = await sendEmail({
    to: recipient,
    subject,
    text: invoiceEmailText(invoice, patient, message),
    html: invoiceEmailHtml(invoice, patient, message),
    metadata: {
      type: "invoice_email",
      invoiceId: invoice.id,
      patientId: patient.id,
      actorUserId: actorIdFromOptions(options),
    },
  });
  const notification = createNotificationRecord({
    id: genId("notif"),
    type: "invoice_email_sent",
    title: "Invoice email sent",
    body: `${patient.name}: ${invoice.id}`,
    role: "admin",
    isRead: false,
    createdAt: new Date().toISOString(),
    extra: { invoiceId: invoice.id, patientId: patient.id, to: recipient, delivery },
  });
  audit("send_invoice_email", "invoice", invoice.id, { patientId: patient.id, to: recipient, delivery, notificationId: notification.id }, actorIdFromOptions(options));
  return {
    ok: !!delivery?.ok,
    invoiceId: invoice.id,
    patientId: patient.id,
    to: recipient,
    subject,
    delivery,
    notification,
  };
}

export async function payInvoice(id, data = {}, options = {}) {
  await delay(180);
  const invoice = getInvoiceRecord(id);
  if (!invoice) throw new Error("Счет не найден");
  const amount = Number(data.amount);
  const method = String(data.method || "cash");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Сумма должна быть больше 0");
  validatePaymentMethod(method);
  const remaining = Math.max(0, Number(invoice.total || 0) - Number(invoice.paid || 0));
  if (remaining <= 0) throw new Error("Счет уже оплачен");
  const appliedAmount = Math.min(amount, remaining);
  const paid = Math.min(invoice.total, Number(invoice.paid || 0) + appliedAmount);
  const updated = updateInvoicePaymentRecord(id, paid, invoiceStatus(invoice.total, paid));
  await createPayment({
    date: data.date || new Date().toISOString().slice(0, 10),
    amount: appliedAmount,
    method,
    patientId: invoice.patientId,
    visitId: invoice.visitId || null,
  }, options);
  audit("pay", "invoice", id, { amount: appliedAmount, requestedAmount: amount, method, paid }, actorIdFromOptions(options));
  return clone(updated);
}

export async function createStockMovement(data, options = {}) {
  await delay(160);
  const inventoryId = String(data?.inventoryId || data?.id || "");
  const type = String(data?.type || "").trim();
  const quantity = Number(data?.quantity);
  const reason = String(data?.reason || "").trim();
  const visitId = data?.visitId ? String(data.visitId) : "";
  const item = db.inventory.find((entry) => entry.id === inventoryId);
  if (!item) throw new Error("Материал не найден");
  if (visitId && !getVisit(visitId)) throw new Error("Визит не найден");
  if (!["in", "out", "adjustment"].includes(type)) throw new Error("Неверный тип движения склада");
  if (!Number.isFinite(quantity) || (type === "adjustment" ? quantity < 0 : quantity <= 0)) {
    throw new Error(type === "adjustment" ? "Остаток не может быть отрицательным" : "Количество должно быть больше 0");
  }

  const signedDelta = type === "in" ? quantity : type === "out" ? -quantity : quantity - Number(item.quantity || 0);
  const nextQuantity = Number(item.quantity || 0) + signedDelta;
  if (nextQuantity < 0) throw new Error("Недостаточно на складе");
  item.quantity = nextQuantity;
  saveDb();
  const movement = createStockMovementRecord({
    id: genId("stock"),
    inventoryId,
    type,
    quantity: type === "adjustment" ? signedDelta : quantity,
    balanceAfter: item.quantity,
    reason,
    visitId,
    actorUserId: actorIdFromOptions(options),
    createdAt: new Date().toISOString(),
  });
  audit("create", "stock_movement", movement.id, { inventoryId, type, quantity, balanceAfter: item.quantity }, actorIdFromOptions(options));
  return clone(movement);
}

export async function getStockMovements(query = {}) {
  await delay(120);
  return clone(listStockMovementRecords(query));
}

export async function getPeriodReport({ dateFrom, dateTo } = {}) {
  await delay(180);
  const from = String(dateFrom || TODAY);
  const to = String(dateTo || from);
  validateIsoDate(from, "Дата начала");
  validateIsoDate(to, "Дата окончания");
  if (from > to) throw new Error("Дата начала не может быть позже даты окончания");
  const payments = db.payments.filter((payment) => payment.date >= from && payment.date <= to);
  const appointments = db.appointments.filter((appt) => appt.date >= from && appt.date <= to);
  const visits = db.visits.filter((visit) => {
    const date = String(visit.startedAt || "").slice(0, 10);
    return date >= from && date <= to;
  });
  const invoices = listInvoiceRecords({ dateFrom: from, dateTo: to });
  const totalRevenue = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const invoiceTotal = invoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  const invoicePaid = invoices.reduce((sum, invoice) => sum + Number(invoice.paid || 0), 0);
  const byMethod = payments.reduce((acc, payment) => {
    acc[payment.method] = (acc[payment.method] || 0) + Number(payment.amount || 0);
    return acc;
  }, {});
  return clone({
    dateFrom: from,
    dateTo: to,
    totalRevenue,
    paymentsCount: payments.length,
    appointmentsCount: appointments.length,
    completedVisits: visits.filter((visit) => visit.isFinal).length,
    invoiceTotal,
    invoicePaid,
    invoiceDebt: Math.max(0, invoiceTotal - invoicePaid),
    byMethod,
    invoices,
  });
}
