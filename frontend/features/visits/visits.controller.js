// features/visits/visits.controller.js
import {
  getSchedule,
  startVisit,
  finishVisit,
  getDoctors,
} from "../../core/api.js";
import { getState, setState } from "../../core/state.js";
import {
  renderVisitPageShell,
  renderVisitLoading,
  renderVisitError,
  renderVisitForm,
} from "./visits.view.js";

export async function mountVisitPage() {
  const page = document.getElementById("page-content");
  page.innerHTML = renderVisitPageShell();

  const card = document.getElementById("visitCard");
  card.innerHTML = renderVisitLoading("Загрузка записи…");

  try {
    const apptId = getIdFromHash();
    if (!apptId) throw new Error("ID записи не найден");

    let appointment = await findAppointmentById(apptId);
    if (!appointment) throw new Error("Запись не найдена");

    // Рендерим форму
    renderForm(appointment, null, false);

    // Слушаем клики через делегирование на card — чтобы не терять после ре-рендера
    card.addEventListener("click", async (e) => {
      // Кнопка "Назад"
      if (e.target.closest("#backToScheduleBtn")) {
        window.location.hash = "#schedule";
        return;
      }

      // Кнопка "Начать визит"
      if (e.target.closest("#startVisitBtn")) {
        const btn = e.target.closest("#startVisitBtn");
        if (btn.disabled) return;
        btn.disabled = true;

        try {
          card.innerHTML = renderVisitLoading("Начинаем визит…");
          const v = await startVisit(appointment.id);
          appointment = await findAppointmentById(appointment.id);
          renderForm(appointment, v, v.isFinal);
        } catch (err) {
          appointment = await findAppointmentById(appointment.id);
          renderForm(appointment, null, false);
          showError(err?.message || "Не удалось начать визит");
        }
        return;
      }
    });

    // Слушаем submit через делегирование на card
    card.addEventListener("submit", async (e) => {
      if (!e.target.closest("#visitForm")) return;
      e.preventDefault();

      const finishBtn = document.getElementById("finishVisitBtn");
      if (!finishBtn || finishBtn.disabled) return;

      showError("");
      finishBtn.disabled = true;
      const oldText = finishBtn.textContent;
      finishBtn.textContent = "Завершаем…";

      try {
        const fd = new FormData(e.target);
        const payload = {
          complaint: fd.get("complaint"),
          diagnosis: fd.get("diagnosis"),
          notes: fd.get("notes"),
        };

        const v = await finishVisit(appointment.id, payload);
        appointment = await findAppointmentById(appointment.id);
        renderForm(appointment, v, true);
      } catch (err) {
        showError(err?.message || "Не удалось завершить визит");
        if (finishBtn) {
          finishBtn.disabled = false;
          finishBtn.textContent = oldText;
        }
      }
    });
  } catch (err) {
    card.innerHTML = renderVisitError(
      err?.message || "Ошибка загрузки страницы визита",
    );
  }

  function renderForm(appointment, visit, isFinal) {
    card.innerHTML = renderVisitForm({ appointment, visit, isFinal });
  }

  function showError(msg) {
    const errBox = document.getElementById("visitError");
    if (errBox) errBox.textContent = msg;
  }
}

function getIdFromHash() {
  const hash = window.location.hash || "";
  const qs = hash.split("?")[1] || "";
  return new URLSearchParams(qs).get("id");
}

async function findAppointmentById(appointmentId) {
  const state = getState();
  let doctors = state.doctors;
  if (!doctors || !doctors.length) {
    doctors = await getDoctors();
    setState({ doctors });
  }

  const date = state.selectedDate;

  if (state.selectedDoctorId) {
    const list = await getSchedule(state.selectedDoctorId, date);
    const found = list.find((a) => a.id === appointmentId);
    if (found) return found;
  }

  for (const d of doctors) {
    const list = await getSchedule(d.id, date);
    const found = list.find((a) => a.id === appointmentId);
    if (found) return found;
  }

  return null;
}
