import { getState } from "../../core/state.js";

export function renderPaymentsPage({ date, patients = [] }) {
  const { user } = getState();
  const isAdmin = user?.role === "admin";

  const patientOptions = patients.length
    ? patients
        .map(
          (p) =>
            `<option value="${p.id}">${escapeHtml(p.name)} — ${escapeHtml(p.phone)}</option>`,
        )
        .join("")
    : `<option value="">— нет пациентов —</option>`;

  return `
    <div class="payments-container finance-page">
      <!-- Tabs: segmented control -->
      <div class="finance-header">
        <div class="finance-tabs">
          <button type="button" class="finance-tab active" id="tab-btn-cash" data-tab="cash">Касса</button>
          ${!isAdmin ? `
          <button type="button" class="finance-tab" id="tab-btn-debtors" data-tab="debtors">Должники <span class="finance-tab-badge">2</span></button>
          <button type="button" class="finance-tab" id="tab-btn-inventory" data-tab="inventory">Склад</button>
          ` : ''}
        </div>
        ${!isAdmin ? `
        <button id="exportExcelBtn" class="finance-export-btn" type="button">
          <span>📊</span> Экспорт в Excel
        </button>
        ` : ''}
      </div>

      <!-- Tab: Касса -->
      <div id="tab-content-cash" class="finance-tab-panel" style="display: block;">
        <div class="finance-summary-cards">
          <div class="finance-summary-card">
            <span class="finance-summary-label">Платежей сегодня</span>
            <span class="finance-summary-value" id="financeStatCount">0</span>
          </div>
          <div class="finance-summary-card">
            <span class="finance-summary-label">Выручка</span>
            <span class="finance-summary-value finance-summary-value-primary" id="financeStatRevenue">0 ₸</span>
          </div>
          <div class="finance-summary-card">
            <span class="finance-summary-label">Транзакций</span>
            <span class="finance-summary-value" id="financeStatTransactions">0</span>
          </div>
          <div class="finance-summary-card">
            <span class="finance-summary-label">Средний чек</span>
            <span class="finance-summary-value" id="financeStatAvg">—</span>
          </div>
        </div>

        <div class="finance-form-card">
          <div class="finance-form-grid">
            <div class="finance-field">
              <label class="finance-label">Дата</label>
              <input id="payDate" class="finance-input" type="date" value="${date}" />
            </div>
            <div class="finance-field">
              <label class="finance-label">Пациент</label>
              <select id="payPatient" class="finance-input">
                ${patientOptions}
              </select>
            </div>
            <div class="finance-field">
              <label class="finance-label">Сумма</label>
              <input id="payAmount" class="finance-input" type="number" placeholder="0" min="0" />
            </div>
            <div class="finance-field">
              <label class="finance-label">Метод</label>
              <select id="payMethod" class="finance-input">
                <option value="cash">Наличные</option>
                <option value="card">Карта</option>
              </select>
            </div>
            <div class="finance-field finance-field-actions">
              <label class="finance-label">&nbsp;</label>
              <div class="finance-actions">
                <button id="paySubmit" class="finance-submit-btn" type="button">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                  Принять
                </button>
                <button id="printReceiptBtn" class="finance-print-btn btn btn-secondary" type="button" style="display: none;" title="Печать чека">🖨️</button>
              </div>
            </div>
          </div>
        </div>

        <div id="payError" class="payments-error finance-error"></div>

        <div class="finance-list-wrap">
          <div id="paymentsState"></div>
          <div id="paymentsTable" class="finance-tx-list"></div>
        </div>
      </div>

      <!-- Tab: Должники -->
      <div id="tab-content-debtors" class="finance-tab-panel" style="display: none;">
        <div class="finance-form-card" style="margin-bottom: 20px;">
          <div class="finance-toolbar-row">
            <input id="debtorsSearch" class="finance-input finance-search" placeholder="Поиск должника..." />
            <button type="button" class="btn btn-secondary">Отправить напоминания всем</button>
          </div>
        </div>
        <div class="finance-card">
          <div id="debtorsTableContainer"></div>
        </div>
      </div>

      <!-- Tab: Склад -->
      <div id="tab-content-inventory" class="finance-tab-panel" style="display: none;">
        <div class="finance-form-card" style="margin-bottom: 20px;">
          <div class="finance-toolbar-row">
            <input id="inventorySearch" class="finance-input finance-search" placeholder="Поиск материалов..." />
            <button type="button" id="addInventoryBtn" class="btn finance-add-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Поступление
            </button>
          </div>
        </div>
        <div id="inventoryState"></div>
        <div id="inventoryTable" class="finance-card"></div>
      </div>
    </div>
  `;
}

