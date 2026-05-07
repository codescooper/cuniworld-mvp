/**
 * src/genealogy3d.js — Arbre généalogique 2D interactif (pan / zoom)
 * Layout hiérarchique, bezier curves, aucune dépendance externe.
 */

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── Construction du graphe ────────────────────────────────── (API stable pour les tests)

export function buildGenealogyGraph(state) {
  const rabbits = state.rabbits || [];
  if (!rabbits.length) return { nodes: [], edges: [] };

  const rabbitMap = new Map(rabbits.map(r => [r.id, r]));
  const parentToChildren = new Map();
  const childToParents = new Map();

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

  // Positions 3D conservées pour compatibilité API (tests unitaires)
  const maxGen = Math.max(0, ...genMap.values());
  const centerY = (maxGen * 180) / 2;
  const SPREAD_X = 220, SPREAD_Y = 200, SPREAD_Z = 180;

  function pseudoRandom(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return (h >>> 0) / 0xffffffff;
  }

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

// ─── Constantes de layout 2D ──────────────────────────────────────

const NW = 162; // largeur nœud
const NH = 66;  // hauteur nœud
const GX = 44;  // écart horizontal entre nœuds
const GY = 108; // écart vertical entre générations
const MARGIN = 48;

// ─── Layout hiérarchique 2D ───────────────────────────────────────

function computeLayout(nodes, edges) {
  if (!nodes.length) return { positions: new Map(), totalW: 0, totalH: 0, maxGen: 0 };

  const childrenOf = new Map(); // parentId → [childId]
  const parentsOf  = new Map(); // childId  → [parentId]
  edges.forEach(e => {
    if (!childrenOf.has(e.from)) childrenOf.set(e.from, []);
    childrenOf.get(e.from).push(e.to);
    if (!parentsOf.has(e.to)) parentsOf.set(e.to, []);
    parentsOf.get(e.to).push(e.from);
  });

  const maxGen = Math.max(0, ...nodes.map(n => n.generation));
  const pos = new Map(nodes.map(n => [n.id, { x: 0, y: MARGIN + n.generation * (NH + GY) }]));

  // Grouper par génération
  const byGen = Array.from({ length: maxGen + 1 }, (_, g) =>
    nodes.filter(n => n.generation === g)
  );

  // Tri initial par famille pour minimiser les croisements
  for (let g = 1; g <= maxGen; g++) {
    byGen[g].sort((a, b) => {
      const ax = _avgParentX(parentsOf.get(a.id) || [], pos);
      const bx = _avgParentX(parentsOf.get(b.id) || [], pos);
      if (Math.abs(ax - bx) > 1) return ax - bx;
      const ka = (a.rabbit?.litterId || "") + a.id;
      const kb = (b.rabbit?.litterId || "") + b.id;
      return ka.localeCompare(kb);
    });
  }

  // Placement uniforme initial
  byGen.forEach(genNodes => {
    genNodes.forEach((n, i) => { pos.get(n.id).x = MARGIN + i * (NW + GX); });
  });

  // Convergence itérative (4 passes)
  for (let pass = 0; pass < 4; pass++) {
    // Top-down : centrer enfants sous leurs parents
    for (let g = 1; g <= maxGen; g++) {
      byGen[g].forEach(n => {
        const ppos = (parentsOf.get(n.id) || []).map(id => pos.get(id)).filter(Boolean);
        if (ppos.length) pos.get(n.id).x = _mean(ppos.map(p => p.x + NW / 2)) - NW / 2;
      });
      _resolveOverlaps(byGen[g], pos);
    }
    // Bottom-up : centrer parents sur leurs enfants
    for (let g = maxGen - 1; g >= 0; g--) {
      byGen[g].forEach(n => {
        const cpos = (childrenOf.get(n.id) || []).map(id => pos.get(id)).filter(Boolean);
        if (cpos.length) pos.get(n.id).x = _mean(cpos.map(c => c.x + NW / 2)) - NW / 2;
      });
      _resolveOverlaps(byGen[g], pos);
    }
  }

  // Normaliser : décaler vers x=MARGIN
  let minX = Infinity;
  pos.forEach(p => { if (p.x < minX) minX = p.x; });
  const shift = MARGIN - minX;
  pos.forEach(p => { p.x += shift; });

  let maxX = 0, maxY = 0;
  nodes.forEach(n => {
    const p = pos.get(n.id);
    if (p.x + NW + MARGIN > maxX) maxX = p.x + NW + MARGIN;
    if (p.y + NH + MARGIN > maxY) maxY = p.y + NH + MARGIN;
  });

  return { positions: pos, totalW: maxX, totalH: maxY, maxGen };
}

function _avgParentX(ids, pos) {
  if (!ids.length) return 0;
  return ids.reduce((s, id) => s + (pos.get(id)?.x ?? 0) + NW / 2, 0) / ids.length;
}
function _mean(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }
function _resolveOverlaps(genNodes, pos) {
  genNodes.sort((a, b) => pos.get(a.id).x - pos.get(b.id).x);
  for (let i = 1; i < genNodes.length; i++) {
    const prev = pos.get(genNodes[i - 1].id);
    const curr = pos.get(genNodes[i].id);
    if (curr.x < prev.x + NW + GX) curr.x = prev.x + NW + GX;
  }
}

// ─── Singleton d'état ─────────────────────────────────────────────

let G = null;

// ─── Initialisation ───────────────────────────────────────────────

function initEngine(ctx, stageEl) {
  const { nodes, edges } = buildGenealogyGraph(ctx.state);
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const { positions, totalW, totalH, maxGen } = computeLayout(nodes, edges);

  stageEl.innerHTML = "";

  // Canvas transformé (toutes coordonnées en référence à ce div)
  const canvas = document.createElement("div");
  canvas.className = "gene-canvas";
  canvas.style.cssText = `position:absolute;width:${totalW}px;height:${totalH}px;transform-origin:0 0`;
  stageEl.appendChild(canvas);

  // Bandes de génération
  for (let g = 0; g <= maxGen; g++) {
    const y0 = MARGIN + g * (NH + GY) - GY / 2;
    const h  = NH + GY;
    const lane = document.createElement("div");
    lane.className = `gene-lane${g % 2 === 1 ? " gene-lane--alt" : ""}`;
    lane.style.cssText = `position:absolute;left:0;width:${totalW}px;top:${Math.max(0, y0)}px;height:${h}px`;
    canvas.appendChild(lane);
    const lbl = document.createElement("div");
    lbl.className = "gene-gen-label";
    lbl.textContent = `Gén. ${g}`;
    lbl.style.cssText = `position:absolute;left:8px;top:${Math.max(4, y0 + 4)}px`;
    canvas.appendChild(lbl);
  }

  // SVG pour les arêtes (sous les nœuds)
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "gene-svg-overlay");
  svg.style.cssText = `position:absolute;top:0;left:0;width:${totalW}px;height:${totalH}px;overflow:visible;pointer-events:none`;
  canvas.appendChild(svg);

  // Arêtes bezier
  const edgeEls = new Map();
  edges.forEach(edge => {
    const fp = positions.get(edge.from);
    const tp = positions.get(edge.to);
    if (!fp || !tp) return;
    const x1 = fp.x + NW / 2, y1 = fp.y + NH;
    const x2 = tp.x + NW / 2, y2 = tp.y;
    const midY = y1 + (y2 - y1) * 0.55;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", `gene-edge gene-edge--${edge.type}`);
    path.setAttribute("fill", "none");
    path.setAttribute("d", `M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`);
    svg.appendChild(path);
    edgeEls.set(`${edge.from}__${edge.to}`, path);
  });

  // Nœuds
  const nodeEls = new Map();
  nodes.forEach(node => {
    const p = positions.get(node.id);
    const statusCls = node.status !== "actif" ? ` gene-status-${node.status}` : "";
    const el = document.createElement("div");
    el.className = `gene-node gene-sex-${node.sex.toLowerCase()}${statusCls}`;
    el.setAttribute("tabindex", "0");
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", `${node.label}${node.cage ? ", cage " + node.cage : ""}`);
    el.dataset.nodeId = node.id;
    el.style.cssText = `position:absolute;left:${p.x}px;top:${p.y}px;width:${NW}px`;
    const breed = node.rabbit.breed ? node.rabbit.breed.substring(0, 16) : "";
    el.innerHTML = `<div class="gene-node-inner">
      <div class="gene-node-label">${esc(node.label)}</div>
      <div class="gene-node-sub">${esc(node.cage)}${breed ? " · " + esc(breed) : ""}</div>
    </div>`;
    canvas.appendChild(el);
    nodeEls.set(node.id, el);
  });

  // Tooltip (hors canvas pour ne pas être mis à l'échelle)
  const tooltip = document.createElement("div");
  tooltip.className = "gene-tooltip";
  tooltip.hidden = true;
  tooltip.setAttribute("aria-live", "polite");
  stageEl.appendChild(tooltip);

  G = {
    ctx, stageEl, canvas, svg, tooltip,
    nodes, edges, nodeMap, nodeEls, edgeEls, positions,
    totalW, totalH, maxGen,
    tx: 0, ty: 0, zoom: 1,
    dragging: false, lastMx: 0, lastMy: 0,
    focusId: null, hoverId: null, searchQ: "",
    listeners: [],
    _dataKey: _dataKey(ctx.state),
    _fitted: false,
  };

  _fitAll(G, false);
  wireEvents(G);
}

