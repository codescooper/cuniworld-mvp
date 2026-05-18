/**
 * renderGenealogy.js — Nouveau panneau "Lignées" multi-vues.
 *
 * Remplace l'ancienne vue unique "Généalogie 3D" par un système d'onglets
 * qui correspond aux 3 tâches qu'un éleveur fait vraiment :
 *
 *   1. Vue d'ensemble — l'arbre complet pan/zoom (delegué à genealogy3d.js).
 *   2. Pedigree       — les 4 générations d'ancêtres d'un lapin (standard
 *                       cuniculture). Imprimable PDF.
 *   3. Descendance    — l'arbre descendant d'un mâle ou d'une femelle avec
 *                       stats agrégées.
 *   4. Comparer       — 2 lapins côte à côte + ancêtre commun + coefficient
 *                       de consanguinité de Wright.
 *   5. Accouplement   — pour une femelle, suggère les meilleurs mâles
 *                       compatibles (filtre kinship, tri croissant).
 *
 * Design choisi : pas de pan/zoom dans les vues 2-5 — layouts statiques
 * en grille HTML, lisibles tels quels en print et sur mobile.
 */

import { escapeHTML, escapeAttr } from './utils.js';
import {
  buildPedigree, flattenPedigree,
  buildDescendance,
  findCommonAncestor, kinshipCoefficient, kinshipLevel,
  suggestMates,
} from './genealogyViews.js';

const TABS = [
  { id: 'overview',  label: '🌳 Vue d\'ensemble' },
  { id: 'pedigree',  label: '📜 Pedigree' },
  { id: 'descent',   label: '👶 Descendance' },
  { id: 'compare',   label: '⚖️ Comparer' },
  { id: 'mating',    label: '💞 Suggestion accouplement' },
];

let _activeTab = 'pedigree'; // entrée par défaut : la tâche la plus fréquente
let _selectedA = null;
let _selectedB = null;

export function renderGenealogyPanel(ctx) {
  const root = document.getElementById('geneViews');
  if (!root) return;
  const rabbits = (ctx.state?.rabbits || []).slice().sort((a, b) =>
    (a.code || '').localeCompare(b.code || '') || (a.name || '').localeCompare(b.name || '')
  );
  if (rabbits.length === 0) {
    root.innerHTML = `<div class="muted" style="padding:32px;text-align:center">
      Aucun lapin enregistré. Créez votre premier reproducteur pour utiliser les vues lignée.
    </div>`;
    return;
  }

  // Lapin par défaut : celui sélectionné dans le panneau "Mes Lapins" si dispo.
  if (!_selectedA && ctx.selectedGeneRabbitId) _selectedA = ctx.selectedGeneRabbitId;
  if (!_selectedA && ctx.selectedRabbitId)     _selectedA = ctx.selectedRabbitId;
  if (!_selectedA && rabbits.length > 0)       _selectedA = rabbits[0].id;

  const tabsHTML = TABS.map(t => `
    <button class="gv-tab ${t.id === _activeTab ? 'gv-tab--active' : ''}"
            type="button" data-gv-tab="${t.id}" role="tab"
            aria-selected="${t.id === _activeTab ? 'true' : 'false'}">
      ${escapeHTML(t.label)}
    </button>`).join('');

  let bodyHTML = '';
  if      (_activeTab === 'overview') bodyHTML = _overviewHTML();
  else if (_activeTab === 'pedigree') bodyHTML = _pedigreeView(ctx, rabbits);
  else if (_activeTab === 'descent')  bodyHTML = _descentView(ctx, rabbits);
  else if (_activeTab === 'compare')  bodyHTML = _compareView(ctx, rabbits);
  else if (_activeTab === 'mating')   bodyHTML = _matingView(ctx, rabbits);

  root.innerHTML = `
    <div class="gv-tabs" role="tablist">${tabsHTML}</div>
    <div class="gv-body">${bodyHTML}</div>`;

  _wireTabs(ctx);
  if      (_activeTab === 'pedigree') _wirePedigree(ctx);
  else if (_activeTab === 'descent')  _wireDescent(ctx);
  else if (_activeTab === 'compare')  _wireCompare(ctx);
  else if (_activeTab === 'mating')   _wireMating(ctx);
}

