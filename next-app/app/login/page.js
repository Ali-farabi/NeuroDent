"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { login } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";

export default function LoginPage() {
  const router = useRouter();
  const { saveUser } = useAuth();
  const [phone, setPhone] = useState("87001112233");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!phone || !password) {
      setError("Введите телефон и пароль");
      return;
    }
    setLoading(true);
    try {
      const user = await login(phone, password);
      saveUser(user);
      router.push("/report");
    } catch (err) {
      setError(err?.message || "Ошибка входа");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style>{`
        @media (max-width: 640px) {
          .auth-grid { grid-template-columns: 1fr !important; }
          .auth-right-panel { display: none !important; }
        }
      `}</style>
    <div
      className="auth-grid"
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "600px 1fr",
        background: "var(--bg)",
      }}>
      {/* Sol жақ — форма */}
      <div style={{
        background: "var(--surface)",
        display: "grid",
        placeItems: "center",
        padding: 28,
        position: "relative",
      }}>
        {/* Logo */}
        <div style={{ position: "absolute", left: 28, top: 22, display: "flex", alignItems: "center", gap: 8 }}>
          <Image src="/images/Medimetricslogotype.png" alt="NeuroDent" width={40} height={36} />
          <span style={{ fontSize: 22, fontWeight: 800, color: "var(--primary)" }}>Neurodent</span>
        </div>

        {/* Форма */}
        <div style={{ width: "min(400px, 100%)", padding: 22 }}>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Вход в систему</div>

          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6, fontSize: 12, color: "var(--muted)" }}>
              Телефон (любые 10 цифр)
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="8700..."
                required
                style={{
                  padding: "9px 12px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 14,
                  color: "var(--text)",
                  background: "var(--surface)",
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 6, fontSize: 12, color: "var(--muted)" }}>
              Пароль
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••"
                required
                style={{
                  padding: "9px 12px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 14,
                  color: "var(--text)",
                  background: "var(--surface)",
                }}
              />
            </label>

            {error && (
              <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 8,
                padding: "10px 0",
                background: loading ? "var(--primary-100)" : "var(--primary)",
                color: loading ? "var(--primary)" : "#fff",
                border: "none",
                borderRadius: "var(--radius-sm)",
                fontWeight: 600,
                fontSize: 14,
                cursor: loading ? "not-allowed" : "pointer",
                transition: "background 0.15s ease",
              }}
            >
              {loading ? "Входим..." : "Войти"}
            </button>

            <div style={{ marginTop: 8, color: "var(--muted)", fontSize: 12, lineHeight: 1.6 }}>
              <b>Демо-пароли для проверки ролей:</b><br />
              • <code>1234</code> — Владелец (доступ ко всему)<br />
              • <code>admin</code> — Админ (Расписание, Пациенты, Касса)<br />
              • <code>doctor</code> — Врач (AI, Расписание, Пациенты)<br />
              • <code>assistant</code> — Ассистент<br />
              • <code>patient</code> — Пациент (только «Моя медкарта»)
            </div>
          </form>
        </div>
      </div>

      {/* Оң жақ — фон сурет */}
      <div
        className="auth-right-panel"
        style={{
          backgroundImage: "url('/images/imgbag.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
    </div>
    </>
  );
}