function _dataKey(state) {
  return (state.rabbits || []).map(r => r.id).join(",");
}

// ─── Pan / Zoom ───────────────────────────────────────────────────

function _applyTransform(g, animate) {
  g.canvas.style.transition = animate
    ? "transform 0.28s cubic-bezier(.25,.46,.45,.94)"
    : "none";
  g.canvas.style.transform = `translate(${g.tx}px,${g.ty}px) scale(${g.zoom})`;
}

function _fitAll(g, animate) {
  const rect = g.stageEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return; // panneau pas encore visible
  const scaleX = (rect.width  - 16) / g.totalW;
  const scaleY = (rect.height - 16) / g.totalH;
  g.zoom = Math.min(scaleX, scaleY, 1.4) * 0.94;
  g.tx = (rect.width  - g.totalW * g.zoom) / 2;
  g.ty = (rect.height - g.totalH * g.zoom) / 2;
  _applyTransform(g, animate);
  g._fitted = true;
}

function _centerOn(g, nodeId, animate = true) {
  const p = g.positions.get(nodeId);
  if (!p) return;
  const rect = g.stageEl.getBoundingClientRect();
  // Zoom confortable : entre 0.9 et 1.6
  const z = Math.max(0.9, Math.min(g.zoom < 0.5 ? 1.2 : g.zoom, 1.6));
  g.zoom = z;
  g.tx = rect.width  / 2 - (p.x + NW / 2) * z;
  g.ty = rect.height / 2 - (p.y + NH / 2) * z;
  _applyTransform(g, animate);
  g._fitted = true;
}

