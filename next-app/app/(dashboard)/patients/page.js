"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import {
  searchPatients,
  getPatientById,
  createPatient,
  updatePatient,
  getPatientVisits,
  getFiles,
  uploadFile,
  deleteFile,
  getFileDownloadUrl,
  createPatientProtocolDocument,
} from "@/lib/api";
import { Bot, HeartPulse, CalendarDays, FileDown, AlertTriangle, UserRound, Upload, ScanLine } from "lucide-react";

// ── Date formatter ────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function firstFilled(...values) {
  return values.find((value) => typeof value === "string" && value.trim()) || "";
}

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
  const isDoctor = user?.role === "doctor";
  const [tab, setTab] = useState("info");
  const [visits, setVisits] = useState(null);
  const [files, setFiles] = useState([]);
  const [fileMessage, setFileMessage] = useState("");

  useEffect(() => {
    getPatientVisits(patient.id).then(setVisits);
    getFiles({ patientId: patient.id }).then(setFiles).catch(() => setFiles([]));
  }, [patient.id]);

  async function reloadFiles() {
    setFiles(await getFiles({ patientId: patient.id }));
  }

  async function handleFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileMessage("");
    try {
      const base64 = await readAsBase64(file);
      await uploadFile({ patientId: patient.id, fileName: file.name, mimeType: file.type || "application/octet-stream", base64 });
      event.target.value = "";
      await reloadFiles();
      setFileMessage("Файл загружен");
    } catch (error) {
      setFileMessage(error?.message || "Не удалось загрузить файл");
    }
  }

  async function handleCreateProtocolDocument() {
    setFileMessage("");
    try {
      await createPatientProtocolDocument(patient.id);
      await reloadFiles();
      setFileMessage("Документ протокола создан");
    } catch (error) {
      setFileMessage(error?.message || "Не удалось создать документ");
    }
  }

  async function handleDeleteFile(fileId) {
    await deleteFile(fileId);
    await reloadFiles();
  }

  const TABS = [
    { key: "info",      label: "Информация" },
    { key: "treatment", label: "Лечение" },
    { key: "visits",    label: "Визиты" },
    { key: "documents", label: "Документы" },
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

      {tab === "documents" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <label style={{ ...btnPrimary, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Upload size={14} /> Загрузить файл
              <input type="file" onChange={handleFileUpload} style={{ display: "none" }} />
            </label>
            <button type="button" onClick={handleCreateProtocolDocument} style={btnOutline}>
              Создать AI protocol document
            </button>
          </div>
          {fileMessage && <div style={{ fontSize: 12, color: "var(--muted)" }}>{fileMessage}</div>}
          <div style={{ display: "grid", gap: 8 }}>
            {files.map((file) => (
              <div key={file.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.fileName}</div>
                  <div style={{ color: "var(--muted)", fontSize: 11 }}>{file.mimeType} · {file.createdAt}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <a href={getFileDownloadUrl(file.id)} style={btnOutline}>Скачать</a>
                  {user?.role !== "patient" && <button type="button" onClick={() => handleDeleteFile(file.id)} style={btnOutline}>Удалить</button>}
                </div>
              </div>
            ))}
            {!files.length && <div style={{ color: "var(--muted)", fontSize: 13, padding: "24px 0", textAlign: "center" }}>Документов нет</div>}
          </div>
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
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const patientId = user?.patientId || user?.id;
    if (!patientId) return;
    let active = true;

    Promise.all([
      getPatientById(patientId),
      getPatientVisits(patientId),
    ])
      .then(([patient, visits]) => {
        if (!active) return;
        setLoadError("");
        setPatientData(patient);
        setPatientVisits((visits || []).map((visit) => {
          const date = visit.date || String(visit.startedAt || "").slice(0, 10);
          const time = visit.time || String(visit.startedAt || "").slice(11, 16);
          return { ...visit, date, time };
        }));
      })
      .catch((error) => {
        if (active) setLoadError(error?.message || "Не удалось загрузить портал пациента");
      });

    return () => { active = false; };
  }, [user?.id, user?.patientId]);

  const completedVisits = patientVisits.filter(v => v.isFinal !== false);
  const patientName = patientData?.name || user?.name || "Пациент";
  const firstName = patientName.split(" ")[0] || patientName;
  const bonusPoints = Number(patientData?.bonusPoints ?? user?.bonusPoints ?? 0);
  const bonusLabel = `${bonusPoints.toLocaleString("ru-RU")} т`;
  const primaryVisit = completedVisits[0];
  const imagingAssets = {
    model3d: firstFilled(
      patientData?.model3dImageUrl,
      patientData?.xrayImageUrl,
      patientData?.ctImageUrl,
      patientData?.images?.model3d,
      patientData?.images?.xray,
      user?.model3dImageUrl,
    ),
    before: firstFilled(
      patientData?.beforeTreatmentImageUrl,
      patientData?.beforeImageUrl,
      patientData?.images?.before,
    ),
    after: firstFilled(
      patientData?.afterTreatmentImageUrl,
      patientData?.afterImageUrl,
      patientData?.images?.after,
    ),
  };
  const historyItems = completedVisits.slice(0, 3).map((visit, index) => ({
    id: visit.appointmentId || `${visit.date}-${visit.time}-${index}`,
    date: fmtDate(visit.date).toUpperCase(),
    title: visit.diagnosis || "Контрольный прием",
    description: visit.notes || visit.complaint || "Обновлен клинический протокол и рекомендации по уходу.",
    isActive: index === 0,
  }));
  const planItems = [
    {
      id: "plan-urgent",
      title: primaryVisit?.diagnosis?.includes("мудр")
        ? primaryVisit.diagnosis
        : "Удаление зуба мудрости",
      subtitle: primaryVisit?.toothNumber
        ? `Зуб ${primaryVisit.toothNumber} (дистопированный)`
        : "Зуб 4.8 (дистопированный)",
      tone: "danger",
    },
    {
      id: "plan-next",
      title: primaryVisit?.diagnosisCode?.startsWith("K07")
        ? "Ортодонтический этап"
        : "Установка имплантата",
      subtitle: primaryVisit?.toothNumber
        ? `Зуб ${primaryVisit.toothNumber} (Nobel Biocare)`
        : "Зуб 1.6 (Nobel Biocare)",
      tone: "muted",
    },
  ];
  const timelineFallback = [
    {
      id: "fallback-1",
      date: "12 МАЙ 2024",
      title: "Профессиональная гигиена",
      description: "Ультразвуковая чистка AirFlow, полировка эмали.",
      isActive: true,
    },
    {
      id: "fallback-2",
      date: "28 АПР 2024",
      title: "Лечение кариеса",
      description: "Зуб 2.4, медиальная поверхность. Пломба Ceram.X.",
      isActive: false,
    },
    {
      id: "fallback-3",
      date: "15 МАРТ 2024",
      title: "КТ-диагностика",
      description: "Полное 3D сканирование обеих челюстей.",
      isActive: false,
    },
  ];
  const displayHistory = historyItems.length ? historyItems : timelineFallback;

  return (
    <div style={{ minHeight: "100%", background: "#fbfcfe", padding: "22px 24px 20px" }}>
      <style>{`
        .patient-home {
          display: grid;
          gap: 20px;
        }
        .patient-home-card {
          border: 1px solid #dbe3f1;
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
        }
        .patient-home-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.22fr) minmax(420px, 0.88fr);
          gap: 18px 24px;
          align-items: start;
        }
        .patient-model-stage {
          position: relative;
          min-height: 380px;
          overflow: hidden;
          border-radius: 0 0 16px 16px;
          background: linear-gradient(180deg, #fbfdff 0%, #f4f8fd 100%);
        }
        .patient-model-empty {
          position: absolute;
          inset: 28px;
          border-radius: 20px;
          border: 1px dashed #c8d6ea;
          background: #f8fbff;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .patient-model-empty-card {
          width: min(100%, 340px);
          padding: 0;
          display: grid;
          gap: 10px;
          justify-items: center;
          text-align: center;
          color: #29405f;
        }
        .patient-model-empty-icon {
          width: 52px;
          height: 52px;
          border-radius: 16px;
          background: #edf4ff;
          color: #3167e3;
          display: grid;
          place-items: center;
          border: 1px solid #d7e5fb;
        }
        .patient-model-empty-title {
          font-size: 17px;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: #24364f;
        }
        .patient-model-empty-text {
          font-size: 13px;
          line-height: 1.55;
          color: #6b7a8f;
        }
        .patient-model-empty-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 30px;
          padding: 0 12px;
          border-radius: 999px;
          background: #ffffff;
          border: 1px solid #d9e4f2;
          color: #5f7190;
          font-size: 12px;
          font-weight: 600;
        }
        .patient-photo-card {
          padding: 10px 12px 12px;
          border: 1px solid #d9e1ef;
          border-radius: 16px;
          background: #fff;
        }
        .patient-photo-label {
          margin-bottom: 8px;
          font-size: 12px;
          font-weight: 700;
          color: #5e6f8e;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .patient-photo-stage {
          position: relative;
          height: 116px;
          overflow: hidden;
          border-radius: 12px;
          border: 1px dashed #cbd8ef;
          background: linear-gradient(180deg, #f8fbff 0%, #eef4fb 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .patient-photo-empty {
          display: grid;
          gap: 8px;
          justify-items: center;
          text-align: center;
          color: #62738f;
        }
        .patient-photo-empty strong {
          font-size: 13px;
          color: #32415d;
        }
        .patient-photo-empty span {
          font-size: 12px;
          line-height: 1.45;
        }
        .patient-doc-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
        }
        .patient-doc-card {
          min-height: 110px;
          border: 1px solid #dce4f2;
          border-radius: 16px;
          background: #fff;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          color: #172c4c;
          font-size: 15px;
          font-weight: 700;
          text-align: center;
          box-shadow: 0 4px 16px rgba(28, 48, 89, 0.04);
        }
        @media (max-width: 1320px) {
          .patient-home-grid {
            grid-template-columns: minmax(0, 1fr);
          }
        }
        @media (max-width: 900px) {
          .patient-home {
            gap: 16px;
          }
          .patient-doc-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 640px) {
          .patient-model-stage {
            min-height: 280px;
          }
          .patient-model-empty {
            inset: 16px;
            padding: 16px;
          }
          .patient-model-empty-card {
            width: min(100%, 280px);
          }
          .patient-model-empty-title {
            font-size: 15px;
          }
        }
      `}</style>

      <div className="patient-home">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, color: "#3167e3", fontSize: "clamp(34px, 4.3vw, 48px)", lineHeight: 1.02, fontWeight: 800, letterSpacing: "-0.04em" }}>
              Добро пожаловать, {firstName}!
            </h1>
            <p style={{ margin: "8px 0 0", color: "#5f6f89", fontSize: 15, lineHeight: 1.4, maxWidth: 620 }}>
              Ваш персональный план лечения и 3D-диагностика обновлены сегодня.
            </p>
          </div>

          <div className="patient-home-card" style={{ minWidth: 248, padding: "14px 20px", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "#edf3ff",
              color: "#3167e3",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="m12 2.2 2.43 4.92 5.43.79-3.93 3.83.93 5.41L12 14.6l-4.86 2.55.93-5.41-3.93-3.83 5.43-.79L12 2.2Z" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#65728c", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Бонусный баланс
              </div>
              <div style={{ marginTop: 4, fontSize: 18, fontWeight: 800, color: "#3167e3" }}>{bonusLabel}</div>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b2bfd5" strokeWidth="2">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </div>
        </div>

        {(patientData?.allergies || user?.allergies) && (
          <div className="patient-home-card" style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, borderColor: "#fed7d7", background: "#fff7f7" }}>
            <AlertTriangle size={18} style={{ color: "#dc2626", flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "#a12b2b" }}>
              Аллергия: {patientData?.allergies || user?.allergies}
            </span>
          </div>
        )}

        {loadError && (
          <div className="patient-home-card" style={{ padding: "14px 18px", borderColor: "#fed7d7", background: "#fff7f7", color: "#a12b2b", fontSize: 14, fontWeight: 600 }}>
            {loadError}
          </div>
        )}

        <div className="patient-home-grid">
          <div style={{ display: "grid", gap: 16 }}>
            <section className="patient-home-card" style={{ overflow: "hidden" }}>
              <div style={{
                padding: "18px 20px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                borderBottom: "1px solid #e6ecf6",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16, fontWeight: 600, color: "#1f2e47" }}>
                  <span style={{ color: "#3167e3", display: "inline-flex" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m12 2 7 4v12l-7 4-7-4V6l7-4Z" />
                      <path d="m12 22 0-8" />
                      <path d="m19 6-7 4-7-4" />
                      <path d="M8 10h.01M16 10h.01M12 14h.01" />
                    </svg>
                  </span>
                  <span>Ваша 3D-модель челюсти</span>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button type="button" style={{
                    height: 30,
                    padding: "0 14px",
                    border: "none",
                    borderRadius: 9,
                    background: "#f0f4f9",
                    color: "#495a77",
                    fontWeight: 700,
                    fontSize: 12,
                  }}>
                    Вращение
                  </button>
                  <button type="button" style={{
                    height: 30,
                    padding: "0 14px",
                    border: "none",
                    borderRadius: 9,
                    background: "#3167e3",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 12,
                    boxShadow: "0 10px 18px rgba(49, 103, 227, 0.24)",
                  }}>
                    Слои AI
                  </button>
                </div>
              </div>

              <div className="patient-model-stage">
                {imagingAssets.model3d ? (
                  <img
                    src={imagingAssets.model3d}
                    alt="3D-модель челюсти"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      display: "block",
                    }}
                  />
                ) : (
                  <div className="patient-model-empty">
                    <div className="patient-model-empty-card">
                      <div className="patient-model-empty-icon">
                        <ScanLine size={24} />
                      </div>
                      <div className="patient-model-empty-title">3D-снимок еще не загружен</div>
                      <div className="patient-model-empty-text">
                        Здесь будет отображаться КТ, рентген или 3D-модель челюсти после загрузки изображения врачом в карточку пациента.
                      </div>
                      <div className="patient-model-empty-chip">
                        <Upload size={14} />
                        Ожидание снимка из базы
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
              <div className="patient-photo-card">
                <div className="patient-photo-label">Состояние: до (05.01.2024)</div>
                <div className="patient-photo-stage">
                  {imagingAssets.before ? (
                    <img
                      src={imagingAssets.before}
                      alt="Состояние до лечения"
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: 10 }}
                    />
                  ) : (
                    <div className="patient-photo-empty">
                      <Upload size={18} />
                      <strong>Фото до лечения не загружено</strong>
                      <span>После добавления снимка врачом он появится здесь автоматически.</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="patient-photo-card">
                <div className="patient-photo-label">Текущее состояние (15.05.2024)</div>
                <div className="patient-photo-stage">
                  {imagingAssets.after ? (
                    <img
                      src={imagingAssets.after}
                      alt="Текущее состояние"
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: 10 }}
                    />
                  ) : (
                    <div className="patient-photo-empty">
                      <Upload size={18} />
                      <strong>Текущее фото не загружено</strong>
                      <span>Этот блок готов для реального изображения из базы пациента.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            <section className="patient-home-card" style={{ overflow: "hidden" }}>
              <div style={{ padding: "18px 20px", borderBottom: "1px solid #e8eef8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#1e2f49" }}>История лечения</div>
                <button type="button" style={{ border: "none", background: "transparent", color: "#0f45b9", fontSize: 13, fontWeight: 700 }}>
                  Все записи
                </button>
              </div>

              <div style={{ padding: "16px 16px 16px" }}>
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", left: 13, top: 14, bottom: 18, width: 2, background: "#e3ebf8" }} />
                  <div style={{ display: "grid", gap: 22 }}>
                    {displayHistory.map((item) => (
                      <div key={item.id} style={{ position: "relative", paddingLeft: 42, paddingRight: 8 }}>
                        <div style={{
                          position: "absolute",
                          left: 0,
                          top: 12,
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          background: item.isActive ? "#3167e3" : "#e0e7f2",
                          border: item.isActive ? "4px solid #edf3ff" : "4px solid #fff",
                          boxSizing: "border-box",
                        }} />
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14 }}>
                          <div>
                            <div style={{
                              display: "inline-flex",
                              alignItems: "center",
                              minHeight: 26,
                              padding: "0 10px",
                              borderRadius: 8,
                              background: item.isActive ? "#edf4ff" : "#f4f7fc",
                              color: item.isActive ? "#3167e3" : "#61738d",
                              fontSize: 11,
                              fontWeight: 800,
                              letterSpacing: "0.02em",
                              textTransform: "uppercase",
                            }}>
                              {item.date}
                            </div>
                            <div style={{ marginTop: 10, fontSize: 15, lineHeight: 1.28, fontWeight: 600, color: "#1f2d43" }}>
                              {item.title}
                            </div>
                            <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.45, color: "#66768e" }}>
                              {item.description}
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={downloading === item.id}
                            onClick={() => {
                              setDownloading(item.id);
                              setTimeout(() => setDownloading(null), 1200);
                            }}
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "#66768e",
                              fontSize: 12,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              flexShrink: 0,
                              paddingTop: 6,
                            }}
                          >
                            <FileDown size={14} />
                            {downloading === item.id ? "Скачивание..." : "AI протокол"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="patient-home-card" style={{ overflow: "hidden", background: "#fffdfa" }}>
              <div style={{ padding: "0" }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  minHeight: 78,
                  padding: "18px 20px",
                  background: "#fff5f3",
                  borderBottom: "1px solid #f0e8e2",
                }}>
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: "#fde6e4",
                    color: "#ca322f",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}>
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#2d2d2d", textTransform: "uppercase", letterSpacing: "0.02em" }}>Ваш план лечения</div>
                    <div style={{ marginTop: 3, fontSize: 13, color: "#575d70" }}>Рекомендуется срочное вмешательство</div>
                  </div>
                </div>
              </div>

              <div style={{ padding: "18px 20px 20px", display: "grid", gap: 14 }}>
                {planItems.map((item) => (
                  <div key={item.id} style={{
                    minHeight: 94,
                    borderRadius: 14,
                    border: "1px solid #eef1f6",
                    background: "#f8fafc",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "0 20px",
                  }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#1d2d45", lineHeight: 1.2 }}>{item.title}</div>
                      <div style={{ marginTop: 4, fontSize: 12, color: "#6b7a8d" }}>{item.subtitle}</div>
                    </div>
                    {item.tone === "danger" ? (
                      <div style={{ color: "#d62522", fontSize: 34, fontWeight: 800, lineHeight: 1 }}>!</div>
                    ) : (
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#c7cedc" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    )}
                  </div>
                ))}

                <button type="button" style={{
                  height: 62,
                  border: "none",
                  borderRadius: 16,
                  background: "#3167e3",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 800,
                  boxShadow: "0 14px 26px rgba(49, 103, 227, 0.22)",
                  letterSpacing: "0.01em",
                }}>
                  ЗАПИСАТЬСЯ НА ПРИЕМ
                </button>
              </div>
            </section>

            <div className="patient-doc-grid">
              {[
                { label: "Договор", icon: "doc" },
                { label: "Чеки и счета", icon: "receipt" },
              ].map((item) => (
                <button key={item.label} type="button" className="patient-doc-card">
                  <span style={{ color: "#3167e3", display: "inline-flex" }}>
                    {item.icon === "doc" ? (
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                    ) : (
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 2v6" />
                        <path d="M15 2v6" />
                        <path d="M4 8h16" />
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <path d="M8 12h8" />
                        <path d="M8 16h6" />
                      </svg>
                    )}
                  </span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Patient list (owner / admin / doctor) ─────────────────────────────────────
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
  const totalDebt = patients.reduce((sum, patient) => sum + Math.abs(Math.min(patient.balance || 0, 0)), 0);
  const activeDebtors = patients.filter((patient) => (patient.balance || 0) < 0).length;

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

  // Calculate age from birthDate
  function calculateAge(birthDate) {
    if (!birthDate) return "—";
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }

  function fmtShortDate(iso) {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
  }

  function fmtMoney(amount) {
    return `${Math.abs(amount || 0).toLocaleString("ru-RU")} ₸`;
  }

  // Get avatar initials
  function getInitials(name) {
    return name?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "??";
  }

  // Get avatar color based on name
  function getAvatarColor(name) {
    const colors = ["#eff6ff", "#ecfdf5", "#fffbeb", "#fef2f2", "#f5f3ff", "#fdf2f8"];
    let hash = 0;
    for (let i = 0; i < (name?.length || 0); i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  return (
    <div className="patients-page" style={{ minHeight: "100%", background: "#fff", padding: "22px 24px 32px" }}>
      <style>{`
        .pat-table { width: 100%; border-collapse: collapse; }
        .pat-table th { text-align: left; padding: 12px 16px; font-size: 11px; font-weight: 700; color: var(--muted); border-bottom: 1px solid var(--border); background: #f8fafc; text-transform: uppercase; letter-spacing: 0.02em; }
        .pat-table td { padding: 13px 16px; border-bottom: 1px solid var(--border); font-size: 13px; vertical-align: middle; }
        .pat-table tr:hover { background: var(--hover); }
        .pat-table tr:last-child td { border-bottom: none; }
        .pat-avatar { width: 36px; height: 36px; border-radius: 999px; display: flex; align-items: center; justify-content: center; color: var(--primary); font-size: 12px; font-weight: 700; border: 1px solid #dbeafe; }
        .pat-action-btn { width: 32px; height: 32px; border: 1px solid transparent; background: transparent; cursor: pointer; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; color: #64748b; transition: all 0.15s; }
        .pat-action-btn:hover { background: #f8fafc; border-color: var(--border); color: var(--primary); }
        .pat-action-btn.delete:hover { background: #fef2f2; color: var(--danger); }
        @media (max-width: 760px) {
          .patients-page {
            padding: 16px 12px 24px !important;
          }
          .patients-header {
            align-items: stretch !important;
          }
          .patients-header-actions {
            width: 100%;
            flex-direction: column;
            align-items: stretch !important;
          }
          .patients-header-actions input,
          .patients-header-actions button {
            width: 100% !important;
            min-height: 42px;
          }
          .patients-stats {
            grid-template-columns: 1fr !important;
          }
          .pat-table {
            min-width: 760px;
          }
        }
      `}</style>

      {/* Header */}
      <div className="patients-header" style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: 16, flexWrap: "wrap", marginBottom: 18,
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "var(--text)" }}>Пациенты</h1>
          <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 12 }}>База пациентов, контакты и история лечения</p>
        </div>
        <div className="patients-header-actions" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Поиск пациента..."
            style={{ ...inputStyle, width: 250, height: 40, padding: "8px 13px", borderRadius: 10 }}
          />
          {canCreate && (
            <button onClick={() => setModal({ mode: "create" })} style={btnPrimary}>
              + Добавить пациента
            </button>
          )}
        </div>
      </div>

      <div className="patients-stats" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginBottom: 18 }}>
        {[
          { label: "Всего пациентов", value: patients.length, note: loading ? "загрузка" : "в базе" },
          { label: "С долгом", value: activeDebtors, note: totalDebt ? fmtMoney(totalDebt) : "нет задолженности" },
          { label: "С WhatsApp", value: patients.filter((patient) => patient.channel === "WhatsApp").length, note: "для напоминаний" },
        ].map((item) => (
          <div key={item.label} style={{
            border: "1px solid var(--border)", borderRadius: 10, padding: "10px 16px",
            background: "#fff", boxShadow: "0 1px 4px rgba(15,23,42,0.06)",
          }}>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>{item.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", lineHeight: 1 }}>{item.value}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>{item.note}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflowX: "auto", boxShadow: "0 1px 5px rgba(15,23,42,0.08)" }}>
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
        {!loading && !error && patients.length > 0 && (
          <table className="pat-table">
            <thead>
              <tr>
                <th>Пациент</th>
                <th>Телефон</th>
                <th style={{ width: 90 }}>Возраст</th>
                <th>Последний визит</th>
                <th style={{ width: 130 }}>Баланс</th>
                <th style={{ width: 118, textAlign: "right" }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div className="pat-avatar" style={{ background: getAvatarColor(p.name) }}>
                        {getInitials(p.name)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 650, color: "var(--text)" }}>{p.name}</div>
                        <div style={{ marginTop: 2, color: "var(--muted)", fontSize: 11 }}>создан: {fmtShortDate(p.createdAt)}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ color: "var(--text)", fontWeight: 500 }}>{p.phone}</div>
                    <div style={{ marginTop: 2, color: "var(--muted)", fontSize: 11 }}>{p.channel || "Телефон"}</div>
                  </td>
                  <td style={{ color: "var(--muted)" }}>{calculateAge(p.birthDate)}</td>
                  <td>
                    {p.lastVisitDate ? (
                      <>
                        <div style={{ color: "var(--text)", fontWeight: 500 }}>{fmtShortDate(p.lastVisitDate)} · {p.lastVisitTime}</div>
                        <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 2 }}>{p.lastDiagnosis || "Прием завершен"}</div>
                      </>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>Нет визитов</span>
                    )}
                  </td>
                  <td>
                    <span style={{
                      display: "inline-flex", alignItems: "center", minHeight: 24, padding: "3px 9px",
                      borderRadius: 999, fontSize: 12, fontWeight: 650,
                      background: (p.balance || 0) < 0 ? "#fef2f2" : "#ecfdf5",
                      color: (p.balance || 0) < 0 ? "#dc2626" : "#059669",
                      border: `1px solid ${(p.balance || 0) < 0 ? "#fecaca" : "#bbf7d0"}`,
                    }}>
                      {(p.balance || 0) < 0 ? `долг ${fmtMoney(p.balance)}` : "нет долга"}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: 4 }}>
                      {canAI && (
                        <button onClick={() => router.push(`/ai?patient=${p.id}`)} className="pat-action-btn" title="AI-Прием">
                          <Bot size={15} />
                        </button>
                      )}
                      <button onClick={() => openModal("view", p.id)} className="pat-action-btn" title="Просмотр">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                        </svg>
                      </button>
                      <button onClick={() => openModal("edit", p.id)} className="pat-action-btn" title="Редактировать">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
