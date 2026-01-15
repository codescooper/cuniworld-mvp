function getModalEls(el) {
  // fallback DOM au cas où el.* n'est pas câblé
  const modal = el?.modal || document.getElementById("modal");
  const modalTitle = el?.modalTitle || document.getElementById("modalTitle");
  const modalBody = el?.modalBody || document.getElementById("modalBody");
  return { modal, modalTitle, modalBody };
}

export function openModal(el, title, html) {
  const { modal, modalTitle, modalBody } = getModalEls(el);
  if (!modal) return;

  if (modalTitle) modalTitle.textContent = title ?? "";
  if (modalBody) modalBody.innerHTML = html ?? "";

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

export function closeModal(el) {
  const { modal, modalTitle, modalBody } = getModalEls(el);
  if (!modal) return;

  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");

  if (modalTitle) modalTitle.textContent = "";
  if (modalBody) modalBody.innerHTML = "";
}