// ── Délégation : si on change d'onglet vers "overview", on doit ré-amorcer
// l'ancien moteur 3D. C'est le seul cas où on délègue à l'ancien renderer.
function _overviewHTML() {
  return `
    <div class="gene-controls" style="display:flex;gap:8px;margin-bottom:8px">
      <input id="geneQ" class="input" placeholder="Rechercher un lapin (code, nom, cage…)" data-testid="gene-search" style="flex:1" />
      <button id="geneResetView" class="btn secondary" data-testid="gene-reset-view">Réinitialiser la vue</button>
    </div>
    <div id="geneFocusBadge" class="gene-focus-badge" hidden></div>
    <div class="gene-viewport">
      <div id="geneGraph" class="gene-3d-stage" data-testid="gene-graph"></div>
      <div id="geneSideCard" class="gene-sidecard" hidden></div>
    </div>
    <div id="geneList" class="list" data-testid="gene-list" style="display:none"></div>`;
}

// ── Pedigree (4 générations) ────────────────────────────────────────────────

function _pedigreeView(ctx, rabbits) {
  const selector = _rabbitSelectHTML('gvPedRabbit', rabbits, _selectedA);
  const ped = buildPedigree(ctx.state, _selectedA, 4);
  if (!ped) return _selectorWrapper(selector) + `<div class="muted">Sélectionnez un lapin.</div>`;

  // Layout type "horse pedigree chart" : 5 colonnes (le lapin + 4 gens).
  // Chaque colonne k contient 2^k cases empilées verticalement, hauteur égale.
  const cols = [];
  for (let g = 0; g <= 4; g++) {
    const slotCount = Math.pow(2, g);
    const startIdx = slotCount - 1;
    const cells = [];
    for (let i = 0; i < slotCount; i++) {
      cells.push(_pedigreeCell(_findInPed(ped, startIdx + i, g), g));
    }
    cols.push(`<div class="gv-ped-col gv-ped-col--g${g}">${cells.join('')}</div>`);
  }

  return _selectorWrapper(selector, `
    <div class="row" style="gap:8px;justify-content:flex-end;margin-bottom:8px">
      <button class="btn secondary" id="gvPrintPedigree">🖨️ Imprimer le pedigree</button>
    </div>
  `) + `
    <div class="gv-ped-grid" data-testid="gv-pedigree">
      ${cols.join('')}
    </div>
    <p class="muted small" style="margin-top:10px">
      Mère en haut, père en bas. Cases grisées : ancêtre non renseigné — saisissez les parents
      depuis la fiche du lapin pour compléter le pedigree.
    </p>`;
}

/**
 * Retrouve la cellule pour un slot donné dans l'arbre récursif.
 * On ne peut pas juste utiliser flattenPedigree car on veut savoir si le
 * slot est "manquant" (rabbit null) sans afficher rien.
 */
function _findInPed(root, index, depth) {
  // Reconstruit le chemin binaire depuis l'index pour descendre l'arbre.
  // index 0 = self ; à chaque niveau, bit = 0 → mère, 1 → père
  if (index === 0) return root;
  const path = [];
  let i = index;
  while (i > 0) {
    path.unshift(((i - 1) % 2)); // 0 = mère, 1 = père
    i = Math.floor((i - 1) / 2);
  }
  let node = root;
  for (const dir of path) {
    if (!node) return null;
    node = dir === 0 ? node.mother : node.father;
  }
  return node;
}

function _pedigreeCell(node, gen) {
  if (!node || !node.rabbit) {
    return `<div class="gv-ped-cell gv-ped-cell--empty" aria-label="Ancêtre non renseigné">
      <span class="muted small">—</span>
    </div>`;
  }
  const r = node.rabbit;
  const sexCls = r.sex === 'F' ? 'gv-ped-cell--f' : r.sex === 'M' ? 'gv-ped-cell--m' : '';
  return `<div class="gv-ped-cell gv-ped-cell--g${gen} ${sexCls}"
       data-open-rabbit="${escapeAttr(r.id)}" role="button" tabindex="0"
       aria-label="${escapeAttr(r.name || r.code || '?')}">
    <div class="gv-ped-name"><strong>${escapeHTML(r.name || r.code)}</strong></div>
    <div class="gv-ped-meta">${escapeHTML(r.code || '')}${r.breed ? ' · ' + escapeHTML(r.breed) : ''}</div>
  </div>`;
}

function _wirePedigree(ctx) {
  document.getElementById('gvPedRabbit')?.addEventListener('change', e => {
    _selectedA = e.target.value;
    renderGenealogyPanel(ctx);
  });
  document.getElementById('gvPrintPedigree')?.addEventListener('click', () => {
    // Pré-ouvre la fenêtre AVANT le lazy import (cf. bug fix carnet sanitaire).
    const w = window.open('about:blank', '_blank', 'width=1024,height=720');
    if (!w) return;
    try { w.document.write('<!doctype html><meta charset="utf-8"><title>Préparation…</title><p style="font-family:sans-serif;padding:24px">Préparation du pedigree…</p>'); w.document.close(); } catch (_) {}
    import('./printable.js').then(mod => {
      const rabbit = ctx.state.rabbits.find(r => r.id === _selectedA);
      mod.printPedigree?.(ctx.state, rabbit, w);
    });
  });
}

