import { getDayReport } from "../../core/api.js";
import { getState, setState } from "../../core/state.js";
import {
  renderReportPage,
  renderLoading,
  renderError,
  renderSummary,
  renderDoctorRanking,
  renderSpecialtyRevenue,
  renderEmptyPayments,
  renderPaymentsTable,
} from "./report.view.js";

export function mountReportPage() {
  const page = document.getElementById("page-content");
  const date = getState().selectedDate;
  page.innerHTML = renderReportPage({ date });

  const dateInput = document.getElementById("reportDate");
  const refreshBtn = document.getElementById("refreshReportBtn");
  const stateBox = document.getElementById("reportState");
  const summaryBox = document.getElementById("reportSummary");
  const paymentsBox = document.getElementById("reportPayments");
  const doctorRankingBox = document.getElementById("reportDoctorRanking");
  const specialtyRevenueBox = document.getElementById("reportSpecialtyRevenue");

  async function loadReport(d) {
    try {
      stateBox.innerHTML = renderLoading("Загрузка отчёта...");
      summaryBox.innerHTML = "";
      paymentsBox.innerHTML = "";
      const report = await getDayReport(d);
      setState({ selectedDate: d, payments: report.payments, aiSignals: report.aiSignals });
      stateBox.innerHTML = "";
      summaryBox.innerHTML = renderSummary({
        totalAmount: report.totalAmount,
        visitsCompleted: report.visitsCompleted,
        aiSignals: report.aiSignals,
      });
      if (doctorRankingBox) {
        doctorRankingBox.innerHTML = renderDoctorRanking(report.doctorRevenue || []);
      }
      if (specialtyRevenueBox) {
        specialtyRevenueBox.innerHTML = renderSpecialtyRevenue(report.specialtyRevenue || []);
      }
      if (!report.payments.length) {
        paymentsBox.innerHTML = renderEmptyPayments();
        return;
      }
      paymentsBox.innerHTML = renderPaymentsTable(report.payments);
    } catch (err) {
      stateBox.innerHTML = renderError(
        err?.message || "Не удалось загрузить отчёт",
      );
      summaryBox.innerHTML = "";
      paymentsBox.innerHTML = "";
    }
  }

  dateInput.addEventListener("change", () => loadReport(dateInput.value));
  refreshBtn.addEventListener("click", () => loadReport(dateInput.value));
  loadReport(date);
}
