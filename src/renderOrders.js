// Panneau "Commandes" côté éleveur — liste des commandes de la ferme,
// transitions de statut, contact rapide WhatsApp/téléphone.

import { escapeHTML, escapeAttr, formatDate } from './utils.js';
import { formatCurrency, getSettings } from './settingsService.js';
import { listFarmOrders, setOrderStatus, ORDER_STATUSES, getStatusLabel } from './shopService.js';
import { showToast, showConfirm } from './notifications.js';
import { can } from './permissions.js';
import { addEvent } from './actions.js';
import { spinnerHTML, trackFetch } from './loading.js';

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
    host.innerHTML = spinnerHTML('Chargement des commandes…');
    try {
      _cache = { farmId: ctx.farmId, orders: await trackFetch(listFarmOrders(ctx.farmId)), at: now };
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

  // Copy + share helpers (boutique)
  host.querySelectorAll('[data-copy-link]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const link = btn.dataset.copyLink;
      try {
        await navigator.clipboard.writeText(link);
        showToast('Lien copié dans le presse-papier.', 'success');
      } catch (_) {
        showToast(link, 'info');
      }
    });
  });
  host.querySelectorAll('[data-share-shop]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const url = btn.dataset.shareShop;
      const title = `Boutique CuniWorld — ${ctx.farmName || ''}`;
      const text = `Découvrez les lapins en vente : ${url}`;
      if (navigator.share) {
        try { await navigator.share({ title, text, url }); return; } catch (_) { /* user cancelled */ }
      }
      try { await navigator.clipboard.writeText(url); showToast('Lien copié.', 'success'); }
      catch (_) { showToast(url, 'info'); }
    });
  });

  // Impression facture (commandes livrées). Handler SYNCHRONE jusqu'au
  // window.open pour ne pas perdre le contexte user-gesture (cf. carnet
  // sanitaire dans wire.js). Le lazy import se fait après.
  host.querySelectorAll('[data-print-invoice]').forEach(btn => {
    btn.addEventListener('click', () => {
      const orderId = btn.dataset.printInvoice;
      const order = (_cache.orders || []).find(o => o.id === orderId);
      if (!order) { showToast('Commande introuvable.', 'error'); return; }
      const w = window.open('about:blank', '_blank', 'width=900,height=1000');
      if (!w) {
        showToast("Le navigateur a bloqué la fenêtre d'impression. Autorisez les popups pour ce site.", 'error');
        return;
      }
      try { w.document.write('<!doctype html><meta charset="utf-8"><title>Préparation…</title><p style="font-family:sans-serif;padding:24px">Préparation de la facture…</p>'); w.document.close(); } catch (_) {}
      const cust = order.data?.customer || {};
      const normalized = {
        ...order,
        data: {
          ...(order.data || {}),
          customer_name:    cust.name    || order.data?.customer_name,
          customer_phone:   cust.phone   || order.data?.customer_phone,
          customer_email:   cust.email   || order.data?.customer_email,
          customer_address: cust.address || order.data?.customer_address,
          totalAmount: (order.items || []).reduce((s, it) => s + (Number(it.unit_price) || 0), 0),
        },
      };
      import('./printable.js').then(mod => {
        mod.printInvoice(normalized, ctx, w);
      }).catch(err => {
        try { w.close(); } catch (_) {}
        showToast('Impossible de générer la facture : ' + (err?.message || err), 'error');
      });
    });
  });

  // Transitions
  host.querySelectorAll('[data-order-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const orderId = btn.dataset.orderId;
      const action  = btn.dataset.orderAction;
      let confirmMsg = null;
      if (action === 'annule') confirmMsg = 'Annuler cette commande ? Les lapins redeviendront disponibles dans la boutique.';
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

        // Auto-vente : à la livraison, on propose de fermer la boucle en
        // enregistrant l'événement vente sur chaque lapin (passage en "vendu"
        // + prix capturé). Si l'utilisateur refuse, on garde juste le statut.
        if (action === 'livre') {
          const order = (_cache.orders || []).find(o => o.id === orderId);
          await _autoCreateSaleEvents(ctx, order);
        }

        _cache = { farmId: null, orders: null, at: 0 };
        showToast('Statut mis à jour.', 'success');
        renderOrders(ctx);
      } catch (err) {
        showToast('Échec : ' + (err?.message || err), 'error');
      }
    });
  });
}

