"use client";

import { useEffect, useState } from "react";
import { cleanupSystemMaintenance, exportSystemData, getAdminSessions, getSystemStatus } from "@/lib/api";

function bytes(value) {
  const n = Number(value || 0);
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n > 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

export default function AdminSystemPage() {
  const [status, setStatus] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [message, setMessage] = useState("");

  async function load() {
    const [system, sessionList] = await Promise.all([getSystemStatus(), getAdminSessions(100)]);
    setStatus(system);
    setSessions(sessionList);
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
      setMessage(`Cleanup complete: sessions ${result.expiredSessionsDeleted || 0}, backups ${result.backupsDeleted || 0}`);
    } catch (error) {
      setMessage(error?.message || "Cleanup failed");
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
      setMessage(error?.message || "Export failed");
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
          <button onClick={handleExport} className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold">Export JSON</button>
          <button onClick={handleCleanup} className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white">Cleanup</button>
        </div>
      </div>

      {message && <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">{message}</div>}

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs font-semibold uppercase text-slate-500">Service</div><div className="mt-2 text-lg font-bold">{status?.service || "—"}</div></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs font-semibold uppercase text-slate-500">Storage</div><div className="mt-2 text-lg font-bold">{status?.storage?.driver || "—"}</div></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs font-semibold uppercase text-slate-500">DB size</div><div className="mt-2 text-lg font-bold">{bytes(status?.storage?.size)}</div></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs font-semibold uppercase text-slate-500">Sessions</div><div className="mt-2 text-lg font-bold">{sessions.length}</div></div>
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
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Subject</th><th className="p-3">Created</th><th className="p-3">Expires</th></tr></thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.token} className="border-t border-slate-100">
                <td className="p-3">{session.subjectType}:{session.subjectId}</td>
                <td className="p-3">{session.createdAt}</td>
                <td className="p-3">{session.expiresAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