export function renderLoading(text = "Загрузка…") {
  return `
    <div class="payments-empty">
      <div class="spinner"></div>
      <div class="state-text">${escapeHtml(text)}</div>
    </div>
  `;
}

export function renderError(message) {
  return `
    <div class="payments-empty">
      <div class="state-icon">⚠️</div>
      <div class="form-error" style="min-height:auto;">${escapeHtml(message)}</div>
    </div>
  `;
}

export function renderEmpty() {
  return `
    <div class="payments-empty">
      <div class="state-icon">💰</div>
      <div class="state-text" style="margin-top:0;">Нет платежей за эту дату</div>
    </div>
  `;
}

export function renderPaymentsTable(list) {
  return `
    <div class="finance-tx-rows">
      ${(list || [])
        .map(
          (p) => {
            const methodClass = p.method === "card" ? "finance-badge-card" : "finance-badge-cash";
            const methodLabel = p.method === "cash" ? "Наличные" : "Карта";
            return `
        <div class="finance-tx-row">
          <div class="finance-tx-dot"></div>
          <div class="finance-tx-main">
            <span class="finance-tx-patient">${escapeHtml(p.patientName)}</span>
            <span class="finance-tx-meta">${escapeHtml(p.time)} · <span class="finance-badge ${methodClass}">${methodLabel}</span></span>
          </div>
          <div class="finance-tx-amount">${Number(p.amount).toLocaleString()} ₸</div>
        </div>
      `;
          },
        )
        .join("")}
    </div>
  `;
}

