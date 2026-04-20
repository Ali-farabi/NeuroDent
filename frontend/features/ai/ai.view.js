function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const AI_TOOTH_NUMBERS_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const AI_TOOTH_NUMBERS_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

function getToothImageByStatus(status) {
  if (status === "caries") return "RedCaries.png";
  if (status === "filling") return "Yellowplomb.png";
  if (status === "healthy") return "Greentooth.png";
  return "Whitetooth.png";
}

function getInitialSelectedTooth(toothData = {}) {
  const all = [...AI_TOOTH_NUMBERS_UPPER, ...AI_TOOTH_NUMBERS_LOWER];
  for (const n of all) {
    if (toothData[n] === "caries") return n;
  }
  return all[0] ?? null;
}

/** One patient row for the select list (used in view and controller) */
export function renderAiPatientRow(p) {
  return `
    <div class="ai-patient-card" data-patient-id="${escapeHtml(p.id)}" data-ai-role="select-patient">
      <div class="ai-patient-card-main">
        <div class="ai-patient-card-name">${escapeHtml(p.name)}</div>
        <div class="ai-patient-card-meta">Зарегистрирован: ${escapeHtml(p.createdAt || "—")} • ${escapeHtml(p.phone)}</div>
      </div>
      <button type="button" class="ai-patient-card-btn" data-ai-role="select-patient-button">Выбрать</button>
    </div>
  `;
}

