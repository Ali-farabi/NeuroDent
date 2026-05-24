"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import {
  searchPatients,
  getPatientById,
  getPatientPayments,
  createPatient,
  updatePatient,
  getPatientVisits,
  getFiles,
  uploadFile,
  deleteFile,
  getFileDownloadUrl,
  createPatientProtocolDocument,
  getLatestPatientProtocolDocument,
  getPatientBillingSummary,
  createPatientAppointmentRequest,
  getDoctors,
  changePassword,
  getPatientAiContext,
  getPatientMedicalCard,
  getPatientTreatmentPlan,
  getActiveAppointmentByPatient,
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

function labelFromMap(value, map, fallback = "Не указано") {
  const key = String(value || "").toLowerCase();
  return map[key] || value || fallback;
}

function appointmentStatusLabel(status) {
  return labelFromMap(status, {
    scheduled: "Запланировано",
    arrived: "Пациент прибыл",
    completed: "Завершено",
    cancelled: "Отменено",
    no_show: "Не явился",
  }, "Запланировано");
}

function paymentMethodLabel(method) {
  return labelFromMap(method, {
    cash: "Наличные",
    card: "Карта",
    kaspi: "Kaspi",
    transfer: "Перевод",
    insurance: "Страховка",
    payment: "Платеж",
  }, "Платеж");
}

function invoiceStatusLabel(status) {
  return labelFromMap(status, {
    draft: "Черновик",
    issued: "Выставлен",
    sent: "Отправлен",
    paid: "Оплачен",
    partial: "Частично оплачен",
    overdue: "Просрочен",
    cancelled: "Отменен",
  }, "Счет");
}

function biteLabel(bite) {
  return labelFromMap(bite, {
    permanent: "Постоянный прикус",
    mixed: "Смешанный прикус",
    primary: "Молочный прикус",
  }, "Постоянный прикус");
}

function toothValueLabel(value) {
  if (typeof value === "string") {
    return labelFromMap(value, {
      healthy: "Здоров",
      caries: "Кариес",
      treated: "Вылечен",
      missing: "Отсутствует",
      planned: "Запланировано",
      watch: "Наблюдение",
    }, value);
  }
  return labelFromMap(value?.status || value?.diagnosis, {
    healthy: "Здоров",
    caries: "Кариес",
    treated: "Вылечен",
    missing: "Отсутствует",
    planned: "Запланировано",
    watch: "Наблюдение",
  }, "Обновлено");
}

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const FILE_KIND_OPTIONS = [
  { value: "xray", label: "Рентген" },
  { value: "ct", label: "КТ / 3D" },
  { value: "before", label: "Фото до" },
  { value: "after", label: "Фото после" },
  { value: "consent", label: "Согласие" },
  { value: "invoice", label: "Счет" },
  { value: "other", label: "Другое" },
];

const FILE_KIND_LABELS = {
  xray: "Рентген",
  ct: "КТ / 3D",
  before: "Фото до",
  after: "Фото после",
  protocol: "ИИ-протокол",
  consent: "Согласие",
  invoice: "Счет",
  upload: "Файл",
  other: "Другое",
};

function normalizeFileKind(file) {
  return String(file?.kind || file?.category || file?.type || "").trim().toLowerCase();
}

function fileKindLabel(file) {
  const kind = normalizeFileKind(file);
  return FILE_KIND_LABELS[kind] || kind || "Файл";
}

function mimeGroup(file) {
  const explicit = String(file?.mimeGroup || "").toLowerCase();
  if (explicit) return explicit;
  const mimeType = String(file?.mimeType || "").toLowerCase();
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.includes("dicom") || mimeType.includes("model") || mimeType.includes("stl") || mimeType.includes("obj")) return "3d";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("text/")) return "text";
  return "binary";
}

function findLatestFile(files, kinds) {
  const wanted = new Set(Array.isArray(kinds) ? kinds : [kinds]);
  return (files || []).find((file) => wanted.has(normalizeFileKind(file))) || null;
}

function filePublicUrl(file) {
  if (!file) return "";
  return firstFilled(file.previewUrl, file.thumbnailUrl, file.downloadUrl, file.id ? getFileDownloadUrl(file.id) : "");
}

