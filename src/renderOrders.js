// Panneau "Commandes" côté éleveur — liste des commandes de la ferme,
// transitions de statut, contact rapide WhatsApp/téléphone.

import { escapeHTML, escapeAttr, formatDate } from './utils.js';
import { formatCurrency, getSettings } from './settingsService.js';
import { listFarmOrders, setOrderStatus, ORDER_STATUSES, getStatusLabel } from './shopService.js';
import { showToast, showConfirm } from './notifications.js';
import { can } from './permissions.js';

let _cache = { farmId: null, orders: null, at: 0 };
const CACHE_TTL = 30000;

export async function renderOrders(ctx) {
  const host = document.getElementById('ordersContent');
  if (!host) return;

  if (!ctx.farmId) {
    host.innerHTML = `
      <div class="section-card">
        <div class="muted">Les commandes ne sont disponibles qu'en mode cloud.</div>
      </div>`;
    return;
  }

  // Cache rapide pour éviter de rafraîchir à chaque switch de panneau
  const now = Date.now();
  if (_cache.farmId !== ctx.farmId || (now - _cache.at) > CACHE_TTL) {
    host.innerHTML = `<div class="muted">Chargement des commandes…</div>`;
    try {
      _cache = { farmId: ctx.farmId, orders: await listFarmOrders(ctx.farmId), at: now };
    } catch (err) {
      host.innerHTML = `<div class="section-card"><div class="muted" style="color:#c0392b">Erreur : ${escapeHTML(err?.message || '')}</div></div>`;
      return;
    }
  }

  const orders = _cache.orders || [];
  if (orders.length === 0) {
    host.innerHTML = `
      <div class="section-card">
        <div class="muted">Aucune commande pour le moment.</div>
        <div class="small muted" style="margin-top:6px">Marquez vos lapins « À vendre » dans leur fiche pour qu'ils apparaissent dans la boutique publique.</div>
      </div>
      <div class="section-card" style="margin-top:12px">
        <div style="font-weight:700;margin-bottom:6px">Liens de la boutique</div>
        ${_shopLinks(ctx)}
      </div>`;
    return;
  }

  const counts = { reserve: 0, paye: 0, en_route: 0, livre: 0, annule: 0 };
  for (const o of orders) counts[o.status] = (counts[o.status] || 0) + 1;

  host.innerHTML = `
    <div class="orders-summary" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      ${ORDER_STATUSES.map(s => `
        <div class="tile" style="padding:8px 12px">
          <div class="n" style="font-size:1.2rem">${counts[s.code] || 0}</div>
          <div class="t">${s.icon} ${escapeHTML(s.label)}</div>
        </div>
      `).join('')}
    </div>

    <div class="section-card" style="margin-bottom:10px">${_shopLinks(ctx)}</div>

    <div class="list" id="ordersList">
      ${orders.map(o => _orderCard(ctx, o)).join('')}
    </div>
  `;

  // Refresh button
  host.querySelectorAll('[data-refresh-orders]').forEach(b => b.addEventListener('click', () => {
    _cache = { farmId: null, orders: null, at: 0 };
    renderOrders(ctx);
  }));

  // Transitions
  host.querySelectorAll('[data-order-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const orderId = btn.dataset.orderId;
      const action  = btn.dataset.orderAction;
      let confirmMsg = null;
      if (action === 'annule') confirmMsg = 'Annuler cette commande ? Les lapins redeviendront disponibles.';
      if (action === 'livre')  confirmMsg = 'Marquer comme livrée ? Vous pourrez ensuite enregistrer la vente sur chaque lapin.';
      if (confirmMsg) {
        const ok = await showConfirm({
          title: 'Confirmation', message: confirmMsg,
          confirmLabel: 'Confirmer', cancelLabel: 'Annuler',
          danger: action === 'annule',
        });
        if (!ok) return;
      }
      try {
        await setOrderStatus(orderId, action);
        _cache = { farmId: null, orders: null, at: 0 };
        showToast('Statut mis à jour.', 'success');
        renderOrders(ctx);
      } catch (err) {
        showToast('Échec : ' + (err?.message || err), 'error');
      }
    });
  });
}

