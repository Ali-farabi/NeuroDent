let modalEl = null;

export function openModal({ title = "", content = "", onClose } = {}) {
  closeModal();

  modalEl = document.createElement("div");
  modalEl.className = "modal-overlay";
  modalEl.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div class="modal-title">${title}</div>
        <button class="btn btn-secondary modal-close" type="button" aria-label="Закрыть">✕</button>
      </div>
      <div class="modal-body">${content}</div>
    </div>
  `;

  document.body.appendChild(modalEl);
  modalEl.querySelector(".modal-close").addEventListener("click", () => {
    closeModal();
    onClose?.();
  });

  modalEl.addEventListener("click", (e) => {
    if (e.target === modalEl) {
      closeModal();
      onClose?.();
    }
  });

  window.addEventListener("keydown", escHandler);
}

function escHandler(e) {
  if (e.key === "Escape") closeModal();
}

export function closeModal() {
  if (!modalEl) return;
  window.removeEventListener("keydown", escHandler);
  modalEl.remove();
  modalEl = null;
}

export function setModalContent(html) {
  if (!modalEl) return;
  const body = modalEl.querySelector(".modal-body");
  if (body) body.innerHTML = html;
}
