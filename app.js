import { Store } from "./src/store.js";
import { escapeHTML, escapeAttr } from "./src/utils.js";
import { getEls } from "./src/dom.js";
import { renderAll } from "./src/render.js";
import { wireStatic, wireDynamic } from "./src/wire.js";
import { GUIDE_STEPS, getGuideStep, getNextStep, getPrevStep } from "./src/guide.js";
import { openWeightCheckModal } from "./src/weightCheck.js";
import { openPhotoCheckModal } from "./src/photoCheck.js";
import { getReminders } from "./src/health.js";
import { getSettings } from "./src/settingsService.js";
import { countPendingOrders } from "./src/shopService.js";
import { hydrateAndMigratePhotos } from "./src/photoStorage.js";
import { exportRabbitsCSV, exportEventsCSV } from "./src/csvExport.js";
import { createSyncManager } from "./src/syncManager.js";
import { getPendingMutationCount, replayMutationQueue } from "./src/mutationQueue.js";
import { getPendingPhotoUploadCount, replayPhotoUploadQueue, startPhotoUploadAutoRetry } from "./src/photoUploadQueue.js";
import { showToast, showConfirm } from "./src/notifications.js";
import { supabaseConfigured } from "./src/supabase.js";
import {
  registerServiceWorker,
  requestNotificationPermission,
  checkAndFireNotifications,
  notificationsGranted,
  notificationsSupported,
} from "./src/pushNotifications.js";
import { openAddStockModal } from "./src/renderStock.js";
import { openTourneeModal, _updateTourneeLabel } from "./src/renderTournee.js";
import { openAddBuildingModal, openQuickSetupModal } from "./src/renderBuildings.js";
import { openSimulationModal, exitSimulation } from "./src/renderSimulation.js";
import { openPhotoDiagnosticModal } from "./src/renderPhotoDiagnostic.js";
import { isSimulationState } from "./src/simulation.js";
import { bootShopView } from "./src/renderShop.js";

const el = getEls();

const PANELS = ["dashboard", "rabbits", "lots", "genealogy", "batiments", "magasin", "stats", "orders", "actions", "settings", "aide"];

const ctx = {
  Store,
  el,
  state:      Store.load(),
  farmId:     null,
  farmName:   null,
  currentUser: null,
  farmMembers: null,   // liste des membres pour les sélecteurs "Effectué par"
  myProfile:   null,   // { firstName, lastName } de l'utilisateur connecté
  myRole:      null,   // rôle du user dans la ferme courante (owner/admin/member/viewer)
  farmSettings: null,  // paramètres personnalisés de la ferme (DEFAULT_SETTINGS si absent)
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
    updateSimulationUI(ctx);
  },
  setSyncStatus: (status, meta = {}) => {
    const allowed = new Set(["local", "syncing", "synced", "error"]);
    ctx.syncStatus = allowed.has(status) ? status : "local";
    if (status === "error" && meta.error) {
      const e = meta.error;
      ctx.lastSyncError = {
        message: e?.message || String(e),
        code:    e?.code || e?.status || null,
        details: e?.details || e?.hint || null,
        at:      new Date().toISOString(),
      };
    } else if (status === "synced") {
      ctx.lastSyncError = null;
    }
    updateSyncBadge(ctx);
  },
  lastSyncError: null,
  updatePendingMutations: () => updateSyncBadge(ctx),
};
ctx.syncManager = createSyncManager((status, meta) => ctx.setSyncStatus(status, meta));

// Indicateur partagé entre le bandeau de simulation (croix de fermeture) et
// updateSimulationUI : permet de masquer le bandeau pour la session sans
// arrêter la simulation elle-même.
let _simBannerDismissed = false;
ctx.resetSimulationBannerDismissal = () => { _simBannerDismissed = false; };

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
    const { overdue } = getReminders(ctx.state, { windowDays: getSettings(ctx).healthReminderWindowDays });
    const badge = document.getElementById("badge-dashboard");
    if (badge) badge.textContent = overdue.length > 0 ? String(overdue.length) : "";
  } catch (_) {}

  // Badge commandes en attente (poll au moment du render)
  const ordersBadge = document.getElementById("badge-orders");
  if (ordersBadge) {
    if (!ctx.farmId) {
      ordersBadge.textContent = "";
    } else {
      // Throttle : on rafraîchit au max toutes les 20 s pour ne pas spammer Supabase.
      const now = Date.now();
      if (!ctx._lastPendingOrdersAt || now - ctx._lastPendingOrdersAt > 20000) {
        ctx._lastPendingOrdersAt = now;
        countPendingOrders(ctx.farmId).then(n => {
          ctx._pendingOrdersCount = n;
          const b = document.getElementById("badge-orders");
          if (b) b.textContent = n > 0 ? String(n) : "";
        }).catch(() => {});
      }
      ordersBadge.textContent = ctx._pendingOrdersCount > 0 ? String(ctx._pendingOrdersCount) : "";
    }
  }
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
    const lowCount = (ctx.state.stock || []).filter(
      item => item.minQuantity > 0 && item.quantity <= item.minQuantity
    ).length;
    const badge = document.getElementById("badge-magasin");
    if (badge) badge.textContent = lowCount > 0 ? String(lowCount) : "";
  } catch (_) {}
}