function _shopLinks(ctx) {
  const base = window.location.origin + window.location.pathname.replace(/\/$/, '');
  const farmLink = `${base}?shop=${ctx.farmId}`;
  const allLink  = `${base}?shop=all`;
  return `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <div class="small">Boutique de cette ferme :</div>
      <a href="${escapeAttr(farmLink)}" target="_blank" rel="noopener" style="word-break:break-all">${escapeHTML(farmLink)}</a>
      <button class="btn ghost" data-copy-link="${escapeAttr(farmLink)}" type="button">📋 Copier</button>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px">
      <div class="small">Catalogue global :</div>
      <a href="${escapeAttr(allLink)}" target="_blank" rel="noopener" style="word-break:break-all">${escapeHTML(allLink)}</a>
    </div>
  `;
}

function _orderCard(ctx, o) {
  const settings = getSettings(ctx);
  const cust = (o.data && o.data.customer) || {};
  const status = getStatusLabel(o.status);
  const total = (o.items || []).reduce((s, it) => s + (Number(it.unit_price) || 0), 0);
  const itemsHTML = (o.items || []).map(it => {
    const snap = it.rabbit_snapshot || {};
    return `<li>${escapeHTML(snap.name || it.rabbit_id)} ${snap.code ? `<span class="muted small">(${escapeHTML(snap.code)})</span>` : ''} — ${formatCurrency(it.unit_price || 0, settings)} <button class="btn ghost" data-set-price="${escapeAttr(it.id)}" data-order-id="${escapeAttr(o.id)}" style="padding:0 6px;font-size:.8rem">✎ Prix</button></li>`;
  }).join('');

  const phoneClean = (cust.phone || '').replace(/\D/g, '');
  const contactBtns = `
    ${cust.phone ? `<a class="btn ghost" href="tel:${escapeAttr(cust.phone)}">📞 ${escapeHTML(cust.phone)}</a>` : ''}
    ${phoneClean ? `<a class="btn ghost" target="_blank" rel="noopener" href="https://wa.me/${escapeAttr(phoneClean)}?text=${encodeURIComponent('Bonjour ' + (cust.name || '') + ', votre commande sur CuniWorld :')}">💬 WhatsApp</a>` : ''}
    ${cust.email ? `<a class="btn ghost" href="mailto:${escapeAttr(cust.email)}">✉️</a>` : ''}
  `;

  const allowed = can(ctx, 'sell_rabbit');
  const next = status.next;
  const transitions = allowed ? `
    ${next && o.status !== 'annule' && o.status !== 'livre' ? `<button class="btn" data-order-action="${next}" data-order-id="${escapeAttr(o.id)}">→ ${getStatusLabel(next).icon} ${getStatusLabel(next).label}</button>` : ''}
    ${o.status !== 'annule' && o.status !== 'livre' ? `<button class="btn ghost" data-order-action="annule" data-order-id="${escapeAttr(o.id)}">❌ Annuler</button>` : ''}
  ` : '';

  return `
    <div class="item" style="display:block;padding:14px">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:10px;flex-wrap:wrap">
        <div>
          <div style="font-weight:700">${status.icon} ${escapeHTML(status.label)} <span class="muted small">#${escapeHTML(o.id.slice(0,8))}</span></div>
          <div class="small muted">Reçue le ${escapeHTML(formatDate(o.created_at))}</div>
        </div>
        <div style="font-weight:700;color:var(--color-primary)">${formatCurrency(total, settings)}</div>
      </div>

      <div style="margin-top:10px">
        <div><strong>${escapeHTML(cust.name || '—')}</strong></div>
        ${cust.address ? `<div class="small">📍 ${escapeHTML(cust.address)}</div>` : ''}
        ${cust.notes ? `<div class="small muted">Note : ${escapeHTML(cust.notes)}</div>` : ''}
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${contactBtns}</div>
      </div>

      <ul style="margin:10px 0 6px;padding-left:18px">${itemsHTML}</ul>

      ${transitions ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${transitions}</div>` : ''}
    </div>
  `;
}
