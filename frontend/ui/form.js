// ui/form.js

export function renderInput({
  label,
  name,
  type = "text",
  value = "",
  placeholder = "",
  disabled = false,
}) {
  return `
    <label class="field">
      <span class="field-label">${label}</span>
      <input
        class="input"
        name="${name}"
        type="${type}"
        value="${value}"
        placeholder="${placeholder}"
        ${disabled ? "disabled" : ""}
      />
    </label>
  `;
}

export function renderTextarea({
  label,
  name,
  value = "",
  rows = 3,
  disabled = false,
}) {
  return `
    <label class="field">
      <span class="field-label">${label}</span>
      <textarea
        class="input"
        name="${name}"
        rows="${rows}"
        ${disabled ? "disabled" : ""}
      >${value}</textarea>
    </label>
  `;
}

export function renderSubmitButton(text, disabled = false) {
  return `
    <button class="btn" type="submit" ${disabled ? "disabled" : ""}>
      ${text}
    </button>
  `;
}
