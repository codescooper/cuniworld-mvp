import { describe, it, expect, vi } from "vitest";
import { buildSanitaryRecordHTML, buildInvoiceHTML, printSanitaryRecord, printInvoice } from "../src/printable.js";

describe("printable.js — carnet sanitaire", () => {
  const rabbit = {
    id: 'r1', code: 'CW-F001', name: 'Naya', sex: 'F',
    breed: 'Néo-zélandais', cage: 'A1', status: 'actif',
    birthDate: '2025-09-10', notes: 'Bonne mère',
  };
  const state = {
    rabbits: [rabbit],
    events: [
      { id: 'e1', rabbitId: 'r1', type: 'vaccin', date: '2026-01-05', data: { product: 'Myxomatose', dose: '0.5 mL', nextDate: '2026-07-05' } },
      { id: 'e2', rabbitId: 'r1', type: 'pesée',  date: '2026-02-01', data: { weight: 3.2 } },
      { id: 'e3', rabbitId: 'r1', type: 'pesée',  date: '2026-03-01', data: { weight: 3.5 } },
      { id: 'e4', rabbitId: 'r1', type: 'autre',  date: '2026-03-15', data: {} }, // ignoré
      { id: 'e5', rabbitId: 'r2', type: 'vaccin', date: '2026-02-10', data: {} }, // autre lapin
    ],
  };

  it("retourne un message clair si lapin null", () => {
    expect(buildSanitaryRecordHTML(state, null)).toContain("introuvable");
  });

  it("inclut identité, vaccins et pesées du lapin demandé", () => {
    const html = buildSanitaryRecordHTML(state, rabbit);
    expect(html).toContain("Carnet sanitaire");
    expect(html).toContain("Naya");
    expect(html).toContain("CW-F001");
    expect(html).toContain("Néo-zélandais");
    expect(html).toContain("Myxomatose");
    expect(html).toContain("3.20 kg");
    expect(html).toContain("3.50 kg");
    // Le vaccin du lapin r2 ne doit PAS apparaître.
    expect(html.match(/r2|02-10/)).toBeFalsy();
  });

  it("affiche un placeholder si aucun acte ou pesée", () => {
    const emptyState = { rabbits: [rabbit], events: [] };
    const html = buildSanitaryRecordHTML(emptyState, rabbit);
    expect(html).toContain("Aucun acte vétérinaire");
    expect(html).toContain("Aucune pesée");
  });

  it("échappe les caractères HTML dans les champs user", () => {
    const evil = { ...rabbit, name: '<script>alert(1)</script>' };
    const html = buildSanitaryRecordHTML({ rabbits: [evil], events: [] }, evil);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe("printable.js — facture", () => {
  const ctx = { state: {}, farmSettings: { currencySymbol: 'FCFA' } };

  const order = {
    id: 'abcdef1234567890',
    status: 'livre',
    created_at: '2026-04-15T10:00:00Z',
    items: [
      { id: 'it1', rabbit_id: 'r1', unit_price: 5000, rabbit_snapshot: { name: 'Naya',  code: 'CW-F001' } },
      { id: 'it2', rabbit_id: 'r2', unit_price: 3500, rabbit_snapshot: { name: 'Orion', code: 'CW-M001' } },
    ],
    data: {
      customer_name:    'Jean Dupont',
      customer_phone:   '+221 77 123 45 67',
      customer_email:   'jean@example.com',
      customer_address: '12 rue Test, Dakar',
      currency_symbol:  'FCFA',
      totalAmount:      8500,
    },
  };

  it("inclut numéro facture, vendeur (LEGAL_CONFIG), client et lignes", () => {
    const html = buildInvoiceHTML(order, ctx);
    expect(html).toMatch(/FACTURE n° FACT-202604-ABCDEF12/);
    expect(html).toContain("Jean Dupont");
    expect(html).toContain("Naya");
    expect(html).toContain("Orion");
    expect(html).toContain("CW-F001");
    expect(html).toContain("codescooper@gmail.com");
    // Total présent
    expect(html).toMatch(/TOTAL/);
    expect(html).toMatch(/8[\s ]*500/); // 8500 formaté (espace insécable possible)
  });

  it("retombe sur la somme des unit_price si data.totalAmount manque", () => {
    const o = { ...order, data: { ...order.data, totalAmount: undefined } };
    const html = buildInvoiceHTML(o, ctx);
    expect(html).toMatch(/8[\s ]*500/);
  });

  it("affiche un message si commande null", () => {
    expect(buildInvoiceHTML(null, ctx)).toContain("introuvable");
  });

  it("échappe les champs client malveillants", () => {
    const o = { ...order, data: { ...order.data, customer_name: '<img src=x onerror=alert(1)>' } };
    const html = buildInvoiceHTML(o, ctx);
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img');
  });

  it("écrit dans une fenêtre pré-ouverte (pattern user-gesture safe)", () => {
    // Stub minimaliste d'une fenêtre window pré-ouverte
    let writtenHTML = '';
    const fakeWindow = {
      document: {
        open: vi.fn(),
        write: vi.fn((s) => { writtenHTML += s; }),
        close: vi.fn(),
      },
    };
    const ok = printInvoice(order, ctx, fakeWindow);
    expect(ok).toBe(true);
    expect(writtenHTML).toContain('FACTURE n°');
    expect(writtenHTML).toContain('Jean Dupont');
  });
});

describe("printable.js — chemin pré-ouvert (carnet)", () => {
  it("printSanitaryRecord avec fenêtre pré-ouverte écrit le HTML", () => {
    let writtenHTML = '';
    const fakeWindow = {
      document: {
        open: vi.fn(),
        write: vi.fn((s) => { writtenHTML += s; }),
        close: vi.fn(),
      },
    };
    const rabbit = { id: 'r1', code: 'CW-F001', name: 'Naya', sex: 'F' };
    const state = { rabbits: [rabbit], events: [] };
    const ok = printSanitaryRecord(state, rabbit, fakeWindow);
    expect(ok).toBe(true);
    expect(writtenHTML).toContain('Carnet sanitaire');
    expect(writtenHTML).toContain('Naya');
  });

  it("retombe sur openPrintWindow si pas de fenêtre fournie", () => {
    // En env vitest sans window.open natif, on s'attend simplement à un retour
    // truthy/falsy sans crash.
    const rabbit = { id: 'r1', code: 'CW-F001', name: 'Naya', sex: 'F' };
    const state = { rabbits: [rabbit], events: [] };
    // jsdom: window.open existe mais retourne null par défaut → openPrintWindow
    // renvoie false, ce qui est l'API attendue.
    const result = printSanitaryRecord(state, rabbit);
    expect(typeof result).toBe('boolean');
  });
});
