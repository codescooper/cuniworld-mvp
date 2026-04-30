import { describe, it, expect, beforeEach } from "vitest";
import { validateEvent, applyEventSideEffects } from "../src/rules.js";
import { Store } from "../src/store.js";

describe("validateEvent", () => {
  let state;
  let store;

  beforeEach(() => {
    store = Store;
    state = store.load();
  });

  it("rejects saillie without male", () => {
    const rabbit = { id: "r1", sex: "F", status: "actif" };
    state.rabbits = [rabbit];

    const result = validateEvent(state, "r1", {
      type: "saillie",
      date: "2026-01-01",
      data: {}
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("sélectionne le mâle");
  });

  it("accepts saillie with valid male", () => {
    const doe = { id: "r1", sex: "F", status: "actif" };
    const buck = { id: "r2", sex: "M", status: "actif" };
    state.rabbits = [doe, buck];

    const result = validateEvent(state, "r1", {
      type: "saillie",
      date: "2026-01-01",
      data: { maleId: "r2" }
    });

    expect(result.ok).toBe(true);
  });

  it("rejects saillie on male", () => {
    const buck = { id: "r1", sex: "M", status: "actif" };
    state.rabbits = [buck];

    const result = validateEvent(state, "r1", {
      type: "saillie",
      date: "2026-01-01",
      data: {}
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("seulement pour une femelle");
  });

  it("rejects mise-bas without prior saillie", () => {
    const doe = { id: "r1", sex: "F", status: "actif" };
    state.rabbits = [doe];

    const result = validateEvent(state, "r1", {
      type: "mise_bas",
      date: "2026-01-30",
      data: { born: 8, alive: 7 }
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("aucune saillie trouvée");
  });

  it("accepts mise-bas after saillie", () => {
    const doe = { id: "r1", sex: "F", status: "actif" };
    state.rabbits = [doe];
    state.events = [{
      id: "e1",
      rabbitId: "r1",
      type: "saillie",
      date: "2026-01-01",
      data: { maleId: "r2" }
    }];

    const result = validateEvent(state, "r1", {
      type: "mise_bas",
      date: "2026-01-30",
      data: { born: 8, alive: 7 }
    });

    expect(result.ok).toBe(true);
  });

  it("rejects sevrage without prior birth", () => {
    const doe = { id: "r1", sex: "F", status: "actif" };
    state.rabbits = [doe];

    const result = validateEvent(state, "r1", {
      type: "sevrage",
      date: "2026-02-28",
      data: {}
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("sevrage sans mise-bas");
  });

  it("accepts sevrage after birth with active kits", () => {
    const doe = { id: "r1", sex: "F", status: "actif" };
    const kit = { id: "k1", sex: "U", status: "actif", stage: "kit", litterId: "e1" };
    state.rabbits = [doe, kit];
    state.events = [{
      id: "e1",
      rabbitId: "r1",
      type: "mise_bas",
      date: "2026-01-30",
      data: { alive: 1 }
    }];

    const result = validateEvent(state, "r1", {
      type: "sevrage",
      date: "2026-02-28",
      data: {}
    });

    expect(result.ok).toBe(true);
  });

  it("rejects vente without price", () => {
    const rabbit = { id: "r1", sex: "M", status: "actif" };
    state.rabbits = [rabbit];

    const result = validateEvent(state, "r1", {
      type: "vente",
      date: "2026-01-01",
      data: {}
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("prix obligatoire");
  });

  it("accepts vente with valid price", () => {
    const rabbit = { id: "r1", sex: "M", status: "actif" };
    state.rabbits = [rabbit];

    const result = validateEvent(state, "r1", {
      type: "vente",
      date: "2026-01-01",
      data: { price: 25.50, client: "Jean Dupont" }
    });

    expect(result.ok).toBe(true);
  });
});

describe("applyEventSideEffects", () => {
  let ctx;
  let state;

  beforeEach(() => {
    state = Store.load();
    ctx = {
      state,
      Store: {
        helpers: {
          uid: (prefix = "id") => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
          nowISO: () => new Date().toISOString()
        }
      }
    };
  });

  it("sets status to mort on décès", () => {
    const rabbit = { id: "r1", status: "actif" };
    state.rabbits = [rabbit];

    const event = {
      type: "décès",
      rabbitId: "r1",
      date: "2026-01-01"
    };

    applyEventSideEffects(ctx, event);

    expect(rabbit.status).toBe("mort");
  });

  it("sets status to vendu on vente", () => {
    const rabbit = { id: "r1", status: "actif" };
    state.rabbits = [rabbit];

    const event = {
      type: "vente",
      rabbitId: "r1",
      date: "2026-01-01",
      data: { price: 25.50 }
    };

    applyEventSideEffects(ctx, event);

    expect(rabbit.status).toBe("vendu");
  });

  it("creates kits on mise_bas", () => {
    const doe = { id: "r1", sex: "F", status: "actif" };
    state.rabbits = [doe];

    const event = {
      id: "e1",
      type: "mise_bas",
      rabbitId: "r1",
      date: "2026-01-30",
      data: { alive: 2 }
    };

    applyEventSideEffects(ctx, event);

    expect(state.rabbits).toHaveLength(3); // doe + 2 kits
    const kits = state.rabbits.filter(r => r.stage === "kit");
    expect(kits).toHaveLength(2);
    expect(kits[0].doeId).toBe("r1");
    expect(kits[0].litterId).toBe("e1");
  });

  it("creates lot on sevrage", () => {
    const doe = { id: "r1", sex: "F", status: "actif" };
    const kit1 = { id: "k1", stage: "kit", status: "actif", litterId: "e1" };
    const kit2 = { id: "k2", stage: "kit", status: "actif", litterId: "e1" };
    state.rabbits = [doe, kit1, kit2];
    state.events = [{
      id: "e1",
      type: "mise_bas",
      rabbitId: "r1",
      date: "2026-01-30"
    }];

    const event = {
      id: "e2",
      type: "sevrage",
      rabbitId: "r1",
      date: "2026-02-28",
      data: { destCage: "C-04" }
    };

    applyEventSideEffects(ctx, event);

    // Vérifier que les kits ont été mis à jour
    expect(kit1.stage).toBe("jeune");
    expect(kit1.cage).toBe("C-04");
    expect(kit2.stage).toBe("jeune");
    expect(kit2.cage).toBe("C-04");

    // Vérifier que l'événement contient les données du lot
    expect(event.data.rabbitIds).toEqual(["k1", "k2"]);
    expect(event.data.weanedCount).toBe(2);
  });
});