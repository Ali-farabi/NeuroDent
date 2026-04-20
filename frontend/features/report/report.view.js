// features/report/report.view.js

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderReportPage({ date }) {
  return `
    <div class="report-container report-page-gaps-zero" style="max-width: 100%; margin: 0 auto;">
      
      <!-- 1 бокс: заголовок + дата + Обновить -->
      <div class="report-header-box">
        <div style="display: flex; justify-content: space-between; align-items: flex-end;">
          <div>
            <h1 style="font-size: 24px; font-weight: 800; margin: 0 0 4px 0; color: var(--text);">Business Analytics</h1>
            <p style="color: var(--muted); margin: 0; font-size: 14px;">Ключевые показатели клиники и контроль врачей</p>
          </div>
          <div style="display: flex; gap: 12px;">
            <input id="reportDate" class="input" type="date" value="${date}" style="padding: 8px 12px; height: 36px;" />
            <button id="refreshReportBtn" class="btn btn-secondary" type="button" style="height: 36px;" title="Обновить">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div id="reportState"></div>

      <!-- 1 бокс: RISK ALERTS (заголовок + 2 алерта внутри) -->
      <div class="report-risk-alerts-box">
        <h2 style="font-size: 14px; font-weight: 700; color: var(--muted); text-transform: uppercase; margin: 0 0 12px 0; letter-spacing: 0.5px;">Risk Alerts</h2>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 0; border-top: 1px solid var(--border);">
           <div class="report-risk-alert-item" style="background: rgba(239, 68, 68, 0.05); border-right: 1px solid var(--border); padding: 16px; display: flex; gap: 12px;">
             <div style="font-size: 24px;">📉</div>
             <div>
               <div style="font-weight: 600; color: var(--danger); font-size: 14px; margin-bottom: 4px;">Снижение доходимости</div>
               <div style="font-size: 13px; color: var(--muted); line-height: 1.4;">За последние 3 дня доходимость пациентов к ортодонту упала до 45% (норма 70%). Рекомендуется проверить скрипты админов.</div>
             </div>
           </div>
           <div class="report-risk-alert-item" style="background: rgba(245, 158, 11, 0.05); padding: 16px; display: flex; gap: 12px;">
             <div style="font-size: 24px;">📦</div>
             <div>
               <div style="font-weight: 600; color: #d97706; font-size: 14px; margin-bottom: 4px;">Запасы на исходе</div>
               <div style="font-size: 13px; color: var(--muted); line-height: 1.4;">Слепочная масса Speedex достигла критического минимума (4 упак). Необходимо срочно сделать заказ у поставщика.</div>
             </div>
           </div>
        </div>
      </div>

      <!-- Сводка (Сквозная аналитика) -->
      <div id="reportSummary" class="report-summary-wrap"></div>

      <div class="report-panels-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));">
        
        <!-- Контроль врачей (Рейтинг) -->
        <div class="report-panel" style="background: var(--surface); border: 1px solid var(--border); padding: 20px; box-shadow: var(--shadow-sm);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
             <h2 style="font-size: 16px; font-weight: 700; margin: 0;">Контроль врачей</h2>
             <span class="badge" style="background: var(--surface-2); color: var(--text);">Топ по выручке</span>
          </div>
          
          <div class="stack" style="gap: 16px;">
            <!-- Доктор 1 -->
            <div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <div style="width: 24px; height: 24px; background: var(--primary-100); color: var(--primary-700); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">1</div>
                  <span style="font-weight: 600; font-size: 14px;">Dr. Johnson (Стоматолог)</span>
                </div>
                <span style="font-weight: 700; font-size: 14px;">185 000 ₸</span>
              </div>
              <div style="height: 6px; background: var(--surface-2); border-radius: 3px; overflow: hidden;">
                <div style="height: 100%; width: 100%; background: var(--primary); border-radius: 3px;"></div>
              </div>
              <div style="display: flex; justify-content: space-between; margin-top: 6px; font-size: 11px; color: var(--muted);">
                <span>Соблюдение протоколов: 98%</span>
                <span style="color: var(--success);">Средний чек: 35 000 ₸</span>
              </div>
            </div>

            <!-- Доктор 2 -->
            <div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <div style="width: 24px; height: 24px; background: var(--surface-2); color: var(--muted); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">2</div>
                  <span style="font-weight: 600; font-size: 14px;">Dr. Nguyen (Ортодонт)</span>
                </div>
                <span style="font-weight: 700; font-size: 14px;">120 000 ₸</span>
              </div>
              <div style="height: 6px; background: var(--surface-2); border-radius: 3px; overflow: hidden;">
                <div style="height: 100%; width: 65%; background: #3b82f6; border-radius: 3px;"></div>
              </div>
              <div style="display: flex; justify-content: space-between; margin-top: 6px; font-size: 11px; color: var(--muted);">
                <span>Соблюдение протоколов: 92%</span>
                <span style="color: var(--success);">Средний чек: 60 000 ₸</span>
              </div>
            </div>

            <!-- Доктор 3 -->
            <div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <div style="width: 24px; height: 24px; background: var(--surface-2); color: var(--muted); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">3</div>
                  <span style="font-weight: 600; font-size: 14px;">Dr. Smith (Терапевт)</span>
                </div>
                <span style="font-weight: 700; font-size: 14px;">45 000 ₸</span>
              </div>
              <div style="height: 6px; background: var(--surface-2); border-radius: 3px; overflow: hidden;">
                <div style="height: 100%; width: 25%; background: #f59e0b; border-radius: 3px;"></div>
              </div>
              <div style="display: flex; justify-content: space-between; margin-top: 6px; font-size: 11px; color: var(--muted);">
                <span>Соблюдение протоколов: <span style="color: #d97706">75% (Отклонения)</span></span>
                <span>Средний чек: 15 000 ₸</span>
              </div>
            </div>

          </div>
        </div>

        <!-- Выручка по специальностям (Фейковый чарт) -->
        <div class="report-panel" style="background: var(--surface); border: 1px solid var(--border); padding: 20px; box-shadow: var(--shadow-sm); display: flex; flex-direction: column;">
          <h2 style="font-size: 16px; font-weight: 700; margin: 0 0 20px 0;">Выручка по направлениям</h2>
          
          <!-- Имитация круговой диаграммы с помощью CSS -->
          <div style="display: flex; align-items: center; gap: 32px; flex: 1;">
            <div style="position: relative; width: 140px; height: 140px; border-radius: 50%; background: conic-gradient(var(--primary) 0% 50%, #10b981 50% 80%, #f59e0b 80% 100%); display: flex; align-items: center; justify-content: center; box-shadow: inset 0 0 0 25px var(--surface);">
               <div style="text-align: center;">
                 <div style="font-weight: 800; font-size: 16px; color: var(--text);">350K ₸</div>
               </div>
            </div>
            
            <div class="stack" style="gap: 12px; flex: 1;">
              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <div style="width: 10px; height: 10px; background: var(--primary); border-radius: 2px;"></div>
                  <span>Ортопедия</span>
                </div>
                <span style="font-weight: 600;">50%</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <div style="width: 10px; height: 10px; background: #10b981; border-radius: 2px;"></div>
                  <span>Хирургия</span>
                </div>
                <span style="font-weight: 600;">30%</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <div style="width: 10px; height: 10px; background: #f59e0b; border-radius: 2px;"></div>
                  <span>Терапия</span>
                </div>
                <span style="font-weight: 600;">20%</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- Детализация оплат -->
      <div class="report-panel report-detail-panel" style="background: var(--surface); border: 1px solid var(--border); padding: 20px; box-shadow: var(--shadow-sm);">
        <h2 style="font-size: 16px; font-weight: 700; margin: 0 0 16px 0;">Последние транзакции (Детализация)</h2>
        <div id="reportPayments"></div>
      </div>

    </div>
  `;
}

