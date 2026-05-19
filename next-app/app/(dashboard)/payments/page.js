"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addInventoryItem,
  createPayment,
  getDebtors,
  getDoctors,
  getInventoryItems,
  getPaymentsByDate,
  searchPatients,
  sendPatientReminder,
  updateInventoryQuantity,
} from "@/lib/api";
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ClipboardPlus,
  CreditCard,
  Download,
  MoreVertical,
  Package,
  Phone,
  Plus,
  QrCode,
  Search,
  Send,
  Timer,
  Users,
  Wallet,
  X,
} from "lucide-react";

const TODAY = new Date().toISOString().slice(0, 10);

const METHOD_META = {
  card: { label: "Карта", icon: CreditCard, tone: "#2563eb", bg: "#eff6ff" },
  cash: { label: "Наличные", icon: Banknote, tone: "#64748b", bg: "#f8fafc" },
  kaspi: { label: "Kaspi/QR", icon: QrCode, tone: "#0f766e", bg: "#ecfdf5" },
};

const CATEGORIES = [
  "Анестезия",
  "Терапия",
  "Хирургия",
  "Ортодонтия",
  "Ортопедия",
  "Эндодонтия",
  "Имплантология",
  "Гигиена",
  "Антисептики",
  "Расходники",
];

function fmt(value) {
  return `${Number(value || 0).toLocaleString("ru-RU")} ₸`;
}

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "").replace(/^8/, "7");
}

function exportMock() {
  alert("Экспорт будет подключен после backend-интеграции.");
}

function StatCard({ title, value, helper, icon: Icon, tone = "#2563eb", badge }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase text-slate-500">{title}</div>
          <div className="mt-2 text-3xl font-bold leading-none text-slate-950">{value}</div>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-lg" style={{ background: `${tone}12`, color: tone }}>
          <Icon size={20} />
        </div>
      </div>
      <div className={`text-xs font-semibold ${badge ? "text-emerald-600" : "text-slate-500"}`}>{helper}</div>
    </div>
  );
}

function SearchInput({ value, onChange, placeholder, width = "420px" }) {
  return (
    <label className="relative block" style={{ width: `min(100%, ${width})` }}>
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-full border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
      />
    </label>
  );
}

