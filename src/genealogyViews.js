/**
 * genealogyViews.js — Logique métier des vues lignée (pedigree, descendance,
 * comparaison, suggestion d'accouplement, coefficient de consanguinité).
 *
 * Module 100 % pur : aucune dépendance DOM, entièrement testable. Tous les
 * renderers consomment ces fonctions.
 *
 * Modèle de parenté : on lit `r.doeId || r.motherId` pour la mère,
 * `r.buckId || r.fatherId` pour le père. Compatible avec les deux nommages
 * historiques.
 */

// ── Helpers internes ────────────────────────────────────────────────────────

function _motherId(r) { return r?.doeId  || r?.motherId || null; }
function _fatherId(r) { return r?.buckId || r?.fatherId || null; }

function _byId(state) {
  return new Map((state?.rabbits || []).map(r => [r.id, r]));
}

// ── 1) Pedigree (ascendance) ─────────────────────────────────────────────────

/**
 * Construit le pedigree d'un lapin sur N générations d'ancêtres.
 *
 * Retourne un arbre récursif :
 *   { rabbit, mother: <node|null>, father: <node|null>, depth }
 *
 * Si un parent est inconnu (champ vide OU ID introuvable), la branche est
 * `null` — utile pour afficher les cases vides du pedigree standard.
 *
 * Convention : depth=0 = lapin racine ; mother en haut, father en bas.
 * Pas de protection cycle car en biologie un cycle généalogique est
 * impossible — on garde un Set des IDs visités au cas où la BDD est
 * corrompue (auto-référence ou boucle), et on coupe la branche.
 */
export function buildPedigree(state, rabbitId, generations = 4) {
  const byId = _byId(state);
  const root = byId.get(rabbitId);
  if (!root) return null;
  return _buildPedigreeRec(byId, root, 0, generations, new Set());
}

function _buildPedigreeRec(byId, rabbit, depth, max, visited) {
  if (!rabbit || depth > max) return null;
  if (visited.has(rabbit.id)) return { rabbit, mother: null, father: null, depth, cycle: true };
  visited.add(rabbit.id);
  const motherRabbit = byId.get(_motherId(rabbit));
  const fatherRabbit = byId.get(_fatherId(rabbit));
  return {
    rabbit,
    depth,
    mother: depth < max ? _buildPedigreeRec(byId, motherRabbit, depth + 1, max, new Set(visited)) : null,
    father: depth < max ? _buildPedigreeRec(byId, fatherRabbit, depth + 1, max, new Set(visited)) : null,
  };
}

/**
 * Aplatit un arbre pedigree en cases pour un rendu "tableau" standard.
 * Pour N générations, on a (2^(N+1)) - 1 cases au total, indexées de 0
 * (racine) à 2^(N+1)-2. Index 2k+1 = mère, 2k+2 = père.
 *
 * @returns Array<{ index, depth, rabbit|null, slot: 'self'|'mother'|'father'|... }>
 */
export function flattenPedigree(pedigreeRoot, generations = 4) {
  const totalSlots = Math.pow(2, generations + 1) - 1;
  const out = new Array(totalSlots).fill(null);
  function place(node, idx, slotLabel) {
    if (!node || idx >= totalSlots) return;
    out[idx] = { index: idx, depth: node.depth, rabbit: node.rabbit, slot: slotLabel, cycle: !!node.cycle };
    place(node.mother, 2 * idx + 1, 'mother');
    place(node.father, 2 * idx + 2, 'father');
  }
  place(pedigreeRoot, 0, 'self');
  return out;
}

// ── 2) Descendance ──────────────────────────────────────────────────────────

/**
 * Construit la descendance d'un lapin avec stats.
 *
 * @returns {{
 *   rabbit, depth,
 *   children: Array<descendanceNode>,
 *   totals: { direct, total, alive, sold, dead, males, females }
 * }}
 */
