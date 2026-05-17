import { describe, it, expect } from "vitest";
import { convert, convertOnDate, convertAggregate, availableCurrencies } from "../src/currency.js";

describe("currency.js", () => {
  it("retourne le montant inchangé si même devise", () => {
    expect(convert(100, 'EUR', 'EUR', 2025)).toBe(100);
    expect(convert(100, 'eur', 'EUR', 2025)).toBe(100); // insensible à la casse
  });

  it("convertit EUR → XOF avec le taux fixe officiel", () => {
    // 1 EUR = 655.957 XOF
    expect(convert(1, 'EUR', 'XOF', 2025)).toBeCloseTo(655.957, 2);
    expect(convert(10, 'EUR', 'XOF', 2025)).toBeCloseTo(6559.57, 1);
  });

  it("convertit XOF → EUR (réciproque)", () => {
    // 655.957 XOF = 1 EUR
    expect(convert(655.957, 'XOF', 'EUR', 2025)).toBeCloseTo(1, 3);
  });

  it("retourne null si devise inconnue", () => {
    expect(convert(100, 'XXX', 'EUR', 2025)).toBeNull();
    expect(convert(100, 'EUR', 'XXX', 2025)).toBeNull();
  });

  it("retombe sur l'année la plus récente disponible si année non couverte", () => {
    // Année 2030 inexistante → utilise 2026 (la plus récente).
    const v = convert(100, 'USD', 'EUR', 2030);
    expect(v).toBeGreaterThan(0);
  });

  it("convertOnDate déduit l'année depuis une date ISO", () => {
    const a = convertOnDate(100, 'EUR', 'XOF', '2024-06-15');
    expect(a).toBeCloseTo(65595.7, 1);
  });

  it("convertAggregate additionne en respectant l'année de chaque ligne", () => {
    const items = [
      { date: '2024-03-01', amount: 100 },   // taux 2024
      { date: '2025-05-01', amount: 200 },   // taux 2025
      { date: 'invalid',    amount: 50 },    // fallback année la plus récente
    ];
    const r = convertAggregate(items, 'EUR', 'XOF');
    expect(r.total).toBeGreaterThan(0);
    expect(r.skipped).toBe(0);
  });

  it("convertAggregate compte les lignes ignorées", () => {
    const items = [
      { date: '2025-05-01', amount: 100 },
      { date: '2025-05-01', amount: 'bad' },
    ];
    const r = convertAggregate(items, 'EUR', 'XOF');
    expect(r.skipped).toBe(1);
  });

  it("availableCurrencies renvoie une liste utilisable par un sélecteur", () => {
    const all = availableCurrencies();
    expect(all).toContainEqual({ code: 'XOF', label: 'Franc CFA BCEAO' });
    expect(all.length).toBeGreaterThanOrEqual(5);
  });
});
