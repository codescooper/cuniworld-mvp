/**
 * renderAccounting.js — Panneau « Comptabilité » (journal de trésorerie).
 *
 * Panneau plein écran à 4 onglets (Vue d'ensemble / Journal / P&L / Récurrentes)
 * monté dans `#accountingDash`. Données calculées par `ledger.js` (module pur).
 * Les mutations passent par `ctx.Store.save(...)` puis sont poussées au cloud via
 * `trackCloudWrite` (file offline gérée par mutationQueue).
 */

import { escapeHTML, escapeAttr } from './utils.js';
import { formatCurrency, getSettings } from './settingsService.js';
import { showToast, showConfirm } from './notifications.js';
import { trackCloudWrite } from './actions.js';
import { DB } from './db.js';
import {
  LEDGER_CATEGORIES,
  categoriesFor,
  categoryLabel,
  categoryIcon,
  listLedger,
  addTransaction,
  deleteTransaction,
  addRecurringCharge,
  deleteRecurringCharge,
  skipRecurringOccurrence,
  computeTotals,
  computeMonthlyPL,
  computeYearlyPL,
  computeTreasury,
  unfoldRecurring,
  listLedgerCSV,
} from './ledger.js';

// État d'UI local au module (jamais dans ctx) : onglet courant + filtres journal.
let _tab = 'overview';
let _plMode = 'month';
const _filters = { from: '', to: '', direction: '', category: '', source: '' };

const SOURCE_BADGES = {
  event:     { label: 'Vente', color: '#16a34a' },
  order:     { label: 'Boutique', color: '#16a34a' },
  stock:     { label: 'Stock', color: '#b45309' },
  recurring: { label: 'Récurrente', color: '#6d28d9' },
  manual:    { label: 'Manuelle', color: '#0369a1' },
};

export function renderAccounting(ctx) {
  const root = document.getElementById('accountingDash');
  if (!root) return;
  const settings = getSettings(ctx);

  const tabs = [
    ['overview', "Vue d'ensemble"],
    ['journal', 'Journal'],
    ['pl', 'P&L'],
    ['recurring', 'Récurrentes'],
  ];
  const tabBar = `
    <div class="acc-tabs" role="tablist" style="display:flex;gap:4px;flex-wrap:wrap;border-bottom:1px solid var(--color-border);margin-bottom:14px">
      ${tabs.map(([key, label]) => `
        <button type="button" class="acc-tab btn ${_tab === key ? '' : 'secondary'}" data-acc-tab="${key}"
          style="border-radius:8px 8px 0 0">${escapeHTML(label)}</button>`).join('')}
      <span style="flex:1"></span>
      <button type="button" class="btn secondary" id="accExportCsv" title="Exporter le journal en CSV">⬇️ CSV</button>
      <button type="button" class="btn secondary" id="accPrint" title="Imprimer">🖨️ Imprimer</button>
    </div>`;

  let body = '';
  if (_tab === 'overview') body = _renderOverview(ctx, settings);
  else if (_tab === 'journal') body = _renderJournal(ctx, settings);
  else if (_tab === 'pl') body = _renderPL(ctx, settings);
  else if (_tab === 'recurring') body = _renderRecurring(ctx, settings);

  root.innerHTML = tabBar + `<div class="acc-tab-body">${body}</div>`;
  _wire(ctx, root);
}

// Compat : ancienne entrée modale → navigue désormais vers le panneau dédié.
export function openAccountingModal(ctx) {
  _tab = 'overview';
  if (ctx.navigate) ctx.navigate('comptabilite');
  else { ctx.activePanel = 'comptabilite'; ctx.render(); }
}

// ── Onglet : Vue d'ensemble ───────────────────────────────────────────────────