function _zoomAt(g, factor, cx, cy) {
  const newZoom = Math.max(0.12, Math.min(4, g.zoom * factor));
  g.tx = cx - (cx - g.tx) * (newZoom / g.zoom);
  g.ty = cy - (cy - g.ty) * (newZoom / g.zoom);
  g.zoom = newZoom;
  _applyTransform(g, false);
}

// ─── Highlight / recherche ────────────────────────────────────────

function _updateHighlight(g) {
  const focusNode = g.focusId ? g.nodeMap.get(g.focusId) : null;
  const focusSet = focusNode
    ? new Set([g.focusId, ...focusNode.parentIds, ...focusNode.childIds, ...focusNode.siblingIds])
    : null;
  const q = (g.searchQ || "").toLowerCase().trim();

  g.nodes.forEach(node => {
    const el = g.nodeEls.get(node.id);
    if (!el) return;
    const isFocus = node.id === g.focusId;
    const dimmed  = focusSet ? !focusSet.has(node.id) : false;
    const matched = q && (
      node.label.toLowerCase().includes(q) ||
      node.cage.toLowerCase().includes(q) ||
      (node.rabbit.code  || "").toLowerCase().includes(q) ||
      (node.rabbit.breed || "").toLowerCase().includes(q)
    );
    el.classList.toggle("gene-node--focus",   isFocus);
    el.classList.toggle("gene-node--dimmed",  dimmed);
    el.classList.toggle("gene-node--matched", !!matched && !dimmed);
  });

  g.edges.forEach(edge => {
    const path = g.edgeEls.get(`${edge.from}__${edge.to}`);
    if (!path) return;
    const dimmed = focusSet && !focusSet.has(edge.from) && !focusSet.has(edge.to);
    path.style.opacity = dimmed ? "0.04" : "";
  });
}

