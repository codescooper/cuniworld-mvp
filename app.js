import { Store } from "./src/store.js";
import { getEls } from "./src/dom.js";
import { renderAll } from "./src/render.js";
import { wireStatic, wireDynamic } from "./src/wire.js";
import { GUIDE_STEPS, getGuideStep, getNextStep, getPrevStep } from "./src/guide.js";
import { openWeightCheckModal } from "./src/weightCheck.js";
import { openPhotoCheckModal } from "./src/photoCheck.js";
import { getReminders } from "./src/health.js";

const el = getEls();

const PANELS = ["dashboard", "rabbits", "lots", "genealogy", "actions"];

const ctx = {
  Store,
  el,
  state:      Store.load(),
  farmId:     null,
  farmName:   null,
  currentUser: null,
  selectedRabbitId:     null,
  selectedLotId:        null,
  selectedGeneRabbitId: null,
  activePanel:   "dashboard",
  guideMode:     false,
  currentStep:   null,
  completedSteps: new Set(),

  render: () => {
    renderAll(ctx);
    wireDynamic(ctx);
    updateNavBadges(ctx);
    if (ctx.selectedRabbitId && ctx.activePanel !== "rabbits") {
      setActivePanel("rabbits");
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
// NAVIGATION — panneau unique actif
// ================================================================
function setActivePanel(name) {
  const prev = ctx.activePanel;
  if (prev === name) { ctx.render(); return; }

  document.getElementById(`panel-${prev}`)?.classList.remove("panel-active");
  document.querySelector(`.nav-item[data-panel="${prev}"]`)?.classList.remove("active");

  ctx.activePanel = name;

  document.getElementById(`panel-${name}`)?.classList.add("panel-active");
  document.querySelector(`.nav-item[data-panel="${name}"]`)?.classList.add("active");

  try { localStorage.setItem("cuniworld_active_panel", name); } catch (_) {}
  ctx.render();
}

function updateNavBadges(ctx) {
  try {
    const { overdue } = getReminders(ctx.state, { windowDays: 7 });
    const badge = document.getElementById("badge-dashboard");
    if (badge) badge.textContent = overdue.length > 0 ? String(overdue.length) : "";
  } catch (_) {}
}

function wireNav() {
  document.querySelectorAll(".nav-item[data-panel]").forEach(item => {
    item.addEventListener("click", () => setActivePanel(item.dataset.panel));
  });

  // data-open-rabbit links basculent vers le panneau lapins
  document.addEventListener("click", e => {
    if (e.target.closest("[data-open-rabbit]") && ctx.activePanel !== "rabbits") {
      setActivePanel("rabbits");
    }
  });
}

// ================================================================
// GUIDE
// ================================================================
function wireGuide(ctx) {
  const guideToggle  = document.getElementById("guideToggle");
  const guideOverlay = document.getElementById("guideOverlay");
  if (!guideToggle) return;

  guideToggle.addEventListener("change", () => {
    if (guideToggle.checked) {
      ctx.guideMode   = true;
      ctx.currentStep = GUIDE_STEPS[0].id;
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

    const guideTitle       = document.getElementById("guideTitle");
    const guideStepNumber  = document.getElementById("guideStepNumber");
    const guideDescription = document.getElementById("guideDescription");
    if (guideTitle)       guideTitle.textContent       = step.title;
    if (guideStepNumber)  guideStepNumber.textContent  = `Étape ${stepIdx + 1}/${GUIDE_STEPS.length}`;
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
// BOUTONS EXTRA (panneau Actions)
// ================================================================
function wireExtra() {
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
const params     = new URLSearchParams(window.location.search);
const isE2E      = params.has("e2e");
const joinFarmId = params.get("join") || null;

const viteEnv = import.meta.env;
const supabaseConfigured =
  viteEnv.VITE_SUPABASE_URL?.startsWith("https://") &&
  (viteEnv.VITE_SUPABASE_ANON_KEY?.length ?? 0) > 20;

const savedPanel = (() => {
  try {
    const p = localStorage.getItem("cuniworld_active_panel");
    return PANELS.includes(p) ? p : "dashboard";
  } catch (_) { return "dashboard"; }
})();

wireNav();
wireExtra();
wireStatic(ctx);
wireGuide(ctx);

if (!supabaseConfigured || isE2E) {
  const authOverlay = document.getElementById("authOverlay");
  if (authOverlay) {
    authOverlay.style.display = "none";
    authOverlay.setAttribute("aria-hidden", "true");
    authOverlay.innerHTML = "";
  }
  if (!isE2E) {
    seedIfEmpty();
    setActivePanel(savedPanel);
  } else {
    setActivePanel("dashboard");
  }
} else {
  import("./src/wireAuth.js").then(({ bootWithAuth }) => {
    bootWithAuth(ctx, () => setActivePanel(savedPanel), joinFarmId);
  }).catch((err) => {
    console.error("[CuniWorld] Impossible de charger l'auth Supabase:", err);
    const authOverlay = document.getElementById("authOverlay");
    if (authOverlay) { authOverlay.style.display = "none"; authOverlay.innerHTML = ""; }
    seedIfEmpty();
    setActivePanel(savedPanel);
  });
}
