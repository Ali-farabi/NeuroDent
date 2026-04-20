export function renderAuthPage() {
  return `
    <div class="auth-split">
      <div class="auth-left">
        <div class="auth-topbar">
          <div class="auth-brand" style="display: flex; align-items: center; gap: 8px;">
<img src="./assets/images/Medimetricslogotype.png" alt="Neurodent" style="width: 36px; height: 36px;">
            <span style="font-size: 24px; font-weight: 800;">Neurodent</span>
          </div>
        </div>
        <div class="auth-panel">
          <div class="auth-title">Вход в систему</div>
          <form id="loginForm" class="auth-form">
            <label class="auth-label">
              Телефон (любые 10 цифр)
              <input class="input" name="phone" type="tel" placeholder="8700..." autocomplete="tel" required value="87001112233" />
            </label>
            <label class="auth-label">
              Пароль
              <input class="input" name="password" type="password" placeholder="••••" autocomplete="current-password" required />
            </label>
            <div id="loginError" class="auth-error" aria-live="polite"></div>
            <button id="loginBtn" class="btn" type="submit" style="margin-top: 8px;">Войти</button>
            <div class="auth-hint" style="line-height: 1.6; margin-top: 16px;">
              <b>Демо-пароли для проверки ролей:</b><br>
              • <code>1234</code> — Владелец (доступ ко всему)<br>
              • <code>admin</code> — Админ (Расписание, Пациенты, Касса)<br>
              • <code>doctor</code> — Врач (AI, Расписание, Пациенты)<br>
              • <code>assistant</code> — Ассистент (AI, Расписание, Пациенты)<br>
              • <code>patient</code> — Пациент (только «Моя медкарта»)
            </div>
          </form>
        </div>
      </div>
      <div class="auth-right"></div>
    </div>
  `;
}
