import { escapeHTML, formatDate, rabbitStatusBadge, sexLabel, daysBetween, getRabbitStage, stageBadge } from "./utils.js";
import { getReproInfo } from "./repro.js";
import { getLitterStatsForDoe, formatEventDetails } from "./litters.js";
import { buildLots, lotBadge } from "./lots.js";
import { getReminders, reminderLabel } from "./health.js";



export function renderDashboard(ctx) {
  const { state, el } = ctx;

  const total = state.rabbits.length;
  const actifs = state.rabbits.filter(r => r.status === "actif").length;
  const femelles = state.rabbits.filter(r => r.sex === "F" && r.status === "actif").length;
  const males = state.rabbits.filter(r => r.sex === "M" && r.status === "actif").length;

  const todayISO = new Date().toISOString().slice(0,10);

  const { overdue, upcoming } = getReminders(state, { windowDays: 7 });

  const recent7 = state.events.filter(e => {
    const diff = daysBetween(e.date, todayISO);
    return diff >= 0 && diff <= 7;
  }).length;

  const dueSoon = state.rabbits
    .filter(r => r.sex === "F" && r.status === "actif")
    .map(r => ({ r, info: getReproInfo(state, r) }))
    .filter(x => x.info && x.info.dueDate)
    .map(x => ({ ...x, daysLeft: daysBetween(todayISO, x.info.dueDate) }))
    .filter(x => x.daysLeft >= 0 && x.daysLeft <= 7)
    .sort((a,b) => a.daysLeft - b.daysLeft);

  el.dash.innerHTML = `
    <div class="tile"><div class="n">${total}</div><div class="t">Lapins (total)</div></div>
    <div class="tile"><div class="n">${actifs}</div><div class="t">Actifs</div></div>
    <div class="tile"><div class="n">${femelles}</div><div class="t">Femelles actives</div></div>
    <div class="tile"><div class="n">${males}</div><div class="t">Mâles actifs</div></div>
    <div class="tile"><div class="n">${recent7}</div><div class="t">Événements (7 jours)</div></div>
    <div class="tile"><div class="n">${dueSoon.length}</div><div class="t">Mise-bas bientôt (≤7j)</div></div>
    <div class="tile"><div class="n">${upcoming.length}</div><div class="t">Rappels (≤7j)</div></div>
    <div class="tile"><div class="n">${overdue.length}</div><div class="t">Rappels en retard</div></div>
    <div class="tile"><div class="n">${state.rabbits.filter(r=>r.status==="vendu").length}</div><div class="t">Vendus</div></div>
    <div class="tile"><div class="n">${state.rabbits.filter(r=>r.status==="mort").length}</div><div class="t">Morts</div></div>
  `;

  // Liste mise-bas bientôt
  if (dueSoon.length > 0) {
    const list = dueSoon.slice(0,6).map(x =>
      `<div class="small">• <strong>${escapeHTML(x.r.name)}</strong> (${escapeHTML(x.r.code)}) — mise-bas: <strong>${escapeHTML(x.info.dueDate)}</strong> (J-${x.daysLeft})</div>`
    ).join("");
    el.dash.innerHTML += `<div style="grid-column:1/-1;margin-top:6px">${list}</div>`;
  } else {
    el.dash.innerHTML += `<div style="grid-column:1/-1;margin-top:6px" class="small">Aucune mise-bas prévue dans les 7 prochains jours.</div>`;
  }

  // Liste rappels urgents (retard + ≤7j)
  const urgent = [...overdue, ...upcoming].slice(0, 6);
  if (urgent.length > 0) {
    const list = urgent
      .map(r => `<div class="small">• ${reminderLabel(r)}</div>`)
      .join("");
    el.dash.innerHTML += `<div style="grid-column:1/-1;margin-top:6px">${list}</div>`;
  } else {
    el.dash.innerHTML += `<div style="grid-column:1/-1;margin-top:6px" class="small">Aucun rappel vaccin/traitement à venir.</div>`;
  }
}


