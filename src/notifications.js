function ensureToastRoot() {
  let root = document.getElementById('toastRoot');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toastRoot';
    root.className = 'toast-root';
    document.body.appendChild(root);
  }
  return root;
}

export function showToast(message, type = 'info') {
  const root = ensureToastRoot();
  const item = document.createElement('div');
  item.className = `toast ${type}`;
  item.textContent = String(message || '');
  root.appendChild(item);
  // Each toast manages its own timer — no shared timer that earlier toasts lose.
  setTimeout(() => item.remove(), 3200);
}

export function showConfirm({ title = 'Confirmation', message = '', confirmLabel = 'Confirmer', cancelLabel = 'Annuler', danger = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    // Build structure with empty text nodes; fill via textContent to avoid XSS.
    overlay.innerHTML = `
      <div class="confirm-card" role="dialog" aria-modal="true">
        <div class="confirm-title"></div>
        <div class="confirm-msg"></div>
        <div class="confirm-actions">
          <button class="btn secondary" data-testid="confirm-cancel"></button>
          <button class="btn ${danger ? 'danger' : ''}" data-testid="confirm-ok"></button>
        </div>
      </div>`;

    overlay.querySelector('.confirm-title').textContent = title;
    overlay.querySelector('.confirm-msg').textContent   = message;
    overlay.querySelector('[data-testid="confirm-cancel"]').textContent = cancelLabel;
    overlay.querySelector('[data-testid="confirm-ok"]').textContent    = confirmLabel;

    const close = (ok) => { overlay.remove(); resolve(ok); };

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    overlay.querySelector('[data-testid="confirm-cancel"]').addEventListener('click', () => close(false));
    overlay.querySelector('[data-testid="confirm-ok"]').addEventListener('click', () => close(true));

    // Keyboard: Escape cancels, Enter confirms.
    // preventDefault + stopPropagation empêchent de soumettre un formulaire parent.
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation();
        document.removeEventListener('keydown', onKey);
        close(false);
      }
      if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation();
        document.removeEventListener('keydown', onKey);
        close(true);
      }
    };
    document.addEventListener('keydown', onKey, { capture: true });

    document.body.appendChild(overlay);
    // Focus the confirm button for keyboard accessibility
    overlay.querySelector('[data-testid="confirm-ok"]')?.focus();
  });
}
