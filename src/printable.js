/**
 * printable.js — génère des vues imprimables (carnet sanitaire, facture)
 * dans une fenêtre dédiée, prêtes pour `window.print()` ou "Enregistrer en PDF"
 * du navigateur.
 *
 * Approche volontairement zéro-dépendance : pas de jsPDF (≈ 200 kB gzip).
 * Le navigateur sait déjà imprimer en PDF natif (Chrome, Safari, Firefox,
 * Edge, et les apps PWA mobiles). Le markup ci-dessous est optimisé pour
 * l'impression A4 portrait.
 *
 * Voir tests/printable.test.js pour la couverture.
 */

import { escapeHTML } from './utils.js';
import { formatCurrency, getSettings } from './settingsService.js';
import { LEGAL_CONFIG } from './legal.js';

const BASE_CSS = `
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #111; margin: 0; padding: 24px; line-height: 1.4; }
  h1 { font-size: 1.4rem; margin: 0 0 4px; }
  h2 { font-size: 1.1rem; margin: 14px 0 6px; padding-bottom: 4px; border-bottom: 1px solid #ddd; }
  .meta { color: #666; font-size: 12px; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 6px; }
  th, td { padding: 5px 8px; border-bottom: 1px solid #eee; text-align: left; vertical-align: top; }
  th { background: #f5f5f5; font-weight: 700; font-size: 12px; text-transform: uppercase; }
  .kv { display: grid; grid-template-columns: max-content 1fr; gap: 2px 14px; font-size: 13px; }
  .kv > div:nth-child(odd) { color: #666; }
  .total-row td { font-weight: 700; font-size: 14px; border-top: 2px solid #333; }
  .footer { margin-top: 28px; font-size: 11px; color: #888; border-top: 1px solid #ddd; padding-top: 10px; }
  .btn-row { margin: 14px 0; }
  .btn-row button { padding: 8px 14px; font-size: 14px; border: 1px solid #333; background: #fff; cursor: pointer; border-radius: 4px; margin-right: 6px; }
  @media print {
    body { padding: 12px; }
    .btn-row { display: none; }
  }
`;

/**
 * Ouvre une nouvelle fenêtre/onglet avec le HTML donné et déclenche
 * l'impression. Retourne true si la fenêtre a pu être créée, false si bloquée
 * (popup-blocker) — le caller peut alors fallback sur un toast d'erreur.
 */
function openPrintWindow(title, bodyHTML) {
  const w = window.open('', '_blank', 'noopener,width=900,height=1000');
  if (!w) return false;
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHTML(title)}</title>
<style>${BASE_CSS}</style>
</head>
<body>
<div class="btn-row">
  <button type="button" onclick="window.print()">🖨️ Imprimer / Enregistrer en PDF</button>
  <button type="button" onclick="window.close()">Fermer</button>
