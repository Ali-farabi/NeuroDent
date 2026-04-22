"use client";

import { useState, useEffect } from "react";
import { getDayReport } from "@/lib/api";

const TODAY = new Date().toISOString().slice(0, 10);

function fmt(n) {
  return Number(n || 0).toLocaleString("ru-RU") + " ₸";
}

function StatCard({ label, value, badge, badgeColor }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <div className="flex justify-between items-start mb-3">
        <div className="text-[13px] text-gray-500 font-semibold uppercase">{label}</div>
        <div className={`px-2 py-1 rounded text-[11px] font-bold ${badgeColor}`}>{badge}</div>
      </div>
      <div className="text-[28px] font-extrabold text-gray-900">{value}</div>
    </div>
  );
}

function DoctorRow({ rank, name, revenue, barWidth, barColor, protocols, avgCheck, alert }) {
  const rankBg = rank === 1 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500";
  return (
    <div>
      <div className="flex justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${rankBg}`}>{rank}</div>
          <span className="font-semibold text-sm text-gray-900">{name}</span>
        </div>
        <span className="font-bold text-sm text-gray-900">{fmt(revenue)}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${barWidth}%` }} />
      </div>
      <div className="flex justify-between mt-1.5 text-[11px] text-gray-400">
        <span>Соблюдение протоколов: {alert ? <span className="text-amber-600">{protocols}</span> : protocols}</span>
        <span className="text-green-600">Средний чек: {fmt(avgCheck)}</span>
      </div>
    </div>
  );
}

export default function ReportPage() {
  const [date, setDate] = useState(TODAY);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadReport(d) {
    setLoading(true);
    setError("");
    try {
      const r = await getDayReport(d);
      setReport(r);
    } catch (err) {
      setError(err.message || "Не удалось загрузить отчёт");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReport(date);
  }, [date]);

  const totalAmount = report?.totalAmount || 0;
  const visitsCompleted = report?.visitsCompleted || 0;
  const avgCheck = visitsCompleted ? Math.round(totalAmount / visitsCompleted) : 0;
  const deepCaries = report?.aiSignals?.cariesByType?.deep || 0;
  const payments = report?.payments || [];

  return (
    <div className="p-4 flex flex-col gap-4 max-w-full mx-auto">

      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <div className="flex justify-between items-end flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 m-0">Business Analytics</h1>
            <p className="text-sm text-gray-500 m-0 mt-1">Ключевые показатели клиники и контроль врачей</p>
          </div>
          <div className="flex gap-3">
            <input
              type="date"
              className="px-3 py-2 border border-gray-200 bg-white rounded-lg text-sm h-9 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <button
              className="px-3 py-2 h-9 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition flex items-center gap-1.5"
              onClick={() => loadReport(date)}
              title="Обновить"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="flex items-center justify-center gap-3 py-8 text-gray-400">
          <span className="inline-block w-5 h-5 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
          <span>Загрузка отчёта...</span>
        </div>
      )}
      {error && (
        <div className="flex items-center justify-center gap-2 py-8 text-red-500">
          <span className="text-xl">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Risk Alerts */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide px-5 pt-5 pb-3 m-0">Risk Alerts</h2>
        <div className="border-t border-gray-200 grid grid-cols-1 md:grid-cols-2">
          <div className="bg-red-50/50 border-r border-gray-200 p-4 flex gap-3">
            <div className="text-2xl shrink-0">📉</div>
            <div>
              <div className="font-semibold text-red-600 text-sm mb-1">Снижение доходимости</div>
              <div className="text-[13px] text-gray-500 leading-relaxed">За последние 3 дня доходимость пациентов к ортодонту упала до 45% (норма 70%). Рекомендуется проверить скрипты админов.</div>
            </div>
          </div>
          <div className="bg-amber-50/50 p-4 flex gap-3">
            <div className="text-2xl shrink-0">📦</div>
            <div>
              <div className="font-semibold text-amber-600 text-sm mb-1">Запасы на исходе</div>
              <div className="text-[13px] text-gray-500 leading-relaxed">Слепочная масса Speedex достигла критического минимума (4 упак). Необходимо срочно сделать заказ у поставщика.</div>
            </div>
          </div>
        </div>
      </div>

      {!loading && !error && report && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Общая выручка"
              value={fmt(totalAmount)}
              badge="+12%"
              badgeColor="bg-green-100 text-green-600"
            />
            <StatCard
              label="Завершённые визиты"
              value={visitsCompleted}
              badge="+3 визита"
              badgeColor="bg-green-100 text-green-600"
            />
            <StatCard
              label="Средний чек"
              value={fmt(avgCheck)}
              badge="-5%"
              badgeColor="bg-red-100 text-red-600"
            />
            <StatCard
              label="Глубокий кариес (AI)"
              value={deepCaries}
              badge={deepCaries > 0 ? "Есть случаи" : "Нет случаев"}
              badgeColor="bg-gray-100 text-gray-500"
            />
          </div>

          {/* Panels Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Doctor Control */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-base font-bold text-gray-900 m-0">Контроль врачей</h2>
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-50 border border-gray-200 text-gray-700">Топ по выручке</span>
              </div>
              <div className="flex flex-col gap-4">
                <DoctorRow rank={1} name="Dr. Johnson (Стоматолог)" revenue={185000} barWidth={100} barColor="bg-blue-600" protocols="98%" avgCheck={35000} alert={false} />
                <DoctorRow rank={2} name="Dr. Nguyen (Ортодонт)" revenue={120000} barWidth={65} barColor="bg-blue-500" protocols="92%" avgCheck={60000} alert={false} />
                <DoctorRow rank={3} name="Dr. Smith (Терапевт)" revenue={45000} barWidth={25} barColor="bg-amber-500" protocols="75% (Отклонения)" avgCheck={15000} alert={true} />
              </div>
            </div>

            {/* Revenue by Specialty - Donut Chart */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col">
              <h2 className="text-base font-bold text-gray-900 m-0 mb-5">Выручка по направлениям</h2>
              <div className="flex items-center gap-8 flex-1">
                {/* Donut */}
                <div className="relative w-[140px] h-[140px] rounded-full shrink-0 flex items-center justify-center" style={{ background: "conic-gradient(#2563eb 0% 50%, #10b981 50% 80%, #f59e0b 80% 100%)", boxShadow: "inset 0 0 0 25px white" }}>
                  <div className="text-center">
                    <div className="font-extrabold text-base text-gray-900">350K ₸</div>
                  </div>
                </div>
                {/* Legend */}
                <div className="flex flex-col gap-3 flex-1">
                  {[
                    { color: "bg-blue-600", label: "Ортопедия", pct: "50%" },
                    { color: "bg-emerald-500", label: "Хирургия", pct: "30%" },
                    { color: "bg-amber-500", label: "Терапия", pct: "20%" },
                  ].map((item) => (
                    <div key={item.label} className="flex justify-between items-center text-[13px]">
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-sm ${item.color}`} />
                        <span className="text-gray-700">{item.label}</span>
                      </div>
                      <span className="font-semibold text-gray-900">{item.pct}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Transaction Details */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <h2 className="text-base font-bold text-gray-900 m-0 mb-4">Последние транзакции (Детализация)</h2>

            {payments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                <span className="text-3xl mb-2">💰</span>
                <span>Нет оплат за эту дату</span>
              </div>
            ) : (
              <>
                {/* Summary bar */}
                <div className="bg-gray-50 px-4 py-3 rounded-xl flex justify-between border border-gray-200 mb-4">
                  <div className="text-sm">
                    <span className="text-gray-500">Всего транзакций: </span>
                    <span className="font-semibold text-gray-900">{payments.length}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-500">Сумма за период: </span>
                    <span className="font-bold text-blue-600">{fmt(payments.reduce((s, p) => s + Number(p.amount), 0))}</span>
                  </div>
                </div>

                {/* Table */}
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-gray-500 font-semibold">Время</th>
                        <th className="px-4 py-3 text-gray-500 font-semibold">Пациент</th>
                        <th className="px-4 py-3 text-gray-500 font-semibold">Способ</th>
                        <th className="px-4 py-3 text-gray-500 font-semibold text-right">Сумма</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition">
                          <td className="px-4 py-3 text-gray-700">{p.time}</td>
                          <td className="px-4 py-3 font-medium text-gray-900">{p.patientName}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border border-transparent ${p.method === "cash" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                              {p.method === "cash" ? "💵 Наличные" : "💳 Карта"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-900">+{Number(p.amount).toLocaleString("ru-RU")} ₸</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
