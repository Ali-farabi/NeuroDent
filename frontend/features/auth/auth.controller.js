import { login } from "../../core/api.js";
import { setState } from "../../core/state.js";

export function mountAuthPage({ onSuccess }) {
  const form = document.getElementById("loginForm");
  const btn = document.getElementById("loginBtn");
  const errorBox = document.getElementById("loginError");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.textContent = "";
    const fd = new FormData(form);
    const phone = fd.get("phone");
    const password = fd.get("password");
    if (!phone || !password) {
      errorBox.textContent = "Введите телефон и пароль";
      return;
    }
    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = "Входим...";
    try {
      const user = await login(phone, password);
      setState({ user });
      onSuccess?.(user);
    } catch (err) {
      errorBox.textContent = err?.message || "Ошибка входа";
    } finally {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  });
}