// ─── Câblage événements ───────────────────────────────────────────

function on(g, el, type, fn, opts) {
  el.addEventListener(type, fn, opts);
  g.listeners.push({ el, type, fn });
}

function wireEvents(g) {
  const stage = g.stageEl;
  let _dragMoved = false;

  // ── Pan souris ──
  on(g, stage, "mousedown", e => {
    if (e.button !== 0) return;
    g.dragging = true; _dragMoved = false;
    g.lastMx = e.clientX; g.lastMy = e.clientY;
    stage.style.cursor = "grabbing";
  });
  on(g, window, "mousemove", e => {
    if (!g.dragging) return;
    const dx = e.clientX - g.lastMx, dy = e.clientY - g.lastMy;
    if (Math.abs(dx) + Math.abs(dy) > 3) _dragMoved = true;
    g.tx += dx; g.ty += dy;
    g.lastMx = e.clientX; g.lastMy = e.clientY;
    _applyTransform(g, false);
  });
  on(g, window, "mouseup", () => { g.dragging = false; stage.style.cursor = ""; });

  // ── Zoom molette (centré sur le pointeur) ──
  on(g, stage, "wheel", e => {
    e.preventDefault();
    const rect = stage.getBoundingClientRect();
    _zoomAt(g, e.deltaY > 0 ? 0.9 : 1.11, e.clientX - rect.left, e.clientY - rect.top);
  }, { passive: false });

  // ── Tactile : 1 doigt = pan, 2 doigts = pinch-zoom ──
  let prevDist = 0, prevMidX = 0, prevMidY = 0;
  on(g, stage, "touchstart", e => {
    if (e.touches.length === 1) {
      g.dragging = true; _dragMoved = false;
      g.lastMx = e.touches[0].clientX; g.lastMy = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      g.dragging = false;
      const [t0, t1] = e.touches;
      prevDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      prevMidX = (t0.clientX + t1.clientX) / 2;
      prevMidY = (t0.clientY + t1.clientY) / 2;
    }
  }, { passive: true });
  on(g, stage, "touchmove", e => {
    if (e.touches.length === 1 && g.dragging) {
      const dx = e.touches[0].clientX - g.lastMx, dy = e.touches[0].clientY - g.lastMy;
      if (Math.abs(dx) + Math.abs(dy) > 3) _dragMoved = true;
      g.tx += dx; g.ty += dy;
      g.lastMx = e.touches[0].clientX; g.lastMy = e.touches[0].clientY;
      _applyTransform(g, false);
    } else if (e.touches.length === 2 && prevDist > 0) {
      const [t0, t1] = e.touches;
      const d = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      const midX = (t0.clientX + t1.clientX) / 2;
      const midY = (t0.clientY + t1.clientY) / 2;
      const rect = stage.getBoundingClientRect();
      const cx = midX - rect.left, cy = midY - rect.top;
      _zoomAt(g, d / prevDist, cx, cy);
      g.tx += midX - prevMidX; g.ty += midY - prevMidY;
      prevDist = d; prevMidX = midX; prevMidY = midY;
    }
  }, { passive: true });
  on(g, stage, "touchend", e => {
    if (e.touches.length === 0) { g.dragging = false; prevDist = 0; }
  });

  // ── Survol nœud : tooltip ──
  on(g, stage, "mouseover", e => {
    const nodeEl = e.target.closest("[data-node-id]");
    if (!nodeEl) return;
    const id = nodeEl.dataset.nodeId;
    if (id !== g.hoverId) { g.hoverId = id; showTooltip(g, id, nodeEl); }
  });
  on(g, stage, "mouseout", e => {
    const nodeEl = e.target.closest("[data-node-id]");
    if (!nodeEl) return;
    if (!e.relatedTarget?.closest?.("[data-node-id]")) {
      g.hoverId = null;
      setTimeout(() => { if (!g.tooltip.matches?.(":hover")) g.tooltip.hidden = true; }, 120);
    }
  });
  on(g, stage, "mousemove", e => { if (g.hoverId && !g.dragging) positionTooltip(g, e); });

  // ── Clics nœuds ──
  let clickTimer = null, pendingClickId = null;
  on(g, stage, "click", e => {
    if (_dragMoved) { _dragMoved = false; return; }
    const nodeEl = e.target.closest("[data-node-id]");
    if (!nodeEl) { hideSideCard(); return; }
    if (e.detail >= 2) return;
    pendingClickId = nodeEl.dataset.nodeId;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => { if (pendingClickId) showSideCard(g, pendingClickId); pendingClickId = null; }, 220);
  });
  on(g, stage, "dblclick", e => {
    clearTimeout(clickTimer); pendingClickId = null;
    const nodeEl = e.target.closest("[data-node-id]");
    if (!nodeEl) return;
    e.preventDefault();
    focusGeneRabbit(g.ctx, nodeEl.dataset.nodeId);
  });

  // ── Clavier : navigation et raccourcis ──
  on(g, stage, "keydown", e => {
    if (e.key === "Escape") { resetGenealogyFocus(g.ctx); g.tooltip.hidden = true; hideSideCard(); return; }
    if (e.key === "+" || e.key === "=") { e.preventDefault(); _zoomBy(g,  1.2); return; }
    if (e.key === "-")                   { e.preventDefault(); _zoomBy(g, 0.83); return; }
    if (e.key === "0")                   { e.preventDefault(); _fitAll(g, true); return; }
    const nodeEl = e.target.closest("[data-node-id]");
    if (!nodeEl) return;
    const id = nodeEl.dataset.nodeId;
    if (e.key === "Enter") { clearTimeout(clickTimer); showSideCard(g, id); }
    if (e.key === "f" || e.key === "F") focusGeneRabbit(g.ctx, id);
  });

  // ── Bouton Réinitialiser / Tout afficher ──
  const resetBtn = document.getElementById("geneResetView");
  if (resetBtn) on(g, resetBtn, "click", () => resetGenealogyFocus(g.ctx));

  // ── Recherche ──
  const qInput = document.getElementById("geneQ");
  if (qInput) {
    on(g, qInput, "input", () => { g.searchQ = qInput.value || ""; _updateHighlight(g); });
    g.searchQ = qInput.value || "";
  }

  // ── Délégation globale (sidecard / tooltip boutons) ──
  on(g, document, "click", e => {
    const showCard = e.target.closest("[data-gene-show-card]");
    if (showCard) { e.stopPropagation(); showSideCard(g, showCard.dataset.geneShowCard); return; }
    const openRabbit = e.target.closest("[data-gene-open-rabbit]");
    if (openRabbit) {
      const rid = openRabbit.dataset.geneOpenRabbit;
      if (rid && g.ctx.navigate) { g.ctx.selectedRabbitId = rid; g.ctx.navigate("rabbits"); }
    }
    const centerRabbit = e.target.closest("[data-gene-center]");
    if (centerRabbit) { e.stopPropagation(); _centerOn(g, centerRabbit.dataset.geneCenter); }
  });
}

