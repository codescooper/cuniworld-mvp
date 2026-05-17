import { describe, it, expect } from "vitest";
import {
  computeFeedConsumption,
  computeLiveProduction,
  computeConsumptionIndex,
} from "../src/feedTracking.js";

const baseState = () => ({
  rabbits: [
    { id: 'r1', status: 'actif' },
    { id: 'r2', status: 'actif' },
    { id: 'r3', status: 'vendu' },
  ],
  events: [
    // Pesées
    { id: 'p1', type: 'pesée', rabbitId: 'r1', date: '2026-03-01', data: { weight: 2.5 } },
    { id: 'p2', type: 'pesée', rabbitId: 'r1', date: '2026-04-01', data: { weight: 3.0 } },
    { id: 'p3', type: 'pesée', rabbitId: 'r2', date: '2026-04-01', data: { weight: 2.8 } },
    { id: 'p4', type: 'pesée', rabbitId: 'r3', date: '2026-03-20', data: { weight: 2.2 } },
    // Vente : data.weight prioritaire si présent
    { id: 'v1', type: 'vente', rabbitId: 'r3', date: '2026-03-25', data: { price: 5000, weight: 2.4 } },
  ],
  stock: [
    { id: 's1', name: 'Granulés', category: 'aliment', unit: 'kg' },
    { id: 's2', name: 'Foin',     category: 'aliment', unit: 'sac' },
    { id: 's3', name: 'Vaccin',   category: 'medicament', unit: 'flacon' },
  ],
  stockMovements: [
    { id: 'm1', stockItemId: 's1', type: 'sortie', quantity: 40, date: '2026-03-10' },
    { id: 'm2', stockItemId: 's1', type: 'sortie', quantity: 50, date: '2026-04-05' },
    { id: 'm3', stockItemId: 's1', type: 'entree', quantity: 200, date: '2026-04-01' }, // ignorée
    { id: 'm4', stockItemId: 's2', type: 'sortie', quantity: 2,  date: '2026-04-10' },  // 2 sacs = 50 kg
    { id: 'm5', stockItemId: 's3', type: 'sortie', quantity: 1,  date: '2026-04-10' },  // pas aliment
  ],
});

describe("feedTracking.js — conso aliments", () => {
  it("additionne uniquement les sorties d'articles 'aliment' converties en kg", () => {
    const r = computeFeedConsumption(baseState());
    // 40 + 50 + 2*25 = 140 kg
    expect(r.totalKg).toBe(140);
    expect(r.byItem.map(i => i.name)).toEqual(['Granulés', 'Foin']);
  });

  it("respecte les bornes from/to", () => {
    const r = computeFeedConsumption(baseState(), { from: '2026-04-01', to: '2026-04-30' });
    // 50 (granulés du 5/4) + 2*25 (foin du 10/4) = 100 kg
    expect(r.totalKg).toBe(100);
  });

  it("respecte un sackKg personnalisé", () => {
    const r = computeFeedConsumption(baseState(), { sackKg: 50 });
    // Granulés 90 + 2 sacs × 50 = 190
    expect(r.totalKg).toBe(190);
  });
});

describe("feedTracking.js — production vive", () => {
  it("additionne le poids vendu + poids actuel des actifs pesés", () => {
    const r = computeLiveProduction(baseState());
    expect(r.soldKg).toBe(2.4);              // data.weight de v1
    expect(r.currentStockKg).toBe(3.0 + 2.8); // dernières pesées r1 + r2
    expect(r.producedKg).toBe(2.4 + 3.0 + 2.8);
    expect(r.weighedActive).toBe(2);
  });

  it("se rabat sur la dernière pesée connue avant la vente si data.weight manque", () => {
    const state = baseState();
    state.events.find(e => e.id === 'v1').data = { price: 5000 };
    const r = computeLiveProduction(state);
    // dernière pesée r3 avant 2026-03-25 → p4 = 2.2 kg
    expect(r.soldKg).toBe(2.2);
  });
});

describe("feedTracking.js — indice de consommation", () => {
  it("calcule feed / produit avec 2 décimales", () => {
    const r = computeConsumptionIndex(baseState());
    // 140 kg aliments / 8.2 kg vif ≈ 17.07 (volontairement gros : peu de
    // poids vivant dans cet état test, c'est juste un sanity check arithmétique)
    expect(r.feedKg).toBe(140);
    expect(r.producedKg).toBe(8.2);
    expect(r.indice).toBeCloseTo(17.07, 1);
  });

  it("retourne null si aucune production", () => {
    const state = { ...baseState(), rabbits: [], events: [] };
    const r = computeConsumptionIndex(state);
    expect(r.indice).toBeNull();
  });
});
