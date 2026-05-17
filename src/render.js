import { escapeHTML, escapeAttr, formatDate, rabbitStatusBadge, sexLabel, daysBetween, getRabbitStage, stageBadge } from "./utils.js";
import { estimateRabbitValue, formatCurrency, getSettings } from "./settingsService.js";
import { getReproInfo, getReproInfoFromIndex, buildLatestEventIndex } from "./repro.js";
import { getBreedingStatus, breedingStatusBadge } from "./breeding.js";
import { getRabbitWeightHistory, getTotalHerdWeightEvolution, renderWeightSVG, getCurrentWeight, buildCurrentWeightIndex } from "./weightService.js";
import { getLitterStatsForDoe, formatEventDetails } from "./litters.js";
import { buildLots, lotBadge, LOT_STATUSES } from "./lots.js";
// genealogy3d.js : ~80 kB de logique 3D, chargé à la demande (panneau Généalogie)
import { getReminders, reminderLabel } from "./health.js";
import { getPhotoHistory, getProfilePhoto, rabbitThumbHTML } from "./photos.js";
import { getTodayFarmActions } from "./farmActionsService.js";
import { renderStats } from "./stats.js";
import { renderStock } from "./renderStock.js";
import { renderBuildings } from "./renderBuildings.js";
import { getTodayRoundSummary } from "./roundService.js";
import { formatPerformedBy } from "./membersService.js";
import { renderSettings } from "./renderSettings.js";
import { renderOrders } from "./renderOrders.js";
import { sortByCage } from "./cageSort.js";
import { getWeightExtremes } from "./weightSearch.js";



export function renderDashboard(ctx) {
  const { state, el } = ctx;

  const total = state.rabbits.length;
  const actifs = state.rabbits.filter(r => r.status === "actif").length;
  const femelles = state.rabbits.filter(r => r.sex === "F" && r.status === "actif").length;
  const males = state.rabbits.filter(r => r.sex === "M" && r.status === "actif").length;

  const todayISO = new Date().toISOString().slice(0,10);

  const { overdue, upcoming } = getReminders(state, { windowDays: getSettings(ctx).healthReminderWindowDays });

  const recent7 = state.events.filter(e => {
    const diff = daysBetween(e.date, todayISO);
    return diff >= 0 && diff <= 7;
  }).length;

  // Index pré-calculé pour éviter O(rabbits × events) : la version naïve
  // appelait getReproInfo() pour chaque femelle, et chaque appel scannait
  // tous les events. À 1000 lapins / 5000 events, c'était ~70 s.
  const matingIdx = buildLatestEventIndex(state, "saillie");
  const birthIdx  = buildLatestEventIndex(state, "mise_bas");
  const dueSoon = state.rabbits
    .filter(r => r.sex === "F" && r.status === "actif")
    .map(r => ({ r, info: getReproInfoFromIndex(r, matingIdx, birthIdx) }))
    .filter(x => x.info && x.info.dueDate)
    .map(x => ({ ...x, daysLeft: daysBetween(todayISO, x.info.dueDate) }))
    .filter(x => x.daysLeft >= 0 && x.daysLeft <= 7)
    .sort((a,b) => a.daysLeft - b.daysLeft);

  let farmActionsHTML = '';
  try { farmActionsHTML = _renderFarmActionsCard(ctx); } catch (_) {}

  let dailyTasksHTML = '';
  try { dailyTasksHTML = _renderDailyTasksCard(ctx); } catch (_) {}

  // ── Évaluation du cheptel actif (dernière pesée connue par lapin) ──
  // Utilise les paramètres de la ferme : devise, prix vif/carcasse, rendement.
  // Important : on indexe les pesées une SEULE fois (O(events)) plutôt que
  // d'appeler getRabbitWeightHistory pour chaque lapin (O(rabbits × events)).
  // Sans ça, le dashboard mettait > 100 s avec 1000 lapins / 5000 events.
  const settings = getSettings(ctx);
  const weightIndex = buildCurrentWeightIndex(state);
  let herdValueLive = 0;
  let herdValueCarcass = 0;
  let herdEvaluatedCount = 0;
  for (const r of state.rabbits) {
    if (r.status !== 'actif') continue;
    const lastW = weightIndex.get(r.id);
    if (lastW == null) continue;
    const v = estimateRabbitValue(lastW, settings);
    herdValueLive += v.live;
    herdValueCarcass += v.carcass;
    herdEvaluatedCount += 1;
  }

  // ── Liste mise-bas bientôt
  let dueSoonHTML;
  if (dueSoon.length > 0) {
    const list = dueSoon.slice(0,6).map(x =>
      `<div class="small">• <strong>${escapeHTML(x.r.name)}</strong> (${escapeHTML(x.r.code)}) — mise-bas: <strong>${escapeHTML(x.info.dueDate)}</strong> (J-${x.daysLeft})</div>`
    ).join("");
    dueSoonHTML = `<div style="grid-column:1/-1;margin-top:6px">${list}</div>`;
  } else {
    dueSoonHTML = `<div style="grid-column:1/-1;margin-top:6px" class="small">Aucune mise-bas prévue dans les 7 prochains jours.</div>`;
  }

  // ── Liste rappels urgents (retard + ≤7j)
  const urgent = [...overdue, ...upcoming].slice(0, 6);
  let urgentHTML;
  if (urgent.length > 0) {
    const list = urgent.map(r => `<div class="small">• ${reminderLabel(r)}</div>`).join("");
    urgentHTML = `<div style="grid-column:1/-1;margin-top:6px">${list}</div>`;
  } else {
    urgentHTML = `<div style="grid-column:1/-1;margin-top:6px" class="small">Aucun rappel vaccin/traitement à venir.</div>`;
  }

  // ── Tendance poids cheptel
  const herdEvo    = getTotalHerdWeightEvolution(state);
  const herdPoints = herdEvo.map(p => ({ label: p.date, value: p.totalWeightKg }));
  let herdHTML = "";
  if (herdEvo.length > 0) {
    const first   = herdEvo[0].totalWeightKg;
    const last    = herdEvo[herdEvo.length - 1].totalWeightKg;
    const gain    = last - first;
    const gainStr = `${gain >= 0 ? "+" : ""}${gain.toFixed(2)} kg`;
    const evoLine = herdEvo.length > 1
      ? `<div>Évolution (1ère → dernière pesée):</div><div>${first.toFixed(2)} → ${last.toFixed(2)} kg <strong>(${gainStr})</strong></div>`
      : "";

    // Réutilise l'index pesée pour ne pas re-scanner state.events.
    const rabbitsWeighed = state.rabbits.filter(r => r.status === "actif" && weightIndex.has(r.id)).length;
    const rabbitsActive  = state.rabbits.filter(r => r.status === "actif").length;

    herdHTML = `
      <div style="grid-column:1/-1;margin-top:18px;padding-top:14px;border-top:1px solid #eee">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px">
          <div style="font-weight:700">⚖️ Poids total du cheptel</div>
          <div class="row" style="gap:6px;flex-wrap:wrap">
            <button class="btn secondary" id="btnBudgetSearch" style="font-size:.85rem;padding:4px 12px" title="Trouver un lapin pour le budget d'un client">🎯 Budget client</button>
            <button class="btn secondary" id="btnWeightCheck" style="font-size:.85rem;padding:4px 12px">⚖️ Peser les lapins</button>
          </div>
        </div>
        <div class="kv" style="margin-bottom:10px;max-width:380px">
          <div>Poids total actuel :</div><div><strong>${last.toFixed(2)} kg</strong></div>
          <div>Lapins pris en compte :</div><div>${rabbitsWeighed} / ${rabbitsActive} actifs</div>
          ${evoLine}
        </div>
        ${_renderWeightExtremesCards(ctx)}
        ${renderWeightSVG(herdPoints, { id: "herd", color: "#4f7942" })}
      </div>
    `;
  }

  // KPI tiles + sections, en UN SEUL assignment pour éviter de re-parser le
  // DOM à chaque `innerHTML +=` (≈ 5 re-parses précédemment, perte de plusieurs
  // secondes sur des dashboards riches).
  el.dash.innerHTML = `
    <div class="tile"><div class="n">${total}</div><div class="t">Lapins (total)</div></div>
    <div class="tile"><div class="n">${actifs}</div><div class="t">Actifs</div></div>
    <div class="tile"><div class="n">${femelles}</div><div class="t">Femelles actives</div></div>
    <div class="tile"><div class="n">${males}</div><div class="t">Mâles actifs</div></div>
    <div class="tile"><div class="n">${recent7}</div><div class="t">Événements (7 jours)</div></div>
    <div class="tile"><div class="n">${dueSoon.length}</div><div class="t">Mise-bas bientôt (≤7j)</div></div>
    <div class="tile"><div class="n">${upcoming.length}</div><div class="t">Rappels (≤7j)</div></div>
    <div class="tile"><div class="n">${overdue.length}</div><div class="t">Rappels en retard</div></div>
    <div class="tile"><div class="n">${state.rabbits.filter(r=>r.status==="mort").length}</div><div class="t">Morts</div></div>
    <div class="tile" title="Estimation à partir des dernières pesées (${herdEvaluatedCount}/${actifs} actifs)">
      <div class="n" style="font-size:1.1rem">${formatCurrency(herdValueLive, settings)}</div>
      <div class="t">Valeur vif (cheptel)</div>
    </div>
    <div class="tile" title="Estimation carcasse (${Math.round(settings.carcassYield * 100)}% × ${settings.priceCarcassPerKg.toLocaleString('fr-FR')} ${settings.currencySymbol}/kg)">
      <div class="n" style="font-size:1.1rem">${formatCurrency(herdValueCarcass, settings)}</div>
      <div class="t">Valeur carcasse</div>
    </div>
    ${dailyTasksHTML}
    ${farmActionsHTML}
    ${dueSoonHTML}
    ${urgentHTML}
    ${herdHTML}
  `;
}

