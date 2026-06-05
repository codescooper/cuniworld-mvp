import { describe, it, expect } from "vitest";
import {
  LEDGER_CATEGORIES,
  categoriesFor,
  migrateExpensesToTransactions,
  listLedger,
  addTransaction,
  deleteTransaction,
  addRecurringCharge,
  skipRecurringOccurrence,
  setRecurringOverride,
  unfoldRecurring,
  computeTotals,
  computeMonthlyPL,
  computeYearlyPL,
  computeTreasury,
  listLedgerCSV,
} from "../src/ledger.js";

const empty = () => ({ rabbits: [], events: [], stock: [], stockMovements: [], transactions: [], recurringCharges: [] });

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

describe("ledger — journal unifié", () => {
  it("agrège ventes (in), achats (out) et transactions manuelles", () => {
    let s = {
      ...empty(),
      events: [
        { id: "e1", type: "vente", date: "2026-03-15", rabbitId: "r1", data: { price: 5000 } },
        { id: "e2", type: "achat", date: "2026-03-10", rabbitId: "r2", data: { price: 12000 } },
        { id: "e3", type: "pesée", date: "2026-03-12", rabbitId: "r3", data: { weight: 2 } },
      ],
    };
    s = addTransaction(s, { date: "2026-03-20", direction: "in", category: "fumier", amount: 3000 });
    const lines = listLedger(s);
    expect(lines).toHaveLength(3); // vente + achat + manuel (pesée ignorée)
    expect(lines.find(l => l.category === "vente_lapin").direction).toBe("in");
    const achat = lines.find(l => l.category === "achat_animal");
    expect(achat.direction).toBe("out");
    expect(achat.amount).toBe(12000);
    expect(lines.find(l => l.source === "manual").editable).toBe(true);
  });

  it("dérive une dépense des mouvements stock `entree` avec totalCost (mapping catégorie)", () => {
    const s = {
      ...empty(),
      stock: [
        { id: "s1", name: "Granulés", category: "aliment" },
        { id: "s2", name: "Seringues", category: "medicament" },
      ],
      stockMovements: [
        { id: "m1", stockItemId: "s1", type: "entree", date: "2026-04-01", quantity: 2, totalCost: 18000 },
        { id: "m2", stockItemId: "s2", type: "entree", date: "2026-04-02", quantity: 5, totalCost: 4000 },
        { id: "m3", stockItemId: "s1", type: "sortie", date: "2026-04-03", quantity: 1 }, // ignoré (sortie)
        { id: "m4", stockItemId: "s1", type: "entree", date: "2026-04-04", quantity: 1 }, // ignoré (pas de coût)
      ],
    };
    const lines = listLedger(s).filter(l => l.source === "stock");
    expect(lines).toHaveLength(2);
    expect(lines.find(l => l.refId === "m1").category).toBe("aliment");
    expect(lines.find(l => l.refId === "m2").category).toBe("veto"); // medicament → veto
    expect(lines.every(l => l.direction === "out")).toBe(true);
  });

  it("conserve l'anti-double-comptage ventes/commandes", () => {
    const s = {
      ...empty(),
      events: [{ id: "e1", type: "vente", date: "2026-04-10", rabbitId: "rA", data: { price: 5000 } }],
    };
    const orders = [
      { id: "ord1", status: "livre", created_at: "2026-04-10T00:00:00Z", items: [{ rabbit_id: "rA", unit_price: 5000 }], data: { totalAmount: 5000 } }, // déjà reflété → ignoré
      { id: "ord2", status: "livre", created_at: "2026-04-12T00:00:00Z", items: [{ rabbit_id: "rB", unit_price: 8000 }], data: { totalAmount: 8000 } },
    ];
    const ins = listLedger(s, { orders }).filter(l => l.direction === "in");
    expect(ins).toHaveLength(2); // event 5000 + ord2 8000
    expect(ins.reduce((a, l) => a + l.amount, 0)).toBe(13000);
  });
});

describe("ledger — charges récurrentes", () => {
  it("déplie de startMonth au mois courant, en respectant skips et overrides", () => {
    let s = addRecurringCharge(empty(), {
      label: "Loyer", direction: "out", category: "loyer", amount: 10000,
      dayOfMonth: 5, startMonth: "2026-01",
    });
    const id = s.recurringCharges[0].id;
    s = skipRecurringOccurrence(s, id, "2026-02");     // février ignoré
    s = setRecurringOverride(s, id, "2026-03", 12000);  // mars ajusté

    const lines = unfoldRecurring(s, "2026-04-15");
    expect(lines.map(l => l.date)).toEqual(["2026-01-05", "2026-03-05", "2026-04-05"]); // pas de février, pas de mai (futur)
    expect(lines.find(l => l.date === "2026-03-05").amount).toBe(12000);
    expect(lines.every(l => l.direction === "out" && l.source === "recurring")).toBe(true);
  });

  it("ne génère rien après endMonth", () => {
    const s = addRecurringCharge(empty(), {
      label: "Abo", direction: "out", category: "abonnement", amount: 2000,
      dayOfMonth: 1, startMonth: "2026-01", endMonth: "2026-02",
    });
    expect(unfoldRecurring(s, "2026-06-01").map(l => l.date)).toEqual(["2026-01-01", "2026-02-01"]);
  });
});

