"use client";

import { useEffect, useState } from "react";
import {
  createPatientProtocolDocument,
  deleteFile,
  getFileDownloadUrl,
  getFiles,
  searchPatients,
  signDocument,
  uploadFile,
} from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function FilesPage() {
  const { user } = useAuth();
  const [files, setFiles] = useState([]);
  const [patients, setPatients] = useState([]);
  const [patientId, setPatientId] = useState("");
  const [message, setMessage] = useState("");

  async function load(nextPatientId = patientId) {
    const filters = nextPatientId ? { patientId: nextPatientId } : {};
    const [fileList, patientList] = await Promise.all([getFiles(filters), user?.role === "patient" ? Promise.resolve([]) : searchPatients("")]);
    setFiles(fileList);
    setPatients(patientList);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handlePatientChange(value) {
    setPatientId(value);
    await load(value);
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage("");
    try {
      const base64 = await readAsBase64(file);
      await uploadFile({ patientId, fileName: file.name, mimeType: file.type || "application/octet-stream", base64 });
      event.target.value = "";
      await load();
      setMessage("Файл загружен");
    } catch (error) {
      setMessage(error?.message || "Не удалось загрузить файл");
    }
  }

  async function handleProtocol() {
    setMessage("");
    try {
      await createPatientProtocolDocument(patientId);
      await load();
      setMessage("Документ протокола создан");
    } catch (error) {
      setMessage(error?.message || "Не удалось создать документ");
    }
  }

  async function handleSign(file) {
    setMessage("");
    try {
      await signDocument(file.id, { signerName: user?.name || "NeuroDent", provider: "egov" });
      setMessage("Документ отправлен на подпись");
    } catch (error) {
      setMessage(error?.message || "Не удалось подписать документ");
    }
  }

  async function handleDelete(file) {
    setMessage("");
    try {
      await deleteFile(file.id);
      await load();
      setMessage("Файл удален");
    } catch (error) {
      setMessage(error?.message || "Не удалось удалить файл");
    }
  }

  return (
    <section className="grid gap-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-2xl font-semibold text-slate-950">Файлы и документы</h1>
          <p className="mt-1 text-sm text-slate-500">Загрузка, скачивание и ЭЦП документов</p>
        </div>
        {user?.role !== "patient" && (
          <select value={patientId} onChange={(event) => handlePatientChange(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm">
            <option value="">Все пациенты</option>
            {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}
          </select>
        )}
      </div>

      {user?.role !== "patient" && (
        <div className="flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <label className={`inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold ${patientId ? "cursor-pointer bg-blue-600 text-white" : "cursor-not-allowed bg-slate-100 text-slate-400"}`}>
            Загрузить файл
            <input disabled={!patientId} type="file" onChange={handleUpload} className="hidden" />
          </label>
          <button disabled={!patientId} onClick={handleProtocol} className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold disabled:opacity-50">
            Создать AI protocol document
          </button>
        </div>
      )}

      {message && <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">{message}</div>}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="p-3">Файл</th><th className="p-3">Пациент</th><th className="p-3">Тип</th><th className="p-3">Создан</th><th className="p-3">Действия</th></tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr key={file.id} className="border-t border-slate-100">
                <td className="p-3 font-semibold">{file.fileName}</td>
                <td className="p-3">{file.patientName || file.patientId || "—"}</td>
                <td className="p-3">{file.mimeType}</td>
                <td className="p-3">{file.createdAt}</td>
                <td className="flex flex-wrap gap-2 p-3">
                  <a href={getFileDownloadUrl(file.id)} className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold">Скачать</a>
                  {["owner", "doctor"].includes(user?.role) && <button onClick={() => handleSign(file)} className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold">ЭЦП</button>}
                  {user?.role !== "patient" && <button onClick={() => handleDelete(file)} className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold">Удалить</button>}
                </td>
              </tr>
            ))}
            {!files.length && <tr><td className="p-6 text-center text-slate-500" colSpan="5">Файлов нет</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