// ── Descendance ────────────────────────────────────────────────────────────

function _descentView(ctx, rabbits) {
  const selector = _rabbitSelectHTML('gvDescRabbit', rabbits, _selectedA);
  const desc = buildDescendance(ctx.state, _selectedA, 4);
  if (!desc) return _selectorWrapper(selector) + `<div class="muted">Sélectionnez un lapin.</div>`;

  if (desc.totals.total === 0) {
    return _selectorWrapper(selector) + `
      <div class="muted" style="padding:18px;text-align:center">
        Aucune descendance enregistrée pour <strong>${escapeHTML(desc.rabbit.name)}</strong>.
        Les portées issues de saillies déclarées avec ce reproducteur apparaîtront ici.
      </div>`;
  }

  const t = desc.totals;
  return _selectorWrapper(selector) + `
    <div class="gv-desc-stats">
      <div class="gv-stat"><div class="gv-stat-n">${t.direct}</div><div class="gv-stat-t">Enfants directs</div></div>
      <div class="gv-stat"><div class="gv-stat-n">${t.total}</div><div class="gv-stat-t">Descendance totale</div></div>
      <div class="gv-stat"><div class="gv-stat-n">${t.alive}</div><div class="gv-stat-t">Vivants actifs</div></div>
      <div class="gv-stat"><div class="gv-stat-n">${t.sold}</div><div class="gv-stat-t">Vendus</div></div>
      <div class="gv-stat"><div class="gv-stat-n">${t.dead}</div><div class="gv-stat-t">Morts</div></div>
      <div class="gv-stat"><div class="gv-stat-n">${t.females}/${t.males}</div><div class="gv-stat-t">♀ / ♂</div></div>
    </div>
    <div class="gv-desc-tree">${_renderDescTree(desc)}</div>`;
}

function _renderDescTree(node) {
  if (!node || !node.rabbit) return '';
  const r = node.rabbit;
  const statusCls = r.status !== 'actif' ? ` gv-desc-node--${r.status}` : '';
  const childCount = node.children?.length || 0;
  return `
    <div class="gv-desc-node${statusCls}" data-open-rabbit="${escapeAttr(r.id)}">
      <span class="gv-desc-name"><strong>${escapeHTML(r.name || r.code)}</strong></span>
      <span class="gv-desc-meta">${escapeHTML(r.code || '')} ${r.sex === 'F' ? '♀' : r.sex === 'M' ? '♂' : ''}${r.birthDate ? ' · né ' + escapeHTML(r.birthDate) : ''}</span>
      ${childCount > 0 ? `<span class="badge gv-desc-children">${childCount}</span>` : ''}
    </div>
    ${childCount > 0 ? `<div class="gv-desc-children-wrap">${node.children.map(_renderDescTree).join('')}</div>` : ''}`;
}

function _wireDescent(ctx) {
  document.getElementById('gvDescRabbit')?.addEventListener('change', e => {
    _selectedA = e.target.value;
    renderGenealogyPanel(ctx);
  });
}

// ── Comparer 2 lapins ──────────────────────────────────────────────────────

