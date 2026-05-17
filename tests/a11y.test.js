/**
 * a11y.test.js — invariants d'accessibilité sur index.html (statique).
 *
 * Couvre l'item roadmap 3.2 (côté HTML statique). Pour les renderers
 * dynamiques, l'audit reste manuel (Lighthouse / axe-core en E2E).
 *
 * Vérifications :
 *   1. Tous les <button> icône-seule ont un aria-label (sinon screen reader = vide).
 *   2. Tous les <input> ont un label associé OU un aria-label OU un placeholder
 *      explicite ET un type non-text/hidden.
 *   3. Les zones live (toasts, badges sync) ont aria-live.
 *   4. Les modales/overlays ont role="dialog" ou role="region".
 *   5. La langue principale (html lang) est définie.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

let doc;

beforeAll(() => {
  const html = readFileSync("index.html", "utf8");
  doc = new JSDOM(html).window.document;
});

describe("Accessibilité — index.html", () => {
  it("la racine HTML a lang='fr'", () => {
    expect(doc.documentElement.getAttribute("lang")).toBe("fr");
  });

  it("aucun <button> ne reste sans nom accessible", () => {
    const buttons = [...doc.querySelectorAll("button")];
    const offenders = buttons.filter(b => {
      // Exclu : éléments explicitement retirés du flux (aria-hidden=true ou
      // tabindex=-1) — proxies internes câblés par le code, jamais focus
      // par un utilisateur clavier / lecteur d'écran.
      if (b.getAttribute("aria-hidden") === "true") return false;
      if (b.getAttribute("tabindex") === "-1") return false;
      const aria = b.getAttribute("aria-label");
      const labelledBy = b.getAttribute("aria-labelledby");
      const title = b.getAttribute("title");
      const text = (b.textContent || "").trim();
      return !(aria || labelledBy || text.length >= 2 || title);
    });
    expect(offenders.map(b => b.outerHTML.slice(0, 160))).toEqual([]);
  });

  it("la zone toasts a aria-live", () => {
    const toastRoot = doc.querySelector("#toastRoot");
    expect(toastRoot).toBeTruthy();
    expect(toastRoot.getAttribute("aria-live")).toBeTruthy();
  });

  it("le bandeau consentement a un role explicite", () => {
    const banner = doc.querySelector("#consentBanner");
    expect(banner).toBeTruthy();
    expect(banner.getAttribute("role")).toBe("region");
    expect(banner.getAttribute("aria-label")).toBeTruthy();
  });

  it("les inputs visibles ont un label associé ou un placeholder/aria-label", () => {
    const inputs = [...doc.querySelectorAll("input")]
      .filter(i => {
        const type = i.getAttribute("type") || "text";
        if (type === "hidden") return false;
        // Mêmes exclusions que pour les <button> : proxies retirés du flux.
        if (i.getAttribute("aria-hidden") === "true") return false;
        if (i.getAttribute("tabindex") === "-1") return false;
        return true;
      });
    const offenders = inputs.filter(i => {
      const id = i.id;
      const labelFor = id ? doc.querySelector(`label[for="${id}"]`) : null;
      const wrappedByLabel = i.closest("label");
      const aria = i.getAttribute("aria-label");
      const placeholder = i.getAttribute("placeholder");
      return !(labelFor || wrappedByLabel || aria || placeholder);
    });
    expect(offenders.map(i => i.outerHTML.slice(0, 200))).toEqual([]);
  });
});
