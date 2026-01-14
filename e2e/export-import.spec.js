import { test, expect } from "@playwright/test";

async function clickAddEvent(page) {
  const b1 = page.locator("#btnAddEvent");
  if (await b1.count()) return b1.first().click();

  const b2 = page.locator("#btnAddEvent2");
  if (await b2.count()) return b2.first().click();

  return page
    .getByTestId("events-panel")
    .getByRole("button", { name: "+ Ajouter un événement" })
    .first()
    .click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("export -> reset -> import restaure les données", async ({ page }, testInfo) => {
  // 1) Créer une femelle
  await page.getByTestId("btn-new-rabbit").click();
  await page.getByPlaceholder("ex: CW-F001").fill("CW-F001");
  await page.getByPlaceholder("ex: Naya").fill("Naya");
  await page.locator('select[name="sex"]').selectOption("F");
  await page.locator('select[name="status"]').selectOption("actif");
  await page.getByTestId("rabbit-form-submit").click();

  // 2) Ajouter un événement sevrage (pour avoir aussi un lot)
  await clickAddEvent(page);
  await page.locator("#evType").selectOption("sevrage");
  await page.locator('input[name="date"]').fill("2026-02-01");
  await page.locator('input[name="weaned"]').fill("6");
  await page.locator('input[name="destCage"]').fill("C-04");
  await page.getByTestId("event-form-submit").click();

  // Vérif rapide que les données existent avant export
  await expect(page.getByTestId("rabbit-details")).toContainText("CW-F001");
  await expect(page.getByTestId("rabbit-details")).toContainText("Naya");

  // 3) Exporter (capture le fichier téléchargé)
  const download = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("btn-export").click(),
  ]).then(([d]) => d);

  // Sauvegarde du fichier
  const exportPath = testInfo.outputPath("export-backup.json");
  await download.saveAs(exportPath);

  // 4) Reset (il y a un confirm)
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("btn-reset").click();

  // Vérifier que c'est vide après reset
  // -> on vérifie via la liste elle-même (sans dépendre d'un texte)
  await expect(page.getByTestId("rabbit-list")).toContainText("Aucun", { timeout: 2000 }).catch(async () => {
    // fallback si tu n'as pas de texte "Aucun..."
    // au moins, on s'assure que les détails reviennent à l'état initial
    await expect(page.getByTestId("rabbit-details")).toContainText("Sélectionne", { timeout: 2000 });
  });

  // 5) Importer le fichier exporté
  // (si ton app affiche un alert, on l'accepte)
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("file-import").setInputFiles(exportPath);

  // 6) Vérifier que les données sont revenues
  // Idéalement tu ajoutes data-testid sur les items, mais sinon on clique le 1er item de la liste
  const firstRabbitItem = page.getByTestId("rabbit-item").first();
  await firstRabbitItem.click({ trial: true }).catch(() => {});
  await firstRabbitItem.click().catch(async () => {
    // fallback si la structure n'est pas cliquable : clique par texte
    await page.getByText("CW-F001").first().click();
  });

  await expect(page.getByTestId("rabbit-details")).toContainText("CW-F001");
  await expect(page.getByTestId("rabbit-details")).toContainText("Naya");

  // Vérifier que le lot est revenu aussi
  await expect(page.getByTestId("lot-list")).toContainText("C-04");
  await expect(page.getByTestId("lot-list")).toContainText("6 sevrés");
});
