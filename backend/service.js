import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
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
  getPriceItemRecord,
  getSessionRecord,
  initializeStore,
  listAuditLogRecords,
  listConversationMessageRecords,
  listConversationRecords,
  listFileRecords,
  listInvoiceRecords,
  listNotificationRecords,
  listPriceItemRecords,
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

const TODAY = new Date().toISOString().slice(0, 10);
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function delay(ms = 600) {
  return new Promise((res) => setTimeout(res, ms));
}

function maybeFail() {}

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

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, passwordSalt, ...safeUser } = user;
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

function extensionFromMime(mimeType) {
  const type = String(mimeType || "").toLowerCase();
  if (type.includes("png")) return ".png";
  if (type.includes("jpeg") || type.includes("jpg")) return ".jpg";
  if (type.includes("pdf")) return ".pdf";
  if (type.includes("csv")) return ".csv";
  if (type.includes("json")) return ".json";
  return ".txt";
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
  const allowed = new Set(["cash", "card"]);
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

// Возвращает список всех врачей клиники.
// Backend: GET /doctors → Doctor[]
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
export async function searchPatients(query = "") {
  await delay();
  const q = String(query).trim().toLowerCase();
  
  // Create an array of patients
  const patientsArray = Array.isArray(db.patients) ? db.patients : [];
  
  const list = patientsArray
    .filter(
      (p) =>
        !q || p.name.toLowerCase().includes(q) || String(p.phone).includes(q),
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
  if (name.length < 2) throw new Error("Имя слишком короткое");
  if (phone.length < 10) throw new Error("Неверный номер телефона");
  if (db.patients.some((p) => p.phone === phone))
    throw new Error("Пациент с таким телефоном уже существует");
  const newPatient = { 
    id: genId("p"), 
    name, 
    phone, 
    birthDate,
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
  if (name.length < 2) throw new Error("Имя слишком короткое");
  if (phone.length < 10) throw new Error("Неверный номер телефона");
  if (
    phone !== p.phone &&
    db.patients.some((x) => x.phone === phone && x.id !== id)
  ) {
    throw new Error("Этот телефон уже используется другим пациентом");
  }
  p.name = name;
  p.phone = phone;
  p.birthDate = birthDate;
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
  audit("create", "payment", payment.id, { patientId, amount, method }, actorIdFromOptions(options));
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

  return clone({
    date,
    payments,
    totalAmount,
    visitsCompleted,
    aiSignals,
    doctorRevenue,
    specialtyRevenue,
  });
}

// Возвращает историю всех завершённых визитов пациента (от новых к старым).
// Backend: GET /visits?patientId= → Visit[]
export async function getVisitsByPatient(patientId) {
  await delay(500);
  if (!patientId) throw new Error("Пациент не выбран");
  const list = db.visits
    .filter((v) => v.patientId === patientId)
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
    files: listFileRecords({ patientId }).map(({ storagePath, ...file }) => file),
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
  const record = createFileRecord({
    id: stored.id,
    patientId,
    visitId,
    fileName: stored.fileName,
    mimeType,
    storagePath: stored.storagePath,
    createdAt: new Date().toISOString(),
    extra: { kind: data?.kind || "upload" },
  });
  audit("create", "file", record.id, { patientId, visitId, fileName: record.fileName }, actorIdFromOptions(options));
  const { storagePath, ...safeRecord } = record;
  return clone(safeRecord);
}

export async function getFiles({ patientId = "", visitId = "" } = {}) {
  await delay(100);
  const files = listFileRecords({ patientId, visitId }).map(({ storagePath, ...file }) => file);
  return clone(files);
}

export async function getFileDownload(fileId) {
  await delay(100);
  const file = getFileRecord(fileId);
  if (!file || !existsSync(file.storagePath)) throw new Error("Файл не найден");
  return {
    file: {
      id: file.id,
      patientId: file.patientId,
      visitId: file.visitId,
      fileName: file.fileName,
      mimeType: file.mimeType,
      createdAt: file.createdAt,
    },
    bytes: readFileSync(file.storagePath),
  };
}

export async function deleteFile(fileId, options = {}) {
  await delay(100);
  const file = getFileRecord(fileId);
  if (!file) throw new Error("Файл не найден");
  if (existsSync(file.storagePath)) unlinkSync(file.storagePath);
  deleteFileRecord(fileId);
  audit("delete", "file", fileId, { fileName: file.fileName }, actorIdFromOptions(options));
  return { ok: true };
}

export async function createPatientProtocolDocument(patientId, options = {}) {
  await delay(250);
  const text = await getPatientProtocol(patientId);
  const patient = getPatient(patientId);
  const createdAt = new Date().toISOString();
  const bytes = Buffer.from(text, "utf8");
  const stored = writeStoredFile(DOCUMENTS_DIR, `AI_Protocol_${patientId}.txt`, bytes);
  const record = createFileRecord({
    id: stored.id,
    patientId,
    visitId: latestFinalVisit(patientId)?.id || "",
    fileName: stored.fileName,
    mimeType: "text/plain; charset=utf-8",
    storagePath: stored.storagePath,
    createdAt,
    extra: { kind: "ai-protocol", patientName: patient?.name || "" },
  });
  audit("create", "document", record.id, { patientId, type: "ai-protocol" }, actorIdFromOptions(options));
  const { storagePath, ...safeRecord } = record;
  return clone(safeRecord);
}

export async function signDocument(fileId, data = {}, options = {}) {
  await delay(250);
  const file = getFileRecord(fileId);
  if (!file) throw new Error("Документ не найден");
  const signatureId = genId("sign");
  const notification = createNotificationRecord({
    id: genId("notif"),
    type: "document_signed",
    title: "Документ подписан",
    body: `${file.fileName} подписан через ЭЦП`,
    role: "owner",
    isRead: false,
    createdAt: new Date().toISOString(),
    extra: { fileId, signatureId },
  });
  audit("sign", "document", fileId, {
    signatureId,
    provider: data.provider || "egov",
    notificationId: notification.id,
  }, actorIdFromOptions(options));
  return {
    ok: true,
    fileId,
    signatureId,
    provider: data.provider || "egov",
    signedAt: new Date().toISOString(),
  };
}

export async function getNotifications({ role = "", unreadOnly = false } = {}) {
  await delay(100);
  return clone(listNotificationRecords({ role, unreadOnly }));
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
  return clone(listConversationRecords({
    query: query?.query || query?.q || "",
    channel: query?.channel || "",
    status: query?.status || "",
    patientId: query?.patientId || "",
    limit: query?.limit || 100,
  }).map(enrichConversation));
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
    .map(({ score, ...item }) => item));
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
  return clone({
    ...signals,
    icdSuggestions: DENTAL_ICD10
      .filter((item) => item.code === signals.diagnosisCode || item.cariesType === signals.cariesType)
      .slice(0, 5),
    riskAlerts: clinicalRiskAlerts(patient, visits, signals),
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
  audit("draft", "clinical_protocol", patient?.id || "anonymous", { diagnosisCode: signals.diagnosisCode }, actorIdFromOptions(options));
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

const API_ENDPOINTS = [
  ["GET", "/api/health", "Backend health check", false],
  ["GET", "/api/docs", "HTML API documentation", false],
  ["GET", "/api/openapi.json", "OpenAPI schema", false],
  ["POST", "/api/auth/login", "Login by phone and password", false],
  ["GET", "/api/auth/me", "Current session user", true],
  ["POST", "/api/auth/logout", "Logout current session", true],
  ["POST", "/api/auth/change-password", "Change current password", true],
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
  ["GET", "/api/visits/:id/materials", "Visit materials", true],
  ["GET", "/api/visits/:id/services", "Visit services", true],
  ["GET", "/api/files", "List files", true],
  ["POST", "/api/files", "Upload file metadata/content", true],
  ["GET", "/api/files/:id/download", "Download file", true],
  ["DELETE", "/api/files/:id", "Delete file", true],
  ["POST", "/api/documents/:id/sign", "Sign document placeholder", true],
  ["GET", "/api/payments", "Payments by date", true],
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

export function getOpenApiSpec() {
  const paths = {};
  for (const [method, pathname, summary, isProtected] of API_ENDPOINTS) {
    const pathKey = openApiPath(pathname);
    if (!paths[pathKey]) paths[pathKey] = {};
    paths[pathKey][method.toLowerCase()] = {
      summary,
      tags: [pathname.split("/")[2] || "system"],
      security: isProtected ? [{ bearerAuth: [] }, { cookieAuth: [] }] : [],
      parameters: openApiParameters(pathname),
      responses: {
        200: { description: "Success" },
        400: { description: "Bad request" },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
        404: { description: "Not found" },
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
  const notification = createNotificationRecord({
    id: genId("notif"),
    type: "reminder_sent",
    title: "Напоминание отправлено",
    body: `${patient.name}: ${text}`,
    role: "admin",
    isRead: false,
    createdAt: new Date().toISOString(),
    extra: { patientId },
  });
  audit("send_reminder", "patient", patientId, { message: text, notificationId: notification.id }, actorIdFromOptions(options));
  return {
    ok: true,
    patientId,
    phone: patient.phone,
    message: text,
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
