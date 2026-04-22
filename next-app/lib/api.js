function delay(ms = 600) {
  return new Promise((res) => setTimeout(res, ms));
}

const clone = (data) => JSON.parse(JSON.stringify(data));
const TODAY = new Date().toISOString().slice(0, 10);

function shiftDate(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function genId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

function getDb() {
  if (typeof localStorage === "undefined") return clone(initialDb);
  const saved = localStorage.getItem("neurodent_db");
  const data = saved ? JSON.parse(saved) : clone(initialDb);
  if (!Array.isArray(data.users)) data.users = clone(initialDb.users);
  return data;
}

function saveDb(db) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("neurodent_db", JSON.stringify(db));
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
    { id: "p1", name: "Иван Иванов", phone: "87001112233", birthDate: "2001-04-10", createdAt: "2023-03-02" },
    { id: "p2", name: "Анна Петрова", phone: "87009998877", birthDate: "1998-11-05", createdAt: "2023-11-10" },
    { id: "p3", name: "Дамир Алиев", phone: "87005556677", birthDate: "2005-02-01", createdAt: "2024-01-15" },
    { id: "p4", name: "Айгерим Бекова", phone: "87712345678", birthDate: "1995-07-22", createdAt: "2024-02-10" },
    { id: "p5", name: "Нұрлан Сейітов", phone: "87001234567", birthDate: "1988-03-15", createdAt: "2024-03-05" },
    { id: "p6", name: "Мадина Қасымова", phone: "87759876543", birthDate: "2000-12-30", createdAt: "2024-03-18" },
    { id: "p7", name: "Арман Жұмабаев", phone: "87013334455", birthDate: "1992-09-08", createdAt: "2024-04-01" },
    { id: "p8", name: "Зарина Әбілова", phone: "87027778899", birthDate: "2003-05-17", createdAt: "2024-04-10" },
    { id: "p9", name: "Серік Нұрланов", phone: "87051112233", birthDate: "1979-11-04", createdAt: "2024-04-15" },
    { id: "p10", name: "Дина Марат", phone: "87082223344", birthDate: "1997-06-25", createdAt: "2024-04-18" },
  ],
  appointments: [
    { id: "a1", doctorId: "d1", date: TODAY, time: "09:30", duration: 30, patientId: "p1", status: "scheduled", visitId: null },
    { id: "a2", doctorId: "d1", date: TODAY, time: "10:00", duration: 60, patientId: "p2", status: "arrived", visitId: null },
    { id: "a3", doctorId: "d2", date: TODAY, time: "11:30", duration: 45, patientId: "p3", status: "scheduled", visitId: null },
    { id: "a5", doctorId: "d2", date: shiftDate(TODAY, -3), time: "09:00", duration: 30, patientId: "p1", status: "completed", visitId: "v2" },
    { id: "a6", doctorId: "d3", date: TODAY, time: "10:30", duration: 90, patientId: "p2", status: "arrived", visitId: null },
    { id: "a7", doctorId: "d1", date: TODAY, time: "14:00", duration: 45, patientId: "p3", status: "scheduled", visitId: null },
    { id: "a8", doctorId: "d3", date: TODAY, time: "13:00", duration: 60, patientId: "p1", status: "cancelled", visitId: null },
    { id: "a9", doctorId: "d3", date: shiftDate(TODAY, -5), time: "08:30", duration: 30, patientId: "p3", status: "completed", visitId: "v4" },
    { id: "a10", doctorId: "d5", date: TODAY, time: "12:00", duration: 60, patientId: "p1", status: "arrived", visitId: null },
    { id: "a11", doctorId: "d1", date: shiftDate(TODAY, -2), time: "09:00", duration: 45, patientId: "p2", status: "completed", visitId: "v3" },
    { id: "a4", doctorId: "d1", date: shiftDate(TODAY, -1), time: "15:00", duration: 30, patientId: "p3", status: "completed", visitId: "v1" },
  ],
  visits: [
    {
      id: "v1", appointmentId: "a4", doctorId: "d1", patientId: "p3",
      startedAt: `${shiftDate(TODAY, -1)}T15:00:00`, finishedAt: `${shiftDate(TODAY, -1)}T15:25:00`,
      complaint: "Зубная боль", diagnosis: "Кариес", notes: "Рекомендована консультация стоматолога",
      isFinal: true, diagnosisCode: "K02.1", cariesType: "deep", toothNumber: "16",
      protocol: { complaints: "Боль в верхней челюсти справа", anamnesis: "Хронический кариес", objective: "Глубокая кариозная полость", diagnosisText: "Кариес дентина (16)", treatment: "Анестезия Ultracain, пломба Filtek Z250" },
      materials: [{ code: "ultracain", name: "Ultracain D-S forte 1.7ml", qty: 1, unit: "амп" }, { code: "filtek", name: "Filtek Z250 (шприц)", qty: 1, unit: "шт" }],
    },
    {
      id: "v2", appointmentId: "a5", doctorId: "d2", patientId: "p1",
      startedAt: `${shiftDate(TODAY, -3)}T09:00:00`, finishedAt: `${shiftDate(TODAY, -3)}T09:40:00`,
      complaint: "Боль при жевании справа снизу", diagnosis: "Пульпит зуба 46", notes: "Эндодонтическое лечение, временная пломба",
      isFinal: true, diagnosisCode: "K04.0", cariesType: "complicated", toothNumber: "46",
      protocol: { complaints: "Острая боль при жевании", anamnesis: "Пломба выпала 2 недели назад", objective: "Глубокая кариозная полость", diagnosisText: "Острый пульпит (46)", treatment: "Удаление пульпы, обработка каналов" },
      materials: [{ code: "ultracain", name: "Ultracain D-S forte 1.7ml", qty: 2, unit: "амп" }],
    },
    {
      id: "v3", appointmentId: "a11", doctorId: "d1", patientId: "p2",
      startedAt: `${shiftDate(TODAY, -2)}T11:00:00`, finishedAt: `${shiftDate(TODAY, -2)}T11:30:00`,
      complaint: "Кровоточивость дёсен", diagnosis: "Хронический гингивит", notes: "Профессиональная гигиена",
      isFinal: true, diagnosisCode: "K05.1", cariesType: "surface", toothNumber: "31",
      protocol: { complaints: "Кровоточивость дёсен", anamnesis: "Жалобы 3 месяца", objective: "Отёк дёсен, зубной камень", diagnosisText: "Хронический гингивит", treatment: "Удаление камня, полировка" },
      materials: [{ code: "chlorhexidine", name: "Хлоргексидин 0.05%", qty: 1, unit: "шт" }],
    },
    {
      id: "v4", appointmentId: "a9", doctorId: "d3", patientId: "p3",
      startedAt: `${shiftDate(TODAY, -5)}T08:30:00`, finishedAt: `${shiftDate(TODAY, -5)}T09:15:00`,
      complaint: "Скученность зубов", diagnosis: "Скученность II степени, дистальный прикус", notes: "Снятие слепков",
      isFinal: true, diagnosisCode: "K07.2", cariesType: "surface", toothNumber: "12",
      protocol: { complaints: "Скученность зубов", anamnesis: "Ортодонтическое лечение не проводилось", objective: "Скученность 12,11,21,22", diagnosisText: "Скученность II степени", treatment: "Слепки, планирование брекет-системы" },
      materials: [{ code: "speedex", name: "Слепочная масса Speedex", qty: 1, unit: "упак" }],
    },
  ],
  payments: [
    { id: "pay1", date: shiftDate(TODAY, -1), time: "15:30", patientId: "p3", visitId: "v1", amount: 5000, method: "cash" },
    { id: "pay2", date: shiftDate(TODAY, -3), time: "09:45", patientId: "p1", visitId: "v2", amount: 18000, method: "card" },
    { id: "pay3", date: shiftDate(TODAY, -2), time: "11:35", patientId: "p2", visitId: "v3", amount: 7500, method: "cash" },
    { id: "pay4", date: shiftDate(TODAY, -5), time: "09:20", patientId: "p3", visitId: "v4", amount: 3000, method: "card" },
    { id: "pay5", date: TODAY, time: "10:15", patientId: "p4", visitId: null, amount: 25000, method: "card" },
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

// AUTH
export async function login(phone, password) {
  await delay(800);
  const cleanPhone = String(phone || "").replace(/\D/g, "");
  if (cleanPhone.length < 10) throw new Error("Неверный номер телефона");
  if (password === "1234" || password === "owner") return { role: "owner", phone: cleanPhone, name: "Владелец" };
  if (password === "admin") return { role: "admin", phone: cleanPhone, name: "Админ" };
  if (password === "doctor") return { role: "doctor", phone: cleanPhone, name: "Врач" };
  if (password === "patient") return { role: "patient", phone: cleanPhone, name: "Пациент" };
  if (password === "assistant") return { role: "assistant", phone: cleanPhone, name: "Ассистент" };
  throw new Error("Неверный пароль. Попробуйте: 1234, admin, doctor, assistant или patient");
}

// PATIENTS
export async function searchPatients(query = "") {
  await delay(400);
  const db = getDb();
  const q = String(query).trim().toLowerCase();
  return clone(db.patients.filter((p) => !q || p.name.toLowerCase().includes(q) || String(p.phone).includes(q)));
}

export async function getPatientById(id) {
  await delay(350);
  const db = getDb();
  const p = db.patients.find((x) => x.id === id);
  if (!p) throw new Error("Пациент не найден");
  return clone(p);
}

export async function createPatient(data) {
  await delay(500);
  const db = getDb();
  const name = String(data?.name || "").trim();
  const phone = String(data?.phone || "").replace(/\D/g, "");
  const birthDate = data?.birthDate ? String(data.birthDate) : "";
  if (name.length < 2) throw new Error("Имя слишком короткое");
  if (phone.length < 10) throw new Error("Неверный номер телефона");
  if (db.patients.some((p) => p.phone === phone)) throw new Error("Пациент с таким телефоном уже существует");
  const newPatient = { id: genId("p"), name, phone, birthDate, createdAt: TODAY };
  db.patients.push(newPatient);
  saveDb(db);
  return clone(newPatient);
}

export async function updatePatient(id, patch) {
  await delay(400);
  const db = getDb();
  const p = db.patients.find((x) => x.id === id);
  if (!p) throw new Error("Пациент не найден");
  if (patch.name !== undefined) p.name = String(patch.name).trim();
  if (patch.phone !== undefined) p.phone = String(patch.phone).replace(/\D/g, "");
  if (patch.birthDate !== undefined) p.birthDate = String(patch.birthDate || "");
  saveDb(db);
  return clone(p);
}

// PAYMENTS
export async function getPaymentsByDate(date) {
  await delay(450);
  const db = getDb();
  if (!date) throw new Error("Выберите дату");
  const list = db.payments
    .filter((p) => p.date === date)
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((p) => ({ ...p, patientName: db.patients.find((x) => x.id === p.patientId)?.name || "Неизвестно" }));
  return clone(list);
}

export async function createPayment(data) {
  await delay(650);
  const db = getDb();
  const amount = Number(data?.amount);
  const method = String(data?.method || "");
  const patientId = String(data?.patientId || "");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Сумма должна быть больше 0");
  if (!["cash", "card"].includes(method)) throw new Error("Неверный метод оплаты");
  if (!patientId) throw new Error("Выберите пациента");
  const payment = {
    id: genId("pay"),
    date: data?.date ? String(data.date) : TODAY,
    time: new Date().toTimeString().slice(0, 5),
    patientId,
    visitId: data?.visitId ? String(data.visitId) : null,
    amount,
    method,
  };
  db.payments.push(payment);
  saveDb(db);
  return clone(payment);
}

// INVENTORY
export async function getInventoryItems() {
  await delay(400);
  const db = getDb();
  return clone((db.inventory || []).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)));
}