function _renderOverview(ctx, settings) {
  const totals = computeTotals(ctx.state);
  const treasury = computeTreasury(ctx.state);
  const monthly = computeMonthlyPL(ctx.state).slice(0, 12).reverse();
  const netClass = totals.net >= 0 ? 'pl-net-positive' : 'pl-net-negative';
  const balClass = treasury.balance >= 0 ? 'pl-net-positive' : 'pl-net-negative';

  // Répartition des dépenses par catégorie (barres horizontales).
  const expenseCats = Object.entries(totals.byCat)
    .filter(([cat]) => LEDGER_CATEGORIES[cat]?.direction === 'out')
    .sort((a, b) => b[1] - a[1]);
  const maxCat = expenseCats.length ? expenseCats[0][1] : 0;
  const catBars = expenseCats.length === 0
    ? `<div class="muted small" style="padding:6px">Aucune dépense enregistrée.</div>`
    : expenseCats.map(([cat, amt]) => {
        const pct = maxCat > 0 ? Math.round((amt / maxCat) * 100) : 0;
        return `<div class="stats-hbar-row" style="display:flex;align-items:center;gap:8px;margin:4px 0">
          <div class="stats-hbar-label" style="width:120px;font-size:.85rem">${escapeHTML(categoryIcon(cat))} ${escapeHTML(categoryLabel(cat))}</div>
          <div class="stats-hbar-track" style="flex:1;background:#f1f1f1;border-radius:6px;height:14px;overflow:hidden">
            <div class="stats-hbar-fill" style="width:${pct}%;height:100%;background:#b91c1c"></div></div>
          <div class="stats-hbar-val" style="width:110px;text-align:right;font-size:.85rem">${formatCurrency(amt, settings)}</div>
        </div>`;
      }).join('');

  // Évolution mensuelle (recettes vs dépenses), barres inline.
  const maxMonth = monthly.reduce((m, r) => Math.max(m, r.in, r.out), 0) || 1;
  const monthBars = monthly.length === 0
    ? `<div class="muted small" style="padding:6px">Aucun mouvement.</div>`
    : `<div style="display:flex;gap:10px;align-items:flex-end;overflow-x:auto;padding:6px 0;min-height:120px">
        ${monthly.map(r => {
          const hIn = Math.round((r.in / maxMonth) * 90);
          const hOut = Math.round((r.out / maxMonth) * 90);
          return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;min-width:44px">
            <div style="display:flex;gap:3px;align-items:flex-end;height:92px">
              <div title="Recettes : ${escapeAttr(formatCurrency(r.in, settings))}" style="width:14px;height:${hIn}px;background:#16a34a;border-radius:3px 3px 0 0"></div>
              <div title="Dépenses : ${escapeAttr(formatCurrency(r.out, settings))}" style="width:14px;height:${hOut}px;background:#b91c1c;border-radius:3px 3px 0 0"></div>
            </div>
            <div class="small muted" style="font-size:.72rem">${escapeHTML(_fmtMonthShort(r.month))}</div>
          </div>`;
        }).join('')}
      </div>
      <div class="small muted" style="display:flex;gap:14px;margin-top:4px">
        <span><span style="display:inline-block;width:10px;height:10px;background:#16a34a;border-radius:2px"></span> Recettes</span>
        <span><span style="display:inline-block;width:10px;height:10px;background:#b91c1c;border-radius:2px"></span> Dépenses</span>
      </div>`;

  return `
    <div class="acc-totals" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:16px">
      <div class="tile"><div class="t">Recettes totales</div><div class="n" style="font-size:1.1rem;color:#16a34a">${formatCurrency(totals.in, settings)}</div></div>
      <div class="tile"><div class="t">Dépenses totales</div><div class="n" style="font-size:1.1rem;color:#b91c1c">${formatCurrency(totals.out, settings)}</div></div>
      <div class="tile"><div class="t">Résultat net</div><div class="n ${netClass}" style="font-size:1.1rem">${formatCurrency(totals.net, settings)}</div></div>
      <div class="tile"><div class="t">💰 Solde trésorerie</div><div class="n ${balClass}" style="font-size:1.1rem">${formatCurrency(treasury.balance, settings)}</div></div>
    </div>

    <div style="font-weight:700;margin:10px 0 4px">Évolution mensuelle (recettes vs dépenses)</div>
    ${monthBars}

    <div style="font-weight:700;margin:16px 0 4px">Dépenses par catégorie</div>
    ${catBars}
  `;
}

// ── Onglet : Journal ──────────────────────────────────────────────────────────

function _renderJournal(ctx, settings) {
  let lines = listLedger(ctx.state);

  // Filtres
  if (_filters.from) lines = lines.filter(l => (l.date || '') >= _filters.from);
  if (_filters.to) lines = lines.filter(l => (l.date || '') <= _filters.to);
  if (_filters.direction) lines = lines.filter(l => l.direction === _filters.direction);
  if (_filters.category) lines = lines.filter(l => l.category === _filters.category);
  if (_filters.source) lines = lines.filter(l => l.source === _filters.source);

  const catFilterOptions = Object.entries(LEDGER_CATEGORIES)
    .map(([k, v]) => `<option value="${k}" ${_filters.category === k ? 'selected' : ''}>${escapeHTML(v.label)}</option>`).join('');

  const rows = lines.length === 0
    ? `<div class="muted" style="padding:10px;text-align:center">Aucune ligne pour ces filtres.</div>`
    : lines.slice(0, 300).map(l => {
        const badge = SOURCE_BADGES[l.source] || { label: l.source, color: '#666' };
        const sign = l.direction === 'in' ? '+' : '−';
        const color = l.direction === 'in' ? '#16a34a' : '#b91c1c';
        const del = l.editable
          ? `<button class="btn danger" data-acc-del-tx="${escapeAttr(l.refId)}" style="padding:2px 8px;font-size:.8rem">×</button>`
          : '<span style="width:28px;display:inline-block"></span>';
        return `<div class="item" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--color-border)">
          <span style="font-size:1.1rem">${escapeHTML(categoryIcon(l.category))}</span>
          <div style="flex:1;min-width:0">
            <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><strong>${escapeHTML(l.label)}</strong></div>
            <div class="small muted">${escapeHTML(l.date || '')} · ${escapeHTML(categoryLabel(l.category))}
              · <span style="color:${badge.color}">${escapeHTML(badge.label)}</span></div>
          </div>
          <div style="font-weight:700;color:${color};white-space:nowrap">${sign} ${formatCurrency(l.amount, settings)}</div>
          ${del}
        </div>`;
      }).join('');

  const outCats = categoriesFor('out').map(([k, v]) => `<option value="${k}">${escapeHTML(v.icon)} ${escapeHTML(v.label)}</option>`).join('');
  const inCats = categoriesFor('in').map(([k, v]) => `<option value="${k}">${escapeHTML(v.icon)} ${escapeHTML(v.label)}</option>`).join('');
  const today = new Date().toISOString().slice(0, 10);

  return `
    <details style="margin-bottom:12px" ${(_filters.from || _filters.to || _filters.direction || _filters.category || _filters.source) ? 'open' : ''}>
      <summary style="cursor:pointer;font-weight:700">Filtres</summary>
      <div class="row2" style="margin-top:8px">
        <div class="field"><div class="label">Du</div><input class="input" type="date" id="fltFrom" value="${escapeAttr(_filters.from)}"></div>
        <div class="field"><div class="label">Au</div><input class="input" type="date" id="fltTo" value="${escapeAttr(_filters.to)}"></div>
      </div>
      <div class="row2">
        <div class="field"><div class="label">Sens</div>
          <select class="input" id="fltDir">
            <option value="">Tous</option>
            <option value="in" ${_filters.direction === 'in' ? 'selected' : ''}>Entrées</option>
            <option value="out" ${_filters.direction === 'out' ? 'selected' : ''}>Sorties</option>
          </select></div>
        <div class="field"><div class="label">Source</div>
          <select class="input" id="fltSrc">
            <option value="">Toutes</option>
            <option value="manual" ${_filters.source === 'manual' ? 'selected' : ''}>Manuelle</option>
            <option value="event" ${_filters.source === 'event' ? 'selected' : ''}>Vente lapin</option>
            <option value="order" ${_filters.source === 'order' ? 'selected' : ''}>Boutique</option>
            <option value="stock" ${_filters.source === 'stock' ? 'selected' : ''}>Stock</option>
            <option value="recurring" ${_filters.source === 'recurring' ? 'selected' : ''}>Récurrente</option>
          </select></div>
      </div>
      <div class="field"><div class="label">Catégorie</div>
        <select class="input" id="fltCat"><option value="">Toutes</option>${catFilterOptions}</select></div>
      <div class="row" style="justify-content:flex-end"><button class="btn secondary" id="fltReset">Réinitialiser</button></div>
    </details>

    <div style="font-weight:700;margin:6px 0">Saisie rapide</div>
    <form id="accTxForm" class="form" style="margin-bottom:12px">
      <div class="row2">
        <div class="field"><div class="label">Sens</div>
          <select class="input" name="direction" id="txDir">
            <option value="out">Sortie (dépense)</option>
            <option value="in">Entrée (recette)</option>
          </select></div>
        <div class="field"><div class="label">Catégorie</div>
          <select class="input" name="category" id="txCat" data-out="${escapeAttr(outCats)}" data-in="${escapeAttr(inCats)}">${outCats}</select></div>
      </div>
      <div class="row2">
        <div class="field"><div class="label">Date</div><input class="input" type="date" name="date" value="${today}" required></div>
        <div class="field"><div class="label">Montant (${escapeHTML(settings.currencySymbol)})</div><input class="input" type="number" name="amount" min="0.01" step="0.01" placeholder="ex: 5000" required></div>
      </div>
      <div class="field"><div class="label">Description <span class="muted small">(optionnel)</span></div>
        <input class="input" type="text" name="description" maxlength="120" placeholder="ex: Sac de granulés 25kg"></div>
      <div class="row" style="justify-content:flex-end"><button type="submit" class="btn">+ Ajouter</button></div>
    </form>

    <div style="font-weight:700;margin:6px 0">Journal (${lines.length})</div>
    <div class="list" id="accLedgerList">${rows}</div>
  `;
}

// ── Onglet : P&L ────────────────────────────────────────────────────────────

function _renderPL(ctx, settings) {
  const rows = _plMode === 'year' ? computeYearlyPL(ctx.state) : computeMonthlyPL(ctx.state);
  const keyLabel = _plMode === 'year' ? 'Année' : 'Mois';
  const body = rows.length === 0
    ? `<tr><td colspan="4" class="muted" style="text-align:center;padding:8px">Aucun mouvement enregistré.</td></tr>`
    : rows.map(r => {
        const key = _plMode === 'year' ? r.year : _fmtMonth(r.month);
        const netClass = r.net >= 0 ? 'pl-net-positive' : 'pl-net-negative';
        return `<tr>
          <td><strong>${escapeHTML(key)}</strong></td>
          <td style="text-align:right;color:#16a34a">${formatCurrency(r.in, settings)}</td>
          <td style="text-align:right;color:#b91c1c">${formatCurrency(r.out, settings)}</td>
          <td style="text-align:right;font-weight:700" class="${netClass}">${formatCurrency(r.net, settings)}</td>
        </tr>`;
      }).join('');

  return `
    <div class="row" style="gap:6px;margin-bottom:10px">
      <button type="button" class="btn ${_plMode === 'month' ? '' : 'secondary'}" data-pl-mode="month">Mensuel</button>
      <button type="button" class="btn ${_plMode === 'year' ? '' : 'secondary'}" data-pl-mode="year">Annuel</button>
    </div>
    <div style="overflow-x:auto">
      <table class="acc-table" style="width:100%;border-collapse:collapse;font-size:.9rem">
        <thead><tr style="border-bottom:1px solid var(--color-border)">
          <th style="text-align:left;padding:6px 4px">${keyLabel}</th>
          <th style="text-align:right;padding:6px 4px">Recettes</th>
          <th style="text-align:right;padding:6px 4px">Dépenses</th>
          <th style="text-align:right;padding:6px 4px">Net</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

