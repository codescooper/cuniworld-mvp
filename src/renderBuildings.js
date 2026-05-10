import { escapeHTML } from './utils.js';
import {
  LODGE_EVENT_TYPES,
  createBuilding, updateBuilding, deleteBuilding,
  getRabbitsInLodge, getLodgeHistory,
  reportDefect, resolveDefect, deleteDefect,
  getDefectsForTarget, getOpenDefects,
  addLodgeEvent, getLodgeEvents, getLastInspectionDate, getOverdueInspections,
} from './buildingService.js';
import { Store } from './store.js';
import { openModal, closeModal } from './modal.js';
import { showToast, showConfirm } from './notifications.js';

// ── Main panel render ─────────────────────────────────────────────────────────

export function renderBuildings(ctx) {
  const host = document.getElementById('buildingsDash');
  if (!host) return;
  const { state } = ctx;
  const buildings = state.buildings || [];

  if (buildings.length === 0) {
    host.innerHTML = `
      <div class="bld-empty">
        <div class="bld-empty-icon">🏗️</div>
        <div class="bld-empty-title">Aucun bâtiment configuré</div>
        <div class="bld-empty-sub">Cliquez sur <strong>+ Nouveau bâtiment</strong> pour créer vos bâtiments et loges.<br>
        Les lapins existants avec des codes cage (A1, B2…) seront associés automatiquement.</div>
        <button class="btn" id="bldEmptyWizard" style="margin-top:16px">⚡ Configuration rapide</button>
      </div>`;
    document.getElementById('bldEmptyWizard')?.addEventListener('click', () => openQuickSetupModal(ctx));
    return;
  }

  const openDefs = getOpenDefects(state);
  const overdue  = getOverdueInspections(state);

  let html = '';

  if (openDefs.length > 0) {
    html += `<div class="bld-alert bld-alert--danger">
      ⚠️ <strong>${openDefs.length} défaut(s) ouvert(s)</strong> signalé(s) —
      <a href="#" id="bldViewDefects" style="color:inherit;text-decoration:underline">Voir tous</a>
    </div>`;
  }
  if (overdue.length > 0) {
    html += `<div class="bld-alert bld-alert--warn">
      🔍 <strong>${overdue.length} loge(s)</strong> en retard d'inspection
    </div>`;
  }

  for (const b of buildings.slice().sort((a, b2) => a.letter.localeCompare(b2.letter))) {
    html += _renderBuilding(state, b);
  }

  host.innerHTML = html;

  // Wire building-level buttons
  host.querySelectorAll('[data-bld-edit]').forEach(btn =>
    btn.addEventListener('click', () => openEditBuildingModal(ctx, btn.dataset.bldEdit))
  );
  host.querySelectorAll('[data-bld-del]').forEach(btn =>
    btn.addEventListener('click', () => _deleteBuilding(ctx, btn.dataset.bldDel))
  );
  host.querySelectorAll('[data-bld-inspect]').forEach(btn =>
    btn.addEventListener('click', () => openBuildingEventModal(ctx, btn.dataset.bldInspect))
  );
  host.querySelectorAll('[data-bld-defect]').forEach(btn =>
    btn.addEventListener('click', () => openDefectModal(ctx, 'batiment', btn.dataset.bldDefect))
  );

  // Wire lodge cells
  host.querySelectorAll('[data-lodge-code]').forEach(cell =>
    cell.addEventListener('click', () => openLodgeDetail(ctx, cell.dataset.lodgeCode))
  );

  document.getElementById('bldViewDefects')?.addEventListener('click', e => {
    e.preventDefault();
    openAllDefectsModal(ctx);
  });
}

// ── Building card ─────────────────────────────────────────────────────────────

