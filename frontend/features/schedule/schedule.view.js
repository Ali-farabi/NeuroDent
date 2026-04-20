import { getState } from "../../core/state.js";
import { initCalendar } from "./calendar.js";

function generateTimeSlots() {
  const slots = [];
  for (let hour = 8; hour <= 20; hour++) {
    slots.push(`${String(hour).padStart(2, "0")}:00`);
    if (hour !== 20) {
      slots.push(`${String(hour).padStart(2, "0")}:30`);
    }
  }
  return slots;
}

function timeToY(time) {
  const [h, m] = time.split(":").map(Number);
  return (((h - 8) * 60 + m) / 30) * 60;
}

function durationToHeight(minutes) {
  return (minutes / 30) * 60;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderScheduleLayout({
  doctors,
  selectedDoctorId,
  selectedDate,
}) {
  const html = `
    <div style="display: flex; flex-direction: column; height: 100%;">
      <!-- Вкладки (Call-центр) -->
      <div style="display: flex; gap: 32px; border-bottom: 1px solid var(--border); padding: 20px 24px 0 24px; background: var(--surface);">
         <div class="tab-btn active" id="tab-calendar" style="font-weight: 600; font-size: 14px; color: var(--primary); border-bottom: 2px solid var(--primary); padding-bottom: 12px; margin-bottom: -1px; cursor: pointer; transition: all 0.2s;">
           📅 Умный календарь
         </div>
         <div class="tab-btn" id="tab-chats" style="font-weight: 600; font-size: 14px; color: var(--muted); padding-bottom: 12px; margin-bottom: -1px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 6px;">
           💬 WhatsApp & Звонки
           <span style="background: #ef4444; color: white; border-radius: 10px; padding: 2px 6px; font-size: 10px; font-weight: 700;">3</span>
         </div>
      </div>

      <!-- Контент: Календарь -->
      <div id="tab-content-calendar" class="schedule-shell" style="flex: 1;">
        <div class="schedule-left">
          <div class="card">
            <label class="field">
              <span class="field-label">Врач</span>
              <select id="doctorSelect" class="input">
                <option value="">Все врачи</option>
                ${doctors
                  .map(
                    (d) =>
                      `<option value="${d.id}" ${d.id === selectedDoctorId ? "selected" : ""}>${escapeHtml(d.name)}</option>`,
                  )
                  .join("")}
              </select>
            </label>
          </div>
          <div class="card">
            <div id="calendar"></div>
          </div>
          <!-- ✅ ЖАҢА кнопка -->
          ${!["doctor", "assistant"].includes(getState().user?.role || "") ? `
          <div class="card">
            <button id="addAppointmentBtn" class="btn btn-block" type="button">
              + Новая запись
            </button>
          </div>` : ""}
        </div>
        <div class="schedule-right">
          <div id="scheduleContent"></div>
        </div>
      </div>

      <!-- Контент: Чаты (3-column CRM) -->
      <div id="tab-content-chats" class="crm-chats-wrap" style="display: none; flex: 1; padding: 20px; background: var(--surface-2);">
        <div class="crm-chats-grid">
          <!-- LEFT: Conversations list -->
          <div class="crm-chat-sidebar">
            <div class="crm-chat-search-wrap">
              <input type="text" id="chatSearchInput" class="crm-chat-search-input" placeholder="Поиск пациента..." autocomplete="off" />
            </div>
            <div class="crm-chat-list" id="chatListContainer">
              <div class="crm-chat-list-loading">
                <div class="spinner" style="margin: 0 auto 12px auto;"></div>
                Загрузка чатов...
              </div>
            </div>
          </div>

          <!-- MIDDLE: Chat conversation -->
          <div class="crm-chat-main">
            <div class="crm-chat-header">
              <div id="chatHeaderInfo">
                <div class="crm-chat-header-name">Выберите чат</div>
                <div class="crm-chat-header-meta">Нажмите на диалог слева</div>
              </div>
              <div class="crm-chat-header-actions">
                <button type="button" id="chatCallBtn" class="btn btn-secondary chat-header-btn" title="Позвонить">📞 Позвонить</button>
                <button type="button" id="chatScheduleBtn" class="btn btn-secondary chat-header-btn" title="Записать">📅 Записать</button>
              </div>
            </div>
            <div id="chatMessagesArea" class="crm-chat-messages">
              <div class="crm-chat-date">Сегодня</div>
              <div class="crm-chat-bubble crm-chat-bubble-in">
                <div class="crm-chat-bubble-text">Здравствуйте! Можно записаться на завтра к хирургу?</div>
                <div class="crm-chat-bubble-time">10:42</div>
              </div>
              <div class="crm-chat-bubble crm-chat-bubble-out">
                <div class="crm-chat-bubble-text">Добрый день! Да, конечно. У доктора Омарова есть окошко на 14:30. Записать вас?</div>
                <div class="crm-chat-bubble-time">10:45 ✓✓</div>
              </div>
            </div>
            <div class="crm-chat-input-wrap">
              <div class="crm-chat-input-actions">
                <button type="button" class="crm-chat-quick-btn" id="aiReplyBtn">✨ AI-Ответ</button>
                <button type="button" class="crm-chat-quick-btn" id="chatTemplatePriceBtn">Шаблон: Прайс</button>
              </div>
              <div class="crm-chat-input-row">
                <button type="button" id="chatAttachBtn" class="crm-chat-attach-btn" title="Вложение">📎</button>
                <input type="text" id="chatInputMsg" class="crm-chat-input" placeholder="Введите сообщение..." autocomplete="off" />
                <button type="button" id="chatSendBtn" class="crm-chat-send-btn">Отправить в WhatsApp</button>
              </div>
            </div>
          </div>

          <!-- RIGHT: Patient information panel -->
          <div class="crm-chat-patient-panel">
            <div id="chatPatientPanel" class="crm-patient-panel-content">
              <div class="crm-patient-panel-empty">
                <div class="crm-patient-panel-empty-icon">👤</div>
                <p>Выберите чат слева, чтобы увидеть карточку пациента</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  queueMicrotask(() => {
    const calBox = document.getElementById("calendar");
    if (!calBox) return;
    initCalendar(calBox, {
      value: selectedDate,
      onChange: (newDate) => {
        window.dispatchEvent(
          new CustomEvent("schedule:dateChanged", { detail: newDate }),
        );
      },
    });
  });

  return html;
}

// ✅ ЖАҢА — форма
export function renderAddAppointmentForm({ doctors, patients }) {
  return `
    <form id="addApptForm" class="stack">
      <label class="field">
        <span class="field-label">Врач</span>
        <select class="input" name="doctorId" required>
          <option value="">Выберите врача</option>
          ${doctors.map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join("")}
        </select>
      </label>
      <label class="field">
        <span class="field-label">Пациент</span>
        <select class="input" name="patientId" required>
          <option value="">Выберите пациента</option>
          ${patients.map((p) => `<option value="${p.id}">${escapeHtml(p.name)} — ${escapeHtml(p.phone)}</option>`).join("")}
        </select>
      </label>
      <label class="field">
        <span class="field-label">Дата</span>
        <input class="input" type="date" name="date" required />
      </label>
      <label class="field">
        <span class="field-label">Время</span>
        <input class="input" type="time" name="time" required />
      </label>
      <label class="field">
        <span class="field-label">Длительность (мин)</span>
        <select class="input" name="duration">
          <option value="15">15 мин</option>
          <option value="30" selected>30 мин</option>
          <option value="45">45 мин</option>
          <option value="60">60 мин</option>
          <option value="90">90 мин</option>
        </select>
      </label>
      <div id="apptFormError" class="form-error"></div>
      <div class="row row-end row-gap-8">
        <button class="btn btn-secondary" type="button" id="cancelApptForm">Отмена</button>
        <button class="btn" type="submit" id="saveApptBtn">Создать</button>
      </div>
    </form>
  `;
}

export function renderCalendarGrid({ doctors, appointments, selectedDate }) {
  const timeSlots = generateTimeSlots();
  if (!doctors || doctors.length === 0) {
    return `<div class="calendar-empty"><div class="calendar-empty-icon">👨‍⚕️</div><div class="calendar-empty-text">Врачей не найдено</div></div>`;
  }
  return `
    <div class="calendar-grid-wrapper">
      <div class="calendar-grid-header">
        <div class="calendar-time-header">Время</div>
        <div class="calendar-xscroll calendar-xscroll--header" data-cal-x="header">
          <div class="calendar-doctors-header">
            ${doctors
              .map(
                (d) => `
              <div class="calendar-doctor-column-header">
                <div class="calendar-doctor-name">${escapeHtml(d.name)}</div>
                <div class="calendar-doctor-specialty">${escapeHtml(d.specialty || "")}</div>
              </div>
            `,
              )
              .join("")}
          </div>
        </div>
      </div>
      <div class="calendar-grid-scroll" data-cal-y="1">
        <div class="calendar-grid-body">
          <div class="calendar-time-column">
            ${timeSlots.map((t) => `<div class="calendar-time-slot">${t}</div>`).join("")}
          </div>
          <div class="calendar-xscroll calendar-xscroll--grid" data-cal-x="grid">
            <div class="calendar-doctors-columns">
              ${doctors
                .map((doctor) => {
                  const appts = appointments.filter(
                    (a) => a.doctorId === doctor.id,
                  );
                  return `
                  <div class="calendar-doctor-column">
                    <div class="calendar-time-grid">
                      ${timeSlots.map(() => `<div class="calendar-time-grid-line"></div>`).join("")}
                    </div>
                    ${appts
                      .map((appt) => {
                        const top = timeToY(appt.time);
                        const height = durationToHeight(appt.duration || 30);
                        return `
                        <div
                          class="calendar-appointment ${escapeHtml(appt.status)}"
                          style="top:${top}px; height:${height}px;"
                          data-appointment-id="${escapeHtml(appt.id)}"
                          onclick="window.handleAppointmentClick('${escapeHtml(appt.id)}', '${escapeHtml(appt.patientId)}')"
                        >
                          <div class="calendar-appointment-time">${escapeHtml(appt.time)}</div>
                          <div class="calendar-appointment-patient">${escapeHtml(appt.patientName)}</div>
                          <div class="calendar-appointment-status">${escapeHtml(appt.status)}</div>
                        </div>
                      `;
                      })
                      .join("")}
                  </div>
                `;
                })
                .join("")}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderLoading() {
  return `<div class="calendar-empty"><div class="spinner"></div><div class="calendar-empty-text" style="margin-top:12px;">Загрузка...</div></div>`;
}

export function renderError(message) {
  return `<div class="calendar-empty"><div class="calendar-empty-icon">⚠️</div><div class="calendar-empty-text" style="color:#b91c1c;">${escapeHtml(message)}</div></div>`;
}

export function renderEmpty() {
  return `<div class="calendar-empty"><div class="calendar-empty-icon">📅</div><div class="calendar-empty-text">Нет записей на эту дату</div></div>`;
}