// ── Auto-vente : crée un événement vente pour chaque lapin de la commande ──
async function _autoCreateSaleEvents(ctx, order) {
  if (!order || !Array.isArray(order.items) || order.items.length === 0) return;
  const cust = order.data?.customer || {};
  const items = order.items.filter(it => it.rabbit_id);
  if (items.length === 0) return;

  // Filtre : ne propose la vente que pour les lapins encore "actif".
  const eligibles = items.filter(it => {
    const r = ctx.state.rabbits.find(rb => rb.id === it.rabbit_id);
    return r && r.status === 'actif';
  });
  if (eligibles.length === 0) return;

  const labels = eligibles.map(it => {
    const r = ctx.state.rabbits.find(rb => rb.id === it.rabbit_id);
    return `• ${r?.name || it.rabbit_id} (${it.unit_price || 0})`;
  }).join('\n');

  const ok = await showConfirm({
    title: 'Enregistrer la vente ?',
    message: `Marquer ces lapins comme vendus et enregistrer l'événement vente ?\n\n${labels}\n\nClient : ${cust.name || '—'}`,
    confirmLabel: 'Oui, enregistrer la vente',
    cancelLabel: 'Plus tard',
  });
  if (!ok) return;

  const today = new Date().toISOString().slice(0, 10);
  for (const it of eligibles) {
    try {
      addEvent(ctx, it.rabbit_id, {
        type: 'vente',
        date: today,
        notes: `Commande #${order.id.slice(0, 8)} · ${cust.name || ''}`.trim(),
        data: {
          price:  Number(it.unit_price) || 0,
          client: cust.name || '',
        },
      });
    } catch (err) {
      console.warn('[orders] auto-sale failed for', it.rabbit_id, err?.message || err);
    }
  }
}

export function _shopLinks(ctx) {
  const base = window.location.origin + window.location.pathname.replace(/\/$/, '');
  const farmLink = `${base}?shop=${ctx.farmId}`;
  const allLink  = `${base}?shop=all`;
  const waMsg = `Bonjour, voici la boutique en ligne de ma ferme ${ctx.farmName || ''} : ${farmLink}`;
  const waUrl = `https://wa.me/?text=${encodeURIComponent(waMsg)}`;
  // QR code via service externe (pas de dépendance JS). Aperçu image légère.
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(farmLink)}`;
  return `
    <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start">
      <div style="flex:1;min-width:240px">
        <div style="font-weight:700;margin-bottom:6px">📤 Partager ma boutique</div>
        <div style="font-size:.85rem;color:#555;margin-bottom:8px">
          Lien direct vers votre catalogue de lapins en vente. À partager par message, à imprimer en QR sur une carte de visite, etc.
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
          <a class="btn" href="${escapeAttr(farmLink)}" target="_blank" rel="noopener">🏪 Ouvrir la boutique</a>
          <button class="btn secondary" type="button" data-copy-link="${escapeAttr(farmLink)}">📋 Copier le lien</button>
          <button class="btn secondary" type="button" data-share-shop="${escapeAttr(farmLink)}">📲 Partager…</button>
          <a class="btn secondary" href="${escapeAttr(waUrl)}" target="_blank" rel="noopener">💬 WhatsApp</a>
        </div>
        <div style="font-family:monospace;font-size:.8rem;background:#f5f3eb;padding:6px 8px;border-radius:6px;word-break:break-all">${escapeHTML(farmLink)}</div>
        <div style="margin-top:6px;font-size:.8rem;color:#888">
          Catalogue toutes fermes : <a href="${escapeAttr(allLink)}" target="_blank" rel="noopener">${escapeHTML(allLink)}</a>
        </div>
      </div>
      <div style="text-align:center">
        <img src="${escapeAttr(qrUrl)}" alt="QR code boutique" style="width:140px;height:140px;border:1px solid #e0dccf;border-radius:8px;background:#fff;padding:4px" loading="lazy">
        <div class="small muted" style="margin-top:4px">QR code à imprimer</div>
      </div>
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
    ${o.status === 'livre' ? `<button class="btn secondary" data-print-invoice="${escapeAttr(o.id)}">🧾 Facture PDF</button>` : ''}
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