export function renderRabbitList(ctx) {
  const { el } = ctx;
  const rabbits = getFilteredRabbits(ctx);

  if (rabbits.length === 0) {
    el.rabbitList.innerHTML = `<div class="muted">Aucun lapin trouvé.</div>`;
    return;
  }

  el.rabbitList.innerHTML = rabbits.map(r => {
    const active = r.id === ctx.selectedRabbitId ? "active" : "";
    const stage = getRabbitStage(r);
    return `
      <div class="item ${active}" data-testid="rabbit-item" data-rabbit="${r.id}">
        <div>
          <div><strong>${escapeHTML(r.code)}</strong> — ${escapeHTML(r.name)} <span class="badge">${sexLabel(r.sex)}</span> ${stageBadge(stage)}</div>
          <div class="small">Race: ${escapeHTML(r.breed || "—")} · Cage: ${escapeHTML(r.cage || "—")} · Naissance: ${escapeHTML(formatDate(r.birthDate))}</div>
        </div>
        <div>${rabbitStatusBadge(r.status)}</div>
      </div>
    `;
  }).join("");
}

export function renderRabbitDetails(ctx) {
  const { state, el } = ctx;

  if (!ctx.selectedRabbitId) {
    el.rabbitDetails.innerHTML = `<div class="muted">Sélectionne un lapin dans la liste.</div>`;
    return;
  }
  const r = state.rabbits.find(x => x.id === ctx.selectedRabbitId);
  if (!r) {
    el.rabbitDetails.innerHTML = `<div class="muted">Lapin introuvable.</div>`;
    return;
  }
  const stage = getRabbitStage(r);

  const repro = getReproInfo(state, r);
  const reproHTML = (repro && repro.dueDate)
    ? `
      <div class="sep"></div>
      <div class="kv">
        <div>Dernière saillie</div><div>${escapeHTML(repro.lastMating?.date || "—")}</div>
        <div>Mise-bas estimée</div><div><strong>${escapeHTML(repro.dueDate)}</strong></div>
      </div>
    ` : "";

  let litterHTML = "";
  if (r.sex === "F") {
    const st = getLitterStatsForDoe(state, r.id);
    if (st.count > 0) {
      litterHTML = `
        <div class="sep"></div>
        <div class="kv">
          <div>Portées</div><div><strong>${st.count}</strong></div>
          <div>Total nés</div><div>${st.born}</div>
          <div>Total vivants</div><div>${st.alive}</div>
          <div>Total morts-nés</div><div>${st.dead}</div>
          <div>Taux survie</div><div><strong>${st.survival}%</strong></div>
        </div>
      `;
    }
  }

  const motherId = r.doeId || r.motherId;
  const fatherId = r.buckId || r.fatherId;
  const mother = motherId ? state.rabbits.find(x => x.id === motherId) : null;
  const father = fatherId ? state.rabbits.find(x => x.id === fatherId) : null;
  const siblingsCount = r.litterId
    ? state.rabbits.filter(x => x.litterId === r.litterId && x.id !== r.id).length
    : 0;

  const genealogyHTML = (mother || father || r.litterId)
    ? `
      <div class="sep"></div>
      <div style="font-weight:700;margin-bottom:6px">Généalogie</div>
      <div class="kv">
        <div>Mère</div>
        <div>${mother ? `<button class="linkbtn" data-open-rabbit="${mother.id}">${escapeHTML(mother.name)} (${escapeHTML(mother.code)})</button>` : "—"}</div>
        <div>Père</div>
        <div>${father ? `<button class="linkbtn" data-open-rabbit="${father.id}">${escapeHTML(father.name)} (${escapeHTML(father.code)})</button>` : "—"}</div>
        <div>Fratrie</div>
        <div>${r.litterId ? `${siblingsCount} frère(s)/soeur(s)` : "—"}</div>
      </div>
    ` : "";

  el.rabbitDetails.innerHTML = `
    <div class="row" style="justify-content:space-between">
      <div>
        <div style="font-size:18px;font-weight:900">${escapeHTML(r.name)} <span class="badge">${escapeHTML(r.code)}</span></div>
        <div class="small">${rabbitStatusBadge(r.status)} <span class="badge">${sexLabel(r.sex)}</span></div>
      </div>
      <div class="row">
        <button class="btn secondary" id="btnEditRabbit">Modifier</button>
        <button class="btn danger" id="btnDeleteRabbit">Supprimer</button>
      </div>
    </div>

    <div class="sep"></div>

    <div class="kv">
      <div>Race</div><div>${escapeHTML(r.breed || "—")}</div>
      <div>Date naissance</div><div>${escapeHTML(formatDate(r.birthDate))}</div>
      <div>Stage</div><div>${stageBadge(stage)}</div>
      <div>Cage</div><div>${escapeHTML(r.cage || "—")}</div>
      <div>Notes</div><div>${escapeHTML(r.notes || "—")}</div>
      <div>Créé</div><div>${escapeHTML(formatDate(r.createdAt))}</div>
      <div>Modifié</div><div>${escapeHTML(formatDate(r.updatedAt))}</div>
    </div>

    ${reproHTML}
    ${litterHTML}
    ${genealogyHTML}

    <div class="sep"></div>

    <div class="row">
      <button class="btn" id="btnAddEvent" data-testid="btn-add-event">+ Ajouter un événement</button>
    </div>
  `;
}

