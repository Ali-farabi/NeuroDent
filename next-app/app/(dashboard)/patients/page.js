"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { searchPatients, getPatientById, createPatient, updatePatient, getPatientVisits, getPatientPayments } from "@/lib/api";
import { Bot, HeartPulse, CalendarDays, HandMetal, Sparkles, FileDown, AlertTriangle, UserRound } from "lucide-react";

// ── Date formatter ────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const inputStyle = {
  width: "100%", padding: "8px 12px",
  border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
  background: "var(--surface)", color: "var(--text)", fontSize: 13, boxSizing: "border-box",
};

const btnPrimary = {
  padding: "9px 18px", background: "var(--primary)", color: "#fff",
  border: "none", borderRadius: "var(--radius-sm)",
  fontWeight: 600, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
};

const btnOutline = {
  padding: "7px 14px", background: "var(--surface)", color: "var(--text)",
  border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
  fontWeight: 500, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
  display: "inline-flex", alignItems: "center", gap: 5,
};

function Field({ label, children }) {
  return (
    <div style={{ display: "grid", gap: 5 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>{label}</div>
      {children}
    </div>
  );
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.35)" }} />
      <div style={{
        position: "relative", width: wide ? "min(680px, 96vw)" : "min(480px, 96vw)",
        background: "var(--surface)", borderRadius: "var(--radius)",
        boxShadow: "var(--shadow-lg)", maxHeight: "90vh", display: "flex", flexDirection: "column",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0,
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{title}</div>
          <button onClick={onClose} style={{
            width: 30, height: 30, border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", background: "var(--surface-2)",
            cursor: "pointer", fontSize: 18, color: "var(--muted)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>×</button>
        </div>
        <div style={{ padding: 20, overflowY: "auto" }}>{children}</div>
      </div>
    </div>
  );
}

// ── Patient form (create / edit) ──────────────────────────────────────────────
function PatientForm({ mode, patient, onSave, onCancel }) {
  const [form, setForm] = useState({
    name:      patient?.name      || "",
    phone:     patient?.phone     || "",
    email:     patient?.email     || "",
    address:   patient?.address   || "",
    birthDate: patient?.birthDate || "",
    allergies: patient?.allergies || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError(""); setSaving(true);
    try { await onSave(form); }
    catch (err) { setError(err?.message || "Ошибка сохранения"); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
      <Field label="Имя *">
        <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          style={inputStyle} required minLength={2} />
      </Field>
      <Field label="Телефон *">
        <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
          placeholder="8700..." style={inputStyle} required />
      </Field>
      <Field label="Email">
        <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          placeholder="example@mail.com" style={inputStyle} />
      </Field>
      <Field label="Адрес">
        <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
          placeholder="Город, улица, дом" style={inputStyle} />
      </Field>
      <Field label="Дата рождения">
        <input type="date" value={form.birthDate} onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))}
          max={new Date().toISOString().split("T")[0]} style={inputStyle} />
      </Field>
      <Field label="Аллергии (анестезия, медикаменты)">
        <input value={form.allergies} onChange={e => setForm(f => ({ ...f, allergies: e.target.value }))}
          placeholder="Напр: Лидокаин, Пенициллин" style={inputStyle} />
      </Field>

      {error && (
        <div style={{
          fontSize: 12, padding: "8px 12px", borderRadius: "var(--radius-sm)",
          background: "#fef2f2", color: "var(--danger)", border: "1px solid #fecaca",
        }}>{error}</div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
        <button type="button" onClick={onCancel} style={btnOutline}>Отмена</button>
        <button type="submit" disabled={saving} style={btnPrimary}>
          {saving ? "Сохранение..." : mode === "edit" ? "Сохранить" : "Создать"}
        </button>
      </div>
    </form>
  );
}

// ── Patient card with 3 tabs ──────────────────────────────────────────────────
function PatientCard({ patient }) {
  const { user } = useAuth();
  const isDoctor = user?.role === "doctor" || user?.role === "assistant";
  const [tab, setTab] = useState("info");
  const [visits, setVisits] = useState(null);

  useEffect(() => {
    getPatientVisits(patient.id).then(setVisits); // eslint-disable-line react-hooks/set-state-in-effect
  }, [patient.id]);

  const TABS = [
    { key: "info",      label: "Информация" },
    { key: "treatment", label: "Лечение" },
    { key: "visits",    label: "Визиты" },
  ];

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "10px 20px", border: "none", background: "transparent",
            borderBottom: tab === t.key ? "2px solid var(--primary)" : "2px solid transparent",
            color: tab === t.key ? "var(--primary)" : "var(--muted)",
            fontWeight: tab === t.key ? 600 : 400,
            fontSize: 13, cursor: "pointer", marginBottom: -1, transition: "color 0.15s",
          }}>{t.label}</button>
        ))}
      </div>

      {/* Info tab */}
      {tab === "info" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px 32px" }}>
          {[
            { icon: "phone", label: "Телефон", value: patient.phone },
            { icon: "mail",  label: "Email",   value: patient.email || "—" },
            { icon: "cal",   label: "Дата рождения", value: patient.birthDate || "—" },
            { icon: "pin",   label: "Адрес",   value: patient.address || "—" },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4, fontWeight: 500 }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>{value}</div>
            </div>
          ))}

          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4, fontWeight: 500 }}>Аллергии</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: patient.allergies ? "var(--danger)" : "var(--text)" }}>
              {patient.allergies || "Не указано"}
            </div>
          </div>
          {!isDoctor && (
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4, fontWeight: 500 }}>Бонусные баллы</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--primary)" }}>{patient.bonusPoints ?? 0}</div>
            </div>
          )}
        </div>
      )}

      {/* Treatment tab */}
      {tab === "treatment" && (
        <div style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {visits === null ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)", fontSize: 13 }}>Загрузка...</div>
          ) : visits.filter(v => v.visitId).length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)" }}>
              <div style={{ fontSize: 32, marginBottom: 8, display: "flex", justifyContent: "center" }}><HeartPulse size={32} /></div>
              <div style={{ fontSize: 13 }}>История лечения пуста</div>
            </div>
          ) : visits.filter(v => v.visitId).map((v, i) => (
            <div key={i} style={{
              background: "var(--surface-2)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)", padding: 14,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {v.diagnosis || "Лечение"}
                  {v.toothNumber && <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 400, marginLeft: 6 }}>зуб #{v.toothNumber}</span>}
                </div>
                {v.diagnosisCode && <span style={{ fontSize: 11, color: "var(--muted)", background: "var(--surface)", border: "1px solid var(--border)", padding: "2px 7px", borderRadius: 4 }}>{v.diagnosisCode}</span>}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{v.doctorName}{v.specialty ? ` · ${v.specialty}` : ""} · {fmtDate(v.date)}</div>
              {!isDoctor && v.cost && <div style={{ fontWeight: 600, fontSize: 13, marginTop: 6 }}>{Number(v.cost).toLocaleString("ru-RU")} ₸</div>}
              {v.notes && (
                <div style={{
                  marginTop: 8, background: "var(--active)", borderLeft: "2px solid var(--primary)",
                  borderRadius: "var(--radius-xs)", padding: "10px 12px", fontSize: 12, color: "var(--text)",
                }}>
                  <div style={{ color: "var(--primary)", fontWeight: 600, marginBottom: 4, fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}><Bot size={12} /> AI Резюме</div>
                  {v.notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Visits tab */}
      {tab === "visits" && (
        <div style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 0 }}>
          {visits === null ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)", fontSize: 13 }}>Загрузка...</div>
          ) : visits.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)" }}>
              <div style={{ fontSize: 32, marginBottom: 8, display: "flex", justifyContent: "center" }}><CalendarDays size={32} /></div>
              <div style={{ fontSize: 13 }}>Нет визитов</div>
            </div>
          ) : visits.map((v, i) => {
            const done    = v.statusRaw === "completed";
            const cancelled = v.statusRaw === "cancelled";
            const badgeBg  = done ? "#f0fdf4" : cancelled ? "#fef2f2" : "var(--active)";
            const badgeClr = done ? "var(--success)" : cancelled ? "var(--danger)" : "var(--primary)";
            const badgeBdr = done ? "#bbf7d0" : cancelled ? "#fecaca" : "#bfdbfe";
            return (
              <div key={i} style={{ padding: "12px 0", borderTop: i > 0 ? "1px solid var(--border)" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{fmtDate(v.date)}</span>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>{v.time}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{v.doctorName}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{v.specialty}</div>
                  </div>
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, fontWeight: 500, background: badgeBg, color: badgeClr, border: `1px solid ${badgeBdr}`, flexShrink: 0 }}>
                    {v.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Patient personal cabinet (role = patient) ─────────────────────────────────
function PatientCabinet() {
  const { user } = useAuth();
  const [patientData, setPatientData] = useState(null);
  const [patientVisits, setPatientVisits] = useState([]);
  const [downloading, setDownloading] = useState(null);

  useEffect(() => {
    if (!user?.phone) return;
    searchPatients(user.phone).then((list) => { // eslint-disable-line react-hooks/set-state-in-effect
      const p = list[0];
      if (!p) return;
      setPatientData(p); // eslint-disable-line react-hooks/set-state-in-effect
      getPatientVisits(p.id).then(setPatientVisits); // eslint-disable-line react-hooks/set-state-in-effect
    });
  }, [user?.phone]);

  const completedVisits = patientVisits.filter(v => v.visitId);

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Welcome */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 6px 0", color: "var(--text)" }}>
            Добро пожаловать, {user?.name || "Пациент"}! <HandMetal size={24} style={{ display: "inline", verticalAlign: "middle" }} />
          </h1>
          <p style={{ color: "var(--muted)", margin: 0, fontSize: 14 }}>Ваша личная медицинская карта и история лечения</p>
        </div>
        <div style={{
          background: "var(--surface)", padding: "12px 20px", borderRadius: "var(--radius)",
          border: "1px solid var(--primary-100)", display: "flex", alignItems: "center",
          gap: 12, boxShadow: "var(--shadow-sm)",
        }}>
          <div style={{ background: "#dcfce7", padding: 8, borderRadius: "50%", color: "var(--success)", display: "flex" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase" }}>Ваши баллы</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)" }}>{patientData?.bonusPoints ?? user?.bonusPoints ?? 0}</div>
          </div>
        </div>
      </div>

      {/* Allergy warning */}
      {(patientData?.allergies || user?.allergies) && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "var(--radius-sm)", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <AlertTriangle size={16} style={{ color: "var(--danger)", flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: "var(--danger)", fontWeight: 500 }}>
            Аллергия: {patientData?.allergies || user?.allergies}
          </span>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
        {/* 3D Model */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Ваша 3D-модель челюсти</div>
            <span style={{ background: "var(--active)", color: "var(--primary)", fontSize: 11, padding: "2px 8px", borderRadius: 6, fontWeight: 500 }}>Демо</span>
          </div>
          <div style={{ background: "#111", height: 180, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
            <div style={{ position: "absolute", bottom: 10, color: "rgba(255,255,255,0.5)", fontSize: 11 }}>Крутите для просмотра (Демо)</div>
          </div>
          <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[["Фото ДО", <HeartPulse key="do" size={22} />], ["Фото ПОСЛЕ", <Sparkles key="posle" size={22} />]].map(([label, icon]) => (
              <div key={label}>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>{label}</div>
                <div style={{ height: 56, background: "var(--surface-2)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{icon}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Treatment history */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16, boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column" }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>История лечения</div>
          {completedVisits.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: "var(--muted)", fontSize: 13 }}>Нет завершённых визитов</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
              {completedVisits.slice(0, 3).map((v, i) => (
                <div key={i} style={{ borderLeft: `2px solid ${i === 0 ? "var(--primary)" : "var(--border)"}`, paddingLeft: 12, opacity: i === 0 ? 1 : 0.7 }}>
                  <div style={{ fontSize: 11, color: i === 0 ? "var(--primary)" : "var(--muted)", fontWeight: 600, marginBottom: 4 }}>
                    {fmtDate(v.date)}, {v.time}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                    {v.diagnosis || "Прием"}
                    {v.toothNumber && <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 12 }}> · Зуб #{v.toothNumber}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: i === 0 ? 8 : 0 }}>Врач: {v.doctorName}</div>
                  {i === 0 && (
                    <button
                      style={{ fontSize: 11, padding: "4px 10px", border: "1px solid var(--primary)", color: "var(--primary)", borderRadius: "var(--radius-xs)", background: "var(--active)", cursor: "pointer" }}
                      disabled={downloading === v.appointmentId}
                      onClick={() => { setDownloading(v.appointmentId); setTimeout(() => setDownloading(null), 2000); }}
                    >
                      {downloading === v.appointmentId
                        ? "Скачивание..."
                        : <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><FileDown size={13} /> Скачать AI-Протокол (eGov)</span>}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Patient list (owner / admin / doctor / assistant) ─────────────────────────
function PatientListInner() {
  const router  = useRouter();
  const { user } = useAuth();
  const searchParams = useSearchParams();

  const [patients, setPatients] = useState([]);
  const [search,   setSearch]   = useState("");
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [modal,    setModal]    = useState(null);
  const timerRef = useRef(null);

  function load(q) {
    setLoading(true); setError("");
    searchPatients(q)
      .then(setPatients)
      .catch(e => setError(e?.message || "Ошибка загрузки"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const q = searchParams.get("q") || "";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (q) setSearch(q);
    load(q);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => load(search), 250);
  }, [search]);

  const canCreate = ["owner", "admin"].includes(user?.role);
  const canAI     = ["owner", "doctor", "assistant"].includes(user?.role);

  async function handleSave(form) {
    if (modal.mode === "create") await createPatient(form);
    else await updatePatient(modal.patient.id, form);
    setModal(null);
    load(search);
  }

  async function openModal(mode, id) {
    try {
      const p = await getPatientById(id);
      setModal({ mode, patient: p });
    } catch (e) {
      setModal({ mode: "error", error: e?.message });
    }
  }

  return (
    <div style={{ padding: 0 }}>
      <style>{`
        .pat-actions { display: flex; align-items: center; gap: 6px; padding-right: 14px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
        .pat-btn-text { display: inline; }
        @media (max-width: 480px) {
          .pat-actions { gap: 4px; padding-right: 8px; }
          .pat-btn-text { display: none; }
          .pat-actions button { padding: 6px 8px !important; }
        }
        @media (max-width: 360px) {
          .pat-actions { flex-direction: column; align-items: flex-end; padding: 8px; }
        }
      `}</style>

      {/* Toolbar */}
      <div style={{
        display: "flex", gap: 10, alignItems: "center",
        background: "var(--surface)", border: "1px solid var(--border)",
        borderBottom: "none", padding: "12px 16px",
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по имени или телефону..."
          style={{ ...inputStyle, flex: 1 }}
        />
        {canCreate && (
          <button onClick={() => setModal({ mode: "create" })} style={btnPrimary}>
            + Создать
          </button>
        )}
      </div>

      {/* List */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", overflow: "hidden" }}>
        {loading && (
          <div style={{ padding: "48px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            Загрузка пациентов...
          </div>
        )}
        {error && (
          <div style={{ padding: "32px 0", textAlign: "center", color: "var(--danger)", fontSize: 13 }}>
            <AlertTriangle size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} /> {error}
          </div>
        )}
        {!loading && !error && patients.length === 0 && (
          <div style={{ padding: "48px 0", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8, display: "flex", justifyContent: "center" }}><UserRound size={32} /></div>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>Пациенты не найдены</div>
          </div>
        )}
        {!loading && patients.map((p, i) => (
          <div key={p.id} style={{
            display: "flex", alignItems: "center", gap: 0,
            borderBottom: i < patients.length - 1 ? "1px solid var(--border)" : "none",
            transition: "background 0.1s",
          }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--hover)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            {/* Blue indicator */}
            <div style={{ width: 3, alignSelf: "stretch", background: "var(--primary)", flexShrink: 0 }} />

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0, padding: "13px 16px" }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{p.name}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                {p.phone}{p.birthDate ? ` · ${fmtDate(p.birthDate)}` : ""}
              </div>
            </div>

            {/* Actions */}
            <div className="pat-actions">
              {canAI && (
                <button onClick={() => router.push(`/ai?patient=${p.id}`)} style={{ ...btnOutline, color: "var(--primary)", borderColor: "#bfdbfe", background: "var(--active)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
                  </svg>
                  <span className="pat-btn-text">AI-Прием</span>
                </button>
              )}
              <button onClick={() => openModal("view", p.id)} style={btnOutline}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
                <span className="pat-btn-text">Просмотр</span>
              </button>
              <button onClick={() => openModal("edit", p.id)} style={btnOutline}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                <span className="pat-btn-text">Изменить</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modals */}
      {modal?.mode === "create" && (
        <Modal title="Новый пациент" onClose={() => setModal(null)}>
          <PatientForm mode="create" patient={null} onSave={handleSave} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {modal?.mode === "edit" && (
        <Modal title="Редактирование пациента" onClose={() => setModal(null)}>
          <PatientForm mode="edit" patient={modal.patient} onSave={handleSave} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {modal?.mode === "view" && (
        <Modal title={`Карточка: ${modal.patient.name}`} onClose={() => setModal(null)} wide>
          <PatientCard patient={modal.patient} />
        </Modal>
      )}
      {modal?.mode === "error" && (
        <Modal title="Ошибка" onClose={() => setModal(null)}>
          <div style={{ color: "var(--danger)", textAlign: "center", padding: "16px 0", fontSize: 13 }}>{modal.error}</div>
        </Modal>
      )}
    </div>
  );
}

function PatientList() {
  return (
    <Suspense fallback={<div style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>Загрузка...</div>}>
      <PatientListInner />
    </Suspense>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function PatientsPage() {
  const { user } = useAuth();
  if (user?.role === "patient") return <PatientCabinet />;
  return <PatientList />;
}
