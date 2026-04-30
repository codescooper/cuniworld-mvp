// app.js (racine)
import { Store } from "./src/store.js";
import { getEls } from "./src/dom.js";
import { renderAll } from "./src/render.js";
import { wireStatic, wireDynamic } from "./src/wire.js";
import { GUIDE_STEPS, getGuideStep, getNextStep, getPrevStep } from "./src/guide.js";

const el = getEls();

const ctx = {
  Store,
  el,
  state: Store.load(),
  selectedRabbitId: null,
  selectedLotId: null,
  selectedGeneRabbitId: null,
  openPanels: new Set(),
  guideMode: false,
  currentStep: null,
  completedSteps: new Set(),

  render: () => {
    renderAll(ctx);
    wireDynamic(ctx);
    wireGuide(ctx);
    syncMenuCards();
    // Ouvre automatiquement le panneau lapins quand un lapin est sélectionné
    if (ctx.selectedRabbitId && !ctx.openPanels.has("rabbits")) {
      openPanel("rabbits");
    }
  },
};

// ================================================================
// SEED INITIAL
// ================================================================
function seedIfEmpty() {
  if (ctx.state.rabbits.length > 0) return;
  const { uid, nowISO } = Store.helpers;

  const a = {
    id: uid("rb"), code: "CW-F001", name: "Naya", sex: "F",
    breed: "Néo-zélandais", birthDate: "2025-11-20", cage: "A-01",
    status: "actif", notes: "Bonne mère, calme.",
    createdAt: nowISO(), updatedAt: nowISO(),
  };
  const b = {
    id: uid("rb"), code: "CW-M002", name: "Koda", sex: "M",
    breed: "Californien", birthDate: "2025-10-12", cage: "B-02",
    status: "actif", notes: "Reproducteur.",
    createdAt: nowISO(), updatedAt: nowISO(),
  };

  ctx.state.rabbits = [a, b];
  ctx.state.events = [
    { id: uid("ev"), rabbitId: a.id, type: "vaccin",     date: "2026-01-10", notes: "Rappel",         data: {},                      createdAt: nowISO() },
    { id: uid("ev"), rabbitId: a.id, type: "mise_bas",   date: "2026-01-12", notes: "Première portée", data: { born: 8, alive: 7, dead: 1 }, createdAt: nowISO() },
    { id: uid("ev"), rabbitId: b.id, type: "traitement", date: "2026-01-08", notes: "Vermifuge",        data: {},                      createdAt: nowISO() },
  ];

  ctx.state = Store.save(ctx.state);
}

// ================================================================
// SYSTÈME DE PANNEAUX
// ================================================================

/** Ouvre un panneau (sans effet si déjà ouvert). */
function openPanel(name) {
  if (ctx.openPanels.has(name)) return;
  ctx.openPanels.add(name);

  const panel = document.getElementById(`panel-${name}`);
  if (panel) {
    panel.classList.remove("panel-closing");
    panel.style.display = "";
    void panel.offsetWidth; // force reflow pour rejouer l'animation
  }

  syncMenuCards();
  syncEmptyState();
  savePanelState();
}

/** Ferme un panneau avec animation. */
function closePanel(name) {
  if (!ctx.openPanels.has(name)) return;
  ctx.openPanels.delete(name);

  const panel = document.getElementById(`panel-${name}`);
  if (panel) {
    panel.classList.add("panel-closing");
    setTimeout(() => {
      if (panel.classList.contains("panel-closing")) {
        panel.style.display = "none";
        panel.classList.remove("panel-closing");
      }
    }, 220);
  }

  syncMenuCards();
  syncEmptyState();
  savePanelState();
}

/** Bascule l'état d'un panneau. */
function togglePanel(name) {
  if (ctx.openPanels.has(name)) closePanel(name);
  else                           openPanel(name);
}

/** Met à jour l'état visuel des cartes du menu. */
function syncMenuCards() {
  document.querySelectorAll(".menu-card[data-panel]").forEach(card => {
    card.classList.toggle("active", ctx.openPanels.has(card.dataset.panel));
  });
}

/** Affiche/masque l'état vide selon le nombre de panneaux ouverts. */
function syncEmptyState() {
  const empty = document.getElementById("emptyState");
  if (empty) empty.style.display = ctx.openPanels.size === 0 ? "" : "none";
}

/** Persiste la liste des panneaux ouverts. */
function savePanelState() {
  try { localStorage.setItem("openPanels", JSON.stringify([...ctx.openPanels])); } catch (_) {}
}

// ================================================================
// CÂBLAGE DU MENU ET DES PANNEAUX (une seule fois à l'init)
// ================================================================
function wireMenuCards() {
  // Clics sur les cartes du menu → toggle panneau
  document.querySelectorAll(".menu-card[data-panel]").forEach(card => {
    card.addEventListener("click", () => togglePanel(card.dataset.panel));
  });

  // Délégation : boutons de fermeture dans les panneaux
  document.getElementById("panelsContainer")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-close-panel]");
    if (btn) closePanel(btn.dataset.closePanel);
  });

  // Auto-bascule vers le panneau lapins quand on clique sur un lapin
  // (sur desktop aussi, pour ouvrir le panneau si fermé)
  document.addEventListener("click", e => {
    if (e.target.closest("[data-open-rabbit]") && !ctx.openPanels.has("rabbits")) {
      openPanel("rabbits");
    }
  });

  // Restaure les panneaux sauvegardés
  try {
    const saved = JSON.parse(localStorage.getItem("openPanels") || "[]");
    saved.forEach(name => openPanel(name));
  } catch (_) {}

  syncEmptyState();
}