</div>
${bodyHTML}
<div class="footer">Document généré par CuniWorld le ${escapeHTML(new Date().toLocaleString('fr-FR'))}</div>
</body>
</html>`;
  w.document.write(html);
  w.document.close();
  return true;
}

// ── 1) Carnet sanitaire par lapin ──────────────────────────────────────────

const EVENT_LABELS = {
  vaccin:     'Vaccin',
  traitement: 'Traitement',
  'pesée':    'Pesée',
  saillie:    'Saillie',
  mise_bas:   'Mise-bas',
  sevrage:    'Sevrage',
  décès:      'Décès',
  deces:      'Décès',
  vente:      'Vente',
  autre:      'Autre',
};

/**
 * Construit le HTML du carnet sanitaire d'un lapin (identité + tous les
 * événements vétérinaires + pesées). Exporté pour les tests.
 */
export function buildSanitaryRecordHTML(state, rabbit) {
  if (!rabbit) return `<p>Lapin introuvable.</p>`;
  const events = (state.events || [])
    .filter(e => e.rabbitId === rabbit.id)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const vetEvents = events.filter(e => e.type === 'vaccin' || e.type === 'traitement');
  const weighings = events.filter(e => e.type === 'pesée');

  const vetRows = vetEvents.length === 0
    ? `<tr><td colspan="5" style="text-align:center;color:#888">Aucun acte vétérinaire enregistré.</td></tr>`
    : vetEvents.map(e => `
      <tr>
        <td>${escapeHTML(e.date || '')}</td>
        <td>${escapeHTML(EVENT_LABELS[e.type] || e.type)}</td>
        <td>${escapeHTML(e.data?.product || '—')}</td>
        <td>${escapeHTML(e.data?.dose || '—')}</td>
        <td>${escapeHTML(e.data?.nextDate || '—')}</td>
      </tr>`).join('');

  const weightRows = weighings.length === 0
    ? `<tr><td colspan="2" style="text-align:center;color:#888">Aucune pesée enregistrée.</td></tr>`
    : weighings.map(e => `
      <tr>
        <td>${escapeHTML(e.date || '')}</td>
        <td>${Number(e.data?.weight || 0).toFixed(2)} kg</td>
      </tr>`).join('');

  return `
    <h1>Carnet sanitaire — ${escapeHTML(rabbit.name)} (${escapeHTML(rabbit.code)})</h1>
    <p class="meta">${escapeHTML(LEGAL_CONFIG.editorName)} · ${escapeHTML(LEGAL_CONFIG.editorEmail)}</p>

    <h2>Identité de l'animal</h2>
    <div class="kv">
      <div>Code :</div><div>${escapeHTML(rabbit.code || '—')}</div>
      <div>Nom :</div><div>${escapeHTML(rabbit.name || '—')}</div>
      <div>Sexe :</div><div>${rabbit.sex === 'F' ? 'Femelle' : rabbit.sex === 'M' ? 'Mâle' : '—'}</div>
      <div>Race :</div><div>${escapeHTML(rabbit.breed || '—')}</div>
      <div>Date de naissance :</div><div>${escapeHTML(rabbit.birthDate || '—')}</div>
      <div>Cage :</div><div>${escapeHTML(rabbit.cage || '—')}</div>
      <div>Statut :</div><div>${escapeHTML(rabbit.status || '—')}</div>
      ${rabbit.notes ? `<div>Notes :</div><div>${escapeHTML(rabbit.notes)}</div>` : ''}
    </div>

    <h2>Actes vétérinaires</h2>
    <table>
      <thead>
        <tr><th>Date</th><th>Type</th><th>Produit</th><th>Dose</th><th>Prochain rappel</th></tr>
      </thead>
      <tbody>${vetRows}</tbody>
    </table>

    <h2>Évolution du poids (${weighings.length} pesée${weighings.length !== 1 ? 's' : ''})</h2>
    <table>
      <thead>
        <tr><th>Date</th><th>Poids</th></tr>
      </thead>
      <tbody>${weightRows}</tbody>
    </table>

    <p class="meta" style="margin-top:18px">Cachet du vétérinaire :</p>
    <div style="border:1px dashed #999;height:80px;border-radius:6px"></div>
  `;
}

export function printSanitaryRecord(state, rabbit) {
  const html = buildSanitaryRecordHTML(state, rabbit);
  const title = `Carnet sanitaire — ${rabbit?.name || rabbit?.code || 'lapin'}`;
  return openPrintWindow(title, html);
}

// ── 2) Facture d'une commande ──────────────────────────────────────────────

/**
 * Construit le HTML d'une facture pour une commande boutique. La commande
 * doit être au format `listFarmOrders` (avec `items`). Le numéro de facture
 * est dérivé du préfixe `FACT-` + 8 premiers chars de l'ID + date YYYY-MM.
 * Exporté pour les tests.
 */
export function buildInvoiceHTML(order, ctx) {
  if (!order) return `<p>Commande introuvable.</p>`;
  const settings = getSettings(ctx);
  const cur = { currencySymbol: order.data?.currency_symbol || settings.currencySymbol || 'FCFA' };
  const items = Array.isArray(order.items) ? order.items : [];
  const total = Number(order.data?.totalAmount)
    || items.reduce((s, it) => s + (Number(it.unit_price) || 0), 0);

  const invoiceNumber = _invoiceNumber(order);
  const orderDate = (order.created_at || '').slice(0, 10);

  const lines = items.length === 0
    ? `<tr><td colspan="3" style="text-align:center;color:#888">Aucun lapin associé à cette commande.</td></tr>`
    : items.map(it => {
        const name = it.rabbit_snapshot?.name || it.snapshot?.name || it.rabbit_id;
        const code = it.rabbit_snapshot?.code || it.snapshot?.code || '';
        const unit = Number(it.unit_price) || 0;
        return `
          <tr>
            <td>${escapeHTML(name)}${code ? ` <span style="color:#888">(${escapeHTML(code)})</span>` : ''}</td>
            <td style="text-align:center">1</td>
            <td style="text-align:right">${formatCurrency(unit, cur)}</td>
          </tr>`;
      }).join('');

  return `
    <h1>FACTURE n° ${escapeHTML(invoiceNumber)}</h1>
    <p class="meta">Émise le ${escapeHTML(new Date().toISOString().slice(0, 10))}${orderDate ? ` · commande du ${escapeHTML(orderDate)}` : ''}</p>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:14px 0">
      <div>
        <h2 style="margin-top:0">Vendeur</h2>
        <div class="kv">
          <div>Raison sociale :</div><div>${escapeHTML(LEGAL_CONFIG.editorName)}</div>
          <div>Adresse :</div><div>${escapeHTML(LEGAL_CONFIG.editorAddress)}</div>
          <div>Email :</div><div>${escapeHTML(LEGAL_CONFIG.editorEmail)}</div>
          ${LEGAL_CONFIG.editorPhone ? `<div>Téléphone :</div><div>${escapeHTML(LEGAL_CONFIG.editorPhone)}</div>` : ''}
          ${LEGAL_CONFIG.editorRegistration ? `<div>Immatriculation :</div><div>${escapeHTML(LEGAL_CONFIG.editorRegistration)}</div>` : ''}
        </div>
      </div>
      <div>
        <h2 style="margin-top:0">Client</h2>
        <div class="kv">
          <div>Nom :</div><div>${escapeHTML(order.data?.customer_name || '—')}</div>
          <div>Téléphone :</div><div>${escapeHTML(order.data?.customer_phone || '—')}</div>
          ${order.data?.customer_email ? `<div>Email :</div><div>${escapeHTML(order.data.customer_email)}</div>` : ''}
          ${order.data?.customer_address ? `<div>Adresse :</div><div>${escapeHTML(order.data.customer_address)}</div>` : ''}
        </div>
      </div>
    </div>

    <h2>Détail</h2>
    <table>
      <thead>
        <tr><th>Désignation</th><th style="text-align:center">Qté</th><th style="text-align:right">Prix unitaire</th></tr>
      </thead>
      <tbody>
        ${lines}
        <tr class="total-row">
          <td colspan="2" style="text-align:right">TOTAL</td>
          <td style="text-align:right">${formatCurrency(total, cur)}</td>
        </tr>
      </tbody>
    </table>

    <p class="meta" style="margin-top:18px">
      <strong>TVA non applicable</strong>, art. 293 B du CGI (auto-entrepreneur / micro-entreprise) — à adapter selon le régime fiscal du vendeur.<br>
      Paiement à la livraison sauf convention contraire. Tout retard de paiement entraîne une pénalité au taux légal en vigueur.
    </p>
  `;
}

export function printInvoice(order, ctx) {
  const html = buildInvoiceHTML(order, ctx);
  const title = `Facture ${_invoiceNumber(order)}`;
  return openPrintWindow(title, html);
}

function _invoiceNumber(order) {
  const idPart = (order?.id || 'XXXXXXXX').slice(0, 8).toUpperCase();
  const ym = (order?.created_at || new Date().toISOString()).slice(0, 7).replace('-', '');
  return `FACT-${ym}-${idPart}`;
}
