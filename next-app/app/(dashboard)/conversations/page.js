"use client";

import { useEffect, useState } from "react";
import {
  createConversation,
  createConversationAiDraft,
  getConversationMessages,
  getConversations,
  searchPatients,
  sendConversationMessage,
  updateConversationStatus,
} from "@/lib/api";

export default function ConversationsPage() {
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [patients, setPatients] = useState([]);
  const [selected, setSelected] = useState(null);
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ patientId: "", channel: "whatsapp", initialMessage: "" });

  async function load() {
    const [conversationList, patientList] = await Promise.all([getConversations({ limit: 100 }), searchPatients("")]);
    setConversations(conversationList);
    setPatients(patientList);
    if (!selected && conversationList[0]) setSelected(conversationList[0]);
  }

  async function loadMessages(conversation) {
    setSelected(conversation);
    setMessages(await getConversationMessages(conversation.id));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selected) loadMessages(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  async function handleCreate(event) {
    event.preventDefault();
    setMessage("");
    try {
      const conversation = await createConversation(form);
      setForm({ patientId: "", channel: "whatsapp", initialMessage: "" });
      await load();
      await loadMessages(conversation);
    } catch (error) {
      setMessage(error?.message || "Не удалось создать диалог");
    }
  }

  async function handleSend(event) {
    event.preventDefault();
    if (!selected || !body.trim()) return;
    setMessage("");
    try {
      await sendConversationMessage(selected.id, { body });
      setBody("");
      await loadMessages(selected);
    } catch (error) {
      setMessage(error?.message || "Не удалось отправить сообщение");
    }
  }

  async function handleDraft() {
    if (!selected) return;
    setMessage("");
    try {
      const draft = await createConversationAiDraft(selected.id);
      setBody(draft.body || draft.message || "");
    } catch (error) {
      setMessage(error?.message || "Не удалось создать AI draft");
    }
  }

  async function handleClose() {
    if (!selected) return;
    await updateConversationStatus(selected.id, selected.status === "closed" ? "open" : "closed");
    await load();
  }

  return (
    <section className="grid gap-6 p-6">
      <div>
        <h1 className="m-0 text-2xl font-semibold text-slate-950">Сообщения</h1>
        <p className="mt-1 text-sm text-slate-500">Inbox по пациентам и каналам связи</p>
      </div>

      <form onSubmit={handleCreate} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-4">
        <select value={form.patientId} onChange={(event) => setForm((f) => ({ ...f, patientId: event.target.value }))} className="h-10 rounded-lg border border-slate-200 px-3 text-sm">
          <option value="">Без пациента</option>
          {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}
        </select>
        <select value={form.channel} onChange={(event) => setForm((f) => ({ ...f, channel: event.target.value }))} className="h-10 rounded-lg border border-slate-200 px-3 text-sm">
          <option value="whatsapp">WhatsApp</option>
          <option value="sms">SMS</option>
          <option value="phone">Phone</option>
          <option value="email">Email</option>
          <option value="manual">Manual</option>
        </select>
        <input value={form.initialMessage} onChange={(event) => setForm((f) => ({ ...f, initialMessage: event.target.value }))} className="h-10 rounded-lg border border-slate-200 px-3 text-sm" placeholder="Первое сообщение" />
        <button className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white">Создать диалог</button>
      </form>

      {message && <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">{message}</div>}

      <div className="grid min-h-[540px] gap-4 lg:grid-cols-[360px_1fr]">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {conversations.map((conversation) => (
            <button key={conversation.id} onClick={() => loadMessages(conversation)} className={`block w-full border-b border-slate-100 p-4 text-left ${selected?.id === conversation.id ? "bg-blue-50" : "bg-white"}`}>
              <div className="font-semibold text-slate-950">{conversation.title || conversation.patientName || conversation.id}</div>
              <div className="mt-1 text-xs text-slate-500">{conversation.channel} · {conversation.status} · {conversation.patientPhone || "no phone"}</div>
            </button>
          ))}
        </div>

        <div className="grid rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <div>
              <div className="font-semibold text-slate-950">{selected?.title || "Диалог не выбран"}</div>
              <div className="text-xs text-slate-500">{selected?.status || ""}</div>
            </div>
            {selected && <button onClick={handleClose} className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold">{selected.status === "closed" ? "Открыть" : "Закрыть"}</button>}
          </div>
          <div className="grid max-h-[360px] content-start gap-3 overflow-auto p-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${msg.direction === "outbound" ? "justify-self-end bg-blue-600 text-white" : "bg-slate-100 text-slate-800"}`}>
                <div>{msg.body}</div>
                <div className="mt-1 text-[10px] opacity-70">{msg.senderName} · {msg.status}</div>
              </div>
            ))}
          </div>
          <form onSubmit={handleSend} className="flex gap-2 border-t border-slate-100 p-4">
            <textarea value={body} onChange={(event) => setBody(event.target.value)} className="min-h-20 flex-1 rounded-lg border border-slate-200 p-3 text-sm" placeholder="Ответ" />
            <div className="grid gap-2">
              <button type="button" onClick={handleDraft} className="rounded-lg border border-slate-200 px-4 text-sm font-semibold">AI draft</button>
              <button className="rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white">Send</button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
