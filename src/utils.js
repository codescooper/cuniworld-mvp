export function formatDate(d) {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString("fr-FR");
  } catch {
    return d;
  }
}

export function daysBetween(aISO, bISO) {
  const a = new Date(aISO).getTime();
  const b = new Date(bISO).getTime();
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

export function escapeHTML(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
export function escapeAttr(str) {
  return escapeHTML(str).replaceAll("\n", " ");
}

export function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function sum(arr) {
  return arr.reduce((a,b)=>a+b,0);
}

export function sexLabel(sex) {
  if (sex === "F") return "Femelle";
  if (sex === "M") return "Mâle";
  return "Inconnu";
}

export function rabbitStatusBadge(status) {
  if (status === "actif") return `<span class="badge ok">Actif</span>`;
  if (status === "vendu") return `<span class="badge warn">Vendu</span>`;
  if (status === "mort") return `<span class="badge danger">Mort</span>`;
  return `<span class="badge">Inconnu</span>`;
}
