import {
  getDoctors,
  getSchedule,
  createAppointment,
  searchPatients,
} from "../../core/api.js";
import { getState, setState } from "../../core/state.js";
import { openModal, closeModal } from "../../ui/modal.js";
import {
  renderScheduleLayout,
  renderCalendarGrid,
  renderAddAppointmentForm,
  renderLoading,
  renderError,
  renderEmpty,
} from "./schedule.view.js";

const CAL_GUTTER_RO = Symbol("calendarGutterResizeObserver");

/** Текущий выбранный чат (пациент) для Позвонить / Записать / Отправить */
let currentChatPatient = null;

function formatTimeForChat() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Номер для wa.me: только цифры, для KZ 8XXXXXXXXXX → 7XXXXXXXXXX */
function phoneForWa(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length >= 10 && digits[0] === "8") return "7" + digits.slice(1);
  return digits;
}

export async function mountSchedulePage() {
  const page = document.getElementById("page-content");
  try {
    page.innerHTML = renderLoading();
    const doctors = await getDoctors();
    const state = getState();
    const selectedDoctorId = state.selectedDoctorId || "";
    const selectedDate =
      state.selectedDate || new Date().toISOString().slice(0, 10);
    setState({ doctors, selectedDoctorId, selectedDate });
    page.innerHTML = renderScheduleLayout({
      doctors,
      selectedDoctorId,
      selectedDate,
    });

    document.getElementById("doctorSelect")?.addEventListener("change", (e) => {
      setState({ selectedDoctorId: e.target.value });
      loadCalendarGrid();
    });
    window.addEventListener("schedule:dateChanged", (e) => {
      setState({ selectedDate: e.detail });
      loadCalendarGrid();
    });
    
    // Listen for custom event from patient creation
    window.addEventListener("patients:changed", () => {
       // Only reload schedule grid if schedule is open
       if (document.getElementById("scheduleContent")) {
           loadCalendarGrid();
       }
    });
    
    window.handleAppointmentClick = (id, patientId) => {
      const state = getState();
      if (state.user?.role === "doctor" || state.user?.role === "assistant") {
        window.location.hash = `#ai?patient=${patientId}`;
      } else {
        window.location.hash = `#visit?id=${id}`;
      }
    };
    document
      .getElementById("addAppointmentBtn")
      ?.addEventListener("click", openAddAppointmentModal);
      // Chat & Tabs Logic
      const tabCalendar = document.getElementById("tab-calendar");
      const tabChats = document.getElementById("tab-chats");
      const contentCalendar = document.getElementById("tab-content-calendar");
      const contentChats = document.getElementById("tab-content-chats");
  
      if (tabCalendar && tabChats) {
        tabCalendar.addEventListener("click", () => {
          tabCalendar.classList.add("active");
          tabCalendar.style.color = "var(--primary)";
          tabCalendar.style.borderBottom = "2px solid var(--primary)";
          
          tabChats.classList.remove("active");
          tabChats.style.color = "var(--muted)";
          tabChats.style.borderBottom = "none";
          
          contentCalendar.style.display = "flex";
          contentChats.style.display = "none";
        });
  
        tabChats.addEventListener("click", async () => {
          tabChats.classList.add("active");
          tabChats.style.color = "var(--primary)";
          tabChats.style.borderBottom = "2px solid var(--primary)";
          
          tabCalendar.classList.remove("active");
          tabCalendar.style.color = "var(--muted)";
          tabCalendar.style.borderBottom = "none";
          
          contentCalendar.style.display = "none";
          contentChats.style.display = "flex";
  
          // Load dynamic chats
          const chatListContainer = document.getElementById("chatListContainer");
          if (chatListContainer && !chatListContainer.dataset.loaded) {
              chatListContainer.dataset.loaded = "true";
              const allPatients = await searchPatients();
              const chatPatients = allPatients.slice(0, 8);
              const channels = ["WhatsApp", "WhatsApp", "Instagram", "WhatsApp", "WhatsApp", "Instagram", "WhatsApp", "WhatsApp"];
              const lastMsgs = [
                "Здравствуйте! Можно записаться на завтра?",
                "Сколько стоит имплант?",
                "Спасибо, буду вовремя.",
                "Когда можно к ортодонту?",
                "Напомните время приёма",
                "Добрый день!",
                "Можно перенести на пятницу?",
                "Спасибо за приём!",
              ];
              const lastTimes = ["10:42", "Вчера", "Вчера", "Пн", "Сб", "Пт", "Чт", "Ср"];

              function escapeAttr(s) {
                return String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
              }
              const channelClass = (ch) => (ch === "Instagram" ? "crm-chat-platform-ig" : "crm-chat-platform-wa");
              chatListContainer.innerHTML = chatPatients.map((p, i) => {
                const ch = channels[i] || "WhatsApp";
                const initial = (p.name || "?").trim().charAt(0).toUpperCase();
                const activeClass = i === 0 ? " crm-chat-list-item-active" : "";
                return `
                <div class="crm-chat-list-item${activeClass}" data-patient-id="${p.id}" data-name="${escapeAttr(p.name)}" data-phone="${escapeAttr(p.phone)}" data-channel="${escapeAttr(ch)}">
                  <div class="crm-chat-list-item-avatar">${escapeAttr(initial)}</div>
                  <div class="crm-chat-list-item-body">
                    <div class="crm-chat-list-item-top">
                      <span class="crm-chat-list-item-name">${escapeAttr(p.name)}</span>
                      <span class="crm-chat-list-item-time">${escapeAttr(lastTimes[i] || "")}</span>
                    </div>
                    <div class="crm-chat-list-item-preview">${escapeAttr(lastMsgs[i] || "")}</div>
                    <span class="crm-chat-platform ${channelClass(ch)}">${escapeAttr(ch)}</span>
                  </div>
                </div>`;
              }).join("");

              window.loadChat = (el) => {
                if (!el || !el.dataset) return;
                const id = el.dataset.patientId;
                const name = el.dataset.name || "";
                const phone = el.dataset.phone || "";
                const channel = el.dataset.channel || "WhatsApp";
                currentChatPatient = id ? { id, name, phone, channel } : null;

                document.querySelectorAll(".crm-chat-list-item").forEach((item) => {
                  item.classList.remove("crm-chat-list-item-active");
                });
                el.classList.add("crm-chat-list-item-active");

                const chatHeader = document.getElementById("chatHeaderInfo");
                if (chatHeader) {
                  chatHeader.innerHTML = `
                    <div class="crm-chat-header-name">${escapeAttr(name) || "Чат"}</div>
                    <div class="crm-chat-header-meta">${escapeAttr(phone) || ""} • В сети</div>
                  `;
                }

                const chatMessages = document.getElementById("chatMessagesArea");
                if (chatMessages) {
                  chatMessages.innerHTML = `
                    <div class="crm-chat-date">Сегодня</div>
                    <div class="crm-chat-bubble crm-chat-bubble-in">
                      <div class="crm-chat-bubble-text">Здравствуйте! Подскажите, пожалуйста...</div>
                      <div class="crm-chat-bubble-time">10:42</div>
                    </div>
                  `;
                }

                const panel = document.getElementById("chatPatientPanel");
                if (panel) {
                  panel.innerHTML = `
                    <div class="crm-patient-card">
                      <div class="crm-patient-card-avatar">${escapeAttr((name || "?").trim().charAt(0).toUpperCase())}</div>
                      <h3 class="crm-patient-card-name">${escapeAttr(name) || "Пациент"}</h3>
                      <div class="crm-patient-card-phone">${escapeAttr(phone) || "—"}</div>
                      <div class="crm-patient-card-platform ${channelClass(channel)}">${escapeAttr(channel)}</div>
                      <div class="crm-patient-card-status crm-patient-card-status-online">В сети</div>
                      <div class="crm-patient-card-actions">
                        <button type="button" class="btn btn-secondary crm-patient-call">📞 Позвонить</button>
                        <button type="button" class="btn btn-secondary crm-patient-schedule">📅 Записать</button>
                      </div>
                      <div class="crm-patient-card-extra">Последний визит: —</div>
                    </div>
                  `;
                }
              };

              chatListContainer.addEventListener("click", (e) => {
                const item = e.target.closest(".crm-chat-list-item");
                if (item) window.loadChat(item);
              });

              const firstItem = chatListContainer.querySelector(".crm-chat-list-item");
              if (firstItem) window.loadChat(firstItem);

              const searchInput = document.getElementById("chatSearchInput");
              if (searchInput) {
                const q = (searchInput.value || "").trim().toLowerCase();
                const qDigits = q.replace(/\D/g, "");
                chatListContainer.querySelectorAll(".crm-chat-list-item").forEach((item) => {
                  const name = (item.dataset.name || "").toLowerCase();
                  const phone = (item.dataset.phone || "").replace(/\D/g, "");
                  item.style.display = !q || name.includes(q) || phone.includes(qDigits) ? "flex" : "none";
                });
              }
          }
        });
      }

      // ——— Позвонить / Записать / Отправить (WhatsApp) ———
      const chatCallBtn = document.getElementById("chatCallBtn");
      const chatScheduleBtn = document.getElementById("chatScheduleBtn");
      const chatSendBtn = document.getElementById("chatSendBtn");
      const chatInputMsg = document.getElementById("chatInputMsg");
      const chatSearchInput = document.getElementById("chatSearchInput");

      chatCallBtn?.addEventListener("click", () => {
        if (!currentChatPatient?.phone) {
          showChatToast("Сначала выберите чат с пациентом");
          return;
        }
        const digits = currentChatPatient.phone.replace(/\D/g, "").replace(/^8/, "7");
        if (digits.length >= 10) window.location.href = "tel:+" + digits;
      });

      chatScheduleBtn?.addEventListener("click", () => {
        if (!currentChatPatient?.id) {
          showChatToast("Сначала выберите чат с пациентом");
          return;
        }
        openAddAppointmentModal(currentChatPatient.id);
      });

      function sendChatMessage() {
        const text = (chatInputMsg?.value || "").trim();
        if (!text) return;
        if (!currentChatPatient?.phone) {
          showChatToast("Сначала выберите чат с пациентом");
          return;
        }
        const time = formatTimeForChat();
        const messagesArea = document.getElementById("chatMessagesArea");
        if (messagesArea) {
          const bubble = document.createElement("div");
          bubble.className = "crm-chat-bubble crm-chat-bubble-out";
          bubble.innerHTML = `<div class="crm-chat-bubble-text">${escapeChatText(text)}</div><div class="crm-chat-bubble-time">${time} ✓✓</div>`;
          messagesArea.appendChild(bubble);
          messagesArea.scrollTop = messagesArea.scrollHeight;
        }
        const waNum = phoneForWa(currentChatPatient.phone);
        const waUrl = `https://wa.me/${waNum}?text=${encodeURIComponent(text)}`;
        window.open(waUrl, "_blank", "noopener");
        if (chatInputMsg) chatInputMsg.value = "";
        showChatToast("Открыт WhatsApp — отправьте сообщение там");
      }

      function escapeChatText(s) {
        const div = document.createElement("div");
        div.textContent = s;
        return div.innerHTML;
      }

      function showChatToast(msg) {
        const existing = document.getElementById("chatToast");
        if (existing) existing.remove();
        const toast = document.createElement("div");
        toast.id = "chatToast";
        toast.style.cssText = "position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--text); color: var(--surface); padding: 10px 20px; border-radius: var(--radius); font-size: 13px; z-index: 9999; box-shadow: var(--shadow-lg); animation: fadeIn 0.2s ease;";
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2800);
      }

      chatSendBtn?.addEventListener("click", sendChatMessage);
      chatInputMsg?.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } });

      document.getElementById("chatTemplatePriceBtn")?.addEventListener("click", () => {
        const t = "Добрый день! Актуальный прайс на услуги клиники прикреплён. Если нужна консультация — запишем на удобное время.";
        if (chatInputMsg) { chatInputMsg.value = t; chatInputMsg.focus(); }
      });

      function applyChatSearch() {
        const input = document.getElementById("chatSearchInput");
        const list = document.getElementById("chatListContainer");
        if (!input || !list) return;
        const q = (input.value || "").trim().toLowerCase();
        const qDigits = q.replace(/\D/g, "");
        list.querySelectorAll(".crm-chat-list-item").forEach((item) => {
          const name = (item.dataset.name || "").toLowerCase();
          const phone = (item.dataset.phone || "").replace(/\D/g, "");
          const match = !q || name.includes(q) || phone.includes(qDigits);
          item.style.display = match ? "flex" : "none";
        });
      }
      page.addEventListener("input", (e) => {
        if (e.target && e.target.id === "chatSearchInput") applyChatSearch();
      });

      // Right panel: Call / Schedule (delegate)
      page.addEventListener("click", (e) => {
        if (e.target.closest(".crm-patient-call")) {
          if (!currentChatPatient?.phone) {
            showChatToast("Сначала выберите чат с пациентом");
            return;
          }
          const digits = currentChatPatient.phone.replace(/\D/g, "").replace(/^8/, "7");
          if (digits.length >= 10) window.location.href = "tel:+" + digits;
        }
        if (e.target.closest(".crm-patient-schedule")) {
          if (!currentChatPatient?.id) {
            showChatToast("Сначала выберите чат с пациентом");
            return;
          }
          openAddAppointmentModal(currentChatPatient.id);
        }
      });

    // AI Reply Simulation (chatInputMsg объявлен выше)
    const aiReplyBtn = document.getElementById("aiReplyBtn");
    if (aiReplyBtn && chatInputMsg) {
      aiReplyBtn.addEventListener("click", () => {
        chatInputMsg.value = "Добрый день! Да, конечно. У доктора Омарова есть окошко на 14:30. Записать вас?";
        chatInputMsg.focus();
      });
    }

    loadCalendarGrid();
  } catch (err) {
    page.innerHTML = renderError(
      err?.message || "Не удалось загрузить расписание",
    );
  }
}

