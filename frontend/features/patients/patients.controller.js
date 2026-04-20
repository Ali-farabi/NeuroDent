import {
  searchPatients,
  createPatient,
  updatePatient,
  getPatientById,
} from "../../core/api.js";
import { getState, setState } from "../../core/state.js";
import { openModal, closeModal } from "../../ui/modal.js";
import {
  renderPatientsPage,
  renderLoading,
  renderError,
  renderEmpty,
  renderPatientsTable,
  renderPatientForm,
  renderPatientCard,
} from "./patients.view.js";

let searchTimer = null;

export function mountPatientsPage() {
  const page = document.getElementById("page-content");
  page.innerHTML = renderPatientsPage();

  const { user } = getState();
  if (user?.role === "patient") {
    // Add logic for patient personal cabinet
    const downloadBtn = document.getElementById("downloadAiProtocolBtn");
    if (downloadBtn) {
      downloadBtn.addEventListener("click", () => {
        downloadBtn.innerHTML = '<div class="spinner" style="width: 12px; height: 12px; border-width: 2px; border-color: var(--primary); border-right-color: transparent;"></div> Скачивание...';
        setTimeout(() => {
          downloadBtn.innerHTML = '✅ Сохранено';
          downloadBtn.style.color = 'var(--success)';
          downloadBtn.style.borderColor = 'var(--success)';
          
          // Имитация скачивания
          const link = document.createElement('a');
          link.href = 'data:text/plain;charset=utf-8,Тестовый AI протокол';
          link.download = 'AI_Protocol_Damir.pdf';
          link.click();
          
          setTimeout(() => {
            downloadBtn.innerHTML = '📄 Скачать AI-Протокол (eGov)';
            downloadBtn.style.color = 'var(--primary)';
            downloadBtn.style.borderColor = 'var(--primary)';
          }, 3000);
        }, 1500);
      });
    }
    return;
  }

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
