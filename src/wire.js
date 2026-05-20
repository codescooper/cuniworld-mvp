import { openModal, closeModal } from "./modal.js";
import { escapeHTML, escapeAttr, generateRabbitCode, num, numOrNull } from "./utils.js";
import { addRabbit, updateRabbit, deleteRabbit, addEvent, deleteEvent, addPhoto, deletePhoto, trackCloudWrite, addKitsToLitter, declareLotLoss, assignLotLodges, applyBulkEvent, applyBulkEdit } from "./actions.js";
import { buildLots, DEATH_CAUSES } from "./lots.js";
import { DB } from "./db.js";
import { compressImage } from "./photos.js";
import { isNameFromPool, isNameAvailable, isNameUsedByLivingRabbit, suggestAvailableRabbitName } from "./rabbitNameService.js";
import { openWeightCheckModal } from "./weightCheck.js";
import { openPhotoCheckModal, openSinglePhotoModal } from "./photoCheck.js";
import { dismissActionForToday } from "./farmActionsService.js";
import { showToast, showConfirm } from "./notifications.js";
import { actorSelectHTML } from "./membersService.js";
import { openTourneeModal } from "./renderTournee.js";
import { getSettings, formatCurrency, estimateRabbitValue } from "./settingsService.js";
import { getRabbitsByBudget } from "./weightSearch.js";


// wireStatic — called ONCE at startup on elements that exist in the static HTML.
// Never attach listeners here to elements rendered by render() — they won't exist yet.
export function wireStatic(ctx) {
  const { el, Store } = ctx;

  ctx.el.lotQ?.addEventListener("input", () => ctx.render());
  ctx.el.lotStatusFilter?.addEventListener("change", () => ctx.render());

  el.btnNewRabbit.addEventListener("click", () => {
    openModal(el, "Nouveau lapin", rabbitFormHTML(null, ctx.state));
    wireRabbitForm(ctx, null);
  });

  el.btnExport.addEventListener("click", () => {
    const json = Store.exportJSON(ctx.state);
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cuniworld_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    // laisser le temps au navigateur de démarrer le téléchargement
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  });

  el.fileImport.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      ctx.state = Store.importJSON(text);
      ctx.selectedRabbitId = null;
      ctx.render();
      showToast("Import réussi.", "success");
    } catch (err) {
      showToast("Import échoué : " + (err?.message || err), "error");
    } finally {
      el.fileImport.value = "";
    }
  });

  el.btnReset.addEventListener("click", async () => {
    const ok = await showConfirm({ title: "Réinitialiser", message: "Tout supprimer ? (lapins + événements)", confirmLabel: "Supprimer", cancelLabel: "Annuler", danger: true });
    if (!ok) return;
    ctx.state = Store.reset();
    ctx.selectedRabbitId = null;
    ctx.render();
  });

  el.q.addEventListener("input", () => ctx.render());
  el.sexFilter.addEventListener("change", () => { ctx.render(); _updateActiveFiltersBadge(); });
  el.statusFilter.addEventListener("change", () => { ctx.render(); _updateActiveFiltersBadge(); });
  el.weightMin?.addEventListener("input", () => { ctx.render(); _updateActiveFiltersBadge(); });
  el.weightMax?.addEventListener("input", () => { ctx.render(); _updateActiveFiltersBadge(); });
  el.sortBy?.addEventListener("change", () => { ctx.render(); _updateActiveFiltersBadge(); });
  el.geneQ?.addEventListener("input", () => ctx.render());

  // Toggle d'affichage des filtres avancés. Le champ recherche `#q` reste
  // toujours visible — seuls les filtres complémentaires (sexe, statut,
  // poids, tri) sont masqués par défaut pour libérer la vue.
  const btnToggleFilters = document.getElementById("btnToggleFilters");
  const advancedFilters  = document.getElementById("rlAdvancedFilters");
  const btnCloseFilters  = document.getElementById("btnCloseFilters");
  const btnResetFilters  = document.getElementById("btnResetFilters");
  function _setFiltersOpen(open) {
    if (!advancedFilters || !btnToggleFilters) return;
    advancedFilters.hidden = !open;
    btnToggleFilters.setAttribute("aria-expanded", open ? "true" : "false");
  }
  btnToggleFilters?.addEventListener("click", () => {
    _setFiltersOpen(advancedFilters?.hidden ?? true);
  });
  btnCloseFilters?.addEventListener("click", () => _setFiltersOpen(false));

  // Mode sélection multiple (traitement par lot)
  const btnSelectMode = document.getElementById("btnSelectMode");
  btnSelectMode?.addEventListener("click", () => {
    ctx.selectionMode = !ctx.selectionMode;
    if (!(ctx.selectedIds instanceof Set)) ctx.selectedIds = new Set();
    if (!ctx.selectionMode) ctx.selectedIds.clear();
    btnSelectMode.setAttribute("aria-pressed", ctx.selectionMode ? "true" : "false");
    ctx.render();
  });
  btnResetFilters?.addEventListener("click", () => {
    el.sexFilter.value = "";
    el.statusFilter.value = "";
    if (el.weightMin) el.weightMin.value = "";
    if (el.weightMax) el.weightMax.value = "";
    if (el.sortBy) el.sortBy.value = "cage";
    ctx.render();
    _updateActiveFiltersBadge();
  });

  function _updateActiveFiltersBadge() {
    const badge = document.getElementById("rlActiveFiltersBadge");
    if (!badge) return;
    let n = 0;
    if (el.sexFilter?.value)     n++;
    if (el.statusFilter?.value)  n++;
    if (el.weightMin?.value)     n++;
    if (el.weightMax?.value)     n++;
    if (el.sortBy?.value && el.sortBy.value !== "cage") n++;
    if (n > 0) { badge.textContent = String(n); badge.hidden = false; }
    else       { badge.hidden = true; }
  }
  _updateActiveFiltersBadge();

  // modal
  el.modalClose.addEventListener("click", () => closeModal(el));
  el.modal.addEventListener("click", (e) => {
    if (e.target?.dataset?.close === "1") closeModal(el);
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el.modal.classList.contains("hidden")) closeModal(el);
  });
  // NOTE: lot click, btnOpenDoe, lotStatusSelect sont des éléments rendus dynamiquement
  // → câblés dans wireDynamic(), pas ici.
}

