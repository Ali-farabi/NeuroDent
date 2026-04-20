// features/visits/visits.view.js

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const STATUS_LABELS = {
  scheduled: "Запланирован",
  arrived: "Прибыл",
  completed: "Завершён",
  cancelled: "Отменён",
};

export function renderVisitPageShell() {
  return `
    <div class="visit-shell">
      <div id="visitCard"></div>
    </div>
  `;
}

export function renderVisitLoading(text = "Загрузка…") {
  return `
    <div class="visit-empty">
      <div class="spinner"></div>
      <div class="state-text">${escapeHtml(text)}</div>
    </div>
  `;
}

export function renderVisitError(message) {
  return `
    <div class="visit-empty">
      <div class="state-icon">⚠️</div>
      <div class="form-error" style="min-height:auto;">${escapeHtml(message)}</div>
    </div>
  `;
}

export function renderVisitForm({ appointment, visit, isFinal }) {
  const disabled = isFinal ? "disabled" : "";
  const statusLabel = STATUS_LABELS[appointment.status] || appointment.status;

  return `
    <!-- HEADER -->
    <div class="visit-header">
      <div class="visit-header-left">
        <button class="visit-back-btn" id="backToScheduleBtn" type="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Назад
        </button>
        <div class="visit-title-block">
          <div class="visit-patient-name">${escapeHtml(appointment.patientName)}</div>
          <div class="visit-meta">${escapeHtml(appointment.date)} • ${escapeHtml(appointment.time)}</div>
        </div>
      </div>
      <div class="visit-header-right">
        <span class="badge ${escapeHtml(appointment.status)}">${escapeHtml(statusLabel)}</span>
        <button
          class="btn ${visit && !isFinal ? "btn-secondary" : ""}"
          id="startVisitBtn"
          type="button"
          ${visit ? "disabled" : ""}
        >
          ${visit ? "Визит начат" : "▶ Начать визит"}
        </button>
      </div>
    </div>

    <!-- FORM -->
    <form id="visitForm" class="visit-form-body">

      <div class="visit-section">
        <div class="visit-section-title">Жалоба пациента</div>
        <textarea
          class="visit-textarea"
          name="complaint"
          rows="3"
          placeholder="Опишите жалобы пациента..."
          ${disabled}
        >${escapeHtml(visit?.complaint || "")}</textarea>
      </div>

      <div class="visit-section">
        <div class="visit-section-title">Диагноз</div>
        <textarea
          class="visit-textarea"
          name="diagnosis"
          rows="3"
          placeholder="Поставьте диагноз..."
          ${disabled}
        >${escapeHtml(visit?.diagnosis || "")}</textarea>
      </div>

      <div class="visit-section">
        <div class="visit-section-title">Заметки врача</div>
        <textarea
          class="visit-textarea"
          name="notes"
          rows="3"
          placeholder="Дополнительные заметки, рекомендации..."
          ${disabled}
        >${escapeHtml(visit?.notes || "")}</textarea>
      </div>

      <div id="visitError" class="form-error px-16"></div>

      <div class="visit-footer">
        ${
          isFinal
            ? `<div class="visit-completed-badge">✅ Визит завершён и заблокирован</div>`
            : `<button class="btn" id="finishVisitBtn" type="submit" ${!visit ? "disabled" : ""}>
               Завершить визит
             </button>`
        }
      </div>

    </form>
  `;
}
