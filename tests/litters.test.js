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
});
