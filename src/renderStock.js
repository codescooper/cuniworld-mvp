import { escapeHTML } from './utils.js';
import { STOCK_CATEGORIES, getStockByCategory, getLowStockItems, addStockMovement, createStockItem, updateStockItem, deleteStockItem } from './stockService.js';
import { Store } from './store.js';
import { openModal, closeModal } from './modal.js';
import { showToast, showConfirm } from './notifications.js';
import { DB } from './db.js';
import { trackCloudWrite } from './actions.js';

function _close(ctx) { closeModal(ctx.el); }

// ── Main render ───────────────────────────────────────────────────────────────

export function renderStock(ctx) {
  const host = document.getElementById('stockDash');
  if (!host) return;
  const { state } = ctx;

  const lowStock   = getLowStockItems(state);
  const byCategory = getStockByCategory(state);
  const totalItems = (state.stock || []).length;

  let html = '';

  if (lowStock.length > 0) {
    html += `<div class="stock-alert">
      <span class="stock-alert-icon">⚠️</span>
      <span>Stock bas : <strong>${lowStock.map(x => escapeHTML(x.name)).join(', ')}</strong></span>
    </div>`;
  }

  if (totalItems === 0) {
    html += `<div class="muted" style="padding:32px;text-align:center">
      Aucun article en stock. Cliquez sur <strong>+ Ajouter article</strong> pour commencer.
    </div>`;
    host.innerHTML = html;
    return;
  }

  for (const [cat, catInfo] of Object.entries(STOCK_CATEGORIES)) {
    const items = byCategory[cat];
    if (items.length === 0) continue;
    html += `<div class="stock-category">
      <div class="stock-category-title">${catInfo.icon} ${escapeHTML(catInfo.label)} <span class="muted">(${items.length})</span></div>
      <div class="stock-item-list">
        ${items.map(item => _renderStockItem(item)).join('')}
      </div>
    </div>`;
  }

  host.innerHTML = html;
  _wireStockButtons(ctx, host);
}

function _renderStockItem(item) {
  const isLow  = item.minQuantity > 0 && item.quantity <= item.minQuantity;
  const isEmpty = item.quantity === 0;
  const pct    = item.minQuantity > 0
    ? Math.min(100, Math.round((item.quantity / (item.minQuantity * 3)) * 100))
    : -1;

  return `
    <div class="stock-item${isLow ? ' stock-item--low' : ''}${isEmpty ? ' stock-item--empty' : ''}" data-stock-id="${escapeHTML(item.id)}">
      <div class="stock-item-main">
        <div class="stock-item-name">${escapeHTML(item.name)}</div>
        <div class="stock-item-qty${isEmpty ? ' qty-empty' : isLow ? ' qty-low' : ''}">
          ${item.quantity} <span class="stock-unit">${escapeHTML(item.unit)}</span>
          ${isLow ? '<span class="stock-low-badge">Stock bas</span>' : ''}
        </div>
        ${pct >= 0 ? `<div class="stock-mini-bar"><div class="stock-mini-fill${isLow ? ' fill-danger' : ''}" style="width:${pct}%"></div></div>` : ''}
        ${item.notes ? `<div class="stock-item-notes muted">${escapeHTML(item.notes)}</div>` : ''}
      </div>
      <div class="stock-item-actions">
        <button class="btn secondary" data-stock-add="${escapeHTML(item.id)}" title="Réapprovisionner">+</button>
        <button class="btn secondary" data-stock-use="${escapeHTML(item.id)}" title="Consommer">−</button>
        <button class="btn ghost"     data-stock-edit="${escapeHTML(item.id)}" title="Modifier">✏️</button>
        <button class="btn ghost"     data-stock-del="${escapeHTML(item.id)}" title="Supprimer" style="color:var(--color-danger)">🗑</button>
      </div>
    </div>`;
}

function _wireStockButtons(ctx, host) {
  host.addEventListener('click', async e => {
    const addId  = e.target.closest('[data-stock-add]')?.dataset?.stockAdd;
    const useId  = e.target.closest('[data-stock-use]')?.dataset?.stockUse;
    const editId = e.target.closest('[data-stock-edit]')?.dataset?.stockEdit;
    const delId  = e.target.closest('[data-stock-del]')?.dataset?.stockDel;

    if (addId)  { _openMovementModal(ctx, addId, 'entree'); return; }
    if (useId)  { _openMovementModal(ctx, useId, 'sortie'); return; }
    if (editId) { _openEditModal(ctx, editId); return; }
    if (delId) {
      const item = (ctx.state.stock || []).find(x => x.id === delId);
      if (!item) return;
      const ok = await showConfirm({ title: 'Supprimer l\'article', message: `Supprimer "${item.name}" et tout son historique ?`, confirmLabel: 'Supprimer', danger: true });
      if (!ok) return;
      const fid = ctx.farmId || null;
      const mvIds = (ctx.state.stockMovements || []).filter(m => m.stockItemId === delId).map(m => m.id);
      ctx.state = Store.save(deleteStockItem(ctx.state, delId));
      if (fid) {
        trackCloudWrite(ctx, DB.deleteStockItem(fid, delId), { type: 'deleteStockItem', payload: { farmId: fid, itemId: delId } });
        for (const mvId of mvIds)
          trackCloudWrite(ctx, DB.deleteStockMovement(fid, mvId), { type: 'deleteStockMovement', payload: { farmId: fid, movementId: mvId } });
      }
      ctx.render();
    }
  }, { once: true });
}