async function loadCalendarGrid() {
  const { doctors, selectedDoctorId, selectedDate } = getState();
  const box = document.getElementById("scheduleContent");
  if (!box) return;
  try {
    box.innerHTML = renderLoading();
    const doctorsToShow = selectedDoctorId
      ? doctors.filter((d) => d.id === selectedDoctorId)
      : doctors;
    if (!doctorsToShow.length) {
      box.innerHTML = renderEmpty();
      return;
    }
    const arrays = await Promise.all(
      doctorsToShow.map((d) => getSchedule(d.id, selectedDate)),
    );
    const all = arrays
      .flat()
      .map((a) => ({ ...a, duration: a.duration || 30 }));
    
    // Always render the grid, even if empty, to match standard calendar view
    box.innerHTML = renderCalendarGrid({
      doctors: doctorsToShow,
      appointments: all,
      selectedDate,
    });
    syncCalendarHorizontalScroll(box);
  } catch (err) {
    box.innerHTML = renderError(err?.message || "Не удалось загрузить данные");
  }
}

// Remove unused syncCalendarHorizontalScroll duplicate
function syncCalendarHorizontalScroll(scopeEl) {
  const yScroll = scopeEl.querySelector('[data-cal-y="1"]');
  const headerX = scopeEl.querySelector('[data-cal-x="header"]');
  const gridX = scopeEl.querySelector('[data-cal-x="grid"]');
  const doctorsHeader = headerX?.querySelector(".calendar-doctors-header");
  if (!yScroll || !headerX || !gridX) return;
  if (gridX.dataset.scrollSync === "1") return;
  gridX.dataset.scrollSync = "1";

  const updateGutter = () => {
    const w = yScroll.offsetWidth - yScroll.clientWidth;
    yScroll
      .closest(".calendar-grid-wrapper")
      ?.style.setProperty("--calendar-vscrollbar", `${w}px`);
  };
  updateGutter();
  requestAnimationFrame(updateGutter);
  requestAnimationFrame(updateGutter);
  if (typeof ResizeObserver !== "undefined" && !yScroll[CAL_GUTTER_RO]) {
    const ro = new ResizeObserver(() => updateGutter());
    ro.observe(yScroll);
    yScroll[CAL_GUTTER_RO] = ro;
  }

  const renderHeader = () => {
    if (!doctorsHeader) return;
    doctorsHeader.style.transform = `translateX(${-gridX.scrollLeft}px)`;
  };
  renderHeader();

  gridX.addEventListener(
    "scroll",
    () => {
      renderHeader();
    },
    { passive: true },
  );

  // Allow scrolling from header area, but drive the single grid scrollbar
  headerX.addEventListener(
    "wheel",
    (e) => {
      if (e.deltaX === 0) return;
      gridX.scrollLeft += e.deltaX;
      e.preventDefault();
    },
    { passive: false },
  );

  // initial alignment (e.g. after re-render)
  renderHeader();
}

