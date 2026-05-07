/**
 * src/genealogy3d.js
 * Arbre généalogique 3D interactif — projection manuelle, pas de dépendance.
 */

// ─── Utilitaires ─────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function pseudoRandom(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 0xffffffff;
}

// ─── Construction du graphe ───────────────────────────────────────────────────

export function buildGenealogyGraph(state) {
  const rabbits = state.rabbits || [];
  if (!rabbits.length) return { nodes: [], edges: [] };

  const rabbitMap = new Map(rabbits.map(r => [r.id, r]));
  const parentToChildren = new Map(); // parentId → [childId]
  const childToParents = new Map();   // childId  → [{id, type}]

  rabbits.forEach(r => {
    const motherId = r.doeId || r.motherId || null;
    const fatherId = r.buckId || r.fatherId || null;
    const parents = [];
    if (motherId && rabbitMap.has(motherId)) {
      parents.push({ id: motherId, type: "mother" });
      if (!parentToChildren.has(motherId)) parentToChildren.set(motherId, []);
      parentToChildren.get(motherId).push(r.id);
    }
    if (fatherId && rabbitMap.has(fatherId)) {
      parents.push({ id: fatherId, type: "father" });
      if (!parentToChildren.has(fatherId)) parentToChildren.set(fatherId, []);
      parentToChildren.get(fatherId).push(r.id);
    }
    if (parents.length) childToParents.set(r.id, parents);
  });

  // Générations par BFS depuis les racines
  const genMap = new Map();
  const queue = [];
  rabbits.forEach(r => {
    if (!childToParents.has(r.id)) { genMap.set(r.id, 0); queue.push(r.id); }
  });
  const visited = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    const g = genMap.get(id) || 0;
    for (const cid of (parentToChildren.get(id) || [])) {
      const prev = genMap.get(cid);
      if (prev === undefined || prev < g + 1) genMap.set(cid, g + 1);
      if (!visited.has(cid)) queue.push(cid);
    }
  }
  rabbits.forEach(r => { if (!genMap.has(r.id)) genMap.set(r.id, 0); });

  // Regrouper par génération, trier par fratrie pour garder les siblings adjacents
  const byGen = new Map();
  rabbits.forEach(r => {
    const g = genMap.get(r.id);
    if (!byGen.has(g)) byGen.set(g, []);
    byGen.get(g).push(r.id);
  });
  byGen.forEach(ids => {
    ids.sort((a, b) => {
      const ka = (rabbitMap.get(a)?.litterId || "") + "_" + a;
      const kb = (rabbitMap.get(b)?.litterId || "") + "_" + b;
      return ka.localeCompare(kb);
    });
  });

  const maxGen = Math.max(0, ...genMap.values());
  const centerY = (maxGen * 180) / 2;
  const SPREAD_X = 220, SPREAD_Y = 200, SPREAD_Z = 180;

  const nodes = rabbits.map(r => {
    const g = genMap.get(r.id) || 0;
    const genList = byGen.get(g) || [];
    const idx = genList.indexOf(r.id);
    const count = genList.length;
    const x = (idx - (count - 1) / 2) * SPREAD_X;
    const y = g * SPREAD_Y - centerY;
    const z = (pseudoRandom(r.id + "_z") - 0.5) * SPREAD_Z;
    const parentIds = (childToParents.get(r.id) || []).map(p => p.id);
    const childIds = parentToChildren.get(r.id) || [];
    const siblingIds = r.litterId
      ? rabbits.filter(s => s.id !== r.id && s.litterId === r.litterId).map(s => s.id)
      : [];
    return {
      id: r.id, rabbit: r,
      label: r.name, cage: r.cage || "", sex: r.sex || "U", status: r.status || "actif",
      generation: g, x, y, z,
      parentIds, childIds, siblingIds,
      isParent: childIds.length > 0,
    };
  });

  const edges = [];
  rabbits.forEach(r => {
    const motherId = r.doeId || r.motherId;
    const fatherId = r.buckId || r.fatherId;
    if (motherId && rabbitMap.has(motherId)) edges.push({ from: motherId, to: r.id, type: "mother" });
    if (fatherId && rabbitMap.has(fatherId)) edges.push({ from: fatherId, to: r.id, type: "father" });
  });

  return { nodes, edges };
}