export async function addInventoryItem(data) {
  await delay(500);
  const db = getDb();
  const name = String(data?.name || "").trim();
  const category = String(data?.category || "").trim();
  const quantity = Number(data?.quantity) || 0;
  const minQuantity = Number(data?.minQuantity) || 0;
  const unit = String(data?.unit || "шт").trim();
  if (name.length < 2) throw new Error("Название слишком короткое");
  if (!category) throw new Error("Укажите категорию");
  const newItem = { id: genId("inv"), name, category, quantity, minQuantity, unit };
  if (!db.inventory) db.inventory = [];
  db.inventory.push(newItem);
  saveDb(db);
  return clone(newItem);
}

export async function updateInventoryQuantity(id, delta) {
  await delay(300);
  const db = getDb();
  const item = (db.inventory || []).find((x) => x.id === id);
  if (!item) throw new Error("Материал не найден");
  const newQty = item.quantity + delta;
  if (newQty < 0) throw new Error("Недостаточно на складе");
  item.quantity = newQty;
  saveDb(db);
  return clone(item);
}

// DOCTORS
export async function getDoctors() {
  await delay(400);
  const db = getDb();
  return clone(db.doctors);
}

// SCHEDULE
export async function getSchedule(doctorId, date) {
  await delay(400);
  const db = getDb();
  if (!doctorId) throw new Error("Выберите врача");
  if (!date) throw new Error("Выберите дату");
  return clone(
    db.appointments
      .filter((a) => a.doctorId === doctorId && a.date === date)
      .sort((a, b) => a.time.localeCompare(b.time))
      .map((a) => ({ ...a, patientName: db.patients.find((x) => x.id === a.patientId)?.name || "Неизвестно" }))
  );
}

