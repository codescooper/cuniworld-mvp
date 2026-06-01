/**
 * reconcile.js — Réconciliation des données locales non synchronisées vers le cloud.
 *
 * Problème résolu : quand `_loadFarm` charge une ferme, il REMPLACE l'état local
 * par l'état cloud. Toute entrée créée hors-ligne et présente uniquement en
 * localStorage (ex : une pesée faite sans réseau) serait alors écrasée et PERDUE.
 *
 * Cette fonction compare le state local au state cloud fraîchement chargé et
 * retourne les entrées locales à RÉCUPÉRER (absentes du cloud, ou plus récentes),
 * pour qu'elles soient ré-injectées dans l'affichage ET repoussées vers le cloud.
 *
 * Sécurité multi-fermes (cf. blob local non taggé historiquement) :
 *  - rabbits / usedNames : récupérés seulement si le blob local appartient bien
 *    à cette ferme (`localState.meta.farmId === farmId`).
 *  - events : récupérés si même ferme OU si l'événement référence un lapin présent
 *    dans cette ferme (cloud ou lapin local récupéré). Cela garantit qu'on ne
 *    pousse jamais la pesée d'un lapin d'une autre ferme.
 *  - Les données de simulation ne sont JAMAIS récupérées.
 *
 * @param {object} cloudState  État fraîchement chargé depuis Supabase.
 * @param {object} localState  État local (localStorage) avant remplacement.
 * @param {string} farmId      Ferme en cours de chargement.
 * @returns {{ rabbits: object[], events: object[], usedNames: Record<string,string> }}
 */
export function reconcileLocalToCloud(cloudState, localState, farmId) {
  const out = { rabbits: [], events: [], usedNames: {} };
  if (!localState || typeof localState !== 'object') return out;
  if (localState.meta?.simulation) return out; // ne jamais pousser de la simulation

  const sameFarm = !!farmId && localState.meta?.farmId === farmId;

  const cloudRabbits = Array.isArray(cloudState?.rabbits) ? cloudState.rabbits : [];
  const cloudEvents  = Array.isArray(cloudState?.events)  ? cloudState.events  : [];
  const cloudRabbitById = new Map(cloudRabbits.map(r => [r.id, r]));
  const cloudEventIds   = new Set(cloudEvents.map(e => e.id));

  // ── Rabbits : seulement si même ferme (sinon attribution ambiguë) ──
  if (sameFarm) {
    for (const r of (localState.rabbits || [])) {
      if (!r?.id) continue;
      const cloud = cloudRabbitById.get(r.id);
      if (!cloud) { out.rabbits.push(r); continue; }                   // local-only (créé hors-ligne)
      if ((r.updatedAt || '') > (cloud.updatedAt || '')) out.rabbits.push(r); // local plus récent
    }
  }

  // Lapins valides pour cette ferme = cloud + locaux récupérés.
  const validRabbitIds = new Set(cloudRabbitById.keys());
  for (const r of out.rabbits) validRabbitIds.add(r.id);

  // ── Events : local-only, scopés par ferme OU par lapin de cette ferme ──
  // (couvre la pesée faite hors-ligne sur un lapin existant)
  for (const e of (localState.events || [])) {
    if (!e?.id || cloudEventIds.has(e.id)) continue;                   // déjà dans le cloud
    if (sameFarm || validRabbitIds.has(e.rabbitId)) out.events.push(e);
  }

  // ── usedNames : seulement si même ferme ──
  if (sameFarm) {
    const cloudNames = cloudState?.usedNames || {};
    for (const [name, rid] of Object.entries(localState.usedNames || {})) {
      if (!(name in cloudNames)) out.usedNames[name] = rid;
    }
  }

  return out;
}

/** True si la réconciliation a trouvé quelque chose à récupérer. */
export function hasRecoverable(recovered) {
  return !!recovered && (
    recovered.rabbits.length > 0 ||
    recovered.events.length > 0 ||
    Object.keys(recovered.usedNames).length > 0
  );
}