export function renderLoading(text = "Загрузка…") {
  return `
    <div class="payments-empty" style="margin-top:16px;">
      <div class="spinner"></div>
      <div class="state-text">${escapeHtml(text)}</div>
    </div>
  `;
}

export function renderError(message) {
  return `
    <div class="payments-empty" style="margin-top:16px;">
      <div class="state-icon">⚠️</div>
      <div class="form-error" style="min-height:auto;">${escapeHtml(message)}</div>
    </div>
  `;
}

export function renderSummary({ totalAmount, visitsCompleted, aiSignals }) {
  // Фейковые данные для красивого отображения (в реальном проекте берутся из API)
  const avgCheck = visitsCompleted ? Math.round(totalAmount / visitsCompleted) : 0;
  const deepCariesCount = aiSignals?.cariesByType?.deep || 0;
  const deepStatus =
    deepCariesCount > 0 ? "Есть случаи" : "Нет случаев";
  
  return `
    <div class="report-summary-cards" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
      
      <!-- Выручка -->
      <div class="report-summary-card" style="background: var(--surface); border: 1px solid var(--border); padding: 20px; box-shadow: var(--shadow-sm);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
          <div style="font-size: 13px; color: var(--muted); font-weight: 600; text-transform: uppercase;">Общая выручка</div>
          <div style="background: rgba(16, 185, 129, 0.1); color: var(--success); padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">+12%</div>
        </div>
        <div style="font-size: 28px; font-weight: 800; color: var(--text);">${Number(totalAmount).toLocaleString()} ₸</div>
      </div>

      <!-- Визиты -->
      <div class="report-summary-card" style="background: var(--surface); border: 1px solid var(--border); padding: 20px; box-shadow: var(--shadow-sm);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
          <div style="font-size: 13px; color: var(--muted); font-weight: 600; text-transform: uppercase;">Завершённые визиты</div>
          <div style="background: rgba(16, 185, 129, 0.1); color: var(--success); padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">+3 визита</div>
        </div>
        <div style="font-size: 28px; font-weight: 800; color: var(--text);">${Number(visitsCompleted)}</div>
      </div>

      <!-- Средний чек -->
      <div class="report-summary-card" style="background: var(--surface); border: 1px solid var(--border); padding: 20px; box-shadow: var(--shadow-sm);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
          <div style="font-size: 13px; color: var(--muted); font-weight: 600; text-transform: uppercase;">Средний чек</div>
          <div style="background: rgba(239, 68, 68, 0.1); color: var(--danger); padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">-5%</div>
        </div>
        <div style="font-size: 28px; font-weight: 800; color: var(--text);">${avgCheck.toLocaleString()} ₸</div>
      </div>

      <!-- Маржинальность -->
      <div class="report-summary-card" style="background: var(--surface); border: 1px solid var(--border); padding: 20px; box-shadow: var(--shadow-sm);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
          <div style="font-size: 13px; color: var(--muted); font-weight: 600; text-transform: uppercase;">Глубокий кариес (AI)</div>
          <div style="background: var(--surface-2); color: var(--muted); padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">${escapeHtml(deepStatus)}</div>
        </div>
        <div style="font-size: 28px; font-weight: 800; color: var(--text);">${deepCariesCount}</div>
      </div>

    </div>
  `;
}