// ── Cartes "Plus petit / Plus gros" (consolidées : cheptel + en vente) ───────

function _renderWeightExtremesCards(ctx) {
  const { state } = ctx;
  const all  = getWeightExtremes(state, { forSaleOnly: false });
  const sale = getWeightExtremes(state, { forSaleOnly: true });
  if (!all.lightest && !all.heaviest) return "";

  const settings = getSettings(ctx);

  function _line(item, { showPrice = false } = {}) {
    if (!item) return `<span class="muted">—</span>`;
    const r = item.rabbit;
    const cage = r.cage ? ` · 🏠 ${escapeHTML(r.cage)}` : "";
    const price = showPrice
      ? ` · <strong>${formatCurrency(estimateRabbitValue(item.weightKg, settings).live, settings)}</strong>`
      : "";
    return `
      <button class="linkbtn" data-open-rabbit="${escapeAttr(r.id)}" style="text-align:left">
        <strong>${escapeHTML(r.name)}</strong> (${escapeHTML(r.code)}) — <strong>${item.weightKg.toFixed(2)} kg</strong>${cage}${price}
      </button>`;
  }

  return `
    <div class="weight-extremes" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin:12px 0">
      <div class="section-card" style="padding:10px 12px">
        <div style="font-weight:700;margin-bottom:4px">🐇 Plus petit</div>
        <div class="small" style="margin-bottom:4px">Cheptel : ${_line(all.lightest)}</div>
        <div class="small">🏪 En vente : ${_line(sale.lightest, { showPrice: true })}</div>
      </div>
      <div class="section-card" style="padding:10px 12px">
        <div style="font-weight:700;margin-bottom:4px">🦏 Plus gros</div>
        <div class="small" style="margin-bottom:4px">Cheptel : ${_line(all.heaviest)}</div>
        <div class="small">🏪 En vente : ${_line(sale.heaviest, { showPrice: true })}</div>
      </div>
    </div>
  `;
}


