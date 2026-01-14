export function openModal(el, title, bodyHTML) {
  el.modalTitle.textContent = title;
  el.modalBody.innerHTML = bodyHTML;
  el.modal.classList.remove("hidden");
  el.modal.setAttribute("aria-hidden", "false");
}

export function closeModal(el) {
  el.modal.classList.add("hidden");
  el.modal.setAttribute("aria-hidden", "true");
  el.modalBody.innerHTML = "";
}