// wireDynamic — called after every render() to re-attach listeners to freshly
// injected DOM. Must be idempotent: the previous DOM is replaced so old listeners
// are already garbage-collected; no need to explicitly remove them.
export function wireDynamic(ctx) {
  const { el } = ctx;

  if (!(ctx.selectedIds instanceof Set)) ctx.selectedIds = new Set();
  const _setSel = (id, on) => { if (on) ctx.selectedIds.add(id); else ctx.selectedIds.delete(id); };

  el.rabbitList.querySelectorAll("[data-rabbit]").forEach(node => {
    node.addEventListener("click", () => {
      const id = node.dataset.rabbit;
      if (ctx.selectionMode) {
        _setSel(id, !ctx.selectedIds.has(id));
        ctx.render();
        return;
      }
      ctx.selectedRabbitId = id;
      ctx.selectedGeneRabbitId = id;
      ctx.render();
    });
  });

  // Cases à cocher (mode sélection) — stoppe la propagation pour gérer l'état soi-même.
  el.rabbitList.querySelectorAll(".rl-check").forEach(cb => {
    cb.addEventListener("click", (e) => {
      e.stopPropagation();
      _setSel(cb.dataset.check, cb.checked);
      ctx.render();
    });
  });

  // Barre d'actions groupées (traitement par lot)
  if (ctx.selectionMode) {
    document.getElementById("rlSelectAll")?.addEventListener("click", () => {
      el.rabbitList.querySelectorAll("[data-rabbit]").forEach(n => ctx.selectedIds.add(n.dataset.rabbit));
      ctx.render();
    });
    document.getElementById("rlSelectNone")?.addEventListener("click", () => {
      ctx.selectedIds.clear();
      ctx.render();
    });
    document.getElementById("rlBulkExit")?.addEventListener("click", () => {
      ctx.selectionMode = false;
      ctx.selectedIds.clear();
      document.getElementById("btnSelectMode")?.setAttribute("aria-pressed", "false");
      ctx.render();
    });
    document.getElementById("rlBulkEvent")?.addEventListener("click", () => {
      if (ctx.selectedIds.size) openBulkEventModal(ctx, [...ctx.selectedIds]);
    });
    document.getElementById("rlBulkEdit")?.addEventListener("click", () => {
      if (ctx.selectedIds.size) openBulkEditModal(ctx, [...ctx.selectedIds]);
    });
  }

  document.querySelectorAll("[data-open-rabbit]").forEach(node => {
    node.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = node.dataset.openRabbit;
      if (!id) return;
      ctx.selectedRabbitId = id;
      ctx.selectedGeneRabbitId = id;
      ctx.render();
    });
  });

  document.querySelectorAll("[data-add-event]").forEach(node => {
    node.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = node.dataset.addEvent;
      if (!id) return;
      ctx.selectedRabbitId = id;
      ctx.selectedGeneRabbitId = id;
      ctx.render();
      openModal(el, "Ajouter un événement", eventFormHTML("autre", ctx));
      wireEventForm(ctx);
    });
  });

  // Bouton "Peser les lapins" depuis le dashboard
  const btnWeightCheck = document.getElementById("btnWeightCheck");
  if (btnWeightCheck) {
    btnWeightCheck.addEventListener("click", () => openWeightCheckModal(ctx));
  }

  // Bouton "🎯 Budget client" depuis le dashboard
  const btnBudgetSearch = document.getElementById("btnBudgetSearch");
  if (btnBudgetSearch) {
    btnBudgetSearch.addEventListener("click", () => openBudgetSearchModal(ctx));
  }

  // Bouton "Ouvrir la tournée" depuis la carte Tâches du jour
  const btnOpenTournee = document.getElementById("btnOpenTournee");
  if (btnOpenTournee) {
    btnOpenTournee.addEventListener("click", () => openTourneeModal(ctx));
  }

  // Carte "Aujourd'hui dans la ferme" — Traiter / Ignorer
  wireFarmActions(ctx);

  // Bouton "Ajouter une photo" depuis la fiche lapin
  const btnPhotoSingle = document.getElementById("btnPhotoCheckSingle");
  if (btnPhotoSingle) {
    btnPhotoSingle.addEventListener("click", () => {
      const id = btnPhotoSingle.dataset.rabbitId;
      if (id) openSinglePhotoModal(ctx, id);
    });
  }

  // Bouton "Ajouter une pesée" depuis la section poids de la fiche
  document.querySelectorAll("[data-quick-weight]").forEach(node => {
    node.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = node.dataset.quickWeight;
      if (!id) return;
      ctx.selectedRabbitId = id;
      openModal(el, "Peser ce lapin", eventFormHTML("pesée", ctx));
      wireEventForm(ctx);
    });
  });

  document.querySelectorAll("[data-gene-focus]").forEach(node => {
    node.addEventListener("click", () => {
      const id = node.dataset.geneFocus;
      if (!id) return;
      ctx.selectedGeneRabbitId = id;
      ctx.selectedRabbitId = id;
      ctx.render();
    });
  });

  const btnBack = document.getElementById("btnBack");
  if (btnBack) {
    btnBack.addEventListener("click", () => {
      ctx.selectedRabbitId = null;
      ctx.render();
    });
  }

  // Navigation cage précédente / suivante depuis la fiche lapin
  document.querySelectorAll("[data-prev-rabbit], [data-next-rabbit]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.prevRabbit || btn.dataset.nextRabbit;
      if (!id) return;
      ctx.selectedRabbitId = id;
      ctx.selectedGeneRabbitId = id;
      ctx.render();
      // Remonter en haut de la fiche pour voir le nouveau lapin
      document.querySelector(".rl-right")?.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  const btnEdit = document.getElementById("btnEditRabbit");
  if (btnEdit) {
    btnEdit.addEventListener("click", () => {
      const r = ctx.state.rabbits.find(x => x.id === ctx.selectedRabbitId);
      if (!r) return;
      openModal(el, "Modifier lapin", rabbitFormHTML(r, ctx.state));
      wireRabbitForm(ctx, r);
    });
  }

  // Bouton rapide "Mettre en vente" depuis l'en-tête de la fiche lapin
  const btnToggleShop = document.getElementById("btnToggleShop");
  if (btnToggleShop) {
    btnToggleShop.addEventListener("click", () => {
      const id = btnToggleShop.dataset.toggleShop;
      const r = ctx.state.rabbits.find(x => x.id === id);
      if (!r) return;
      openShopQuickModal(ctx, r);
    });
  }

  // Carnet sanitaire imprimable. CRITIQUE : on ouvre la fenêtre about:blank
  // SYNCHRONIQUEMENT dans le handler — pas d'`await` avant `window.open`,
  // sinon le navigateur considère que ce n'est plus une action utilisateur
  // et bloque le popup. Le lazy import ne tourne qu'APRÈS l'ouverture.
  const btnPrintSanitary = document.getElementById("btnPrintSanitary");
  if (btnPrintSanitary) {
    btnPrintSanitary.addEventListener("click", () => {
      const r = ctx.state.rabbits.find(x => x.id === ctx.selectedRabbitId);
      if (!r) return;
      const w = window.open('about:blank', '_blank', 'width=900,height=1000');
      if (!w) {
        showToast("Le navigateur a bloqué la fenêtre d'impression. Autorisez les popups pour ce site.", "error");
        return;
      }
      try { w.document.write('<!doctype html><meta charset="utf-8"><title>Préparation…</title><p style="font-family:sans-serif;padding:24px">Préparation du carnet sanitaire…</p>'); w.document.close(); } catch (_) {}
      import("./printable.js").then(mod => {
        mod.printSanitaryRecord(ctx.state, r, w);
      }).catch(err => {
        try { w.close(); } catch (_) {}
        showToast("Impossible de générer le carnet : " + (err?.message || err), "error");
      });
    });
  }

  const btnDel = document.getElementById("btnDeleteRabbit");
  if (btnDel) {
    btnDel.addEventListener("click", async () => {
      const r = ctx.state.rabbits.find(x => x.id === ctx.selectedRabbitId);
      if (!r) return;
      const ok = await showConfirm({ title: "Supprimer le lapin", message: `Supprimer ${r.name} (${r.code}) ?`, confirmLabel: "Supprimer", cancelLabel: "Annuler", danger: true });
      if (!ok) return;
      deleteRabbit(ctx, r.id);
    });
  }

  document.querySelectorAll("#btnAddEvent, #btnAddEvent2").forEach((btnAddEvent) => {
    btnAddEvent.addEventListener("click", () => {
      if (!ctx.selectedRabbitId) return;
      openModal(el, "Ajouter un événement", eventFormHTML("autre", ctx));
      wireEventForm(ctx);
    });
  });

  el.eventsPanel.querySelectorAll("[data-del-event]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.delEvent;
      const ok = await showConfirm({ title: "Supprimer l'événement", message: "Supprimer cet événement ?", confirmLabel: "Supprimer", cancelLabel: "Annuler", danger: true });
      if (!ok) return;
      deleteEvent(ctx, id);
    });
  });

  // clic lot
  ctx.el.lotList?.querySelectorAll("[data-lot]").forEach(node => {
    node.addEventListener("click", () => {
      ctx.selectedLotId = node.dataset.lot;
      ctx.render();
    });
  });

  // bouton "voir la mère" depuis détails lot
  const btnOpenDoe = document.getElementById("btnOpenDoe");
  if (btnOpenDoe) {
    btnOpenDoe.addEventListener("click", () => {
      if (!ctx.selectedLotId) return;
      const eventId = ctx.selectedLotId.replace("lot_", "");
      const ev = ctx.state.events.find(e => e.id === eventId);
      if (!ev) return;
      ctx.selectedRabbitId = ev.rabbitId;
      ctx.render();
    });
  }

  // changement de statut d'un lot — câblé ici car #lotStatusSelect est rendu dynamiquement
  const lotStatusSelect = document.getElementById("lotStatusSelect");
  if (lotStatusSelect && ctx.selectedLotId) {
    lotStatusSelect.addEventListener("change", () => {
      const lotId = ctx.selectedLotId;
      const status = lotStatusSelect.value;
      const fid = ctx.farmId || null;
      ctx.state.lotStatuses = { ...(ctx.state.lotStatuses || {}), [lotId]: status };
      ctx.state = ctx.Store.save(ctx.state);
      if (fid) trackCloudWrite(ctx, DB.setLotStatus(fid, lotId, status), { type: 'setLotStatus', payload: { farmId: fid, lotId, status } });
      ctx.render();
    });
  }

  // Actions du lot (boutons rendus dynamiquement dans le détail du lot).
  const _selectedLot = () => buildLots(ctx.state).find(l => l.id === ctx.selectedLotId) || null;
  document.getElementById("btnLotLoss")?.addEventListener("click", () => {
    const lot = _selectedLot(); if (lot) openLotLossModal(ctx, lot);
  });
  document.getElementById("btnLotAddKits")?.addEventListener("click", () => {
    const lot = _selectedLot(); if (lot) openLotAddKitsModal(ctx, lot);
  });
  document.getElementById("btnLotWean")?.addEventListener("click", () => {
    const lot = _selectedLot(); if (lot) openLotWeanModal(ctx, lot);
  });
  document.getElementById("btnLotLodges")?.addEventListener("click", () => {
    const lot = _selectedLot(); if (lot) openLotLodgesModal(ctx, lot);
  });

  // Photo de profil depuis la fiche lapin
  const inputProfilePhoto = document.getElementById("inputProfilePhoto");
  if (inputProfilePhoto && ctx.selectedRabbitId) {
    inputProfilePhoto.addEventListener("change", async () => {
      const file = inputProfilePhoto.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await compressImage(file);
        await addPhoto(ctx, ctx.selectedRabbitId, {
          dataUrl,
          date: new Date().toISOString().slice(0, 10),
          source: "profile",
        });
      } catch (err) {
        showToast("Erreur photo : " + (err?.message || err), "error");
      } finally {
        inputProfilePhoto.value = "";
      }
    });
  }

  // Suppression photo depuis l'historique
  el.rabbitDetails.querySelectorAll("[data-del-photo]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.delPhoto;
      const ok = await showConfirm({ title: "Supprimer la photo", message: "Supprimer cette photo ?", confirmLabel: "Supprimer", cancelLabel: "Annuler", danger: true });
      if (!ok) return;
      deletePhoto(ctx, id);
    });
  });

}

/* -------- Farm Actions wiring -------- */

function wireFarmActions(ctx) {
  // "Ignorer aujourd'hui" — dismiss et re-render
  document.querySelectorAll("[data-farm-dismiss]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      dismissActionForToday(btn.dataset.farmDismiss);
      ctx.render();
    });
  });

  // "Traiter" — route vers le bon module
  document.querySelectorAll("[data-farm-treat]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const action   = btn.dataset.farmAction;
      const rabbitId = btn.dataset.farmRabbit;

      if (action === 'weightCheck') {
        openWeightCheckModal(ctx);
      } else if (action === 'photoCheck') {
        if (rabbitId) openSinglePhotoModal(ctx, rabbitId);
        else openPhotoCheckModal(ctx);
      } else if (action === 'openRabbit' && rabbitId) {
        ctx.selectedRabbitId = rabbitId;
        if (ctx.navigate) {
          ctx.navigate("rabbits");
        } else {
          ctx.render();
        }
      } else if (action === 'openBatiments') {
        if (ctx.navigate) ctx.navigate("batiments");
      }
    });
  });

  // "Voir les N autre(s) ▾" / "Réduire ▴" — pagination locale par section.
  document.querySelectorAll("[data-farm-section-toggle]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const list = btn.parentElement;
      const extra = list?.querySelector(".farm-section-extra");
      if (!extra) return;
      const expanded = !extra.hasAttribute("hidden");
      if (expanded) {
        extra.setAttribute("hidden", "");
        btn.textContent = btn.textContent.replace("Réduire ▴", `Voir les ${extra.children.length} autre(s) ▾`);
      } else {
        extra.removeAttribute("hidden");
        btn.textContent = "Réduire ▴";
      }
    });
  });
}

/* -------- Cage select helper -------- */

