"use client";

import { useState, useEffect } from "react";
import {
  getPaymentsByDate,
  createPayment,
  getInventoryItems,
  addInventoryItem,
  updateInventoryQuantity,
  searchPatients,
  getDoctors,
} from "@/lib/api";
import { Inbox, Banknote, CreditCard, AlertTriangle, Package, Search, PartyPopper, Phone, X, Check } from "lucide-react";

const TODAY = new Date().toISOString().slice(0, 10);

function fmt(n) {
  return Number(n || 0).toLocaleString("ru-RU") + " ₸";
}

// ── Summary card with icon ────────────────────────────────────────────────────
function StatCard({ label, value, icon, accent }) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "var(--radius)", padding: "18px 20px",
      flex: 1, minWidth: 140, display: "flex", alignItems: "center", gap: 14,
      boxShadow: "var(--shadow-sm)",
      borderLeft: `3px solid ${accent || "var(--border)"}`,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: accent ? `${accent}18` : "var(--surface-2)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: accent || "var(--muted)",
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.3px" }}>{value}</div>
      </div>
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function Badge({ children, color, bg, border }) {
  return (
    <span style={{
      fontSize: 11, padding: "2px 9px", borderRadius: 6, fontWeight: 500,
      background: bg, color: color, border: `1px solid ${border}`,
      display: "inline-block",
    }}>
      {children}
    </span>
  );
}

