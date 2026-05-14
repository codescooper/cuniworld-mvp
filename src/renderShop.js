// Vue publique boutique : grille de lapins en vente, détail d'un lapin,
// formulaire commande invité, page de suivi de commande.
//
// Accessible sans connexion via ?shop=<farmId> ou ?shop=all, ?shop=track&order=<id>.

import { escapeHTML, escapeAttr, formatDate, daysBetween } from './utils.js';
import {
  listShopRabbits, loadShopRabbitPhoto, placeOrder, getOrderById, getStatusLabel,
} from './shopService.js';
import { formatCurrency } from './settingsService.js';

const SHOP_ROOT_ID = 'shopOverlay';

// ── Point d'entrée ───────────────────────────────────────────────────────────
export async function bootShopView() {
  const params = new URLSearchParams(window.location.search);
  const shopParam = params.get('shop');
  if (!shopParam) return false;

  _mountShell();
  if (shopParam === 'track') {
    const orderId = params.get('order');
    await _renderTracking(orderId);
  } else if (shopParam === 'all') {
    await _renderListing(null);
  } else {
    // Specific farm UUID
    await _renderListing(shopParam);
  }
  return true;
}

// ── Mise en place du shell ───────────────────────────────────────────────────
function _mountShell() {
  // On masque l'app principale.
  const appLayout = document.querySelector('.app-layout');
  if (appLayout) appLayout.style.display = 'none';
  const topbar = document.querySelector('.topbar');
  if (topbar) topbar.style.display = 'none';
  const footer = document.getElementById('appVersionFooter');
  if (footer) footer.style.display = 'none';
  const auth = document.getElementById('authOverlay');
  if (auth) auth.style.display = 'none';
  const beta = document.getElementById('betaBanner');
  if (beta) beta.style.display = 'none';

  let root = document.getElementById(SHOP_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = SHOP_ROOT_ID;
    root.className = 'shop-overlay';
    document.body.appendChild(root);
  }
  root.innerHTML = `
    <header class="shop-header">
      <div class="shop-header-inner">
        <a href="?shop=all" class="shop-logo">🐇 CuniWorld &mdash; Boutique</a>
        <nav class="shop-nav">
          <a href="?shop=all">Toutes les fermes</a>
          <a href="?" class="shop-nav-back">← Quitter</a>
        </nav>
      </div>
    </header>
    <main id="shopMain" class="shop-main">
      <div class="shop-loading">Chargement…</div>
    </main>
    <footer class="shop-footer">
      <p>Élevage de lapins · Paiement à la livraison · Contact direct éleveur</p>
    </footer>
  `;
}

// ── Listing principal ────────────────────────────────────────────────────────
async function _renderListing(farmId) {
  const main = document.getElementById('shopMain');
  if (!main) return;
  try {
    const rabbits = await listShopRabbits(farmId);
    if (rabbits.length === 0) {
      main.innerHTML = `
        <section class="shop-section">
          <h1 class="shop-title">Aucun lapin disponible pour le moment</h1>
          <p class="shop-muted">${farmId ? "Cette ferme n'a pas d'animaux en vente." : "Aucune ferme n'a d'animaux en vente actuellement."}</p>
        </section>`;
      return;
    }

    const farms = new Map();
    for (const r of rabbits) {
      if (!farms.has(r.farmId)) farms.set(r.farmId, { name: r.farmName, description: r.farmDescription, count: 0 });
      farms.get(r.farmId).count += 1;
    }

    const header = farmId
      ? _farmHeader(rabbits[0])
      : `<h1 class="shop-title">🏪 Tous les lapins en vente</h1>
         <p class="shop-muted">${rabbits.length} lapin(s) chez ${farms.size} ferme(s).</p>`;

    main.innerHTML = `
      <section class="shop-section">
        ${header}
        <div class="shop-grid" id="shopGrid">
          ${rabbits.map(_rabbitCard).join('')}
        </div>
      </section>
    `;

    // Hydrate les photos (signed URL pour chaque lapin)
    _hydrateShopPhotos(rabbits);

    // Clic sur une card → modal détail / commande
    document.querySelectorAll('[data-shop-rabbit]').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.shopRabbit;
        const rb = rabbits.find(r => r.id === id);
        if (rb) _showOrderModal(rb);
      });
    });
  } catch (err) {
    main.innerHTML = `
      <section class="shop-section">
        <h1 class="shop-title">Erreur</h1>
        <p class="shop-muted">${escapeHTML(err?.message || 'Impossible de charger la boutique.')}</p>
      </section>`;
  }
}