function _renderBuilding(state, b) {
  const lodges    = (state.lodges || []).filter(l => l.buildingId === b.id).sort((a, b2) => a.number - b2.number);
  const perRow    = b.lodgesPerRow || b.lodgeCount;
  const rows      = [];

  // Build rows bottom→top (display top row first)
  for (let rowStart = 1; rowStart <= b.lodgeCount; rowStart += perRow) {
    const rowLodges = lodges.filter(l => l.number >= rowStart && l.number < rowStart + perRow);
    rows.push(rowLodges);
  }

  const openDefs = getOpenDefects(state).filter(d => d.targetId === b.id || lodges.some(l => l.id === d.targetId));
  const overdue  = getOverdueInspections(state).filter(x => x.building.id === b.id);

  const rowsHTML = [...rows].reverse().map((rowLodges, ri) => `
    <div class="bld-row">
      ${rows.length > 1 ? `<div class="bld-row-label">${ri === 0 ? 'Haut' : ri < rows.length - 1 ? `R${rows.length - ri}` : 'Bas'}</div>` : ''}
      <div class="bld-lodges-row">
        ${rowLodges.map(l => _renderLodgeCell(state, l, overdue)).join('')}
      </div>
    </div>`).join('');

  return `
    <div class="bld-card">
      <div class="bld-card-header">
        <div class="bld-card-title">
          <span class="bld-letter">${escapeHTML(b.letter)}</span>
          <span>Bâtiment ${escapeHTML(b.letter)}</span>
          <span class="bld-meta muted">${b.lodgeCount} loge${b.lodgeCount > 1 ? 's' : ''}</span>
          ${openDefs.length > 0 ? `<span class="bld-defect-badge">${openDefs.length} défaut${openDefs.length > 1 ? 's' : ''}</span>` : ''}
          ${overdue.length > 0  ? `<span class="bld-inspect-badge">${overdue.length} inspect.</span>` : ''}
        </div>
        <div class="bld-card-actions">
          <button class="btn secondary" data-bld-inspect="${escapeHTML(b.id)}" title="Événement bâtiment">🔍 Inspection</button>
          <button class="btn secondary" data-bld-defect="${escapeHTML(b.id)}" title="Signaler défaut">⚠️ Défaut</button>
          <button class="btn ghost"     data-bld-edit="${escapeHTML(b.id)}"   title="Modifier">✏️</button>
          <button class="btn ghost"     data-bld-del="${escapeHTML(b.id)}"    title="Supprimer" style="color:var(--color-danger)">🗑</button>
        </div>
      </div>
      <div class="bld-grid">${rowsHTML}</div>
    </div>`;
}

function _renderLodgeCell(state, lodge, overdue) {
  const rabbits   = getRabbitsInLodge(state, lodge.code);
  const defs      = getOpenDefects(state).filter(d => d.targetId === lodge.id);
  const isOverdue = overdue.some(x => x.lodge.id === lodge.id);
  const hasRabbits = rabbits.length > 0;

  const cls = [
    'bld-lodge',
    hasRabbits  ? 'bld-lodge--occupied' : 'bld-lodge--empty',
    defs.length > 0 ? 'bld-lodge--defect'   : '',
    isOverdue       ? 'bld-lodge--overdue'  : '',
  ].filter(Boolean).join(' ');

  const content = hasRabbits
    ? rabbits.slice(0, 3).map(r => `<div class="bld-lodge-rabbit" title="${escapeHTML(r.name)} — ${escapeHTML(r.code)}">${escapeHTML(r.name.slice(0, 6))}</div>`).join('') +
      (rabbits.length > 3 ? `<div class="bld-lodge-more">+${rabbits.length - 3}</div>` : '')
    : '<div class="bld-lodge-empty-icon">—</div>';

  return `
    <div class="${cls}" data-lodge-code="${escapeHTML(lodge.code)}" title="Loge ${escapeHTML(lodge.code)}${hasRabbits ? ` · ${rabbits.length} lapin(s)` : ' · Vide'}${defs.length > 0 ? ` · ${defs.length} défaut(s)` : ''}">
      <div class="bld-lodge-code">${escapeHTML(lodge.code)}</div>
      <div class="bld-lodge-content">${content}</div>
      ${defs.length > 0  ? '<div class="bld-lodge-badge bld-lodge-badge--def">!</div>'   : ''}
      ${isOverdue        ? '<div class="bld-lodge-badge bld-lodge-badge--insp">⏰</div>' : ''}
    </div>`;
}

// ── Lodge detail modal ────────────────────────────────────────────────────────

