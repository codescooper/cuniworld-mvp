// Mode Simulation : génère un état CuniWorld réaliste et cohérent à partir de
// paramètres utilisateur. Le résultat est marqué `state.meta.simulation = true`
// pour pouvoir être distingué d'une vraie exploitation à tout moment.
//
// La simulation respecte les mêmes invariants que l'application réelle :
//   - saillie → mise_bas (~31 j) → sevrage (~35 j) → repos (~7 j)
//   - mise_bas génère des lapereaux (équivalent applyEventSideEffects)
//   - sevrage transforme les kits en "jeune" et fixe leur lot
//   - la dernière partie du cycle est laissée incomplète pour produire des
//     femelles en gestation / allaitement à la date du jour.

import { NARUTO_NAMES } from "./narutoNames.js";

const SCHEMA_VERSION = 6;

const BREEDS = ["Néo-zélandais", "Californien", "Géant des Flandres", "Fauve de Bourgogne", "Argenté de Champagne"];

// ── RNG seedé (Mulberry32) ───────────────────────────────────────────────────
function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickInt(rng, min, max) { return Math.floor(rng() * (max - min + 1)) + min; }
function pickFrom(rng, arr)    { return arr[Math.floor(rng() * arr.length)]; }

// ── Outils dates ─────────────────────────────────────────────────────────────
function toISO(date) { return date.toISOString().slice(0, 10); }
function addDaysISO(iso, days) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

// ── Identifiants ─────────────────────────────────────────────────────────────
function makeUid(rng) {
  let counter = 0;
  return (prefix = "id") => {
    counter += 1;
    const a = counter.toString(36);
    const b = Math.floor(rng() * 0xffffff).toString(36);
    return `${prefix}_sim_${a}_${b}`;
  };
}

