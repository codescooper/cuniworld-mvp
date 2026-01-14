import { test, expect } from "@playwright/test";

async function clickAddEvent(page) {
  const b1 = page.locator("#btnAddEvent");
  if (await b1.count()) return b1.first().click();

  const b2 = page.locator("#btnAddEvent2");
  if (await b2.count()) return b2.first().click();

  // secours si jamais
  return page
    .locator("#eventsPanel")
    .getByRole("button", { name: "+ Ajouter un événement" })
    .first()
    .click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("parcours: créer femelle -> saillie -> sevrage -> lot visible -> voir la mère", async ({ page }) => {
  // 1) Créer une femelle
  await page.getByRole("button", { name: "+ Nouveau lapin" }).click();

  await page.getByPlaceholder("ex: CW-F001").fill("CW-F001");
  await page.getByPlaceholder("ex: Naya").fill("Naya");
  await page.locator('select[name="sex"]').selectOption("F");
  await page.locator('select[name="status"]').selectOption("actif");

  await page.getByRole("button", { name: "Créer" }).click();

  // 2) Ajouter événement: saillie
  await clickAddEvent(page);
  await page.locator("#evType").selectOption("saillie");
  await page.locator('input[name="date"]').fill("2026-01-01");
 await page.locator("#eventForm button[type='submit']").click();


  // 3) Vérifier "mise-bas estimée"
  await expect(page.getByText("Mise-bas estimée")).toBeVisible();

  // 4) Ajouter événement: sevrage
  await clickAddEvent(page);
  await page.locator("#evType").selectOption("sevrage");
  await page.locator('input[name="date"]').fill("2026-02-01");
  await page.locator('input[name="weaned"]').fill("6");
  await page.locator('input[name="destCage"]').fill("C-04");
  await page.locator("#eventForm button[type='submit']").click();


  // 5) Vérifier lot visible
  await expect(page.getByText("Lots / Jeunes")).toBeVisible();
  await expect(page.locator("#lotList").getByText("C-04", { exact: true })).toBeVisible();
  await expect(page.locator("#lotList").getByText("6 sevrés")).toBeVisible();

  // 6) Ouvrir lot puis "Voir la mère"
  await page.locator("#lotList").getByText("C-04", { exact: true }).click();
  await page.getByRole("button", { name: "Voir la mère" }).click();

  // 7) Vérifier qu'on est revenu sur la mère (vérif robuste)
  await expect(page.locator("#rabbitDetails")).toContainText("CW-F001");
  await expect(page.locator("#rabbitDetails")).toContainText("Naya");
});
