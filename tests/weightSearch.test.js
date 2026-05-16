import { describe, it, expect } from "vitest";
import {
  getRabbitsWithWeight,
  getRabbitsSortedByWeight,
  getRabbitsByWeightRange,
  getWeightExtremes,
  getRabbitsByBudget,
} from "../src/weightSearch.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pesee(rabbitId, date, weight) {
  return {
    id: `e_${date}_${rabbitId}`,
    rabbitId,
    type: "pesée",
    date,
    data: { weight },
    createdAt: date + "T00:00:00.000Z",
  };
}

function rabbit(id, extra = {}) {
  return { id, name: id, code: id.toUpperCase(), status: "actif", sex: "M", cage: "A1", ...extra };
}

function makeState({ rabbits = [], events = [] } = {}) {
  return { rabbits, events };
}

// Settings utilisés pour les tests budget : 10 000 FCFA / kg vif.
const SETTINGS = {
  priceLivePerKg: 10000,
  priceCarcassPerKg: 5000,
  carcassYield: 0.55,
  currencyCode: "XOF",
  currencySymbol: "FCFA",
};

// ─── getRabbitsWithWeight ─────────────────────────────────────────────────────

describe("getRabbitsWithWeight", () => {
  it("retourne vide si aucun lapin", () => {
    expect(getRabbitsWithWeight(makeState())).toEqual([]);
  });

  it("ignore les lapins non actifs", () => {
    const s = makeState({
      rabbits: [rabbit("r1", { status: "vendu" }), rabbit("r2")],
      events: [pesee("r1", "2026-05-01", 2.0), pesee("r2", "2026-05-01", 1.5)],
    });
    const out = getRabbitsWithWeight(s);
    expect(out).toHaveLength(1);
    expect(out[0].rabbit.id).toBe("r2");
  });

  it("ignore les lapins jamais pesés", () => {
    const s = makeState({
      rabbits: [rabbit("r1"), rabbit("r2")],
      events: [pesee("r1", "2026-05-01", 2.0)],
    });
    const out = getRabbitsWithWeight(s);
    expect(out.map(x => x.rabbit.id)).toEqual(["r1"]);
  });

  it("filtre forSaleOnly correctement", () => {
    const s = makeState({
      rabbits: [rabbit("r1", { forSale: true }), rabbit("r2", { forSale: false })],
      events: [pesee("r1", "2026-05-01", 2.0), pesee("r2", "2026-05-01", 1.5)],
    });
    const out = getRabbitsWithWeight(s, { forSaleOnly: true });
    expect(out).toHaveLength(1);
    expect(out[0].rabbit.id).toBe("r1");
  });
});

// ─── getRabbitsSortedByWeight ─────────────────────────────────────────────────

describe("getRabbitsSortedByWeight", () => {
  it("trie ASC par défaut", () => {
    const s = makeState({
      rabbits: [rabbit("r1"), rabbit("r2"), rabbit("r3")],
      events: [pesee("r1", "2026-05-01", 2.5), pesee("r2", "2026-05-01", 1.2), pesee("r3", "2026-05-01", 1.8)],
    });
    const out = getRabbitsSortedByWeight(s);
    expect(out.map(x => x.rabbit.id)).toEqual(["r2", "r3", "r1"]);
  });

  it("trie DESC quand demandé", () => {
    const s = makeState({
      rabbits: [rabbit("r1"), rabbit("r2"), rabbit("r3")],
      events: [pesee("r1", "2026-05-01", 2.5), pesee("r2", "2026-05-01", 1.2), pesee("r3", "2026-05-01", 1.8)],
    });
    const out = getRabbitsSortedByWeight(s, { direction: "desc" });
    expect(out.map(x => x.rabbit.id)).toEqual(["r1", "r3", "r2"]);
  });
});

// ─── getRabbitsByWeightRange ──────────────────────────────────────────────────

describe("getRabbitsByWeightRange", () => {
  const state = makeState({
    rabbits: [rabbit("r1"), rabbit("r2"), rabbit("r3"), rabbit("r4")],
    events: [
      pesee("r1", "2026-05-01", 1.0),
      pesee("r2", "2026-05-01", 2.0),
      pesee("r3", "2026-05-01", 3.0),
      pesee("r4", "2026-05-01", 4.0),
    ],
  });

  it("filtre min seul", () => {
    const out = getRabbitsByWeightRange(state, { min: 2.5 });
    expect(out.map(x => x.rabbit.id).sort()).toEqual(["r3", "r4"]);
  });

  it("filtre max seul", () => {
    const out = getRabbitsByWeightRange(state, { max: 2.0 });
    expect(out.map(x => x.rabbit.id).sort()).toEqual(["r1", "r2"]);
  });

  it("filtre min + max (bornes incluses)", () => {
    const out = getRabbitsByWeightRange(state, { min: 2.0, max: 3.0 });
    expect(out.map(x => x.rabbit.id).sort()).toEqual(["r2", "r3"]);
  });

  it("retourne tout si aucune borne", () => {
    const out = getRabbitsByWeightRange(state, {});
    expect(out).toHaveLength(4);
  });
});