function _zoomBy(g, factor) {
  const rect = g.stageEl.getBoundingClientRect();
  _zoomAt(g, factor, rect.width / 2, rect.height / 2);
  g.canvas.style.transition = "transform 0.18s ease";
}

// ─── Tooltip ─────────────────────────────────────────────────────

function showTooltip(g, id, anchorEl) {
  const node = g.nodeMap.get(id);
  if (!node) return;
  const r = node.rabbit;
  const rabbits = g.ctx.state.rabbits;
  const mother = rabbits.find(x => x.id === (r.doeId || r.motherId));
  const father = rabbits.find(x => x.id === (r.buckId || r.fatherId));
  const sexLabel = { F: "Femelle", M: "Mâle", U: "Inconnu" }[r.sex] || r.sex;

  g.tooltip.innerHTML = `
    <div class="gene-tooltip-title">${esc(r.name)} <span class="badge">${esc(r.code || "")}</span></div>
    <div class="gene-tooltip-grid">
      <span>Sexe</span><span>${esc(sexLabel)}</span>
      <span>Cage</span><span>${esc(r.cage || "—")}</span>
      <span>Race</span><span>${esc(r.breed || "—")}</span>
      <span>Naissance</span><span>${esc(r.birthDate || "—")}</span>
      <span>Statut</span><span>${esc(r.status || "—")}</span>
      <span>Mère</span><span>${mother ? esc(mother.name) : "—"}</span>
      <span>Père</span><span>${father ? esc(father.name) : "—"}</span>
      <span>Descendants</span><span>${node.childIds.length}</span>
    </div>
    <button class="btn gene-tooltip-btn" data-gene-show-card="${esc(id)}">Voir plus</button>`;
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
  const tw = t.offsetWidth || 230, th = t.offsetHeight || 200;
  let left = cx + 18, top = cy - 14;
  if (left + tw > stage.width  - 8) left = cx - tw - 18;
  if (top  + th > stage.height - 8) top  = stage.height - th - 8;
  t.style.left = `${Math.max(4, left)}px`;
  t.style.top  = `${Math.max(4, top)}px`;
}