export function openLodgeDetail(ctx, lodgeCode) {
  const { state } = ctx;
  const lodge    = (state.lodges || []).find(l => l.code === lodgeCode);
  if (!lodge) return;

  const building = (state.buildings || []).find(b => b.id === lodge.buildingId);
  const current  = getRabbitsInLodge(state, lodgeCode);
  const history  = getLodgeHistory(state, lodgeCode);
  const defects  = getDefectsForTarget(state, lodge.id);
  const events   = getLodgeEvents(state, lodge.id);
  const lastInsp = getLastInspectionDate(state, lodge.id);

  const currentHTML = current.length === 0
    ? '<div class="muted small">Loge vide</div>'
    : current.map(r => `
        <div class="lodge-detail-rabbit">
          <span class="lodge-rabbit-name">${escapeHTML(r.name)}</span>
          <span class="badge">${r.sex === 'F' ? 'F' : r.sex === 'M' ? 'M' : '?'}</span>
          <span class="muted small">${escapeHTML(r.code || '')}</span>
          ${r.breed ? `<span class="muted small">· ${escapeHTML(r.breed)}</span>` : ''}
          <button class="btn ghost" style="margin-left:auto;padding:2px 8px;font-size:.8rem" data-open-rabbit="${escapeHTML(r.id)}">Voir</button>
        </div>`).join('');

  const histHTML = history.length === 0
    ? '<div class="muted small">Aucun historique</div>'
    : history.map(r => `<div class="small muted">• ${escapeHTML(r.name)} (${escapeHTML(r.code || '')}) — <em>${r.status}</em></div>`).join('');

  const openDefs  = defects.filter(d => d.status === 'ouvert');
  const closedDefs = defects.filter(d => d.status === 'resolu');
  const defsHTML  = defects.length === 0
    ? '<div class="muted small">Aucun défaut signalé</div>'
    : [...openDefs, ...closedDefs].map(d => `
        <div class="lodge-defect-row${d.status === 'resolu' ? ' defect-resolved' : ''}">
          <span class="defect-sev-${d.severity}">${d.severity === 'majeur' ? '🔴' : '🟡'}</span>
          <span class="small" style="flex:1">${escapeHTML(d.description)}</span>
          ${d.status === 'ouvert'
            ? `<button class="btn secondary" style="padding:2px 8px;font-size:.75rem" data-resolve-defect="${escapeHTML(d.id)}">Résolu ✓</button>`
            : '<span class="small muted">Résolu</span>'}
        </div>`).join('');

  const eventsHTML = events.length === 0
    ? '<div class="muted small">Aucun événement</div>'
    : events.slice(0, 5).map(e => `<div class="small">📅 <strong>${e.date}</strong> — ${LODGE_EVENT_TYPES[e.type]?.icon || ''} ${LODGE_EVENT_TYPES[e.type]?.label || e.type}${e.notes ? ` · ${escapeHTML(e.notes)}` : ''}</div>`).join('');

  openModal(ctx.el, `Loge ${lodgeCode} — Bâtiment ${building?.letter || '?'}`, `
    <div class="lodge-detail-sections">
      <div class="lodge-detail-section">
        <div class="lodge-detail-section-title">🐇 Lapins actuels</div>
        ${currentHTML}
      </div>
      <div class="lodge-detail-section">
        <div class="lodge-detail-section-title">📜 Historique</div>
        ${histHTML}
      </div>
      <div class="lodge-detail-section">
        <div class="lodge-detail-section-title">⚠️ Défauts</div>
        ${defsHTML}
        <div class="lodge-detail-actions" style="margin-top:8px">
          <button class="btn secondary" id="ldReportDefect" style="font-size:.85rem">+ Signaler un défaut</button>
        </div>
      </div>
      <div class="lodge-detail-section">
        <div class="lodge-detail-section-title">🔍 Entretien
          ${lastInsp ? `<span class="muted small">(dernière inspection : ${lastInsp})</span>` : '<span class="muted small">(jamais inspectée)</span>'}
        </div>
        ${eventsHTML}
        <div class="lodge-detail-actions" style="margin-top:8px">
          <button class="btn secondary" id="ldAddEvent" style="font-size:.85rem">+ Ajouter événement</button>
        </div>
      </div>
      <div class="lodge-detail-section">
        <div class="lodge-detail-section-title">📝 Notes loge</div>
        <textarea id="ldNotes" class="input" rows="2" maxlength="200" style="resize:vertical">${escapeHTML(lodge.notes || '')}</textarea>
        <button class="btn secondary" id="ldSaveNotes" style="margin-top:6px;font-size:.85rem">Sauvegarder notes</button>
      </div>
    </div>
    <div class="row" style="margin-top:16px">
      <button class="btn secondary" id="ldClose">Fermer</button>
    </div>`);

  document.getElementById('ldClose')?.addEventListener('click', () => closeModal(ctx.el));

  document.getElementById('ldSaveNotes')?.addEventListener('click', () => {
    const notes = document.getElementById('ldNotes')?.value?.trim() || '';
    ctx.state = Store.save({ ...ctx.state, lodges: (ctx.state.lodges || []).map(l => l.id === lodge.id ? { ...l, notes } : l) });
    showToast('Notes sauvegardées.', 'success');
  });

  document.getElementById('ldReportDefect')?.addEventListener('click', () => {
    closeModal(ctx.el);
    openDefectModal(ctx, 'loge', lodge.id);
  });

  document.getElementById('ldAddEvent')?.addEventListener('click', () => {
    closeModal(ctx.el);
    openLodgeEventModal(ctx, lodge.id, lodgeCode);
  });

  document.querySelectorAll('[data-resolve-defect]').forEach(btn =>
    btn.addEventListener('click', () => {
      ctx.state = Store.save(resolveDefect(ctx.state, btn.dataset.resolveDefect));
      ctx.render();
      openLodgeDetail(ctx, lodgeCode);
    })
  );

  document.querySelectorAll('[data-open-rabbit]').forEach(btn => {
    btn.addEventListener('click', () => {
      closeModal(ctx.el);
      ctx.selectedRabbitId = btn.dataset.openRabbit;
      ctx.navigate('rabbits');
    });
  });
}