function cageSelectHTML(state, currentValue = '', fieldName = 'cage', { optional = false } = {}) {
  const buildings = (state?.buildings || []).slice().sort((a, b) => a.letter.localeCompare(b.letter));
  const lodges    = state?.lodges   || [];
  const rabbits   = state?.rabbits  || [];

  if (!buildings.length) {
    return `<input class="input" name="${escapeAttr(fieldName)}" placeholder="ex: A1" value="${escapeAttr(currentValue)}">`;
  }

  const byCode = new Map();
  for (const r of rabbits) {
    if (r.status !== 'actif') continue;
    const list = byCode.get(r.cage) || [];
    list.push(r);
    byCode.set(r.cage, list);
  }

  const groups = buildings.map(b => {
    const bLodges = lodges
      .filter(l => l.buildingId === b.id)
      .sort((x, y) => x.number - y.number);

    const options = bLodges.map(l => {
      const occupants = byCode.get(l.code) || [];
      const suffix    = occupants.length
        ? occupants.map(r => escapeHTML(r.name || r.code)).join(', ')
        : 'vide';
      const sel = l.code === currentValue ? ' selected' : '';
      return `<option value="${escapeAttr(l.code)}"${sel}>${escapeHTML(l.code)} — ${suffix}</option>`;
    }).join('');

    return `<optgroup label="Bâtiment ${escapeHTML(b.letter)}">${options}</optgroup>`;
  }).join('');

  const emptyLabel  = optional ? '— Aucune —' : '— Choisir une loge —';
  const emptySelect = !currentValue ? ' selected' : '';
  return `<select class="input" name="${escapeAttr(fieldName)}"><option value=""${emptySelect}>${emptyLabel}</option>${groups}</select>`;
}

/* -------- Forms HTML + wiring -------- */