export function renderRabbitList(ctx) {
  const { el } = ctx;
  const rabbits = getFilteredRabbits(ctx);

  if (rabbits.length === 0) {
    el.rabbitList.innerHTML = `<div class="muted">Aucun lapin trouvé.</div>`;
    return;
  }

  // Indexation des pesées + repro en un seul passage pour éviter
  // O(rabbits × events) dans la map ci-dessous (cf. dashboard).
  const weightIndex = buildCurrentWeightIndex(ctx.state);
  const matingIdx   = buildLatestEventIndex(ctx.state, "saillie");
  const birthIdx    = buildLatestEventIndex(ctx.state, "mise_bas");

  el.rabbitList.innerHTML = rabbits.map(r => {
    const active = r.id === ctx.selectedRabbitId ? "active" : "";
    const stage  = getRabbitStage(r);
    const repro  = getReproInfoFromIndex(r, matingIdx, birthIdx);
    const pregnantBadge = repro?.isPregnant ? `<span class="badge accent">🤰</span>` : "";
    const saleBadge = r.forSale ? `<span class="badge" style="background:#f0d28a;color:#7a5a10" title="En vente sur la boutique">🏪</span>` : "";
    const thumb = rabbitThumbHTML(ctx.state, r, { size: 40 });
    const w = weightIndex.get(r.id) ?? null;
    const wTxt = w != null ? `⚖️ ${w.toFixed(2)} kg` : "⚖️ —";
    return `
      <div class="item rl-item ${active}" data-testid="rabbit-item" data-rabbit="${r.id}" style="cursor:pointer;display:flex;align-items:center;gap:10px">
        ${thumb}
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <strong>${escapeHTML(r.code)}</strong>
            <span>${escapeHTML(r.name)}</span>
            <span class="badge">${sexLabel(r.sex)}</span>
            ${stageBadge(stage)}
            ${pregnantBadge}
            ${saleBadge}
            ${rabbitStatusBadge(r.status)}
          </div>
          <div class="small" style="margin-top:2px;color:var(--color-muted)">
            ${escapeHTML(r.breed || "—")} · ${escapeHTML(r.cage || "—")} · ${escapeHTML(formatDate(r.birthDate))} · ${wTxt}
          </div>
        </div>
        <button class="btn ghost rl-event-btn" type="button" data-add-event="${r.id}" title="Nouvel événement" style="flex-shrink:0;padding:4px 8px;font-size:1rem">＋</button>
      </div>
    `;
  }).join("");
}