// ── Add / edit item modal ─────────────────────────────────────────────────────

export function openAddStockModal(ctx) {
  openModal(ctx.el, 'Nouvel article', _stockFormHTML(null));
  _wireStockForm(ctx, null);
}

function _openEditModal(ctx, itemId) {
  const item = (ctx.state.stock || []).find(x => x.id === itemId);
  if (!item) return;
  openModal(ctx.el, 'Modifier l\'article', _stockFormHTML(item));
  _wireStockForm(ctx, item);
}

function _stockFormHTML(item) {
  const catOptions = Object.entries(STOCK_CATEGORIES)
    .map(([k, v]) => `<option value="${k}"${item?.category === k ? ' selected' : ''}>${v.icon} ${v.label}</option>`)
    .join('');

  return `
    <div class="field">
      <div class="label">Nom de l'article</div>
      <input id="sfName" class="input" type="text" value="${escapeHTML(item?.name || '')}" placeholder="ex: Granulés lapins" maxlength="80" autofocus />
    </div>
    <div class="field">
      <div class="label">Catégorie</div>
      <select id="sfCategory" class="input">${catOptions}</select>
    </div>
    <div class="row" style="gap:8px">
      <div class="field" style="flex:2">
        <div class="label">Quantité actuelle</div>
        <input id="sfQty" class="input" type="number" min="0" step="0.1" value="${item?.quantity ?? 0}" />
      </div>
      <div class="field" style="flex:1.5">
        <div class="label">Unité</div>
        <input id="sfUnit" class="input" type="text" value="${escapeHTML(item?.unit || 'kg')}" placeholder="kg, L, unité…" maxlength="20" />
      </div>
    </div>
    <div class="field">
      <div class="label">Seuil d'alerte stock bas <span class="muted">(0 = désactivé)</span></div>
      <input id="sfMin" class="input" type="number" min="0" step="0.1" value="${item?.minQuantity ?? 0}" />
    </div>
    <div class="field">
      <div class="label">Notes <span class="muted">(optionnel)</span></div>
      <input id="sfNotes" class="input" type="text" value="${escapeHTML(item?.notes || '')}" maxlength="120" />
    </div>
    <div id="sfError" style="color:var(--color-danger);font-size:.85rem;min-height:1em;margin-top:4px"></div>
    <div class="row" style="margin-top:16px;gap:8px">
      <button class="btn secondary" id="sfCancel" style="flex:1">Annuler</button>
      <button class="btn" id="sfSave" style="flex:2">${item ? 'Enregistrer' : 'Ajouter'}</button>
    </div>`;
}

function _wireStockForm(ctx, existingItem) {
  document.getElementById('sfCancel')?.addEventListener('click', () => _close(ctx));
  document.getElementById('sfSave')?.addEventListener('click', () => {
    const name     = document.getElementById('sfName')?.value?.trim();
    const category = document.getElementById('sfCategory')?.value;
    const qty      = parseFloat(document.getElementById('sfQty')?.value);
    const unit     = document.getElementById('sfUnit')?.value?.trim() || 'unité';
    const min      = parseFloat(document.getElementById('sfMin')?.value) || 0;
    const notes    = document.getElementById('sfNotes')?.value?.trim() || '';
    const errEl    = document.getElementById('sfError');

    if (!name) { if (errEl) errEl.textContent = 'Le nom est requis.'; return; }

    try {
      const fid = ctx.farmId || null;
      if (existingItem) {
        ctx.state = Store.save(updateStockItem(ctx.state, existingItem.id, {
          name, category, quantity: isNaN(qty) ? existingItem.quantity : qty, unit, minQuantity: min, notes,
        }));
        const updated = (ctx.state.stock || []).find(x => x.id === existingItem.id);
        if (fid && updated) trackCloudWrite(ctx, DB.upsertStockItem(fid, updated), { type: 'upsertStockItem', payload: { farmId: fid, item: updated } });
      } else {
        const prevIds = new Set((ctx.state.stock || []).map(x => x.id));
        ctx.state = Store.save(createStockItem(ctx.state, {
          name, category, quantity: isNaN(qty) ? 0 : qty, unit, minQuantity: min, notes,
        }));
        if (fid) {
          for (const item of (ctx.state.stock || []).filter(x => !prevIds.has(x.id)))
            trackCloudWrite(ctx, DB.upsertStockItem(fid, item), { type: 'upsertStockItem', payload: { farmId: fid, item } });
        }
      }
      _close(ctx);
      ctx.render();
      showToast(existingItem ? 'Article mis à jour.' : 'Article ajouté.', 'success');
    } catch (err) {
      if (errEl) errEl.textContent = err.message || 'Erreur.';
    }
  });
}

