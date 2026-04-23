import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// NeuroDent — серверная бизнес-логика CRM стоматологической клиники.
// Данные сохраняются backend-сервером в JSON-файл. Этот слой можно заменить
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

const clone = (data) => JSON.parse(JSON.stringify(data));

const TODAY = new Date().toISOString().slice(0, 10);

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

function validateStatus(status) {
  const allowed = new Set(["scheduled", "arrived", "completed", "cancelled"]);
  if (!allowed.has(status)) throw new Error("Неверный статус записи");
}

function validatePaymentMethod(method) {
  const allowed = new Set(["cash", "card"]);
  if (!allowed.has(method)) throw new Error("Неверный метод оплаты");
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

function readJsonDb() {
  if (!existsSync(DB_FILE)) return null;
  try {
    return JSON.parse(readFileSync(DB_FILE, "utf8"));
  } catch {
    return null;
  }
}

function writeJsonDb(data) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
}

function getDb() {
  const data = readJsonDb() || clone(initialDb);
  if (!Array.isArray(data.users)) data.users = clone(initialDb.users);
  writeJsonDb(data);
  return data;
}

function saveDb() {
  writeJsonDb(db);
}

const db = getDb();

// Вход в систему. Принимает телефон + пароль, возвращает роль и имя пользователя.
// Демо пароли: "1234"=owner, "admin", "doctor", "assistant", "patient"
// Backend: POST /auth/login → { token, user: { role, name, phone } }
export async function login(phone, password) {
  await delay(800);
  const cleanPhone = String(phone || "").replace(/\D/g, "");
  if (cleanPhone.length < 10) throw new Error("Неверный номер телефона");
  
  if (password === "1234" || password === "owner")
    return { role: "owner", phone: cleanPhone, name: "Владелец" };
  if (password === "admin")
    return { role: "admin", phone: cleanPhone, name: "Админ" };
  if (password === "doctor")
    return { role: "doctor", phone: cleanPhone, name: "Врач" };
  if (password === "patient") {
    const patient =
      db.patients.find((p) => String(p.phone).replace(/\D/g, "") === cleanPhone) ||
      db.patients[0];
    return {
      id: patient?.id || "",
      patientId: patient?.id || "",
      role: "patient",
      phone: cleanPhone,
      name: patient?.name || "Пациент",
    };
  }
  if (password === "assistant")
    return { role: "assistant", phone: cleanPhone, name: "Ассистент" };

  throw new Error("Неверный пароль. Попробуйте: 1234, admin, doctor, assistant или patient");
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
export async function createAppointment(data) {
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
export async function createPatient(data) {
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
  return clone(newPatient);
}

// Обновляет данные пациента (имя, телефон, дата рождения).
// Backend: PUT /patients/:id → Patient
export async function updatePatient(id, patch) {
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
export async function updateAppointmentStatus(appointmentId, status) {
  await delay(450);
  validateStatus(status);
  const appt = db.appointments.find((a) => a.id === appointmentId);
  if (!appt) throw new Error("Запись не найдена");
  if (status === "completed" && !appt.visitId)
    throw new Error("Нельзя завершить без визита");
  appt.status = status;
  saveDb();
  return clone(appt);
}

// Начинает визит — вызывается когда врач начинает принимать пациента.
// Статус записи становится "arrived", создаётся новая запись визита.
// Backend: POST /visits/start { appointmentId } → Visit
export async function startVisit(appointmentId) {
  await delay(700);
  const appt = db.appointments.find((a) => a.id === appointmentId);
  if (!appt) throw new Error("Запись не найдена");
  if (appt.status === "cancelled") throw new Error("Запись отменена");
  if (appt.status === "completed") throw new Error("Визит уже завершён");
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
  return clone(visit);
}

// Завершает визит. Сохраняет клинический протокол + AI данные.
// ВАЖНО: автоматически списывает использованные материалы со склада (inventory).
// visitData: { complaint, diagnosis, notes, diagnosisCode, cariesType, toothNumber, protocol, materials[] }
// Backend: POST /visits/finish { appointmentId, visitData } → Visit
export async function finishVisit(appointmentId, visitData) {
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
        if (item && item.quantity > 0) {
          item.quantity = Math.max(0, item.quantity - qty);
        }
      }
    } else {
      // 2) Иначе — старый текстовый парсер (для других модулей)
      const textToAnalyze = (notes + " " + diagnosis).toLowerCase();
      
      if (textToAnalyze.includes("имплант") || textToAnalyze.includes("straumann")) {
        const item = db.inventory.find(i => i.name.toLowerCase().includes("straumann"));
        if (item && item.quantity > 0) item.quantity -= 1;
      }
      
      if (textToAnalyze.includes("пломб") || textToAnalyze.includes("filtek")) {
        const item = db.inventory.find(i => i.name.toLowerCase().includes("filtek"));
        if (item && item.quantity > 0) item.quantity -= 1;
      }

      if (textToAnalyze.includes("анестези") || textToAnalyze.includes("ultracain")) {
        const item = db.inventory.find(i => i.name.toLowerCase().includes("ultracain"));
        if (item && item.quantity > 0) item.quantity -= 1;
      }
    }
  }

  saveDb();
  return clone(visit);
}

