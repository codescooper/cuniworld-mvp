let toastTimer = null;

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
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    item.remove();
  }, 2800);
}

export function showConfirm({ title = 'Confirmation', message = '', confirmLabel = 'Confirmer', cancelLabel = 'Annuler', danger = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-card" role="dialog" aria-modal="true">
        <div class="confirm-title">${title}</div>
        <div class="confirm-msg">${message}</div>
        <div class="confirm-actions">
          <button class="btn secondary" data-testid="confirm-cancel">${cancelLabel}</button>
          <button class="btn ${danger ? '' : 'secondary'}" data-testid="confirm-ok">${confirmLabel}</button>
        </div>
      </div>`;

    const close = (ok) => {
      overlay.remove();
      resolve(ok);
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });
    overlay.querySelector('[data-testid="confirm-cancel"]')?.addEventListener('click', () => close(false));
    overlay.querySelector('[data-testid="confirm-ok"]')?.addEventListener('click', () => close(true));
    document.body.appendChild(overlay);
  });
}
