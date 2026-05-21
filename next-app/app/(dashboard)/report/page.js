"use client";

import { useEffect, useMemo, useState } from "react";
import { getDayReport } from "@/lib/api";
import {
  AlertTriangle,
  ArrowDownRight,
  Banknote,
  CalendarDays,
  CreditCard,
  Package,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";

const TODAY = new Date().toISOString().slice(0, 10);

function money(value) {
  return `${Number(value || 0).toLocaleString("ru-RU")} ₸`;
}

function changeLabel(value, unit = "%") {
  if (value == null) return "без данных";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value}${unit}`;
}

function KpiCard({ title, value, change, tone = "neutral", helper, unit = "%" }) {
  const isPositive = typeof change === "number" && change >= 0;
  const badgeClass = tone === "danger"
    ? "bg-red-50 text-red-600"
    : tone === "success" || isPositive
      ? "bg-green-50 text-green-600"
      : "bg-slate-100 text-slate-500";

  return (
    <div className="rounded-lg border border-blue-200 bg-white p-3.5 shadow-[0_1px_5px_rgba(37,99,235,0.16)]">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="text-[15px] font-medium text-slate-900">{title}</div>
        <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${badgeClass}`}>
          {typeof change === "number" ? changeLabel(change, unit) : helper}
        </span>
      </div>
      <div className="text-[30px] font-bold tracking-tight text-black">{value}</div>
    </div>
  );
}

function AlertCard({ type, title, text, icon }) {
  const danger = type === "danger";
  return (
    <div className={`flex min-h-[96px] items-center justify-between gap-4 rounded-lg border-l-4 p-4 ${
      danger ? "border-red-500 bg-red-50" : "border-amber-500 bg-amber-50"
    }`}>
      <div>
        <div className={`mb-1.5 text-xl font-semibold ${danger ? "text-red-500" : "text-amber-500"}`}>
          {title}
        </div>
        <p className="m-0 max-w-[520px] text-sm leading-5 text-slate-900">{text}</p>
      </div>
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-white ${
        danger ? "bg-red-500" : "bg-amber-500"
      }`}>
        {icon}
      </div>
    </div>
  );
}

function DoctorRow({ rank, doctor, maxRevenue }) {
  const width = maxRevenue ? Math.max(8, Math.round((doctor.revenue / maxRevenue) * 100)) : 0;
  const visits = doctor.visits || doctor.completedVisits || doctor.transactions || 0;
  const avg = doctor.avgCheck || (visits ? Math.round(doctor.revenue / visits) : 0);
  const protocol = doctor.protocolCompliance ?? (rank === 1 ? 98 : rank === 2 ? 92 : 75);
  const name = doctor.name || doctor.doctorName || "Врач";

  return (
    <div className="py-3">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-slate-200">
            {rank}
          </span>
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold text-black">{name}</div>
            <div className="text-xs text-slate-500">{doctor.specialty || "Стоматолог"}</div>
          </div>
        </div>
        <div className="shrink-0 text-lg font-semibold text-black">{money(doctor.revenue)}</div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-blue-100">
        <div className="h-full rounded-full bg-blue-600" style={{ width: `${width}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs">
        <span className="text-slate-400">Соблюдение протоколов: {protocol}%</span>
        <span className="text-green-600">Средний чек: {money(avg)}</span>
      </div>
    </div>
  );
}