function rabbitFormHTML(rabbit=null, state=null) {
  const r = rabbit || {};
  const allRabbits = state?.rabbits || [];
  const does  = allRabbits.filter(x => x.sex === "F" && x.status === "actif" && x.id !== r.id);
  const bucks = allRabbits.filter(x => x.sex === "M" && x.status === "actif" && x.id !== r.id);
  const currentMotherId = r.motherId || r.doeId || "";
  const currentFatherId = r.fatherId || r.buckId || "";
  const initialStage = (r.stage || "").trim();
  const hasBirthDate = !!((r.birthDate || "").trim());
  const stageFieldDisplay = hasBirthDate ? "none" : "";
  const forSale = !!r.forSale;
  const salePrice = r.salePrice ? String(r.salePrice) : "";
  const shopDescription = r.shopDescription || "";
  const today = new Date().toISOString().slice(0, 10);
  const causeOptions = Object.entries(DEATH_CAUSES)
    .map(([k, v], i) => `<option value="${escapeAttr(k)}"${i === 0 ? " selected" : ""}>${escapeHTML(v)}</option>`)
    .join("");
  return `
    <form id="rabbitForm" class="form">
      <div class="row2">
        <div class="field">
          <div class="label">Code / Identifiant</div>
          <input class="input" name="code" placeholder="ex: CW-F001" value="${escapeAttr(r.code || "")}">
        </div>
        <div class="field">
          <div class="label">Nom</div>
          <div style="display:flex;gap:6px;align-items:center">
            <input class="input" name="name" id="rabbitNameInput" placeholder="ex: Naya" value="${escapeAttr(r.name || "")}" style="flex:1">
            <button type="button" id="btnSuggestName" title="Proposer un nom disponible" style="padding:0 10px;height:38px;border-radius:8px;border:1px solid #ccc;background:#f5f5f0;font-size:1.1rem;cursor:pointer;flex-shrink:0">🎲</button>
          </div>
          <div id="nameBadge" style="min-height:18px;margin-top:3px;font-size:.78rem"></div>
        </div>
      </div>

      <div class="row2">
        <div class="field">
          <div class="label">Sexe</div>
          <select class="input" name="sex">
            <option value="U" ${r.sex==="U"?"selected":""}>Inconnu</option>
            <option value="F" ${r.sex==="F"?"selected":""}>Femelle</option>
            <option value="M" ${r.sex==="M"?"selected":""}>Mâle</option>
          </select>
        </div>
        <div class="field">
          <div class="label">Race</div>
          <input class="input" name="breed" placeholder="ex: Néo-zélandais" value="${escapeAttr(r.breed || "")}">
        </div>
      </div>

      <div class="row2">
        <div class="field">
          <div class="label">Date de naissance</div>
          <input class="input" name="birthDate" id="rabbitBirthDate" type="date" value="${escapeAttr((r.birthDate || "").slice(0,10))}">
        </div>
        <div class="field">
          <div class="label">Cage</div>
          ${cageSelectHTML(state, r.cage || '', 'cage')}
        </div>
      </div>

      <div class="field" id="stageField" style="display:${stageFieldDisplay}">
        <div class="label">Stade <span style="color:var(--color-danger,#c0392b)">*</span></div>
        <select class="input" name="stage" id="rabbitStageSelect">
          <option value="kit"    ${initialStage === "kit"    ? "selected" : ""}>Nouveau-né (lapereau)</option>
          <option value="jeune"  ${initialStage === "jeune"  ? "selected" : ""}>Jeune</option>
          <option value="adulte" ${(!initialStage || initialStage === "adulte") ? "selected" : ""}>Adulte</option>
        </select>
        <div style="font-size:.8rem;color:#888;margin-top:3px">Requis lorsqu'aucune date de naissance n'est renseignée.</div>
      </div>

      ${!rabbit ? `
      <div class="field">
        <div class="label">Poids initial <span style="font-weight:normal;color:var(--color-muted)">(kg, optionnel)</span></div>
        <input class="input" name="initialWeight" type="number" min="0.01" step="0.01" placeholder="ex: 1.25">
      </div>` : ""}

      <div class="field">
        <div class="label">Disponibilité reproduction</div>
        <select class="input" name="breedingOverride">
          <option value="auto"        ${(!r.breedingOverride || r.breedingOverride === "auto")        ? "selected" : ""}>Calculée automatiquement</option>
          <option value="disponible"  ${r.breedingOverride === "disponible"  ? "selected" : ""}>Disponible (forcer)</option>
          <option value="indisponible" ${r.breedingOverride === "indisponible" ? "selected" : ""}>Non disponible (forcer)</option>
        </select>
        <div style="font-size:.8rem;color:#888;margin-top:3px">Utile si la date de naissance est inconnue.</div>
      </div>

      <div class="row2">
        <div class="field">
          <div class="label">Mère (optionnel)</div>
          <select class="input" name="motherId">
            <option value="">Non renseignée</option>
            ${does.map(f => `<option value="${escapeAttr(f.id)}" ${currentMotherId === f.id ? "selected" : ""}>${escapeHTML(f.name)} (${escapeHTML(f.code)})</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <div class="label">Père (optionnel)</div>
          <select class="input" name="fatherId">
            <option value="">Non renseigné</option>
            ${bucks.map(m => `<option value="${escapeAttr(m.id)}" ${currentFatherId === m.id ? "selected" : ""}>${escapeHTML(m.name)} (${escapeHTML(m.code)})</option>`).join("")}
          </select>
        </div>
      </div>

      <div class="field">
        <div class="label">Statut</div>
        <select class="input" name="status">
          <option value="actif" ${r.status==="actif"?"selected":""}>Actif</option>
          <option value="vendu" ${r.status==="vendu"?"selected":""}>Vendu</option>
          <option value="mort" ${r.status==="mort"?"selected":""}>Mort</option>
        </select>
      </div>

      <!-- Précisions de statut : un changement vers Mort/Vendu crée l'événement
           correspondant (cause / prix) pour que les statistiques restent justes. -->
      <div id="statusMortFields" class="field" style="display:none;background:#fdeaea;border:1px solid #e6b8b8;border-radius:8px;padding:10px">
        <div class="label">Cause du décès</div>
        <select class="input" name="deathCause">${causeOptions}</select>
        <div class="label" style="margin-top:6px">Conditions / détails (recommandé)</div>
        <textarea class="input" name="deathCondition" rows="2" placeholder="Symptômes, circonstances observées…"></textarea>
      </div>
      <div id="statusVenteFields" style="display:none;background:#fff8e8;border:1px solid #f0d28a;border-radius:8px;padding:10px;margin-bottom:var(--space-3)">
        <div class="row2">
          <div class="field"><div class="label">Prix de vente</div><input class="input" name="saleEventPrice" type="number" min="0.01" step="0.01" placeholder="ex: 2500"></div>
          <div class="field"><div class="label">Client (optionnel)</div><input class="input" name="saleEventClient" placeholder="ex: Jean Dupont"></div>
        </div>
      </div>
      <div id="statusDateField" class="field" style="display:none">
        <div class="label">Date de l'événement</div>
        <input class="input" type="date" name="statusEventDate" value="${today}">
      </div>

      <div class="field" style="background:#fff8e8;border:1px solid #f0d28a;border-radius:8px;padding:10px">
        <label style="display:flex;align-items:center;gap:8px;font-weight:600;cursor:pointer">
          <input type="checkbox" name="forSale" id="forSaleToggle" ${forSale ? "checked" : ""}>
          🏪 Mettre ce lapin en vente sur la boutique publique
        </label>
        <div id="forSaleFields" style="margin-top:8px;display:${forSale ? "block" : "none"}">
          <div class="field">
            <div class="label">Prix demandé <span class="muted small">(laisser vide pour calcul auto : poids × prix vif)</span></div>
            <input class="input" name="salePrice" type="number" min="0" step="any" placeholder="ex: 12500" value="${escapeAttr(salePrice)}">
          </div>
          <div class="field">
            <div class="label">Description boutique (visible des clients)</div>
            <textarea class="input" name="shopDescription" rows="2" placeholder="Reproducteur sélectionné, vacciné, etc.">${escapeHTML(shopDescription)}</textarea>
          </div>
        </div>
      </div>

      <div class="field">
        <div class="label">Notes</div>
        <textarea class="input" name="notes" placeholder="Observations...">${escapeHTML(r.notes || "")}</textarea>
      </div>

      <div class="field">
        <div class="label">Photo de profil (optionnel)</div>
        <div class="photo-upload-zone">
          <div class="photo-upload-placeholder" id="photoUploadPlaceholder">🐇<br><span>Aucune photo sélectionnée</span></div>
          <img class="photo-upload-preview" id="photoPreviewImg" style="display:none" alt="Aperçu">
          <label class="btn secondary" style="cursor:pointer;margin-top:8px">
            📷 Choisir une photo
            <input type="file" id="inputRabbitPhoto" accept="image/*" style="display:none">
          </label>
          <button type="button" class="btn secondary" id="btnClearRabbitPhoto" style="display:none">Retirer</button>
        </div>
      </div>

      <div class="row" style="justify-content:flex-end">
        <button type="button" class="btn secondary" id="cancelRabbit">Annuler</button>
        <button type="submit" class="btn" data-testid="rabbit-form-submit">${rabbit ? "Enregistrer" : "Créer"}</button>
      </div>
    </form>
  `;
}

function wireRabbitForm(ctx, existingRabbit) {
  const form = document.getElementById("rabbitForm");
  const cancel = document.getElementById("cancelRabbit");
  const codeInput = form?.querySelector('input[name="code"]');
  const sexSelect = form?.querySelector('select[name="sex"]');
  const birthDateInput = document.getElementById("rabbitBirthDate");
  const stageField = document.getElementById("stageField");
  const stageSelect = document.getElementById("rabbitStageSelect");
  cancel?.addEventListener("click", () => closeModal(ctx.el));

  // Affichage conditionnel du champ Stade : visible uniquement quand la date
  // de naissance est vide. Si elle se vide pendant la saisie, on réaffiche.
  const refreshStageVisibility = () => {
    if (!stageField || !birthDateInput) return;
    const hasDate = !!(birthDateInput.value || "").trim();
    stageField.style.display = hasDate ? "none" : "";
  };
  birthDateInput?.addEventListener("input", refreshStageVisibility);
  birthDateInput?.addEventListener("change", refreshStageVisibility);
  refreshStageVisibility();

  // Toggle des champs "À vendre" (prix, description boutique)
  const forSaleToggle = document.getElementById("forSaleToggle");
  const forSaleFields = document.getElementById("forSaleFields");
  forSaleToggle?.addEventListener("change", () => {
    if (forSaleFields) forSaleFields.style.display = forSaleToggle.checked ? "block" : "none";
  });

  // Précisions de statut : visibles seulement pour une transition actif → Mort/Vendu.
  const statusSelect = form?.querySelector('select[name="status"]');
  const oldStatusInit = existingRabbit?.status || "actif";
  const refreshStatusFields = () => {
    const v = statusSelect?.value;
    const transition = oldStatusInit === "actif" && (v === "mort" || v === "vendu");
    const mf = document.getElementById("statusMortFields");
    const vf = document.getElementById("statusVenteFields");
    const df = document.getElementById("statusDateField");
    if (mf) mf.style.display = (transition && v === "mort") ? "" : "none";
    if (vf) vf.style.display = (transition && v === "vendu") ? "" : "none";
    if (df) df.style.display = transition ? "" : "none";
  };
  statusSelect?.addEventListener("change", refreshStatusFields);
  refreshStatusFields();

  // ── Suggestion de nom ───────────────────────────────────────────────────────
  const nameInput  = document.getElementById("rabbitNameInput");
  const suggestBtn = document.getElementById("btnSuggestName");
  const nameBadge  = document.getElementById("nameBadge");

  // Suit si le nom affiché vient d'une suggestion automatique (vs tapé manuellement)
  let isSuggested = false;
  let currentSuggestion = null;

  function showBadge(type) {
    if (!nameBadge) return;
    if (type === "suggest") {
      nameBadge.innerHTML = `<span style="color:#4f7942;font-weight:600">✨ Nom suggéré</span>`;
    } else if (type === "manual") {
      nameBadge.innerHTML = `<span style="color:#888">✏️ Nom manuel</span>`;
    } else {
      nameBadge.innerHTML = "";
    }
  }

  // Dès que l'utilisateur tape lui-même, on sort du mode "suggestion"
  nameInput?.addEventListener("input", () => {
    isSuggested = false;
    currentSuggestion = null;
    showBadge(nameInput.value.trim() ? "manual" : null);
  });

  suggestBtn?.addEventListener("click", async () => {
    const currentValue = (nameInput?.value || "").trim();

    // Si un nom a été tapé manuellement, demander confirmation avant d'écraser
    if (currentValue && !isSuggested) {
      const ok = await showConfirm({ title: "Remplacer le nom", message: `Remplacer "${currentValue}" par un nom suggéré ?`, confirmLabel: "Remplacer", cancelLabel: "Annuler" });
      if (!ok) return;
    }

    const next = suggestAvailableRabbitName(ctx.state, currentSuggestion);
    currentSuggestion = next;
    isSuggested = true;
    if (nameInput) nameInput.value = next;
    showBadge("suggest");
  });

  // Si on édite un lapin et qu'il a déjà un nom du pool, on l'indique
  if (existingRabbit?.name && isNameFromPool(existingRabbit.name)) {
    showBadge("suggest");
  }

  if (codeInput && sexSelect && !existingRabbit) {
    const markManual = () => {
      codeInput.dataset.manual = "1";
    };
    const maybeGenerate = () => {
      if (codeInput.dataset.manual === "1" && codeInput.value.trim() !== "") return;
      const nextCode = generateRabbitCode(ctx.state, sexSelect.value || "U");
      codeInput.value = nextCode;
      codeInput.dataset.manual = "";
    };
    codeInput.addEventListener("input", markManual);
    sexSelect.addEventListener("change", maybeGenerate);
    if (!codeInput.value.trim()) {
      maybeGenerate();
    }
  }

  // Gestion de la photo de profil dans le formulaire
  let selectedPhotoData = null;
  const photoInput = document.getElementById("inputRabbitPhoto");
  const photoPreview = document.getElementById("photoPreviewImg");
  const photoPlaceholder = document.getElementById("photoUploadPlaceholder");
  const clearPhotoBtn = document.getElementById("btnClearRabbitPhoto");

  photoInput?.addEventListener("change", async () => {
    const file = photoInput.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImage(file);
      selectedPhotoData = dataUrl;
      if (photoPreview) { photoPreview.src = dataUrl; photoPreview.style.display = ""; }
      if (photoPlaceholder) photoPlaceholder.style.display = "none";
      if (clearPhotoBtn) clearPhotoBtn.style.display = "";
    } catch (err) {
      showToast("Erreur photo : " + (err?.message || err), "error");
    } finally {
      photoInput.value = "";
    }
  });

  clearPhotoBtn?.addEventListener("click", () => {
    selectedPhotoData = null;
    if (photoPreview) { photoPreview.src = ""; photoPreview.style.display = "none"; }
    if (photoPlaceholder) photoPlaceholder.style.display = "";
    clearPhotoBtn.style.display = "none";
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());
    data.sex = (data.sex || "U").toString();
    data.status = (data.status || existingRabbit?.status || "actif").toString();
    data.birthDate = (data.birthDate || "").toString();
    data.motherId = data.motherId || null;
    data.fatherId = data.fatherId || null;
    data.breedingOverride = data.breedingOverride || "auto";

    // Champs boutique
    data.forSale = !!(form.querySelector('input[name="forSale"]')?.checked);
    if (data.forSale) {
      const priceRaw = parseFloat(data.salePrice);
      data.salePrice = Number.isFinite(priceRaw) && priceRaw > 0 ? priceRaw : null;
      data.shopDescription = (data.shopDescription || "").toString().trim();
    } else {
      data.salePrice = null;
      data.shopDescription = "";
    }

    // Stade : requis quand pas de date de naissance. Quand une date est
    // fournie, on ne stocke pas de stage (laissé au calcul auto par utils.js).
    const stageRaw = (data.stage || "").toString().trim();
    if (!data.birthDate) {
      if (!stageRaw || !["kit", "jeune", "adulte"].includes(stageRaw)) {
        showToast("Sélectionnez un stade (lapereau, jeune ou adulte) car la date de naissance est manquante.", "warn");
        stageSelect?.focus();
        return;
      }
      data.stage = stageRaw;
    } else {
      data.stage = "";
    }

    // ── Validation du nom ─────────────────────────────────────────────────────
    const submittedName = (data.name || "").trim();
    const ownerId = existingRabbit?.id ?? null;

    if (submittedName && isNameFromPool(submittedName)) {
      // Nom Naruto : vérifier qu'il est encore disponible
      if (!isNameAvailable(ctx.state, submittedName, ownerId)) {
        showToast(`"${submittedName}" vient d'être pris par un autre lapin. Choisis-en un autre.`, "warn");
        const next = suggestAvailableRabbitName(ctx.state, submittedName);
        if (nameInput) { nameInput.value = next; }
        currentSuggestion = next;
        isSuggested = true;
        showBadge("suggest");
        return;
      }
    } else if (submittedName) {
      // Nom manuel : avertir si déjà utilisé par un lapin vivant
      if (isNameUsedByLivingRabbit(submittedName, ctx.state.rabbits, ownerId)) {
        const ok = await showConfirm({ title: "Nom déjà utilisé", message: `Un lapin actif s'appelle déjà "${submittedName}". Continuer quand même ?`, confirmLabel: "Continuer", cancelLabel: "Annuler" });
        if (!ok) return;
      }
    }

    // ── Transition de statut → route via événement (cause / prix) ──────────────
    // Toute mise à « Mort » / « Vendu » depuis la fiche crée l'événement
    // correspondant (avec précisions) afin que les statistiques restent justes,
    // exactement comme via le formulaire d'événement ou le traitement par lot.
    const oldStatus = existingRabbit?.status || "actif";
    const newStatus = data.status;
    const toTerminal   = oldStatus === "actif" && (newStatus === "mort" || newStatus === "vendu");
    const reactivating = !!existingRabbit && (oldStatus === "mort" || oldStatus === "vendu") && newStatus === "actif";

    const statusDate = (data.statusEventDate || new Date().toISOString().slice(0, 10)).toString();
    let terminalType = null, terminalData = null, terminalNotes = "";
    if (toTerminal && newStatus === "mort") {
      terminalType = "décès";
      const condition = (data.deathCondition || "").toString().trim();
      terminalData = { cause: (data.deathCause || "inconnu").toString(), condition };
      terminalNotes = condition;
    } else if (toTerminal && newStatus === "vendu") {
      const price = parseFloat(data.saleEventPrice);
      if (!Number.isFinite(price) || price <= 0) {
        showToast("Indique le prix de vente (> 0) pour passer ce lapin en « Vendu ».", "warn");
        return;
      }
      terminalType = "vente";
      terminalData = { price, client: (data.saleEventClient || "").toString().trim() };
    }

    // Champs de précision retirés du patch lapin (ne pas polluer l'objet).
    delete data.deathCause; delete data.deathCondition;
    delete data.saleEventPrice; delete data.saleEventClient; delete data.statusEventDate;

    // L'événement fixera le statut terminal : on garde le lapin actif à l'écriture.
    if (toTerminal) data.status = "actif";

    try {
      let targetId;
      if (existingRabbit) {
        if (reactivating) {
          const evType = oldStatus === "mort" ? "décès" : "vente";
          const ok = await showConfirm({
            title: "Réactiver le lapin",
            message: `Réactiver ${existingRabbit.name} (${existingRabbit.code}) ? L'événement « ${evType} » le plus récent sera supprimé pour garder les statistiques justes.`,
            confirmLabel: "Réactiver", cancelLabel: "Annuler",
          });
          if (!ok) return;
          const ev = ctx.state.events
            .filter(e => e.rabbitId === existingRabbit.id && (e.type === evType || (evType === "décès" && e.type === "deces")))
            .sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];
          if (ev) deleteEvent(ctx, ev.id);
        }
        updateRabbit(ctx, existingRabbit.id, data);
        targetId = existingRabbit.id;
      } else {
        addRabbit(ctx, data);
        targetId = ctx.selectedRabbitId;
      }

      if (selectedPhotoData && targetId) {
        try {
          await addPhoto(ctx, targetId, {
            dataUrl: selectedPhotoData,
            date: new Date().toISOString().slice(0, 10),
            source: "profile",
          });
        } catch (photoErr) {
          showToast("Lapin enregistré, mais la photo n'a pas pu être sauvegardée : " + (photoErr?.message || photoErr), "warn");
        }
      }

      if (toTerminal && terminalType && targetId) {
        const res = applyBulkEvent(ctx, [targetId], { type: terminalType, date: statusDate, notes: terminalNotes, data: terminalData });
        if (!res.ok && res.failed.length) {
          showToast("Statut non appliqué : " + res.failed[0].error, "error");
          return;
        }
      }

      closeModal(ctx.el);
    } catch (err) {
      showToast(err?.message || String(err), "error");
    }
  });

  setupModalFormKeyboardUX(form, '[data-testid="rabbit-form-submit"]');
}