export function renderEmptyPayments() {
  return `
    <div class="payments-empty" style="margin-top:0;">
      <div class="state-icon">💰</div>
      <div class="state-text" style="margin-top:0;">Нет оплат за эту дату</div>
    </div>
  `;
}

export function renderPaymentsTable(list) {
  const total = list.reduce((s, p) => s + Number(p.amount), 0);
  return `
    <div class="payments-summary" style="background: var(--surface-2); padding: 12px 16px; border-radius: var(--radius); display: flex; justify-content: space-between; border: 1px solid var(--border);">
      <div class="payments-summary-item" style="font-size: 14px;">
        <span class="payments-summary-label" style="color: var(--muted);">Всего транзакций:</span>
        <span class="payments-summary-value" style="font-weight: 600;">${list.length}</span>
      </div>
      <div class="payments-summary-item" style="font-size: 14px;">
        <span class="payments-summary-label" style="color: var(--muted);">Сумма за период:</span>
        <span class="payments-summary-value payments-summary-total" style="font-weight: 700; color: var(--primary);">${total.toLocaleString()} ₸</span>
      </div>
    </div>

    <div style="background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden;">
      <table style="width: 100%; text-align: left; border-collapse: collapse; font-size: 14px;">
        <thead style="background: var(--surface-2); border-bottom: 1px solid var(--border);">
          <tr>
            <th style="padding: 12px 16px; color: var(--muted); font-weight: 600;">Время</th>
            <th style="padding: 12px 16px; color: var(--muted); font-weight: 600;">Пациент</th>
            <th style="padding: 12px 16px; color: var(--muted); font-weight: 600;">Способ</th>
            <th style="padding: 12px 16px; color: var(--muted); font-weight: 600; text-align: right;">Сумма</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(p => `
            <tr style="border-bottom: 1px solid var(--border);">
              <td style="padding: 12px 16px; color: var(--text);">${escapeHtml(p.time)}</td>
              <td style="padding: 12px 16px; font-weight: 500;">${escapeHtml(p.patientName)}</td>
              <td style="padding: 12px 16px;">
                 <span class="badge" style="background: ${p.method === 'cash' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)'}; color: ${p.method === 'cash' ? 'var(--success)' : 'var(--primary)'}; border-color: transparent;">
                   ${p.method === "cash" ? "💵 Наличные" : "💳 Карта"}
                 </span>
              </td>
              <td style="padding: 12px 16px; text-align: right; font-weight: 600;">+${Number(p.amount).toLocaleString()} ₸</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
