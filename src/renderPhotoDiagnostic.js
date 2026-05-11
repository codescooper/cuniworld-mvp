import { openModal, closeModal } from "./modal.js";
import { showToast, showConfirm } from "./notifications.js";
import { getPhotoLogBuffer, clearPhotoLogBuffer } from "./photoDebug.js";
import { getPendingPhotoUploadCount, repairPhotosWithoutStoragePath } from "./photoUploadQueue.js";
import { getPhotoData } from "./photoStorage.js";

// Couleurs par type d'événement, pour repérer les anomalies au scroll.
function _color(ev) {
  if (ev.includes("failed") || ev.includes("error")) return "#dc2626"; // rouge
  if (ev.includes("success") || ev.includes("saved")) return "#16a34a"; // vert
  if (ev.includes("received") || ev.includes("hit")) return "#2563eb"; // bleu
  if (ev.includes("subscribe")) return "#7c3aed"; // violet
  return "#6b7280"; // gris par défaut
}

function _formatLine({ at, event, details }) {
  const time = new Date(at).toLocaleTimeString("fr-FR", { hour12: false }) +
               "." + String(new Date(at).getMilliseconds()).padStart(3, "0");
  const detailsStr = JSON.stringify(details);
  return { time, event, detailsStr, color: _color(event) };
}

async function _scanBrokenPhotos(ctx) {
  const broken = (ctx.state.photos || []).filter(p => !p.storagePath);
  let withBytesHere = 0;
  for (const p of broken) {
    const bytes = await getPhotoData(p.localPhotoKey || p.id).catch(() => null);
    if (bytes) withBytesHere += 1;
  }
  return { total: broken.length, withBytesHere };
}

function _summary(buffer, ctx, scan) {
  const counts = {};
  for (const { event } of buffer) counts[event] = (counts[event] || 0) + 1;
  const hasError = buffer.some(b => b.event.includes("error") || b.event.includes("failed"));
  const farmInfo = ctx.farmId
    ? `Ferme: <code>${ctx.farmId}</code>`
    : `<span style="color:#b45309">Mode local — pas de ferme cloud</span>`;
  const pending = getPendingPhotoUploadCount();
  const brokenLine = scan.total > 0
    ? `<div style="color:#dc2626;margin-top:4px"><strong>${scan.total}</strong> photo(s) sans <code>storagePath</code> (invisibles sur les autres appareils). <strong>${scan.withBytesHere}</strong> ont leurs bytes localement → réparables d'ici.</div>`
    : '';
  return `
    <div style="margin-bottom:8px;font-size:13px">
      <div>${farmInfo}</div>
      <div>Utilisateur: <code>${ctx.currentUser?.email || ctx.currentUser?.id || "anonyme"}</code></div>
      <div>Photos en attente d'upload: <strong>${pending}</strong></div>
      <div>Photos dans l'état: <strong>${(ctx.state.photos || []).length}</strong></div>
      ${brokenLine}
      ${hasError ? '<div style="color:#dc2626;font-weight:700;margin-top:4px">⚠️ Au moins une erreur détectée dans le buffer</div>' : ''}
    </div>
    <details style="margin-bottom:8px;font-size:12px">
      <summary style="cursor:pointer;color:#6b7280">Résumé par type (${buffer.length} entrées)</summary>
      <pre style="margin:6px 0;padding:6px;background:#f3f4f6;border-radius:6px;font-size:11px;overflow-x:auto">${
        Object.entries(counts).sort((a,b) => b[1] - a[1]).map(([k,v]) => `${k}: ${v}`).join("\n") || "(vide)"
      }</pre>
    </details>
  `;
}

function _logsHTML(buffer) {
  if (buffer.length === 0) {
    return `<div style="color:#9ca3af;padding:20px;text-align:center;font-size:13px">
      Aucun log photo enregistré pour l'instant.<br>
      Ouvre une fiche lapin ou ajoute une photo pour générer des événements.
    </div>`;
  }
  // Ordre antichronologique : plus pratique pour voir les derniers événements en haut.
  const items = buffer.slice().reverse().map(_formatLine).map(({ time, event, detailsStr, color }) => `
    <div style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:11px;font-family:ui-monospace,monospace;line-height:1.4">
      <div><span style="color:#9ca3af">${time}</span> <span style="color:${color};font-weight:700">${event}</span></div>
      <div style="color:#374151;word-break:break-all;margin-top:2px">${detailsStr}</div>
    </div>
  `).join("");
  return `<div style="max-height:50vh;overflow-y:auto;border:1px solid #e5e7eb;border-radius:6px;background:#fff">${items}</div>`;
}