// ── Construction des bâtiments ───────────────────────────────────────────────
function buildBuildings(uid, nbBuildings, lodgesPerBuilding) {
  const buildings = [];
  const lodges    = [];
  for (let i = 0; i < nbBuildings; i += 1) {
    const letter = String.fromCharCode(65 + i);
    const building = {
      id: uid("bg"), letter,
      lodgeCount: lodgesPerBuilding,
      lodgesPerRow: lodgesPerBuilding > 5 ? Math.ceil(lodgesPerBuilding / 2) : lodgesPerBuilding,
      notes: "", inspectionDays: 30,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    buildings.push(building);
    for (let n = 1; n <= lodgesPerBuilding; n += 1) {
      lodges.push({
        id: uid("lg"), buildingId: building.id, number: n,
        code: `${letter}${n}`, notes: "", createdAt: new Date().toISOString(),
      });
    }
  }
  return { buildings, lodges };
}

// ── Pool noms uniques ────────────────────────────────────────────────────────
function makeNamePicker(rng) {
  const pool = [...NARUTO_NAMES];
  // Shuffle via Fisher-Yates pour épuiser le pool sans collision.
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  let idx = 0;
  return () => {
    if (idx >= pool.length) return `Lapin${idx++}`;
    return pool[idx++];
  };
}

// ── Création reproducteurs ───────────────────────────────────────────────────
function createBreeder(uid, pickName, rng, { sex, codeNumber, lodgeCode, todayISO }) {
  const ageMonths = pickInt(rng, 9, 18);
  const birthDate = addDaysISO(todayISO, -ageMonths * 30);
  const code = `CW-${sex}${String(codeNumber).padStart(3, "0")}`;
  return {
    id: uid("rb"),
    code, name: pickName(),
    sex, breed: pickFrom(rng, BREEDS),
    birthDate, cage: lodgeCode,
    status: "actif",
    stage: "adulte",
    notes: sex === "F" ? "Reproductrice (simulation)" : "Reproducteur (simulation)",
    motherId: null, fatherId: null,
    breedingOverride: "auto",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ── Cycle reproduction rétrograde pour une femelle ───────────────────────────
//
// Construit, en partant d'aujourd'hui et en remontant le temps, des cycles
// saillie/mise_bas/sevrage complets. Le tout dernier cycle est tronqué pour que
// la femelle soit, à la date du jour, soit en gestation soit en allaitement.
function simulateCyclesForDoe(state, uid, rng, doe, buck, todayISO, monthsHistory) {
  const events = [];
  const newKits = [];
  const horizonDays = monthsHistory * 30;
  const earliestCycleStart = addDaysISO(todayISO, -horizonDays);

  // État final choisi aléatoirement : 50 % gestante, 50 % allaitante.
  const endsAs = rng() < 0.5 ? "gestante" : "allaitante";

  // Position du dernier événement utile (date la plus récente).
  let cursorISO;
  if (endsAs === "gestante") {
    // Une saillie il y a 5-25 jours, pas encore de mise-bas.
    cursorISO = addDaysISO(todayISO, -pickInt(rng, 5, 25));
    events.push(makeMatingEvent(uid, doe, buck, cursorISO));
  } else {
    // Mise-bas il y a 5-25 jours → allaitement. La saillie correspondante a eu
    // lieu ~31 jours avant.
    const birthISO = addDaysISO(todayISO, -pickInt(rng, 5, 25));
    const matingISO = addDaysISO(birthISO, -31);
    events.push(makeMatingEvent(uid, doe, buck, matingISO));
    const { event, kits } = makeBirthEvent(uid, rng, doe, buck, birthISO);
    events.push(event);
    newKits.push(...kits);
    cursorISO = matingISO;
  }

  // Cycles complets antérieurs : sevrage → mise_bas → saillie en remontant.
  while (true) {
    const prevSevrageISO = addDaysISO(cursorISO, -pickInt(rng, 7, 14));
    const prevBirthISO   = addDaysISO(prevSevrageISO, -pickInt(rng, 33, 38));
    const prevMatingISO  = addDaysISO(prevBirthISO, -pickInt(rng, 30, 32));
    if (prevMatingISO < earliestCycleStart) break;
    if (prevMatingISO < doe.birthDate) break;

    const mating = makeMatingEvent(uid, doe, buck, prevMatingISO);
    const birthResult = makeBirthEvent(uid, rng, doe, buck, prevBirthISO);
    events.push(mating, birthResult.event);
    newKits.push(...birthResult.kits);

    // Sevrage : on a besoin d'avoir les kits dans state.rabbits pour appliquer
    // les effets de bord (changement de stage, lot). Donc on les ajoute déjà.
    state.rabbits.push(...birthResult.kits);
    const sevrage = makeSevrageEvent(uid, doe, prevSevrageISO, birthResult.event, birthResult.kits, state);
    if (sevrage) events.push(sevrage);

    cursorISO = prevMatingISO;
  }

  return { events, newKits };
}

function makeMatingEvent(uid, doe, buck, date) {
  return {
    id: uid("ev"), rabbitId: doe.id, type: "saillie",
    date, notes: "Saillie (simulation)",
    data: { maleId: buck.id },
    createdAt: new Date().toISOString(),
  };
}

function makeBirthEvent(uid, rng, doe, buck, date) {
  const born = pickInt(rng, 6, 11);
  const dead = rng() < 0.6 ? 0 : pickInt(rng, 1, 2);
  const alive = Math.max(0, born - dead);
  const event = {
    id: uid("ev"), rabbitId: doe.id, type: "mise_bas",
    date, notes: "Mise-bas (simulation)",
    data: { born, alive, dead, kitsCreated: true, kitsCount: alive },
    createdAt: new Date().toISOString(),
  };
  // Kits = équivalent applyEventSideEffects("mise_bas").
  const kits = [];
  for (let i = 1; i <= alive; i += 1) {
    const n = String(i).padStart(2, "0");
    kits.push({
      id: uid("rb"),
      code: `${doe.code}-K${n}-${event.id.slice(-4)}`,
      name: `Lapereau ${n}`,
      sex: "U",
      breed: doe.breed || "",
      birthDate: date,
      cage: doe.cage || "",
      status: "actif",
      stage: "kit",
      notes: `Né le ${date} (simulation)`,
      doeId: doe.id, buckId: buck.id,
      motherId: doe.id, fatherId: buck.id,
      litterId: event.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  return { event, kits };
}

function makeSevrageEvent(uid, doe, date, birthEvent, kits, state) {
  if (kits.length === 0) return null;
  // Sort 40 % des sevrages dans une autre loge (réaliste).
  const destCage = doe.cage; // simple : conserver la cage actuelle
  const rabbitIds = kits.map(k => k.id);
  // Appliquer les effets de bord du sevrage (stage → jeune).
  for (const kit of kits) {
    kit.stage = "jeune";
    if (destCage) kit.cage = destCage;
    kit.updatedAt = new Date().toISOString();
  }
  // Marquer les jeunes comme déjà sevrés dans la table rabbits.
  for (const k of kits) {
    const r = state.rabbits.find(x => x.id === k.id);
    if (r) { r.stage = "jeune"; }
  }
  return {
    id: uid("ev"), rabbitId: doe.id, type: "sevrage",
    date, notes: "Sevrage (simulation)",
    data: {
      litterId: birthEvent.id,
      rabbitIds, weanedCount: rabbitIds.length,
      destCage,
    },
    createdAt: new Date().toISOString(),
  };
}

// ── Stock + tournée + défauts ────────────────────────────────────────────────
function buildStock(uid, rng, todayISO) {
  const stock = [
    { id: uid("st"), name: "Granulés lapin", category: "alimentation", quantity: pickInt(rng, 25, 60), unit: "kg", minQuantity: 10, notes: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: uid("st"), name: "Foin",           category: "alimentation", quantity: pickInt(rng, 15, 40), unit: "kg", minQuantity: 5,  notes: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: uid("st"), name: "Vermifuge",      category: "vétérinaire",  quantity: pickInt(rng, 40, 120), unit: "mL", minQuantity: 20, notes: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: uid("st"), name: "Litière",        category: "entretien",    quantity: pickInt(rng, 4, 12), unit: "sacs", minQuantity: 2, notes: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ];
  const movements = [];
  for (let i = 0; i < 6; i += 1) {
    const item = pickFrom(rng, stock);
    movements.push({
      id: uid("mv"),
      stockItemId: item.id,
      type: rng() < 0.7 ? "sortie" : "entree",
      quantity: pickInt(rng, 1, 5),
      date: addDaysISO(todayISO, -pickInt(rng, 1, 25)),
      notes: "Mouvement simulation",
      createdAt: new Date().toISOString(),
    });
  }
  return { stock, movements };
}

function buildLodgeEvents(uid, rng, lodges, todayISO) {
  const events = [];
  const types = ["inspection", "nettoyage", "desinfection"];
  for (const l of lodges.slice(0, Math.min(6, lodges.length))) {
    events.push({
      id: uid("le"), lodgeId: l.id, buildingId: null,
      type: pickFrom(rng, types),
      date: addDaysISO(todayISO, -pickInt(rng, 2, 25)),
      notes: "Entretien simulation",
      createdAt: new Date().toISOString(),
    });
  }
  return events;
}

function buildDefects(uid, rng, lodges) {
  if (lodges.length === 0) return [];
  const sample = [];
  const count = Math.min(2, lodges.length);
  for (let i = 0; i < count; i += 1) {
    const l = lodges[pickInt(rng, 0, lodges.length - 1)];
    sample.push({
      id: uid("df"), targetType: "loge", targetId: l.id,
      description: pickFrom(rng, ["Mangeoire endommagée", "Porte mal alignée", "Abreuvoir bouché"]),
      severity: rng() < 0.7 ? "mineur" : "majeur",
      status: "ouvert",
      reportedAt: new Date().toISOString(), resolvedAt: null,
    });
  }
  return sample;
}

// ── Entrée principale ────────────────────────────────────────────────────────
export const SIMULATION_DEFAULTS = Object.freeze({
  buildings: 2,
  lodgesPerBuilding: 6,
  does: 4,
  bucks: 1,
  monthsHistory: 6,
  seed: 1,
});

export function generateSimulation(rawParams = {}) {
  const params = { ...SIMULATION_DEFAULTS, ...rawParams };
  // Garde-fous : valeurs minimales/maximales raisonnables.
  params.buildings        = Math.max(1, Math.min(6,  parseInt(params.buildings) || 1));
  params.lodgesPerBuilding= Math.max(2, Math.min(20, parseInt(params.lodgesPerBuilding) || 2));
  params.does             = Math.max(1, Math.min(30, parseInt(params.does) || 1));
  params.bucks            = Math.max(1, Math.min(10, parseInt(params.bucks) || 1));
  params.monthsHistory    = Math.max(1, Math.min(18, parseInt(params.monthsHistory) || 1));
  params.seed             = Math.max(1, parseInt(params.seed) || 1);

  const totalLodgeCapacity = params.buildings * params.lodgesPerBuilding;
  const totalBreeders = params.does + params.bucks;
  if (totalBreeders > totalLodgeCapacity) {
    throw new Error(`Capacité insuffisante : ${totalBreeders} reproducteurs pour ${totalLodgeCapacity} loges.`);
  }

  const rng = makeRng(params.seed);
  const uid = makeUid(rng);
  const todayISO = new Date().toISOString().slice(0, 10);

  // 1. Bâtiments + loges.
  const { buildings, lodges } = buildBuildings(uid, params.buildings, params.lodgesPerBuilding);
  const lodgeCodes = lodges.map(l => l.code);

  // 2. Reproducteurs.
  const pickName = makeNamePicker(rng);
  const rabbits = [];
  let codeFemale = 1;
  let codeMale = 1;
  let lodgeIdx = 0;

  const bucks = [];
  for (let i = 0; i < params.bucks; i += 1) {
    const buck = createBreeder(uid, pickName, rng, {
      sex: "M", codeNumber: codeMale++,
      lodgeCode: lodgeCodes[lodgeIdx++ % lodgeCodes.length],
      todayISO,
    });
    bucks.push(buck);
    rabbits.push(buck);
  }
  const does = [];
  for (let i = 0; i < params.does; i += 1) {
    const doe = createBreeder(uid, pickName, rng, {
      sex: "F", codeNumber: codeFemale++,
      lodgeCode: lodgeCodes[lodgeIdx++ % lodgeCodes.length],
      todayISO,
    });
    does.push(doe);
    rabbits.push(doe);
  }

  // 3. Génération des cycles pour chaque femelle.
  const events = [];
  const stateScratch = { rabbits };
  for (const doe of does) {
    const buck = bucks[Math.floor(rng() * bucks.length)];
    const result = simulateCyclesForDoe(stateScratch, uid, rng, doe, buck, todayISO, params.monthsHistory);
    events.push(...result.events);
    // Les kits du dernier cycle (non encore sevrés) sont ajoutés directement.
    for (const k of result.newKits) {
      if (!stateScratch.rabbits.some(r => r.id === k.id)) {
        stateScratch.rabbits.push(k);
      }
    }
  }

  // 4. Quelques pesées et vaccins sur les reproducteurs.
  for (const r of [...bucks, ...does]) {
    events.push({
      id: uid("ev"), rabbitId: r.id, type: "vaccin",
      date: addDaysISO(todayISO, -pickInt(rng, 20, 60)),
      notes: "Vaccin annuel (simulation)", data: {},
      createdAt: new Date().toISOString(),
    });
    events.push({
      id: uid("ev"), rabbitId: r.id, type: "pesée",
      date: addDaysISO(todayISO, -pickInt(rng, 5, 30)),
      notes: "Pesée (simulation)",
      data: { weight: 3 + rng() * 1.5 },
      createdAt: new Date().toISOString(),
    });
  }

  // 5. Stock, lodge events, défauts.
  const { stock, movements } = buildStock(uid, rng, todayISO);
  const lodgeEvents = buildLodgeEvents(uid, rng, lodges, todayISO);
  const lodgeDefects = buildDefects(uid, rng, lodges);

  // 6. Une tournée du jour partiellement complétée.
  const rounds = [{
    id: uid("rd"),
    date: todayISO,
    water: true,
    cleaning: rng() < 0.5,
    feedings: stateScratch.rabbits
      .filter(r => r.status === "actif")
      .slice(0, Math.min(10, stateScratch.rabbits.length))
      .map(r => ({ rabbitId: r.id, portion: pickFrom(rng, ["normal", "réduit", "double"]) })),
    notes: "Tournée simulation",
    createdAt: new Date().toISOString(),
  }];

  // 7. usedNames : verrouille les noms réellement utilisés (depuis le pool).
  const usedNames = {};
  for (const r of stateScratch.rabbits) {
    if (r.name && NARUTO_NAMES.includes(r.name)) usedNames[r.name] = r.id;
  }

  return {
    version: SCHEMA_VERSION,
    meta: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      simulation: true,
      simulationParams: params,
    },
    rabbits: stateScratch.rabbits,
    events,
    photos: [],
    usedNames,
    lotStatuses: {},
    stock,
    stockMovements: movements,
    rounds,
    buildings,
    lodges,
    lodgeDefects,
    lodgeEvents,
  };
}

// Distingue à l'exécution une vraie ferme d'une simulation locale.
export function isSimulationState(state) {
  return Boolean(state?.meta?.simulation);
}
