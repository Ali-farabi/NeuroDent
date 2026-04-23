/* eslint-disable @next/next/no-img-element */
/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bot, Mic, CheckCircle2, AlertTriangle, Info, Sparkles, Upload, FileText, Key, Check, MicVocal } from "lucide-react";
import {
  searchPatients,
  getPatientById,
  getActiveAppointmentByPatient,
  finishVisit,
  getVisitsByPatient,
} from "@/lib/api";

const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const STATUS_ORDER = ["normal", "caries", "filling", "healthy", "removed", "missing"];
const TOOTH_IMG = {
  caries: "/images/teeth/RedCaries.png",
  filling: "/images/teeth/Yellowplomb.png",
  healthy: "/images/teeth/Greentooth.png",
  normal: "/images/teeth/Whitetooth.png",
  removed: "/images/teeth/Whitetooth.png",
  missing: "/images/teeth/Whitetooth.png",
};

const ICD_GROUPS = [
  { code: "K00", title: "K00 Нарушения развития и прорезывания зубов", items: [{ code: "K00.0", label: "K00.0 Нарушения прорезывания зубов" }] },
  { code: "K01", title: "K01 Ретинированные и импактные зубы", items: [{ code: "K01.0", label: "K01.0 Ретинированные зубы" }] },
  {
    code: "K02", title: "K02 Кариес зубов", open: true, items: [
      { code: "K02.0", label: "K02.0 Кариес эмали" },
      { code: "K02.1", label: "K02.1 Кариес дентина", active: true },
      { code: "K02.2", label: "K02.2 Кариес цемента" },
      { code: "K02.3", label: "K02.3 Приостановившийся кариес зубов" },
    ],
  },
  {
    code: "K03", title: "K03 Другие болезни твёрдых тканей зубов", items: [
      { code: "K03.0", label: "K03.0 Повышенное стирание зубов" },
      { code: "K03.1", label: "K03.1 Сошлифовывание зубов" },
      { code: "K03.2", label: "K03.2 Эрозия зубов" },
      { code: "K03.3", label: "K03.3 Патологическая резорбция зубов" },
      { code: "K03.4", label: "K03.4 Гиперцементоз" },
      { code: "K03.5", label: "K03.5 Анкилоз зубов" },
      { code: "K03.6", label: "K03.6 Отложения на зубах" },
      { code: "K03.7", label: "K03.7 Изменение цвета зубов" },
    ],
  },
  {
    code: "K04", title: "K04 Болезни пульпы и периапикальных тканей", items: [
      { code: "K04.0", label: "K04.0 Пульпит" },
      { code: "K04.1", label: "K04.1 Некроз пульпы" },
      { code: "K04.2", label: "K04.2 Дегенерация пульпы" },
      { code: "K04.3", label: "K04.3 Патологическое образование твёрдых тканей в пульпе" },
      { code: "K04.4", label: "K04.4 Острый апикальный периодонтит" },
      { code: "K04.5", label: "K04.5 Хронический апикальный периодонтит" },
      { code: "K04.6", label: "K04.6 Периапикальный абсцесс со свищом" },
      { code: "K04.7", label: "K04.7 Периапикальный абсцесс без свища" },
      { code: "K04.8", label: "K04.8 Корневая киста" },
    ],
  },
  {
    code: "K05", title: "K05 Гингивит и болезни пародонта", items: [
      { code: "K05.0", label: "K05.0 Острый гингивит" },
      { code: "K05.1", label: "K05.1 Хронический гингивит" },
      { code: "K05.2", label: "K05.2 Острый пародонтит" },
      { code: "K05.3", label: "K05.3 Хронический пародонтит" },
      { code: "K05.4", label: "K05.4 Пародонтоз" },
      { code: "K05.5", label: "K05.5 Другие болезни пародонта" },
    ],
  },
  {
    code: "K06", title: "K06 Другие изменения десны и альвеолярного края", items: [
      { code: "K06.0", label: "K06.0 Рецессия десны" },
      { code: "K06.1", label: "K06.1 Гипертрофия десны" },
      { code: "K06.2", label: "K06.2 Поражения десны и беззубого края" },
    ],
  },
  {
    code: "K07", title: "K07 Челюстно-лицевые аномалии", items: [
      { code: "K07.0", label: "K07.0 Аномалии размеров челюстей" },
      { code: "K07.1", label: "K07.1 Аномалии соотношения челюстей" },
      { code: "K07.2", label: "K07.2 Аномалии прикуса" },
      { code: "K07.3", label: "K07.3 Аномалии положения зубов" },
      { code: "K07.4", label: "K07.4 Аномалии прикуса неуточнённые" },
      { code: "K07.5", label: "K07.5 Болезни ВНЧС" },
    ],
  },
  {
    code: "K08", title: "K08 Другие изменения зубов и поддерживающих структур", items: [
      { code: "K08.0", label: "K08.0 Потеря зубов вследствие несчастного случая" },
      { code: "K08.1", label: "K08.1 Потеря зубов вследствие болезни" },
      { code: "K08.2", label: "K08.2 Атрофия беззубого альвеолярного края" },
      { code: "K08.3", label: "K08.3 Задержка корня зуба" },
      { code: "K08.8", label: "K08.8 Другие уточнённые изменения зубов" },
    ],
  },
];

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

