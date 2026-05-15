/**
 * weightCheck.js — Module de prise de poids assistée
 *
 * API publique :
 *   getRabbitsDueForWeightCheck(state, thresholdHours) → [{rabbit, lastEntry}]
 *   openWeightCheckModal(ctx)
 */

import { getRabbitWeightHistory } from './weightService.js';
import { daysBetween, formatDate, escapeHTML } from './utils.js';
import { addEvent } from './actions.js';
import { openModal } from './modal.js';
import { sortByCage } from './cageSort.js';
import { rabbitThumbHTML } from './photos.js';
import { getSettings } from './settingsService.js';

// ── Calcul des lapins à peser ────────────────────────────────────

/**
 * Retourne les lapins actifs dont la dernière pesée date de plus de
 * thresholdHours heures (ou n'ayant jamais été pesés).
 * Trié : jamais pesés en premier, puis par ancienneté de pesée décroissante.
 */
export function getRabbitsDueForWeightCheck(state, thresholdHours = 48) {
  const today        = new Date().toISOString().slice(0, 10);
  const thresholdDays = thresholdHours / 24;

  const items = (state.rabbits || [])
    .filter(r => r.status === 'actif')
    .map(r => {
      const history   = getRabbitWeightHistory(state, r.id);
      const lastEntry = history.length > 0 ? history[history.length - 1] : null;
      return { rabbit: r, lastEntry };
    })
    .filter(({ lastEntry }) =>
      !lastEntry || daysBetween(lastEntry.date, today) >= thresholdDays
    );
  // Sort by cage order (A1, A2…B1, B2…)
  return sortByCage(items, x => x.rabbit.cage);
}

// ── Modal assisté ────────────────────────────────────────────────

export function openWeightCheckModal(ctx) {
  // Seuil paramétrable par ferme : Paramètres → Soins → Cycle de pesée (j)
  const thresholdDays  = getSettings(ctx).weightCheckOverdueDays ?? 7;
  const thresholdHours = thresholdDays * 24;
  const due = getRabbitsDueForWeightCheck(ctx.state, thresholdHours);

  if (due.length === 0) {
    openModal(ctx.el, 'Prise de poids', `
      <div style="text-align:center;padding:24px 0">
        <div style="font-size:2.5rem;margin-bottom:12px">✅</div>
        <p style="font-size:1.1rem;font-weight:600">Tous les lapins ont été pesés récemment !</p>
        <p class="muted">Aucun lapin n'est en attente de pesée (cycle : ${thresholdDays} j).</p>
      </div>`);
    return;
  }

  // File de travail — les "passés" sont déplacés en fin de file
  const queue = [...due];
  let cursor  = 0;

  openModal(ctx.el, 'Prise de poids assistée', '');
  _renderStep(ctx, queue, cursor, (newCursor) => { cursor = newCursor; });
}

// ── Rendu d'une étape ────────────────────────────────────────────

