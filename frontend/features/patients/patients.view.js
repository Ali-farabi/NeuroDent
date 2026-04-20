import { getState } from "../../core/state.js"; // State-тен юзердің кім екенін білу үшін

function switchPatientTab(btn, targetId, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const btns = container.querySelectorAll(".tab-btn");
  const contents = container.querySelectorAll(".tab-content");

  btns.forEach((tabBtn) => {
    tabBtn.classList.remove("active");
    tabBtn.style.color = "var(--muted)";
    tabBtn.style.borderBottomColor = "transparent";
    tabBtn.style.fontWeight = "500";
  });

  contents.forEach((content) => {
    content.style.display = "none";
  });

  btn.classList.add("active");
  btn.style.color = "var(--primary)";
  btn.style.borderBottomColor = "var(--primary)";
  btn.style.fontWeight = "600";

  const targetContent = container.querySelector(`#${targetId}`);
  if (targetContent) {
    targetContent.style.display = "block";
  }
}

if (typeof window !== "undefined") {
  window.switchPatientTab = switchPatientTab;
}

export function renderPatientsPage() {
  const state = getState ? getState() : null;
  const userRole = state?.user?.role || "owner";
  
  if (userRole === "patient") {
    // --------------------------------------------------
    // 1. ПАЦИЕНТТІҢ ЖЕКЕ КАБИНЕТІ (TRUST LAYER)
    // --------------------------------------------------
    return `
      <div class="report-container" style="padding: 20px; max-width: 1000px; margin: 0 auto; display: flex; flex-direction: column; gap: 24px;">
        
        <!-- Header: Сәлемдесу және Бонустар -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px;">
          <div>
            <h1 style="font-size: 28px; font-weight: 800; margin: 0 0 8px 0; color: var(--text);">Добро пожаловать, Дамир! 👋</h1>
            <p style="color: var(--muted); margin: 0; font-size: 15px;">Ваша личная медицинская карта и история лечения</p>
          </div>
          <div style="background: var(--surface); padding: 12px 20px; border-radius: var(--radius); border: 1px solid var(--primary-100); display: flex; align-items: center; gap: 12px; box-shadow: var(--shadow-sm);">
            <div style="background: rgba(16, 185, 129, 0.1); padding: 8px; border-radius: 50%; color: var(--success);">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
            </div>
            <div>
              <div style="font-size: 12px; color: var(--muted); text-transform: uppercase; font-weight: 600;">Ваши бонусы</div>
              <div style="font-size: 20px; font-weight: 800; color: var(--text);">12 500 ₸</div>
            </div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
          
          <!-- 3D Снимки и Фото -->
          <div style="background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow-sm);">
             <div style="padding: 16px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                <div style="font-weight: 700; font-size: 16px;">Ваша 3D-модель челюсти</div>
                <span class="badge" style="background: var(--primary-100); color: var(--primary-700);">Обновлено 15.01.2024</span>
             </div>
             <div style="background: #111; height: 200px; display: flex; align-items: center; justify-content: center; position: relative;">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                <div style="position: absolute; bottom: 12px; color: rgba(255,255,255,0.6); font-size: 12px;">Крутите для просмотра (Демо)</div>
             </div>
             <div style="padding: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div>
                   <div style="font-size: 11px; color: var(--muted); margin-bottom: 4px;">Фото ДО</div>
                   <div style="height: 60px; background: var(--surface-2); border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 20px;">🦷</div>
                </div>
                <div>
                   <div style="font-size: 11px; color: var(--muted); margin-bottom: 4px;">Фото ПОСЛЕ</div>
                   <div style="height: 60px; background: var(--surface-2); border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 20px;">✨</div>
                </div>
             </div>
          </div>

          <!-- История лечения -->
          <div style="background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; box-shadow: var(--shadow-sm); display: flex; flex-direction: column;">
             <div style="font-weight: 700; font-size: 16px; margin-bottom: 16px;">История лечения</div>
             
             <div class="stack" style="gap: 16px; flex: 1;">
               <!-- Визит 1 (Связь с AI) -->
               <div style="border-left: 2px solid var(--primary); padding-left: 12px;">
                 <div style="font-size: 12px; color: var(--primary); font-weight: 600; margin-bottom: 4px;">Вчера, 15:00</div>
                 <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">Лечение кариеса (Зуб 1.6)</div>
                 <div style="font-size: 13px; color: var(--muted); margin-bottom: 8px;">Врач: Dr. Johnson • Материал: Filtek Z250</div>
                 <button class="btn btn-secondary" id="downloadAiProtocolBtn" style="font-size: 12px; padding: 4px 8px; border-color: var(--primary); color: var(--primary);">
                   📄 Скачать AI-Протокол (eGov)
                 </button>
               </div>
               
               <!-- Визит 2 -->
               <div style="border-left: 2px solid var(--border-strong); padding-left: 12px; opacity: 0.7;">
                 <div style="font-size: 12px; color: var(--muted); font-weight: 600; margin-bottom: 4px;">15 Января 2024</div>
                 <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">Профессиональная чистка</div>
                 <div style="font-size: 13px; color: var(--muted);">Врач: Dr. Smith</div>
               </div>
             </div>

             <!-- План лечения -->
             <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
               <div style="font-size: 12px; font-weight: 700; color: var(--muted); text-transform: uppercase; margin-bottom: 8px;">Ваш план лечения</div>
               <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.2); padding: 12px; border-radius: 8px; font-size: 13px;">
                  Нужно удалить зуб мудрости (Зуб 4.8). <br/>
                  <span style="color: #d97706; font-weight: 600; margin-top: 4px; display: inline-block;">Позвоните нам: +7 771 163 2030</span>
               </div>
             </div>
          </div>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------
  // 2. ДӘРІГЕР / АДМИН / ВЛАДЕЛЕЦ КӨРЕТІН БАЗА
  // --------------------------------------------------
  return `
    <div class="patients-container">
      <div class="patients-toolbar">
        <input 
          id="patientSearch" 
          class="patients-search-input" 
          placeholder="Поиск по имени или телефону..." 
        />
        ${userRole !== "doctor" ? `
        <button id="createPatientBtn" class="patients-create-btn" type="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Создать
        </button>
        ` : ''}
      </div>

      <div class="patients-content">
        <div id="patientsState"></div>
        <div id="patientsTable"></div>
      </div>
    </div>
  `;
}

export function renderLoading(text = "Загрузка пациентов…") {
  return `
    <div class="patients-empty">
      <div class="spinner"></div>
      <div class="state-text">${text}</div>
    </div>
  `;
}

export function renderError(message) {
  return `
    <div class="patients-empty">
      <div class="state-icon">⚠️</div>
      <div class="form-error" style="min-height:auto;">${escapeHtml(message)}</div>
    </div>
  `;
}

export function renderEmpty() {
  return `
    <div class="patients-empty">
      <div class="state-icon">👤</div>
      <div class="state-text" style="margin-top:0;">Пациенты не найдены</div>
    </div>
  `;
}

export function renderPatientsTable(list) {
  const role = getState?.()?.user?.role || "owner";
  const showAiBtn = role === "doctor" || role === "assistant" || role === "owner";

  return `
    <div class="patients-list">
      ${list
        .map(
          (p) => `
        <div class="patient-item">
          <div class="patient-indicator"></div>
          <div class="patient-info">
            <div class="patient-name">${escapeHtml(p.name)}</div>
            <div class="patient-details">
              <span class="patient-phone">${escapeHtml(p.phone)}</span>
              ${p.birthDate ? `<span class="patient-birth">• ${escapeHtml(p.birthDate)}</span>` : ''}
            </div>
          </div>
          <div class="patient-actions">
            ${showAiBtn ? `
            <button class="patient-action-btn" onclick="window.location.hash='#ai?patient=${p.id}'" type="button" style="color: var(--primary);">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2a2 2 0 0 1 2 2c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2z"/>
                <path d="M12 6v6l4 2"/>
              </svg>
              AI-Прием
            </button>
            ` : ""}
            <button class="patient-action-btn" data-action="view" data-id="${p.id}" type="button">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              Просмотр
            </button>
            <button class="patient-action-btn" data-action="edit" data-id="${p.id}" type="button">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Изменить
            </button>
          </div>
        </div>
      `,
        )
        .join("")}
    </div>
  `;
}

export function renderPatientForm({ mode, patient }) {
  const title = mode === "edit" ? "Изменить пациента" : "Создать пациента";
  return `
    <form id="patientForm">
      <div class="modal-form-title">${title}</div>

      <label class="field" style="margin-bottom:12px;">
        <span class="field-label">Имя</span>
        <input class="input" name="name" value="${patient?.name ? escapeAttr(patient.name) : ""}" required />
      </label>

      <label class="field" style="margin-bottom:12px;">
        <span class="field-label">Телефон</span>
        <input class="input" name="phone" value="${patient?.phone ? escapeAttr(patient.phone) : ""}" placeholder="8700..." required />
      </label>

      <label class="field" style="margin-bottom:12px;">
        <span class="field-label">Email</span>
        <input class="input" type="email" name="email" value="${patient?.email ? escapeAttr(patient.email) : ""}" placeholder="example@mail.com" />
      </label>

      <label class="field" style="margin-bottom:12px;">
        <span class="field-label">Адрес</span>
        <input class="input" type="text" name="address" value="${patient?.address ? escapeAttr(patient.address) : ""}" placeholder="Город, улица, дом" />
      </label>

      <label class="field" style="margin-bottom:12px;">
        <span class="field-label">Дата рождения</span>
        <input class="input" type="date" name="birthDate" value="${patient?.birthDate ? escapeAttr(patient.birthDate) : ""}" />
      </label>

      <div id="patientFormError" class="form-error"></div>

      <div class="form-actions">
        <button class="btn btn-secondary" type="button" id="cancelPatientForm">Отмена</button>
        <button class="btn" type="submit" id="savePatientBtn">${mode === "edit" ? "Сохранить" : "Создать"}</button>
      </div>
    </form>
  `;
}

export function renderPatientCard(patient) {
  const state = getState ? getState() : null;
  const isDoctor = state?.user?.role === "doctor" || state?.user?.role === "assistant";
  
  // Создаем уникальный ID для этого экземпляра модалки (чтобы скрипт не путался, если их несколько)
  const uid = Math.random().toString(36).substr(2, 9);
  
  return `
    <div class="patient-card-tabs-container" id="patient-card-${uid}" style="font-family: sans-serif; color: var(--text);">
      
      <!-- Вкладки (Tabs) -->
      <div style="display: flex; gap: 32px; border-bottom: 1px solid var(--border); margin-bottom: 24px;">
         <div class="tab-btn active" onclick="window.switchPatientTab(this, 'tab-info-${uid}', 'patient-card-${uid}')" style="font-weight: 600; font-size: 14px; color: var(--primary); border-bottom: 2px solid var(--primary); padding-bottom: 12px; margin-bottom: -1px; cursor: pointer; transition: all 0.2s;">
           Информация
         </div>
         <div class="tab-btn" onclick="window.switchPatientTab(this, 'tab-treatment-${uid}', 'patient-card-${uid}')" style="font-weight: 500; font-size: 14px; color: var(--muted); padding-bottom: 12px; cursor: pointer; transition: all 0.2s; margin-bottom: -1px; border-bottom: 2px solid transparent;">
           Лечение
         </div>
         <div class="tab-btn" onclick="window.switchPatientTab(this, 'tab-visits-${uid}', 'patient-card-${uid}')" style="font-weight: 500; font-size: 14px; color: var(--muted); padding-bottom: 12px; cursor: pointer; transition: all 0.2s; margin-bottom: -1px; border-bottom: 2px solid transparent;">
           Визиты
         </div>
      </div>

      <!-- Вкладка 1: Информация (показывается по умолчанию) -->
      <div class="tab-content" id="tab-info-${uid}" style="display: block;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 32px;">
          
          <!-- Левая колонка -->
          <div class="stack" style="gap: 20px;">
            <div>
              <div style="display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; margin-bottom: 6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                Телефон
              </div>
              <div style="font-weight: 500; font-size: 15px; color: var(--text);">${escapeHtml(patient.phone)}</div>
            </div>
            
            <div>
              <div style="display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; margin-bottom: 6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                Дата рождения
              </div>
              <div style="font-weight: 500; font-size: 15px; color: var(--text);">
                ${patient.birthDate ? escapeHtml(patient.birthDate) + ' <span style="color:var(--muted); margin-left:8px;">М</span>' : `<span class="muted">—</span>`}
              </div>
            </div>

            <div>
              <div style="display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; margin-bottom: 6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                Адрес
              </div>
              <div style="font-weight: 500; font-size: 15px; color: var(--text);">${patient.address ? escapeHtml(patient.address) : '<span class="muted">—</span>'}</div>
            </div>
          </div>

          <!-- Правая колонка -->
          <div class="stack" style="gap: 20px;">
            <div>
              <div style="display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; margin-bottom: 6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                Email
              </div>
              <div style="font-weight: 500; font-size: 15px; color: var(--text);">${patient.email ? escapeHtml(patient.email) : '<span class="muted">—</span>'}</div>
            </div>

            <!-- Бонусы (Скрываем от врача) -->
            ${!isDoctor ? `
            <div>
              <div style="display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; margin-bottom: 6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                Бонусные баллы
              </div>
              <div style="font-weight: 700; font-size: 15px; color: var(--primary);">175</div>
            </div>
            ` : `
            <div>
              <div style="display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; margin-bottom: 6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
                Статус
              </div>
              <div style="font-weight: 500; font-size: 14px; color: var(--text);">Аллергий нет</div>
            </div>
            `}
          </div>
        </div>
      </div>

      <!-- Вкладка 2: Лечение (Скрыта по умолчанию, скролл при длинном списке) -->
      <div class="tab-content patient-card-tab-scroll" id="tab-treatment-${uid}" style="display: none;">
         ${patient.treatments && patient.treatments.length > 0 ? patient.treatments.map(t => `
         <div style="background: var(--surface); border-radius: 12px; padding: 16px; margin-bottom: 16px; border: 1px solid var(--border);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
              <div>
                <div style="font-weight: 600; font-size: 16px; color: var(--text); margin-bottom: 4px;">${escapeHtml(t.procedure)}</div>
                <div style="font-size: 13px; color: var(--muted);">Диагноз: ${escapeHtml(t.diagnosis)}</div>
                <div style="font-size: 13px; color: var(--muted); margin-top: 4px;">Врач: ${escapeHtml(t.doctor)} • ${escapeHtml(t.date)}</div>
              </div>
            </div>
            
            ${!isDoctor && t.cost ? `<div style="font-weight: 600; font-size: 14px; margin-bottom: 16px; color: var(--text);">Стоимость: ${escapeHtml(t.cost)} ₸</div>` : '<div style="margin-bottom: 16px;"></div>'}
            
            ${t.aiSummary ? `
            <div style="background: rgba(37, 99, 235, 0.04); padding: 14px; border-radius: 8px; font-size: 13px; color: var(--text); border-left: 2px solid var(--primary);">
              <div style="display: flex; align-items: center; gap: 6px; color: var(--primary); font-weight: 600; margin-bottom: 8px; font-size: 12px;">
                <span style="font-size: 14px;">🤖</span> AI Резюме
              </div>
              <div style="line-height: 1.6; color: var(--text);">${escapeHtml(t.aiSummary)}</div>
            </div>
            ` : ''}
         </div>
         `).join('') : `
         <div class="patients-empty" style="padding: 40px 0;">
           <div class="state-icon" style="font-size: 32px; opacity: 0.5;">🦷</div>
           <div class="state-text" style="margin-top: 12px;">История лечения пуста</div>
         </div>
         `}
      </div>

      <!-- Вкладка 3: Визиты (Скрыта по умолчанию, скролл при длинном списке) -->
      <div class="tab-content patient-card-tab-scroll" id="tab-visits-${uid}" style="display: none;">
         <div class="stack" style="gap: 16px;">
            ${patient.visits && patient.visits.length > 0 ? patient.visits.map((v, index) => `
            ${index > 0 ? '<hr style="border: none; border-top: 1px solid var(--border); margin: 0;" />' : ''}
            <div style="${v.status === 'Завершен' ? 'opacity: 0.8;' : ''}">
               <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 6px;">
                 <div style="font-weight: 600; font-size: 14px; color: var(--text);">${escapeHtml(v.date)}</div>
                 <div style="font-size: 13px; color: var(--muted);">${escapeHtml(v.time)}</div>
               </div>
               <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                 <div>
                   <div style="font-weight: 500; font-size: 15px; color: var(--text); margin-bottom: 2px;">${escapeHtml(v.type)}</div>
                   <div style="font-size: 13px; color: var(--muted);">${escapeHtml(v.doctor)}</div>
                 </div>
                 <span class="badge" style="background: ${v.status === 'Завершен' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(37, 99, 235, 0.1)'}; color: ${v.status === 'Завершен' ? 'var(--success)' : 'var(--primary)'}; font-weight: 500;">
                   ${escapeHtml(v.status)}
                 </span>
               </div>
            </div>
            `).join('') : `
            <div class="patients-empty" style="padding: 40px 0;">
              <div class="state-icon" style="font-size: 32px; opacity: 0.5;">📅</div>
              <div class="state-text" style="margin-top: 12px;">Нет запланированных визитов</div>
            </div>
            `}
         </div>
      </div>

    </div>

    <!-- Скрипт для переключения вкладок (Убрано, так как используется window.switchPatientTab) -->
  `;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(str) {
  return escapeHtml(str).replaceAll("\n", " ");
}