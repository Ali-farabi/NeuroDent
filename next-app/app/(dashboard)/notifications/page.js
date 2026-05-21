"use client";

import { useEffect, useState } from "react";
import { generateNotifications, getNotifications, markNotificationRead } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";

export default function NotificationsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    setItems(await getNotifications({ role: user?.role || "", unreadOnly: unreadOnly ? "true" : "" }));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, unreadOnly]);

  async function handleGenerate() {
    setMessage("");
    try {
      const created = await generateNotifications();
      await load();
      setMessage(`Создано уведомлений: ${created.length}`);
    } catch (error) {
      setMessage(error?.message || "Не удалось создать уведомления");
    }
  }

  async function toggle(item) {
    await markNotificationRead(item.id, !item.isRead);
    await load();
  }

  return (
    <section className="grid gap-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-2xl font-semibold text-slate-950">Уведомления</h1>
          <p className="mt-1 text-sm text-slate-500">Системные события и напоминания</p>
        </div>
        <div className="flex gap-2">
          <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm">
            <input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} />
            Только непрочитанные
          </label>
          {["owner", "admin"].includes(user?.role) && <button onClick={handleGenerate} className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white">Сгенерировать</button>}
        </div>
      </div>

      {message && <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">{message}</div>}

      <div className="grid gap-3">
        {items.map((item) => (
          <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${item.isRead ? "bg-slate-300" : "bg-blue-600"}`} />
                  <h2 className="m-0 text-base font-semibold text-slate-950">{item.title}</h2>
                </div>
                <p className="mt-2 text-sm text-slate-600">{item.body || "—"}</p>
                <div className="mt-2 text-xs text-slate-400">{item.type} · {item.role || "all"} · {item.createdAt}</div>
              </div>
              <button onClick={() => toggle(item)} className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold">
                {item.isRead ? "Сделать новым" : "Прочитано"}
              </button>
            </div>
          </article>
        ))}
        {!items.length && <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Уведомлений нет</div>}
      </div>
    </section>
  );
}