// ── Add building modal ────────────────────────────────────────────────────────

export function openAddBuildingModal(ctx) {
  openModal(ctx.el, 'Nouveau bâtiment', _buildingFormHTML(null));
  _wireBuildingForm(ctx, null);
}

function openEditBuildingModal(ctx, buildingId) {
  const b = (ctx.state.buildings || []).find(x => x.id === buildingId);
  if (!b) return;
  openModal(ctx.el, `Modifier Bâtiment ${b.letter}`, _buildingFormHTML(b));
  _wireBuildingForm(ctx, b);
}

function _buildingFormHTML(b) {
  return `
    <div class="row" style="gap:8px">
      <div class="field" style="flex:1">
        <div class="label">Lettre du bâtiment</div>
        <input id="bfLetter" class="input" type="text" maxlength="1" value="${escapeHTML(b?.letter || '')}"
          placeholder="A" style="text-align:center;text-transform:uppercase;font-size:1.3rem;font-weight:700"
          ${b ? 'readonly' : ''} />
      </div>
      <div class="field" style="flex:2">
        <div class="label">Nombre de loges</div>
        <input id="bfCount" class="input" type="number" min="1" max="50" value="${b?.lodgeCount || 5}" />
      </div>
    </div>
    <div class="field">
      <div class="label">Loges par rangée <span class="muted">(0 = rangée unique)</span></div>
      <input id="bfPerRow" class="input" type="number" min="0" max="20" value="${b?.lodgesPerRow || 0}"
        placeholder="ex: 5 pour 2 rangées de 5" />
      <div class="muted small" style="margin-top:4px">
        Exemple : 10 loges + 5 par rangée → 2 rangées (haut/bas) de 5 loges
      </div>
    </div>
    <div class="field">
      <div class="label">Périodicité d'inspection (jours)</div>
      <input id="bfInspect" class="input" type="number" min="1" value="${b?.inspectionDays || 30}" />
    </div>
    <div class="field">
      <div class="label">Notes <span class="muted">(optionnel)</span></div>
      <input id="bfNotes" class="input" type="text" value="${escapeHTML(b?.notes || '')}" maxlength="120" />
    </div>
    <div id="bfError" style="color:var(--color-danger);font-size:.85rem;min-height:1em;margin-top:4px"></div>
    <div class="row" style="margin-top:16px;gap:8px">
      <button class="btn secondary" id="bfCancel" style="flex:1">Annuler</button>
      <button class="btn" id="bfSave" style="flex:2">${b ? 'Enregistrer' : 'Créer le bâtiment'}</button>
    </div>`;
}