// ─── Side card ───────────────────────────────────────────────────

function showSideCard(g, id) {
  const node = g.nodeMap.get(id);
  if (!node) return;
  const r = node.rabbit;
  const rabbits = g.ctx.state.rabbits;
  const mother = rabbits.find(x => x.id === (r.doeId || r.motherId));
  const father = rabbits.find(x => x.id === (r.buckId || r.fatherId));
  const children = node.childIds.map(cid => rabbits.find(x => x.id === cid)).filter(Boolean);
  const sexLabel = { F: "Femelle 🐇", M: "Mâle 🐇", U: "Inconnu" }[r.sex] || r.sex;
  const statusBadge = r.status === "actif" ? "ok" : r.status === "vendu" ? "warning" : "muted";

  const parentLink = p =>
    p ? `<span class="gene-sidecard-link" data-gene-show-card="${esc(p.id)}">${esc(p.name)}</span>` : "—";

  const childrenHTML = children.length
    ? children.map(c => `
        <div class="gene-sidecard-child">
          <span data-gene-show-card="${esc(c.id)}" style="cursor:pointer">${esc(c.name)}</span>
          <span class="badge">${esc(c.code || "")}</span>
          <button class="btn ghost" style="margin-left:auto;padding:2px 8px;font-size:11px" data-gene-center="${esc(c.id)}">↗</button>
        </div>`).join("")
    : "";

  const card = document.getElementById("geneSideCard");
  if (!card) return;
  card.innerHTML = `
    <div class="gene-sidecard-header">
      <div class="gene-sidecard-name">${esc(r.name)}</div>
      <div><span class="badge">${esc(r.code || "")}</span> <span class="badge ${statusBadge}">${esc(r.status || "—")}</span></div>
    </div>
    <div class="gene-sidecard-body">
      <div class="kv">
        <div>Sexe</div><div>${esc(sexLabel)}</div>
        <div>Race</div><div>${esc(r.breed || "—")}</div>
        <div>Cage</div><div>${esc(r.cage || "—")}</div>
        <div>Naissance</div><div>${esc(r.birthDate || "—")}</div>
        <div>Mère</div><div>${parentLink(mother)}</div>
        <div>Père</div><div>${parentLink(father)}</div>
        ${r.notes ? `<div>Notes</div><div>${esc(r.notes)}</div>` : ""}
      </div>
      ${children.length ? `<div class="gene-sidecard-section">Descendants (${children.length})</div>${childrenHTML}` : ""}
    </div>
    <div class="gene-sidecard-actions">
      <button class="btn" data-gene-open-rabbit="${esc(id)}">Ouvrir la fiche</button>
      <button class="btn secondary" id="_geneFocusBtn">Focus arbre</button>
      <button class="btn ghost gene-sidecard-close">×</button>
    </div>`;
  card.hidden = false;

  card.querySelector("#_geneFocusBtn")?.addEventListener("click", () => focusGeneRabbit(g.ctx, id));
  card.querySelector(".gene-sidecard-close")?.addEventListener("click", hideSideCard);
}