// ─── Projection 3D → 2D ──────────────────────────────────────────────────────

function project(x, y, z, rotX, rotY, zoom) {
  const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
  const rx = x * cosY + z * sinY;
  const rz1 = -x * sinY + z * cosY;
  const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
  const ry = y * cosX - rz1 * sinX;
  const rz = y * sinX + rz1 * cosX;
  const fov = 700;
  const dist = fov + rz + 500;
  const s = (fov / Math.max(dist, 1)) * zoom;
  return { sx: rx * s, sy: ry * s, depth: rz, scale: s };
}

// ─── État singleton ───────────────────────────────────────────────────────────

let G = null;

// ─── Initialisation du moteur ─────────────────────────────────────────────────

function initEngine(ctx, stageEl) {
  // SVG overlay pour les arêtes
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "gene-svg-overlay");

  // Couche des nœuds
  const nodesLayer = document.createElement("div");
  nodesLayer.className = "gene-nodes-layer";

  // Tooltip survol
  const tooltip = document.createElement("div");
  tooltip.className = "gene-tooltip";
  tooltip.hidden = true;
  tooltip.setAttribute("aria-live", "polite");

  stageEl.innerHTML = "";
  stageEl.appendChild(svg);
  stageEl.appendChild(nodesLayer);
  stageEl.appendChild(tooltip);

  const { nodes, edges } = buildGenealogyGraph(ctx.state);
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Créer les éléments nœuds
  const nodeEls = new Map();
  nodes.forEach(node => {
    const el = document.createElement("div");
    el.className = `gene-node gene-sex-${node.sex.toLowerCase()}`;
    el.setAttribute("tabindex", "0");
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", node.label);
    el.dataset.nodeId = node.id;
    el.innerHTML = `<div class="gene-node-inner">
      <div class="gene-node-label">${esc(node.label)}</div>
      <div class="gene-node-cage">${esc(node.cage)}</div>
    </div>`;
    nodesLayer.appendChild(el);
    nodeEls.set(node.id, el);
  });

  // Créer les lignes SVG
  const lineEls = new Map();
  edges.forEach(edge => {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("class", `gene-edge gene-edge--${edge.type}`);
    svg.appendChild(line);
    lineEls.set(`${edge.from}__${edge.to}`, line);
  });

  G = {
    ctx, stageEl, svg, nodesLayer, tooltip,
    nodes, edges, nodeMap, nodeEls, lineEls,
    rotX: -0.25, rotY: 0, zoom: 1,
    cx: 0, cy: 0,
    dragging: false, lastMx: 0, lastMy: 0,
    lastInteraction: 0,
    raf: null,
    focusId: null,
    hoverId: null,
    searchQ: "",
    listeners: [],
    _dataKey: _dataKey(ctx.state),
  };

  wireEvents(G);
  startLoop(G);
}

function _dataKey(state) {
  return (state.rabbits || []).map(r => r.id).join(",");
}

// ─── Boucle RAF ───────────────────────────────────────────────────────────────

const _isE2E = new URLSearchParams(window.location.search).has('e2e');

function startLoop(g) {
  if (g.raf) cancelAnimationFrame(g.raf);
  function frame() {
    if (!g.stageEl?.isConnected) { g.raf = null; return; }
    // Auto-rotation après 3 s d'inactivité (désactivée en mode E2E)
    if (!_isE2E && Date.now() - g.lastInteraction > 3000) g.rotY += 0.004;
    const rect = g.stageEl.getBoundingClientRect();
    g.cx = rect.width / 2;
    g.cy = rect.height / 2;
    draw(g);
    g.raf = requestAnimationFrame(frame);
  }
  g.raf = requestAnimationFrame(frame);
}