function _wireBuildingForm(ctx, existing) {
  setTimeout(() => document.getElementById('bfLetter')?.focus(), 50);
  document.getElementById('bfCancel')?.addEventListener('click', () => closeModal(ctx.el));
  document.getElementById('bfSave')?.addEventListener('click', () => {
    const letter  = document.getElementById('bfLetter')?.value?.trim().toUpperCase();
    const count   = parseInt(document.getElementById('bfCount')?.value);
    const perRow  = parseInt(document.getElementById('bfPerRow')?.value) || 0;
    const inspect = parseInt(document.getElementById('bfInspect')?.value) || 30;
    const notes   = document.getElementById('bfNotes')?.value?.trim() || '';
    const errEl   = document.getElementById('bfError');

    try {
      if (existing) {
        ctx.state = Store.save(updateBuilding(ctx.state, existing.id, { lodgeCount: count, lodgesPerRow: perRow, inspectionDays: inspect, notes }));
        showToast(`Bâtiment ${existing.letter} mis à jour.`, 'success');
      } else {
        ctx.state = Store.save(createBuilding(ctx.state, { letter, lodgeCount: count, lodgesPerRow: perRow, inspectionDays: inspect, notes }));
        showToast(`Bâtiment ${letter} créé avec ${count} loges.`, 'success');
      }
      closeModal(ctx.el);
      ctx.render();
    } catch (err) {
      if (errEl) errEl.textContent = err.message || 'Erreur.';
    }
  });
}

// ── Quick setup wizard ────────────────────────────────────────────────────────

export function openQuickSetupModal(ctx) {
  openModal(ctx.el, '⚡ Configuration rapide des bâtiments', `
    <div class="muted small" style="margin-bottom:12px">
      Définissez votre configuration en une ligne par bâtiment :<br>
      <code>lettre:nb_loges:loges_par_rangée</code> — ex: <code>A:10:5</code> ou <code>B:5:0</code>
    </div>
    <div class="field">
      <div class="label">Configuration (une ligne par bâtiment)</div>
      <textarea id="qsText" class="input" rows="6" placeholder="A:5:0&#10;B:5:0&#10;C:10:5&#10;D:10:5&#10;E:5:0&#10;F:5:0" style="font-family:monospace"></textarea>
    </div>
    <div id="qsError" style="color:var(--color-danger);font-size:.85rem;min-height:1em;margin-top:4px"></div>
    <div class="row" style="margin-top:16px;gap:8px">
      <button class="btn secondary" id="qsCancel" style="flex:1">Annuler</button>
      <button class="btn" id="qsSave" style="flex:2">Créer les bâtiments</button>
    </div>`);

  document.getElementById('qsCancel')?.addEventListener('click', () => closeModal(ctx.el));
  document.getElementById('qsSave')?.addEventListener('click', () => {
    const text  = document.getElementById('qsText')?.value?.trim() || '';
    const errEl = document.getElementById('qsError');
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) { if (errEl) errEl.textContent = 'Entrez au moins un bâtiment.'; return; }

    let s = ctx.state;
    const created = [];
    try {
      for (const line of lines) {
        const parts  = line.split(':');
        const letter = parts[0]?.trim().toUpperCase();
        const count  = parseInt(parts[1]) || 5;
        const perRow = parseInt(parts[2]) || 0;
        s = createBuilding(s, { letter, lodgeCount: count, lodgesPerRow: perRow });
        created.push(`${letter}(${count})`);
      }
      ctx.state = Store.save(s);
      closeModal(ctx.el);
      ctx.render();
      showToast(`${created.length} bâtiment(s) créé(s) : ${created.join(', ')}`, 'success');
    } catch (err) {
      if (errEl) errEl.textContent = err.message || 'Erreur sur une ligne.';
    }
  });
}

// ── Defect modal ──────────────────────────────────────────────────────────────

