/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect, useRef, Suspense, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  searchPatients,
  getPatientById,
  getActiveAppointmentByPatient,
  startVisit,
  finishVisit,
  getVisitsByPatient,
  getVisitServices,
  getPatientAiContext,
  analyzeClinicalTranscript,
  draftClinicalProtocol,
  savePatientToothChart,
  createPatientProtocolDocument,
  getFiles,
  getFileDownloadUrl,
  getIcd10Reference,
  signDocument,
  uploadFile,
  deleteFile,
  getInventoryItems,
} from "@/lib/api";
import {
  Bot,
  Mic,
  MicOff,
  CheckCircle2,
  AlertTriangle,
  Info,
  Sparkles,
  Upload,
  FileText,
  Key,
  Check,
  ChevronLeft,
  Search,
  ArrowUpFromLine,
  FileDown,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Patient {
  id: string;
  name: string;
  phone: string;
  birthDate?: string;
  createdAt?: string;
}

interface Appointment {
  id: string;
  doctorId: string;
  patientId: string;
  date: string;
  time: string;
  duration: number;
  status: string;
  visitId: string | null;
  patientName?: string;
  doctorName?: string;
}

interface Visit {
  id: string;
  diagnosis?: string;
  complaint?: string;
  notes?: string;
  startedAt?: string;
  diagnosisCode?: string;
  cariesType?: string;
  toothNumber?: string;
}

interface VisitService {
  code: string;
  name: string;
  price: number;
  toothNumber?: string;
}

type ToothStatus = "normal" | "caries" | "filling" | "healthy" | "removed" | "missing";
type BiteType = "permanent" | "milk";
type JawFilter = "all" | "upper" | "lower";
type CariesType = "surface" | "medium" | "deep" | "complicated";
type ModalPhase = "loading" | "done" | "select" | "password" | "signing";

interface ModalState {
  title: string;
  phase: ModalPhase;
}

interface ToothImageItem {
  id: string;
  url: string;
}

interface PatientFile {
  id: string;
  name?: string;
  originalName?: string;
  fileName?: string;
  type?: string;
  kind?: string;
  category?: string;
  visitId?: string;
  mimeType?: string;
  mimeGroup?: string;
  downloadUrl?: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  signatureStatus?: string;
  signedAt?: string;
  createdAt?: string;
}

interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category?: string;
}

function normalizePatientFileKind(file: PatientFile | null | undefined) {
  return String(file?.kind || file?.category || file?.type || "").toLowerCase();
}

function findPatientFile(files: PatientFile[], kind: string) {
  return files.find((file) => normalizePatientFileKind(file) === kind) || null;
}

function patientFileUrl(file: PatientFile | null | undefined) {
  if (!file) return "";
  return file.previewUrl || file.thumbnailUrl || file.downloadUrl || (file.id ? getFileDownloadUrl(file.id) : "");
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PERMANENT_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const PERMANENT_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const MILK_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
const MILK_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];
const STATUS_ORDER: ToothStatus[] = ["normal", "caries", "filling", "healthy", "removed", "missing"];

const TOOTH_IMG: Record<ToothStatus, string> = {
  caries: "/images/teeth/RedCaries.png",
  filling: "/images/teeth/Yellowplomb.png",
  healthy: "/images/teeth/Greentooth.png",
  normal: "/images/teeth/Whitetooth.png",
  removed: "/images/teeth/Whitetooth.png",
  missing: "/images/teeth/Whitetooth.png",
};

interface IcdItem {
  code: string;
  label: string;
  active?: boolean;
}

interface IcdGroup {
  code: string;
  title: string;
  open?: boolean;
  items: IcdItem[];
}

interface IcdDataset {
  ambulatoryLabel: string;
  defaultDiagnosisCode: string;
  defaultDiagnosisText: string;
  groups: IcdGroup[];
  highlights: string[];
  sourceSection: string;
  sourceSummary: string;
  sourceUrl: string;
}

const BITE_TEETH: Record<BiteType, { cardLabel: string; jawLabel: string; upper: number[]; lower: number[] }> = {
  permanent: {
    cardLabel: "Постоянный прикус",
    jawLabel: "Взрослая стоматология",
    upper: PERMANENT_UPPER,
    lower: PERMANENT_LOWER,
  },
  milk: {
    cardLabel: "Молочный прикус",
    jawLabel: "Детская стоматология",
    upper: MILK_UPPER,
    lower: MILK_LOWER,
  },
};

const ICD_DATASETS: Record<BiteType, IcdDataset> = {
  permanent: {
    ambulatoryLabel: "взрослая стоматология",
    defaultDiagnosisCode: "K02.1",
    defaultDiagnosisText: "K02.1 Кариес дентина",
    sourceSection: "Стоматология",
    sourceSummary: "MedElement: раздел «Стоматология», найдено 23 клинических протокола МЗ РК.",
    sourceUrl: "https://diseases.medelement.com/?searched_data=diseases&q=&mq=&tq=&diseases_filter_type=section_medicine&diseases_content_type=4&section_medicine=97391385460043&category_mkb=0&parent_category_mkb=0",
    highlights: [
      "Кариес зубов (K02)",
      "Гингивит (K05.0, K05.1)",
      "Гипоплазия эмали зубов (K00.4)",
    ],
    groups: [
      {
        code: "K02",
        title: "Кариес зубов",
        open: true,
        items: [
          { code: "K02", label: "K02 Кариес зубов" },
          { code: "K02.0", label: "K02.0 Кариес эмали" },
          { code: "K02.1", label: "K02.1 Кариес дентина", active: true },
          { code: "K02.2", label: "K02.2 Кариес цемента" },
          { code: "K02.3", label: "K02.3 Приостановившийся кариес зубов" },
        ],
      },
      {
        code: "K04",
        title: "Болезни пульпы и периапикальных тканей",
        items: [
          { code: "K04.0", label: "K04.0 Пульпит" },
          { code: "K04.1", label: "K04.1 Некроз пульпы" },
          { code: "K04.4", label: "K04.4 Острый апикальный периодонтит" },
          { code: "K04.5", label: "K04.5 Хронический апикальный периодонтит" },
          { code: "K04.6", label: "K04.6 Периапикальный абсцесс со свищом" },
          { code: "K04.7", label: "K04.7 Периапикальный абсцесс без свища" },
        ],
      },
      {
        code: "K05",
        title: "Гингивит и болезни пародонта",
        items: [
          { code: "K05.0", label: "K05.0 Острый гингивит" },
          { code: "K05.1", label: "K05.1 Хронический гингивит" },
          { code: "K05.2", label: "K05.2 Острый пародонтит" },
          { code: "K05.3", label: "K05.3 Хронический пародонтит" },
        ],
      },
      {
        code: "K00",
        title: "Нарушения развития и прорезывания зубов",
        items: [
          { code: "K00.0", label: "K00.0 Нарушения прорезывания зубов" },
          { code: "K00.4", label: "K00.4 Нарушения формирования зубов" },
        ],
      },
      {
        code: "K03",
        title: "Другие болезни твёрдых тканей зубов",
        items: [
          { code: "K03.0", label: "K03.0 Повышенное стирание зубов" },
          { code: "K03.1", label: "K03.1 Сошлифовывание зубов" },
          { code: "K03.2", label: "K03.2 Эрозия зубов" },
          { code: "K03.6", label: "K03.6 Отложения на зубах" },
        ],
      },
      {
        code: "K13",
        title: "Болезни слизистой полости рта",
        items: [
          { code: "B37.0", label: "B37.0 Кандидозный стоматит" },
          { code: "K13.2", label: "K13.2 Лейкоплакия и другие изменения эпителия полости рта" },
          { code: "K14.6", label: "K14.6 Глоссодиния" },
        ],
      },
      {
        code: "DERM",
        title: "Смежные стоматологические состояния",
        items: [
          { code: "B02", label: "B02 Опоясывающий лишай [herpes zoster]" },
          { code: "L43", label: "L43 Лишай красный плоский" },
          { code: "L51", label: "L51 Эритема многоформная" },
          { code: "L51.0", label: "L51.0 Небуллезная эритема многоформная" },
          { code: "L51.1", label: "L51.1 Буллезная эритема многоформная" },
        ],
      },
    ],
  },
  milk: {
    ambulatoryLabel: "детская стоматология",
    defaultDiagnosisCode: "K02.1",
    defaultDiagnosisText: "K02.1 Кариес дентина у детей",
    sourceSection: "Стоматология детская",
    sourceSummary: "MedElement: раздел «Стоматология детская», найдено 23 клинических протокола МЗ РК.",
    sourceUrl: "https://diseases.medelement.com/?searched_data=diseases&q=&mq=&tq=&diseases_filter_type=section_medicine&diseases_content_type=4&section_medicine=544746821495980557&category_mkb=0&parent_category_mkb=0",
    highlights: [
      "Кариес зубов у детей (K02.*)",
      "Периодонтит у детей (K04.4, K04.5)",
      "Острый гингивит у детей (K05.0)",
    ],
    groups: [
      {
        code: "K02",
        title: "Кариес зубов у детей",
        open: true,
        items: [
          { code: "K02", label: "K02 Кариес зубов у детей" },
          { code: "K02.0", label: "K02.0 Кариес эмали у детей" },
          { code: "K02.1", label: "K02.1 Кариес дентина у детей", active: true },
          { code: "K02.2", label: "K02.2 Кариес цемента у детей" },
          { code: "K02.3", label: "K02.3 Приостановившийся кариес зубов у детей" },
        ],
      },
      {
        code: "K04",
        title: "Периодонтит у детей",
        items: [
          { code: "K04.4", label: "K04.4 Острый апикальный периодонтит у детей" },
          { code: "K04.5", label: "K04.5 Хронический апикальный периодонтит у детей" },
        ],
      },
      {
        code: "K05",
        title: "Воспалительные заболевания пародонта у детей",
        items: [
          { code: "K05.0", label: "K05.0 Острый гингивит у детей" },
          { code: "K05.2", label: "K05.2 Острый пародонтит у детей" },
        ],
      },
      {
        code: "K00",
        title: "Нарушения развития зубов у детей",
        items: [
          { code: "K00.4", label: "K00.4 Гипоплазия эмали у детей" },
        ],
      },
      {
        code: "MOUTH",
        title: "Болезни полости рта у детей",
        items: [
          { code: "B00.2", label: "B00.2 Герпетический гингивостоматит и фаринготонзиллит" },
          { code: "K13.0", label: "K13.0 Болезни губ у детей" },
          { code: "Q38.0", label: "Q38.0 Врожденные аномалии губ" },
          { code: "Q38.6", label: "Q38.6 Другие пороки развития рта" },
        ],
      },
      {
        code: "K07",
        title: "Челюстно-лицевые нарушения у детей",
        items: [
          { code: "K07.6", label: "K07.6 Болезни височно-нижнечелюстного сустава у детей" },
        ],
      },
      {
        code: "TRAUMA",
        title: "Травмы зубов у детей",
        items: [
          { code: "S03.2", label: "S03.2 Вывих зуба" },
          { code: "K08.1", label: "K08.1 Потеря зубов вследствие болезни или травмы" },
          { code: "S00-S09", label: "S00-S09 Травмы головы" },
        ],
      },
    ],
  },
};