function draw(g) {
  if (!g.nodes.length) return;
  const { nodes, edges, nodeEls, lineEls, nodeMap } = g;

  // Projeter tous les nœuds
  const proj = nodes.map(node => {
    const p = project(node.x, node.y, node.z, g.rotX, g.rotY, g.zoom);
    return { node, ...p };
  });
  proj.sort((a, b) => b.depth - a.depth); // painter's algo

  const posMap = new Map(proj.map(p => [p.node.id, p]));

  // Mettre à jour le viewBox du SVG
  g.svg.setAttribute("viewBox", `0 0 ${g.cx * 2 || 1} ${g.cy * 2 || 1}`);

  // Focus relatives
  const focusNode = g.focusId ? nodeMap.get(g.focusId) : null;
  const focusSet = focusNode
    ? new Set([g.focusId, ...focusNode.parentIds, ...focusNode.childIds, ...focusNode.siblingIds])
    : null;

  // Recherche
  const q = g.searchQ.toLowerCase().trim();

  // Arêtes
  edges.forEach(edge => {
    const key = `${edge.from}__${edge.to}`;
    const line = lineEls.get(key);
    if (!line) return;
    const fp = posMap.get(edge.from), tp = posMap.get(edge.to);
    if (!fp || !tp) { line.setAttribute("visibility", "hidden"); return; }
    line.setAttribute("visibility", "visible");
    line.setAttribute("x1", g.cx + fp.sx);
    line.setAttribute("y1", g.cy + fp.sy);
    line.setAttribute("x2", g.cx + tp.sx);
    line.setAttribute("y2", g.cy + tp.sy);
    const dimmed = focusSet && !focusSet.has(edge.from) && !focusSet.has(edge.to);
    line.style.opacity = dimmed ? "0.04" : "";
  });

  // Nœuds
  proj.forEach(({ node, sx, sy, depth, scale }) => {
    const el = nodeEls.get(node.id);
    if (!el) return;
    const isFocus = node.id === g.focusId;
    const isHover = node.id === g.hoverId;
    const dimmed = focusSet ? !focusSet.has(node.id) : false;
    const matched = q && (node.label.toLowerCase().includes(q) || node.cage.toLowerCase().includes(q) ||
      (node.rabbit.code || "").toLowerCase().includes(q));

    const baseScale = node.isParent ? 1.1 : 0.85;
    const ns = scale * baseScale * (isFocus ? 1.5 : isHover ? 1.25 : matched ? 1.3 : 1);
    const clamped = Math.max(0.25, Math.min(3.5, ns));

    el.style.left = `${g.cx + sx}px`;
    el.style.top = `${g.cy + sy}px`;
    el.style.zIndex = Math.round(500 + (500 - Math.min(depth, 500)));
    el.style.setProperty("--ns", clamped);
    el.style.opacity = dimmed ? "0.07" : matched ? "1" : isFocus || isHover ? "1" : "0.88";
    el.classList.toggle("gene-node--focus", isFocus);
    el.classList.toggle("gene-node--hovered", isHover);
    el.classList.toggle("gene-node--matched", !!matched && !dimmed);
    el.classList.toggle("gene-node--dimmed", dimmed);
  });
}

// ─── Câblage événements ───────────────────────────────────────────────────────

function markInteraction(g) {
  g.lastInteraction = Date.now();
}

function on(g, el, type, fn, opts) {
  el.addEventListener(type, fn, opts);
  g.listeners.push({ el, type, fn });
}