export async function createAppointment(data) {
  await delay(500);
  const db = getDb();
  const appt = {
    id: genId("a"),
    doctorId: String(data?.doctorId || ""),
    patientId: String(data?.patientId || ""),
    date: String(data?.date || ""),
    time: String(data?.time || ""),
    duration: Number(data?.duration) || 30,
    status: "scheduled",
    visitId: null,
  };
  if (!appt.doctorId) throw new Error("Выберите врача");
  if (!appt.patientId) throw new Error("Выберите пациента");
  if (!appt.date) throw new Error("Выберите дату");
  if (!appt.time) throw new Error("Выберите время");
  db.appointments.push(appt);
  saveDb(db);
  return clone({ ...appt, patientName: db.patients.find((x) => x.id === appt.patientId)?.name || "Неизвестно" });
}

// REPORT
export async function getDayReport(date) {
  await delay(700);
  const db = getDb();
  if (!date) throw new Error("Выберите дату");
  const payments = db.payments
    .filter((p) => p.date === date)
    .map((p) => ({ ...p, patientName: db.patients.find((x) => x.id === p.patientId)?.name || "Неизвестно" }));
  const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);
  const visitsCompleted = db.appointments.filter((a) => a.date === date && a.status === "completed").length;
  const aiSignals = { cariesByType: { surface: 0, medium: 0, deep: 0, complicated: 0 }, teethByCount: {} };
  db.appointments.filter((a) => a.date === date && a.visitId).forEach((appt) => {
    const v = db.visits.find((x) => x.id === appt.visitId);
    if (!v) return;
    if (v.cariesType && aiSignals.cariesByType[v.cariesType] !== undefined) aiSignals.cariesByType[v.cariesType]++;
    if (v.toothNumber) aiSignals.teethByCount[v.toothNumber] = (aiSignals.teethByCount[v.toothNumber] || 0) + 1;
  });
  return clone({ date, payments, totalAmount, visitsCompleted, aiSignals });
}

