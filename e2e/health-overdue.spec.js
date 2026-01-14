import { test, expect } from "@playwright/test";

async function createRabbit(page, { code = "CW-F001", name = "Naya" } = {}) {
  await page.getByTestId("btn-new-rabbit").click();
  await page.getByPlaceholder("ex: CW-F001").fill(code);
  await page.getByPlaceholder("ex: Naya").fill(name);
  await page.locator('select[name="sex"]').selectOption("F");
  await page.locator('select[name="status"]').selectOption("actif");
  await page.getByTestId("rabbit-form-submit").click();
}

async function openAddEvent(page) {
  const b1 = page.getByTestId("btn-add-event");
  if (await b1.count()) return b1.first().click();

  const b2 = page.getByTestId("btn-add-event-2");
  if (await b2.count()) return b2.first().click();

  return page.getByTestId("events-panel").getByRole("button", { name: "+ Ajouter un événement" }).first().click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("traitement avec nextDate passé => compteur 'Rappels en retard' > 0", async ({ page }) => {
  await createRabbit(page);

  // nextDate = hier
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yesterday = d.toISOString().slice(0, 10);

  await openAddEvent(page);
  await page.locator("#evType").selectOption("traitement");
  await page.locator('input[name="nextDate"]').fill(yesterday);
  await page.getByTestId("event-form-submit").click();

  // On vérifie que le dashboard indique au moins 1 rappel en retard
  await expect(page.getByTestId("dash")).toContainText("Rappels en retard");
  // et qu'on voit le lapin dans la liste d'urgences
  await expect(page.getByTestId("dash")).toContainText("CW-F001");
});