function wireEvents(g) {
  const c = g.stageEl;

  // ── Rotation drag souris ──
  on(g, c, "mousedown", e => {
    if (e.button !== 0) return;
    g.dragging = true; g.lastMx = e.clientX; g.lastMy = e.clientY;
    markInteraction(g);
  });
  on(g, window, "mousemove", e => {
    if (!g.dragging) return;
    g.rotY += (e.clientX - g.lastMx) * 0.008;
    g.rotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, g.rotX + (e.clientY - g.lastMy) * 0.006));
    g.lastMx = e.clientX; g.lastMy = e.clientY;
    markInteraction(g);
  });
  on(g, window, "mouseup", () => { g.dragging = false; });

  // ── Zoom molette ──
  on(g, c, "wheel", e => {
    e.preventDefault();
    g.zoom = Math.max(0.2, Math.min(5, g.zoom * (e.deltaY > 0 ? 0.92 : 1.09)));
    markInteraction(g);
  }, { passive: false });

  // ── Tactile ──
  let prevDist = 0;
  on(g, c, "touchstart", e => {
    markInteraction(g);
    if (e.touches.length === 1) {
      g.dragging = true; g.lastMx = e.touches[0].clientX; g.lastMy = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      prevDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    }
  }, { passive: true });
  on(g, c, "touchmove", e => {
    markInteraction(g);
    if (e.touches.length === 1 && g.dragging) {
      g.rotY += (e.touches[0].clientX - g.lastMx) * 0.008;
      g.rotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, g.rotX + (e.touches[0].clientY - g.lastMy) * 0.006));
      g.lastMx = e.touches[0].clientX; g.lastMy = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (prevDist > 0) g.zoom = Math.max(0.2, Math.min(5, g.zoom * d / prevDist));
      prevDist = d;
    }
  }, { passive: true });
  on(g, c, "touchend", () => { g.dragging = false; prevDist = 0; });

  // ── Survol nœud ──
  on(g, c, "mouseover", e => {
    const nodeEl = e.target.closest("[data-node-id]");
    if (!nodeEl) return;
    const id = nodeEl.dataset.nodeId;
    if (id !== g.hoverId) { g.hoverId = id; showTooltip(g, id, nodeEl); }
  });
  on(g, c, "mouseout", e => {
    const nodeEl = e.target.closest("[data-node-id]");
    if (!nodeEl) return;
    if (!e.relatedTarget?.closest?.("[data-node-id]")) {
      g.hoverId = null;
      // délai court pour ne pas clignoter si on va sur le tooltip
      setTimeout(() => { if (!g.tooltip.matches?.(":hover")) g.tooltip.hidden = true; }, 120);
    }
  });
  on(g, c, "mousemove", e => { if (!g.dragging && g.hoverId) positionTooltip(g, e); });

  // ── Clics nœud ──
  let clickTimer = null, pendingClickId = null;
  on(g, c, "click", e => {
    if (g.dragging) return;
    const nodeEl = e.target.closest("[data-node-id]");
    if (!nodeEl) { hideSideCard(); return; }
    if (e.detail >= 2) return; // laisse dblclick gérer
    pendingClickId = nodeEl.dataset.nodeId;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => { if (pendingClickId) showSideCard(g, pendingClickId); pendingClickId = null; }, 220);
    markInteraction(g);
  });
  on(g, c, "dblclick", e => {
    clearTimeout(clickTimer); pendingClickId = null;
    const nodeEl = e.target.closest("[data-node-id]");
    if (!nodeEl) return;
    e.preventDefault();
    focusGeneRabbit(g.ctx, nodeEl.dataset.nodeId);
    markInteraction(g);
  });

  // ── Clavier nœud ──
  on(g, c, "keydown", e => {
    if (e.key === "Escape") { resetGenealogyFocus(g.ctx); g.tooltip.hidden = true; hideSideCard(); return; }
    const nodeEl = e.target.closest("[data-node-id]");
    if (!nodeEl) return;
    const id = nodeEl.dataset.nodeId;
    if (e.key === "Enter") { clearTimeout(clickTimer); showSideCard(g, id); }
    if (e.key === "f" || e.key === "F") focusGeneRabbit(g.ctx, id);
  });

  // ── Bouton Réinitialiser ──
  const resetBtn = document.getElementById("geneResetView");
  if (resetBtn) on(g, resetBtn, "click", () => resetGenealogyFocus(g.ctx));

  // ── Recherche ──
  const qInput = document.getElementById("geneQ");
  if (qInput) {
    on(g, qInput, "input", () => { g.searchQ = qInput.value || ""; markInteraction(g); });
    g.searchQ = qInput.value || "";
  }

  // ── Délégation : "Voir plus" dans tooltip et sidecard ──
  on(g, document, "click", e => {
    const btn = e.target.closest("[data-gene-show-card]");
    if (btn) { e.stopPropagation(); showSideCard(g, btn.dataset.geneShowCard); return; }
    const openBtn = e.target.closest("[data-gene-open-rabbit]");
    if (openBtn) {
      const rid = openBtn.dataset.geneOpenRabbit;
      if (rid && g.ctx.navigate) { g.ctx.selectedRabbitId = rid; g.ctx.navigate("rabbits"); }
    }
  });
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function showTooltip(g, id, anchorEl) {
  const node = g.nodeMap.get(id);
  if (!node) return;
  const r = node.rabbit;
  const state = g.ctx.state;
  const mother = state.rabbits.find(x => x.id === (r.doeId || r.motherId));
  const father = state.rabbits.find(x => x.id === (r.buckId || r.fatherId));
  const descCount = node.childIds.length;

  const sexLabel = { F: "Femelle", M: "Mâle", U: "Inconnu" }[r.sex] || r.sex;

  g.tooltip.innerHTML = `
    <div class="gene-tooltip-title">${esc(r.name)} <span class="badge">${esc(r.code)}</span></div>
    <div class="gene-tooltip-grid">
      <span>Sexe</span><span>${esc(sexLabel)}</span>
      <span>Cage</span><span>${esc(r.cage || "—")}</span>
      <span>Race</span><span>${esc(r.breed || "—")}</span>
      <span>Statut</span><span>${esc(r.status || "—")}</span>
      <span>Naissance</span><span>${esc(r.birthDate || "—")}</span>
      <span>Mère</span><span>${mother ? esc(`${mother.name} (${mother.code})`) : "—"}</span>
      <span>Père</span><span>${father ? esc(`${father.name} (${father.code})`) : "—"}</span>
      <span>Descendants</span><span>${descCount}</span>
    </div>
    <button class="btn gene-tooltip-btn" data-gene-show-card="${esc(id)}">Voir plus</button>
  `;
  g.tooltip.hidden = false;
  positionTooltip(g, anchorEl.getBoundingClientRect());
}

