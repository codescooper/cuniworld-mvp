import { Store } from "./src/store.js";
import { getEls } from "./src/dom.js";
import { renderAll } from "./src/render.js";
import { wireStatic, wireDynamic } from "./src/wire.js";
import { GUIDE_STEPS, getGuideStep, getNextStep, getPrevStep } from "./src/guide.js";
import { openWeightCheckModal } from "./src/weightCheck.js";
import { openPhotoCheckModal } from "./src/photoCheck.js";
import { getReminders } from "./src/health.js";
import { hydrateAndMigratePhotos } from "./src/photoStorage.js";
import { exportRabbitsCSV, exportEventsCSV } from "./src/csvExport.js";
import { createSyncManager } from "./src/syncManager.js";
import { getPendingMutationCount, replayMutationQueue } from "./src/mutationQueue.js";
import { showToast, showConfirm } from "./src/notifications.js";
import { supabaseConfigured } from "./src/supabase.js";
import {
  registerServiceWorker,
  requestNotificationPermission,
  checkAndFireNotifications,
  notificationsGranted,
  notificationsSupported,
  permissionAlreadyAsked,
} from "./src/pushNotifications.js";
import { openAddStockModal } from "./src/renderStock.js";
import { openTourneeModal, _updateTourneeLabel } from "./src/renderTournee.js";
import { openAddBuildingModal, openQuickSetupModal } from "./src/renderBuildings.js";

const el = getEls();

const PANELS = ["dashboard", "rabbits", "lots", "genealogy", "batiments", "magasin", "stats", "actions", "aide"];

const ctx = {
  Store,
  el,
  state:      Store.load(),
  farmId:     null,
  farmName:   null,
  currentUser: null,
  syncStatus: "local",
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
    updateSyncBadge(ctx);
    renderBackupList(ctx);
    try { _updateTourneeLabel(ctx.state); } catch(_) {}
    updateStockBadge(ctx);
    updateBuildingsBadge(ctx);
  },
  setSyncStatus: (status) => {
    const allowed = new Set(["local", "syncing", "synced", "error"]);
    ctx.syncStatus = allowed.has(status) ? status : "local";
    updateSyncBadge(ctx);
  },
  updatePendingMutations: () => updateSyncBadge(ctx),
};
ctx.syncManager = createSyncManager((status) => ctx.setSyncStatus(status));

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
ctx.navigate = (panel) => setActivePanel(panel);

function updateNavBadges(ctx) {
  try {
    const { overdue } = getReminders(ctx.state, { windowDays: 7 });
    const badge = document.getElementById("badge-dashboard");
    if (badge) badge.textContent = overdue.length > 0 ? String(overdue.length) : "";
  } catch (_) {}
}

function updateBuildingsBadge(ctx) {
  try {
    const openDefects = (ctx.state.lodgeDefects || []).filter(d => d.status === 'ouvert').length;
    const badge = document.getElementById("badge-batiments");
    if (badge) badge.textContent = openDefects > 0 ? String(openDefects) : "";
  } catch (_) {}
}

function updateStockBadge(ctx) {
  try {
    const { getLowStockItems } = ctx._stockService || {};
    // Dynamic import-free check via the already-loaded state
    const lowCount = (ctx.state.stock || []).filter(
      item => item.minQuantity > 0 && item.quantity <= item.minQuantity
    ).length;
    const badge = document.getElementById("badge-magasin");
    if (badge) badge.textContent = lowCount > 0 ? String(lowCount) : "";
  } catch (_) {}
}

function updateSyncBadge(ctx) {
  const badge = ctx.el.syncBadge;
  if (!badge) return;
  const labels = {
    local: "Local",
    syncing: "Sync en cours",
    synced: "Synchronisé",
    error: "Erreur sync",
  };
  const status = ctx.syncStatus || "local";
  const pending = getPendingMutationCount();
  badge.className = `sync-badge ${status}`;
  const base = labels[status] || labels.local;
  badge.textContent = pending > 0 ? `${base} · ${pending} en attente` : base;
}