export function buildDescendance(state, rabbitId, maxDepth = 4) {
  const byId = _byId(state);
  const root = byId.get(rabbitId);
  if (!root) return null;
  const childrenOf = new Map(); // parentId → [child]
  for (const r of (state.rabbits || [])) {
    const mId = _motherId(r);
    if (mId) {
      if (!childrenOf.has(mId)) childrenOf.set(mId, []);
      childrenOf.get(mId).push(r);
    }
    const fId = _fatherId(r);
    if (fId) {
      if (!childrenOf.has(fId)) childrenOf.set(fId, []);
      childrenOf.get(fId).push(r);
    }
  }
  const totals = { direct: 0, total: 0, alive: 0, sold: 0, dead: 0, males: 0, females: 0 };
  const node = _buildDescRec(byId, childrenOf, root, 0, maxDepth, new Set(), totals);
  if (node) totals.direct = node.children.length;
  return { ...node, totals };
}

function _buildDescRec(byId, childrenOf, rabbit, depth, max, visited, totals) {
  if (!rabbit || visited.has(rabbit.id)) return { rabbit, depth, children: [], cycle: true };
  visited.add(rabbit.id);
  const list = (childrenOf.get(rabbit.id) || []).slice().sort((a, b) =>
    (a.birthDate || '').localeCompare(b.birthDate || '') || (a.code || '').localeCompare(b.code || '')
  );
  for (const c of list) {
    totals.total += 1;
    if (c.status === 'actif') totals.alive += 1;
    else if (c.status === 'vendu') totals.sold += 1;
    else if (c.status === 'mort') totals.dead += 1;
    if (c.sex === 'M') totals.males += 1;
    else if (c.sex === 'F') totals.females += 1;
  }
  return {
    rabbit,
    depth,
    children: depth < max ? list.map(c => _buildDescRec(byId, childrenOf, c, depth + 1, max, new Set(visited), totals)) : [],
  };
}

// ── 3) Ancêtre commun le plus proche ────────────────────────────────────────

/**
 * Renvoie le plus proche ancêtre commun de deux lapins (et la distance en
 * générations vers chacun), ou null s'il n'y en a aucun dans les `maxDepth`
 * générations.
 *
 * @returns { ancestor, distA, distB } | null
 */
export function findCommonAncestor(state, idA, idB, maxDepth = 10) {
  const byId = _byId(state);
  const a = byId.get(idA); const b = byId.get(idB);
  if (!a || !b || idA === idB) return null;
  const ancestorsA = _ancestorsWithDistance(byId, a, maxDepth);
  const ancestorsB = _ancestorsWithDistance(byId, b, maxDepth);
  let best = null;
  for (const [id, dA] of ancestorsA) {
    if (!ancestorsB.has(id)) continue;
    const dB = ancestorsB.get(id);
    const total = dA + dB;
    if (!best || total < best.total) {
      best = { ancestor: byId.get(id), distA: dA, distB: dB, total };
    }
  }
  return best;
}

/**
 * Tous les ancêtres d'un lapin avec leur distance (en générations). Si un
 * ancêtre est atteignable par plusieurs chemins (consanguinité), on garde
 * TOUS les chemins (pour le calcul de Wright). Retourne Map<id, Array<dist>>.
 */
function _allAncestorPaths(byId, rabbit, max) {
  const result = new Map();
  // Convention Wright : le lapin lui-même est son propre ancêtre à distance 0.
  // C'est nécessaire pour que F(offspring of A × B) soit correct quand A est
  // directement ancêtre de B (ex : parent × enfant doit donner 25 %).
  result.set(rabbit.id, [0]);
  function walk(r, d) {
    if (!r || d > max) return;
    const mId = _motherId(r), fId = _fatherId(r);
    for (const pid of [mId, fId]) {
      if (!pid) continue;
      const p = byId.get(pid);
      if (!p) continue;
      if (!result.has(pid)) result.set(pid, []);
      result.get(pid).push(d + 1);
      walk(p, d + 1);
    }
  }
  walk(rabbit, 0);
  return result;
}

/**
 * Distance minimum à chaque ancêtre (utilisé par findCommonAncestor pour
 * choisir le PLUS PROCHE commun). Map<id, distMin>.
 */