// Создаёт новый платёж. Требует: сумма, метод (cash/card), ID пациента.
// Backend: POST /payments → Payment
export async function createPayment(data) {
  await delay(650);
  const amount = Number(data?.amount);
  const method = String(data?.method || "");
  const patientId = String(data?.patientId || "");
  const visitId = data?.visitId ? String(data.visitId) : null;
  if (!Number.isFinite(amount) || amount <= 0)
    throw new Error("Сумма должна быть больше 0");
  validatePaymentMethod(method);
  if (!patientId) throw new Error("Выберите пациента");
  const payment = {
    id: genId("pay"),
    date: data?.date ? String(data.date) : TODAY,
    time: new Date().toTimeString().slice(0, 5),
    patientId,
    visitId,
    amount,
    method,
  };
  db.payments.push(payment);
  saveDb();
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
export async function addInventoryItem(data) {
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
  return clone(newItem);
}

// Изменяет количество материала на складе. delta может быть положительным (+) или отрицательным (-).
// Backend: PATCH /inventory/:id/quantity { delta } → InventoryItem
export async function updateInventoryQuantity(id, delta) {
  await delay(300);
  if (!db.inventory) db.inventory = [];
  const item = db.inventory.find(x => x.id === id);
  if (!item) throw new Error("Материал не найден");
  
  const newQty = item.quantity + delta;
  if (newQty < 0) throw new Error("Недостаточно на складе");
  
  item.quantity = newQty;
  saveDb();
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
  return clone(list);
}

// Регистрирует нового сотрудника. Роль: owner | admin | doctor | assistant
// Backend: POST /users → User
export async function createUser(data) {
  await delay(400);
  const name = String(data?.name || "").trim();
  const phone = String(data?.phone || "").replace(/\D/g, "");
  const email = String(data?.email || "").trim();
  const role = ROLES.includes(data?.role) ? data.role : "admin";
  if (name.length < 2) throw new Error("Имя слишком короткое");
  if (phone.length < 10) throw new Error("Неверный номер телефона");
  if (db.users.some(u => u.phone === phone)) throw new Error("Пользователь с таким телефоном уже есть");
  const newUser = {
    id: genId("u"),
    name,
    phone,
    email,
    role,
    isActive: true,
    createdAt: new Date().toISOString().slice(0, 10),
  };
  db.users.push(newUser);
  saveDb();
  return clone(newUser);
}

// Обновляет данные сотрудника (имя, телефон, email, роль, активность).
// Backend: PUT /users/:id → User
export async function updateUser(id, patch) {
  await delay(400);
  const u = db.users.find(x => x.id === id);
  if (!u) throw new Error("Пользователь не найден");
  if (patch.name !== undefined) u.name = String(patch.name).trim();
  if (patch.phone !== undefined) u.phone = String(patch.phone).replace(/\D/g, "");
  if (patch.email !== undefined) u.email = String(patch.email).trim();
  if (patch.role !== undefined && ROLES.includes(patch.role)) u.role = patch.role;
  if (patch.isActive !== undefined) u.isActive = !!patch.isActive;
  if (u.name.length < 2) throw new Error("Имя слишком короткое");
  if (u.phone.length < 10) throw new Error("Неверный номер телефона");
  saveDb();
  return clone(u);
}