export function renderEventsPanel(ctx) {
  const { state, el } = ctx;

  if (!ctx.selectedRabbitId) {
    el.eventsPanel.innerHTML = `<div class="muted">Sélectionne un lapin pour voir/ajouter des événements.</div>`;
    return;
  }

  const r = state.rabbits.find(x => x.id === ctx.selectedRabbitId);
  if (!r) {
    el.eventsPanel.innerHTML = `<div class="muted">Lapin introuvable.</div>`;
    return;
  }

  const types = {
    saillie: "Saillie",
    mise_bas: "Mise-bas",
    sevrage: "Sevrage",
    vaccin: "Vaccin",
    traitement: "Traitement",
    pesée: "Pesée",
    vente: "Vente",
    décès: "Décès",
    autre: "Autre"
  };

  const events = state.events
    .filter(e => e.rabbitId === ctx.selectedRabbitId)
    .sort((a,b) => (b.date || "").localeCompare(a.date || ""));

  if (events.length === 0) {
    el.eventsPanel.innerHTML = `
      <div class="muted">Aucun événement pour <strong>${escapeHTML(r.name)}</strong>.</div>
      <div class="sep"></div>
      <button class="btn" id="btnAddEvent2" data-testid="btn-add-event-2">+ Ajouter un événement</button>
    `;
    return;
  }

  el.eventsPanel.innerHTML = `
    <div class="muted">Historique de <strong>${escapeHTML(r.name)}</strong> (${events.length})</div>
    <div class="sep"></div>
    <div class="list">
      ${events.map(e => `
        <div class="item">
          <div>
            <div><strong>${escapeHTML(types[e.type] || e.type)}</strong> <span class="badge">${escapeHTML(e.date)}</span></div>
            <div class="small">${escapeHTML(formatEventDetails(e))}</div>
          </div>
          <div>
            <button class="btn danger" data-del-event="${e.id}">Suppr.</button>
          </div>
        </div>
      `).join("")}
    </div>
    <div class="sep"></div>
    <button class="btn" id="btnAddEvent2" data-testid="btn-add-event-2">+ Ajouter un événement</button>
  `;
}

export function renderAll(ctx) {
  renderDashboard(ctx);
  renderRabbitList(ctx);
  renderRabbitDetails(ctx);
  renderEventsPanel(ctx);
  renderLots(ctx);
  renderGenealogy(ctx);
}

