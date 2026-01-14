import { describe, it, expect } from "vitest";
import { getReproInfo } from "../src/repro.js";

describe("repro", () => {
  it("calcule la date mise-bas estimée (saillie + 31 jours) pour femelle active", () => {
    const state = {
      rabbits: [],
      events: [
        { rabbitId: "F1", type: "saillie", date: "2026-01-01" }
      ]
    };
    const rabbit = { id: "F1", sex: "F", status: "actif" };

    const info = getReproInfo(state, rabbit);
    expect(info.dueDate).toBe("2026-02-01"); // 31 jours après 2026-01-01
  });

  it("ne calcule rien pour mâle ou femelle non active", () => {
    const state = { rabbits: [], events: [{ rabbitId: "M1", type: "saillie", date: "2026-01-01" }] };

    expect(getReproInfo(state, { id: "M1", sex: "M", status: "actif" })).toBe(null);
    expect(getReproInfo(state, { id: "F2", sex: "F", status: "vendu" })).toBe(null);
  });
});
