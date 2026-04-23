"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getDoctors, getSchedule, createAppointment, searchPatients,
  updateAppointmentStatus, getPatientById, getVisitsByPatient,
} from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { Bot, Stethoscope, Phone, CalendarDays, MessageCircle, Sparkles, ClipboardList, Bell, UserRound, X } from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────────
const TODAY    = new Date().toISOString().slice(0, 10);
const NOW_MS   = new Date(TODAY).getTime();
const SLOT_H  = 62;

const RU_MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const RU_DOW    = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

const TIME_SLOTS = [];
for (let h = 8; h <= 20; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2,"0")}:00`);
  if (h !== 20) TIME_SLOTS.push(`${String(h).padStart(2,"0")}:30`);
}

function timeToY(time) {
  const [h, m] = time.split(":").map(Number);
  return (((h - 8) * 60 + m) / 30) * SLOT_H;
}
function durationToH(min) { return (min / 30) * SLOT_H; }

const STATUS_STYLE = {
  scheduled: { bg: "#f0f6ff", color: "#1d4ed8", border: "#bfdbfe", stripe: "#3b82f6", label: "SCHEDULED", ru: "Ожидает" },
  arrived:   { bg: "#fffbeb", color: "#b45309", border: "#fde68a", stripe: "#f59e0b", label: "ARRIVED",   ru: "Принят"  },
  completed: { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0", stripe: "#22c55e", label: "COMPLETED", ru: "Завершён"},
  cancelled: { bg: "#fff1f2", color: "#dc2626", border: "#fecaca", stripe: "#ef4444", label: "CANCELLED", ru: "Отменён" },
};

const STATUS_TRANSITIONS = {
  scheduled: ["arrived", "cancelled"],
  arrived:   ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

// ── Shared styles ──────────────────────────────────────────────────────────────
const inputStyle = {
  width: "100%", padding: "8px 11px",
  border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
  background: "var(--surface)", color: "var(--text)",
  fontSize: 13, boxSizing: "border-box", outline: "none",
};
const btnPrimary = {
  padding: "10px 18px", background: "var(--primary)", color: "#fff",
  border: "none", borderRadius: "var(--radius-sm)",
  fontWeight: 600, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
};
const btnOutline = {
  padding: "8px 14px", background: "var(--surface)", color: "var(--text)",
  border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
  fontWeight: 500, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
};

// ── Mini Calendar ──────────────────────────────────────────────────────────────
function MiniCalendar({ value, onChange }) {
  const sel = value ? new Date(value + "T00:00:00") : new Date();
  const [view, setView] = useState({ year: sel.getFullYear(), month: sel.getMonth() });

  function prevMonth() { setView(v => ({ year: v.month === 0 ? v.year-1 : v.year, month: v.month === 0 ? 11 : v.month-1 })); }
  function nextMonth() { setView(v => ({ year: v.month === 11 ? v.year+1 : v.year, month: v.month === 11 ? 0 : v.month+1 })); }
  function goToday()   { const t = new Date(); setView({ year: t.getFullYear(), month: t.getMonth() }); onChange(TODAY); }

  const firstDay    = new Date(view.year, view.month, 1).getDay();
  const offset      = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div style={{ userSelect: "none" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button onClick={prevMonth} style={{ width: 28, height: 28, border: "none", borderRadius: 0, background: "transparent", cursor: "pointer", fontSize: 20, color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{RU_MONTHS[view.month]} {view.year}</div>
        <button onClick={nextMonth} style={{ width: 28, height: 28, border: "none", borderRadius: 0, background: "transparent", cursor: "pointer", fontSize: 20, color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 3 }}>
        {RU_DOW.map((d, i) => (
          <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: i >= 5 ? "#ef4444" : "var(--muted)", padding: "2px 0" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const dateStr    = `${view.year}-${String(view.month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
          const isToday    = dateStr === TODAY;
          const isSelected = dateStr === value;
          const isWeekend  = (i % 7) >= 5;
          return (
            <button key={i} onClick={() => onChange(dateStr)} style={{
              padding: "5px 0", textAlign: "center", fontSize: 12, cursor: "pointer",
              border: "none", borderRadius: 7,
              background: isSelected ? "var(--primary)" : isToday ? "rgba(59,130,246,0.1)" : "transparent",
              color: isSelected ? "#fff" : isToday ? "var(--primary)" : isWeekend ? "#ef4444" : "var(--text)",
              fontWeight: (isToday || isSelected) ? 700 : 400, transition: "background 0.1s",
            }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "var(--hover)"; }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isToday ? "rgba(59,130,246,0.1)" : "transparent"; }}
            >{day}</button>
          );
        })}
      </div>
      <button onClick={goToday} style={{ marginTop: 10, width: "100%", padding: "7px 0", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "transparent", color: "var(--muted)", fontSize: 12, fontWeight: 500, cursor: "pointer", transition: "all 0.15s" }}
        onMouseEnter={e => { e.currentTarget.style.background = "var(--hover)"; e.currentTarget.style.color = "var(--text)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--muted)"; }}
      >Сегодня</button>
    </div>
  );
}

