function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function nowISO() { return new Date().toISOString(); }

export const LODGE_EVENT_TYPES = {
  inspection: { label: 'Inspection',  icon: '🔍' },
  nettoyage:  { label: 'Nettoyage',   icon: '🧹' },
  reparation: { label: 'Réparation',  icon: '🔧' },
  desinfection:{ label: 'Désinfection',icon: '💧' },
};

// ── Buildings CRUD ────────────────────────────────────────────────────────────

export function createBuilding(state, { letter, lodgeCount, lodgesPerRow = 0, notes = '', inspectionDays = 30 }) {
  if (!letter?.trim()) throw new Error('Lettre requise.');
  const L = letter.trim().toUpperCase();
  if (!/^[A-Za-z]$/.test(letter.trim())) throw new Error('La lettre doit être A-Z.');
  if ((state.buildings || []).some(b => b.letter === L)) throw new Error(`Bâtiment ${L} existe déjà.`);

  const count  = Math.max(1, parseInt(lodgeCount) || 1);
  const perRow = parseInt(lodgesPerRow) || (count > 5 ? Math.ceil(count / 2) : count);

  const building = {
    id: uid('bg'), letter: L, lodgeCount: count, lodgesPerRow: perRow,
    notes: notes.trim(), inspectionDays: Math.max(1, parseInt(inspectionDays) || 30),
    createdAt: nowISO(), updatedAt: nowISO(),
  };

  const newLodges = [];
  for (let i = 1; i <= count; i++) {
    newLodges.push({ id: uid('lg'), buildingId: building.id, number: i, code: `${L}${i}`, notes: '', createdAt: nowISO() });
  }

  return { ...state, buildings: [...(state.buildings || []), building], lodges: [...(state.lodges || []), ...newLodges] };
}

export function updateBuilding(state, buildingId, fields) {
  const buildings = (state.buildings || []).map(b =>
    b.id === buildingId ? { ...b, ...fields, id: b.id, letter: b.letter, updatedAt: nowISO() } : b
  );
  return { ...state, buildings };
}

export function deleteBuilding(state, buildingId) {
  const lodgeIds = new Set((state.lodges || []).filter(l => l.buildingId === buildingId).map(l => l.id));
  return {
    ...state,
    buildings:    (state.buildings    || []).filter(b => b.id !== buildingId),
    lodges:       (state.lodges       || []).filter(l => l.buildingId !== buildingId),
    lodgeDefects: (state.lodgeDefects || []).filter(d =>
      !(d.targetType === 'batiment' && d.targetId === buildingId) &&
      !(d.targetType === 'loge'     && lodgeIds.has(d.targetId))
    ),
    lodgeEvents:  (state.lodgeEvents  || []).filter(e =>
      !lodgeIds.has(e.lodgeId) && e.buildingId !== buildingId
    ),
  };
}

// ── Lodge ─────────────────────────────────────────────────────────────────────

export function updateLodge(state, lodgeId, fields) {
  return { ...state, lodges: (state.lodges || []).map(l => l.id === lodgeId ? { ...l, ...fields, id: l.id, code: l.code } : l) };
}

export function getLodgeByCode(state, code) {
  return (state.lodges || []).find(l => l.code === code) || null;
}

export function getRabbitsInLodge(state, lodgeCode) {
  return (state.rabbits || []).filter(r => r.cage === lodgeCode && r.status === 'actif');
}

export function getLodgeHistory(state, lodgeCode) {
  return (state.rabbits || []).filter(r => r.cage === lodgeCode && r.status !== 'actif');
}

// ── Defects ───────────────────────────────────────────────────────────────────

export function reportDefect(state, { targetType, targetId, description, severity = 'mineur' }) {
  if (!description?.trim()) throw new Error('Description requise.');
  const defect = {
    id: uid('df'), targetType, targetId,
    description: description.trim(), severity,
    status: 'ouvert', reportedAt: nowISO(), resolvedAt: null,
  };
  return { ...state, lodgeDefects: [...(state.lodgeDefects || []), defect] };
}

export function resolveDefect(state, defectId) {
  return {
    ...state,
    lodgeDefects: (state.lodgeDefects || []).map(d =>
      d.id === defectId ? { ...d, status: 'resolu', resolvedAt: nowISO() } : d
    ),
  };
}

