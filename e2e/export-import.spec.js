import { test, expect } from "@playwright/test";
import {
  gotoClean,
  createRabbit,
  createBuck,
  selectRabbitByCode,
  addSaillieWithMale,
  addMiseBas,
  addSevrage,
  addHealthEvent,
  navigateTo,
  confirmCustomDialog,
} from "./_helpers.js";

test.beforeEach(async ({ page }) => {
  await gotoClean(page);
});

test("export -> reset -> import restaure les données", async ({ page }, testInfo) => {
  await createRabbit(page, { code: "CW-F001", name: "Naya", sex: "F" });
  await createRabbit(page, { code: "CW-M001", name: "Orion", sex: "M" });
  await selectRabbitByCode(page, "CW-F001");

  await addSaillieWithMale(page, { date: "2026-01-01", maleCode: "CW-M001" });
  await addMiseBas(page, { date: "2026-01-30", born: "8", alive: "2" });
  await addSevrage(page, { date: "2026-02-28", weaned: "6", destCage: "C-04" });
  await addHealthEvent(page, { type: "vaccin", date: "2026-03-01", nextDate: "2026-03-10" });

  // Vérifs pré-export (rabbits panel)
  await expect(page.locator("#rabbitDetails")).toContainText("CW-F001");
  await expect(page.locator("#lotList")).toContainText("C-04");
  await expect(page.locator("#rabbitList")).toContainText("CW-F001-K01");

  // Export depuis le panneau Actions
  await navigateTo(page, "actions");
  const download = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#moreExport").click(),
  ]).then(([d]) => d);

  const exportPath = testInfo.outputPath("export-backup.json");
  await download.saveAs(exportPath);

  // Reset (custom confirm)
  await page.locator("#moreReset").click();
  await confirmCustomDialog(page);

  // Import (file input dans le panneau Actions)
  await page.locator("#moreFileImport").setInputFiles(exportPath);

  // Re-sélectionner dans le panneau lapins
  await navigateTo(page, "rabbits");
  await page.getByText("CW-F001", { exact: true }).first().click();

  await expect(page.locator("#rabbitDetails")).toContainText("CW-F001");
  await expect(page.locator("#rabbitDetails")).toContainText("Naya");
  await expect(page.locator("#lotList")).toContainText("C-04");
  await expect(page.locator("#lotList")).toContainText("6 sevrés");
  await expect(page.locator("#rabbitList")).toContainText("CW-F001-K01");
  await expect(page.locator("#eventsPanel")).toContainText("Vaccin");
});