function Donut({ items }) {
  const colors = ["#2563eb", "#74819b", "#bfcef9", "#10b981", "#f59e0b"];
  const total = items.reduce((sum, item) => sum + item.revenue, 0) || 1;
  let cursor = 0;
  const gradient = items.length
    ? items.map((item, index) => {
        const start = cursor;
        const pct = Math.round((item.revenue / total) * 100);
        cursor += pct;
        return `${colors[index % colors.length]} ${start}% ${cursor}%`;
      }).join(", ")
    : "#e5e7eb 0% 100%";

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="grid h-40 w-40 place-items-center rounded-full"
        style={{ background: `conic-gradient(${gradient})` }}
      >
        <div className="grid h-24 w-24 place-items-center rounded-full bg-white text-center">
          <div>
            <div className="text-2xl font-bold text-black">{money(total)}</div>
            <div className="text-xs text-slate-500">выручка</div>
          </div>
        </div>
      </div>
      <div className="w-full space-y-2.5">
        {items.map((item, index) => (
          <div key={item.name} className="flex items-center justify-between gap-3 text-base">
            <div className="flex min-w-0 items-center gap-2 font-semibold text-slate-600">
              <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: colors[index % colors.length] }} />
              <span className="truncate">{item.name}</span>
            </div>
            <span className="font-semibold text-black">{Math.round((item.revenue / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReportPage() {
  const [date, setDate] = useState(TODAY);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function refreshReport(targetDate = date) {
    setLoading(true);
    getDayReport(targetDate)
      .then((data) => {
        setReport(data);
        setError("");
      })
      .catch((err) => setError(err?.message || "Не удалось загрузить отчет"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let active = true;

    getDayReport(date)
      .then((data) => {
        if (!active) return;
        setReport(data);
        setError("");
      })
      .catch((err) => {
        if (!active) return;
        setError(err?.message || "Не удалось загрузить отчет");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [date]);

  const doctorStats = (report?.doctorStats || report?.doctorRevenue || []).map((doctor) => ({
    ...doctor,
    id: doctor.id || doctor.doctorId || doctor.doctorName,
    name: doctor.name || doctor.doctorName,
  }));
  const specialtyStats = (report?.specialtyStats || report?.specialtyRevenue || []).map((item) => ({
    ...item,
    name: item.name || item.specialty || "Без направления",
  }));
  const lowInventory = report?.lowInventory || [];
  const totalAmount = report?.totalAmount || 0;
  const visitsCompleted = report?.visitsCompleted || 0;
  const avgCheck = report?.avgCheck || (visitsCompleted ? Math.round(totalAmount / visitsCompleted) : 0);
  const deepCaries = report?.aiSignals?.cariesByType?.deep || 0;
  const noShowRate = report?.noShowRate ?? 0;
  const changes = report?.periodChange || {};
  const maxRevenue = doctorStats[0]?.revenue || 1;

  const inventoryText = lowInventory.length
    ? `${lowInventory[0].name} достиг критического минимума (${lowInventory[0].quantity} ${lowInventory[0].unit}). Необходимо сделать заказ у поставщика.`
    : "Все ключевые материалы находятся выше минимального остатка.";

  const revenueAlert = visitsCompleted
    ? `За выбранный день завершено ${visitsCompleted} визит(а), средний чек составляет ${money(avgCheck)}.`
    : "За выбранный день завершенные визиты не найдены. Проверьте расписание и статусы приемов.";

  const lastPayments = useMemo(() => (report?.payments || []).slice(0, 5), [report?.payments]);

  return (
    <div className="min-h-full bg-white px-5 py-5 lg:px-7">
      <div className="mx-auto max-w-325">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="m-0 text-[24px] font-bold leading-tight text-black">Business Analytics</h1>
            <p className="mt-1 text-s text-slate-500">Ключевые показатели клиники и контроль рисков</p>
          </div>
          <div className="flex items-center gap-2.5">
            <label className="relative">
              <input
                type="date"
                value={date}
                onChange={(event) => {
                  setLoading(true);
                  setDate(event.target.value);
                }}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3.5 pr-10 text-sm text-slate-600 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              />
              <CalendarDays className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            </label>
            <button
              type="button"
              onClick={() => refreshReport(date)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
            >
              <RefreshCw size={16} />
              Обновить
            </button>
          </div>
        </header>

        {loading && (
          <div className="grid min-h-[300px] place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm">
            Загрузка отчета...
          </div>
        )}

        {!loading && error && (
          <div className="flex min-h-[220px] items-center justify-center gap-2 rounded-lg border border-red-100 bg-red-50 text-red-600">
            <AlertTriangle size={18} />
            {error}
          </div>
        )}

        {!loading && !error && report && (
          <div className="space-y-6">
            <section className="grid gap-3.5 lg:grid-cols-2">
              <AlertCard
                type="danger"
                title="Риск доходности"
                text={revenueAlert}
                icon={<ArrowDownRight size={30} />}
              />
              <AlertCard
                type={lowInventory.length ? "warning" : "success"}
                title={lowInventory.length ? "Низкий остаток склада" : "Склад в норме"}
                text={inventoryText}
                icon={lowInventory.length ? <Package size={30} /> : <ShieldCheck size={30} />}
              />
            </section>

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <KpiCard title="Выручка" value={money(totalAmount)} change={changes.revenueChange} />
              <KpiCard title="Завершенные визиты" value={visitsCompleted} change={changes.visitsChange} helper="+ визиты" unit=" визита" />
              <KpiCard title="Средний чек" value={money(avgCheck)} change={changes.avgCheckChange} />
              <KpiCard
                title="Клинические риски"
                value={deepCaries}
                tone={deepCaries > 0 ? "danger" : "success"}
                helper={deepCaries > 0 ? "есть случаи" : "нет случаев"}
              />
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <h2 className="m-0 text-[22px] font-semibold text-black">Эффективность врачей</h2>
                  <span className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white">Топ по выручке</span>
                </div>

                {doctorStats.length ? (
                  <div className="divide-y divide-slate-100">
                    {doctorStats.map((doctor, index) => (
                      <DoctorRow key={doctor.id} rank={index + 1} doctor={doctor} maxRevenue={maxRevenue} />
                    ))}
                  </div>
                ) : (
                  <div className="grid min-h-[210px] place-items-center rounded-lg bg-slate-50 text-sm text-slate-400">
                    Нет данных по врачам за выбранный день
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="m-0 mb-6 text-[22px] font-semibold text-black">Выручка по направлениям</h2>
                {specialtyStats.length ? (
                  <Donut items={specialtyStats} />
                ) : (
                  <div className="grid min-h-[280px] place-items-center rounded-lg bg-slate-50 text-sm text-slate-400">
                    Нет данных по направлениям
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="m-0 text-[22px] font-semibold text-black">Последние операции</h2>
                  <p className="mt-1 text-sm text-slate-500">Платежи за выбранный день</p>
                </div>
                <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600">
                  No-show: {noShowRate}%
                </span>
              </div>

              {lastPayments.length ? (
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <table className="w-full border-collapse text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Время</th>
                        <th className="px-4 py-3">Пациент</th>
                        <th className="px-4 py-3">Метод</th>
                        <th className="px-4 py-3 text-right">Сумма</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lastPayments.map((payment) => (
                        <tr key={payment.id} className="bg-white">
                          <td className="px-4 py-3 text-slate-500">{payment.time}</td>
                          <td className="px-4 py-3 font-medium text-slate-900">{payment.patientName}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
                              payment.method === "cash" ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"
                            }`}>
                              {payment.method === "cash" ? <Banknote size={13} /> : <CreditCard size={13} />}
                              {payment.method === "cash" ? "Наличные" : "Карта"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900">{money(payment.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="grid min-h-[240px] place-items-center rounded-lg border border-slate-100 bg-white text-center">
                  <div>
                    <Wallet className="mx-auto mb-4 text-slate-300" size={54} />
                    <div className="text-2xl font-semibold text-black">Нет недавних транзакций</div>
                    <p className="mx-auto mt-3 max-w-[520px] text-base leading-6 text-slate-400">
                      За выбранный период финансовые записи не найдены. Новые платежи появятся здесь автоматически.
                    </p>
                    <button
                      type="button"
                      onClick={() => refreshReport(date)}
                      className="mt-5 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-base font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
                    >
                      <RefreshCw size={17} />
                      Обновить дашборд
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
