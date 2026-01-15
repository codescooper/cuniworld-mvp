import { test, expect } from "@playwright/test";
import {
  gotoClean,
  createRabbit,
  selectRabbitByCode,
  addHealthEvent,
  isoDaysFromToday,
  getDashTileNumber,
} from "./_helpers.js";

test.beforeEach(async ({ page }) => {
  await gotoClean(page);
});

test("traitement avec nextDate passé => compteur 'Rappels en retard' > 0", async ({ page }) => {
  await createRabbit(page, { code: "CW-F001", name: "Naya", sex: "F" });
  await selectRabbitByCode(page, "CW-F001");

  const twoDaysAgo = isoDaysFromToday(-2);
  const yesterday = isoDaysFromToday(-1);

  await addHealthEvent(page, { type: "traitement", date: twoDaysAgo, nextDate: yesterday });

  await expect(page.locator("#dash")).toContainText("Rappels en retard");

  const overdue = await getDashTileNumber(page, "Rappels en retard");
  expect(overdue).toBeGreaterThan(0);
});
