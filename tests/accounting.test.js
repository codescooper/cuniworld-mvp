import { describe, it, expect } from "vitest";
import {
  EXPENSE_CATEGORIES,
  addExpense,
  deleteExpense,
  listRevenues,
  listExpenses,
  computeMonthlyPL,
  computeTotals,
} from "../src/accounting.js";

const empty = () => ({ rabbits: [], events: [], expenses: [] });

describe("accounting.js — recettes", () => {
  it("listRevenues additionne les événements vente avec un prix > 0", () => {
    const state = {
      ...empty(),
      events: [
        { id: 'e1', type: 'vente', date: '2026-03-15', rabbitId: 'r1', data: { price: 5000 } },
        { id: 'e2', type: 'vente', date: '2026-04-02', rabbitId: 'r2', data: { price: 7500 } },
        { id: 'e3', type: 'pesée', date: '2026-04-02', rabbitId: 'r3', data: { weight: 2.5 } },
        { id: 'e4', type: 'vente', date: '2026-04-15', rabbitId: 'r4', data: { price: 0 } }, // ignorée
      ],
    };
    const revs = listRevenues(state);
    expect(revs).toHaveLength(2);
    expect(revs.reduce((s, r) => s + r.amount, 0)).toBe(12500);
  });

  it("listRevenues ajoute les commandes livre, sauf si déjà reflétées en event vente", () => {
    const state = {
      ...empty(),
      events: [
        { id: 'e1', type: 'vente', date: '2026-04-10', rabbitId: 'rA', data: { price: 5000 } },
      ],
    };
    const orders = [
      // Commande livre dont TOUS les lapins sont déjà comptabilisés → ignorée
      {
        id: 'ord1', status: 'livre', created_at: '2026-04-10T00:00:00Z',
        items: [{ rabbit_id: 'rA', unit_price: 5000 }],
        data: { totalAmount: 5000 },
      },
      // Commande livre avec lapin inconnu → comptée
      {
        id: 'ord2', status: 'livre', created_at: '2026-04-12T00:00:00Z',
        items: [{ rabbit_id: 'rB', unit_price: 8000 }],
        data: { totalAmount: 8000 },
      },
      // Commande non livrée → ignorée
      {
        id: 'ord3', status: 'reserve', created_at: '2026-04-15T00:00:00Z',
        items: [{ rabbit_id: 'rC', unit_price: 4000 }],
      },
    ];
    const revs = listRevenues(state, orders);
    expect(revs).toHaveLength(2); // event 5000 + ord2 8000
    expect(revs.reduce((s, r) => s + r.amount, 0)).toBe(13000);
  });
});

describe("accounting.js — dépenses", () => {
  it("addExpense rejette montant ≤ 0 ou date manquante", () => {
    expect(() => addExpense(empty(), { date: '', category: 'aliment', amount: 100 })).toThrow(/Date/);
    expect(() => addExpense(empty(), { date: '2026-05-01', category: 'aliment', amount: 0 })).toThrow(/Montant/);
    expect(() => addExpense(empty(), { date: '2026-05-01', category: 'aliment', amount: -5 })).toThrow(/Montant/);
  });

  it("addExpense normalise la catégorie inconnue → 'autre'", () => {
    const s = addExpense(empty(), { date: '2026-05-01', category: 'inexistante', amount: 100 });
    expect(s.expenses[0].category).toBe('autre');
  });

  it("deleteExpense retire la bonne entrée", () => {
    let s = addExpense(empty(), { date: '2026-05-01', category: 'aliment', amount: 100 });
    s = addExpense(s, { date: '2026-05-02', category: 'veto', amount: 50 });
    const id = s.expenses[0].id;
    s = deleteExpense(s, id);
    expect(s.expenses).toHaveLength(1);
    expect(s.expenses[0].category).toBe('veto');
  });

  it("listExpenses trie par date desc", () => {
    let s = addExpense(empty(), { date: '2026-03-01', category: 'aliment', amount: 100 });
    s = addExpense(s, { date: '2026-05-01', category: 'aliment', amount: 200 });
    s = addExpense(s, { date: '2026-04-01', category: 'aliment', amount: 150 });
    const sorted = listExpenses(s);
    expect(sorted.map(e => e.date)).toEqual(['2026-05-01', '2026-04-01', '2026-03-01']);
  });
});

describe("accounting.js — P&L mensuel", () => {
  it("agrège revenus et dépenses par mois civil", () => {
    let state = {
      ...empty(),
      events: [
        { id: 'e1', type: 'vente', date: '2026-03-15', rabbitId: 'r1', data: { price: 10000 } },
        { id: 'e2', type: 'vente', date: '2026-03-28', rabbitId: 'r2', data: { price: 8000 } },
        { id: 'e3', type: 'vente', date: '2026-04-10', rabbitId: 'r3', data: { price: 12000 } },
      ],
    };
    state = addExpense(state, { date: '2026-03-05', category: 'aliment', amount: 5000 });
    state = addExpense(state, { date: '2026-03-20', category: 'veto', amount: 3000 });
    state = addExpense(state, { date: '2026-04-02', category: 'aliment', amount: 6000 });

    const pl = computeMonthlyPL(state);
    expect(pl).toHaveLength(2);

    const apr = pl.find(r => r.month === '2026-04');
    expect(apr.revenue).toBe(12000);
    expect(apr.expensesTotal).toBe(6000);
    expect(apr.net).toBe(6000);
    expect(apr.expensesByCat.aliment).toBe(6000);

    const mar = pl.find(r => r.month === '2026-03');
    expect(mar.revenue).toBe(18000);
    expect(mar.expensesTotal).toBe(8000);
    expect(mar.net).toBe(10000);
    expect(mar.expensesByCat.aliment).toBe(5000);
    expect(mar.expensesByCat.veto).toBe(3000);
  });
});

describe("accounting.js — totaux globaux", () => {
  it("computeTotals additionne tout", () => {
    let state = {
      ...empty(),
      events: [
        { id: 'e1', type: 'vente', date: '2026-03-15', rabbitId: 'r1', data: { price: 10000 } },
        { id: 'e2', type: 'vente', date: '2026-04-10', rabbitId: 'r2', data: { price: 5000 } },
      ],
    };
    state = addExpense(state, { date: '2026-03-05', category: 'aliment', amount: 2000 });
    state = addExpense(state, { date: '2026-04-02', category: 'veto', amount: 1500 });

    const t = computeTotals(state);
    expect(t.revenue).toBe(15000);
    expect(t.expensesTotal).toBe(3500);
    expect(t.net).toBe(11500);
    expect(t.expensesByCat).toEqual({ aliment: 2000, veto: 1500 });
  });

  it("exporte les catégories utilisables côté UI", () => {
    expect(EXPENSE_CATEGORIES.aliment.label).toBe('Aliments');
    expect(Object.keys(EXPENSE_CATEGORIES)).toContain('main_oeuvre');
  });
});