function openDefectModal(ctx, targetType, targetId) {
  const label = targetType === 'loge'
    ? `Loge ${(ctx.state.lodges || []).find(l => l.id === targetId)?.code || '?'}`
    : `Bâtiment ${(ctx.state.buildings || []).find(b => b.id === targetId)?.letter || '?'}`;

  openModal(ctx.el, `Signaler un défaut — ${label}`, `
    <div class="field">
      <div class="label">Description du défaut</div>
      <textarea id="dfDesc" class="input" rows="3" maxlength="250" placeholder="ex: Porte cassée, câble rongé, fuite d'eau…"></textarea>
    </div>
    <div class="field">
      <div class="label">Sévérité</div>
      <div class="radio-group">
        <label class="radio-label"><input type="radio" name="dfSev" value="mineur" checked /> 🟡 Mineur</label>
        <label class="radio-label"><input type="radio" name="dfSev" value="majeur"        /> 🔴 Majeur</label>
      </div>
    </div>
    <div id="dfError" style="color:var(--color-danger);font-size:.85rem;min-height:1em;margin-top:4px"></div>
    <div class="row" style="margin-top:16px;gap:8px">
      <button class="btn secondary" id="dfCancel" style="flex:1">Annuler</button>
      <button class="btn" id="dfSave" style="flex:2">Signaler</button>
    </div>`);

  setTimeout(() => document.getElementById('dfDesc')?.focus(), 50);
  document.getElementById('dfCancel')?.addEventListener('click', () => closeModal(ctx.el));
  document.getElementById('dfSave')?.addEventListener('click', () => {
    const description = document.getElementById('dfDesc')?.value?.trim();
    const severity    = document.querySelector('input[name="dfSev"]:checked')?.value || 'mineur';
    const errEl       = document.getElementById('dfError');
    try {
      ctx.state = Store.save(reportDefect(ctx.state, { targetType, targetId, description, severity }));
      closeModal(ctx.el);
      ctx.render();
      showToast('Défaut signalé.', 'success');
    } catch (err) {
      if (errEl) errEl.textContent = err.message || 'Erreur.';
    }
  });
}

// ── Lodge event modal ─────────────────────────────────────────────────────────

function openLodgeEventModal(ctx, lodgeId, lodgeCode) {
  const today = new Date().toISOString().slice(0, 10);
  const typeOptions = Object.entries(LODGE_EVENT_TYPES)
    .map(([k, v]) => `<option value="${k}">${v.icon} ${v.label}</option>`)
    .join('');

  openModal(ctx.el, `Événement loge ${lodgeCode}`, `
    <div class="field">
      <div class="label">Type</div>
      <select id="leType" class="input">${typeOptions}</select>
    </div>
    <div class="field">
      <div class="label">Date</div>
      <input id="leDate" class="input" type="date" value="${today}" />
    </div>
    <div class="field">
      <div class="label">Notes <span class="muted">(optionnel)</span></div>
      <input id="leNotes" class="input" type="text" maxlength="120" placeholder="Observations…" />
    </div>
    <div class="row" style="margin-top:16px;gap:8px">
      <button class="btn secondary" id="leCancel" style="flex:1">Annuler</button>
      <button class="btn" id="leSave" style="flex:2">Enregistrer</button>
    </div>`);

  document.getElementById('leCancel')?.addEventListener('click', () => closeModal(ctx.el));
  document.getElementById('leSave')?.addEventListener('click', () => {
    const type  = document.getElementById('leType')?.value;
    const date  = document.getElementById('leDate')?.value || today;
    const notes = document.getElementById('leNotes')?.value?.trim() || '';
    ctx.state = Store.save(addLodgeEvent(ctx.state, { lodgeId, type, date, notes }));
    closeModal(ctx.el);
    ctx.render();
    showToast(`${LODGE_EVENT_TYPES[type]?.label || type} enregistrée pour loge ${lodgeCode}.`, 'success');
  });
}

// ── Building inspection event modal ──────────────────────────────────────────