function formatMoneyAmount(amount) {
  return `${Number(amount || 0).toLocaleString("ru-RU")} ₸`;
}

function sortedByCreatedDesc(items) {
  return [...(items || [])].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
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
      <Field label="Эл. почта">
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
  const [payments, setPayments] = useState(null);
  const [files, setFiles] = useState([]);
  const [uploadKind, setUploadKind] = useState("xray");
  const [fileMessage, setFileMessage] = useState("");

  useEffect(() => {
    getPatientVisits(patient.id).then(setVisits);
    getPatientPayments(patient.id).then(setPayments).catch(() => setPayments([]));
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
      await uploadFile({
        patientId: patient.id,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        base64,
        kind: uploadKind,
        category: uploadKind,
      });
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
    { key: "payments",  label: "Платежи" },
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
            { icon: "mail",  label: "Эл. почта", value: patient.email || "—" },
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
                  <div style={{ color: "var(--primary)", fontWeight: 600, marginBottom: 4, fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}><Bot size={12} /> ИИ-резюме</div>
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
                    {appointmentStatusLabel(v.statusRaw || v.status)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "payments" && (
        <div style={{ maxHeight: 380, overflowY: "auto", display: "grid", gap: 8 }}>
          {payments === null ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)", fontSize: 13 }}>Загрузка...</div>
          ) : payments.length === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: 13, padding: "24px 0", textAlign: "center" }}>Платежей нет</div>
          ) : payments.map((payment) => (
            <div key={payment.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: 12 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{fmtDate(payment.date)} {payment.time || ""}</div>
                <div style={{ color: "var(--muted)", fontSize: 12 }}>{paymentMethodLabel(payment.method)}{payment.note ? ` · ${payment.note}` : ""}</div>
              </div>
              <div style={{ fontWeight: 700, color: "var(--primary)", whiteSpace: "nowrap" }}>{Number(payment.amount || 0).toLocaleString("ru-RU")} ₸</div>
            </div>
          ))}
        </div>
      )}

      {tab === "documents" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <select
              value={uploadKind}
              onChange={(event) => setUploadKind(event.target.value)}
              style={{ ...inputStyle, width: 170 }}
              aria-label="Категория файла"
            >
              {FILE_KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <label style={{ ...btnPrimary, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Upload size={14} /> Загрузить файл
              <input type="file" onChange={handleFileUpload} style={{ display: "none" }} />
            </label>
            <button type="button" onClick={handleCreateProtocolDocument} style={btnOutline}>
              Создать документ ИИ-протокола
            </button>
          </div>
          {fileMessage && <div style={{ fontSize: 12, color: "var(--muted)" }}>{fileMessage}</div>}
          <div style={{ display: "grid", gap: 8 }}>
            {files.map((file) => (
              <div key={file.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.fileName}</div>
                  <div style={{ color: "var(--muted)", fontSize: 11 }}>
                    {fileKindLabel(file)} · {file.mimeType}
                    {file.signatureStatus === "signed" ? " · подписан" : ""}
                    {" · "}{file.createdAt}
                  </div>
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
  const [medicalCard, setMedicalCard] = useState(null);
  const [treatmentPlan, setTreatmentPlan] = useState([]);
  const [aiContext, setAiContext] = useState(null);
  const [patientFiles, setPatientFiles] = useState([]);
  const [billingSummary, setBillingSummary] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [showAppointmentForm, setShowAppointmentForm] = useState(false);
  const [appointmentForm, setAppointmentForm] = useState({
    doctorId: "",
    preferredDate: todayIso(),
    preferredTime: "10:00",
    comment: "",
  });
  const [appointmentSaving, setAppointmentSaving] = useState(false);
  const [appointmentMessage, setAppointmentMessage] = useState("");
  const [documentModal, setDocumentModal] = useState(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [activeAppointment, setActiveAppointment] = useState(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", nextPassword: "", repeatPassword: "" });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [downloading, setDownloading] = useState(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const patientId = user?.patientId || user?.id;
    if (!patientId) return;
    let active = true;

    Promise.all([
      getPatientById(patientId),
      getPatientVisits(patientId),
      getPatientMedicalCard(patientId),
      getPatientTreatmentPlan(patientId),
      getPatientAiContext(patientId),
      getFiles({ patientId }),
      getPatientBillingSummary(patientId).catch(() => null),
      getDoctors().catch(() => []),
      getActiveAppointmentByPatient(patientId).catch(() => null),
    ])
      .then(([patient, visits, card, plan, context, files, billing, doctorList, appointment]) => {
        if (!active) return;
        setLoadError("");
        setPatientData(card?.patient || patient);
        setMedicalCard(card || null);
        setTreatmentPlan(plan || []);
        setAiContext(context || null);
        setPatientFiles(files || card?.files || []);
        setBillingSummary(billing || null);
        setDoctors(doctorList || []);
        setActiveAppointment(appointment || null);
        setAppointmentForm((prev) => (
          prev.doctorId || !(doctorList || []).length
            ? prev
            : { ...prev, doctorId: doctorList[0].id }
        ));
        setPatientVisits((card?.visits || visits || []).map((visit) => {
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
  const bonusFromCard = Number(medicalCard?.bonuses ?? bonusPoints);
  const bonusLabel = `${bonusFromCard.toLocaleString("ru-RU")} т`;
  const protocolFile = findLatestFile(patientFiles, "protocol");
  const xrayFile = findLatestFile(patientFiles, "xray");
  const ctFile = findLatestFile(patientFiles, "ct");
  const beforeFile = findLatestFile(patientFiles, "before");
  const afterFile = findLatestFile(patientFiles, "after");
  const invoiceFiles = patientFiles.filter((file) => normalizeFileKind(file) === "invoice");
  const consentFiles = patientFiles.filter((file) => normalizeFileKind(file) === "consent");
  const billingInvoices = billingSummary?.invoices || [];
  const selectedModalFiles = sortedByCreatedDesc(documentModal?.files || []);
  const selectedDocument = selectedModalFiles.find((file) => file.id === selectedDocumentId) || selectedModalFiles[0] || null;
  const imagingAssets = {
    model3d: firstFilled(
      filePublicUrl(ctFile),
      filePublicUrl(xrayFile),
      aiContext?.toothChart?.model3dImageUrl,
      patientData?.model3dImageUrl,
      patientData?.xrayImageUrl,
      patientData?.ctImageUrl,
      patientData?.images?.model3d,
      patientData?.images?.xray,
      user?.model3dImageUrl,
    ),
    before: firstFilled(
      filePublicUrl(beforeFile),
      aiContext?.beforeTreatmentImageUrl,
      patientData?.beforeTreatmentImageUrl,
      patientData?.beforeImageUrl,
      patientData?.images?.before,
    ),
    after: firstFilled(
      filePublicUrl(afterFile),
      aiContext?.afterTreatmentImageUrl,
      patientData?.afterTreatmentImageUrl,
      patientData?.afterImageUrl,
      patientData?.images?.after,
    ),
  };
  const toothChart = aiContext?.toothChart || {};
  const toothEntries = Object.entries(toothChart.teeth || {}).slice(0, 8);
  const historyItems = completedVisits.slice(0, 3).map((visit, index) => ({
    id: visit.appointmentId || `${visit.date}-${visit.time}-${index}`,
    date: fmtDate(visit.date).toUpperCase(),
    title: visit.diagnosis || "Контрольный прием",
    description: visit.notes || visit.complaint || "Обновлен клинический протокол и рекомендации по уходу.",
    isActive: index === 0,
  }));
  const planItems = (treatmentPlan.length ? treatmentPlan : medicalCard?.treatmentPlan || []).map((item, index) => ({
    id: item.id || `plan-${index}`,
    title: item.text || item.title || "План лечения",
    subtitle: item.toothNumber ? `Зуб ${item.toothNumber}` : appointmentStatusLabel(item.status),
    tone: index === 0 ? "danger" : "muted",
  }));
  if (!planItems.length) {
    planItems.push({
      id: "plan-empty",
      title: "Первичная диагностика и составление плана лечения",
      subtitle: "Запланировано",
      tone: "muted",
    });
  }
  const displayHistory = historyItems;

  async function downloadPatientProtocol(itemId) {
    const patientId = user?.patientId || user?.id;
    if (!patientId) return;
    setDownloading(itemId);
    try {
      let documentFile = protocolFile || await getLatestPatientProtocolDocument(patientId);
      if (!documentFile?.id) {
        documentFile = await createPatientProtocolDocument(patientId);
      }
      if (!documentFile?.id) throw new Error("PDF-протокол еще не создан");
      setPatientFiles((prev) => [documentFile, ...prev.filter((file) => file.id !== documentFile.id)]);
      window.open(getFileDownloadUrl(documentFile.id), "_blank", "noopener,noreferrer");
    } catch (error) {
      setLoadError(error?.message || "Не удалось открыть PDF-протокол");
    } finally {
      setDownloading(null);
    }
  }

  async function openPatientFiles(category = "") {
    setLoadError("");
    let files = category
      ? patientFiles.filter((file) => normalizeFileKind(file) === category)
      : patientFiles;

    if (!files.length && category === "protocol") {
      const patientId = user?.patientId || user?.id;
      if (!patientId) return;
      setDownloading("protocol");
      try {
        const documentFile = await createPatientProtocolDocument(patientId);
        files = [documentFile];
        setPatientFiles((prev) => [documentFile, ...prev.filter((file) => file.id !== documentFile.id)]);
      } catch (error) {
        setLoadError(error?.message || "Не удалось создать PDF-протокол");
        setDownloading(null);
        return;
      }
      setDownloading(null);
    }

    if (files.length) {
      const sorted = sortedByCreatedDesc(files);
      setDocumentModal({ category, title: category ? FILE_KIND_LABELS[category] || "Документы" : "Документы", files: sorted });
      setSelectedDocumentId(sorted[0]?.id || "");
      return;
    }
    setLoadError("Документ еще не загружен в карту пациента");
  }

  async function handleAppointmentRequest(event) {
    event.preventDefault();
    const patientId = user?.patientId || user?.id;
    if (!patientId) return;
    setAppointmentSaving(true);
    setAppointmentMessage("");
    setLoadError("");
    try {
      await createPatientAppointmentRequest(patientId, appointmentForm);
      setAppointmentMessage("Заявка отправлена. Администратор подтвердит время приема.");
      setShowAppointmentForm(false);
      setAppointmentForm((prev) => ({ ...prev, comment: "" }));
    } catch (error) {
      setAppointmentMessage(error?.message || "Не удалось отправить заявку на прием");
    } finally {
      setAppointmentSaving(false);
    }
  }

  async function handlePasswordChange(event) {
    event.preventDefault();
    setPasswordMessage("");
    if (passwordForm.nextPassword !== passwordForm.repeatPassword) {
      setPasswordMessage("Новый пароль и повтор не совпадают");
      return;
    }
    setPasswordSaving(true);
    try {
      await changePassword(passwordForm.currentPassword, passwordForm.nextPassword);
      setPasswordForm({ currentPassword: "", nextPassword: "", repeatPassword: "" });
      setPasswordMessage("Пароль пациентского кабинета обновлен");
    } catch (error) {
      setPasswordMessage(error?.message || "Не удалось сменить пароль");
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <>
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
        .patient-billing-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
          align-items: center;
          padding: 10px 0;
          border-top: 1px solid #edf2f8;
        }
        .patient-appointment-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .patient-document-layout {
          display: grid;
          grid-template-columns: minmax(220px, 0.42fr) minmax(0, 1fr);
          gap: 14px;
          min-height: 420px;
        }
        .patient-document-list {
          display: grid;
          align-content: start;
          gap: 8px;
          max-height: 520px;
          overflow: auto;
        }
        .patient-document-preview {
          min-height: 420px;
          border: 1px solid #e1e8f2;
          border-radius: 14px;
          background: #f8fbff;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
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
          .patient-appointment-grid {
            grid-template-columns: 1fr;
          }
          .patient-document-layout {
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
          <button
            type="button"
            onClick={() => { setPasswordMessage(""); setShowPasswordModal(true); }}
            style={{
              minHeight: 72,
              padding: "12px 18px",
              border: "1px solid #dbe3f1",
              borderRadius: 16,
              background: "#fff",
              color: "#24364f",
              fontSize: 13,
              fontWeight: 800,
              boxShadow: "0 1px 2px rgba(15, 23, 42, 0.03)",
            }}
          >
            Сменить пароль
          </button>
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

        {activeAppointment && (
          <div className="patient-home-card" style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", borderColor: "#bfdbfe", background: "#eff6ff" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <CalendarDays size={20} style={{ color: "#3167e3", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#1e3a8a" }}>Ближайшая запись</div>
                <div style={{ marginTop: 3, fontSize: 13, color: "#415a83" }}>
                  {fmtDate(activeAppointment.date)} в {activeAppointment.time} · {activeAppointment.doctorName || "Врач NeuroDent"}
                </div>
              </div>
            </div>
            <span style={{ padding: "4px 10px", borderRadius: 999, background: "#dbeafe", color: "#1d4ed8", fontSize: 12, fontWeight: 800 }}>
              {appointmentStatusLabel(activeAppointment.status)}
            </span>
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
                    Слои ИИ
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
                    {displayHistory.length === 0 && (
                      <div style={{ padding: "18px 0 18px 42px", color: "#66768e", fontSize: 13 }}>
                        История лечения пока не заполнена врачом.
                      </div>
                    )}
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
                            onClick={() => downloadPatientProtocol(item.id)}
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
                            {downloading === item.id ? "Скачивание..." : "ИИ-протокол"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
	              </div>
	            </section>

            <section className="patient-home-card" style={{ overflow: "hidden" }}>
              <div style={{ padding: "18px 20px", borderBottom: "1px solid #e8eef8", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#1e2f49" }}>Баланс и счета</div>
                  <div style={{ marginTop: 3, fontSize: 12, color: "#687891" }}>
                    {billingInvoices.length ? `${billingInvoices.length} счет(а) в карте` : "Счета пока не выставлены"}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setShowBillingModal(true)}
                    style={{ border: "none", background: "transparent", color: "#0f45b9", fontSize: 12, fontWeight: 800 }}
                  >
                    Все счета
                  </button>
                  <div style={{
                    padding: "5px 10px",
                    borderRadius: 9,
                    background: billingSummary?.debt ? "#fff1f2" : "#f0fdf4",
                    color: billingSummary?.debt ? "#dc2626" : "#15803d",
                    fontSize: 12,
                    fontWeight: 800,
                  }}>
                    долг {formatMoneyAmount(billingSummary?.debt || 0)}
                  </div>
                </div>
              </div>
              <div style={{ padding: "14px 20px 16px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 8 }}>
                  {[
                    { label: "Всего", value: formatMoneyAmount(billingSummary?.total || 0) },
                    { label: "Оплачено", value: formatMoneyAmount(billingSummary?.paid || 0) },
                    { label: "Остаток", value: formatMoneyAmount(billingSummary?.debt || 0) },
                  ].map((item) => (
                    <div key={item.label} style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: "#7a8aa3", fontWeight: 700, textTransform: "uppercase" }}>{item.label}</div>
                      <div style={{ marginTop: 4, fontSize: 14, fontWeight: 800, color: "#1e2f49", whiteSpace: "nowrap" }}>{item.value}</div>
                    </div>
                  ))}
                </div>
                {billingInvoices.slice(0, 3).map((invoice) => (
                  <div key={invoice.id} className="patient-billing-row">
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#27364f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {invoice.id}
                      </div>
                      <div style={{ marginTop: 2, fontSize: 12, color: "#728199" }}>
                        {invoice.date || invoice.createdAt?.slice(0, 10)} · {invoiceStatusLabel(invoice.status)}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2f49", whiteSpace: "nowrap" }}>
                      {formatMoneyAmount(invoice.total)}
                    </div>
                  </div>
                ))}
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

                <button
                  type="button"
                  onClick={() => setShowAppointmentForm((value) => !value)}
                  style={{
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

                {appointmentMessage && (
                  <div style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: appointmentMessage.includes("Не удалось") ? "#fff1f2" : "#eefbf3",
                    color: appointmentMessage.includes("Не удалось") ? "#b91c1c" : "#17643b",
                    fontSize: 13,
                    fontWeight: 700,
                  }}>
                    {appointmentMessage}
                  </div>
                )}

                {showAppointmentForm && (
                  <form onSubmit={handleAppointmentRequest} style={{ display: "grid", gap: 10 }}>
                    <div className="patient-appointment-grid">
                      <label style={{ display: "grid", gap: 5 }}>
                        <span style={{ fontSize: 11, color: "#6c7b91", fontWeight: 800, textTransform: "uppercase" }}>Врач</span>
                        <select
                          value={appointmentForm.doctorId}
                          onChange={(event) => setAppointmentForm((prev) => ({ ...prev, doctorId: event.target.value }))}
                          style={{ ...inputStyle, height: 40, borderRadius: 10 }}
                          required
                        >
                          <option value="">Выберите врача</option>
                          {doctors.map((doctor) => (
                            <option key={doctor.id} value={doctor.id}>
                              {doctor.name?.split(" ").slice(0, 2).join(" ") || doctor.name} {doctor.specialty ? `· ${doctor.specialty}` : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={{ display: "grid", gap: 5 }}>
                        <span style={{ fontSize: 11, color: "#6c7b91", fontWeight: 800, textTransform: "uppercase" }}>Дата</span>
                        <input
                          type="date"
                          value={appointmentForm.preferredDate}
                          min={todayIso()}
                          onChange={(event) => setAppointmentForm((prev) => ({ ...prev, preferredDate: event.target.value }))}
                          style={{ ...inputStyle, height: 40, borderRadius: 10 }}
                          required
                        />
                      </label>
                    </div>
                    <div className="patient-appointment-grid">
                      <label style={{ display: "grid", gap: 5 }}>
                        <span style={{ fontSize: 11, color: "#6c7b91", fontWeight: 800, textTransform: "uppercase" }}>Время</span>
                        <input
                          type="time"
                          value={appointmentForm.preferredTime}
                          onChange={(event) => setAppointmentForm((prev) => ({ ...prev, preferredTime: event.target.value }))}
                          style={{ ...inputStyle, height: 40, borderRadius: 10 }}
                        />
                      </label>
                      <label style={{ display: "grid", gap: 5 }}>
                        <span style={{ fontSize: 11, color: "#6c7b91", fontWeight: 800, textTransform: "uppercase" }}>Комментарий</span>
                        <input
                          value={appointmentForm.comment}
                          onChange={(event) => setAppointmentForm((prev) => ({ ...prev, comment: event.target.value }))}
                          placeholder="Например: болит зуб"
                          style={{ ...inputStyle, height: 40, borderRadius: 10 }}
                        />
                      </label>
                    </div>
                    <button
                      type="submit"
                      disabled={appointmentSaving}
                      style={{
                        height: 44,
                        border: "1px solid #cfe0ff",
                        borderRadius: 12,
                        background: "#eef5ff",
                        color: "#1855c9",
                        fontSize: 13,
                        fontWeight: 800,
                      }}
                    >
                      {appointmentSaving ? "Отправка..." : "Отправить заявку"}
                    </button>
                  </form>
                )}
              </div>
            </section>
            <section className="patient-home-card" style={{ overflow: "hidden" }}>
	              <div style={{ padding: "18px 20px", borderBottom: "1px solid #e8eef8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
	                <div style={{ fontSize: 16, fontWeight: 600, color: "#1e2f49" }}>Зубная карта</div>
	                <div style={{ fontSize: 12, color: "#6b7a8d" }}>{biteLabel(toothChart.bite)}</div>
	              </div>
	              <div style={{ padding: 16, display: "grid", gap: 10 }}>
	                {toothEntries.length ? toothEntries.map(([tooth, value]) => (
	                  <div key={tooth} style={{ display: "flex", justifyContent: "space-between", gap: 12, border: "1px solid #eef2f7", borderRadius: 10, padding: "9px 11px", background: "#f8fafc" }}>
	                    <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2f49" }}>Зуб {tooth}</div>
	                    <div style={{ fontSize: 12, color: "#6b7a8d", textAlign: "right" }}>
	                      {toothValueLabel(value)}
	                    </div>
	                  </div>
	                )) : (
	                  <div style={{ padding: "12px 0", color: "#6b7a8d", fontSize: 13 }}>
	                    Зубная карта пока не заполнена врачом.
	                  </div>
	                )}
	                {toothChart.updatedAt && (
	                  <div style={{ fontSize: 11, color: "#8a98ad" }}>Обновлено: {String(toothChart.updatedAt).slice(0, 10)}</div>
	                )}
	              </div>
	            </section>

	            <div className="patient-doc-grid">
              {[
                { label: `ИИ-протокол${protocolFile ? " (PDF)" : ""}`, icon: "doc", category: "protocol" },
                { label: `Согласия${consentFiles.length ? ` (${consentFiles.length})` : ""}`, icon: "doc", category: "consent" },
                { label: `Счета${billingInvoices.length || invoiceFiles.length ? ` (${Math.max(billingInvoices.length, invoiceFiles.length)})` : ""}`, icon: "receipt", category: "invoice" },
                { label: `Снимки${xrayFile || ctFile ? " (есть)" : ""}`, icon: "receipt", category: xrayFile ? "xray" : "ct" },
              ].map((item) => (
                <button key={item.label} type="button" className="patient-doc-card" onClick={() => openPatientFiles(item.category)}>
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
    {documentModal && (
      <Modal title={documentModal.title || "Документы"} onClose={() => setDocumentModal(null)} wide>
        <div className="patient-document-layout">
          <div className="patient-document-list">
            {selectedModalFiles.map((file) => (
              <button
                key={file.id}
                type="button"
                onClick={() => setSelectedDocumentId(file.id)}
                style={{
                  minHeight: 74,
                  padding: "10px 12px",
                  border: selectedDocument?.id === file.id ? "1px solid #3167e3" : "1px solid #e1e8f2",
                  borderRadius: 12,
                  background: selectedDocument?.id === file.id ? "#edf4ff" : "#fff",
                  textAlign: "left",
                  color: "#22324a",
                  display: "grid",
                  gap: 4,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {file.fileName || file.name || file.id}
                </span>
                <span style={{ fontSize: 11, color: "#6d7d95" }}>
                  {fileKindLabel(file)} · {file.mimeType || mimeGroup(file)}
                </span>
                {file.signatureStatus === "signed" && (
                  <span style={{ fontSize: 11, color: "#15803d", fontWeight: 800 }}>Подписан</span>
                )}
              </button>
            ))}
            {!selectedModalFiles.length && (
              <div style={{ padding: 18, textAlign: "center", color: "#708097", fontSize: 13 }}>Файлов пока нет</div>
            )}
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            <div className="patient-document-preview">
              {selectedDocument && mimeGroup(selectedDocument) === "image" && (
                <img
                  src={filePublicUrl(selectedDocument)}
                  alt={selectedDocument.fileName || "Документ"}
                  style={{ width: "100%", height: "100%", maxHeight: 520, objectFit: "contain", display: "block" }}
                />
              )}
              {selectedDocument && mimeGroup(selectedDocument) === "pdf" && (
                <iframe
                  title={selectedDocument.fileName || "PDF"}
                  src={getFileDownloadUrl(selectedDocument.id)}
                  style={{ width: "100%", height: 520, border: "none", background: "#fff" }}
                />
              )}
              {selectedDocument && !["image", "pdf"].includes(mimeGroup(selectedDocument)) && (
                <div style={{ padding: 28, textAlign: "center", color: "#5c6e88" }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#24364f" }}>{fileKindLabel(selectedDocument)}</div>
                  <div style={{ marginTop: 8, fontSize: 13 }}>{selectedDocument.mimeType || "Файл доступен для скачивания"}</div>
                </div>
              )}
            </div>
            {selectedDocument && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#22324a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {selectedDocument.fileName || selectedDocument.name || selectedDocument.id}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 12, color: "#708097" }}>{selectedDocument.createdAt || ""}</div>
                </div>
                <a href={getFileDownloadUrl(selectedDocument.id)} target="_blank" rel="noreferrer" style={btnPrimary}>
                  Открыть / скачать
                </a>
              </div>
            )}
          </div>
        </div>
      </Modal>
    )}
    {showBillingModal && (
      <Modal title="Счета пациента" onClose={() => setShowBillingModal(false)} wide>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
            {[
              { label: "Всего", value: formatMoneyAmount(billingSummary?.total || 0) },
              { label: "Оплачено", value: formatMoneyAmount(billingSummary?.paid || 0) },
              { label: "Долг", value: formatMoneyAmount(billingSummary?.debt || 0) },
            ].map((item) => (
              <div key={item.label} style={{ border: "1px solid #e1e8f2", borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 11, color: "#708097", fontWeight: 800, textTransform: "uppercase" }}>{item.label}</div>
                <div style={{ marginTop: 6, fontSize: 16, fontWeight: 900, color: "#22324a" }}>{item.value}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {billingInvoices.map((invoice) => (
              <div key={invoice.id} style={{ border: "1px solid #e1e8f2", borderRadius: 12, padding: 12, display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#22324a" }}>{invoice.id}</div>
                  <div style={{ marginTop: 3, fontSize: 12, color: "#708097" }}>
                    {invoice.date || invoice.createdAt?.slice(0, 10)} · {invoiceStatusLabel(invoice.status)}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: "#22324a" }}>{formatMoneyAmount(invoice.total)}</div>
                  <div style={{ marginTop: 3, fontSize: 11, color: "#708097" }}>оплачено {formatMoneyAmount(invoice.paid)}</div>
                </div>
              </div>
            ))}
            {!billingInvoices.length && (
              <div style={{ padding: 24, textAlign: "center", color: "#708097", fontSize: 13 }}>Счетов пока нет</div>
            )}
          </div>
        </div>
      </Modal>
    )}
    {showPasswordModal && (
      <Modal title="Смена пароля" onClose={() => setShowPasswordModal(false)}>
        <form onSubmit={handlePasswordChange} style={{ display: "grid", gap: 12 }}>
          <Field label="Текущий пароль">
            <input
              type="password"
              value={passwordForm.currentPassword}
              onChange={(event) => setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))}
              style={inputStyle}
              autoComplete="current-password"
              required
            />
          </Field>
          <Field label="Новый пароль">
            <input
              type="password"
              value={passwordForm.nextPassword}
              onChange={(event) => setPasswordForm((prev) => ({ ...prev, nextPassword: event.target.value }))}
              style={inputStyle}
              autoComplete="new-password"
              minLength={4}
              required
            />
          </Field>
          <Field label="Повторите новый пароль">
            <input
              type="password"
              value={passwordForm.repeatPassword}
              onChange={(event) => setPasswordForm((prev) => ({ ...prev, repeatPassword: event.target.value }))}
              style={inputStyle}
              autoComplete="new-password"
              minLength={4}
              required
            />
          </Field>
          {passwordMessage && (
            <div style={{
              padding: "9px 11px",
              borderRadius: 10,
              background: passwordMessage.includes("обновлен") ? "#eefbf3" : "#fff1f2",
              color: passwordMessage.includes("обновлен") ? "#17643b" : "#b91c1c",
              fontSize: 12,
              fontWeight: 800,
            }}>
              {passwordMessage}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" onClick={() => setShowPasswordModal(false)} style={btnOutline}>Закрыть</button>
            <button type="submit" disabled={passwordSaving} style={btnPrimary}>
              {passwordSaving ? "Сохранение..." : "Сменить пароль"}
            </button>
          </div>
        </form>
      </Modal>
    )}
    </>
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
                        <button onClick={() => router.push(`/ai?patient=${p.id}`)} className="pat-action-btn" title="ИИ-прием">
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
