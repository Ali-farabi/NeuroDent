"use client";

import { useEffect, useState } from "react";
import { createPriceItem, getPriceItems, setPriceItemActive, updatePriceItem } from "@/lib/api";

export default function PriceItemsPage() {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ code: "", name: "", category: "", price: "" });

  async function load() {
    setItems(await getPriceItems(query));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(event) {
    event.preventDefault();
    setMessage("");
    try {
      await createPriceItem({ ...form, price: Number(form.price || 0) });
      setForm({ code: "", name: "", category: "", price: "" });
      await load();
      setMessage("Позиция добавлена");
    } catch (error) {
      setMessage(error?.message || "Не удалось сохранить позицию");
    }
  }

  async function quickUpdate(item, patch) {
    setMessage("");
    try {
      await updatePriceItem(item.id, patch);
      await load();
    } catch (error) {
      setMessage(error?.message || "Не удалось обновить позицию");
    }
  }

  async function toggle(item) {
    setMessage("");
    try {
      await setPriceItemActive(item.id, !item.isActive);
      await load();
    } catch (error) {
      setMessage(error?.message || "Не удалось изменить статус");
    }
  }

  return (
    <section className="grid gap-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-2xl font-semibold text-slate-950">Прайс-лист</h1>
          <p className="mt-1 text-sm text-slate-500">Услуги и цены для счетов</p>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); load(); }} className="flex gap-2">
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm" placeholder="Поиск" />
          <button className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold">Найти</button>
        </form>
      </div>

      <form onSubmit={handleCreate} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-5">
        <input required value={form.code} onChange={(event) => setForm((f) => ({ ...f, code: event.target.value }))} className="h-10 rounded-lg border border-slate-200 px-3 text-sm" placeholder="Код" />
        <input required value={form.name} onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))} className="h-10 rounded-lg border border-slate-200 px-3 text-sm md:col-span-2" placeholder="Название" />
        <input value={form.category} onChange={(event) => setForm((f) => ({ ...f, category: event.target.value }))} className="h-10 rounded-lg border border-slate-200 px-3 text-sm" placeholder="Категория" />
        <input required type="number" min="0" value={form.price} onChange={(event) => setForm((f) => ({ ...f, price: event.target.value }))} className="h-10 rounded-lg border border-slate-200 px-3 text-sm" placeholder="Цена" />
        <button className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white md:col-span-5">Добавить</button>
      </form>

      {message && <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">{message}</div>}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="p-3">Код</th><th className="p-3">Название</th><th className="p-3">Категория</th><th className="p-3">Цена</th><th className="p-3">Статус</th><th className="p-3">Действия</th></tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="p-3 font-mono text-xs">{item.code}</td>
                <td className="p-3"><input defaultValue={item.name} onBlur={(event) => event.target.value !== item.name && quickUpdate(item, { name: event.target.value })} className="w-full rounded border border-transparent px-2 py-1 text-sm hover:border-slate-200" /></td>
                <td className="p-3">{item.category || "—"}</td>
                <td className="p-3"><input type="number" defaultValue={item.price} onBlur={(event) => Number(event.target.value) !== Number(item.price) && quickUpdate(item, { price: Number(event.target.value) })} className="w-28 rounded border border-transparent px-2 py-1 text-sm hover:border-slate-200" /></td>
                <td className="p-3">{item.isActive ? "active" : "inactive"}</td>
                <td className="p-3"><button onClick={() => toggle(item)} type="button" className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold">{item.isActive ? "Отключить" : "Включить"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