// ── Appointment Detail Modal ───────────────────────────────────────────────────
function ApptDetailModal({ appt, doctors, role, onClose, onStatusChanged, onOpenAi }) {
  const st       = STATUS_STYLE[appt.status] || STATUS_STYLE.scheduled;
  const doctor   = doctors.find(d => d.id === appt.doctorId);
  const next     = STATUS_TRANSITIONS[appt.status] || [];
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState("");

  async function changeStatus(newStatus) {
    setSaving(true); setErr("");
    try {
      await updateAppointmentStatus(appt.id, newStatus);
      onStatusChanged();
      onClose();
    } catch (e) { setErr(e?.message || "Ошибка"); }
    finally { setSaving(false); }
  }

  const STATUS_BTN = {
    arrived:   { label: "Пришёл",   style: { background: "#f59e0b", color: "#fff", border: "none" } },
    completed: { label: "Завершить", style: { background: "#22c55e", color: "#fff", border: "none" } },
    cancelled: { label: "Отменить",  style: { background: "#ef4444", color: "#fff", border: "none" } },
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.4)", backdropFilter: "blur(3px)" }} />
      <div style={{ position: "relative", width: "min(420px,94vw)", background: "var(--surface)", borderRadius: "5px", boxShadow: "0 4px 4px rgba(15,23,42,0.18)", overflow: "hidden" }}>
        {/* Colored top stripe */}
        <div style={{ height: 4, background: st.stripe }} />
        <div style={{ padding: 24 }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "var(--text)" }}>{appt.patientName}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{appt.time} · {appt.duration} мин · {doctor?.name?.split(" ").slice(0,2).join(" ")}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6, background: st.bg, color: st.color, border: `1px solid ${st.border}`, letterSpacing: 0.5 }}>
                {st.label}
              </span>
              <button onClick={onClose} style={{ width: 28, height: 28, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-2)", cursor: "pointer", fontSize: 16, color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>
          </div>

          {/* Info grid */}
          <div style={{ display: "grid", gap: 8, fontSize: 13, marginBottom: 20, background: "var(--surface-2)", borderRadius: "var(--radius-sm)", padding: "12px 14px" }}>
            {[
              { label: "Специализация", value: doctor?.specialty || "—" },
              { label: "Дата",          value: appt.date },
              { label: "Время",         value: appt.time },
              { label: "Длительность",  value: `${appt.duration} мин` },
            ].map(r => (
              <div key={r.label} style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>{r.label}</span>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>{r.value}</span>
              </div>
            ))}
          </div>

          {err && <div style={{ fontSize: 12, color: "var(--danger)", padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "var(--radius-sm)", marginBottom: 12 }}>{err}</div>}

          {/* Action buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* AI button — doctor/assistant/owner */}
            {["doctor","assistant","owner"].includes(role) && (
              <button onClick={() => { onOpenAi(appt.patientId); onClose(); }} style={{ ...btnPrimary, width: "100%", padding: "11px 0", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Bot size={16} /> Открыть Core AI Layer
              </button>
            )}

            {/* Status change buttons */}
            {next.length > 0 && (
              <div style={{ display: "flex", gap: 8 }}>
                {next.map(ns => {
                  const b = STATUS_BTN[ns];
                  return (
                    <button key={ns} disabled={saving} onClick={() => changeStatus(ns)} style={{ flex: 1, padding: "10px 0", borderRadius: "var(--radius-sm)", fontSize: 13, fontWeight: 600, cursor: "pointer", ...b.style }}>
                      {saving ? "..." : b.label}
                    </button>
                  );
                })}
              </div>
            )}

            <button onClick={onClose} style={{ ...btnOutline, width: "100%", padding: "9px 0" }}>Закрыть</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── New Appointment Modal ──────────────────────────────────────────────────────
function ApptModal({ doctors, patients, date, onClose, onSaved }) {
  const [form, setForm] = useState({ doctorId: "", patientId: "", date, time: "09:00", duration: "30" });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState("");

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true); setErr("");
    try {
      await createAppointment({ ...form, duration: Number(form.duration) });
      onSaved(form.date); onClose();
    } catch (e) { setErr(e?.message || "Ошибка"); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.4)", backdropFilter: "blur(3px)" }} />
      <div style={{ position: "relative", width: "min(440px,94vw)", background: "var(--surface)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,23,42,0.18)", padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Новая запись</div>
          <button onClick={onClose} style={{ width: 30, height: 30, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-2)", cursor: "pointer", fontSize: 18, color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 13 }}>
          {[
            { label: "Врач *",       el: <select value={form.doctorId}  onChange={e => setForm(f=>({...f,doctorId:e.target.value}))}  style={inputStyle} required><option value="">— Выберите врача —</option>{doctors.map(d=><option key={d.id} value={d.id}>{d.name.split(" ").slice(0,2).join(" ")} ({d.specialty})</option>)}</select> },
            { label: "Пациент *",    el: <select value={form.patientId} onChange={e => setForm(f=>({...f,patientId:e.target.value}))} style={inputStyle} required><option value="">— Выберите пациента —</option>{patients.map(p=><option key={p.id} value={p.id}>{p.name} — {p.phone}</option>)}</select> },
            { label: "Дата *",       el: <input type="date" value={form.date}     onChange={e=>setForm(f=>({...f,date:e.target.value}))}     style={inputStyle} required /> },
            { label: "Время *",      el: <input type="time" value={form.time}     onChange={e=>setForm(f=>({...f,time:e.target.value}))}     style={inputStyle} required /> },
            { label: "Длительность", el: <select value={form.duration}  onChange={e=>setForm(f=>({...f,duration:e.target.value}))}  style={inputStyle}><option value="15">15 мин</option><option value="30">30 мин</option><option value="45">45 мин</option><option value="60">60 мин</option><option value="90">90 мин</option></select> },
          ].map(({ label, el }) => (
            <div key={label} style={{ display: "grid", gap: 5 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
              {el}
            </div>
          ))}
          {err && <div style={{ fontSize: 12, color: "var(--danger)", padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "var(--radius-sm)" }}>{err}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ ...btnOutline, flex: 1 }}>Отмена</button>
            <button type="submit" disabled={saving} style={{ ...btnPrimary, flex: 1 }}>{saving ? "Создаём..." : "Создать запись"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Calendar Grid ──────────────────────────────────────────────────────────────
function CalendarGrid({ doctors, appointments, onApptClick }) {
  const totalH  = TIME_SLOTS.length * SLOT_H;
  const colMinW = doctors.length === 1 ? 216 : 162;
  const HEADER_H = 52;
  const TIME_W   = 64;

  if (!doctors.length) {
    return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 14, gap: 6 }}><Stethoscope size={18} /> Врачей не найдено</div>;
  }

  return (
    <div style={{ flex: 1, overflow: "auto", background: "var(--surface)", borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "inline-flex", flexDirection: "column", minWidth: "100%" }}>

        {/* Sticky header */}
        <div style={{ display: "flex", position: "sticky", top: 0, zIndex: 30, background: "var(--surface)", borderBottom: "2px solid var(--border)", flexShrink: 0 }}>
          <div style={{ width: TIME_W, height: HEADER_H, flexShrink: 0, position: "sticky", left: 0, zIndex: 31, background: "var(--surface)", borderRight: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.8, textTransform: "uppercase" }}>Время</span>
          </div>
          {doctors.map((d, idx) => (
            <div key={d.id} style={{ minWidth: colMinW, flex: 1, height: HEADER_H, padding: "0 14px", borderRight: idx < doctors.length-1 ? "1px solid var(--border)" : "none", display: "flex", flexDirection: "column", justifyContent: "center", background: "var(--surface)" }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name.split(" ").slice(0,2).join(" ")}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{d.specialty}</div>
            </div>
          ))}
        </div>

        {/* Body */}
        <div style={{ display: "flex", position: "relative", height: totalH, flexShrink: 0 }}>
          {/* Time column */}
          <div style={{ width: TIME_W, flexShrink: 0, position: "sticky", left: 0, zIndex: 20, background: "var(--surface)", borderRight: "1px solid var(--border)" }}>
            {TIME_SLOTS.map((t, i) => (
              <div key={t} style={{ position: "absolute", top: i*SLOT_H, left: 0, right: 0, height: SLOT_H, borderBottom: `1px solid ${i%2===0?"var(--border)":"rgba(0,0,0,0.04)"}`, display: "flex", alignItems: "flex-start", paddingTop: 5, paddingLeft: 10 }}>
                <span style={{ fontSize: i%2===0?11:10, color: i%2===0?"var(--muted)":"rgba(100,116,139,0.5)", fontWeight: i%2===0?600:400 }}>{t}</span>
              </div>
            ))}
          </div>

          {/* Doctor columns */}
          {doctors.map((d, idx) => {
            const appts = appointments.filter(a => a.doctorId === d.id);
            return (
              <div key={d.id} style={{ minWidth: colMinW, flex: 1, position: "relative", borderRight: idx < doctors.length-1 ? "1px solid var(--border)" : "none" }}>
                {TIME_SLOTS.map((_, i) => (
                  <div key={i} style={{ position: "absolute", top: i*SLOT_H, left: 0, right: 0, height: SLOT_H, borderBottom: `1px solid ${i%2===0?"var(--border)":"rgba(0,0,0,0.03)"}`, background: i%2===0?"transparent":"rgba(248,250,252,0.6)" }} />
                ))}
                {appts.map(a => {
                  const st     = STATUS_STYLE[a.status] || STATUS_STYLE.scheduled;
                  const top    = timeToY(a.time);
                  const height = Math.max(durationToH(a.duration || 30), 36);
                  return (
                    <div key={a.id} onClick={() => onApptClick(a)} style={{
                      position: "absolute", left: 0, right: 0, top, height,
                      background: st.bg, border: `1px solid ${st.border}`,
                      borderLeft: `4px solid ${st.stripe}`,
                      borderRadius: 0, padding: "5px 8px",
                      overflow: "hidden", cursor: "pointer", zIndex: 5,
                      boxSizing: "border-box", transition: "box-shadow 0.15s, transform 0.12s",
                    }}
                      onMouseEnter={e => { e.currentTarget.style.boxShadow="0 4px 14px rgba(0,0,0,0.13)"; e.currentTarget.style.transform="translateY(-1px)"; }}
                      onMouseLeave={e => { e.currentTarget.style.boxShadow="none"; e.currentTarget.style.transform="translateY(0)"; }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 700, color: st.stripe, lineHeight: 1.2 }}>{a.time}</div>
                      <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{a.patientName}</div>
                      {height >= 46 && <div style={{ fontSize: 10, color: st.color, fontWeight: 700, letterSpacing: 0.6, opacity: 0.85, marginTop: 2 }}>{st.label}</div>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Calendar Tab ───────────────────────────────────────────────────────────────
function CalendarTab({ doctors, patients, role }) {
  const router = useRouter();
  const [date, setDate]          = useState(TODAY);
  const [doctorId, setDoctorId]  = useState("");
  const [appointments, setAppts] = useState([]);
  const [loading, setLoading]    = useState(false);
  const [newModal, setNewModal]  = useState(false);
  const [detailAppt, setDetail]  = useState(null);

  const [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => setRefresh(r => r + 1), []);

  useEffect(() => {
    if (!doctors.length) return;
    let cancelled = false;
    const toShow = doctorId ? doctors.filter(x => x.id === doctorId) : doctors;
    Promise.all(toShow.map(doc => getSchedule(doc.id, date)))
      .then(arrays => {
        if (!cancelled) {
          setLoading(false);
          setAppts(arrays.flat().map(a => ({ ...a, duration: a.duration || 30 })));
        }
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [date, doctorId, doctors, refresh]);

  const visibleDoctors = doctorId ? doctors.filter(d => d.id === doctorId) : doctors;
  const apptCount      = appointments.length;

  function handleApptClick(appt) {
    setDetail(appt);
  }

  function handleOpenAi(patientId) {
    router.push(`/ai?patient=${patientId}`);
  }

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      {/* Left panel */}
      <div style={{ width: 290, flexShrink: 0, borderRight: "1px solid var(--border)", background: "var(--surface)", display: "flex", flexDirection: "column", overflowY: "hidden" }}>
        <div style={{ padding: "16px 16px 14px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 7 }}>Врач</div>
          <select value={doctorId} onChange={e => setDoctorId(e.target.value)} style={{ ...inputStyle, borderRadius: 0 }}>
            <option value="">Все врачи</option>
            {doctors.map(d => <option key={d.id} value={d.id}>{d.name.split(" ").slice(0,2).join(" ")}</option>)}
          </select>
        </div>
        <div style={{ height: 1, background: "var(--border)" }} />
        <div style={{ padding: "14px 16px" }}>
          <MiniCalendar value={date} onChange={setDate} />
        </div>
        <div style={{ height: 1, background: "var(--border)" }} />
        {!["doctor","assistant"].includes(role) && (
          <div style={{ padding: "14px 16px" }}>
            <button onClick={() => setNewModal(true)} style={{ ...btnPrimary, width: "100%", padding: "11px 0", fontSize: 14 }}
              onMouseEnter={e => { e.currentTarget.style.opacity="0.88"; }}
              onMouseLeave={e => { e.currentTarget.style.opacity="1"; }}
            >+ Новая запись</button>
          </div>
        )}
        <div style={{ height: 1, background: "var(--border)" }} />
        <div style={{ padding: "14px 16px", flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 10 }}>Статусы</div>
          <div style={{ display: "grid", gap: 8 }}>
            {Object.entries(STATUS_STYLE).map(([, s]) => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, background: s.bg, border: `1px solid ${s.border}`, borderLeft: `4px solid ${s.stripe}` }} />
                <span style={{ fontSize: 12, color: "var(--text)", fontWeight: 500 }}>{s.label}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, padding: "9px 12px", background: "#fafbfc", border: "1px solid var(--border)", borderRadius: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{loading ? "Загрузка..." : "Записей на день"}</span>
            {!loading && <span style={{ fontSize: 13, fontWeight: 800, color: "#000" }}>{apptCount}</span>}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <CalendarGrid doctors={visibleDoctors} appointments={appointments} onApptClick={handleApptClick} />
      </div>

      {newModal && (
        <ApptModal doctors={doctors} patients={patients} date={date}
          onClose={() => setNewModal(false)}
          onSaved={d => { setDate(d); load(d, doctorId); setNewModal(false); }}
        />
      )}

      {detailAppt && (
        <ApptDetailModal
          appt={detailAppt} doctors={doctors} role={role}
          onClose={() => setDetail(null)}
          onStatusChanged={() => load(date, doctorId)}
          onOpenAi={handleOpenAi}
        />
      )}
    </div>
  );
}

// ── CRM Tab ────────────────────────────────────────────────────────────────────
const MOCK_MSGS  = ["Здравствуйте! Можно записаться на завтра к хирургу?","Сколько стоит имплант?","Спасибо, буду вовремя.","Когда можно к ортодонту?","Напомните время приёма","Добрый день!","Можно перенести на пятницу?","Спасибо за приём!"];
const MOCK_TIMES = ["10:42","Вчера","Вчера","Пн","Сб","Пт","Чт","Ср"];
const CHANNELS   = ["WhatsApp","WhatsApp","Instagram","WhatsApp","WhatsApp","Instagram","WhatsApp","WhatsApp"];
const CH_COLOR   = {
  WhatsApp:  { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
  Instagram: { bg: "#fdf2f8", color: "#9d174d", border: "#f9a8d4" },
};

function CrmTab({ patients }) {
  const [selected, setSelected]         = useState(null);
  const [patientInfo, setPatientInfo]   = useState(null);
  const [patientVisits, setPatientVisits] = useState([]);
  const [loadingCard, setLoadingCard]   = useState(false);
  const [msg, setMsg]                   = useState("");
  const [chatMsgs, setChatMsgs]         = useState([
    { type: "in",  text: "Здравствуйте! Можно записаться на завтра к хирургу?", time: "10:42" },
    { type: "out", text: "Добрый день! Да, конечно. У доктора Омарова есть окошко на 14:30. Записать вас?", time: "10:45" },
  ]);
  const [search, setSearch]             = useState("");
  const messagesEnd                     = useRef(null);

  const chatPatients = patients.slice(0, 8);
  const filtered = chatPatients.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.phone.includes(search)
  );

  async function selectPatient(p) {
    setSelected(p);
    setChatMsgs([{ type: "in", text: "Здравствуйте! Подскажите, пожалуйста...", time: "10:42" }]);
    setPatientInfo(null); setPatientVisits([]); setLoadingCard(true);
    try {
      const [info, visits] = await Promise.all([getPatientById(p.id), getVisitsByPatient(p.id)]);
      setPatientInfo(info);
      setPatientVisits(visits);
    } catch (_) {}
    finally { setLoadingCard(false); }
  }

  function sendMsg() {
    const text = msg.trim();
    if (!text || !selected) return;
    const time = new Date().toTimeString().slice(0, 5);
    setChatMsgs(m => [...m, { type: "out", text, time }]);
    setMsg("");
    const num = (selected.phone || "").replace(/\D/g, "").replace(/^8/, "7");
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, "_blank");
    setTimeout(() => messagesEnd.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  const lastVisit = patientVisits[0];
  const age = patientInfo?.birthDate
    ? Math.floor((NOW_MS - new Date(patientInfo.birthDate).getTime()) / (365.25*24*3600*1000))
    : null;

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      {/* Patient list */}
      <div style={{ width: 280, flexShrink: 0, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--surface)" }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
          <input type="text" placeholder="Поиск пациента..." value={search} onChange={e => setSearch(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.map((p, i) => {
            const ch       = CHANNELS[i] || "WhatsApp";
            const cc       = CH_COLOR[ch] || CH_COLOR.WhatsApp;
            const isActive = selected?.id === p.id;
            return (
              <div key={p.id} onClick={() => selectPatient(p)} style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)", cursor: "pointer", background: isActive ? "rgba(59,130,246,0.06)" : "transparent", borderLeft: isActive ? "3px solid var(--primary)" : "3px solid transparent", transition: "background 0.1s" }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background="var(--hover)"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background="transparent"; }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0, background: "rgba(59,130,246,0.12)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800 }}>
                    {p.name?.[0] || "?"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 4 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: "var(--muted)", flexShrink: 0 }}>{MOCK_TIMES[i] || ""}</div>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>{MOCK_MSGS[i] || ""}</div>
                    <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, marginTop: 3, display: "inline-block", background: cc.bg, color: cc.color, border: `1px solid ${cc.border}`, fontWeight: 600 }}>{ch}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chat */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#f6f8fc", minWidth: 0 }}>
        <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{selected?.name || "Выберите чат"}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{selected?.phone || "Нажмите на диалог слева"}</div>
          </div>
          {selected && (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { const n=(selected.phone||"").replace(/\D/g,"").replace(/^8/,"7"); window.location.href=`tel:+${n}`; }} style={{ ...btnOutline, fontSize: 12, padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: 4 }}><Phone size={13} /> Позвонить</button>
              <button style={{ ...btnOutline, fontSize: 12, padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: 4 }}><CalendarDays size={13} /> Записать</button>
            </div>
          )}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px", display: "flex", flexDirection: "column", gap: 10 }}>
          {!selected ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--muted)" }}>
              <div style={{ fontSize: 40, display: "flex" }}><MessageCircle size={40} /></div>
              <div style={{ fontSize: 14 }}>Выберите диалог слева</div>
            </div>
          ) : chatMsgs.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.type==="out"?"flex-end":"flex-start" }}>
              <div style={{ maxWidth: "68%", padding: "10px 14px", borderRadius: m.type==="out"?"16px 16px 4px 16px":"16px 16px 16px 4px", background: m.type==="out"?"var(--primary)":"var(--surface)", color: m.type==="out"?"#fff":"var(--text)", fontSize: 13, lineHeight: 1.45, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
                <div>{m.text}</div>
                <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4, textAlign: "right" }}>{m.time}{m.type==="out"?" ✓✓":""}</div>
              </div>
            </div>
          ))}
          <div ref={messagesEnd} />
        </div>
        {selected && (
          <div style={{ borderTop: "1px solid var(--border)", background: "var(--surface)", padding: "10px 16px", flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 9 }}>
              {[
                { label: <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Sparkles size={11} /> AI-Ответ</span>,    text: "Добрый день! Да, конечно. У доктора есть окошко на 14:30. Записать вас?", primary: true },
                { label: <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><ClipboardList size={11} /> Прайс</span>,       text: "Добрый день! Актуальный прайс на услуги клиники прикреплён.", primary: false },
                { label: <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Bell size={11} /> Напоминание</span>, text: "Напоминаем о вашем приёме завтра. Ждём вас!", primary: false },
              ].map(b => (
                <button key={b.label} onClick={() => setMsg(b.text)} style={{ fontSize: 11, padding: "5px 11px", borderRadius: 7, cursor: "pointer", fontWeight: 600, border: b.primary?"1px solid var(--primary)":"1px solid var(--border)", background: b.primary?"rgba(59,130,246,0.09)":"var(--surface-2)", color: b.primary?"var(--primary)":"var(--muted)" }}>{b.label}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="text" value={msg} onChange={e => setMsg(e.target.value)}
                onKeyDown={e => { if (e.key==="Enter"&&!e.shiftKey) { e.preventDefault(); sendMsg(); } }}
                placeholder="Введите сообщение..." style={{ ...inputStyle, flex: 1 }} />
              <button onClick={sendMsg} style={{ ...btnPrimary, padding: "0 20px" }}>Отправить</button>
            </div>
          </div>
        )}
      </div>

      {/* Patient card — dynamic */}
      <div style={{ width: 240, flexShrink: 0, borderLeft: "1px solid var(--border)", background: "var(--surface)", display: "flex", flexDirection: "column" }}>
        {!selected ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--muted)", padding: 24, textAlign: "center", gap: 10 }}>
            <div style={{ fontSize: 40, display: "flex" }}><UserRound size={40} /></div>
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>Выберите пациента, чтобы увидеть карточку</div>
          </div>
        ) : loadingCard ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 12 }}>Загрузка...</div>
        ) : (
          <div style={{ padding: 20 }}>
            {/* Avatar */}
            <div style={{ textAlign: "center", paddingBottom: 16, marginBottom: 16, borderBottom: "1px solid var(--border)" }}>
              <div style={{ width: 62, height: 62, borderRadius: "50%", margin: "0 auto 10px", background: "rgba(59,130,246,0.12)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 800, border: "2px solid rgba(59,130,246,0.3)" }}>
                {selected.name?.[0] || "?"}
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{selected.name}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{selected.phone}</div>
              {age && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{age} лет</div>}
            </div>

            {/* Info */}
            <div style={{ display: "grid", gap: 9, fontSize: 12, marginBottom: 16 }}>
              {[
                { label: "Канал",           value: CHANNELS[patients.findIndex(p=>p.id===selected.id)] || "WhatsApp", color: "#15803d" },
                { label: "Последний визит", value: lastVisit ? lastVisit.date : "—" },
                { label: "Всего визитов",   value: patientVisits.length > 0 ? `${patientVisits.length} визит(а)` : "—" },
                { label: "Диагноз",         value: lastVisit?.diagnosis || "—" },
              ].map(r => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ color: "var(--muted)", flexShrink: 0 }}>{r.label}</span>
                  <span style={{ fontWeight: 600, color: r.color || "var(--text)", textAlign: "right", fontSize: 11 }}>{r.value}</span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div style={{ display: "grid", gap: 8 }}>
              {[
                { label: <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Phone size={13} /> Позвонить</span>,        fn: () => { const n=(selected.phone||"").replace(/\D/g,"").replace(/^8/,"7"); window.location.href=`tel:+${n}`; } },
                { label: <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><CalendarDays size={13} /> Записать на приём</span>, fn: () => {} },
                { label: <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><ClipboardList size={13} /> Карточка пациента</span>, fn: () => {} },
              ].map(b => (
                <button key={b.label} onClick={b.fn} style={{ ...btnOutline, width: "100%", fontSize: 12, padding: "8px 0" }}>{b.label}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function SchedulePage() {
  const { user } = useAuth();
  const [tab, setTab]         = useState("calendar");
  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);

  useEffect(() => {
    Promise.all([getDoctors(), searchPatients("")]).then(([d, p]) => { setDoctors(d); setPatients(p); });
  }, []);

  const TABS = [
    { id: "calendar", label: <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><CalendarDays size={15} /> Умный календарь</span> },
    { id: "crm",      label: <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><MessageCircle size={15} /> WhatsApp & Звонки</span>, badge: 3 },
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--surface)", padding: "0 20px", flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "13px 18px", border: "none", background: "transparent", borderBottom: tab===t.id?"2px solid var(--primary)":"2px solid transparent", color: tab===t.id?"var(--primary)":"var(--muted)", fontWeight: tab===t.id?700:400, fontSize: 14, cursor: "pointer", marginBottom: -1, display: "flex", alignItems: "center", gap: 7, transition: "color 0.15s" }}>
            {t.label}
            {t.badge && <span style={{ background: "#ef4444", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>{t.badge}</span>}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {tab === "calendar" && <CalendarTab doctors={doctors} patients={patients} role={user?.role} />}
        {tab === "crm"      && <CrmTab patients={patients} />}
      </div>
    </div>
  );
}
