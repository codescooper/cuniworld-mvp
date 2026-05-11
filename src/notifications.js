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

const MAX_TOASTS = 5;
const DURATIONS = { error: 6000, warn: 5000, success: 3200, info: 3200 };
const FADE_MS = 200;

function dismissToast(item) {
  if (item.dataset.leaving === '1') return;
  item.dataset.leaving = '1';
  item.classList.add('toast-leave');
  setTimeout(() => item.remove(), FADE_MS);
}

export function showToast(message, type = 'info') {
  const root = ensureToastRoot();

  // Cap stack size — oldest goes first so screen never fills up.
  const existing = root.querySelectorAll('.toast:not([data-leaving="1"])');
  if (existing.length >= MAX_TOASTS) dismissToast(existing[0]);

  const item = document.createElement('div');
  item.className = `toast toast-enter ${type}`;
  item.setAttribute('role', type === 'error' ? 'alert' : 'status');
  item.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

  const text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = String(message || '');

  const close = document.createElement('button');
  close.className = 'toast-close';
  close.setAttribute('aria-label', 'Fermer');
  close.type = 'button';
  close.textContent = '✕';

  item.appendChild(text);
  item.appendChild(close);
  root.appendChild(item);

  // Lift the enter class on next frame so the transition plays.
  requestAnimationFrame(() => item.classList.remove('toast-enter'));

  const duration = DURATIONS[type] || DURATIONS.info;
  let remaining = duration;
  let startedAt = Date.now();
  let timer = null;

  const schedule = (ms) => {
    if (timer) clearTimeout(timer);
    startedAt = Date.now();
    timer = setTimeout(() => dismissToast(item), ms);
  };
  const pause = () => {
    if (!timer) return;
    clearTimeout(timer); timer = null;
    remaining -= Date.now() - startedAt;
  };
  const resume = () => schedule(Math.max(800, remaining));

  schedule(duration);

  // Hover / focus pauses the auto-dismiss timer.
  item.addEventListener('mouseenter', pause);
  item.addEventListener('mouseleave', resume);
  item.addEventListener('focusin', pause);
  item.addEventListener('focusout', resume);

  // Click anywhere on the toast (except the × specifically) is fine too —
  // explicit × wins and stops propagation so the click handler doesn't double.
  close.addEventListener('click', (e) => { e.stopPropagation(); dismissToast(item); });
  item.addEventListener('click', () => dismissToast(item));
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
