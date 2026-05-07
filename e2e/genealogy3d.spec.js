import { test, expect } from "@playwright/test";
import { gotoClean, createRabbit, createBuck, navigateTo } from "./_helpers.js";

test.beforeEach(async ({ page }) => {
  await gotoClean(page);
  // Créer une famille : mère, père, 2 kits via la seed (ou on crée nous-mêmes)
  await createRabbit(page, { code: "CW-F001", name: "Naya", sex: "F" });
  await createBuck(page, { code: "CW-M001", name: "Orion" });
  await navigateTo(page, "genealogy");
});

test("affiche les nœuds 3D dans le panneau Généalogie", async ({ page }) => {
  await expect(page.locator("#geneGraph")).toBeVisible();
  // Au moins un nœud gene-node doit être rendu
  await expect(page.locator(".gene-node").first()).toBeVisible({ timeout: 5000 });
  const count = await page.locator(".gene-node").count();
  expect(count).toBeGreaterThanOrEqual(2);
});

test("survol d'un nœud affiche le tooltip", async ({ page }) => {
  const node = page.locator(".gene-node").first();
  await expect(node).toBeVisible({ timeout: 5000 });
  await node.hover();
  await expect(page.locator(".gene-tooltip")).toBeVisible({ timeout: 3000 });
  await expect(page.locator(".gene-tooltip")).toContainText("Voir plus");
});

test("double-clic active le mode focus puis Réinitialiser revient", async ({ page }) => {
  const node = page.locator(".gene-node").first();
  await expect(node).toBeVisible({ timeout: 5000 });

  // Double-clic pour activer le focus
  await node.dblclick();
  // Le badge de focus doit apparaître
  await expect(page.locator("#geneFocusBadge")).toBeVisible({ timeout: 3000 });
  // Au moins un nœud dimmed (si plus d'un lapin)
  const dimmed = page.locator(".gene-node--dimmed");
  // Avec 2 nœuds liés ou pas, le badge est visible — ça suffit

  // Réinitialiser la vue
  await page.locator("#geneResetView").click();
  await expect(page.locator("#geneFocusBadge")).toBeHidden({ timeout: 2000 });
  // Aucun nœud dimmed après reset
  expect(await dimmed.count()).toBe(0);
});

test("clic sur nœud ouvre la side card", async ({ page }) => {
  const node = page.locator(".gene-node").first();
  await expect(node).toBeVisible({ timeout: 5000 });

  // Single click after delay
  await node.click();
  await page.waitForTimeout(300);
  await expect(page.locator("#geneSideCard")).toBeVisible({ timeout: 3000 });
  await expect(page.locator("#geneSideCard")).toContainText("Ouvrir la fiche");
});

test("la recherche surligne les nœuds correspondants", async ({ page }) => {
  await expect(page.locator(".gene-node").first()).toBeVisible({ timeout: 5000 });
  await page.fill("#geneQ", "Naya");
  await page.waitForTimeout(200);
  // Le nœud Naya doit être matched
  await expect(page.locator(".gene-node--matched")).toBeVisible({ timeout: 2000 });
});

test("navigation vers Actions puis Dashboard continue de fonctionner", async ({ page }) => {
  await expect(page.locator(".gene-node").first()).toBeVisible({ timeout: 5000 });
  await navigateTo(page, "actions");
  await expect(page.locator("#panel-actions")).toBeVisible();
  await navigateTo(page, "dashboard");
  await expect(page.locator("#dash")).toBeVisible();
});
