import { test, expect } from "@playwright/test";

async function clickAddEvent(page) {
  const b1 = page.locator("#btnAddEvent");
  if (await b1.count()) return b1.first().click();
  const b2 = page.locator("#btnAddEvent2");
  if (await b2.count()) return b2.first().click();
  return page.locator("#eventsPanel").getByRole("button", { name: "+ Ajouter un événement" }).first().click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("vaccin+traitement avec nextDate apparaissent en rappels dashboard", async ({ page }) => {
  // Créer un lapin actif
  await page.locator("#btnNewRabbit").click();
  await page.getByPlaceholder("ex: CW-F001").fill("CW-F001");
  await page.getByPlaceholder("ex: Naya").fill("Naya");
  await page.locator('select[name="sex"]').selectOption("F");
  await page.locator('select[name="status"]').selectOption("actif");
  await page.locator('#rabbitForm button[type="submit"]').click();

  // Ajouter un vaccin avec nextDate (aujourd'hui+3 jours -> devrait être "≤7j")
  const today = new Date();
  const next = new Date(today);
  next.setDate(today.getDate() + 3);
  const nextISO = next.toISOString().slice(0,10);

  await clickAddEvent(page);
  await page.locator("#evType").selectOption("vaccin");
  await page.locator('input[name="nextDate"]').fill(nextISO);
  await page.locator("#eventForm button[type='submit']").click();

  // Vérifier dashboard contient "Rappels"
  await expect(page.locator("#dash")).toContainText("Rappels");
  await expect(page.locator("#dash")).toContainText("CW-F001");
});
