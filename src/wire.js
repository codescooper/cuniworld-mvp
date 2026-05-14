import { openModal, closeModal } from "./modal.js";
import { escapeHTML, escapeAttr, generateRabbitCode, num, numOrNull } from "./utils.js";
import { addRabbit, updateRabbit, deleteRabbit, addEvent, deleteEvent, addPhoto, deletePhoto, trackCloudWrite } from "./actions.js";
import { DB } from "./db.js";
import { compressImage } from "./photos.js";
import { isNameFromPool, isNameAvailable, isNameUsedByLivingRabbit, suggestAvailableRabbitName } from "./rabbitNameService.js";
import { openWeightCheckModal } from "./weightCheck.js";
import { openPhotoCheckModal, openSinglePhotoModal } from "./photoCheck.js";
import { dismissActionForToday } from "./farmActionsService.js";
import { showToast, showConfirm } from "./notifications.js";
import { actorSelectHTML } from "./membersService.js";
import { openTourneeModal } from "./renderTournee.js";


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
  el.sexFilter.addEventListener("change", () => ctx.render());
  el.statusFilter.addEventListener("change", () => ctx.render());
  el.geneQ?.addEventListener("input", () => ctx.render());

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

  el.rabbitList.querySelectorAll("[data-rabbit]").forEach(node => {
    node.addEventListener("click", () => {
      ctx.selectedRabbitId = node.dataset.rabbit;
      ctx.selectedGeneRabbitId = node.dataset.rabbit;
      ctx.render();
    });
  });

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

  const btnEdit = document.getElementById("btnEditRabbit");
  if (btnEdit) {
    btnEdit.addEventListener("click", () => {
      const r = ctx.state.rabbits.find(x => x.id === ctx.selectedRabbitId);
      if (!r) return;
      openModal(el, "Modifier lapin", rabbitFormHTML(r, ctx.state));
      wireRabbitForm(ctx, r);
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

    try {
      if (existingRabbit) {
        updateRabbit(ctx, existingRabbit.id, data);
        if (selectedPhotoData) {
          try {
            await addPhoto(ctx, existingRabbit.id, {
              dataUrl: selectedPhotoData,
              date: new Date().toISOString().slice(0, 10),
              source: "profile",
            });
          } catch (photoErr) {
            showToast("Lapin modifié, mais la photo n'a pas pu être sauvegardée : " + (photoErr?.message || photoErr), "warn");
          }
        }
      } else {
        addRabbit(ctx, data);
        if (selectedPhotoData && ctx.selectedRabbitId) {
          try {
            await addPhoto(ctx, ctx.selectedRabbitId, {
              dataUrl: selectedPhotoData,
              date: new Date().toISOString().slice(0, 10),
              source: "profile",
            });
          } catch (photoErr) {
            showToast("Lapin créé, mais la photo n'a pas pu être sauvegardée : " + (photoErr?.message || photoErr), "warn");
          }
        }
      }
      closeModal(ctx.el);
    } catch (err) {
      showToast(err?.message || String(err), "error");
    }
  });

  setupModalFormKeyboardUX(form, '[data-testid="rabbit-form-submit"]');
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
    return `
      <div class="row2">
        <div class="field">
          <div class="label">Prix (€)</div>
          <input class="input" name="price" type="number" min="0.01" step="0.01" placeholder="ex: 25.50" required>
        </div>
        <div class="field">
          <div class="label">Client (optionnel)</div>
          <input class="input" name="client" placeholder="ex: Jean Dupont">
        </div>
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
