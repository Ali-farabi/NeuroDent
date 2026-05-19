"use client";

import { useEffect, useMemo, useState } from "react";
import { createInvoice, getInvoices, payInvoice, searchPatients, sendInvoiceEmail } from "@/lib/api";

const money = (value) => `${Number(value || 0).toLocaleString("ru-RU")} ₸`;

function StatusBadge({ status }) {
  const meta = {
    paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
    partial: "bg-amber-50 text-amber-700 border-amber-200",
    open: "bg-slate-50 text-slate-700 border-slate-200",
  }[status] || "bg-slate-50 text-slate-700 border-slate-200";
  return <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${meta}`}>{status}</span>;
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [patients, setPatients] = useState([]);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ patientId: "", name: "Консультация", quantity: "1", unitPrice: "10000", discount: "0" });

  async function load() {
    setLoading(true);
    try {
      const [invoiceList, patientList] = await Promise.all([getInvoices({ status }), searchPatients("")]);
      setInvoices(invoiceList);
      setPatients(patientList);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const totals = useMemo(() => invoices.reduce((acc, invoice) => {
    acc.total += Number(invoice.total || 0);
    acc.paid += Number(invoice.paid || 0);
    return acc;
  }, { total: 0, paid: 0 }), [invoices]);

  async function handleCreate(event) {
    event.preventDefault();
    setMessage("");
    try {
      await createInvoice({
        patientId: form.patientId,
        discount: Number(form.discount || 0),
        items: [{ name: form.name, quantity: Number(form.quantity || 1), unitPrice: Number(form.unitPrice || 0) }],
      });
      setForm((current) => ({ ...current, name: "Консультация", quantity: "1", unitPrice: "10000", discount: "0" }));
      await load();
      setMessage("Счет создан");
    } catch (error) {
      setMessage(error?.message || "Не удалось создать счет");
    }
  }

  async function handlePay(invoice) {
    const remaining = Math.max(0, Number(invoice.total || 0) - Number(invoice.paid || 0));
    if (!remaining) return;
    setMessage("");
    try {
      await payInvoice(invoice.id, { amount: remaining, method: "cash" });
      await load();
      setMessage("Оплата проведена");
    } catch (error) {
      setMessage(error?.message || "Не удалось провести оплату");
    }
  }

  async function handleSend(invoice) {
    setMessage("");
    try {
      await sendInvoiceEmail(invoice.id, { message: "Ваш счет NeuroDent готов к оплате." });
      setMessage("Счет отправлен");
    } catch (error) {
      setMessage(error?.message || "Не удалось отправить счет");
    }
  }

  return (
    <section className="grid gap-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-2xl font-semibold text-slate-950">Счета</h1>
          <p className="mt-1 text-sm text-slate-500">Счета, оплаты и отправка пациентам</p>
        </div>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm">
          <option value="">Все статусы</option>
          <option value="open">open</option>
          <option value="partial">partial</option>
          <option value="paid">paid</option>
        </select>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs font-semibold uppercase text-slate-500">Счетов</div><div className="mt-2 text-2xl font-bold">{invoices.length}</div></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs font-semibold uppercase text-slate-500">Сумма</div><div className="mt-2 text-2xl font-bold">{money(totals.total)}</div></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs font-semibold uppercase text-slate-500">Оплачено</div><div className="mt-2 text-2xl font-bold">{money(totals.paid)}</div></div>
      </div>

      <form onSubmit={handleCreate} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-6">
        <select required value={form.patientId} onChange={(event) => setForm((f) => ({ ...f, patientId: event.target.value }))} className="h-10 rounded-lg border border-slate-200 px-3 text-sm md:col-span-2">
          <option value="">Пациент</option>
          {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}
        </select>
        <input value={form.name} onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))} className="h-10 rounded-lg border border-slate-200 px-3 text-sm md:col-span-2" placeholder="Услуга" />
        <input type="number" min="1" value={form.quantity} onChange={(event) => setForm((f) => ({ ...f, quantity: event.target.value }))} className="h-10 rounded-lg border border-slate-200 px-3 text-sm" placeholder="Кол-во" />
        <input type="number" min="0" value={form.unitPrice} onChange={(event) => setForm((f) => ({ ...f, unitPrice: event.target.value }))} className="h-10 rounded-lg border border-slate-200 px-3 text-sm" placeholder="Цена" />
        <button className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white md:col-span-6">Создать счет</button>
      </form>

      {message && <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">{message}</div>}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="p-3">ID</th><th className="p-3">Пациент</th><th className="p-3">Дата</th><th className="p-3">Статус</th><th className="p-3">Сумма</th><th className="p-3">Оплачено</th><th className="p-3">Действия</th></tr>
          </thead>
          <tbody>
            {loading ? <tr><td className="p-4" colSpan="7">Загрузка...</td></tr> : invoices.map((invoice) => (
              <tr key={invoice.id} className="border-t border-slate-100">
                <td className="p-3 font-mono text-xs">{invoice.id}</td>
                <td className="p-3">{invoice.patientName || invoice.patientId}</td>
                <td className="p-3">{invoice.date}</td>
                <td className="p-3"><StatusBadge status={invoice.status} /></td>
                <td className="p-3 font-semibold">{money(invoice.total)}</td>
                <td className="p-3">{money(invoice.paid)}</td>
                <td className="flex gap-2 p-3">
                  <button onClick={() => handlePay(invoice)} className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold" type="button">Оплатить</button>
                  <button onClick={() => handleSend(invoice)} className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold" type="button">Email</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
