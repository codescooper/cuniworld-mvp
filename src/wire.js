import { openModal, closeModal } from "./modal.js";
import { escapeHTML, escapeAttr, num, numOrNull } from "./utils.js";
import { addRabbit, updateRabbit, deleteRabbit, addEvent, deleteEvent } from "./actions.js";


export function wireStatic(ctx) {
  const { el, Store } = ctx;

   // recherche lots
  ctx.el.lotQ?.addEventListener("input", () => ctx.render());

  el.btnNewRabbit.addEventListener("click", () => {
    openModal(el, "Nouveau lapin", rabbitFormHTML(null));
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
      alert("Import réussi.");
    } catch (err) {
      alert("Import échoué : " + (err?.message || err));
    } finally {
      el.fileImport.value = "";
    }
  });

  el.btnReset.addEventListener("click", () => {
    if (!window.confirm("Tout supprimer ? (lapins + événements)")) return;
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


}

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
    node.addEventListener("click", () => {
      const id = node.dataset.openRabbit;
      if (!id) return;
      ctx.selectedRabbitId = id;
      ctx.selectedGeneRabbitId = id;
      ctx.render();
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

  const btnEdit = document.getElementById("btnEditRabbit");
  if (btnEdit) {
    btnEdit.addEventListener("click", () => {
      const r = ctx.state.rabbits.find(x => x.id === ctx.selectedRabbitId);
      if (!r) return;
      openModal(el, "Modifier lapin", rabbitFormHTML(r));
      wireRabbitForm(ctx, r);
    });
  }

  const btnDel = document.getElementById("btnDeleteRabbit");
  if (btnDel) {
    btnDel.addEventListener("click", () => {
      const r = ctx.state.rabbits.find(x => x.id === ctx.selectedRabbitId);
      if (!r) return;
      if (!window.confirm(`Supprimer ${r.name} (${r.code}) ?`)) return;
      deleteRabbit(ctx, r.id);
    });
  }

  const btnAddEvent = document.getElementById("btnAddEvent") || document.getElementById("btnAddEvent2");
  if (btnAddEvent) {
    btnAddEvent.addEventListener("click", () => {
      if (!ctx.selectedRabbitId) return;
      openModal(el, "Ajouter un événement", eventFormHTML());
      wireEventForm(ctx);
    });
  }

  el.eventsPanel.querySelectorAll("[data-del-event]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.delEvent;
      if (!window.confirm("Supprimer cet événement ?")) return;
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

  // bouton "voir la mère" depuis détails lot (sans import dynamique)
    const btnOpenDoe = document.getElementById("btnOpenDoe");
    if (btnOpenDoe) {
    btnOpenDoe.addEventListener("click", () => {
        if (!ctx.selectedLotId) return;

        // selectedLotId = "lot_<eventId>"
        const eventId = ctx.selectedLotId.replace("lot_", "");
        const ev = ctx.state.events.find(e => e.id === eventId);
        if (!ev) return;

        ctx.selectedRabbitId = ev.rabbitId; // la mère
        ctx.render();
    });
    }


}

/* -------- Forms HTML + wiring -------- */

function rabbitFormHTML(rabbit=null) {
  const r = rabbit || {};
  return `
    <form id="rabbitForm" class="form">
      <div class="row2">
        <div class="field">
          <div class="label">Code / Identifiant</div>
          <input class="input" name="code" placeholder="ex: CW-F001" value="${escapeAttr(r.code || "")}">
        </div>
        <div class="field">
          <div class="label">Nom</div>
          <input class="input" name="name" placeholder="ex: Naya" value="${escapeAttr(r.name || "")}">
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
          <input class="input" name="birthDate" type="date" value="${escapeAttr((r.birthDate || "").slice(0,10))}">
        </div>
        <div class="field">
          <div class="label">Cage</div>
          <input class="input" name="cage" placeholder="ex: A-03" value="${escapeAttr(r.cage || "")}">
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

      <div class="field">
        <div class="label">Notes</div>
        <textarea class="input" name="notes" placeholder="Observations...">${escapeHTML(r.notes || "")}</textarea>
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
  cancel?.addEventListener("click", () => closeModal(ctx.el));

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());
    data.sex = (data.sex || "U").toString();
    data.status = (data.status || "actif").toString();
    data.birthDate = (data.birthDate || "").toString();

    try {
      if (existingRabbit) updateRabbit(ctx, existingRabbit.id, data);
      else addRabbit(ctx, data);

      closeModal(ctx.el);
    } catch (err) {
      alert(err?.message || String(err));
    }

  });
}

function eventFormHTML() {
  const today = new Date().toISOString().slice(0,10);
  return `
    <form id="eventForm" class="form">
      <div class="row2">
        <div class="field">
          <div class="label">Type</div>
          <select class="input" name="type" id="evType">
            <option value="saillie">Saillie</option>
            <option value="mise_bas">Mise-bas</option>
            <option value="sevrage">Sevrage</option>
            <option value="vaccin">Vaccin</option>
            <option value="traitement">Traitement</option>
            <option value="pesée">Pesée</option>
            <option value="vente">Vente</option>
            <option value="décès">Décès</option>
            <option value="autre" selected>Autre</option>
          </select>
        </div>
        <div class="field">
          <div class="label">Date</div>
          <input class="input" type="date" name="date" value="${today}">
        </div>
      </div>

      <div id="evExtra"></div>

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
          <input class="input" name="born" type="number" min="0" placeholder="ex: 8">
        </div>
        <div class="field">
          <div class="label">Vivants</div>
          <input class="input" name="alive" type="number" min="0" placeholder="ex: 7">
        </div>
      </div>
      <div class="field">
        <div class="label">Morts (optionnel)</div>
        <input class="input" name="dead" type="number" min="0" placeholder="ex: 1">
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
          <input class="input" name="destCage" placeholder="ex: C-04">
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
      alert(message);
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
    bindExtraHandlers(typeSel.value, submitBtn, showError);
    typeSel.addEventListener("change", () => {
      extra.innerHTML = renderEventExtra(ctx, typeSel.value);
      bindExtraHandlers(typeSel.value, submitBtn, showError);
      clearError();
    });
  }
  dateInput?.addEventListener("change", () => {
    refreshAllowedTypes();
    clearError();
  });

  form?.addEventListener("submit", (e) => {
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

    const evData = {};
    if (type === "mise_bas") {
      evData.born = numOrNull(data.born);
      evData.alive = num(data.alive);
      evData.dead = num(data.dead);
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


    const draft = { type, date, notes, data: evData };

    try {
      addEvent(ctx, ctx.selectedRabbitId, draft);
      closeModal(ctx.el);
    } catch (err) {
      const msg = err?.message || String(err);
      showError(msg);
      isSubmitting = false;
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
  });
}

function bindExtraHandlers(type, submitBtn, showError) {
  if (submitBtn && type !== "saillie") {
    submitBtn.disabled = false;
  }
  if (type === "mise_bas") {
    const aliveInput = document.querySelector('input[name="alive"]');
    const hint = document.getElementById("kitHint");
    if (!aliveInput || !hint) return;

    const updateHint = () => {
      const alive = num(aliveInput.value);
      if (alive > 0) {
        hint.textContent = `${alive} lapereaux seront créés.`;
        hint.hidden = false;
      } else {
        hint.textContent = "";
        hint.hidden = true;
      }
    };

    aliveInput.addEventListener("input", updateHint);
    updateHint();
  }

  if (type === "saillie") {
    const maleSelect = document.querySelector('select[name="maleId"]');
    if (!maleSelect) return;
    const hasMales = maleSelect.querySelectorAll("option").length > 1;
    if (!hasMales) {
      if (submitBtn) submitBtn.disabled = true;
      showError?.("Saillie : aucun mâle actif disponible.");
    } else if (submitBtn) {
      submitBtn.disabled = false;
    }
  }
}

function refreshAllowedTypes() {
  // Placeholder: ancienne logique supprimée, on garde le hook pour éviter les erreurs.
}
