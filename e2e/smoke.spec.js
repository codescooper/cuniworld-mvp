import { test, expect } from "@playwright/test";
import {
  gotoClean,
  createRabbit,
  createBuck,
  selectRabbitByCode,
  addSaillieWithMale as addSaillie,
  addMiseBas,
  addSevrage,
  navigateTo,
  goBackToList,
} from "./_helpers.js";

test.beforeEach(async ({ page }) => {
  await gotoClean(page);
});

test("flux complet de reproduction: femelle -> saillie -> mise-bas -> sevrage -> lot", async ({ page }) => {
  // Créer femelle et mâle
  await createRabbit(page, { code: "CW-F001", name: "Naya", sex: "F" });
  await createBuck(page, { code: "CW-M001", name: "Orion", sex: "M" });

  // Sélectionner la femelle
  await selectRabbitByCode(page, "CW-F001");

  // Vérifier qu'aucune gestation n'est affichée initialement
  await expect(page.locator("#rabbitDetails")).not.toContainText("Gestation en cours");

  // Ajouter saillie avec mâle obligatoire
  await addSaillie(page, { date: "2026-01-01", maleCode: "CW-M001" });

  // Vérifier que la gestation est maintenant affichée
  await expect(page.locator("#rabbitDetails")).toContainText("Gestation en cours");
  await expect(page.locator("#rabbitDetails")).toContainText("Mâle: Orion (CW-M001)");
  await expect(page.locator("#rabbitDetails")).toContainText("Terme prévu: 2026-01-29");

  // Vérifier que la femelle apparaît comme "enceinte" dans la liste
  await goBackToList(page); // Retour à la liste (no-op sur desktop : liste déjà visible)
  await expect(page.locator("#rabbitList")).toContainText("🤰"); // Badge enceinte

  // Re-sélectionner la femelle
  await selectRabbitByCode(page, "CW-F001");

  // Ajouter mise-bas
  await addMiseBas(page, { date: "2026-01-30", born: "8", alive: "7" });

  // Vérifier que 7 lapereaux ont été créés
  await expect(page.locator("#rabbitList")).toContainText("CW-F001-K01");
  await expect(page.locator("#rabbitList")).toContainText("CW-F001-K07");

  // Vérifier la généalogie dans les détails de la femelle
  await expect(page.locator("#rabbitDetails")).toContainText("Descendance");
  await expect(page.locator("#rabbitDetails")).toContainText("7 lapereaux actifs");

  // Sélectionner un lapereau et vérifier sa généalogie
  await selectRabbitByCode(page, "CW-F001-K01");
  await expect(page.locator("#rabbitDetails")).toContainText("Mère: Naya (CW-F001)");
  await expect(page.locator("#rabbitDetails")).toContainText("Père: Orion (CW-M001)");

  // Retour à la femelle
  await goBackToList(page);
  await selectRabbitByCode(page, "CW-F001");

  // Ajouter sevrage - doit automatiquement sevrer tous les lapereaux actifs
  await addSevrage(page, { date: "2026-02-28", destCage: "C-04" });

  // Naviguer vers le panneau Lots pour vérifier le lot créé
  await navigateTo(page, "lots");

  // Vérifier que le lot a été créé (compteurs en direct : 7 vivants)
  await expect(page.locator("#lotList")).toContainText("C-04");
  await expect(page.locator("#lotList")).toContainText("7 vivants");

  // Ouvrir le lot et vérifier les détails
  await page.locator("#lotList").getByText("C-04").first().click();
  await expect(page.locator("#lotDetails")).toContainText("Naya (CW-F001)");
  await expect(page.locator("#lotDetails")).toContainText("7 lapereaux");

  // Vérifier que les lapereaux ont changé de cage
  await navigateTo(page, "rabbits");
  await selectRabbitByCode(page, "CW-F001-K01");
  await expect(page.locator("#rabbitDetails")).toContainText("Cage: C-04");
  await expect(page.locator("#rabbitDetails")).toContainText("Stade: jeune");
});