export function renderAiPage({ patientId, patientData, allPatients = [], toothData = {} } = {}) {
  // Нағыз жүйеге ұқсату үшін, егер patientId берілмесе (дәрігер тікелей мәзірден кірсе),
  // біз оған "Пациентті таңдаңыз" деген бетті көрсетеміз.
  if (!patientId) {
    const patientsListHtml = allPatients.length
      ? allPatients.map(p => renderAiPatientRow(p)).join('')
      : '<div class="ai-patient-list-empty">Пациенты не найдены</div>';

    return `
      <div class="ai-select-page">
        <header class="ai-select-page-header">
          <h1 class="ai-select-page-title">AI Clinical Assistant</h1>
          <p class="ai-select-page-subtitle">Автопротоколирование, МКБ-10 и анализ истории</p>
        </header>
        <!-- Hero: strong hierarchy, left-aligned -->
        <div class="ai-select-hero">
          <div class="ai-select-hero-icon" aria-hidden="true"></div>
          <div class="ai-select-hero-text">
            <h1 class="ai-select-hero-title">Выберите пациента для приема</h1>
            <p class="ai-select-hero-desc">Чтобы AI-ассистент начал слушать и писать протокол, выберите пациента из базы.</p>
          </div>
        </div>

        <!-- Search: full width, large, modern -->
        <div class="ai-select-search-wrap">
          <svg class="ai-select-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="aiPatientSearch" class="ai-select-search-input" placeholder="Поиск по имени или телефону..." autocomplete="off" />
        </div>

        <!-- Patient list: card-style rows -->
        <div class="ai-select-list-section">
          <h2 class="ai-select-list-title">Найденные пациенты</h2>
          <div id="aiPatientList" class="ai-patient-list">
            ${patientsListHtml}
          </div>
        </div>
      </div>
    `;
  }

  // Егер пациент таңдалған болса
  const patientName = patientData ? patientData.name : "Неизвестный пациент";
  const patientPhone = patientData ? patientData.phone : "Нет телефона";
  const selectedTooth = getInitialSelectedTooth(toothData);
  
  return `
    <div class="ai-core-page">
      <div class="ai-core-header">
        <div class="ai-core-header-main">
          <h1 class="ai-core-title">
            <img src="/assets/images/Medimetricslogotype.png" alt="Neurodent" class="ai-core-logo">
            <span>AI Clinical Assistant</span>
          </h1>
          <p class="ai-core-subtitle">Автопротоколирование, МКБ-10, тип кариеса и зубная формула</p>
        </div>
        <div class="ai-core-header-actions ai-core-header-actions--protocol-only">
          <button class="btn btn-secondary ai-core-change-patient" onclick="window.location.hash='#ai'">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
            Сменить пациента
          </button>
          <button class="btn ai-core-record-btn" id="startRecordingBtn">
            <span class="ai-core-record-dot"></span>
            Слушать прием (Запись голоса)
          </button>
        </div>
      </div>

      <div class="ai-core-tabs" aria-label="AI tabs">
        <button class="ai-core-tab ai-core-tab-active" data-ai-tab="protocol">AI Протокол</button>
        <button class="ai-core-tab" data-ai-tab="images">Изображения</button>
        <button class="ai-core-tab" data-ai-tab="materials">Материалы</button>
        <button class="ai-core-tab" data-ai-tab="services">Оказанные услуги</button>
        <button class="ai-core-tab" data-ai-tab="history">История болезни</button>
        <button class="ai-core-tab" data-ai-tab="plans">Планы лечения</button>
        <button class="ai-core-tab ai-core-tab-plus" data-ai-tab="add">+</button>
      </div>

      <div class="ai-core-tabpanels">
        <!-- MAIN AI PROTOCOL TAB -->
        <div class="ai-core-tabpanel ai-core-tabpanel-active" data-ai-tabpanel="protocol">
          <div class="report-container ai-core-main" style="padding: 20px; max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 16px;">
              <div>
                <div style="font-size: 16px; font-weight: 700; margin-bottom: 2px;">${patientName}</div>
                <div style="font-size: 12px; color: var(--muted);">Взрослый • ${patientPhone}</div>
              </div>
              <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                <span class="badge" style="background: var(--primary-100); color: var(--primary-700);">Риск: Низкий</span>
                <span class="badge" style="background: rgba(245, 158, 11, 0.1); color: #d97706; border-color: rgba(245, 158, 11, 0.2);">⚠️ Жалоба: боль в 1.6</span>
                <span class="badge" style="background: rgba(14, 165, 233, 0.1); color: #0ea5e9; border-color: rgba(14, 165, 233, 0.2);">ℹ️ МКБ-10: K02.1</span>
              </div>
            </div>

            <div class="ai-protocol-vertical" style="display: flex; flex-direction: column; gap: 20px; width: 100%;">
              <!-- 1. AI-Summary (100% width) -->
              <div class="ai-protocol-block" style="width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; box-shadow: var(--shadow-sm);">
                <div style="font-size: 11px; font-weight: 700; color: var(--primary); text-transform: uppercase; margin-bottom: 8px;">✨ AI-Summary пациента</div>
                <div style="font-size: 13px; color: var(--text); line-height: 1.5;">
                  Аллергий нет. Последний визит 6 месяцев назад (чистка). В прошлом лечился пульпит зуба 46. Возможна чувствительность эмали.
                </div>
              </div>

              <!-- 2. Зубная формула (100% width, с иконками и фильтрами) -->
              <div class="ai-protocol-block" style="width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; box-shadow: var(--shadow-sm);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 12px; flex-wrap: wrap;">
                  <div style="font-weight: 700; font-size: 14px;">Зубная формула</div>
                  <div class="ai-tooth-filters">
                    <button type="button" class="ai-tooth-filter ai-tooth-filter-active" data-filter="all">Полость рта</button>
                    <button type="button" class="ai-tooth-filter" data-filter="upper">Верхняя челюсть</button>
                    <button type="button" class="ai-tooth-filter" data-filter="lower">Нижняя челюсть</button>
                  </div>
                </div>

                <div class="ai-bite-toggle">
                  <span class="ai-bite-label">Прикус:</span>
                  <button type="button" class="ai-bite-btn ai-bite-btn--active" data-bite="permanent">
                    Постоянный
                  </button>
                  <button type="button" class="ai-bite-btn" data-bite="milk">
                    Молочный
                  </button>
                </div>

                <div id="aiToothFormula" data-selected-tooth="${selectedTooth || ""}" class="ai-tooth-formula">
                  <div class="ai-tooth-row-label" data-jaw-label="upper">Верхняя челюсть</div>
                  <div class="ai-tooth-row">
                    ${AI_TOOTH_NUMBERS_UPPER.map((n) => {
                      const status = toothData[n] || "normal";
                      const isSelected = n === selectedTooth;
                      const imgFile = getToothImageByStatus(status);
                      return `
                      <button type="button"
                        class="ai-tooth ai-tooth--${status}${isSelected ? " ai-tooth-selected" : ""}"
                        data-tooth="${n}"
                        data-jaw="upper"
                        data-status="${status}"
                      >
                        <img src="/assets/images/teeth/${imgFile}" alt="Зуб ${n}" class="ai-tooth-icon" />
                        <span class="ai-tooth-number">${n}</span>
                      </button>
                    `;
                    }).join("")}
                  </div>

                  <div class="ai-tooth-row-label" data-jaw-label="lower">Нижняя челюсть</div>
                  <div class="ai-tooth-row">
                    ${AI_TOOTH_NUMBERS_LOWER.map((n) => {
                      const status = toothData[n] || "normal";
                      const isSelected = n === selectedTooth;
                      const imgFile = getToothImageByStatus(status);
                      return `
                      <button type="button"
                        class="ai-tooth ai-tooth--${status}${isSelected ? " ai-tooth-selected" : ""}"
                        data-tooth="${n}"
                        data-jaw="lower"
                        data-status="${status}"
                      >
                        <img src="/assets/images/teeth/${imgFile}" alt="Зуб ${n}" class="ai-tooth-icon" />
                        <span class="ai-tooth-number">${n}</span>
                      </button>
                    `;
                    }).join("")}
                  </div>
                </div>

                <div id="aiToothSurfacePopup" class="ai-tooth-surface-popup" style="display:none;">
                  <div class="ai-tooth-surface-title">Укажите поверхность</div>
                  <div class="ai-tooth-surface-grid">
                    <button type="button" class="ai-surface-btn" data-surface="M">М — Медиальная</button>
                    <button type="button" class="ai-surface-btn" data-surface="D">Д — Дистальная</button>
                    <button type="button" class="ai-surface-btn" data-surface="O">О — Жевательная</button>
                    <button type="button" class="ai-surface-btn" data-surface="V">В — Вестибулярная</button>
                    <button type="button" class="ai-surface-btn" data-surface="L">Я — Язычная</button>
                  </div>
                  <button type="button" class="ai-surface-close-btn">✓ Готово</button>
                </div>

                <div class="ai-tooth-legend">
                  <div class="ai-tooth-legend-item">
                    <span class="ai-tooth-legend-dot ai-tooth-legend-dot--caries"></span> Кариес
                    <span class="ai-tooth-stat" id="toothStatCaries">0</span>
                  </div>
                  <div class="ai-tooth-legend-item">
                    <span class="ai-tooth-legend-dot ai-tooth-legend-dot--filling"></span> Пломба
                    <span class="ai-tooth-stat" id="toothStatFilling">0</span>
                  </div>
                  <div class="ai-tooth-legend-item">
                    <span class="ai-tooth-legend-dot ai-tooth-legend-dot--healthy"></span> Здоров
                    <span class="ai-tooth-stat" id="toothStatHealthy">0</span>
                  </div>
                  <div class="ai-tooth-legend-item">
                    <span class="ai-tooth-legend-dot ai-tooth-legend-dot--normal"></span> Норма
                    <span class="ai-tooth-stat" id="toothStatNormal">32</span>
                  </div>
                  <div class="ai-tooth-legend-item">
                    <span class="ai-tooth-legend-dot ai-tooth-legend-dot--removed"></span> Удалён
                    <span class="ai-tooth-stat" id="toothStatRemoved">0</span>
                  </div>
                  <div class="ai-tooth-legend-item">
                    <span class="ai-tooth-legend-dot ai-tooth-legend-dot--missing"></span> Отсутствует
                    <span class="ai-tooth-stat" id="toothStatMissing">0</span>
                  </div>
                  <div class="ai-tooth-legend-item" style="margin-left:auto;gap:8px;">
                    <button type="button" class="ai-tooth-export-btn" id="aiToothExportBtn">
                      📤 JSON
                    </button>
                    <span id="aiBiteIndicator" style="font-size:11px;color:var(--muted);">
                      Постоянный прикус
                    </span>
                  </div>
                </div>
              </div>

              <!-- 3. AI-Автопротокол + форма слева и МКБ-10 дерево справа -->
              <div class="ai-protocol-block" style="width: 100%; background: var(--surface); border: 2px solid var(--primary-100); border-radius: var(--radius); padding: 20px; box-shadow: 0 8px 30px rgba(37, 99, 235, 0.08);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div class="spinner" id="aiSpinner" style="width: 14px; height: 14px; border-width: 2px;"></div>
                    <span style="font-weight: 700; color: var(--primary); font-size: 15px;">AI-Автопротокол</span>
                  </div>
                  <span id="aiStatus" style="font-size: 11px; color: var(--muted); background: var(--surface-2); padding: 4px 8px; border-radius: 4px;">Слушаю...</span>
                </div>

                <div class="ai-protocol-layout">
                  <!-- Левая колонка: форма как на скрине -->
                  <div class="ai-protocol-form">
                    <div class="ai-form-field">
                      <label for="aiDiagnosisText">Диагноз</label>
                      <input id="aiDiagnosisText" class="input" type="text" value="Кариес дентина (16)" />
                    </div>
                    <div class="ai-form-field">
                      <label for="aiComplaints">Жалобы</label>
                      <textarea id="aiComplaints" class="input" rows="2">Боль в верхней челюсти справа при приеме холодной пищи. Ноет со вчерашнего дня.</textarea>
                    </div>
                    <div class="ai-form-field">
                      <label for="aiAnamnesis">Анамнез</label>
                      <textarea id="aiAnamnesis" class="input" rows="2">Зуб ранее не лечен.</textarea>
                    </div>
                    <div class="ai-form-field">
                      <label for="aiObjective">Объективно</label>
                      <textarea id="aiObjective" class="input" rows="3">Глубокая кариозная полость в зубе 1.6, размягченный дентин, зондирование болезненно.</textarea>
                    </div>
                    <div class="ai-form-field">
                      <label for="aiTreatment">Лечение</label>
                      <textarea id="aiTreatment" class="input" rows="3">Анестезия инфильтрационная, препарирование полости, медикаментозная обработка, постановка световой пломбы.</textarea>
                    </div>

                    <div class="ai-form-inline">
                      <div class="ai-form-field">
                        <label for="aiDiagnosisCode">МКБ-10</label>
                        <select id="aiDiagnosisCode" class="input" style="height: 32px; font-size: 12px; padding: 4px 10px;">
                          <option value="">Не выбрано</option>
                          <option value="K02.0">K02.0 — Кариес эмали</option>
                          <option value="K02.1" selected>K02.1 — Кариес дентина</option>
                          <option value="K02.2">K02.2 — Кариес цемента</option>
                          <option value="K04.0">K04.0 — Острый пульпит</option>
                        </select>
                      </div>
                      <div class="ai-form-field">
                        <label>Тип кариеса</label>
                        <div id="aiCariesType" class="ai-caries-chips" data-value="deep">
                          <button type="button" class="ai-caries-chip" data-caries-type="surface">Поверхностный</button>
                          <button type="button" class="ai-caries-chip" data-caries-type="medium">Средний</button>
                          <button type="button" class="ai-caries-chip ai-caries-chip-active" data-caries-type="deep">Глубокий</button>
                          <button type="button" class="ai-caries-chip" data-caries-type="complicated">Осложнённый</button>
                        </div>
                      </div>
                    </div>

                    <div class="ai-form-actions">
                      <button class="btn" id="finishVisitBtn" style="width: 100%; background: var(--success); color: white; justify-content: center;">
                        Завершить прием и списать материалы
                      </button>
                      <div class="ai-form-actions-row">
                        <button class="btn btn-secondary" id="generatePdfBtn">
                          📄 Экспорт PDF
                        </button>
                        <button class="btn btn-secondary" id="egovSignBtn">
                          <span id="egovIcon">🔑</span> <span id="egovText">Подпись eGov</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- Правая колонка: МКБ-10 дерево -->
                  <div class="ai-icd">
                    <div class="ai-icd-search">
                      <svg class="ai-icd-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <input type="text" id="aiIcdSearch" class="ai-icd-search-input" placeholder="Поиск по МКБ-10..." autocomplete="off" />
                    </div>
                    <div id="aiIcdTree" class="ai-icd-tree">
                      <div class="ai-icd-group" data-code="K00">
                        <button type="button" class="ai-icd-group-header" data-role="toggle-group">
                          <span class="ai-icd-group-arrow">▶</span>
                          <span class="ai-icd-group-title">K00 Нарушения развития и прорезывания зубов</span>
                        </button>
                        <div class="ai-icd-children">
                          <button type="button" class="ai-icd-item" data-code="K00.0" data-label="K00.0 Нарушения прорезывания зубов">K00.0 Нарушения прорезывания зубов</button>
                        </div>
                      </div>

                      <div class="ai-icd-group" data-code="K01">
                        <button type="button" class="ai-icd-group-header" data-role="toggle-group">
                          <span class="ai-icd-group-arrow">▶</span>
                          <span class="ai-icd-group-title">K01 Ретинированные и импактные зубы</span>
                        </button>
                        <div class="ai-icd-children">
                          <button type="button" class="ai-icd-item" data-code="K01.0" data-label="K01.0 Ретинированные зубы">K01.0 Ретинированные зубы</button>
                        </div>
                      </div>

                      <div class="ai-icd-group ai-icd-group--open" data-code="K02">
                        <button type="button" class="ai-icd-group-header" data-role="toggle-group">
                          <span class="ai-icd-group-arrow">▼</span>
                          <span class="ai-icd-group-title">K02 Кариес зубов</span>
                        </button>
                        <div class="ai-icd-children">
                          <button type="button" class="ai-icd-item" data-code="K02.0" data-label="K02.0 Кариес эмали">K02.0 Кариес эмали</button>
                          <button type="button" class="ai-icd-item ai-icd-item--active" data-code="K02.1" data-label="K02.1 Кариес дентина">K02.1 Кариес дентина</button>
                          <button type="button" class="ai-icd-item" data-code="K02.2" data-label="K02.2 Кариес цемента">K02.2 Кариес цемента</button>
                          <button type="button" class="ai-icd-item" data-code="K02.3" data-label="K02.3 Приостановившийся кариес зубов">K02.3 Приостановившийся кариес зубов</button>
                        </div>
                      </div>

                      <!-- K03 — Другие болезни твёрдых тканей зубов -->
                      <div class="ai-icd-group" data-code="K03">
                        <button type="button" class="ai-icd-group-header" data-role="toggle-group">
                          <span class="ai-icd-group-arrow">▶</span>
                          <span class="ai-icd-group-title">K03 Другие болезни твёрдых тканей зубов</span>
                        </button>
                        <div class="ai-icd-children">
                          <button type="button" class="ai-icd-item" data-code="K03.0" data-label="K03.0 Повышенное стирание зубов">K03.0 Повышенное стирание зубов</button>
                          <button type="button" class="ai-icd-item" data-code="K03.1" data-label="K03.1 Сошлифовывание зубов">K03.1 Сошлифовывание зубов</button>
                          <button type="button" class="ai-icd-item" data-code="K03.2" data-label="K03.2 Эрозия зубов">K03.2 Эрозия зубов</button>
                          <button type="button" class="ai-icd-item" data-code="K03.3" data-label="K03.3 Патологическая резорбция зубов">K03.3 Патологическая резорбция зубов</button>
                          <button type="button" class="ai-icd-item" data-code="K03.4" data-label="K03.4 Гиперцементоз">K03.4 Гиперцементоз</button>
                          <button type="button" class="ai-icd-item" data-code="K03.5" data-label="K03.5 Анкилоз зубов">K03.5 Анкилоз зубов</button>
                          <button type="button" class="ai-icd-item" data-code="K03.6" data-label="K03.6 Отложения на зубах">K03.6 Отложения на зубах</button>
                          <button type="button" class="ai-icd-item" data-code="K03.7" data-label="K03.7 Изменение цвета зубов">K03.7 Изменение цвета зубов</button>
                        </div>
                      </div>

                      <!-- K04 — Болезни пульпы и периапикальных тканей -->
                      <div class="ai-icd-group" data-code="K04">
                        <button type="button" class="ai-icd-group-header" data-role="toggle-group">
                          <span class="ai-icd-group-arrow">▶</span>
                          <span class="ai-icd-group-title">K04 Болезни пульпы и периапикальных тканей</span>
                        </button>
                        <div class="ai-icd-children">
                          <button type="button" class="ai-icd-item" data-code="K04.0" data-label="K04.0 Пульпит">K04.0 Пульпит</button>
                          <button type="button" class="ai-icd-item" data-code="K04.1" data-label="K04.1 Некроз пульпы">K04.1 Некроз пульпы</button>
                          <button type="button" class="ai-icd-item" data-code="K04.2" data-label="K04.2 Дегенерация пульпы">K04.2 Дегенерация пульпы</button>
                          <button type="button" class="ai-icd-item" data-code="K04.3" data-label="K04.3 Патологическое образование твёрдых тканей в пульпе">K04.3 Патологическое образование твёрдых тканей в пульпе</button>
                          <button type="button" class="ai-icd-item" data-code="K04.4" data-label="K04.4 Острый апикальный периодонтит">K04.4 Острый апикальный периодонтит</button>
                          <button type="button" class="ai-icd-item" data-code="K04.5" data-label="K04.5 Хронический апикальный периодонтит">K04.5 Хронический апикальный периодонтит</button>
                          <button type="button" class="ai-icd-item" data-code="K04.6" data-label="K04.6 Периапикальный абсцесс со свищом">K04.6 Периапикальный абсцесс со свищом</button>
                          <button type="button" class="ai-icd-item" data-code="K04.7" data-label="K04.7 Периапикальный абсцесс без свища">K04.7 Периапикальный абсцесс без свища</button>
                          <button type="button" class="ai-icd-item" data-code="K04.8" data-label="K04.8 Корневая киста">K04.8 Корневая киста</button>
                        </div>
                      </div>

                      <!-- K05 — Гингивит и болезни пародонта -->
                      <div class="ai-icd-group" data-code="K05">
                        <button type="button" class="ai-icd-group-header" data-role="toggle-group">
                          <span class="ai-icd-group-arrow">▶</span>
                          <span class="ai-icd-group-title">K05 Гингивит и болезни пародонта</span>
                        </button>
                        <div class="ai-icd-children">
                          <button type="button" class="ai-icd-item" data-code="K05.0" data-label="K05.0 Острый гингивит">K05.0 Острый гингивит</button>
                          <button type="button" class="ai-icd-item" data-code="K05.1" data-label="K05.1 Хронический гингивит">K05.1 Хронический гингивит</button>
                          <button type="button" class="ai-icd-item" data-code="K05.2" data-label="K05.2 Острый пародонтит">K05.2 Острый пародонтит</button>
                          <button type="button" class="ai-icd-item" data-code="K05.3" data-label="K05.3 Хронический пародонтит">K05.3 Хронический пародонтит</button>
                          <button type="button" class="ai-icd-item" data-code="K05.4" data-label="K05.4 Пародонтоз">K05.4 Пародонтоз</button>
                          <button type="button" class="ai-icd-item" data-code="K05.5" data-label="K05.5 Другие болезни пародонта">K05.5 Другие болезни пародонта</button>
                        </div>
                      </div>

                      <!-- K06 — Другие изменения десны и беззубого альвеолярного края -->
                      <div class="ai-icd-group" data-code="K06">
                        <button type="button" class="ai-icd-group-header" data-role="toggle-group">
                          <span class="ai-icd-group-arrow">▶</span>
                          <span class="ai-icd-group-title">K06 Другие изменения десны и альвеолярного края</span>
                        </button>
                        <div class="ai-icd-children">
                          <button type="button" class="ai-icd-item" data-code="K06.0" data-label="K06.0 Рецессия десны">K06.0 Рецессия десны</button>
                          <button type="button" class="ai-icd-item" data-code="K06.1" data-label="K06.1 Гипертрофия десны">K06.1 Гипертрофия десны</button>
                          <button type="button" class="ai-icd-item" data-code="K06.2" data-label="K06.2 Поражения десны и беззубого края">K06.2 Поражения десны и беззубого края</button>
                        </div>
                      </div>

                      <!-- K07 — Челюстно-лицевые аномалии -->
                      <div class="ai-icd-group" data-code="K07">
                        <button type="button" class="ai-icd-group-header" data-role="toggle-group">
                          <span class="ai-icd-group-arrow">▶</span>
                          <span class="ai-icd-group-title">K07 Челюстно-лицевые аномалии</span>
                        </button>
                        <div class="ai-icd-children">
                          <button type="button" class="ai-icd-item" data-code="K07.0" data-label="K07.0 Аномалии размеров челюстей">K07.0 Аномалии размеров челюстей</button>
                          <button type="button" class="ai-icd-item" data-code="K07.1" data-label="K07.1 Аномалии соотношения челюстей">K07.1 Аномалии соотношения челюстей</button>
                          <button type="button" class="ai-icd-item" data-code="K07.2" data-label="K07.2 Аномалии прикуса">K07.2 Аномалии прикуса</button>
                          <button type="button" class="ai-icd-item" data-code="K07.3" data-label="K07.3 Аномалии положения зубов">K07.3 Аномалии положения зубов</button>
                          <button type="button" class="ai-icd-item" data-code="K07.4" data-label="K07.4 Аномалии прикуса неуточнённые">K07.4 Аномалии прикуса неуточнённые</button>
                          <button type="button" class="ai-icd-item" data-code="K07.5" data-label="K07.5 Болезни ВНЧС">K07.5 Болезни ВНЧС</button>
                        </div>
                      </div>

                      <!-- K08 — Другие изменения зубов и поддерживающих структур -->
                      <div class="ai-icd-group" data-code="K08">
                        <button type="button" class="ai-icd-group-header" data-role="toggle-group">
                          <span class="ai-icd-group-arrow">▶</span>
                          <span class="ai-icd-group-title">K08 Другие изменения зубов и поддерживающих структур</span>
                        </button>
                        <div class="ai-icd-children">
                          <button type="button" class="ai-icd-item" data-code="K08.0" data-label="K08.0 Потеря зубов вследствие несчастного случая">K08.0 Потеря зубов вследствие несчастного случая</button>
                          <button type="button" class="ai-icd-item" data-code="K08.1" data-label="K08.1 Потеря зубов вследствие болезни">K08.1 Потеря зубов вследствие болезни</button>
                          <button type="button" class="ai-icd-item" data-code="K08.2" data-label="K08.2 Атрофия беззубого альвеолярного края">K08.2 Атрофия беззубого альвеолярного края</button>
                          <button type="button" class="ai-icd-item" data-code="K08.3" data-label="K08.3 Задержка корня зуба">K08.3 Задержка корня зуба</button>
                          <button type="button" class="ai-icd-item" data-code="K08.8" data-label="K08.8 Другие уточнённые изменения зубов">K08.8 Другие уточнённые изменения зубов</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- OTHER TABS (mock content for now) -->
        <div class="ai-core-tabpanel" data-ai-tabpanel="images">
          <div class="ai-images-page">
            <input type="file" id="aiImagesFileInput" accept="image/*" style="display:none;" />
            <div class="ai-images-upload" id="aiImagesUploadArea">
              <svg class="ai-images-upload-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span class="ai-images-upload-text">Прикрепить фото</span>
            </div>
            <div class="ai-images-date">Август 2022</div>
            <div class="ai-images-main">
              <div class="ai-images-main-preview">
                <img src="/assets/images/examplecoreai.png" alt="ОПТГ пациента" class="ai-images-opg" />
              </div>
              <div class="ai-images-thumbs" id="aiImagesThumbs">
                <!-- Thumbnails will be rendered here -->
              </div>
            </div>
            <div class="ai-images-actions">
              <button type="button" class="btn btn-secondary ai-images-btn">Назад</button>
              <button type="button" class="btn btn-secondary ai-images-btn">Назначить повторный прием</button>
              <button type="button" class="btn btn-secondary ai-images-btn">Распечатать</button>
              <button type="button" class="btn ai-images-btn-danger">Удалить полностью карточку</button>
              <button type="button" class="btn ai-images-btn-save">Сохранить</button>
            </div>
          </div>
        </div>
        <div class="ai-core-tabpanel" data-ai-tabpanel="materials">
          <div class="ai-core-mock-panel">
            <h3>Материалы (AI)</h3>
            <p style="margin-bottom: 10px;">Пока статический список. В будущем будет связан со складом.</p>
            <ul class="ai-materials-list">
              <li class="ai-material-item">
                <span class="ai-material-name">Ultracain D-S forte 1.7ml</span>
                <span class="ai-material-meta">Анестезия • 1 амп.</span>
              </li>
              <li class="ai-material-item">
                <span class="ai-material-name">Filtek Z250</span>
                <span class="ai-material-meta">Пломбировочный материал • 1 шт.</span>
              </li>
              <li class="ai-material-item">
                <span class="ai-material-name">Коффердам / матрицы / клинья</span>
                <span class="ai-material-meta">Расходники</span>
              </li>
            </ul>
          </div>
        </div>
        <div class="ai-core-tabpanel" data-ai-tabpanel="services">
          <div class="ai-core-mock-panel">
            <h3>Оказанные услуги</h3>
            <p style="margin-bottom: 10px;">Услуги по визиту (пока mock-структура).</p>
            <ul class="ai-services-list">
              <li class="ai-service-item">
                <span class="ai-service-code">ST-01</span>
                <span class="ai-service-name">Лечение кариеса дентина зуба 1.6</span>
                <span class="ai-service-price">25 000 ₸</span>
              </li>
              <li class="ai-service-item">
                <span class="ai-service-code">ST-02</span>
                <span class="ai-service-name">Анестезия инфильтрационная</span>
                <span class="ai-service-price">3 000 ₸</span>
              </li>
            </ul>
          </div>
        </div>
        <div class="ai-core-tabpanel" data-ai-tabpanel="history">
          <div class="ai-core-mock-panel">
            <h3>История болезни</h3>
            <p style="margin-bottom: 10px;">Визиты пациента по данным Core AI.</p>
            <div id="aiHistoryList" class="ai-history-list">
              <div class="ai-history-empty">Загрузка истории...</div>
            </div>
          </div>
        </div>
        <div class="ai-core-tabpanel" data-ai-tabpanel="plans">
          <div class="ai-core-mock-panel">
            <h3>Планы лечения</h3>
            <p style="margin-bottom: 10px;">Предварительный план по зубам.</p>
            <ul class="ai-plans-list">
              <li class="ai-plan-item">
                <span class="ai-plan-tooth">1.6</span>
                <span class="ai-plan-text">Контроль пломбы через 6 месяцев</span>
              </li>
              <li class="ai-plan-item">
                <span class="ai-plan-tooth">3.6</span>
                <span class="ai-plan-text">Диагностика и при необходимости лечение кариеса</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <style>
        @keyframes pulse-red {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.6; }
          100% { transform: scale(1); opacity: 1; }
        }
      </style>
    </div>
  `;
}
