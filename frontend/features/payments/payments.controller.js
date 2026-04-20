import {
  createPayment,
  getPaymentsByDate,
  searchPatients,
  getInventoryItems,
  addInventoryItem,
  updateInventoryQuantity
} from "../../core/api.js";
import { getState, setState } from "../../core/state.js";
import { openModal, closeModal } from "../../ui/modal.js";
import { renderDebtorsTable, renderPaymentsPage, renderLoading, renderError, renderEmpty, renderPaymentsTable, renderInventoryTable, renderAddInventoryForm } from "./payments.view.js";

export async function mountPaymentsPage() {
  const page = document.getElementById("page-content");
  const date = getState().selectedDate;

  let patients = [];
  try {
    patients = await searchPatients("");
  } catch {}

  page.innerHTML = renderPaymentsPage({ date, patients });

  // Cash Tab Elements
  const dateInput = document.getElementById("payDate");
  const patientSelect = document.getElementById("payPatient");
  const amountInput = document.getElementById("payAmount");
  const methodSelect = document.getElementById("payMethod");
  const submitBtn = document.getElementById("paySubmit");
  const errBox = document.getElementById("payError");
  const stateBox = document.getElementById("paymentsState");
  const tableBox = document.getElementById("paymentsTable");

  // Inventory Tab Elements
  const invStateBox = document.getElementById("inventoryState");
  const invTableBox = document.getElementById("inventoryTable");
  const invSearchInput = document.getElementById("inventorySearch");
  const addInvBtn = document.getElementById("addInventoryBtn");

  // Tabs
  const btnCash = document.getElementById("tab-btn-cash");
  const btnDebtors = document.getElementById("tab-btn-debtors");
  const btnInv = document.getElementById("tab-btn-inventory");
  const contentCash = document.getElementById("tab-content-cash");
  const contentDebtors = document.getElementById("tab-content-debtors");
  const contentInv = document.getElementById("tab-content-inventory");

  let inventoryTimer = null;

  // Excel Export Logic
  const exportExcelBtn = document.getElementById("exportExcelBtn");
  if (exportExcelBtn) {
    exportExcelBtn.addEventListener("click", () => {
      exportExcelBtn.innerHTML = '<div class="spinner" style="width: 14px; height: 14px; border-color: var(--primary); border-right-color: transparent;"></div> Экспорт...';
      setTimeout(() => {
        exportExcelBtn.innerHTML = '<span>✅</span> Скачано';
        exportExcelBtn.style.color = 'var(--success)';
        
        // Создаем фейковый CSV файл и скачиваем
        const csvContent = "data:text/csv;charset=utf-8,Дата,Пациент,Сумма,Метод\n2023-10-10,Ерлан Муратов,150000,cash\n2023-10-11,Аружан,25000,card";
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "payments_export.csv");
        document.body.appendChild(link);
        link.click();
        link.remove();
        
        setTimeout(() => {
          exportExcelBtn.innerHTML = '<span>📊</span> Экспорт в Excel';
          exportExcelBtn.style.color = '';
        }, 3000);
      }, 1000);
    });
  }

  // --- DEBTORS LOGIC ---
  async function loadDebtors(query = "") {
    const debtorsContainer = document.getElementById("debtorsTableContainer");
    if (!debtorsContainer) return;
    
    try {
      debtorsContainer.innerHTML = renderLoading("Поиск должников...");
      
      // Имитация логики: берем всех пациентов и притворяемся, что у некоторых есть долг,
      // если их ID четный или что-то вроде того, чтобы показать динамику из БД.
      // В реальном проекте мы бы проверяли (стоимость визитов - оплачено).
      let allPatients = await searchPatients(query);
      
      const debtors = allPatients
        .filter((p, i) => i % 2 === 0) // Имитация: каждый второй имеет долг
        .map(p => ({
          patientName: p.name,
          phone: p.phone,
          debt: 15000 * (p.name.length % 3 + 1), // Случайная сумма долга
          date: p.createdAt
        }));

      if (!debtors.length) {
         debtorsContainer.innerHTML = `<div class="payments-empty"><div class="state-icon">✅</div><div class="state-text" style="margin-top:0;">Должников не найдено</div></div>`;
         return;
      }
      
      debtorsContainer.innerHTML = renderDebtorsTable(debtors);
    } catch (err) {
      debtorsContainer.innerHTML = renderError("Не удалось загрузить список должников");
    }
  }

  const debtorsSearch = document.getElementById("debtorsSearch");
  if (debtorsSearch) {
    let debtTimer = null;
    debtorsSearch.addEventListener("input", (e) => {
      clearTimeout(debtTimer);
      debtTimer = setTimeout(() => loadDebtors(e.target.value), 300);
    });
  }

  // Tab switching logic (finance-tab active class)
  const switchTab = (tab) => {
    [btnCash, btnDebtors, btnInv].filter(Boolean).forEach((btn) => {
      btn.classList.remove("active");
    });
    if (tab === "cash" && btnCash) btnCash.classList.add("active");
    if (tab === "debtors" && btnDebtors) btnDebtors.classList.add("active");
    if (tab === "inventory" && btnInv) btnInv.classList.add("active");

    if (contentCash) contentCash.style.display = tab === "cash" ? "block" : "none";
    if (contentDebtors) contentDebtors.style.display = tab === "debtors" ? "block" : "none";
    if (contentInv) contentInv.style.display = tab === "inventory" ? "block" : "none";

    if (tab === "cash") loadPayments(dateInput.value);
    else if (tab === "inventory") loadInventory();
    else if (tab === "debtors") loadDebtors();
  };

  btnCash?.addEventListener("click", () => switchTab("cash"));
  btnDebtors?.addEventListener("click", () => switchTab("debtors"));
  btnInv?.addEventListener("click", () => switchTab("inventory"));

  // Initial load
  loadPayments(date);

  // --- CASH LOGIC ---

  dateInput.addEventListener("change", () => {
    setState({ selectedDate: dateInput.value });
    loadPayments(dateInput.value);
  });

  submitBtn.addEventListener("click", async () => {
    errBox.textContent = "";
    const amount = Number(amountInput.value);
    const method = methodSelect.value;
    const patientId = patientSelect?.value;

    if (!Number.isFinite(amount) || amount <= 0) {
      errBox.textContent = "Введите корректную сумму";
      return;
    }
    if (!patientId) {
      errBox.textContent = "Выберите пациента";
      return;
    }

    submitBtn.disabled = true;
    const oldHtml = submitBtn.innerHTML;
    submitBtn.textContent = "Загрузка...";

    try {
      await createPayment({
        date: dateInput.value,
        amount,
        method,
        patientId,
        visitId: null,
      });
      amountInput.value = "";
      await loadPayments(dateInput.value);
      
      // Show print receipt button
      const printBtn = document.getElementById("printReceiptBtn");
      if (printBtn) {
        printBtn.style.display = "block";
        printBtn.onclick = () => {
          alert(`Печать чека:\nПациент: ${patientSelect.options[patientSelect.selectedIndex].text}\nСумма: ${amount} ₸\nМетод: ${method === 'cash' ? 'Наличные' : 'Карта'}\nДата: ${new Date().toLocaleString()}`);
        };
      }
    } catch (err) {
      errBox.textContent = err?.message || "Ошибка при оплате";
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = oldHtml;
    }
  });

  function updateFinanceSummary(list) {
    const countEl = document.getElementById("financeStatCount");
    const revenueEl = document.getElementById("financeStatRevenue");
    const txEl = document.getElementById("financeStatTransactions");
    const avgEl = document.getElementById("financeStatAvg");
    const count = list.length;
    const total = list.reduce((sum, p) => sum + Number(p.amount), 0);
    const avg = count > 0 ? Math.round(total / count) : 0;
    if (countEl) countEl.textContent = String(count);
    if (revenueEl) revenueEl.textContent = total.toLocaleString() + " ₸";
    if (txEl) txEl.textContent = String(count);
    if (avgEl) avgEl.textContent = count > 0 ? avg.toLocaleString() + " ₸" : "—";
  }

  async function loadPayments(date) {
    try {
      stateBox.innerHTML = renderLoading("Загрузка оплат...");
      tableBox.innerHTML = "";
      const list = await getPaymentsByDate(date);
      setState({ payments: list });
      updateFinanceSummary(list || []);
      if (!list.length) {
        stateBox.innerHTML = renderEmpty();
        tableBox.innerHTML = "";
        return;
      }
      stateBox.innerHTML = "";
      tableBox.innerHTML = renderPaymentsTable(list);
    } catch (err) {
      stateBox.innerHTML = renderError(
        err?.message || "Не удалось загрузить оплаты",
      );
      tableBox.innerHTML = "";
      updateFinanceSummary([]);
    }
  }

  // --- INVENTORY LOGIC ---

  async function loadInventory(query = "") {
    try {
      invStateBox.innerHTML = renderLoading("Загрузка склада...");
      invTableBox.innerHTML = "";
      const allItems = await getInventoryItems();
      
      const q = query.trim().toLowerCase();
      const list = allItems.filter(item => 
        !q || item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)
      );

      if (!list.length) {
        invStateBox.innerHTML = `<div class="payments-empty"><div class="state-icon">📦</div><div class="state-text" style="margin-top:0;">Материалы не найдены</div></div>`;
        return;
      }
      
      invStateBox.innerHTML = "";
      invTableBox.innerHTML = renderInventoryTable(list);
    } catch (err) {
      invStateBox.innerHTML = renderError(
        err?.message || "Не удалось загрузить склад",
      );
    }
  }

  invSearchInput.addEventListener("input", (e) => {
    clearTimeout(inventoryTimer);
    inventoryTimer = setTimeout(() => loadInventory(e.target.value), 300);
  });

  addInvBtn.addEventListener("click", () => {
    openModal({
      title: "Новое поступление",
      content: renderAddInventoryForm(),
    });

    const form = document.getElementById("inventoryForm");
    const cancelBtn = document.getElementById("cancelInvForm");
    const saveBtn = document.getElementById("saveInvBtn");
    const errBox = document.getElementById("invFormError");

    cancelBtn.addEventListener("click", closeModal);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errBox.textContent = "";
      saveBtn.disabled = true;
      const old = saveBtn.textContent;
      saveBtn.textContent = "Добавляем...";

      try {
        const fd = new FormData(form);
        await addInventoryItem({
          name: fd.get("name"),
          category: fd.get("category"),
          quantity: fd.get("quantity"),
          unit: fd.get("unit"),
          minQuantity: fd.get("minQuantity"),
        });
        closeModal();
        loadInventory(invSearchInput.value);
      } catch (err) {
        errBox.textContent = err?.message || "Ошибка добавления";
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = old;
      }
    });
  });

  invTableBox.addEventListener("click", async (e) => {
    const btnPlus = e.target.closest(".inventory-plus");
    const btnMinus = e.target.closest(".inventory-minus");
    
    if (btnPlus) {
      const id = btnPlus.dataset.id;
      btnPlus.disabled = true;
      try {
        await updateInventoryQuantity(id, 1);
        await loadInventory(invSearchInput.value);
      } catch(err) {
        alert(err.message);
      }
    } else if (btnMinus) {
      const id = btnMinus.dataset.id;
      btnMinus.disabled = true;
      try {
        await updateInventoryQuantity(id, -1);
        await loadInventory(invSearchInput.value);
      } catch(err) {
        alert(err.message);
      }
    }
  });
}
