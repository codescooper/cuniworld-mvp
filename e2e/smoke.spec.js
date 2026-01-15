import { test, expect } from "@playwright/test";
import {
  gotoClean,
  createRabbit,
  selectRabbitByCode,
  addSaillie,
  addMiseBas,
  addSevrage,
} from "./_helpers.js";

test.beforeEach(async ({ page }) => {
  await gotoClean(page);
});

test("parcours: créer femelle -> saillie -> mise-bas -> sevrage -> lot visible -> voir la mère", async ({ page }) => {
  await createRabbit(page, { code: "CW-F001", name: "Naya", sex: "F" });
  await selectRabbitByCode(page, "CW-F001");

  // Logique V4.1: saillie -> mise-bas (>=28j) -> sevrage (>=28j)
  await addSaillie(page, { date: "2026-01-01" });
  await addMiseBas(page, { date: "2026-01-30", born: "8", alive: "7" });
  await addSevrage(page, { date: "2026-02-28", weaned: "6", destCage: "C-04" });

  await expect(page.locator("#lotList")).toContainText("C-04");
  await expect(page.locator("#lotList")).toContainText("6 sevrés");

  // Ouvrir lot puis "Voir la mère"
  await page.locator("#lotList").getByText("C-04").first().click();
  await page.getByRole("button", { name: "Voir la mère" }).click();

  await expect(page.locator("#rabbitDetails")).toContainText("CW-F001");
  await expect(page.locator("#rabbitDetails")).toContainText("Naya");
});