const CARIES_HINTS: Record<CariesType, string> = {
  surface: "Для поверхностного кариеса рекомендована реминерализующая терапия.",
  medium: "Для среднего кариеса — препарирование и пломбирование Filtek Z250.",
  deep: "Для K02.1 рекомендовано применение биоактивных прокладок (MTA) при глубоком кариесе.",
  complicated: "Осложнённый кариес — требуется эндодонтическое лечение (пульпит/периодонтит).",
};

const AI_SUGGESTIONS: Record<string, { material: string; anesthesia: string; time: string }> = {
  "K02.0": { material: "Флюорид-лак / Icon (реминерализация)", anesthesia: "Без анестезии", time: "~20 мин" },
  "K02.1": { material: "Filtek Z250", anesthesia: "Ultracain D-S forte", time: "~45 мин" },
  "K02.2": { material: "Vitrebond + Filtek", anesthesia: "Ultracain D-S forte", time: "~40 мин" },
  "K04.0": { material: "Эндодонтический набор + MTA", anesthesia: "Septanest forte", time: "~90 мин" },
  "K04.4": { material: "Эндодонтический набор", anesthesia: "Septanest forte", time: "~60 мин" },
  "K04.5": { material: "Эндодонтический набор + гуттаперча", anesthesia: "Septanest forte", time: "~75 мин" },
  "K05.0": { material: "Хлоргексидин 0.05% + Метрогил Дента", anesthesia: "Без анестезии", time: "~30 мин" },
  "K05.3": { material: "Ультразвуковой скейлер + Vector", anesthesia: "Аппликационная", time: "~60 мин" },
};

function getPrescription(code: string): { drug: string; dose: string; schedule: string }[] {
  if (code.startsWith("K04")) {
    return [
      { drug: "Амоксициллин 500мг", dose: "500мг", schedule: "3 раза в день, 5 дней" },
      { drug: "Кетанов 10мг", dose: "10мг", schedule: "При боли, не более 3 раз/день" },
      { drug: "Хлоргексидин 0.05%", dose: "Полоскание", schedule: "3 раза в день после еды" },
    ];
  }
  if (code.startsWith("K05")) {
    return [
      { drug: "Метрогил Дента гель", dose: "Аппликации на десна", schedule: "2 раза в день, 7 дней" },
      { drug: "Хлоргексидин 0.05%", dose: "Полоскание", schedule: "3 раза в день после еды" },
    ];
  }
  return [
    { drug: "Нурофен 400мг", dose: "400мг", schedule: "При боли, не более 3 раз/день" },
    { drug: "Хлоргексидин 0.05%", dose: "Полоскание", schedule: "3 раза в день после еды" },
  ];
}

