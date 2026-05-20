import { describe, it, expect } from "vitest";
import { mortalityByCause } from "../src/stats.js";

describe("mortalityByCause", () => {
  it("agrège les décès par cause + les mort-nés", () => {
    const state = {
      rabbits: [],
      events: [
        { type: "mise_bas", rabbitId: "F1", date: "2026-01-01", data: { born: 8, alive: 6 } }, // 2 mort-nés
        { type: "mise_bas", rabbitId: "F2", date: "2026-02-01", data: { born: 5, alive: 5 } }, // 0 mort-né
        { type: "décès", rabbitId: "k1", date: "2026-01-10", data: { cause: "ecrasement" } },
        { type: "décès", rabbitId: "k2", date: "2026-01-11", data: { cause: "ecrasement" } },
        { type: "décès", rabbitId: "k3", date: "2026-01-12", data: { cause: "froid" } },
        { type: "décès", rabbitId: "k4", date: "2026-01-13", data: {} }, // cause manquante → inconnu
      ],
    };

    const { rows, total } = mortalityByCause(state);
    expect(total).toBe(6); // 4 décès + 2 mort-nés
    const byLabel = Object.fromEntries(rows.map(r => [r.label, r.count]));
    expect(byLabel["Écrasement par la mère"]).toBe(2);
    expect(byLabel["Froid / hypothermie"]).toBe(1);
    expect(byLabel["Cause inconnue"]).toBe(1);
    expect(byLabel["Mort-né (naissance)"]).toBe(2);
    // trié par count décroissant
    expect(rows[0].count).toBeGreaterThanOrEqual(rows[rows.length - 1].count);
  });

  it("retourne vide sans mortalité", () => {
    const { rows, total } = mortalityByCause({ rabbits: [], events: [
      { type: "mise_bas", rabbitId: "F1", date: "2026-01-01", data: { born: 6, alive: 6 } },
    ] });
    expect(rows).toEqual([]);
    expect(total).toBe(0);
  });
});
