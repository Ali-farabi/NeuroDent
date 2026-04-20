import { getState, setState } from "./core/state.js";
import { renderAuthPage } from "./features/auth/auth.view.js";
import { mountAuthPage } from "./features/auth/auth.controller.js";
import { mountSchedulePage } from "./features/schedule/schedule.controller.js";
import { mountPatientsPage } from "./features/patients/patients.controller.js";
import { mountVisitPage } from "./features/visits/visits.controller.js";
import { mountPaymentsPage } from "./features/payments/payments.controller.js";
import { mountReportPage } from "./features/report/report.controller.js";
import { mountUsersPage } from "./features/users/users.controller.js";

import { mountAiPage } from "./features/ai/ai.controller.js";

const app = document.getElementById("app");

function renderLayout() {
  app.innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="logo">
            <div class="logo-icon">
              <img
                src="./assets/images/Medimetricslogotype.png"
                alt="Neurodent logo"
                width="32"
                height="32"
              />
            </div>
            <span class="logo-text">Neurodent</span>
          </div>
          <div class="support-info">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <span>Поддержка: +7 771 163 2030</span>
          </div>
        </div>
        <nav class="menu" id="menu">
          <a href="#ai" class="menu-item" data-route="ai">
            <svg class="menu-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
            <span>Core AI Layer</span>
            <svg class="menu-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </a>
          <a href="#report" class="menu-item" data-route="report">
            <svg class="menu-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            <span>Business Analytics</span>
            <svg class="menu-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </a>
          <a href="#schedule" class="menu-item" data-route="schedule">
            <svg class="menu-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span>Call-центр и CRM</span>
            <svg class="menu-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </a>
          <a href="#payments" class="menu-item" data-route="payments">
            <svg class="menu-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
              <line x1="1" y1="10" x2="23" y2="10"/>
            </svg>
            <span>Финансы и Склад</span>
            <svg class="menu-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </a>
          <a href="#patients" class="menu-item" data-route="patients">
            <svg class="menu-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span>Пациентский модуль</span>
            <svg class="menu-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </a>
          <a href="#users" class="menu-item hidden" data-route="users">
            <svg class="menu-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span>Пользователи</span>
            <svg class="menu-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </a>
        </nav>
      </aside>
      <div class="sidebar-backdrop" id="sidebarBackdrop"></div>
      <div class="main">
        <header class="header">
          <div class="header-left">
            <button class="burger-btn" id="sidebarToggle" type="button" aria-label="Открыть меню">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <line x1="4" y1="6" x2="20" y2="6"></line>
                <line x1="4" y1="12" x2="20" y2="12"></line>
                <line x1="4" y1="18" x2="20" y2="18"></line>
              </svg>
            </button>
            <input id="globalSearch" type="text" placeholder="Поиск пациента..." />
          </div>
          <div class="header-right">
            <!-- Notifications (Admin/Owner) -->
            <div id="notificationsWrap" class="notifications-wrap" style="position: relative; margin-right: 16px; cursor: pointer; display: none;">
              <div style="font-size: 20px;">🔔</div>
              <span id="notifBadge" style="position: absolute; top: -4px; right: -6px; background: #ef4444; color: white; border-radius: 10px; padding: 2px 6px; font-size: 10px; font-weight: 700; border: 2px solid var(--surface);">3</span>
              
              <!-- Dropdown -->
              <div id="notifDropdown" style="display: none; position: absolute; top: 100%; right: -10px; width: 300px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-lg); z-index: 100; margin-top: 12px;">
                <div style="padding: 12px 16px; border-bottom: 1px solid var(--border); font-weight: 600; font-size: 14px; display: flex; justify-content: space-between;">
                  Автоматизация
                  <span style="color: var(--primary); font-size: 12px; font-weight: 500; cursor: pointer;">Очистить все</span>
                </div>
                <div style="max-height: 300px; overflow-y: auto;">
                  <div style="padding: 12px 16px; border-bottom: 1px solid var(--border); cursor: pointer; background: rgba(59, 130, 246, 0.05);">
                    <div style="font-size: 13px; font-weight: 600; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">🎂 День рождения</div>
                    <div style="font-size: 12px; color: var(--muted);">Сегодня у Аружан день рождения. Отправьте поздравительный шаблон с 10% скидкой.</div>
                  </div>
                  <div style="padding: 12px 16px; border-bottom: 1px solid var(--border); cursor: pointer;">
                    <div style="font-size: 13px; font-weight: 600; margin-bottom: 4px; display: flex; align-items: center; gap: 6px; color: #d97706;">⚠️ Нет подтверждения</div>
                    <div style="font-size: 12px; color: var(--muted);">3 пациента на завтра еще не подтвердили визит. Требуется прозвон.</div>
                  </div>
                  <div style="padding: 12px 16px; border-bottom: 1px solid var(--border); cursor: pointer;">
                    <div style="font-size: 13px; font-weight: 600; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">🦷 Реактивация</div>
                    <div style="font-size: 12px; color: var(--muted);">У пациента Ерлан прошел год после имплантации. Пора назначить профосмотр.</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="user" id="userBox">Гость</div>
            <button class="btn btn-secondary" id="logoutBtn" type="button">Выйти</button>
          </div>
        </header>
        <main class="content" id="page-content"></main>
      </div>
    </div>
  `;
}

function mountSidebarToggle() {
  const sidebar = document.querySelector(".sidebar");
  const toggleBtn = document.getElementById("sidebarToggle");
  const backdrop = document.getElementById("sidebarBackdrop");
  const menu = document.getElementById("menu");
  if (!sidebar || !toggleBtn || !backdrop) return;

  const close = () => {
    sidebar.classList.remove("open");
    backdrop.classList.remove("show");
  };

  const toggle = () => {
    const next = !sidebar.classList.contains("open");
    sidebar.classList.toggle("open", next);
    backdrop.classList.toggle("show", next);
  };

  toggleBtn.addEventListener("click", toggle);
  backdrop.addEventListener("click", close);
  menu?.addEventListener("click", (e) => {
    if (e.target.closest(".menu-item")) close();
  });
  if (!window.__sidebarEscBound) {
    window.__sidebarEscBound = true;
    window.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      document.querySelector(".sidebar")?.classList.remove("open");
      document.getElementById("sidebarBackdrop")?.classList.remove("show");
    });
  }
}

function setActiveMenu(route) {
  document
    .querySelectorAll(".menu-item")
    .forEach((a) => a.classList.toggle("active", a.dataset.route === route));
}

function setHeaderUser() {
  const { user } = getState();
  const userBox = document.getElementById("userBox");
  if (userBox) {
    const role = user?.role || "owner";
    userBox.textContent =
      role === "owner" ? "Владелец" :
      role === "doctor" ? "Врач" :
      role === "admin" ? "Админ" :
      role === "assistant" ? "Ассистент" :
      role === "patient" ? "Пациент" : "Гость";
  }
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.style.display = user ? "inline-flex" : "none";
}

function getAllowedRoutesByRole(role) {
  if (role === "admin") return new Set(["schedule", "patients", "payments"]);
  if (role === "doctor" || role === "assistant") return new Set(["ai", "patients", "visit", "schedule"]);
  if (role === "patient") return new Set(["patients"]);
  // owner: all + users
  return new Set(["ai", "report", "schedule", "payments", "patients", "visit", "users"]);
}

function applyRoleToMenu() {
  const { user } = getState();
  const menu = document.getElementById("menu");
  if (!menu) return;
  
  const role = user?.role || "owner";
  
  // Hide all first
  ["ai", "report", "schedule", "payments", "patients", "users"].forEach((r) =>
    menu.querySelector(`[data-route="${r}"]`)?.classList.add("hidden")
  );

  // Show based on role
  if (role === "owner") {
    ["ai", "report", "schedule", "payments", "patients", "users"].forEach((r) =>
      menu.querySelector(`[data-route="${r}"]`)?.classList.remove("hidden")
    );
  } else if (role === "admin") {
    ["schedule", "patients", "payments"].forEach((r) =>
      menu.querySelector(`[data-route="${r}"]`)?.classList.remove("hidden")
    );
  } else if (role === "doctor" || role === "assistant") {
    ["ai", "schedule", "patients"].forEach((r) =>
      menu.querySelector(`[data-route="${r}"]`)?.classList.remove("hidden")
    );
  } else if (role === "patient") {
    // Пациент үшін тек бір ғана мәзір қалады, атын "Моя медкарта" деп өзгертеміз
    const patMenu = menu.querySelector(`[data-route="patients"]`);
    if (patMenu) {
       patMenu.classList.remove("hidden");
       const textSpan = patMenu.querySelector("span");
       if (textSpan) textSpan.textContent = "Моя медкарта";
    }
  }
}

function mountGlobalSearch() {
  const input = document.getElementById("globalSearch");
  if (!input) return;
  let timer = null;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const q = input.value.trim();
      if (q.length >= 2)
        window.location.hash = `#patients?q=${encodeURIComponent(q)}`;
    }, 400);
  });
}