function wireNav() {
  document.querySelectorAll(".nav-item[data-panel]").forEach(item => {
    item.addEventListener("click", () => setActivePanel(item.dataset.panel));
  });

  // data-open-rabbit links basculent vers le panneau lapins
  document.addEventListener("click", e => {
    const target = e.target.closest("[data-open-rabbit]");
    if (!target) return;
    const rabbitId = target.dataset.openRabbit;
    if (rabbitId) ctx.selectedRabbitId = rabbitId;
    if (ctx.activePanel !== "rabbits") {
      setActivePanel("rabbits");
    } else {
      ctx.render();
    }
  });

  // Raccourcis clavier globaux
  document.addEventListener("keydown", e => {
    const tag = document.activeElement?.tagName?.toLowerCase();
    const inField = tag === "input" || tag === "textarea" || tag === "select" || document.activeElement?.isContentEditable;
    const modalOpen = !ctx.el.modal?.classList.contains("hidden");

    // Esc : fermer modal (déjà géré dans wire.js, mais on laisse pour sécurité)
    if (e.key === "Escape") return;

    // Toutes les autres touches sont ignorées si un champ est actif ou modal ouvert
    if (inField || modalOpen) return;

    // 1-5 : naviguer vers un panneau
    const panelIndex = parseInt(e.key, 10);
    if (panelIndex >= 1 && panelIndex <= PANELS.length) {
      e.preventDefault();
      setActivePanel(PANELS[panelIndex - 1]);
      return;
    }

    // N : nouveau lapin
    if (e.key === "n" || e.key === "N") {
      e.preventDefault();
      ctx.el.btnNewRabbit?.click();
      return;
    }

    // / : focus la recherche du panneau actif
    if (e.key === "/") {
      e.preventDefault();
      const searchIds = {
        rabbits:   "q",
        lots:      "lotQ",
        genealogy: "geneQ",
        dashboard: null,
        actions:   null,
      };
      const id = searchIds[ctx.activePanel];
      if (id) document.getElementById(id)?.focus();
      return;
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
  document.getElementById("moreExportRabbitsCSV")?.addEventListener("click", () => exportRabbitsCSV(ctx.state));
  document.getElementById("moreExportEventsCSV")?.addEventListener("click", () => exportEventsCSV(ctx.state));

  document.getElementById("moreFileImport")?.addEventListener("change", async e => {
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
    } finally { e.target.value = ""; }
  });

  document.getElementById("moreTournee")?.addEventListener("click", () => openTourneeModal(ctx));
  document.getElementById("btnAddStock")?.addEventListener("click", () => openAddStockModal(ctx));
  document.getElementById("btnAddBuilding")?.addEventListener("click", () => openAddBuildingModal(ctx));
  document.getElementById("btnQuickSetup")?.addEventListener("click", () => openQuickSetupModal(ctx));
  document.getElementById("morePhotoCheck")?.addEventListener("click", () => openPhotoCheckModal(ctx));
  document.getElementById("moreWeightCheck")?.addEventListener("click", () => openWeightCheckModal(ctx));
  document.getElementById("moreReset")?.addEventListener("click", () => ctx.el.btnReset?.click());
  document.getElementById("moreRetrySync")?.addEventListener("click", async () => {
    if (!ctx.farmId) return;
    const { remaining, replayed } = await replayMutationQueue();
    ctx.updatePendingMutations();
    if (remaining === 0) ctx.setSyncStatus("synced");
    showToast(`Synchronisation relancée : ${replayed} rejouée(s), ${remaining} en attente.`, "success");
  });

  // ── Notifications ────────────────────────────────────────────────────────────
  function _updateNotifLabel() {
    const label = document.getElementById('notifStatusLabel');
    if (!label) return;
    if (!notificationsSupported()) {
      label.textContent = 'Non supporté par ce navigateur';
    } else if (Notification.permission === 'granted') {
      label.textContent = 'Notifications actives — Vérifier maintenant';
    } else if (Notification.permission === 'denied') {
      label.textContent = 'Bloquées dans les paramètres du navigateur';
    } else {
      label.textContent = 'Activer les alertes élevage';
    }
  }
  _updateNotifLabel();

  document.getElementById('moreNotifications')?.addEventListener('click', async () => {
    if (!notificationsSupported()) {
      showToast('Les notifications ne sont pas supportées par ce navigateur.', 'error');
      return;
    }
    if (Notification.permission === 'denied') {
      showToast('Notifications bloquées. Modifiez les permissions dans les paramètres du navigateur.', 'error');
      return;
    }
    if (!notificationsGranted()) {
      const granted = await requestNotificationPermission();
      _updateNotifLabel();
      if (!granted) {
        showToast('Permission refusée. Les notifications restent désactivées.', 'error');
        return;
      }
      showToast('Notifications activées !', 'success');
    }
    checkAndFireNotifications(ctx.state);
    showToast('Vérification des alertes effectuée.', 'info');
  });

  document.getElementById("moreGuideToggle")?.addEventListener("change", e => {
    const master = document.getElementById("guideToggle");
    if (master) { master.checked = e.target.checked; master.dispatchEvent(new Event("change")); }
  });

  document.getElementById("backupList")?.addEventListener("click", async (e) => {
    const restoreId = e.target?.closest?.("[data-restore-backup]")?.dataset?.restoreBackup;
    const exportId = e.target?.closest?.("[data-export-backup]")?.dataset?.exportBackup;
    if (restoreId) {
      const ok = await showConfirm({ title: "Restaurer un backup", message: "Restaurer cette sauvegarde locale ?", confirmLabel: "Restaurer", cancelLabel: "Annuler" });
      if (!ok) return;
      try {
        ctx.state = Store.restoreBackup(restoreId);
        ctx.selectedRabbitId = null;
        ctx.render();
        showToast("Backup restauré.", "success");
      } catch (err) {
        showToast("Restauration impossible : " + (err?.message || err), "error");
      }
      return;
    }
    if (exportId) {
      const backups = Store.listBackups();
      const backup = backups.find((b) => b.id === exportId);
      if (!backup) return;
      const json = Store.exportJSON(backup.state || {});
      const blob = new Blob([json], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `cuniworld_backup_${(backup.createdAt || "").slice(0, 10) || "export"}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    }
  });
}

function renderBackupList(ctx) {
  const host = document.getElementById("backupList");
  if (!host) return;
  const backups = Store.listBackups().slice().reverse();
  if (!backups.length) {
    host.innerHTML = `<div class="muted">Aucune sauvegarde locale disponible.</div>`;
    return;
  }
  host.innerHTML = backups.map((b) => {
    const rabbits = Array.isArray(b?.state?.rabbits) ? b.state.rabbits.length : 0;
    const events = Array.isArray(b?.state?.events) ? b.state.events.length : 0;
    const reason = b?.reason || "—";
    const date = b?.createdAt || "—";
    return `
      <div class="item" style="display:flex;justify-content:space-between;gap:10px;align-items:center">
        <div class="small">
          <div><strong>${date}</strong> · raison: <strong>${reason}</strong></div>
          <div>${rabbits} lapin(s) · ${events} événement(s)</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn secondary" data-export-backup="${b.id}">Exporter ce backup</button>
          <button class="btn" data-restore-backup="${b.id}">Restaurer</button>
        </div>
      </div>
    `;
  }).join("");
}

// ================================================================
// INITIALISATION
// ================================================================
const params     = new URLSearchParams(window.location.search);
const isE2E      = params.has("e2e");
const joinFarmId = params.get("join") || null;

const savedPanel = (() => {
  try {
    const p = localStorage.getItem("cuniworld_active_panel");
    return PANELS.includes(p) ? p : "dashboard";
  } catch (_) { return "dashboard"; }
})();

function wireBetaBanner() {
  const banner = document.getElementById('betaBanner');
  const close  = document.getElementById('betaBannerClose');
  if (!banner || !close) return;
  // Persist dismissal across sessions
  if (localStorage.getItem('betaBannerDismissed') === '1') {
    banner.classList.add('hidden');
    return;
  }
  close.addEventListener('click', () => {
    banner.classList.add('hidden');
    try { localStorage.setItem('betaBannerDismissed', '1'); } catch (_) {}
  });
}

async function initApp() {
  registerServiceWorker().catch(() => {});
  wireBetaBanner();
  wireNav();
  wireExtra();
  wireStatic(ctx);
  wireGuide(ctx);

  try {
    await hydrateAndMigratePhotos(ctx.state);
    ctx.state = Store.save(ctx.state);
  } catch (err) {
    console.warn("[photos] Hydratation IndexedDB ignorée:", err?.message || err);
  }

  if (!supabaseConfigured || isE2E) {
    ctx.setSyncStatus("local");
    const authOverlay = document.getElementById("authOverlay");
    if (authOverlay) {
      authOverlay.style.display = "none";
      authOverlay.setAttribute("aria-hidden", "true");
      authOverlay.innerHTML = "";
    }
    if (!isE2E) {
      seedIfEmpty();
      setActivePanel(savedPanel);
      if (notificationsGranted()) checkAndFireNotifications(ctx.state);
    } else {
      setActivePanel("dashboard");
    }
  } else {
    ctx.setSyncStatus("synced");
    replayMutationQueue().then(() => ctx.updatePendingMutations()).catch(() => {});
    import("./src/wireAuth.js").then(({ bootWithAuth }) => {
      bootWithAuth(ctx, () => {
        setActivePanel(savedPanel);
        if (notificationsGranted()) checkAndFireNotifications(ctx.state);
      }, joinFarmId);
    }).catch((err) => {
      console.error("[CuniWorld] Impossible de charger l'auth Supabase:", err);
      const authOverlay = document.getElementById("authOverlay");
      if (authOverlay) { authOverlay.style.display = "none"; authOverlay.innerHTML = ""; }
      seedIfEmpty();
      setActivePanel(savedPanel);
    });
  }
}

initApp();
