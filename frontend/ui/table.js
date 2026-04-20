// ui/table.js

export function renderTable({ columns, rows }) {
  return `
    <table class="table">
      <thead>
        <tr>
          ${columns.map((c) => `<th>${c}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${
          rows.length
            ? rows.join("")
            : `<tr><td colspan="${columns.length}" class="muted">No data</td></tr>`
        }
      </tbody>
    </table>
  `;
}

export function renderRow(cells) {
  return `
    <tr>
      ${cells.map((c) => `<td>${c}</td>`).join("")}
    </tr>
  `;
}