function getFilteredRabbits(ctx) {
  const { state, el } = ctx;
  const q = (el.q.value || "").toLowerCase().trim();
  const sex = el.sexFilter.value;
  const status = el.statusFilter.value;

  return state.rabbits.filter(r => {
    if (sex && r.sex !== sex) return false;
    if (status && r.status !== status) return false;
    if (!q) return true;
    const hay = [r.code, r.name, r.breed, r.sex, r.cage, r.status, r.notes, r.stage].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

function getFilteredLots(ctx, lots) {
  const q = (ctx.el.lotQ?.value || "").toLowerCase().trim();
  if (!q) return lots;

  return lots.filter(l => {
    const hay = [l.cage, l.doeName, l.doeCode, l.date, l.notes].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

export function renderLots(ctx) {
  const { el, state } = ctx;

  // si l'UI n'existe pas (au cas où), on skip
  if (!el.lotList || !el.lotDetails) return;

  const lots = buildLots(state);
  const filtered = getFilteredLots(ctx, lots);

  if (!filtered.length) {
    el.lotList.innerHTML = `<div class="muted">Aucun lot trouvé (ajoute un événement “Sevrage”).</div>`;
  } else {
    el.lotList.innerHTML = filtered.map(l => {
      const active = (ctx.selectedLotId === l.id) ? "active" : "";
      return `
        <div class="item ${active}" data-testid="lot-item" data-lot="${l.id}">
          <div>
            <div><strong>${escapeHTML(l.cage)}</strong> — ${escapeHTML(l.date)}</div>
            <div class="small">Mère: ${escapeHTML(l.doeName)} (${escapeHTML(l.doeCode)})</div>
          </div>
          <div>${lotBadge(l)}</div>
        </div>
      `;
    }).join("");
  }

  // détails lot
  const selected = lots.find(x => x.id === ctx.selectedLotId);
  if (!selected) {
    el.lotDetails.innerHTML = `<div class="muted">Sélectionne un lot.</div>`;
  } else {
    el.lotDetails.innerHTML = `
      <div style="font-size:18px;font-weight:900">${escapeHTML(selected.cage)} <span class="badge">${escapeHTML(selected.date)}</span></div>
      <div class="sep"></div>
      <div class="kv">
        <div>Sevrés</div><div><strong>${escapeHTML(String(selected.weaned))}</strong></div>
        <div>Mère</div><div>${escapeHTML(selected.doeName)} (${escapeHTML(selected.doeCode)})</div>
        <div>Notes</div><div>${escapeHTML(selected.notes || "—")}</div>
      </div>
      <div class="sep"></div>
      <div class="row">
        <button class="btn secondary" id="btnOpenDoe">Voir la mère</button>
      </div>
    `;
  }
}

export function renderGenealogy(ctx) {
  const { el, state } = ctx;
  if (!el.geneGraph || !el.geneQ || !el.geneList) return;
  if (!state.rabbits.length) {
    el.geneGraph.innerHTML = `<div class="muted">Aucun lapin pour afficher la généalogie.</div>`;
    el.geneList.innerHTML = `<div class="muted">Ajoute un lapin pour commencer.</div>`;
    return;
  }

  const q = (el.geneQ.value || "").toLowerCase().trim();
  const matches = state.rabbits.filter(r => {
    if (!q) return true;
    const hay = [r.code, r.name, r.breed].join(" ").toLowerCase();
    return hay.includes(q);
  }).slice(0, 6);

  el.geneList.innerHTML = matches.map(r => `
    <button class="item linkbtn" data-gene-focus="${r.id}">
      <strong>${escapeHTML(r.code)}</strong> — ${escapeHTML(r.name)}
    </button>
  `).join("") || `<div class="muted">Aucun résultat.</div>`;

  const focusId = ctx.selectedGeneRabbitId || ctx.selectedRabbitId || state.rabbits[0].id;
  const focus = state.rabbits.find(r => r.id === focusId) || state.rabbits[0];
  const motherId = focus.doeId || focus.motherId;
  const fatherId = focus.buckId || focus.fatherId;
  const mother = motherId ? state.rabbits.find(r => r.id === motherId) : null;
  const father = fatherId ? state.rabbits.find(r => r.id === fatherId) : null;
  const kids = state.rabbits.filter(r => (r.doeId || r.motherId) === focus.id).slice(0, 4);

  const nodes = [
    { id: mother?.id, label: mother ? `${mother.name} (${mother.code})` : "Mère inconnue", x: 110, y: 20, muted: !mother },
    { id: father?.id, label: father ? `${father.name} (${father.code})` : "Père inconnu", x: 430, y: 20, muted: !father },
    { id: focus.id, label: `${focus.name} (${focus.code})`, x: 270, y: 140, focus: true },
  ];

  const kidNodes = kids.map((k, idx) => ({
    id: k.id,
    label: `${k.name} (${k.code})`,
    x: 80 + idx * 180,
    y: 260,
  }));

  const width = 620;
  const height = 340;

  el.geneGraph.innerHTML = `
    <svg class="gene-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Généalogie">
      ${mother ? `<line class="gene-line" x1="200" y1="80" x2="310" y2="140"></line>` : ""}
      ${father ? `<line class="gene-line" x1="520" y1="80" x2="330" y2="140"></line>` : ""}
      ${kidNodes.map((k) => `<line class="gene-line" x1="310" y1="200" x2="${k.x + 70}" y2="${k.y}"></line>`).join("")}
      ${[...nodes, ...kidNodes].map((n) => `
        <g class="gene-node ${n.focus ? "focus" : ""} ${n.muted ? "muted" : ""}" data-gene-focus="${n.id || ""}">
          <rect x="${n.x}" y="${n.y}" rx="10" ry="10" width="140" height="50"></rect>
          <text x="${n.x + 70}" y="${n.y + 30}" text-anchor="middle">${escapeHTML(n.label)}</text>
        </g>
      `).join("")}
    </svg>
  `;
}