function hideSideCard() {
  const card = document.getElementById("geneSideCard");
  if (card) card.hidden = true;
}

// ─── API publique ─────────────────────────────────────────────────

export function focusGeneRabbit(ctx, rabbitId) {
  if (!G) return;
  G.focusId = rabbitId;
  hideSideCard();
  _centerOn(G, rabbitId, true);
  _updateHighlight(G);
  const badge = document.getElementById("geneFocusBadge");
  const name = ctx.state.rabbits.find(r => r.id === rabbitId)?.name || "";
  if (badge) { badge.hidden = false; badge.textContent = `Focus : ${name} · double-clic ou F sur un nœud`; }
}

export function resetGenealogyFocus(ctx) {
  if (!G) return;
  G.focusId = null;
  hideSideCard();
  G.tooltip.hidden = true;
  _fitAll(G, true);
  _updateHighlight(G);
  const badge = document.getElementById("geneFocusBadge");
  if (badge) badge.hidden = true;
}

export function destroyGenealogy3D() {
  if (!G) return;
  G.listeners.forEach(({ el, type, fn }) => el.removeEventListener(type, fn));
  if (G.stageEl) G.stageEl.innerHTML = "";
  G = null;
}

export function renderGenealogy3D(ctx) {
  const stageEl = document.getElementById("geneGraph");
  if (!stageEl) return;

  if (!ctx.state.rabbits.length) {
    destroyGenealogy3D();
    stageEl.innerHTML = `<div class="muted" style="padding:32px;text-align:center">Ajoutez des lapins pour voir l'arbre généalogique.</div>`;
    hideSideCard();
    return;
  }

  const key = _dataKey(ctx.state);

  if (G && G.stageEl === stageEl && G._dataKey === key) {
    G.ctx = ctx;
    // Ajuster la vue si le panneau vient de devenir visible
    if (!G._fitted) {
      const rect = stageEl.getBoundingClientRect();
      if (rect.width > 0) _fitAll(G, false);
    }
    return;
  }

  destroyGenealogy3D();
  initEngine(ctx, stageEl);
}
