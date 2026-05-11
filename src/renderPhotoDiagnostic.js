import { openModal, closeModal } from "./modal.js";
import { showToast } from "./notifications.js";
import { getPhotoLogBuffer, clearPhotoLogBuffer } from "./photoDebug.js";
import { getPendingPhotoUploadCount } from "./photoUploadQueue.js";

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

function _summary(buffer, ctx) {
  const counts = {};
  for (const { event } of buffer) counts[event] = (counts[event] || 0) + 1;
  const hasError = buffer.some(b => b.event.includes("error") || b.event.includes("failed"));
  const farmInfo = ctx.farmId
    ? `Ferme: <code>${ctx.farmId}</code>`
    : `<span style="color:#b45309">Mode local — pas de ferme cloud</span>`;
  const pending = getPendingPhotoUploadCount();
  return `
    <div style="margin-bottom:8px;font-size:13px">
      <div>${farmInfo}</div>
      <div>Utilisateur: <code>${ctx.currentUser?.email || ctx.currentUser?.id || "anonyme"}</code></div>
      <div>Photos en attente d'upload: <strong>${pending}</strong></div>
      <div>Photos dans l'état: <strong>${(ctx.state.photos || []).length}</strong></div>
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

export function openPhotoDiagnosticModal(ctx) {
  const buffer = getPhotoLogBuffer();
  openModal(ctx.el, "🔍 Diagnostic photos", `
    ${_summary(buffer, ctx)}
    ${_logsHTML(buffer)}
    <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap">
      <button class="btn secondary" id="diagClose" style="flex:1 1 auto">Fermer</button>
      <button class="btn secondary" id="diagClear" style="flex:1 1 auto">Vider</button>
      <button class="btn secondary" id="diagRefresh" style="flex:1 1 auto">Rafraîchir</button>
      <button class="btn" id="diagCopy" style="flex:2 1 100%">📋 Copier tout</button>
    </div>
  `);

  document.getElementById("diagClose")?.addEventListener("click", () => closeModal(ctx.el));
  document.getElementById("diagRefresh")?.addEventListener("click", () => openPhotoDiagnosticModal(ctx));
  document.getElementById("diagClear")?.addEventListener("click", () => {
    clearPhotoLogBuffer();
    openPhotoDiagnosticModal(ctx);
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
