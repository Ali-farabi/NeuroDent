function pad(n) {
  return String(n).padStart(2, "0");
}
function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseISODate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}
function startOfWeekMonday(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -6 : 1) - day; // to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function monthTitle(date) {
  return date.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
}

export function initCalendar(root, { value, onChange }) {
  let selected = value ? parseISODate(value) : new Date();
  let viewDate = new Date(selected.getFullYear(), selected.getMonth(), 1);

  const today = new Date();

  function render() {
    const mStart = startOfMonth(viewDate);
    const mEnd = endOfMonth(viewDate);
    const gridStart = startOfWeekMonday(mStart);

    const days = [];
    const cur = new Date(gridStart);
    for (let i = 0; i < 42; i++) {
      days.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }

    root.innerHTML = `
      <div class="cal">
        <div class="cal__top">
          <button class="cal__nav" data-nav="prev">‹</button>
          <div class="cal__title">${monthTitle(viewDate)}</div>
          <button class="cal__nav" data-nav="next">›</button>
        </div>

        <div class="cal__weekdays">
          ${["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map(w=>`<div class="cal__weekday">${w}</div>`).join("")}
        </div>

        <div class="cal__grid">
          ${days.map(d=>{
            const inMonth = d >= mStart && d <= mEnd;
            const active = isSameDay(d, selected);
            const isToday = isSameDay(d, today);

            return `<button 
              class="cal__day ${inMonth ? "in" : "out"} ${active ? "active" : ""} ${isToday ? "today" : ""}"
              data-date="${toISODate(d)}"
            >${d.getDate()}</button>`;
          }).join("")}
        </div>

        <button class="cal__todayBtn" data-today="1">Сегодня</button>
      </div>
    `;
  }

  function setSelected(iso) {
    selected = parseISODate(iso);
    viewDate = new Date(selected.getFullYear(), selected.getMonth(), 1);
    render();
    onChange?.(iso);
  }

  root.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const nav = btn.getAttribute("data-nav");
    if (nav === "prev") {
      viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
      render();
      return;
    }
    if (nav === "next") {
      viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
      render();
      return;
    }
    if (btn.getAttribute("data-today")) {
      setSelected(toISODate(new Date()));
      return;
    }

    const iso = btn.getAttribute("data-date");
    if (iso) setSelected(iso);
  });

  render();
}
    