// ── Onglet : Récurrentes ──────────────────────────────────────────────────────

function _renderRecurring(ctx, settings) {
  const charges = ctx.state.recurringCharges || [];
  const upcoming = unfoldRecurring(ctx.state).slice(-6).reverse();
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);

  const outCats = categoriesFor('out').map(([k, v]) => `<option value="${k}">${escapeHTML(v.icon)} ${escapeHTML(v.label)}</option>`).join('');
  const inCats = categoriesFor('in').map(([k, v]) => `<option value="${k}">${escapeHTML(v.icon)} ${escapeHTML(v.label)}</option>`).join('');

  const list = charges.length === 0
    ? `<div class="muted" style="padding:8px">Aucune charge récurrente.</div>`
    : charges.map(r => {
        const sign = r.direction === 'in' ? '+' : '−';
        const color = r.direction === 'in' ? '#16a34a' : '#b91c1c';
        const period = `le ${r.dayOfMonth} de chaque mois · depuis ${escapeHTML(r.startMonth)}${r.endMonth ? ' → ' + escapeHTML(r.endMonth) : ''}`;
        const skipped = Array.isArray(r.skips) && r.skips.includes(month);
        return `<div class="item" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--color-border)">
          <span style="font-size:1.1rem">${escapeHTML(categoryIcon(r.category))}</span>
          <div style="flex:1;min-width:0">
            <div><strong>${escapeHTML(r.label)}</strong> · <span style="color:${color}">${sign} ${formatCurrency(r.amount, settings)}</span></div>
            <div class="small muted">${period}</div>
          </div>
          <button class="btn secondary" data-rec-skip="${escapeAttr(r.id)}" title="Ignorer le mois courant"
            style="padding:2px 8px;font-size:.78rem">${skipped ? 'Ignoré ✓' : 'Ignorer ' + escapeHTML(month)}</button>
          <button class="btn danger" data-rec-del="${escapeAttr(r.id)}" style="padding:2px 8px;font-size:.8rem">×</button>
        </div>`;
      }).join('');

  const upcomingHTML = upcoming.length === 0 ? '' : `
    <div style="font-weight:700;margin:14px 0 4px">Prochaines occurrences générées</div>
    ${upcoming.map(o => `<div class="small muted">${escapeHTML(o.date)} · ${escapeHTML(o.label)} · ${o.direction === 'in' ? '+' : '−'} ${formatCurrency(o.amount, settings)}</div>`).join('')}`;

  return `
    <div style="font-weight:700;margin:6px 0">Ajouter une charge / recette récurrente</div>
    <form id="accRecForm" class="form" style="margin-bottom:14px">
      <div class="row2">
        <div class="field"><div class="label">Libellé</div><input class="input" name="label" maxlength="60" placeholder="ex: Loyer hangar" required></div>
        <div class="field"><div class="label">Sens</div>
          <select class="input" name="direction" id="recDir">
            <option value="out">Sortie (charge)</option>
            <option value="in">Entrée (recette)</option>
          </select></div>
      </div>
      <div class="row2">
        <div class="field"><div class="label">Catégorie</div>
          <select class="input" name="category" id="recCat" data-out="${escapeAttr(outCats)}" data-in="${escapeAttr(inCats)}">${outCats}</select></div>
        <div class="field"><div class="label">Montant (${escapeHTML(settings.currencySymbol)})</div><input class="input" type="number" name="amount" min="0.01" step="0.01" placeholder="ex: 25000" required></div>
      </div>
      <div class="row2">
        <div class="field"><div class="label">Jour du mois (1–28)</div><input class="input" type="number" name="dayOfMonth" min="1" max="28" value="1"></div>
        <div class="field"><div class="label">Mois de début</div><input class="input" type="month" name="startMonth" value="${month}" required></div>
      </div>
      <div class="field"><div class="label">Mois de fin <span class="muted small">(optionnel)</span></div><input class="input" type="month" name="endMonth"></div>
      <div class="row" style="justify-content:flex-end"><button type="submit" class="btn">+ Ajouter</button></div>
    </form>

    <div style="font-weight:700;margin:6px 0">Charges récurrentes (${charges.length})</div>
    <div class="list" id="accRecList">${list}</div>
    ${upcomingHTML}
  `;
}