function positionTooltip(g, eOrRect) {
  const t = g.tooltip;
  const stage = g.stageEl.getBoundingClientRect();
  let cx, cy;
  if (eOrRect instanceof MouseEvent) {
    cx = eOrRect.clientX - stage.left; cy = eOrRect.clientY - stage.top;
  } else if (eOrRect && typeof eOrRect.left === "number") {
    cx = (eOrRect.left + eOrRect.right) / 2 - stage.left;
    cy = eOrRect.top - stage.top;
  } else return;

  const tw = t.offsetWidth || 230, th = t.offsetHeight || 180;
  const pw = stage.width, ph = stage.height;
  let left = cx + 16, top = cy - 12;
  if (left + tw > pw - 8) left = cx - tw - 16;
  if (top + th > ph - 8) top = ph - th - 8;
  if (top < 4) top = 4;
  t.style.left = `${Math.max(4, left)}px`;
  t.style.top = `${Math.max(4, top)}px`;
}

// ─── Side card ────────────────────────────────────────────────────────────────

function showSideCard(g, id) {
  const node = g.nodeMap.get(id);
  if (!node) return;
  const r = node.rabbit;
  const state = g.ctx.state;
  const mother = state.rabbits.find(x => x.id === (r.doeId || r.motherId));
  const father = state.rabbits.find(x => x.id === (r.buckId || r.fatherId));
  const descCount = node.childIds.length;
  const sexLabel = { F: "Femelle 🐇", M: "Mâle 🐇", U: "Inconnu" }[r.sex] || r.sex;
  const statusBadge = r.status === "actif" ? "ok" : r.status === "vendu" ? "warning" : "muted";

  const card = document.getElementById("geneSideCard");
  if (!card) return;
  card.innerHTML = `
    <div class="gene-sidecard-header">
      <div class="gene-sidecard-name">${esc(r.name)}</div>
      <div><span class="badge">${esc(r.code)}</span> <span class="badge ${statusBadge}">${esc(r.status || "—")}</span></div>
    </div>
    <div class="gene-sidecard-body">
      <div class="kv">
        <div>Sexe</div><div>${esc(sexLabel)}</div>
        <div>Race</div><div>${esc(r.breed || "—")}</div>
        <div>Cage</div><div>${esc(r.cage || "—")}</div>
        <div>Naissance</div><div>${esc(r.birthDate || "—")}</div>
        <div>Statut</div><div>${esc(r.status || "—")}</div>
        <div>Mère</div><div>${mother ? esc(`${mother.name} (${mother.code})`) : "—"}</div>
        <div>Père</div><div>${father ? esc(`${father.name} (${father.code})`) : "—"}</div>
        <div>Descendants</div><div>${descCount}</div>
        ${r.notes ? `<div>Notes</div><div>${esc(r.notes)}</div>` : ""}
      </div>
    </div>
    <div class="gene-sidecard-actions">
      <button class="btn" data-gene-open-rabbit="${esc(id)}">Ouvrir la fiche</button>
      <button class="btn secondary" data-gene-focus-mode="${esc(id)}">Focus arbre</button>
      <button class="btn ghost gene-sidecard-close">×</button>
    </div>
  `;
  card.hidden = false;

  // Bouton focus mode depuis sidecard
  const focusBtn = card.querySelector("[data-gene-focus-mode]");
  if (focusBtn) {
    focusBtn.addEventListener("click", () => focusGeneRabbit(g.ctx, id));
  }
  const closeBtn = card.querySelector(".gene-sidecard-close");
  if (closeBtn) closeBtn.addEventListener("click", hideSideCard);

  // Mettre en évidence dans le graphe
  g.focusId = null; // ne pas activer le focus, juste la sidecard
}