function _ancestorsWithDistance(byId, rabbit, max) {
  const all = _allAncestorPaths(byId, rabbit, max);
  const out = new Map();
  for (const [id, dists] of all) out.set(id, Math.min(...dists));
  return out;
}

// ── 4) Coefficient de consanguinité (Wright simplifié) ─────────────────────

/**
 * Coefficient de Wright pour la descendance hypothétique de A × B.
 *
 * Définition : F(enfant) = kinship(A, B) — la probabilité que les deux
 * allèles de l'enfant à un locus donné soient identiques par descendance.
 *
 * On utilise la formule récursive de Wright (méthode tabulaire), qui évite
 * le piège du "comptage de chemins naïf" (qui double-compte les ancêtres
 * via leurs propres parents). La récurrence :
 *
 *   kinship(A, B) = 0.5 × ( kinship(père(A), B) + kinship(mère(A), B) )
 *                                                           // si on décompose A
 *   kinship(A, A) = 0.5 × ( 1 + F(A) )
 *   kinship(A, B) = 0                                       // si pas d'ancêtres
 *
 * Règle critique : à chaque récurrence on décompose le plus JEUNE des deux
 * (sinon, si A descend de B, on tombe dans une boucle qui sous-estime F).
 * On utilise la profondeur d'ancêtres pour départager.
 *
 * Hypothèse simplificatrice : F = 0 pour les ancêtres racine sans parents
 * connus (pas d'information sur leur propre consanguinité).
 *
 * @returns {{ coefficient, percentage, contributions }}
 *   contributions liste les ancêtres communs avec leur chemin le plus court
 *   (pour l'UI d'explication — pas utilisé dans le calcul F).
 */
export function kinshipCoefficient(state, idA, idB) {
  const byId = _byId(state);
  const a = byId.get(idA); const b = byId.get(idB);
  if (!a || !b) return { coefficient: 0, percentage: 0, contributions: [] };

  const depths = _computeDepths(byId);
  const memo = new Map();
  const coefficient = _kinshipRec(byId, depths, a, b, memo, 0);

  // Contributions = liste informative des ancêtres communs (chemin le plus
  // court vers chacun). Pas utilisé dans F mais affiché côté UI.
  const contributions = [];
  if (idA !== idB) {
    const pathsA = _allAncestorPaths(byId, a, 12);
    const pathsB = _allAncestorPaths(byId, b, 12);
    for (const [id, distsA] of pathsA) {
      if (id === idA || id === idB) continue;
      if (!pathsB.has(id)) continue;
      const dA = Math.min(...distsA);
      const dB = Math.min(...pathsB.get(id));
      contributions.push({
        ancestor: byId.get(id), distA: dA, distB: dB,
        weight: Math.pow(0.5, dA + dB + 1),
      });
    }
    contributions.sort((x, y) => y.weight - x.weight);
  }

  return {
    coefficient: Math.min(coefficient, 1),
    percentage: Math.round(Math.min(coefficient, 1) * 10000) / 100,
    contributions,
  };
}

const MAX_REC_DEPTH = 24;

function _kinshipRec(byId, depths, a, b, memo, recDepth) {
  if (!a || !b || recDepth > MAX_REC_DEPTH) return 0;
  if (a.id === b.id) {
    return 0.5 * (1 + _inbreeding(byId, depths, a, memo, recDepth + 1));
  }
  // Mémo symétrique
  const k1 = a.id, k2 = b.id;
  const key = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
  if (memo.has(key)) return memo.get(key);
  memo.set(key, 0); // anti-cycle

  // Décomposer le plus jeune (depth la plus haute). Égalité → premier
  // arbitraire.
  const dA = depths.get(a.id) ?? 0;
  const dB = depths.get(b.id) ?? 0;
  const decompose = dA >= dB ? a : b;
  const other     = decompose === a ? b : a;

  const mId = _motherId(decompose), fId = _fatherId(decompose);
  const m = mId ? byId.get(mId) : null;
  const f = fId ? byId.get(fId) : null;
  if (!m && !f) {
    memo.set(key, 0);
    return 0;
  }
  const km = m ? _kinshipRec(byId, depths, m, other, memo, recDepth + 1) : 0;
  const kf = f ? _kinshipRec(byId, depths, f, other, memo, recDepth + 1) : 0;
  const result = 0.5 * (km + kf);
  memo.set(key, result);
  return result;
}

