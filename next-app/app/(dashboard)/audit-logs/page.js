"use client";

import { useEffect, useState } from "react";
import { exportAuditLogsCsv, getAuditLogs } from "@/lib/api";

export default function AuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [filters, setFilters] = useState({ entityType: "", entityId: "", limit: "100" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      setLogs(await getAuditLogs(filters));
    } catch (error) {
      setLogs([]);
      setLoadError(error?.message || "Не удалось загрузить аудит");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleExport() {
    setMessage("");
    try {
      const csv = await exportAuditLogsCsv(filters);
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "audit-logs.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error?.message || "Не удалось экспортировать аудит");
    }
  }

  return (
    <section className="grid gap-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-2xl font-semibold text-slate-950">Аудит</h1>
          <p className="mt-1 text-sm text-slate-500">Журнал действий пользователей и системы</p>
        </div>
        <button onClick={handleExport} className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold">CSV</button>
      </div>

      <form onSubmit={(event) => { event.preventDefault(); load(); }} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-4">
        <input value={filters.entityType} onChange={(event) => setFilters((f) => ({ ...f, entityType: event.target.value }))} className="h-10 rounded-lg border border-slate-200 px-3 text-sm" placeholder="Тип объекта" />
        <input value={filters.entityId} onChange={(event) => setFilters((f) => ({ ...f, entityId: event.target.value }))} className="h-10 rounded-lg border border-slate-200 px-3 text-sm" placeholder="ID объекта" />
        <input type="number" value={filters.limit} onChange={(event) => setFilters((f) => ({ ...f, limit: event.target.value }))} className="h-10 rounded-lg border border-slate-200 px-3 text-sm" placeholder="Лимит" />
        <button className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white">Фильтр</button>
      </form>

      {message && <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">{message}</div>}
      {loadError && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div>}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="p-3">Время</th><th className="p-3">Пользователь</th><th className="p-3">Действие</th><th className="p-3">Объект</th><th className="p-3">Детали</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-6 text-center text-slate-500" colSpan="5">Загрузка аудита...</td></tr>
            ) : logs.map((log) => (
              <tr key={log.id} className="border-t border-slate-100">
                <td className="p-3">{log.createdAt}</td>
                <td className="p-3 font-mono text-xs">{log.actorUserId || "system"}</td>
                <td className="p-3">{log.action}</td>
                <td className="p-3">{log.entityType}:{log.entityId}</td>
                <td className="max-w-xl truncate p-3 font-mono text-xs">{JSON.stringify(log.details || {})}</td>
              </tr>
            ))}
            {!loading && !logs.length && (
              <tr><td className="p-6 text-center text-slate-500" colSpan="5">Записей аудита по текущим фильтрам нет</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
