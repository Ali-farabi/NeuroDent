"use client";

import { useEffect, useState } from "react";
import { createDatabaseBackup, deleteDatabaseBackup, getDatabaseBackupDownloadUrl, getDatabaseBackups } from "@/lib/api";

function bytes(value) {
  const n = Number(value || 0);
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n > 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

export default function BackupsPage() {
  const [backups, setBackups] = useState([]);
  const [message, setMessage] = useState("");

  async function load() {
    setBackups(await getDatabaseBackups());
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function handleCreate() {
    setMessage("");
    try {
      const backup = await createDatabaseBackup();
      await load();
      setMessage(`Backup создан: ${backup.fileName}`);
    } catch (error) {
      setMessage(error?.message || "Не удалось создать backup");
    }
  }

  async function handleDelete(fileName) {
    setMessage("");
    try {
      await deleteDatabaseBackup(fileName);
      await load();
      setMessage("Backup удален");
    } catch (error) {
      setMessage(error?.message || "Не удалось удалить backup");
    }
  }

  return (
    <section className="grid gap-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-2xl font-semibold text-slate-950">Backups</h1>
          <p className="mt-1 text-sm text-slate-500">SQLite резервные копии</p>
        </div>
        <button onClick={handleCreate} className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white">Создать backup</button>
      </div>

      {message && <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">{message}</div>}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
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
                  <button onClick={() => handleDelete(backup.fileName)} className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold">Удалить</button>
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