function getRouteFromHash() {
  return (window.location.hash || "#schedule").replace("#", "").split("?")[0];
}

function requireAuthAndRole(route) {
  const { user } = getState();
  const protectedRoutes = new Set([
    "ai",
    "schedule",
    "patients",
    "payments",
    "report",
    "visit",
    "users",
  ]);
  if (!user && protectedRoutes.has(route)) return "login";
  if (
    user &&
    route !== "login" &&
    !getAllowedRoutesByRole(user.role || "owner").has(route)
  ) {
    const role = user.role || "owner";
    return role === "owner" ? "report" : role === "admin" ? "schedule" : (role === "doctor" || role === "assistant") ? "ai" : "patients";
  }
  return route;
}

function renderLogin() {
  app.innerHTML = renderAuthPage();
  mountAuthPage({
    onSuccess: () => {
      window.location.hash = "#report";
    },
  });
}

function mountNotifications() {
  const wrap = document.getElementById("notificationsWrap");
  const dropdown = document.getElementById("notifDropdown");
  const badge = document.getElementById("notifBadge");
  const { user } = getState();

  if (!wrap) return;

  // Show only for owner or admin
  const role = user?.role || "owner";
  if (role === "owner" || role === "admin") {
    wrap.style.display = "block";
  } else {
    wrap.style.display = "none";
    return;
  }

  wrap.addEventListener("click", (e) => {
    if (e.target.closest("#notifDropdown") && !e.target.textContent.includes("Очистить все")) return;
    
    if (e.target.textContent === "Очистить все") {
      const list = dropdown.querySelector("div:nth-child(2)");
      if (list) list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--muted); font-size: 13px;">Нет новых уведомлений</div>';
      if (badge) badge.style.display = "none";
      return;
    }

    const isVisible = dropdown.style.display === "block";
    dropdown.style.display = isVisible ? "none" : "block";
  });

  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) {
      dropdown.style.display = "none";
    }
  });
}

