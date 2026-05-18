import { describe, it, expect, beforeEach } from "vitest";
import { renderGenealogyPanel, focusGeneRabbitInViews, getActiveTab } from "../src/renderGenealogy.js";

function _state() {
  return {
    rabbits: [
      { id: 'G1', sex: 'F', status: 'actif', code: 'G1', name: 'GrandMere' },
      { id: 'G2', sex: 'M', status: 'actif', code: 'G2', name: 'GrandPere' },
      { id: 'P1', sex: 'F', status: 'actif', code: 'P1', name: 'Mere',  doeId: 'G1', buckId: 'G2' },
      { id: 'P2', sex: 'M', status: 'actif', code: 'P2', name: 'Pere' },
      { id: 'K',  sex: 'F', status: 'actif', code: 'K',  name: 'Focal', doeId: 'P1', buckId: 'P2' },
      { id: 'C1', sex: 'F', status: 'actif', code: 'C1', name: 'Enfant1', doeId: 'K' },
      { id: 'C2', sex: 'M', status: 'actif', code: 'C2', name: 'Enfant2', doeId: 'K' },
    ],
  };
}

function _ctx(state, focalId = 'K') {
  return {
    state,
    selectedGeneRabbitId: focalId,
    navigate: () => {},
  };
}

beforeEach(() => {
  document.body.innerHTML = '<div id="geneViews"></div>';
  // Reset le tab module-level via API
  focusGeneRabbitInViews(_ctx(_state()), 'K', 'pedigree');
});

describe("renderGenealogyPanel — rendu DOM", () => {
  it("rend les onglets et un panneau initialement", () => {
    renderGenealogyPanel(_ctx(_state()));
    const tabs = document.querySelectorAll('[data-gv-tab]');
    expect(tabs.length).toBe(5);
    expect(document.querySelector('.gv-tab--active')).toBeTruthy();
  });

  it("onglet Pedigree : injecte 31 cases (5 colonnes 1+2+4+8+16)", () => {
    focusGeneRabbitInViews(_ctx(_state()), 'K', 'pedigree');
    const cells = document.querySelectorAll('.gv-ped-cell');
    expect(cells.length).toBe(31);
  });

  it("onglet Pedigree : noms des ancêtres présents dans le DOM rendu", () => {
    focusGeneRabbitInViews(_ctx(_state()), 'K', 'pedigree');
    const html = document.body.innerHTML;
    expect(html).toContain('Focal');     // self
    expect(html).toContain('Mere');      // P1
    expect(html).toContain('Pere');      // P2
    expect(html).toContain('GrandMere'); // G1 (M-M)
    expect(html).toContain('GrandPere'); // G2 (M-F)
  });

  it("onglet Pedigree : cellules manquantes (ancêtres inconnus) rendues vides", () => {
    focusGeneRabbitInViews(_ctx(_state()), 'K', 'pedigree');
    // P2 n'a pas de parents → ses ancêtres (FM, FF, etc.) doivent être vides
    const emptyCells = document.querySelectorAll('.gv-ped-cell--empty');
    expect(emptyCells.length).toBeGreaterThan(0);
  });

  it("onglet Descendance : affiche les enfants et stats", () => {
    focusGeneRabbitInViews(_ctx(_state()), 'K', 'descent');
    const html = document.body.innerHTML;
    expect(html).toContain('Enfant1');
    expect(html).toContain('Enfant2');
    // Stats
    expect(html).toContain('Enfants directs');
    expect(html).toContain('Descendance totale');
  });

  it("onglet Comparer : affiche le coefficient et l'ancêtre commun", () => {
    focusGeneRabbitInViews(_ctx(_state()), 'C1', 'compare');
    // _selectedB sera défini automatiquement à un autre lapin
    const html = document.body.innerHTML;
    expect(html).toContain('Coefficient');
    expect(html).toContain('Ancêtre commun');
  });

  it("onglet Accouplement : liste les mâles compatibles pour une femelle", () => {
    focusGeneRabbitInViews(_ctx(_state()), 'P1', 'mating');
    const html = document.body.innerHTML;
    // Doit contenir au moins un mâle compatible (P2 n'est pas apparenté à P1)
    expect(html).toContain('Pere');
  });

  it("ne crash pas si état vide", () => {
    document.body.innerHTML = '<div id="geneViews"></div>';
    expect(() => renderGenealogyPanel(_ctx({ rabbits: [] }))).not.toThrow();
  });

  it("getActiveTab retourne l'onglet courant", () => {
    focusGeneRabbitInViews(_ctx(_state()), 'K', 'pedigree');
    expect(getActiveTab()).toBe('pedigree');
    focusGeneRabbitInViews(_ctx(_state()), 'K', 'descent');
    expect(getActiveTab()).toBe('descent');
  });
});
