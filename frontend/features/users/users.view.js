/**
 * Пользователи — view: минималистичный медицинский стиль, чистая структура.
 */

function esc(s) {
  if (s == null || s === "") return "";
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

const ROLE_LABELS = { owner: "Владелец", admin: "Админ", doctor: "Врач", assistant: "Ассистент" };

export function renderUsersPage() {
  return `
    <div class="users-container">
      <div class="users-toolbar">
        <input type="text" id="usersSearch" class="users-search-input" placeholder="Поиск по имени, телефону, email..." autocomplete="off" />
        <button type="button" id="usersAddBtn" class="users-create-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Создать
        </button>
      </div>
      <div class="users-content">
        <div id="usersListWrap">
          <div class="users-loading" id="usersLoading">Загрузка...</div>
          <div class="users-empty" id="usersEmpty" style="display: none;">Нет пользователей</div>
          <div class="users-list" id="usersList"></div>
        </div>
      </div>
    </div>
  `;
}

export function renderUsersTable(list) {
  if (!list || list.length === 0) {
    return `
      <div class="users-empty" id="usersEmpty">Нет пользователей</div>
      <div class="users-list" id="usersList" style="display: none;"></div>
    `;
  }
  const rows = list
    .map(
      (u) => `
    <div class="user-item" data-user-id="${esc(u.id)}">
      <div class="user-item-main">
        <div class="user-item-name">${esc(u.name)}</div>
        <div class="user-item-meta">${esc(u.phone)}${u.email ? " · " + esc(u.email) : ""}</div>
      </div>
      <div class="user-item-role">
        <span class="user-role-badge user-role-${esc(u.role)}">${esc(ROLE_LABELS[u.role] || u.role)}</span>
      </div>
      <div class="user-item-status">
        ${u.isActive !== false ? '<span class="user-status-active">Активен</span>' : '<span class="user-status-inactive">Неактивен</span>'}
      </div>
      <div class="user-item-actions">
        <button type="button" class="user-btn-edit" data-user-id="${esc(u.id)}" title="Изменить">Изменить</button>
      </div>
    </div>
  `
    )
    .join("");
  return `
    <div class="users-empty" id="usersEmpty" style="display: none;"></div>
    <div class="users-list" id="usersList">${rows}</div>
  `;
}

export function renderUserForm(options = {}) {
  const { mode = "create" } = options;
  const user = options.user ?? {};
  const isEdit = mode === "edit";
  const title = isEdit ? "Редактировать пользователя" : "Новый пользователь";
  const name = isEdit ? (user.name ?? "") : "";
  const phone = isEdit ? (user.phone ?? "") : "";
  const email = isEdit ? (user.email ?? "") : "";
  const role = isEdit ? (user.role ?? "admin") : "admin";
  const isActive = isEdit ? (user.isActive !== false) : true;

  return `
    <div class="user-modal" id="userFormModal">
      <div class="user-modal-backdrop" id="userFormBackdrop"></div>
      <div class="user-modal-box">
        <div class="user-modal-header">
          <h2 class="user-modal-title">${esc(title)}</h2>
          <button type="button" class="user-modal-close" id="userFormClose" aria-label="Закрыть">&times;</button>
        </div>
        <form id="userForm" class="user-form">
          <input type="hidden" name="id" value="${esc(user.id || "")}" />
          <div class="user-form-group">
            <label for="userFormName">ФИО</label>
            <input type="text" id="userFormName" name="name" value="${esc(name)}" required minlength="2" placeholder="Иванов Иван Иванович" />
          </div>
          <div class="user-form-group">
            <label for="userFormPhone">Телефон</label>
            <input type="tel" id="userFormPhone" name="phone" value="${esc(phone)}" required placeholder="87001234567" />
          </div>
          <div class="user-form-group">
            <label for="userFormEmail">Email</label>
            <input type="email" id="userFormEmail" name="email" value="${esc(email)}" placeholder="user@clinic.kz" />
          </div>
          <div class="user-form-group">
            <label for="userFormRole">Роль</label>
            <select id="userFormRole" name="role">
              <option value="owner" ${role === "owner" ? "selected" : ""}>Владелец</option>
              <option value="admin" ${role === "admin" ? "selected" : ""}>Админ</option>
              <option value="doctor" ${role === "doctor" ? "selected" : ""}>Врач</option>
              <option value="assistant" ${role === "assistant" ? "selected" : ""}>Ассистент</option>
            </select>
          </div>
          ${isEdit ? `
          <div class="user-form-group user-form-group-check">
            <label><input type="checkbox" name="isActive" ${isActive ? "checked" : ""} /> Активен</label>
          </div>
          ` : ""}
          <div class="user-form-actions">
            <button type="button" class="btn btn-secondary" id="userFormCancel">Отмена</button>
            <button type="submit" class="btn btn-primary">${isEdit ? "Сохранить" : "Добавить"}</button>
          </div>
        </form>
      </div>
    </div>
  `;
}
