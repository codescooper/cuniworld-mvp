import { describe, it, expect } from "vitest";
import { applyBulkEvent, applyBulkEdit } from "../src/actions.js";

let seq = 0;
function makeCtx(state) {
  return {
    state,
    farmId: null,
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

function herd() {
  return {
    rabbits: [
      { id: "r1", code: "CW-001", name: "A", sex: "F", status: "actif", cage: "A1", breed: "NZ", forSale: false },
      { id: "r2", code: "CW-002", name: "B", sex: "M", status: "actif", cage: "A2", breed: "NZ", forSale: true, salePrice: 5000, shopDescription: "x" },
      { id: "r3", code: "CW-003", name: "C", sex: "F", status: "mort",  cage: "A3", breed: "Géant" },
    ],
    events: [],
    lotStatuses: {},
  };
}

describe("applyBulkEvent", () => {
  it("applique un même événement à plusieurs lapins", () => {
    const state = herd();
    const ctx = makeCtx(state);
    const res = applyBulkEvent(ctx, ["r1", "r2"], { type: "vaccin", date: "2026-05-20", data: { product: "Myxo", dose: "1ml" } });
    expect(res.ok).toBe(2);
    expect(res.failed).toEqual([]);
    const evs = state.events.filter(e => e.type === "vaccin");
    expect(evs.length).toBe(2);
    expect(evs.every(e => e.data.product === "Myxo")).toBe(true);
  });

  it("ignore et signale les lapins au statut incompatible", () => {
    const state = herd();
    const ctx = makeCtx(state);
    const res = applyBulkEvent(ctx, ["r1", "r3"], { type: "pesée", date: "2026-05-20", data: { weight: 2.4 } });
    expect(res.ok).toBe(1);            // r1 seulement
    expect(res.failed.length).toBe(1); // r3 (mort)
    expect(res.failed[0].code).toBe("CW-003");
  });

  it("décès groupé passe les lapins à mort", () => {
    const state = herd();
    const ctx = makeCtx(state);
    const res = applyBulkEvent(ctx, ["r1", "r2"], { type: "décès", date: "2026-05-20", data: { cause: "maladie" } });
    expect(res.ok).toBe(2);
    expect(state.rabbits.find(r => r.id === "r1").status).toBe("mort");
    expect(state.rabbits.find(r => r.id === "r2").status).toBe("mort");
  });
});

describe("applyBulkEdit", () => {
  it("modifie les champs renseignés sur plusieurs lapins", () => {
    const state = herd();
    const ctx = makeCtx(state);
    const n = applyBulkEdit(ctx, ["r1", "r2"], { cage: "B5", breed: "Fauve" });
    expect(n).toBe(2);
    expect(state.rabbits.find(r => r.id === "r1").cage).toBe("B5");
    expect(state.rabbits.find(r => r.id === "r2").cage).toBe("B5");
    expect(state.rabbits.find(r => r.id === "r1").breed).toBe("Fauve");
  });

  it("retirer de la vente nettoie prix et description", () => {
    const state = herd();
    const ctx = makeCtx(state);
    applyBulkEdit(ctx, ["r2"], { forSale: false });
    const r2 = state.rabbits.find(r => r.id === "r2");
    expect(r2.forSale).toBe(false);
    expect(r2.salePrice).toBe(null);
    expect(r2.shopDescription).toBe("");
  });

  it("ne fait rien si patch vide", () => {
    const state = herd();
    const ctx = makeCtx(state);
    expect(applyBulkEdit(ctx, ["r1"], {})).toBe(0);
  });
});