describe("ledger — agrégations", () => {
  const base = () => {
    let s = {
      ...empty(),
      events: [
        { id: "e1", type: "vente", date: "2026-03-15", rabbitId: "r1", data: { price: 10000 } },
        { id: "e2", type: "achat", date: "2026-03-05", rabbitId: "r2", data: { price: 6000 } },
        { id: "e3", type: "vente", date: "2026-04-10", rabbitId: "r3", data: { price: 8000 } },
      ],
    };
    s = addTransaction(s, { date: "2026-03-20", direction: "out", category: "aliment", amount: 2000 });
    return s;
  };

  it("computeTotals renvoie {in,out,net,byCat}", () => {
    const t = computeTotals(base());
    expect(t.in).toBe(18000);
    expect(t.out).toBe(8000);
    expect(t.net).toBe(10000);
    expect(t.byCat.aliment).toBe(2000);
    expect(t.byCat.achat_animal).toBe(6000);
  });

  it("computeMonthlyPL groupe par mois desc", () => {
    const pl = computeMonthlyPL(base());
    expect(pl.map(r => r.month)).toEqual(["2026-04", "2026-03"]);
    const mar = pl.find(r => r.month === "2026-03");
    expect(mar.in).toBe(10000);
    expect(mar.out).toBe(8000);
    expect(mar.net).toBe(2000);
  });

  it("computeYearlyPL groupe par année", () => {
    const py = computeYearlyPL(base());
    expect(py).toHaveLength(1);
    expect(py[0].year).toBe("2026");
    expect(py[0].net).toBe(10000);
  });

  it("computeTreasury renvoie un solde et une série cumulée chronologique", () => {
    const tr = computeTreasury(base());
    expect(tr.balance).toBe(10000);
    expect(tr.series[tr.series.length - 1].cumulative).toBe(10000);
    expect(tr.series[0].date <= tr.series[tr.series.length - 1].date).toBe(true);
  });
});

describe("ledger — validation transactions", () => {
  it("rejette montant ≤ 0, sens invalide, date manquante", () => {
    expect(() => addTransaction(empty(), { date: "", direction: "out", category: "aliment", amount: 100 })).toThrow(/Date/);
    expect(() => addTransaction(empty(), { date: "2026-05-01", direction: "x", category: "aliment", amount: 100 })).toThrow(/Sens/);
    expect(() => addTransaction(empty(), { date: "2026-05-01", direction: "out", category: "aliment", amount: 0 })).toThrow(/Montant/);
  });

  it("coerce une catégorie incohérente avec le sens", () => {
    const s1 = addTransaction(empty(), { date: "2026-05-01", direction: "in", category: "vente_lapin", amount: 100 });
    expect(s1.transactions[0].category).toBe("autre_recette"); // catégorie auto refusée en saisie
    const s2 = addTransaction(empty(), { date: "2026-05-01", direction: "in", category: "aliment", amount: 100 });
    expect(s2.transactions[0].category).toBe("autre_recette"); // catégorie out demandée en in
  });

  it("deleteTransaction retire la bonne ligne", () => {
    let s = addTransaction(empty(), { date: "2026-05-01", direction: "out", category: "aliment", amount: 100 });
    const id = s.transactions[0].id;
    s = addTransaction(s, { date: "2026-05-02", direction: "out", category: "veto", amount: 50 });
    s = deleteTransaction(s, id);
    expect(s.transactions).toHaveLength(1);
    expect(s.transactions[0].category).toBe("veto");
  });
});

describe("ledger — export CSV", () => {
  it("produit un en-tête, des lignes triées asc et échappe les séparateurs", () => {
    let s = {
      ...empty(),
      events: [{ id: "e1", type: "vente", date: "2026-02-01", rabbitId: "r1", data: { price: 5000 } }],
    };
    s = addTransaction(s, { date: "2026-01-15", direction: "out", category: "autre", amount: 1000, description: 'corde; clous "x"' });
    const csv = listLedgerCSV(s);
    const rows = csv.split("\r\n");
    expect(rows[0]).toContain("Date;Sens;Catégorie");
    expect(rows[1]).toContain("2026-01-15"); // tri asc : plus ancienne d'abord
    expect(csv).toContain('"corde; clous ""x"""'); // échappement ; et "
  });
});