// ─── Patient Selection ────────────────────────────────────────────────────────
function PatientSelectPage() {
  const router = useRouter();
  const [allPatients, setAllPatients] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    searchPatients("").then((list) => { setAllPatients(list); setFiltered(list); setLoading(false); });
  }, []);

  useEffect(() => {
    const q = search.trim().toLowerCase();
    setFiltered(allPatients.filter((p) => !q || p.name.toLowerCase().includes(q) || String(p.phone).includes(q)));
  }, [search, allPatients]);

  return (
    <div className="p-3 flex flex-col gap-3">
      <header>
        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">AI Clinical Assistant</h1>
        <p className="text-sm text-gray-500 mt-1">Автопротоколирование, МКБ-10 и анализ истории</p>
      </header>

      {/* Hero */}
      <div className="flex items-start gap-5 p-6 bg-white border border-gray-200 shadow-sm">
        <div className="text-5xl leading-none shrink-0 opacity-90"><img src="/images/teeth/Whitetooth.png" alt="" className="w-12 h-12 object-contain" /></div>
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight mb-2">Выберите пациента для приема</h2>
          <p className="text-sm text-gray-500 leading-relaxed">Чтобы AI-ассистент начал слушать и писать протокол, выберите пациента из базы.</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        <input
          type="text"
          className="w-full h-[52px] pl-12 pr-5 text-[15px] border border-gray-200 bg-white text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/20 transition"
          placeholder="Поиск по имени или телефону..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
        />
      </div>

      {/* List */}
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Найденные пациенты</h3>
        <div className="flex flex-col gap-3 max-h-[420px] overflow-y-auto">
          {loading ? (
            <div className="py-12 text-center text-sm text-gray-400 bg-white border border-gray-200">Загрузка...</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400 bg-white border border-gray-200">Пациенты не найдены</div>
          ) : (
            filtered.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-5 px-5 py-4 bg-white border border-gray-200 cursor-pointer hover:bg-gray-50 hover:border-blue-100 transition group" onClick={() => router.push(`/ai?patient=${p.id}`)}>
                <div className="min-w-0">
                  <div className="font-bold text-[15px] text-gray-900">{p.name}</div>
                  <div className="text-[13px] text-gray-500">Зарегистрирован: {p.createdAt || "—"} &bull; {p.phone}</div>
                </div>
                <button type="button" className="shrink-0 px-5 py-2.5 text-sm font-semibold text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 hover:border-blue-400 transition">Выбрать</button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tooth Button ─────────────────────────────────────────────────────────────
function ToothBtn({ n, status, isSelected, isHidden, bite, onClick }) {
  const imgStyle = (() => {
    if (status === "removed") return { filter: "grayscale(1) opacity(0.4)", transform: "scale(0.85)" };
    if (status === "missing") return { filter: "grayscale(1) opacity(0.2)", transform: "scale(0.75)" };
    if (bite === "milk") return { filter: "sepia(0.5) saturate(1.3) brightness(1.05)", transform: "scale(0.88)" };
    return {};
  })();

  const numStyle = (() => {
    if (status === "removed") return { color: "#ef4444", textDecoration: "line-through" };
    if (status === "missing") return { color: "#d1d5db", textDecoration: "line-through" };
    return {};
  })();

  const bgMap = {
    normal: "bg-gray-50",
    caries: "bg-red-50 border-red-300",
    filling: "bg-yellow-50 border-yellow-300",
    healthy: "bg-green-50 border-green-300",
    removed: "bg-red-50/50 border-red-200 border-dashed opacity-60",
    missing: "border-gray-300 border-dashed opacity-35",
  };

  if (isHidden) return null;

  return (
    <button
      type="button"
      className={`flex flex-col items-center p-0.5 rounded-[10px] cursor-pointer select-none transition-all duration-100 border border-transparent
        ${bgMap[status] || ""}
        ${isSelected ? "bg-blue-50 border-blue-300 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]" : ""}
        hover:bg-gray-100 hover:-translate-y-px`}
      onClick={onClick}
      title={`Зуб ${n}`}
    >
      <img src={TOOTH_IMG[status] || TOOTH_IMG.normal} alt={`Зуб ${n}`} className="w-[52px] h-[52px] object-cover object-[center_20%] rounded-md mix-blend-multiply transition-all duration-200" style={imgStyle} />
      <span className="text-[10px] text-gray-400" style={numStyle}>{n}</span>
    </button>
  );
}

// ─── ICD-10 Tree ──────────────────────────────────────────────────────────────
function IcdTree({ activeCode, onSelect }) {
  const [openGroups, setOpenGroups] = useState(() => {
    const m = {};
    ICD_GROUPS.forEach((g) => { m[g.code] = !!g.open; });
    return m;
  });
  const [search, setSearch] = useState("");
  const q = search.toLowerCase().trim();

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 max-h-[460px] flex flex-col gap-2">
      <div className="relative">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        <input type="text" className="w-full h-8 pl-8 pr-2.5 text-xs rounded-md border border-gray-200 bg-white focus:outline-none focus:border-blue-500" placeholder="Поиск по МКБ-10..." value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
      </div>
      <div className="flex-1 overflow-y-auto pr-1 text-xs custom-scrollbar">
        {ICD_GROUPS.map((group) => {
          const matchItems = group.items.filter((i) => !q || i.label.toLowerCase().includes(q));
          if (!q && !group.title.toLowerCase().includes(q) && matchItems.length === 0) return null;
          if (q && !group.title.toLowerCase().includes(q) && matchItems.length === 0) return null;
          const isOpen = q ? true : !!openGroups[group.code];
          return (
            <div key={group.code} className="rounded-md p-1">
              <button type="button" className="w-full flex items-center gap-1 border-none bg-transparent cursor-pointer text-xs px-1 py-0.5 text-left text-gray-900 hover:bg-gray-100 rounded" onClick={() => setOpenGroups((p) => ({ ...p, [group.code]: !p[group.code] }))}>
                <span className="text-[10px] text-gray-400">{isOpen ? "▼" : "▶"}</span>
                <span>{group.title}</span>
              </button>
              {isOpen && (
                <div className="ml-[18px] mt-0.5 flex flex-col gap-0.5">
                  {(q ? matchItems : group.items).map((item) => (
                    <button key={item.code} type="button" className={`border-none rounded px-1.5 py-1 text-left cursor-pointer transition text-xs ${activeCode === item.code ? "bg-blue-100 text-blue-700" : "bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-900"}`} onClick={() => onSelect(item.code, item.label)}>
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Surface Popup ────────────────────────────────────────────────────────────
function SurfacePopup({ tooth, surfaces, onToggle, onClose }) {
  if (!tooth) return null;
  const defs = [
    { key: "M", label: "М — Медиальная" },
    { key: "D", label: "Д — Дистальная" },
    { key: "O", label: "О — Жевательная" },
    { key: "V", label: "В — Вестибулярная" },
    { key: "L", label: "Я — Язычная" },
  ];
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-lg mt-2 w-full max-w-[260px]">
      <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Укажите поверхность</div>
      <div className="flex flex-col gap-1 mb-2.5">
        {defs.map((s) => (
          <button key={s.key} type="button" className={`px-2.5 py-1.5 text-xs border rounded-md text-left transition ${surfaces.includes(s.key) ? "bg-red-50 border-red-300 text-red-600 font-semibold" : "bg-gray-50 border-gray-200 text-gray-900 hover:bg-gray-100"}`} onClick={() => onToggle(s.key)}>
            {s.label}
          </button>
        ))}
      </div>
      <button type="button" className="w-full py-1.5 text-xs font-semibold border border-blue-500 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white transition" onClick={onClose}>&#10003; Готово</button>
    </div>
  );
}

// ─── AI Core Page ─────────────────────────────────────────────────────────────
function AiCorePage({ patientId }) {
  const router = useRouter();
  const [patientData, setPatientData] = useState(null);
  const [activeAppointment, setActiveAppointment] = useState(null);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState("protocol");

  // Tooth
  const [teeth, setTeeth] = useState({});
  const [selectedTooth, setSelectedTooth] = useState(null);
  const [surfacePopupTooth, setSurfacePopupTooth] = useState(null);
  const [activeSurfaces, setActiveSurfaces] = useState([]);
  const [jawFilter, setJawFilter] = useState("all");
  const [bite, setBite] = useState("permanent");

  // Form
  const [diagnosisText, setDiagnosisText] = useState("Кариес дентина (16)");
  const [complaints, setComplaints] = useState("Боль в верхней челюсти справа при приеме холодной пищи. Ноет со вчерашнего дня.");
  const [anamnesis, setAnamnesis] = useState("Зуб ранее не лечен.");
  const [objective, setObjective] = useState("Глубокая кариозная полость в зубе 1.6, размягченный дентин, зондирование болезненно.");
  const [treatment, setTreatment] = useState("Анестезия инфильтрационная, препарирование полости, медикаментозная обработка, постановка световой пломбы.");
  const [diagnosisCode, setDiagnosisCode] = useState("K02.1");
  const [cariesType, setCariesType] = useState("deep");

  // Voice
  const [isRecording, setIsRecording] = useState(false);
  const [aiStatus, setAiStatus] = useState("Слушаю...");
  const [recordingTime, setRecordingTime] = useState(0);
  const transcriptRef = useRef("");
  const timerRef = useRef(null);
  const recogRef = useRef(null);

  // Visit
  const [finishing, setFinishing] = useState(false);
  const [visitFinished, setVisitFinished] = useState(false);

  // Images
  const [images, setImages] = useState([]);
  const [activeImage, setActiveImage] = useState(null);
  const fileRef = useRef(null);
  const urlsRef = useRef([]);

  // Modal & eGov
  const [modal, setModal] = useState(null);
  const [egovSigned, setEgovSigned] = useState(false);

  // Toast
  const [toast, setToast] = useState(null);

  // Load data
  useEffect(() => {
    if (!patientId) return;
    Promise.all([getPatientById(patientId), getActiveAppointmentByPatient(patientId), getVisitsByPatient(patientId)])
      .then(([patient, appt, visitList]) => {
        setPatientData(patient);
        setActiveAppointment(appt);
        setVisits(visitList);
        if (appt?.visitId) setVisitFinished(true);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [patientId]);

  // Default image
  useEffect(() => {
    if (!loading && patientData) {
      const url = "/images/examplecoreai.png";
      setImages([{ id: "default", url }]);
      setActiveImage(url);
    }
  }, [loading, patientData]);

  // Cleanup
  useEffect(() => () => urlsRef.current.forEach((u) => URL.revokeObjectURL(u)), []);

  // Timer
  useEffect(() => {
    if (isRecording) {
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3500);
      return () => clearTimeout(t);
    }
  }, [toast]);

  function showToast(msg) {
    setToast(msg);
  }

  function startRecording() {
    transcriptRef.current = "";
    setIsRecording(true);
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      const r = new SR();
      r.lang = "ru-RU";
      r.continuous = true;
      r.interimResults = true;
      r.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) { transcriptRef.current += t + " "; setComplaints(transcriptRef.current.trim()); }
          else interim = t;
        }
        if (interim) setAiStatus(interim);
      };
      r.onerror = (e) => setAiStatus(`Ошибка: ${e.error}`);
      r.onend = () => { if (isRecording) try { r.start(); } catch {} };
      r.start();
      recogRef.current = r;
    }
  }

  function stopRecording() {
    setIsRecording(false);
    if (recogRef.current) { recogRef.current.stop(); recogRef.current = null; }
    const text = transcriptRef.current.trim();
    if (text.length < 5) { setAiStatus("Слушаю..."); return; }
    setAiStatus("Запись сохранена");
    if (!complaints.trim()) setComplaints(text);
    const low = text.toLowerCase();
    if (low.includes("глубок")) setCariesType("deep");
    else if (low.includes("средн")) setCariesType("medium");
    else if (low.includes("поверхностн")) setCariesType("surface");
    else if (low.includes("пульпит") || low.includes("осложн")) setCariesType("complicated");
    if (low.includes("пульпит")) setDiagnosisCode("K04.0");
    else if (low.includes("периодонтит")) setDiagnosisCode("K04.4");
    else if (low.includes("глубок")) setDiagnosisCode("K02.1");
    else if (low.includes("поверхностн") || low.includes("эмал")) setDiagnosisCode("K02.0");
    if ((low.includes("полость") || low.includes("зондирование")) && !objective.trim()) setObjective(text);
    if ((low.includes("ранее") || low.includes("лечил") || low.includes("не лечил")) && !anamnesis.trim()) setAnamnesis("Со слов пациента: " + text);
    showToast("Запись завершена — поля протокола заполнены из речи");
  }

  function handleToothClick(n, cur) {
    setSelectedTooth(n);
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(cur) + 1) % STATUS_ORDER.length];
    setTeeth((p) => ({ ...p, [n]: next }));
    if (next === "caries") { setSurfacePopupTooth(n); setActiveSurfaces([]); } else setSurfacePopupTooth(null);
    setDiagnosisText((p) => `${p.replace(/\(\d{1,2}\)\s*$/u, "").trim()} (${n})`.trim());
  }

  function handleSurfaceClose() {
    if (activeSurfaces.length) setDiagnosisText(`Кариес дентина (${surfacePopupTooth}) — пов.: ${activeSurfaces.join(", ")}`);
    setSurfacePopupTooth(null);
  }

  function exportToothFormula() {
    const r = {};
    [...UPPER, ...LOWER].forEach((n) => { r[n] = { status: teeth[n] || "normal" }; });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }));
    a.download = "tooth_formula.json";
    a.click();
  }

  function readVisitData() {
    return {
      complaint: complaints, diagnosis: diagnosisText, notes: treatment,
      diagnosisCode, cariesType, toothNumber: selectedTooth ? String(selectedTooth) : "",
      protocol: { complaints, anamnesis, objective, diagnosisText, treatment },
      materials: [
        { code: "ultracain", name: "Ultracain D-S forte 1.7ml", qty: 1, unit: "амп" },
        { code: "filtek", name: "Filtek Z250 (шприц)", qty: 1, unit: "шт" },
      ],
    };
  }

  async function handleFinishVisit() {
    if (!activeAppointment?.id) { alert("Запись не найдена."); return; }
    setFinishing(true);
    try {
      await finishVisit(activeAppointment.id, readVisitData());
      setVisitFinished(true);
      showToast("Автосписание со склада: Ultracain (1), Filtek Z250 (1)");
    } catch (err) { alert(err.message); } finally { setFinishing(false); }
  }

  function handleImageUpload(e) {
    const f = e.target.files?.[0];
    if (!f?.type.startsWith("image/")) return;
    const url = URL.createObjectURL(f);
    urlsRef.current.push(url);
    setImages((p) => [...p, { id: `img_${Date.now()}`, url }]);
    setActiveImage(url);
    e.target.value = "";
  }

  function handleDeleteImage(id) {
    setImages((p) => {
      const rm = p.find((i) => i.id === id);
      const next = p.filter((i) => i.id !== id);
      if (activeImage === rm?.url) setActiveImage(next.length ? next[next.length - 1].url : null);
      return next;
    });
  }

  const cariesHints = {
    surface: "Для поверхностного кариеса рекомендована реминерализующая терапия.",
    medium: "Для среднего кариеса — препарирование и пломбирование Filtek Z250.",
    deep: "Для K02.1 рекомендовано применение биоактивных прокладок (MTA) при глубоком кариесе.",
    complicated: "Осложнённый кариес — требуется эндодонтическое лечение (пульпит/периодонтит).",
  };

  if (loading) return <div className="p-6 text-center text-gray-400">Загрузка...</div>;
  if (!patientData) return <div className="p-6 text-center text-gray-400">Пациент не найден</div>;

  const tabs = [
    { key: "protocol", label: "AI Протокол" },
    { key: "images", label: "Изображения" },
    { key: "materials", label: "Материалы" },
    { key: "services", label: "Оказанные услуги" },
    { key: "history", label: "История болезни" },
    { key: "plans", label: "Планы лечения" },
    { key: "add", label: "+" },
  ];

  const counts = { normal: 0, caries: 0, filling: 0, healthy: 0, removed: 0, missing: 0 };
  [...UPPER, ...LOWER].forEach((n) => { const s = teeth[n] || "normal"; if (counts[s] !== undefined) counts[s]++; });

  const legend = [
    { key: "caries", bg: "bg-red-100 border-red-300", label: "Кариес", c: counts.caries },
    { key: "filling", bg: "bg-yellow-100 border-yellow-300", label: "Пломба", c: counts.filling },
    { key: "healthy", bg: "bg-green-100 border-green-300", label: "Здоров", c: counts.healthy },
    { key: "normal", bg: "bg-gray-50 border-gray-200", label: "Норма", c: counts.normal },
    { key: "removed", bg: "bg-red-50 border-red-200 border-dashed", label: "Удалён", c: counts.removed },
    { key: "missing", bg: "bg-transparent border-gray-300 border-dashed", label: "Отсутствует", c: counts.missing },
  ];

  return (
    <div className="p-3 flex flex-col gap-3">
      {/* Header */}
      <div className="flex justify-between items-end gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-[22px] font-extrabold tracking-tight text-gray-900 m-0">
            <img src="/images/Medimetricslogotype.png" alt="Neurodent" className="w-[34px] h-[34px]" />
            <span>AI Clinical Assistant</span>
          </h1>
          <p className="text-[13px] text-gray-500 m-0">Автопротоколирование, МКБ-10, тип кариеса и зубная формула</p>
        </div>
        <div className="flex gap-2.5 flex-wrap">
          <button className="px-3.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition flex items-center gap-1.5" onClick={() => router.push("/ai")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            Сменить пациента
          </button>
          <button
            className={`px-3.5 py-2 text-sm font-medium text-white rounded-lg flex items-center gap-2 transition shadow-lg ${isRecording ? "bg-red-600 shadow-red-500/30" : "bg-red-500 hover:bg-red-600 shadow-red-500/30"}`}
            onClick={isRecording ? stopRecording : startRecording}
          >
            {isRecording ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                Остановить ({String(Math.floor(recordingTime / 60)).padStart(2, "0")}:{String(recordingTime % 60).padStart(2, "0")})
              </>
            ) : (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                Слушать прием (Запись голоса)
              </>
            )}
          </button>
        </div>
      </div>

      {/* Tabs — горизонтал scroll мобайлда */}
      <div style={{
        display: "flex", flexWrap: "nowrap", gap: 4, overflowX: "auto",
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 99, padding: 4, scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            style={{
              padding: "6px 14px", borderRadius: 99, border: "none",
              background: activeTab === t.key ? "var(--primary)" : "transparent",
              color: activeTab === t.key ? "#fff" : "var(--muted)",
              fontWeight: activeTab === t.key ? 600 : 400,
              fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
              transition: "all 0.15s",
            }}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── PROTOCOL TAB ─── */}
      {activeTab === "protocol" && (
        <div className="p-5 max-w-[1200px] mx-auto flex flex-col gap-5">
          {/* Patient info */}
          <div className="flex justify-between items-end flex-wrap gap-4">
            <div>
              <div className="text-base font-bold text-gray-900 mb-0.5">{patientData.name}</div>
              <div className="text-xs text-gray-500">Взрослый &bull; {patientData.phone}</div>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">Риск: Низкий</span>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-600 border border-amber-200 flex items-center gap-1"><AlertTriangle size={12} /> Жалоба: боль в 1.6</span>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-600 border border-sky-200 flex items-center gap-1"><Info size={12} /> МКБ-10: K02.1</span>
            </div>
          </div>

          {/* AI Summary */}
          <div className="w-full bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="text-[11px] font-bold text-blue-600 uppercase mb-2 flex items-center gap-1"><Sparkles size={12} /> AI-Summary пациента</div>
            <div className="text-[13px] text-gray-700 leading-relaxed">Аллергий нет. Последний визит 6 месяцев назад (чистка). В прошлом лечился пульпит зуба 46. Возможна чувствительность эмали.</div>
          </div>

          {/* Tooth Formula */}
          <div className="w-full bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex justify-between items-center mb-3 gap-3 flex-wrap">
              <div className="font-bold text-sm text-gray-900">Зубная формула</div>
              <div className="flex gap-1.5 flex-wrap">
                {[{ k: "all", l: "Полость рта" }, { k: "upper", l: "Верхняя челюсть" }, { k: "lower", l: "Нижняя челюсть" }].map((f) => (
                  <button key={f.k} type="button" className={`px-2.5 py-1 text-[11px] rounded-full border cursor-pointer transition ${jawFilter === f.k ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100"}`} onClick={() => setJawFilter(f.k)}>
                    {f.l}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1.5 mb-2.5">
              <span className="text-xs text-gray-500">Прикус:</span>
              <button type="button" className={`px-3 py-1 text-[11px] border rounded-full cursor-pointer transition ${bite === "permanent" ? "bg-blue-50 border-blue-500 text-blue-700 font-semibold" : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"}`} onClick={() => setBite("permanent")}>Постоянный</button>
              <button type="button" className={`px-3 py-1 text-[11px] border rounded-full cursor-pointer transition ${bite === "milk" ? "bg-amber-50 border-amber-500 text-amber-600 font-semibold" : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"}`} onClick={() => setBite("milk")}>Молочный</button>
            </div>

            <div className="flex flex-col gap-1.5 overflow-x-auto pb-2">
              {jawFilter !== "lower" && (
                <>
                  <div className="text-[11px] text-gray-400 mt-1">Верхняя челюсть</div>
                  <div className="flex flex-nowrap gap-1 min-w-max">
                    {UPPER.map((n) => <ToothBtn key={n} n={n} status={teeth[n] || "normal"} isSelected={String(selectedTooth) === String(n)} isHidden={false} bite={bite} onClick={() => handleToothClick(n, teeth[n] || "normal")} />)}
                  </div>
                </>
              )}
              {jawFilter !== "upper" && (
                <>
                  <div className="text-[11px] text-gray-400 mt-1">Нижняя челюсть</div>
                  <div className="flex flex-nowrap gap-1 min-w-max">
                    {LOWER.map((n) => <ToothBtn key={n} n={n} status={teeth[n] || "normal"} isSelected={String(selectedTooth) === String(n)} isHidden={false} bite={bite} onClick={() => handleToothClick(n, teeth[n] || "normal")} />)}
                  </div>
                </>
              )}
            </div>

            {surfacePopupTooth && <SurfacePopup tooth={surfacePopupTooth} surfaces={activeSurfaces} onToggle={(k) => setActiveSurfaces((p) => p.includes(k) ? p.filter((s) => s !== k) : [...p, k])} onClose={handleSurfaceClose} />}

            <div className="flex flex-wrap gap-2.5 mt-2.5 text-[11px] text-gray-400">
              {legend.map((l) => (
                <div key={l.key} className="flex items-center gap-1">
                  <span className={`w-2.5 h-2.5 rounded-full border ${l.bg}`} />
                  {l.label}
                  <span className="text-[10px] font-semibold bg-gray-50 border border-gray-200 rounded px-1.5 py-px text-gray-500 min-w-[16px] text-center">{l.c}</span>
                </div>
              ))}
              <div className="ml-auto">
                <button type="button" className="px-2.5 py-1 text-[11px] border border-gray-200 rounded-md bg-white text-gray-700 hover:bg-gray-50 hover:border-blue-500 hover:text-blue-600 transition cursor-pointer flex items-center gap-1" onClick={exportToothFormula}><Upload size={11} /> JSON</button>
              </div>
            </div>
            <div className="text-[11px] text-gray-400 text-right mt-1">
              {bite === "milk" ? "Молочный прикус" : "Постоянный прикус"}
            </div>
          </div>

          {/* AI Protocol + ICD */}
          <div className="w-full bg-white border-2 border-blue-100 rounded-xl p-5 shadow-[0_8px_30px_rgba(37,99,235,0.08)]">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                {isRecording && <span className="inline-block w-3.5 h-3.5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />}
                <span className="font-bold text-blue-600 text-[15px]">AI-Автопротокол</span>
              </div>
              <span className="text-[11px] text-gray-400 bg-gray-50 px-2 py-1 rounded">{aiStatus}</span>
            </div>

            <div className="grid grid-cols-[1.4fr_1.2fr] gap-4 items-start max-[992px]:grid-cols-1">
              {/* Form */}
              <div className="flex flex-col gap-2.5">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-gray-500">Диагноз</label>
                  <input className="w-full px-3 py-2 border border-gray-200 bg-white text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition rounded-lg" value={diagnosisText} onChange={(e) => setDiagnosisText(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-gray-500">Жалобы</label>
                  <textarea className="w-full px-3 py-2 border border-gray-200 bg-white text-sm resize-y min-h-[72px] leading-relaxed focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition rounded-lg" rows={2} value={complaints} onChange={(e) => setComplaints(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-gray-500">Анамнез</label>
                  <textarea className="w-full px-3 py-2 border border-gray-200 bg-white text-sm resize-y min-h-[72px] leading-relaxed focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition rounded-lg" rows={2} value={anamnesis} onChange={(e) => setAnamnesis(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-gray-500">Объективно</label>
                  <textarea className="w-full px-3 py-2 border border-gray-200 bg-white text-sm resize-y min-h-[72px] leading-relaxed focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition rounded-lg" rows={3} value={objective} onChange={(e) => setObjective(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-gray-500">Лечение</label>
                  <textarea className="w-full px-3 py-2 border border-gray-200 bg-white text-sm resize-y min-h-[72px] leading-relaxed focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition rounded-lg" rows={3} value={treatment} onChange={(e) => setTreatment(e.target.value)} />
                </div>

                <div className="grid grid-cols-[1.1fr_1.3fr] gap-2 max-[992px]:grid-cols-1">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-gray-500">МКБ-10</label>
                    <select className="w-full h-8 px-2.5 text-xs border border-gray-200 bg-white rounded-lg focus:border-blue-500 focus:outline-none" value={diagnosisCode} onChange={(e) => setDiagnosisCode(e.target.value)}>
                      <option value="">Не выбрано</option>
                      <option value="K02.0">K02.0 — Кариес эмали</option>
                      <option value="K02.1">K02.1 — Кариес дентина</option>
                      <option value="K02.2">K02.2 — Кариес цемента</option>
                      <option value="K04.0">K04.0 — Острый пульпит</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-gray-500">Тип кариеса</label>
                    <div className="flex flex-wrap gap-1.5">
                      {[{ k: "surface", l: "Поверхностный" }, { k: "medium", l: "Средний" }, { k: "deep", l: "Глубокий" }, { k: "complicated", l: "Осложнённый" }].map((c) => (
                        <button key={c.k} type="button" className={`px-2.5 py-1 text-[11px] rounded-full border cursor-pointer transition ${cariesType === c.k ? "bg-blue-50 border-blue-500 text-blue-700 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]" : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"}`} onClick={() => setCariesType(c.k)}>
                          {c.l}
                        </button>
                      ))}
                    </div>
                    {cariesType && <div className="text-[11px] text-gray-400 mt-1">{cariesHints[cariesType]}</div>}
                  </div>
                </div>

                <div className="flex flex-col gap-2 mt-2">
                  {visitFinished ? (
                    <div className="text-center py-4 bg-green-50 rounded-lg text-green-600 font-semibold flex items-center justify-center gap-2"><CheckCircle2 size={18} /> Прием завершен и материалы списаны</div>
                  ) : (
                    <button className="w-full py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50 flex items-center justify-center gap-2" disabled={finishing} onClick={handleFinishVisit}>
                      {finishing ? (
                        <><span className="inline-block w-3.5 h-3.5 border-2 border-white border-r-transparent rounded-full animate-spin" /> Сохранение...</>
                      ) : "Завершить прием и списать материалы"}
                    </button>
                  )}
                  <div className="grid grid-cols-2 gap-2 max-[992px]:grid-cols-1">
                    <button className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition" onClick={() => {
                      setModal({ title: "Экспорт в PDF", phase: "loading" });
                      setTimeout(() => setModal((p) => p ? { ...p, phase: "done" } : null), 1800);
                    }}> <FileText size={14} /> Экспорт PDF</button>
                    <button
                      className={`px-3 py-2 text-sm font-medium rounded-lg transition ${egovSigned ? "bg-green-50 border border-green-300 text-green-600 cursor-default" : "text-gray-700 bg-white border border-gray-200 hover:bg-gray-50"}`}
                      onClick={egovSigned ? undefined : () => setModal({ title: "Подписание через eGov (ЭЦП)", phase: "select" })}
                    >
                      {egovSigned ? <span className="flex items-center gap-1"><CheckCircle2 size={14} /> Подписано ЭЦП</span> : <span className="flex items-center gap-1"><Key size={14} /> Подпись eGov</span>}
                    </button>
                  </div>
                </div>
              </div>

              {/* ICD */}
              <IcdTree activeCode={diagnosisCode} onSelect={(code, label) => { setDiagnosisCode(code); setDiagnosisText(label); }} />
            </div>
          </div>
        </div>
      )}

      {/* ─── IMAGES TAB ─── */}
      {activeTab === "images" && (
        <div className="p-6 max-w-full mx-auto flex flex-col gap-5">
          <input type="file" ref={fileRef} accept="image/*" className="hidden" onChange={handleImageUpload} />
          <div className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 text-gray-400 cursor-pointer hover:border-blue-500 hover:bg-blue-50/30 hover:text-blue-500 transition" onClick={() => fileRef.current?.click()}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            <span className="text-sm font-medium">Прикрепить фото</span>
          </div>
          <div className="text-center text-[15px] font-semibold text-gray-900">Август 2022</div>
          <div className="w-full max-w-[560px] mx-auto rounded-xl overflow-hidden bg-gray-50 border border-gray-200">
            <div className={`w-full overflow-hidden mb-2.5 ${!activeImage ? "flex items-center justify-center pt-5" : ""}`}>
              {!activeImage ? <span className="text-[13px] text-gray-400">Нет изображений</span> : <img src={activeImage} alt="ОПТГ" className="w-full h-auto max-h-[360px] object-contain block" />}
            </div>
            <div className="flex flex-wrap gap-2 justify-center mb-2.5">
              {images.map((img) => (
                <div key={img.id} className="relative inline-block">
                  <img src={img.url} alt="thumb" className={`w-24 h-16 object-cover rounded-md border cursor-pointer bg-gray-50 ${activeImage === img.url ? "border-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.2)]" : "border-gray-200"}`} onClick={() => setActiveImage(img.url)} />
                  <button type="button" className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full border-none bg-black/65 text-white text-xs flex items-center justify-center cursor-pointer hover:bg-red-600 transition" onClick={() => handleDeleteImage(img.id)}>×</button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5 items-center pt-2 border-t border-gray-200">
            <button className="px-4 py-2 text-[13px] font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition">Назад</button>
            <button className="px-4 py-2 text-[13px] font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition">Назначить повторный прием</button>
            <button className="px-4 py-2 text-[13px] font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition">Распечатать</button>
            <button className="px-4 py-2 text-[13px] font-medium bg-red-600 text-white border-none rounded-lg hover:bg-red-700 transition cursor-pointer">Удалить полностью карточку</button>
            <button className="px-5 py-2 text-[13px] font-medium bg-blue-600 text-white border-none rounded-lg hover:bg-blue-700 transition cursor-pointer ml-auto">Сохранить</button>
          </div>
        </div>
      )}

      {/* ─── MATERIALS TAB ─── */}
      {activeTab === "materials" && (
        <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm">
          <h3 className="text-base font-bold text-gray-900 mt-0 mb-1.5">Материалы (AI)</h3>
          <p className="text-[13px] text-gray-500 mb-2.5">Пока статический список. В будущем будет связан со складом.</p>
          <div className="flex flex-col gap-2 mt-1">
            {[
              { name: "Ultracain D-S forte 1.7ml", meta: "Анестезия • 1 амп." },
              { name: "Filtek Z250", meta: "Пломбировочный материал • 1 шт." },
              { name: "Коффердам / матрицы / клинья", meta: "Расходники" },
            ].map((m, i) => (
              <div key={i} className="flex items-center gap-2 justify-between text-xs px-2.5 py-2 rounded-md bg-gray-50">
                <span className="flex-1">{m.name}</span>
                <span className="text-[11px] text-gray-500">{m.meta}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── SERVICES TAB ─── */}
      {activeTab === "services" && (
        <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm">
          <h3 className="text-base font-bold text-gray-900 mt-0 mb-1.5">Оказанные услуги</h3>
          <p className="text-[13px] text-gray-500 mb-2.5">Услуги по визиту (пока mock-структура).</p>
          <div className="flex flex-col gap-2 mt-1">
            {[
              { code: "ST-01", name: "Лечение кариеса дентина зуба 1.6", price: "25 000 ₸" },
              { code: "ST-02", name: "Анестезия инфильтрационная", price: "3 000 ₸" },
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-2 justify-between text-xs px-2.5 py-2 rounded-md bg-gray-50">
                <span className="font-semibold text-[11px] text-blue-700">{s.code}</span>
                <span className="flex-1">{s.name}</span>
                <span className="text-[11px] text-gray-500">{s.price}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── HISTORY TAB ─── */}
      {activeTab === "history" && (
        <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm">
          <h3 className="text-base font-bold text-gray-900 mt-0 mb-1.5">История болезни</h3>
          <p className="text-[13px] text-gray-500 mb-2.5">Визиты пациента по данным Core AI.</p>
          <div className="flex flex-col gap-1.5 mt-1.5">
            {visits.length === 0 ? (
              <div className="text-xs text-gray-400">Пока нет завершённых визитов</div>
            ) : visits.map((v) => (
              <div key={v.id} className="text-xs px-2.5 py-2 rounded-md bg-gray-50 flex flex-col gap-0.5">
                <div className="flex justify-between gap-2">
                  <span className="font-semibold">{v.diagnosis || "Без диагноза"}</span>
                  <span className="text-[11px] text-gray-500">{v.startedAt?.slice(0, 10)} {v.startedAt?.slice(11, 16)}</span>
                </div>
                <div className="text-[11px] text-gray-500">Тип кариеса: {v.cariesType || "—"}{v.diagnosisCode ? ` • ${v.diagnosisCode}` : ""}{v.toothNumber ? ` • зуб ${v.toothNumber}` : ""}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── PLANS TAB ─── */}
      {activeTab === "plans" && (
        <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm">
          <h3 className="text-base font-bold text-gray-900 mt-0 mb-1.5">Планы лечения</h3>
          <p className="text-[13px] text-gray-500 mb-2.5">Предварительный план по зубам.</p>
          <div className="flex flex-col gap-2 mt-1">
            {[
              { tooth: "1.6", text: "Контроль пломбы через 6 месяцев" },
              { tooth: "3.6", text: "Диагностика и при необходимости лечение кариеса" },
            ].map((p, i) => (
              <div key={i} className="flex items-center gap-2 justify-between text-xs px-2.5 py-2 rounded-md bg-gray-50">
                <span className="font-semibold text-[11px] text-blue-700">{p.tooth}</span>
                <span className="flex-1">{p.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <Modal title={modal.title} onClose={() => setModal(null)}>
          {modal.title.includes("PDF") && modal.phase === "loading" && (
            <div className="text-center p-5">
              <div className="text-base font-semibold mb-3">Проверка протокола перед экспортом</div>
              <div className="text-[13px] text-gray-500 mb-2"><b>Диагноз:</b> {diagnosisText || "—"}</div>
              <div className="text-[13px] text-gray-500 mb-2"><b>МКБ-10:</b> {diagnosisCode || "—"} &bull; <b>Тип кариеса:</b> {cariesType || "—"}</div>
              <div className="text-[13px] text-gray-500 mb-4"><b>Зуб:</b> {selectedTooth || "—"}</div>
              <span className="inline-block w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
              <div className="text-[13px] text-gray-400">Формируем амбулаторную карту (Форма №043/у)...</div>
            </div>
          )}
          {modal.title.includes("PDF") && modal.phase === "done" && (
            <div className="text-center p-5">
              <div className="text-4xl mb-4 flex justify-center"><CheckCircle2 size={48} className="text-green-500" /></div>
              <div className="text-base font-semibold mb-3">PDF успешно сформирован</div>
              <div className="text-[13px] text-gray-400 mb-6">Документ автоматически сохранен в карту пациента и скачан.</div>
              <button className="w-full px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition" onClick={() => setModal(null)}>Закрыть</button>
            </div>
          )}
          {modal.title.includes("eGov") && modal.phase === "select" && (
            <div className="p-2.5">
              <div className="text-[13px] text-gray-500 mb-2">Документ для подписи сформирован на основе AI-протокола:</div>
              <div className="text-[13px] text-gray-500 mb-3"><b>МКБ-10:</b> {diagnosisCode || "—"} &bull; <b>Тип кариеса:</b> {cariesType || "—"} &bull; <b>Зуб:</b> {selectedTooth || "—"}</div>
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer bg-gray-50 mb-5 hover:border-blue-500 hover:bg-blue-50/30 transition" onClick={() => setModal((p) => p ? { ...p, phase: "password" } : null)}>
                <div className="text-2xl mb-2 flex justify-center"><Key size={32} className="text-blue-600" /></div>
                <div className="font-semibold text-sm text-blue-600">Выбрать файл ЭЦП</div>
                <div className="text-[11px] text-gray-400 mt-1">.p12 или .cer</div>
              </div>
            </div>
          )}
          {modal.title.includes("eGov") && modal.phase === "password" && (
            <div className="p-2.5">
              <div className="text-[13px] text-gray-500 mb-3"><b>МКБ-10:</b> {diagnosisCode || "—"} &bull; <b>Тип кариеса:</b> {cariesType || "—"} &bull; <b>Зуб:</b> {selectedTooth || "—"}</div>
              <div className="border border-green-300 rounded-lg p-4 text-center mb-4 bg-green-50/50">
                <span className="text-green-600 mr-2 flex items-center"><Check size={16} /></span>
                <span className="font-semibold text-[13px]">GOSTKNCA_xxxxxxxx.p12 выбран</span>
              </div>
              <div className="mb-4">
                <label className="text-xs font-semibold block mb-2">Пароль от хранилища ключей:</label>
                <input type="password" className="w-full px-3 py-2 border border-gray-200 bg-white text-sm rounded-lg" placeholder="Введите пароль..." defaultValue="123456" />
              </div>
              <button className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition" onClick={() => {
                setModal((p) => p ? { ...p, phase: "signing" } : null);
                setTimeout(() => { setEgovSigned(true); setModal(null); }, 1500);
              }}>Подписать документ</button>
            </div>
          )}
          {modal.title.includes("eGov") && modal.phase === "signing" && (
            <div className="text-center p-5">
              <span className="inline-block w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              <div className="mt-3 text-[13px] text-gray-400">Подписание...</div>
            </div>
          )}
        </Modal>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 right-5 bg-white border border-gray-200 shadow-xl px-4 py-3.5 rounded-xl z-[9999] flex items-center gap-3 text-[13px] animate-[fadeIn_0.2s_ease]">
          <span className="text-xl"><MicVocal size={22} /></span>
          <div>
            <div className="font-semibold">{toast}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────
function AiPageContent() {
  const searchParams = useSearchParams();
  const patientId = searchParams.get("patient");
  if (!patientId) return <PatientSelectPage />;
  return <AiCorePage patientId={patientId} />;
}

export default function AiPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: "var(--muted)", fontSize: 14 }}>Жүктелуде...</div>}>
      <AiPageContent />
    </Suspense>
  );
}