// VISITS
export async function getActiveAppointmentByPatient(patientId) {
  await delay(350);
  const db = getDb();
  const id = String(patientId || "");
  if (!id) return null;
  const candidates = db.appointments
    .filter((a) => a.patientId === id && a.status !== "cancelled" && a.status !== "completed")
    .sort((a, b) => a.time.localeCompare(b.time));
  return candidates[0] ? clone(candidates[0]) : null;
}

export async function finishVisit(appointmentId, visitData) {
  await delay(800);
  const db = getDb();
  const appt = db.appointments.find((a) => a.id === appointmentId);
  if (!appt) throw new Error("Запись не найдена");
  if (!appt.visitId) {
    const visit = {
      id: genId("v"),
      appointmentId: appt.id,
      doctorId: appt.doctorId,
      patientId: appt.patientId,
      startedAt: `${appt.date}T${appt.time}:00`,
      finishedAt: new Date().toISOString(),
      complaint: String(visitData?.complaint || "").trim(),
      diagnosis: String(visitData?.diagnosis || "").trim(),
      notes: String(visitData?.notes || "").trim(),
      isFinal: true,
      diagnosisCode: String(visitData?.diagnosisCode || ""),
      cariesType: String(visitData?.cariesType || ""),
      toothNumber: String(visitData?.toothNumber || ""),
      protocol: visitData?.protocol || {},
      materials: visitData?.materials || [],
    };
    db.visits.push(visit);
    appt.visitId = visit.id;
  } else {
    const visit = db.visits.find((v) => v.id === appt.visitId);
    if (!visit) throw new Error("Визит не найден");
    if (visit.isFinal) throw new Error("Визит уже завершён");
    visit.complaint = String(visitData?.complaint || "").trim();
    visit.diagnosis = String(visitData?.diagnosis || "").trim();
    visit.notes = String(visitData?.notes || "").trim();
    visit.isFinal = true;
    visit.finishedAt = new Date().toISOString();
    if (visitData?.diagnosisCode) visit.diagnosisCode = String(visitData.diagnosisCode);
    if (visitData?.cariesType) visit.cariesType = String(visitData.cariesType);
    if (visitData?.toothNumber) visit.toothNumber = String(visitData.toothNumber);
    if (visitData?.protocol) visit.protocol = visitData.protocol;
    if (visitData?.materials) visit.materials = visitData.materials;
  }
  appt.status = "completed";

  // Auto-deduct from inventory
  const materials = visitData?.materials;
  if (Array.isArray(materials) && db.inventory) {
    for (const m of materials) {
      const qty = Number(m.qty) || 0;
      if (!qty) continue;
      const code = String(m.code || "").toLowerCase();
      const name = String(m.name || "").toLowerCase();
      const item =
        db.inventory.find((i) => code && i.name.toLowerCase().includes(code)) ||
        db.inventory.find((i) => name && i.name.toLowerCase().includes(name));
      if (item && item.quantity > 0) {
        item.quantity = Math.max(0, item.quantity - qty);
      }
    }
  }

  saveDb(db);
  return clone(db.visits.find((v) => v.id === appt.visitId));
}

