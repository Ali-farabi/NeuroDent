"use client";

import { useEffect, useState } from "react";
import { createStockMovement, getInventoryItems, getStockMovements } from "@/lib/api";

export default function StockMovementsPage() {
  const [movements, setMovements] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ inventoryId: "", type: "in", quantity: "", reason: "" });

  async function load() {
    const [movementList, inventoryList] = await Promise.all([getStockMovements({ limit: 200 }), getInventoryItems()]);
    setMovements(movementList);
    setInventory(inventoryList);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function handleCreate(event) {
    event.preventDefault();
    setMessage("");
    try {
      await createStockMovement({ ...form, quantity: Number(form.quantity || 0) });
      setForm((current) => ({ ...current, quantity: "", reason: "" }));
      await load();
      setMessage("Движение склада создано");
    } catch (error) {
      setMessage(error?.message || "Не удалось создать движение склада");
    }
  }

  return (
    <section className="grid gap-6 p-6">
      <div>
        <h1 className="m-0 text-2xl font-semibold text-slate-950">Движение склада</h1>
        <p className="mt-1 text-sm text-slate-500">Приход, списание и корректировка остатков</p>
      </div>

      <form onSubmit={handleCreate} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-5">
        <select required value={form.inventoryId} onChange={(event) => setForm((f) => ({ ...f, inventoryId: event.target.value }))} className="h-10 rounded-lg border border-slate-200 px-3 text-sm md:col-span-2">
          <option value="">Материал</option>
          {inventory.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.quantity} {item.unit}</option>)}
        </select>
        <select value={form.type} onChange={(event) => setForm((f) => ({ ...f, type: event.target.value }))} className="h-10 rounded-lg border border-slate-200 px-3 text-sm">
          <option value="in">Приход</option>
          <option value="out">Списание</option>
          <option value="adjustment">Остаток</option>
        </select>
        <input required type="number" min="0" step="0.01" value={form.quantity} onChange={(event) => setForm((f) => ({ ...f, quantity: event.target.value }))} className="h-10 rounded-lg border border-slate-200 px-3 text-sm" placeholder="Количество" />
        <input value={form.reason} onChange={(event) => setForm((f) => ({ ...f, reason: event.target.value }))} className="h-10 rounded-lg border border-slate-200 px-3 text-sm" placeholder="Причина" />
        <button className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white md:col-span-5">Сохранить</button>
      </form>

      {message && <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">{message}</div>}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Дата</th><th className="p-3">Материал</th><th className="p-3">Тип</th><th className="p-3">Кол-во</th><th className="p-3">Баланс</th><th className="p-3">Причина</th></tr></thead>
          <tbody>
            {movements.map((movement) => (
              <tr key={movement.id} className="border-t border-slate-100">
                <td className="p-3">{movement.createdAt}</td>
                <td className="p-3">{movement.inventoryName || movement.inventoryId}</td>
                <td className="p-3">{movement.type}</td>
                <td className="p-3">{movement.quantity}</td>
                <td className="p-3">{movement.balanceAfter}</td>
                <td className="p-3">{movement.reason || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