function _inbreeding(byId, depths, x, memo, recDepth) {
  // F(X) = kinship(père de X, mère de X). 0 si l'un des parents est inconnu.
  const m = byId.get(_motherId(x));
  const f = byId.get(_fatherId(x));
  if (!m || !f) return 0;
  return _kinshipRec(byId, depths, m, f, memo, recDepth);
}

/**
 * Profondeur maximale des ancêtres pour chaque lapin. Utilisé par la
 * récurrence Wright pour décomposer le plus jeune (depth la plus haute).
 * O(n) avec memoization, anti-boucle.
 */
function _computeDepths(byId) {
  const depths = new Map();
  function compute(id, visiting) {
    if (depths.has(id)) return depths.get(id);
    if (visiting.has(id)) return 0; // cycle de sécurité
    visiting.add(id);
    const r = byId.get(id);
    if (!r) { visiting.delete(id); return 0; }
    const mId = _motherId(r), fId = _fatherId(r);
    let d = 0;
    if (mId && byId.has(mId)) d = Math.max(d, 1 + compute(mId, visiting));
    if (fId && byId.has(fId)) d = Math.max(d, 1 + compute(fId, visiting));
    visiting.delete(id);
    depths.set(id, d);
    return d;
  }
  for (const id of byId.keys()) compute(id, new Set());
  return depths;
}

/**
 * Bucket d'interprétation visuelle du coefficient (pour code couleur UI).
 * Seuils basés sur les recommandations vétérinaires en cuniculture.
 *
 * < 6.25 %  : OK (équivalent ≤ cousins germains)
 * 6.25-12.5 : prudence (oncle/nièce, demi-frère/sœur)
 * > 12.5 %  : déconseillé (parent/enfant, frère/sœur)
 */
export function kinshipLevel(percentage) {
  if (percentage < 6.25) return { code: 'ok',       label: 'OK',         color: '#16a34a' };
  if (percentage < 12.5) return { code: 'caution',  label: 'Prudence',   color: '#d97706' };
  return                        { code: 'danger',   label: 'Déconseillé', color: '#b91c1c' };
}

// ── 5) Suggestion d'accouplement ────────────────────────────────────────────

/**
 * Pour une femelle donnée, suggère des mâles compatibles. Tri :
 *   1. coefficient de consanguinité croissant (priorité 1)
 *   2. âge de maturité du mâle (actif & adulte)
 *   3. ID (stabilité)
 *
 * Filtres :
 *   - sex = 'M', status = 'actif'
 *   - exclure le père de la femelle (évident)
 *   - kinship < `maxKinship` (défaut 12.5 % = pas de frère/sœur ou plus proche)
 *
 * @returns Array<{ buck, kinship: { coefficient, percentage, contributions } }>
 */
export function suggestMates(state, doeId, { maxKinship = 12.5, limit = 10 } = {}) {
  const byId = _byId(state);
  const doe = byId.get(doeId);
  if (!doe || doe.sex !== 'F') return [];
  const fatherOfDoe = _fatherId(doe);

  const results = [];
  for (const r of (state.rabbits || [])) {
    if (r.sex !== 'M' || r.status !== 'actif') continue;
    if (r.id === fatherOfDoe) continue;            // skip the father lui-même
    const k = kinshipCoefficient(state, doeId, r.id);
    if (k.percentage > maxKinship) continue;
    results.push({ buck: r, kinship: k });
  }
  results.sort((a, b) => a.kinship.coefficient - b.kinship.coefficient);
  return results.slice(0, limit);
}

// ── Exposés internes pour les tests ─────────────────────────────────────────
export const _internals = { _allAncestorPaths, _ancestorsWithDistance };