// ── Câblage des événements ────────────────────────────────────────────────────

function _wire(ctx, root) {
  // Onglets
  root.querySelectorAll('[data-acc-tab]').forEach(btn => {
    btn.addEventListener('click', () => { _tab = btn.dataset.accTab; renderAccounting(ctx); });
  });

  root.querySelector('#accExportCsv')?.addEventListener('click', () => {
    const csv = listLedgerCSV(ctx.state);
    _downloadCSV(`comptabilite-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  });
  root.querySelector('#accPrint')?.addEventListener('click', () => window.print());

  // Bascule des catégories selon le sens (saisie + récurrentes).
  const bindDirCat = (dirSel, catSel) => {
    if (!dirSel || !catSel) return;
    dirSel.addEventListener('change', () => {
      catSel.innerHTML = dirSel.value === 'in' ? catSel.dataset.in : catSel.dataset.out;
    });
  };
  bindDirCat(root.querySelector('#txDir'), root.querySelector('#txCat'));
  bindDirCat(root.querySelector('#recDir'), root.querySelector('#recCat'));

  // Filtres journal
  const applyFilter = (key, el) => el?.addEventListener('change', () => { _filters[key] = el.value; renderAccounting(ctx); });
  applyFilter('from', root.querySelector('#fltFrom'));
  applyFilter('to', root.querySelector('#fltTo'));
  applyFilter('direction', root.querySelector('#fltDir'));
  applyFilter('category', root.querySelector('#fltCat'));
  applyFilter('source', root.querySelector('#fltSrc'));
  root.querySelector('#fltReset')?.addEventListener('click', () => {
    _filters.from = _filters.to = _filters.direction = _filters.category = _filters.source = '';
    renderAccounting(ctx);
  });

  // P&L mode
  root.querySelectorAll('[data-pl-mode]').forEach(btn => {
    btn.addEventListener('click', () => { _plMode = btn.dataset.plMode; renderAccounting(ctx); });
  });

  // Ajout transaction manuelle
  root.querySelector('#accTxForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const next = addTransaction(ctx.state, {
        date: fd.get('date'),
        direction: fd.get('direction'),
        category: fd.get('category'),
        amount: fd.get('amount'),
        description: fd.get('description'),
      });
      const tx = next.transactions[next.transactions.length - 1];
      ctx.state = ctx.Store.save(next);
      _pushTx(ctx, tx);
      showToast('Mouvement enregistré.', 'success');
      renderAccounting(ctx);
    } catch (err) {
      showToast(err?.message || String(err), 'error');
    }
  });

  // Suppression transaction manuelle
  root.querySelector('#accLedgerList')?.addEventListener('click', async (e) => {
    const id = e.target?.closest?.('[data-acc-del-tx]')?.dataset?.accDelTx;
    if (!id) return;
    const ok = await showConfirm({ title: 'Supprimer le mouvement', message: 'Cette ligne sera retirée du journal.', confirmLabel: 'Supprimer', danger: true });
    if (!ok) return;
    ctx.state = ctx.Store.save(deleteTransaction(ctx.state, id));
    _pushDeleteTx(ctx, id);
    showToast('Mouvement supprimé.', 'success');
    renderAccounting(ctx);
  });

  // Ajout charge récurrente
  root.querySelector('#accRecForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const next = addRecurringCharge(ctx.state, {
        label: fd.get('label'),
        direction: fd.get('direction'),
        category: fd.get('category'),
        amount: fd.get('amount'),
        dayOfMonth: fd.get('dayOfMonth'),
        startMonth: fd.get('startMonth'),
        endMonth: fd.get('endMonth') || null,
      });
      const rec = next.recurringCharges[next.recurringCharges.length - 1];
      ctx.state = ctx.Store.save(next);
      _pushRec(ctx, rec);
      showToast('Charge récurrente ajoutée.', 'success');
      renderAccounting(ctx);
    } catch (err) {
      showToast(err?.message || String(err), 'error');
    }
  });

  // Liste récurrentes : ignorer le mois / supprimer
  root.querySelector('#accRecList')?.addEventListener('click', async (e) => {
    const skipId = e.target?.closest?.('[data-rec-skip]')?.dataset?.recSkip;
    const delId = e.target?.closest?.('[data-rec-del]')?.dataset?.recDel;
    if (skipId) {
      const month = new Date().toISOString().slice(0, 7);
      ctx.state = ctx.Store.save(skipRecurringOccurrence(ctx.state, skipId, month));
      const rec = (ctx.state.recurringCharges || []).find(r => r.id === skipId);
      if (rec) _pushRec(ctx, rec);
      renderAccounting(ctx);
      return;
    }
    if (delId) {
      const ok = await showConfirm({ title: 'Supprimer la charge récurrente', message: 'Toutes ses occurrences disparaîtront du journal.', confirmLabel: 'Supprimer', danger: true });
      if (!ok) return;
      ctx.state = ctx.Store.save(deleteRecurringCharge(ctx.state, delId));
      _pushDeleteRec(ctx, delId);
      showToast('Charge supprimée.', 'success');
      renderAccounting(ctx);
    }
  });
}

// ── Push cloud (no-op hors ferme connectée) ─────────────────────────────────

function _fid(ctx) { return ctx.farmId || null; }

function _pushTx(ctx, tx) {
  const fid = _fid(ctx);
  if (fid && tx) trackCloudWrite(ctx, DB.upsertTransaction(fid, tx), { type: 'upsertTransaction', payload: { farmId: fid, transaction: tx } });
}
function _pushDeleteTx(ctx, id) {
  const fid = _fid(ctx);
  if (fid) trackCloudWrite(ctx, DB.deleteTransaction(fid, id), { type: 'deleteTransaction', payload: { farmId: fid, transactionId: id } });
}
function _pushRec(ctx, rec) {
  const fid = _fid(ctx);
  if (fid && rec) trackCloudWrite(ctx, DB.upsertRecurringCharge(fid, rec), { type: 'upsertRecurringCharge', payload: { farmId: fid, charge: rec } });
}
function _pushDeleteRec(ctx, id) {
  const fid = _fid(ctx);
  if (fid) trackCloudWrite(ctx, DB.deleteRecurringCharge(fid, id), { type: 'deleteRecurringCharge', payload: { farmId: fid, chargeId: id } });
}

// ── Utilitaires d'affichage ───────────────────────────────────────────────────

function _downloadCSV(filename, text) {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const _MONTHS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];

function _fmtMonth(yyyymm) {
  if (!yyyymm || yyyymm.length < 7) return yyyymm || '';
  const [y, m] = yyyymm.split('-');
  return `${_MONTHS[Number(m) - 1] || m} ${y}`;
}

function _fmtMonthShort(yyyymm) {
  if (!yyyymm || yyyymm.length < 7) return yyyymm || '';
  const [, m] = yyyymm.split('-');
  return _MONTHS[Number(m) - 1] || m;
}