async function openAddAppointmentModal(preselectedPatientId) {
  const { doctors, selectedDate } = getState();
  let patients = [];
  try {
    patients = await searchPatients("");
  } catch {}
  openModal({
    title: "Новая запись",
    content: renderAddAppointmentForm({ doctors, patients }),
  });

  const form = document.getElementById("addApptForm");
  const errBox = document.getElementById("apptFormError");
  const saveBtn = document.getElementById("saveApptBtn");
  const dateInput = form?.querySelector('[name="date"]');
  const patientSelect = form?.querySelector('[name="patientId"]');
  if (dateInput) dateInput.value = selectedDate;
  if (patientSelect && preselectedPatientId) {
    patientSelect.value = preselectedPatientId;
  }

  document
    .getElementById("cancelApptForm")
    ?.addEventListener("click", closeModal);
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    errBox.textContent = "";
    saveBtn.disabled = true;
    const old = saveBtn.textContent;
    saveBtn.textContent = "Создаём...";
    try {
      const fd = new FormData(form);
      await createAppointment({
        doctorId: fd.get("doctorId"),
        patientId: fd.get("patientId"),
        date: fd.get("date"),
        time: fd.get("time"),
        duration: Number(fd.get("duration")),
      });
      closeModal();
      setState({ selectedDate: fd.get("date") });
      loadCalendarGrid();
    } catch (err) {
      errBox.textContent = err?.message || "Ошибка создания записи";
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = old;
    }
  });
}
