"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { login, requestPasswordReset, resetPassword } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";

export default function LoginPage() {
  const router = useRouter();
  const { saveUser } = useAuth();
  const [mode, setMode] = useState("login");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setMessage("");

    if (!phone || !password) {
      setMessage("Введите телефон и пароль");
      return;
    }

    setLoading(true);
    try {
      const user = await login(phone, password);
      saveUser(user);
      router.push(user.role === "owner" ? "/report" : user.role === "patient" ? "/patients" : "/schedule");
    } catch (err) {
      setMessage(err?.message || "Ошибка входа");
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestReset(e) {
    e.preventDefault();
    setMessage("");

    if (!phone) {
      setMessage("Введите телефон");
      return;
    }

    setLoading(true);
    try {
      const result = await requestPasswordReset(phone);
      setResetToken(result?.resetToken || "");
      setMode("reset");
      setMessage(result?.resetToken ? "Код получен. Проверьте поле кода." : "Код отправлен");
    } catch (err) {
      setMessage(err?.message || "Не удалось отправить код");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    setMessage("");

    if (!resetToken || !nextPassword) {
      setMessage("Введите код и новый пароль");
      return;
    }

    setLoading(true);
    try {
      await resetPassword(resetToken, nextPassword);
      setPassword("");
      setNextPassword("");
      setResetToken("");
      setMode("login");
      setMessage("Пароль обновлен. Войдите с новым паролем.");
    } catch (err) {
      setMessage(err?.message || "Не удалось обновить пароль");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <style>{`
        .auth-shell {
          min-height: 100vh;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 24px;
          overflow: hidden;
          background-color: #d9dcd8;
        }

        .auth-shell::before {
          content: "";
          position: absolute;
          inset: -50vh 0;
          width: 100vw;
          background-image: url('/images/backround.png');
          background-size: 100vw auto;
          background-position: center 76%;
          background-repeat: no-repeat;
        }

        .auth-shell::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .auth-brand {
          position: absolute;
          top: 28px;
          left: 42px;
          display: inline-flex;
          align-items: center;
          gap: 12px;
          color: #2563eb;
          font-size: 26px;
          font-weight: 800;
          letter-spacing: 0;
          z-index: 2;
        }

        .auth-card {
          width: min(100%, 445px);
          padding: 38px 50px 36px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.97);
          box-shadow: 0 18px 50px rgba(15, 23, 42, 0.1);
          z-index: 1;
        }

        .auth-title {
          margin: 0;
          color: #030712;
          font-size: 28px;
          line-height: 1.12;
          font-weight: 800;
          text-align: center;
          letter-spacing: 0;
        }

        .auth-title span,
        .auth-link {
          color: #2563eb;
        }

        .auth-subtitle {
          margin: 14px 0 20px;
          color: #7a7f87;
          font-size: 12px;
          text-align: center;
        }

        .auth-link {
          border: 0;
          padding: 0;
          background: transparent;
          cursor: pointer;
          font-weight: 500;
        }

        .auth-form {
          display: grid;
          gap: 10px;
        }

        .auth-input {
          width: 100%;
          height: 38px;
          padding: 0 12px;
          border: 1px solid #d1d5db;
          border-radius: 7px;
          background: #fbfbfc;
          color: #111827;
          font-size: 12px;
          outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
        }

        .auth-input::placeholder {
          color: #b8bec7;
        }

        .auth-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.14);
          background: #fff;
        }

        .auth-row {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          color: #111827;
          font-size: 10px;
          line-height: 1.35;
        }

        .auth-row input {
          width: 16px;
          height: 16px;
          margin: 1px 0 0;
          accent-color: #2563eb;
        }

        .auth-submit {
          height: 38px;
          margin-top: 10px;
          border: 0;
          border-radius: 7px;
          background: #2563eb;
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s ease, opacity 0.15s ease;
        }

        .auth-submit:hover {
          background: #1d4ed8;
        }

        .auth-submit:disabled {
          cursor: not-allowed;
          opacity: 0.72;
        }

        .auth-message {
          min-height: 0;
          color: #dc2626;
          font-size: 11px;
          text-align: center;
        }

        .auth-google {
          height: 34px;
          border: 1px solid #9ca3af;
          border-radius: 5px;
          background: #fff;
          color: #1f2937;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
        }

        .auth-demo {
          display: none;
          margin: 10px 0 0;
          color: #6b7280;
          font-size: 12px;
          line-height: 1.55;
          text-align: center;
        }

        .auth-demo code {
          color: #111827;
          font-weight: 700;
        }

        @media (max-width: 760px) {
          .auth-shell {
            padding: 96px 18px 28px;
          }

          .auth-shell::before {
            width: 100vw;
            background-size: auto 120vh;
            background-position: 42% center;
          }

          .auth-shell::after {
            display: block;
          }

          .auth-brand {
            left: 20px;
            top: 20px;
            font-size: 22px;
          }

          .auth-card {
            padding: 34px 24px;
            border-radius: 18px;
          }

          .auth-title {
            font-size: 25px;
          }

          .auth-subtitle {
            font-size: 15px;
          }
        }
      `}</style>

      <div className="auth-brand" aria-label="NeuroDent">
        <Image
          src="/images/Medimetricslogotype.png"
          alt=""
          width={44}
          height={40}
          priority
          style={{ width: 44, height: "auto" }}
        />
        <span>Neurodent</span>
      </div>

      <section className="auth-card" aria-label="Вход в Neurodent">
        <h1 className="auth-title">
          {mode === "login" ? "Войдите в " : "Восстановление "}
          <span>Neurodent</span>
        </h1>

        <p className="auth-subtitle">
          {mode === "login"
            ? "Доступ только для сотрудников и пациентов клиники"
            : "Введите телефон, код подтверждения и новый пароль"}
        </p>

        {mode === "login" && (
          <form className="auth-form" onSubmit={handleLogin} noValidate>
            <input
              className="auth-input"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Номер телефона *"
              autoComplete="tel"
            />

            <input
              className="auth-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Пароль (+8 символов)"
              autoComplete="current-password"
            />

            <button
              className="auth-link"
              type="button"
              style={{ justifySelf: "start", fontSize: 12 }}
              onClick={() => {
                setMode("forgot");
                setMessage("");
              }}
            >
              Забыли пароль?
            </button>

            <div className="auth-message" role="status" aria-live="polite">{message}</div>

            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? "Входим..." : "Войти"}
            </button>
          </form>
        )}

        {mode === "forgot" && (
          <form className="auth-form" onSubmit={handleRequestReset} noValidate>
            <input
              className="auth-input"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Номер телефона *"
              autoComplete="tel"
            />

            <button
              className="auth-link"
              type="button"
              style={{ justifySelf: "start", fontSize: 12 }}
              onClick={() => {
                setMode("login");
                setMessage("");
              }}
            >
              Вернуться ко входу
            </button>

            <div className="auth-message" role="status" aria-live="polite">{message}</div>

            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? "Отправляем..." : "Отправить код"}
            </button>
          </form>
        )}

        {mode === "reset" && (
          <form className="auth-form" onSubmit={handleResetPassword} noValidate>
            <input
              className="auth-input"
              type="text"
              value={resetToken}
              onChange={(e) => setResetToken(e.target.value)}
              placeholder="Код подтверждения"
              autoComplete="one-time-code"
            />

            <input
              className="auth-input"
              type="password"
              value={nextPassword}
              onChange={(e) => setNextPassword(e.target.value)}
              placeholder="Новый пароль"
              autoComplete="new-password"
            />

            <button
              className="auth-link"
              type="button"
              style={{ justifySelf: "start", fontSize: 12 }}
              onClick={() => {
                setMode("forgot");
                setMessage("");
              }}
            >
              Отправить код повторно
            </button>

            <div className="auth-message" role="status" aria-live="polite">{message}</div>

            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? "Сохраняем..." : "Сменить пароль"}
            </button>
          </form>
        )}

        <p className="auth-demo">
          Demo password: <code>1234</code>, <code>admin</code>, <code>doctor</code>, <code>patient</code>
        </p>
      </section>
    </main>
  );
}
