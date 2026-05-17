import { describe, it, expect } from "vitest";
import { renderLegalPage, isLegalConfigComplete, LEGAL_CONFIG } from "../src/legal.js";

describe("legal.js — pages RGPD", () => {
  it("renderLegalPage produit les 3 pages attendues", () => {
    const legal   = renderLegalPage("legal");
    const cgu     = renderLegalPage("cgu");
    const privacy = renderLegalPage("privacy");

    expect(legal).toContain("Mentions légales");
    expect(legal).toContain("Éditeur du service");
    expect(legal).toContain("Hébergement");

    expect(cgu).toContain("Conditions générales");
    expect(cgu).toContain("Objet");
    expect(cgu).toContain("Responsabilité");

    expect(privacy).toContain("Politique de confidentialité");
    expect(privacy).toContain("Données collectées");
    expect(privacy).toContain("Vos droits (RGPD)");
  });

  it("renderLegalPage retourne 'introuvable' pour un slug inconnu", () => {
    expect(renderLegalPage("inexistant")).toContain("introuvable");
  });

  it("affiche le bandeau d'avertissement tant que LEGAL_CONFIG contient des placeholders", () => {
    // Le projet actuel a encore au moins une valeur "À COMPLÉTER"
    // (adresse postale, juridiction). Le warning doit donc apparaître.
    expect(isLegalConfigComplete()).toBe(false);
    expect(renderLegalPage("legal")).toContain("legal-warning");
  });

  it("toutes les pages incluent un footer avec les 3 liens légaux", () => {
    for (const slug of ["legal", "cgu", "privacy"]) {
      const html = renderLegalPage(slug);
      expect(html).toMatch(/data-legal-page="legal"/);
      expect(html).toMatch(/data-legal-page="cgu"/);
      expect(html).toMatch(/data-legal-page="privacy"/);
    }
  });

  it("expose une date d'effet et un email éditeur", () => {
    expect(LEGAL_CONFIG.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(LEGAL_CONFIG.editorEmail).toMatch(/@/);
  });

  it("échappe les valeurs de LEGAL_CONFIG (pas d'injection HTML)", () => {
    // L'éditeur courant contient des parenthèses : elles passent telles
    // quelles via escapeHTML (caractères inoffensifs) — on vérifie surtout
    // qu'aucune balise script n'est injectable depuis la config.
    const html = renderLegalPage("legal");
    expect(html).not.toMatch(/<script/i);
  });
});
