import { renderAiPage, renderAiPatientRow } from "./ai.view.js";
import {
  searchPatients,
  getPatientById,
  finishVisit,
  getVisitsByPatient,
  getActiveAppointmentByPatient,
} from "../../core/api.js";
import { openModal } from "../../ui/modal.js";

export async function mountAiPage() {
  const page = document.getElementById("page-content");
  page.innerHTML = '<div style="padding: 20px;">Загрузка...</div>';

  // URL-дан пациенттің ID-ін оқу (мысалы: #ai?patient=p1)
  const hash = window.location.hash || "";
  const queryPart = hash.includes("?") ? hash.split("?")[1] : "";
  const params = new URLSearchParams(queryPart);
  const patientId = params.get("patient");

  let patientData = null;
  let allPatients = [];
  let activeAppointment = null;

  if (patientId) {
    try {
      patientData = await getPatientById(patientId);
      activeAppointment = await getActiveAppointmentByPatient(patientId);
    } catch (e) {
      console.error(e);
    }
  } else {
    try {
      allPatients = await searchPatients();
    } catch (e) {
      console.error(e);
    }
  }

  page.innerHTML = renderAiPage({ patientId, patientData, allPatients });

  // helper: read current AI visit data from DOM
  function readCurrentAiVisitData() {
    const complaintsEl = document.getElementById("aiComplaints");
    const anamnesisEl = document.getElementById("aiAnamnesis");
    const objectiveEl = document.getElementById("aiObjective");
    const diagnosisTextEl = document.getElementById("aiDiagnosisText");
    const treatmentEl = document.getElementById("aiTreatment");
    const codeEl = document.getElementById("aiDiagnosisCode");
    const cariesWrap = document.getElementById("aiCariesType");
    const toothFormula = document.getElementById("aiToothFormula");

    const complaints =
      complaintsEl && "value" in complaintsEl ? complaintsEl.value : "";
    const anamnesis =
      anamnesisEl && "value" in anamnesisEl ? anamnesisEl.value : "";
    const objective =
      objectiveEl && "value" in objectiveEl ? objectiveEl.value : "";
    const diagnosisText =
      diagnosisTextEl && "value" in diagnosisTextEl
        ? diagnosisTextEl.value
        : "";
    const treatment =
      treatmentEl && "value" in treatmentEl ? treatmentEl.value : "";

    const diagnosisCode = codeEl && "value" in codeEl ? codeEl.value : "";
    const cariesType = cariesWrap
      ? String(cariesWrap.getAttribute("data-value") || "")
      : "";
    const toothNumber = toothFormula
      ? String(toothFormula.getAttribute("data-selected-tooth") || "")
      : "";

    const removedTeeth = [];
    const missingTeeth = [];
    toothFormula?.querySelectorAll(".ai-tooth").forEach((toothEl) => {
      const status = toothEl.getAttribute("data-status");
      const num = toothEl.getAttribute("data-tooth");
      if (!num) return;
      if (status === "removed") removedTeeth.push(num);
      if (status === "missing") missingTeeth.push(num);
    });

    // Простая заготовка для материалов — потом можно связать со складом
    const materials = [
      {
        code: "ultracain",
        name: "Ultracain D-S forte 1.7ml",
        qty: 1,
        unit: "амп",
      },
      { code: "filtek", name: "Filtek Z250 (шприц)", qty: 1, unit: "шт" },
    ];

    return {
      complaint: complaints,
      diagnosis: diagnosisText,
      notes: treatment,
      diagnosisCode,
      cariesType,
      toothNumber,
      removedTeeth,
      missingTeeth,
      protocol: {
        complaints,
        anamnesis,
        objective,
        diagnosisText,
        treatment,
      },
      materials,
    };
  }

  // Функция обновления AI‑подсказки при смене типа кариеса
  function updateCariesHint(type) {
    const hintBlock = document.querySelector(".ai-form-field .ai-hint");
    if (!hintBlock) return;

    const hints = {
      surface:
        "Для поверхностного кариеса рекомендовано реминерализующая терапия.",
      medium:
        "Для среднего кариеса — препарирование и пломбирование Filtek Z250.",
      deep: "Для K02.1 рекомендовано применение биоактивных прокладок (MTA) при глубоком кариесе.",
      complicated:
        "Осложнённый кариес — требуется эндодонтическое лечение (пульпит/периодонтит).",
    };

    hintBlock.textContent = hints[type] || "";
  }

  // Запись голоса + AI анализ
  const recordBtn = document.getElementById("startRecordingBtn");
  const aiSpinner = document.getElementById("aiSpinner");
  const aiStatus = document.getElementById("aiStatus");

  if (recordBtn) {
    let isRecording = false;
    let timerInterval = null;
    let secondsElapsed = 0;
    let fullTranscript = "";

    function formatTime(seconds) {
      const m = String(Math.floor(seconds / 60)).padStart(2, "0");
      const s = String(seconds % 60).padStart(2, "0");
      return `${m}:${s}`;
    }

    function startTimer() {
      secondsElapsed = 0;
      if (aiStatus) aiStatus.textContent = `🔴 ${formatTime(secondsElapsed)}`;
      timerInterval = setInterval(() => {
        secondsElapsed++;
        if (aiStatus) aiStatus.textContent = `🔴 ${formatTime(secondsElapsed)}`;
      }, 1000);
    }

    function stopTimer() {
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;

    if (SpeechRecognition) {
      recognition = new SpeechRecognition();
      recognition.lang = "ru-RU";
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event) => {
        let interimText = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            fullTranscript += transcript + " ";
            const complaintsEl = document.getElementById("aiComplaints");
            if (complaintsEl) complaintsEl.value = fullTranscript.trim();
          } else {
            interimText = transcript;
          }
        }

        if (aiStatus && interimText) {
          aiStatus.textContent = `🎤 ${interimText}`;
        }
      };

      recognition.onerror = (event) => {
        console.error("Speech error:", event.error);
        if (aiStatus) aiStatus.textContent = `Ошибка: ${event.error}`;
      };

      recognition.onend = () => {
        if (isRecording && recognition) recognition.start();
      };
    }

    async function analyzeTranscript(text) {
      if (!text || text.trim().length < 5) {
        if (aiStatus) aiStatus.textContent = "Слушаю...";
        return;
      }

      if (aiStatus) aiStatus.textContent = "✅ Запись сохранена";
      if (aiSpinner) aiSpinner.style.display = "none";

      const trimmed = text.trim();
      const complaintsEl = document.getElementById("aiComplaints");
      if (complaintsEl && !complaintsEl.value.trim()) {
        complaintsEl.value = trimmed;
      }

      const lower = trimmed.toLowerCase();

      const anamnesisEl = document.getElementById("aiAnamnesis");
      if (anamnesisEl && !anamnesisEl.value.trim()) {
        if (
          lower.includes("ранее") ||
          lower.includes("раньше") ||
          lower.includes("лечил") ||
          lower.includes("не лечил") ||
          lower.includes("впервые")
        ) {
          anamnesisEl.value = "Со слов пациента: " + trimmed;
        }
      }

      const objectiveEl = document.getElementById("aiObjective");
      if (objectiveEl && !objectiveEl.value.trim()) {
        if (
          lower.includes("полость") ||
          lower.includes("зондирование") ||
          lower.includes("болезненно") ||
          lower.includes("кариес")
        ) {
          objectiveEl.value = trimmed;
        }
      }

      const cariesWrap = document.getElementById("aiCariesType");
      if (cariesWrap) {
        let detectedType = null;

        if (lower.includes("глубок")) detectedType = "deep";
        else if (lower.includes("средн")) detectedType = "medium";
        else if (lower.includes("поверхностн")) detectedType = "surface";
        else if (
          lower.includes("пульпит") ||
          lower.includes("осложн") ||
          lower.includes("периодонтит")
        )
          detectedType = "complicated";

        if (detectedType) {
          cariesWrap
            .querySelectorAll(".ai-caries-chip")
            .forEach((c) => c.classList.remove("ai-caries-chip-active"));
          const targetChip = cariesWrap.querySelector(
            `[data-caries-type="${detectedType}"]`,
          );
          if (targetChip) {
            targetChip.classList.add("ai-caries-chip-active");
            cariesWrap.setAttribute("data-value", detectedType);
          }
        }
      }

      const codeSelect = document.getElementById("aiDiagnosisCode");
      if (codeSelect) {
        if (lower.includes("пульпит")) {
          codeSelect.value = "K04.0";
        } else if (lower.includes("периодонтит")) {
          codeSelect.value = "K04.4";
        } else if (lower.includes("глубок") && lower.includes("кариес")) {
          codeSelect.value = "K02.1";
        } else if (lower.includes("средн") && lower.includes("кариес")) {
          codeSelect.value = "K02.1";
        } else if (lower.includes("эмал") || lower.includes("поверхностн")) {
          codeSelect.value = "K02.0";
        }
      }

      const toast = document.createElement("div");
      toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
    padding: 14px 18px;
    border-radius: var(--radius);
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  `;
      toast.innerHTML = `
    <span style="font-size: 20px;">🎤</span>
    <div>
      <div style="font-weight: 600;">Запись завершена</div>
      <div style="color: var(--muted); font-size: 12px;">Поля протокола заполнены из речи</div>
    </div>
  `;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3500);
    }

    recordBtn.addEventListener("click", () => {
      isRecording = !isRecording;

      if (isRecording) {
        fullTranscript = "";
        startTimer();

        if (recognition) {
          recognition.start();
        } else if (aiStatus) {
          aiStatus.textContent = "🔴 00:00";
        }

        recordBtn.innerHTML = `
          <span class="ai-core-record-dot"></span>
          Остановить запись
        `;
        recordBtn.style.background = "#ef4444";
        if (aiSpinner) aiSpinner.style.display = "inline-block";
      } else {
        stopTimer();
        if (recognition) recognition.stop();

        recordBtn.innerHTML = `
          <span style="color:white;">▶️</span>
          Слушать прием (Запись голоса)
        `;
        recordBtn.style.background = "var(--primary)";
        if (aiSpinner) aiSpinner.style.display = "none";
        if (aiStatus) aiStatus.textContent = "Обработка...";

        analyzeTranscript(fullTranscript);
      }
    });
  }

  // Tooth formula: select tooth, change status (норма → кариес → пломба → здоров → удалён → отсутствует → норма)
  const toothFormula = document.getElementById("aiToothFormula");
  if (toothFormula) {
    const STATUS_ORDER = [
      "normal",
      "caries",
      "filling",
      "healthy",
      "removed",
      "missing",
    ];
    const surfacePopup = document.getElementById("aiToothSurfacePopup");

    function getNextStatus(current) {
      const idx = STATUS_ORDER.indexOf(current);
      if (idx === -1 || idx === STATUS_ORDER.length - 1) return STATUS_ORDER[0];
      return STATUS_ORDER[idx + 1];
    }

    function applyToothVisualState(btn, status) {
      btn.setAttribute("data-status", status);
      btn.classList.remove(
        "ai-tooth--normal",
        "ai-tooth--caries",
        "ai-tooth--filling",
        "ai-tooth--healthy",
        "ai-tooth--removed",
        "ai-tooth--missing",
      );
      btn.classList.add(`ai-tooth--${status}`);

      const img = btn.querySelector(".ai-tooth-icon");
      if (img) {
        let file = "Whitetooth.png";
        if (status === "caries") file = "RedCaries.png";
        if (status === "filling") file = "Yellowplomb.png";
        if (status === "healthy") file = "Greentooth.png";
        if (status === "removed") file = "Whitetooth.png";
        if (status === "missing") file = "Whitetooth.png";
        img.src = `/assets/images/teeth/${file}`;

        if (status === "removed") {
          img.style.filter = "grayscale(1) opacity(0.4)";
          img.style.transform = "scale(0.85)";
          btn.title = `Зуб ${btn.getAttribute("data-tooth")} — Удалён`;
        } else if (status === "missing") {
          img.style.filter = "grayscale(1) opacity(0.2)";
          img.style.transform = "scale(0.75)";
          btn.title = `Зуб ${btn.getAttribute("data-tooth")} — Отсутствует`;
        } else {
          img.style.filter = "none";
          img.style.transform = "scale(1)";
          btn.title = `Зуб ${btn.getAttribute("data-tooth")}`;
        }
      }

      const number = btn.querySelector(".ai-tooth-number");
      if (number) {
        if (status === "removed") {
          number.style.color = "#ef4444";
          number.style.textDecoration = "line-through";
        } else if (status === "missing") {
          number.style.color = "#d1d5db";
          number.style.textDecoration = "line-through";
        } else {
          number.style.color = "";
          number.style.textDecoration = "";
        }
      }

      updateToothStats();
    }

    function updateToothStats() {
      if (!toothFormula) return;
      const allTeeth = toothFormula.querySelectorAll(".ai-tooth");
      const cnt = {
        normal: 0,
        caries: 0,
        filling: 0,
        healthy: 0,
        removed: 0,
        missing: 0,
      };
      allTeeth.forEach((t) => {
        const s = t.getAttribute("data-status") || "normal";
        if (cnt[s] !== undefined) cnt[s]++;
      });
      const ids = {
        normal: "toothStatNormal",
        caries: "toothStatCaries",
        filling: "toothStatFilling",
        healthy: "toothStatHealthy",
        removed: "toothStatRemoved",
        missing: "toothStatMissing",
      };
      Object.entries(ids).forEach(([k, id]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = cnt[k];
      });
    }

    toothFormula.addEventListener("click", (e) => {
      const item = e.target.closest?.(".ai-tooth");
      if (!item) return;
      const tooth = item.getAttribute("data-tooth");
      if (!tooth) return;

      // смена статуса по клику
      const currentStatus = item.getAttribute("data-status") || "normal";
      const nextStatus = getNextStatus(currentStatus);
      applyToothVisualState(item, nextStatus);

      // popup выбора поверхности при кариесе
      if (nextStatus === "caries" && surfacePopup) {
        surfacePopup.style.display = "block";
        surfacePopup.setAttribute("data-tooth", tooth);
        surfacePopup
          .querySelectorAll(".ai-surface-btn")
          .forEach((b) => b.classList.remove("ai-surface-btn--active"));
      } else if (surfacePopup) {
        surfacePopup.style.display = "none";
      }

      // выделение выбранного зуба
      toothFormula
        .querySelectorAll(".ai-tooth")
        .forEach((el) => el.classList.toggle("ai-tooth-selected", el === item));
      toothFormula.setAttribute("data-selected-tooth", tooth);

      // обновление текста диагноза (номер зуба в скобках)
      const diagnosisInput = document.getElementById("aiDiagnosisText");
      if (diagnosisInput && "value" in diagnosisInput) {
        const current = String(diagnosisInput.value || "");
        const withoutTooth = current.replace(/\(\d{1,2}\)\s*$/u, "").trim();
        diagnosisInput.value = `${withoutTooth} (${tooth})`.trim();
      }
    });
    // Выбор поверхности зуба в popup
    surfacePopup?.addEventListener("click", (e) => {
      const btn = e.target.closest(".ai-surface-btn");
      if (btn) {
        btn.classList.toggle("ai-surface-btn--active");
        return;
      }

      const closeBtn = e.target.closest(".ai-surface-close-btn");
      if (closeBtn) {
        const selected = Array.from(
          surfacePopup.querySelectorAll(".ai-surface-btn--active"),
        )
          .map((b) => b.getAttribute("data-surface"))
          .filter(Boolean)
          .join(", ");

        const toothNum = surfacePopup.getAttribute("data-tooth");
        const diagnosisInput = document.getElementById("aiDiagnosisText");
        if (
          diagnosisInput &&
          "value" in diagnosisInput &&
          toothNum &&
          selected
        ) {
          diagnosisInput.value = `Кариес дентина (${toothNum}) — пов.: ${selected}`;
        }

        surfacePopup.style.display = "none";
      }
    });

    // Закрытие popup при клике вне его
    document.addEventListener("click", (e) => {
      if (!surfacePopup || surfacePopup.style.display !== "block") {
        return;
      }
      const target = e.target;
      if (surfacePopup.contains(target) || target.closest?.(".ai-tooth")) {
        return;
      }
      surfacePopup.style.display = "none";
    });

    // Фильтры: верхняя/нижняя/вся полость рта
    const filters = document.querySelectorAll(".ai-tooth-filter");
    filters.forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.getAttribute("data-filter") || "all";
        filters.forEach((b) =>
          b.classList.toggle("ai-tooth-filter-active", b === btn),
        );

        // 1) Зубтар: фильтр бойынша көрсету/жасыру
        toothFormula.querySelectorAll(".ai-tooth").forEach((toothEl) => {
          const jaw = toothEl.getAttribute("data-jaw");
          if (!jaw) return;
          let visible = true;
          if (mode === "upper") visible = jaw === "upper";
          else if (mode === "lower") visible = jaw === "lower";
          toothEl.classList.toggle("ai-tooth--hidden", !visible);
        });

        // 2) Лейблдер: "Верхняя челюсть" / "Нижняя челюсть"
        toothFormula.querySelectorAll("[data-jaw-label]").forEach((label) => {
          const jaw = label.getAttribute("data-jaw-label");
          let visible = true;
          if (mode === "upper") visible = jaw === "upper";
          else if (mode === "lower") visible = jaw === "lower";
          label.style.display = visible ? "" : "none";
        });

        // 3) Рядтар: .ai-tooth-row — ішінде бар зубтарға қарай
        toothFormula.querySelectorAll(".ai-tooth-row").forEach((row) => {
          const hasUpper = row.querySelector('[data-jaw="upper"]');
          const hasLower = row.querySelector('[data-jaw="lower"]');
          let visible = true;
          if (mode === "upper" && hasLower && !hasUpper) visible = false;
          if (mode === "lower" && hasUpper && !hasLower) visible = false;
          row.style.display = visible ? "" : "none";
        });
      });
    });

    // Переключатель прикуса — Постоянный / Молочный
    const biteButtons = document.querySelectorAll(".ai-bite-btn");
    if (biteButtons.length) {
      biteButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const bite = btn.getAttribute("data-bite") || "permanent";

          biteButtons.forEach((b) => b.classList.remove("ai-bite-btn--active"));
          btn.classList.add("ai-bite-btn--active");

          if (toothFormula) {
            toothFormula.setAttribute("data-bite", bite);
          }

          toothFormula?.querySelectorAll(".ai-tooth").forEach((toothEl) => {
            const img = toothEl.querySelector(".ai-tooth-icon");
            if (!img) return;

            if (bite === "milk") {
              img.style.filter = "sepia(0.5) saturate(1.3) brightness(1.05)";
              img.style.transform = "scale(0.88)";
              toothEl.title = `Молочный зуб ${toothEl.getAttribute(
                "data-tooth",
              )}`;
            } else {
              img.style.filter = "none";
              img.style.transform = "scale(1)";
              toothEl.title = `Зуб ${toothEl.getAttribute("data-tooth")}`;
            }
          });

          const biteIndicator = document.getElementById("aiBiteIndicator");
          if (biteIndicator) {
            biteIndicator.textContent =
              bite === "milk" ? "Молочный прикус" : "Постоянный прикус";
            biteIndicator.style.color =
              bite === "milk" ? "#d97706" : "var(--muted)";
          }
        });
      });
    }

    // JSON экспорт зубной формулы
    const exportToothBtn = document.getElementById("aiToothExportBtn");
    if (exportToothBtn) {
      exportToothBtn.addEventListener("click", () => {
        const result = {};
        toothFormula.querySelectorAll(".ai-tooth").forEach((t) => {
          const n = t.getAttribute("data-tooth");
          const s = t.getAttribute("data-status") || "normal";
          if (n) result[n] = { status: s };
        });
        const json = JSON.stringify(result, null, 2);
        const a = document.createElement("a");
        a.href =
          "data:application/json;charset=utf-8," + encodeURIComponent(json);
        a.download = "tooth_formula.json";
        a.click();

        const toast = document.createElement("div");
        toast.style.cssText = `
      position: fixed; bottom: 20px; right: 20px;
      background: var(--surface); border: 1px solid var(--border);
      box-shadow: var(--shadow-lg); padding: 12px 16px;
      border-radius: var(--radius); z-index: 9999;
      display: flex; align-items: center; gap: 10px; font-size: 13px;
    `;
        toast.innerHTML = `
      <span style="font-size:18px;">📤</span>
      <div>
        <div style="font-weight:600;">JSON экспортирован</div>
        <div style="color:var(--muted);font-size:12px;">tooth_formula.json скачан</div>
      </div>
    `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
      });
    }

    // Инициализация счётчиков при загрузке
    updateToothStats();
  }

  // Tabs: client-side switching
  const tabsContainer = document.querySelector(".ai-core-tabs");
  const tabpanels = document.querySelectorAll(".ai-core-tabpanel");
  const headerActions = document.querySelector(
    ".ai-core-header-actions--protocol-only",
  );
  if (tabsContainer && tabpanels.length) {
    tabsContainer.addEventListener("click", (e) => {
      const btn = e.target.closest?.(".ai-core-tab");
      if (!btn) return;
      const tab = btn.getAttribute("data-ai-tab");
      if (!tab) return;

      tabsContainer
        .querySelectorAll(".ai-core-tab")
        .forEach((el) => el.classList.toggle("ai-core-tab-active", el === btn));
      tabpanels.forEach((panel) => {
        const name = panel.getAttribute("data-ai-tabpanel");
        panel.classList.toggle("ai-core-tabpanel-active", name === tab);
      });

      if (headerActions) {
        headerActions.style.display = tab === "protocol" ? "flex" : "none";
      }
    });

    // Initial state: protocol tab active → actions visible
    if (headerActions) {
      headerActions.style.display = "flex";
    }
  }

  // Caries chip — обработчик клика
  const cariesChipsWrap = document.getElementById("aiCariesType");
  if (cariesChipsWrap) {
    cariesChipsWrap.addEventListener("click", (e) => {
      const chip = e.target.closest(".ai-caries-chip");
      if (!chip) return;

      const type = chip.getAttribute("data-caries-type");
      if (!type) return;

      cariesChipsWrap
        .querySelectorAll(".ai-caries-chip")
        .forEach((c) => c.classList.remove("ai-caries-chip-active"));

      chip.classList.add("ai-caries-chip-active");
      cariesChipsWrap.setAttribute("data-value", type);

      updateCariesHint(type);
    });
  }

  // History tab: load visits for patient
  if (patientId) {
    const historyBox = document.getElementById("aiHistoryList");
    if (historyBox) {
      historyBox.innerHTML =
        '<div class="ai-history-empty">Загрузка истории...</div>';
      try {
        const visits = await getVisitsByPatient(patientId);
        if (!visits.length) {
          historyBox.innerHTML =
            '<div class="ai-history-empty">Пока нет завершённых визитов</div>';
        } else {
          historyBox.innerHTML = visits
            .map((v) => {
              const date = v.startedAt ? String(v.startedAt).slice(0, 10) : "";
              const time = v.startedAt ? String(v.startedAt).slice(11, 16) : "";
              const diag = v.diagnosis || "Без диагноза";
              const code = v.diagnosisCode ? ` • ${v.diagnosisCode}` : "";
              const tooth = v.toothNumber ? ` • зуб ${v.toothNumber}` : "";
              return `
                <div class="ai-history-item">
                  <div class="ai-history-top">
                    <span class="ai-history-diagnosis">${diag}</span>
                    <span class="ai-history-meta">${date} ${time}</span>
                  </div>
                  <div class="ai-history-meta">Тип кариеса: ${v.cariesType || "—"}${code}${tooth}</div>
                </div>
              `;
            })
            .join("");
        }
      } catch (err) {
        console.error(err);
        historyBox.innerHTML =
          '<div class="ai-history-empty">Не удалось загрузить историю</div>';
      }
    }
  }

  // МКБ-10 дерево: выбор кода → в диагноз и селект
  const icdTree = document.getElementById("aiIcdTree");
  const icdSearch = document.getElementById("aiIcdSearch");
  if (icdTree) {
    icdTree.addEventListener("click", (e) => {
      const groupToggle = e.target.closest?.("[data-role='toggle-group']");
      if (groupToggle) {
        const group = groupToggle.closest(".ai-icd-group");
        if (!group) return;
        const open = group.classList.toggle("ai-icd-group--open");
        const arrow = group.querySelector(".ai-icd-group-arrow");
        if (arrow) arrow.textContent = open ? "▼" : "▶";
        return;
      }

      const item = e.target.closest?.(".ai-icd-item");
      if (!item) return;
      const code = item.getAttribute("data-code") || "";
      const label = item.getAttribute("data-label") || item.textContent || "";

      icdTree
        .querySelectorAll(".ai-icd-item")
        .forEach((el) => el.classList.remove("ai-icd-item--active"));
      item.classList.add("ai-icd-item--active");

      const codeSelect = document.getElementById("aiDiagnosisCode");
      if (codeSelect && "value" in codeSelect) {
        codeSelect.value = code;
      }
      const diagnosisInput = document.getElementById("aiDiagnosisText");
      if (diagnosisInput && "value" in diagnosisInput) {
        const current = String(diagnosisInput.value || "");
        const withoutCode = current
          .replace(/^K\d{2}\.\d\s+.+?-+\s*/u, "")
          .trim();
        diagnosisInput.value = label || withoutCode;
      }
    });
  }

  if (icdSearch && icdTree) {
    icdSearch.addEventListener("input", () => {
      const q = icdSearch.value.toLowerCase().trim();
      icdTree.querySelectorAll(".ai-icd-group").forEach((group) => {
        let groupMatches = false;
        const title = group
          .querySelector(".ai-icd-group-title")
          ?.textContent?.toLowerCase();
        if (title && title.includes(q)) {
          groupMatches = true;
        }

        group.querySelectorAll(".ai-icd-item").forEach((item) => {
          const text = item.textContent?.toLowerCase() || "";
          const match = !q || text.includes(q);
          item.style.display = match ? "" : "none";
          if (match) groupMatches = true;
        });

        group.style.display = groupMatches ? "" : "none";
        if (groupMatches) {
          group.classList.add("ai-icd-group--open");
          const arrow = group.querySelector(".ai-icd-group-arrow");
          if (arrow) arrow.textContent = "▼";
        }
      });
    });
  }

  // Поиск пациенттерді фильтрлеу (card markup from view)
  const searchInput = page.querySelector("#aiPatientSearch");
  const listContainer = page.querySelector("#aiPatientList");
  if (searchInput && listContainer) {
    searchInput.addEventListener("input", (e) => {
      const q = String(e.target.value || "")
        .trim()
        .toLowerCase();
      const filtered = allPatients.filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          String(p.phone || "").includes(q),
      );
      listContainer.innerHTML = filtered.length
        ? filtered.map((p) => renderAiPatientRow(p)).join("")
        : '<div class="ai-patient-list-empty">Пациенты не найдены</div>';
    });

    // Event delegation for selecting patient (no inline onclick)
    listContainer.addEventListener("click", (e) => {
      const card = e.target.closest?.(".ai-patient-card");
      if (!card) return;
      const id = card.getAttribute("data-patient-id");
      if (!id) return;
      window.location.hash = `#ai?patient=${id}`;
    });
  }

  // PDF & eGov Sign logic
  const generatePdfBtn = document.getElementById("generatePdfBtn");
  const egovSignBtn = document.getElementById("egovSignBtn");
  const finishVisitBtn = document.getElementById("finishVisitBtn");
  const imagesUploadArea = document.getElementById("aiImagesUploadArea");
  const imagesFileInput = document.getElementById("aiImagesFileInput");
  const imagesOpgImg = document.querySelector(".ai-images-opg");
  const imagesThumbs = document.getElementById("aiImagesThumbs");
  const imagesPreview = document.querySelector(".ai-images-main-preview");

  // Images tab: gallery (preview + thumbnails)
  if (
    imagesUploadArea &&
    imagesFileInput &&
    imagesOpgImg &&
    imagesThumbs &&
    imagesPreview
  ) {
    const imageEntries = []; // { id, url }
    const objectUrls = [];
    let thumbIdCounter = 0;

    function addImage(url) {
      imageEntries.push({
        id: `img_${Date.now()}_${thumbIdCounter++}`,
        url,
      });
      renderThumbs();
      setActiveImage(url);
    }

    function setActiveImage(url) {
      imagesOpgImg.src = url;
      imagesOpgImg.style.display = "block";
      imagesPreview.classList.remove("ai-images-main-preview--empty");
      Array.from(
        imagesThumbs.querySelectorAll(".ai-images-thumb-item"),
      ).forEach((el) => {
        const thumbUrl = el.getAttribute("data-url") || "";
        el.classList.toggle("ai-images-thumb-item--active", thumbUrl === url);
      });
    }

    function renderThumbs() {
      imagesThumbs.innerHTML = imageEntries
        .map(
          (entry, index) => `
        <div class="ai-images-thumb-wrap" data-id="${entry.id}">
          <img src="${entry.url}" data-url="${entry.url}" class="ai-images-thumb-item${
            index === imageEntries.length - 1
              ? " ai-images-thumb-item--active"
              : ""
          }" />
          <button type="button" class="ai-images-thumb-delete" data-role="delete-thumb">×</button>
        </div>
      `,
        )
        .join("");
    }

    // Инициализируем дефолтным изображением
    const defaultUrl = imagesOpgImg.getAttribute("src") || "";
    if (defaultUrl) {
      addImage(defaultUrl);
    }

    imagesUploadArea.addEventListener("click", () => {
      imagesFileInput.click();
    });

    imagesFileInput.addEventListener("change", () => {
      const file = imagesFileInput.files && imagesFileInput.files[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        console.warn("Выбран не графический файл");
        return;
      }
      const url = URL.createObjectURL(file);
      objectUrls.push(url);
      addImage(url);
    });

    imagesThumbs.addEventListener("click", (e) => {
      const deleteBtn = e.target.closest("[data-role='delete-thumb']");
      if (deleteBtn) {
        const wrap = deleteBtn.closest(".ai-images-thumb-wrap");
        if (!wrap) return;
        const id = wrap.getAttribute("data-id");
        if (!id) return;

        const idx = imageEntries.findIndex((it) => it.id === id);
        if (idx === -1) return;
        const removed = imageEntries.splice(idx, 1)[0];

        // если удалили активное изображение
        const removedUrl = removed?.url;
        if (!imageEntries.length) {
          imagesOpgImg.removeAttribute("src");
          imagesOpgImg.style.display = "none";
          imagesPreview.classList.add("ai-images-main-preview--empty");
        } else if (removedUrl === imagesOpgImg.src) {
          const next = imageEntries[Math.max(0, imageEntries.length - 1)];
          if (next?.url) {
            setActiveImage(next.url);
          }
        }

        renderThumbs();
        return;
      }

      const img = e.target.closest(".ai-images-thumb-item");
      if (!img) return;
      const url = img.getAttribute("data-url");
      if (!url) return;
      setActiveImage(url);
    });

    window.addEventListener("beforeunload", () => {
      objectUrls.forEach((u) => URL.revokeObjectURL(u));
    });
  }

  function openPdfExportFlow() {
    const data = readCurrentAiVisitData();
    openModal({
      title: "Экспорт в PDF",
      content: `
        <div style="text-align: left; padding: 20px;">
          <h3 style="margin-bottom: 12px; font-weight: 600;">Проверка протокола перед экспортом</h3>
          <p style="color: var(--muted); font-size: 13px; margin-bottom: 8px;"><b>Диагноз:</b> ${data.diagnosis || "—"}</p>
          <p style="color: var(--muted); font-size: 13px; margin-bottom: 8px;"><b>МКБ-10:</b> ${data.diagnosisCode || "—"} • <b>Тип кариеса:</b> ${data.cariesType || "—"}</p>
          <p style="color: var(--muted); font-size: 13px; margin-bottom: 16px;"><b>Зуб:</b> ${data.toothNumber || "—"}</p>
          <div style="text-align: center; margin-top: 12px;">
            <div class="spinner" style="margin: 0 auto 16px auto; width: 24px; height: 24px; border-color: var(--primary); border-right-color: transparent;"></div>
            <div style="font-size: 13px; color: var(--muted);">Формируем амбулаторную карту (Форма №043/у)...</div>
          </div>
        </div>
      `,
    });

    setTimeout(() => {
      const modalBody = document.querySelector(".modal-body");
      if (modalBody) {
        modalBody.innerHTML = `
          <div style="text-align: center; padding: 20px;">
            <div style="font-size: 40px; margin-bottom: 16px; color: var(--success);">✅</div>
            <h3 style="margin-bottom: 12px; font-weight: 600;">PDF успешно сформирован</h3>
            <p style="color: var(--muted); font-size: 13px; margin-bottom: 24px;">Документ автоматически сохранен в карту пациента и скачан на ваше устройство.</p>
            <button class="btn btn-secondary modal-close-btn" style="width: 100%;">Закрыть</button>
          </div>
        `;
        const closeBtn = modalBody.querySelector(".modal-close-btn");
        if (closeBtn) {
          closeBtn.addEventListener("click", () => {
            document.querySelector(".modal-close")?.click();
          });
        }
      }
    }, 1800);
  }

  function openEgovSignFlow() {
    const data = readCurrentAiVisitData();
    openModal({
      title: "Подписание через eGov (ЭЦП)",
      content: `
        <div style="padding: 10px;">
          <p style="color: var(--muted); font-size: 13px; margin-bottom: 8px;">
            Документ для подписи сформирован на основе AI-протокола:
          </p>
          <p style="color: var(--muted); font-size: 13px; margin-bottom: 12px;">
            <b>МКБ-10:</b> ${data.diagnosisCode || "—"} • <b>Тип кариеса:</b> ${data.cariesType || "—"} • <b>Зуб:</b> ${data.toothNumber || "—"}
          </p>
          <div style="border: 1px dashed var(--border-strong); border-radius: var(--radius); padding: 30px; text-align: center; cursor: pointer; background: var(--surface-2); margin-bottom: 20px;" id="selectEcpArea">
             <div style="font-size: 24px; margin-bottom: 8px;">🔑</div>
             <div style="font-weight: 600; font-size: 14px; color: var(--primary);">Выбрать файл ЭЦП</div>
             <div style="font-size: 11px; color: var(--muted); margin-top: 4px;">.p12 или .cer</div>
          </div>
          <div id="ecpPasswordArea" style="display: none;">
            <label style="font-size: 12px; font-weight: 600; display: block; margin-bottom: 8px;">Пароль от хранилища ключей:</label>
            <input type="password" class="input" placeholder="Введите пароль..." style="width: 100%; margin-bottom: 16px;" value="123456" />
            <button class="btn" id="signDocumentBtn" style="width: 100%; background: var(--primary); color: white;">Подписать документ</button>
          </div>
        </div>
      `,
    });

    const selectEcpArea = document.getElementById("selectEcpArea");
    const ecpPasswordArea = document.getElementById("ecpPasswordArea");

    if (selectEcpArea && ecpPasswordArea) {
      selectEcpArea.addEventListener("click", () => {
        selectEcpArea.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
            <span style="color: var(--success);">✔️</span>
            <span style="font-weight: 600; font-size: 13px;">GOSTKNCA_xxxxxxxx.p12 выбран</span>
          </div>
        `;
        selectEcpArea.style.borderColor = "var(--success)";
        selectEcpArea.style.background = "rgba(16, 185, 129, 0.05)";
        ecpPasswordArea.style.display = "block";
      });
    }

    document
      .getElementById("signDocumentBtn")
      ?.addEventListener("click", () => {
        const signBtn = document.getElementById("signDocumentBtn");
        if (!signBtn) return;
        signBtn.innerHTML =
          '<div class="spinner" style="width: 14px; height: 14px; border-color: white; border-right-color: transparent;"></div> Подписание...';
        signBtn.style.opacity = "0.7";

        setTimeout(() => {
          const modalBody = document.querySelector(".modal-body");
          if (modalBody) {
            modalBody.innerHTML = `
            <div style="text-align: center; padding: 20px;">
              <div style="font-size: 40px; margin-bottom: 16px; color: var(--success);">📜✅</div>
              <h3 style="margin-bottom: 12px; font-weight: 600;">Документ подписан (eGov)</h3>
              <p style="color: var(--muted); font-size: 13px; margin-bottom: 24px;">Юридическая сила документа подтверждена.</p>
              <button class="btn btn-secondary modal-close-btn" style="width: 100%;">Готово</button>
            </div>
          `;
            const closeBtn = modalBody.querySelector(".modal-close-btn");
            if (closeBtn) {
              closeBtn.addEventListener("click", () => {
                document.querySelector(".modal-close")?.click();
                const mainEgovBtn = document.getElementById("egovSignBtn");
                if (mainEgovBtn) {
                  mainEgovBtn.innerHTML = "✅ Подписано ЭЦП";
                  mainEgovBtn.style.background = "rgba(16, 185, 129, 0.1)";
                  mainEgovBtn.style.borderColor = "var(--success)";
                  mainEgovBtn.style.color = "var(--success)";
                  mainEgovBtn.style.pointerEvents = "none";
                }
              });
            }
          }
        }, 1500);
      });
  }

  if (generatePdfBtn) {
    generatePdfBtn.addEventListener("click", openPdfExportFlow);
  }

  if (egovSignBtn) {
    egovSignBtn.addEventListener("click", openEgovSignFlow);
  }

  if (finishVisitBtn) {
    finishVisitBtn.addEventListener("click", async () => {
      if (!activeAppointment?.id) {
        console.warn("Нет активной записи для завершения визита");
        alert(
          "Запись не найдена или уже завершена. Откройте визит из расписания.",
        );
        return;
      }

      const data = readCurrentAiVisitData();
      finishVisitBtn.innerHTML =
        '<div class="spinner" style="width: 14px; height: 14px; border-color: white; border-right-color: transparent;"></div> Сохранение...';
      finishVisitBtn.style.opacity = "0.9";

      try {
        await finishVisit(activeAppointment.id, data);
        finishVisitBtn.innerHTML = "✅ Прием завершен и материалы списаны";
        finishVisitBtn.style.background = "var(--success)";
        finishVisitBtn.style.opacity = "0.8";
        finishVisitBtn.style.pointerEvents = "none";

        const toast = document.createElement("div");
        toast.style.position = "fixed";
        toast.style.bottom = "20px";
        toast.style.right = "20px";
        toast.style.background = "var(--surface)";
        toast.style.border = "1px solid var(--border)";
        toast.style.boxShadow = "var(--shadow-lg)";
        toast.style.padding = "16px";
        toast.style.borderRadius = "var(--radius)";
        toast.style.zIndex = "9999";
        toast.style.display = "flex";
        toast.style.alignItems = "center";
        toast.style.gap = "12px";
        toast.innerHTML = `
          <div style="font-size: 24px;">📦</div>
          <div>
            <div style="font-weight: 600; font-size: 14px;">Автосписание со склада (AI)</div>
            <div style="font-size: 12px; color: var(--muted);">Ultracain (1), Filtek Z250 (1)</div>
          </div>
        `;
        document.body.appendChild(toast);
        setTimeout(() => {
          toast.remove();
        }, 4000);
      } catch (err) {
        console.error(err);
        finishVisitBtn.innerHTML = "Ошибка сохранения";
        finishVisitBtn.style.background = "var(--danger)";
        finishVisitBtn.style.opacity = "0.9";
      }
    });
  }
}
