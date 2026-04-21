"use client";

import { useState, useEffect, useRef } from "react";
import { getUsers, createUser, updateUser } from "@/lib/api";

const ROLE_LABELS = {
  owner:     "Владелец",
  admin:     "Админ",
  doctor:    "Врач",
  assistant: "Ассистент",
};

const ROLE_COLORS = {
  owner:     { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
  admin:     { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
  doctor:    { bg: "#fdf4ff", color: "#7e22ce", border: "#e9d5ff" },
  assistant: { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
};

const inputStyle = {
  width: "100%", padding: "8px 12px",
  border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
  background: "var(--surface)", color: "var(--text)", fontSize: 13, boxSizing: "border-box",
};

const btnPrimary = {
  padding: "9px 18px", background: "var(--primary)", color: "#fff",
  border: "none", borderRadius: "var(--radius-sm)",
  fontWeight: 600, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
};

const btnOutline = {
  padding: "9px 18px", background: "var(--surface)", color: "var(--text)",
  border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
  fontWeight: 500, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
};

function Field({ label, children }) {
  return (
    <div style={{ display: "grid", gap: 5 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>{label}</div>
      {children}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function UserModal({ mode, user, onClose, onSaved }) {
  const isEdit = mode === "edit";
  const [form, setForm] = useState({
    name:     isEdit ? (user?.name     ?? "") : "",
    phone:    isEdit ? (user?.phone    ?? "") : "",
    email:    isEdit ? (user?.email    ?? "") : "",
    role:     isEdit ? (user?.role     ?? "admin") : "admin",
    isActive: isEdit ? (user?.isActive !== false) : true,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); setErr("");
    try {
      if (isEdit) {
        await updateUser(user.id, { name: form.name, phone: form.phone, email: form.email, role: form.role, isActive: form.isActive });
      } else {
        await createUser({ name: form.name, phone: form.phone, email: form.email, role: form.role });
      }
      onSaved();
      onClose();
    } catch (e) {
      setErr(e?.message || "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.35)" }} />
      <div style={{
        position: "relative", width: "min(440px, 94vw)",
        background: "var(--surface)", borderRadius: "var(--radius)",
        boxShadow: "var(--shadow-lg)", padding: 28,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
            {isEdit ? "Редактировать пользователя" : "Новый пользователь"}
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", background: "var(--surface-2)",
            cursor: "pointer", fontSize: 18, color: "var(--muted)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          <Field label="ФИО *">
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Иванов Иван Иванович" style={inputStyle} required minLength={2} />
          </Field>
          <Field label="Телефон *">
            <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="87001234567" style={inputStyle} required />
          </Field>
          <Field label="Email">
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="user@clinic.kz" style={inputStyle} />
          </Field>
          <Field label="Роль">
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={inputStyle}>
              <option value="owner">Владелец</option>
              <option value="admin">Админ</option>
              <option value="doctor">Врач</option>
              <option value="assistant">Ассистент</option>
            </select>
          </Field>
          {isEdit && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={form.isActive}
                onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
              Активен
            </label>
          )}
          {err && (
            <div style={{
              fontSize: 12, padding: "8px 12px", borderRadius: "var(--radius-sm)",
              background: "#fef2f2", color: "var(--danger)", border: "1px solid #fecaca",
            }}>{err}</div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ ...btnOutline, flex: 1 }}>Отмена</button>
            <button type="submit" disabled={saving} style={{ ...btnPrimary, flex: 1 }}>
              {saving ? "Сохранение..." : isEdit ? "Сохранить" : "Добавить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery]     = useState("");
  const [modal, setModal]     = useState(null);
  const searchTimer           = useRef(null);

  async function loadUsers(q = "") {
    setLoading(true);
    try { setUsers(await getUsers(q)); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadUsers(""); }, []);

  function handleSearch(e) {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => loadUsers(q), 250);
  }

  return (
    <div style={{ padding: 0, display: "grid", gap: 0 }}>

      {/* Toolbar */}
      <div style={{
        display: "flex", gap: 10, alignItems: "center",
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 0, padding: "12px 16px",
        borderBottom: "none",
      }}>
        <input
          type="text" value={query} onChange={handleSearch}
          placeholder="Поиск по имени, телефону, email..."
          style={{ ...inputStyle, flex: 1 }}
        />
        <button onClick={() => setModal({ mode: "create" })} style={btnPrimary}>
          + Создать
        </button>
      </div>

      {/* List */}
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 0, boxShadow: "var(--shadow-sm)", overflow: "hidden",
      }}>
        {loading ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            Загрузка...
          </div>
        ) : users.length === 0 ? (
          <div style={{ padding: "48px 0", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>👤</div>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>
              {query ? "Не найдено" : "Нет пользователей"}
            </div>
          </div>
        ) : users.map((u, i) => {
          const rc = ROLE_COLORS[u.role] || ROLE_COLORS.admin;
          return (
            <div key={u.id}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "14px 20px",
                borderBottom: i < users.length - 1 ? "1px solid var(--border)" : "none",
                transition: "background 0.1s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--hover)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              {/* Avatar */}
              <div style={{
                width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                background: rc.bg, color: rc.color,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 700, border: `1px solid ${rc.border}`,
              }}>
                {u.name?.[0] || "?"}
              </div>

              {/* Name + contacts */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{u.name}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }}>
                  {u.phone}{u.email ? ` · ${u.email}` : ""}
                </div>
              </div>

              {/* Role badge */}
              <span style={{
                fontSize: 12, padding: "3px 10px", borderRadius: 6, fontWeight: 500, flexShrink: 0,
                background: rc.bg, color: rc.color, border: `1px solid ${rc.border}`,
              }}>
                {ROLE_LABELS[u.role] || u.role}
              </span>

              {/* Status */}
              <span style={{
                fontSize: 12, fontWeight: 500, flexShrink: 0, minWidth: 72,
                color: u.isActive !== false ? "var(--success)" : "var(--muted)",
              }}>
                {u.isActive !== false ? "Активен" : "Неактивен"}
              </span>

              {/* Edit button */}
              <button
                onClick={() => setModal({ mode: "edit", user: u })}
                style={{
                  padding: "5px 14px", borderRadius: "var(--radius-sm)", flexShrink: 0,
                  border: "1px solid var(--border)", background: "var(--surface)",
                  color: "var(--text)", fontSize: 12, fontWeight: 500, cursor: "pointer",
                }}>
                Изменить
              </button>
            </div>
          );
        })}
      </div>

      {modal && (
        <UserModal
          mode={modal.mode}
          user={modal.user}
          onClose={() => setModal(null)}
          onSaved={() => loadUsers(query)}
        />
      )}
    </div>
  );
}