function updateSimulationUI(ctx) {
  const banner = document.getElementById("simulationBanner");
  const exitTile = document.getElementById("moreExitSimulation");
  const startTile = document.getElementById("moreSimulation");
  const inSim = isSimulationState(ctx.state);
  if (banner) banner.style.display = inSim && !_simBannerDismissed ? "" : "none";
  if (exitTile) exitTile.style.display = inSim ? "" : "none";
  if (startTile) {
    // Toujours visible : le clic est déjà bloqué proprement par
    // openSimulationModal quand `farmId` est défini (toast explicite).
    startTile.style.display = "";
    const blocked = !!ctx.farmId;
    startTile.style.opacity = blocked ? "0.5" : "";
    startTile.style.cursor = blocked ? "not-allowed" : "";
    startTile.title = blocked
      ? "Déconnectez-vous de la ferme cloud pour démarrer une simulation."
      : "";
    // Libellé visible expliquant la restriction (sans attendre le clic).
    const simSub = document.getElementById("simSubLabel");
    if (simSub) {
      simSub.textContent = blocked
        ? "Indisponible en mode cloud — déconnectez-vous d'abord"
        : "Générer un élevage fictif réaliste (hors-ligne)";
    }
  }
}

let _syncFadeTimer = null;
function updateSyncBadge(ctx) {
  const badge = ctx.el.syncBadge;
  if (!badge) return;
  const labels = {
    local: "Local",
    syncing: "Sync en cours",
    synced: "Synchronisé",
    error: "Erreur sync",
  };
  const tooltips = {
    local:   "Mode local — pas de ferme connectée",
    syncing: "Synchronisation en cours…",
    synced:  "Données synchronisées avec le cloud",
    error:   "Erreur de synchronisation — cliquez pour réessayer",
  };
  const status = ctx.syncStatus || "local";
  const pending = getPendingMutationCount() + getPendingPhotoUploadCount();
  badge.className = `sync-badge ${status}`;
  const base = labels[status] || labels.local;
  badge.textContent = pending > 0 ? `${base} · ${pending} en attente` : base;
  const errTip = (status === "error" && ctx.lastSyncError?.message)
    ? ` — ${ctx.lastSyncError.message}`
    : "";
  badge.title = (pending > 0
    ? `${tooltips[status] || ''} · ${pending} écriture(s) en attente`
    : (tooltips[status] || '')) + errTip;

  // Atténue le badge "synced" après 4 s pour ne pas attirer l'attention en
  // permanence quand tout va bien. Re-déclenche dès qu'un autre statut survient.
  if (_syncFadeTimer) { clearTimeout(_syncFadeTimer); _syncFadeTimer = null; }
  badge.classList.remove("sync-faded");
  if (status === "synced" && pending === 0) {
    _syncFadeTimer = setTimeout(() => badge.classList.add("sync-faded"), 4000);
  }
}

function wireSyncBadge(ctx) {
  const badge = ctx.el.syncBadge;
  if (!badge) return;
  badge.setAttribute("role", "button");
  badge.setAttribute("tabindex", "0");
  const retry = async () => {
    if (!ctx.farmId) {
      showToast("Mode local — aucune ferme cloud connectée.", "info");
      return;
    }
    // En statut "error", on affiche d'abord le détail pour que l'utilisateur
    // sache POURQUOI ça a échoué (ex : RLS, network, quota, etc.) avant de
    // relancer la file. Le message reste copiable depuis le toast.
    if (ctx.syncStatus === "error" && ctx.lastSyncError) {
      const e = ctx.lastSyncError;
      const codeStr = e.code ? ` [${e.code}]` : "";
      const detailStr = e.details ? ` — ${e.details}` : "";
      showToast(`Erreur sync${codeStr} : ${e.message}${detailStr}`, "error");
    }
    const mut = await replayMutationQueue().catch(() => ({ remaining: 0, replayed: 0 }));
    const pho = await replayPhotoUploadQueue(ctx).catch(() => ({ remaining: 0, replayed: 0 }));
    ctx.updatePendingMutations();
    const remaining = mut.remaining + pho.remaining;
    if (remaining === 0) ctx.setSyncStatus("synced");
    showToast(`Sync : ${mut.replayed + pho.replayed} rejouée(s), ${remaining} en attente.`, "success");
    if (pho.replayed > 0) ctx.render();
  };
  badge.addEventListener("click", retry);
  badge.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); retry(); }
  });
}