function TopTabs({ active, onChange }) {
  const tabs = [
    ["kassa", "Касса"],
    ["debtors", "Должники"],
    ["sklad", "Склад"],
  ];

  return (
    <div className="flex gap-7 border-b border-slate-200">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`border-b-2 px-1 pb-3 text-sm font-semibold transition ${
            active === id ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="grid min-h-[220px] place-items-center text-center">
      <div>
        <Wallet className="mx-auto mb-3 text-slate-300" size={44} />
        <div className="text-lg font-semibold text-slate-950">{title}</div>
        <p className="mt-1 text-sm text-slate-500">{text}</p>
      </div>
    </div>
  );
}

function KassaTab() {
  const [date, setDate] = useState(TODAY);
  const [payments, setPayments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ patientId: "", doctorId: "", amount: "", discount: "", method: "card", note: "" });

  useEffect(() => {
    Promise.all([searchPatients(""), getDoctors()]).then(([patientList, doctorList]) => {
      setPatients(patientList);
      setDoctors(doctorList);
    });
  }, []);

  useEffect(() => {
    let active = true;
    getPaymentsByDate(date)
      .then((data) => {
        if (active) setPayments(data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [date]);

  const filteredPayments = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter((payment) =>
      (payment.patientName || "").toLowerCase().includes(q) ||
      (payment.note || "").toLowerCase().includes(q) ||
      (METHOD_META[payment.method]?.label || payment.method || "").toLowerCase().includes(q) ||
      String(payment.amount || "").includes(q)
    );
  }, [payments, query]);

  const totalAmount = filteredPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const average = filteredPayments.length ? Math.round(totalAmount / filteredPayments.length) : 0;

  async function handleAdd(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const amount = Number(form.amount) - Number(form.discount || 0);
      await createPayment({
        patientId: form.patientId,
        doctorId: form.doctorId || null,
        amount,
        method: form.method,
        note: form.note,
        date,
      });
      setForm({ patientId: "", doctorId: "", amount: "", discount: "", method: "card", note: "" });
      setPayments(await getPaymentsByDate(date));
      setMessage("Платеж успешно проведен");
      setTimeout(() => setMessage(""), 2500);
    } catch (error) {
      setMessage(error?.message || "Не удалось сохранить платеж");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-2xl font-semibold text-slate-950">Кассовый терминал</h1>
          <p className="mt-1 text-sm text-slate-500">Управление платежами и финансовыми операциями клиники</p>
        </div>
        <button onClick={exportMock} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm">
          <Download size={16} />
          Export to Excel
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Поиск платежа, пациента или услуги..." />
        <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 shadow-sm">
          <CalendarDays size={16} />
          <input
            type="date"
            value={date}
            onChange={(event) => {
              setLoading(true);
              setDate(event.target.value);
            }}
            className="bg-transparent outline-none"
          />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Платежей сегодня" value={filteredPayments.length} helper={`за ${date}`} icon={ClipboardPlus} />
        <StatCard title="Выручка" value={fmt(totalAmount)} helper="+0% к вчера" icon={Banknote} tone="#16a34a" badge />
        <StatCard title="Транзакций" value={filteredPayments.length} helper="наличные и карты" icon={CreditCard} tone="#0ea5e9" />
        <StatCard title="Средний чек" value={average ? fmt(average) : "—"} helper={average ? "рассчитан" : "будет рассчитан"} icon={Wallet} tone="#f59e0b" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[390px_minmax(0,1fr)]">
        <form onSubmit={handleAdd} className="rounded-lg border border-slate-200 bg-white p-7 shadow-sm">
          <div className="mb-7 flex items-center gap-4">
            <div className="grid h-11 w-11 place-items-center rounded-full bg-blue-600 text-white">
              <CreditCard size={22} />
            </div>
            <div>
              <h2 className="m-0 text-xl font-semibold text-slate-950">Новый платеж</h2>
              <p className="mt-1 text-sm text-slate-500">Заполните данные для проведения операции</p>
            </div>
          </div>

          <div className="grid gap-5">
            <Field label="Пациент">
              <select value={form.patientId} onChange={(event) => setForm((prev) => ({ ...prev, patientId: event.target.value }))} required className="field-control">
                <option value="">ФИО или номер карты</option>
                {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}
              </select>
            </Field>
            <Field label="Врач">
              <select value={form.doctorId} onChange={(event) => setForm((prev) => ({ ...prev, doctorId: event.target.value }))} className="field-control">
                <option value="">ФИО врача</option>
                {doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Сумма (₸)">
                <input value={form.amount} onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))} type="number" min="1" required placeholder="0.00" className="field-control" />
              </Field>
              <Field label="Скидка (%)">
                <input value={form.discount} onChange={(event) => setForm((prev) => ({ ...prev, discount: event.target.value }))} type="number" min="0" placeholder="0" className="field-control" />
              </Field>
            </div>
            <Field label="Метод оплаты">
              <div className="grid grid-cols-3 gap-3">
                {Object.entries(METHOD_META).map(([method, meta]) => {
                  const Icon = meta.icon;
                  const active = form.method === method;
                  return (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, method }))}
                      className={`grid h-20 place-items-center rounded-lg border text-xs font-semibold transition ${
                        active ? "border-blue-600 bg-blue-50 text-blue-600" : "border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200"
                      }`}
                    >
                      <Icon size={22} />
                      <span>{meta.label}</span>
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Примечание">
              <input value={form.note} onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))} placeholder="Комментарий к платежу..." className="field-control" />
            </Field>
            {message && <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">{message}</div>}
            <button disabled={saving} type="submit" className="mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60">
              <CheckCircle2 size={18} />
              {saving ? "Проведение..." : "Провести платеж"}
            </button>
          </div>
        </form>

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 p-7">
            <div>
              <h2 className="m-0 text-xl font-semibold text-slate-950">Последние операции</h2>
              <p className="mt-1 text-sm text-slate-500">История транзакций за выбранную дату</p>
            </div>
            <button className="text-sm font-semibold text-blue-600">Весь отчет</button>
          </div>
          {loading ? (
            <EmptyState title="Загрузка" text="Получаем платежи за выбранную дату" />
          ) : filteredPayments.length === 0 ? (
            <EmptyState title="Операции не найдены" text={query ? "Попробуйте изменить поиск" : "За выбранную дату платежей нет"} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="text-left text-xs font-semibold uppercase text-slate-500">
                  <tr className="border-b border-slate-100">
                    <th className="px-7 py-4">Пациент</th>
                    <th className="px-4 py-4">Тип</th>
                    <th className="px-4 py-4">Статус</th>
                    <th className="px-7 py-4 text-right">Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((payment) => {
                    const meta = METHOD_META[payment.method] || METHOD_META.card;
                    const Icon = meta.icon;
                    return (
                      <tr key={payment.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-7 py-5">
                          <div className="font-semibold text-slate-950">{payment.patientName || "Пациент"}</div>
                          <div className="mt-1 text-xs text-slate-500">{payment.time || "—"} • {payment.note || "Прием в клинике"}</div>
                        </td>
                        <td className="px-4 py-5 text-slate-600">
                          <span className="inline-flex items-center gap-2">
                            <Icon size={15} />
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-5">
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">Успешно</span>
                        </td>
                        <td className="px-7 py-5 text-right text-base font-semibold text-slate-950">{fmt(payment.amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DebtorsTab() {
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    getDebtors("").then(setPatients);
  }, []);

  const debtors = useMemo(() => {
    const q = query.trim().toLowerCase();
    return patients
      .filter((patient) => !q || patient.name.toLowerCase().includes(q) || String(patient.phone || "").includes(q));
  }, [patients, query]);
  const totalDebt = debtors.reduce((sum, patient) => sum + Number(patient.debt || Math.abs(patient.balance || 0)), 0);

  async function sendReminder(patient) {
    const debt = Number(patient.debt || Math.abs(patient.balance || 0)).toLocaleString("ru-RU");
    const text = `Здравствуйте, ${patient.name}! Клиника NeuroDent. У вас задолженность ${debt} ₸. Просим погасить в удобное время.`;
    try {
      await sendPatientReminder(patient.id, text, "whatsapp");
      setMessage("Напоминание отправлено через backend");
    } catch {
      window.open(`https://wa.me/${normalizePhone(patient.phone)}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-2xl font-semibold text-slate-950">Реестр задолженностей</h1>
          <p className="mt-1 text-sm text-slate-500">Контроль долгов пациентов и отправка напоминаний</p>
        </div>
        <div className="flex gap-3">
          <button onClick={exportMock} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm">
            <Download size={16} />
            Export to Excel
          </button>
          <button onClick={() => debtors.forEach(sendReminder)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-600/20">
            <Send size={16} />
            Отправить всем
          </button>
        </div>
      </div>

      <SearchInput value={query} onChange={setQuery} placeholder="Поиск пациента или телефона..." />
      {message && <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">{message}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Общий долг" value={fmt(totalDebt)} helper="+12.4% с прошлого месяца" icon={Wallet} tone="#ef4444" />
        <StatCard title="Активные должники" value={`${debtors.length} чел.`} helper="-4 чел. после рассылки" icon={Users} tone="#2563eb" badge />
        <StatCard title="Средняя просрочка" value="14 дней" helper="NORMAL" icon={Timer} tone="#64748b" />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 p-6">
          <h2 className="m-0 text-lg font-semibold text-slate-950">Список активных задолженностей</h2>
          <select className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-600">
            <option>Все суммы</option>
          </select>
        </div>
        {debtors.length === 0 ? (
          <EmptyState title="Должников нет" text={query ? "Поиск не дал результатов" : "Все пациенты закрыли задолженности"} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="text-left text-xs font-semibold uppercase text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="px-6 py-4">Пациент</th>
                  <th className="px-4 py-4">Долг</th>
                  <th className="px-4 py-4">Дата визита</th>
                  <th className="px-6 py-4 text-right">Действие</th>
                </tr>
              </thead>
              <tbody>
                {debtors.map((patient, index) => (
                  <tr key={patient.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 place-items-center rounded-full bg-blue-50 text-sm font-bold text-blue-600">{patient.name[0]}</div>
                        <div>
                          <div className="font-semibold text-slate-950">{patient.name}</div>
                          <div className="text-xs text-slate-500">+{normalizePhone(patient.phone)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-5">
                      <div className="font-bold text-red-600">{fmt(patient.debt || Math.abs(patient.balance || 0))}</div>
                      <div className="mt-1 text-xs text-slate-500">{index % 2 ? "Остаток за лечение" : "Лечение кариеса"}</div>
                    </td>
                    <td className="px-4 py-5 text-slate-600">
                      <div>{index % 2 ? "03 Май 2026" : "12 Май 2026"}</div>
                      <div className="mt-1 text-xs text-slate-400">{index % 2 ? "10:00" : "14:30"} • Д-р</div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex justify-end gap-3">
                        <button onClick={() => sendReminder(patient)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700">
                          <Phone size={16} />
                          Напомнить
                        </button>
                        <button className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white">Погасить</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SkladTab() {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);

  async function refresh() {
    setItems(await getInventoryItems());
  }

  useEffect(() => {
    let active = true;
    getInventoryItems().then((data) => {
      if (active) setItems(data);
    });
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((item) => category === "all" || item.category === category)
      .filter((item) => !q || item.name.toLowerCase().includes(q) || (item.category || "").toLowerCase().includes(q));
  }, [items, query, category]);
  const lowStock = items.filter((item) => item.quantity <= item.minQuantity);
  const expiringSoon = Math.max(2, Math.round(items.length * 0.25));
  const stockValue = items.reduce((sum, item, index) => sum + Number(item.quantity || 0) * (900 + index * 120), 0);

  async function changeQty(id, delta) {
    try {
      await updateInventoryQuantity(id, delta);
      await refresh();
    } catch (error) {
      alert(error?.message || "Не удалось изменить остаток");
    }
  }

  async function addItem(data) {
    await addInventoryItem(data);
    await refresh();
    setModalOpen(false);
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-xl font-semibold text-slate-950">Инвентаризация склада</h1>
          <p className="mt-1 text-sm text-slate-500">Управление остатками и поступлениями медикаментов</p>
        </div>
        <div className="flex gap-3">
          <button onClick={exportMock} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm">
            <Download size={16} />
            Экспорт в Excel
          </button>
          <button onClick={() => setModalOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-600/20">
            <ClipboardPlus size={16} />
            Поступление
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Поиск материала или категории..." />
        <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600">
          <option value="all">Все категории</option>
          {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Всего позиций" value={items.length} helper="норма" icon={ClipboardPlus} />
        <StatCard title="Критический остаток" value={lowStock.length} helper="срочно" icon={AlertTriangle} tone="#dc2626" />
        <StatCard title="Срок годности < 30 дн." value={expiringSoon} helper="на контроле" icon={Timer} tone="#f59e0b" />
        <StatCard title="Оценка склада" value={fmt(stockValue)} helper="mock-оценка" icon={Banknote} tone="#10b981" />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 p-6">
          <div className="flex flex-wrap items-center gap-4">
            <h2 className="m-0 text-lg font-semibold text-slate-950">Список материалов</h2>
            <div className="flex rounded-lg border border-slate-200 bg-white p-1">
              {["all", "Анестезия", "Расходники"].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCategory(item)}
                  className={`rounded-md px-3 py-1 text-xs font-semibold ${category === item ? "bg-slate-100 text-slate-950" : "text-slate-500"}`}
                >
                  {item === "all" ? "Все" : item}
                </button>
              ))}
            </div>
          </div>
          <MoreVertical className="text-slate-400" size={18} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="text-left text-xs font-semibold uppercase text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="px-6 py-4">Наименование</th>
                <th className="px-4 py-4">Категория</th>
                <th className="px-4 py-4">Остаток</th>
                <th className="px-4 py-4">Статус</th>
                <th className="px-6 py-4 text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState title="Материалы не найдены" text="Попробуйте изменить поиск или категорию" />
                  </td>
                </tr>
              ) : filtered.map((item) => {
                const isLow = item.quantity <= item.minQuantity;
                return (
                  <tr key={item.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className={`grid h-10 w-10 place-items-center rounded-lg ${isLow ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"}`}>
                          <Package size={19} />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-950">{item.name}</div>
                          <div className="text-xs text-slate-500">Артикул: {item.id.toUpperCase()}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-5">
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600">{item.category}</span>
                    </td>
                    <td className="px-4 py-5">
                      <span className={`text-base font-bold ${isLow ? "text-red-600" : "text-slate-950"}`}>{item.quantity}</span>
                      <span className="ml-1 text-xs text-slate-500">{item.unit}</span>
                    </td>
                    <td className="px-4 py-5">
                      <span className={`inline-flex items-center gap-2 text-sm font-semibold ${isLow ? "text-red-600" : "text-slate-700"}`}>
                        <span className={`h-2 w-2 rounded-full ${isLow ? "bg-red-600" : "bg-emerald-500"}`} />
                        {isLow ? "Критично" : "В наличии"}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => changeQty(item.id, -1)} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-lg text-slate-600">−</button>
                        <button onClick={() => changeQty(item.id, 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-lg text-slate-600">+</button>
                        <button className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500"><MoreVertical size={16} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="max-w-[640px] rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="m-0 text-lg font-semibold text-slate-950">Последние поступления</h2>
          <button className="text-sm font-semibold text-blue-600">См. все отчеты</button>
        </div>
        <div className="grid gap-3">
          {items.slice(0, 2).map((item, index) => (
            <div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-4">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100 text-emerald-600">
                  <Plus size={19} />
                </div>
                <div>
                  <div className="font-semibold text-slate-950">{item.name}</div>
                  <div className="text-xs text-slate-500">Поставщик: МедФармТрейд • {index ? "Вчера, 16:20" : "Сегодня, 10:45"}</div>
                </div>
              </div>
              <div className="font-bold text-emerald-600">+{fmt((index + 1) * 4200)}</div>
            </div>
          ))}
        </div>
      </div>

      {modalOpen && <StockModal onClose={() => setModalOpen(false)} onSubmit={addItem} />}
    </div>
  );
}

function StockModal({ onClose, onSubmit }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "Расходники",
    supplier: "",
    quantity: "10",
    unit: "шт",
    expiry: "",
    minQuantity: "5",
  });

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit({
        name: form.name,
        category: form.category,
        quantity: Number(form.quantity),
        unit: form.unit,
        minQuantity: Number(form.minQuantity) || 5,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-[540px] overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 p-5">
          <div className="flex gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
              <ClipboardPlus size={21} />
            </div>
            <div>
              <h2 className="m-0 text-xl font-semibold text-slate-950">Новое поступление</h2>
              <p className="mt-1 max-w-[420px] text-sm leading-5 text-slate-500">Заполните данные о поступивших материалах для обновления склада</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={22} />
          </button>
        </div>

        <div className="grid gap-3.5 p-5">
          <Field label="Наименование товара">
            <input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} required placeholder="Например: Имплант Straumann BLT" className="field-control" />
          </Field>
          <div className="grid gap-3.5 md:grid-cols-2">
            <Field label="Категория">
              <select value={form.category} onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))} className="field-control">
                {CATEGORIES.map((item) => <option key={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Поставщик">
              <input value={form.supplier} onChange={(event) => setForm((prev) => ({ ...prev, supplier: event.target.value }))} placeholder="Выберите поставщика" className="field-control" />
            </Field>
          </div>
          <div className="grid gap-3.5 md:grid-cols-2">
            <Field label="Количество">
              <div className="grid grid-cols-[1fr_90px] gap-3">
                <input value={form.quantity} onChange={(event) => setForm((prev) => ({ ...prev, quantity: event.target.value }))} type="number" min="0" required className="field-control" />
                <select value={form.unit} onChange={(event) => setForm((prev) => ({ ...prev, unit: event.target.value }))} className="field-control">
                  {["шт", "уп", "амп", "мл", "г", "наб"].map((item) => <option key={item}>{item}</option>)}
                </select>
              </div>
            </Field>
            <Field label="Срок годности">
              <input value={form.expiry} onChange={(event) => setForm((prev) => ({ ...prev, expiry: event.target.value }))} type="date" className="field-control" />
            </Field>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <Field label="Порог уведомления">
              <input value={form.minQuantity} onChange={(event) => setForm((prev) => ({ ...prev, minQuantity: event.target.value }))} type="number" min="0" className="field-control" />
            </Field>
            <p className="mb-0 mt-2 text-xs text-slate-500">Система пришлет уведомление, когда остаток опустится ниже этого значения.</p>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 p-5">
          <button type="button" onClick={onClose} className="h-9 rounded-lg px-4 text-sm font-semibold text-slate-600">Отмена</button>
          <button disabled={saving} type="submit" className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 disabled:opacity-60">
            <CheckCircle2 size={17} />
            {saving ? "Добавление..." : "Добавить на склад"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export default function PaymentsPage() {
  const [tab, setTab] = useState("kassa");

  return (
    <div className="min-h-full bg-white px-8 py-6 lg:px-9">
      <style>{`
        .field-control {
          height: 39px;
          width: 100%;
          border: 1px solid #dbe4f0;
          border-radius: 10px;
          background: #fff;
          padding: 0 14px;
          color: #0f172a;
          font-size: 14px;
          outline: none;
        }
        .field-control:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 4px rgba(37,99,235,0.1);
        }
      `}</style>
      <div className="mx-auto grid max-w-[1300px] gap-6">
        <TopTabs active={tab} onChange={setTab} />
        {tab === "kassa" && <KassaTab />}
        {tab === "debtors" && <DebtorsTab />}
        {tab === "sklad" && <SkladTab />}
      </div>
    </div>
  );
}
