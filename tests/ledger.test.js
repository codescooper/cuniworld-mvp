import { describe, it, expect } from "vitest";
import {
  LEDGER_CATEGORIES,
  categoriesFor,
  migrateExpensesToTransactions,
} from "../src/ledger.js";

describe("ledger — taxonomie & migration", () => {
  it("expose des catégories typées par direction", () => {
    expect(LEDGER_CATEGORIES.aliment.direction).toBe("out");
    expect(LEDGER_CATEGORIES.subvention.direction).toBe("in");
    expect(LEDGER_CATEGORIES.achat_animal.direction).toBe("out");
  });

  it("categoriesFor('in') ne renvoie que des catégories d'entrée saisissables", () => {
    const ins = categoriesFor("in");
    expect(ins.every(([, v]) => v.direction === "in")).toBe(true);
    expect(ins.map(([k]) => k)).not.toContain("vente_lapin");
    expect(ins.map(([k]) => k)).not.toContain("vente_boutique");
  });

  it("migre expenses[] vers transactions[] (direction out) une seule fois", () => {
    const state = {
      expenses: [
        { id: "exp_1", date: "2026-03-01", category: "aliment", amount: 5000, description: "sac", createdAt: "2026-03-01T00:00:00Z" },
      ],
    };
    const out = migrateExpensesToTransactions(state);
    expect(out.expenses).toBeUndefined();
    expect(out.transactions).toHaveLength(1);
    expect(out.transactions[0]).toMatchObject({ id: "exp_1", direction: "out", category: "aliment", amount: 5000 });
    const again = migrateExpensesToTransactions(out);
    expect(again.transactions).toHaveLength(1);
  });

  it("ne perd pas les transactions déjà présentes lors de la migration", () => {
    const state = {
      transactions: [{ id: "tx_1", date: "2026-04-01", direction: "in", category: "subvention", amount: 100, currency: "EUR", createdAt: "x" }],
      expenses: [{ id: "exp_1", date: "2026-03-01", category: "veto", amount: 50, createdAt: "x" }],
    };
    const out = migrateExpensesToTransactions(state);
    expect(out.transactions).toHaveLength(2);
    expect(out.transactions.find(t => t.id === "tx_1")).toBeTruthy();
    expect(out.transactions.find(t => t.id === "exp_1").direction).toBe("out");
  });
});