// Mini-modal "Mettre en vente" — accessible en 1 clic depuis la fiche lapin,
// sans ouvrir le formulaire complet d'édition.
function openShopQuickModal(ctx, rabbit) {
  const onSale  = !!rabbit.forSale;
  const price   = rabbit.salePrice ? String(rabbit.salePrice) : "";
  const desc    = rabbit.shopDescription || "";
  openModal(ctx.el, onSale ? "Gérer la mise en vente" : "Mettre en vente", `
    <form id="shopQuickForm" class="form">
      <div class="small muted" style="margin-bottom:8px">
        ${escapeHTML(rabbit.name)} (${escapeHTML(rabbit.code || "")})
      </div>
      <div class="field">
        <div class="label">Prix demandé <span class="muted small">(laisser vide = calcul auto : poids × prix vif)</span></div>
        <input class="input" name="salePrice" type="number" min="0" step="any" placeholder="ex: 12500" value="${escapeAttr(price)}">
      </div>
      <div class="field">
        <div class="label">Description boutique <span class="muted small">(visible des clients)</span></div>
        <textarea class="input" name="shopDescription" rows="2" placeholder="Reproducteur sélectionné, vacciné…">${escapeHTML(desc)}</textarea>
      </div>
      <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:6px">
        ${onSale ? `<button type="button" class="btn danger" id="shopQuickRemove">Retirer de la vente</button>` : `<span></span>`}
        <div class="row" style="gap:6px">
          <button type="button" class="btn secondary" id="shopQuickCancel">Annuler</button>
          <button type="submit" class="btn">${onSale ? "Enregistrer" : "Mettre en vente"}</button>
        </div>
      </div>
    </form>
  `);

  document.getElementById("shopQuickCancel")?.addEventListener("click", () => closeModal(ctx.el));

  document.getElementById("shopQuickRemove")?.addEventListener("click", () => {
    updateRabbit(ctx, rabbit.id, { forSale: false, salePrice: null, shopDescription: "" });
    closeModal(ctx.el);
    showToast("Lapin retiré de la boutique.", "info");
  });

  document.getElementById("shopQuickForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const priceRaw = parseFloat(fd.get("salePrice"));
    updateRabbit(ctx, rabbit.id, {
      forSale: true,
      salePrice: Number.isFinite(priceRaw) && priceRaw > 0 ? priceRaw : null,
      shopDescription: (fd.get("shopDescription") || "").toString().trim(),
    });
    closeModal(ctx.el);
    showToast("Lapin mis en vente sur la boutique.", "success");
  });

  setupModalFormKeyboardUX(document.getElementById("shopQuickForm"), 'button[type="submit"]');
}

function eventFormHTML(preType = "autre", ctx = null) {
  const today = new Date().toISOString().slice(0,10);
  const types = ["saillie","mise_bas","sevrage","vaccin","traitement","pesée","vente","décès","autre"];
  const labels = { saillie:"Saillie", mise_bas:"Mise-bas", sevrage:"Sevrage", vaccin:"Vaccin", traitement:"Traitement", "pesée":"Pesée", vente:"Vente", "décès":"Décès", autre:"Autre" };
  const options = types.map(t => `<option value="${t}" ${t === preType ? "selected" : ""}>${labels[t]}</option>`).join("");
  const actorHTML = ctx ? actorSelectHTML(ctx, null, "performedByUserId") : "";
  return `
    <form id="eventForm" class="form">
      <div class="row2">
        <div class="field">
          <div class="label">Type</div>
          <select class="input" name="type" id="evType">
            ${options}
          </select>
        </div>
        <div class="field">
          <div class="label">Date</div>
          <input class="input" type="date" name="date" value="${today}">
        </div>
      </div>

      <div id="evExtra"></div>

      ${actorHTML ? `
      <div class="field">
        <div class="label">Effectué par</div>
        ${actorHTML}
      </div>` : ""}

      <div class="field">
        <div class="label">Notes</div>
        <textarea class="input" name="notes" placeholder="Détails (optionnel)"></textarea>
      </div>

      <div id="eventError" class="error" data-testid="modal-error" hidden></div>

      <div class="row" style="justify-content:flex-end">
        <button type="button" class="btn secondary" id="cancelEvent">Annuler</button>
        <button type="submit" class="btn" data-testid="event-form-submit">Ajouter</button>
      </div>
    </form>
  `;
}

function renderEventExtra(ctx, type) {
  if (type === "saillie") {
    const males = (ctx.state?.rabbits || []).filter(r => r.sex === "M" && r.status === "actif");
    const options = males
      .map(m => `<option value="${escapeAttr(m.id)}">${escapeHTML((m.code || m.name || m.id).toString())}</option>`)
      .join("");
    return `
      <label>Mâle (obligatoire)
        <select class="input" name="maleId" required>
          <option value="">— Choisir —</option>
          ${options}
        </select>
      </label>
      ${males.length ? "" : "<div class='small'>Aucun mâle actif. Crée un mâle d'abord.</div>"}
    `;
  }
  if (type === "vaccin" || type === "traitement") {
    return `
      <div class="row2">
        <div class="field">
          <div class="label">Produit (optionnel)</div>
          <input class="input" name="product" placeholder="ex: Myxomatose / Vermifuge...">
        </div>
        <div class="field">
          <div class="label">Dose (optionnel)</div>
          <input class="input" name="dose" placeholder="ex: 1ml">
        </div>
      </div>
      <div class="field">
        <div class="label">Prochain rappel (optionnel mais recommandé)</div>
        <input class="input" name="nextDate" type="date">
      </div>
    `;
  }

  if (type === "mise_bas") {
    return `
      <div class="row2">
        <div class="field">
          <div class="label">Nés (total)</div>
          <input class="input" name="born" type="number" min="0" placeholder="ex: 8" required>
        </div>
        <div class="field">
          <div class="label">Vivants</div>
          <input class="input" name="alive" type="number" min="0" placeholder="ex: 7" required>
        </div>
      </div>
      <div class="field">
        <div class="label">Morts (calculé)</div>
        <input class="input" name="dead" type="number" min="0" placeholder="ex: 1" readonly>
      </div>
      <div id="kitHint" class="small" hidden></div>
    `;
  }
  if (type === "sevrage") {
    return `
      <div class="row2">
        <div class="field">
          <div class="label">Sevrés</div>
          <input class="input" name="weaned" type="number" min="0" placeholder="ex: 6">
        </div>
        <div class="field">
          <div class="label">Cage destination (optionnel)</div>
          ${cageSelectHTML(ctx.state, '', 'destCage', { optional: true })}
        </div>
      </div>
    `;
  }
  if (type === "pesée") {
    return `
      <div class="field">
        <div class="label">Poids (kg)</div>
        <input class="input" name="weight" type="number" min="0" step="0.01" placeholder="ex: 2.35" required>
      </div>
      <div class="field">
        <div class="label">Photo (optionnel)</div>
        <div class="photo-upload-zone">
          <label class="btn secondary" style="cursor:pointer">
            📷 Joindre une photo
            <input type="file" id="inputPeseePhoto" accept="image/*" style="display:none">
          </label>
          <div id="peseePhotoPreview" style="display:none;margin-top:8px">
            <img id="peseePhotoImg" class="photo-upload-preview" alt="Aperçu">
            <button type="button" id="btnClearPeseePhoto" class="btn secondary" style="margin-top:4px;font-size:12px">Retirer la photo</button>
          </div>
        </div>
      </div>
    `;
  }
  if (type === "vente") {
    const cur = getSettings(ctx).currencySymbol || "FCFA";
    return `
      <div class="row2">
        <div class="field">
          <div class="label">Prix (${escapeHTML(cur)})</div>
          <input class="input" name="price" type="number" min="0.01" step="0.01" placeholder="ex: 2500" required>
        </div>
        <div class="field">
          <div class="label">Client (optionnel)</div>
          <input class="input" name="client" placeholder="ex: Jean Dupont">
        </div>
      </div>
    `;
  }
  if (type === "décès") {
    const causeOptions = Object.entries(DEATH_CAUSES)
      .map(([k, v], i) => `<option value="${escapeAttr(k)}"${i === 0 ? " selected" : ""}>${escapeHTML(v)}</option>`)
      .join("");
    return `
      <div class="field">
        <div class="label">Cause</div>
        <select class="input" name="cause">${causeOptions}</select>
      </div>
      <div class="field">
        <div class="label">Conditions / détails (recommandé)</div>
        <textarea class="input" name="condition" rows="2" placeholder="Symptômes, circonstances observées…"></textarea>
      </div>
    `;
  }
  return "";
}

