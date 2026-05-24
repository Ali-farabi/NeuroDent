"use client";

import { useEffect, useState } from "react";
import {
  cleanupSystemMaintenance,
  createDatabaseBackup,
  deleteDatabaseBackup,
  exportSystemData,
  getAdminIntegrations,
  getAdminSessions,
  getBackendCapabilities,
  getDatabaseBackupDownloadUrl,
  getDatabaseBackups,
  getSystemStatus,
  sendAdminTestEmail,
} from "@/lib/api";

function bytes(value) {
  const n = Number(value || 0);
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n > 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

const PROVIDER_LABELS = {
  email: "Почта",
  resend: "Resend",
  sms: "SMS",
  whatsapp: "WhatsApp",
  fileStorage: "Файловое webhook-хранилище",
  supabaseStorage: "Supabase Storage",
  fiscalization: "Фискализация",
  eSignature: "ЭЦП",
  ai: "ИИ webhook",
};

function integrationLabel(provider) {
  return PROVIDER_LABELS[provider] || provider;
}

function integrationStatus(item) {
  if (item.configured) {
    return {
      label: "Готово",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      note: item.url || item.mode || "Провайдер настроен",
    };
  }
  if (item.missingRequiredEnv?.length) {
    return {
      label: "Нужна настройка",
      className: "border-amber-200 bg-amber-50 text-amber-700",
      note: "Добавьте переменные окружения перед production",
    };
  }
  return {
    label: "Demo режим",
    className: "border-slate-200 bg-slate-50 text-slate-500",
    note: item.reason === "not_configured" ? "Провайдер не настроен, действие будет пропущено" : item.reason || item.mode || "Провайдер не настроен",
  };
}

export default function AdminSystemPage() {
  const [status, setStatus] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [capabilities, setCapabilities] = useState(null);
  const [integrations, setIntegrations] = useState([]);
  const [backups, setBackups] = useState([]);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  async function load() {
    setLoadError("");
    try {
      const [system, sessionList, capabilityInfo, integrationList, backupList] = await Promise.all([
        getSystemStatus(),
        getAdminSessions(100),
        getBackendCapabilities(),
        getAdminIntegrations(),
        getDatabaseBackups(),
      ]);
      setStatus(system);
      setSessions(sessionList);
      setCapabilities(capabilityInfo);
      setIntegrations(integrationList);
      setBackups(backupList);
    } catch (error) {
      setLoadError(error?.message || "Не удалось загрузить системные данные");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function handleCleanup() {
    setMessage("");
    try {
      const result = await cleanupSystemMaintenance({ backupRetentionDays: 30 });
      await load();
      setMessage(`Очистка завершена: сессии ${result.expiredSessionsDeleted || 0}, резервные копии ${result.backupsDeleted || 0}`);
    } catch (error) {
      setMessage(error?.message || "Не удалось выполнить очистку");
    }
  }

  async function handleExport() {
    setMessage("");
    try {
      const data = await exportSystemData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "neurodent-export.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error?.message || "Не удалось экспортировать JSON");
    }
  }

  async function handleCreateBackup() {
    setMessage("");
    try {
      const backup = await createDatabaseBackup();
      await load();
      setMessage(`Backup создан: ${backup.fileName}`);
    } catch (error) {
      setMessage(error?.message || "Не удалось создать backup");
    }
  }

  async function handleDeleteBackup(fileName) {
    setMessage("");
    try {
      await deleteDatabaseBackup(fileName);
      await load();
      setMessage("Backup удален");
    } catch (error) {
      setMessage(error?.message || "Не удалось удалить backup");
    }
  }

  async function handleEmailTest(event) {
    event.preventDefault();
    setMessage("");
    try {
      const result = await sendAdminTestEmail({ to: email, subject: "Тест интеграции NeuroDent", message: "Тест почтовой интеграции со страницы системы." });
      setMessage(`Тест почты: ${result.delivery?.provider || "неизвестно"} ${result.ok ? "успешно" : "пропущено"}`);
    } catch (error) {
      setMessage(error?.message || "Тест почты не выполнен");
    }
  }

  return (
    <section className="grid gap-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-2xl font-semibold text-slate-950">Система</h1>
          <p className="mt-1 text-sm text-slate-500">Статус backend, storage и активные сессии</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold">Экспорт JSON</button>
          <button onClick={handleCleanup} className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white">Очистить</button>
        </div>
      </div>

      {message && <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">{message}</div>}
      {loadError && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div>}
      {loading && <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">Загрузка системных данных...</div>}

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs font-semibold uppercase text-slate-500">Сервис</div><div className="mt-2 text-lg font-bold">{status?.service || "—"}</div></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs font-semibold uppercase text-slate-500">Хранилище</div><div className="mt-2 text-lg font-bold">{status?.storage?.driver || "—"}</div></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs font-semibold uppercase text-slate-500">Размер базы</div><div className="mt-2 text-lg font-bold">{bytes(status?.storage?.size)}</div></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs font-semibold uppercase text-slate-500">Сессии</div><div className="mt-2 text-lg font-bold">{sessions.length}</div></div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-lg font-semibold text-slate-950">Возможности и документация API</h2>
            <p className="mt-1 text-sm text-slate-500">Публичные серверные endpoint-ы подключены в системной панели</p>
          </div>
          <div className="flex gap-2">
            <a href="/api/docs" target="_blank" className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold">Документация API</a>
            <a href="/api/openapi.json" target="_blank" className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold">Схема API</a>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs uppercase text-slate-500">Режим ИИ</div><div className="mt-1 font-semibold">{capabilities?.ai?.mode || "—"}</div></div>
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs uppercase text-slate-500">Драйвер хранилища</div><div className="mt-1 font-semibold">{capabilities?.storage?.activeDriver || "—"}</div></div>
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs uppercase text-slate-500">PostgreSQL готов</div><div className="mt-1 font-semibold">{capabilities?.storage?.postgresPrepared ? "да" : "нет"}</div></div>
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs uppercase text-slate-500">Модули</div><div className="mt-1 font-semibold">{capabilities?.modules?.length || 0}</div></div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {Object.entries(status?.counts || {}).map(([key, value]) => (
          <div key={key} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase text-slate-500">{key}</div>
            <div className="mt-2 text-2xl font-bold">{value}</div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-4">
          <h2 className="m-0 text-lg font-semibold text-slate-950">Активные сессии</h2>
        </div>
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Пользователь</th><th className="p-3">Создана</th><th className="p-3">Истекает</th></tr></thead>
          <tbody>
            {sessions.map((session, index) => (
              <tr key={session.token || `${session.subjectType}-${session.subjectId}-${session.createdAt}-${index}`} className="border-t border-slate-100">
                <td className="p-3">{session.subjectType}:{session.subjectId}</td>
                <td className="p-3">{session.createdAt}</td>
                <td className="p-3">{session.expiresAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-lg font-semibold text-slate-950">Интеграции</h2>
            <p className="mt-1 text-sm text-slate-500">Почта, SMS, WhatsApp, хранилище, фискализация, ЭЦП и ИИ</p>
          </div>
          <form onSubmit={handleEmailTest} className="flex gap-2">
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm" placeholder="test@example.com" required />
            <button className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold">Проверить почту</button>
          </form>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {integrations.map((item) => {
            const status = integrationStatus(item);
            return (
            <div key={item.provider} className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-950">{integrationLabel(item.provider)}</div>
                  <div className="mt-0.5 text-xs text-slate-400">{item.provider}</div>
                </div>
                <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${status.className}`}>
                  {status.label}
                </span>
              </div>
              <div className="mt-2 text-xs text-slate-500">{status.note}</div>
              {item.missingRequiredEnv?.length > 0 && (
                <div className="mt-3 rounded-md bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-700">
                  Не хватает: {item.missingRequiredEnv.join(", ")}
                </div>
              )}
              {item.requiredEnv?.length > 0 && (
                <div className="mt-2 text-[11px] text-slate-400">
                  Нужно: {item.requiredEnv.map((env) => env.name).join(", ")}
                </div>
              )}
            </div>
          );})}
          {!loading && !loadError && integrations.length === 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500 md:col-span-3">
              Интеграции не найдены
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div>
            <h2 className="m-0 text-lg font-semibold text-slate-950">Резервные копии</h2>
            <p className="mt-1 text-sm text-slate-500">SQLite резервные копии внутри системного раздела</p>
          </div>
          <button onClick={handleCreateBackup} className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white">Создать backup</button>
        </div>
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Файл</th><th className="p-3">Размер</th><th className="p-3">Создан</th><th className="p-3">Действия</th></tr></thead>
          <tbody>
            {backups.map((backup) => (
              <tr key={backup.fileName} className="border-t border-slate-100">
                <td className="p-3 font-mono text-xs">{backup.fileName}</td>
                <td className="p-3">{bytes(backup.size)}</td>
                <td className="p-3">{backup.createdAt}</td>
                <td className="flex gap-2 p-3">
                  <a href={getDatabaseBackupDownloadUrl(backup.fileName)} className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold">Скачать</a>
                  <button onClick={() => handleDeleteBackup(backup.fileName)} className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold">Удалить</button>
                </td>
              </tr>
            ))}
            {!backups.length && <tr><td className="p-6 text-center text-slate-500" colSpan="4">Backup-ов нет</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