export function renderDebtorsTable(debtors) {
  if (!debtors || !debtors.length) {
    return `<div class="payments-empty"><div class="state-icon">✅</div><div class="state-text" style="margin-top:0;">Должников нет</div></div>`;
  }
  
  return `
    <table style="width: 100%; text-align: left; border-collapse: collapse; font-size: 14px;">
      <thead style="background: rgba(239, 68, 68, 0.05); border-bottom: 1px solid rgba(239, 68, 68, 0.2);">
        <tr>
          <th style="padding: 12px 16px; color: var(--danger); font-weight: 600;">Пациент</th>
          <th style="padding: 12px 16px; color: var(--danger); font-weight: 600;">Долг</th>
          <th style="padding: 12px 16px; color: var(--danger); font-weight: 600;">Дата визита</th>
          <th style="padding: 12px 16px; color: var(--danger); font-weight: 600; text-align: right;">Действие</th>
        </tr>
      </thead>
      <tbody>
        ${debtors.map(d => `
        <tr style="border-bottom: 1px solid var(--border);">
          <td style="padding: 12px 16px; font-weight: 600;">
            ${escapeHtml(d.patientName)} 
            <div style="font-size: 11px; color: var(--muted); font-weight: normal;">${escapeHtml(d.phone)}</div>
          </td>
          <td style="padding: 12px 16px; color: var(--danger); font-weight: 700;">
            ${Number(d.debt).toLocaleString()} ₸ 
            <div style="font-size: 11px; color: var(--muted); font-weight: normal;">Остаток за лечение</div>
          </td>
          <td style="padding: 12px 16px; color: var(--muted);">${escapeHtml(d.date)}</td>
          <td style="padding: 12px 16px; text-align: right;">
            <button class="btn btn-secondary" style="font-size: 12px; padding: 4px 8px; min-height: auto;">Напомнить (WhatsApp)</button>
            <button class="btn" style="background: var(--success); color: white; font-size: 12px; padding: 4px 8px; min-height: auto; margin-left: 8px;">Погасить</button>
          </td>
        </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

export function renderInventoryTable(items) {
  if (!items || !items.length) {
    return `<div class="payments-empty"><div class="state-icon">📦</div><div class="state-text" style="margin-top:0;">Склад пуст</div></div>`;
  }
  
  return `
    <div style="background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden;">
      <table style="width: 100%; text-align: left; border-collapse: collapse; font-size: 14px;">
        <thead style="background: var(--surface-2); border-bottom: 1px solid var(--border);">
          <tr>
            <th style="padding: 12px 16px; color: var(--muted); font-weight: 600;">Наименование</th>
            <th style="padding: 12px 16px; color: var(--muted); font-weight: 600;">Категория</th>
            <th style="padding: 12px 16px; color: var(--muted); font-weight: 600;">Остаток</th>
            <th style="padding: 12px 16px; color: var(--muted); font-weight: 600; text-align: right;">Действия</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => {
            const isLow = item.quantity <= item.minQuantity;
            const qtyStyle = isLow ? 'color: var(--danger); font-weight: 700;' : 'color: var(--text);';
            return `
              <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 12px 16px; font-weight: 500;">
                  ${escapeHtml(item.name)}
                  ${isLow ? `<span class="badge" style="background: rgba(239, 68, 68, 0.1); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.2); margin-left: 8px; font-size: 10px;">Мало</span>` : ''}
                </td>
                <td style="padding: 12px 16px; color: var(--muted);">${escapeHtml(item.category)}</td>
                <td style="padding: 12px 16px; ${qtyStyle}">${item.quantity} ${escapeHtml(item.unit)}</td>
                <td style="padding: 12px 16px; text-align: right;">
                   <button class="btn btn-secondary inventory-minus" data-id="${item.id}" style="padding: 4px 8px; min-height: auto; font-size: 12px; border-color: var(--border-strong);">-1</button>
                   <button class="btn btn-secondary inventory-plus" data-id="${item.id}" style="padding: 4px 8px; min-height: auto; font-size: 12px; border-color: var(--border-strong); margin-left: 4px;">+1</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

export function renderAddInventoryForm() {
  return `
    <form id="inventoryForm" class="stack">
      <label class="field">
        <span class="field-label">Наименование</span>
        <input class="input" name="name" placeholder="Например: Имплант Straumann" required />
      </label>
      <label class="field">
        <span class="field-label">Категория</span>
        <select class="input" name="category" required>
          <option value="Имплантология">Имплантология</option>
          <option value="Анестезия">Анестезия</option>
          <option value="Терапия">Терапия</option>
          <option value="Ортопедия">Ортопедия</option>
          <option value="Расходники">Расходники</option>
        </select>
      </label>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <label class="field">
          <span class="field-label">Количество</span>
          <input class="input" type="number" name="quantity" placeholder="0" min="0" required />
        </label>
        <label class="field">
          <span class="field-label">Единица изм.</span>
          <input class="input" name="unit" placeholder="шт, амп..." value="шт" required />
        </label>
      </div>
      <label class="field">
        <span class="field-label">Мин. остаток (для оповещения)</span>
        <input class="input" type="number" name="minQuantity" placeholder="5" min="0" required />
      </label>
      
      <div id="invFormError" class="form-error"></div>
      <div class="row row-end row-gap-8" style="margin-top: 16px;">
        <button class="btn btn-secondary" type="button" id="cancelInvForm">Отмена</button>
        <button class="btn" type="submit" id="saveInvBtn">Добавить</button>
      </div>
    </form>
  `;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