function wireEventForm(ctx) {
  const form = document.getElementById("eventForm");
  const cancel = document.getElementById("cancelEvent");
  const typeSel = document.getElementById("evType");
  const extra = document.getElementById("evExtra");
  const dateInput = form?.querySelector('input[name="date"]');
  const submitBtn = form?.querySelector('[data-testid="event-form-submit"]');
  const errorBox = document.getElementById("eventError");
  let isSubmitting = false;

  cancel?.addEventListener("click", () => closeModal(ctx.el));

  const showError = (message) => {
    if (!errorBox) {
      showToast(message, "error");
      return;
    }
    errorBox.textContent = message;
    errorBox.hidden = false;
  };

  const clearError = () => {
    if (!errorBox) return;
    errorBox.textContent = "";
    errorBox.hidden = true;
  };

  if (typeSel && extra) {
    refreshAllowedTypes();
    extra.innerHTML = renderEventExtra(ctx, typeSel.value);
    bindExtraHandlers(typeSel.value);
    typeSel.addEventListener("change", () => {
      extra.innerHTML = renderEventExtra(ctx, typeSel.value);
      bindExtraHandlers(typeSel.value);
      clearError();
    });
  }
  dateInput?.addEventListener("change", () => {
    refreshAllowedTypes();
    clearError();
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!ctx.selectedRabbitId) return;
    if (isSubmitting) return;
    isSubmitting = true;
    if (submitBtn) submitBtn.disabled = true;
    clearError();

    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());

    const type = (data.type || "autre").toString();
    const date = (data.date || new Date().toISOString().slice(0,10)).toString();
    const notes = (data.notes || "").toString();
    const performedByUserId = (data.performedByUserId || "").toString();

    const evData = {};
    if (type === "mise_bas") {
      evData.born = numOrNull(data.born);
      evData.alive = num(data.alive);
      evData.dead = num(data.dead);
    }
    if (type === "pesée") {
      evData.weight = num(data.weight);
    }
    if (type === "sevrage") {
      evData.weaned = num(data.weaned);
      evData.destCage = (data.destCage || "").toString().trim();
    }
    if (type === "vaccin" || type === "traitement") {
          evData.product = (data.product || "").toString().trim();
          evData.dose = (data.dose || "").toString().trim();
          evData.nextDate = (data.nextDate || "").toString();
        }
        if (type === "saillie") {
      evData.maleId = (data.maleId || "").toString().trim();
    }
    if (type === "vente") {
      evData.price = num(data.price);
      evData.client = (data.client || "").toString().trim();
    }
    if (type === "décès") {
      evData.cause = (data.cause || "inconnu").toString();
      evData.condition = (data.condition || "").toString().trim();
    }


    const draft = { type, date, notes, data: evData, performedByUserId };

    try {
      const ev = addEvent(ctx, ctx.selectedRabbitId, draft);

      if (type === "pesée") {
        const peseePhotoInput = document.getElementById("inputPeseePhoto");
        const photoDataUrl = peseePhotoInput?.dataset.dataUrl;
        if (photoDataUrl) {
          try {
            await addPhoto(ctx, ctx.selectedRabbitId, {
              dataUrl: photoDataUrl,
              date,
              source: "pesée",
              eventId: ev.id,
            });
          } catch (photoErr) {
            showToast("Pesée enregistrée, mais la photo n'a pas pu être sauvegardée : " + (photoErr?.message || photoErr), "warn");
          }
        }
      }

      closeModal(ctx.el);
    } catch (err) {
      const msg = err?.message || String(err);
      showError(msg);
      isSubmitting = false;
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
  });

  setupModalFormKeyboardUX(form, '[data-testid="event-form-submit"]');
}

function setupModalFormKeyboardUX(form, submitSelector) {
  if (!form) return;

  const getFocusableFields = () => {
    const nodes = Array.from(form.querySelectorAll("input, select, textarea"));
    return nodes.filter((node) => {
      if (!(node instanceof HTMLElement)) return false;
      if (node.matches('[type="hidden"], [type="file"]')) return false;
      if (node.hasAttribute("disabled")) return false;
      if (node.getAttribute("aria-hidden") === "true") return false;
      if (node.offsetParent === null) return false;
      return true;
    });
  };

  const focusFirstField = () => {
    const first = getFocusableFields()[0];
    if (!first) return;
    first.focus({ preventScroll: true });
    if (first instanceof HTMLInputElement && first.type !== "date") {
      first.select?.();
    }
  };

  requestAnimationFrame(() => {
    focusFirstField();
  });

  form.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    if (e.defaultPrevented) return;

    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.matches("input, select, textarea")) return;
    if (target.matches('[type="file"]')) return;

    if (target.tagName === "TEXTAREA" && e.shiftKey) {
      return; // autorise retour ligne
    }

    e.preventDefault();
    const fields = getFocusableFields();
    const idx = fields.indexOf(target);
    const next = idx >= 0 ? fields[idx + 1] : null;

    if (next) {
      next.focus({ preventScroll: true });
      if (next instanceof HTMLInputElement && next.type !== "date") {
        next.select?.();
      }
      return;
    }

    const submitBtn = form.querySelector(submitSelector);
    if (submitBtn instanceof HTMLButtonElement && !submitBtn.disabled) {
      submitBtn.click();
    }
  });
}

function bindExtraHandlers(type) {
  if (type === "pesée") {
    const photoInput = document.getElementById("inputPeseePhoto");
    const preview = document.getElementById("peseePhotoPreview");
    const previewImg = document.getElementById("peseePhotoImg");
    const clearBtn = document.getElementById("btnClearPeseePhoto");
    if (!photoInput) return;

    photoInput.addEventListener("change", async () => {
      const file = photoInput.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await compressImage(file);
        photoInput.dataset.dataUrl = dataUrl;
        if (previewImg) previewImg.src = dataUrl;
        if (preview) preview.style.display = "";
      } catch (err) {
        showToast("Erreur photo : " + (err?.message || err), "error");
      } finally {
        photoInput.value = "";
      }
    });

    clearBtn?.addEventListener("click", () => {
      delete photoInput.dataset.dataUrl;
      if (previewImg) previewImg.src = "";
      if (preview) preview.style.display = "none";
    });
    return;
  }

  if (type !== "mise_bas") return;
  const aliveInput = document.querySelector('input[name="alive"]');
  const bornInput = document.querySelector('input[name="born"]');
  const deadInput = document.querySelector('input[name="dead"]');
  const hint = document.getElementById("kitHint");
  if (!aliveInput || !bornInput || !deadInput || !hint) return;

  const updateDead = () => {
    const born = num(bornInput.value);
    const alive = num(aliveInput.value);
    if (!bornInput.value && !aliveInput.value) {
      deadInput.value = "";
      hint.textContent = "";
      hint.hidden = true;
      return;
    }
    const computed = Math.max(born - alive, 0);
    deadInput.value = Number.isFinite(computed) ? computed : "";
    if (alive > 0) {
      hint.textContent = `${alive} lapereaux seront créés.`;
      hint.hidden = false;
    } else {
      hint.textContent = "";
      hint.hidden = true;
    }
  };

  aliveInput.addEventListener("input", updateDead);
  bornInput.addEventListener("input", updateDead);
  updateDead();
}

function refreshAllowedTypes() {
  // Placeholder: ancienne logique supprimée, on garde le hook pour éviter les erreurs.
}

/* -------- Traitement par lot (sélection multiple de lapins) -------- */

function _bulkEventExtra(ctx, type) {
  if (type === "vaccin" || type === "traitement") {
    return `
      <div class="row2">
        <div class="field"><div class="label">Produit (optionnel)</div><input class="input" name="product" placeholder="ex: Myxomatose / Vermifuge…"></div>
        <div class="field"><div class="label">Dose (optionnel)</div><input class="input" name="dose" placeholder="ex: 1ml"></div>
      </div>
      <div class="field"><div class="label">Prochain rappel (optionnel)</div><input class="input" name="nextDate" type="date"></div>`;
  }
  if (type === "pesée") {
    return `<div class="field"><div class="label">Poids appliqué à chaque lapin (kg)</div><input class="input" name="weight" type="number" min="0" step="0.01" placeholder="ex: 2.35" required></div>`;
  }
  if (type === "vente") {
    const cur = getSettings(ctx).currencySymbol || "FCFA";
    return `
      <div class="row2">
        <div class="field"><div class="label">Prix unitaire (${escapeHTML(cur)})</div><input class="input" name="price" type="number" min="0.01" step="0.01" placeholder="ex: 2500" required></div>
        <div class="field"><div class="label">Client (optionnel)</div><input class="input" name="client" placeholder="ex: Jean Dupont"></div>
      </div>`;
  }
  if (type === "décès") {
    const causeOptions = Object.entries(DEATH_CAUSES)
      .map(([k, v], i) => `<option value="${escapeAttr(k)}"${i === 0 ? " selected" : ""}>${escapeHTML(v)}</option>`)
      .join("");
    return `
      <div class="field"><div class="label">Cause</div><select class="input" name="cause">${causeOptions}</select></div>
      <div class="field"><div class="label">Conditions / détails (recommandé)</div><textarea class="input" name="condition" rows="2" placeholder="Symptômes, circonstances…"></textarea></div>`;
  }
  return "";
}

