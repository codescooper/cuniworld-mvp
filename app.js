import { Store } from "./src/store.js";
import { getEls } from "./src/dom.js";
import { renderAll } from "./src/render.js";
import { wireStatic, wireDynamic } from "./src/wire.js";
import { GUIDE_STEPS, getGuideStep, getNextStep, getPrevStep } from "./src/guide.js";
import { openWeightCheckModal } from "./src/weightCheck.js";
import { openPhotoCheckModal } from "./src/photoCheck.js";

const el = getEls();

const ctx = {
  Store,
  el,
  state:      Store.load(),   // cache local — remplacé par Supabase après auth
  farmId:     null,
  farmName:   null,
  currentUser: null,
  selectedRabbitId:     null,
  selectedLotId:        null,
  selectedGeneRabbitId: null,
  openPanels:    new Set(),
  guideMode:     false,
  currentStep:   null,
  completedSteps: new Set(),

  render: () => {
    renderAll(ctx);
    wireDynamic(ctx);
    wireGuide(ctx);
    syncMenuCards();
    if (ctx.selectedRabbitId && !ctx.openPanels.has("rabbits")) {
      openPanel("rabbits");
    }
  },
};

// ================================================================
// SEED INITIAL (mode hors-ligne uniquement)
// ================================================================
function seedIfEmpty() {
  if (ctx.state.rabbits.length > 0 || ctx.farmId) return;
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
  ctx.state.events  = [
    { id: uid("ev"), rabbitId: a.id, type: "vaccin",    date: "2026-01-10", notes: "Rappel",          data: {},                           createdAt: nowISO() },
    { id: uid("ev"), rabbitId: a.id, type: "mise_bas",  date: "2026-01-12", notes: "Première portée", data: { born: 8, alive: 7, dead: 1 }, createdAt: nowISO() },
    { id: uid("ev"), rabbitId: b.id, type: "traitement",date: "2026-01-08", notes: "Vermifuge",        data: {},                           createdAt: nowISO() },
  ];
  ctx.state = Store.save(ctx.state);
}

// ================================================================
// PANNEAUX
// ================================================================
function openPanel(name) {
  if (ctx.openPanels.has(name)) return;
  ctx.openPanels.add(name);
  const panel = document.getElementById(`panel-${name}`);
  if (panel) {
    panel.classList.remove("panel-closing");
    panel.style.display = "";
    void panel.offsetWidth;
  }
  syncMenuCards();
  syncEmptyState();
  savePanelState();
}

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

function togglePanel(name) {
  if (ctx.openPanels.has(name)) closePanel(name); else openPanel(name);
}

function syncMenuCards() {
  document.querySelectorAll(".menu-card[data-panel]").forEach(card => {
    card.classList.toggle("active", ctx.openPanels.has(card.dataset.panel));
  });
}

function syncEmptyState() {
  const empty = document.getElementById("emptyState");
  if (empty) empty.style.display = ctx.openPanels.size === 0 ? "" : "none";
}

function savePanelState() {
  try { localStorage.setItem("openPanels", JSON.stringify([...ctx.openPanels])); } catch (_) {}
}

// ================================================================
// MENU
// ================================================================
function wireMenuCards() {
  document.querySelectorAll(".menu-card[data-panel]").forEach(card => {
    card.addEventListener("click", () => togglePanel(card.dataset.panel));
  });

  document.getElementById("panelsContainer")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-close-panel]");
    if (btn) closePanel(btn.dataset.closePanel);
  });

  document.addEventListener("click", e => {
    if (e.target.closest("[data-open-rabbit]") && !ctx.openPanels.has("rabbits")) {
      openPanel("rabbits");
    }
  });

  try {
    const saved = JSON.parse(localStorage.getItem("openPanels") || "[]");
    saved.forEach(name => openPanel(name));
  } catch (_) {}

  syncEmptyState();
}

