import { describe, it, expect } from "vitest";
import { buildLots } from "../src/lots.js";

describe("lots", () => {
  it("crée un lot à partir d'un événement sevrage", () => {
    const state = {
      rabbits: [{ id:"F1", name:"Naya", code:"CW-F001" }],
      events: [
        { id:"ev1", rabbitId:"F1", type:"sevrage", date:"2026-02-01", data:{ weaned: 6, destCage:"C-04" }, notes:"ok" }
      ]
    };

    const lots = buildLots(state);
    expect(lots.length).toBe(1);
    expect(lots[0].cage).toBe("C-04");
    expect(lots[0].weaned).toBe(6);
    expect(lots[0].doeId).toBe("F1");
  });
});
import { describe, it, expect } from "vitest";
import { buildLots } from "../src/lots.js";

describe("lots", () => {
  it("crée un lot à partir d'un événement sevrage", () => {
    const state = {
      rabbits: [{ id:"F1", name:"Naya", code:"CW-F001" }],
      events: [
        { id:"ev1", rabbitId:"F1", type:"sevrage", date:"2026-02-01", data:{ weaned: 6, destCage:"C-04" }, notes:"ok" }
      ]
    };

    const lots = buildLots(state);
    expect(lots.length).toBe(1);
    expect(lots[0].cage).toBe("C-04");
    expect(lots[0].weaned).toBe(6);
    expect(lots[0].doeId).toBe("F1");
  });
});
