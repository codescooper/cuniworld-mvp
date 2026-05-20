import { describe, it, expect } from "vitest";
import { buildLots, derivedLotStatus, weaningEventForLitter, deathCauseLabel, lotIdForLitter } from "../src/lots.js";

function baseState() {
  return {
    rabbits: [
      { id: "F1", name: "Naya", code: "CW-F001", sex: "F", status: "actif", cage: "A1" },
      // 4 nés vivants (records), 1 mort-né (jamais créé) → born=5
      { id: "k1", litterId: "mb1", doeId: "F1", status: "actif", cage: "A1", code: "CW-F001-K01", name: "L1" },
      { id: "k2", litterId: "mb1", doeId: "F1", status: "actif", cage: "A1", code: "CW-F001-K02", name: "L2" },
      { id: "k3", litterId: "mb1", doeId: "F1", status: "actif", cage: "A1", code: "CW-F001-K03", name: "L3" },
      { id: "k4", litterId: "mb1", doeId: "F1", status: "mort",  cage: "A1", code: "CW-F001-K04", name: "L4" },
    ],
    events: [
      { id: "mb1", rabbitId: "F1", type: "mise_bas", date: "2026-02-01", data: { born: 5, alive: 4, dead: 1 } },
    ],
    lotStatuses: {},
  };
}

describe("lots — dérivés de la mise-bas", () => {
  it("crée un lot dès la mise-bas avec compteurs en direct", () => {
    const lots = buildLots(baseState());
    expect(lots.length).toBe(1);
    const lot = lots[0];
    expect(lot.id).toBe(lotIdForLitter("mb1"));
    expect(lot.eventId).toBe("mb1");
    expect(lot.born).toBe(5);
    expect(lot.bornAlive).toBe(4);       // 4 records créés
    expect(lot.stillborn).toBe(1);       // 5 - 4
    expect(lot.aliveCount).toBe(3);      // k1,k2,k3 actifs
    expect(lot.deadPostBirth).toBe(1);   // k4
    expect(lot.deadCount).toBe(2);       // 1 mort-né + 1 décès
    expect(lot.cage).toBe("A1");
  });

  it("statut par défaut = maternité, sevré si un sevrage existe", () => {
    const st = baseState();
    expect(derivedLotStatus(st, st.events[0])).toBe("maternite");
    st.events.push({ id: "sv1", rabbitId: "F1", type: "sevrage", date: "2026-03-05", data: { litterId: "mb1", destCage: "B2" } });
    expect(derivedLotStatus(st, st.events[0])).toBe("sevre");
    expect(buildLots(st)[0].status).toBe("sevre");
  });

  it("respecte l'override manuel de statut", () => {
    const st = baseState();
    st.lotStatuses[lotIdForLitter("mb1")] = "loges";
    expect(buildLots(st)[0].status).toBe("loges");
  });

  it("weaningEventForLitter retrouve le sevrage par litterId", () => {
    const st = baseState();
    const sv = { id: "sv1", rabbitId: "F1", type: "sevrage", date: "2026-03-05", data: { litterId: "mb1" } };
    st.events.push(sv);
    expect(weaningEventForLitter(st, st.events[0])).toBe(sv);
  });

  it("deathCauseLabel mappe les causes connues", () => {
    expect(deathCauseLabel("ecrasement")).toBe("Écrasement par la mère");
    expect(deathCauseLabel("inconnu")).toBe("Cause inconnue");
    expect(deathCauseLabel("xyz")).toBe("xyz");
  });
});
