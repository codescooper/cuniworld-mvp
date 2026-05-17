// xss-safety.spec.js — vérifie qu'un payload XSS dans le nom ou le code d'un
// lapin n'exécute aucun script. Garde-fou bout-en-bout en complément du test
// unitaire tests/xssSafety.test.js. Couvre l'item 3.6 (XSS audit).

import { test, expect } from "@playwright/test";
import { gotoClean, createRabbit } from "./_helpers.js";

const PAYLOAD_NAME = `<script>window.__pwned=true</script>`;
const PAYLOAD_CODE = `<img src=x onerror="window.__pwned=true">`;

test("XSS : payload dans le nom et le code reste inerte", async ({ page }) => {
  // Capture toute alerte JS — si elle se déclenche, on échoue.
  let alerted = false;
  page.on("dialog", async (d) => { alerted = true; await d.dismiss(); });

  await gotoClean(page);
  await createRabbit(page, { code: PAYLOAD_CODE, name: PAYLOAD_NAME, sex: "F" });

  // Naviguer dans la liste pour forcer le rendu du payload
  await page.locator(".nav-item[data-panel=rabbits]").click();
  await page.locator("[data-testid=rabbit-item]").first().click();

  // Sentinelle JS : aucun script n'a dû s'exécuter
  const pwned = await page.evaluate(() => Boolean(window.__pwned));
  expect(pwned).toBe(false);
  expect(alerted).toBe(false);

  // Aucun <script> n'a dû être créé à partir des données utilisateur.
  // (les seuls <script> légitimes sont ceux du bundle Vite chargés par index.html)
  const userScripts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("script"))
      .filter(s => (s.textContent || "").includes("__pwned"))
      .length;
  });
  expect(userScripts).toBe(0);

  // Aucun élément avec handler inline issu du payload.
  const inlineHandlers = await page.locator("[onerror]").count();
  expect(inlineHandlers).toBe(0);
});