export function deleteDefect(state, defectId) {
  return { ...state, lodgeDefects: (state.lodgeDefects || []).filter(d => d.id !== defectId) };
}

export function getOpenDefects(state) {
  return (state.lodgeDefects || []).filter(d => d.status === 'ouvert');
}

export function getDefectsForTarget(state, targetId) {
  return (state.lodgeDefects || []).filter(d => d.targetId === targetId);
}

// ── Lodge events ──────────────────────────────────────────────────────────────

export function addLodgeEvent(state, { lodgeId = null, buildingId = null, type, date, notes = '' }) {
  const event = {
    id: uid('le'), lodgeId, buildingId, type,
    date: date || new Date().toISOString().slice(0, 10),
    notes: notes.trim(), createdAt: nowISO(),
  };
  return { ...state, lodgeEvents: [...(state.lodgeEvents || []), event] };
}

export function getLodgeEvents(state, lodgeId) {
  return (state.lodgeEvents || [])
    .filter(e => e.lodgeId === lodgeId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function getBuildingEvents(state, buildingId) {
  return (state.lodgeEvents || [])
    .filter(e => e.buildingId === buildingId && !e.lodgeId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ── Last inspection date for a lodge ─────────────────────────────────────────

export function getLastInspectionDate(state, lodgeId) {
  const events = (state.lodgeEvents || [])
    .filter(e => e.lodgeId === lodgeId && (e.type === 'inspection' || e.type === 'nettoyage'))
    .sort((a, b) => b.date.localeCompare(a.date));
  return events[0]?.date || null;
}

// ── Overdue inspections ───────────────────────────────────────────────────────

export function getOverdueInspections(state) {
  const today = new Date().toISOString().slice(0, 10);
  const result = [];
  for (const b of (state.buildings || [])) {
    const lodges = (state.lodges || []).filter(l => l.buildingId === b.id);
    for (const l of lodges) {
      const last = getLastInspectionDate(state, l.id);
      if (!last) { result.push({ lodge: l, building: b, daysSince: null }); continue; }
      const days = Math.floor((new Date(today) - new Date(last)) / 86400000);
      if (days >= b.inspectionDays) result.push({ lodge: l, building: b, daysSince: days });
    }
  }
  return result;
}

// ── Normalise legacy cage codes (A-01 → A1) ───────────────────────────────────
// Anciens formats avec tiret (ex: "A-01") ne matchent pas le format attendu.
// Cette migration one-shot renomme les cages sur rabbits ET sur les loges existantes.
export function normalizeLegacyCageCodes(state) {
  const legacyRx = /^([A-Za-z]+)-(\d+)$/;
  let changed = false;
  const rabbits = (state.rabbits || []).map(r => {
    const m = String(r.cage || '').match(legacyRx);
    if (!m) return r;
    changed = true;
    return { ...r, cage: `${m[1].toUpperCase()}${parseInt(m[2], 10)}` };
  });
  const lodges = (state.lodges || []).map(l => {
    const m = String(l.code || '').match(legacyRx);
    if (!m) return l;
    changed = true;
    return { ...l, code: `${m[1].toUpperCase()}${parseInt(m[2], 10)}` };
  });
  return changed ? { ...state, rabbits, lodges } : state;
}

// ── Auto-migration from rabbit cage codes ─────────────────────────────────────

export function autoMigrateFromCages(state) {
  if ((state.buildings || []).length > 0) return state; // already configured

  const cageRx = /^([A-Za-z]+)(\d+)$/;
  const zoneMap = new Map();

  for (const r of (state.rabbits || [])) {
    const m = String(r.cage || '').trim().match(cageRx);
    if (!m) continue;
    const zone = m[1].toUpperCase();
    const num  = parseInt(m[2], 10);
    if (!zoneMap.has(zone) || num > zoneMap.get(zone)) zoneMap.set(zone, num);
  }

  if (!zoneMap.size) return state;

  let next = state;
  for (const [letter, maxNum] of [...zoneMap.entries()].sort()) {
    const count  = maxNum;
    const perRow = count > 5 ? Math.ceil(count / 2) : count;
    try {
      next = createBuilding(next, { letter, lodgeCount: count, lodgesPerRow: perRow, notes: 'Migré auto', inspectionDays: 30 });
    } catch (_) {}
  }
  return next;
}
