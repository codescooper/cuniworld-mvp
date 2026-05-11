import { escapeHTML } from './utils.js';
import { PORTIONS, saveRound, getRoundForDate, getTodayRoundSummary } from './roundService.js';
import { Store } from './store.js';
import { openModal, closeModal } from './modal.js';
import { showToast } from './notifications.js';
import { sortByCage } from './cageSort.js';

export function openTourneeModal(ctx) {
  const today    = new Date().toISOString().slice(0, 10);
  const existing = getRoundForDate(ctx.state, today);
  const actifs   = sortByCage(
    (ctx.state.rabbits || []).filter(r => r.status === 'actif'),
    r => r.cage
  );

  openModal(ctx.el, `Tournée du ${_formatDate(today)}`, _buildHTML(existing, actifs, today));
  _wireForm(ctx, existing, actifs, today);
}

function _buildHTML(existing, actifs, _today) {

  const feedingMap = new Map((existing?.feedings || []).map(f => [f.rabbitId, f.portion]));

  const rabbitRows = actifs.map(r => {
    const portion = feedingMap.get(r.id) || 'aucun';
    return `
      <div class="tournee-rabbit-row">
        <div class="tournee-rabbit-info">
          <span class="tournee-cage"><strong>${escapeHTML(r.cage || '—')}</strong></span>
          <span class="tournee-name">${escapeHTML(r.name)}</span>
          <span class="muted tournee-code">${escapeHTML(r.code || '')}</span>
          ${r.breed ? `<span class="muted tournee-breed">${escapeHTML(r.breed)}</span>` : ''}
        </div>
        <select class="input tournee-portion-sel" data-rabbit-id="${escapeHTML(r.id)}" style="width:130px;padding:4px 6px;height:auto">
          ${Object.entries(PORTIONS).map(([k, v]) =>
            `<option value="${k}"${portion === k ? ' selected' : ''}>${v.icon} ${v.label}</option>`
          ).join('')}
        </select>
      </div>`;
  }).join('');

  return `
    <div class="tournee-checks">
      <label class="tournee-check-item">
        <input type="checkbox" id="trWater" ${existing?.water ? 'checked' : ''} />
        <span class="tournee-check-label">💧 Eau distribuée</span>
      </label>
      <label class="tournee-check-item">
        <input type="checkbox" id="trCleaning" ${existing?.cleaning ? 'checked' : ''} />
        <span class="tournee-check-label">🧹 Nettoyage effectué</span>
      </label>
    </div>

    <div class="tournee-section-title">🌾 Alimentation (ordre des cages)</div>
    <div class="tournee-quick-btns">
      <span class="muted" style="font-size:.8rem">Appliquer à tous :</span>
      ${Object.entries(PORTIONS).map(([k, v]) =>
        `<button type="button" class="btn secondary" style="padding:3px 10px;font-size:.8rem" data-fill-all="${k}">${v.icon} ${v.label}</button>`
      ).join('')}
    </div>
    <div class="tournee-rabbit-list">
      ${actifs.length === 0
        ? '<div class="muted">Aucun lapin actif.</div>'
        : rabbitRows}
    </div>

    <div class="field" style="margin-top:12px">
      <div class="label">Notes <span class="muted">(optionnel)</span></div>
      <input id="trNotes" class="input" type="text" value="${escapeHTML(existing?.notes || '')}" maxlength="160" placeholder="Observations du jour…" />
    </div>

    <div class="row" style="margin-top:16px;gap:8px">
      <button class="btn secondary" id="trCancel" style="flex:1">Annuler</button>
      <button class="btn" id="trSave" style="flex:2">Enregistrer la tournée ✓</button>
    </div>`;
}

function _wireForm(ctx, existing, actifs, today) {
  // Fill-all buttons
  document.querySelectorAll('[data-fill-all]').forEach(btn => {
    btn.addEventListener('click', () => {
      const portion = btn.dataset.fillAll;
      document.querySelectorAll('.tournee-portion-sel').forEach(sel => { sel.value = portion; });
    });
  });

  document.getElementById('trCancel')?.addEventListener('click', () => closeModal(ctx.el));
  document.getElementById('trSave')?.addEventListener('click', () => {
    const water    = document.getElementById('trWater')?.checked || false;
    const cleaning = document.getElementById('trCleaning')?.checked || false;
    const notes    = document.getElementById('trNotes')?.value?.trim() || '';

    const feedings = actifs.map(r => ({
      rabbitId: r.id,
      portion:  document.querySelector(`.tournee-portion-sel[data-rabbit-id="${r.id}"]`)?.value || 'aucun',
    }));

    ctx.state = Store.save(saveRound(ctx.state, { date: today, water, cleaning, feedings, notes }));
    closeModal(ctx.el);
    ctx.render();
    _updateTourneeLabel(ctx.state);

    const summary = getTodayRoundSummary(ctx.state);
    const parts = [];
    if (summary?.water)    parts.push('💧 eau');
    if (summary?.cleaning) parts.push('🧹 nettoyage');
    if (summary)           parts.push(`🌾 ${summary.fedCount}/${summary.total} lapins nourris`);
    showToast('Tournée enregistrée : ' + (parts.join(' · ') || 'aucune action'), 'success');
  });
}

export function _updateTourneeLabel(state) {
  const label   = document.getElementById('tourneeStatusLabel');
  if (!label) return;
  const summary = getTodayRoundSummary(state);
  if (!summary) {
    label.textContent = 'Eau · Nourriture · Nettoyage';
    return;
  }
  const parts = [];
  parts.push(summary.water    ? '💧 Eau ✓' : '💧 Eau —');
  parts.push(summary.cleaning ? '🧹 Nettoyé ✓' : '🧹 Nettoyage —');
  parts.push(`🌾 ${summary.fedCount}/${summary.total} nourris`);
  label.textContent = parts.join(' · ');
}

function _formatDate(iso) {
  const [, m, d] = iso.split('-');
  const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
  return `${parseInt(d)} ${MONTHS[parseInt(m) - 1]}`;
}