function _compareView(ctx, rabbits) {
  if (!_selectedB && rabbits.length > 1) _selectedB = rabbits[1].id;
  if (!_selectedB) _selectedB = rabbits[0].id;
  const selA = _rabbitSelectHTML('gvCmpA', rabbits, _selectedA);
  const selB = _rabbitSelectHTML('gvCmpB', rabbits, _selectedB);
  if (_selectedA === _selectedB) {
    return `
      <div class="row" style="gap:8px;margin-bottom:14px">
        <div style="flex:1"><div class="label small">Lapin A</div>${selA}</div>
        <div style="flex:1"><div class="label small">Lapin B</div>${selB}</div>
      </div>
      <div class="muted" style="padding:12px;text-align:center">Sélectionnez deux lapins distincts pour comparer.</div>`;
  }

  const k = kinshipCoefficient(ctx.state, _selectedA, _selectedB);
  const lvl = kinshipLevel(k.percentage);
  const common = findCommonAncestor(ctx.state, _selectedA, _selectedB);

  const contribRows = k.contributions.slice(0, 8).map(c => `
    <tr>
      <td style="padding:3px 8px">${escapeHTML(c.ancestor.name || c.ancestor.code)}</td>
      <td style="padding:3px 8px" class="small muted">${escapeHTML(c.ancestor.code || '')}</td>
      <td style="text-align:right;padding:3px 8px">${c.distA}</td>
      <td style="text-align:right;padding:3px 8px">${c.distB}</td>
      <td style="text-align:right;padding:3px 8px">${(c.weight * 100).toFixed(2)} %</td>
    </tr>`).join('');

  return `
    <div class="row" style="gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px"><div class="label small">Lapin A</div>${selA}</div>
      <div style="flex:1;min-width:200px"><div class="label small">Lapin B</div>${selB}</div>
    </div>

    <div class="gv-kinship-card" style="border-left:5px solid ${lvl.color}">
      <div class="gv-kinship-header">
        <div class="gv-kinship-pct" style="color:${lvl.color}">${k.percentage.toFixed(2)} %</div>
        <div>
          <div class="gv-kinship-level" style="color:${lvl.color}"><strong>${escapeHTML(lvl.label)}</strong></div>
          <div class="small muted">Coefficient de consanguinité de Wright<br>
          de la descendance hypothétique A × B</div>
        </div>
      </div>
    </div>

    <div class="gv-compare-info" style="margin-top:14px">
      <h4 style="margin:8px 0">Ancêtre commun le plus proche</h4>
      ${common ? `
        <div class="gv-common-card">
          <strong>${escapeHTML(common.ancestor.name || common.ancestor.code)}</strong>
          <span class="muted small">${escapeHTML(common.ancestor.code || '')}</span>
          <span class="badge">distance A : ${common.distA} · distance B : ${common.distB}</span>
        </div>
      ` : `<div class="muted small">Aucun ancêtre commun trouvé dans les 10 générations. Les deux lignées sont indépendantes.</div>`}

      ${k.contributions.length > 0 ? `
        <h4 style="margin:16px 0 6px">Ancêtres communs (contributions au coefficient)</h4>
        <table style="width:100%;font-size:.85rem;border-collapse:collapse">
          <thead><tr style="border-bottom:1px solid var(--color-border)">
            <th style="text-align:left;padding:3px 8px">Ancêtre</th>
            <th style="text-align:left;padding:3px 8px">Code</th>
            <th style="text-align:right;padding:3px 8px">Dist. A</th>
            <th style="text-align:right;padding:3px 8px">Dist. B</th>
            <th style="text-align:right;padding:3px 8px">Contribution</th>
          </tr></thead>
          <tbody>${contribRows}</tbody>
        </table>
        ${k.contributions.length > 8 ? `<div class="muted small" style="margin-top:6px">+${k.contributions.length - 8} ancêtre(s) commun(s) non affichés.</div>` : ''}
      ` : ''}
    </div>

    <details class="gv-help" style="margin-top:18px">
      <summary class="small muted">Comment lire le coefficient ?</summary>
      <p class="small">Le coefficient de consanguinité F mesure la probabilité que les deux allèles
      d'un même gène chez l'enfant proviennent du même ancêtre. Plus F est élevé, plus le risque
      d'expression de tares récessives augmente.</p>
      <ul class="small">
        <li><strong style="color:#16a34a">OK (&lt; 6,25 %)</strong> : équivalent ≤ cousins germains, accouplement courant et sûr.</li>
        <li><strong style="color:#d97706">Prudence (6,25-12,5 %)</strong> : oncle/nièce, demi-frère/sœur. Possible mais ne pas répéter sur plusieurs générations.</li>
        <li><strong style="color:#b91c1c">Déconseillé (&gt; 12,5 %)</strong> : parent/enfant, frère/sœur. Risque élevé de dégénérescence.</li>
      </ul>
    </details>`;
}

function _wireCompare(ctx) {
  document.getElementById('gvCmpA')?.addEventListener('change', e => {
    _selectedA = e.target.value;
    renderGenealogyPanel(ctx);
  });
  document.getElementById('gvCmpB')?.addEventListener('change', e => {
    _selectedB = e.target.value;
    renderGenealogyPanel(ctx);
  });
}

// ── Suggestion d'accouplement ──────────────────────────────────────────────

