import {
  searchPatients,
  createPatient,
  updatePatient,
  getPatientById,
  getPatientProtocol,
  getPatientMedicalCard,
  getInvoices,
  getFileDownloadUrl,
} from "../../core/api.js";
import { getState, setState } from "../../core/state.js";
import { openModal, closeModal } from "../../ui/modal.js";
import {
  renderPatientsPage,
  renderPatientPortalPage,
  renderLoading,
  renderError,
  renderEmpty,
  renderPatientsTable,
  renderPatientForm,
  renderPatientCard,
} from "./patients.view.js";

let searchTimer = null;

function bindPatientProtocolDownload(patientId) {
  const downloadBtn = document.getElementById("downloadAiProtocolBtn");
  if (!downloadBtn) return;

  downloadBtn.addEventListener("click", async () => {
    const oldText = downloadBtn.textContent;
    downloadBtn.innerHTML = '<div class="spinner" style="width: 12px; height: 12px; border-width: 2px; border-color: var(--primary); border-right-color: transparent;"></div> Скачивание...';
    downloadBtn.disabled = true;

    try {
      const protocolText = await getPatientProtocol(patientId);
      const blob = new Blob([protocolText], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `AI_Protocol_${patientId}.txt`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      downloadBtn.textContent = "Скачано";
      downloadBtn.style.color = "var(--success)";
      downloadBtn.style.borderColor = "var(--success)";
    } catch (err) {
      alert(err?.message || "Не удалось скачать AI-протокол");
    } finally {
      downloadBtn.disabled = false;
      setTimeout(() => {
        downloadBtn.textContent = oldText || "Скачать AI-протокол";
        downloadBtn.style.color = "var(--primary)";
        downloadBtn.style.borderColor = "var(--primary)";
      }, 2500);
    }
  });
}

export function mountPatientsPage() {
  const page = document.getElementById("page-content");

  const { user } = getState();
  if (user?.role === "patient") {
    const patientId = user?.patientId || user?.id;
    if (!patientId) {
      page.innerHTML = renderPatientPortalPage({ error: "Не удалось определить пациента для личного кабинета" });
      return;
    }

    page.innerHTML = renderPatientPortalPage({ loading: true });
    Promise.all([
      getPatientMedicalCard(patientId),
      getInvoices({ patientId }),
    ])
      .then(([medicalCard, invoices]) => {
        page.innerHTML = renderPatientPortalPage({
          medicalCard,
          invoices,
          fileDownloadUrl: getFileDownloadUrl,
        });
        bindPatientProtocolDownload(patientId);
      })
      .catch((err) => {
        page.innerHTML = renderPatientPortalPage({
          error: err?.message || "Не удалось загрузить личную медкарту",
        });
      });
    return;
  }

  page.innerHTML = renderPatientsPage();

  const searchInput = document.getElementById("patientSearch");
  const createBtn = document.getElementById("createPatientBtn");
  const stateBox = document.getElementById("patientsState");
  const tableBox = document.getElementById("patientsTable");
  if (!searchInput || !stateBox || !tableBox) return;

  const hash = window.location.hash || "";
  const q = new URLSearchParams(hash.split("?")[1] || "").get("q") || "";
  if (q) searchInput.value = q;

  loadPatients(searchInput.value);

  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadPatients(searchInput.value), 250);
  });

  createBtn?.addEventListener("click", () => openCreateModal());

  tableBox.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "view") openViewModal(btn.dataset.id);
    if (btn.dataset.action === "edit") openEditModal(btn.dataset.id);
  });

  async function loadPatients(query) {
    try {
      stateBox.innerHTML = renderLoading("Загрузка пациентов...");
      tableBox.innerHTML = "";
      const list = await searchPatients(query);
      setState({ patients: list });
      if (!list.length) {
        stateBox.innerHTML = renderEmpty();
        return;
      }
      stateBox.innerHTML = "";
      tableBox.innerHTML = renderPatientsTable(list);
    } catch (err) {
      stateBox.innerHTML = renderError(
        err?.message || "Не удалось загрузить пациентов",
      );
      tableBox.innerHTML = "";
    }
  }

  function openCreateModal() {
    openModal({
      title: "Новый пациент",
      content: renderPatientForm({ mode: "create", patient: null }),
    });
    const form = document.getElementById("patientForm");
    const cancel = document.getElementById("cancelPatientForm");
    const saveBtn = document.getElementById("savePatientBtn");
    const errBox = document.getElementById("patientFormError");
    cancel.addEventListener("click", closeModal);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errBox.textContent = "";
      saveBtn.disabled = true;
      const old = saveBtn.textContent;
      saveBtn.textContent = "Создаём...";
      try {
        const fd = new FormData(form);
        await createPatient({
          name: fd.get("name"),
          phone: fd.get("phone"),
          email: fd.get("email"),
          address: fd.get("address"),
          birthDate: fd.get("birthDate"),
        });
        closeModal();
        loadPatients(searchInput.value);
        // Dispatch custom event so other views could know
        window.dispatchEvent(new CustomEvent("patients:changed"));
      } catch (err) {
        errBox.textContent = err?.message || "Ошибка создания";
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = old;
      }
    });
  }

  async function openEditModal(patientId) {
    openModal({
      title: "Редактирование пациента",
      content: renderLoading("Загрузка..."),
    });
    try {
      const patient = await getPatientById(patientId);
      openModal({
        title: "Редактирование пациента",
        content: renderPatientForm({ mode: "edit", patient }),
      });
      const form = document.getElementById("patientForm");
      const cancel = document.getElementById("cancelPatientForm");
      const saveBtn = document.getElementById("savePatientBtn");
      const errBox = document.getElementById("patientFormError");
      cancel.addEventListener("click", closeModal);
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        errBox.textContent = "";
        saveBtn.disabled = true;
        const old = saveBtn.textContent;
        saveBtn.textContent = "Сохраняем...";
        try {
          const fd = new FormData(form);
          await updatePatient(patientId, {
            name: fd.get("name"),
            phone: fd.get("phone"),
            email: fd.get("email"),
            address: fd.get("address"),
            birthDate: fd.get("birthDate"),
          });
          closeModal();
          loadPatients(searchInput.value);
          // Dispatch custom event
          window.dispatchEvent(new CustomEvent("patients:changed"));
        } catch (err) {
          errBox.textContent = err?.message || "Ошибка сохранения";
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = old;
        }
      });
    } catch (err) {
      openModal({
        title: "Редактирование пациента",
        content: renderError(err?.message || "Не удалось загрузить пациента"),
      });
    }
  }

  async function openViewModal(patientId) {
    openModal({
      title: "Карточка пациента",
      content: renderLoading("Загрузка..."),
    });
    try {
      const patient = await getPatientById(patientId);
      openModal({
        title: "Карточка пациента",
        content: renderPatientCard(patient),
      });
    } catch (err) {
      openModal({
        title: "Карточка пациента",
        content: renderError(err?.message || "Не удалось загрузить пациента"),
      });
    }
  }
}
