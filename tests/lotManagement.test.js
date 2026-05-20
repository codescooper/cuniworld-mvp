import { describe, it, expect, beforeEach } from "vitest";
import { addKitsToLitter, declareLotLoss, assignLotLodges } from "../src/actions.js";
import { buildLots, lotIdForLitter } from "../src/lots.js";

let seq = 0;
function makeCtx(state) {
  return {
    state,
    farmId: null, // pas de sync cloud en test
    Store: {
      helpers: {
        uid: (prefix = "id") => `${prefix}_${(seq++).toString(36)}`,
        nowISO: () => new Date().toISOString(),
      },
      save: (s) => s,
    },
    render: () => {},
  };
}

function litterState() {
  return {
    rabbits: [
      { id: "F1", name: "Naya", code: "CW-F001", sex: "F", status: "actif", cage: "A1", breed: "NZ" },
      { id: "k1", litterId: "mb1", doeId: "F1", buckId: "M1", status: "actif", cage: "A1", code: "CW-F001-K01", name: "L1", stage: "kit" },
      { id: "k2", litterId: "mb1", doeId: "F1", buckId: "M1", status: "actif", cage: "A1", code: "CW-F001-K02", name: "L2", stage: "kit" },
    ],
    events: [
      { id: "sa1", rabbitId: "F1", type: "saillie", date: "2026-01-01", data: { maleId: "M1" } },
      { id: "mb1", rabbitId: "F1", type: "mise_bas", date: "2026-02-01", data: { born: 2, alive: 2, dead: 0, kitsCreated: true, kitsCount: 2 } },
    ],
    lotStatuses: {},
  };
}

describe("addKitsToLitter", () => {
  it("ajoute des lapereaux à la portée et met à jour les compteurs", () => {
    const state = litterState();
    const ctx = makeCtx(state);
    const created = addKitsToLitter(ctx, "mb1", 2, { reason: "trouvés dans le nid" });

    expect(created.length).toBe(2);
    // Rattachés à la portée + héritent mère/père/cage
    for (const k of created) {
      expect(k.litterId).toBe("mb1");
      expect(k.doeId).toBe("F1");
      expect(k.buckId).toBe("M1");
      expect(k.cage).toBe("A1");
      expect(k.stage).toBe("kit");
    }
    // Compteurs de la mise-bas mis à jour
    const mb = state.events.find(e => e.id === "mb1");
    expect(mb.data.born).toBe(4);
    expect(mb.data.alive).toBe(4);
    expect(mb.data.additions.length).toBe(1);

    // Le lot reflète 4 vivants
    const lot = buildLots(state).find(l => l.id === lotIdForLitter("mb1"));
    expect(lot.aliveCount).toBe(4);
  });
});

describe("declareLotLoss", () => {
  it("passe les lapereaux à mort avec cause et crée des événements décès", () => {
    const state = litterState();
    const ctx = makeCtx(state);
    const n = declareLotLoss(ctx, ["k1"], { cause: "ecrasement", condition: "écrasé sous la mère", date: "2026-02-05" });

    expect(n).toBe(1);
    expect(state.rabbits.find(r => r.id === "k1").status).toBe("mort");
    const dec = state.events.find(e => e.type === "décès" && e.rabbitId === "k1");
    expect(dec).toBeTruthy();
    expect(dec.data.cause).toBe("ecrasement");
    expect(dec.data.condition).toBe("écrasé sous la mère");

    const lot = buildLots(state).find(l => l.id === lotIdForLitter("mb1"));
    expect(lot.aliveCount).toBe(1);     // k2 seulement
    expect(lot.deadPostBirth).toBe(1);  // k1
  });

  it("ignore les lapereaux déjà inactifs", () => {
    const state = litterState();
    state.rabbits.find(r => r.id === "k1").status = "vendu";
    const ctx = makeCtx(state);
    const n = declareLotLoss(ctx, ["k1"], { cause: "maladie" });
    expect(n).toBe(0);
    expect(state.rabbits.find(r => r.id === "k1").status).toBe("vendu");
  });
});

describe("assignLotLodges", () => {
  it("affecte des loges individuelles et passe le lot en statut loges", () => {
    const state = litterState();
    const ctx = makeCtx(state);
    const lotId = lotIdForLitter("mb1");
    const n = assignLotLodges(ctx, lotId, [
      { id: "k1", cage: "B1" },
      { id: "k2", cage: "B2" },
    ]);
    expect(n).toBe(2);
    expect(state.rabbits.find(r => r.id === "k1").cage).toBe("B1");
    expect(state.rabbits.find(r => r.id === "k2").cage).toBe("B2");
    expect(state.lotStatuses[lotId]).toBe("loges");
    expect(buildLots(state).find(l => l.id === lotId).status).toBe("loges");
  });
});