function _matingView(ctx, rabbits) {
  const females = rabbits.filter(r => r.sex === 'F' && r.status === 'actif');
  if (females.length === 0) {
    return `<div class="muted" style="padding:18px;text-align:center">
      Aucune femelle active. Enregistrez vos reproductrices pour bénéficier des suggestions.
    </div>`;
  }
  if (!females.find(r => r.id === _selectedA)) _selectedA = females[0].id;
  const doe = ctx.state.rabbits.find(r => r.id === _selectedA);
  const doeSelector = _rabbitSelectHTML('gvMatingDoe', females, _selectedA, 'Femelle à accoupler');
  const suggestions = suggestMates(ctx.state, _selectedA, { maxKinship: 12.5, limit: 8 });

  const rows = suggestions.length === 0
    ? `<tr><td colspan="4" class="muted small" style="padding:14px;text-align:center">
        Aucun mâle compatible (F &lt; 12,5 %) trouvé. Tous les mâles sont apparentés trop proche
        ou aucun mâle actif n'est enregistré.
      </td></tr>`
    : suggestions.map(s => {
        const lvl = kinshipLevel(s.kinship.percentage);
        return `<tr>
          <td style="padding:6px 8px"><strong>${escapeHTML(s.buck.name || s.buck.code)}</strong>
            <span class="muted small">${escapeHTML(s.buck.code || '')}</span></td>
          <td style="padding:6px 8px" class="small">${escapeHTML(s.buck.cage || '—')}${s.buck.breed ? ' · ' + escapeHTML(s.buck.breed) : ''}</td>
          <td style="text-align:right;padding:6px 8px"><span style="color:${lvl.color};font-weight:700">${s.kinship.percentage.toFixed(2)} %</span></td>
          <td style="padding:6px 8px">
            <button class="btn ghost" data-open-rabbit="${escapeAttr(s.buck.id)}" style="font-size:.85rem;padding:3px 10px">Fiche</button>
          </td>
        </tr>`;
      }).join('');

  return `
    <div class="row" style="gap:8px;margin-bottom:14px;align-items:flex-end">
      <div style="flex:1">
        <div class="label small">Femelle à accoupler</div>
        ${doeSelector}
      </div>
    </div>

    <p class="small muted" style="margin-bottom:8px">
      Classement croissant par coefficient de consanguinité (F) de la descendance hypothétique.
      Les mâles avec F ≥ 12,5 % et le père direct de la femelle sont exclus.
    </p>

    <table style="width:100%;font-size:.9rem;border-collapse:collapse">
      <thead><tr style="border-bottom:1px solid var(--color-border)">
        <th style="text-align:left;padding:6px 8px">Mâle</th>
        <th style="text-align:left;padding:6px 8px">Cage / Race</th>
        <th style="text-align:right;padding:6px 8px">F (descendance)</th>
        <th style="padding:6px 8px"></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    ${doe ? `<p class="muted small" style="margin-top:10px">
      Femelle : <strong>${escapeHTML(doe.name)}</strong> (${escapeHTML(doe.code || '')})
      ${doe.cage ? '· cage ' + escapeHTML(doe.cage) : ''}
    </p>` : ''}`;
}

function _wireMating(ctx) {
  document.getElementById('gvMatingDoe')?.addEventListener('change', e => {
    _selectedA = e.target.value;
    renderGenealogyPanel(ctx);
  });
}

// ── Composants partagés ────────────────────────────────────────────────────

function _rabbitSelectHTML(id, rabbits, selectedId, label) {
  const options = rabbits.map(r => `
    <option value="${escapeAttr(r.id)}" ${r.id === selectedId ? 'selected' : ''}>
      ${escapeHTML(r.code || '?')} — ${escapeHTML(r.name || '')} (${r.sex === 'F' ? '♀' : r.sex === 'M' ? '♂' : '?'})
    </option>`).join('');
  return `<select id="${id}" class="input" data-testid="${id}">
    ${label ? `<option disabled value="">${escapeHTML(label)}</option>` : ''}
    ${options}
  </select>`;
}

function _selectorWrapper(selector, extra = '') {
  return `<div class="gv-selector" style="margin-bottom:12px">
    <div class="label small">Lapin</div>
    ${selector}
    ${extra}
  </div>`;
}

function _wireTabs(ctx) {
  document.querySelectorAll('[data-gv-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      _activeTab = btn.dataset.gvTab;
      renderGenealogyPanel(ctx);
    });
  });
}

// API : permet à un autre code (ex. clic depuis la liste lapins) de pousser
// un lapin focal dans les vues lignée et de basculer dessus.
export function focusGeneRabbitInViews(ctx, rabbitId, tab) {
  if (rabbitId) _selectedA = rabbitId;
  if (tab && TABS.find(t => t.id === tab)) _activeTab = tab;
  renderGenealogyPanel(ctx);
}

export function getActiveTab() { return _activeTab; }
