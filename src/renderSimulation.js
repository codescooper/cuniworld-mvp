import { openModal, closeModal } from "./modal.js";
import { showToast, showConfirm } from "./notifications.js";
import { generateSimulation, isSimulationState, SIMULATION_DEFAULTS } from "./simulation.js";
import { Store } from "./store.js";

function _formHTML() {
  const p = SIMULATION_DEFAULTS;
  return `
    <div class="muted small" style="margin-bottom:12px">
      Génère un élevage fictif (bâtiments, loges, reproducteurs, mises-bas, lots,
      stock, tournée) cohérent à la date du jour. <strong>Aucune donnée n'est envoyée
      au cloud.</strong>
    </div>
    <div class="row" style="gap:8px">
      <div class="field" style="flex:1">
        <div class="label">Bâtiments</div>
        <input id="simBuildings" class="input" type="number" min="1" max="6" value="${p.buildings}" />
      </div>
      <div class="field" style="flex:1">
        <div class="label">Loges / bâtiment</div>
        <input id="simLodges" class="input" type="number" min="2" max="20" value="${p.lodgesPerBuilding}" />
      </div>
    </div>
    <div class="row" style="gap:8px">
      <div class="field" style="flex:1">
        <div class="label">Femelles reproductrices</div>
        <input id="simDoes" class="input" type="number" min="1" max="30" value="${p.does}" />
      </div>
      <div class="field" style="flex:1">
        <div class="label">Mâles reproducteurs</div>
        <input id="simBucks" class="input" type="number" min="1" max="10" value="${p.bucks}" />
      </div>
    </div>
    <div class="row" style="gap:8px">
      <div class="field" style="flex:1">
        <div class="label">Mois d'historique</div>
        <input id="simMonths" class="input" type="number" min="1" max="18" value="${p.monthsHistory}" />
      </div>
      <div class="field" style="flex:1">
        <div class="label">Graine aléatoire</div>
        <input id="simSeed" class="input" type="number" min="1" value="${p.seed}" />
      </div>
    </div>
    <div id="simError" style="color:var(--color-danger);font-size:.85rem;min-height:1em;margin-top:4px"></div>
    <div class="row" style="margin-top:16px;gap:8px">
      <button class="btn secondary" id="simCancel" style="flex:1">Annuler</button>
      <button class="btn" id="simRun" style="flex:2">Générer la simulation</button>
    </div>`;
}

export async function openSimulationModal(ctx) {
  // Une simulation ne peut PAS coexister avec une vraie ferme cloud.
  if (ctx.farmId) {
    showToast("La simulation est désactivée en mode ferme cloud. Déconnectez-vous d'abord.", "error");
    return;
  }

  // Si l'utilisateur a déjà des données locales, demander confirmation.
  const hasData = (ctx.state.rabbits || []).length > 0
               || (ctx.state.buildings || []).length > 0
               || (ctx.state.events || []).length > 0;
  if (hasData && !isSimulationState(ctx.state)) {
    const ok = await showConfirm({
      title: "Démarrer une simulation",
      message: "Vos données locales actuelles seront remplacées par la simulation. Une sauvegarde automatique sera créée. Continuer ?",
      confirmLabel: "Continuer", cancelLabel: "Annuler", danger: true,
    });
    if (!ok) return;
  }

  openModal(ctx.el, "🧪 Mode Simulation", _formHTML());
  document.getElementById("simCancel")?.addEventListener("click", () => closeModal(ctx.el));
  document.getElementById("simRun")?.addEventListener("click", () => {
    const params = {
      buildings:         parseInt(document.getElementById("simBuildings")?.value),
      lodgesPerBuilding: parseInt(document.getElementById("simLodges")?.value),
      does:              parseInt(document.getElementById("simDoes")?.value),
      bucks:             parseInt(document.getElementById("simBucks")?.value),
      monthsHistory:     parseInt(document.getElementById("simMonths")?.value),
      seed:              parseInt(document.getElementById("simSeed")?.value),
    };
    const errEl = document.getElementById("simError");
    try {
      // Backup explicite avant remplacement (réutilise la sauvegarde reset).
      if (hasData) Store.reset();
      const simState = generateSimulation(params);
      ctx.state = Store.save(simState);
      ctx.selectedRabbitId = null;
      ctx.selectedLotId = null;
      ctx.selectedGeneRabbitId = null;
      closeModal(ctx.el);
      ctx.render();
      showToast(`Simulation générée : ${simState.rabbits.length} lapins, ${simState.events.length} événements.`, "success");
    } catch (err) {
      if (errEl) errEl.textContent = err?.message || "Erreur de génération.";
    }
  });
}

export async function exitSimulation(ctx) {
  if (!isSimulationState(ctx.state)) return;
  const ok = await showConfirm({
    title: "Quitter la simulation",
    message: "Toutes les données de simulation seront supprimées (une sauvegarde sera créée). Continuer ?",
    confirmLabel: "Quitter", danger: true,
  });
  if (!ok) return;
  ctx.state = Store.reset();
  ctx.selectedRabbitId = null;
  ctx.selectedLotId = null;
  ctx.selectedGeneRabbitId = null;
  ctx.render();
  showToast("Simulation supprimée.", "success");
}