function _serializeBuffer(buffer, ctx) {
  const header = [
    `# CuniWorld photo diagnostic`,
    `# generated_at: ${new Date().toISOString()}`,
    `# farm_id: ${ctx.farmId || "(none)"}`,
    `# user: ${ctx.currentUser?.email || ctx.currentUser?.id || "anonymous"}`,
    `# photos_in_state: ${(ctx.state.photos || []).length}`,
    `# pending_uploads: ${getPendingPhotoUploadCount()}`,
    `# entries: ${buffer.length}`,
    `# user_agent: ${navigator.userAgent}`,
    `#`,
  ].join("\n");
  const body = buffer.map(({ at, event, details }) =>
    `${at} [${event}] ${JSON.stringify(details)}`
  ).join("\n");
  return header + "\n" + body + "\n";
}

export async function openPhotoDiagnosticModal(ctx) {
  const buffer = getPhotoLogBuffer();
  const scan = await _scanBrokenPhotos(ctx);
  const repairBtn = scan.withBytesHere > 0
    ? `<button class="btn" id="diagRepair" style="flex:2 1 100%;background:#dc2626">🛠 Réparer ${scan.withBytesHere} photo(s) (upload bytes locaux)</button>`
    : (scan.total > 0
        ? `<div style="flex:2 1 100%;padding:8px;background:#fef3c7;border:1px solid #fde68a;border-radius:6px;font-size:12px;color:#92400e">⚠️ ${scan.total} photo(s) à réparer mais leurs bytes sont absents d'ici — ouvre ce panneau sur l'appareil qui a pris les photos.</div>`
        : '');
  openModal(ctx.el, "🔍 Diagnostic photos", `
    ${_summary(buffer, ctx, scan)}
    ${_logsHTML(buffer)}
    <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap">
      <button class="btn secondary" id="diagClose" style="flex:1 1 auto">Fermer</button>
      <button class="btn secondary" id="diagClear" style="flex:1 1 auto">Vider</button>
      <button class="btn secondary" id="diagRefresh" style="flex:1 1 auto">Rafraîchir</button>
      <button class="btn" id="diagCopy" style="flex:2 1 100%">📋 Copier tout</button>
      ${repairBtn}
    </div>
  `);

  document.getElementById("diagClose")?.addEventListener("click", () => closeModal(ctx.el));
  document.getElementById("diagRefresh")?.addEventListener("click", () => openPhotoDiagnosticModal(ctx));
  document.getElementById("diagClear")?.addEventListener("click", () => {
    clearPhotoLogBuffer();
    openPhotoDiagnosticModal(ctx);
  });
  document.getElementById("diagRepair")?.addEventListener("click", async () => {
    const ok = await showConfirm({
      title: "Réparer les photos sans storagePath",
      message: `Les bytes locaux de ${scan.withBytesHere} photo(s) vont être uploadés vers le bucket Storage, puis la ligne SQL sera mise à jour. Continuer ?`,
      confirmLabel: "Réparer", cancelLabel: "Annuler",
    });
    if (!ok) return;
    const btn = document.getElementById("diagRepair");
    if (btn) { btn.disabled = true; btn.textContent = "Réparation en cours…"; }
    try {
      const result = await repairPhotosWithoutStoragePath(ctx);
      ctx.render();
      const lines = [
        `✅ Réparées : ${result.repaired}`,
        `↪ Bytes absents ici : ${result.missingBytes}`,
        `❌ Échouées : ${result.failed}`,
      ];
      showToast(lines.join(" · "), result.failed > 0 ? "error" : "success");
      if (result.errors.length > 0) {
        console.error("[photoRepair] détails erreurs :", result.errors);
      }
      openPhotoDiagnosticModal(ctx);
    } catch (err) {
      showToast(`Réparation impossible : ${err?.message || err}`, "error");
      if (btn) { btn.disabled = false; }
    }
  });
  document.getElementById("diagCopy")?.addEventListener("click", async () => {
    const text = _serializeBuffer(getPhotoLogBuffer(), ctx);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        showToast(`${buffer.length} log(s) copié(s).`, "success");
      } else {
        // Fallback : afficher dans un textarea sélectionnable pour copie manuelle
        // (utile dans certains contextes mobile où le presse-papier est bloqué).
        openModal(ctx.el, "📋 Copier manuellement", `
          <div class="muted small" style="margin-bottom:8px">Long-press → Tout sélectionner → Copier.</div>
          <textarea readonly style="width:100%;min-height:50vh;font-family:ui-monospace,monospace;font-size:11px">${text.replace(/</g, "&lt;")}</textarea>
          <button class="btn secondary" id="diagBack" style="margin-top:8px;width:100%">Retour</button>
        `);
        const ta = document.querySelector("#modalBody textarea");
        ta?.focus(); ta?.select();
        document.getElementById("diagBack")?.addEventListener("click", () => openPhotoDiagnosticModal(ctx));
      }
    } catch (err) {
      showToast(`Copie impossible : ${err?.message || err}`, "error");
    }
  });
}