function renderProtected(route) {
  renderLayout();
  setHeaderUser();
  applyRoleToMenu();
  setActiveMenu(route);

  // "Поиск пациента" только в Пациентском модуле (и не для роли Пациент)
  const globalSearchEl = document.getElementById("globalSearch");
  if (globalSearchEl) {
    const { user } = getState();
    const showSearch = route === "patients" && user?.role !== "patient";
    globalSearchEl.style.display = showSearch ? "block" : "none";
  }

  mountSidebarToggle();
  mountGlobalSearch();
  mountNotifications();

  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    setState({ user: null });
    window.location.hash = "#login";
  });
  
  if (route === "ai") return mountAiPage();
  if (route === "schedule") return mountSchedulePage();
  if (route === "patients") return mountPatientsPage();
  if (route === "visit") return mountVisitPage();
  if (route === "payments") return mountPaymentsPage();
  if (route === "report") return mountReportPage();
  if (route === "users") return mountUsersPage();
}

function renderRoute() {
  let route = getRouteFromHash();
  route = requireAuthAndRole(route);
  const allowed = new Set([
    "login",
    "ai",
    "schedule",
    "patients",
    "payments",
    "report",
    "visit",
    "users",
  ]);
  if (!allowed.has(route)) route = "report";
  if (route === "login") {
    if (window.location.hash !== "#login") window.location.hash = "#login";
    renderLogin();
    return;
  }
  renderProtected(route);
}

window.addEventListener("hashchange", renderRoute);
if (!window.location.hash) window.location.hash = "#login";
renderRoute();