// ================================================================
// GUIDE
// ================================================================
function wireGuide(ctx) {
  const guideToggle = document.getElementById("guideToggle");
  const guideOverlay = document.getElementById("guideOverlay");
  if (!guideToggle) return;

  guideToggle.addEventListener("change", () => {
    if (guideToggle.checked) {
      ctx.guideMode    = true;
      ctx.currentStep  = GUIDE_STEPS[0].id;
      ctx.completedSteps.clear();
      updateGuideDisplay();
    } else {
      ctx.guideMode = false;
      guideOverlay.classList.add("hidden");
    }
  });

  document.getElementById("guideClose")?.addEventListener("click", () => {
    guideToggle.checked = false;
    ctx.guideMode = false;
    guideOverlay.classList.add("hidden");
  });

  document.getElementById("guidePrev")?.addEventListener("click", () => {
    const prev = getPrevStep(ctx.currentStep);
    if (prev) { ctx.currentStep = prev.id; updateGuideDisplay(); }
  });

  document.getElementById("guideNext")?.addEventListener("click", () => {
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

    const guideTitle = document.getElementById("guideTitle");
    const guideStepNumber = document.getElementById("guideStepNumber");
    const guideDescription = document.getElementById("guideDescription");
    if (guideTitle) guideTitle.textContent = step.title;
    if (guideStepNumber) guideStepNumber.textContent = `Étape ${stepIdx + 1}/${GUIDE_STEPS.length}`;
    if (guideDescription) guideDescription.textContent = step.description;

    const pb = document.querySelector(".guide-progress");
    if (pb) pb.style.setProperty("--progress", `${progress}%`);
    if (step.highlight) document.querySelector(step.highlight)?.scrollIntoView({ behavior: "smooth", block: "nearest" });

    const prevBtn = document.getElementById("guidePrev");
    const nextBtn = document.getElementById("guideNext");
    if (prevBtn) prevBtn.style.display = stepIdx > 0 ? "" : "none";
    if (nextBtn) nextBtn.textContent   = stepIdx === GUIDE_STEPS.length - 1 ? "Terminer ✓" : "Suivant →";

    guideOverlay.classList.remove("hidden");
  }
}

// ================================================================
// BOUTONS EXTRA (FAB + panneau Actions)
// ================================================================
function wireExtra() {
  document.getElementById("fabNewRabbit")?.addEventListener("click", () => ctx.el.btnNewRabbit?.click());
  document.getElementById("moreNewRabbit")?.addEventListener("click", () => ctx.el.btnNewRabbit?.click());
  document.getElementById("moreExport")?.addEventListener("click", () => ctx.el.btnExport?.click());

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
    } finally { e.target.value = ""; }
  });

  document.getElementById("morePhotoCheck")?.addEventListener("click", () => openPhotoCheckModal(ctx));
  document.getElementById("moreWeightCheck")?.addEventListener("click", () => openWeightCheckModal(ctx));
  document.getElementById("moreReset")?.addEventListener("click", () => ctx.el.btnReset?.click());

  document.getElementById("moreGuideToggle")?.addEventListener("change", e => {
    const master = document.getElementById("guideToggle");
    if (master) { master.checked = e.target.checked; master.dispatchEvent(new Event("change")); }
  });
}

// ================================================================
// INITIALISATION
// ================================================================
const isE2E = new URLSearchParams(window.location.search).has("e2e");

// En mode E2E (tests Playwright) ou si les variables Supabase sont absentes,
// on saute l'auth et on lance l'app directement en mode local.
const viteEnv = import.meta?.env ?? {};
const supabaseConfigured =
  viteEnv.VITE_SUPABASE_URL?.startsWith("https://") &&
  (viteEnv.VITE_SUPABASE_ANON_KEY?.length ?? 0) > 20;

wireMenuCards();
wireExtra();
wireStatic(ctx);

if (!supabaseConfigured || isE2E) {
  // Mode hors-ligne / tests
  const authOverlay = document.getElementById("authOverlay");
  if (authOverlay) {
    authOverlay.classList.add("hidden");
    authOverlay.innerHTML = "";
  }
  if (!isE2E) seedIfEmpty();
  else ["dashboard", "rabbits", "lots"].forEach(openPanel);
  ctx.render();
} else {
  // Mode collaboratif : auth Supabase
  import("./src/wireAuth.js").then(({ bootWithAuth }) => {
    bootWithAuth(ctx, () => {
      // Callback appelé une fois la ferme chargée (et re-appelé si changement de ferme)
      ctx.render();
    });
  }).catch((err) => {
    console.error("Impossible de charger l'auth Supabase:", err);
    alert("Mode collaboratif indisponible. Vérifiez le build Vite et la configuration Supabase.");
  });
}
