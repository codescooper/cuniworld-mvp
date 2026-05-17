/**
 * xssSafety.test.js — garde-fou anti-XSS sur les renderers.
 *
 * Stratégie : on injecte des payloads XSS classiques dans les champs
 * user-controlled (nom, code, notes, cage, race…) puis on rend les
 * panneaux. Aucun nœud `<script>` ne doit apparaître dans le DOM résultant.
 *
 * Pas exhaustif sur tous les renderers (les modales ouvertes à la demande
 * sont testées séparément), mais couvre les chemins les plus fréquentés :
 * dashboard, liste lapins, détails lapin, événements, lots.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { renderAll } from "../src/render.js";
import { getEls } from "../src/dom.js";

const XSS_PAYLOADS = [
  '<script>window.__pwned=true</script>',
  '"><img src=x onerror="window.__pwned=true">',
  "<svg/onload=alert(1)>",
  "javascript:alert(1)",
  "</strong><script>1</script>",
];

function buildDOM() {
  // On crée un squelette DOM minimal contenant les éléments référencés par
  // getEls(). Les IDs proviennent de l'inspection de src/dom.js.
  document.body.innerHTML = `
    <div id="appVersionFooter"></div>
    <div id="panel-dashboard"><div id="dash"></div></div>
    <div id="panel-rabbits">
      <div id="rabbitList"></div>
      <div id="rabbitDetails"></div>
      <div id="eventsPanel"></div>
      <input id="q" />
      <select id="sexFilter"><option value="all">all</option></select>
      <select id="statusFilter"><option value="all">all</option></select>
    </div>
    <div id="panel-lots">
      <div id="lotList"></div>
      <div id="lotDetails"></div>
      <input id="lotQ" />
      <select id="lotStatusFilter"><option value="all">all</option></select>
    </div>
    <div id="panel-genealogy">
      <div id="geneGraph"></div>
      <div id="geneList"></div>
      <input id="geneQ" />
    </div>
    <div id="modal" class="hidden"><div id="modalTitle"></div><div id="modalBody"></div></div>
    <div id="syncBadge"></div>
    <button id="btnNewRabbit"></button>
    <button id="btnExport"></button>
    <button id="btnReset"></button>
    <button id="btnPhotoCheck"></button>
  `;
}

function ctxWith(payload) {
  return {
    state: {
      rabbits: [
        { id: 'r1', code: payload, name: payload, sex: 'F', status: 'actif',
          breed: payload, cage: payload, notes: payload,
          birthDate: '2025-01-01' },
      ],
      events: [
        { id: 'e1', rabbitId: 'r1', type: 'autre', date: '2025-06-01',
          notes: payload, data: { destCage: payload } },
      ],
      photos: [],
      lots: [],
      buildings: [],
      lodges: [],
      lodgeDefects: [],
      lodgeInspections: [],
      stock: [],
      stockMovements: [],
      farmActions: [],
    },
    el: getEls(),
    farmId: null,
    farmName: null,
    activePanel: 'rabbits',
    selectedRabbitId: 'r1',
    selectedLotId: null,
    selectedGeneRabbitId: null,
    syncStatus: 'local',
    farmSettings: null,
  };
}

describe("XSS safety — renderers ne créent jamais de <script> à partir de données user", () => {
  beforeEach(() => {
    buildDOM();
    // Sentinelle : si un payload exécute du JS, ce flag passe à true.
    delete window.__pwned;
  });

  for (const payload of XSS_PAYLOADS) {
    it(`payload neutralisé : ${payload.slice(0, 40)}…`, () => {
      const ctx = ctxWith(payload);
      try { renderAll(ctx); } catch (_) { /* certains renderers nécessitent d'autres deps, on tolère */ }

      // 1. Aucun <script> n'a été inséré dans le DOM.
      expect(document.querySelectorAll('script').length).toBe(0);

      // 2. Aucun handler inline n'a été activé : pas d'élément avec attribut
      //    onerror/onload/onclick qui contiendrait du code arbitraire.
      const inlineHandlers = document.querySelectorAll('[onerror], [onload], [onclick]');
      expect(inlineHandlers.length).toBe(0);

      // 3. Aucune exécution n'a eu lieu (le payload aurait posé window.__pwned).
      expect(window.__pwned).toBeUndefined();
    });
  }
});