// ── КАССА ─────────────────────────────────────────────────────────────────────
function KassaTab() {
  const [date, setDate] = useState(TODAY);
  const [payments, setPayments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [form, setForm] = useState({ patientId: "", doctorId: "", amount: "", method: "cash", note: "" });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    Promise.all([searchPatients(""), getDoctors()]).then(([p, d]) => { setPatients(p); setDoctors(d); });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line
    setLoading(true);
    getPaymentsByDate(date).then(setPayments).finally(() => setLoading(false));
  }, [date]);

  const totalCash = payments.filter(p => p.method === "cash").reduce((s, p) => s + p.amount, 0);
  const totalCard = payments.filter(p => p.method === "card").reduce((s, p) => s + p.amount, 0);

  async function handleAdd(e) {
    e.preventDefault();
    setSaving(true); setMsg("");
    try {
      await createPayment({ patientId: form.patientId, doctorId: form.doctorId || null, amount: Number(form.amount), method: form.method, note: form.note, date });
      setMsg("✓ Оплата сохранена");
      setForm({ patientId: "", doctorId: "", amount: "", method: "cash", note: "" });
      setPayments(await getPaymentsByDate(date));
      setTimeout(() => setMsg(""), 3000);
    } catch (err) {
      setMsg(err?.message || "Ошибка");
    } finally { setSaving(false); }
  }

  function printReceipt(p) {
    const w = window.open("", "_blank", "width=400,height=500");
    w.document.write(`
      <html><head><title>Чек</title><style>
        body { font-family: monospace; padding: 24px; font-size: 13px; }
        h2 { text-align: center; margin-bottom: 4px; }
        p { margin: 4px 0; }
        .sep { border-top: 1px dashed #000; margin: 10px 0; }
        .big { font-size: 18px; font-weight: bold; }
      </style></head><body>
        <h2>NeuroDent</h2>
        <p style="text-align:center;color:#555">Стоматологическая клиника</p>
        <div class="sep"></div>
        <p>Пациент: <b>${p.patientName || "—"}</b></p>
        <p>Дата: ${p.date} ${p.time || ""}</p>
        <p>Оплата: ${p.method === "cash" ? "Наличные" : "Карта"}</p>
        ${p.note ? `<p>Примечание: ${p.note}</p>` : ""}
        <div class="sep"></div>
        <p class="big">Сумма: ${fmt(p.amount)}</p>
        <div class="sep"></div>
        <p style="text-align:center;font-size:11px">Спасибо! +7 771 163 2030</p>
      </body></html>
    `);
    w.document.close();
    w.print();
  }

  const methodLabel = { cash: "Наличные", card: "Карта" };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="pay-stats">
        <div className="pay-stat-card">
          <StatCard label="Дневная выручка" value={fmt(totalCash + totalCard)} accent="#2563eb"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>} />
        </div>
        <div className="pay-stat-card">
          <StatCard label="Наличные" value={fmt(totalCash)} accent="#16a34a"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>} />
        </div>
        <div className="pay-stat-card">
          <StatCard label="Карта" value={fmt(totalCard)} accent="#0ea5e9"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>} />
        </div>
        <div className="pay-stat-card">
          <StatCard label="Транзакции" value={payments.length} accent="#f59e0b"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>} />
        </div>
      </div>

      {/* Date filter */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>Дата:</span>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inputStyle, width: "auto" }} />
      </div>

      <div className="pay-kassa-grid">
        {/* Transactions */}
        <div style={cardStyle}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>Транзакции</span>
            <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 400 }}>{payments.length} записей</span>
          </div>

          {loading ? (
            <div style={{ padding: "32px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>Загрузка...</div>
          ) : payments.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 8, display: "flex", justifyContent: "center" }}><Inbox size={32} /></div>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>Нет оплат за эту дату</div>
            </div>
          ) : (
            <div className="pay-table-wrap">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Пациент", "Сумма", "Способ", "Примечание", "Время", ""].map((h, i) => (
                    <th key={i} style={{ textAlign: "left", padding: "7px 10px", color: "var(--muted)", fontWeight: 500, fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id} style={{ borderBottom: "1px solid var(--border)", transition: "background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--hover)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{p.patientName || "—"}</td>
                    <td style={{ ...tdStyle, fontWeight: 700, color: "var(--success)" }}>{fmt(p.amount)}</td>
                    <td style={tdStyle}>
                      <Badge
                        bg={p.method === "cash" ? "#f0fdf4" : "#eff6ff"}
                        color={p.method === "cash" ? "#16a34a" : "#2563eb"}
                        border={p.method === "cash" ? "#bbf7d0" : "#bfdbfe"}
                      >
                        {methodLabel[p.method] || p.method}
                      </Badge>
                    </td>
                    <td style={{ ...tdStyle, color: "var(--muted)" }}>{p.note || "—"}</td>
                    <td style={{ ...tdStyle, color: "var(--muted)" }}>{p.time || "—"}</td>
                    <td style={tdStyle}>
                      <button onClick={() => printReceipt(p)} title="Печать чека"
                        style={{ ...iconBtn, color: "var(--primary)" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                          <rect x="6" y="14" width="12" height="8"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>

        {/* Add payment form */}
        <div style={{ ...cardStyle, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16, color: "var(--text)" }}>
            + Добавить оплату
          </div>
          <form onSubmit={handleAdd} style={{ display: "grid", gap: 12 }}>
            <Field label="Пациент *">
              <select value={form.patientId} onChange={e => setForm(f => ({ ...f, patientId: e.target.value }))} style={inputStyle} required>
                <option value="">— Выберите —</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Врач">
              <select value={form.doctorId} onChange={e => setForm(f => ({ ...f, doctorId: e.target.value }))} style={inputStyle}>
                <option value="">— Выберите —</option>
                {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Сумма (₸) *">
              <input type="number" min="1" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="15 000" style={inputStyle} required />
            </Field>
            <Field label="Способ оплаты">
              <div style={{ display: "flex", gap: 8 }}>
                {[["cash", <span key="c" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Banknote size={14} /> Наличные</span>], ["card", <span key="d" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><CreditCard size={14} /> Карта</span>]].map(([m, label]) => (
                  <button key={m} type="button" onClick={() => setForm(f => ({ ...f, method: m }))}
                    style={{
                      flex: 1, padding: "8px 4px", borderRadius: "var(--radius-sm)",
                      border: `1.5px solid ${form.method === m ? "var(--primary)" : "var(--border)"}`,
                      background: form.method === m ? "var(--active)" : "var(--surface)",
                      color: form.method === m ? "var(--primary)" : "var(--muted)",
                      fontWeight: form.method === m ? 600 : 400,
                      fontSize: 12, cursor: "pointer", transition: "all 0.15s",
                    }}>
                    {label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Примечание">
              <input type="text" value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                placeholder="Лечение зуба, первичный приём..." style={inputStyle} />
            </Field>

            {msg && (
              <div style={{
                fontSize: 12, padding: "8px 12px", borderRadius: "var(--radius-sm)",
                background: msg.startsWith("✓") ? "#f0fdf4" : "#fef2f2",
                color: msg.startsWith("✓") ? "var(--success)" : "var(--danger)",
                border: `1px solid ${msg.startsWith("✓") ? "#bbf7d0" : "#fecaca"}`,
              }}>
                {msg}
              </div>
            )}
            <button type="submit" disabled={saving} style={{ ...btnPrimary, width: "100%", marginTop: 2 }}>
              {saving ? "Сохранение..." : "Добавить оплату →"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── ДОЛЖНИКИ ──────────────────────────────────────────────────────────────────
function DebtorsTab() {
  const [query, setQuery] = useState("");
  const [all, setAll] = useState([]);

  useEffect(() => { searchPatients("").then(setAll); }, []);

  const debtors = all
    .filter(p => p.balance < 0)
    .filter(p => !query || p.name.toLowerCase().includes(query.toLowerCase()) || (p.phone || "").includes(query));

  const totalDebt = debtors.reduce((s, p) => s + Math.abs(p.balance || 0), 0);

  function sendWhatsApp(phone, name, debt) {
    const text = `Здравствуйте, ${name}! Клиника NeuroDent. У вас задолженность ${debt.toLocaleString("ru-RU")} ₸. Просим погасить в удобное время. +7 771 163 2030`;
    window.open(`https://wa.me/${phone?.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`, "_blank");
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <StatCard label="Общий долг" value={fmt(totalDebt)} accent="#dc2626"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>} />
        <StatCard label="Должников" value={debtors.length} accent="#f59e0b"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>} />
      </div>

      <input type="text" placeholder="Поиск пациента..."
        value={query} onChange={e => setQuery(e.target.value)}
        style={{ ...inputStyle, maxWidth: 360, paddingLeft: 36, backgroundImage: "none" }} />

      <div style={cardStyle}>
        {debtors.length === 0 ? (
          <div style={{ padding: "48px 0", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 10, display: "flex", justifyContent: "center" }}>{query ? <Search size={36} /> : <PartyPopper size={36} />}</div>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>{query ? "Не найдено" : "Должников нет"}</div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)" }}>
                {["#", "Пациент", "Телефон", "Долг", "Последний визит", "Уведомление"].map((h, i) => (
                  <th key={i} style={{ textAlign: "left", padding: "8px 10px", color: "var(--muted)", fontWeight: 500, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {debtors.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--hover)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ ...tdStyle, color: "var(--muted)", width: 32 }}>{i + 1}</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{p.name}</td>
                  <td style={{ ...tdStyle, color: "var(--muted)" }}>{p.phone}</td>
                  <td style={{ ...tdStyle }}>
                    <span style={{ fontWeight: 700, color: "var(--danger)" }}>{fmt(Math.abs(p.balance || 0))}</span>
                  </td>
                  <td style={{ ...tdStyle, color: "var(--muted)" }}>{p.lastVisit || "—"}</td>
                  <td style={tdStyle}>
                    <button onClick={() => sendWhatsApp(p.phone, p.name, Math.abs(p.balance || 0))}
                      style={{
                        padding: "5px 12px", borderRadius: "var(--radius-sm)",
                        border: "1px solid #22c55e", background: "#f0fdf4",
                        color: "#16a34a", fontSize: 12, fontWeight: 600, cursor: "pointer",
                        display: "inline-flex", alignItems: "center", gap: 5,
                      }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="#16a34a">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a8.9 8.9 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                        <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.978-1.405A9.945 9.945 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.943 7.943 0 0 1-4.516-1.29l-.324-.194-3.354.947.949-3.262-.21-.335A7.942 7.942 0 0 1 4 12c0-4.411 3.589-8 8-8s8 3.589 8 8-3.589 8-8 8z"/>
                      </svg>
                      WhatsApp
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── СКЛАД ─────────────────────────────────────────────────────────────────────
const CATEGORIES = ["Анестезия", "Терапия", "Хирургия", "Ортодонтия", "Ортопедия", "Эндодонтия", "Имплантология", "Гигиена", "Антисептики", "Расходники"];

function SkladTab() {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", category: "Расходники", unit: "шт", quantity: "", minQuantity: "", price: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { getInventoryItems().then(setItems); }, []);
  async function refresh() { setItems(await getInventoryItems()); }

  async function changeQty(id, delta) {
    try { await updateInventoryQuantity(id, delta); await refresh(); }
    catch (e) { alert(e?.message || "Ошибка"); }
  }

  async function handleAdd(e) {
    e.preventDefault(); setErr(""); setSaving(true);
    try {
      await addInventoryItem({ name: form.name, category: form.category, unit: form.unit, quantity: Number(form.quantity), minQuantity: Number(form.minQuantity) || 5, price: Number(form.price) || 0 });
      setForm({ name: "", category: "Расходники", unit: "шт", quantity: "", minQuantity: "", price: "" });
      setShowAdd(false);
      await refresh();
    } catch (e) { setErr(e?.message || "Ошибка"); }
    finally { setSaving(false); }
  }

  function orderText(item) {
    const text = `Заказ:\n${item.name}\nКол-во: ${item.minQuantity * 3} ${item.unit}\nКлиника NeuroDent +7 771 163 2030`;
    navigator.clipboard?.writeText(text).then(() => alert("Текст заказа скопирован"));
  }

  const filtered = items.filter(i =>
    !query || i.name.toLowerCase().includes(query.toLowerCase()) || (i.category || "").toLowerCase().includes(query.toLowerCase())
  );
  const lowStock = items.filter(i => i.quantity <= i.minQuantity);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <StatCard label="Всего позиций" value={items.length} accent="#2563eb"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>} />
        <StatCard label="Заканчиваются" value={lowStock.length}
          accent={lowStock.length > 0 ? "#dc2626" : "#16a34a"}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>} />
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input type="text" placeholder="Товар или категория..."
          value={query} onChange={e => setQuery(e.target.value)}
          style={{ ...inputStyle, flex: 1, maxWidth: 360, paddingLeft: 36, backgroundImage: "none" }} />
        <button onClick={() => setShowAdd(v => !v)}
          style={showAdd ? { ...btnOutline } : { ...btnPrimary }}>
          {showAdd ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><X size={14} /> Закрыть</span> : "+ Добавить товар"}
        </button>
      </div>

      {showAdd && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Новый товар</div>
          <form onSubmit={handleAdd} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <Field label="Наименование *">
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Хлоргексидин 0.05%..." style={inputStyle} required />
              </Field>
            </div>
            <Field label="Категория *">
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inputStyle}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Единица измерения">
              <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} style={inputStyle}>
                {["шт", "мл", "г", "уп", "амп", "упак", "комп"].map(u => <option key={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="Количество *">
              <input type="number" min="0" value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                placeholder="50" style={inputStyle} required />
            </Field>
            <Field label="Мин. количество">
              <input type="number" min="0" value={form.minQuantity}
                onChange={e => setForm(f => ({ ...f, minQuantity: e.target.value }))}
                placeholder="5" style={inputStyle} />
            </Field>
            <Field label="Баға (₸)">
              <input type="number" min="0" value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                placeholder="1200" style={inputStyle} />
            </Field>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 6 }}>
              {err && <div style={{ fontSize: 11, color: "var(--danger)" }}>{err}</div>}
              <button type="submit" disabled={saving} style={{ ...btnPrimary, width: "100%" }}>
                {saving ? "..." : "Сохранить"}
              </button>
            </div>
          </form>
        </div>
      )}

      {lowStock.length > 0 && (
        <div style={{
          background: "#fef9ec", border: "1px solid #fcd34d", borderRadius: "var(--radius)",
          padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span style={{ fontSize: 13, color: "#92400e", fontWeight: 500 }}>
            <b>{lowStock.length} товаров</b> на минимальном уровне или ниже:&nbsp;
            {lowStock.map(i => i.name).join(", ")}
          </span>
        </div>
      )}

      <div style={cardStyle}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--border)", background: "var(--surface-2)" }}>
              {["Наименование", "Категория", "Ед.", "Кол-во", "Мин.", "Статус", "Управление"].map((h, i) => (
                <th key={i} style={{ textAlign: "left", padding: "9px 10px", color: "var(--muted)", fontWeight: 500, fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)" }}>
                {query ? "Не найдено" : "Товаров нет"}
              </td></tr>
            ) : filtered.map(item => {
              const isLow = item.quantity <= item.minQuantity;
              return (
                <tr key={item.id} style={{ borderBottom: "1px solid var(--border)" }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--hover)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {isLow && <span title="Заканчивается" style={{ color: "var(--warning)", fontSize: 14, display: "inline-flex", alignItems: "center" }}><AlertTriangle size={14} /></span>}
                      {item.name}
                    </div>
                  </td>
                  <td style={{ ...tdStyle, color: "var(--muted)", fontSize: 12 }}>{item.category}</td>
                  <td style={{ ...tdStyle, color: "var(--muted)" }}>{item.unit}</td>
                  <td style={{ ...tdStyle }}>
                    <span style={{ fontWeight: 700, color: isLow ? "var(--danger)" : "var(--text)", fontSize: 15 }}>
                      {item.quantity}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, color: "var(--muted)" }}>{item.minQuantity}</td>
                  <td style={tdStyle}>
                    <Badge
                      bg={isLow ? "#fef2f2" : "#f0fdf4"}
                      color={isLow ? "var(--danger)" : "var(--success)"}
                      border={isLow ? "#fecaca" : "#bbf7d0"}
                    >
                      {isLow ? "Мало" : "Достаточно"}
                    </Badge>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button onClick={() => changeQty(item.id, -1)} style={qtyBtn}>−</button>
                      <span style={{ fontSize: 12, color: "var(--muted)", minWidth: 20, textAlign: "center" }}>{item.quantity}</span>
                      <button onClick={() => changeQty(item.id, 1)} style={{ ...qtyBtn, background: "#eff6ff", color: "var(--primary)", borderColor: "#bfdbfe" }}>+</button>
                      {isLow && (
                        <button onClick={() => orderText(item)} title="Скопировать текст заказа"
                          style={{ ...iconBtn, marginLeft: 4, color: "var(--warning)", border: "1px solid #fcd34d", background: "#fef9ec" }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div style={{ display: "grid", gap: 5 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>{label}</div>
      {children}
    </div>
  );
}

// ── shared styles ─────────────────────────────────────────────────────────────
const cardStyle = {
  background: "var(--surface)", border: "1px solid var(--border)",
  borderRadius: "var(--radius)", padding: 20, overflowX: "auto",
  boxShadow: "var(--shadow-sm)",
};

const inputStyle = {
  width: "100%", padding: "8px 12px",
  border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
  background: "var(--surface)", color: "var(--text)", fontSize: 13, boxSizing: "border-box",
  outline: "none",
};

const tdStyle = { padding: "10px 10px", verticalAlign: "middle" };

const btnPrimary = {
  padding: "9px 18px", background: "var(--primary)", color: "#fff",
  border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600,
  fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
};

const btnOutline = {
  padding: "9px 18px", background: "var(--surface)", color: "var(--text)",
  border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontWeight: 500,
  fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
};

const iconBtn = {
  width: 28, height: 28, border: "1px solid var(--border)",
  borderRadius: "var(--radius-xs)", background: "var(--surface-2)",
  cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
  padding: 0,
};

const qtyBtn = {
  width: 28, height: 28, border: "1px solid var(--border)",
  borderRadius: "var(--radius-xs)", background: "var(--surface-2)", color: "var(--text)",
  fontSize: 15, cursor: "pointer", display: "inline-flex",
  alignItems: "center", justifyContent: "center", padding: 0, fontWeight: 600,
};

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
const TABS = [
  { id: "kassa", label: <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Banknote size={14} /> Касса</span> },
  { id: "debtors", label: <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><AlertTriangle size={14} /> Должники</span> },
  { id: "sklad", label: <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Package size={14} /> Склад</span> },
];

export default function PaymentsPage() {
  const [tab, setTab] = useState("kassa");

  return (
    <div className="pay-outer" style={{ padding: 24, display: "grid", gap: 20, maxWidth: 1400 }}>
      <style>{`
        .pay-kassa-grid { display: grid; grid-template-columns: 1fr 340px; gap: 20px; align-items: start; }
        .pay-stats { display: flex; flex-wrap: wrap; gap: 12px; }
        .pay-stat-card { flex: 1; min-width: 130px; }
        .pay-tabs { display: flex; gap: 2; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 4px; width: fit-content; box-shadow: var(--shadow-sm); overflow-x: auto; scrollbar-width: none; max-width: 100%; }
        .pay-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        @media (max-width: 700px) {
          .pay-kassa-grid { grid-template-columns: 1fr !important; }
          .pay-stat-card { min-width: calc(50% - 6px); flex: none; }
        }
        @media (max-width: 540px) {
          .pay-stats { gap: 8px; }
          .pay-stat-card { min-width: calc(50% - 4px); }
        }
        @media (max-width: 420px) {
          .pay-stat-card { min-width: 100%; }
        }
        @media (max-width: 600px) {
          .pay-outer { padding: 12px !important; gap: 14px !important; }
        }
      `}</style>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, background: "var(--active)",
          display: "flex", alignItems: "center", justifyContent: "center", color: "var(--primary)",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
          </svg>
        </div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", margin: 0, lineHeight: 1.2 }}>Финансы и Склад</h1>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Касса, должники, склад материалов</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="pay-tabs">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: "8px 20px", border: "none",
              borderRadius: "var(--radius-sm)",
              background: tab === t.id ? "var(--primary)" : "transparent",
              color: tab === t.id ? "#fff" : "var(--muted)",
              fontWeight: tab === t.id ? 600 : 400,
              fontSize: 13, cursor: "pointer",
              transition: "all 0.15s ease",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "kassa" && <KassaTab />}
      {tab === "debtors" && <DebtorsTab />}
      {tab === "sklad" && <SkladTab />}
    </div>
  );
}