// ── Footer version ────────────────────────────────────────────────
// Permet à l'utilisateur de savoir si la page qu'il regarde correspond
// au dernier déploiement (utile sur mobile où le cache du SW peut servir
// une version obsolète). Cliquer copie la chaîne dans le presse-papier.
function renderVersionFooter() {
  const el = document.getElementById("appVersionFooter");
  if (!el) return;
  // Globaux injectés par Vite `define` — fallback "dev" pour le mode dev où
  // les remplacements peuvent ne pas être appliqués selon le bundler.
  const version  = (typeof __APP_VERSION__    !== "undefined") ? __APP_VERSION__    : "dev";
  const commit   = (typeof __APP_COMMIT__     !== "undefined") ? __APP_COMMIT__     : "local";
  const buildIso = (typeof __APP_BUILD_TIME__ !== "undefined") ? __APP_BUILD_TIME__ : null;

  let buildLabel = "build inconnue";
  let staleClass = "";
  if (buildIso) {
    const d = new Date(buildIso);
    if (!isNaN(d)) {
      const ageDays = (Date.now() - d.getTime()) / 86400000;
      // > 30 j sans rebuild : on souligne pour aider à diagnostiquer un cache.
      if (ageDays > 30) staleClass = " v-stale";
      buildLabel = d.toLocaleString("fr-FR", {
        year:   "numeric", month: "2-digit", day: "2-digit",
        hour:   "2-digit", minute: "2-digit",
      });
    }
  }

  const fullText = `CuniWorld v${version} · ${commit} · ${buildLabel}`;
  el.innerHTML =
    `<span>v${version}</span>` +
    `<span class="v-sep">·</span>` +
    `<span>${commit}</span>` +
    `<span class="v-sep">·</span>` +
    `<span class="${staleClass.trim()}">${buildLabel}</span>`;
  el.title = `Cliquer pour copier : ${fullText}`;
  el.addEventListener("click", () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(fullText).then(
        () => showToast("Version copiée.", "success"),
        () => showToast(fullText, "info"),
      );
    } else {
      showToast(fullText, "info");
    }
  }, { once: false });
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

  // Ouvrir la boutique publique de la ferme dans un nouvel onglet
  document.getElementById("moreShopOpen")?.addEventListener("click", () => {
    if (!ctx.farmId) {
      showToast("Connectez-vous à une ferme cloud pour utiliser la boutique.", "info");
      return;
    }
    const base = window.location.origin + window.location.pathname.replace(/\/$/, '');
    window.open(`${base}?shop=${ctx.farmId}`, '_blank', 'noopener');
  });

  // Partager : utilise Web Share API si dispo, sinon copie le lien
  document.getElementById("moreShopShare")?.addEventListener("click", async () => {
    if (!ctx.farmId) {
      showToast("Connectez-vous à une ferme cloud pour partager.", "info");
      return;
    }
    const base = window.location.origin + window.location.pathname.replace(/\/$/, '');
    const url  = `${base}?shop=${ctx.farmId}`;
    const text = `Découvrez les lapins en vente chez ${ctx.farmName || 'ma ferme'} : ${url}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Ma boutique', text, url }); return; } catch (_) { /* annulé */ }
    }
    try { await navigator.clipboard.writeText(url); showToast("Lien copié.", "success"); }
    catch (_) { showToast(url, "info"); }
  });
  document.getElementById("btnAddStock")?.addEventListener("click", () => openAddStockModal(ctx));
  document.getElementById("btnAddBuilding")?.addEventListener("click", () => openAddBuildingModal(ctx));
  document.getElementById("btnQuickSetup")?.addEventListener("click", () => openQuickSetupModal(ctx));
  document.getElementById("morePhotoCheck")?.addEventListener("click", () => openPhotoCheckModal(ctx));
  document.getElementById("moreWeightCheck")?.addEventListener("click", () => openWeightCheckModal(ctx));
  document.getElementById("moreReset")?.addEventListener("click", () => ctx.el.btnReset?.click());
  document.getElementById("moreSimulation")?.addEventListener("click", () => openSimulationModal(ctx));
  document.getElementById("moreExitSimulation")?.addEventListener("click", () => exitSimulation(ctx));
  document.getElementById("morePhotoDiagnostic")?.addEventListener("click", () => openPhotoDiagnosticModal(ctx));
  document.getElementById("moreRetrySync")?.addEventListener("click", async () => {
    if (!ctx.farmId) return;
    const mut = await replayMutationQueue();
    const pho = await replayPhotoUploadQueue(ctx);
    ctx.updatePendingMutations();
    const remaining = mut.remaining + pho.remaining;
    if (remaining === 0) ctx.setSyncStatus("synced");
    showToast(`Sync relancée : ${mut.replayed} mutation(s) + ${pho.replayed} photo(s) rejouée(s), ${remaining} en attente.`, "success");
    if (pho.replayed > 0) ctx.render();
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
    checkAndFireNotifications(ctx.state, ctx.farmSettings);
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

function renderBackupList(_ctx) {
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
    const reason = escapeHTML(b?.reason || "—");
    const date   = escapeHTML(b?.createdAt || "—");
    const id     = escapeAttr(b?.id || "");
    return `
      <div class="item" style="display:flex;justify-content:space-between;gap:10px;align-items:center">
        <div class="small">
          <div><strong>${date}</strong> · raison: <strong>${reason}</strong></div>
          <div>${rabbits} lapin(s) · ${events} événement(s)</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn secondary" data-export-backup="${id}">Exporter ce backup</button>
          <button class="btn" data-restore-backup="${id}">Restaurer</button>
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
  // Croix → fermeture persistante (toutes sessions futures).
  if (localStorage.getItem('betaBannerDismissed') === '1') {
    banner.classList.add('hidden');
    return;
  }
  let autoTimer = null;
  const collapse = () => banner.classList.add('hidden');
  close.addEventListener('click', () => {
    if (autoTimer) clearTimeout(autoTimer);
    collapse();
    try { localStorage.setItem('betaBannerDismissed', '1'); } catch (_) {}
  });
  // Disparition automatique au bout de 12 s (session uniquement — réapparaît
  // au prochain chargement tant que l'utilisateur n'a pas cliqué sur la croix).
  autoTimer = setTimeout(collapse, 12000);
  // Toute interaction (survol prolongé) suspend le timer pour ne pas masquer
  // un bandeau que l'utilisateur est en train de lire.
  banner.addEventListener('mouseenter', () => { if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; } });
  banner.addEventListener('mouseleave', () => { if (!autoTimer) autoTimer = setTimeout(collapse, 5000); });
}