function _farmHeader(sampleRabbit) {
  return `
    <h1 class="shop-title">🏡 ${escapeHTML(sampleRabbit.farmName)}</h1>
    ${sampleRabbit.farmDescription ? `<p class="shop-desc">${escapeHTML(sampleRabbit.farmDescription)}</p>` : ''}
    ${(sampleRabbit.farmPhone || sampleRabbit.farmWhatsApp) ? `
      <div class="shop-contacts">
        ${sampleRabbit.farmPhone ? `<a href="tel:${escapeAttr(sampleRabbit.farmPhone)}">📞 ${escapeHTML(sampleRabbit.farmPhone)}</a>` : ''}
        ${sampleRabbit.farmWhatsApp ? `<a href="https://wa.me/${escapeAttr(sampleRabbit.farmWhatsApp)}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}
      </div>
    ` : ''}
  `;
}

function _rabbitCard(r) {
  const age = r.birthDate ? _ageText(r.birthDate) : '';
  const price = r.salePrice ?? r.suggestedPrice;
  const priceHTML = price
    ? `<div class="shop-card-price">${formatCurrency(price, { currencySymbol: r.currencySymbol })}</div>`
    : `<div class="shop-card-price shop-card-price-tba">Prix sur demande</div>`;
  const sexBadge = r.sex === 'F' ? '♀️ Femelle' : r.sex === 'M' ? '♂️ Mâle' : '? Inconnu';
  return `
    <article class="shop-card" data-shop-rabbit="${escapeAttr(r.id)}" tabindex="0">
      <div class="shop-card-img" data-shop-img="${escapeAttr(r.id)}" data-storage="${escapeAttr(r.photo?.storagePath || '')}">🐇</div>
      <div class="shop-card-body">
        <h3 class="shop-card-name">${escapeHTML(r.name)}</h3>
        <div class="shop-card-meta">
          ${r.breed ? `<span>${escapeHTML(r.breed)}</span>` : ''}
          <span>${sexBadge}</span>
          ${age ? `<span>${escapeHTML(age)}</span>` : ''}
          ${r.weightKg ? `<span>${r.weightKg.toFixed(2)} kg</span>` : ''}
        </div>
        <div class="shop-card-farm">📍 ${escapeHTML(r.farmName)}</div>
        ${priceHTML}
      </div>
    </article>
  `;
}

async function _hydrateShopPhotos(rabbits) {
  // Charge en parallèle, fail-soft : chaque photo se charge indépendamment.
  // On indexe les cellules par data-attribute (ids alphanumériques générés par
  // store.helpers.uid — pas besoin d'échappement CSS).
  const cells = new Map();
  document.querySelectorAll('[data-shop-img]').forEach(el => {
    cells.set(el.dataset.shopImg, el);
  });
  await Promise.all(rabbits.map(async (r) => {
    if (!r.photo?.storagePath) return;
    const url = await loadShopRabbitPhoto(r.photo.storagePath);
    if (!url) return;
    const el = cells.get(r.id);
    if (el) {
      el.innerHTML = `<img src="${escapeAttr(url)}" alt="${escapeAttr(r.name)}" loading="lazy">`;
    }
  }));
}

function _ageText(birthDateISO) {
  const days = daysBetween(birthDateISO, new Date().toISOString().slice(0, 10));
  if (days < 30) return `${days} j`;
  if (days < 365) return `${Math.floor(days / 30)} mois`;
  return `${Math.floor(days / 365)} an(s)`;
}

// ── Modal commande ───────────────────────────────────────────────────────────
function _showOrderModal(rabbit) {
  const price = rabbit.salePrice ?? rabbit.suggestedPrice ?? 0;
  const priceFmt = formatCurrency(price || 0, { currencySymbol: rabbit.currencySymbol });
  const wrap = document.createElement('div');
  wrap.className = 'shop-modal-bg';
  wrap.innerHTML = `
    <div class="shop-modal">
      <button class="shop-modal-close" type="button" aria-label="Fermer">✕</button>
      <div class="shop-modal-grid">
        <div class="shop-modal-img" id="shopModalImg">🐇</div>
        <div class="shop-modal-info">
          <h2>${escapeHTML(rabbit.name)} <span class="shop-code">${escapeHTML(rabbit.code || '')}</span></h2>
          <div class="shop-card-meta">
            ${rabbit.breed ? `<span>${escapeHTML(rabbit.breed)}</span>` : ''}
            <span>${rabbit.sex === 'F' ? '♀️ Femelle' : rabbit.sex === 'M' ? '♂️ Mâle' : '?'}</span>
            ${rabbit.birthDate ? `<span>Né le ${escapeHTML(formatDate(rabbit.birthDate))}</span>` : ''}
            ${rabbit.weightKg ? `<span>${rabbit.weightKg.toFixed(2)} kg</span>` : ''}
          </div>
          <p class="shop-modal-desc">${escapeHTML(rabbit.description || '')}</p>
          <div class="shop-modal-price">${priceFmt}</div>
          <div class="shop-modal-farm">Vendu par <strong>${escapeHTML(rabbit.farmName)}</strong></div>
        </div>
      </div>

      <form id="shopOrderForm" class="shop-order-form">
        <h3>Commander ce lapin</h3>
        <p class="shop-muted">Aucun compte requis. L'éleveur vous appellera pour confirmer.</p>
        <div class="shop-form-grid">
          <label>Nom complet *<input name="name" required maxlength="80"></label>
          <label>Téléphone *<input name="phone" required maxlength="30" placeholder="+221 77…"></label>
          <label>Email<input name="email" type="email" maxlength="120"></label>
          <label>Adresse de livraison<input name="address" maxlength="200"></label>
        </div>
        <label class="shop-form-full">Notes / message à l'éleveur
          <textarea name="notes" rows="2" maxlength="400"></textarea>
        </label>
        <div id="shopOrderError" class="shop-error" hidden></div>
        <div class="shop-form-actions">
          <button type="button" class="shop-btn-secondary" id="shopCancelBtn">Annuler</button>
          ${rabbit.farmWhatsApp ? `<a href="https://wa.me/${escapeAttr(rabbit.farmWhatsApp)}?text=${encodeURIComponent('Bonjour, je suis intéressé par ' + (rabbit.name || rabbit.code))}" target="_blank" rel="noopener" class="shop-btn-secondary">💬 WhatsApp</a>` : ''}
          <button type="submit" class="shop-btn-primary">Réserver ce lapin</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(wrap);

  // Charge la photo dans le modal
  (async () => {
    if (rabbit.photo?.storagePath) {
      const url = await loadShopRabbitPhoto(rabbit.photo.storagePath);
      if (url) {
        document.getElementById('shopModalImg').innerHTML =
          `<img src="${escapeAttr(url)}" alt="${escapeAttr(rabbit.name)}">`;
      }
    }
  })();

  const close = () => wrap.remove();
  wrap.querySelector('.shop-modal-close')?.addEventListener('click', close);
  wrap.querySelector('#shopCancelBtn')?.addEventListener('click', close);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });

  document.getElementById('shopOrderForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const errEl = document.getElementById('shopOrderError');
    errEl.hidden = true;
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = '…';
    try {
      const orderId = await placeOrder({
        farmId: rabbit.farmId,
        rabbitIds: [rabbit.id],
        customer: {
          name: fd.get('name'),
          phone: fd.get('phone'),
          email: fd.get('email'),
          address: fd.get('address'),
          notes: fd.get('notes'),
        },
      });
      close();
      // Redirige vers la page de suivi
      window.location.search = `?shop=track&order=${orderId}`;
    } catch (err) {
      errEl.textContent = err?.message || String(err);
      errEl.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Réserver ce lapin';
    }
  });
}