function _renderStep(ctx, queue, cursor, setCursor) {
  const body = document.getElementById('modalBody');
  if (!body) return;

  const total = queue.length;

  if (cursor >= total) {
    body.innerHTML = `
      <div style="text-align:center;padding:24px 0">
        <div style="font-size:2.5rem;margin-bottom:12px">🎉</div>
        <p style="font-size:1.1rem;font-weight:600">Tous les lapins ont été pesés !</p>
        <p class="muted">Session terminée — ${total} lapin(s) traité(s).</p>
        <button class="btn" id="wcDone" style="margin-top:16px">Fermer</button>
      </div>`;
    document.getElementById('wcDone')?.addEventListener('click', () => {
      document.getElementById('modalClose')?.click();
    });
    return;
  }

  const { rabbit: r, lastEntry } = queue[cursor];
  const today    = new Date().toISOString().slice(0, 10);
  const ageLine  = _ageText(r.birthDate, today);
  const lastW    = lastEntry ? `${lastEntry.weightKg.toFixed(2)} kg` : '—';
  const lastDate = lastEntry ? formatDate(lastEntry.date) : 'Jamais';
  const daysSince = lastEntry ? daysBetween(lastEntry.date, today) : null;
  const sinceTxt  = daysSince !== null ? ` (il y a ${daysSince} j)` : '';

  body.innerHTML = `
    <div class="wc-progress">
      <span class="wc-step">Lapin ${cursor + 1} sur ${total}</span>
      <div class="wc-bar"><div class="wc-fill" style="width:${Math.round((cursor / total) * 100)}%"></div></div>
    </div>

    <div class="wc-rabbit-card">
      <div class="wc-name" style="display:flex;align-items:center;gap:8px">
        ${rabbitThumbHTML(ctx.state, r, { size: 40 })}
        <span>${escapeHTML(r.name)}</span>
        <span class="badge">${r.sex === 'F' ? 'Femelle' : r.sex === 'M' ? 'Mâle' : '?'}</span>
      </div>
      <div class="wc-id-row">
        <span class="wc-code">📋 ${escapeHTML(r.code || '—')}</span>
        <span class="wc-cage">🏠 Cage <strong>${escapeHTML(r.cage || '—')}</strong></span>
        ${r.breed ? `<span class="wc-breed">🐰 ${escapeHTML(r.breed)}</span>` : ''}
        ${ageLine ? `<span>🎂 ${escapeHTML(ageLine)}</span>` : ''}
      </div>
      <div class="wc-last">
        <span>Dernier poids : <strong>${lastW}</strong></span>
        <span>Dernière pesée : <strong>${lastDate}${sinceTxt}</strong></span>
      </div>
    </div>

    <div class="field" style="margin-top:16px">
      <div class="label">Nouveau poids (kg)</div>
      <input id="wcWeight" class="input" type="number" min="0.01" step="0.01"
             placeholder="ex: 2.35" autocomplete="off"
             style="font-size:1.3rem;text-align:center;letter-spacing:1px" />
    </div>
    <div id="wcError" style="color:var(--color-danger);font-size:.85rem;min-height:1.2em;margin-top:4px"></div>

    <div class="row" style="justify-content:space-between;margin-top:16px;gap:10px">
      <button class="btn secondary" id="wcSkip" style="flex:1">Passer →</button>
      <button class="btn" id="wcSave" style="flex:2">Enregistrer ✓</button>
    </div>`;

  // Focus auto
  const weightInput = document.getElementById('wcWeight');
  setTimeout(() => weightInput?.focus(), 50);

  // Passer
  document.getElementById('wcSkip')?.addEventListener('click', () => {
    const skipped = queue.splice(cursor, 1)[0];
    queue.push(skipped);
    // cursor reste le même (le suivant remonte)
    // Si on a fait le tour complet sans progress, arrêter
    if (cursor >= queue.length) {
      setCursor(queue.length);
      _renderStep(ctx, queue, queue.length, setCursor);
    } else {
      _renderStep(ctx, queue, cursor, setCursor);
    }
  });

  // Enregistrer
  function save() {
    const errEl = document.getElementById('wcError');
    const val   = parseFloat(weightInput?.value);
    if (!Number.isFinite(val) || val <= 0) {
      if (errEl) errEl.textContent = 'Entrez un poids valide (> 0 kg).';
      weightInput?.focus();
      return;
    }
    try {
      addEvent(ctx, r.id, {
        type:  'pesée',
        date:  today,
        notes: '',
        data:  { weight: val },
      });
    } catch (err) {
      if (errEl) errEl.textContent = err.message || 'Erreur.';
      return;
    }
    const next = cursor + 1;
    setCursor(next);
    _renderStep(ctx, queue, next, setCursor);
  }

  document.getElementById('wcSave')?.addEventListener('click', save);

  // Entrée = enregistrer
  weightInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
  });
}

// ── Helpers ──────────────────────────────────────────────────────

function _ageText(birthDate, today) {
  if (!birthDate) return '';
  const days = daysBetween(birthDate, today);
  if (days < 0)   return '';
  if (days < 30)  return `${days} j`;
  if (days < 365) return `${Math.floor(days / 7)} sem`;
  const months = Math.floor(days / 30);
  if (months < 24) return `${months} mois`;
  return `${Math.floor(days / 365)} ans`;
}
