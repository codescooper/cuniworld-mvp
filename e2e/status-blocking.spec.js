import { test, expect } from "@playwright/test";
import {
  gotoClean,
  createRabbit,
  selectRabbitByCode,
  openAddEvent,
  submitEventForm,
} from "./_helpers.js";

test.beforeEach(async ({ page }) => {
  await gotoClean(page);
});

test("événements bloqués pour lapins morts ou vendus", async ({ page }) => {
  // Créer un lapin
  await createRabbit(page, { code: "CW-R001", name: "Test Rabbit", sex: "F" });
  await selectRabbitByCode(page, "CW-R001");

  // Vérifier qu'on peut ajouter des événements normalement
  await openAddEvent(page);
  await page.locator("#evType").selectOption("vaccin");
  await page.locator('input[name="date"]').fill("2026-01-01");
  await submitEventForm(page);

  // Maintenant marquer comme mort
  await openAddEvent(page);
  await page.locator("#evType").selectOption("décès");
  await page.locator('input[name="date"]').fill("2026-01-02");
  await submitEventForm(page);

  // Vérifier que le statut est "mort"
  await expect(page.locator("#rabbitDetails")).toContainText("Statut: mort");

  // Essayer d'ajouter un événement - devrait être bloqué
  await openAddEvent(page);
  await page.locator("#evType").selectOption("vaccin");
  await page.locator('input[name="date"]').fill("2026-01-03");
  await submitEventForm(page);

  // Vérifier le message d'erreur
  await expect(page.locator("#eventError")).toContainText("Impossible d'ajouter des événements");
  await expect(page.locator("#eventError")).toContainText("statut mort");

  // Fermer le modal d'erreur
  await page.locator("#modalClose").click();

  // Créer un autre lapin pour tester la vente
  await page.locator("#btnBack").click();
  await createRabbit(page, { code: "CW-R002", name: "Sale Rabbit", sex: "M" });
  await selectRabbitByCode(page, "CW-R002");

  // Vendre le lapin
  await openAddEvent(page);
  await page.locator("#evType").selectOption("vente");
  await page.locator('input[name="date"]').fill("2026-01-01");
  await page.locator('input[name="price"]').fill("25.50");
  await page.locator('input[name="client"]').fill("Jean Dupont");
  await submitEventForm(page);

  // Vérifier que le statut est "vendu"
  await expect(page.locator("#rabbitDetails")).toContainText("Statut: vendu");

  // Essayer d'ajouter un événement - devrait être bloqué
  await openAddEvent(page);
  await page.locator("#evType").selectOption("pesée");
  await page.locator('input[name="date"]').fill("2026-01-02");
  await page.locator('input[name="weight"]').fill("2.5");
  await submitEventForm(page);

  // Vérifier le message d'erreur
  await expect(page.locator("#eventError")).toContainText("Impossible d'ajouter des événements");
  await expect(page.locator("#eventError")).toContainText("statut vendu");
});