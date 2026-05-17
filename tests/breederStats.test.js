import { describe, it, expect } from "vitest";
import { rankFemales, rankMales } from "../src/breederStats.js";

// État réaliste : 2 femelles, 2 mâles, quelques portées et sevrages.
function _state() {
  return {
    rabbits: [
      { id: 'fA', sex: 'F', status: 'actif', birthDate: '2024-01-01' },
      { id: 'fB', sex: 'F', status: 'actif', birthDate: '2024-06-01' },
      { id: 'mX', sex: 'M', status: 'actif', birthDate: '2023-12-01' },
      { id: 'mY', sex: 'M', status: 'actif', birthDate: '2023-12-01' },
      // Lapereaux attribués
      { id: 'k1', sex: 'F', status: 'actif', buckId: 'mX', doeId: 'fA' },
      { id: 'k2', sex: 'M', status: 'actif', buckId: 'mX', doeId: 'fA' },
      { id: 'k3', sex: 'F', status: 'actif', buckId: 'mY', doeId: 'fB' },
    ],
    events: [
      // fA : 3 portées, sevrés
      { id: 'mb1', type: 'mise_bas', rabbitId: 'fA', date: '2025-02-01', data: { born: 8, alive: 7, dead: 1 } },
      { id: 'mb2', type: 'mise_bas', rabbitId: 'fA', date: '2025-05-01', data: { born: 9, alive: 8, dead: 1 } },
      { id: 'mb3', type: 'mise_bas', rabbitId: 'fA', date: '2025-08-01', data: { born: 7, alive: 6, dead: 1 } },
      { id: 'sv1', type: 'sevrage',  rabbitId: 'fA', date: '2025-03-15', data: { weanedCount: 7 } },
      { id: 'sv2', type: 'sevrage',  rabbitId: 'fA', date: '2025-06-15', data: { rabbitIds: ['k1','k2'] } },
      // fB : 1 portée, sevrés
      { id: 'mb4', type: 'mise_bas', rabbitId: 'fB', date: '2025-09-01', data: { born: 6, alive: 5, dead: 1 } },
      { id: 'sv3', type: 'sevrage',  rabbitId: 'fB', date: '2025-10-15', data: { weaned: 5 } },
      // Saillies mâles
      { id: 'sa1', type: 'saillie', rabbitId: 'fA', date: '2025-01-10', data: { maleId: 'mX' } },
      { id: 'sa2', type: 'saillie', rabbitId: 'fA', date: '2025-04-10', data: { maleId: 'mX' } },
      { id: 'sa3', type: 'saillie', rabbitId: 'fB', date: '2025-08-10', data: { maleId: 'mY' } },
    ],
  };
}

describe("breederStats.js — classement femelles", () => {
  it("trie par score composite (portées × sevrés/portée × survie)", () => {
    const r = rankFemales(_state());
    expect(r.map(x => x.rabbit.id)).toEqual(['fA', 'fB']);
    const fA = r[0];
    expect(fA.litters).toBe(3);
    expect(fA.born).toBe(24);
    expect(fA.weanedTotal).toBe(9);            // 7 + (2 rabbitIds)
    expect(fA.weanedPerLitter).toBeCloseTo(3.0, 1);
    expect(fA.survival).toBe(Math.round(21 / 24 * 100)); // 88
    expect(fA.score).toBeGreaterThan(0);
  });

  it("filtre les femelles sans minimum de portées", () => {
    const r = rankFemales(_state(), { minLitters: 2 });
    expect(r.map(x => x.rabbit.id)).toEqual(['fA']);
  });

  it("ignore les mâles", () => {
    const r = rankFemales(_state());
    expect(r.every(x => x.rabbit.sex === 'F')).toBe(true);
  });
});

describe("breederStats.js — classement mâles", () => {
  it("trie par descendance confirmée (buckId des lapereaux)", () => {
    const r = rankMales(_state());
    expect(r.map(x => x.rabbit.id)).toEqual(['mX', 'mY']);
    expect(r[0].offspring).toBe(2); // k1 + k2
    expect(r[0].matings).toBe(2);
    expect(r[1].offspring).toBe(1); // k3
  });

  it("ignore les mâles sans saillie ni descendance", () => {
    const state = _state();
    state.rabbits.push({ id: 'mZ', sex: 'M', status: 'actif', birthDate: '2024-01-01' });
    const r = rankMales(state);
    expect(r.find(x => x.rabbit.id === 'mZ')).toBeUndefined();
  });

  it("ignore les femelles", () => {
    const r = rankMales(_state());
    expect(r.every(x => x.rabbit.sex === 'M')).toBe(true);
  });
});