function wireSimulationBanner() {
  const banner = document.getElementById('simulationBanner');
  if (!banner) return;
  if (banner.dataset.wired === '1') return;
  banner.dataset.wired = '1';
  const close = document.createElement('button');
  close.className = 'beta-banner-close';
  close.setAttribute('aria-label', 'Masquer');
  close.type = 'button';
  close.textContent = '✕';
  close.addEventListener('click', () => {
    _simBannerDismissed = true;
    banner.style.display = 'none';
  });
  banner.appendChild(close);
}

async function initApp() {
  // Mode boutique publique : si l'URL contient ?shop=…, on monte une vue
  // dédiée et on n'initialise pas le reste de l'app (pas d'auth, pas de
  // hooks). Permet l'accès anon pour les clients de la boutique.
  if (await bootShopView()) return;

  registerServiceWorker().catch(() => {});
  wireBetaBanner();
  wireSimulationBanner();
  wireSyncBadge(ctx);
  renderVersionFooter();
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
      setActivePanel(savedPanel);
      if (notificationsGranted()) checkAndFireNotifications(ctx.state, ctx.farmSettings);
    } else {
      setActivePanel("dashboard");
    }
  } else {
    ctx.setSyncStatus("synced");
    // Replay au démarrage + poller périodique : une photo locale doit
    // systématiquement finir dans le cloud sans action manuelle.
    Promise.all([
      replayMutationQueue().catch(() => ({ remaining: 0, replayed: 0 })),
      replayPhotoUploadQueue(ctx).catch(() => ({ remaining: 0, replayed: 0 })),
    ]).then(([, pho]) => {
      ctx.updatePendingMutations();
      if (pho.replayed > 0) ctx.render();
    });
    startPhotoUploadAutoRetry(ctx, 30000);
    window.addEventListener("online", async () => {
      if (!ctx.farmId) return;
      const mut = await replayMutationQueue().catch(() => ({ remaining: 0, replayed: 0 }));
      const pho = await replayPhotoUploadQueue(ctx).catch(() => ({ remaining: 0, replayed: 0 }));
      ctx.updatePendingMutations();
      if (mut.remaining + pho.remaining === 0) ctx.setSyncStatus("synced");
      if (pho.replayed > 0) ctx.render();
    });
    import("./src/wireAuth.js").then(({ bootWithAuth }) => {
      bootWithAuth(ctx, () => {
        setActivePanel(savedPanel);
        if (notificationsGranted()) checkAndFireNotifications(ctx.state, ctx.farmSettings);
      }, joinFarmId);
    }).catch((err) => {
      console.error("[CuniWorld] Impossible de charger l'auth Supabase:", err);
      const authOverlay = document.getElementById("authOverlay");
      if (authOverlay) { authOverlay.style.display = "none"; authOverlay.innerHTML = ""; }
      setActivePanel(savedPanel);
    });
  }
}

initApp();