export function renderRabbitDetails(ctx) {
  const { state, el } = ctx;

  // Toggle classe mobile master/detail
  const panel = document.getElementById("panel-rabbits");
  panel?.classList.toggle("rabbit-selected", !!ctx.selectedRabbitId);

  if (!ctx.selectedRabbitId) {
    const rabbitCount = (state.rabbits || []).length;
    const hint = rabbitCount === 0
      ? `<div class="rl-empty-actions">
          <button class="btn" id="rlEmptyNew">+ Nouveau lapin</button>
          <div class="small muted" style="text-align:center">Aucun lapin enregistré. Démarrez par créer votre premier reproducteur.</div>
        </div>`
      : `<ul class="rl-empty-tips">
          <li>🔍 Rechercher par nom, code ou cage</li>
          <li>📅 Filtrer par sexe ou statut</li>
          <li>➕ Ajouter un événement en un clic depuis la liste</li>
          <li>🏗️ Visualiser les loges depuis le panneau Bâtiments</li>
        </ul>`;
    el.rabbitDetails.innerHTML = `
      <div class="rl-empty-state">
        <div class="rl-empty-icon">🐇</div>
        <div class="rl-empty-text">${rabbitCount === 0 ? "Bienvenue !" : "Sélectionnez un lapin dans la liste"}</div>
        ${hint}
      </div>`;
    document.getElementById("rlEmptyNew")?.addEventListener("click", () => el.btnNewRabbit?.click());
    return;
  }
  const r = state.rabbits.find(x => x.id === ctx.selectedRabbitId);
  if (!r) {
    ctx.selectedRabbitId = null;
    panel?.classList.remove("rabbit-selected");
    el.rabbitDetails.innerHTML = `
      <div class="rl-empty-state">
        <div class="rl-empty-icon">🐇</div>
        <div class="rl-empty-text">Sélectionne un lapin dans la liste<br>pour voir ses détails.</div>
      </div>`;
    return;
  }
  const stage = getRabbitStage(r);
  const todayISO = new Date().toISOString().slice(0, 10);

  const repro = getReproInfo(state, r);
  const breedingInfo = r.status === "actif" ? getBreedingStatus(r, state, todayISO) : null;
  const reproHTML = (repro && repro.dueDate)
    ? `
      <div class="sep"></div>
      <div class="kv">
        <div>Dernière saillie</div><div>${escapeHTML(repro.lastMating?.date || "—")}</div>
        <div>Mise-bas estimée</div><div><strong>${escapeHTML(repro.dueDate)}</strong></div>
      </div>
    ` : "";

  // Nouveau bloc gestation visible
  const gestationHTML = (() => {
    if (!repro?.isPregnant) return "";
    const male = repro.maleId ? state.rabbits.find(m => m.id === repro.maleId) : null;
    const maleTxt = male ? `${escapeHTML(male.name)} (${escapeHTML(male.code)})` : "—";
    const maleContent = male
      ? `<button class="linkbtn" data-open-rabbit="${repro.maleId}">${maleTxt}</button>`
      : "—";
    const jours = repro.dueDate
      ? `(J-${daysBetween(new Date().toISOString().slice(0,10), repro.dueDate)})`
      : "";
    return `
      <div class="sep"></div>
      <div style="background: rgba(201, 164, 76, 0.08); border: 1px solid rgba(201, 164, 76, 0.3); border-radius: 8px; padding: 12px; margin: 12px 0;">
        <div style="font-weight: 700; color: var(--color-accent); margin-bottom: 8px;">🤰 Gestation en cours</div>
        <div class="small">Terme prévu: <strong>${escapeHTML(repro.dueDate || "—")}</strong> ${jours}</div>
        <div class="small">Mâle: ${maleContent}</div>
      </div>
    `;
  })();

  let litterHTML = "";
  if (r.sex === "F") {
    const st = getLitterStatsForDoe(state, r.id);
    if (st.count > 0) {
      litterHTML = `
        <div class="sep"></div>
        <div style="font-weight:700;margin-bottom:6px">Descendance</div>
        <div class="kv">
          <div>Portées:</div><div><strong>${st.count}</strong></div>
          <div>Total nés:</div><div>${st.born}</div>
          <div>Total vivants:</div><div>${st.alive}</div>
          <div>Taux survie:</div><div><strong>${st.survival}%</strong></div>
        </div>
        <div class="small" style="margin-top:4px">${st.activeKits} lapereaux actifs</div>
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
        <div>Mère: </div>
        <div>${mother ? `<button class="linkbtn" data-open-rabbit="${mother.id}">${escapeHTML(mother.name)} (${escapeHTML(mother.code)})</button>` : "—"}</div>
        <div>Père: </div>
        <div>${father ? `<button class="linkbtn" data-open-rabbit="${father.id}">${escapeHTML(father.name)} (${escapeHTML(father.code)})</button>` : "—"}</div>
        <div>Fratrie: </div>
        <div>${r.litterId ? `${siblingsCount} frère(s)/sœur(s)` : "—"}</div>
      </div>
    ` : "";

  // ── Poids individuel ────────────────────────────────────────────────────────
  const weightHistory = getRabbitWeightHistory(state, r.id);
  const weightHTML    = _buildWeightSection(r, weightHistory, todayISO, getSettings(ctx));

  const profilePhoto = getProfilePhoto(state, r.id);
  const allPhotos = getPhotoHistory(state, r.id);

  const avatarHTML = profilePhoto && profilePhoto.dataUrl
    ? `<img class="rabbit-avatar-img" src="${escapeAttr(profilePhoto.dataUrl)}" alt="Photo de ${escapeHTML(r.name)}">`
    : profilePhoto
      ? `<div class="rabbit-avatar-placeholder" title="Photo en attente de synchronisation">⏳</div>`
      : `<div class="rabbit-avatar-placeholder">🐇</div>`;

  // Photos triées chronologiquement pour l'"évolution visuelle" (ASC)
  const photosAsc = [...allPhotos].reverse();
  const photoGridHTML = photosAsc.length > 0
    ? `<div class="photo-grid">
        ${photosAsc.map(p => `
          <div class="photo-grid-item">
            ${p.dataUrl
              ? `<img class="photo-grid-img" src="${escapeAttr(p.dataUrl)}" alt="${escapeHTML(p.date)}" loading="lazy">`
              : `<div class="photo-grid-img photo-grid-pending" title="Photo en attente de synchronisation">⏳</div>`}
            <div class="photo-grid-overlay">
              <div class="photo-grid-label">${escapeHTML(p.date)}</div>
              ${p.note ? `<div class="photo-grid-note">${escapeHTML(p.note)}</div>` : ""}
            </div>
            <button class="photo-grid-del" data-del-photo="${escapeAttr(p.id)}" title="Supprimer cette photo">×</button>
          </div>
        `).join("")}
      </div>`
    : `<div class="small muted" style="margin:6px 0">Aucune photo enregistrée.</div>`;

  const forSaleBtnLabel = r.forSale ? "🏪 En vente ✓" : "🏪 Mettre en vente";
  const forSaleBtnClass = r.forSale ? "btn" : "btn secondary";
  const forSaleBadge = r.forSale
    ? `<span class="badge" style="background:#f0d28a;color:#7a5a10">🏪 En vente</span>`
    : "";

  // Navigation cage suivante / précédente — parcourt tous les lapins triés par
  // cage (A1, A2…B1…). Boucle en fin de liste pour rester accessible.
  const navOrder = sortByCage(state.rabbits || [], x => x.cage);
  const navIdx   = navOrder.findIndex(x => x.id === r.id);
  const prevRabbit = navOrder.length > 1 ? navOrder[(navIdx - 1 + navOrder.length) % navOrder.length] : null;
  const nextRabbit = navOrder.length > 1 ? navOrder[(navIdx + 1) % navOrder.length] : null;
  const navBarHTML = (prevRabbit || nextRabbit) ? `
    <div class="rabbit-nav-bar">
      ${prevRabbit ? `
        <button class="btn secondary" id="btnPrevRabbit" data-prev-rabbit="${escapeAttr(prevRabbit.id)}" title="Cage précédente">
          ← Précédent
          <span class="rabbit-nav-cage">🏠 ${escapeHTML(prevRabbit.cage || '—')} · ${escapeHTML(prevRabbit.name)}</span>
        </button>` : ''}
      ${nextRabbit ? `
        <button class="btn" id="btnNextRabbit" data-next-rabbit="${escapeAttr(nextRabbit.id)}" title="Cage suivante">
          Suivant →
          <span class="rabbit-nav-cage">🏠 ${escapeHTML(nextRabbit.cage || '—')} · ${escapeHTML(nextRabbit.name)}</span>
        </button>` : ''}
    </div>
  ` : '';

  el.rabbitDetails.innerHTML = `
    <div class="row" style="justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:6px">
      <button class="btn secondary" id="btnBack" data-testid="btn-back">← Retour</button>
      <div class="row" style="flex-wrap:wrap;gap:6px">
        <button class="${forSaleBtnClass}" id="btnToggleShop" data-toggle-shop="${escapeAttr(r.id)}" title="Gérer la mise en vente sur la boutique">${forSaleBtnLabel}</button>
        <button class="btn secondary" id="btnEditRabbit">Modifier</button>
        <button class="btn danger" id="btnDeleteRabbit">Supprimer</button>
      </div>
    </div>

    <div class="rabbit-detail-header">
      <div class="rabbit-avatar">${avatarHTML}</div>
      <div class="rabbit-detail-info">
        <div style="font-size:18px;font-weight:900">${escapeHTML(r.name)} <span class="badge">${escapeHTML(r.code)}</span></div>
        <div class="small" style="margin-bottom:4px">${rabbitStatusBadge(r.status)} <span class="badge">${sexLabel(r.sex)}</span> ${forSaleBadge}</div>
      </div>
    </div>

    <div class="sep"></div>

    <div class="kv">
      <div>Race: </div><div>${escapeHTML(r.breed || "—")}</div>
      <div>Naissance: </div><div>${escapeHTML(formatDate(r.birthDate))}</div>
      ${r.birthDate ? `<div>Âge:</div><div>${_ageText(r.birthDate, todayISO)}</div>` : ""}
      <div>Stade: </div><div>${escapeHTML(stage)}</div>
      <div>Cage: </div><div>${(() => {
        const lodge = (state.lodges || []).find(l => l.code === r.cage);
        const building = lodge ? (state.buildings || []).find(b => b.id === lodge.buildingId) : null;
        if (!r.cage) return '—';
        if (building) return `${escapeHTML(r.cage)} <span class="small" style="color:var(--color-muted)">· Bâtiment ${escapeHTML(building.letter)}</span>`;
        return escapeHTML(r.cage);
      })()}</div>
      <div>Statut: </div><div>${escapeHTML(r.status)}</div>
      <div>Notes: </div><div>${escapeHTML(r.notes || "—")}</div>
    </div>

    ${breedingInfo ? `
      <div class="sep"></div>
      <div style="font-weight:700;margin-bottom:6px">🐇 Reproduction</div>
      <div class="kv">
        <div>Statut:</div>
        <div>${breedingStatusBadge(breedingInfo.status)}</div>
        <div>Détail:</div>
        <div class="small">${escapeHTML(breedingInfo.reason)}</div>
        ${breedingInfo.availableFrom ? `<div>Disponible le:</div><div><strong>${escapeHTML(breedingInfo.availableFrom)}</strong></div>` : ""}
        ${r.breedingOverride && r.breedingOverride !== "auto" ? `<div>Mode:</div><div class="small" style="color:#888">Renseigné manuellement</div>` : ""}
      </div>
    ` : ""}

    ${reproHTML}
    ${gestationHTML}
    ${litterHTML}
    ${genealogyHTML}

    ${weightHTML}

    <div class="sep"></div>

    <div class="row">
      <button class="btn" id="btnAddEvent" data-testid="btn-add-event">+ Ajouter un événement</button>
    </div>

    <div class="sep"></div>

    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px">
      <div style="font-weight:700">📷 Évolution visuelle (${allPhotos.length} photo${allPhotos.length !== 1 ? "s" : ""})</div>
      <button class="btn secondary" id="btnPhotoCheckSingle" data-rabbit-id="${escapeAttr(r.id)}" style="font-size:.85rem;padding:4px 12px">📷 Ajouter une photo</button>
    </div>
    ${photoGridHTML}
    <label class="btn secondary" style="cursor:pointer;margin-top:8px;display:inline-flex;align-items:center;gap:6px;display:none">
      <input type="file" id="inputProfilePhoto" accept="image/*" style="display:none">
    </label>

    ${navBarHTML}
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
      ${events.map(e => {
        const linkedPhoto = (state.photos || []).find(p => p.eventId === e.id);
        const thumbHTML = linkedPhoto && linkedPhoto.dataUrl
          ? `<img class="event-photo-thumb" src="${escapeAttr(linkedPhoto.dataUrl)}" alt="Photo" loading="lazy" title="Photo du ${escapeHTML(linkedPhoto.date)}">`
          : linkedPhoto
            ? `<span class="event-photo-thumb event-photo-pending" title="Photo en attente">⏳</span>`
            : "";
        const byTxt = formatPerformedBy(e.performedBy);
        const byBadge = byTxt ? `<span class="badge" title="Auteur de l'action">${escapeHTML(byTxt)}</span>` : "";
        return `
          <div class="item">
            <div style="flex:1">
              <div><strong>${escapeHTML(types[e.type] || e.type)}</strong> <span class="badge">${escapeHTML(e.date)}</span> ${byBadge}</div>
              <div class="small">${escapeHTML(formatEventDetails(e))}</div>
              ${thumbHTML ? `<div style="margin-top:6px">${thumbHTML}</div>` : ""}
            </div>
            <div>
              <button class="btn danger" data-del-event="${e.id}">Suppr.</button>
            </div>
          </div>
        `;
      }).join("")}
    </div>
    <div class="sep"></div>
    <button class="btn" id="btnAddEvent2" data-testid="btn-add-event-2">+ Ajouter un événement</button>
  `;
}

export function renderAll(ctx) {
  const active = ctx.activePanel || 'dashboard';

  // Dashboard : toujours rendu (tuiles, actions, courbe poids)
  try { renderDashboard(ctx); } catch(e) { console.error("[renderDashboard]", e); }

  // Lapins : uniquement si le panneau est actif
  if (active === 'rabbits') {
    try { renderRabbitList(ctx); } catch(e) { console.error("[renderRabbitList]", e); }
    try { renderRabbitDetails(ctx); } catch(e) { console.error("[renderRabbitDetails]", e); }
    try { renderEventsPanel(ctx); } catch(e) { console.error("[renderEventsPanel]", e); }
  }

  // Lots : uniquement si le panneau est actif
  if (active === 'lots') {
    try { renderLots(ctx); } catch(e) { console.error("[renderLots]", e); }
  }

  // Panneaux lourds : rendus uniquement quand actifs
  if (active === 'genealogy') {
    import("./genealogy3d.js")
      .then(m => { try { m.renderGenealogy3D(ctx); } catch (e) { console.error("[renderGenealogy3D]", e); } })
      .catch(e => console.error("[lazy genealogy3d]", e));
  }
  if (active === 'stats') {
    try { renderStats(ctx); } catch(e) { console.error("[renderStats]", e); }
  }
  if (active === 'magasin') {
    try { renderStock(ctx); } catch(e) { console.error("[renderStock]", e); }
  }
  if (active === 'batiments') {
    try { renderBuildings(ctx); } catch(e) { console.error("[renderBuildings]", e); }
  }
  if (active === 'settings') {
    try { renderSettings(ctx); } catch(e) { console.error("[renderSettings]", e); }
  }
  if (active === 'orders') {
    try { renderOrders(ctx); } catch(e) { console.error("[renderOrders]", e); }
  }
}

function _buildWeightSection(r, history, _todayISO, _rabbitSettings) {
  const isActive = r.status === "actif";
  const points = history.map(w => ({ label: w.date, value: w.weightKg }));
  const current = history.length > 0 ? history[history.length - 1] : null;
  const first   = history.length > 1 ? history[0] : null;

  let statsHTML = "";
  if (current) {
    const gainTotal = first ? (current.weightKg - first.weightKg) : null;
    const days      = first ? daysBetween(first.date, current.date) : 0;
    const avgPerDay = (gainTotal !== null && days > 0) ? gainTotal / days : null;

    const gainStr = gainTotal !== null
      ? `${gainTotal >= 0 ? "+" : ""}${gainTotal.toFixed(3)} kg`
      : null;
    const avgStr = avgPerDay !== null
      ? `${avgPerDay >= 0 ? "+" : ""}${(avgPerDay * 1000).toFixed(1)} g/j`
      : null;

    const value = estimateRabbitValue(current.weightKg, _rabbitSettings);
    const valueHTML = `
      <div class="sep"></div>
      <div style="font-weight:700;margin:8px 0 4px">💰 Évaluation</div>
      <div class="kv">
        <div>Vif (${_rabbitSettings.priceLivePerKg.toLocaleString('fr-FR')} ${_rabbitSettings.currencySymbol}/kg):</div><div><strong>${formatCurrency(value.live, _rabbitSettings)}</strong></div>
        <div>Carcasse estimée (${Math.round(_rabbitSettings.carcassYield * 100)}% × ${_rabbitSettings.priceCarcassPerKg.toLocaleString('fr-FR')} ${_rabbitSettings.currencySymbol}/kg):</div><div><strong>${formatCurrency(value.carcass, _rabbitSettings)}</strong> <span class="small muted">(${value.carcassWeightKg.toFixed(2)} kg)</span></div>
      </div>`;

    statsHTML = `
      <div class="kv" style="margin-bottom:10px">
        <div>Poids actuel:</div><div><strong>${current.weightKg.toFixed(3)} kg</strong></div>
        ${gainStr ? `<div>Gain total:</div><div>${gainStr}</div>` : ""}
        ${avgStr  ? `<div>Gain moyen:</div><div>${avgStr}</div>` : ""}
        <div>Pesées enregistrées:</div><div>${history.length}</div>
      </div>${valueHTML}`;
  }

  // Historique condensé (max 5 dernières pesées)
  const recent = history.slice().reverse().slice(0, 5);
  const histHTML = recent.length > 0
    ? `<div style="margin-top:8px">
        <div class="small muted" style="margin-bottom:4px">Dernières pesées</div>
        <div style="display:flex;flex-direction:column;gap:3px">
          ${recent.map(w => `
            <div style="display:flex;justify-content:space-between;font-size:.85rem;padding:4px 6px;background:#f9f9f7;border-radius:6px">
              <span style="color:#666">${formatDate(w.date)}</span>
              <strong>${w.weightKg.toFixed(3)} kg</strong>
            </div>`).join("")}
        </div>
      </div>`
    : `<div class="muted small">Aucune pesée enregistrée.</div>`;

  const addBtn = isActive
    ? `<button class="btn secondary" data-quick-weight="${escapeAttr(r.id)}" style="font-size:.85rem;margin-top:10px">⚖️ Ajouter une pesée</button>`
    : "";

  return `
    <div class="sep"></div>
    <div style="font-weight:700;margin-bottom:8px">⚖️ Évolution du poids</div>
    ${statsHTML}
    ${points.length > 0 ? renderWeightSVG(points, { id: r.id.replace(/[^a-z0-9]/gi, "x"), color: "#2e7d7a", height: 170 }) : ""}
    ${histHTML}
    ${addBtn}
  `;
}

// ── "Aujourd'hui dans la ferme" card ──────────────────────────────────────────

function _renderFarmActionsCard(ctx) {
  const today = new Date().toISOString().slice(0, 10);
  const { urgent, today: todayList, opportunities, total, summary } = getTodayFarmActions(ctx.state, today, getSettings(ctx));

  if (total === 0) {
    return `
      <div class="farm-actions-card" id="farmActionsCard" style="grid-column:1/-1">
        <div class="farm-actions-header">
          <span class="farm-actions-title">📋 Aujourd'hui dans la ferme</span>
          <span class="farm-actions-ok">✅ Tout est à jour !</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="farm-actions-card" id="farmActionsCard" style="grid-column:1/-1">
      <div class="farm-actions-header">
        <span class="farm-actions-title">📋 Aujourd'hui dans la ferme</span>
        <span class="farm-actions-summary">${escapeHTML(summary)}</span>
      </div>
      ${urgent.length > 0 ? _farmSectionHTML('urgent', '🔴 Urgent', urgent, true) : ''}
      ${todayList.length > 0 ? _farmSectionHTML('today', "🟡 À faire aujourd'hui", todayList, urgent.length === 0) : ''}
      ${opportunities.length > 0 ? _farmSectionHTML('opportunity', '🟢 Opportunités', opportunities, false) : ''}
    </div>
  `;
}

const FARM_SECTION_DEFAULT_LIMIT = 5;
// Cap absolu pour éviter de générer plusieurs centaines de KB de HTML
// au premier rendu quand un éleveur a 1000+ lapins jamais pesés ou jamais
// photographiés. Au-delà, on indique le total mais on n'affiche que les
// premiers — l'éleveur traite par paquets de toute façon.
const FARM_SECTION_HIDDEN_CAP = 30;

function _farmSectionHTML(key, title, actions, open) {
  const limit = FARM_SECTION_DEFAULT_LIMIT;
  const hasMore = actions.length > limit;
  const visible = hasMore ? actions.slice(0, limit) : actions;
  const hiddenAll = hasMore ? actions.slice(limit) : [];
  const hidden = hiddenAll.slice(0, FARM_SECTION_HIDDEN_CAP);
  const overflow = hiddenAll.length - hidden.length;
  return `
    <details class="farm-section farm-section-${key}" ${open ? 'open' : ''}>
      <summary class="farm-section-header">
        ${escapeHTML(title)} <span class="farm-section-count">${actions.length}</span>
      </summary>
      <div class="farm-section-list" data-farm-section="${escapeAttr(key)}">
        ${visible.map(_farmActionCardHTML).join('')}
        ${hidden.length ? `<div class="farm-section-extra" hidden>${hidden.map(_farmActionCardHTML).join('')}</div>` : ''}
        ${hidden.length ? `<button class="btn ghost farm-section-toggle" type="button" data-farm-section-toggle="${escapeAttr(key)}">Voir les ${hidden.length} autre(s) ▾</button>` : ''}
        ${overflow > 0 ? `<div class="small muted" style="margin-top:6px">+${overflow} actions supplémentaires non affichées (traitez les premières d'abord).</div>` : ''}
      </div>
    </details>
  `;
}

function _farmActionCardHTML(a) {
  return `
    <div class="farm-action-card" data-farm-action-id="${escapeAttr(a.id)}">
      <span class="farm-action-icon">${a.icon}</span>
      <div class="farm-action-body">
        <div class="farm-action-label">${escapeHTML(a.label)}</div>
        <div class="farm-action-meta">${escapeHTML(a.meta)}</div>
      </div>
      <div class="farm-action-btns">
        <button class="btn farm-action-treat"
          data-farm-treat="${escapeAttr(a.id)}"
          data-farm-action="${escapeAttr(a.action)}"
          data-farm-rabbit="${escapeAttr(a.rabbitId || '')}">Traiter</button>
        <button class="btn ghost farm-action-dismiss"
          data-farm-dismiss="${escapeAttr(a.id)}">Ignorer</button>
      </div>
    </div>
  `;
}

// ── Carte "Tâches du jour" : eau, nourriture, nettoyage ──────────────────────
function _renderDailyTasksCard(ctx) {
  const summary = getTodayRoundSummary(ctx.state);
  const total = (ctx.state.rabbits || []).filter(r => r.status === 'actif').length;

  const lineWater = _dailyTaskLine({
    icon: '💧',
    name: 'Eau',
    done: !!summary?.water,
    statusDone: '✓ distribuée',
    statusTodo: '— non distribuée',
    by: summary?.waterBy,
  });
  const lineFood = _dailyTaskLine({
    icon: '🌾',
    name: 'Nourriture',
    done: !!summary && summary.fedCount > 0,
    statusDone: summary ? `${summary.fedCount}/${summary.total || total} nourris` : '— aucun',
    statusTodo: '— aucun lapin nourri',
    by: summary?.feedBy,
  });
  const lineClean = _dailyTaskLine({
    icon: '🧹',
    name: 'Nettoyage',
    done: !!summary?.cleaning,
    statusDone: '✓ effectué',
    statusTodo: '— non fait',
    by: summary?.cleaningBy,
  });

  return `
    <div class="farm-actions-card" id="dailyTasksCard" style="grid-column:1/-1">
      <div class="farm-actions-header">
        <span class="farm-actions-title">🗓 Tâches du jour</span>
        <button class="btn secondary" id="btnOpenTournee" style="font-size:.8rem;padding:4px 12px">Ouvrir la tournée</button>
      </div>
      <div class="daily-tasks-list" style="display:flex;flex-direction:column;gap:6px;margin-top:8px">
        ${lineWater}${lineFood}${lineClean}
      </div>
    </div>
  `;
}

function _dailyTaskLine({ icon, name, done, statusDone, statusTodo, by }) {
  const dot = done ? '✓' : '○';
  const dotColor = done ? '#4f7942' : '#c0392b';
  const status = done ? statusDone : statusTodo;
  const byTxt = done ? formatPerformedBy(by) : '';
  return `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#f9f9f7;border-radius:8px">
      <span style="font-size:1.2rem">${icon}</span>
      <span style="flex:1;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <strong>${escapeHTML(name)}</strong>
        <span class="small" style="color:#555">${escapeHTML(status)}</span>
        ${byTxt ? `<span class="badge" title="Auteur de l'action">${escapeHTML(byTxt)}</span>` : ''}
      </span>
      <span style="color:${dotColor};font-weight:700">${dot}</span>
    </div>
  `;
}

function _ageText(birthDate, today) {
  const days = daysBetween(birthDate, today);
  if (days >= 365) {
    const years = Math.floor(days / 365);
    const months = Math.floor((days % 365) / 30);
    return months > 0 ? `${years} an(s) ${months} mois (${days}j)` : `${years} an(s) (${days}j)`;
  }
  if (days >= 30) return `${Math.floor(days / 30)} mois (${days}j)`;
  if (days >= 7)  return `${Math.floor(days / 7)} semaine(s) (${days}j)`;
  return `${days} jour(s)`;
}

function getFilteredRabbits(ctx) {
  const { state, el } = ctx;
  const q = (el.q.value || "").toLowerCase().trim();
  const sex = el.sexFilter.value;
  const status = el.statusFilter.value;
  const wMinRaw = el.weightMin?.value;
  const wMaxRaw = el.weightMax?.value;
  const wMin = wMinRaw === "" || wMinRaw == null ? null : Number(wMinRaw);
  const wMax = wMaxRaw === "" || wMaxRaw == null ? null : Number(wMaxRaw);
  const sortBy = el.sortBy?.value || "cage";

  let list = state.rabbits.filter(r => {
    if (sex && r.sex !== sex) return false;
    if (status && r.status !== status) return false;
    if (q) {
      // Recherche limitée aux champs visibles documentés : code, nom, race, cage.
      // (les notes/statut/stade créaient des faux positifs — cf. rapport QA bug #5)
      const hay = [r.code, r.name, r.breed, r.cage].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    // Filtre fourchette de poids : exige une pesée connue dans [min, max].
    // Lapins jamais pesés exclus dès qu'au moins une borne est posée.
    if (Number.isFinite(wMin) || Number.isFinite(wMax)) {
      const w = getCurrentWeight(state, r.id);
      if (w == null) return false;
      if (Number.isFinite(wMin) && w < wMin) return false;
      if (Number.isFinite(wMax) && w > wMax) return false;
    }
    return true;
  });

  // Tri
  if (sortBy === "name") {
    list = [...list].sort((a, b) => (a.name || "").localeCompare(b.name || "", "fr"));
  } else if (sortBy === "birth") {
    list = [...list].sort((a, b) => (b.birthDate || "").localeCompare(a.birthDate || ""));
  } else if (sortBy === "weight-asc" || sortBy === "weight-desc") {
    const dir = sortBy === "weight-desc" ? -1 : 1;
    // Lapins pesés triés par poids, puis lapins jamais pesés en fin.
    const withW = [];
    const withoutW = [];
    for (const r of list) {
      const w = getCurrentWeight(state, r.id);
      if (w == null) withoutW.push(r);
      else withW.push({ r, w });
    }
    withW.sort((a, b) => dir * (a.w - b.w));
    list = [...withW.map(x => x.r), ...withoutW];
  } else {
    // 'cage' (défaut)
    list = sortByCage(list, r => r.cage);
  }
  return list;
}

function getFilteredLots(ctx, lots) {
  const q = (ctx.el.lotQ?.value || "").toLowerCase().trim();
  const statusFilter = ctx.el.lotStatusFilter?.value || "";

  return lots.filter(l => {
    if (statusFilter && l.status !== statusFilter) return false;
    if (!q) return true;
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
      // Si pas de cage de destination, on affiche le nom de la mère comme
      // libellé principal plutôt qu'un "—" peu lisible.
      const primary = l.cage && l.cage !== "—" ? l.cage : l.doeName;
      const parents = l.buckName
        ? `${escapeHTML(l.doeName)} × ${escapeHTML(l.buckName)}`
        : `${escapeHTML(l.doeName)} (${escapeHTML(l.doeCode)})`;
      return `
        <div class="item ${active}" data-testid="lot-item" data-lot="${l.id}">
          <div>
            <div><strong>${escapeHTML(primary)}</strong> — ${escapeHTML(formatDate(l.date))}</div>
            <div class="small">${parents}</div>
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
    const rabbits = selected.rabbitIds?.map(id => state.rabbits.find(r => r.id === id)).filter(Boolean) || [];
    const rabbitsList = rabbits.length > 0
      ? `<div class="list" style="margin-top: 12px;">
          ${rabbits.map(r => `
            <div class="item">
              <div>
                <div><strong>${escapeHTML(r.code)}</strong> — ${escapeHTML(r.name)}</div>
                <div class="small">Sexe: ${sexLabel(r.sex)} · Stage: ${stageBadge(getRabbitStage(r))}</div>
              </div>
              <div>
                <button class="btn ghost" data-open-rabbit="${r.id}">Voir</button>
              </div>
            </div>
          `).join("")}
        </div>`
      : `<div class="small muted">Aucun lapereau trouvé dans ce lot.</div>`;

    const statusOptions = Object.entries(LOT_STATUSES)
      .map(([k, v]) => `<option value="${k}"${k === selected.status ? " selected" : ""}>${escapeHTML(v.label)}</option>`)
      .join("");

    el.lotDetails.innerHTML = `
      <div style="font-size:18px;font-weight:900">${escapeHTML(selected.cage)} <span class="badge">${escapeHTML(selected.date)}</span></div>
      <div class="sep"></div>
      <div class="kv">
        <div>Sevrés: </div><div><strong>${escapeHTML(String(selected.weaned))}</strong></div>
        <div>Mère: </div><div>${escapeHTML(selected.doeName)} (${escapeHTML(selected.doeCode)})</div>
        <div>Statut: </div><div><select id="lotStatusSelect" class="input" style="padding:2px 6px;height:auto" data-testid="lot-status-select">${statusOptions}</select></div>
        <div>Notes: </div><div>${escapeHTML(selected.notes || "—")}</div>
      </div>
      <div class="sep"></div>
      <div style="font-weight:700;margin-bottom:6px">${rabbits.length} lapereaux du lot</div>
      ${rabbitsList}
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
