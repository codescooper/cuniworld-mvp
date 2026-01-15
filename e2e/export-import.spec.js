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

test("export -> reset -> import restaure les données", async ({ page }, testInfo) => {
  await createRabbit(page, { code: "CW-F001", name: "Naya", sex: "F" });
  await selectRabbitByCode(page, "CW-F001");

  await addSaillie(page, { date: "2026-01-01" });
  await addMiseBas(page, { date: "2026-01-30", born: "8", alive: "7" });
  await addSevrage(page, { date: "2026-02-28", weaned: "6", destCage: "C-04" });

  // Vérifs pré-export
  await expect(page.locator("#rabbitDetails")).toContainText("CW-F001");
  await expect(page.locator("#lotList")).toContainText("C-04");

  // Export
  const download = await Promise.all([
    page.waitForEvent("download"),
    (async () => {
      const b = page.getByTestId("btn-export");
      if (await b.count()) await b.click();
      else await page.locator("#btnExport").click();
    })(),
  ]).then(([d]) => d);

  const exportPath = testInfo.outputPath("export-backup.json");
  await download.saveAs(exportPath);

  // Reset (confirm)
  page.once("dialog", (dialog) => dialog.accept());
  const reset = page.getByTestId("btn-reset");
  if (await reset.count()) await reset.click();
  else await page.locator("#btnReset").click();

  // Import (alert "Import réussi.")
  page.once("dialog", (dialog) => dialog.accept());
  const file = page.getByTestId("file-import");
  if (await file.count()) await file.setInputFiles(exportPath);
  else await page.locator("#fileImport").setInputFiles(exportPath);

  // Re-sélectionner
  await page.getByText("CW-F001").first().click();

  await expect(page.locator("#rabbitDetails")).toContainText("CW-F001");
  await expect(page.locator("#rabbitDetails")).toContainText("Naya");
  await expect(page.locator("#lotList")).toContainText("C-04");
  await expect(page.locator("#lotList")).toContainText("6 sevrés");
});