// ================================================================
// CÂBLAGE DU GUIDE
// ================================================================
function wireGuide(ctx) {
  const guideToggle = document.getElementById("guideToggle");
  const guideOverlay = document.getElementById("guideOverlay");
  const guideClose   = document.getElementById("guideClose");
  const guidePrev    = document.getElementById("guidePrev");
  const guideNext    = document.getElementById("guideNext");

  if (!guideToggle) return;

  guideToggle.addEventListener("change", () => {
    if (guideToggle.checked) {
      ctx.guideMode = true;
      ctx.currentStep = GUIDE_STEPS[0].id;
      ctx.completedSteps.clear();
      updateGuideDisplay();
    } else {
      ctx.guideMode = false;
      guideOverlay.classList.add("hidden");
    }
  });

  guideClose?.addEventListener("click", () => {
    guideToggle.checked = false;
    ctx.guideMode = false;
    guideOverlay.classList.add("hidden");
  });

  guidePrev?.addEventListener("click", () => {
    const prev = getPrevStep(ctx.currentStep);
    if (prev) { ctx.currentStep = prev.id; updateGuideDisplay(); }
  });

  guideNext?.addEventListener("click", () => {
    const next = getNextStep(ctx.currentStep);
    ctx.completedSteps.add(ctx.currentStep);
    if (next) {
      ctx.currentStep = next.id;
      updateGuideDisplay();
    } else {
      ctx.guideMode = false;
      guideToggle.checked = false;
      guideOverlay.classList.add("hidden");
    }
  });

  function updateGuideDisplay() {
    const step = getGuideStep(ctx.currentStep);
    if (!step) return;

    const stepIdx  = GUIDE_STEPS.findIndex(s => s.id === step.id);
    const progress = ((stepIdx + 1) / GUIDE_STEPS.length) * 100;

    const guideTitle       = document.getElementById("guideTitle");
    const guideStepNumber  = document.getElementById("guideStepNumber");
    const guideDescription = document.getElementById("guideDescription");

    if (guideTitle)       guideTitle.textContent       = step.title;
    if (guideStepNumber)  guideStepNumber.textContent  = `Étape ${stepIdx + 1}/${GUIDE_STEPS.length}`;
    if (guideDescription) guideDescription.textContent = step.description;

    const progressBar = document.querySelector(".guide-progress");
    if (progressBar) progressBar.style.setProperty("--progress", `${progress}%`);

    if (step.highlight) {
      const target = document.querySelector(step.highlight);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    const prevBtn = document.getElementById("guidePrev");
    const nextBtn = document.getElementById("guideNext");
    if (prevBtn) prevBtn.style.display = stepIdx > 0 ? "" : "none";
    if (nextBtn) nextBtn.textContent   = stepIdx === GUIDE_STEPS.length - 1 ? "Terminer ✓" : "Suivant →";

    guideOverlay.classList.remove("hidden");
  }
}

// ================================================================
// CÂBLAGE DES BOUTONS EXTRA (FAB + panneau Actions)
// ================================================================
function wireExtra() {
  // FAB mobile → nouveau lapin
  document.getElementById("fabNewRabbit")?.addEventListener("click", () => {
    ctx.el.btnNewRabbit?.click();
  });

  // Panneau Actions → nouveau lapin
  document.getElementById("moreNewRabbit")?.addEventListener("click", () => {
    ctx.el.btnNewRabbit?.click();
  });

  // Panneau Actions → exporter
  document.getElementById("moreExport")?.addEventListener("click", () => {
    ctx.el.btnExport?.click();
  });

  // Panneau Actions → importer
  document.getElementById("moreFileImport")?.addEventListener("change", async e => {
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
      e.target.value = "";
    }
  });

  // Panneau Actions → réinitialiser
  document.getElementById("moreReset")?.addEventListener("click", () => {
    ctx.el.btnReset?.click();
  });

  // Panneau Actions → guide toggle
  document.getElementById("moreGuideToggle")?.addEventListener("change", e => {
    const master = document.getElementById("guideToggle");
    if (master) {
      master.checked = e.target.checked;
      master.dispatchEvent(new Event("change"));
    }
  });
}

// ================================================================
// INITIALISATION
// ================================================================
wireStatic(ctx);
wireMenuCards();
wireExtra();

const isE2E = new URLSearchParams(window.location.search).has("e2e");
if (!isE2E) {
  seedIfEmpty();
} else {
  // Mode E2E : ouvre les panneaux clés pour que les tests accèdent au contenu
  ["dashboard", "rabbits"].forEach(openPanel);
}

ctx.render();