const SURFACE_DEFS = [
  { key: "M", label: "М — Медиальная" },
  { key: "D", label: "Д — Дистальная" },
  { key: "O", label: "О — Жевательная" },
  { key: "V", label: "В — Вестибулярная" },
  { key: "L", label: "Я — Язычная" },
];

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
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
  const [allPatients, setAllPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    searchPatients("").then((list: Patient[]) => {
      setAllPatients(list);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allPatients.filter((p) => !q || p.name.toLowerCase().includes(q) || String(p.phone).includes(q));
  }, [search, allPatients]);

  return (
    <div className="min-h-full bg-white px-6 py-5 lg:px-8 lg:py-6">
      <div className="max-w-310">
        <header className="mb-8">
          <h1 className="text-2xl leading-tight font-bold text-gray-950">ИИ-протокол</h1>
          <p className="mt-0 text-s leading-5 text-gray-500">Автопротоколирование, МКБ-10 и анализ истории</p>
        </header>

        <section className="rounded-lg border border-gray-200 bg-white px-3 py-4 shadow-[0_1px_4px_rgba(15,23,42,0.1)]">
          <div className="px-1">
            <h2 className="text-lg leading-tight font-semibold text-blue-600">Выберите пациента для приема</h2>
            <p className="mt-1 text-[13px] leading-5 text-gray-600">Чтобы ИИ-протокол начал слушать и писать протокол, выберите пациента из базы.</p>
          </div>
        </section>

        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={18} strokeWidth={1.8} />
        <input
          type="text"
          className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-4 text-sm text-gray-900 shadow-[0_1px_4px_rgba(15,23,42,0.1)] transition placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-[3px] focus:ring-blue-500/15"
          placeholder=""
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
        />
        </div>

        <section className="mt-7">
          <h3 className="mb-3 text-sm font-medium text-blue-600">Найденные пациенты</h3>
          <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto pr-1">
            {loading ? (
              <div className="rounded-xl border border-gray-200 bg-white py-12 text-center text-sm text-gray-400 shadow-[0_1px_4px_rgba(15,23,42,0.1)]">Загрузка...</div>
            ) : filtered.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white py-12 text-center text-sm text-gray-400 shadow-[0_1px_4px_rgba(15,23,42,0.1)]">Пациенты не найдены</div>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="flex min-h-[66px] w-full items-center justify-between gap-5 rounded-lg border border-gray-200 bg-white px-3 py-3 text-left shadow-[0_1px_4px_rgba(15,23,42,0.1)] transition hover:border-blue-100 hover:bg-gray-50"
                  onClick={() => router.push(`/ai?patient=${p.id}`)}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-gray-950">{p.name}</span>
                    <span className="mt-1 block truncate text-[11px] text-gray-400">
                      Зарегистрирован: {p.createdAt || "—"} * {p.phone}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-lg bg-blue-600 px-[18px] py-2 text-[11px] font-medium text-white shadow-sm transition hover:bg-blue-700">
                    Выбрать
                  </span>
                </button>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// ─── Tooth Button ─────────────────────────────────────────────────────────────
function ToothBtn({ n, status, isSelected, bite, onClick }: {
  n: number;
  status: ToothStatus;
  isSelected: boolean;
  bite: BiteType;
  onClick: () => void;
}) {
  const imgStyle: React.CSSProperties = (() => {
    if (status === "removed") return { filter: "grayscale(1) opacity(0.4)", transform: "scale(0.85)" };
    if (status === "missing") return { filter: "grayscale(1) opacity(0.2)", transform: "scale(0.75)" };
    if (bite === "milk") return { filter: "sepia(0.5) saturate(1.3) brightness(1.05)", transform: "scale(0.88)" };
    return {};
  })();

  const numStyle: React.CSSProperties = (() => {
    if (status === "removed") return { color: "#ef4444", textDecoration: "line-through" };
    if (status === "missing") return { color: "#d1d5db", textDecoration: "line-through" };
    return {};
  })();

  const bgMap: Record<ToothStatus, string> = {
    normal: "bg-gray-50",
    caries: "bg-red-50 border-red-300",
    filling: "bg-yellow-50 border-yellow-300",
    healthy: "bg-green-50 border-green-300",
    removed: "bg-red-50/50 border-red-200 border-dashed opacity-60",
    missing: "border-gray-300 border-dashed opacity-35",
  };

  return (
    <button
      type="button"
      className={`flex flex-col items-center p-0.5 rounded-[10px] cursor-pointer select-none transition-all duration-100 border border-transparent
        ${bgMap[status] || ""}
        ${isSelected ? "bg-blue-50 border-blue-300 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]" : ""}
        hover:bg-gray-100 hover:-translate-y-px`}
      onClick={onClick}
      title={bite === "milk" ? `Молочный зуб ${n}` : `Зуб ${n}`}
    >
      <img
        src={TOOTH_IMG[status] || TOOTH_IMG.normal}
        alt={bite === "milk" ? `Молочный зуб ${n}` : `Зуб ${n}`}
        className="w-[44px] h-[44px] object-cover object-[center_20%] rounded-md mix-blend-multiply transition-all duration-200"
        style={imgStyle}
      />
      <span className="text-[10px] text-gray-400" style={numStyle}>{n}</span>
    </button>
  );
}

// ─── ICD-10 Tree ──────────────────────────────────────────────────────────────
function IcdTree({ activeCode, dataset, onSelect }: { activeCode: string; dataset: IcdDataset; onSelect: (code: string, label: string) => void }) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    dataset.groups.forEach((g) => { m[g.code] = !!g.open; });
    return m;
  });
  const [search, setSearch] = useState("");
  const [backendItems, setBackendItems] = useState<IcdItem[]>([]);
  const [backendStatus, setBackendStatus] = useState("");
  const q = search.toLowerCase().trim();

  useEffect(() => {
    let active = true;
    if (!q) {
      return () => { active = false; };
    }
    const timer = setTimeout(() => {
      setBackendStatus("Поиск на сервере...");
      getIcd10Reference(q)
        .then((items: Array<IcdItem & { name?: string }>) => {
          if (!active) return;
          setBackendItems((items || []).map((item) => ({ code: item.code, label: item.label || `${item.code} ${item.name || ""}`.trim() })));
          setBackendStatus("");
        })
        .catch(() => {
          if (!active) return;
          setBackendItems([]);
          setBackendStatus("Серверный справочник недоступен, показан локальный список");
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [q]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm max-h-[680px] flex flex-col gap-4">
      <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-blue-600">Источник протоколов</div>
            <div className="text-sm font-semibold text-gray-900">{dataset.sourceSection}</div>
          </div>
          <a
            href={dataset.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
          >
            MedElement
          </a>
        </div>
        <div className="text-[11px] leading-relaxed text-gray-500">{dataset.sourceSummary}</div>
        <div className="flex flex-wrap gap-1.5">
          {dataset.highlights.map((item) => (
            <span key={item} className="rounded-full border border-blue-200 bg-white px-2 py-1 text-[10px] text-blue-700">
              {item}
            </span>
          ))}
        </div>
      </div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input
          type="text"
          className="w-full h-10 pl-9 pr-3 text-sm rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
          placeholder="Поиск по МКБ-10..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="flex-1 overflow-y-auto pr-1 text-sm">
        {q && backendItems.length > 0 && (
          <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 p-2">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-blue-600">Серверный МКБ-10</div>
            <div className="flex flex-col gap-0.5">
              {backendItems.map((item) => (
                <button
                  key={`backend-${item.code}`}
                  type="button"
                  className={`rounded px-1.5 py-1 text-left text-xs transition ${activeCode === item.code ? "bg-blue-600 text-white" : "text-blue-700 hover:bg-white"}`}
                  onClick={() => onSelect(item.code, item.label)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {q && backendStatus && <div className="mb-2 text-[11px] text-gray-400">{backendStatus}</div>}
        {dataset.groups.map((group) => {
          const matchItems = group.items.filter((i) => !q || i.label.toLowerCase().includes(q));
          if (q && !group.title.toLowerCase().includes(q) && matchItems.length === 0) return null;
          const isOpen = q ? true : !!openGroups[group.code];
          return (
            <div key={group.code} className="rounded-md p-1">
              <button
                type="button"
                className="w-full flex items-center gap-2 border-none bg-transparent cursor-pointer text-sm px-1 py-1.5 text-left text-gray-700 hover:bg-gray-50 rounded-lg"
                onClick={() => setOpenGroups((p) => ({ ...p, [group.code]: !p[group.code] }))}
              >
                <span className="text-[10px] text-gray-400">{isOpen ? "▼" : "▶"}</span>
                <span>{group.title}</span>
              </button>
              {isOpen && (
                <div className="ml-[18px] mt-0.5 flex flex-col gap-0.5">
                  {(q ? matchItems : group.items).map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      className={`border-none rounded px-1.5 py-1 text-left cursor-pointer transition text-xs ${
                        activeCode === item.code
                          ? "bg-blue-600 text-white"
                          : "bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                      }`}
                      onClick={() => onSelect(item.code, item.label)}
                    >
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
function SurfacePopup({ surfaces, onToggle, onClose }: {
  tooth: number;
  surfaces: string[];
  onToggle: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-lg mt-2 w-full max-w-[260px]">
      <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Укажите поверхность</div>
      <div className="flex flex-col gap-1 mb-2.5">
        {SURFACE_DEFS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`px-2.5 py-1.5 text-xs border rounded-md text-left transition ${
              surfaces.includes(s.key)
                ? "bg-red-50 border-red-300 text-red-600 font-semibold"
                : "bg-gray-50 border-gray-200 text-gray-900 hover:bg-gray-100"
            }`}
            onClick={() => onToggle(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="w-full py-1.5 text-xs font-semibold border border-blue-500 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white transition"
        onClick={onClose}
      >
        Готово
      </button>
    </div>
  );
}

// ─── AI Core Page ─────────────────────────────────────────────────────────────
function AiCorePage({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [patientData, setPatientData] = useState<Patient | null>(null);
  const [activeAppointment, setActiveAppointment] = useState<Appointment | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [visitServices, setVisitServices] = useState<VisitService[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState("protocol");

  // Tooth state
  const [teeth, setTeeth] = useState<Record<number, ToothStatus>>({});
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
  const [surfacePopupTooth, setSurfacePopupTooth] = useState<number | null>(null);
  const [activeSurfaces, setActiveSurfaces] = useState<string[]>([]);
  const [jawFilter, setJawFilter] = useState<JawFilter>("all");
  const [bite, setBite] = useState<BiteType>("permanent");

  // Form state
  const [diagnosisText, setDiagnosisText] = useState("Кариес дентина (16)");
  const [complaints, setComplaints] = useState("Боль в верхней челюсти справа при приеме холодной пищи. Ноет со вчерашнего дня.");
  const [anamnesis, setAnamnesis] = useState("Зуб ранее не лечен.");
  const [objective, setObjective] = useState("Глубокая кариозная полость в зубе 1.6, размягченный дентин, зондирование болезненно.");
  const [treatment, setTreatment] = useState("Анестезия инфильтрационная, препарирование полости, медикаментозная обработка, постановка световой пломбы.");
  const [diagnosisCode, setDiagnosisCode] = useState("K02.1");
  const [cariesType, setCariesType] = useState<CariesType>("deep");

  // Voice state
  const [isRecording, setIsRecording] = useState(false);
  const [aiStatus, setAiStatus] = useState("Слушаю...");
  const [recordingTime, setRecordingTime] = useState(0);
  const transcriptRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recogRef = useRef<any>(null);

  // Visit state
  const [finishing, setFinishing] = useState(false);
  const [visitFinished, setVisitFinished] = useState(false);

  // Image state
  const [images, setImages] = useState<ToothImageItem[]>([]);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const urlsRef = useRef<string[]>([]);

  // Modal & eGov
  const [modal, setModal] = useState<ModalState | null>(null);
  const [egovSigned, setEgovSigned] = useState(false);
  const [patientFiles, setPatientFiles] = useState<PatientFile[]>([]);
  const [protocolDocument, setProtocolDocument] = useState<PatientFile | null>(null);
  const [documentMessage, setDocumentMessage] = useState("");

  // Toast
  const [toast, setToast] = useState<string | null>(null);

  // Visit timer
  const [visitStarted, setVisitStarted] = useState(false);
  const [visitTimer, setVisitTimer] = useState(0);
  const visitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Dynamic materials
  const [materials, setMaterials] = useState([
    { inventoryId: "inv2", code: "ultracain", name: "Ultracain D-S forte 1.7ml", qty: 1, unit: "амп" },
    { inventoryId: "inv3", code: "filtek", name: "Filtek Z250 (шприц)", qty: 1, unit: "шт" },
  ]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [materialSelectId, setMaterialSelectId] = useState("");

  // Prescription & Before/After
  const [showPrescription, setShowPrescription] = useState(false);
  const [beforeAfterMode, setBeforeAfterMode] = useState(false);
  const beforeFileRef = useRef<HTMLInputElement>(null);
  const afterFileRef = useRef<HTMLInputElement>(null);
  const [beforeImage, setBeforeImage] = useState<string | null>(null);
  const [afterImage, setAfterImage] = useState<string | null>(null);
  const [imageUploadKind, setImageUploadKind] = useState("xray");
  const [imageMessage, setImageMessage] = useState("");

  // Load data
  const applyPatientFiles = useCallback((files: PatientFile[]) => {
    const nextFiles = files || [];
    const protocolFile = findPatientFile(nextFiles, "protocol");
    const beforeFile = findPatientFile(nextFiles, "before");
    const afterFile = findPatientFile(nextFiles, "after");
    const galleryFiles = nextFiles.filter((file) => {
      const kind = normalizePatientFileKind(file);
      const isImage = file.mimeGroup === "image" || String(file.mimeType || "").startsWith("image/");
      return isImage && !["before", "after", "protocol"].includes(kind);
    });
    const nextImages = galleryFiles
      .map((file) => ({ id: file.id, url: patientFileUrl(file) }))
      .filter((item) => item.url);

    setPatientFiles(nextFiles);
    setProtocolDocument(protocolFile);
    setEgovSigned(protocolFile?.signatureStatus === "signed");
    setBeforeImage(beforeFile ? patientFileUrl(beforeFile) : null);
    setAfterImage(afterFile ? patientFileUrl(afterFile) : null);
    setImages(nextImages);
    setActiveImage((current) => {
      if (nextImages.some((item) => item.url === current)) return current;
      return nextImages[0]?.url || null;
    });
    return protocolFile;
  }, []);

  useEffect(() => {
    if (!patientId) return;
    Promise.all([
      getPatientById(patientId) as Promise<Patient>,
      getActiveAppointmentByPatient(patientId) as Promise<Appointment | null>,
      getVisitsByPatient(patientId) as Promise<Visit[]>,
      getPatientAiContext(patientId),
      getFiles({ patientId }) as Promise<PatientFile[]>,
      getInventoryItems().catch(() => []) as Promise<InventoryItem[]>,
    ])
      .then(([patient, appt, visitList, aiContext, files, inventory]) => {
        setPatientData(patient);
        setActiveAppointment(appt);
        setVisits(visitList);
        applyPatientFiles(files || []);
        setInventoryItems(inventory || []);
        if ((inventory || []).length) setMaterialSelectId((prev) => prev || inventory[0].id);
        const preferredMaterials = (inventory || []).filter((item) => {
          const name = item.name.toLowerCase();
          return name.includes("ultracain") || name.includes("filtek");
        }).slice(0, 2);
        if (preferredMaterials.length) {
          setMaterials(preferredMaterials.map((item) => ({
            inventoryId: item.id,
            code: item.id,
            name: item.name,
            qty: 1,
            unit: item.unit || "шт",
          })));
        }
        if (aiContext?.toothChart?.bite) setBite(aiContext.toothChart.bite);
        if (aiContext?.toothChart?.teeth) setTeeth(aiContext.toothChart.teeth);
        if (aiContext?.aiSummary?.suggestedDiagnosisCode) setDiagnosisCode(aiContext.aiSummary.suggestedDiagnosisCode);
        if (aiContext?.aiSummary?.lastDiagnosis) setDiagnosisText(aiContext.aiSummary.lastDiagnosis);
        if (appt?.visitId) setVisitStarted(true);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [patientId, applyPatientFiles]);

  useEffect(() => {
    if (!activeAppointment?.visitId) {
      return;
    }
    let active = true;
    getVisitServices(activeAppointment.visitId)
      .then((items) => {
        if (active) setVisitServices(items as VisitService[]);
      })
      .catch(() => {
        if (active) setVisitServices([]);
      });
    return () => {
      active = false;
    };
  }, [activeAppointment?.visitId]);

  // Default image
  useEffect(() => {
    if (!loading && patientData && images.length === 0) {
      const url = "/images/examplecoreai.png";
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setImages([{ id: "default", url }]);
      setActiveImage(url);
    }
  }, [images.length, loading, patientData]);

  // Cleanup URLs
  useEffect(() => () => urlsRef.current.forEach((u) => URL.revokeObjectURL(u)), []);

  // Visit timer
  useEffect(() => {
    if (visitStarted && !visitFinished) {
      visitTimerRef.current = setInterval(() => setVisitTimer((t) => t + 1), 1000);
    } else if (visitTimerRef.current) {
      clearInterval(visitTimerRef.current);
    }
    return () => { if (visitTimerRef.current) clearInterval(visitTimerRef.current); };
  }, [visitStarted, visitFinished]);

  // Recording timer
  useEffect(() => {
    if (isRecording) {
      setRecordingTime(0); // eslint-disable-line react-hooks/set-state-in-effect
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

  const showToast = useCallback((msg: string) => setToast(msg), []);

  const patientAge = useMemo(() => {
    if (!patientData?.birthDate) return null;
    const birth = new Date(patientData.birthDate);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--;
    return age;
  }, [patientData]);
  const visibleVisitServices = activeAppointment?.visitId ? visitServices : [];

  const riskLevel = useMemo(() => {
    if (visits.some((v) => v.diagnosisCode?.startsWith("K04"))) return "Высокий";
    if (visits.some((v) => v.diagnosisCode?.startsWith("K03") || v.diagnosisCode === "K02.1")) return "Средний";
    return "Низкий";
  }, [visits]);
  const riskBadge = riskLevel === "Высокий"
    ? "bg-red-50 text-red-600 border-red-200"
    : riskLevel === "Средний"
    ? "bg-amber-50 text-amber-600 border-amber-200"
    : "bg-blue-50 text-blue-700 border-blue-200";

  const activeTeethConfig = BITE_TEETH[bite];
  const activeIcdDataset = ICD_DATASETS[bite];
  const activeUpperTeeth = activeTeethConfig.upper;
  const activeLowerTeeth = activeTeethConfig.lower;
  const activeToothNumbers = useMemo(() => [...activeUpperTeeth, ...activeLowerTeeth], [activeLowerTeeth, activeUpperTeeth]);
  const activeIcdItems = useMemo(
    () => activeIcdDataset.groups.flatMap((group) => group.items),
    [activeIcdDataset],
  );

  const switchBite = useCallback((nextBite: BiteType, withToast = true) => {
    setBite(nextBite);
    setJawFilter("all");
    setSelectedTooth(null);
    setSurfacePopupTooth(null);
    setActiveSurfaces([]);

    const nextDataset = ICD_DATASETS[nextBite];
    const nextCodes = new Set(nextDataset.groups.flatMap((group) => group.items.map((item) => item.code)));

    setDiagnosisText((prev) => {
      const stripped = prev.replace(/\(\d{1,2}\)(\s*—\s*пов\.:.*)?$/u, "").trim();
      if (!stripped) return nextDataset.defaultDiagnosisText;
      return nextCodes.has(diagnosisCode) ? stripped : nextDataset.defaultDiagnosisText;
    });

    if (!nextCodes.has(diagnosisCode)) {
      setDiagnosisCode(nextDataset.defaultDiagnosisCode);
    }

    if (withToast) {
      showToast(nextBite === "milk" ? "Переключено на детскую стоматологию и молочный прикус" : "Переключено на взрослую стоматологию и постоянный прикус");
    }
  }, [diagnosisCode, showToast]);

  useEffect(() => {
    if (patientAge == null) return;
    const suggestedBite = patientAge <= 12 ? "milk" : "permanent";
    if (suggestedBite !== bite) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      switchBite(suggestedBite, false);
    }
  }, [bite, patientAge, switchBite]);

  function startRecording() {
    transcriptRef.current = "";
    setIsRecording(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SR) {
      const r = new SR();
      r.lang = "ru-RU";
      r.continuous = true;
      r.interimResults = true;
      r.onresult = (e: SpeechRecognitionEvent) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) {
            transcriptRef.current += t + " ";
            setComplaints(transcriptRef.current.trim());
          } else {
            interim = t;
          }
        }
        if (interim) setAiStatus(interim);
      };
      r.onerror = (e: Event) => {
        const err = e as ErrorEvent;
        setAiStatus(`Ошибка: ${err.error || "unknown"}`);
      };
      r.onend = () => { if (isRecording) try { r.start(); } catch { /* ignore */ } };
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
    analyzeClinicalTranscript({ transcript: text, patientId })
      .then((result) => {
        if (result?.diagnosisCode) setDiagnosisCode(result.diagnosisCode);
        if (result?.cariesType) setCariesType(result.cariesType);
        if (result?.objective && !objective.trim()) setObjective(result.objective);
      })
      .catch(() => {});
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

  function handleToothClick(n: number, cur: ToothStatus) {
    setSelectedTooth(n);
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(cur) + 1) % STATUS_ORDER.length];
    setTeeth((p) => ({ ...p, [n]: next }));
    if (patientId) {
      savePatientToothChart(patientId, { bite, teeth: { ...teeth, [n]: next } }).catch(() => {});
    }
    if (next === "caries") { setSurfacePopupTooth(n); setActiveSurfaces([]); } else setSurfacePopupTooth(null);
    setDiagnosisText((p) => `${p.replace(/\(\d{1,2}\)\s*$/u, "").trim()} (${n})`.trim());
  }

  function handleSurfaceClose() {
    if (activeSurfaces.length) {
      const baseDiagnosis = bite === "milk" ? "K02.1 Кариес дентина у детей" : "K02.1 Кариес дентина";
      setDiagnosisCode("K02.1");
      setDiagnosisText(`${baseDiagnosis} (${surfacePopupTooth}) — пов.: ${activeSurfaces.join(", ")}`);
    }
    setSurfacePopupTooth(null);
  }

  function exportToothFormula() {
    const r: Record<number, { status: string }> = {};
    activeToothNumbers.forEach((n) => { r[n] = { status: teeth[n] || "normal" }; });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }));
    a.download = "tooth_formula.json";
    a.click();
  }

  function readVisitData() {
    return {
      complaint: complaints,
      diagnosis: diagnosisText,
      notes: treatment,
      diagnosisCode,
      cariesType,
      toothNumber: selectedTooth ? String(selectedTooth) : "",
      protocol: { complaints, anamnesis, objective, diagnosisText, treatment },
      materials: materials.map((m) => ({
        inventoryId: m.inventoryId,
        code: m.code,
        name: m.name,
        qty: m.qty,
        unit: m.unit,
      })),
    };
  }

  async function handleStartVisit() {
    if (!activeAppointment?.id) { alert("Активная запись не найдена."); return; }
    try {
      const visit = await startVisit(activeAppointment.id);
      setActiveAppointment((prev) => prev ? { ...prev, visitId: visit.id, status: "arrived" } : prev);
      setVisitStarted(true);
      setVisitFinished(false);
      showToast("Прием начат");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Не удалось начать прием");
    }
  }

  async function handleFinishVisit() {
    if (!activeAppointment?.id) { alert("Запись не найдена."); return; }
    setFinishing(true);
    try {
      if (!visitStarted || !activeAppointment.visitId) {
        const visit = await startVisit(activeAppointment.id);
        setActiveAppointment((prev) => prev ? { ...prev, visitId: visit.id, status: "arrived" } : prev);
        setVisitStarted(true);
      }
      const draft = await draftClinicalProtocol({ patientId, transcript: transcriptRef.current, visitData: readVisitData() }).catch(() => null);
      if (draft?.protocol?.treatment && !treatment.trim()) setTreatment(draft.protocol.treatment);
      await finishVisit(activeAppointment.id, readVisitData());
      if (activeAppointment.visitId) {
        setVisitServices((await getVisitServices(activeAppointment.visitId)) as VisitService[]);
      }
      setVisitFinished(true);
      const matList = materials.map((m) => `${m.name} (${m.qty})`).join(", ");
      showToast(`Автосписание со склада: ${matList}`);
      setShowPrescription(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setFinishing(false);
    }
  }

  async function reloadPatientFiles() {
    const files = (await getFiles({ patientId })) as PatientFile[];
    return applyPatientFiles(files || []);
  }

  async function handleExportProtocol() {
    setDocumentMessage("");
    setModal({ title: "Экспорт в PDF", phase: "loading" });
    try {
      const documentFile = (await createPatientProtocolDocument(patientId)) as PatientFile;
      setProtocolDocument(documentFile);
      await reloadPatientFiles();
      setDocumentMessage("Протокол создан и сохранен в документах пациента.");
      window.open(getFileDownloadUrl(documentFile.id), "_blank", "noopener,noreferrer");
      setModal((prev) => (prev ? { ...prev, phase: "done" } : null));
    } catch (err) {
      setModal(null);
      setDocumentMessage(err instanceof Error ? err.message : "Не удалось создать документ");
    }
  }

  async function handleSignProtocol() {
    setDocumentMessage("");
    setModal({ title: "Подписание через eGov (ЭЦП)", phase: "signing" });
    try {
      let documentFile = protocolDocument;
      if (!documentFile?.id) {
        documentFile = (await createPatientProtocolDocument(patientId)) as PatientFile;
        setProtocolDocument(documentFile);
      }
      await signDocument(documentFile.id, {
        provider: "egov",
        signerName: patientData?.name || "",
      });
      await reloadPatientFiles();
      setEgovSigned(true);
      setDocumentMessage("Протокол подписан и обновлен в документах пациента.");
      setModal(null);
    } catch (err) {
      setModal(null);
      setDocumentMessage(err instanceof Error ? err.message : "Не удалось подписать документ");
    }
  }

  async function uploadPatientImage(file: File, kind: string) {
    if (!file.type.startsWith("image/")) throw new Error("Выберите изображение");
    const base64 = await readFileAsDataUrl(file);
    const stored = (await uploadFile({
      patientId,
      visitId: activeAppointment?.visitId || "",
      fileName: file.name,
      mimeType: file.type || "image/*",
      base64,
      kind,
      category: kind,
    })) as PatientFile;
    const url = patientFileUrl(stored);
    setPatientFiles((prev) => [stored, ...prev.filter((item) => item.id !== stored.id)]);
    await reloadPatientFiles().catch(() => null);
    return { stored, url };
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setImageMessage("");
    try {
      const { stored, url } = await uploadPatientImage(f, imageUploadKind);
      setImages((p) => [{ id: stored.id, url }, ...p.filter((item) => item.id !== "default")]);
      setActiveImage(url);
      setImageMessage("Изображение сохранено в файлах пациента");
    } catch (err) {
      setImageMessage(err instanceof Error ? err.message : "Не удалось загрузить изображение");
    }
    e.target.value = "";
  }

  async function handleDeleteImage(id: string) {
    if (id !== "default") {
      setImageMessage("");
      try {
        await deleteFile(id);
        await reloadPatientFiles();
        setImageMessage("РР·РѕР±СЂР°Р¶РµРЅРёРµ СѓРґР°Р»РµРЅРѕ РёР· С„Р°Р№Р»РѕРІ РїР°С†РёРµРЅС‚Р°");
      } catch (err) {
        setImageMessage(err instanceof Error ? err.message : "РќРµ СѓРґР°Р»РѕСЊ СѓРґР°Р»РёС‚СЊ РёР·РѕР±СЂР°Р¶РµРЅРёРµ");
      }
      return;
    }
    setImages((p) => {
      const rm = p.find((i) => i.id === id);
      const next = p.filter((i) => i.id !== id);
      if (activeImage === rm?.url) setActiveImage(next.length ? next[next.length - 1].url : null);
      return next;
    });
  }

  function addSelectedMaterial() {
    const item = inventoryItems.find((entry) => entry.id === materialSelectId);
    if (!item) return;
    setMaterials((prev) => {
      const existing = prev.find((material) => material.inventoryId === item.id);
      if (existing) {
        return prev.map((material) => (
          material.inventoryId === item.id
            ? { ...material, qty: material.qty + 1 }
            : material
        ));
      }
      return [
        ...prev,
        {
          inventoryId: item.id,
          code: item.id,
          name: item.name,
          qty: 1,
          unit: item.unit || "шт",
        },
      ];
    });
  }

  if (loading) return <div className="p-6 text-center text-gray-400">Загрузка...</div>;
  if (!patientData) return <div className="p-6 text-center text-gray-400">Пациент не найден</div>;

  const tabs = [
    { key: "protocol", label: "ИИ-протокол" },
    { key: "images", label: "Изображения" },
    { key: "materials", label: "Материалы" },
    { key: "services", label: "Оказанные услуги" },
    { key: "history", label: "История болезни" },
    { key: "plans", label: "Планы лечения" },
    { key: "add", label: "+" },
  ];

  const counts: Record<ToothStatus, number> = { normal: 0, caries: 0, filling: 0, healthy: 0, removed: 0, missing: 0 };
  activeToothNumbers.forEach((n) => { const s = teeth[n] || "normal"; if (counts[s] !== undefined) counts[s]++; });

  const legend = [
    { key: "caries", bg: "bg-red-100 border-red-300", label: "Кариес", c: counts.caries },
    { key: "filling", bg: "bg-yellow-100 border-yellow-300", label: "Пломба", c: counts.filling },
    { key: "healthy", bg: "bg-green-100 border-green-300", label: "Здоров", c: counts.healthy },
    { key: "normal", bg: "bg-gray-50 border-gray-200", label: "Норма", c: counts.normal },
    { key: "removed", bg: "bg-red-50 border-red-200 border-dashed", label: "Удалён", c: counts.removed },
    { key: "missing", bg: "bg-transparent border-gray-300 border-dashed", label: "Отсутствует", c: counts.missing },
  ];

  return (
    <div className="min-h-full bg-[#f6f8fb] flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center gap-3 flex-wrap bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex flex-col gap-1">
            <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 m-0">
            <img src="/images/Medimetricslogotype.png" alt="Neurodent" className="w-7 h-7" />
            <span>ИИ-протокол</span>
          </h1>
          <p className="text-xs text-gray-500 m-0">Автопротоколирование, МКБ-10, тип кариеса и зубная формула</p>
        </div>
        <div className="flex gap-2.5 flex-wrap">
          <button
            className="px-3.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition flex items-center gap-1.5"
            onClick={() => router.push("/ai")}
          >
            <ChevronLeft size={14} />
            Сменить пациента
          </button>
          <button
            className={`px-4 py-2.5 text-sm font-semibold text-white rounded-full flex items-center gap-2 transition shadow-sm ${
              isRecording ? "bg-red-600 shadow-red-500/25" : "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"
            }`}
            onClick={isRecording ? stopRecording : startRecording}
          >
            {isRecording ? (
              <>
                <MicOff size={14} />
                Остановить ({String(Math.floor(recordingTime / 60)).padStart(2, "0")}:{String(recordingTime % 60).padStart(2, "0")})
              </>
            ) : (
              <>
                <Mic size={14} />
                Слушать прием
              </>
            )}
          </button>
          {!visitStarted ? (
            <button
              className="px-3.5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
              onClick={handleStartVisit}
            >
              ▶ Начать прием
            </button>
          ) : (
            <span className="px-3.5 py-2 text-sm font-medium text-white bg-gray-700 rounded-lg flex items-center gap-2 tabular-nums">
              ⏱ {String(Math.floor(visitTimer / 60)).padStart(2, "0")}:{String(visitTimer % 60).padStart(2, "0")}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center flex-wrap gap-6 bg-white border-b border-gray-200 px-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`px-0 py-3 text-sm font-medium border-b-2 cursor-pointer transition ${
              activeTab === t.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-900"
            } ${t.key === "add" ? "font-bold" : ""}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── PROTOCOL TAB ─── */}
      {activeTab === "protocol" && (
        <div className="w-full max-w-[1280px] mx-auto p-6 flex flex-col gap-5">
          {/* Allergy Banner */}
          {(patientData as Patient & { allergies?: string }).allergies && (
            <div className="flex items-center gap-3 px-4 py-3 bg-red-600 text-white rounded-xl font-semibold text-sm shadow-lg">
              <AlertTriangle size={20} className="shrink-0" />
              <span>⚠ АЛЛЕРГИЯ: {(patientData as Patient & { allergies?: string }).allergies} — проверить перед анестезией!</span>
            </div>
          )}

          {/* Patient info */}
          <div className="w-full bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex justify-between items-end flex-wrap gap-4">
            <div>
              <div className="text-base font-bold text-gray-900 mb-0.5">{patientData.name}</div>
              <div className="text-xs text-gray-500">
                {patientAge != null ? `${patientAge} лет` : "Взрослый"} &bull; {patientData.phone}
              </div>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border flex items-center gap-1 ${riskBadge}`}>
                <Bot size={12} /> Риск: {riskLevel}
              </span>
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border flex items-center gap-1 ${
                bite === "milk"
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-slate-50 text-slate-700 border-slate-200"
              }`}>
                <Info size={12} /> {activeTeethConfig.jawLabel}
              </span>
              {complaints.trim() && (
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-600 border border-amber-200 flex items-center gap-1">
                  <AlertTriangle size={12} /> {complaints.length > 35 ? complaints.slice(0, 35) + "…" : complaints}
                </span>
              )}
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-600 border border-sky-200 flex items-center gap-1">
                <Info size={12} /> МКБ-10: {diagnosisCode || "—"}
              </span>
            </div>
          </div>

          {/* AI Summary */}
          <div className="w-full bg-blue-50/60 border border-blue-100 rounded-2xl p-4 shadow-sm">
            <div className="text-[11px] font-bold text-blue-600 uppercase mb-2 flex items-center gap-1">
              <Sparkles size={12} /> ИИ-резюме пациента
            </div>
            <div className="text-[13px] text-gray-700 leading-relaxed">
              {(() => {
                const p = patientData as Patient & { allergies?: string };
                const allergyText = p.allergies ? `⚠ Аллергия: ${p.allergies}.` : "Аллергий нет.";
                const visitText = visits.length > 0
                  ? `Визитов: ${visits.length}. Последний: ${visits[0].diagnosis || visits[0].diagnosisCode || "без диагноза"} (зуб ${visits[0].toothNumber || "—"}).`
                  : "Завершённых визитов нет.";
                return `${allergyText} ${visitText}`;
              })()}
            </div>
          </div>

          {/* Tooth Formula */}
          <div className="w-full bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <div className="flex justify-between items-center mb-3 gap-3 flex-wrap">
              <div className="font-bold text-sm text-gray-900">Зубная формула</div>
              <div className="flex gap-1.5 flex-wrap">
                {([{ k: "all", l: "Полость рта" }, { k: "upper", l: "Верхняя челюсть" }, { k: "lower", l: "Нижняя челюсть" }] as const).map((f) => (
                  <button
                    key={f.k}
                    type="button"
                    className={`px-2.5 py-1 text-[11px] rounded-full border cursor-pointer transition ${
                      jawFilter === f.k ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100"
                    }`}
                    onClick={() => setJawFilter(f.k)}
                  >
                    {f.l}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1.5 mb-2.5">
              <span className="text-xs text-gray-500">Прикус:</span>
              <button
                type="button"
                className={`px-3 py-1 text-[11px] border rounded-full cursor-pointer transition ${
                  bite === "permanent" ? "bg-blue-50 border-blue-500 text-blue-700 font-semibold" : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                }`}
                onClick={() => switchBite("permanent")}
              >
                Постоянный
              </button>
              <button
                type="button"
                className={`px-3 py-1 text-[11px] border rounded-full cursor-pointer transition ${
                  bite === "milk" ? "bg-amber-50 border-amber-500 text-amber-600 font-semibold" : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                }`}
                onClick={() => switchBite("milk")}
              >
                Молочный
              </button>
            </div>

            <div className="flex flex-col gap-1.5 overflow-x-auto pb-2">
              {jawFilter !== "lower" && (
                <>
                  <div className="text-[11px] text-gray-400 mt-1">Верхняя челюсть</div>
                  <div className="flex flex-nowrap gap-1 min-w-max">
                    {activeUpperTeeth.map((n) => (
                      <ToothBtn key={n} n={n} status={teeth[n] || "normal"} isSelected={selectedTooth === n} bite={bite} onClick={() => handleToothClick(n, teeth[n] || "normal")} />
                    ))}
                  </div>
                </>
              )}
              {jawFilter !== "upper" && (
                <>
                  <div className="text-[11px] text-gray-400 mt-1">Нижняя челюсть</div>
                  <div className="flex flex-nowrap gap-1 min-w-max">
                    {activeLowerTeeth.map((n) => (
                      <ToothBtn key={n} n={n} status={teeth[n] || "normal"} isSelected={selectedTooth === n} bite={bite} onClick={() => handleToothClick(n, teeth[n] || "normal")} />
                    ))}
                  </div>
                </>
              )}
            </div>

            {surfacePopupTooth && (
              <SurfacePopup
                tooth={surfacePopupTooth}
                surfaces={activeSurfaces}
                onToggle={(k) => setActiveSurfaces((p) => p.includes(k) ? p.filter((s) => s !== k) : [...p, k])}
                onClose={handleSurfaceClose}
              />
            )}

            <div className="flex flex-wrap gap-2.5 mt-2.5 text-[11px] text-gray-400">
              {legend.map((l) => (
                <div key={l.key} className="flex items-center gap-1">
                  <span className={`w-2.5 h-2.5 rounded-full border ${l.bg}`} />
                  {l.label}
                  <span className="text-[10px] font-semibold bg-gray-50 border border-gray-200 rounded px-1.5 py-px text-gray-500 min-w-[16px] text-center">{l.c}</span>
                </div>
              ))}
              <div className="ml-auto">
                <button
                  type="button"
                  className="px-2.5 py-1 text-[11px] border border-gray-200 rounded-md bg-white text-gray-700 hover:bg-gray-50 hover:border-blue-500 hover:text-blue-600 transition cursor-pointer flex items-center gap-1"
                  onClick={exportToothFormula}
                >
                  <ArrowUpFromLine size={11} /> JSON
                </button>
              </div>
            </div>
            <div className="text-[11px] text-gray-400 text-right mt-1">
              {activeTeethConfig.cardLabel} • {activeTeethConfig.jawLabel}
            </div>
          </div>

          {/* AI Protocol + ICD */}
          <div className="w-full bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                {isRecording && <span className="inline-block w-3.5 h-3.5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />}
                <span className="font-bold text-blue-600 text-[15px] flex items-center gap-1.5">
                  <Bot size={16} /> ИИ-автопротокол
                </span>
              </div>
              <span className="text-[11px] text-gray-400 bg-gray-50 px-2 py-1 rounded flex items-center gap-1">
                {isRecording && <Mic size={12} className="text-red-500 animate-pulse" />}
                {aiStatus}
              </span>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-5 items-start max-[1100px]:grid-cols-1">
              {/* Form */}
              <div className="flex flex-col gap-2.5">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-gray-500">Диагноз</label>
                  <input className="w-full px-3 py-2 border border-gray-200 bg-gray-50 text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition rounded-xl" value={diagnosisText} onChange={(e) => setDiagnosisText(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-gray-500">Жалобы</label>
                  <textarea className="w-full px-3 py-2 border border-gray-200 bg-gray-50 text-sm resize-y min-h-[56px] leading-relaxed focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition rounded-xl" rows={2} value={complaints} onChange={(e) => setComplaints(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-gray-500">Анамнез</label>
                  <textarea className="w-full px-3 py-2 border border-gray-200 bg-gray-50 text-sm resize-y min-h-[56px] leading-relaxed focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition rounded-xl" rows={2} value={anamnesis} onChange={(e) => setAnamnesis(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-gray-500">Объективно</label>
                  <textarea className="w-full px-3 py-2 border border-gray-200 bg-gray-50 text-sm resize-y min-h-[64px] leading-relaxed focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition rounded-xl" rows={2} value={objective} onChange={(e) => setObjective(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-gray-500">Лечение</label>
                  <textarea className="w-full px-3 py-2 border border-gray-200 bg-gray-50 text-sm resize-y min-h-[64px] leading-relaxed focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition rounded-xl" rows={2} value={treatment} onChange={(e) => setTreatment(e.target.value)} />
                </div>

                <div className="grid grid-cols-[1.1fr_1.3fr] gap-2 max-[992px]:grid-cols-1">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-gray-500">МКБ-10</label>
                    <select className="w-full h-10 px-3 text-sm border border-gray-200 bg-gray-50 rounded-xl focus:border-blue-500 focus:outline-none" value={diagnosisCode} onChange={(e) => setDiagnosisCode(e.target.value)}>
                      <option value="">Не выбрано</option>
                      {activeIcdItems.map((item) => (
                        <option key={item.code} value={item.code}>{item.label}</option>
                      ))}
                    </select>
                    {AI_SUGGESTIONS[diagnosisCode] && (
                      <div className="mt-1.5 p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-[11px] flex flex-col gap-1">
                        <div className="font-bold text-blue-600 flex items-center gap-1"><Sparkles size={11} /> ИИ-рекомендация</div>
                        <div><span className="text-gray-500">Материал:</span> {AI_SUGGESTIONS[diagnosisCode].material}</div>
                        <div><span className="text-gray-500">Анестезия:</span> {AI_SUGGESTIONS[diagnosisCode].anesthesia}</div>
                        <div><span className="text-gray-500">Время:</span> {AI_SUGGESTIONS[diagnosisCode].time}</div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-gray-500">Тип кариеса</label>
                    <div className="flex flex-wrap gap-1.5">
                      {([{ k: "surface", l: "Поверхностный" }, { k: "medium", l: "Средний" }, { k: "deep", l: "Глубокий" }, { k: "complicated", l: "Осложнённый" }] as const).map((c) => (
                        <button
                          key={c.k}
                          type="button"
                          className={`px-2.5 py-1 text-[11px] rounded-full border cursor-pointer transition ${
                            cariesType === c.k
                              ? "bg-blue-50 border-blue-500 text-blue-700 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]"
                              : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                          }`}
                          onClick={() => setCariesType(c.k)}
                        >
                          {c.l}
                        </button>
                      ))}
                    </div>
                    {cariesType && <div className="text-[11px] text-gray-400 mt-1">{CARIES_HINTS[cariesType]}</div>}
                  </div>
                </div>

                <div className="flex flex-col gap-2 mt-2">
                  {visitFinished && (
                    <button
                      className="w-full py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition flex items-center justify-center gap-2"
                      onClick={() => setShowPrescription(true)}
                    >
                      <FileText size={14} /> Выписать рецепт (Форма 107-1/у)
                    </button>
                  )}
                  {visitFinished ? (
                    <div className="text-center py-4 bg-green-50 rounded-lg text-green-600 font-semibold flex items-center justify-center gap-2">
                      <CheckCircle2 size={18} /> Прием завершен и материалы списаны
                    </div>
                  ) : (
                    <button
                      className="w-full py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                      disabled={finishing}
                      onClick={handleFinishVisit}
                    >
                      {finishing ? (
                        <><span className="inline-block w-3.5 h-3.5 border-2 border-white border-r-transparent rounded-full animate-spin" /> Сохранение...</>
                      ) : "Завершить прием и списать материалы"}
                    </button>
                  )}
                  <div className="grid grid-cols-2 gap-2 max-[992px]:grid-cols-1">
                    <button
                      className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition flex items-center justify-center gap-1.5"
                      onClick={handleExportProtocol}
                    >
                      <FileDown size={14} /> Экспорт PDF
                    </button>
                    <button
                      className={`px-3 py-2 text-sm font-medium rounded-lg transition flex items-center justify-center gap-1.5 ${
                        egovSigned
                          ? "bg-green-50 border border-green-300 text-green-600 cursor-default"
                          : "text-gray-700 bg-white border border-gray-200 hover:bg-gray-50"
                      }`}
                      onClick={egovSigned ? undefined : handleSignProtocol}
                    >
                      {egovSigned ? <><CheckCircle2 size={14} /> Подписано ЭЦП</> : <><Key size={14} /> Подпись eGov</>}
                    </button>
                  </div>
                  {documentMessage && (
                    <div className="text-[11px] text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                      {documentMessage}
                    </div>
                  )}
                  {patientFiles.length > 0 && (
                    <div className="text-[11px] text-gray-500">
                      Документы пациента: {patientFiles.length}
                      {protocolDocument?.id ? " · протокол создан" : ""}
                    </div>
                  )}
                </div>
              </div>

              {/* ICD */}
              <IcdTree key={bite} activeCode={diagnosisCode} dataset={activeIcdDataset} onSelect={(code, label) => { setDiagnosisCode(code); setDiagnosisText(label); }} />
            </div>
          </div>
        </div>
      )}

      {/* ─── IMAGES TAB ─── */}
      {activeTab === "images" && (
        <div className="w-full max-w-[1180px] mx-auto p-6 flex flex-col gap-5">
          <input type="file" ref={fileRef} accept="image/*" className="hidden" onChange={handleImageUpload} />
          <input type="file" ref={beforeFileRef} accept="image/*" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            setImageMessage("");
            try {
              const { url } = await uploadPatientImage(f, "before");
              setBeforeImage(url);
              setImageMessage("Фото до лечения сохранено в файлах пациента");
            } catch (err) {
              setImageMessage(err instanceof Error ? err.message : "Не удалось загрузить фото до лечения");
            }
            e.target.value = "";
          }} />
          <input type="file" ref={afterFileRef} accept="image/*" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            setImageMessage("");
            try {
              const { url } = await uploadPatientImage(f, "after");
              setAfterImage(url);
              setImageMessage("Фото после лечения сохранено в файлах пациента");
            } catch (err) {
              setImageMessage(err instanceof Error ? err.message : "Не удалось загрузить фото после лечения");
            }
            e.target.value = "";
          }} />

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div>
              <h2 className="m-0 text-lg font-semibold text-gray-950">Изображения приема</h2>
              <p className="m-0 mt-1 text-sm text-gray-500">Снимки, фото до/после и документы, прикрепленные к текущему визиту.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={`px-3.5 py-2 text-sm font-medium rounded-xl border transition ${!beforeAfterMode ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
                onClick={() => setBeforeAfterMode(false)}
              >
                Галерея
              </button>
              <button
                type="button"
                className={`px-3.5 py-2 text-sm font-medium rounded-xl border transition ${beforeAfterMode ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
                onClick={() => setBeforeAfterMode(true)}
              >
                До / После
              </button>
              {!beforeAfterMode && (
                <select
                  value={imageUploadKind}
                  onChange={(event) => setImageUploadKind(event.target.value)}
                  className="px-3.5 py-2 text-sm font-medium rounded-xl border border-gray-200 bg-white text-gray-700 outline-none"
                  aria-label="Категория изображения"
                >
                  <option value="xray">ОПТГ / рентген</option>
                  <option value="ct">КТ / 3D</option>
                  <option value="other">Другое изображение</option>
                </select>
              )}
              <button
                type="button"
                className="px-3.5 py-2 text-sm font-medium rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition flex items-center gap-2"
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={16} /> Загрузить
              </button>
            </div>
          </div>
          {imageMessage && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">
              {imageMessage}
            </div>
          )}

          {beforeAfterMode ? (
            <div className="grid grid-cols-2 gap-4 max-[900px]:grid-cols-1">
              <div className="flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">До лечения</div>
                <div
                  className="flex flex-col items-center justify-center min-h-[280px] border border-dashed border-gray-300 rounded-2xl bg-gray-50 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition overflow-hidden"
                  onClick={() => beforeFileRef.current?.click()}
                >
                  {beforeImage ? <img src={beforeImage} alt="До" className="w-full h-auto max-h-[360px] object-contain" /> : <><Upload size={22} className="text-gray-400 mb-2" /><span className="text-sm text-gray-400">Загрузить фото до лечения</span></>}
                </div>
              </div>
              <div className="flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">После лечения</div>
                <div
                  className="flex flex-col items-center justify-center min-h-[280px] border border-dashed border-gray-300 rounded-2xl bg-gray-50 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition overflow-hidden"
                  onClick={() => afterFileRef.current?.click()}
                >
                  {afterImage ? <img src={afterImage} alt="После" className="w-full h-auto max-h-[360px] object-contain" /> : <><Upload size={22} className="text-gray-400 mb-2" /><span className="text-sm text-gray-400">Загрузить фото после лечения</span></>}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div
                className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-blue-300 bg-blue-50/25 p-8 text-blue-600 cursor-pointer hover:bg-blue-50 transition"
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={28} />
                <div className="text-center">
                  <div className="text-base font-semibold">Прикрепить изображение</div>
                  <div className="mt-1 text-sm text-blue-500/80">ОПТГ, КТ, фото полости рта или документ</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {["Все", "ОПТГ", "КТ", "Фото", "Документы"].map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    className={`px-3 py-1.5 rounded-full border text-xs font-medium transition ${index === 0 ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="m-0 text-sm font-semibold text-gray-950">
                    {activeAppointment?.date
                      ? new Date(activeAppointment.date).toLocaleDateString("ru-RU", { month: "long", year: "numeric" })
                      : new Date().toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
                  </h3>
                  <span className="text-xs text-gray-400">{images.length} файл(а)</span>
                </div>

                {images.length === 0 ? (
                  <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-gray-100 bg-gray-50 text-sm text-gray-400">
                    Пока нет изображений для этого приема
                  </div>
                ) : (
                  <div className="grid grid-cols-[minmax(0,1.2fr)_260px] gap-4 max-[900px]:grid-cols-1">
                    <div className="flex min-h-[360px] items-center justify-center rounded-2xl bg-gray-50 border border-gray-100 overflow-hidden">
                      {activeImage ? (
                        <img src={activeImage} alt="Активное изображение" className="w-full h-auto max-h-[520px] object-contain block" />
                      ) : (
                        <span className="text-sm text-gray-400">Выберите изображение</span>
                      )}
                    </div>
                    <div className="grid content-start gap-3">
                      {images.map((img) => (
                        <div key={img.id} className={`relative rounded-xl border p-2 transition ${activeImage === img.url ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:bg-gray-50"}`}>
                          <button type="button" className="block w-full text-left" onClick={() => setActiveImage(img.url)}>
                            <img src={img.url} alt="Миниатюра" className="h-24 w-full rounded-lg object-cover bg-gray-50" />
                            <div className="mt-2 text-xs font-medium text-gray-700">Изображение визита</div>
                            <div className="text-[11px] text-gray-400">Прикреплено к ИИ-модулю</div>
                          </button>
                          <button
                            type="button"
                            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-white bg-black/60 text-sm text-white transition hover:bg-red-600"
                            onClick={() => { void handleDeleteImage(img.id); }}
                            aria-label="Удалить изображение"
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}

      {/* ─── MATERIALS TAB ─── */}
      {activeTab === "materials" && (
        <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm">
          <h3 className="text-base font-bold text-gray-900 mt-0 mb-1.5">Материалы визита</h3>
          <p className="text-[13px] text-gray-500 mb-2.5">Будут списаны со склада при завершении приема.</p>
          <div className="flex flex-col gap-2 mt-1">
            {materials.map((m, i) => (
              <div key={m.code} className="flex items-center gap-2 justify-between text-xs px-2.5 py-2 rounded-md bg-gray-50">
                <span className="flex-1 font-medium">{m.name}</span>
                <div className="flex items-center gap-2">
                  <button type="button" className="w-5 h-5 rounded border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 flex items-center justify-center text-xs" onClick={() => setMaterials((p) => p.map((x, j) => j === i ? { ...x, qty: Math.max(1, x.qty - 1) } : x))}>−</button>
                  <span className="min-w-[20px] text-center font-semibold">{m.qty}</span>
                  <button type="button" className="w-5 h-5 rounded border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 flex items-center justify-center text-xs" onClick={() => setMaterials((p) => p.map((x, j) => j === i ? { ...x, qty: x.qty + 1 } : x))}>+</button>
                  <span className="text-[11px] text-gray-400">{m.unit}</span>
                  <button type="button" className="text-red-400 hover:text-red-600 text-xs ml-1" onClick={() => setMaterials((p) => p.filter((_, j) => j !== i))}>✕</button>
                </div>
              </div>
            ))}
            <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-2 max-[640px]:grid-cols-1">
              <select
                value={materialSelectId}
                onChange={(event) => setMaterialSelectId(event.target.value)}
                className="min-h-9 rounded-lg border border-blue-200 bg-white px-3 text-xs font-medium text-gray-700 outline-none"
              >
                {inventoryItems.length === 0 ? (
                  <option value="">Склад пока не загружен</option>
                ) : inventoryItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.quantity} {item.unit}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="px-3 py-2 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition disabled:opacity-50"
                disabled={!materialSelectId}
                onClick={addSelectedMaterial}
              >
                + Добавить со склада
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── SERVICES TAB ─── */}
      {activeTab === "services" && (
        <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm">
          <h3 className="text-base font-bold text-gray-900 mt-0 mb-1.5">Оказанные услуги</h3>
          <p className="text-[13px] text-gray-500 mb-2.5">Услуги рассчитываются backend по данным текущего визита.</p>
          <div className="flex flex-col gap-2 mt-1">
            {visibleVisitServices.length === 0 ? (
              <div className="text-xs px-2.5 py-2 rounded-md bg-gray-50 text-gray-500">
                Начните или завершите визит, чтобы увидеть рассчитанные услуги.
              </div>
            ) : visibleVisitServices.map((s) => (
              <div key={`${s.code}-${s.name}`} className="flex items-center gap-2 justify-between text-xs px-2.5 py-2 rounded-md bg-gray-50">
                <span className="font-semibold text-[11px] text-blue-700">{s.code}</span>
                <span className="flex-1">{s.name}</span>
                <span className="text-[11px] text-gray-500">{Number(s.price || 0).toLocaleString("ru-RU")} ₸</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── HISTORY TAB ─── */}
      {activeTab === "history" && (
        <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm">
          <h3 className="text-base font-bold text-gray-900 mt-0 mb-1.5">История болезни</h3>
          <p className="text-[13px] text-gray-500 mb-2.5">Визиты пациента по данным ИИ-модуля.</p>
          <div className="flex flex-col gap-1.5 mt-1.5">
            {visits.length === 0 ? (
              <div className="text-xs text-gray-400">Пока нет завершённых визитов</div>
            ) : (
              visits.map((v) => (
                <div key={v.id} className="text-xs px-2.5 py-2 rounded-md bg-gray-50 flex flex-col gap-0.5">
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold">{v.diagnosis || "Без диагноза"}</span>
                    <span className="text-[11px] text-gray-500">{v.startedAt?.slice(0, 10)} {v.startedAt?.slice(11, 16)}</span>
                  </div>
                  <div className="text-[11px] text-gray-500">
                    Тип кариеса: {v.cariesType || "—"}{v.diagnosisCode ? ` • ${v.diagnosisCode}` : ""}{v.toothNumber ? ` • зуб ${v.toothNumber}` : ""}
                  </div>
                </div>
              ))
            )}
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

      {/* Prescription Modal */}
      {showPrescription && (
        <Modal title="Рецепт (Форма 107-1/у)" onClose={() => setShowPrescription(false)}>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
              <div><span className="font-semibold text-gray-700">Пациент:</span> {patientData.name}</div>
              <div><span className="font-semibold text-gray-700">Дата:</span> {new Date().toLocaleDateString("ru-RU")}</div>
              <div><span className="font-semibold text-gray-700">Диагноз:</span> {diagnosisCode || "—"}</div>
              <div><span className="font-semibold text-gray-700">Врач:</span> {activeAppointment?.doctorName || "—"}</div>
            </div>
            <div className="h-px bg-gray-200" />
            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Rp: Назначения</div>
            <div className="flex flex-col gap-2">
              {getPrescription(diagnosisCode).map((rx, i) => (
                <div key={i} className="px-3 py-2.5 bg-gray-50 rounded-lg text-xs flex flex-col gap-0.5">
                  <div className="font-semibold text-gray-900">{rx.drug}</div>
                  <div className="text-gray-500">{rx.dose} — {rx.schedule}</div>
                </div>
              ))}
            </div>
            <div className="text-[11px] text-gray-400 border border-dashed border-gray-300 rounded-lg p-2.5">
              Принимайте препараты строго по назначению врача. Не изменяйте дозировку самостоятельно.
            </div>
            <button
              className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition text-sm flex items-center justify-center gap-2"
              onClick={() => { showToast("Рецепт сохранен в карту пациента"); setShowPrescription(false); }}
            >
              <FileDown size={14} /> Сохранить и распечатать
            </button>
          </div>
        </Modal>
      )}

      {/* Modal */}
      {modal && (
        <Modal title={modal.title} onClose={() => setModal(null)}>
          {modal.title.includes("PDF") && modal.phase === "loading" && (
            <div className="text-center p-5">
              <div className="text-base font-semibold mb-3">Проверка протокола перед экспортом</div>
              <div className="text-[13px] text-gray-500 mb-2"><b>Диагноз:</b> {diagnosisText || "—"}</div>
              <div className="text-[13px] text-gray-500 mb-2"><b>МКБ-10:</b> {diagnosisCode || "—"} &bull; <b>Тип кариеса:</b> {cariesType || "—"}</div>
              <div className="text-[13px] text-gray-500 mb-2"><b>Раздел:</b> {activeIcdDataset.sourceSection}</div>
              <div className="text-[13px] text-gray-500 mb-4"><b>Зуб:</b> {selectedTooth || "—"}</div>
              <span className="inline-block w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
              <div className="text-[13px] text-gray-400">Формируем амбулаторную карту: {activeIcdDataset.ambulatoryLabel} (Форма №043/у)...</div>
            </div>
          )}
          {modal.title.includes("PDF") && modal.phase === "done" && (
            <div className="text-center p-5">
              <CheckCircle2 size={48} className="text-green-500 mx-auto mb-4" />
              <div className="text-base font-semibold mb-3">PDF успешно сформирован</div>
              <div className="text-[13px] text-gray-400 mb-6">Документ автоматически сохранен в карту пациента и скачан.</div>
              <button className="w-full px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition" onClick={() => setModal(null)}>Закрыть</button>
            </div>
          )}
          {modal.title.includes("eGov") && modal.phase === "select" && (
            <div className="p-2.5">
              <div className="text-[13px] text-gray-500 mb-2">Документ для подписи сформирован на основе ИИ-протокола:</div>
              <div className="text-[13px] text-gray-500 mb-3"><b>МКБ-10:</b> {diagnosisCode || "—"} &bull; <b>Тип кариеса:</b> {cariesType || "—"} &bull; <b>Зуб:</b> {selectedTooth || "—"}</div>
              <div
                className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer bg-gray-50 mb-5 hover:border-blue-500 hover:bg-blue-50/30 transition"
                onClick={() => setModal((p) => p ? { ...p, phase: "password" } : null)}
              >
                <Key size={32} className="text-blue-600 mx-auto mb-2" />
                <div className="font-semibold text-sm text-blue-600">Выбрать файл ЭЦП</div>
                <div className="text-[11px] text-gray-400 mt-1">.p12 или .cer</div>
              </div>
            </div>
          )}
          {modal.title.includes("eGov") && modal.phase === "password" && (
            <div className="p-2.5">
              <div className="text-[13px] text-gray-500 mb-3"><b>МКБ-10:</b> {diagnosisCode || "—"} &bull; <b>Тип кариеса:</b> {cariesType || "—"} &bull; <b>Зуб:</b> {selectedTooth || "—"}</div>
              <div className="border border-green-300 rounded-lg p-4 text-center mb-4 bg-green-50/50 flex items-center justify-center gap-2">
                <Check size={16} className="text-green-600" />
                <span className="font-semibold text-[13px]">GOSTKNCA_xxxxxxxx.p12 выбран</span>
              </div>
              <div className="mb-4">
                <label className="text-xs font-semibold block mb-2">Пароль от хранилища ключей:</label>
                <input type="password" className="w-full px-3 py-2 border border-gray-200 bg-white text-sm rounded-lg" placeholder="Введите пароль..." />
              </div>
              <button
                className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
                onClick={() => {
                  setModal((p) => p ? { ...p, phase: "signing" } : null);
                  setTimeout(() => { setEgovSigned(true); setModal(null); }, 1500);
                }}
              >
                Подписать документ
              </button>
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
          <Mic size={22} className="text-blue-600 shrink-0" />
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
    <Suspense fallback={<div className="p-6 text-center text-gray-400">Загрузка...</div>}>
      <AiPageContent />
    </Suspense>
  );
}
