// e2e/_helpers.js
import { expect } from "@playwright/test";

export async function gotoClean(page) {
  await page.goto("/?e2e=1");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

export async function closeModalHard(page) {
  const modal = page.locator("#modal");
  if (!(await modal.count())) return;

  // Si visible, on le ferme (X) ou on clique backdrop
  if (await modal.isVisible().catch(() => false)) {
    const closeBtn = page.locator("#modalClose");
    if (await closeBtn.count()) {
      await closeBtn.click().catch(() => {});
    } else {
      const backdrop = page.locator("#modal .modal-backdrop");
      if (await backdrop.count()) await backdrop.click().catch(() => {});
    }
  }

  // Attendre qu'il soit vraiment caché
  await waitForModalHidden(page);
}

export async function waitModalClosedOrError(page) {
  const modal = page.getByTestId("modal");
  const error = page.getByTestId("modal-error");
  await Promise.race([
    waitForModalHidden(page),
    error.waitFor({ state: "visible", timeout: 5000 }).catch(() => {}),
  ]);
}

export async function waitForModalHidden(page) {
  await page.waitForFunction(() => {
    const modal = document.getElementById("modal");
    if (!modal) return true;
    return modal.classList.contains("hidden") || modal.getAttribute("aria-hidden") === "true";
  }, { timeout: 5000 }).catch(() => {});
}

export async function waitForModalVisible(page) {
  await page.waitForFunction(() => {
    const modal = document.getElementById("modal");
    if (!modal) return false;
    return !modal.classList.contains("hidden") && modal.getAttribute("aria-hidden") === "false";
  }, { timeout: 5000 });
}

export async function createRabbit(page, { code = "CW-F001", name = "Naya", sex = "F" } = {}) {
  await closeModalHard(page);

  const b1 = page.getByTestId("btn-new-rabbit");
  if (await b1.count()) await b1.first().click();
  else await page.locator("#btnNewRabbit").click();

  await page.getByPlaceholder("ex: CW-F001").fill(code);
  await page.getByPlaceholder("ex: Naya").fill(name);
  await page.locator('select[name="sex"]').selectOption(sex);
  await page.locator('select[name="status"]').selectOption("actif");

  const submit = page.getByTestId("rabbit-form-submit");
  if (await submit.count()) await submit.click();
  else await page.locator('#rabbitForm button[type="submit"]').click();

  // le modal devrait se fermer tout seul — sinon on force
  await closeModalHard(page);
}

export async function createBuck(page, { code = "CW-M001", name = "Orion" } = {}) {
  await createRabbit(page, { code, name, sex: "M" });
}

export async function selectRabbitByCode(page, code = "CW-F001") {
  await closeModalHard(page);
  await page.getByText(code).first().click();
}

export async function openAddEvent(page) {
  // ✅ IMPORTANT: fermer un modal restant avant de cliquer "Ajouter événement"
  await closeModalHard(page);

  const b1 = page.getByTestId("btn-add-event");
  if (await b1.count()) {
    await b1.first().click();
    await waitForModalVisible(page);
    return;
  }

  const b2 = page.getByTestId("btn-add-event-2");
  if (await b2.count()) {
    await b2.first().click();
    await waitForModalVisible(page);
    return;
  }

  const b3 = page.locator("#btnAddEvent");
  if (await b3.count()) {
    await b3.first().click();
    await waitForModalVisible(page);
    return;
  }

  const b4 = page.locator("#btnAddEvent2");
  if (await b4.count()) {
    await b4.first().click();
    await waitForModalVisible(page);
    return;
  }

  await page.locator("#eventsPanel").getByRole("button", { name: "+ Ajouter un événement" }).first().click();
  await waitForModalVisible(page);
}

export async function submitEventForm(page) {
  const submit = page.getByTestId("event-form-submit");
  if (await submit.count()) await submit.click();
  else await page.locator('#eventForm button[type="submit"]').click();

  await waitModalClosedOrError(page);
}

export async function addSaillie(page, { date = "2026-01-01", maleCode = "CW-M001" } = {}) {
  await openAddEvent(page);
  await page.locator("#evType").selectOption("saillie");
  await page.locator('select[name="maleId"]').selectOption({ label: maleCode });
  await page.locator('input[name="date"]').fill(date);
  await submitEventForm(page);
  await closeModalHard(page);
}

export async function addMiseBas(page, { date = "2026-01-30", born = "8", alive = "7", dead = "" } = {}) {
  await openAddEvent(page);
  await page.locator("#evType").selectOption("mise_bas");
  await page.locator('input[name="date"]').fill(date);
  await page.locator('input[name="born"]').fill(String(born));
  await page.locator('input[name="alive"]').fill(String(alive));
  if (dead !== "") await page.locator('input[name="dead"]').fill(String(dead));
  await submitEventForm(page);
  await closeModalHard(page);
}

export async function addSevrage(page, { date = "2026-02-28", weaned = "6", destCage = "C-04" } = {}) {
  await openAddEvent(page);
  await page.locator("#evType").selectOption("sevrage");
  await page.locator('input[name="date"]').fill(date);
  await page.locator('input[name="weaned"]').fill(String(weaned));
  await page.locator('input[name="destCage"]').fill(String(destCage));
  await submitEventForm(page);
  await closeModalHard(page);
}

export async function addHealthEvent(page, { type = "vaccin", date, nextDate } = {}) {
  await openAddEvent(page);
  await page.locator("#evType").selectOption(type);

  if (date) await page.locator('input[name="date"]').fill(date);
  if (nextDate) await page.locator('input[name="nextDate"]').fill(nextDate);

  await submitEventForm(page);
  await closeModalHard(page);
}

export function isoDaysFromToday(deltaDays) {
  const d = new Date();
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Lit le compteur d’un tile dashboard en cherchant son label (ex "Rappels en retard")
 * et en récupérant le chiffre dans .n
 */
export async function getDashTileNumber(page, labelText) {
  const tile = page.locator(".tile").filter({ hasText: labelText }).first();
  await expect(tile).toBeVisible({ timeout: 5000 });
  const n = tile.locator(".n").first();
  const raw = (await n.textContent())?.trim() ?? "0";
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}