// ── Movement modal ────────────────────────────────────────────────────────────

function _openMovementModal(ctx, itemId, type) {
  const item  = (ctx.state.stock || []).find(x => x.id === itemId);
  if (!item) return;
  const today = new Date().toISOString().slice(0, 10);
  const title = type === 'entree' ? `Réapprovisionner : ${item.name}` : `Consommer : ${item.name}`;

  openModal(ctx.el, title, `
    <div class="muted" style="margin-bottom:12px">Stock actuel : <strong>${item.quantity} ${escapeHTML(item.unit)}</strong></div>
    <div class="field">
      <div class="label">Quantité à ${type === 'entree' ? 'ajouter' : 'retirer'} (${escapeHTML(item.unit)})</div>
      <input id="mvQty" class="input" type="number" min="0.01" step="0.1" placeholder="ex: 5"
             style="font-size:1.2rem;text-align:center" autofocus />
    </div>
    <div class="field">
      <div class="label">Date</div>
      <input id="mvDate" class="input" type="date" value="${today}" />
    </div>
    ${type === 'entree' ? `
    <div class="field">
      <div class="label">Coût total <span class="muted">(optionnel — enregistre une dépense en comptabilité)</span></div>
      <input id="mvCost" class="input" type="number" min="0" step="0.01" placeholder="ex: 18000" />
    </div>` : ''}
    <div class="field">
      <div class="label">Notes <span class="muted">(optionnel)</span></div>
      <input id="mvNotes" class="input" type="text" maxlength="120" />
    </div>
    <div id="mvError" style="color:var(--color-danger);font-size:.85rem;min-height:1em;margin-top:4px"></div>
    <div class="row" style="margin-top:16px;gap:8px">
      <button class="btn secondary" id="mvCancel" style="flex:1">Annuler</button>
      <button class="btn" id="mvSave" style="flex:2">${type === 'entree' ? '+ Ajouter au stock' : '− Retirer du stock'}</button>
    </div>`);

  document.getElementById('mvCancel')?.addEventListener('click', () => _close(ctx));
  document.getElementById('mvSave')?.addEventListener('click', () => {
    const qty   = parseFloat(document.getElementById('mvQty')?.value);
    const date  = document.getElementById('mvDate')?.value || today;
    const notes = document.getElementById('mvNotes')?.value?.trim() || '';
    const costRaw = document.getElementById('mvCost')?.value;
    const totalCost = costRaw != null && costRaw !== '' ? parseFloat(costRaw) : undefined;
    const errEl = document.getElementById('mvError');

    if (!Number.isFinite(qty) || qty <= 0) {
      if (errEl) errEl.textContent = 'Quantité invalide (doit être > 0).';
      return;
    }
    try {
      const fid = ctx.farmId || null;
      const prevMvIds = new Set((ctx.state.stockMovements || []).map(m => m.id));
      ctx.state = Store.save(addStockMovement(ctx.state, { stockItemId: itemId, type, quantity: qty, date, notes, totalCost }));
      if (fid) {
        for (const mv of (ctx.state.stockMovements || []).filter(m => !prevMvIds.has(m.id)))
          trackCloudWrite(ctx, DB.upsertStockMovement(fid, mv), { type: 'upsertStockMovement', payload: { farmId: fid, movement: mv } });
        const updatedItem = (ctx.state.stock || []).find(x => x.id === itemId);
        if (updatedItem) trackCloudWrite(ctx, DB.upsertStockItem(fid, updatedItem), { type: 'upsertStockItem', payload: { farmId: fid, item: updatedItem } });
      }
      _close(ctx);
      ctx.render();
      const updated = (ctx.state.stock || []).find(x => x.id === itemId);
      showToast(`${updated?.name} : ${updated?.quantity} ${updated?.unit} en stock`, 'success');
    } catch (err) {
      if (errEl) errEl.textContent = err.message || 'Erreur.';
    }
  });
}
