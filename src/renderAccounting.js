/**
 * renderAccounting.js — Modale Comptabilité (P&L mensuel + saisie dépenses).
 *
 * Accessible depuis le panneau Actions ("📊 Comptabilité"). Tout reste en
 * mémoire `state.expenses` + sync cloud via mutationQueue (à brancher
 * après-coup si besoin). Les recettes sont calculées depuis les événements
 * vente + commandes shop livrées (cf. accounting.js).
 */

import { openModal, closeModal } from './modal.js';
import { escapeHTML, escapeAttr } from './utils.js';
import { formatCurrency, getSettings } from './settingsService.js';
import { showToast, showConfirm } from './notifications.js';
import {
  EXPENSE_CATEGORIES,
  addExpense,
  deleteExpense,
  listExpenses,
  listRevenues,
  computeMonthlyPL,
  computeTotals,
} from './accounting.js';

export function openAccountingModal(ctx) {
  _render(ctx);
}

function _render(ctx) {
  const settings = getSettings(ctx);
  // Pour le MVP local-first : on n'agrège que les events. Les commandes shop
  // viendront via un second call (cf. roadmap 6.x — sync mode pull on demand).
  const totals = computeTotals(ctx.state);
  const monthly = computeMonthlyPL(ctx.state);
  const expenses = listExpenses(ctx.state);
  const revenues = listRevenues(ctx.state);

  const today = new Date().toISOString().slice(0, 10);
  const catOptions = Object.entries(EXPENSE_CATEGORIES)
    .map(([k, v]) => `<option value="${k}">${v.icon} ${escapeHTML(v.label)}</option>`)
    .join('');

  const monthlyRows = monthly.length === 0
    ? `<tr><td colspan="4" class="muted" style="text-align:center;padding:8px">Aucun mouvement enregistré.</td></tr>`
    : monthly.map(m => {
        const netClass = m.net >= 0 ? 'pl-net-positive' : 'pl-net-negative';
        return `<tr>
          <td><strong>${escapeHTML(_fmtMonth(m.month))}</strong></td>
          <td style="text-align:right;color:#16a34a">${formatCurrency(m.revenue, settings)}</td>
          <td style="text-align:right;color:#b91c1c">${formatCurrency(m.expensesTotal, settings)}</td>
          <td style="text-align:right;font-weight:700" class="${netClass}">${formatCurrency(m.net, settings)}</td>
        </tr>`;
      }).join('');

  const expensesRows = expenses.length === 0
    ? `<div class="muted" style="padding:8px">Aucune dépense saisie.</div>`
    : expenses.slice(0, 15).map(e => {
        const cat = EXPENSE_CATEGORIES[e.category] || EXPENSE_CATEGORIES.autre;
        return `<div class="item" style="display:flex;align-items:center;gap:8px;padding:6px 0">
          <span style="font-size:1.2rem">${cat.icon}</span>
          <div style="flex:1;min-width:0">
            <div><strong>${formatCurrency(e.amount, settings)}</strong> · <span class="badge">${escapeHTML(cat.label)}</span></div>
            <div class="small muted">${escapeHTML(e.date)}${e.description ? ' · ' + escapeHTML(e.description) : ''}</div>
          </div>
          <button class="btn danger" data-acc-del="${escapeAttr(e.id)}" style="padding:2px 8px;font-size:.8rem">×</button>
        </div>`;
      }).join('');

  const netTotalClass = totals.net >= 0 ? 'pl-net-positive' : 'pl-net-negative';

  openModal(ctx.el, '📊 Comptabilité', `
    <div class="acc-totals" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">
      <div class="tile"><div class="t">Recettes totales</div><div class="n" style="font-size:1.1rem;color:#16a34a">${formatCurrency(totals.revenue, settings)}</div></div>
      <div class="tile"><div class="t">Dépenses totales</div><div class="n" style="font-size:1.1rem;color:#b91c1c">${formatCurrency(totals.expensesTotal, settings)}</div></div>
      <div class="tile"><div class="t">Résultat net</div><div class="n ${netTotalClass}" style="font-size:1.1rem">${formatCurrency(totals.net, settings)}</div></div>
    </div>

    <div style="font-weight:700;margin:8px 0 6px">P&amp;L mensuel</div>
    <div style="overflow-x:auto;margin-bottom:14px">
      <table class="acc-table" style="width:100%;border-collapse:collapse;font-size:.9rem">
        <thead>
          <tr style="border-bottom:1px solid var(--color-border)">
            <th style="text-align:left;padding:6px 4px">Mois</th>
            <th style="text-align:right;padding:6px 4px">Recettes</th>
            <th style="text-align:right;padding:6px 4px">Dépenses</th>
            <th style="text-align:right;padding:6px 4px">Net</th>
          </tr>
        </thead>
        <tbody>${monthlyRows}</tbody>
      </table>
    </div>

    <details style="margin-bottom:10px">
      <summary style="cursor:pointer;font-weight:700">Recettes en détail (${revenues.length})</summary>
      <div style="max-height:180px;overflow:auto;margin-top:6px">
        ${revenues.length === 0
          ? `<div class="muted small">Aucune vente enregistrée. Une vente passe automatiquement ici dès qu'un événement de type "vente" est ajouté à un lapin (avec un prix).</div>`
          : revenues.slice(0, 30).map(r =>
              `<div class="small">${escapeHTML(r.date)} · ${formatCurrency(r.amount, settings)} · ${escapeHTML(r.label)}</div>`
            ).join('')}
      </div>
    </details>

    <div style="font-weight:700;margin:8px 0 6px">Saisir une dépense</div>
    <form id="accExpenseForm" class="form" style="margin-bottom:10px">
      <div class="row2">
        <div class="field">
          <div class="label">Date</div>
          <input class="input" type="date" name="date" value="${escapeAttr(today)}" required />
        </div>
        <div class="field">
          <div class="label">Catégorie</div>
          <select class="input" name="category" required>${catOptions}</select>
        </div>
      </div>
      <div class="row2">
        <div class="field">
          <div class="label">Montant (${escapeHTML(settings.currencySymbol)})</div>
          <input class="input" type="number" name="amount" min="0.01" step="0.01" placeholder="ex: 5000" required />
        </div>
        <div class="field">
          <div class="label">Description <span class="muted small">(optionnel)</span></div>
          <input class="input" type="text" name="description" maxlength="120" placeholder="Sac de granulés 25kg" />
        </div>
      </div>
      <div class="row" style="justify-content:flex-end;gap:8px;margin-top:8px">
        <button type="button" class="btn secondary" id="accClose">Fermer</button>
        <button type="submit" class="btn">+ Ajouter la dépense</button>
      </div>
    </form>

    <div style="font-weight:700;margin:8px 0 6px">Dépenses récentes (${expenses.length})</div>
    <div class="list" id="accExpensesList">${expensesRows}</div>
  `);

  document.getElementById('accClose')?.addEventListener('click', () => closeModal(ctx.el));

  document.getElementById('accExpenseForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      ctx.state = ctx.Store.save(addExpense(ctx.state, {
        date: fd.get('date'),
        category: fd.get('category'),
        amount: fd.get('amount'),
        description: fd.get('description'),
      }));
      showToast('Dépense enregistrée.', 'success');
      _render(ctx);
    } catch (err) {
      showToast(err.message || String(err), 'error');
    }
  });

  // Suppression d'une dépense (avec confirmation)
  document.getElementById('accExpensesList')?.addEventListener('click', async (e) => {
    const id = e.target?.closest?.('[data-acc-del]')?.dataset?.accDel;
    if (!id) return;
    const ok = await showConfirm({
      title: 'Supprimer la dépense',
      message: 'Cette dépense sera retirée de votre comptabilité.',
      confirmLabel: 'Supprimer', danger: true,
    });
    if (!ok) return;
    ctx.state = ctx.Store.save(deleteExpense(ctx.state, id));
    showToast('Dépense supprimée.', 'success');
    _render(ctx);
  });
}

function _fmtMonth(yyyymm) {
  if (!yyyymm || yyyymm.length < 7) return yyyymm || '';
  const [y, m] = yyyymm.split('-');
  const labels = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
  const idx = Number(m) - 1;
  return `${labels[idx] || m} ${y}`;
}