// ── Page de suivi commande ───────────────────────────────────────────────────
async function _renderTracking(orderId) {
  const main = document.getElementById('shopMain');
  if (!main) return;
  if (!orderId) {
    main.innerHTML = `<section class="shop-section"><h1 class="shop-title">Numéro de commande manquant</h1></section>`;
    return;
  }
  main.innerHTML = `<div class="shop-loading">Chargement de la commande…</div>`;
  try {
    const order = await getOrderById(orderId);
    if (!order) {
      main.innerHTML = `<section class="shop-section"><h1 class="shop-title">Commande introuvable</h1><p class="shop-muted">Vérifiez le lien fourni par l'éleveur.</p></section>`;
      return;
    }
    const status = getStatusLabel(order.status);
    const steps = ['reserve','paye','en_route','livre'];
    const stepIdx = steps.indexOf(order.status);
    const cur = { currencySymbol: order.currency_symbol || 'FCFA' };
    const items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]');

    main.innerHTML = `
      <section class="shop-section">
        <h1 class="shop-title">Commande #${escapeHTML(orderId.slice(0, 8))}</h1>
        <p class="shop-muted">Conservez ce lien — il vous permet de suivre l'état de votre commande à tout moment.</p>

        <div class="shop-track-steps">
          ${steps.map((s, i) => {
            const sl = getStatusLabel(s);
            const cls = i < stepIdx ? 'done' : (i === stepIdx ? 'active' : '');
            return `<div class="shop-track-step ${cls}">
              <span class="shop-track-icon">${sl.icon}</span>
              <span class="shop-track-label">${escapeHTML(sl.label)}</span>
            </div>`;
          }).join('<span class="shop-track-sep">→</span>')}
        </div>
        ${order.status === 'annule' ? `<p class="shop-muted" style="color:#c0392b">${status.icon} Commande annulée par l'éleveur.</p>` : ''}

        <div class="shop-track-card">
          <h3>Vendeur</h3>
          <p><strong>${escapeHTML(order.farm_name || '—')}</strong></p>
        </div>

        <div class="shop-track-card">
          <h3>Vos informations</h3>
          <p>${escapeHTML(order.customer_name || '')}<br>
             📞 ${escapeHTML(order.customer_phone || '—')}
             ${order.customer_email ? `<br>✉️ ${escapeHTML(order.customer_email)}` : ''}
             ${order.customer_address ? `<br>📍 ${escapeHTML(order.customer_address)}` : ''}
          </p>
          ${order.customer_notes ? `<p class="shop-muted">Note : ${escapeHTML(order.customer_notes)}</p>` : ''}
        </div>

        <div class="shop-track-card">
          <h3>Lapins commandés</h3>
          <ul>
            ${items.map(it => `<li>${escapeHTML(it.snapshot?.name || it.rabbitId)} ${it.snapshot?.code ? `(${escapeHTML(it.snapshot.code)})` : ''} — ${formatCurrency(it.unitPrice || 0, cur)}</li>`).join('')}
          </ul>
          <p><strong>Total : ${formatCurrency(order.total || 0, cur)}</strong></p>
        </div>
      </section>`;
  } catch (err) {
    main.innerHTML = `<section class="shop-section"><h1 class="shop-title">Erreur</h1><p class="shop-muted">${escapeHTML(err?.message || '')}</p></section>`;
  }
}
