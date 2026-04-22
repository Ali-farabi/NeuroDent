"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import {
  searchPatients,
  getPatientById,
  createPatient,
  updatePatient,
} from "@/lib/api";

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[999]" onClick={onClose}>
      <div className="w-full max-w-[560px] bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <span className="font-bold text-base text-gray-900">{title}</span>
          <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition" onClick={onClose}>&times;</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

// ─── Patient Form (Create / Edit) ─────────────────────────────────────────────
function PatientForm({ mode, patient, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: patient?.name || "",
    phone: patient?.phone || "",
    email: patient?.email || "",
    address: patient?.address || "",
    birthDate: patient?.birthDate || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await onSave(form);
    } catch (err) {
      setError(err.message || "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  function field(name, label, type = "text", placeholder = "") {
    return (
      <div className="mb-3">
        <label className="text-xs text-gray-500 block mb-1">{label}</label>
        <input
          className="w-full px-3 py-2 border border-gray-200 bg-white text-sm rounded-lg focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition"
          type={type}
          placeholder={placeholder}
          value={form[name]}
          onChange={(e) => setForm((f) => ({ ...f, [name]: e.target.value }))}
        />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="font-bold text-base mb-4">{mode === "edit" ? "Изменить пациента" : "Создать пациента"}</div>
      {field("name", "Имя", "text")}
      {field("phone", "Телефон", "text", "8700...")}
      {field("email", "Email", "email", "example@mail.com")}
      {field("address", "Адрес", "text", "Город, улица, дом")}
      {field("birthDate", "Дата рождения", "date")}
      {error && <div className="text-red-500 text-sm mb-3">{error}</div>}
      <div className="flex gap-2 justify-end">
        <button type="button" className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition" onClick={onCancel}>Отмена</button>
        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50" disabled={saving}>
          {saving ? (mode === "edit" ? "Сохраняем..." : "Создаём...") : (mode === "edit" ? "Сохранить" : "Создать")}
        </button>
      </div>
      {error && <div className="text-red-500 text-sm mt-3">{error}</div>}
    </form>
  );
}

// ─── Patient Card (View with tabs) ────────────────────────────────────────────
function PatientCard({ patient }) {
  const { user } = useAuth();
  const isDoctor = user?.role === "doctor" || user?.role === "assistant";
  const [activeTab, setActiveTab] = useState("info");

  const tabs = [
    { key: "info", label: "Информация" },
    { key: "treatment", label: "Лечение" },
    { key: "visits", label: "Визиты" },
  ];

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-8 border-b border-gray-200 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`pb-3 text-sm cursor-pointer transition mb-[-1px] border-b-2 ${
              activeTab === t.key
                ? "font-semibold text-blue-600 border-blue-600"
                : "font-medium text-gray-400 border-transparent hover:text-gray-600"
            }`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Info Tab */}
      {activeTab === "info" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
          <div>
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
              Телефон
            </div>
            <div className="font-medium text-[15px] text-gray-900">{patient.phone}</div>
          </div>

          <div>
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
              Email
            </div>
            <div className="font-medium text-[15px] text-gray-900">{patient.email || "—"}</div>
          </div>

          <div>
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
              Дата рождения
            </div>
            <div className="font-medium text-[15px] text-gray-900">
              {patient.birthDate || "—"}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
              Адрес
            </div>
            <div className="font-medium text-[15px] text-gray-900">{patient.address || "—"}</div>
          </div>

          {!isDoctor ? (
            <div>
              <div className="flex items-center gap-2 text-gray-400 text-xs mb-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                Бонусные баллы
              </div>
              <div className="font-bold text-[15px] text-blue-600">175</div>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 text-gray-400 text-xs mb-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
                Статус
              </div>
              <div className="font-medium text-sm text-gray-900">Аллергий нет</div>
            </div>
          )}
        </div>
      )}

      {/* Treatment Tab */}
      {activeTab === "treatment" && (
        <div className="max-h-[400px] overflow-y-auto">
          {patient.treatments && patient.treatments.length > 0 ? patient.treatments.map((t, i) => (
            <div key={i} className="bg-white rounded-xl p-4 mb-4 border border-gray-200">
              <div className="font-semibold text-base text-gray-900 mb-1">{t.procedure}</div>
              <div className="text-[13px] text-gray-500 mb-1">Диагноз: {t.diagnosis}</div>
              <div className="text-[13px] text-gray-500 mb-3">Врач: {t.doctor} &bull; {t.date}</div>
              {!isDoctor && t.cost && <div className="font-semibold text-sm mb-4 text-gray-900">Стоимость: {t.cost} ₸</div>}
              {t.aiSummary && (
                <div className="bg-blue-50/40 p-3.5 rounded-lg text-[13px] border-l-2 border-blue-500">
                  <div className="flex items-center gap-1.5 text-blue-600 font-semibold mb-2 text-xs">🤖 AI Резюме</div>
                  <div className="leading-relaxed text-gray-700">{t.aiSummary}</div>
                </div>
              )}
            </div>
          )) : (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <span className="text-3xl opacity-50 mb-3">🦷</span>
              <span>История лечения пуста</span>
            </div>
          )}
        </div>
      )}

      {/* Visits Tab */}
      {activeTab === "visits" && (
        <div className="max-h-[400px] overflow-y-auto">
          {patient.visits && patient.visits.length > 0 ? patient.visits.map((v, i) => (
            <div key={i} className={`${i > 0 ? "border-t border-gray-200 pt-4 mt-4" : ""} ${v.status === "Завершен" ? "opacity-80" : ""}`}>
              <div className="flex items-center gap-3 mb-1.5">
                <div className="font-semibold text-sm text-gray-900">{v.date}</div>
                <div className="text-[13px] text-gray-400">{v.time}</div>
              </div>
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium text-[15px] text-gray-900 mb-0.5">{v.type}</div>
                  <div className="text-[13px] text-gray-500">{v.doctor}</div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${v.status === "Завершен" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                  {v.status}
                </span>
              </div>
            </div>
          )) : (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <span className="text-3xl opacity-50 mb-3">📅</span>
              <span>Нет запланированных визитов</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Patient Cabinet (role = patient) ─────────────────────────────────────────
function PatientCabinet() {
  const [downloading, setDownloading] = useState(false);
  return (
    <div className="p-5 max-w-[1000px] mx-auto flex flex-col gap-6">
      {/* Welcome */}
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-[28px] font-extrabold text-gray-900 m-0 mb-2">Добро пожаловать, Дамир! 👋</h1>
          <p className="text-[15px] text-gray-500 m-0">Ваша личная медицинская карта и история лечения</p>
        </div>
        <div className="bg-white px-5 py-3 rounded-xl border border-blue-200 flex items-center gap-3 shadow-sm">
          <div className="bg-green-100 p-2 rounded-full text-green-600">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
          </div>
          <div>
            <div className="text-xs text-gray-400 uppercase font-semibold">Ваши бонусы</div>
            <div className="text-xl font-extrabold text-gray-900">12 500 ₸</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* 3D Model */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-4 border-b border-gray-200 flex justify-between items-center">
            <div className="font-bold text-base text-gray-900">Ваша 3D-модель челюсти</div>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">Обновлено 15.01.2024</span>
          </div>
          <div className="bg-gray-900 h-[200px] flex items-center justify-center relative">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>
            <div className="absolute bottom-3 text-white/60 text-xs">Крутите для просмотра (Демо)</div>
          </div>
          <div className="p-4 grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] text-gray-400 mb-1">Фото ДО</div>
              <div className="h-[60px] bg-gray-50 rounded flex items-center justify-center text-xl">🦷</div>
            </div>
            <div>
              <div className="text-[11px] text-gray-400 mb-1">Фото ПОСЛЕ</div>
              <div className="h-[60px] bg-gray-50 rounded flex items-center justify-center text-xl">✨</div>
            </div>
          </div>
        </div>

        {/* Treatment History */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col">
          <div className="font-bold text-base mb-4">История лечения</div>
          <div className="flex flex-col gap-4 flex-1">
            <div className="border-l-2 border-blue-600 pl-3">
              <div className="text-xs text-blue-600 font-semibold mb-1">Вчера, 15:00</div>
              <div className="font-semibold text-sm mb-1">Лечение кариеса (Зуб 1.6)</div>
              <div className="text-[13px] text-gray-500 mb-2">Врач: Dr. Johnson &bull; Материал: Filtek Z250</div>
              <button
                className="text-xs px-2 py-1 border border-blue-500 text-blue-600 rounded hover:bg-blue-50 transition"
                disabled={downloading}
                onClick={() => { setDownloading(true); setTimeout(() => setDownloading(false), 2000); }}
              >
                {downloading ? "⏳ Скачивание..." : "📄 Скачать AI-Протокол (eGov)"}
              </button>
            </div>
            <div className="border-l-2 border-gray-300 pl-3 opacity-70">
              <div className="text-xs text-gray-400 font-semibold mb-1">15 Января 2024</div>
              <div className="font-semibold text-sm mb-1">Профессиональная чистка</div>
              <div className="text-[13px] text-gray-500">Врач: Dr. Smith</div>
            </div>
          </div>
          {/* Treatment plan */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="text-xs font-bold text-gray-400 uppercase mb-2">Ваш план лечения</div>
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-[13px]">
              Нужно удалить зуб мудрости (Зуб 4.8).<br />
              <span className="text-amber-600 font-semibold mt-1 inline-block">Позвоните нам: +7 771 163 2030</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Patient List (for owner/admin/doctor) ────────────────────────────────────
function PatientList() {
  const router = useRouter();
  const { user } = useAuth();
  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const timerRef = useRef(null);

  // Modal state
  const [modal, setModal] = useState(null); // { mode: "create"|"view"|"edit", patient? }

  // Read ?q= from URL
  const searchParams = useSearchParams();

  function loadPatients(query) {
    setLoading(true);
    setError("");
    searchPatients(query)
      .then((list) => { setPatients(list); })
      .catch((err) => setError(err.message || "Не удалось загрузить пациентов"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const q = searchParams.get("q") || "";
    if (q) setSearch(q);
    loadPatients(q);
  }, []);

  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => loadPatients(search), 250);
  }, [search]);

  const showAiBtn = user?.role === "doctor" || user?.role === "assistant" || user?.role === "owner";
  const showCreateBtn = user?.role !== "doctor";

  async function handleSave(form) {
    if (modal.mode === "create") {
      await createPatient(form);
    } else {
      await updatePatient(modal.patient.id, form);
    }
    setModal(null);
    loadPatients(search);
  }

  async function openViewModal(id) {
    try {
      const p = await getPatientById(id);
      setModal({ mode: "view", patient: p });
    } catch (err) {
      setModal({ mode: "error", error: err.message });
    }
  }

  async function openEditModal(id) {
    try {
      const p = await getPatientById(id);
      setModal({ mode: "edit", patient: p });
    } catch (err) {
      setModal({ mode: "error", error: err.message });
    }
  }

  return (
    <div className="p-4">
      {/* Toolbar */}
      <div className="flex gap-3 mb-4">
        <input
          className="flex-1 px-3 py-2.5 border border-gray-200 bg-white text-sm rounded-lg focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition"
          placeholder="Поиск по имени или телефону..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {showCreateBtn && (
          <button
            className="px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition flex items-center gap-2 shrink-0"
            onClick={() => setModal({ mode: "create" })}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Создать
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-3 py-10 text-gray-400">
          <span className="inline-block w-5 h-5 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
          <span>Загрузка пациентов...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center justify-center gap-2 py-10 text-red-500">
          <span className="text-xl">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && patients.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-gray-400">
          <span className="text-3xl mb-2">👤</span>
          <span>Пациенты не найдены</span>
        </div>
      )}

      {/* Patient list */}
      {!loading && patients.length > 0 && (
        <div className="flex flex-col gap-2">
          {patients.map((p) => (
            <div key={p.id} className="flex items-center gap-0 bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-sm transition">
              <div className="w-1 self-stretch bg-blue-600 shrink-0" />
              <div className="flex-1 min-w-0 px-4 py-3.5">
                <div className="font-semibold text-sm text-gray-900">{p.name}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  <span>{p.phone}</span>
                  {p.birthDate && <span> &bull; {p.birthDate}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1.5 pr-4 shrink-0">
                {showAiBtn && (
                  <button className="px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition flex items-center gap-1.5" onClick={() => router.push(`/ai?patient=${p.id}`)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a2 2 0 0 1 2 2c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2z" /><path d="M12 6v6l4 2" /></svg>
                    AI-Прием
                  </button>
                )}
                <button className="px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition flex items-center gap-1.5" onClick={() => openViewModal(p.id)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                  Просмотр
                </button>
                <button className="px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition flex items-center gap-1.5" onClick={() => openEditModal(p.id)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  Изменить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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
        <Modal title="Карточка пациента" onClose={() => setModal(null)}>
          <PatientCard patient={modal.patient} />
        </Modal>
      )}
      {modal?.mode === "error" && (
        <Modal title="Ошибка" onClose={() => setModal(null)}>
          <div className="text-red-500 text-center py-4">{modal.error}</div>
        </Modal>
      )}
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────
export default function PatientsPage() {
  const { user } = useAuth();
  if (user?.role === "patient") return <PatientCabinet />;
  return <PatientList />;
}
