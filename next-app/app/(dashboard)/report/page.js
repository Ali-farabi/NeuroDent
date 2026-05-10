"use client";

import { useState, useEffect } from "react";
import { getDayReport } from "@/lib/api";
import { AlertTriangle, TrendingDown, Package, Wallet, Banknote, CreditCard } from "lucide-react";

const TODAY = new Date().toISOString().slice(0, 10);

function fmt(n) {
  return Number(n || 0).toLocaleString("ru-RU") + " ₸";
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, badge, badgeBg, badgeColor }) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)", borderLeft: "none", 
      borderRadius: "1px", padding: "20px",
      boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column", gap: 12,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px" }}>
          {label}
        </div>
        <div style={{
          background: badgeBg, color: badgeColor,
          padding: "3px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
        }}>
          {badge}
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text)" }}>{value}</div>
    </div>
  );
}

// ── Doctor Row ────────────────────────────────────────────────────────────────
function DoctorRow({ rank, name, revenue, barWidth, barColor, protocols, avgCheck, alert }) {
  const isFirst = rank === 1;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 24, height: 24, borderRadius: "50%",
            background: isFirst ? "var(--primary-100, rgba(37,99,235,0.1))" : "var(--surface-2)",
            color: isFirst ? "var(--primary)" : "var(--muted)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 700,
          }}>{rank}</div>
          <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{name}</span>
        </div>
        <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{fmt(revenue)}</span>
      </div>
      <div style={{ height: 6, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${barWidth}%`, background: barColor, borderRadius: 3 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "var(--muted)" }}>
        <span>
          Соблюдение протоколов:{" "}
          {alert
            ? <span style={{ color: "#d97706" }}>{protocols}</span>
            : protocols
          }
        </span>
        <span style={{ color: "var(--success)" }}>Средний чек: {fmt(avgCheck)}</span>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ReportPage() {
  const [date, setDate]     = useState(TODAY);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");

  function loadReport(d) {
    getDayReport(d)
      .then(r => { setReport(r); setError(""); setLoading(false); })
      .catch(err => { setError(err?.message || "Не удалось загрузить отчёт"); setLoading(false); });
  }

  useEffect(() => { loadReport(date); }, [date]);

  const totalAmount      = report?.totalAmount || 0;
  const visitsCompleted  = report?.visitsCompleted || 0;
  const avgCheck         = report?.avgCheck || (visitsCompleted ? Math.round(totalAmount / visitsCompleted) : 0);
  const deepCaries       = report?.aiSignals?.cariesByType?.deep || 0;
  const payments         = report?.payments || [];
  const teethByCount     = report?.aiSignals?.teethByCount || {};
  const topTeeth         = Object.entries(teethByCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const doctorStats    = report?.doctorStats || [];
  const lowInventory   = report?.lowInventory || [];
  const topRevenue     = doctorStats[0]?.revenue || 1;
  const noShowRate     = report?.noShowRate ?? 0;

  // Изменения за период (сравнение со вчерашним)
  const pc = report?.periodChange || {};
  const fmtPct  = (v) => v == null ? "—" : v >= 0 ? `+${v}%`    : `${v}%`;
  const fmtVis  = (v) => v == null ? "—" : v >= 0 ? `+${v} визит` : `${v} визит`;
  const posColor = "rgba(16,185,129,0.1)";
  const negColor = "rgba(239,68,68,0.1)";
  const neutColor = "var(--surface-2)";
  const badgeBgOf  = (v) => v == null ? neutColor : v >= 0 ? posColor : negColor;
  const badgeClrOf = (v) => v == null ? "var(--muted)" : v >= 0 ? "var(--success)" : "var(--danger)";

  const spColors = ["var(--primary)", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444"];
  const specialtyStats = report?.specialtyStats || [];
  const spTotal    = specialtyStats.reduce((s, x) => s + x.revenue, 0) || 1;
  const spGradient = specialtyStats.length
    ? specialtyStats.reduce((acc, sp, i) => {
        const pct = Math.round((sp.revenue / spTotal) * 100);
        acc.parts.push(`${spColors[i] || "#94a3b8"} ${acc.prev}% ${acc.prev + pct}%`);
        acc.prev += pct;
        return acc;
      }, { parts: [], prev: 0 }).parts.join(", ")
    : "var(--border) 0% 100%";

  const panel = {
    background: "var(--surface)", border: "1px solid var(--border)",
    borderRadius: "var(--radius)", padding: 20, boxShadow: "var(--shadow-sm)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* ── Header ── */}
      <div style={{
        ...panel, borderRadius: 0,
        borderBottom: "none",
        display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        flexWrap: "wrap", gap: 12,
      }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>Business Analytics</h1>
          <p style={{ color: "var(--muted)", margin: "4px 0 0", fontSize: 13 }}>Ключевые показатели клиники и контроль врачей</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{
              padding: "7px 12px", border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)", background: "var(--surface)",
              color: "var(--text)", fontSize: 13, height: 36,
            }}
          />
          <button
            onClick={() => loadReport(date)}
            title="Обновить"
            style={{
              width: 36, height: 36, border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)", background: "var(--surface)",
              color: "var(--muted)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Loading / Error ── */}
      {loading && (
        <div style={{ padding: "48px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
          <div style={{
            width: 20, height: 20, border: "2px solid var(--border)",
            borderTop: "2px solid var(--primary)", borderRadius: "50%",
            animation: "spin 0.8s linear infinite", display: "inline-block", marginBottom: 8,
          }} />
          <div>Загрузка отчёта...</div>
        </div>
      )}
      {error && (
        <div style={{ padding: "48px 0", textAlign: "center", color: "var(--danger)", fontSize: 13 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><AlertTriangle size={14} /> {error}</span>
        </div>
      )}

      {/* ── Risk Alerts ── */}
      <div style={{ ...panel, borderRadius: 0, borderBottom: "none" }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 12px" }}>
          Risk Alerts
        </h2>
        <div style={{ borderTop: "1px solid var(--border)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
          <div style={{ background: "rgba(239,68,68,0.04)", borderRight: "1px solid var(--border)", padding: 16, display: "flex", gap: 12 }}>
            <div style={{ fontSize: 24, display: "flex" }}><TrendingDown size={24} /></div>
            <div>
              <div style={{ fontWeight: 600, color: "var(--danger)", fontSize: 14, marginBottom: 4 }}>Снижение доходимости</div>
              <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
                {visitsCompleted === 0
                  ? "За выбранную дату нет завершённых визитов."
                  : `Завершено ${visitsCompleted} визит(а). Средний чек: ${fmt(avgCheck)}.`}
              </div>
            </div>
          </div>
          <div style={{ background: lowInventory.length > 0 ? "rgba(245,158,11,0.04)" : "rgba(16,185,129,0.04)", padding: 16, display: "flex", gap: 12 }}>
            <div style={{ fontSize: 24, display: "flex" }}><Package size={24} /></div>
            <div>
              <div style={{ fontWeight: 600, color: lowInventory.length > 0 ? "#d97706" : "var(--success)", fontSize: 14, marginBottom: 4 }}>
                {lowInventory.length > 0 ? "Запасы на исходе" : "Склад в норме"}
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
                {lowInventory.length > 0
                  ? lowInventory.map(i => `${i.name} — ${i.quantity} ${i.unit}`).join("; ")
                  : "Все материалы в достаточном количестве."}
              </div>
            </div>
          </div>
        </div>
      </div>

      {!loading && !error && report && (
        <>
          {/* ── Summary Cards ── */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 0, borderBottom: "none",
          }}>
            {[
              { label: "Общая выручка",       value: fmt(totalAmount),  badge: fmtPct(pc.revenueChange),  badgeBg: badgeBgOf(pc.revenueChange),  badgeColor: badgeClrOf(pc.revenueChange)  },
              { label: "Завершённые визиты",  value: visitsCompleted,   badge: fmtVis(pc.visitsChange),   badgeBg: badgeBgOf(pc.visitsChange),   badgeColor: badgeClrOf(pc.visitsChange)   },
              { label: "Средний чек",         value: fmt(avgCheck),     badge: fmtPct(pc.avgCheckChange), badgeBg: badgeBgOf(pc.avgCheckChange), badgeColor: badgeClrOf(pc.avgCheckChange) },
              { label: "Не пришли (no-show)", value: `${noShowRate}%`,  badge: deepCaries > 0 ? `${deepCaries} глуб. кариес` : "Кариес ОК", badgeBg: deepCaries > 0 ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)", badgeColor: deepCaries > 0 ? "var(--danger)" : "var(--success)" },
            ].map(c => (
              <div key={c.label} style={{ border: "1px solid var(--border)", borderTop: "none" }}>
                <StatCard {...c} />
              </div>
            ))}
          </div>

          {/* ── Panels Grid ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 0 }}>

            {/* Doctor Control */}
            <div style={{ ...panel, borderRadius: 0, borderTop: "none", borderRight: "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: 0 }}>Контроль врачей</h2>
                <span style={{
                  padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                  background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)",
                }}>Топ по выручке</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {doctorStats.length === 0 ? (
                  <div style={{ color: "var(--muted)", fontSize: 13, textAlign: "center", padding: "16px 0" }}>
                    Нет данных за выбранную дату
                  </div>
                ) : doctorStats.map((doc, i) => {
                  const barColors = ["var(--primary)", "#3b82f6", "#f59e0b", "#10b981", "#8b5cf6"];
                  const avgCheckDoc = doc.visits ? Math.round(doc.revenue / doc.visits) : 0;
                  return (
                    <DoctorRow
                      key={doc.id}
                      rank={i + 1}
                      name={`${doc.name.split(" ").slice(0, 2).join(" ")} (${doc.specialty || "—"})`}
                      revenue={doc.revenue}
                      barWidth={Math.round((doc.revenue / topRevenue) * 100)}
                      barColor={barColors[i] || "#94a3b8"}
                      protocols="—"
                      avgCheck={avgCheckDoc}
                      alert={false}
                    />
                  );
                })}
              </div>
            </div>

            {/* Revenue by Specialty */}
            <div style={{ ...panel, borderRadius: 0, borderTop: "none", display: "flex", flexDirection: "column" }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: "0 0 20px" }}>Выручка по направлениям</h2>
              {specialtyStats.length === 0 ? (
                <div style={{ color: "var(--muted)", fontSize: 13, textAlign: "center", padding: "16px 0" }}>Нет данных за выбранную дату</div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 32, flex: 1 }}>
                  <div style={{
                    position: "relative", width: 140, height: 140, borderRadius: "50%", flexShrink: 0,
                    background: `conic-gradient(${spGradient})`,
                    boxShadow: "inset 0 0 0 28px var(--surface)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: "var(--text)" }}>{fmt(spTotal)}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
                    {specialtyStats.map((sp, i) => (
                      <div key={sp.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 10, height: 10, background: spColors[i] || "#94a3b8", borderRadius: 2 }} />
                          <span style={{ color: "var(--text)" }}>{sp.name}</span>
                        </div>
                        <span style={{ fontWeight: 600, color: "var(--text)" }}>{Math.round((sp.revenue / spTotal) * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── AI Insights: Most Affected Teeth ── */}
          {topTeeth.length > 0 && (
            <div style={{ ...panel, borderRadius: 0, borderTop: "none" }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: "0 0 16px" }}>
                AI — Часто обрабатываемые зубы
              </h2>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {topTeeth.map(([tooth, count]) => (
                  <div key={tooth} style={{
                    padding: "8px 16px", borderRadius: "var(--radius-sm)",
                    background: "rgba(37,99,235,0.07)", border: "1px solid rgba(37,99,235,0.2)",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                  }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--primary)" }}>#{tooth}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{count} {count === 1 ? "случай" : "случая"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Transaction Details ── */}
          <div style={{ ...panel, borderRadius: 0, borderTop: "none" }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: "0 0 16px" }}>
              Последние транзакции (Детализация)
            </h2>

            {payments.length === 0 ? (
              <div style={{ padding: "32px 0", textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 8, display: "flex", justifyContent: "center" }}><Wallet size={28} /></div>
                <div style={{ color: "var(--muted)", fontSize: 13 }}>Нет оплат за эту дату</div>
              </div>
            ) : (
              <>
                <div style={{
                  background: "var(--surface-2)", padding: "10px 16px",
                  borderRadius: "var(--radius-sm)", border: "1px solid var(--border)",
                  display: "flex", justifyContent: "space-between", marginBottom: 14, fontSize: 13,
                }}>
                  <span>
                    <span style={{ color: "var(--muted)" }}>Всего транзакций: </span>
                    <span style={{ fontWeight: 600, color: "var(--text)" }}>{payments.length}</span>
                  </span>
                  <span>
                    <span style={{ color: "var(--muted)" }}>Сумма за период: </span>
                    <span style={{ fontWeight: 700, color: "var(--primary)" }}>
                      {fmt(payments.reduce((s, p) => s + Number(p.amount), 0))}
                    </span>
                  </span>
                </div>

                <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                      <tr>
                        {["Время", "Пациент", "Способ", "Сумма"].map((h, i) => (
                          <th key={h} style={{
                            padding: "10px 16px", color: "var(--muted)", fontWeight: 600,
                            textAlign: i === 3 ? "right" : "left",
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p, i) => (
                        <tr key={p.id} style={{
                          borderBottom: i < payments.length - 1 ? "1px solid var(--border)" : "none",
                        }}
                          onMouseEnter={e => e.currentTarget.style.background = "var(--hover)"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >
                          <td style={{ padding: "10px 16px", color: "var(--muted)" }}>{p.time}</td>
                          <td style={{ padding: "10px 16px", fontWeight: 500, color: "var(--text)" }}>{p.patientName}</td>
                          <td style={{ padding: "10px 16px" }}>
                            <span style={{
                              padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                              background: p.method === "cash" ? "rgba(16,185,129,0.1)" : "rgba(37,99,235,0.1)",
                              color: p.method === "cash" ? "var(--success)" : "var(--primary)",
                              border: "1px solid transparent",
                            }}>
                              {p.method === "cash" ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Banknote size={12} /> Наличные</span> : <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><CreditCard size={12} /> Карта</span>}
                            </span>
                          </td>
                          <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "var(--text)" }}>
                            +{Number(p.amount).toLocaleString("ru-RU")} ₸
                          </td>
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
