// onboarding.spec.js — premier lapin créé depuis un état vierge.
// Couvre l'item roadmap 3.4-1 (variante locale, sans Supabase auth).

import { test, expect } from "@playwright/test";
import { gotoClean, createRabbit } from "./_helpers.js";

test("onboarding : premier lapin enregistré depuis état vierge", async ({ page }) => {
  await gotoClean(page);

  // Le panneau dashboard doit afficher 0 lapins
  const totalTile = page.locator(".tile", { hasText: "Lapins (total)" }).first();
  await expect(totalTile.locator(".n")).toHaveText("0");

  // Créer le premier lapin via le bouton "Nouveau lapin"
  await createRabbit(page, { code: "CW-F001", name: "Première", sex: "F" });

  // Retour au dashboard : compteur passé à 1
  await page.locator(".nav-item[data-panel=dashboard]").click();
  await expect(totalTile.locator(".n")).toHaveText("1");

  // Le lapin est visible dans la liste
  await page.locator(".nav-item[data-panel=rabbits]").click();
  await expect(page.locator("[data-testid=rabbit-item]")).toHaveCount(1);
  await expect(page.locator("[data-testid=rabbit-item]")).toContainText("CW-F001");
  await expect(page.locator("[data-testid=rabbit-item]")).toContainText("Première");
});
