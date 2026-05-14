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

export function addDays(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
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

export function numOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

export function getRabbitStage(rabbit, { minWeanDays = 28, maturityDays = 120 } = {}) {
  if (rabbit?.stage) return rabbit.stage;
  const birthDate = rabbit?.birthDate;
  if (!birthDate) return "adulte";
  const ageDays = daysBetween(birthDate, new Date().toISOString().slice(0, 10));
  if (ageDays < minWeanDays) return "kit";
  if (ageDays < maturityDays) return "jeune";
  return "adulte";
}

export function stageBadge(stage) {
  const label = stage === "kit" ? "Kit" : stage === "jeune" ? "Jeune" : "Adulte";
  const klass = stage === "kit" ? "accent" : stage === "jeune" ? "warn" : "ok";
  return `<span class="badge ${klass}">Stage: ${label}</span>`;
}

// Prix de référence pour l'évaluation du cheptel (FCFA).
//   - Vif    : 6 000 FCFA / kg de poids vif
//   - Carcasse : 5 000 FCFA / kg de carcasse, avec rendement moyen ~55 %
//     (la viande utile représente en général 50–60 % du poids vif chez le lapin).
export const PRICE_LIVE_FCFA_PER_KG    = 6000;
export const PRICE_CARCASS_FCFA_PER_KG = 5000;
export const CARCASS_YIELD             = 0.55;

// Renvoie l'évaluation FCFA d'un lapin à partir de son poids vif courant.
// `weightKg` <= 0 ou non fini → 0.
export function estimateRabbitValue(weightKg) {
  const w = Number(weightKg);
  if (!Number.isFinite(w) || w <= 0) return { live: 0, carcass: 0, carcassWeightKg: 0 };
  const live = Math.round(w * PRICE_LIVE_FCFA_PER_KG);
  const carcassWeightKg = w * CARCASS_YIELD;
  const carcass = Math.round(carcassWeightKg * PRICE_CARCASS_FCFA_PER_KG);
  return { live, carcass, carcassWeightKg };
}

// Formate un montant FCFA avec séparateur d'espace (ex: 12 500 FCFA).
export function formatFCFA(amount) {
  const n = Math.round(Number(amount) || 0);
  return `${n.toLocaleString('fr-FR').replace(/,/g, ' ')} FCFA`;
}

export function generateRabbitCode(state, sex) {
  const normalized = sex === "F" || sex === "M" ? sex : "U";
  const prefix = `CW-${normalized}`;
  const matcher = new RegExp(`^${prefix}(\\d+)$`);
  const max = (state?.rabbits || [])
    .map((r) => (r.code || "").trim())
    .map((code) => code.match(matcher))
    .filter(Boolean)
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n))
    .reduce((acc, n) => Math.max(acc, n), 0);

  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}
