import { describe, it, expect } from "vitest";
import { getLitterStatsForDoe } from "../src/litters.js";

describe("litters", () => {
  it("additionne born/alive/dead sur plusieurs mises-bas", () => {
    const state = {
      rabbits: [],
      events: [
        { rabbitId: "F1", type: "mise_bas", date: "2026-01-10", data: { born: 8, alive: 7, dead: 1 } },
        { rabbitId: "F1", type: "mise_bas", date: "2026-02-10", data: { born: 6, alive: 6, dead: 0 } }
      ]
    };

    const st = getLitterStatsForDoe(state, "F1");
    expect(st.count).toBe(2);
    expect(st.born).toBe(14);
    expect(st.alive).toBe(13);
    expect(st.dead).toBe(1);
    expect(st.survival).toBe(Math.round((13/14)*100));
  });

  it("utilise alive+dead si born est absent", () => {
    const state = {
      rabbits: [],
      events: [
        { rabbitId: "F1", type: "mise_bas", date: "2026-01-10", data: { alive: 5, dead: 2 } }
      ]
    };

    const st = getLitterStatsForDoe(state, "F1");
    expect(st.born).toBe(7);
    expect(st.alive).toBe(5);
    expect(st.dead).toBe(2);
  });

  it("compte la survie réelle (mort-nés + décès post-naissance)", () => {
    const state = {
      rabbits: [
        { id: "k1", doeId: "F1", status: "actif" },
        { id: "k2", doeId: "F1", status: "actif" },
        { id: "k3", doeId: "F1", status: "mort" } // décès après naissance
      ],
      events: [
        {
          rabbitId: "F1",
          type: "mise_bas",
          date: "2026-01-10",
          data: { born: 8, alive: 7, dead: 1, kitsCreated: true, kitsCount: 7 }
        }
      ]
    };

    const st = getLitterStatsForDoe(state, "F1");
    expect(st.count).toBe(1);
    expect(st.born).toBe(8);
    expect(st.alive).toBe(7);          // nés vivants (figé mise-bas)
    expect(st.stillborn).toBe(1);      // 8 - 7
    expect(st.deadPostBirth).toBe(1);  // k3
    expect(st.dead).toBe(2);           // mort-né + décès
    expect(st.currentAlive).toBe(2);   // k1, k2
    expect(st.activeKits).toBe(2);
    expect(st.survival).toBe(Math.round((8 - 2) / 8 * 100)); // 75
  });
});