function openBuildingEventModal(ctx, buildingId) {
  const b     = (ctx.state.buildings || []).find(x => x.id === buildingId);
  const today = new Date().toISOString().slice(0, 10);
  const typeOptions = Object.entries(LODGE_EVENT_TYPES)
    .map(([k, v]) => `<option value="${k}">${v.icon} ${v.label}</option>`)
    .join('');

  openModal(ctx.el, `Événement Bâtiment ${b?.letter}`, `
    <div class="field">
      <div class="label">Type</div>
      <select id="beType" class="input">${typeOptions}</select>
    </div>
    <div class="field">
      <div class="label">Appliquer à</div>
      <div class="radio-group">
        <label class="radio-label"><input type="radio" name="beTarget" value="building" checked /> Bâtiment entier</label>
        <label class="radio-label"><input type="radio" name="beTarget" value="all_lodges" /> Toutes les loges</label>
      </div>
    </div>
    <div class="field">
      <div class="label">Date</div>
      <input id="beDate" class="input" type="date" value="${today}" />
    </div>
    <div class="field">
      <div class="label">Notes <span class="muted">(optionnel)</span></div>
      <input id="beNotes" class="input" type="text" maxlength="120" />
    </div>
    <div class="row" style="margin-top:16px;gap:8px">
      <button class="btn secondary" id="beCancel" style="flex:1">Annuler</button>
      <button class="btn" id="beSave" style="flex:2">Enregistrer</button>
    </div>`);

  document.getElementById('beCancel')?.addEventListener('click', () => closeModal(ctx.el));
  document.getElementById('beSave')?.addEventListener('click', () => {
    const type   = document.getElementById('beType')?.value;
    const target = document.querySelector('input[name="beTarget"]:checked')?.value || 'building';
    const date   = document.getElementById('beDate')?.value || today;
    const notes  = document.getElementById('beNotes')?.value?.trim() || '';

    let s = ctx.state;
    if (target === 'all_lodges') {
      const lodges = (s.lodges || []).filter(l => l.buildingId === buildingId);
      for (const l of lodges) s = addLodgeEvent(s, { lodgeId: l.id, type, date, notes });
    } else {
      s = addLodgeEvent(s, { buildingId, type, date, notes });
    }
    ctx.state = Store.save(s);
    closeModal(ctx.el);
    ctx.render();
    showToast(`${LODGE_EVENT_TYPES[type]?.label} enregistré${target === 'all_lodges' ? ' pour toutes les loges' : ''}.`, 'success');
  });
}

// ── All defects modal ─────────────────────────────────────────────────────────

function openAllDefectsModal(ctx) {
  const { state } = ctx;
  const open   = (state.lodgeDefects || []).filter(d => d.status === 'ouvert');
  const closed = (state.lodgeDefects || []).filter(d => d.status === 'resolu').slice(0, 10);

  const defHTML = (defs, resolved) => defs.length === 0
    ? '<div class="muted small">Aucun.</div>'
    : defs.map(d => {
        const targetLabel = d.targetType === 'loge'
          ? `Loge ${(state.lodges || []).find(l => l.id === d.targetId)?.code || '?'}`
          : `Bâtiment ${(state.buildings || []).find(b => b.id === d.targetId)?.letter || '?'}`;
        return `<div class="lodge-defect-row${resolved ? ' defect-resolved' : ''}">
          <span class="defect-sev-${d.severity}">${d.severity === 'majeur' ? '🔴' : '🟡'}</span>
          <span style="flex:1"><strong>${escapeHTML(targetLabel)}</strong> — ${escapeHTML(d.description)}</span>
          ${!resolved ? `<button class="btn secondary" style="padding:2px 8px;font-size:.75rem" data-resolve-defect="${escapeHTML(d.id)}">Résolu ✓</button>` : '<span class="small muted">Résolu</span>'}
        </div>`;
      }).join('');

  openModal(ctx.el, 'Tous les défauts', `
    <div class="lodge-detail-section-title">Ouverts (${open.length})</div>
    ${defHTML(open, false)}
    <div class="lodge-detail-section-title" style="margin-top:14px">Résolus récents</div>
    ${defHTML(closed, true)}
    <div class="row" style="margin-top:16px">
      <button class="btn secondary" id="allDefClose">Fermer</button>
    </div>`);

  document.getElementById('allDefClose')?.addEventListener('click', () => closeModal(ctx.el));
  document.querySelectorAll('[data-resolve-defect]').forEach(btn =>
    btn.addEventListener('click', () => {
      ctx.state = Store.save(resolveDefect(ctx.state, btn.dataset.resolveDefect));
      ctx.render();
      openAllDefectsModal(ctx);
    })
  );
}

// ── Delete building ───────────────────────────────────────────────────────────

async function _deleteBuilding(ctx, buildingId) {
  const b = (ctx.state.buildings || []).find(x => x.id === buildingId);
  if (!b) return;
  const lodgeCount = (ctx.state.lodges || []).filter(l => l.buildingId === buildingId).length;
  const ok = await showConfirm({
    title: `Supprimer bâtiment ${b.letter}`,
    message: `Supprimer le bâtiment ${b.letter} et ses ${lodgeCount} loges ? Les lapins ne seront pas supprimés mais perdront leur loge.`,
    confirmLabel: 'Supprimer', danger: true,
  });
  if (!ok) return;
  ctx.state = Store.save(deleteBuilding(ctx.state, buildingId));
  ctx.render();
  showToast(`Bâtiment ${b.letter} supprimé.`, 'success');
}
