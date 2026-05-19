"use client";

import { useEffect, useState } from "react";
import { getAdminIntegrations, sendAdminTestEmail } from "@/lib/api";

export default function IntegrationsPage() {
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");

  async function load() {
    setItems(await getAdminIntegrations());
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function handleEmailTest(event) {
    event.preventDefault();
    setMessage("");
    try {
      const result = await sendAdminTestEmail({ to: email, subject: "NeuroDent integration test", message: "Email integration test from NeuroDent admin UI." });
      setMessage(`Email test: ${result.delivery?.provider || "unknown"} ${result.ok ? "ok" : "skipped"}`);
    } catch (error) {
      setMessage(error?.message || "Email test failed");
    }
  }

  return (
    <section className="grid gap-6 p-6">
      <div>
        <h1 className="m-0 text-2xl font-semibold text-slate-950">Интеграции</h1>
        <p className="mt-1 text-sm text-slate-500">Email, SMS, WhatsApp, file storage, fiscalization, E-sign и AI adapters</p>
      </div>

      <form onSubmit={handleEmailTest} className="flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="h-10 min-w-[280px] rounded-lg border border-slate-200 px-3 text-sm" placeholder="test@example.com" />
        <button className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white">Test email</button>
      </form>

      {message && <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">{message}</div>}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <article key={item.provider} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="m-0 text-base font-semibold text-slate-950">{item.provider}</h2>
              <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${item.configured ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                {item.configured ? "configured" : "skipped"}
              </span>
            </div>
            <div className="mt-3 text-sm text-slate-500">{item.url || item.mode || item.reason || "No provider configured"}</div>
          </article>
        ))}
      </div>
    </section>
  );
}
