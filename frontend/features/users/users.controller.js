import { getUsers, createUser, updateUser } from "../../core/api.js";
import { renderUsersPage, renderUsersTable, renderUserForm } from "./users.view.js";

let searchTimer = null;
let lastList = [];

export function mountUsersPage() {
  const page = document.getElementById("page-content");
  if (!page) return;
  page.innerHTML = renderUsersPage();

  const searchInput = document.getElementById("usersSearch");
  const listWrap = document.getElementById("usersListWrap");
  const loadingEl = document.getElementById("usersLoading");
  const emptyEl = document.getElementById("usersEmpty");
  const listEl = document.getElementById("usersList");

  const closeUserModal = () => {
    const modal = document.getElementById("userFormModal");
    if (modal) modal.remove();
  };

  const openFormModal = (mode, user = null) => {
    closeUserModal();
    const html = renderUserForm({ mode, user });
    page.insertAdjacentHTML("beforeend", html);

    const modal = document.getElementById("userFormModal");
    const backdrop = document.getElementById("userFormBackdrop");
    const closeBtn = document.getElementById("userFormClose");
    const cancelBtn = document.getElementById("userFormCancel");
    const form = document.getElementById("userForm");

    const close = () => {
      closeUserModal();
    };

    backdrop?.addEventListener("click", close);
    closeBtn?.addEventListener("click", close);
    cancelBtn?.addEventListener("click", close);

    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const id = fd.get("id")?.trim() || null;
      const name = fd.get("name")?.trim() || "";
      const phone = (fd.get("phone") || "").replace(/\D/g, "");
      const email = (fd.get("email") || "").trim();
      const role = fd.get("role") || "admin";
      const isActive = form.querySelector('input[name="isActive"]')?.checked !== false;

      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Сохранение...";
      }

      try {
        if (id) {
          await updateUser(id, { name, phone, email, role, isActive });
        } else {
          await createUser({ name, phone, email, role });
        }
        close();
        loadUsers(searchInput?.value ?? "");
      } catch (err) {
        alert(err?.message || "Ошибка сохранения");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = id ? "Сохранить" : "Создать";
        }
      }
    });
  };

  const loadUsers = async (query = "") => {
    if (loadingEl) loadingEl.style.display = "block";
    if (emptyEl) emptyEl.style.display = "none";
    if (listEl) listEl.style.display = "none";

    try {
      const list = await getUsers(query);
      lastList = list;
      if (!listWrap) return;
      listWrap.innerHTML = renderUsersTable(list);

      const newLoading = listWrap.querySelector("#usersLoading");
      const newEmpty = listWrap.querySelector("#usersEmpty");
      const newList = listWrap.querySelector("#usersList");
      if (newLoading) newLoading.style.display = "none";
      if (newEmpty) newEmpty.style.display = list.length === 0 ? "block" : "none";
      if (newList) newList.style.display = list.length > 0 ? "flex" : "none";

      listWrap.querySelectorAll(".user-btn-edit").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.dataset.userId;
          const user = lastList.find((u) => u.id === id);
          if (user) openFormModal("edit", user);
        });
      });
    } catch (err) {
      if (loadingEl) loadingEl.style.display = "none";
      listWrap.innerHTML = `<div class="users-empty">Ошибка: ${err?.message || "Загрузка не удалась"}</div>`;
    }
  };

  loadUsers("");

  searchInput?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadUsers(searchInput.value), 250);
  });

  // Создать: делегация, чтобы кнопка гарантированно срабатывала
  page.addEventListener("click", (e) => {
    if (e.target.closest("#usersAddBtn")) {
      e.preventDefault();
      openFormModal("create");
    }
  });
}