function hideSideCard() {
  const card = document.getElementById("geneSideCard");
  if (card) card.hidden = true;
}

// ─── API publique ─────────────────────────────────────────────────────────────

export function focusGeneRabbit(ctx, rabbitId) {
  if (!G) return;
  G.focusId = rabbitId;
  hideSideCard();
  // Orienter la caméra vers le nœud
  const node = G.nodeMap.get(rabbitId);
  if (node) {
    // Lerp rapide vers la position du nœud (simplifiée : reset à une vue centrée)
    G.rotX = -0.2;
    G.rotY = 0;
    G.zoom = 1.2;
    markInteraction(G);
  }
  // Afficher le badge de mode focus
  const badge = document.getElementById("geneFocusBadge");
  if (badge) { badge.hidden = false; badge.textContent = `Mode focus : ${ctx.state.rabbits.find(r => r.id === rabbitId)?.name || ""}`; }
}

export function resetGenealogyFocus(ctx) {
  if (!G) return;
  G.focusId = null;
  hideSideCard();
  G.rotX = -0.25; G.rotY = 0; G.zoom = 1;
  markInteraction(G);
  const badge = document.getElementById("geneFocusBadge");
  if (badge) badge.hidden = true;
}

export function destroyGenealogy3D() {
  if (!G) return;
  if (G.raf) cancelAnimationFrame(G.raf);
  G.listeners.forEach(({ el, type, fn }) => el.removeEventListener(type, fn));
  if (G.stageEl) G.stageEl.innerHTML = "";
  G = null;
}

export function renderGenealogy3D(ctx) {
  const stageEl = document.getElementById("geneGraph");
  if (!stageEl) return;

  if (!ctx.state.rabbits.length) {
    destroyGenealogy3D();
    stageEl.innerHTML = `<div class="muted" style="padding:24px;text-align:center">Ajoute des lapins pour voir la généalogie 3D.</div>`;
    hideSideCard();
    return;
  }

  const key = _dataKey(ctx.state);

  if (G && G.stageEl === stageEl && G._dataKey === key) {
    // Données inchangées — mettre à jour ctx et la recherche uniquement
    G.ctx = ctx;
    return;
  }

  // Reconstruire si data a changé ou premier init
  destroyGenealogy3D();
  initEngine(ctx, stageEl);
}
