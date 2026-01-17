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

test("vaccin+traitement avec nextDate apparaissent en rappels dashboard", async ({ page }) => {
  await createRabbit(page, { code: "CW-F001", name: "Naya", sex: "F" });
  await selectRabbitByCode(page, "CW-F001");

  const nextIn1 = isoDaysFromToday(+1);
  const nextIn3 = isoDaysFromToday(+3);

  await addHealthEvent(page, { type: "traitement", date: isoDaysFromToday(0), nextDate: nextIn1 });
  await addHealthEvent(page, { type: "vaccin", date: isoDaysFromToday(0), nextDate: nextIn3 });

  // Vérifs dashboard
  await expect(page.locator("#dash")).toContainText("Rappels");

  const upcoming = await getDashTileNumber(page, "Rappels (≤7j)");
  const overdue = await getDashTileNumber(page, "Rappels en retard");

  expect(upcoming).toBeGreaterThan(0);
  expect(overdue).toBe(0);
});