function openBulkEventModal(ctx, ids) {
  const today = new Date().toISOString().slice(0, 10);
  const types = ["vaccin", "traitement", "pesée", "vente", "décès", "autre"];
  const labels = { vaccin: "💉 Vaccin", traitement: "💊 Traitement", "pesée": "⚖️ Pesée", vente: "💰 Vente", "décès": "☠️ Décès", autre: "📝 Note / Autre" };
  const options = types.map(t => `<option value="${t}">${labels[t]}</option>`).join("");

  openModal(ctx.el, `📅 Événement groupé — ${ids.length} lapin${ids.length > 1 ? "s" : ""}`, `
    <form id="bulkEventForm" class="form">
      <div class="row2">
        <div class="field"><div class="label">Type d'événement</div><select class="input" name="type" id="bulkEvType">${options}</select></div>
        <div class="field"><div class="label">Date</div><input class="input" type="date" name="date" value="${today}"></div>
      </div>
      <div id="bulkEvExtra"></div>
      <div class="field"><div class="label">Notes (optionnel)</div><textarea class="input" name="notes" rows="2" placeholder="Appliqué à tous les lapins sélectionnés"></textarea></div>
      <div id="bulkEvError" class="error" hidden></div>
      <div class="row" style="justify-content:flex-end">
        <button type="button" class="btn secondary" id="bulkEvCancel">Annuler</button>
        <button type="submit" class="btn" data-testid="bulk-event-submit">Appliquer à ${ids.length}</button>
      </div>
    </form>
  `);

  const form = document.getElementById("bulkEventForm");
  const typeSel = document.getElementById("bulkEvType");
  const extra = document.getElementById("bulkEvExtra");
  const errBox = document.getElementById("bulkEvError");
  const renderExtra = () => { extra.innerHTML = _bulkEventExtra(ctx, typeSel.value); };
  renderExtra();
  typeSel.addEventListener("change", () => { renderExtra(); if (errBox) errBox.hidden = true; });
  document.getElementById("bulkEvCancel")?.addEventListener("click", () => closeModal(ctx.el));

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const type = (fd.get("type") || "autre").toString();
    const date = (fd.get("date") || today).toString();
    const notes = (fd.get("notes") || "").toString();

    const data = {};
    if (type === "vaccin" || type === "traitement") {
      data.product = (fd.get("product") || "").toString().trim();
      data.dose = (fd.get("dose") || "").toString().trim();
      data.nextDate = (fd.get("nextDate") || "").toString();
    } else if (type === "pesée") {
      data.weight = num(fd.get("weight"));
    } else if (type === "vente") {
      data.price = num(fd.get("price"));
      data.client = (fd.get("client") || "").toString().trim();
    } else if (type === "décès") {
      data.cause = (fd.get("cause") || "inconnu").toString();
      data.condition = (fd.get("condition") || "").toString().trim();
    }

    const res = applyBulkEvent(ctx, ids, { type, date, notes, data });
    if (res.ok === 0 && res.failed.length) {
      if (errBox) {
        const first = res.failed[0];
        errBox.textContent = `Aucun appliqué. Ex. : ${first.code || ""} — ${first.error}`;
        errBox.hidden = false;
      }
      return;
    }
    closeModal(ctx.el);
    const msg = res.failed.length
      ? `${res.ok} événement(s) appliqué(s), ${res.failed.length} ignoré(s) (statut incompatible).`
      : `${res.ok} événement(s) appliqué(s).`;
    showToast(msg, res.failed.length ? "warn" : "success");
  });
}

function _bulkCageField(state) {
  const buildings = (state?.buildings || []).slice().sort((a, b) => a.letter.localeCompare(b.letter));
  const lodges = state?.lodges || [];
  if (!buildings.length) {
    return `<input class="input" name="cage" placeholder="ex: A1 (vide = ne pas changer)">`;
  }
  const groups = buildings.map(b => {
    const opts = lodges.filter(l => l.buildingId === b.id).sort((x, y) => x.number - y.number)
      .map(l => `<option value="${escapeAttr(l.code)}">${escapeHTML(l.code)}</option>`).join("");
    return `<optgroup label="Bâtiment ${escapeHTML(b.letter)}">${opts}</optgroup>`;
  }).join("");
  return `<select class="input" name="cage"><option value="__keep__" selected>— Ne pas changer —</option>${groups}</select>`;
}

function openBulkEditModal(ctx, ids) {
  openModal(ctx.el, `✏️ Modifier en lot — ${ids.length} lapin${ids.length > 1 ? "s" : ""}`, `
    <form id="bulkEditForm" class="form">
      <p class="small muted">Seuls les champs renseignés seront modifiés sur les ${ids.length} lapins sélectionnés.</p>
      <div class="field"><div class="label">Loge / cage</div>${_bulkCageField(ctx.state)}</div>
      <div class="field"><div class="label">Race</div><input class="input" name="breed" placeholder="vide = ne pas changer"></div>
      <div class="field"><div class="label">Disponibilité reproduction</div>
        <select class="input" name="breedingOverride">
          <option value="__keep__" selected>— Ne pas changer —</option>
          <option value="auto">Automatique</option>
          <option value="disponible">Forcer disponible</option>
          <option value="indisponible">Forcer indisponible</option>
        </select>
      </div>
      <div class="field"><div class="label">Boutique</div>
        <select class="input" name="forSale" id="bulkForSale">
          <option value="__keep__" selected>— Ne pas changer —</option>
          <option value="true">Mettre en vente</option>
          <option value="false">Retirer de la vente</option>
        </select>
      </div>
      <div class="field" id="bulkPriceField" style="display:none"><div class="label">Prix demandé (optionnel)</div><input class="input" name="salePrice" type="number" min="0" step="any" placeholder="vide = calcul auto (poids × prix vif)"></div>
      <div id="bulkEditError" class="error" hidden></div>
      <div class="row" style="justify-content:flex-end">
        <button type="button" class="btn secondary" id="bulkEditCancel">Annuler</button>
        <button type="submit" class="btn" data-testid="bulk-edit-submit">Appliquer à ${ids.length}</button>
      </div>
    </form>
  `);

  const form = document.getElementById("bulkEditForm");
  const forSaleSel = document.getElementById("bulkForSale");
  const priceField = document.getElementById("bulkPriceField");
  forSaleSel?.addEventListener("change", () => { priceField.style.display = forSaleSel.value === "true" ? "block" : "none"; });
  document.getElementById("bulkEditCancel")?.addEventListener("click", () => closeModal(ctx.el));

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const patch = {};

    const cageVal = (fd.get("cage") || "").toString().trim();
    if (cageVal && cageVal !== "__keep__") patch.cage = cageVal;

    const breed = (fd.get("breed") || "").toString().trim();
    if (breed) patch.breed = breed;

    const bo = (fd.get("breedingOverride") || "__keep__").toString();
    if (bo !== "__keep__") patch.breedingOverride = bo;

    const shop = (fd.get("forSale") || "__keep__").toString();
    if (shop === "true") {
      patch.forSale = true;
      const p = parseFloat(fd.get("salePrice"));
      if (Number.isFinite(p) && p > 0) patch.salePrice = p;
    } else if (shop === "false") {
      patch.forSale = false;
    }

    if (!Object.keys(patch).length) {
      const errBox = document.getElementById("bulkEditError");
      if (errBox) { errBox.textContent = "Renseigne au moins un champ à modifier."; errBox.hidden = false; }
      return;
    }
    const n = applyBulkEdit(ctx, ids, patch);
    closeModal(ctx.el);
    showToast(`${n} lapin${n > 1 ? "s" : ""} modifié${n > 1 ? "s" : ""}.`, "success");
  });
}

/* -------- Modales de gestion de lot (portée) -------- */

function _livingKitsOfLot(ctx, lot) {
  const ids = new Set(lot.aliveRabbitIds || []);
  return (ctx.state.rabbits || [])
    .filter(r => ids.has(r.id))
    .sort((a, b) => (a.code || "").localeCompare(b.code || ""));
}

function openLotLossModal(ctx, lot) {
  const kits = _livingKitsOfLot(ctx, lot);
  const today = new Date().toISOString().slice(0, 10);
  if (!kits.length) { showToast("Aucun lapereau vivant dans ce lot.", "warn"); return; }

  const causeOptions = Object.entries(DEATH_CAUSES)
    .map(([k, v], i) => `<option value="${escapeAttr(k)}"${i === 0 ? " selected" : ""}>${escapeHTML(v)}</option>`)
    .join("");
  const kitRows = kits.map(r => `
    <label class="item" style="cursor:pointer">
      <div style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="kit" value="${escapeAttr(r.id)}">
        <span><strong>${escapeHTML(r.code)}</strong> — ${escapeHTML(r.name)}</span>
      </div>
    </label>`).join("");

  openModal(ctx.el, "☠️ Déclarer une perte", `
    <form id="lotLossForm" class="form">
      <div class="field">
        <div class="label">Lapereaux concernés
          <label style="float:right;font-weight:400;cursor:pointer"><input type="checkbox" id="lotLossAll"> Tout sélectionner</label>
        </div>
        <div class="list" style="max-height:220px;overflow:auto">${kitRows}</div>
      </div>
      <div class="row2">
        <div class="field">
          <div class="label">Cause</div>
          <select class="input" name="cause">${causeOptions}</select>
        </div>
        <div class="field">
          <div class="label">Date</div>
          <input class="input" type="date" name="date" value="${today}">
        </div>
      </div>
      <div class="field">
        <div class="label">Conditions / détails (recommandé)</div>
        <textarea class="input" name="condition" rows="2" placeholder="Symptômes, circonstances observées…"></textarea>
      </div>
      <div id="lotLossError" class="error" hidden></div>
      <div class="row" style="justify-content:flex-end">
        <button type="button" class="btn secondary" id="lotLossCancel">Annuler</button>
        <button type="submit" class="btn" data-testid="lot-loss-submit">Enregistrer la perte</button>
      </div>
    </form>
  `);

  const form = document.getElementById("lotLossForm");
  document.getElementById("lotLossCancel")?.addEventListener("click", () => closeModal(ctx.el));
  document.getElementById("lotLossAll")?.addEventListener("change", (e) => {
    form.querySelectorAll('input[name="kit"]').forEach(cb => { cb.checked = e.target.checked; });
  });
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const ids = fd.getAll("kit");
    const errBox = document.getElementById("lotLossError");
    if (!ids.length) { if (errBox) { errBox.textContent = "Sélectionne au moins un lapereau."; errBox.hidden = false; } return; }
    const cause = (fd.get("cause") || "inconnu").toString();
    const condition = (fd.get("condition") || "").toString();
    const date = (fd.get("date") || today).toString();
    const n = declareLotLoss(ctx, ids, { cause, condition, date });
    closeModal(ctx.el);
    showToast(`${n} perte${n > 1 ? "s" : ""} enregistrée${n > 1 ? "s" : ""}.`, "success");
  });
}

function openLotAddKitsModal(ctx, lot) {
  openModal(ctx.el, "➕ Ajouter des lapereaux", `
    <form id="lotAddForm" class="form">
      <p class="small muted">Utilise ceci quand la mère a mis bas plus de lapereaux que comptés à la mise-bas. Ils rejoignent la portée de <strong>${escapeHTML(lot.doeName)}</strong> du ${escapeHTML(lot.date)}.</p>
      <div class="row2">
        <div class="field">
          <div class="label">Nombre à ajouter</div>
          <input class="input" type="number" name="count" min="1" value="1" required>
        </div>
        <div class="field">
          <div class="label">Date de naissance</div>
          <input class="input" type="date" name="date" value="${escapeAttr(lot.date)}">
        </div>
      </div>
      <div class="field">
        <div class="label">Motif (optionnel)</div>
        <input class="input" name="reason" placeholder="ex: lapereaux découverts dans le nid">
      </div>
      <div class="row" style="justify-content:flex-end">
        <button type="button" class="btn secondary" id="lotAddCancel">Annuler</button>
        <button type="submit" class="btn" data-testid="lot-add-submit">Ajouter</button>
      </div>
    </form>
  `);
  const form = document.getElementById("lotAddForm");
  document.getElementById("lotAddCancel")?.addEventListener("click", () => closeModal(ctx.el));
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const count = num(fd.get("count"));
    if (count < 1) { showToast("Indique un nombre valide.", "warn"); return; }
    const reason = (fd.get("reason") || "").toString();
    const date = (fd.get("date") || lot.date).toString();
    try {
      const created = addKitsToLitter(ctx, lot.eventId, count, { reason, date });
      closeModal(ctx.el);
      showToast(`${created.length} lapereau${created.length > 1 ? "x" : ""} ajouté${created.length > 1 ? "s" : ""} au lot.`, "success");
    } catch (err) {
      showToast(err?.message || String(err), "error");
    }
  });
}

