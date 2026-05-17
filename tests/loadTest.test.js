/**
 * loadTest.test.js — test de charge sur les renderers principaux.
 *
 * Génère un état réaliste avec 1000 lapins + 5000 événements, puis mesure
 * le temps de rendu de la liste lapins, du dashboard et des détails d'un
 * lapin. Si l'un de ces rendus dépasse le seuil, on échoue — c'est un
 * indicateur que quelqu'un a introduit un O(n²) ou une dépendance lourde.
 *
 * Référence roadmap : 3.5.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { renderRabbitList, renderRabbitDetails, renderDashboard } from "../src/render.js";
import { getEls } from "../src/dom.js";

const N_RABBITS = 1000;
const N_EVENTS  = 5000;

// Seuils volontairement larges pour absorber la variabilité du CI. L'objectif
// est de détecter une régression catastrophique (passage de 1 s à 60 s), pas
// d'optimiser au ms près.
//
// Note : jsdom est ~10× plus lent qu'un navigateur réel pour les opérations
// DOM (parsing innerHTML notamment). Les chiffres ci-dessous représentent le
// comportement jsdom — en prod (Chrome/Safari) divisez par 10 pour avoir un
// ordre de grandeur. Ils servent d'alarme régression : si on dépasse, c'est
// qu'on a introduit un O(n²) ou empilé de l'HTML inutile.
const THRESHOLDS_MS = {
  list:    15000,
  details: 1500,
  dash:    8000,
};

let bigState;

function buildDOM() {
  document.body.innerHTML = `
    <div id="appVersionFooter"></div>
    <div id="panel-dashboard"><div id="dash"></div></div>
    <div id="panel-rabbits">
      <div id="rabbitList"></div>
      <div id="rabbitDetails"></div>
      <div id="eventsPanel"></div>
      <input id="q" />
      <select id="sexFilter"><option value="" selected>tous</option></select>
      <select id="statusFilter"><option value="" selected>tous</option></select>
    </div>
    <div id="modal" class="hidden"><div id="modalTitle"></div><div id="modalBody"></div></div>
    <div id="syncBadge"></div>
    <button id="btnNewRabbit"></button>
    <button id="btnExport"></button>
    <button id="btnReset"></button>
    <button id="btnPhotoCheck"></button>
  `;
}

function buildBigState() {
  const rabbits = [];
  for (let i = 0; i < N_RABBITS; i++) {
    rabbits.push({
      id:        `r${i}`,
      code:      `CW-${String(i).padStart(4, '0')}`,
      name:      `Lapin ${i}`,
      sex:       i % 3 === 0 ? 'M' : 'F',
      status:    i % 50 === 0 ? 'mort' : 'actif',
      breed:     'Néo-zélandais',
      cage:      `B${Math.floor(i / 20)}-${i % 20}`,
      notes:     i % 7 === 0 ? 'Note moyenne' : '',
      birthDate: '2025-01-01',
      forSale:   i % 11 === 0,
    });
  }
  const events = [];
  for (let i = 0; i < N_EVENTS; i++) {
    const ri = i % N_RABBITS;
    events.push({
      id:       `e${i}`,
      rabbitId: `r${ri}`,
      type:     ['pesée', 'saillie', 'mise_bas', 'vaccin', 'sevrage'][i % 5],
      date:     `2025-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
      notes:    '',
      data:     { weight: 1 + (i % 5), product: 'Test' },
    });
  }
  return {
    rabbits,
    events,
    photos: [],
    lots: [],
    buildings: [],
    lodges: [],
    lodgeDefects: [],
    lodgeInspections: [],
    stock: [],
    stockMovements: [],
    farmActions: [],
  };
}

function ctxFor(state, opts = {}) {
  return {
    state,
    el: getEls(),
    farmId: null, farmName: null,
    activePanel: 'rabbits',
    selectedRabbitId: opts.selectedRabbitId || null,
    selectedLotId: null,
    selectedGeneRabbitId: null,
    syncStatus: 'local',
    farmSettings: null,
  };
}

function measure(label, fn) {
  const t0 = performance.now();
  fn();
  const dt = performance.now() - t0;
  // eslint-disable-next-line no-console
  console.log(`[load] ${label}: ${dt.toFixed(1)} ms`);
  return dt;
}

describe("Test de charge — 1000 lapins + 5000 événements", () => {
  beforeAll(() => {
    buildDOM();
    bigState = buildBigState();
  });

  it(`rabbitList rend sous ${THRESHOLDS_MS.list} ms`, () => {
    const ctx = ctxFor(bigState);
    const dt = measure('rabbitList', () => renderRabbitList(ctx));
    expect(dt).toBeLessThan(THRESHOLDS_MS.list);
    // Vérification correctness : la liste doit contenir N_RABBITS items
    // (statut actif uniquement par défaut — filtre dans la fonction).
    const items = document.querySelectorAll('[data-rabbit]');
    expect(items.length).toBeGreaterThan(N_RABBITS * 0.9); // 50/1000 morts par défaut filtrés
  });

  it(`rabbitDetails rend sous ${THRESHOLDS_MS.details} ms (lapin avec 5 événements)`, () => {
    const ctx = ctxFor(bigState, { selectedRabbitId: 'r0' });
    const dt = measure('rabbitDetails', () => renderRabbitDetails(ctx));
    expect(dt).toBeLessThan(THRESHOLDS_MS.details);
  });

  it(`dashboard rend sous ${THRESHOLDS_MS.dash} ms`, () => {
    const ctx = ctxFor(bigState);
    const dt = measure('dashboard', () => renderDashboard(ctx));
    expect(dt).toBeLessThan(THRESHOLDS_MS.dash);
  });
});