// ─── getWeightExtremes ────────────────────────────────────────────────────────

describe("getWeightExtremes", () => {
  it("retourne nulls si aucun lapin pesé", () => {
    expect(getWeightExtremes(makeState())).toEqual({ lightest: null, heaviest: null });
  });

  it("trouve le plus léger et le plus lourd", () => {
    const s = makeState({
      rabbits: [rabbit("r1"), rabbit("r2"), rabbit("r3")],
      events: [pesee("r1", "2026-05-01", 2.5), pesee("r2", "2026-05-01", 1.2), pesee("r3", "2026-05-01", 1.8)],
    });
    const { lightest, heaviest } = getWeightExtremes(s);
    expect(lightest.rabbit.id).toBe("r2");
    expect(heaviest.rabbit.id).toBe("r1");
  });

  it("respecte forSaleOnly", () => {
    const s = makeState({
      rabbits: [
        rabbit("r1", { forSale: true }),
        rabbit("r2", { forSale: false }),
        rabbit("r3", { forSale: true }),
      ],
      events: [pesee("r1", "2026-05-01", 2.5), pesee("r2", "2026-05-01", 1.0), pesee("r3", "2026-05-01", 1.8)],
    });
    const { lightest, heaviest } = getWeightExtremes(s, { forSaleOnly: true });
    expect(lightest.rabbit.id).toBe("r3");
    expect(heaviest.rabbit.id).toBe("r1");
  });
});

// ─── getRabbitsByBudget ───────────────────────────────────────────────────────

describe("getRabbitsByBudget", () => {
  const state = makeState({
    rabbits: [
      rabbit("r1", { forSale: true }),
      rabbit("r2", { forSale: true }),
      rabbit("r3", { forSale: true }),
      rabbit("r4", { forSale: true }),
    ],
    events: [
      pesee("r1", "2026-05-01", 1.0),  // 10 000 FCFA vif
      pesee("r2", "2026-05-01", 1.5),  // 15 000 FCFA vif
      pesee("r3", "2026-05-01", 2.0),  // 20 000 FCFA vif
      pesee("r4", "2026-05-01", 3.0),  // 30 000 FCFA vif
    ],
  });

  it("retourne vide si budget invalide", () => {
    expect(getRabbitsByBudget(state, { budget: 0, settings: SETTINGS })).toEqual([]);
    expect(getRabbitsByBudget(state, { budget: -100, settings: SETTINGS })).toEqual([]);
    expect(getRabbitsByBudget(state, { settings: SETTINGS })).toEqual([]);
  });

  it("trouve les lapins dans la fourchette ±10 %", () => {
    // Budget 15 000 ±10 % → [13 500, 16 500]
    const out = getRabbitsByBudget(state, { budget: 15000, settings: SETTINGS });
    expect(out.map(x => x.rabbit.id)).toEqual(["r2"]);
  });

  it("élargit la fourchette quand on augmente la tolérance", () => {
    // ±50 % → [7 500, 22 500] → r1, r2, r3
    const out = getRabbitsByBudget(state, { budget: 15000, tolerance: 0.5, settings: SETTINGS });
    expect(out.map(x => x.rabbit.id).sort()).toEqual(["r1", "r2", "r3"]);
  });

  it("trie par proximité du budget", () => {
    // ±50 % → r2 (15k = budget exact) en premier
    const out = getRabbitsByBudget(state, { budget: 15000, tolerance: 0.5, settings: SETTINGS });
    expect(out[0].rabbit.id).toBe("r2");
    expect(Math.abs(out[0].deltaPct)).toBeLessThan(Math.abs(out[1].deltaPct));
  });

  it("calcule la valeur carcasse quand type='carcass'", () => {
    // r3 = 2 kg → carcasse = 2 * 0.55 = 1.1 kg → 1.1 * 5000 = 5500 FCFA
    const out = getRabbitsByBudget(state, {
      budget: 5500,
      type: "carcass",
      tolerance: 0.05,
      settings: SETTINGS,
    });
    expect(out.map(x => x.rabbit.id)).toEqual(["r3"]);
  });

  it("forSaleOnly=false inclut les lapins non en vente", () => {
    const s = makeState({
      rabbits: [rabbit("r1", { forSale: false })],
      events: [pesee("r1", "2026-05-01", 1.5)],
    });
    expect(getRabbitsByBudget(s, { budget: 15000, settings: SETTINGS })).toEqual([]);
    const out = getRabbitsByBudget(s, { budget: 15000, forSaleOnly: false, settings: SETTINGS });
    expect(out).toHaveLength(1);
  });
});
