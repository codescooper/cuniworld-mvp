import { describe, it, expect } from "vitest";
import { getReproInfo } from "../src/repro.js";

describe("repro", () => {
  it("returns null for males", () => {
    const state = { rabbits: [], events: [] };
    const rabbit = { id: "M1", sex: "M", status: "actif" };

    const info = getReproInfo(state, rabbit);
    expect(info).toBe(null);
  });

  it("returns null for inactive females", () => {
    const state = { rabbits: [], events: [] };
    const rabbit = { id: "F1", sex: "F", status: "mort" };

    const info = getReproInfo(state, rabbit);
    expect(info).toBe(null);
  });

  it("returns gestation info for pregnant doe", () => {
    const state = {
      rabbits: [],
      events: [
        {
          rabbitId: "F1",
          type: "saillie",
          date: "2026-01-01",
          data: { maleId: "M1" }
        }
      ]
    };
    const rabbit = { id: "F1", sex: "F", status: "actif" };

    const info = getReproInfo(state, rabbit);
    expect(info.isPregnant).toBe(true);
    expect(info.maleId).toBe("M1");
    expect(info.dueDate).toBe("2026-02-01"); // 31 jours après
    expect(info.lastMating.date).toBe("2026-01-01");
  });

  it("returns gestation info after birth (until next mating)", () => {
    const state = {
      rabbits: [],
      events: [
        {
          rabbitId: "F1",
          type: "saillie",
          date: "2026-01-01",
          data: { maleId: "M1" }
        },
        {
          rabbitId: "F1",
          type: "mise_bas",
          date: "2026-01-30"
        }
      ]
    };
    const rabbit = { id: "F1", sex: "F", status: "actif" };

    const info = getReproInfo(state, rabbit);
    expect(info.isPregnant).toBe(false); // Plus enceinte après mise-bas
    expect(info.lastBirth.date).toBe("2026-01-30");
  });

  it("detects ongoing pregnancy (mating after birth)", () => {
    const state = {
      rabbits: [],
      events: [
        {
          rabbitId: "F1",
          type: "saillie",
          date: "2026-01-01",
          data: { maleId: "M1" }
        },
        {
          rabbitId: "F1",
          type: "mise_bas",
          date: "2026-01-30"
        },
        {
          rabbitId: "F1",
          type: "saillie",
          date: "2026-02-15",
          data: { maleId: "M2" }
        }
      ]
    };
    const rabbit = { id: "F1", sex: "F", status: "actif" };

    const info = getReproInfo(state, rabbit);
    expect(info.isPregnant).toBe(true);
    expect(info.maleId).toBe("M2"); // Dernière saillie
    expect(info.dueDate).toBe("2026-03-18"); // 31 jours après 2026-02-15
  });
});
