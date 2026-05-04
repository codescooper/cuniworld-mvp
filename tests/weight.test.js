import { describe, it, expect } from "vitest";
import {
  getRabbitWeightHistory,
  getCurrentWeight,
  getTotalHerdWeightEvolution,
  migrateRabbitWeightData,
} from "../src/weightService.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pesee(rabbitId, date, weight, id = `e_${date}_${rabbitId}`) {
  return { id, rabbitId, type: "pesée", date, data: { weight }, createdAt: date + "T00:00:00.000Z" };
}

function makeState({ rabbits = [], events = [] } = {}) {
  return { rabbits, events };
}

// ─── getRabbitWeightHistory ───────────────────────────────────────────────────

describe("getRabbitWeightHistory", () => {
  it("retourne vide si aucun événement", () => {
    const state = makeState();
    expect(getRabbitWeightHistory(state, "r1")).toEqual([]);
  });

  it("trie les pesées par date croissante", () => {
    const state = makeState({ events: [
      pesee("r1", "2026-05-10", 2.0),
      pesee("r1", "2026-05-01", 1.5),
      pesee("r1", "2026-05-05", 1.8),
    ]});
    const h = getRabbitWeightHistory(state, "r1");
    expect(h.map(w => w.date)).toEqual(["2026-05-01", "2026-05-05", "2026-05-10"]);
  });

  it("dédoublonne les pesées du même jour (garde la dernière)", () => {
    const state = makeState({ events: [
      { id: "e1", rabbitId: "r1", type: "pesée", date: "2026-05-01", data: { weight: 1.5 }, createdAt: "2026-05-01T08:00:00.000Z" },
      { id: "e2", rabbitId: "r1", type: "pesée", date: "2026-05-01", data: { weight: 1.6 }, createdAt: "2026-05-01T18:00:00.000Z" },
    ]});
    const h = getRabbitWeightHistory(state, "r1");
    expect(h).toHaveLength(1);
    expect(h[0].weightKg).toBe(1.6);
  });

  it("ignore les pesées avec poids invalide", () => {
    const state = makeState({ events: [
      pesee("r1", "2026-05-01", 0),
      pesee("r1", "2026-05-02", -1),
      pesee("r1", "2026-05-03", 1.5),
    ]});
    const h = getRabbitWeightHistory(state, "r1");
    expect(h).toHaveLength(1);
    expect(h[0].weightKg).toBe(1.5);
  });

  it("n'inclut pas les pesées d'un autre lapin", () => {
    const state = makeState({ events: [
      pesee("r1", "2026-05-01", 1.5),
      pesee("r2", "2026-05-01", 2.0),
    ]});
    const h = getRabbitWeightHistory(state, "r1");
    expect(h).toHaveLength(1);
    expect(h[0].weightKg).toBe(1.5);
  });
});

// ─── getCurrentWeight ─────────────────────────────────────────────────────────

describe("getCurrentWeight", () => {
  it("retourne null si pas de pesée", () => {
    expect(getCurrentWeight(makeState(), "r1")).toBeNull();
  });

  it("retourne le poids de la dernière pesée", () => {
    const state = makeState({ events: [
      pesee("r1", "2026-05-01", 1.5),
      pesee("r1", "2026-05-10", 2.2),
    ]});
    expect(getCurrentWeight(state, "r1")).toBe(2.2);
  });
});

// ─── getTotalHerdWeightEvolution ──────────────────────────────────────────────

describe("getTotalHerdWeightEvolution", () => {
  it("retourne vide si aucune pesée", () => {
    const state = makeState({ rabbits: [{ id: "r1", status: "actif" }] });
    expect(getTotalHerdWeightEvolution(state)).toEqual([]);
  });

  it("cumule le poids de plusieurs lapins", () => {
    const state = makeState({
      rabbits: [{ id: "r1" }, { id: "r2" }],
      events: [
        pesee("r1", "2026-05-01", 1.0),
        pesee("r2", "2026-05-05", 0.8),
        pesee("r1", "2026-05-10", 1.3),
      ],
    });
    const evo = getTotalHerdWeightEvolution(state);
    expect(evo).toHaveLength(3);
    expect(evo[0]).toEqual({ date: "2026-05-01", totalWeightKg: 1.0 });
    expect(evo[1]).toEqual({ date: "2026-05-05", totalWeightKg: 1.8 }); // 1.0 + 0.8
    expect(evo[2]).toEqual({ date: "2026-05-10", totalWeightKg: 2.1 }); // 1.3 + 0.8
  });

  it("exclut les lapins décédés avant la date", () => {
    const state = makeState({
      rabbits: [{ id: "r1" }, { id: "r2" }],
      events: [
        pesee("r1", "2026-05-01", 1.0),
        pesee("r2", "2026-05-01", 0.8),
        { id: "death", rabbitId: "r2", type: "décès", date: "2026-05-03", data: {} },
        pesee("r1", "2026-05-10", 1.3),
        // r2 n'a pas de pesée après sa mort, mais sa pesée du 01/05 ne doit
        // pas être comptée pour les dates postérieures à la mort (03/05)
      ],
    });
    const evo = getTotalHerdWeightEvolution(state);
    // 2026-05-01 : r1=1.0, r2=0.8 → 1.8
    // 2026-05-10 : r1=1.3 (r2 mort le 03) → 1.3
    expect(evo.find(e => e.date === "2026-05-01")?.totalWeightKg).toBe(1.8);
    expect(evo.find(e => e.date === "2026-05-10")?.totalWeightKg).toBe(1.3);
  });
});

// ─── migrateRabbitWeightData ──────────────────────────────────────────────────

describe("migrateRabbitWeightData", () => {
  it("ne fait rien si aucun lapin n'a de champ legacy", () => {
    const state = makeState({ rabbits: [{ id: "r1", name: "Naya" }] });
    const changed = migrateRabbitWeightData(state);
    expect(changed).toBe(false);
    expect(state.events).toHaveLength(0);
  });

  it("migre rabbit.weight vers un événement pesée", () => {
    const state = makeState({ rabbits: [{ id: "r1", weight: 2.5, createdAt: "2026-01-15T00:00:00Z" }] });
    const changed = migrateRabbitWeightData(state);
    expect(changed).toBe(true);
    expect(state.events).toHaveLength(1);
    expect(state.events[0].type).toBe("pesée");
    expect(state.events[0].data.weight).toBe(2.5);
    expect(state.events[0].date).toBe("2026-01-15");
    expect(state.rabbits[0].weight).toBeUndefined();
  });

  it("migre rabbit.currentWeight si weight absent", () => {
    const state = makeState({ rabbits: [{ id: "r1", currentWeight: 1.8 }] });
    migrateRabbitWeightData(state);
    expect(state.events[0].data.weight).toBe(1.8);
    expect(state.rabbits[0].currentWeight).toBeUndefined();
  });

  it("est idempotent (ne crée pas de doublon si relancée)", () => {
    const state = makeState({ rabbits: [{ id: "r1", weight: 2.0 }] });
    migrateRabbitWeightData(state);
    const changed2 = migrateRabbitWeightData(state);
    expect(changed2).toBe(false);
    expect(state.events).toHaveLength(1);
  });

  it("ignore les poids invalides (0, négatif)", () => {
    const state = makeState({ rabbits: [{ id: "r1", weight: 0 }, { id: "r2", weight: -1 }] });
    const changed = migrateRabbitWeightData(state);
    expect(changed).toBe(false);
  });
});
