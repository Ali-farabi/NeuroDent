"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getAllVisits, getDoctors } from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

const TODAY     = new Date().toISOString().slice(0, 10);
const MONTH_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const CARIES_LABELS = {
  surface:     "Поверхностный",
  medium:      "Средний",
  deep:        "Глубокий",
  complicated: "Осложнённый",
};

const CARIES_COLORS = {
  surface:     { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
  medium:      { bg: "#fffbeb", color: "#b45309", border: "#fde68a" },
  deep:        { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
  complicated: { bg: "#fef2f2", color: "#dc2626", border: "#fecaca" },
};

function icdColor(code) {
  if (!code) return { bg: "#f8fafc", color: "#64748b", border: "#e2e8f0" };
  if (code.startsWith("K02")) return { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" };
  if (code.startsWith("K04")) return { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" };
  if (code.startsWith("K05")) return { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" };
  if (code.startsWith("K07")) return { bg: "#fdf4ff", color: "#7e22ce", border: "#e9d5ff" };
  return { bg: "#f8fafc", color: "#64748b", border: "#e2e8f0" };
}

// ── StatCard ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, accent, icon }) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "var(--radius)", padding: "14px 18px",
      display: "flex", alignItems: "center", gap: 14,
      boxShadow: "var(--shadow-sm)",
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: `${accent}18`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: accent, flexShrink: 0,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

function Badge({ bg, color, border, children }) {
  return (
    <span style={{
      fontSize: 11, padding: "2px 8px", borderRadius: 6, fontWeight: 500,
      background: bg, color, border: `1px solid ${border}`,
      display: "inline-block", whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

const inputStyle = {
  padding: "8px 12px", border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)", background: "var(--surface)",
  color: "var(--text)", fontSize: 13, boxSizing: "border-box",
};

const tdStyle = { padding: "10px 12px", verticalAlign: "middle" };

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function VisitsPage() {
  const router = useRouter();

  const [visits, setVisits]     = useState([]);
  const [doctors, setDoctors]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [query, setQuery]       = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [from, setFrom]         = useState(MONTH_AGO);
  const [to, setTo]             = useState(TODAY);
  const timer = useRef(null);

  async function load(q, dId, f, t) {
    // eslint-disable-next-line
    setLoading(true);
    try {
      const data = await getAllVisits({ query: q, doctorId: dId, from: f, to: t });
      setVisits(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    getDoctors().then(setDoctors);
    load("", "", MONTH_AGO, TODAY);
  // eslint-disable-next-line
  }, []);

  function onQueryChange(e) {
    const v = e.target.value;
    setQuery(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => load(v, doctorId, from, to), 250);
  }

  function onDoctorChange(e) {
    const v = e.target.value;
    setDoctorId(v);
    load(query, v, from, to);
  }

  function onFromChange(e) {
    const v = e.target.value;
    setFrom(v);
    load(query, doctorId, v, to);
  }

  function onToChange(e) {
    const v = e.target.value;
    setTo(v);
    load(query, doctorId, from, v);
  }

  const byCaries = visits.reduce((acc, v) => {
    if (v.cariesType) acc[v.cariesType] = (acc[v.cariesType] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="vis-outer" style={{ padding: 24, display: "grid", gap: 20, maxWidth: 1400 }}>
      <style>{`
        .vis-stats { display: flex; flex-wrap: wrap; gap: 12px; }
        .vis-stat  { flex: 1; min-width: 140px; }
        .vis-filters { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
        .vis-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .vis-row:hover { background: var(--hover) !important; }
        .vis-ai-btn {
          padding: 5px 12px; border-radius: var(--radius-sm);
          border: 1px solid var(--primary); background: var(--active);
          color: var(--primary); font-size: 12px; font-weight: 600;
          cursor: pointer; white-space: nowrap; transition: all 0.15s;
        }
        .vis-ai-btn:hover { background: var(--primary); color: #fff; }
        .vis-col-sm { }
        @media (max-width: 640px) {
          .vis-outer { padding: 12px !important; }
          .vis-stat  { min-width: calc(50% - 6px); flex: none; }
          .vis-col-sm { display: none; }
        }
        @media (max-width: 420px) { .vis-stat { min-width: 100%; } }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, background: "var(--active)",
          display: "flex", alignItems: "center", justifyContent: "center", color: "var(--primary)",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <line x1="10" y1="9" x2="8" y2="9"/>
          </svg>
        </div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", margin: 0, lineHeight: 1.2 }}>
            История визитов
          </h1>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
            Все завершённые приёмы пациентов
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="vis-stats">
        <div className="vis-stat">
          <StatCard label="Всего визитов" value={visits.length} accent="#2563eb"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>} />
        </div>
        <div className="vis-stat">
          <StatCard label="Поверхностный кариес" value={byCaries.surface || 0} accent="#16a34a"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>} />
        </div>
        <div className="vis-stat">
          <StatCard label="Глубокий / Средний" value={(byCaries.deep || 0) + (byCaries.medium || 0)} accent="#f59e0b"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>} />
        </div>
        <div className="vis-stat">
          <StatCard label="Осложнённый" value={byCaries.complicated || 0} accent="#dc2626"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>} />
        </div>
      </div>

      {/* Filters */}
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--radius)", padding: "14px 16px", boxShadow: "var(--shadow-sm)",
      }}>
        <div className="vis-filters">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>С:</span>
            <input type="date" value={from} onChange={onFromChange} style={inputStyle} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>По:</span>
            <input type="date" value={to} onChange={onToChange} style={inputStyle} />
          </div>
          <select value={doctorId} onChange={onDoctorChange} style={inputStyle}>
            <option value="">Все врачи</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <input
            type="text" value={query} onChange={onQueryChange}
            placeholder="Поиск по пациенту или диагнозу..."
            style={{ ...inputStyle, flex: 1, minWidth: 160 }}
          />
        </div>
      </div>

      {/* Table */}
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--radius)", boxShadow: "var(--shadow-sm)", overflow: "hidden",
      }}>
        {loading ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            Загрузка...
          </div>
        ) : visits.length === 0 ? (
          <div style={{ padding: "56px 0", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📋</div>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>Визиты не найдены</div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>Измените фильтры</div>
          </div>
        ) : (
          <div className="vis-table-wrap">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--surface-2)", borderBottom: "2px solid var(--border)" }}>
                  <th style={{ ...tdStyle, textAlign: "left", color: "var(--muted)", fontWeight: 500, fontSize: 12, whiteSpace: "nowrap" }}>Пациент</th>
                  <th style={{ ...tdStyle, textAlign: "left", color: "var(--muted)", fontWeight: 500, fontSize: 12, whiteSpace: "nowrap" }}>Дата</th>
                  <th className="vis-col-sm" style={{ ...tdStyle, textAlign: "left", color: "var(--muted)", fontWeight: 500, fontSize: 12, whiteSpace: "nowrap" }}>Врач</th>
                  <th style={{ ...tdStyle, textAlign: "center", color: "var(--muted)", fontWeight: 500, fontSize: 12, whiteSpace: "nowrap" }}>Зуб</th>
                  <th style={{ ...tdStyle, textAlign: "left", color: "var(--muted)", fontWeight: 500, fontSize: 12, whiteSpace: "nowrap" }}>Диагноз</th>
                  <th className="vis-col-sm" style={{ ...tdStyle, textAlign: "left", color: "var(--muted)", fontWeight: 500, fontSize: 12, whiteSpace: "nowrap" }}>Тип кариеса</th>
                  <th className="vis-col-sm" style={{ ...tdStyle, textAlign: "center", color: "var(--muted)", fontWeight: 500, fontSize: 12, whiteSpace: "nowrap" }}>Материалы</th>
                  <th style={{ ...tdStyle }}></th>
                </tr>
              </thead>
              <tbody>
                {visits.map((v, i) => {
                  const ic = icdColor(v.diagnosisCode);
                  const cc = CARIES_COLORS[v.cariesType] || CARIES_COLORS.surface;
                  return (
                    <tr key={v.id} className="vis-row"
                      style={{ borderBottom: i < visits.length - 1 ? "1px solid var(--border)" : "none", transition: "background 0.1s" }}>

                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap" }}>{v.patientName}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{v.patientPhone}</div>
                      </td>

                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                        <div style={{ fontWeight: 500, color: "var(--text)" }}>{fmtDate(v.date)}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{v.time}</div>
                      </td>

                      <td className="vis-col-sm" style={tdStyle}>
                        <div style={{ color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160 }}>
                          {v.doctorName}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{v.specialty}</div>
                      </td>

                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: 8,
                          background: "var(--active)", color: "var(--primary)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontWeight: 700, fontSize: 13, margin: "0 auto",
                          border: "1px solid var(--border)",
                        }}>
                          {v.toothNumber || "—"}
                        </div>
                      </td>

                      <td style={{ ...tdStyle, maxWidth: 200 }}>
                        <div style={{ color: "var(--text)", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {v.diagnosis || "—"}
                        </div>
                        {v.diagnosisCode && (
                          <Badge bg={ic.bg} color={ic.color} border={ic.border}>{v.diagnosisCode}</Badge>
                        )}
                      </td>

                      <td className="vis-col-sm" style={tdStyle}>
                        {v.cariesType ? (
                          <Badge bg={cc.bg} color={cc.color} border={cc.border}>
                            {CARIES_LABELS[v.cariesType] || v.cariesType}
                          </Badge>
                        ) : <span style={{ color: "var(--muted)" }}>—</span>}
                      </td>

                      <td className="vis-col-sm" style={{ ...tdStyle, textAlign: "center" }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: v.materials?.length ? "var(--primary)" : "var(--muted)" }}>
                          {v.materials?.length || 0}
                        </div>
                      </td>

                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <button className="vis-ai-btn" onClick={() => router.push(`/ai?patient=${v.patientId}`)}>
                          AI →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && visits.length > 0 && (
          <div style={{
            padding: "10px 16px", borderTop: "1px solid var(--border)",
            fontSize: 12, color: "var(--muted)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span>Всего: <strong style={{ color: "var(--text)" }}>{visits.length}</strong> визитов</span>
            <span>{fmtDate(from)} — {fmtDate(to)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