function openLotWeanModal(ctx, lot) {
  const today = new Date().toISOString().slice(0, 10);
  openModal(ctx.el, "🐇 Sevrer le lot", `
    <form id="lotWeanForm" class="form">
      <p class="small muted">Sèvre les <strong>${escapeHTML(String(lot.aliveCount))}</strong> lapereau(x) vivant(s) et les déplace vers leur bâtiment. Le lot passe au statut « Sevré ».</p>
      <div class="row2">
        <div class="field">
          <div class="label">Date de sevrage</div>
          <input class="input" type="date" name="date" value="${today}">
        </div>
        <div class="field">
          <div class="label">Cage / bâtiment destination</div>
          ${cageSelectHTML(ctx.state, lot.cage && lot.cage !== "—" ? lot.cage : "", "destCage", { optional: true })}
        </div>
      </div>
      <div id="lotWeanError" class="error" hidden></div>
      <div class="row" style="justify-content:flex-end">
        <button type="button" class="btn secondary" id="lotWeanCancel">Annuler</button>
        <button type="submit" class="btn" data-testid="lot-wean-submit">Sevrer</button>
      </div>
    </form>
  `);
  const form = document.getElementById("lotWeanForm");
  document.getElementById("lotWeanCancel")?.addEventListener("click", () => closeModal(ctx.el));
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const date = (fd.get("date") || today).toString();
    const destCage = (fd.get("destCage") || "").toString().trim();
    const errBox = document.getElementById("lotWeanError");
    try {
      addEvent(ctx, lot.doeId, { type: "sevrage", date, data: { weaned: lot.aliveCount, destCage } });
      closeModal(ctx.el);
      showToast("Lot sevré.", "success");
    } catch (err) {
      if (errBox) { errBox.textContent = err?.message || String(err); errBox.hidden = false; }
      else showToast(err?.message || String(err), "error");
    }
  });
}

function openLotLodgesModal(ctx, lot) {
  const kits = _livingKitsOfLot(ctx, lot);
  if (!kits.length) { showToast("Aucun lapereau vivant à répartir.", "warn"); return; }
  const rows = kits.map(r => `
    <div class="field">
      <div class="label">${escapeHTML(r.code)} — ${escapeHTML(r.name)}</div>
      ${cageSelectHTML(ctx.state, r.cage || "", `cage_${r.id}`, { optional: true })}
    </div>`).join("");

  openModal(ctx.el, "🏠 Répartir en loges", `
    <form id="lotLodgesForm" class="form">
      <p class="small muted">Affecte une loge individuelle à chaque lapereau. Le lot passe au statut « En loges ».</p>
      ${rows}
      <div class="row" style="justify-content:flex-end">
        <button type="button" class="btn secondary" id="lotLodgesCancel">Annuler</button>
        <button type="submit" class="btn" data-testid="lot-lodges-submit">Enregistrer</button>
      </div>
    </form>
  `);
  const form = document.getElementById("lotLodgesForm");
  document.getElementById("lotLodgesCancel")?.addEventListener("click", () => closeModal(ctx.el));
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const assignments = kits.map(r => ({ id: r.id, cage: (fd.get(`cage_${r.id}`) || "").toString().trim() }));
    const n = assignLotLodges(ctx, lot.id, assignments);
    closeModal(ctx.el);
    showToast(n > 0 ? `${n} lapereau(x) affecté(s) en loge.` : "Lot marqué « En loges ».", "success");
  });
}

/* -------- Modal "🎯 Trouver un lapin par budget client" -------- */

function openBudgetSearchModal(ctx) {
  const settings = getSettings(ctx);
  const sym = settings.currencySymbol || "FCFA";

  // Budget initial : médiane des prix vifs du cheptel pesé en vente, ou 10 000.
  const initialBudget = (() => {
    const inSale = (ctx.state.rabbits || [])
      .filter(r => r.status === 'actif' && r.forSale)
      .map(r => {
        const w = (ctx.state.events || [])
          .filter(e => e.rabbitId === r.id && e.type === 'pesée' && Number(e.data?.weight) > 0)
          .sort((a, b) => b.date.localeCompare(a.date))[0];
        return w ? Number(w.data.weight) : null;
      })
      .filter(w => w != null)
      .map(w => estimateRabbitValue(w, settings).live);
    if (inSale.length === 0) return 10000;
    inSale.sort((a, b) => a - b);
    return Math.round(inSale[Math.floor(inSale.length / 2)] / 500) * 500;
  })();

  openModal(ctx.el, "🎯 Trouver un lapin par budget", `
    <div class="field">
      <div class="label">Budget du client (${escapeHTML(sym)})</div>
      <div class="row" style="gap:6px;align-items:center">
        <button class="btn secondary" type="button" id="bsMinus" title="−500" style="font-size:1.1rem;padding:6px 14px">−</button>
        <input id="bsBudget" class="input" type="number" min="0" step="500" value="${initialBudget}"
               style="flex:1;text-align:center;font-size:1.2rem;font-weight:600">
        <button class="btn secondary" type="button" id="bsPlus" title="+500" style="font-size:1.1rem;padding:6px 14px">+</button>
      </div>
    </div>

    <div class="row2" style="margin-top:10px">
      <div class="field">
        <div class="label">Type de prix</div>
        <select id="bsType" class="input">
          <option value="live" selected>Vif (sur pied)</option>
          <option value="carcass">Carcasse</option>
        </select>
      </div>
      <div class="field">
        <div class="label">Tolérance (±%)</div>
        <input id="bsTolerance" class="input" type="number" min="0" max="100" step="1" value="10">
      </div>
    </div>

    <div class="field" style="margin-top:6px">
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
        <input id="bsForSale" type="checkbox" checked>
        <span>Uniquement les lapins en vente</span>
      </label>
    </div>

    <div id="bsResults" style="margin-top:14px"></div>
  `);

  const $b = (id) => document.getElementById(id);
  const refresh = () => _renderBudgetResults(ctx, settings);

  $b("bsBudget").addEventListener("input", refresh);
  $b("bsType").addEventListener("change", refresh);
  $b("bsTolerance").addEventListener("input", refresh);
  $b("bsForSale").addEventListener("change", refresh);

  $b("bsMinus").addEventListener("click", () => {
    const inp = $b("bsBudget");
    const v = Math.max(0, (Number(inp.value) || 0) - 500);
    inp.value = v;
    refresh();
  });
  $b("bsPlus").addEventListener("click", () => {
    const inp = $b("bsBudget");
    const v = (Number(inp.value) || 0) + 500;
    inp.value = v;
    refresh();
  });

  refresh();
}

function _renderBudgetResults(ctx, settings) {
  const host = document.getElementById("bsResults");
  if (!host) return;

  const budget    = Number(document.getElementById("bsBudget")?.value);
  const type      = document.getElementById("bsType")?.value === "carcass" ? "carcass" : "live";
  const tolPct    = Math.max(0, Number(document.getElementById("bsTolerance")?.value) || 0);
  const forSaleOnly = !!document.getElementById("bsForSale")?.checked;

  if (!Number.isFinite(budget) || budget <= 0) {
    host.innerHTML = `<div class="muted small">Saisis un budget supérieur à 0 pour lancer la recherche.</div>`;
    return;
  }

  const matches = getRabbitsByBudget(ctx.state, {
    budget,
    type,
    tolerance: tolPct / 100,
    forSaleOnly,
    settings,
  });

  if (matches.length === 0) {
    host.innerHTML = `
      <div class="muted small" style="padding:10px;text-align:center;border:1px dashed var(--color-border, #ddd);border-radius:8px">
        Aucun lapin ${forSaleOnly ? 'en vente ' : ''}entre ${formatCurrency(budget * (1 - tolPct / 100), settings)}
        et ${formatCurrency(budget * (1 + tolPct / 100), settings)}.<br>
        <span class="small">Augmente le budget ou la tolérance.</span>
      </div>`;
    return;
  }

  const items = matches.slice(0, 12).map(m => {
    const r       = m.rabbit;
    const deltaPc = Math.round(m.deltaPct * 100);
    const sign    = deltaPc > 0 ? '+' : '';
    const color   = Math.abs(deltaPc) <= 3 ? '#4f7942' : Math.abs(deltaPc) <= 7 ? '#a06b00' : '#999';
    const cage    = r.cage ? ` · 🏠 ${escapeHTML(r.cage)}` : '';
    return `
      <div class="item" style="display:flex;align-items:center;gap:10px;padding:8px">
        <div style="flex:1;min-width:0">
          <div><strong>${escapeHTML(r.name)}</strong> <span class="badge">${escapeHTML(r.code)}</span></div>
          <div class="small" style="color:var(--color-muted)">
            ⚖️ ${m.weightKg.toFixed(2)} kg${cage} → <strong>${formatCurrency(m.value, settings)}</strong>
            <span style="color:${color};margin-left:6px">(${sign}${deltaPc}%)</span>
          </div>
        </div>
        <button class="btn secondary" data-bs-open="${escapeAttr(r.id)}" style="font-size:.85rem;padding:4px 10px">Voir</button>
      </div>`;
  }).join("");

  host.innerHTML = `
    <div class="small muted" style="margin-bottom:6px">
      ${matches.length} lapin${matches.length > 1 ? 's' : ''} trouvé${matches.length > 1 ? 's' : ''} ·
      tri par proximité du budget
    </div>
    <div class="list">${items}</div>
  `;

  host.querySelectorAll("[data-bs-open]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.bsOpen;
      ctx.selectedRabbitId = id;
      ctx.selectedGeneRabbitId = id;
      closeModal(ctx.el);
      if (ctx.navigate) ctx.navigate("rabbits");
      else ctx.render();
    });
  });
}