export async function getVisitsByPatient(patientId) {
  await delay(500);
  const db = getDb();
  if (!patientId) throw new Error("Пациент не выбран");
  return clone(
    db.visits
      .filter((v) => v.patientId === patientId)
      .sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""))
      .map((v) => ({
        id: v.id,
        startedAt: v.startedAt,
        finishedAt: v.finishedAt,
        diagnosis: v.diagnosis || v.protocol?.diagnosisText || "",
        diagnosisCode: v.diagnosisCode || "",
        cariesType: v.cariesType || "",
        toothNumber: v.toothNumber || "",
        isFinal: !!v.isFinal,
      }))
  );
}

// USERS
export async function getUsers(query = "") {
  await delay(350);
  const db = getDb();
  const q = String(query).trim().toLowerCase();
  return clone(
    (db.users || []).filter((u) => !q || u.name.toLowerCase().includes(q) || String(u.phone).includes(q) || (u.email || "").toLowerCase().includes(q))
  );
}

export async function createUser(data) {
  await delay(400);
  const db = getDb();
  const name = String(data?.name || "").trim();
  const phone = String(data?.phone || "").replace(/\D/g, "");
  const email = String(data?.email || "").trim();
  const role = ["owner", "admin", "doctor", "assistant"].includes(data?.role) ? data.role : "admin";
  if (name.length < 2) throw new Error("Имя слишком короткое");
  if (phone.length < 10) throw new Error("Неверный номер телефона");
  if (db.users.some((u) => u.phone === phone)) throw new Error("Пользователь с таким телефоном уже есть");
  const newUser = { id: genId("u"), name, phone, email, role, isActive: true, createdAt: TODAY };
  db.users.push(newUser);
  saveDb(db);
  return clone(newUser);
}

export async function updateUser(id, patch) {
  await delay(400);
  const db = getDb();
  const u = db.users.find((x) => x.id === id);
  if (!u) throw new Error("Пользователь не найден");
  if (patch.name !== undefined) u.name = String(patch.name).trim();
  if (patch.phone !== undefined) u.phone = String(patch.phone).replace(/\D/g, "");
  if (patch.email !== undefined) u.email = String(patch.email).trim();
  if (patch.role !== undefined && ["owner", "admin", "doctor", "assistant"].includes(patch.role)) u.role = patch.role;
  if (patch.isActive !== undefined) u.isActive = !!patch.isActive;
  saveDb(db);
  return clone(u);
}
